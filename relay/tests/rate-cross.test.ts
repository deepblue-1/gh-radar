/**
 * Phase 17 Plan 03 — TRADE-04. 신규 푸시 3종(76 `RateCrossAlert` · 77 `QueuedWindowState` ·
 * 78 `RateCrossSnapshot`)의 와이어 → relay 세션 캐시 → 브라우저 프레임 한 경로.
 *
 * 이 파일이 지키는 것은 **드롭 0** 이다. 76 은 요청 짝이 없는 Broadcast 라 로그인 전
 * 연결에도 KRX 20% 돌파마다 온다 — 화이트리스트에 없으면 매 돌파마다 `unknown-msg-type`
 * warn 이 쌓여 진짜 이상 신호를 덮는다(17-RESEARCH Pitfall 1).
 *
 * `strategy-hub.test.ts` 의 규율을 그대로 승계한다:
 *   - 세션은 **가짜 객체**다. 세션 상태기계는 15-03 이 소켓까지 붙여 이미 증명했다.
 *   - 프레임은 `tryParseEnvelope`(수신 화이트리스트)를 **실제로 통과시킨 뒤** 밀어 넣는다.
 *     grep 으로는 「화이트리스트에 있다」까지만 알 수 있고 「브라우저까지 갔다」는 모른다.
 *   - 드롭 0 은 **로거 스파이**로 잰다 — 카운터만 보면 다른 사유의 드롭과 섞인다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type {
  RelayOutbound,
  RelayQueuedWindowMsg,
  RelayRateCrossItem,
  RelayRateCrossMsg,
  RelayRateCrossSnapMsg,
} from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { INBOUND_MSG_TYPES, MSG } from "../src/dma/msg-type.js";
import {
  parseQueuedWindowState,
  parseRateCrossAlert,
  parseRateCrossSnapshot,
  resetDroppedEnvelopeCount,
  tryParseEnvelope,
} from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { logger } from "../src/logger.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import {
  SAMPLE_ISIN,
  buildQueuedWindowStateFrame,
  buildRateCrossAlertFrame,
  buildRateCrossSnapshotFrame,
} from "./helpers/frames.js";

const USER_A = "user-a";
const OTHER_ISIN = "KR7000660001";

/** `HubSession` 최소 구현 — `strategy-hub.test.ts` 와 같은 모양이다. */
class FakeSession extends EventEmitter implements HubSession {
  readonly sentMsgTypes: number[] = [];
  isReady = true;

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    const bb = new flatbuffers.ByteBuffer(payload);
    this.sentMsgTypes.push(Envelope.getRootAsEnvelope(bb).msgType());
    return true;
  }

  /** 게이트웨이가 프레임을 밀어 넣는 상황을 재현한다(수신 화이트리스트를 실제로 통과시킨다). */
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

/** 수신 화이트리스트를 우회해 Envelope 핸들만 꺼낸다 (파서 단위 검사용). */
function readBack(bytes: Uint8Array): Envelope {
  return Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(bytes));
}

function msgsOf<T extends RelayOutbound["t"]>(
  fanout: HubFanoutEvent[],
  t: T,
): Extract<RelayOutbound, { t: T }>[] {
  return fanout
    .map((e) => e.msg)
    .filter((m): m is Extract<RelayOutbound, { t: T }> => m.t === t);
}

/** pino 로거 스파이 — 첫 인자가 구조화 바디다. */
type LoggerSpy = { mock: { calls: unknown[][] } };

/**
 * 로거 스파이에서 그 사유의 호출 건수를 센다.
 *
 * 드롭 0 을 **카운터가 아니라 사유별 로그로** 재는 이유: `droppedEnvelopeCount()` 는 모든
 * 사유를 한 숫자에 합치므로 「76 때문에 늘었나」를 구분하지 못한다.
 */
function dropCallsWithReason(spy: LoggerSpy, reason: string): number {
  return spy.mock.calls.filter((args) => {
    const body = args[0];
    return (
      typeof body === "object" && body !== null && (body as { reason?: unknown }).reason === reason
    );
  }).length;
}

