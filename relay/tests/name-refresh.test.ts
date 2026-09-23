/**
 * quick-260923-cqj D-08 — 보조 종목마스터 교체 뒤 **이름 없던 캐시 행** 재방송 (`hub.refreshNames`).
 *
 * 재현하는 경합: 상장 첫날 아침 첫 Ready 에서 66(계좌)·64(상따)·72(VI) 가 57 조립보다 먼저
 * 도착해 신규상장 행이 이름 없이 캐시·팬아웃된다. 교체가 끝나면 영향받은 사용자에게만 기존 프레임
 * 모양(acct snap:true · lc.snap · vi.list snap:false)으로 한 번 다시 내려가야 한다.
 *
 *   ⑭ 첫 Ready 경합 재현 — acct 1 · lc.snap 1 · vi.list 1, 합성 lc 0, 캐시에도 이름.
 *   ⑮ 멱등·무소음 — 곧바로 다시 부르면 0건, 이름 없는 행이 없는 사용자는 처음부터 0건.
 *   ⑯ 64 미수신 사용자 — 캐시는 갱신되지만 lc.snap 은 내려가지 않는다(18-26).
 *
 * 파일 간 export 공유를 하지 않는다 — FakeSession·스텁은 gateway-symbols.test.ts 와 같은 모양의 사본이다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type {
  RelayAccountState,
  RelayLimitChaser,
  RelayOutbound,
  RelayViOrderItem,
} from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { logger } from "../src/logger.js";
import { GatewaySymbolMaster } from "../src/store/gateway-symbols.js";
import { SymbolMap } from "../src/store/symbols.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildLimitChaserListRespFrame,
  buildSetLimitChaserRespFrame,
  buildSymbolMasterFrames,
  buildViOrderListFrame,
  type FakeSymbolMasterItem,
} from "./helpers/frames.js";

const IPO_ISIN = "KR70010S0000";
const IPO_CODE = "0010S0";
/** 2026-09-23 09:00 KST. */
const T0 = Date.UTC(2026, 8, 23, 0, 0, 0);

const MASTER_ITEMS: FakeSymbolMasterItem[] = [
  { isin: IPO_ISIN, code: IPO_CODE, name: "테스트신규", marketType: "1" },
  { isin: SAMPLE_ISIN, code: "005930", name: "게이트웨이삼성", marketType: "0" },
  { isin: "KR7000660001", code: "000660", name: "SK하이닉스", marketType: "0" },
];

class FakeSession extends EventEmitter implements HubSession {
  readonly sent: number[] = [];
  isReady = true;

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    this.sent.push(Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(payload)).msgType());
    return true;
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
}

