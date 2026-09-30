/**
 * Phase 15 Plan 04 — RELAY-01. `SubscriptionHub` 단위 테스트.
 *
 * 검증 대상은 **구독 회계**다 — 탭 · 사용자가 늘어도 게이트웨이 구독은 1개, 스냅샷 캐시 즉시 응답(D-37),
 * `ready` 전량 재구독(Pitfall 4), 체결 200ms 배치와 링버퍼 상한(D-35).
 *
 * Phase 26 (26-03 빅뱅 · D-12) — 시세의 업스트림 송신자는 **quote 연결 하나**(`FakeFeed`)이고 키는 전역 `isin|ex` 다.
 * per-user 전제를 단언하던 케이스(③ 사용자 간 구독 격리 · ④ 사용자별 캐시 · ⑤ 세션 ready 재구독 · ⑨ 시세 userId 팬아웃
 * · ⑪/L8 세션 미Ready)는 「무엇을 지키려던 것인가」 로 다시 썼다(RESEARCH Pitfall 9) — 각 케이스 앞 주석 참조.
 * 사용자 데이터 격리(⑨ 51/66 · 83 describe)는 그대로 사용자 세션(`FakeSession`)으로 단언한다.
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
  LINGER_MS,
  PRICE_MIN_INTERVAL_MS,
  QUOTE_SUB_LIMIT,
  SubscriptionHub,
  TAPE_BATCH_MS,
  TAPE_RING_SIZE,
  USER_SUB_LIMIT,
  type HubFanoutEvent,
  type HubMarketEvent,
  type HubQuoteFeed,
  type HubSession,
  samePriceSection,
} from "../src/hub/subscription-hub.js";
import { PACER_TIMEOUT_MS, PACER_WINDOW } from "../src/hub/subscribe-pacer.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import {
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildOrderRespFrame,
  buildQuoteStateFrame,
  buildServerMessageFrame,
  buildTradeTapeFrame,
  buildJournalBatchFrame,
  buildObserverLoginRespFrame,
  buildQueueProgressFrame,
  buildQueuedWindowStateFrame,
  buildRateCrossAlertFrame,
  buildRateCrossSnapshotFrame,
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

  /** 시세 요청(28/29/32) — Phase 26 부터 사용자 세션으로는 **0건**이어야 한다 (D-08 · D-12). */
  quoteReqs(): SentReq[] {
    return this.sent.filter((s) => QUOTE_REQ_TYPES.has(s.msgType));
  }
}

