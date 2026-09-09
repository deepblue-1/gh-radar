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
 *
 * Phase 16 Plan 07 추가 — **전략 표면**(⑬~㉒). 검증 대상은 같은 신뢰 경계다:
 *   · 인증만 하면 전략 스냅샷 3프레임이 **구독 없이** 온다 (D-12)
 *   · 「0건」과 「아직 모른다」를 가른다 — `getViTrigger` 가 `undefined` 면 `vi` 프레임이 없다
 *   · `dma_credentials` 미등록은 스냅샷도 전략 전송도 못 받는다 (D-04)
 *   · `accountNo` 는 `session.allowedAccounts` 대조를 통과해야만 게이트웨이로 나간다 (T-16-01)
 *   · 연결당 인바운드 상한 (T-16-06) · 사용자 간 전략 비교차 (T-16-02)
 *
 * ⚠️ 게이트웨이로 나간 전략 요청은 **디코드해서** 본다. `strategyRequests()` 는 바이트를
 *    그대로 넘기고 해석하지 않는다 — 스텁이 요청을 해석해 주면 그 해석이 곧 프로덕션 파서의
 *    정답지가 되어 검증이 순환한다.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayLimitChaserInput, RelayOutbound } from "@gh-radar/shared";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";

import {
  AUTH_TIMEOUT_MS,
  INBOUND_RATE_LIMIT_PER_SEC,
  RELAY_MSG_SOURCE,
  WsFanout,
  type WsFanoutDeps,
} from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN, STRATEGY_MSG } from "./helpers/frames.js";

const WS_PATH = "/ws";
/** 사용자 간 전략 비교차(㉒)를 눈으로 구분하기 위한 두 번째 종목. */
const OTHER_ISIN = "KR7000660001";
/** `SAMPLE_ACCOUNTS` 에 **없는** 계좌 — 화이트리스트 밖 요청을 만든다 (T-16-01). */
const FOREIGN_ACCOUNT_NO = "9999999999";
/** `SymbolMap` 이 모르는 ISIN — `lc.set` 의 ②-1 해석 실패 경로를 만든다 (WR-03). */
const UNKNOWN_ISIN = "KR7999999999";

/**
 * 종목맵 스텁 (D-28).
 *
 * `lc.set` 의 시장 구분은 relay 가 여기서 푼다 — 브라우저는 `market` 을 싣지 않는다(WR-03).
 * `OTHER_ISIN` 을 **KOSDAQ("Q")** 로 둔 것이 핵심이다: 브라우저가 아무것도 안 실었는데
 * 게이트웨이로 나간 프레임의 market 이 `"Q"` 라면 relay 가 채웠다는 뜻이다.
 */
const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined => {
    if (isin === SAMPLE_ISIN) return { code: "005930", name: "삼성전자", market: "K" };
    if (isin === OTHER_ISIN) return { code: "000660", name: "에스케이하이닉스", market: "Q" };
    return undefined;
  },
};
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

/**
 * `lc.set` 이 싣는 32필드 — 스키마를 통과하는 최소 정상값.
 *
 * S→C 전용 4필드와 파생 `key` 는 타입이 이미 뺐다(`RelayLimitChaserInput`) — 실어 보내면
 * "값이 왕복한다"는 착각이 생겨 에코-폼 비교가 오염된다 (Pitfall 6).
 * `market` 도 없다 — relay 가 ISIN 으로 푼다 (WR-03 / D-28).
 */
function lcInput(overrides: Partial<RelayLimitChaserInput> = {}): RelayLimitChaserInput {
  return {
    isin: SAMPLE_ISIN,
    accountNo: SAMPLE_ACCOUNT_NO,
    crud: "C",
    buyOrderPrice: 70_000,
    buyOrderQty: 10,
    buyWatchPrice: 69_900,
    buyWatchQty: 100,
    buyMinTradeQty: 1,
    buyWatchSide: "1",
    buyTradeQtyEnabled: true,
    buyEnabled: true,
    sellOrderPrice: 71_000,
    sellWatchPrice: 70_900,
    sellWatchQty: 100,
    sellMinTradeQty: 1,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 0,
    sweepEnabled: false,
    sweepMinTickCount: 0,
    // 클라 고정 3 — 조립기가 다른 값을 받으면 경고를 남기고 고정값으로 덮는다.
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange: "KRX",
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    buyOrderAmount: 70,
    cancelQtyEnabled: false,
    cancelWatchQty: 0,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    ...overrides,
  };
}

