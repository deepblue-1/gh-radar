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
 *   공통 — 비밀은 어떤 로그 인자에도 없다(T-19-03 · T-26-05) · feed 가 quote 연결로 보낸 것은 로그인 · 핑뿐이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmaClient, type TransportFrameEvent } from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { QUOTE_LEVEL, buildSubscribeQuoteReq, parseObserverLoginResp, resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { QUOTE_CLIENT_NAME, QuoteFeed } from "../src/quote/feed.js";
import { readSubscribeRequest, startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { SAMPLE_ISIN } from "./helpers/frames.js";

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