const QUOTE_REQ_TYPES = new Set<number>([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);

/**
 * `HubQuoteFeed` 최소 구현 (Phase 26) — quote 연결(`QuoteFeed`)의 대역. `FakeSession` 과 같은 방식으로 보낸 바이트를
 * 실제 FlatBuffers 로 되읽어 쌓고, 게이트웨이 프레임 주입 · ready 재발행을 흉내 낸다.
 */
class FakeFeed extends EventEmitter implements HubQuoteFeed {
  readonly sent: SentReq[] = [];
  isReady = true;

  send(payload: Uint8Array): boolean {
    this.sent.push(decodeReq(payload));
    return true;
  }

  /** quote 연결로 게이트웨이 프레임이 들어오는 상황을 재현한다. */
  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  /** (재)로그인 완료 — 합집합 재구독 트리거. */
  emitReady(): void {
    this.isReady = true;
    this.emit("ready", {});
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
  let feed: FakeFeed;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];
  let market: HubMarketEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanout = [];
    market = [];
    hub.on("fanout", (e) => fanout.push(e));
    hub.on("market", (e) => market.push(e));
    feed = new FakeFeed();
    hub.attachFeed(feed);
    session = new FakeSession("user-1");
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  it("① 같은 (isin,ex) 를 두 번 구독해도 quote 연결 구독은 1건이다 (탭 공유) — 사용자 세션으로는 0건", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const subs = feed.subscribeReqs();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true });
    // 0→1 전이의 3프레임이 순서대로 나간다 (D-33).
    expect(feed.sent.map((s) => s.msgType)).toEqual([
      MSG.GetQuoteReq,
      MSG.SubscribeQuoteReq,
      MSG.GetTradeTapeReq,
    ]);
    expect(feed.sent[2]?.count).toBe(TAPE_RING_SIZE);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(2);
    // 업스트림 송신자는 quote 연결 하나다 — 사용자 세션 송신 큐에 시세 요청이 없다 (D-08 · D-12).
    expect(session.quoteReqs()).toHaveLength(0);
  });

  it("② 해제는 마지막 1건에서만 subscribe:false 를 보낸다 (linger 만료 뒤 · D-10)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    vi.advanceTimersByTime(LINGER_MS);
    const releases = feed.subscribeReqs().filter((s) => s.subscribe === false);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX" });
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
  });

  // 옛 ③ 은 「다른 사용자의 해제가 첫 사용자의 구독을 끊지 않는다」 를 **사용자별 키**로 지켰다(D-13).
  // 키가 전역이 된 뒤 같은 목적은 **참조계수**가 지킨다 — A 의 해제는 합계를 1 로 내릴 뿐 29(false) 를 내지 않는다.
  it("③ 두 사용자 같은 키 = 업스트림 한 벌 — A 해제는 유지 · B 해제 뒤 linger 만료에서 29(false) 와 그 키 캐시 정리 (Phase 26 D-12 · D-10)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");

    // 업스트림 구독 한 벌(28 → 29 → 32) + user-2 첫 참조의 같은 level 29 넛지 1건(26-11 Pattern 10 — 83 재송신 트리거).
    expect(feed.sent.map((s) => s.msgType)).toEqual([
      MSG.GetQuoteReq,
      MSG.SubscribeQuoteReq,
      MSG.GetTradeTapeReq,
      MSG.SubscribeQuoteReq,
    ]);
    expect(feed.sent[1]).toMatchObject({ subscribe: true, level: 0 });
    expect(feed.sent[3]).toMatchObject({ subscribe: true, level: 0 });
    expect(session.quoteReqs()).toHaveLength(0);
    expect(other.quoteReqs()).toHaveLength(0);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(2);

    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 70_950n }));
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(70_950);

    const before = feed.sent.length;
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.sent).toHaveLength(before);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(70_950);

    hub.unsubscribe("user-2", SAMPLE_ISIN, "KRX");
    // 1→0 은 linger(D-10) — 만료 전에는 해제 프레임이 없고 캐시가 남는다.
    expect(feed.sent).toHaveLength(before);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(70_950);
    vi.advanceTimersByTime(LINGER_MS);
    expect(feed.sent).toHaveLength(before + 1);
    expect(feed.sent.at(-1)).toMatchObject({ msgType: MSG.SubscribeQuoteReq, subscribe: false });
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
    // 전역 캐시는 linger 만료에서 정리한다 (D-37 헤더 · D-10).
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.getTape(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(session.quoteReqs()).toHaveLength(0);
    expect(other.quoteReqs()).toHaveLength(0);
  });

  it("④ 전역 스냅샷 캐시가 채워지면 송신 없이 즉시 반환하고 다른 사용자도 같은 캐시를 본다 (D-37 · Phase 26)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 70_950n }));

    const before = feed.sent.length;
    const snapshot = hub.getSnapshot(SAMPLE_ISIN, "KRX");

    expect(snapshot?.p).toBe(70_950);
    expect(snapshot?.snap).toBe(true);
    // 캐시 조회는 업스트림을 건드리지 않는다.
    expect(feed.sent).toHaveLength(before);

    // 두 번째 사용자가 같은 키를 잡아도 업스트림 재요청이 없고 캐시가 그대로다 (유저 간 공유).
    hub.attach(new FakeSession("user-2"));
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");
    expect(feed.sent).toHaveLength(before);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(70_950);
  });

  it("⑤ quote 연결 ready 가 전역 합집합을 재구독하고, 사용자 세션 ready 는 28/29/32 를 0건 보낸다 (Pitfall 4 · D-03 · D-08)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", OTHER_ISIN, "NXT");
    feed.sent.length = 0;

    // 사용자 세션 ready — 계좌 · 전략 재요청은 그대로, 시세는 건드리지 않는다.
    session.emitReady();
    const userTypes = session.sent.map((s) => s.msgType);
    expect(userTypes).toContain(MSG.GetAccountStateReq);
    expect(userTypes).toContain(MSG.GetLimitChaserListReq);
    expect(userTypes).toContain(MSG.GetVITriggerReq);
    expect(userTypes).toContain(MSG.GetVIOrderListReq);
    expect(session.quoteReqs()).toHaveLength(0);
    expect(feed.sent).toHaveLength(0);

    // quote 연결 ready — 두 사용자의 키 합집합이 전부 되걸린다.
    feed.emitReady();
    const resubscribed = feed
      .subscribeReqs()
      .filter((s) => s.subscribe === true)
      .map((s) => `${s.isin}|${s.exchange}`);
    expect(resubscribed.sort()).toEqual([`${OTHER_ISIN}|NXT`, `${SAMPLE_ISIN}|KRX`]);
    // 재구독도 3프레임 세트다 — 스냅샷 없이 구독만 걸면 첫 화면이 비어 있다.
    expect(feed.sent.filter((s) => s.msgType === MSG.GetQuoteReq)).toHaveLength(2);
    expect(feed.sent.filter((s) => s.msgType === MSG.GetTradeTapeReq)).toHaveLength(2);
    expect(session.quoteReqs()).toHaveLength(0);
    expect(other.quoteReqs()).toHaveLength(0);
  });

  it("⑥ 체결은 전역 200ms 배치로 \"market\" tape 1건만 나간다 (100ms 안의 3건 → entry 3개 · full 전용)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    feed.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000001"]) }));
    vi.advanceTimersByTime(50);
    feed.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000002"]) }));
    vi.advanceTimersByTime(50);
    feed.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000003"]) }));

    // 배치 창이 아직 닫히지 않았다 — 한 건도 나가지 않는다.
    expect(market.filter((e) => e.msg.t === "tape")).toHaveLength(0);

    vi.advanceTimersByTime(TAPE_BATCH_MS);

    const tapes = market.filter((e) => e.msg.t === "tape");
    expect(tapes).toHaveLength(1);
    expect(tapes[0]).toMatchObject({ key: `${SAMPLE_ISIN}|KRX`, full: true, price: false });
    const tape = tapes[0]?.msg as RelayTape;
    expect(tape.e.map((entry) => entry.t)).toEqual(["090000000001", "090000000002", "090000000003"]);
    expect(tape.snap).toBe(false);
    // 시세는 사용자 경로로 나가지 않는다.
    expect(fanout).toHaveLength(0);
  });

  it("⑦ 전역 체결 링버퍼는 상한을 넘으면 오래된 것부터 버린다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const full = Array.from({ length: TAPE_RING_SIZE }, (_, i) =>
      `0900000${String(i).padStart(5, "0")}`,
    );
    feed.pushFrame(buildTradeTapeFrame({ snapshot: true, entries: tapeEntries(full) }));
    feed.pushFrame(
      buildTradeTapeFrame({
        snapshot: false,
        entries: tapeEntries(["091000000001", "091000000002", "091000000003"]),
      }),
    );

    const ring = hub.getTape(SAMPLE_ISIN, "KRX");
    expect(ring).toHaveLength(TAPE_RING_SIZE);
    // 앞의 3건이 밀려났다.
    expect(ring?.[0]?.t).toBe(full[3]);
    expect(ring?.[TAPE_RING_SIZE - 1]?.t).toBe("091000000003");
  });

  it("⑧ 시세는 배치하지 않고 \"market\" 으로 그대로 통과시킨다 (D-35 — 추가 코얼레싱 없음)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_000n }));
    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_100n }));

    const quotes = market.filter((e) => e.msg.t === "q");
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({ key: `${SAMPLE_ISIN}|KRX`, full: true, price: true });
    expect(quotes[0]?.msg).toMatchObject({ t: "q", i: SAMPLE_ISIN, x: "KRX", p: 71_000, snap: true });
    expect(quotes[1]?.msg).toMatchObject({ p: 71_100, snap: false });
    expect(fanout).toHaveLength(0);
  });

  // 옛 ⑨ 는 「팬아웃 대상은 프레임을 보낸 세션의 userId 하나」 였다. 시세는 이제 사용자 데이터가 아니다 —
  // 지키려던 것(T-15-02 · 타인 체결 · 잔고 유출 방어)은 **사용자 데이터** 에 대해 그대로 단언한다.
  it("⑨ 시세는 \"market\"(userId 없음) · 51/66 사용자 데이터는 \"fanout\" userId 하나다 (T-15-02 재정의 · T-26-01)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");

    feed.pushFrame(buildQuoteStateFrame({ snapshot: true }));
    expect(market).toHaveLength(1);
    expect(market[0]).not.toHaveProperty("userId");
    expect(fanout).toHaveLength(0);

    other.pushFrame(buildOrderRespFrame({ noticeType: "E", orderNo: "0000054321" }));
    other.pushFrame(buildAccountStateFrame({ snapshot: true }));

    expect(fanout.map((e) => e.msg.t)).toEqual(["order", "acct"]);
    expect(fanout.every((e) => e.userId === "user-2")).toBe(true);
    // 사용자 데이터는 "market" 으로 새지 않는다 (타입도 막고 경로도 없다).
    expect(market).toHaveLength(1);
    expect(market.every((e) => e.msg.t === "q" || e.msg.t === "tape")).toBe(true);
  });

  it("⑩ ServerMessage(54)는 해석 없이 그대로 흘린다 (D-36)", () => {
    session.pushFrame(
      buildServerMessageFrame({ level: "WARN", message: "세션 정리", kind: "Purge" }),
    );

    const msgs = fanout.map((e) => e.msg).filter((m: RelayOutbound) => m.t === "msg");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ lv: "WARN", m: "세션 정리", kind: "Purge" });
  });

  it("⑪ quote 연결 Ready 이전 구독은 프레임을 보내지 않고 quote ready 에서 복원된다", () => {
    feed.isReady = false;

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.sent).toHaveLength(0);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);

    feed.emitReady();
    expect(feed.sent.map((s) => s.msgType)).toEqual([
      MSG.GetQuoteReq,
      MSG.SubscribeQuoteReq,
      MSG.GetTradeTapeReq,
    ]);
    expect(feed.subscribeReqs().filter((s) => s.subscribe === true)).toHaveLength(1);
    expect(session.quoteReqs()).toHaveLength(0);
  });

  it("⑫ 참조계수 없는 해제는 무시한다 (이중 해제 방어)", () => {
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.sent).toHaveLength(0);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
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

      expect(feed.sent.map((s) => s.msgType)).toEqual([Q, S]);
      expect(feed.sent[1]).toMatchObject({ subscribe: true, level: 1 });
      expect(feed.sent.filter((s) => s.msgType === T)).toHaveLength(0);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");
    });

    it("L2 level 생략은 FULL — 28 → 29(level=0) → 32", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

      expect(feed.sent.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(feed.sent[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L3 PRICE→FULL 승격은 28 → 29(level=0) → 32 를 다시 보낸다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      feed.sent.length = 0;

      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");

      expect(feed.sent.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(feed.sent[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(2);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L4 FULL 이탈로 PRICE 만 남으면 29(level=1) 1건, 마지막 이탈은 linger 만료 뒤 29(false) 1건", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      // 실효 level 이 그대로 full 이라 price 추가는 프레임을 내지 않는다.
      expect(feed.sent.map((s) => s.msgType)).toEqual([Q, S, T]);

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      expect(feed.sent).toHaveLength(4);
      expect(feed.sent[3]).toMatchObject({ msgType: S, subscribe: true, level: 1 });
      expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      expect(feed.sent).toHaveLength(4);
      vi.advanceTimersByTime(LINGER_MS);
      expect(feed.sent).toHaveLength(5);
      expect(feed.sent[4]).toMatchObject({ msgType: S, subscribe: false });
      expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBeUndefined();
    });

    it("L5 FULL 이 남아 있으면 PRICE 이탈은 프레임을 내지 않는다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      const before = feed.sent.length;

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");

      expect(feed.sent).toHaveLength(before);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
      expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
    });

    it("L6 quote ready 의 resubscribeAll 은 키마다 실효 level 로 되건다", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      hub.subscribe("user-1", OTHER_ISIN, "NXT", "full");
      feed.sent.length = 0;

      feed.emitReady();

      const sample = feed.sent.filter((s) => s.isin === SAMPLE_ISIN);
      const other = feed.sent.filter((s) => s.isin === OTHER_ISIN);
      expect(sample.map((s) => s.msgType)).toEqual([Q, S]);
      expect(sample[1]).toMatchObject({ subscribe: true, level: 1 });
      expect(other.map((s) => s.msgType)).toEqual([Q, S, T]);
      expect(other[1]).toMatchObject({ subscribe: true, level: 0 });
      expect(feed.sent.filter((s) => s.msgType === T)).toHaveLength(1);
    });

    it("L7 잡지 않은 level 의 해제는 무시한다 (참조계수 불변)", () => {
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      const before = feed.sent.length;

      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");

      expect(feed.sent).toHaveLength(before);
      expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
    });

    it("L8 quote 연결 Ready 이전 승격·강등은 프레임 없이 기록만 하고 quote ready 가 실효 level 로 복원한다", () => {
      feed.isReady = false;

      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
      hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
      expect(feed.sent).toHaveLength(0);
      expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");

      feed.emitReady();

      const quoteReqs = feed.sent.filter((s) => s.isin === SAMPLE_ISIN);
      expect(quoteReqs.map((s) => s.msgType)).toEqual([Q, S]);
      expect(quoteReqs[1]).toMatchObject({ subscribe: true, level: 1 });
      expect(session.quoteReqs()).toHaveLength(0);
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
          firstFilled: false,
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

  it("firstFilled true 항목이 팬아웃 · 캐시에 true 로 남는다 — dmaUserId 없음 · 남의 계좌 0건 (quick-260930-fi4 · T-fi4-01)", () => {
    session.pushFrame(
      buildQueueProgressFrame({
        items: [
          {
            accountNo: SAMPLE_ACCOUNT_NO,
            dmaUserId: "dma-1",
            orderNo: "41",
            group: 3,
            remainingVolume: 4000,
            progressBp: 9650,
            firstFilled: true,
          },
          { accountNo: OTHER_ACCOUNT, dmaUserId: "dma-9", orderNo: "99999", firstFilled: true },
        ],
      }),
    );

    const frames = progressFrames();
    expect(frames).toHaveLength(1);
    const fanned = frames[0]!.snap === false ? frames[0]!.items : [];
    expect(fanned).toHaveLength(1);
    expect(fanned[0]).toMatchObject({ orderNo: "41", remainingVolume: 4000, progressBp: 9650, firstFilled: true });
    expect(fanned[0]).not.toHaveProperty("dmaUserId");
    expect(JSON.stringify(frames[0])).not.toContain(OTHER_ACCOUNT);

    const entries = hub.getQueueProgressEntries("user-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items).toHaveLength(1);
    expect(entries[0]?.items[0]?.firstFilled).toBe(true);
    expect(entries[0]?.items[0]).not.toHaveProperty("dmaUserId");
    expect(JSON.stringify(entries)).not.toContain(OTHER_ACCOUNT);
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

/**
 * Phase 26 (26-06) — quote 연결과 사용자 세션 사이의 **프레임 경계**. 26-03 트레이서가 코드로 넣고 전용 단언을 남겨 둔 갈래를
 * 여기서 잠근다(PC-12 · T-26-02 · RESEARCH Pattern 2 수신 라우팅 표 · Open Q2 RESOLVED 무시안 · Pattern 10 ①).
 *
 * `unhandledFrameCount() === 0` 단언이 공허하지 않도록 ④ 가 같은 계수기가 살아 있음(명시 case 없는 번호 → 1)도 함께 본다.
 */
describe("SubscriptionHub — quote 연결 프레임 경계 (Phase 26)", () => {
  /** 남의 계좌 — 83 은 시세만 구독한 연결에도 이 항목을 싣고 온다(gh-trade D-19 · MarketPublisher ①). */
  const OTHER_ACCOUNT = "9999999901";

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];
  let market: HubMarketEvent[];
  /** logger.warn 스파이 — 호출 인자만 읽는다. */
  let warn: { mock: { calls: unknown[][] } };

  /** 특정 문구가 든 warn 호출의 첫 인자(구조화 필드)만 모은다. */
  const warnsWith = (needle: string): unknown[] =>
    warn.mock.calls
      .filter((args) => args.some((a) => typeof a === "string" && a.includes(needle)))
      .map((args) => args[0]);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    warn = vi.spyOn(logger, "warn").mockImplementation((() => undefined) as never);
    hub = new SubscriptionHub();
    fanout = [];
    market = [];
    hub.on("fanout", (e) => fanout.push(e));
    hub.on("market", (e) => market.push(e));
    feed = new FakeFeed();
    hub.attachFeed(feed);
    session = new FakeSession("user-1");
    session.allowedAccounts = [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }];
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("① 사용자 세션(Ready)으로 온 58 · 59 · 69 · 71 은 명시 case warn 뒤 무시한다 — market 0 · fanout 0 · 캐시 0 · unhandledFrameCount 0 (PC-12 · D-08)", () => {
    // 키를 잡아 둔 상태에서도 사용자 세션 시세가 전역 캐시 · "market" 으로 새지 않아야 한다(D-03 폴백 없음).
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    const feedSent = feed.sent.length;
    market.length = 0;
    fanout.length = 0;

    session.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    session.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_600n }));
    session.pushFrame(buildTradeTapeFrame({ snapshot: true, entries: tapeEntries(["093015000000"]) }));
    session.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["093016000000"]) }));
    vi.advanceTimersByTime(TAPE_BATCH_MS * 2);

    expect(market).toEqual([]);
    expect(fanout).toEqual([]);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.getTape(SAMPLE_ISIN, "KRX") ?? []).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(warnsWith("사용자 세션에 시세 프레임")).toEqual([
      { userId: "user-1", msgType: MSG.GetQuoteResp },
      { userId: "user-1", msgType: MSG.QuoteUpdate },
      { userId: "user-1", msgType: MSG.TradeTapeResp },
      { userId: "user-1", msgType: MSG.TradeTapePush },
    ]);
    // 무시는 되돌려 보내기도 아니다 — 업스트림 추가 송신 0, 사용자 세션 시세 요청 0.
    expect(feed.sent).toHaveLength(feedSent);
    expect(session.quoteReqs()).toHaveLength(0);
  });

  it("② quote 연결로 온 78(로그인 직후 빈 스냅샷) · 76 은 무시한다 — 사용자 돌파 캐시 불변 · fanout 0 · market 0 · unhandledFrameCount 0 (Open Q2 무시안)", () => {
    session.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN, exchangeTime: "093015000000" }));
    const before = hub.getRateCrossItems("user-1");
    expect(before.map((it) => it.isin)).toEqual([SAMPLE_ISIN]);
    const fanoutBase = fanout.length;

    // 빈 78 을 사용자 경로로 처리했다면 「전량 교체」 로 사용자 캐시가 비었을 것이다.
    feed.pushFrame(buildRateCrossSnapshotFrame([]));
    // 다른 종목 76 을 사용자 경로로 처리했다면 캐시에 한 줄 늘고 rate.cross 가 나갔을 것이다.
    feed.pushFrame(buildRateCrossAlertFrame({ isin: OTHER_ISIN, exchangeTime: "093020000000" }));

    expect(hub.getRateCrossItems("user-1")).toEqual(before);
    expect(fanout).toHaveLength(fanoutBase);
    expect(market).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(feed.sent).toEqual([]);
  });

  it("③ quote 연결로 온 83(남의 계좌 포함)은 무시한다 — 사용자 83 캐시 불변 · fanout 0 · market 0 · unhandledFrameCount 0 (T-26-02 · Pattern 10 ①)", () => {
    // 사용자 세션 ② 경로 — 계좌 필터 뒤 허용 계좌 1건만 캐시된다(25-06).
    session.pushFrame(
      buildQueueProgressFrame({
        items: [
          { accountNo: SAMPLE_ACCOUNT_NO, orderNo: "12453" },
          { accountNo: OTHER_ACCOUNT, orderNo: "99999" },
        ],
      }),
    );
    const before = hub.getQueueProgressEntries("user-1");
    expect(before).toHaveLength(1);
    expect(before[0]?.items.map((it) => it.orderNo)).toEqual(["12453"]);
    const fanoutBase = fanout.length;

    // quote ① 경로 — 같은 키(허용 계좌 새 주문 + 남의 계좌) · 다른 키 · 빈 스냅샷. 어느 것도 사용자 캐시에 닿지 않는다.
    feed.pushFrame(
      buildQueueProgressFrame({
        items: [
          { accountNo: SAMPLE_ACCOUNT_NO, orderNo: "77777" },
          { accountNo: OTHER_ACCOUNT, orderNo: "88888" },
        ],
      }),
    );
    feed.pushFrame(buildQueueProgressFrame({ isin: OTHER_ISIN, items: [{ accountNo: OTHER_ACCOUNT, orderNo: "66666" }] }));
    feed.pushFrame(buildQueueProgressFrame({ items: [] }));

    expect(hub.getQueueProgressEntries("user-1")).toEqual(before);
    expect(fanout).toHaveLength(fanoutBase);
    const leaked = JSON.stringify(fanout.map((e) => e.msg));
    expect(leaked).not.toContain(OTHER_ACCOUNT);
    expect(leaked).not.toContain("77777");
    expect(market).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
  });

  it("④ quote 연결로 온 54 · 77 · 80 은 warn 각 1건 뒤 무시 — unhandledFrameCount 0 · fanout 0, 명시 case 없는 번호만 계수된다", () => {
    feed.pushFrame(buildServerMessageFrame({ level: "WARN", message: "세션 정리", kind: "Purge" }));
    feed.pushFrame(buildQueuedWindowStateFrame({ open: true }));
    feed.pushFrame(buildJournalBatchFrame({ records: [{ seq: 1 }] }));

    expect(warnsWith("quote 연결에 오지 않는 프레임")).toEqual([
      { msgType: MSG.ServerMessage },
      { msgType: MSG.QueuedWindowState },
      { msgType: MSG.JournalBatch },
    ]);
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(fanout).toEqual([]);
    expect(market).toEqual([]);
    expect(hub.getQueuedWindow("user-1")).toBeUndefined();

    // 계수기가 살아 있다 — 명시 case 가 없는 사용자 데이터 번호(51)는 default 로 떨어져 1 이 되고, 팬아웃은 여전히 0.
    feed.pushFrame(buildOrderRespFrame());
    expect(hub.unhandledFrameCount()).toBe(1);
    expect(fanout).toEqual([]);
  });

  it("⑤ feed 미결선 상태의 구독은 참조계수만 기록하고, attachFeed + feed ready 에서 full 28 · 29(0) · 32 · price 28 · 29(1) 로 복원된다", () => {
    const lone = new SubscriptionHub();
    const loneSession = new FakeSession("user-1");
    lone.attach(loneSession);

    lone.subscribe("user-1", SAMPLE_ISIN, "KRX");
    lone.subscribe("user-1", OTHER_ISIN, "KRX", "price");
    expect(lone.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
    expect(lone.refCount(OTHER_ISIN, "KRX")).toBe(1);
    expect(warnsWith("quote 연결 없이 구독")).toHaveLength(2);
    // 사용자 세션이 폴백 송신자가 되지 않는다(D-03).
    expect(loneSession.sent).toEqual([]);

    const late = new FakeFeed();
    late.isReady = false;
    lone.attachFeed(late);
    expect(late.sent).toEqual([]);

    late.emitReady();
    const full = late.sent.filter((s) => s.isin === SAMPLE_ISIN);
    const price = late.sent.filter((s) => s.isin === OTHER_ISIN);
    expect(full.map((s) => s.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);
    expect(full[1]).toMatchObject({ subscribe: true, level: 0 });
    expect(price.map((s) => s.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq]);
    expect(price[1]).toMatchObject({ subscribe: true, level: 1 });
    expect(loneSession.quoteReqs()).toHaveLength(0);
    lone.closeAll();
  });

  it("⑥ 해제(1→0) 후 linger 만료 뒤 늦게 온 59 · 71 은 캐시에 되살아나지 않는다 — getSnapshot 없음 · market 0 (D-10)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(71_500);

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    vi.advanceTimersByTime(LINGER_MS);
    expect(feed.subscribeReqs().at(-1)).toMatchObject({ isin: SAMPLE_ISIN, subscribe: false });
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    market.length = 0;

    // 29(false) 가 서버에 닿기 전 이미 날아오던 틱.
    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_600n }));
    feed.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["093016000000"]) }));

    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.getTape(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(market).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
  });

  it("⑦ attachFeed 같은 객체는 no-op · 다른 객체는 warn 1 뒤 교체 — 옛 feed 의 58 · ready 는 침묵, 새 feed 의 58 은 market 1", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    hub.attachFeed(feed);
    expect(warnsWith("quote 연결 교체")).toHaveLength(0);
    expect(feed.listenerCount("frame")).toBe(1);
    expect(feed.listenerCount("ready")).toBe(1);

    const next = new FakeFeed();
    hub.attachFeed(next);
    expect(warnsWith("quote 연결 교체")).toHaveLength(1);
    // 이미 Ready 인 새 feed 에는 보유 키를 그 자리에서 되건다(26-03 결정) — 지나간 ready 를 기다리지 않는다.
    expect(next.sent.map((s) => s.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);
    market.length = 0;

    const oldSent = feed.sent.length;
    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 70_000n }));
    feed.emitReady();
    expect(market).toEqual([]);
    expect(feed.sent).toHaveLength(oldSent);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();

    next.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_600n }));
    expect(market).toHaveLength(1);
    expect(market[0]?.msg).toMatchObject({ t: "q", i: SAMPLE_ISIN, x: "KRX", p: 71_600 });
    expect(hub.unhandledFrameCount()).toBe(0);
  });
});

