/**
 * quick-260923-cqj — 게이트웨이 종목마스터(27 → 57) 보조 원천.
 *
 * 증명 대상:
 *   ① 추적탄: 첫 Ready → 27 1건 → 57 분할 조립(tryParseEnvelope 화이트리스트 통과) → 보조 맵 →
 *      SymbolMap 폴백 → 이후 66 잔고 행에 신규상장 이름·코드. 57 은 팬아웃되지 않고 default 0.
 *   ② 원자 교체 — is_last 전에는 새 원소가 보이지 않는다.
 *   ③ 조립 실패 갈래 — 옛 맵 유지, in-flight 해제.
 *   ④ 원소 형식 가드와 market_type 매핑.
 *   ⑤ Supabase 우선(행 단위)과 FK 헬퍼 `stocksCodeOf`.
 *   ⑥ 라우팅 — 요청 세션이 아닌 userId · 요청 없는 57 은 무시.
 *   ⑦ 빈 마스터는 기존 맵을 지우지 않는다.
 *
 * 세션은 가짜지만 **게이트웨이로 나간 바이트는 실제 FlatBuffers 로 되읽어** msg_type 을 센다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type { RelayAccountState, RelayOutbound } from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import {
  parseSymbolMasterFrame,
  resetDroppedEnvelopeCount,
  skippedSymbolMasterItemCount,
  tryParseEnvelope,
  type ParsedSymbolMasterFrame,
} from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { logger } from "../src/logger.js";
import { GatewaySymbolMaster, masterDayKey } from "../src/store/gateway-symbols.js";
import { SymbolMap, stocksCodeOf, type SymbolInfo } from "../src/store/symbols.js";
import {
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildBareEnvelope,
  buildSymbolMasterFrame,
  buildSymbolMasterFrames,
  type FakeSymbolMasterItem,
} from "./helpers/frames.js";

/** 2026-09-23 상장 첫날 종목. */
const IPO_ISIN = "KR70010S0000";
const IPO_CODE = "0010S0";

/** 2026-09-23 09:00 KST. */
const T0 = Date.UTC(2026, 8, 23, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function isinOf(n: number): string {
  return `KR7${String(n).padStart(6, "0")}000`;
}

function codeOf(n: number): string {
  return String(n).padStart(6, "0");
}

function mkItems(n: number, offset = 100): FakeSymbolMasterItem[] {
  return Array.from({ length: n }, (_, i) => ({
    isin: isinOf(offset + i),
    code: codeOf(offset + i),
    name: `종목${offset + i}`,
    marketType: "0",
  }));
}

function parse57(payload: Uint8Array): ParsedSymbolMasterFrame | null {
  const parsed = tryParseEnvelope(Buffer.from(payload));
  if (parsed === null) throw new Error("57 이 수신 화이트리스트를 통과하지 못했습니다");
  return parseSymbolMasterFrame(parsed.env);
}

class FakeSession extends EventEmitter implements HubSession {
  readonly sent: number[] = [];
  isReady = true;
  sendResult = true;

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    const env = Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(payload));
    this.sent.push(env.msgType());
    return this.sendResult;
  }

  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  emitReady(): void {
    this.isReady = true;
    this.emit("ready", { generation: 1, accounts: [] });
  }

  masterReqs(): number {
    return this.sent.filter((t) => t === MSG.GetSymbolMasterReq).length;
  }
}

type StockRow = {
  code: string;
  name: string;
  isin: string | null;
  market: string | null;
  is_delisted: boolean;
};

/** `stocks` 조회만 흉내내는 Supabase 스텁 (symbols.test.ts 의 모양을 최소로 복제). */
function mkSupabase(rows: StockRow[]) {
  const client = {
    from: () => ({
      select: () => ({
        not: () => ({
          order: () => ({
            range: (from: number, to: number) =>
              Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
          }),
        }),
      }),
    }),
  };
  return client as never;
}

const SUPABASE_ROWS: StockRow[] = [
  { code: "005930", name: "삼성전자", isin: SAMPLE_ISIN, market: "KOSPI", is_delisted: false },
  // intraday-sync bootstrapStocks 가 장중에 넣는 FK 고아 행 — code 는 있지만 isin 이 null 이다.
  // SymbolMap 은 이 행을 ISIN 으로 색인하지 않으므로 그 ISIN 은 게이트웨이 원소가 푼다.
  { code: IPO_CODE, name: "와이즈플래닛컴퍼니", isin: null, market: "KOSPI", is_delisted: false },
];