describe("76 RateCrossAlert — 화이트리스트에서 브라우저 상태까지 (17-03 / D-02 · D-03)", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];
  let warn: LoggerSpy;

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(logger, "debug").mockImplementation(() => undefined);
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession(USER_A);
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("①-1 76 이 수신 화이트리스트에 있다 — 없으면 파서까지 도달하지 못한다 (D-02)", () => {
    expect(INBOUND_MSG_TYPES.has(MSG.RateCrossAlert)).toBe(true);
  });

  it("①-2 isin 12자·exchange KRX 인 76 프레임은 RelayRateCrossItem 이 된다", () => {
    const env = readBack(
      buildRateCrossAlertFrame({
        lastPrice: 84_100n,
        changeRate: 20.14,
        thresholdPct: 20,
        basePrice: 70_000n,
        exchangeTime: "093015123456",
        serverTime: "09:30:15",
      }),
    );

    const item = parseRateCrossAlert(env);

    // `exchangeTime`·`serverTime` 은 **해석하지 않고 원문**으로 넘긴다 (D-03).
    expect(item).toEqual<RelayRateCrossItem>({
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      lastPrice: 84_100,
      changeRate: 20.14,
      thresholdPct: 20,
      basePrice: 70_000,
      exchangeTime: "093015123456",
      serverTime: "09:30:15",
    });
  });

  it("①-3 isin 이 12자가 아니면 null 이다 (기존 bad-isin 가드와 동형)", () => {
    const env = readBack(buildRateCrossAlertFrame({ isin: "KR70059300" }));

    expect(parseRateCrossAlert(env)).toBeNull();
    // 사유·카운터를 남기지 않고 조용히 버리지 않는다 (PC-7).
    expect(dropCallsWithReason(warn, "bad-isin")).toBe(1);
  });

  it("②-1 Ready 인 세션에 76 이 오면 {t:'rate.cross'} 1프레임이 나간다", () => {
    session.pushFrame(buildRateCrossAlertFrame());

    const frames = msgsOf(fanout, "rate.cross") as RelayRateCrossMsg[];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.item.isin).toBe(SAMPLE_ISIN);
    expect(frames[0]?.item.exchange).toBe("KRX");
  });

  it("②-2 Ready 이전 76 은 캐시에만 들어가고 팬아웃되지 않는다 (T-17-07)", () => {
    // 76 은 **로그인 전 연결에도** 온다 — 세션 소유자 판정 전의 프레임이다.
    session.isReady = false;

    session.pushFrame(buildRateCrossAlertFrame());

    expect(msgsOf(fanout, "rate.cross")).toHaveLength(0);
    // 버린 것이 아니라 보관한 것이다 — Ready 뒤 스냅샷이 이것을 내려보낸다.
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(1);
  });

  it("③ 같은 isin 76 이 두 번 오면 캐시 원소는 1개이고 뒤 값으로 덮인다 — 거래소가 바뀌어도", () => {
    session.pushFrame(buildRateCrossAlertFrame({ lastPrice: 84_000n, changeRate: 20.0 }));
    session.pushFrame(buildRateCrossAlertFrame({ lastPrice: 85_400n, changeRate: 22.0 }));

    const cached = hub.getRateCrossItems(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.lastPrice).toBe(85_400);
    expect(cached[0]?.changeRate).toBe(22.0);

    // gh-trade quick-260923-cfo 결정 A — 서버 상태는 ISIN 당 1개다. 76 exchange 는 발화 체결의
    // 거래소라 KRX 행 뒤 NXT 재돌파는 **같은 원소를 거래소째 덮는다** (키 = isin).
    session.pushFrame(
      buildRateCrossAlertFrame({ exchange: "NXT", lastPrice: 86_000n, changeRate: 22.86 }),
    );
    const afterNxt = hub.getRateCrossItems(USER_A);
    expect(afterNxt).toHaveLength(1);
    expect(afterNxt[0]?.exchange).toBe("NXT");
    expect(afterNxt[0]?.lastPrice).toBe(86_000);

    // 반대 방향(NXT → KRX)도 1원소 · 뒤에 온 거래소.
    session.pushFrame(buildRateCrossAlertFrame({ exchange: "KRX", lastPrice: 86_500n }));
    const afterKrx = hub.getRateCrossItems(USER_A);
    expect(afterKrx).toHaveLength(1);
    expect(afterKrx[0]?.exchange).toBe("KRX");
    expect(afterKrx[0]?.lastPrice).toBe(86_500);

    // 다른 종목은 따로 쌓인다.
    session.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN }));
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(2);
  });

  it("④ 76 수신에 unknown-msg-type warn 이 0건이다 (Pitfall 1 — 드롭 0 게이트)", () => {
    session.pushFrame(buildRateCrossAlertFrame());
    session.pushFrame(buildRateCrossAlertFrame({ exchange: "NXT" }));

    expect(dropCallsWithReason(warn, "unknown-msg-type")).toBe(0);
    expect(dropCallsWithReason(warn, "out-of-scope-msg-type")).toBe(0);
  });
});