describe("PRICE 판정 (D-05 · D-06)", () => {
  /**
   * 서버 PRICE 규칙(gh-trade `MarketPublisher.cpp` · `MarketPublisher.h:159`)의 relay 복제 — FULL 로 업스트림 구독된
   * 키를 PRICE 소켓이 볼 때 가격 섹션(A3 체결 · R8 VI · A6 종가)이 바뀐 59 만 100ms 간격으로 통과시키고, 억제분은
   * 마지막 PRICE 송신 +100ms 에 **그 시점 최신 상태**로 지연 방출한다(유실 없이 지연만). 시간 판정은 `Date.now()`
   * 라 `Date` 까지 가짜로 민다.
   */
  const KEY = `${SAMPLE_ISIN}|KRX`;
  /** 호가(B6)만 바뀐 입력 — 체결 시각 칸(`et`)도 B6 가 덮어쓰므로 같이 바꾼다(Pitfall 4). */
  const BOOK_ONLY = {
    askPrices: [71_100n, 71_200n, 71_300n, 71_400n, 71_500n, 71_600n, 71_700n, 71_800n, 71_900n, 72_000n],
    bidQtys: [999n, 998n, 997n, 996n, 995n, 994n, 993n, 992n, 991n, 990n],
    exchangeTime: "093016000000",
  };

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let market: HubMarketEvent[];

  const quotes = (): HubMarketEvent[] => market.filter((e) => e.msg.t === "q");
  const last = (): HubMarketEvent | undefined => quotes().at(-1);
  const push59 = (input: Parameters<typeof buildQuoteStateFrame>[0] = {}): void =>
    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, ...input }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:30:00.000Z"));
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    market = [];
    hub.on("market", (e) => market.push(e));
    feed = new FakeFeed();
    hub.attachFeed(feed);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  /** full 1 · price 1 로 잡고 58 을 한 번 받은 상태(업스트림 FULL). */
  function mixedWithSnapshot(): void {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX", "price");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true }));
  }

  it("P1 상수는 서버 kPriceLevelMinIntervalMs 와 같은 100ms 다", () => {
    expect(PRICE_MIN_INTERVAL_MS).toBe(100);
  });

  it("P2 samePriceSection — 호가 6칸 · 체결 시각만 다르면 같다 · 가격 섹션 12칸 중 하나라도 다르면 다르다", () => {
    const base = {
      t: "q", i: SAMPLE_ISIN, x: "KRX", snap: false,
      p: 70_950, o: 70_000, h: 71_500, l: 69_800, c: 950, cs: "2", cr: 1.36, v: 1, va: 2,
      ap: [1], aq: [1], bp: [1], bq: [1], ta: 1, tb: 1, ul: 91_000, ll: 49_000, base: 70_000,
      viu: 77_000, vid: 63_000, kc: 0, ls: 5, et: "093015123456",
    } as const;
    const q = { ...base, ap: [...base.ap], aq: [...base.aq], bp: [...base.bp], bq: [...base.bq] };
    expect(samePriceSection(q, { ...q, ap: [2], aq: [2], bp: [2], bq: [2], ta: 9, tb: 9, et: "093016000000" })).toBe(true);
    expect(samePriceSection(q, { ...q, ul: 1, ll: 1, base: 1, ls: 1 })).toBe(true);
    for (const f of ["p", "o", "h", "l", "c", "cr", "v", "va", "viu", "vid", "kc"] as const) {
      expect(samePriceSection(q, { ...q, [f]: q[f] + 1 }), f).toBe(false);
    }
    expect(samePriceSection(q, { ...q, cs: "5" })).toBe(false);
  });

  it("P3 58 은 full · price 모두 통과한다", () => {
    mixedWithSnapshot();

    expect(quotes()).toHaveLength(1);
    expect(last()).toMatchObject({ key: KEY, full: true, price: true });
  });

  it("P4 호가 · 체결 시각만 바뀐 59 는 price 소켓에 가지 않는다 — 타이머도 걸지 않는다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);

    push59(BOOK_ONLY);

    expect(quotes()).toHaveLength(2);
    expect(last()).toMatchObject({ full: true, price: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P5 체결이 바뀐 59(마지막 PRICE 송신 +100ms 이상)는 price 소켓에도 간다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);

    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });

    expect(last()).toMatchObject({ full: true, price: true });
    expect(last()?.msg).toMatchObject({ p: 71_000, v: 12_345_700 });
  });

  it("P6 100ms 안의 체결은 억제되고 pending — 마지막 송신 +100ms 에 그 시점 최신 상태 1건이 price 로만 나간다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    // t0 — 체결 59 통과.
    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });
    expect(last()).toMatchObject({ price: true });

    // t0+60 — 체결 59 억제(pending).
    vi.advanceTimersByTime(60);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n });
    expect(last()).toMatchObject({ full: true, price: false });
    expect(vi.getTimerCount()).toBe(1);

    // t0+80 — 호가만 바뀐 59: 서명은 그대로지만 pending 이라 여전히 억제 · 타이머는 1개 그대로.
    vi.advanceTimersByTime(20);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n, ...BOOK_ONLY });
    expect(last()).toMatchObject({ full: true, price: false });
    const latest = last()?.msg;
    expect(vi.getTimerCount()).toBe(1);
    const before = quotes().length;

    // t0+99 — 아직 아니다.
    vi.advanceTimersByTime(19);
    expect(quotes()).toHaveLength(before);

    // t0+100 — 지연 방출 1건: full 소켓은 이미 받았으므로 full:false · 본문은 t0+80 의 최신 상태.
    vi.advanceTimersByTime(1);
    expect(quotes()).toHaveLength(before + 1);
    expect(last()).toMatchObject({ key: KEY, full: false, price: true });
    expect(last()?.msg).toEqual(latest);
    expect(vi.getTimerCount()).toBe(0);

    // 방출 직후 같은 서명의 59 는 다시 억제되지 않고 그냥 거짓이다(pending 해제).
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n, ...BOOK_ONLY });
    expect(last()).toMatchObject({ full: true, price: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P7 VI 발동예상가만 · KRX 종가만 바뀐 59 도 가격 섹션이라 통과한다(간격 충족 시)", () => {
    mixedWithSnapshot();

    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ viUpPrice: 78_000n });
    expect(last()).toMatchObject({ full: true, price: true });

    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ viUpPrice: 78_000n, krxClosePrice: 70_950n });
    expect(last()).toMatchObject({ full: true, price: true });
  });

  it("P8 업스트림 실효 level 이 PRICE 인 키는 판정하지 않는다 — 서버가 이미 걸렀으니 호가만 바뀐 59 도 통과", () => {
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX", "price");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true }));

    push59(BOOK_ONLY);

    expect(last()).toMatchObject({ full: true, price: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P9 price 참조 0 인 키(FULL 전용)는 59 가 price:false 이고 타이머를 걸지 않는다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true }));

    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });

    expect(last()).toMatchObject({ full: true, price: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P10 pending 중 FULL→PRICE 강등이면 예약된 지연 방출은 0건이다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });
    vi.advanceTimersByTime(30);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n });
    expect(vi.getTimerCount()).toBe(1);
    const before = market.length;

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS * 3);

    expect(market).toHaveLength(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P11 pending 중 1→0 해제면 예약된 지연 방출은 0건이다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });
    vi.advanceTimersByTime(30);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n });
    expect(vi.getTimerCount()).toBe(1);
    const before = market.length;

    hub.unsubscribe("user-2", SAMPLE_ISIN, "KRX", "price");
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS * 3);

    expect(market).toHaveLength(before);
    // 남은 타이머는 linger(D-10) 만료 1개뿐이다 — PRICE 지연 방출은 1→0 에서 지워졌다.
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(LINGER_MS);
    expect(market).toHaveLength(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P12 pending 중 price 소비자만 빠지면(FULL 은 남음) 예약된 지연 방출은 0건이다", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });
    vi.advanceTimersByTime(30);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n });
    const before = market.length;

    hub.unsubscribe("user-2", SAMPLE_ISIN, "KRX", "price");
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS * 3);

    expect(market).toHaveLength(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("P13 58 이 pending 을 덮는다 — 스냅샷이 최신 상태를 이미 실었으니 지연 방출 0건", () => {
    mixedWithSnapshot();
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS);
    push59({ lastPrice: 71_000n, cumVolume: 12_345_700n });
    vi.advanceTimersByTime(30);
    push59({ lastPrice: 71_100n, cumVolume: 12_345_800n });
    expect(vi.getTimerCount()).toBe(1);

    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_200n }));
    expect(last()).toMatchObject({ full: true, price: true });
    const before = market.length;
    vi.advanceTimersByTime(PRICE_MIN_INTERVAL_MS * 3);

    expect(market).toHaveLength(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("linger (D-10)", () => {
  /**
   * 마지막 소비자가 떠난 키는 `LINGER_MS`(15초) 동안 업스트림 구독 · 전역 캐시를 유지하다 해제한다(D-10 · RESEARCH A3).
   * 탭 전환 · 새로고침으로 같은 종목이 돌아오면 28 · 29 · 32 재요청 없이 캐시로 그린다. 만료 = 29(false) + 캐시 · PRICE
   * 게이트 삭제. quote 연결 재접속(ready)에서는 linger 키를 되걸지 않고 정리한다(소비자가 없다).
   */
  const Q = MSG.GetQuoteReq;
  const S = MSG.SubscribeQuoteReq;
  const T = MSG.GetTradeTapeReq;

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let market: HubMarketEvent[];

  const releases = (): SentReq[] => feed.subscribeReqs().filter((s) => s.subscribe === false);

  function makeHub(opts?: { lingerMs?: number }): void {
    hub = new SubscriptionHub(opts);
    market = [];
    hub.on("market", (e) => market.push(e));
    feed = new FakeFeed();
    hub.attachFeed(feed);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:30:00.000Z"));
    resetDroppedEnvelopeCount();
    makeHub();
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  it("LG1 상수는 15초다 (D-10 재량 10~30초 · RESEARCH A3)", () => {
    expect(LINGER_MS).toBe(15_000);
  });

  it("LG2 1→0 은 29(false) 를 미루고 캐시를 유지한다 — LINGER_MS 뒤 29(false) 1건 · 캐시 삭제 · lingerCount 0", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    feed.pushFrame(buildTradeTapeFrame({ snapshot: true, entries: tapeEntries(["093015000000"]) }));

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(releases()).toHaveLength(0);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
    expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(true);
    expect(hub.stats()).toMatchObject({ lingerCount: 1, subscriptionCount: 0, cachedQuoteCount: 1 });
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(71_500);
    expect(hub.getTape(SAMPLE_ISIN, "KRX")).toHaveLength(1);

    vi.advanceTimersByTime(LINGER_MS - 1);
    expect(releases()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(releases()).toHaveLength(1);
    expect(releases()[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX" });
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);
    expect(hub.stats()).toMatchObject({ lingerCount: 0, subscriptionCount: 0, cachedQuoteCount: 0 });
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.getTape(SAMPLE_ISIN, "KRX")).toBeUndefined();
  });

  it("LG3 linger 중 같은 level 재구독은 28 · 29 · 32 0건 · 캐시 그대로 · 만료 타이머 취소(LINGER_MS 뒤에도 29(false) 0)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    vi.advanceTimersByTime(5_000);
    const before = feed.sent.length;

    // 새로고침 — 같은 사용자의 복귀는 이 세션에서 본 키라 넛지도 없다(26-11). 다른 사용자의 첫 참조는 29 넛지 1건이다
    // — 「잔량진행률 넛지 (Pattern 10)」 N4.
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(feed.sent).toHaveLength(before);
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);
    expect(hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
    expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(71_500);
    expect(hub.stats()).toMatchObject({ lingerCount: 0, subscriptionCount: 1 });

    vi.advanceTimersByTime(LINGER_MS * 2);
    expect(feed.sent).toHaveLength(before);
    expect(releases()).toHaveLength(0);
  });

  it("LG4 FULL 로 linger 중 price 재구독은 강등 29(level=1) 1건만 보낸다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "full");
    const before = feed.sent.length;

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");

    expect(feed.sent.slice(before).map((s) => s.msgType)).toEqual([S]);
    expect(feed.sent.at(-1)).toMatchObject({ subscribe: true, level: 1 });
    expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");
  });

  it("LG5 PRICE 로 linger 중 full 재구독은 승격 28 → 29(level=0) → 32 를 보낸다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "price");
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX", "price");
    const before = feed.sent.length;

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX", "full");

    expect(feed.sent.slice(before).map((s) => s.msgType)).toEqual([Q, S, T]);
    expect(feed.sent[before + 1]).toMatchObject({ subscribe: true, level: 0 });
    expect(hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
  });

  it("LG6 lingerMs 0 이면 1→0 즉시 29(false) · 캐시 삭제 (26-03 동작 · e2e 격리)", () => {
    hub.closeAll();
    makeHub({ lingerMs: 0 });
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");

    expect(releases()).toHaveLength(1);
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.stats()).toMatchObject({ lingerCount: 0, subscriptionCount: 0, cachedQuoteCount: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("LG7 linger 중 quote 연결 ready 는 그 키를 되걸지 않고 정리한다(29 0 · 캐시 삭제) — live 키만 재구독", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", OTHER_ISIN, "NXT");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(hub.stats()).toMatchObject({ lingerCount: 1, subscriptionCount: 1 });
    feed.sent.length = 0;

    feed.emitReady();

    expect(feed.sent.filter((s) => s.isin === SAMPLE_ISIN)).toEqual([]);
    expect(feed.sent.filter((s) => s.isin === OTHER_ISIN).map((s) => s.msgType)).toEqual([Q, S, T]);
    expect(hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);
    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.stats()).toMatchObject({ lingerCount: 0, subscriptionCount: 1 });
    // 만료 타이머도 같이 꺼졌다 — 뒤늦은 29(false) 가 새 연결로 나가지 않는다.
    vi.advanceTimersByTime(LINGER_MS);
    expect(releases()).toHaveLength(0);
  });

  it("LG8 linger 중 59 는 캐시를 갱신한다(서버는 아직 구독 중) — 업스트림 송신 0 · price 플래그 거짓", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    const before = feed.sent.length;
    market.length = 0;

    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_600n }));

    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")?.p).toBe(71_600);
    expect(feed.sent).toHaveLength(before);
    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({ full: true, price: false });
  });

  it("LG9 linger 만료 뒤 늦게 온 59 · 71 은 캐시에 되살아나지 않는다 (26-06 ⑥ 승계)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    feed.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 71_500n }));
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    vi.advanceTimersByTime(LINGER_MS);
    expect(releases()).toHaveLength(1);
    market.length = 0;

    feed.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_600n }));
    feed.pushFrame(buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["093016000000"]) }));

    expect(hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(hub.getTape(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(market).toEqual([]);
  });

  it("LG10 linger 타이머는 키당 1개이고 closeAll 이 전부 끈다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", OTHER_ISIN, "NXT");
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.unsubscribe("user-1", OTHER_ISIN, "NXT");
    expect(hub.stats().lingerCount).toBe(2);
    expect(vi.getTimerCount()).toBe(2);

    hub.closeAll();

    expect(vi.getTimerCount()).toBe(0);
    expect(hub.stats().lingerCount).toBe(0);
  });
});

