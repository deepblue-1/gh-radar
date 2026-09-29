/**
 * Phase 15 Plan 04 — RELAY-01. `SubscriptionHub` 단위 테스트.
 *
 * 검증 대상은 **구독 회계**다 — 탭이 늘어도 게이트웨이 구독은 1개, 사용자 간 구독이
 * 교차하지 않음, 스냅샷 캐시 즉시 응답(D-37), `ready` 전량 재구독(Pitfall 4),
 * 체결 200ms 배치와 링버퍼 상한(D-35).
 *
 * 세션은 **가짜 객체**를 쓴다. 세션 상태기계(로그인·재접속)는 15-03 이 소켓까지 붙여
 * 이미 증명했고, 여기서 다시 소켓을 세우면 검증 대상이 흐려진다. 대신 게이트웨이로 나간
 * 바이트를 **실제 FlatBuffers 로 되읽어** 단언한다 — "보냈다고 주장하는 것"이 아니라
 * "무엇을 보냈는가"를 본다.
 *
 * ⚠️ 나가는 프레임은 요청 대역(28/29/32)이라 `tryParseEnvelope` 로 읽을 수 없다.
 *    그 함수는 **수신(응답) 화이트리스트**라 요청 계열을 전부 드롭한다(15-02 규율).
 *    따라서 `Envelope.getRootAsEnvelope` 를 직접 쓴다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type { RelayAccount, RelayOutbound, RelayTape, RelayUnfProgressMsg } from "@gh-radar/shared";

import {
  SubscriptionHub,
  TAPE_BATCH_MS,
  TAPE_RING_SIZE,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import {
  SAMPLE_ISIN,
  buildOrderRespFrame,
  buildQuoteStateFrame,
  buildServerMessageFrame,
  buildTradeTapeFrame,
  buildJournalBatchFrame,
  buildObserverLoginRespFrame,
  buildQueueProgressFrame,
  SAMPLE_ACCOUNT_NO,
  type FakeTapeEntryInput,
} from "./helpers/frames.js";
import { logger } from "../src/logger.js";

const OTHER_ISIN = "KR7000660001";

/** 게이트웨이로 나간 요청 프레임 1건을 되읽은 결과. */
type SentReq = {
  msgType: number;
  isin: string;
  exchange: string;
  subscribe: boolean | null;
  count: number | null;
  /** 29 의 `level` 바이트(quick-260923-ge2). 다른 요청은 null. */
  level: number | null;
};

function decodeReq(payload: Uint8Array): SentReq {
  const bb = new flatbuffers.ByteBuffer(payload);
  const env = Envelope.getRootAsEnvelope(bb);
  const msgType = env.msgType();

  if (msgType === MSG.GetQuoteReq) {
    const req = env.getQuoteReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: null,
      count: null,
      level: null,
    };
  }
  if (msgType === MSG.SubscribeQuoteReq) {
    const req = env.subscribeQuoteReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: req?.subscribe() ?? null,
      count: null,
      level: req?.level() ?? null,
    };
  }
  if (msgType === MSG.GetTradeTapeReq) {
    const req = env.getTradeTapeReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: null,
      count: req?.count() ?? null,
      level: null,
    };
  }
  return { msgType, isin: "", exchange: "", subscribe: null, count: null, level: null };
}

/** `HubSession` 최소 구현. 보낸 바이트를 그대로 쌓아 둔다. */
class FakeSession extends EventEmitter implements HubSession {
  readonly sent: SentReq[] = [];
  isReady = true;
  /** 세션 허용 계좌(25-06). 생략하면 진행률 항목을 전부 거른다(fail-closed). */
  allowedAccounts?: RelayAccount[];

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    this.sent.push(decodeReq(payload));
    return true;
  }

  /** 게이트웨이가 프레임을 밀어 넣는 상황을 재현한다. */
  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  /** Ready 재진입 (재접속 후 복귀). */
  emitReady(): void {
    this.isReady = true;
    this.emit("ready", { generation: 1, accounts: [] });
  }

  subscribeReqs(): SentReq[] {
    return this.sent.filter((s) => s.msgType === MSG.SubscribeQuoteReq);
  }
}

