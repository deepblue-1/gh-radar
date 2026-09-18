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

import type { RelayOutbound, RelayRateCrossItem, RelayRateCrossMsg } from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { INBOUND_MSG_TYPES, MSG } from "../src/dma/msg-type.js";
import {
  parseRateCrossAlert,
  resetDroppedEnvelopeCount,
  tryParseEnvelope,
} from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { logger } from "../src/logger.js";
import { SAMPLE_ISIN, buildRateCrossAlertFrame } from "./helpers/frames.js";

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

  it("③ 같은 isin+exchange 76 이 두 번 오면 캐시 원소는 1개이고 뒤 값으로 덮인다", () => {
    session.pushFrame(buildRateCrossAlertFrame({ lastPrice: 84_000n, changeRate: 20.0 }));
    session.pushFrame(buildRateCrossAlertFrame({ lastPrice: 85_400n, changeRate: 22.0 }));

    const cached = hub.getRateCrossItems(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.lastPrice).toBe(85_400);
    expect(cached[0]?.changeRate).toBe(22.0);

    // 같은 종목이 양쪽 거래소에서 돌파하면 원소는 **둘**이다 (키 = isin + ":" + exchange).
    session.pushFrame(buildRateCrossAlertFrame({ exchange: "NXT" }));
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(2);

    // 다른 종목도 따로 쌓인다.
    session.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN }));
    expect(hub.getRateCrossItems(USER_A)).toHaveLength(3);
  });

  it("④ 76 수신에 unknown-msg-type warn 이 0건이다 (Pitfall 1 — 드롭 0 게이트)", () => {
    session.pushFrame(buildRateCrossAlertFrame());
    session.pushFrame(buildRateCrossAlertFrame({ exchange: "NXT" }));

    expect(dropCallsWithReason(warn, "unknown-msg-type")).toBe(0);
    expect(dropCallsWithReason(warn, "out-of-scope-msg-type")).toBe(0);
  });
});