describe("구독 한도 (D-11 · D-15)", () => {
  /**
   * quote 연결 하나가 업스트림 2000 키(gh-trade `kMaxObserverSubsPerConn`)를 모든 사용자와 나눠 쓴다. 서버는 초과 구독을
   * **조용히** 무시하므로(RESEARCH Pitfall 5) relay 가 업스트림 송신 **전에** 막는다(D-11). 자리를 만들 때는 가장 오래
   * linger 한 키부터 29(false) 로 푼다. 한 사용자(모든 탭 합산)는 서로 다른 키 200 개까지다(D-15 — 종전 서버 세션당 200).
   * 거부는 상태를 바꾸지 않는다 — 참조계수 · 업스트림 송신 0 · `subLimitRejects` +1 · warn 1건.
   */
  const Q = MSG.GetQuoteReq;
  const S = MSG.SubscribeQuoteReq;
  const T = MSG.GetTradeTapeReq;

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let warn: { mock: { calls: unknown[][] } };

  /** 합성 ISIN — `KR7` + 0 채움 숫자 9자리(12자). */
  const isinOf = (n: number): string => `KR7${String(n).padStart(9, "0")}`;

  /** 「구독 한도」 warn 의 구조화 필드만 모은다. */
  const limitWarns = (): unknown[] =>
    warn.mock.calls
      .filter((args) => args.some((a) => typeof a === "string" && a.includes("구독 한도")))
      .map((args) => args[0]);

  function makeHub(opts?: ConstructorParameters<typeof SubscriptionHub>[0]): void {
    hub = new SubscriptionHub(opts);
    feed = new FakeFeed();
    hub.attachFeed(feed);
  }

  /** 사용자 u0..u9 가 서로 다른 키 200 개씩 = 전역 2000 키. */
  function fillGlobal(): void {
    for (let u = 0; u < 10; u += 1) {
      for (let k = 0; k < USER_SUB_LIMIT; k += 1) {
        expect(hub.subscribe(`u${u}`, isinOf(u * USER_SUB_LIMIT + k), "KRX")).toBe("ok");
      }
    }
  }

  /**
   * 26-10 페이싱 — 구독 요청은 in-flight 창(32 키)을 거친다. 응답을 주입하지 않으므로 타임아웃(3초)마다 창 하나씩 나간다.
   * 송신이 더 늘지 않을 때까지 가짜 시계를 돌려 대기열을 비운다 — 한도 판정의 결론은 페이싱과 무관해야 한다.
   */
  function drainPacer(): void {
    for (;;) {
      const n = feed.sent.length;
      vi.advanceTimersByTime(PACER_TIMEOUT_MS);
      if (feed.sent.length === n) return;
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:30:00.000Z"));
    resetDroppedEnvelopeCount();
    // 2000 키 구독의 info 로그는 테스트 출력만 어지럽힌다.
    vi.spyOn(logger, "info").mockImplementation((() => undefined) as never);
    warn = vi.spyOn(logger, "warn").mockImplementation((() => undefined) as never);
    makeHub();
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("HL1 상수는 서버 원문 복제다 — 전역 2000(kMaxObserverSubsPerConn) · 사용자 200(kMaxSubsPerConn)", () => {
    expect(QUOTE_SUB_LIMIT).toBe(2000);
    expect(USER_SUB_LIMIT).toBe(200);
  });

  it("HL2 전역 2000 에서 새 사용자의 새 키는 limit-global — 28/29/32 0건 · subLimitRejects 1 · warn 1 · 기존 키 불변", () => {
    fillGlobal();
    drainPacer();
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT, lingerCount: 0, subLimitRejects: 0 });
    const before = feed.sent.length;
    expect(before).toBe(QUOTE_SUB_LIMIT * 3);
    expect(feed.subscribeReqs()).toHaveLength(QUOTE_SUB_LIMIT); // 29 누적 2000 — 페이싱 뒤에도 키마다 1건

    expect(hub.subscribe("u10", isinOf(9_999), "KRX")).toBe("limit-global");

    expect(feed.sent).toHaveLength(before);
    expect(hub.refCount(isinOf(9_999), "KRX")).toBe(0);
    expect(hub.subscriptionLevel(isinOf(9_999), "KRX")).toBeUndefined();
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT, subLimitRejects: 1 });
    expect(limitWarns()).toEqual([
      { userId: "u10", isin: isinOf(9_999), exchange: "KRX", scope: "global", limit: QUOTE_SUB_LIMIT },
    ]);
    for (const n of [0, 1_000, 1_999]) expect(hub.refCount(isinOf(n), "KRX")).toBe(1);

    // 이미 업스트림에 있는 키의 추가 구독은 전역 한도와 무관하다(새 업스트림 키가 아니다).
    expect(hub.subscribe("u10", isinOf(0), "KRX")).toBe("ok");
    expect(hub.refCount(isinOf(0), "KRX")).toBe(2);
    expect(feed.sent).toHaveLength(before);
  });

  it("HL3 전역 2000 이 linger 키를 포함하면 가장 오래 linger 한 키를 29(false) 로 먼저 풀고 새 키를 받는다", () => {
    fillGlobal();
    drainPacer();
    hub.unsubscribe("u0", isinOf(0), "KRX");
    vi.advanceTimersByTime(1_000);
    hub.unsubscribe("u0", isinOf(1), "KRX");
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT - 2, lingerCount: 2 });
    const before = feed.sent.length;

    expect(hub.subscribe("u10", isinOf(9_000), "KRX")).toBe("ok");

    const sent = feed.sent.slice(before);
    expect(sent.map((s) => [s.msgType, s.isin, s.subscribe])).toEqual([
      [S, isinOf(0), false],
      [Q, isinOf(9_000), null],
      [S, isinOf(9_000), true],
      [T, isinOf(9_000), null],
    ]);
    expect(hub.isLingering(isinOf(0), "KRX")).toBe(false);
    expect(hub.isLingering(isinOf(1), "KRX")).toBe(true);
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT - 1, lingerCount: 1, subLimitRejects: 0 });

    // 남은 linger 키 하나도 같은 규칙 — 다 풀리면 lingerCount 0.
    expect(hub.subscribe("u10", isinOf(9_001), "KRX")).toBe("ok");
    expect(feed.sent.slice(before + 4)[0]).toMatchObject({ msgType: S, isin: isinOf(1), subscribe: false });
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT, lingerCount: 0 });

    // linger 키가 없으면 거부 — 기존 live 키를 축출하지 않는다(LRU 없음).
    expect(hub.subscribe("u10", isinOf(9_002), "KRX")).toBe("limit-global");
    expect(hub.stats()).toMatchObject({ subscriptionCount: QUOTE_SUB_LIMIT, subLimitRejects: 1 });

    // 풀린 linger 키의 옛 만료 타이머는 침묵한다 — 29(false) 추가 0건.
    const after = feed.sent.length;
    vi.advanceTimersByTime(LINGER_MS * 2);
    expect(feed.sent).toHaveLength(after);
  });

  it("HL4 한 사용자의 201번째 새 키는 limit-user — 다른 사용자의 새 키 · 그 사용자의 기존 키 추가 탭은 ok", () => {
    for (let k = 0; k < USER_SUB_LIMIT; k += 1) expect(hub.subscribe("A", isinOf(k), "KRX")).toBe("ok");
    const before = feed.sent.length;

    expect(hub.subscribe("A", isinOf(500), "KRX")).toBe("limit-user");
    expect(feed.sent).toHaveLength(before);
    expect(hub.refCount(isinOf(500), "KRX")).toBe(0);
    expect(limitWarns()).toEqual([
      { userId: "A", isin: isinOf(500), exchange: "KRX", scope: "user", limit: USER_SUB_LIMIT },
    ]);

    // 같은 순간 다른 사용자는 새 키를 연다.
    expect(hub.subscribe("B", isinOf(500), "KRX")).toBe("ok");
    expect(hub.refCount(isinOf(500), "KRX")).toBe(1);

    // A 가 이미 가진 키를 두 번째 탭(다른 level 포함)으로 — 사용자 키 수 불변.
    expect(hub.subscribe("A", isinOf(0), "KRX")).toBe("ok");
    expect(hub.subscribe("A", isinOf(1), "KRX", "price")).toBe("ok");
    expect(hub.refCount(isinOf(0), "KRX")).toBe(2);

    // B 가 이미 연 키라도 A 에게는 새 키 — 여전히 limit-user.
    expect(hub.subscribe("A", isinOf(500), "KRX")).toBe("limit-user");
    expect(hub.stats().subLimitRejects).toBe(2);
  });

  it("HL5 사용자가 키 하나를 끝까지 해제하면(그 사용자 참조 0) 사용자 키 수가 199 로 줄어 새 키를 받는다", () => {
    for (let k = 0; k < USER_SUB_LIMIT; k += 1) hub.subscribe("A", isinOf(k), "KRX");
    hub.subscribe("A", isinOf(0), "KRX"); // 두 번째 탭

    hub.unsubscribe("A", isinOf(0), "KRX");
    expect(hub.subscribe("A", isinOf(700), "KRX")).toBe("limit-user"); // 탭 하나가 남아 아직 200

    hub.unsubscribe("A", isinOf(0), "KRX");
    expect(hub.subscribe("A", isinOf(700), "KRX")).toBe("ok");
    expect(hub.refCount(isinOf(700), "KRX")).toBe(1);
    expect(hub.subscribe("A", isinOf(701), "KRX")).toBe("limit-user");
  });

  it("HL6 생성자 limits 주입이 두 한도를 바꾼다 — { global: 3, user: 2 }", () => {
    hub.closeAll();
    makeHub({ limits: { global: 3, user: 2 } });

    expect(hub.subscribe("u1", isinOf(1), "KRX")).toBe("ok");
    expect(hub.subscribe("u1", isinOf(2), "NXT")).toBe("ok");
    expect(hub.subscribe("u1", isinOf(3), "KRX")).toBe("limit-user");
    expect(hub.subscribe("u2", isinOf(3), "KRX")).toBe("ok");
    expect(hub.subscribe("u3", isinOf(4), "KRX")).toBe("limit-global");
    // 같은 ISIN 이라도 거래소가 다르면 다른 키다.
    expect(hub.subscribe("u3", isinOf(2), "KRX")).toBe("limit-global");
    expect(hub.subscribe("u3", isinOf(2), "NXT")).toBe("ok");
    expect(hub.stats()).toMatchObject({ subscriptionCount: 3, subLimitRejects: 3 });
    expect(limitWarns().map((w) => (w as { scope: string; limit: number }))).toEqual([
      expect.objectContaining({ scope: "user", limit: 2 }),
      expect.objectContaining({ scope: "global", limit: 3 }),
      expect.objectContaining({ scope: "global", limit: 3 }),
    ]);
  });

  it("HL7 거부된 키는 상태를 남기지 않는다 — 그 키 해제는 「참조계수 없는 해제」 warn 뒤 무시 · closeAll 이 사용자 계수를 비운다", () => {
    hub.closeAll();
    makeHub({ limits: { global: 3, user: 1 } });
    expect(hub.subscribe("A", isinOf(1), "KRX")).toBe("ok");
    expect(hub.subscribe("A", isinOf(2), "KRX")).toBe("limit-user");

    hub.unsubscribe("A", isinOf(2), "KRX");
    expect(
      warn.mock.calls.filter((args) => args.some((a) => typeof a === "string" && a.includes("참조계수 없는 해제"))),
    ).toHaveLength(1);
    expect(hub.refCount(isinOf(1), "KRX")).toBe(1);

    hub.closeAll();
    hub.attachFeed(feed);
    expect(hub.subscribe("A", isinOf(2), "KRX")).toBe("ok");
  });
});

