/**
 * Phase 26 Plan 02 — quote 연결 실 TCP 통합: 실 `DmaClient` + 가짜 게이트웨이(quote 모드) + 실 `QuoteFeed`.
 *
 * 가짜는 게이트웨이 소켓 스텁뿐이다. 와이어는 끝까지 실제다 — feed 가 보낸 로그인 바이트를 스텁이 생성 코드로 되읽고,
 * 스텁이 보낸 79 · 78 바이트를 화이트리스트 → `parseObserverLoginResp` 가 푼다.
 *
 * 잠그는 것:
 *   G1  role 1 로그인 → quote 목록에만 기록(role 1 · client gh-radar-relay/quote · since 0 · epoch "") · 저널 목록 0건 ·
 *       ready · 그 뒤 "frame" 으로 78 정확히 1회(79 다음 · ready 뒤 — 확정-로그인).
 *   G2  `waitForQuoteConnection` 은 quote 소켓을 돌려주고, `waitForObserverConnection` 은 quote 소켓을 저널 연결로 오인하지
 *       않는다(시간 초과).
 *   G3  구 서버 흉내(79 success · role 0) → role_mismatch · 재접속 백오프(첫 1초)보다 긴 대기 뒤에도 로그인 1건
 *       (RESEARCH Pitfall 2 · T-26-04).
 *   G4  거부(79 success=false) → rejected · 스텁이 쓴 79 의 role 은 0(서버 거부 응답 규약) · 로그인 1건.
 *   G5  무응답(respondQuoteLogin(null)) → 79 없음 · logging_in 유지.
 *   G6  ready 뒤 hardClose → DmaClient 재접속 → role 1 재로그인 · ready · reconnects 1 · 로그인 2건.
 *   G7  `readSubscribeRequest` — 29 되읽기 · 29 가 아니면 null.
 *   H1~H3 (26-06) 실 SubscriptionHub 를 붙인 경로 — 로그인 직후 78 · quote 76/83 무시 · hardClose → role 1 재로그인 → 전역 합집합 재구독
 *       (full 28·29(0)·32 · price 28·29(1)) · quote 연결 송신 msg_type ⊆ {4, 5, 28, 29, 32}(T-26-09).
 *   공통 — 비밀은 어떤 로그 인자에도 없다(T-19-03 · T-26-05) · feed 가 quote 연결로 보낸 것은 로그인 · 핑뿐이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmaClient, type TransportFrameEvent } from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { QUOTE_LEVEL, buildSubscribeQuoteReq, parseObserverLoginResp, resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { QUOTE_CLIENT_NAME, QuoteFeed } from "../src/quote/feed.js";
import { SubscriptionHub, type HubFanoutEvent, type HubMarketEvent } from "../src/hub/subscription-hub.js";
import {
  readQuoteRequestKey,
  readSubscribeRequest,
  startFakeGateway,
  type FakeGateway,
  type SubscribeRequest,
} from "./helpers/fake-gateway.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN, buildQueueProgressFrame } from "./helpers/frames.js";

const SECRET = "test-quote-secret-only";

type LogCall = { level: string; args: unknown[] };

async function spyLogs(): Promise<LogCall[]> {
  const { logger } = await import("../src/logger.js");
  const calls: LogCall[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      calls.push({ level, args });
    }) as never);
  }
  return calls;
}

/** 실시간 폴링 대기 — 재접속 백오프(1초)를 실제로 기다려야 한다. */
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("quote 연결 실 TCP — 가짜 게이트웨이 quote 모드 · 실 DmaClient · 실 QuoteFeed", () => {
  let gateway: FakeGateway;
  let feed: QuoteFeed | null = null;
  let logs: LogCall[];
  /** 게이트웨이가 받은 msg_type 전량(이 파일의 게이트웨이에는 quote 연결만 붙는다). */
  let received: number[];
  /** feed 가 hub 로 넘긴 프레임. */
  let frames: TransportFrameEvent[];
  /** 전송 층에서 본 원 프레임(79 포함) — 스텁이 쓴 79 의 내용을 단언한다. */
  let raw: TransportFrameEvent[];

  beforeEach(async () => {
    resetDroppedEnvelopeCount();
    logs = await spyLogs();
    gateway = await startFakeGateway({ autoLogin: false, autoAccount: false });
    received = [];
    gateway.onFrame((msgType) => received.push(msgType));
    frames = [];
    raw = [];
  });

  afterEach(async () => {
    feed?.stop();
    feed = null;
    await gateway.close();
    vi.restoreAllMocks();
    // T-19-03 · T-26-05: 비밀은 어떤 로그 인자에도 없다.
    expect(JSON.stringify(logs.map((c) => c.args))).not.toContain(SECRET);
    // quote 연결은 로그인과 핑 외에 아무것도 보내지 않는다(이 플랜 범위 — 구독은 26-03).
    expect(received.filter((t) => t !== MSG.ObserverLoginReq && t !== MSG.LivePing)).toEqual([]);
  });

  function startFeed(): QuoteFeed {
    const transport = new DmaClient({ host: "127.0.0.1", port: gateway.port });
    transport.on("frame", (e) => raw.push(e));
    const f = new QuoteFeed({ secret: SECRET, host: "127.0.0.1", port: gateway.port, transport });
    f.on("frame", (e) => frames.push(e));
    feed = f;
    f.start();
    return f;
  }

  it("G1 role 1 로그인 → quote 목록에만 기록 · ready · 뒤이어 78 이 frame 으로 정확히 1회", async () => {
    gateway.respondQuoteLogin({ success: true });
    const f = startFeed();

    await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "로그인 → ready");
    await waitFor(() => frames.length >= 1, "78 전달");
    await sleep(100); // 78 이 두 번 오지 않는지 볼 여유

    expect(gateway.quoteLoginRequests()).toEqual([
      { secret: SECRET, sinceSeq: 0, epoch: "", client: QUOTE_CLIENT_NAME, strategySinceSeq: 0, role: 1 },
    ]);
    expect(gateway.observerLoginRequests()).toEqual([]);
    expect(f.isReady).toBe(true);
    // 79 는 feed 가 소비하고, 78 만 ready 뒤 frame 으로 나간다.
    expect(frames.map((e) => e.msgType)).toEqual([MSG.RateCrossSnapshot]);
    // 전송 층 순서: 79 → 78 (서버 규약).
    expect(raw.map((e) => e.msgType)).toEqual([MSG.ObserverLoginResp, MSG.RateCrossSnapshot]);
    const login = raw[0] === undefined ? null : parseObserverLoginResp(raw[0].env);
    expect(login).toMatchObject({ success: true, role: 1, epoch: "", accounts: [] });
    expect(f.lastFrameAtMs).not.toBeNull();
  });

  it("G2 waitForQuoteConnection 은 quote 소켓을 돌려주고, waitForObserverConnection 은 그것을 저널 연결로 보지 않는다", async () => {
    gateway.respondQuoteLogin({ success: true });
    const f = startFeed();

    const sock = await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "로그인 → ready");
    expect(gateway.sockets).toContain(sock);
    await expect(gateway.waitForObserverConnection(300)).rejects.toThrow(/시간 초과/);
    // 이미 살아 있는 quote 소켓은 즉시 같은 것이 나온다.
    await expect(gateway.waitForQuoteConnection(300)).resolves.toBe(sock);
  });

  it("G3 구 서버 흉내(79 success · role 0) → role_mismatch · 백오프보다 긴 대기 뒤에도 로그인 1건", async () => {
    gateway.respondQuoteLogin({ success: true, role: 0 });
    const f = startFeed();

    await waitFor(() => f.state === "role_mismatch", "role 0 에코 → role_mismatch");
    await sleep(2500); // 첫 재접속 지연 1초 · 두 번째 2초보다 길게
    expect(gateway.quoteLoginRequests()).toHaveLength(1);
    expect(f.state).toBe("role_mismatch");
    expect(f.isReady).toBe(false);
    expect(frames).toEqual([]);
    const err = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("role_mismatch")));
    expect(err?.args[0]).toMatchObject({ role: 0 });
  }, 10_000);

  it("G4 거부(79 success=false) → rejected · 스텁 79 의 role 은 0 · 로그인 1건", async () => {
    gateway.respondQuoteLogin({ success: false, message: "거부" });
    const f = startFeed();

    await waitFor(() => f.state === "rejected", "거부 → rejected");
    await sleep(2500);
    expect(gateway.quoteLoginRequests()).toHaveLength(1);
    expect(f.state).toBe("rejected");
    expect(frames).toEqual([]);
    // 거부 응답에는 78 이 따라오지 않는다 · 79 role 0(서버 거부 응답 규약).
    expect(raw.map((e) => e.msgType)).toEqual([MSG.ObserverLoginResp]);
    const login = raw[0] === undefined ? null : parseObserverLoginResp(raw[0].env);
    expect(login).toMatchObject({ success: false, message: "거부", role: 0 });
  }, 10_000);

  it("G5 무응답(respondQuoteLogin(null)) → 79 없음 · logging_in 유지", async () => {
    gateway.respondQuoteLogin(null);
    const f = startFeed();

    await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "logging_in", "로그인 송신 → logging_in");
    await sleep(300);
    expect(gateway.quoteLoginRequests()).toHaveLength(1);
    expect(raw).toEqual([]);
    expect(f.state).toBe("logging_in");
    expect(f.isReady).toBe(false);
  });

  it("G6 ready 뒤 hardClose → role 1 재로그인 · ready · reconnects 1 · 로그인 2건", async () => {
    gateway.respondQuoteLogin({ success: true });
    const f = startFeed();
    const first = await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "첫 로그인 → ready");
    expect(f.reconnects).toBe(0);

    gateway.hardClose(first);
    await waitFor(() => f.state !== "ready", "끊김 → ready 이탈");
    await waitFor(() => gateway.quoteLoginRequests().length === 2, "재접속 로그인", 4000);
    const second = await gateway.waitForQuoteConnection(3000);
    expect(second).not.toBe(first);
    await waitFor(() => f.state === "ready", "재로그인 → ready");

    expect(f.reconnects).toBe(1);
    expect(gateway.quoteLoginRequests().every((r) => r.role === 1 && r.client === QUOTE_CLIENT_NAME)).toBe(true);
    expect(gateway.observerLoginRequests()).toEqual([]);
    // 로그인마다 78 이 한 번씩 — 두 연결 합 2회.
    await waitFor(() => frames.length === 2, "재로그인 뒤 78");
    expect(frames.map((e) => e.msgType)).toEqual([MSG.RateCrossSnapshot, MSG.RateCrossSnapshot]);
  }, 10_000);
});

