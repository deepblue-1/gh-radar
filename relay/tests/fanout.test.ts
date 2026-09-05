/**
 * Phase 15 Plan 04 — RELAY-01. `WsFanout` 통합 테스트 (브라우저 ↔ relay ↔ 가짜 게이트웨이).
 *
 * 검증 대상은 **신뢰 경계**다 — 첫 메시지 인증 4케이스(D-11), allowlist 게이트(D-12),
 * 다중 탭 구독 공유, **사용자 간 데이터 비교차**(T-15-02), 백프레셔 종료(T-15-08),
 * 종료 시 참조계수·세션 반납.
 *
 * 스텁은 Supabase(토큰·자격증명) 하나뿐이고 나머지는 전부 진짜다 — 실제 ws 서버,
 * 실제 TCP 로 붙는 가짜 게이트웨이, 실제 `SessionManager`/`SubscriptionHub`. 이 경로
 * 전체가 이어지는지가 이 plan 의 핵심 리스크이므로 중간을 가짜로 채우면 의미가 없다.
 *
 * 타이머 규율(15-03 과 동일): 가짜 타이머는 `setTimeout` 계열만 대체하고 `setImmediate` 는
 * 진짜로 둔다. 소켓 I/O 대기는 **고정 flush 횟수가 아니라 조건 폴링**이다.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOutbound } from "@gh-radar/shared";

import { AUTH_TIMEOUT_MS, WsFanout, type WsFanoutDeps } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ISIN } from "./helpers/frames.js";

const WS_PATH = "/ws";
const USER_A = "3f1c2b7a-9d40-4a11-8e55-00000000000a";
const USER_B = "3f1c2b7a-9d40-4a11-8e55-00000000000b";
/** 로그인은 되지만 `dma_credentials` 매핑이 없는 사용자 (D-12). */
const USER_NONE = "3f1c2b7a-9d40-4a11-8e55-00000000000c";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-a", USER_A],
  ["token-b", USER_B],
  ["token-none", USER_NONE],
]);

type CredRow = { dma_user_id: string; dma_password_enc: string };

const CRED_ROWS = new Map<string, CredRow>([
  [USER_A, { dma_user_id: "kb-a", dma_password_enc: encryptDmaPassword("pw-a", USER_A, CRED_KEY) }],
  [USER_B, { dma_user_id: "kb-b", dma_password_enc: encryptDmaPassword("pw-b", USER_B, CRED_KEY) }],
]);