describe("합집합 재구독 페이싱 (Pitfall 3)", () => {
  /**
   * 26-10 — quote 연결 하나가 사용자 전원의 키를 지므로, 재접속 뒤 합집합(최대 2000 키)을 한꺼번에 쏘면 58 · 69 Notice 가
   * 서버 연결 송신 큐(1024 프레임 / 4MB · Gateway.h:72-73)를 넘겨 끊김 → 재접속 → 같은 burst 루프가 된다. hub 의 구독 요청은
   * 언제나 in-flight 창(`PACER_WINDOW` 키)을 거친다 — 그 키의 응답(FULL=69 · PRICE=58)이나 `PACER_TIMEOUT_MS` 가 지나야
   * 다음 키가 나간다. 응답이 없는 29(해제 · 강등)는 창 밖이다. 재구독 시작 · 완료는 로그 1줄씩(키 수 · 소요 ms · 타임아웃 수).
   */
  const Q = MSG.GetQuoteReq;
  const S = MSG.SubscribeQuoteReq;
  const T = MSG.GetTradeTapeReq;

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let info: { mock: { calls: unknown[][] } };

  /** 합성 ISIN — `KR7` + 0 채움 숫자 9자리(12자 · 파서 ISIN 검증 통과). */
  const isinOf = (n: number): string => `KR7${String(n).padStart(9, "0")}`;
  const quoteReqs = (): SentReq[] => feed.sent.filter((s) => s.msgType === Q);
  /** 메시지 문자열에 `needle` 을 담은 info 로그의 구조화 필드. */
  const logsOf = (needle: string): unknown[] =>
    info.mock.calls
      .filter((args) => args.some((a) => typeof a === "string" && a.includes(needle)))
      .map((args) => args[0]);
  /** 게이트웨이 응답 58(GetQuoteResp) · 69(TradeTapeResp) 주입. */
  const push58 = (n: number): void => feed.pushFrame(buildQuoteStateFrame({ isin: isinOf(n) }));
  const push69 = (n: number): void => feed.pushFrame(buildTradeTapeFrame({ isin: isinOf(n) }));

  function makeHub(opts?: ConstructorParameters<typeof SubscriptionHub>[0]): void {
    hub = new SubscriptionHub(opts);
    feed = new FakeFeed();
    hub.attachFeed(feed);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:30:00.000Z"));
    resetDroppedEnvelopeCount();
    info = vi.spyOn(logger, "info").mockImplementation((() => undefined) as never);
    vi.spyOn(logger, "warn").mockImplementation((() => undefined) as never);
    makeHub();
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("PH1 키 100 개 보유 상태에서 quote ready → 28 은 32 개만 · 69 응답 · 타임아웃에 따라 늘고 · 시작/완료 로그 1줄씩", () => {
    feed.isReady = false;
    for (let n = 0; n < 100; n += 1) hub.subscribe("u1", isinOf(n), "KRX");
    expect(feed.sent).toHaveLength(0);

    feed.emitReady();
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);
    expect(feed.sent).toHaveLength(PACER_WINDOW * 3);
    expect(logsOf("합집합 재구독 시작")).toEqual([{ keys: 100, lingerReleased: 0 }]);

    // FULL 키는 58 로는 슬롯이 안 풀린다 — 69 가 와야 33번째 키가 나간다.
    push58(0);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);
    push69(0);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
    expect(feed.sent.slice(-3).map((s) => [s.msgType, s.isin, s.level])).toEqual([
      [Q, isinOf(PACER_WINDOW), null],
      [S, isinOf(PACER_WINDOW), 0],
      [T, isinOf(PACER_WINDOW), null],
    ]);

    // 응답이 없으면 3초마다 창 하나 — 33 → 65 → 97 → 100.
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW * 2 + 1);
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW * 3 + 1);
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(quoteReqs()).toHaveLength(100);
    expect(logsOf("합집합 재구독 완료")).toEqual([]);

    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(logsOf("합집합 재구독 완료")).toEqual([{ keys: 100, elapsedMs: PACER_TIMEOUT_MS * 4, timeouts: 99 }]);
    // 키마다 29 정확히 1건 — 중복 · 누락 0.
    expect(feed.subscribeReqs().map((s) => s.isin)).toEqual(Array.from({ length: 100 }, (_, n) => isinOf(n)));
  });

  it("PH2 평시 0→1 도 같은 창을 거친다 — PRICE 키는 58 에 · FULL 키는 69 에 다음 키가 나가고, 재구독 로그는 없다", () => {
    for (let n = 0; n < PACER_WINDOW - 1; n += 1) hub.subscribe("u1", isinOf(n), "KRX");
    hub.subscribe("u1", isinOf(PACER_WINDOW - 1), "KRX", "price");
    hub.subscribe("u1", isinOf(PACER_WINDOW), "KRX");
    hub.subscribe("u1", isinOf(PACER_WINDOW + 1), "KRX");
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);

    push58(PACER_WINDOW - 1); // PRICE 키 — 58 에 풀린다
    expect(quoteReqs().map((s) => s.isin).at(-1)).toBe(isinOf(PACER_WINDOW));
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);

    push58(0); // FULL 키 — 58 로는 안 풀린다
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
    push69(0);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 2);

    expect(logsOf("합집합 재구독")).toEqual([]);
  });

  it("PH3 대기 중 키의 해제는 프레임 0 · 대기 중 강등은 level 만 · in-flight 키의 해제는 29(false) 즉시 + 슬롯 반환", () => {
    hub.closeAll();
    makeHub({ lingerMs: 0 });
    for (let n = 0; n < PACER_WINDOW; n += 1) hub.subscribe("u1", isinOf(n), "KRX");
    hub.subscribe("u1", isinOf(40), "KRX");
    hub.subscribe("u2", isinOf(40), "KRX", "price");
    hub.subscribe("u1", isinOf(41), "KRX");
    const before = feed.sent.length;
    expect(before).toBe(PACER_WINDOW * 3);

    hub.unsubscribe("u1", isinOf(41), "KRX"); // 1→0 (linger 0) — 대기 중이라 29(false) 도 없다
    hub.unsubscribe("u1", isinOf(40), "KRX"); // FULL→PRICE 강등 — 대기 중이라 29(1) 도 없다
    expect(feed.sent).toHaveLength(before);

    hub.unsubscribe("u1", isinOf(0), "KRX"); // in-flight 키 해제 — 29(false) 즉시, 풀린 슬롯으로 40 이 PRICE 로 나간다
    expect(feed.sent.slice(before).map((s) => [s.msgType, s.isin, s.subscribe, s.level])).toEqual([
      [S, isinOf(0), false, 0],
      [Q, isinOf(40), null, null],
      [S, isinOf(40), true, 1],
    ]);

    vi.advanceTimersByTime(PACER_TIMEOUT_MS * 3);
    expect(feed.sent.filter((s) => s.isin === isinOf(41))).toEqual([]);
    expect(feed.sent.filter((s) => s.isin === isinOf(40))).toHaveLength(2);
  });

  it("PH4 재구독 도중 다시 끊겼다 붙으면 옛 창 · 대기열을 버리고 새 연결에 처음부터 32 키씩 — 중단 로그 1 · 완료 로그 1", () => {
    feed.isReady = false;
    for (let n = 0; n < 50; n += 1) hub.subscribe("u1", isinOf(n), "KRX");
    feed.emitReady();
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);

    // 끊김 — 준비되지 않은 동안 타임아웃이 슬롯을 풀어도 아무것도 나가지 않는다.
    feed.isReady = false;
    const mark = feed.sent.length;
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(feed.sent).toHaveLength(mark);

    feed.emitReady();
    const fresh = feed.sent.slice(mark).filter((s) => s.msgType === Q);
    expect(fresh).toHaveLength(PACER_WINDOW);
    expect(fresh[0]?.isin).toBe(isinOf(0)); // 새 연결엔 구독이 없다 — 합집합 처음부터
    expect(logsOf("합집합 재구독 시작")).toHaveLength(2);
    expect(logsOf("합집합 재구독 중단")).toEqual([
      { keys: 50, elapsedMs: PACER_TIMEOUT_MS, timeouts: PACER_WINDOW, queued: 50 - PACER_WINDOW, inFlight: 0 },
    ]);

    vi.advanceTimersByTime(PACER_TIMEOUT_MS * 2);
    expect(feed.sent.slice(mark).filter((s) => s.msgType === Q)).toHaveLength(50);
    expect(logsOf("합집합 재구독 완료")).toEqual([{ keys: 50, elapsedMs: PACER_TIMEOUT_MS * 2, timeouts: 50 }]);
  });

  it("PH5 closeAll 이 페이서를 비운다 — 대기 · in-flight 타이머가 뒤늦게 아무것도 보내지 않는다", () => {
    for (let n = 0; n < PACER_WINDOW + 8; n += 1) hub.subscribe("u1", isinOf(n), "KRX");
    const mark = feed.sent.length;
    hub.closeAll();
    vi.advanceTimersByTime(PACER_TIMEOUT_MS * 5);
    expect(feed.sent).toHaveLength(mark);
  });
});