/**
 * 요청 프레임의 루트 Envelope. `tryParseEnvelope` 를 쓰지 않는 이유는 그 함수가 **수신**
 * 화이트리스트라 요청 대역(10·11·14·33)을 전부 드롭하기 때문이다.
 */
function rootEnvelope(payload: Buffer): Envelope {
  return Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(new Uint8Array(payload)));
}

/** 수신함에서 특정 종류의 프레임만 좁힌다(타입 술어 — 단언에서 캐스팅하지 않기 위해). */
function framesOf<T extends RelayOutbound["t"]>(
  inbox: RelayOutbound[],
  t: T,
): Extract<RelayOutbound, { t: T }>[] {
  return inbox.filter((m): m is Extract<RelayOutbound, { t: T }> => m.t === t);
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
      // 종목맵은 **전략 분기의 전제**다 (WR-03) — 없으면 `lc.set` 이 전부 거부된다.
      symbols: SYMBOLS,
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

  // ============================================================
  // Phase 16 Plan 07 — 전략 표면 (D-01/D-12/T-16-01/T-16-02/T-16-06)
  // ============================================================

  it("⑬ 인증만 하면 전략 스냅샷 3프레임이 구독 없이 온다 (D-12)", async () => {
    gateway.respondLimitChaserList([
      { isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO },
      { isin: OTHER_ISIN, accountNo: SAMPLE_ACCOUNT_NO },
    ]);
    gateway.respondViTrigger({ run: true, orderAmountKrw: 3_000_000n, checkRate: 25 });
    gateway.respondViOrderList([
      { orderNo: "0000000001" },
      { orderNo: "0000000002" },
      { orderNo: "0000000003" },
    ]);

    // 첫 탭이 Ready 를 만들면 Hub 가 24/21/34 를 프리페치해 캐시를 채운다 (16-06).
    await authed("token-a");
    await waitFor(() => h.hub.getLimitChasers(USER_A).length === 2, "상따 캐시 2건");
    await waitFor(() => h.hub.getViTrigger(USER_A) != null, "VI 설정 캐시");
    await waitFor(() => h.hub.getViOrders(USER_A).length === 3, "VI 주문 캐시 3건");

    // 새 탭은 **구독을 한 건도 보내지 않고** 캐시에서 3프레임을 받는다.
    const second = await open();
    second.ws.sendAuth("token-a");
    await waitFor(() => framesOf(second.inbox, "vi.list").length === 1, "새 탭 VI 주문 스냅샷");
    await flushIo(20);

    const [lcSnap] = framesOf(second.inbox, "lc.snap");
    expect(lcSnap?.items).toHaveLength(2);
    expect(lcSnap?.items.map((i) => i.isin).sort()).toEqual([OTHER_ISIN, SAMPLE_ISIN].sort());

    const [vi] = framesOf(second.inbox, "vi");
    expect(vi?.cfg).toMatchObject({ run: true, orderAmountKrw: 3_000_000, checkRate: 25 });

    const [viList] = framesOf(second.inbox, "vi.list");
    expect(viList?.snap).toBe(true);
    expect(viList?.items).toHaveLength(3);

    // 페이지는 전략을 따로 요청하지 않는다 — 구독이 0건인 채로 다 왔다.
    expect(h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX")).toBe(0);
  });

  it("⑭ 0건도 프레임이 오지만, VI 를 아직 모르면 vi 프레임은 오지 않는다", async () => {
    // (A) 조회 결과 **미등록**(`null`) — 확정 정보이므로 `cfg:null` 을 보낸다.
    gateway.respondViTrigger(null);
    await authed("token-a");
    await waitFor(() => h.hub.getViTrigger(USER_A) === null, "미등록 확정");

    const tabA = await open();
    tabA.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabA.inbox, "vi.list").length === 1, "A 새 탭 스냅샷");
    await flushIo(20);

    expect(framesOf(tabA.inbox, "lc.snap")[0]).toEqual({ t: "lc.snap", items: [] });
    expect(framesOf(tabA.inbox, "vi")[0]).toEqual({ t: "vi", cfg: null });
    expect(framesOf(tabA.inbox, "vi.list")[0]).toEqual({ t: "vi.list", snap: true, items: [] });

    // (B) **아직 모른다**(`undefined`) — 로그인이 끝나지 않아 61 을 받은 적이 없다.
    //     지어낸 「미등록」을 내리면 브라우저가 사용자가 입력 중인 금액을 지운다.
    gateway.silenceLogin();
    const tabB = await open();
    tabB.ws.sendAuth("token-b");
    await waitFor(() => framesOf(tabB.inbox, "vi.list").length === 1, "B 스냅샷");
    await flushIo(20);

    expect(h.hub.getViTrigger(USER_B)).toBeUndefined();
    expect(framesOf(tabB.inbox, "vi")).toHaveLength(0);
    expect(framesOf(tabB.inbox, "lc.snap")[0]).toEqual({ t: "lc.snap", items: [] });
    expect(framesOf(tabB.inbox, "vi.list")[0]).toEqual({ t: "vi.list", snap: true, items: [] });
  });

  it("⑮ dma_credentials 미등록은 전략 스냅샷도 전략 전송도 받지 못한다 (D-04)", async () => {
    const { ws, inbox } = await open();

    ws.sendAuth("token-none");
    await waitFor(() => inbox.length > 0, "unauthorized 상태 프레임");
    await flushIo(20);

    // 상태 프레임 **하나뿐**이다 — 전략 3프레임이 섞이지 않는다.
    expect(inbox).toEqual([{ t: "state", s: "unauthorized" }]);

    ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(() => inbox.length > 1, "전략 거부 상태 프레임");
    await flushIo(20);

    expect(inbox[1]).toEqual({ t: "state", s: "unauthorized" });
    expect(gateway.strategyRequests()).toHaveLength(0);
    expect(ws.closeInfo).toBeNull();
  });

  it("⑯ 허용 목록 밖 계좌의 lc.set 은 게이트웨이로 0바이트다 (T-16-01)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput({ accountNo: FOREIGN_ACCOUNT_NO }) });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    // ① 게이트웨이로 **아무것도 나가지 않았다** — 서버측 2중 차단에 기대지 않는다.
    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    // ② 사유가 사용자에게 돌아간다(조용한 거부 금지). `src` 로 게이트웨이 통지와 구분된다.
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE });
    expect(rejected?.a).toBe(FOREIGN_ACCOUNT_NO);
    // ③ 로그에도 남는다 — 계좌번호는 마스킹본이라 원문이 실리지 않는다 (S-5 / T-16-09).
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("세션 계좌 목록 밖"),
    );
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(FOREIGN_ACCOUNT_NO);
  });

  it("⑰ 허용 계좌의 lc.set 은 msg_type 10 으로 나가고 절단 폭을 지킨다", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );

    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    const lc = rootEnvelope(req!.payload).setLimitChaser();
    expect(lc?.isin()).toBe(SAMPLE_ISIN);
    expect((lc?.isin() ?? "").length).toBe(12);
    expect(lc?.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    // 서버가 12자 버퍼에 담으므로 relay 가 같은 폭으로 먼저 자른다 — 자른 값이 전략 키의 정본이다.
    expect((lc?.accountNo() ?? "").length).toBeLessThanOrEqual(12);
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  /*
    WR-03 / D-28 — 시장 구분의 소유자는 relay 다.

    브라우저는 `market` 을 **싣지 않는다**(`lcInput()` 에 그 키가 없다). 그런데도 게이트웨이로
    나간 `SetLimitChaserReq` 의 market 이 KOSDAQ(`"Q"`) 이라면, relay 가 `SymbolMap` 으로 풀어
    채웠다는 뜻이다. 옛 브라우저는 `row.market === 'KOSDAQ' ? 'Q' : 'K'` 로 **추측**했고
    KONEX·`null` 이 조용히 KOSPI 가 됐다 (Pitfall 7 「엉뚱한 시장으로 주문이 나간다」).
  */
  it("⑰-a lc.set 의 시장은 relay 가 ISIN 으로 채운다 — KOSDAQ 종목은 \"Q\" 로 나간다 (WR-03)", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput({ isin: OTHER_ISIN }) });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );

    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    const lc = rootEnvelope(req!.payload).setLimitChaser();
    expect(lc?.isin()).toBe(OTHER_ISIN);
    // 브라우저가 아무것도 안 실었는데 시장이 채워져 있다 — 그 값의 출처가 `SymbolMap` 이다.
    expect(lc?.market()).toBe("Q");
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  it("⑰-b SymbolMap 이 모르는 ISIN 의 lc.set 은 거부 프레임이 나가고 게이트웨이로 0바이트다", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput({ isin: UNKNOWN_ISIN }) });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    // ① 기본값 "K" 로 메우지 않는다 — 아무것도 나가지 않았다.
    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    // ② 사유가 사용자에게 돌아간다. 형태는 기존 전략 거부 프레임과 **같다**(새 종류를 만들지 않는다).
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: UNKNOWN_ISIN });
    expect(rejected?.m).toContain("전략을 등록할 수 없습니다");
    // ③ 로그에 계좌번호가 실리지 않는다 (T-16-45).
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("ISIN → 시장 해석 실패"),
    );
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  /*
    WR-06 — 「켜졌는데 아무 일도 안 하는」 전략을 만들 수 없게 한다.

    `UIntSchema` 는 `min(0)` 이라 0 을 통과시킨다. 스키마가 못 잡으므로 **조립 단계가 마지막
    관문**이다 — UI 를 우회한 경로(직접 wss·옛 탭)가 있어도 무장 상태가 만들어지면 안 된다.
  */
  it("⑰-c 발주가 0 인 매수 무장 lc.set 은 거부되고 게이트웨이로 0바이트다 (WR-06)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ buyEnabled: true, buyOrderPrice: 0, buyOrderQty: 0 }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: SAMPLE_ISIN });
    expect(rejected?.m).toContain("전략을 켤 수 없습니다");
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("발주가·수량 0 인 게이트 무장"),
    );
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("⑰-d 게이트가 꺼져 있으면 값이 0 이어도 통과한다 — 과잉 차단도 조용한 거부다", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ buyEnabled: false, buyOrderPrice: 0, buyOrderQty: 0, sellEnabled: false }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);

    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  /*
    GC-WR-04 — 「시장을 못 푸는 종목의 전략을 내릴 수 없다」를 없앤다.

    상장폐지로 `stocks` 에서 빠졌거나 relay 부팅 직후 `symbols.start()` 가 아직 안 끝났으면
    `SymbolMap` 은 그 ISIN 을 못 푼다. 그 상태에서 **등록·수정과 삭제가 함께** 막히면 사용자는
    자기 전략을 영원히 못 지운다 — UI 가 `gateBlocked` 에 「끄는 것은 언제나 허용한다」(T-16-44)
    라고 적어 둔 규율의 서버측이 이 두 케이스다.
  */
  it("⑰-e SymbolMap 이 모르는 ISIN 이어도 **게이트 4종이 전부 꺼진** 철거는 거부 없이 게이트웨이로 나간다 (GC-WR-04)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    // ★ 게이트 4종을 **명시적으로 전부** 끈다. `lcInput()` 기본값이 `buyEnabled: true` 라
    //   헬퍼에 기대면 이 케이스는 「진짜 철거」가 아니라 **스푸핑 조합**(crud:"D" + 게이트 ON)을
    //   태우게 된다 — 실제로 16-29 판 ⑰-e 가 그랬고, 그 상태로 초록이었다(R2-CR-01).
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({
        isin: UNKNOWN_ISIN,
        crud: "D",
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);

    // ① 거부 프레임이 0 건이다 — 자산을 인질로 잡지 않는다.
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
    // ② 실제로 나갔고, 폴백 시장이 실려 있다. 전략 키(`ISIN:계좌:거래소`)에 시장이 없으므로
    //    이 값은 「무엇을 지울지」에 관여하지 않는다.
    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    const lc = rootEnvelope(req!.payload).setLimitChaser();
    expect(lc?.isin()).toBe(UNKNOWN_ISIN);
    expect(lc?.crud()).toBe("D");
    expect(lc?.market()).toBe("K");
    // ③ 조용한 폴백이 아니다 — 운영 신호가 로그로 남고, 계좌번호는 실리지 않는다 (S-5 / T-16-45).
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("시장 미해석 상태의 전략 삭제"),
    );
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("⑰-e2 삭제의 시장은 **에코 캐시가 1순위**다 — 종목맵이 못 풀어도 폴백까지 가지 않는다", async () => {
    // 서버가 그 전략을 KOSDAQ("Q") 로 저장했다고 에코한다. `SymbolMap` 은 이 ISIN 을 모른다.
    gateway.respondLimitChaserList([
      { isin: UNKNOWN_ISIN, accountNo: SAMPLE_ACCOUNT_NO, market: "Q" },
    ]);
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");
    await waitFor(() => h.hub.getLimitChasers(USER_A).length === 1, "상따 캐시 1건");

    // ⑰-e 와 같은 이유로 게이트 4종을 명시적으로 끈다 — 철거의 정본은 `crud` 가 아니라 게이트다.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({
        isin: UNKNOWN_ISIN,
        crud: "D",
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);

    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    // 폴백("K") 이 아니라 **서버가 저장했다고 말한 값**이 나간다.
    expect(rootEnvelope(req!.payload).setLimitChaser()?.market()).toBe("Q");
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
    expect(
      errSpy.mock.calls.some((call) =>
        String(call[1] ?? "").includes("시장 미해석 상태의 전략 삭제"),
      ),
    ).toBe(false);
  });

  /*
    R2-CR-01 — **클라이언트의 자칭을 서버 가드의 면제 조건으로 쓰지 않는다.**

    `crud` 는 인바운드 필드다(`protocol.ts` `z.enum(["C","D"])`). 그것을 철거 판정의 단독
    근거로 쓰면 `{crud:"D", buyEnabled:true, …}` 한 프레임이 시장 해석 엄격성(T-16-42)과
    무장 가드(T-16-43)를 **동시에** 지나 「시장이 틀리고 무장까지 걸린 반복 발주 설정」이
    게이트웨이로 나간다. 아래 두 케이스는 **실패 원인이 서로 다르다** — 각각 다른 가드가
    살아 있음을 가른다.
  */
  it("⑰-e3 crud:\"D\" 라고 자칭해도 게이트가 켜져 있으면 시장 해석 엄격성이 그대로 걸린다 (R2-CR-01 / T-16-42)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    // 자칭은 삭제인데 매수 게이트가 켜져 있다 — 계약상 존재할 수 없는 조합이고, 옛 판정에서는
    // 이 프레임이 `#teardownMarket` 의 폴백("K")을 타고 그대로 나갔다.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ isin: UNKNOWN_ISIN, crud: "D", buyEnabled: true }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    // (a) 게이트웨이로 **나가지 않았다**.
    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    // (b) 거부 프레임 1건이 브라우저로 갔다 — 등록 경로의 문구다.
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: UNKNOWN_ISIN });
    expect(rejected?.m).toContain("전략을 등록할 수 없습니다");
    // (c) `crud` 불일치가 운영 신호로 남고, 계좌번호는 실리지 않는다 (S-5 / T-16-45).
    const mismatch = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("게이트가 켜져 있다"),
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.[0]).toMatchObject({ isin: UNKNOWN_ISIN, crud: "D" });
    expect(JSON.stringify(mismatch?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
    // 삭제 폴백 로그는 **없다** — 이 프레임은 철거 경로로 가지 않았다.
    expect(
      errSpy.mock.calls.some((call) =>
        String(call[1] ?? "").includes("시장 미해석 상태의 전략 삭제"),
      ),
    ).toBe(false);
  });

  it("⑰-e4 시장이 풀려도 crud:\"D\" 자칭은 무장 가드를 면제받지 못한다 (R2-CR-01 / T-16-43)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    // ⑰-e3 과 달리 ISIN 은 `SymbolMap` 이 푸는 값이다 — 시장 해석은 통과하고 **무장 가드**가
    // 잡는다. 두 케이스의 실패 원인이 갈려야 두 가드가 각각 살아 있음이 증명된다.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ isin: SAMPLE_ISIN, crud: "D", buyEnabled: true, buyOrderQty: 0 }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: SAMPLE_ISIN });
    expect(rejected?.m).toContain("전략을 켤 수 없습니다");
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("발주가·수량 0 인 게이트 무장"),
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ gate: "buy" });
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("⑰-e5 반대 방향의 대칭 — crud:\"C\" 라도 게이트 4종이 전부 꺼졌으면 철거로 통과한다 (기존 ② 갈래 회귀)", async () => {
    const a = await authed("token-a");

    // `crudOf()` 는 브라우저에만 있다 — 옛 탭·직접 wss 는 게이트를 다 끄고도 `"C"` 로 보낸다.
    // 게이트웨이가 어차피 `"D"` 로 정규화하므로 이것도 철거이고, 시장 해석 실패로 막지 않는다.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({
        isin: UNKNOWN_ISIN,
        crud: "C",
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);

    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    expect(rootEnvelope(req!.payload).setLimitChaser()?.isin()).toBe(UNKNOWN_ISIN);
  });

  it("⑰-f 같은 ISIN 이라도 crud:\"C\" 는 여전히 거부된다 — 등록의 엄격함은 그대로다 (16-25 회귀)", async () => {
    const a = await authed("token-a");

    // 게이트가 켜진 등록 요청이다(전 게이트 OFF 였다면 그것은 사실상 삭제라 통과가 옳다).
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ isin: UNKNOWN_ISIN, crud: "C", buyEnabled: true }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: UNKNOWN_ISIN });
    expect(rejected?.m).toContain("전략을 등록할 수 없습니다");
  });

  /*
    GC-WR-05 — 마지막 관문이 첫 관문보다 느슨하면 안 된다.

    이 검사의 존재 이유가 「UI 를 우회한 경로(직접 wss·옛 탭)가 있어도 무장 상태가 만들어지면
    안 된다」(T-16-43)이므로, relay 는 UI 의 `canArmBuy`·`canArmSell`·`canArmSweep` **세 식과
    동형**이어야 한다. 아래 두 조합은 UI 가 스위치를 못 켜게 막는 값인데 relay 는 통과시켰다.
  */
  it("⑰-g sellEnabled + sellWatchQty 0 은 거부된다 — UI canArmSell 과 동형 (GC-WR-05)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    // 매도가는 정상이다 — 옛 갈래(`sellOrderPrice === 0`)로는 잡히지 않는 조합이다.
    // `sellWatchQty === 0` 은 계약이 「0 이면 서버가 매도 활성화를 거부(눕힘)한다」고 못박은 값.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ sellEnabled: true, sellOrderPrice: 71_000, sellWatchQty: 0 }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: SAMPLE_ISIN });
    expect(rejected?.m).toContain("전략을 켤 수 없습니다");
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("발주가·수량 0 인 게이트 무장"),
    );
    expect(logged).toBeDefined();
    expect(logged?.[0]).toMatchObject({ gate: "sell" });
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("⑰-h sweepEnabled + sweepWatchPrice 0 은 거부된다 — UI canArmSweep 과 동형 (GC-WR-05)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ sweepEnabled: true, sweepWatchPrice: 0 }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("발주가·수량 0 인 게이트 무장"),
    );
    expect(logged?.[0]).toMatchObject({ gate: "sweep" });
  });

  it("⑰-h2 한방은 **매수 무장 조건**을 함께 요구한다 — buyEnabled 가 꺼져 있어도 마찬가지다", async () => {
    const a = await authed("token-a");

    // 매도만 켜 둬 「전 게이트 OFF = 삭제」로 새지 않게 한다. 한방 감시가는 정상이고
    // 막히는 이유는 **매수 발주수량 0** 이다 — `canArmSweep = sweepWatchPrice > 0 && canArmBuy`.
    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({
        buyEnabled: false,
        buyOrderQty: 0,
        sellEnabled: true,
        sweepEnabled: true,
        sweepWatchPrice: 71_400,
      }),
    });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);

    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
  });

  it("⑱ vi.confirm 은 계좌 대조를 건너뛰고 msg_type 33 으로 나간다", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "vi.confirm", orderNo: "0000012345", confirmed: true });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.ConfirmVIOrderReq),
      "33 수신",
    );
    await flushIo(20);

    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.ConfirmVIOrderReq);
    const confirm = rootEnvelope(req!.payload).confirmViOrderReq();
    expect(confirm?.orderNo()).toBe("0000012345");
    expect(confirm?.confirmed()).toBe(true);
    // 계좌 필드가 없으므로 대조 단계를 타지 않는다 — 거부 프레임이 없다.
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  it("⑲ key 를 생략한 strategies.disable 은 msg_type 14 에 빈 키로 나간다", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "strategies.disable" });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.DisableStrategiesReq),
      "14 수신",
    );
    await flushIo(20);

    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.DisableStrategiesReq);
    // `""` = 그 세션의 상따 전부 + VI. 등록은 유지하고 발주 게이트만 내린다.
    expect(rootEnvelope(req!.payload).disableStrategiesReq()?.key()).toBe("");
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  it("⑳ lc.set 처리가 sub 경로의 키 계산을 건드리지 않는다 (Pitfall 14 회귀)", async () => {
    const a = await authed("token-a");

    a.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 1, "구독 성립");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "전략 요청 수신",
    );
    await flushIo(30);

    // 전략 메시지는 구독 회계에 손대지 않는다.
    expect(h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX")).toBe(1);

    // `undefined|undefined` 키가 만들어졌다면 이 해제가 「잡지 않은 키」로 무시된다.
    a.ws.sendUnsub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(USER_A, SAMPLE_ISIN, "KRX") === 0, "구독 해제");
  });

  it("㉑ 인바운드 상한을 넘긴 프레임은 게이트웨이로 나가지 않고 경고는 1회다 (T-16-06)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const a = await authed("token-a");

    const overflow = 5;
    for (let i = 0; i < INBOUND_RATE_LIMIT_PER_SEC + overflow; i += 1) {
      a.ws.sendRaw({ t: "vi.confirm", orderNo: `000000000${i % 10}`, confirmed: true });
    }

    await waitFor(
      () => gateway.strategyRequests().length >= INBOUND_RATE_LIMIT_PER_SEC,
      "상한까지 통과",
    );
    await flushIo(40);

    expect(gateway.strategyRequests()).toHaveLength(INBOUND_RATE_LIMIT_PER_SEC);
    // 건마다 로그하면 로그가 곧 두 번째 DoS 다 — 초과 구간당 1회로 묶는다.
    const overflowWarns = warnSpy.mock.calls.filter((call) =>
      String(call[1] ?? "").includes("인바운드 상한 초과"),
    );
    expect(overflowWarns).toHaveLength(1);
    // 연결은 끊지 않는다 — 과속은 프로토콜 위반이 아니다.
    expect(a.ws.closeInfo).toBeNull();
  });

  it("㉒ 다른 사용자의 전략 스냅샷은 절대 넘어가지 않는다 (T-16-02)", async () => {
    gateway.respondLimitChaserList([{ isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO }]);
    const a = await authed("token-a");
    await waitFor(() => h.hub.getLimitChasers(USER_A).length === 1, "A 전략 캐시");

    gateway.respondLimitChaserList([{ isin: OTHER_ISIN, accountNo: SAMPLE_ACCOUNT_NO }]);
    const b = await authed("token-b");
    await waitFor(() => h.hub.getLimitChasers(USER_B).length === 1, "B 전략 캐시");
    await flushIo(30);

    const aIsins = framesOf(a.inbox, "lc.snap").flatMap((m) => m.items.map((i) => i.isin));
    const bIsins = framesOf(b.inbox, "lc.snap").flatMap((m) => m.items.map((i) => i.isin));

    expect(aIsins).toEqual([SAMPLE_ISIN]);
    expect(bIsins).toEqual([OTHER_ISIN]);
  });
});