describe("readSubscribeRequest — 29 되읽기 (26-03 · 26-06 이 쓴다)", () => {
  it("G7 buildSubscribeQuoteReq(isin, KRX, true, PRICE) → { isin, KRX, true, 1 } · 29 가 아니면 null", () => {
    const payload = Buffer.from(buildSubscribeQuoteReq(SAMPLE_ISIN, "KRX", true, QUOTE_LEVEL.PRICE));
    expect(readSubscribeRequest(MSG.SubscribeQuoteReq, payload)).toEqual({
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      subscribe: true,
      level: 1,
    });
    const off = Buffer.from(buildSubscribeQuoteReq(SAMPLE_ISIN, "NXT", false));
    expect(readSubscribeRequest(MSG.SubscribeQuoteReq, off)).toEqual({
      isin: SAMPLE_ISIN,
      exchange: "NXT",
      subscribe: false,
      level: 0,
    });
    expect(readSubscribeRequest(MSG.GetQuoteReq, payload)).toBeNull();
  });
});

/**
 * Phase 26 (26-06) — 실 TCP 스텁 + 실 `DmaClient` + 실 `QuoteFeed` + 실 `SubscriptionHub`(`attachFeed`).
 *
 * 트레이서(26-03)는 happy path 하나만 증명했다. 여기서는 운영에서 실제로 일어나는 「끊김 → role 1 재로그인 → 합집합 재구독」
 * (D-03 폴백 없음 → 이것이 유일한 복구 경로)과 서버 quote 관문(4 · 27 · 28 · 29 · 32 · 35) 밖 요청 누출(T-26-09)을 잠근다.
 * 이 파일의 게이트웨이에는 quote 연결만 붙는다 — 사용자 세션이 없으므로 LoginReq(1) 은 0건이어야 한다.
 */