describe("잔량진행률 넛지 (Pattern 10)", () => {
  /**
   * 26-11 — 서버는 83 을 「구독 연결 ① ∪ 계좌를 선언한 세션 ②」 로 보낸다(MarketPublisher.cpp:771-779). 조용한 키(체결 없는
   * 상한가)는 dirty 가 서지 않아 83 이 29 성립 때만 다시 나간다(`RequestResend` · :1487 · :1507 · d43). 사용자 세션이 더는
   * 29 를 보내지 않으므로, 어떤 사용자가 **이 세션에서 처음** 참조하는 키가 이미 업스트림(live 또는 linger)이면 hub 가 quote
   * 연결로 같은 실효 level 의 29(subscribe=true) 1건 — 넛지 — 를 보낸다(28/32 없음). 사용자 세션이 Ready 로 (재)진입하면
   * 그 사용자가 쥔(참조 > 0) 키마다 같은 넛지를 보낸다. 같은 사용자의 복귀(탭 전환 · 새로고침)는 넛지 0 이다(D-10).
   * 「본 키」 기억은 키가 업스트림에서 완전히 풀리거나 그 사용자의 DMA 세션이 교체될 때 지워진다.
   */
  const Q = MSG.GetQuoteReq;
  const S = MSG.SubscribeQuoteReq;
  const T = MSG.GetTradeTapeReq;

  let hub: SubscriptionHub;
  let feed: FakeFeed;
  let sessions: Map<string, FakeSession>;

  /** 합성 ISIN — `KR7` + 0 채움 숫자 9자리(12자). */
  const isinOf = (n: number): string => `KR7${String(n).padStart(9, "0")}`;
  const K = SAMPLE_ISIN;
  /** `from` 이후 quote 연결로 나간 프레임 [msgType, isin, subscribe, level]. */
  const sentSince = (from: number): Array<[number, string, boolean | null, number | null]> =>
    feed.sent.slice(from).map((s) => [s.msgType, s.isin, s.subscribe, s.level]);

  function attachUser(userId: string): FakeSession {
    const s = new FakeSession(userId);
    hub.attach(s);
    sessions.set(userId, s);
    return s;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:30:00.000Z"));
    resetDroppedEnvelopeCount();
    vi.spyOn(logger, "info").mockImplementation((() => undefined) as never);
    hub = new SubscriptionHub();
    feed = new FakeFeed();
    hub.attachFeed(feed);
    sessions = new Map();
    for (const u of ["A", "B", "C"]) attachUser(u);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("N1 A 가 K(full) 를 연 뒤 B 가 K 를 처음 열면 29(true · level 0) 정확히 1건 — 28 · 32 추가 0 · 사용자 세션 0", () => {
    hub.subscribe("A", K, "KRX");
    expect(sentSince(0).map((f) => f[0])).toEqual([Q, S, T]);
    const before = feed.sent.length;

    expect(hub.subscribe("B", K, "KRX")).toBe("ok");
    expect(sentSince(before)).toEqual([[S, K, true, 0]]);
    for (const s of sessions.values()) expect(s.quoteReqs()).toHaveLength(0);
  });

  it("N2 B 의 두 번째 탭은 넛지 0 이다", () => {
    hub.subscribe("A", K, "KRX");
    hub.subscribe("B", K, "KRX");
    const before = feed.sent.length;

    hub.subscribe("B", K, "KRX");
    expect(sentSince(before)).toEqual([]);
  });

  it("N3 B 가 K 를 모두 닫았다가(참조 0 · A 가 쥐고 live) 다시 열면 넛지 0 — 이 세션에서 본 키 (D-10)", () => {
    hub.subscribe("A", K, "KRX");
    hub.subscribe("B", K, "KRX");
    hub.subscribe("B", K, "KRX");
    hub.unsubscribe("B", K, "KRX");
    hub.unsubscribe("B", K, "KRX");
    const before = feed.sent.length;

    expect(hub.subscribe("B", K, "KRX")).toBe("ok");
    expect(sentSince(before)).toEqual([]);
  });

  it("N4 A · B 가 모두 떠나 K 가 linger 일 때 새 사용자 C 가 열면 linger 취소 · 29(level 0) 넛지 1건 · 28/32 0", () => {
    hub.subscribe("A", K, "KRX");
    hub.subscribe("B", K, "KRX");
    hub.unsubscribe("A", K, "KRX");
    hub.unsubscribe("B", K, "KRX");
    expect(hub.isLingering(K, "KRX")).toBe(true);
    const before = feed.sent.length;

    hub.subscribe("C", K, "KRX");
    expect(hub.isLingering(K, "KRX")).toBe(false);
    expect(sentSince(before)).toEqual([[S, K, true, 0]]);

    // A 는 이 세션에서 K 를 봤다 — linger 뒤가 아니어도 복귀는 넛지 0.
    const mark = feed.sent.length;
    hub.subscribe("A", K, "KRX");
    expect(sentSince(mark)).toEqual([]);
  });

  it("N5 PRICE 로만 구독된 키의 넛지는 29(level 1) · full 이 섞이면 실효 level(0)이다", () => {
    hub.subscribe("A", K, "KRX", "price");
    expect(sentSince(0)).toEqual([
      [Q, K, null, null],
      [S, K, true, 1],
    ]);
    let before = feed.sent.length;
    hub.subscribe("B", K, "KRX", "price");
    expect(sentSince(before)).toEqual([[S, K, true, 1]]);

    hub.subscribe("A", OTHER_ISIN, "KRX", "full");
    before = feed.sent.length;
    hub.subscribe("C", OTHER_ISIN, "KRX", "price");
    expect(sentSince(before)).toEqual([[S, OTHER_ISIN, true, 0]]);
  });

  it("N6 B 의 사용자 세션 ready 재발행 → B 가 참조 중(>0)인 키마다 넛지 1건 · 참조 0(본 키만)인 키는 0건 · 사용자 세션 시세 요청 0", () => {
    hub.subscribe("A", isinOf(1), "KRX");
    hub.subscribe("A", isinOf(2), "KRX");
    hub.subscribe("B", isinOf(1), "KRX"); // 넛지
    hub.subscribe("B", isinOf(2), "KRX"); // 넛지
    hub.unsubscribe("B", isinOf(2), "KRX"); // 본 키만 남는다
    hub.subscribe("B", isinOf(3), "KRX", "price"); // B 가 처음 연 키 — 0→1 구독
    const before = feed.sent.length;

    sessions.get("B")!.emitReady();
    expect(sentSince(before)).toEqual([
      [S, isinOf(1), true, 0],
      [S, isinOf(3), true, 1],
    ]);
    expect(sessions.get("B")!.quoteReqs()).toHaveLength(0);
  });

  it("N7 B 의 세션 교체(attach 새 세션) 뒤 B 가 K 를 다시 열면 넛지 1건 — 본 키 기억이 세션과 함께 지워진다", () => {
    hub.subscribe("A", K, "KRX");
    hub.subscribe("B", K, "KRX");
    hub.unsubscribe("B", K, "KRX");

    attachUser("B"); // 새 세션 객체 — #clearCaches
    const before = feed.sent.length;
    hub.subscribe("B", K, "KRX");
    expect(sentSince(before)).toEqual([[S, K, true, 0]]);
  });

  it("N8 K 의 구독이 페이서 대기열에 있으면 넛지는 합쳐진다 — K 의 29 는 끝까지 1건", () => {
    for (let n = 0; n < PACER_WINDOW; n += 1) hub.subscribe("A", isinOf(n), "KRX");
    hub.subscribe("A", K, "KRX"); // 창이 차서 대기
    const before = feed.sent.length;

    hub.subscribe("B", K, "KRX");
    expect(sentSince(before)).toEqual([]);

    feed.pushFrame(buildTradeTapeFrame({ isin: isinOf(0) })); // 창 한 칸 — 대기 K 가 나간다
    expect(feed.sent.filter((s) => s.isin === K).map((s) => [s.msgType, s.subscribe, s.level])).toEqual([
      [Q, null, null],
      [S, true, 0],
      [T, null, null],
    ]);
  });

  it("N9 사용자당 한도(D-15)는 참조 > 0 인 키만 센다 — 본 키(참조 0) 200개가 있어도 새 키 ok", () => {
    for (let k = 0; k < USER_SUB_LIMIT; k += 1) hub.subscribe("A", isinOf(k), "KRX");
    for (let k = 0; k < USER_SUB_LIMIT; k += 1) hub.subscribe("B", isinOf(k), "KRX");
    for (let k = 0; k < USER_SUB_LIMIT; k += 1) hub.unsubscribe("B", isinOf(k), "KRX");

    expect(hub.subscribe("B", isinOf(900), "KRX")).toBe("ok");
    // 본 키로 돌아오는 것도 새 키가 아니다 — 참조 > 0 이 201 이 되기 전까지 ok.
    expect(hub.subscribe("B", isinOf(0), "KRX")).toBe("ok");
    expect(hub.subscribe("A", isinOf(901), "KRX")).toBe("limit-user");
  });

  it("N10 키가 업스트림에서 완전히 풀리면 본 키 기억도 지워진다 — linger 만료 뒤 다시 열린 K 에 B 가 오면 넛지 1건", () => {
    hub.subscribe("A", K, "KRX");
    hub.subscribe("B", K, "KRX");
    hub.unsubscribe("A", K, "KRX");
    hub.unsubscribe("B", K, "KRX");
    vi.advanceTimersByTime(LINGER_MS); // 29(false) · 키 해제

    hub.subscribe("A", K, "KRX"); // A 는 새 0→1 구독(본 키 기억도 지워졌다)
    const before = feed.sent.length;
    hub.subscribe("B", K, "KRX");
    expect(sentSince(before)).toEqual([[S, K, true, 0]]);
  });

  it("N11 quote 연결이 Ready 가 아니면 넛지를 보내지 않는다 — ready 의 합집합 재구독 29 가 같은 효과", () => {
    hub.subscribe("A", K, "KRX");
    feed.isReady = false;
    const before = feed.sent.length;

    hub.subscribe("B", K, "KRX");
    sessions.get("B")!.emitReady();
    expect(sentSince(before)).toEqual([]);
  });
});