function tapeEntries(times: string[]): FakeTapeEntryInput[] {
  return times.map((t) => ({ tradeTime: t }));
}

describe("SubscriptionHub", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession("user-1");
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  it("① 같은 (user,isin,ex) 를 두 번 구독해도 게이트웨이 구독은 1건이다 (탭 공유)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const subs = session.subscribeReqs();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true });
    // 0→1 전이의 3프레임이 순서대로 나간다 (D-33).
    expect(session.sent.map((s) => s.msgType)).toEqual([
      MSG.GetQuoteReq,
      MSG.SubscribeQuoteReq,
      MSG.GetTradeTapeReq,
    ]);
    expect(session.sent[2]?.count).toBe(TAPE_RING_SIZE);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(2);
  });

  it("② 해제는 마지막 1건에서만 subscribe:false 를 보낸다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(session.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    const releases = session.subscribeReqs().filter((s) => s.subscribe === false);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX" });
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(0);
  });

  it("③ 다른 사용자의 해제가 첫 사용자의 구독을 끊지 않는다 (D-13 키 격리)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");
    hub.unsubscribe("user-2", SAMPLE_ISIN, "KRX");

    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);
    expect(session.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    expect(other.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(1);
  });

  it("④ 스냅샷 캐시가 채워지면 게이트웨이 송신 없이 즉시 반환한다 (D-37)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    session.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 70_950n }));

    const before = session.sent.length;
    const snapshot = hub.getSnapshot("user-1", SAMPLE_ISIN, "KRX");

    expect(snapshot?.p).toBe(70_950);
    expect(snapshot?.snap).toBe(true);
    // 캐시 조회는 업스트림을 건드리지 않는다.
    expect(session.sent).toHaveLength(before);
    // 다른 사용자의 캐시는 비어 있다 (키에 userId 가 들어 있으므로).
    expect(hub.getSnapshot("user-2", SAMPLE_ISIN, "KRX")).toBeUndefined();
  });

  it("⑤ ready 재발행이 보유 키를 전량 재구독한다 (Pitfall 4)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", OTHER_ISIN, "NXT");
    session.sent.length = 0;

    session.emitReady();

    const resubscribed = session
      .subscribeReqs()
      .filter((s) => s.subscribe === true)
      .map((s) => `${s.isin}|${s.exchange}`);
    expect(resubscribed.sort()).toEqual([`${OTHER_ISIN}|NXT`, `${SAMPLE_ISIN}|KRX`]);
    // 재구독도 3프레임 세트다 — 스냅샷 없이 구독만 걸면 첫 화면이 비어 있다.
    expect(session.sent.filter((s) => s.msgType === MSG.GetQuoteReq)).toHaveLength(2);
    expect(session.sent.filter((s) => s.msgType === MSG.GetTradeTapeReq)).toHaveLength(2);
  });

  it("⑥ 체결은 200ms 배치로 1회만 나간다 (100ms 안의 3건 → entry 3개)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000001"]) }),
    );
    vi.advanceTimersByTime(50);
    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000002"]) }),
    );
    vi.advanceTimersByTime(50);
    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000003"]) }),
    );

    // 배치 창이 아직 닫히지 않았다 — 한 건도 나가지 않는다.
    expect(fanout.filter((e) => e.msg.t === "tape")).toHaveLength(0);

    vi.advanceTimersByTime(TAPE_BATCH_MS);

    const tapes = fanout.map((e) => e.msg).filter((m): m is RelayTape => m.t === "tape");
    expect(tapes).toHaveLength(1);
    expect(tapes[0]?.e.map((entry) => entry.t)).toEqual([
      "090000000001",
      "090000000002",
      "090000000003",
    ]);
    expect(tapes[0]?.snap).toBe(false);
  });

  it("⑦ 체결 링버퍼는 상한을 넘으면 오래된 것부터 버린다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const full = Array.from({ length: TAPE_RING_SIZE }, (_, i) =>
      `0900000${String(i).padStart(5, "0")}`,
    );
    session.pushFrame(buildTradeTapeFrame({ snapshot: true, entries: tapeEntries(full) }));
    session.pushFrame(
      buildTradeTapeFrame({
        snapshot: false,
        entries: tapeEntries(["091000000001", "091000000002", "091000000003"]),
      }),
    );

    const ring = hub.getTape("user-1", SAMPLE_ISIN, "KRX");
    expect(ring).toHaveLength(TAPE_RING_SIZE);
    // 앞의 3건이 밀려났다.
    expect(ring?.[0]?.t).toBe(full[3]);
    expect(ring?.[TAPE_RING_SIZE - 1]?.t).toBe("091000000003");
  });

  it("⑧ 시세는 배치하지 않고 그대로 통과시킨다 (D-35 — 추가 코얼레싱 없음)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    session.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_000n }));
    session.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_100n }));

    const quotes = fanout.map((e) => e.msg).filter((m) => m.t === "q");
    expect(quotes).toHaveLength(2);
    expect(fanout.every((e) => e.userId === "user-1")).toBe(true);
  });

  it("⑨ 팬아웃 대상은 언제나 프레임을 보낸 세션의 userId 하나다 (T-15-02)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");

    other.pushFrame(buildQuoteStateFrame({ snapshot: true }));

    expect(fanout).toHaveLength(1);
    expect(fanout[0]?.userId).toBe("user-2");
  });

  it("⑩ ServerMessage(54)는 해석 없이 그대로 흘린다 (D-36)", () => {
    session.pushFrame(
      buildServerMessageFrame({ level: "WARN", message: "세션 정리", kind: "Purge" }),
    );

    const msgs = fanout.map((e) => e.msg).filter((m: RelayOutbound) => m.t === "msg");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ lv: "WARN", m: "세션 정리", kind: "Purge" });
  });

  it("⑪ Ready 이전 구독은 프레임을 보내지 않고 ready 에서 복원된다", () => {
    const late = new FakeSession("user-3");
    late.isReady = false;
    hub.attach(late);

    hub.subscribe("user-3", SAMPLE_ISIN, "KRX");
    expect(late.sent).toHaveLength(0);
    expect(hub.refCount("user-3", SAMPLE_ISIN, "KRX")).toBe(1);

    late.emitReady();
    expect(late.subscribeReqs().filter((s) => s.subscribe === true)).toHaveLength(1);
  });

  it("⑫ 참조계수 없는 해제는 무시한다 (이중 해제 방어)", () => {
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(session.sent).toHaveLength(0);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(0);
  });

  it("⑬ 주문 통보의 `bd`·`rk`·`rq` 가 브라우저 프레임까지 간다 (17-02 / D-08)", () => {
    session.pushFrame(
      buildOrderRespFrame({
        noticeType: "C",
        orderNo: "0000012345",
        board: "G3",
        requestKind: "Cancel",
        requester: "Manual",
      }),
    );

    const orders = fanout.map((e) => e.msg).filter((m: RelayOutbound) => m.t === "order");
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ no: "0000012345", nt: "C", bd: "G3", rk: "Cancel", rq: "Manual" });
    // `side`·`isin` 은 계속 싣지 않는다 (Pitfall 8 규율 유지).
    expect(orders[0]).not.toHaveProperty("side");
    expect(orders[0]).not.toHaveProperty("i");
  });

  it("⑭ 빈 `bd`·`rk`·`rq` 는 **키 자체를 생략**한다 — 구 서버 프레임을 무겁게 하지 않는다", () => {
    session.pushFrame(buildOrderRespFrame({ noticeType: "A", orderNo: "0000012345" }));

    const order = fanout.map((e) => e.msg).find((m: RelayOutbound) => m.t === "order");
    expect(order).toMatchObject({ no: "0000012345", nt: "A" });
    expect(order).not.toHaveProperty("bd");
    expect(order).not.toHaveProperty("rk");
    expect(order).not.toHaveProperty("rq");
  });
  describe("SubscribeQuoteReq level (quick-260923-ge2)", () => {
    const Q = MSG.GetQuoteReq;
    const S = MSG.SubscribeQuoteReq;
    const T = MSG.GetTradeTapeReq;

    it("L1 PRICE 단독 0→1 은 28 → 29(level=1) 두 프레임이고 32 는 나가지 않는다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");

      expect(session.sent.map((s) => s.msgType)).toEqual([Q, S]);
      expect(session.sent[1]).toMatchObject({ subscribe: true, level: 1 });
      expect(session.sent.filter((s) => s.msgType === T)).toHaveLength(0);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("price");
    });

    it("L2 level 생략은 FULL — 28 → 29(level=0) → 32", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

      expect(session.sent.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(session.sent[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L3 PRICE→FULL 승격은 28 → 29(level=0) → 32 를 다시 보낸다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      session.sent.length = 0;

      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");

      expect(session.sent.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(session.sent[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(2);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L4 FULL 이탈로 PRICE 만 남으면 29(level=1) 1건, 마지막 이탈은 29(false) 1건", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      // 실효 level 이 그대로 full 이라 price 추가는 프레임을 내지 않는다.
      expect(session.sent.map((s) => s.msgType)).toEqual([Q, S, T]);

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      expect(session.sent).toHaveLength(4);
      expect(session.sent[3]).toMatchObject({ msgType: S, subscribe: true, level: 1 });
      expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("price");

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      expect(session.sent).toHaveLength(5);
      expect(session.sent[4]).toMatchObject({ msgType: S, subscribe: false });
      expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(0);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBeUndefined();
    });

    it("L5 FULL 이 남아 있으면 PRICE 이탈은 프레임을 내지 않는다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      const before = session.sent.length;

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");

      expect(session.sent).toHaveLength(before);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("full");
      expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);
    });

    it("L6 resubscribeAll 은 키마다 실효 level 로 되건다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      hub.subscribe("user-1", OTHER_ISIN, "NXT", "full");
      session.sent.length = 0;

      session.emitReady();

      const sample = session.sent.filter((s) => s.isin === SAMPLE_ISIN);
      const other = session.sent.filter((s) => s.isin === OTHER_ISIN);
      expect(sample.map((s) => s.msgType)).toEqual([Q, S]);
      expect(sample[1]).toMatchObject({ subscribe: true, level: 1 });
      expect(other.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(other[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(session.sent.filter((s) => s.msgType === T)).toHaveLength(1);
    });

    it("L7 잡지 않은 level 의 해제는 무시한다 (참조계수 불변)", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      const before = session.sent.length;

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");

      expect(session.sent).toHaveLength(before);
      expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);
      expect(hub.subscriptionLevel("user-1", SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L8 Ready 이전 승격·강등은 프레임 없이 기록만 하고 ready 가 실효 level 로 복원한다", () => {
      const late = new FakeSession("user-3");
      late.isReady = false;
      hub.attach(late);

      hub.subscribe("user-3", SAMPLE_ISIN, "KRX", "price");
      hub.subscribe("user-3", SAMPLE_ISIN, "KRX", "full");
      hub.unsubscribe("user-3", SAMPLE_ISIN, "KRX", "full");
      expect(late.sent).toHaveLength(0);
      expect(hub.subscriptionLevel("user-3", SAMPLE_ISIN, "KRX")).toBe("price");

      late.emitReady();

      const quoteReqs = late.sent.filter((s) => s.isin === SAMPLE_ISIN);
      expect(quoteReqs.map((s) => s.msgType)).toEqual([Q, S]);
      expect(quoteReqs[1]).toMatchObject({ subscribe: true, level: 1 });
    });
  });
});

describe("SubscriptionHub — 관찰자 전용 프레임(79 · 80)이 사용자 세션에 오면 (19-09 · PC-12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("명시 case 가 warn 후 무시한다 — unhandledFrameCount 0 · 팬아웃 0", () => {
    resetDroppedEnvelopeCount();
    const warn = vi.spyOn(logger, "warn").mockImplementation((() => undefined) as never);
    const hub = new SubscriptionHub();
    const fanout: HubFanoutEvent[] = [];
    hub.on("fanout", (e) => fanout.push(e));
    const session = new FakeSession("user-1");
    hub.attach(session);

    const observerWarns = (): number =>
      warn.mock.calls.filter((args) => args.some((a) => typeof a === "string" && a.includes("관찰자 전용 프레임"))).length;

    session.pushFrame(buildObserverLoginRespFrame({ headSeq: 3, oldestSeq: 1 }));
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(observerWarns()).toBe(1);
    expect(warn.mock.calls.at(-1)?.[0]).toEqual({ userId: "user-1", msgType: MSG.ObserverLoginResp });

    session.pushFrame(buildJournalBatchFrame({ records: [{ seq: 1 }] }));
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(observerWarns()).toBe(2);
    expect(warn.mock.calls.at(-1)?.[0]).toEqual({ userId: "user-1", msgType: MSG.JournalBatch });

    expect(fanout).toEqual([]);
    expect(session.sent).toEqual([]);
    hub.closeAll();
  });
});