function mkSupabase() {
  const rows = [
    { code: "005930", name: "삼성전자", isin: SAMPLE_ISIN, market: "KOSPI", is_delisted: false },
  ];
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

function msgsOf(events: HubFanoutEvent[], userId: string): RelayOutbound[] {
  return events.filter((e) => e.userId === userId).map((e) => e.msg);
}

describe("SubscriptionHub.refreshNames — 보조 마스터 적재 후 재방송 (quick-260923-cqj D-08)", () => {
  let hub: SubscriptionHub;
  let gw: GatewaySymbolMaster;
  let fanout: HubFanoutEvent[];
  let info: { mock: { calls: unknown[][] } };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gw = new GatewaySymbolMaster({ now: () => T0 });
    const symbols = new SymbolMap(mkSupabase(), { fallback: gw });
    await symbols.refresh();
    hub = new SubscriptionHub({ symbols, symbolMaster: gw });
    gw.on("updated", () => hub.refreshNames());
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    info = vi.spyOn(logger, "info");
  });

  afterEach(() => {
    hub.closeAll();
    gw.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function refreshLogs(): number {
    return info.mock.calls.filter(
      (c) => c[1] === "[HUB] 보조 종목마스터 반영 — 이름 없던 캐시 행 재방송",
    ).length;
  }

  /** 첫 Ready 경합 재현 — 66 · 64 · 72 를 57 보다 먼저 넣는다. */
  function readyWithUnnamedIpo(session: FakeSession): void {
    hub.attach(session);
    session.emitReady();
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [
          { isin: IPO_ISIN, stockQty: 10, sellableQty: 10, avgPrice: 12_000 },
          { isin: SAMPLE_ISIN, stockQty: 3, sellableQty: 3, avgPrice: 70_000 },
        ],
        unfilled: [],
      }),
    );
    session.pushFrame(buildLimitChaserListRespFrame([{ isin: IPO_ISIN, market: "Q" }]));
    session.pushFrame(buildViOrderListFrame([{ isin: IPO_ISIN, orderNo: "0000000001", market: "Q" }]));
  }

  it("⑭ 첫 Ready 경합 — 57 조립 뒤 acct(snap:true) 1 · lc.snap 1 · vi.list(snap:false) 1, 합성 lc 0", () => {
    const s1 = new FakeSession("user-1");
    readyWithUnnamedIpo(s1);
    expect(s1.sent.filter((t) => t === MSG.GetSymbolMasterReq)).toHaveLength(1);

    // 먼저 나간 IPO 행은 이름이 없다(사용자가 본 증상).
    const early = msgsOf(fanout, "user-1");
    const earlyAcct = early.find((m): m is RelayAccountState => m.t === "acct");
    expect(earlyAcct?.hold.find((h) => h.isin === IPO_ISIN)?.name).toBeUndefined();
    const earlySnap = early.find((m) => m.t === "lc.snap") as { items: RelayLimitChaser[] } | undefined;
    expect(earlySnap?.items[0]?.name).toBeUndefined();

    fanout.length = 0;
    for (const f of buildSymbolMasterFrames(MASTER_ITEMS, 2)) s1.pushFrame(f);

    const msgs = msgsOf(fanout, "user-1");
    expect(msgs.map((m) => m.t).sort()).toEqual(["acct", "lc.snap", "vi.list"]);
    expect(msgs.some((m) => m.t === "lc")).toBe(false);

    const acct = msgs.find((m): m is RelayAccountState => m.t === "acct");
    expect(acct?.snap).toBe(true);
    expect(acct?.a).toBe(SAMPLE_ACCOUNT_NO);
    expect(acct?.hold.find((h) => h.isin === IPO_ISIN)).toMatchObject({
      name: "테스트신규",
      code: IPO_CODE,
    });
    // 삼성 행은 Supabase 이름 그대로다 — 이미 이름 있는 행은 건드리지 않는다.
    expect(acct?.hold.find((h) => h.isin === SAMPLE_ISIN)).toMatchObject({
      name: "삼성전자",
      code: "005930",
    });

    const snap = msgs.find((m) => m.t === "lc.snap") as { items: RelayLimitChaser[] };
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]).toMatchObject({ isin: IPO_ISIN, name: "테스트신규", code: IPO_CODE });

    const vil = msgs.find((m) => m.t === "vi.list") as { snap: boolean; items: RelayViOrderItem[] };
    expect(vil.snap).toBe(false);
    expect(vil.items).toHaveLength(1);
    expect(vil.items[0]).toMatchObject({ isin: IPO_ISIN, name: "테스트신규" });

    // 캐시(새 탭 재생 원천)에도 이름이 있다.
    expect(hub.getAccountStates("user-1")[0]?.hold.find((h) => h.isin === IPO_ISIN)?.name).toBe(
      "테스트신규",
    );
    expect(hub.getLimitChasers("user-1")[0]).toMatchObject({ name: "테스트신규", code: IPO_CODE });
    expect(hub.getViOrders("user-1")[0]?.name).toBe("테스트신규");
    expect(refreshLogs()).toBe(1);
    expect(hub.unhandledFrameCount()).toBe(0);
  });

  it("⑮ 멱등·무소음 — 다시 부르면 0건, 이름 없는 캐시 행이 없는 사용자는 처음부터 0건", () => {
    const s1 = new FakeSession("user-1");
    readyWithUnnamedIpo(s1);
    // user-2 는 Supabase 가 이미 푼 종목만 들고 있다.
    const s2 = new FakeSession("user-2");
    hub.attach(s2);
    s2.emitReady();
    s2.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        accountNo: "5555555501",
        holdings: [{ isin: SAMPLE_ISIN, stockQty: 1, sellableQty: 1, avgPrice: 70_000 }],
        unfilled: [],
      }),
    );
    // 마스터 요청은 relay 전체 1건 — user-2 의 Ready 는 27 을 보내지 않았다.
    expect(s2.sent.includes(MSG.GetSymbolMasterReq)).toBe(false);

    fanout.length = 0;
    for (const f of buildSymbolMasterFrames(MASTER_ITEMS, 2)) s1.pushFrame(f);
    expect(msgsOf(fanout, "user-2")).toHaveLength(0);
    expect(msgsOf(fanout, "user-1")).toHaveLength(3);
    expect(refreshLogs()).toBe(1);

    fanout.length = 0;
    hub.refreshNames();
    expect(fanout).toHaveLength(0);
    expect(refreshLogs()).toBe(1);
  });

  it("⑯ 64 를 받지 않은 사용자 — 60 에코로 캐시된 상따는 이름으로 갱신되지만 lc.snap 은 내려가지 않는다", () => {
    const s1 = new FakeSession("user-1");
    hub.attach(s1);
    s1.emitReady();
    s1.pushFrame(buildSetLimitChaserRespFrame({ isin: IPO_ISIN, market: "Q" }));
    expect(hub.hasLimitChaserList("user-1")).toBe(false);
    expect(hub.getLimitChasers("user-1")[0]?.name).toBeUndefined();

    fanout.length = 0;
    for (const f of buildSymbolMasterFrames(MASTER_ITEMS, 2)) s1.pushFrame(f);

    expect(hub.getLimitChasers("user-1")[0]).toMatchObject({ name: "테스트신규", code: IPO_CODE });
    const msgs = msgsOf(fanout, "user-1");
    expect(msgs.some((m) => m.t === "lc.snap")).toBe(false);
    expect(msgs.some((m) => m.t === "lc")).toBe(false);
    expect(fanout).toHaveLength(0);
  });
});