/** 추적탄 마스터 원소 5건 — 신규상장 1 + Supabase 와 겹치는 삼성 1 + 평범한 3. */
const TRACER_ITEMS: FakeSymbolMasterItem[] = [
  { isin: IPO_ISIN, code: IPO_CODE, name: "테스트신규", marketType: "1" },
  { isin: SAMPLE_ISIN, code: "005930", name: "게이트웨이삼성", marketType: "1" },
  ...mkItems(3),
];

function acctFrames(events: HubFanoutEvent[]): RelayAccountState[] {
  return events
    .map((e) => e.msg)
    .filter((m: RelayOutbound): m is RelayAccountState => m.t === "acct");
}

describe("GatewaySymbolMaster — 게이트웨이 종목마스터 보조 원천 (quick-260923-cqj)", () => {
  let nowMs: number;
  const now = (): number => nowMs;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    nowMs = T0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** 성공 적재 1회를 끝낸 gw 와 세션. */
  function loaded(items: FakeSymbolMasterItem[] = mkItems(4)) {
    const gw = new GatewaySymbolMaster({ now });
    const session = new FakeSession("user-1");
    gw.onSessionReady(session);
    for (const f of buildSymbolMasterFrames(items, 2)) gw.onFrame("user-1", parse57(f));
    expect(gw.stats().symbolCount).toBe(items.length);
    return { gw, session };
  }

  it("① 추적탄 — Ready → 27 1건 → 57 3프레임 조립 → SymbolMap 폴백 → 66 잔고 행에 신규상장 이름·코드", async () => {
    const gw = new GatewaySymbolMaster({ now });
    const symbols = new SymbolMap(mkSupabase(SUPABASE_ROWS), { fallback: gw });
    await symbols.refresh();
    const hub = new SubscriptionHub({ symbols, symbolMaster: gw });
    const fanout: HubFanoutEvent[] = [];
    hub.on("fanout", (e) => fanout.push(e));

    const session = new FakeSession("user-1");
    hub.attach(session);
    session.emitReady();
    expect(session.masterReqs()).toBe(1);

    // 적재 전: 신규상장은 Supabase 에도(isin null 행) 보조 맵에도 없다.
    expect(symbols.lookup(IPO_ISIN)).toBeUndefined();

    const frames = buildSymbolMasterFrames(TRACER_ITEMS, 2);
    expect(frames).toHaveLength(3);
    const before = fanout.length;
    for (const f of frames) session.pushFrame(f);
    // 57 은 브라우저로 흘리지 않는다.
    expect(fanout.length).toBe(before);

    expect(symbols.lookup(IPO_ISIN)).toEqual({
      code: IPO_CODE,
      name: "테스트신규",
      market: "Q",
      source: "gateway",
    } satisfies SymbolInfo);
    // 겹치는 ISIN 은 Supabase 행이 통째로 이긴다 (D-01).
    const samsung = symbols.lookup(SAMPLE_ISIN);
    expect(samsung).toEqual({ code: "005930", name: "삼성전자", market: "K" });
    expect(samsung?.source).toBeUndefined();

    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [{ isin: IPO_ISIN, stockQty: 10, sellableQty: 10, avgPrice: 12_000 }],
        unfilled: [],
      }),
    );
    const [acct] = acctFrames(fanout);
    expect(acct?.hold[0]).toMatchObject({ isin: IPO_ISIN, name: "테스트신규", code: IPO_CODE });
    expect(hub.unhandledFrameCount()).toBe(0);

    // 같은 master-day 에는 더 보내지 않는다 — 같은 사용자의 재 Ready 도, 다른 사용자의 Ready 도.
    session.emitReady();
    const other = new FakeSession("user-2");
    hub.attach(other);
    other.emitReady();
    expect(session.masterReqs()).toBe(1);
    expect(other.masterReqs()).toBe(0);

    hub.closeAll();
  });

  it("①-b 57 은 symbolMaster 주입이 없어도 명시 case 에서 끝난다 — default 0, 팬아웃 0", () => {
    const hub = new SubscriptionHub();
    const fanout: HubFanoutEvent[] = [];
    hub.on("fanout", (e) => fanout.push(e));
    const session = new FakeSession("user-1");
    hub.attach(session);
    for (const f of buildSymbolMasterFrames(TRACER_ITEMS, 2)) session.pushFrame(f);
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(fanout).toHaveLength(0);
    hub.closeAll();
  });

  it("② 원자 교체 — is_last 전에는 새 원소가 보이지 않고, 마지막 프레임 뒤에 전량이 보인다", () => {
    const gw = new GatewaySymbolMaster({ now });
    gw.onSessionReady(new FakeSession("user-1"));
    const frames = buildSymbolMasterFrames(TRACER_ITEMS, 2);

    gw.onFrame("user-1", parse57(frames[0]!));
    gw.onFrame("user-1", parse57(frames[1]!));
    expect(gw.lookup(IPO_ISIN)).toBeUndefined();
    expect(gw.stats()).toMatchObject({ symbolCount: 0, inflight: true });

    gw.onFrame("user-1", parse57(frames[2]!));
    expect(gw.lookup(IPO_ISIN)?.name).toBe("테스트신규");
    expect(gw.stats()).toMatchObject({
      symbolCount: TRACER_ITEMS.length,
      inflight: false,
      dayKey: "2026-09-23",
    });
  });

  describe("③ 조립 실패 — 옛 맵 유지, in-flight 해제", () => {
    const NEW_ITEMS: FakeSymbolMasterItem[] = [
      { isin: IPO_ISIN, code: IPO_CODE, name: "테스트신규", marketType: "1" },
      ...mkItems(4, 500),
    ];

    function nextDayRequest() {
      const { gw, session } = loaded();
      const kept = gw.lookup(isinOf(100));
      expect(kept).toBeDefined();
      // 다음 날 07:30 KST 뒤로 옮긴 뒤 Ready 로 두 번째 적재를 연다.
      nowMs = T0 + DAY_MS;
      gw.onSessionReady(session);
      expect(session.masterReqs()).toBe(2);
      const warn = vi.spyOn(logger, "warn");
      return { gw, kept, warn };
    }

    function expectKept(
      gw: GatewaySymbolMaster,
      kept: SymbolInfo | undefined,
      warn: { mock: { calls: unknown[][] } },
      reason: string,
    ): void {
      expect(gw.stats()).toMatchObject({ inflight: false, symbolCount: 4, dayKey: "2026-09-23" });
      expect(gw.lookup(isinOf(100))).toEqual(kept);
      expect(gw.lookup(IPO_ISIN)).toBeUndefined();
      const reasons = warn.mock.calls.map((c) => (c[0] as { reason?: string }).reason);
      expect(reasons).toContain(reason);
    }

    it("seq 가 건너뛰면(0 → 2) seq-gap", () => {
      const { gw, kept, warn } = nextDayRequest();
      const frames = buildSymbolMasterFrames(NEW_ITEMS, 2);
      gw.onFrame("user-1", parse57(frames[0]!));
      gw.onFrame("user-1", parse57(frames[2]!));
      expectKept(gw, kept, warn, "seq-gap");
    });

    it("두 번째 프레임의 total_items 가 다르면 total-changed", () => {
      const { gw, kept, warn } = nextDayRequest();
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(0, 2), seq: 0, totalItems: 5, isLast: false })),
      );
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(2), seq: 1, totalItems: 6, isLast: true })),
      );
      expectKept(gw, kept, warn, "total-changed");
    });

    it("is_last 인데 누적 원소 수 ≠ total_items 면 count-mismatch", () => {
      const { gw, kept, warn } = nextDayRequest();
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(0, 2), seq: 0, totalItems: 5, isLast: false })),
      );
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(2, 4), seq: 1, totalItems: 5, isLast: true })),
      );
      expectKept(gw, kept, warn, "count-mismatch");
    });

    it("누적 원소 수가 total_items 를 넘으면 overflow", () => {
      const { gw, kept, warn } = nextDayRequest();
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(0, 3), seq: 0, totalItems: 4, isLast: false })),
      );
      gw.onFrame(
        "user-1",
        parse57(buildSymbolMasterFrame({ items: NEW_ITEMS.slice(3, 5), seq: 1, totalItems: 4, isLast: true })),
      );
      expectKept(gw, kept, warn, "overflow");
    });

    it("57 인데 symbol_master 슬롯이 비면 파서가 null — parse", () => {
      const { gw, kept, warn } = nextDayRequest();
      gw.onFrame("user-1", parse57(buildBareEnvelope(MSG.SymbolMasterResp)));
      expectKept(gw, kept, warn, "parse");
    });
  });

  it("④ 원소 가드 — market 매핑 · 형식 위반 스킵(누적 수에는 포함) · 이름 trim", () => {
    const items: FakeSymbolMasterItem[] = [
      { isin: isinOf(1), code: codeOf(1), name: "코스피", marketType: "0" },
      { isin: isinOf(2), code: codeOf(2), name: "코스닥", marketType: "1" },
      { isin: isinOf(3), code: codeOf(3), name: "시장2", marketType: "2" },
      { isin: isinOf(4), code: codeOf(4), name: "시장빈값", marketType: "" },
      { isin: isinOf(5), code: codeOf(5), name: "시장K", marketType: "K" },
      { isin: isinOf(6), code: codeOf(6), name: "  공백종목  ", marketType: "0" },
      { isin: isinOf(7), code: codeOf(7), name: "가".repeat(100), marketType: "0" },
      // ↓ 스킵 6건
      { isin: isinOf(11), code: "00593", name: "코드5자", marketType: "0" },
      { isin: isinOf(12), code: "0059 3", name: "코드공백", marketType: "0" },
      { isin: isinOf(13), code: codeOf(13), name: "이름\n개행", marketType: "0" },
      { isin: isinOf(14), code: codeOf(14), name: "가".repeat(101), marketType: "0" },
      { isin: isinOf(15), code: codeOf(15), name: "   ", marketType: "0" },
      { isin: "KR700593000", code: codeOf(16), name: "ISIN11자", marketType: "0" },
    ];
    const frame = parse57(buildSymbolMasterFrame({ items, seq: 0, totalItems: items.length }));
    expect(frame).not.toBeNull();
    expect(frame!.rawCount).toBe(items.length);
    expect(frame!.skipped).toBe(6);
    expect(frame!.rows).toHaveLength(7);
    expect(skippedSymbolMasterItemCount()).toBe(6);

    const gw = new GatewaySymbolMaster({ now });
    gw.onSessionReady(new FakeSession("user-1"));
    gw.onFrame("user-1", frame);
    // 스킵 원소도 누적 수에 들어가므로 total 검증은 통과한다.
    expect(gw.stats()).toMatchObject({ symbolCount: 7, inflight: false });

    expect(gw.lookup(isinOf(1))?.market).toBe("K");
    expect(gw.lookup(isinOf(2))?.market).toBe("Q");
    expect(gw.lookup(isinOf(3))).toEqual({ code: codeOf(3), name: "시장2", market: null, source: "gateway" });
    expect(gw.lookup(isinOf(4))?.market).toBeNull();
    expect(gw.lookup(isinOf(5))?.market).toBeNull();
    expect(gw.lookup(isinOf(6))?.name).toBe("공백종목");
    expect(gw.lookup(isinOf(7))?.name).toHaveLength(100);
    for (const n of [11, 12, 13, 14, 15]) expect(gw.lookup(isinOf(n))).toBeUndefined();
    expect(gw.lookup("KR700593000")).toBeUndefined();
  });

  describe("⑤ 우선순위와 FK 헬퍼", () => {
    it("stocksCodeOf — undefined → null, Supabase 행 → code, 게이트웨이 행 → null", () => {
      expect(stocksCodeOf(undefined)).toBeNull();
      expect(stocksCodeOf({ code: "005930", name: "삼성전자", market: "K" })).toBe("005930");
      expect(
        stocksCodeOf({ code: IPO_CODE, name: "테스트신규", market: "Q", source: "gateway" }),
      ).toBeNull();
    });

    it("Supabase 에 code 로는 있지만 isin 이 null 인 행 → 그 ISIN 은 게이트웨이 원소가 풀고, FK 코드는 null 이다", async () => {
      const { gw } = loaded([{ isin: IPO_ISIN, code: IPO_CODE, name: "와이즈플래닛컴퍼니", marketType: "1" }]);
      const symbols = new SymbolMap(mkSupabase(SUPABASE_ROWS), { fallback: gw });
      await symbols.refresh();

      const info = symbols.lookup(IPO_ISIN);
      // Supabase 의 placeholder market("KOSPI")이 아니라 게이트웨이 시장(코스닥)이다 — 필드 합성 없음.
      expect(info).toEqual({
        code: IPO_CODE,
        name: "와이즈플래닛컴퍼니",
        market: "Q",
        source: "gateway",
      });
      // 계획 규칙(D-06): 게이트웨이 원천이면 null. 넓히지 않는다.
      expect(stocksCodeOf(info)).toBeNull();
      // Supabase 가 ISIN 으로 아는 종목은 그대로 Supabase 원천이다.
      expect(stocksCodeOf(symbols.lookup(SAMPLE_ISIN))).toBe("005930");
    });

    it("Supabase 행의 market 이 null 이어도 게이트웨이로 넘어가지 않는다 (행 단위 우선)", async () => {
      const { gw } = loaded([{ isin: SAMPLE_ISIN, code: "005930", name: "게이트웨이삼성", marketType: "0" }]);
      const symbols = new SymbolMap(
        mkSupabase([{ code: "005930", name: "삼성전자", isin: SAMPLE_ISIN, market: null, is_delisted: false }]),
        { fallback: gw },
      );
      await symbols.refresh();
      expect(symbols.lookup(SAMPLE_ISIN)).toEqual({ code: "005930", name: "삼성전자", market: null });
    });
  });

  describe("⑥ 라우팅", () => {
    it("요청하지 않은 userId 에서 온 57 은 조립하지 않는다 — 맵 무변경, 요청은 계속 대기", () => {
      const gw = new GatewaySymbolMaster({ now });
      gw.onSessionReady(new FakeSession("user-1"));
      for (const f of buildSymbolMasterFrames(TRACER_ITEMS, 2)) gw.onFrame("user-2", parse57(f));
      expect(gw.stats()).toMatchObject({ symbolCount: 0, inflight: true });
      expect(gw.lookup(IPO_ISIN)).toBeUndefined();
    });

    it("in-flight 가 없을 때 온 57 은 무시하고 warn 1건을 남긴다", () => {
      const gw = new GatewaySymbolMaster({ now });
      const warn = vi.spyOn(logger, "warn");
      gw.onFrame("user-1", parse57(buildSymbolMasterFrame({ items: TRACER_ITEMS })));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[1]).toBe("[SYM-GW] 요청 없는 57 — 무시");
      expect(gw.stats().symbolCount).toBe(0);
    });

    it("Ready 가 아닌 세션으로는 보내지 않고, send 가 false 면 in-flight 를 세우지 않는다", () => {
      const gw = new GatewaySymbolMaster({ now });
      const notReady = new FakeSession("user-1");
      notReady.isReady = false;
      gw.onSessionReady(notReady);
      expect(notReady.masterReqs()).toBe(0);

      const refused = new FakeSession("user-1");
      refused.sendResult = false;
      gw.onSessionReady(refused);
      expect(refused.masterReqs()).toBe(1);
      expect(gw.stats().inflight).toBe(false);
    });
  });

  it("⑦ 빈 마스터(total 0 · is_last · 원소 0)는 비어 있지 않은 기존 맵을 지우지 않는다", () => {
    const { gw, session } = loaded();
    nowMs = T0 + DAY_MS;
    gw.onSessionReady(session);
    const warn = vi.spyOn(logger, "warn");
    const frames = buildSymbolMasterFrames([]);
    expect(frames).toHaveLength(1);
    gw.onFrame("user-1", parse57(frames[0]!));
    expect(gw.stats()).toMatchObject({ symbolCount: 4, inflight: false, dayKey: "2026-09-23" });
    const reasons = warn.mock.calls.map((c) => (c[0] as { reason?: string }).reason);
    expect(reasons.some((r) => r?.startsWith("empty"))).toBe(true);
  });

  it("masterDayKey — 07:30 KST 경계 (07:29 는 전날 키)", () => {
    // 2026-09-23 07:29 KST = 2026-09-22 22:29 UTC
    expect(masterDayKey(Date.UTC(2026, 8, 22, 22, 29))).toBe("2026-09-22");
    expect(masterDayKey(Date.UTC(2026, 8, 22, 22, 30))).toBe("2026-09-23");
    expect(masterDayKey(T0)).toBe("2026-09-23");
  });
});