describe("SubscriptionHub — 잔량진행률 83 QueueProgress (Phase 25-06)", () => {
  /** 남의 계좌 — 83 은 시세만 구독한 세션에도 이 항목을 싣고 온다(gh-trade D-19). */
  const OTHER_ACCOUNT = "9999999901";

  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  function progressFrames(): RelayUnfProgressMsg[] {
    return fanout.map((e) => e.msg).filter((m): m is RelayUnfProgressMsg => m.t === "unf.progress");
  }

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession("user-1");
    session.allowedAccounts = [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }];
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
  });

  it("허용 계좌 항목만 팬아웃 · 캐시한다 — 남의 계좌 0건 · dmaUserId 키 없음 (T-25-24 · T-25-25)", () => {
    session.pushFrame(
      buildQueueProgressFrame({
        isin: SAMPLE_ISIN,
        exchange: "KRX",
        items: [
          { accountNo: SAMPLE_ACCOUNT_NO, dmaUserId: "dma-1", orderNo: "12453", group: 3, progressBp: 8800 },
          { accountNo: OTHER_ACCOUNT, dmaUserId: "dma-9", orderNo: "99999" },
        ],
      }),
    );

    expect(hub.unhandledFrameCount()).toBe(0);
    expect(fanout.map((e) => e.userId)).toEqual(["user-1"]);
    const frames = progressFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      t: "unf.progress",
      snap: false,
      i: SAMPLE_ISIN,
      x: "KRX",
      items: [
        {
          accountNo: SAMPLE_ACCOUNT_NO,
          orderNo: "12453",
          exchange: "KRX",
          isin: SAMPLE_ISIN,
          group: 3,
          expectedCum: 1_100_000,
          currentCum: 1_088_000,
          remainingVolume: 12_000,
          progressBp: 8800,
        },
      ],
    });
    expect(JSON.stringify(frames[0])).not.toContain("dmaUserId");
    expect(JSON.stringify(frames[0])).not.toContain(OTHER_ACCOUNT);

    const entries = hub.getQueueProgressEntries("user-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items.map((it) => it.orderNo)).toEqual(["12453"]);
    expect(JSON.stringify(entries)).not.toContain("dmaUserId");
  });

  it("허용 계좌 목록이 없는 세션은 전부 거른다 — 캐시 · 팬아웃 0 (fail-closed)", () => {
    const bare = new FakeSession("user-2");
    hub.attach(bare);
    bare.pushFrame(buildQueueProgressFrame({ items: [{ accountNo: SAMPLE_ACCOUNT_NO }] }));

    expect(progressFrames()).toEqual([]);
    expect(hub.getQueueProgressEntries("user-2")).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
  });

  it("Ready 이전에는 캐시만 한다 — 팬아웃 0 · 엔트리에는 있다", () => {
    session.isReady = false;
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));

    expect(progressFrames()).toEqual([]);
    expect(hub.getQueueProgressEntries("user-1")).toEqual([
      { i: SAMPLE_ISIN, x: "KRX", items: [expect.objectContaining({ orderNo: "12453" })] },
    ]);
  });

  /** 웹 리듀서 규칙으로 「이미 연결된 탭의 사본」 을 모델링한다 — snap:true 는 전량 교체, snap:false 는 키 교체 · 빈 값은 키 삭제. */
  function browserCopyKeys(): string[] {
    const copy = new Map<string, string[]>();
    for (const m of progressFrames()) {
      if (m.snap) {
        copy.clear();
        for (const e of m.entries) copy.set(`${e.i}|${e.x}`, e.items.map((it) => it.orderNo));
      } else if (m.items.length === 0) copy.delete(`${m.i}|${m.x}`);
      else copy.set(`${m.i}|${m.x}`, m.items.map((it) => it.orderNo));
    }
    return [...copy.keys()];
  }

  it("같은 세션 재접속(Ready 이전)의 빈 83 이 키를 지우면 Ready 가 캐시 그대로 재동기화한다 — 사본에 옛 진행률이 남지 않는다 (R2-WR-01)", () => {
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    expect(browserCopyKeys()).toEqual([`${SAMPLE_ISIN}|KRX`]);

    // 게이트웨이 재접속 — 같은 세션 객체라 `attach` · `#clearCaches` 를 거치지 않는다.
    session.isReady = false;
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    expect(hub.getQueueProgressEntries("user-1")).toEqual([]);
    // Ready 이전이라 팬아웃은 없다 — 사본에는 아직 남아 있다(이 구간 자체는 의도).
    expect(browserCopyKeys()).toEqual([`${SAMPLE_ISIN}|KRX`]);

    session.emitReady();
    expect(progressFrames().at(-1)).toEqual({ t: "unf.progress", snap: true, entries: [] });
    expect(browserCopyKeys()).toEqual([]);

    // 이후 같은 키의 빈 83 은 캐시도 사본도 비었으니 억제가 맞다.
    const base = progressFrames().length;
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    expect(progressFrames()).toHaveLength(base);
  });

  it("Ready 이전의 비어 있지 않은 갱신도 Ready 재동기화 스냅에 캐시 값 그대로 실린다 — 다른 키의 마지막 값은 유지 (R2-WR-01 · D-13)", () => {
    session.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "1" }] }));
    session.pushFrame(buildQueueProgressFrame({ exchange: "NXT", items: [{ orderNo: "7" }] }));

    session.isReady = false;
    session.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "2" }] }));
    session.emitReady();

    const snap = progressFrames().at(-1);
    expect(snap).toMatchObject({ t: "unf.progress", snap: true });
    const copy = new Map(
      (snap?.snap === true ? snap.entries : []).map((e) => [`${e.i}|${e.x}`, e.items.map((it) => it.orderNo)]),
    );
    expect(copy).toEqual(
      new Map([
        [`${SAMPLE_ISIN}|KRX`, ["2"]],
        [`${SAMPLE_ISIN}|NXT`, ["7"]],
      ]),
    );
  });

  it("Ready 이전 83 이 없었던 Ready 재진입은 unf.progress 를 내지 않는다 (R2-WR-01 · 소음 0)", () => {
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    const base = progressFrames().length;

    session.isReady = false;
    // 빈 → 빈 은 캐시를 바꾸지 않으므로 어긋남도 아니다.
    session.pushFrame(buildQueueProgressFrame({ exchange: "NXT", items: [] }));
    session.emitReady();
    expect(progressFrames()).toHaveLength(base);

    // Ready 를 한 번 더 받아도 마찬가지다.
    session.emitReady();
    expect(progressFrames()).toHaveLength(base);
  });

  it("Ready 이전 빈 83 으로 캐시가 이미 비었어도 이후 세션 교체는 초기화 스냅을 낸다 (R2-WR-01 · WR-02)", () => {
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    session.isReady = false;
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    expect(hub.getQueueProgressEntries("user-1")).toEqual([]);

    // Ready 에 닿기 전에 세션이 교체된다 — 지울 캐시 키는 0 개지만 사본은 어긋나 있다.
    const next = new FakeSession("user-1");
    next.allowedAccounts = session.allowedAccounts;
    hub.attach(next);
    expect(progressFrames().at(-1)).toEqual({ t: "unf.progress", snap: true, entries: [] });
    expect(browserCopyKeys()).toEqual([]);

    // 표시는 소비됐다 — 새 세션의 첫 Ready 는 다시 보내지 않는다.
    const base = progressFrames().length;
    next.emitReady();
    expect(progressFrames()).toHaveLength(base);
  });

  it("비어 있던 키에 빈 스냅샷은 팬아웃하지 않고, 비어 있지 않던 키가 비면 한 번 보낸다(삭제 신호) (T-25-27)", () => {
    // 빈 → 빈: 1초 × 종목 폭주 억제. 남의 계좌만 실린 프레임도 거르면 빈 값이다.
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    session.pushFrame(buildQueueProgressFrame({ items: [{ accountNo: OTHER_ACCOUNT }] }));
    expect(progressFrames()).toEqual([]);

    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    expect(progressFrames()).toHaveLength(1);

    // 비어 있지 않음 → 빈: 전량 교체라 「대기 주문 전부 사라짐」을 한 번 알린다.
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    const frames = progressFrames();
    expect(frames).toHaveLength(2);
    expect(frames[1]).toEqual({ t: "unf.progress", snap: false, i: SAMPLE_ISIN, x: "KRX", items: [] });
    expect(hub.getQueueProgressEntries("user-1")).toEqual([]);

    // 그 뒤의 빈 값은 다시 억제된다.
    session.pushFrame(buildQueueProgressFrame({ items: [] }));
    expect(progressFrames()).toHaveLength(2);
  });

  it("(isin, exchange) 키 단위 전량 교체 — 같은 종목 다른 거래소는 독립 · 같은 프레임 재수신은 같은 결과(멱등)", () => {
    session.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "1" }, { orderNo: "2" }] }));
    session.pushFrame(buildQueueProgressFrame({ exchange: "NXT", items: [{ orderNo: "7" }] }));
    session.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "2" }] }));
    session.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "2" }] }));

    const byKey = new Map(hub.getQueueProgressEntries("user-1").map((e) => [`${e.i}|${e.x}`, e.items.map((it) => it.orderNo)]));
    expect(byKey).toEqual(
      new Map([
        [`${SAMPLE_ISIN}|KRX`, ["2"]],
        [`${SAMPLE_ISIN}|NXT`, ["7"]],
      ]),
    );
  });

  it("세션 교체(#clearCaches) 뒤 옛 진행률이 남지 않는다 (T-25-26 · Pitfall 6) — 이미 연결된 브라우저 사본도 비운다 (WR-02)", () => {
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    expect(hub.getQueueProgressEntries("user-1")).toHaveLength(1);

    const next = new FakeSession("user-1");
    next.allowedAccounts = session.allowedAccounts;
    hub.attach(next);
    expect(hub.getQueueProgressEntries("user-1")).toEqual([]);
    // 캐시를 브라우저 모르게 비우면 빈→빈 억제가 삭제 신호를 삼킨다 — 교체 순간 사본도 같이 비운다.
    expect(progressFrames().at(-1)).toEqual({ t: "unf.progress", snap: true, entries: [] });
    const snapTargets = fanout
      .filter((e) => e.msg.t === "unf.progress" && e.msg.snap === true)
      .map((e) => e.userId);
    expect(snapTargets).toEqual(["user-1"]);
  });

  it("진행률이 없던 사용자의 세션 교체는 unf.progress 를 내지 않는다 (WR-02 · 소음 0)", () => {
    expect(hub.getQueueProgressEntries("user-1")).toEqual([]);

    const next = new FakeSession("user-1");
    next.allowedAccounts = session.allowedAccounts;
    hub.attach(next);

    // 사본은 캐시를 거친 값뿐이다 — 캐시가 비었으면 사본도 비어 있어 알릴 것이 없다(T-25-55).
    expect(progressFrames()).toEqual([]);
  });

  it("세션 교체 초기화 스냅은 그 사용자에게만 — 다른 사용자의 진행률 · 팬아웃은 그대로 (WR-02 · T-15-02)", () => {
    const other = new FakeSession("user-2");
    other.allowedAccounts = [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }];
    hub.attach(other);
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    other.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "55501" }] }));
    const user2Before = fanout.filter((e) => e.userId === "user-2" && e.msg.t === "unf.progress").length;
    expect(user2Before).toBe(1);

    const next = new FakeSession("user-1");
    next.allowedAccounts = session.allowedAccounts;
    hub.attach(next);

    const snapTargets = fanout
      .filter((e) => e.msg.t === "unf.progress" && e.msg.snap === true)
      .map((e) => e.userId);
    expect(snapTargets).toEqual(["user-1"]);
    const user2Entries = hub.getQueueProgressEntries("user-2");
    expect(user2Entries).toHaveLength(1);
    expect(user2Entries[0]?.items.map((it) => it.orderNo)).toEqual(["55501"]);
    expect(fanout.filter((e) => e.userId === "user-2" && e.msg.t === "unf.progress")).toHaveLength(user2Before);
  });

  it("교체 뒤 새 세션의 빈 83 은 억제 · 비어 있지 않은 83 은 다시 채움 · 옛 세션의 늦은 83 은 무시 (WR-02 · T-25-27)", () => {
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "12453" }] }));
    const next = new FakeSession("user-1");
    next.allowedAccounts = session.allowedAccounts;
    hub.attach(next);
    // 기준 — 교체 초기화 스냅까지 포함한 프레임 수.
    const base = progressFrames().length;

    // 같은 키의 빈 83: 캐시도 사본도 이미 비었으니 빈→빈 억제가 그대로 맞다.
    next.pushFrame(buildQueueProgressFrame({ items: [] }));
    expect(progressFrames()).toHaveLength(base);

    // 비어 있지 않은 83: 종전대로 snap:false 로 다시 채운다.
    next.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "20001" }] }));
    expect(progressFrames()).toHaveLength(base + 1);
    const refill = progressFrames().at(-1);
    expect(refill).toMatchObject({ t: "unf.progress", snap: false, i: SAMPLE_ISIN, x: "KRX" });
    expect(refill?.snap === false ? refill.items : []).toHaveLength(1);
    expect(hub.getQueueProgressEntries("user-1")).toHaveLength(1);

    // 옛 세션이 늦게 민 83: `#onFrame` 정본 대조로 무시된다.
    session.pushFrame(buildQueueProgressFrame({ items: [{ orderNo: "99001" }] }));
    expect(progressFrames()).toHaveLength(base + 1);
    const entries = hub.getQueueProgressEntries("user-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items.map((it) => it.orderNo)).toEqual(["20001"]);
  });
});