describe("78 RateCrossSnapshot · 77 QueuedWindowState — 캐시 교체 규약 (17-03 / D-03)", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];
  let warn: LoggerSpy;

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(logger, "debug").mockImplementation(() => undefined);
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession(USER_A);
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("⑤-1 77/78 이 수신 화이트리스트에 있다 (D-02)", () => {
    expect(INBOUND_MSG_TYPES.has(MSG.RateCrossSnapshot)).toBe(true);
    expect(INBOUND_MSG_TYPES.has(MSG.QueuedWindowState)).toBe(true);
  });

  it("⑤-2 원소 3개인 78 은 above 집합을 통째로 교체한다 (이전 76 upsert 는 남지 않는다)", () => {
    // 먼저 76 으로 「서버 집합에 없는」 원소를 하나 심는다.
    session.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN }));
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(1);

    session.pushFrame(
      buildRateCrossSnapshotFrame([
        { isin: SAMPLE_ISIN, exchange: "KRX", exchangeTime: "090100000001" },
        // 서버 계약 「ISIN 당 1원소」(gh-trade quick-260923-cfo 결정 A) — 세 원소는 서로 다른 종목.
        { isin: "KR7035420009", exchange: "NXT", exchangeTime: "090200000002" },
        { isin: "KR7035720002", exchange: "KRX", exchangeTime: "090300000003" },
      ]),
    );

    const cached = hub.getRateCrossItems(USER_A);
    expect(cached).toHaveLength(3);
    // 병합(upsert)이면 OTHER_ISIN 이 남는다 — 전량 교체의 증거다.
    expect(cached.map((i) => i.isin)).not.toContain(OTHER_ISIN);
    // 정렬 축은 exchangeTime ↓ · 동률이면 isin ↑ — 최신 돌파가 맨 위 (사용자 결정 2026-09-22).
    // 서버 78 원순서(오름차순)와 무관하게 relay 가 내리는 순서다.
    expect(cached.map((i) => i.exchangeTime)).toEqual([
      "090300000003",
      "090200000002",
      "090100000001",
    ]);

    const snaps = msgsOf(fanout, "rate.cross.snap") as RelayRateCrossSnapMsg[];
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.items).toHaveLength(3);
    // 78 팬아웃도 캐시 getter 와 **같은 축**이다 — 브라우저가 받는 첫 순서가 최신 위.
    expect(snaps[0]?.items.map((i) => i.exchangeTime)).toEqual([
      "090300000003",
      "090200000002",
      "090100000001",
    ]);
  });

  it("⑤-2b exchangeTime 동률 두 원소는 isin 오름차순 — getter · 78 팬아웃 같은 축", () => {
    session.pushFrame(
      buildRateCrossSnapshotFrame([
        { isin: SAMPLE_ISIN, exchange: "KRX", exchangeTime: "090100000001" },
        { isin: OTHER_ISIN, exchange: "KRX", exchangeTime: "090500000005" },
        { isin: "KR7035720002", exchange: "KRX", exchangeTime: "090500000005" },
      ]),
    );

    // 0905 동률 두 원소(KR7000660001 < KR7035720002) 가 먼저, 0901 이 마지막.
    const expected = [OTHER_ISIN, "KR7035720002", SAMPLE_ISIN];
    expect(hub.getRateCrossItems(USER_A).map((i) => i.isin)).toEqual(expected);
    const snaps = msgsOf(fanout, "rate.cross.snap") as RelayRateCrossSnapMsg[];
    expect(snaps[0]?.items.map((i) => i.isin)).toEqual(expected);
  });

  it("⑤-3 빈 벡터 78 은 캐시를 비운다 — 무시하지 않는다(「돌파 없음」의 확정 정보)", () => {
    session.pushFrame(buildRateCrossAlertFrame());
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(1);

    session.pushFrame(buildRateCrossSnapshotFrame([]));

    expect(hub.getRateCrossItems(USER_A)).toHaveLength(0);
    const snaps = msgsOf(fanout, "rate.cross.snap") as RelayRateCrossSnapMsg[];
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.items).toEqual([]);
  });

  it("⑤-4 원소 하나가 깨지면 78 프레임 전체를 버린다 (parseTradeTape 와 같은 규율)", () => {
    session.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN }));

    // 두 번째 원소의 ISIN 이 11자 — 일부만 내보내면 above 집합이 조용히 어긋난다.
    session.pushFrame(
      buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }, { isin: "KR70059300" }]),
    );

    // 캐시는 손대지 않는다(교체도 비우기도 하지 않는다).
    expect(hub.getRateCrossItems(USER_A).map((i) => i.isin)).toEqual([OTHER_ISIN]);
    expect(msgsOf(fanout, "rate.cross.snap")).toHaveLength(0);
    expect(dropCallsWithReason(warn, "bad-isin")).toBe(1);
  });

  it("⑤-5 계약 위반으로 78 에 같은 ISIN 이 두 번 와도 getter · 78 팬아웃 둘 다 ISIN 당 1원소(뒤 원소가 이긴다)", () => {
    session.pushFrame(
      buildRateCrossSnapshotFrame([
        { isin: SAMPLE_ISIN, exchange: "KRX", exchangeTime: "090100000001", lastPrice: 84_000n },
        { isin: OTHER_ISIN, exchange: "KRX", exchangeTime: "090300000003" },
        { isin: SAMPLE_ISIN, exchange: "NXT", exchangeTime: "090200000002", lastPrice: 86_000n },
      ]),
    );

    const cached = hub.getRateCrossItems(USER_A);
    expect(cached.map((i) => i.isin)).toEqual([OTHER_ISIN, SAMPLE_ISIN]);
    const sample = cached.find((i) => i.isin === SAMPLE_ISIN);
    expect(sample?.exchange).toBe("NXT");
    expect(sample?.lastPrice).toBe(86_000);

    // 78 팬아웃은 캐시 getter 와 **같은 원천**이다 — 두 경로가 갈리지 않는다.
    const snaps = msgsOf(fanout, "rate.cross.snap") as RelayRateCrossSnapMsg[];
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.items).toEqual(cached);
  });

  it("⑥-1 77 프레임 2건이 연속으로 오면 캐시에는 마지막 1건만 남는다", () => {
    expect(hub.getQueuedWindow(USER_A)).toBeUndefined();

    session.pushFrame(buildQueuedWindowStateFrame({ open: false, maxPieces: 5 }));
    session.pushFrame(
      buildQueuedWindowStateFrame({ open: true, maxPieces: 9, g2Open: true, nxtPreopenOpen: true }),
    );

    // 여섯 값 전부 표시 힌트다 — 벽시계로 판정하지 않고 `open` 플래그만 믿는다.
    expect(hub.getQueuedWindow(USER_A)).toEqual<RelayQueuedWindowMsg>({
      t: "queued.window",
      open: true,
      maxPieces: 9,
      preopenOpen: false,
      g2Open: true,
      g3Open: false,
      nxtPreopenOpen: true,
    });

    const windows = msgsOf(fanout, "queued.window") as RelayQueuedWindowMsg[];
    expect(windows).toHaveLength(2);
    expect(windows[1]?.maxPieces).toBe(9);
  });

  it("⑥-2 Ready 이전 77/78 도 캐시만 하고 팬아웃하지 않는다 (T-17-07)", () => {
    session.isReady = false;

    session.pushFrame(buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }]));
    session.pushFrame(buildQueuedWindowStateFrame({ open: true }));

    expect(msgsOf(fanout, "rate.cross.snap")).toHaveLength(0);
    expect(msgsOf(fanout, "queued.window")).toHaveLength(0);
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(1);
    expect(hub.getQueuedWindow(USER_A)?.open).toBe(true);
  });

  it("⑥-3 파서 단위 — 78 은 원소 배열, 77 은 여섯 값을 그대로 돌려준다", () => {
    const items = parseRateCrossSnapshot(
      readBack(buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }, { isin: OTHER_ISIN }])),
    );
    expect(items?.map((i) => i.isin)).toEqual([SAMPLE_ISIN, OTHER_ISIN]);

    // 빈 벡터는 `[]` 이고 `null`(파싱 실패)이 아니다 — 둘을 뭉개면 「돌파 없음」이 사라진다.
    expect(parseRateCrossSnapshot(readBack(buildRateCrossSnapshotFrame([])))).toEqual([]);

    expect(
      parseQueuedWindowState(readBack(buildQueuedWindowStateFrame({ open: true, g3Open: true }))),
    ).toEqual<RelayQueuedWindowMsg>({
      t: "queued.window",
      open: true,
      maxPieces: 5,
      preopenOpen: false,
      g2Open: false,
      g3Open: true,
      nxtPreopenOpen: false,
    });
  });

  it("⑦ 78/77 수신에 unknown-msg-type warn 이 0건이다 (드롭 0 게이트)", () => {
    session.pushFrame(buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }]));
    session.pushFrame(buildQueuedWindowStateFrame({ open: true }));

    expect(dropCallsWithReason(warn, "unknown-msg-type")).toBe(0);
    expect(dropCallsWithReason(warn, "out-of-scope-msg-type")).toBe(0);
  });
});