describe("실 hub 결선 — 재접속 합집합 재구독 · 송신 집합 (Phase 26)", () => {
  /** quote 연결이 게이트웨이로 보내도 되는 msg_type — 핑 · 관찰자 로그인 · 스냅샷 · 구독 · 체결 스냅샷. */
  const QUOTE_SEND_ALLOWED = new Set<number>([
    MSG.LivePing,
    MSG.ObserverLoginReq,
    MSG.GetQuoteReq,
    MSG.SubscribeQuoteReq,
    MSG.GetTradeTapeReq,
  ]);
  const FULL_ISIN = SAMPLE_ISIN;
  const PRICE_ISIN = "KR7000660001";
  const OTHER_ACCOUNT = "9999999901";

  /** 게이트웨이가 받은 요청 1건 — 어느 소켓으로 왔는지와 28/32 키 · 29 되읽기. */
  type GatewayReq = {
    sock: unknown;
    msgType: number;
    isin: string | null;
    sub: SubscribeRequest | null;
  };

  let gateway: FakeGateway;
  let hub: SubscriptionHub;
  let feed: QuoteFeed | null = null;
  let logs: LogCall[];
  let reqs: GatewayReq[];
  let fanout: HubFanoutEvent[];
  let market: HubMarketEvent[];
  /** feed 가 hub 로 넘긴 프레임 수 — hub 리스너 뒤에 붙인 관찰자라 「hub 가 이미 처리했다」 의 신호다. */
  let feedFrames: number[];

  beforeEach(async () => {
    resetDroppedEnvelopeCount();
    logs = await spyLogs();
    gateway = await startFakeGateway({ autoLogin: false, autoAccount: false });
    reqs = [];
    gateway.onFrame((msgType, payload, sock) => {
      // payload 는 FrameReader 버퍼의 뷰다 — 되읽기 전에 사본을 뜬다.
      const copy = Buffer.from(payload);
      reqs.push({
        sock,
        msgType,
        isin: readQuoteRequestKey(msgType, copy)?.isin ?? readSubscribeRequest(msgType, copy)?.isin ?? null,
        sub: readSubscribeRequest(msgType, copy),
      });
    });
    hub = new SubscriptionHub();
    fanout = [];
    market = [];
    feedFrames = [];
    hub.on("fanout", (e) => fanout.push(e));
    hub.on("market", (e) => market.push(e));
  });

  afterEach(async () => {
    feed?.stop();
    feed = null;
    hub.closeAll();
    await gateway.close();
    vi.restoreAllMocks();
    // T-26-09: quote 연결이 보낸 것은 서버 quote 관문 안쪽 집합의 부분집합이다 — 주문 · 전략 · 계좌 · 저널 · 39 는 0.
    expect([...new Set(reqs.map((r) => r.msgType))].filter((t) => !QUOTE_SEND_ALLOWED.has(t))).toEqual([]);
    // 사용자 세션은 없다 — 사용자 로그인(1) 0 · 저널 관찰자 로그인 0.
    expect(reqs.filter((r) => r.msgType === MSG.LoginReq)).toEqual([]);
    expect(gateway.observerLoginRequests()).toEqual([]);
    // T-19-03 · T-26-05: 비밀은 어떤 로그 인자에도 없다.
    expect(JSON.stringify(logs.map((c) => c.args))).not.toContain(SECRET);
  });

  function startFeed(): QuoteFeed {
    const transport = new DmaClient({ host: "127.0.0.1", port: gateway.port });
    const f = new QuoteFeed({ secret: SECRET, host: "127.0.0.1", port: gateway.port, transport });
    hub.attachFeed(f);
    f.on("frame", (e) => feedFrames.push(e.msgType));
    feed = f;
    f.start();
    return f;
  }

  /** 그 소켓으로 온 시세 요청(28/29/32)만 — 로그인 · 핑 제외. */
  function quoteReqsOn(sock: unknown): GatewayReq[] {
    return reqs.filter(
      (r) =>
        r.sock === sock &&
        (r.msgType === MSG.GetQuoteReq || r.msgType === MSG.SubscribeQuoteReq || r.msgType === MSG.GetTradeTapeReq),
    );
  }

  /** 한 소켓이 받은 두 벌 — full 키 28 · 29(true · 0) · 32 · price 키 28 · 29(true · 1) — 을 단언한다. */
  function expectUnionSet(sock: unknown): void {
    const got = quoteReqsOn(sock);
    const full = got.filter((r) => r.isin === FULL_ISIN);
    const price = got.filter((r) => r.isin === PRICE_ISIN);
    expect(got).toHaveLength(full.length + price.length);
    expect(full.map((r) => r.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);
    expect(full[1]?.sub).toEqual({ isin: FULL_ISIN, exchange: "KRX", subscribe: true, level: 0 });
    expect(price.map((r) => r.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq]);
    expect(price[1]?.sub).toEqual({ isin: PRICE_ISIN, exchange: "KRX", subscribe: true, level: 1 });
  }

  it("H1 role 1 로그인 직후 78 이 hub 에 닿아도 무시된다 — unhandledFrameCount 0 · fanout 0 · market 0", async () => {
    gateway.respondQuoteLogin({ success: true });
    const f = startFeed();

    await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "로그인 → ready");
    await waitFor(() => feedFrames.length >= 1, "로그인 직후 78 이 hub 로");
    await sleep(100); // 78 이 두 번 오지 않는지, 뒤늦은 처리가 없는지 볼 여유

    expect(feedFrames).toEqual([MSG.RateCrossSnapshot]);
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(fanout).toEqual([]);
    expect(market).toEqual([]);
    // 보유 키 0 — ready 가 재구독할 것이 없다.
    expect(reqs.filter((r) => r.msgType !== MSG.ObserverLoginReq && r.msgType !== MSG.LivePing)).toEqual([]);
  });

  it("H2 full 키 · price 키 구독 → 28·29(0)·32 / 28·29(1) · hardClose → role 1 재로그인 → 같은 두 벌이 다시 온다 · reconnects 1", async () => {
    gateway.respondQuoteLogin({ success: true });
    // full 키는 feed Ready 이전에 잡는다(참조계수만 → ready 복원) · price 키는 Ready 뒤 0→1 로 잡는다 — 두 경로 모두.
    hub.subscribe("user-1", FULL_ISIN, "KRX");
    const f = startFeed();

    const first = await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "첫 로그인 → ready");
    hub.subscribe("user-2", PRICE_ISIN, "KRX", "price");
    await waitFor(() => quoteReqsOn(first).length === 5, "첫 연결 두 벌(3 + 2)");
    expectUnionSet(first);
    expect(f.reconnects).toBe(0);

    gateway.hardClose(first);
    await waitFor(() => f.state !== "ready", "끊김 → ready 이탈");
    await waitFor(() => gateway.quoteLoginRequests().length === 2, "재접속 로그인", 4000);
    const second = await gateway.waitForQuoteConnection(3000);
    expect(second).not.toBe(first);
    await waitFor(() => f.state === "ready", "재로그인 → ready");
    await waitFor(() => quoteReqsOn(second).length === 5, "재접속 합집합 재구독(3 + 2)");
    await sleep(100); // 중복 재구독이 없는지 볼 여유

    expectUnionSet(second);
    expect(quoteReqsOn(first)).toHaveLength(5);
    expect(f.reconnects).toBe(1);
    expect(gateway.quoteLoginRequests().every((r) => r.role === 1 && r.client === QUOTE_CLIENT_NAME)).toBe(true);
    // 브라우저는 아무것도 다시 보내지 않았다 — 참조계수 · 실효 level 은 끊김 전과 같다.
    expect(hub.refCount(FULL_ISIN, "KRX")).toBe(1);
    expect(hub.refCount(PRICE_ISIN, "KRX")).toBe(1);
    expect(hub.subscriptionLevel(FULL_ISIN, "KRX")).toBe("full");
    expect(hub.subscriptionLevel(PRICE_ISIN, "KRX")).toBe("price");
    // 재로그인 뒤 78 도 hub 에서 무시 — 두 연결 합 2회 · 계수 0.
    await waitFor(() => feedFrames.filter((t) => t === MSG.RateCrossSnapshot).length === 2, "재로그인 뒤 78");
    expect(hub.unhandledFrameCount()).toBe(0);
    expect(fanout).toEqual([]);
  }, 10_000);

  it("H3 quote 소켓으로 온 76 · 83(남의 계좌 포함)은 hub 에서 무시된다 — fanout 0 · market 0 · unhandledFrameCount 0 (T-26-02)", async () => {
    gateway.respondQuoteLogin({ success: true });
    const f = startFeed();
    const sock = await gateway.waitForQuoteConnection(3000);
    await waitFor(() => f.state === "ready", "로그인 → ready");
    await waitFor(() => feedFrames.length === 1, "로그인 직후 78");

    gateway.sendRateCrossAlert(sock, { isin: FULL_ISIN });
    gateway.sendFrame(
      sock,
      buildQueueProgressFrame({
        items: [
          { accountNo: SAMPLE_ACCOUNT_NO, orderNo: "12453" },
          { accountNo: OTHER_ACCOUNT, orderNo: "99999" },
        ],
      }),
    );
    await waitFor(() => feedFrames.length === 3, "76 · 83 이 hub 로");

    expect(feedFrames).toEqual([MSG.RateCrossSnapshot, MSG.RateCrossAlert, MSG.QueueProgress]);
    expect(fanout).toEqual([]);
    expect(market).toEqual([]);
    expect(hub.unhandledFrameCount()).toBe(0);
  });
});