/** 토큰 검증 + `dma_credentials` 조회만 흉내 내는 최소 스텁. */
function fakeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: (token: string) => {
        const userId = TOKENS.get(token);
        if (userId === undefined) {
          return Promise.resolve({ data: { user: null }, error: { message: "invalid JWT" } });
        }
        return Promise.resolve({ data: { user: { id: userId } }, error: null });
      },
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => Promise.resolve({ data: CRED_ROWS.get(value) ?? null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 600): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

type Harness = {
  port: number;
  server: http.Server;
  fanout: WsFanout;
  hub: SubscriptionHub;
  sessions: SessionManager;
  acquireSpy: ReturnType<typeof vi.spyOn>;
  releaseSpy: ReturnType<typeof vi.spyOn>;
  close: () => Promise<void>;
};

describe("WsFanout", () => {
  let gateway: FakeGateway;
  let h: Harness;
  const sockets: TestWs[] = [];
  /** 게이트웨이가 받은 요청 프레임 종류 누적. */
  let gatewayMsgTypes: number[];

  async function startHarness(overrides: Partial<WsFanoutDeps> = {}): Promise<Harness> {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const hub = new SubscriptionHub();
    const sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
    const acquireSpy = vi.spyOn(sessions, "acquire");
    const releaseSpy = vi.spyOn(sessions, "release");

    const fanout = new WsFanout({
      server,
      supabase: fakeSupabase(),
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      ...overrides,
    });

    return {
      port,
      server,
      fanout,
      hub,
      sessions,
      acquireSpy,
      releaseSpy,
      close: async () => {
        await fanout.close();
        await sessions.closeAll();
        hub.closeAll();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  }

  /** 접속 + 수신 메시지 수집기. 순서 단언은 테스트의 책임이다. */
  async function open(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(h.port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    return { ws, inbox };
  }

  /** 인증 후 세션이 Ready 상태 프레임을 내려줄 때까지 기다린다. */
  async function authed(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const conn = await open();
    conn.ws.sendAuth(token);
    await waitFor(
      () => conn.inbox.some((m) => m.t === "state" && m.s === "ready"),
      `${token} ready 상태 프레임`,
    );
    return conn;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gatewayMsgTypes = [];
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    gateway.onFrame((msgType) => gatewayMsgTypes.push(msgType));
    h = await startHarness();
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    await h.close();
    await gateway.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("① 5초 안에 인증하지 않으면 close(4401) 이다", async () => {
    const { ws } = await open();

    vi.advanceTimersByTime(AUTH_TIMEOUT_MS);
    await waitFor(() => ws.closeInfo !== null, "인증 시간 초과 close");

    expect(ws.closeInfo?.code).toBe(4401);
    expect(h.acquireSpy).not.toHaveBeenCalled();
  });

  it("② 첫 메시지가 sub 이면 close(4400) 이다 (인증 전 구독 금지)", async () => {
    const { ws } = await open();

    ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => ws.closeInfo !== null, "인증 전 구독 close");

    expect(ws.closeInfo?.code).toBe(4400);
    expect(gateway.sockets).toHaveLength(0);
  });

  it("③ 토큰 검증에 실패하면 close(4401) 이다", async () => {
    const { ws } = await open();

    ws.sendAuth("token-forged");
    await waitFor(() => ws.closeInfo !== null, "토큰 실패 close");

    expect(ws.closeInfo?.code).toBe(4401);
    expect(h.acquireSpy).not.toHaveBeenCalled();
  });

  it("④ dma_credentials 매핑이 없으면 연결은 유지되고 unauthorized 상태만 받는다 (D-12)", async () => {
    const { ws, inbox } = await open();

    ws.sendAuth("token-none");
    await waitFor(() => inbox.length > 0, "unauthorized 상태 프레임");

    expect(inbox[0]).toEqual({ t: "state", s: "unauthorized" });
    expect(ws.closeInfo).toBeNull();
    // 세션도 게이트웨이 연결도 만들지 않는다.
    expect(h.acquireSpy).not.toHaveBeenCalled();
    expect(gateway.sockets).toHaveLength(0);

    // 이후 구독도 만들어지지 않고 같은 상태만 되돌아온다.
    ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => inbox.length > 1, "구독 거부 상태 프레임");
    expect(inbox[1]).toEqual({ t: "state", s: "unauthorized" });
    expect(h.hub.refCount(USER_NONE, SAMPLE_ISIN, "KRX")).toBe(0);
    expect(ws.closeInfo).toBeNull();
  });

  it("⑤ 인증에 성공하면 상태 프레임이 즉시 오고 세션을 획득한다 (브라우저 인증 ACK)", async () => {
    const { ws, inbox } = await open();

    ws.sendAuth("token-a");
    await waitFor(() => inbox.length > 0, "첫 상태 프레임");

    // 첫 프레임은 반드시 상태 프레임이다 — 브라우저는 이것을 받아야 구독을 시작한다.
    expect(inbox[0]?.t).toBe("state");
    expect(h.acquireSpy).toHaveBeenCalledTimes(1);
    expect(h.acquireSpy.mock.calls[0]?.[0]).toBe(USER_A);
    expect(ws.closeInfo).toBeNull();

    await waitFor(
      () => inbox.some((m) => m.t === "state" && m.s === "ready"),
      "ready 상태 프레임",
    );
  });

  it("⑥ 같은 사용자 탭 2개는 게이트웨이 구독 1건을 공유하고 둘 다 시세를 받는다", async () => {
    const first = await authed("token-a");
    const second = await authed("token-a");

    first.ws.sendSub(SAMPLE_ISIN, "KRX");
    second.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(
      () => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 2,
      "두 탭의 참조계수",
    );
    await waitFor(
      () => gatewayMsgTypes.includes(MSG.SubscribeQuoteReq),
      "게이트웨이 구독 요청 수신",
    );

    // 탭이 2개여도 KB 방향 구독은 1건이다.
    expect(gatewayMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq)).toHaveLength(1);
    expect(gateway.sockets).toHaveLength(1);

    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.pushQuote(sock, { snapshot: true, lastPrice: 70_950n });

    await waitFor(
      () => first.inbox.some((m) => m.t === "q") && second.inbox.some((m) => m.t === "q"),
      "두 소켓 모두 시세 수신",
    );
    const quote = first.inbox.find((m) => m.t === "q");
    expect(quote).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", p: 70_950 });
  });

  it("⑦ 다른 사용자의 시세는 절대 넘어가지 않는다 (T-15-02)", async () => {
    const a = await authed("token-a");
    await waitFor(() => gateway.sockets.length === 1, "A 게이트웨이 연결");
    const sockA = gateway.sockets[0];

    const b = await authed("token-b");
    await waitFor(() => gateway.sockets.length === 2, "B 게이트웨이 연결");

    a.ws.sendSub(SAMPLE_ISIN, "KRX");
    b.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(
      () =>
        h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 1 &&
        h.hub.refCount(USER_B, SAMPLE_ISIN, "KRX") === 1,
      "양쪽 참조계수",
    );

    if (sockA === undefined) throw new Error("A 소켓 없음");
    gateway.pushQuote(sockA, { snapshot: true, lastPrice: 71_500n });
    await waitFor(() => a.inbox.some((m) => m.t === "q"), "A 시세 수신");
    await flushIo(20);

    expect(a.inbox.filter((m) => m.t === "q")).toHaveLength(1);
    expect(b.inbox.filter((m) => m.t === "q")).toHaveLength(0);
  });

  it("⑧ 송신 대기가 임계를 연속으로 넘으면 그 연결만 종료한다 (T-15-08)", async () => {
    // 임계를 -1 로 두면 `bufferedAmount`(>= 0)가 **언제나** 초과다. 실제 소켓 내부를
    // 건드리지 않고 연속 초과 카운터와 terminate 경로만 결정적으로 태우기 위한 값이다.
    const warnSpy = vi.spyOn(logger, "warn");
    const strict = await startHarness({ backpressureLimitBytes: -1 });

    const ws = await connectWs(strict.port, WS_PATH);
    sockets.push(ws);
    ws.sendAuth("token-a");

    await waitFor(() => ws.closeInfo !== null, "백프레셔 종료");
    expect(
      warnSpy.mock.calls.some((call) => String(call[1] ?? "").includes("백프레셔 연속 초과")),
    ).toBe(true);

    await strict.close();
  });

  it("⑨ 소켓이 닫히면 그 소켓이 잡은 구독만 해제되고 세션 참조가 반납된다", async () => {
    const first = await authed("token-a");
    const second = await authed("token-a");

    first.ws.sendSub(SAMPLE_ISIN, "KRX");
    second.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 2, "참조계수 2");

    await first.ws.close();
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 1, "참조계수 1로 감소");
    expect(h.releaseSpy).toHaveBeenCalledTimes(1);
    // 남은 탭의 구독은 살아 있다 — 해제 프레임이 나가지 않았다.
    expect(gatewayMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq)).toHaveLength(1);

    await second.ws.close();
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 0, "참조계수 0");
    expect(h.releaseSpy).toHaveBeenCalledTimes(2);
    // 마지막 해제에서만 subscribe:false 가 나간다(요청 프레임 2건 = 구독 + 해제).
    await waitFor(
      () => gatewayMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq).length === 2,
      "업스트림 구독 해제",
    );
  });

  it("⑩ 스키마 위반(ISIN 길이)은 close(4400) 이다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "sub", isin: "KR700593", ex: "KRX" });
    await waitFor(() => ws.closeInfo !== null, "스키마 위반 close");

    expect(ws.closeInfo?.code).toBe(4400);
    expect(h.hub.refCount(USER_A, "KR700593", "KRX")).toBe(0);
  });

  it("⑪ 재접속하면 스냅샷 캐시가 즉시 응답한다 (D-37)", async () => {
    const first = await authed("token-a");
    first.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 1, "구독 성립");
    await waitFor(() => gateway.sockets.length === 1, "게이트웨이 연결");

    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.pushQuote(sock, { snapshot: true, lastPrice: 69_800n });
    await waitFor(() => first.inbox.some((m) => m.t === "q"), "첫 시세 수신");

    // 새 탭이 붙어 같은 종목을 구독하면 게이트웨이 왕복 없이 캐시가 먼저 온다.
    const second = await authed("token-a");
    second.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => second.inbox.some((m) => m.t === "q"), "캐시 즉시 응답");

    expect(second.inbox.find((m) => m.t === "q")).toMatchObject({ p: 69_800, snap: true });
  });

  it("⑫ 계약 밖 경로로는 업그레이드하지 않는다", async () => {
    await expect(connectWs(h.port, "/not-ws")).rejects.toThrow();
  });
});