// ============================================================
// 돌파 항목 종목명·단축코드 보강 (Phase 18 D-30 / TRADE-06)
// ============================================================

describe("76/78 돌파 항목 name/code 보강 — relay 가 SymbolMap 으로 채운다 (18-01 / D-30)", () => {
  /** 종목마스터 스텁. SAMPLE_ISIN 만 안다 — OTHER_ISIN 은 「모르는 종목」이다. */
  const SYMBOLS: SymbolLookup = {
    lookup: (isin: string): SymbolInfo | undefined =>
      isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
  };

  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(logger, "debug").mockImplementation(() => undefined);
    hub = new SubscriptionHub({ symbols: SYMBOLS });
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession(USER_A);
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("① lookup 성공 — 76 팬아웃 항목에 name/code 가 채워진다", () => {
    session.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN }));

    const alerts = msgsOf(fanout, "rate.cross") as RelayRateCrossMsg[];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.item).toMatchObject({ isin: SAMPLE_ISIN, name: "삼성전자", code: "005930" });
  });

  it("② lookup 실패 — name/code 필드가 **없다** (ISIN 을 이름 자리에 넣지 않는다)", () => {
    session.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN }));

    const item = (msgsOf(fanout, "rate.cross") as RelayRateCrossMsg[])[0]?.item;
    expect(item?.isin).toBe(OTHER_ISIN);
    expect(item).not.toHaveProperty("name");
    expect(item).not.toHaveProperty("code");
  });

  it("③ 78 스냅샷 팬아웃에도 같은 보강 — 아는 종목만 채우고 모르는 종목은 비워 둔다", () => {
    session.pushFrame(
      buildRateCrossSnapshotFrame([
        { isin: SAMPLE_ISIN, exchange: "KRX", exchangeTime: "090100000001" },
        { isin: OTHER_ISIN, exchange: "KRX", exchangeTime: "090200000002" },
      ]),
    );

    const snaps = msgsOf(fanout, "rate.cross.snap") as RelayRateCrossSnapMsg[];
    expect(snaps).toHaveLength(1);
    // 순서는 최신 위(⑤-2)라 위치가 아니라 isin 으로 찾는다 — 이 케이스는 보강만 본다.
    const items = snaps[0]?.items ?? [];
    const known = items.find((i) => i.isin === SAMPLE_ISIN);
    const unknown = items.find((i) => i.isin === OTHER_ISIN);
    expect(known).toMatchObject({ isin: SAMPLE_ISIN, name: "삼성전자", code: "005930" });
    expect(unknown?.isin).toBe(OTHER_ISIN);
    expect(unknown).not.toHaveProperty("name");
    expect(unknown).not.toHaveProperty("code");
  });

  it("④ 인증 직후 스냅샷 원천(getRateCrossItems)도 보강된 사본이다 — 새로고침에서 이름이 사라지지 않는다", () => {
    // Ready 이전 76 은 캐시만 된다. 브라우저는 인증 직후 `getRateCrossItems` 로 이 집합을 받는다.
    session.isReady = false;
    session.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN }));

    const cached = hub.getRateCrossItems(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({ name: "삼성전자", code: "005930" });
  });

  it("⑤ 보강은 캐시 규율을 바꾸지 않는다 — 78 전량 교체가 그대로이고 서버 필드는 원문 그대로다", () => {
    session.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN, lastPrice: 84_100n }));
    session.pushFrame(buildRateCrossSnapshotFrame([{ isin: OTHER_ISIN, exchangeTime: "090300000003" }]));

    const cached = hub.getRateCrossItems(USER_A);
    // 전량 교체 — 76 으로 들어온 SAMPLE_ISIN 은 남지 않는다.
    expect(cached.map((i) => i.isin)).toEqual([OTHER_ISIN]);
    expect(cached[0]?.exchangeTime).toBe("090300000003");

    // 보강한 팬아웃 사본이 서버 필드를 바꾸지 않았다.
    const alert = (msgsOf(fanout, "rate.cross") as RelayRateCrossMsg[])[0]?.item;
    expect(alert?.lastPrice).toBe(84_100);
  });
});
