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
 * Phase 26 Plan 03 — 시세 업스트림은 **quote 연결 하나**다(D-12). 하네스는 사용자 세션 게이트웨이와 **별도의** 스텁
 * 인스턴스(`quoteGateway`)에 실 `QuoteFeed`(role 1)를 붙이고 `hub.attachFeed` 로 결선한다 — 운영은 같은 서버지만 relay 는
 * 연결마다 host/port 를 따로 받고, 사용자 게이트웨이 첫 소켓을 쓰는 기존 케이스 수십 개를 흔들지 않기 위해서다.
 * 시세 주입은 quote 소켓으로, 28/29/32 단언은 quote 게이트웨이 수신으로 하고, 사용자 게이트웨이로 나간 28/29/32 는 0 이어야
 * 한다. ⑦ 은 Phase 26 트레이서(두 사용자 × 같은 종목)로 교체됐다(RESEARCH Pitfall 9).
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
import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayAccount, RelayOutbound } from "@gh-radar/shared";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";

import {
  AUTH_TIMEOUT_MS,
  INBOUND_RATE_LIMIT_PER_SEC,
  RELAY_MSG_SOURCE,
  WsFanout,
  type WsFanoutDeps,
} from "../src/ws/fanout.js";
import {
  LINGER_MS,
  PRICE_MIN_INTERVAL_MS,
  SubscriptionHub,
  TAPE_BATCH_MS,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { QuoteFeed } from "../src/quote/feed.js";
import { QUOTE_DOWN_AFTER_MS, QuoteStatus } from "../src/quote/status.js";
import type { DmaSession } from "../src/dma/session.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import {
  droppedEnvelopeCount,
  resetDroppedEnvelopeCount,
  tryParseEnvelope,
  type LcSetCfg,
} from "../src/dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { LC_LEGACY_SET_REJECT_TEXT } from "../src/ws/protocol.js";
import { logger } from "../src/logger.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import {
  readSetLimitChaserRequest,
  readSubscribeRequest,
  readViSetRequest,
  startFakeGateway,
  type FakeGateway,
  type SubscribeRequest,
} from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  STRATEGY_MSG,
  buildBareEnvelope,
  buildLoginRespFrame,
  buildQueueProgressFrame,
  buildQueuedWindowStateFrame,
} from "./helpers/frames.js";

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
 * 세션 교체 대역 (25-13 · WR-02) — `hub.attach` 로 같은 사용자의 **다른 세션 객체**를 붙여 교체를 만든다.
 *
 * 교체를 `SessionManager` 가 아니라 `h.hub.attach` 로 만드는 이유: 오늘 `SessionManager.acquire` 는
 * refCount 0(그 사용자의 탭 0개)이고 부트 실패 세션일 때만 세션을 새로 세운다. 그래서 탭이 연결된 채
 * 교체되는 상황을 실 경로로는 만들 수 없다. `fanout.ts` `#register` 세션 교체 갈래와 같은
 * 「오늘 미도달 · 계약은 지킨다」 경계를 hub → `WsFanout` → 실 ws 로 증명한다 — 재생성 조건이 완화되면
 * 이 경로가 조용히 살아나기 때문이다.
 *
 * `pushFrame` 은 hub.test.ts `FakeSession.pushFrame` 과 같은 방식이다 — 수신 화이트리스트 파서를 거친다.
 */
class ReplacementSession extends EventEmitter implements HubSession {
  isReady = true;
  /** 게이트웨이 로그인 응답 기본 계좌(`SAMPLE_ACCOUNTS`)와 같은 목록 — 실 세션과 같은 허용 계좌다. */
  readonly allowedAccounts: readonly RelayAccount[] = SAMPLE_ACCOUNTS.map((a) => ({ accountNo: a.accountNo, name: a.name ?? "" }));

  constructor(readonly userId: string) {
    super();
  }

  send(): boolean {
    return true;
  }

  /** 게이트웨이가 새 세션으로 프레임을 밀어 넣는 상황을 재현한다. */
  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }
}

/**
 * `lc.set` 이 싣는 43필드(31 + Phase 24 C→S 12 — 감시대상은 Phase 24 ⑤ 로 빠졌다) — 스키마를 통과하는 최소 정상값.
 *
 * S→C 전용 4필드와 파생 `key` 는 타입이 이미 뺐다(`RelayLimitChaserInput`) — 실어 보내면
 * "값이 왕복한다"는 착각이 생겨 에코-폼 비교가 오염된다 (Pitfall 6).
 * `market` 도 없다 — relay 가 ISIN 으로 푼다 (WR-03 / D-28).
 */
function lcInput(overrides: Partial<LcSetCfg> = {}): LcSetCfg {
  return {
    isin: SAMPLE_ISIN,
    accountNo: SAMPLE_ACCOUNT_NO,
    crud: "C",
    buyOrderPrice: 70_000,
    buyOrderQty: 10,
    buyWatchPrice: 69_900,
    buyWatchQty: 100,
    buyMinTradeQty: 1,
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
    // Phase 24 C→S 12 — 기본 전부 끔 · 0.
    preBuyEnabled: false,
    extraBuyEnabled: false,
    extraBuyMinQty: 0,
    extraBuyMaxQty: 0,
    extraBuyOrderAmount: 0,
    extraBuyOrderQty: 0,
    postBuyEnabled: false,
    postBuyReboundPct: 0,
    postBuyFloorQty: 0,
    postBuyReentry: 0,
    postBuyOrderAmount: 0,
    postBuyOrderQty: 0,
    ...overrides,
  };
}

/** Phase 24 C→S 12 — 구 탭 cfg 에서 뺄 키. */
const BUY3_KEYS = [
  "preBuyEnabled",
  "extraBuyEnabled",
  "extraBuyMinQty",
  "extraBuyMaxQty",
  "extraBuyOrderAmount",
  "extraBuyOrderQty",
  "postBuyEnabled",
  "postBuyReboundPct",
  "postBuyFloorQty",
  "postBuyReentry",
  "postBuyOrderAmount",
  "postBuyOrderQty",
] as const;

/**
 * 새로고침 전 옛 탭의 `lc.set` cfg — `lcInput` 에서 신필드 12개를 빼고 감시대상 `"1"` 을 싣는다(F-4).
 */
function legacyCfg(overrides: Partial<LcSetCfg> = {}): Record<string, unknown> {
  const cfg: Record<string, unknown> = { ...lcInput(overrides), buyWatchSide: "1" };
  for (const k of BUY3_KEYS) delete cfg[k];
  return cfg;
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

/** quote 관찰자 비밀 — 테스트 전용 값. 실서버 비밀 · 호스트 리터럴은 쓰지 않는다 (D-27 · T-26-07). */
const QUOTE_SECRET = "test-quote-secret-only";

/** 시세 요청 3종 — Phase 26 부터 사용자 세션 게이트웨이로는 0건이어야 한다 (D-08). */
const QUOTE_REQ_TYPES = new Set<number>([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);

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
  /** 시세 전용 공유 연결 (Phase 26 — 실 `QuoteFeed` · quote 스텁 게이트웨이). */
  feed: QuoteFeed;
  /** quote 연결 상태 원천 (Phase 26 D-01 · 26-12). `startHarness` 세 번째 인자 `quoteStatus: true` 일 때만 있다. */
  quoteStatus: QuoteStatus | null;
  acquireSpy: ReturnType<typeof vi.spyOn>;
  releaseSpy: ReturnType<typeof vi.spyOn>;
  close: () => Promise<void>;
};

describe("WsFanout", () => {
  let gateway: FakeGateway;
  /** quote 연결 전용 스텁 게이트웨이 (Phase 26 — role 1 로그인 자동 응답). */
  let quoteGateway: FakeGateway;
  /** quote 연결의 게이트웨이 측 소켓 — 시세 주입처. */
  let quoteSock: Awaited<ReturnType<FakeGateway["waitForQuoteConnection"]>>;
  let h: Harness;
  const sockets: TestWs[] = [];
  /** 사용자 세션 게이트웨이가 받은 요청 프레임 종류 누적. */
  let gatewayMsgTypes: number[];
  /** quote 게이트웨이가 받은 요청 프레임 종류 누적. */
  let quoteMsgTypes: number[];
  /** quote 게이트웨이가 받은 29 되읽기 누적. */
  let quoteSubscribes: SubscribeRequest[];

  /** 사용자 세션 게이트웨이로 나간 시세 요청(28/29/32) 수 — Phase 26 에서 0 이어야 한다. */
  const userQuoteReqCount = (): number => gatewayMsgTypes.filter((t) => QUOTE_REQ_TYPES.has(t)).length;

  async function startHarness(
    overrides: Partial<WsFanoutDeps> = {},
    hubOpts?: ConstructorParameters<typeof SubscriptionHub>[0],
    harnessOpts: { quoteStatus?: boolean } = {},
  ): Promise<Harness> {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const hub = new SubscriptionHub(hubOpts);
    const sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
    const acquireSpy = vi.spyOn(sessions, "acquire");
    const releaseSpy = vi.spyOn(sessions, "release");

    // 시세 업스트림 = quote 연결 하나 (Phase 26 D-12). 부팅 결선(index.ts)은 26-04 — 여기서는 테스트가 직접 붙인다.
    // 상태 원천(`QuoteStatus`)이 fanout deps 로 들어가야 해서 feed 를 fanout 보다 먼저 만든다(시작은 아래).
    const feed = new QuoteFeed({ secret: QUOTE_SECRET, host: "127.0.0.1", port: quoteGateway.port });
    // index.ts 결선과 같은 모양 — `new QuoteStatus({ feed, hubStats: () => hub.stats() })` (26-12).
    const quoteStatus = harnessOpts.quoteStatus === true ? new QuoteStatus({ feed, hubStats: () => hub.stats() }) : null;

    const fanout = new WsFanout({
      server,
      supabase: fakeSupabase(),
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      // 종목맵은 **전략 분기의 전제**다 (WR-03) — 없으면 `lc.set` 이 전부 거부된다.
      symbols: SYMBOLS,
      ...(quoteStatus !== null ? { quoteState: quoteStatus } : {}),
      ...overrides,
    });
    quoteStatus?.on("frame", (frame) => fanout.deliverQuoteState(frame));

    hub.attachFeed(feed);
    feed.start();
    await waitFor(() => feed.isReady, "quote 연결 ready");

    return {
      port,
      server,
      fanout,
      hub,
      sessions,
      feed,
      quoteStatus,
      acquireSpy,
      releaseSpy,
      close: async () => {
        quoteStatus?.close();
        feed.stop();
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
    quoteMsgTypes = [];
    quoteSubscribes = [];
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    gateway.onFrame((msgType) => gatewayMsgTypes.push(msgType));
    quoteGateway = await startFakeGateway();
    quoteGateway.respondQuoteLogin({ success: true });
    quoteGateway.onFrame((msgType, payload) => {
      quoteMsgTypes.push(msgType);
      const sub = readSubscribeRequest(msgType, payload);
      if (sub !== null) quoteSubscribes.push(sub);
    });
    h = await startHarness();
    quoteSock = await quoteGateway.waitForQuoteConnection();
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    await h.close();
    await gateway.close();
    await quoteGateway.close();
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
    // 미등록 사용자의 sub 은 전역 참조계수에 닿지 않는다 (D-09 — 공유 캐시 · quote 구독도 못 연다).
    expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
    expect(quoteMsgTypes.filter((t) => QUOTE_REQ_TYPES.has(t))).toHaveLength(0);
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

  it("⑥ 같은 사용자 탭 2개는 quote 연결 구독 1건을 공유하고 둘 다 시세를 받는다", async () => {
    const first = await authed("token-a");
    const second = await authed("token-a");

    first.ws.sendSub(SAMPLE_ISIN, "KRX");
    second.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "두 탭의 참조계수");
    await waitFor(() => quoteMsgTypes.includes(MSG.SubscribeQuoteReq), "quote 연결 구독 요청 수신");

    // 탭이 2개여도 KB 방향 구독은 1건이고, 그 1건은 quote 연결로 나간다 (Phase 26 D-12).
    expect(quoteMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq)).toHaveLength(1);
    expect(userQuoteReqCount()).toBe(0);
    expect(gateway.sockets).toHaveLength(1);

    quoteGateway.pushQuote(quoteSock, { snapshot: true, lastPrice: 70_950n });

    await waitFor(
      () => first.inbox.some((m) => m.t === "q") && second.inbox.some((m) => m.t === "q"),
      "두 소켓 모두 시세 수신",
    );
    const quote = first.inbox.find((m) => m.t === "q");
    expect(quote).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", p: 70_950 });
  });

  // 옛 ⑦ 「다른 사용자의 시세는 절대 넘어가지 않는다 (T-15-02)」 는 시세가 사용자별 세션으로 오던 전제였다(Pitfall 9).
  // Phase 26 에서 시세는 공개 공유 원천이고, 지키려던 것은 둘로 갈린다 — ① 그 키를 **잡은 소켓만** 받는다(잡지 않은
  // 소켓 · 자격증명 미등록 소켓 0건 · D-09) ② 사용자 데이터 격리는 ㉒ · P2 · 계좌 케이스가 그대로 지킨다.
  it("⑦ Phase 26 트레이서 — 두 사용자 같은 종목: quote 연결 구독 한 벌(+ 두 번째 사용자 넛지 29 1) · 사용자 세션 29 0 · 캐시 공유 · 구독 소켓만 수신 · 미등록 0", async () => {
    const a = await authed("token-a");
    const a2 = await authed("token-a");
    const b = await authed("token-b");
    await waitFor(() => gateway.sockets.length === 2, "A · B 사용자 세션 연결");

    const u = await open();
    u.ws.sendAuth("token-none");
    await waitFor(() => u.inbox.some((m) => m.t === "state" && m.s === "unauthorized"), "U unauthorized");

    // quote 로그인은 role 1 · 전용 client 로 나갔다 (26-02 · 서버 로그에서 저널 관찰자와 갈린다).
    const logins = quoteGateway.quoteLoginRequests();
    expect(logins).toHaveLength(1);
    expect(logins[0]).toMatchObject({ role: 1, client: "gh-radar-relay/quote" });

    a.ws.sendSub(SAMPLE_ISIN, "KRX");
    b.ws.sendSub(SAMPLE_ISIN, "KRX");
    u.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "A · B 전역 참조계수 2");
    await waitFor(() => quoteMsgTypes.includes(MSG.GetTradeTapeReq), "quote 연결 체결 요청 수신");
    await waitFor(() => u.inbox.filter((m) => m.t === "state" && m.s === "unauthorized").length === 2, "U 구독 거부");
    await flushIo(20);

    // 업스트림 구독은 quote 연결 한 벌 — 28 → 29(true · level 0) → 32 각 1건. 두 번째로 연 사용자의 첫 참조는 같은 level 의
    // 29 넛지 1건을 더한다(26-11 Pattern 10 — 서버 83 재송신 트리거). 28 · 32 는 여전히 1건이다.
    await waitFor(() => quoteSubscribes.length === 2, "두 번째 사용자 첫 참조 넛지");
    expect(quoteMsgTypes.filter((t) => t === MSG.GetQuoteReq)).toHaveLength(1);
    expect(quoteMsgTypes.filter((t) => t === MSG.GetTradeTapeReq)).toHaveLength(1);
    expect(quoteSubscribes).toEqual([
      { isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true, level: 0 },
      { isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true, level: 0 },
    ]);
    // 사용자 세션으로 나간 28/29/32 는 0건 (D-08 · D-12).
    expect(userQuoteReqCount()).toBe(0);

    quoteGateway.pushQuote(quoteSock, { snapshot: true, lastPrice: 71_500n });
    await waitFor(
      () => framesOf(a.inbox, "q").length === 1 && framesOf(b.inbox, "q").length === 1,
      "A · B 스냅샷 수신",
    );
    await flushIo(20);
    expect(framesOf(a.inbox, "q")[0]).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", p: 71_500 });
    expect(framesOf(b.inbox, "q")[0]).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", p: 71_500 });
    // 그 키를 잡지 않은 소켓(같은 사용자의 두 번째 탭)과 자격증명 미등록 소켓은 0건.
    expect(framesOf(a2.inbox, "q")).toHaveLength(0);
    expect(framesOf(u.inbox, "q")).toHaveLength(0);

    // 캐시가 찬 뒤 새 탭이 같은 키를 잡으면 게이트웨이 재요청 없이 즉시 받는다 (유저 간 캐시 공유).
    a2.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => framesOf(a2.inbox, "q").length === 1, "A2 캐시 즉시 응답");
    expect(framesOf(a2.inbox, "q")[0]).toMatchObject({ p: 71_500, snap: true });
    expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(3);
    await flushIo(20);
    expect(quoteMsgTypes.filter((t) => t === MSG.GetQuoteReq)).toHaveLength(1);
    // A 는 이 세션에서 이미 본 키다 — 두 번째 탭은 넛지 0 (D-10).
    expect(quoteSubscribes).toHaveLength(2);

    // 갱신(59) 한 건이 세 구독 소켓에 각 1건씩 — 미등록 소켓은 여전히 0건.
    quoteGateway.pushQuote(quoteSock, { snapshot: false, lastPrice: 71_600n });
    await waitFor(
      () => [a.inbox, b.inbox, a2.inbox].every((inbox) => framesOf(inbox, "q").some((q) => q.p === 71_600)),
      "A · B · A2 갱신 수신",
    );
    await flushIo(20);
    for (const inbox of [a.inbox, b.inbox, a2.inbox]) {
      expect(framesOf(inbox, "q").filter((q) => q.p === 71_600)).toHaveLength(1);
    }
    expect(framesOf(u.inbox, "q")).toHaveLength(0);
    expect(userQuoteReqCount()).toBe(0);
    expect(h.hub.unhandledFrameCount()).toBe(0);
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
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "참조계수 2");
    await waitFor(() => quoteSubscribes.length === 1, "quote 연결 구독");

    await first.ws.close();
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 1, "참조계수 1로 감소");
    expect(h.releaseSpy).toHaveBeenCalledTimes(1);
    // 남은 탭의 구독은 살아 있다 — 해제 프레임이 나가지 않았다.
    expect(quoteMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq)).toHaveLength(1);

    await second.ws.close();
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 0, "참조계수 0");
    expect(h.releaseSpy).toHaveBeenCalledTimes(2);
    // 마지막 소비자가 떠나도 linger(D-10) 동안은 업스트림 구독이 남는다 — 해제 프레임이 아직 없다.
    expect(h.hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(true);
    await flushIo(20);
    expect(quoteSubscribes).toHaveLength(1);
    // linger 만료에서만 subscribe:false 가 quote 연결로 나간다(요청 프레임 2건 = 구독 + 해제).
    vi.advanceTimersByTime(LINGER_MS);
    await waitFor(() => quoteSubscribes.length === 2, "linger 만료 뒤 업스트림 구독 해제");
    expect(quoteSubscribes[1]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX", subscribe: false });
    expect(h.hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);
    expect(userQuoteReqCount()).toBe(0);
  });

  it("⑩ 스키마 위반(ISIN 길이)은 close(4400) 이다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "sub", isin: "KR700593", ex: "KRX" });
    await waitFor(() => ws.closeInfo !== null, "스키마 위반 close");

    expect(ws.closeInfo?.code).toBe(4400);
    expect(h.hub.refCount("KR700593", "KRX")).toBe(0);
  });

  // ⑪ 은 Phase 15 에서 「재접속(참조계수 0 을 지난 뒤)에도 캐시가 즉시 응답」 이었다(D-37). 26-03 이 전역 캐시를 1→0 에서
  // 정리하면서 잠시 「같은 키를 다른 소켓이 잡고 있는 동안」 으로 좁혔고, linger(D-10 · 26-08)가 들어와 본래 목적 —
  // 탭 전환 · 새로고침으로 소켓이 닫혔다 다시 열려도 게이트웨이 재요청 없이 캐시로 즉시 그린다 — 을 되찾았다.
  it("⑪ linger 안 재접속 — 소켓 close 뒤 5초에 새 소켓이 sub 하면 캐시 q 가 즉시 오고 28 누적 1 · 29(false) 0, 새 소켓도 닫히면 그로부터 LINGER_MS 뒤 29(false) 1 (D-10)", async () => {
    const first = await authed("token-a");
    first.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 1, "구독 성립");
    await waitFor(() => quoteMsgTypes.includes(MSG.GetTradeTapeReq), "quote 연결 구독 요청");

    quoteGateway.pushQuote(quoteSock, { snapshot: true, lastPrice: 69_800n });
    await waitFor(() => first.inbox.some((m) => m.t === "q"), "첫 시세 수신");

    // 새로고침 — 소켓이 닫히면 참조계수 0 이지만 linger 라 해제 프레임이 나가지 않는다.
    await first.ws.close();
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 0, "참조계수 0");
    await flushIo(20);
    expect(h.hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(true);
    expect(quoteSubscribes.filter((s) => s.subscribe === false)).toHaveLength(0);

    vi.advanceTimersByTime(5_000);

    // 새 소켓이 같은 종목을 잡으면 게이트웨이 왕복 없이 캐시가 먼저 온다.
    const second = await authed("token-a");
    second.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => second.inbox.some((m) => m.t === "q"), "linger 캐시 즉시 응답");
    await flushIo(20);

    expect(second.inbox.find((m) => m.t === "q")).toMatchObject({ p: 69_800, snap: true });
    expect(quoteMsgTypes.filter((t) => t === MSG.GetQuoteReq)).toHaveLength(1);
    expect(quoteMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq)).toHaveLength(1);
    expect(quoteMsgTypes.filter((t) => t === MSG.GetTradeTapeReq)).toHaveLength(1);
    expect(h.hub.isLingering(SAMPLE_ISIN, "KRX")).toBe(false);

    // 첫 close 로부터 LINGER_MS 가 지나도 복귀가 타이머를 취소했으니 해제가 없다.
    vi.advanceTimersByTime(LINGER_MS);
    await flushIo(20);
    expect(quoteSubscribes.filter((s) => s.subscribe === false)).toHaveLength(0);

    // 새 소켓도 닫히면 그로부터 LINGER_MS 뒤 29(false) 1건.
    await second.ws.close();
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 0, "참조계수 0 (두 번째)");
    vi.advanceTimersByTime(LINGER_MS);
    await waitFor(
      () => quoteSubscribes.filter((s) => s.subscribe === false).length === 1,
      "linger 만료 뒤 29(false)",
    );
    expect(h.hub.getSnapshot(SAMPLE_ISIN, "KRX")).toBeUndefined();
    expect(userQuoteReqCount()).toBe(0);
  });

  // 26-11 — 83 재송신 넛지(Pattern 10 · Pitfall 6 · d43 회귀 방지). 조용한 상한가 종목의 83 은 29 성립 때만 다시 나오므로,
  // 이미 업스트림 구독 중인 키를 다른 사용자가 처음 열면 relay 가 quote 연결로 같은 level 29 1건을 보낸다(28 · 32 없음).
  it("⑪-b 잔량진행률 넛지 — 두 번째 사용자 첫 참조 29 한 건 · 28 0 · 같은 사용자 두 번째 탭은 0", async () => {
    const a = await authed("token-a");
    a.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => quoteMsgTypes.includes(MSG.GetTradeTapeReq), "A 구독 28 · 29 · 32");
    expect(quoteSubscribes).toHaveLength(1);

    const b = await authed("token-b");
    const b2 = await authed("token-b");
    b.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => quoteSubscribes.length === 2, "B 첫 참조 넛지");
    b2.ws.sendSub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 3, "A · B · B2 참조계수 3");
    await flushIo(20);

    expect(quoteMsgTypes.filter((t) => t === MSG.GetQuoteReq)).toHaveLength(1);
    expect(quoteMsgTypes.filter((t) => t === MSG.GetTradeTapeReq)).toHaveLength(1);
    expect(quoteSubscribes).toEqual([
      { isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true, level: 0 },
      { isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true, level: 0 },
    ]);
    // 사용자 세션으로는 시세 요청 0 — 83 은 서버가 계좌 선언 세션(②)으로 다시 낸다.
    expect(userQuoteReqCount()).toBe(0);
  });

  it("⑫ 계약 밖 경로로는 업그레이드하지 않는다", async () => {
    await expect(connectWs(h.port, "/not-ws")).rejects.toThrow();
  });

  // ============================================================
  // Phase 26 Plan 09 — 구독 한도 (D-11 전역 · D-15 사용자당)
  // ============================================================
  describe("구독 한도 — sub.limit 프레임 · 그 소켓만 · 게이트웨이 0 (D-11 · D-15)", () => {
    /**
     * 한도에 닿은 새 키는 hub 가 업스트림 송신 **전에** 거부하고(26-09 Task 1), fanout 은 **그 소켓에만**
     * `{t:"sub.limit", i, x, scope}` 1건을 보낸다 — `{t:"msg"}` 가 아니다(전략 카드 오류 소비와 섞이지 않게 ·
     * RESEARCH Pattern 9-2). 거부된 키는 그 소켓 `conn.keys` · 키 구독자 색인에 들어가지 않으므로, 나중에 다른
     * 사용자가 그 키를 열어 59 가 와도 거부된 소켓에는 0건이다. 한도는 주입값 `{ global: 3, user: 2 }` 로 작게 잡는다.
     */
    const K1 = SAMPLE_ISIN;
    const K2 = OTHER_ISIN;
    const K3 = "KR7035420009";
    const K4 = "KR7051910008";

    const subscribeCount = (): number => quoteMsgTypes.filter((t) => t === MSG.SubscribeQuoteReq).length;
    const quotesFor = (inbox: RelayOutbound[], isin: string): RelayOutbound[] =>
      inbox.filter((m) => m.t === "q" && m.i === isin);

    beforeEach(async () => {
      // 바깥 하네스를 한도 주입 hub 로 다시 세운다. 옛 quote 소켓이 닫힌 뒤에 새 연결을 기다려야 옛 소켓을 집지 않는다.
      const oldQuoteSock = quoteSock;
      await h.close();
      await waitFor(() => oldQuoteSock.destroyed, "옛 quote 소켓 종료");
      h = await startHarness({}, { limits: { global: 3, user: 2 } });
      quoteSock = await quoteGateway.waitForQuoteConnection();
      quoteMsgTypes.length = 0;
      quoteSubscribes.length = 0;
    });

    it("SL1 사용자 한도 — A 의 3번째 새 키는 그 소켓만 scope:user 1건 · {t:msg} 0 · 29 누적 2, 뒤에 B 가 그 키를 열어도 A 소켓에 59 0건", async () => {
      const a1 = await authed("token-a");
      const a2 = await authed("token-a");
      const b = await authed("token-b");

      a1.ws.sendSub(K1, "KRX");
      a1.ws.sendSub(K2, "KRX");
      await waitFor(() => subscribeCount() === 2, "A 두 키 29");

      a1.ws.sendSub(K3, "KRX");
      await waitFor(() => framesOf(a1.inbox, "sub.limit").length === 1, "A 소켓 sub.limit");
      await flushIo(20);

      expect(framesOf(a1.inbox, "sub.limit")).toEqual([{ t: "sub.limit", i: K3, x: "KRX", scope: "user" }]);
      expect(framesOf(a1.inbox, "msg")).toHaveLength(0);
      expect(framesOf(a2.inbox, "sub.limit")).toHaveLength(0);
      expect(framesOf(b.inbox, "sub.limit")).toHaveLength(0);
      expect(subscribeCount()).toBe(2);
      expect(h.hub.refCount(K3, "KRX")).toBe(0);
      expect(h.hub.stats().subLimitRejects).toBe(1);

      // A 의 다른 탭이 A 가 이미 가진 키를 여는 것은 한도와 무관하다.
      a2.ws.sendSub(K1, "KRX");
      await waitFor(() => h.hub.refCount(K1, "KRX") === 2, "A 두 번째 탭 K1");
      expect(framesOf(a2.inbox, "sub.limit")).toHaveLength(0);

      // B 는 같은 순간 새 키를 연다 — 전역 3 이 찬다.
      b.ws.sendSub(K3, "KRX");
      await waitFor(() => h.hub.refCount(K3, "KRX") === 1, "B K3 구독");
      await waitFor(() => subscribeCount() === 3, "B K3 29");

      quoteGateway.pushQuote(quoteSock, { isin: K3, snapshot: true, lastPrice: 180_000n });
      await waitFor(() => quotesFor(b.inbox, K3).length === 1, "B K3 시세");
      await flushIo(20);
      expect(quotesFor(a1.inbox, K3)).toHaveLength(0);
      expect(quotesFor(a2.inbox, K3)).toHaveLength(0);
      expect(framesOf(b.inbox, "sub.limit")).toHaveLength(0);
      expect(userQuoteReqCount()).toBe(0);
    });

    it("SL2 전역 한도 — 3 키가 찬 뒤 B 의 새 키는 scope:global, A 가 키 하나를 놓아 linger 가 생기면 29(false) 뒤 수용", async () => {
      const a = await authed("token-a");
      const b = await authed("token-b");

      a.ws.sendSub(K1, "KRX");
      a.ws.sendSub(K2, "KRX");
      b.ws.sendSub(K3, "KRX");
      await waitFor(() => subscribeCount() === 3, "세 키 29");

      b.ws.sendSub(K4, "KRX");
      await waitFor(() => framesOf(b.inbox, "sub.limit").length === 1, "B 소켓 sub.limit");
      await flushIo(20);
      expect(framesOf(b.inbox, "sub.limit")).toEqual([{ t: "sub.limit", i: K4, x: "KRX", scope: "global" }]);
      expect(framesOf(a.inbox, "sub.limit")).toHaveLength(0);
      expect(framesOf(b.inbox, "msg")).toHaveLength(0);
      expect(subscribeCount()).toBe(3);
      expect(h.hub.refCount(K4, "KRX")).toBe(0);

      // A 가 K1 을 놓으면 linger — 업스트림 키는 여전히 3 이지만 linger 키가 자리를 내준다.
      a.ws.sendUnsub(K1, "KRX");
      await waitFor(() => h.hub.isLingering(K1, "KRX"), "K1 linger");

      b.ws.sendSub(K4, "KRX");
      await waitFor(() => h.hub.refCount(K4, "KRX") === 1, "B K4 수용");
      await waitFor(() => quoteSubscribes.length === 5, "29(false) K1 · 29(true) K4");
      expect(quoteSubscribes.slice(3).map((q) => [q.isin, q.subscribe])).toEqual([
        [K1, false],
        [K4, true],
      ]);
      expect(framesOf(b.inbox, "sub.limit")).toHaveLength(1);
      expect(h.hub.stats()).toMatchObject({ lingerCount: 0, subLimitRejects: 1 });
      expect(userQuoteReqCount()).toBe(0);
    });
  });

  // ============================================================
  // Phase 26 Plan 12 — quote.state (D-01 원천)
  // ============================================================
  describe("quote.state (Phase 26 D-01)", () => {
    /**
     * 시세 전용 공유 연결 상태를 브라우저 배지 「시세」 축으로 내린다. 인증된 연결은 인증 직후 relay 가 상태를 **알 때만**
     * 스냅샷 1프레임을 받고, 상태 전이(3초 디바운스 — `QuoteStatus`)마다 같은 프레임을 받는다. `dma_credentials` 미등록
     * (`token-none`) 연결은 스냅샷도 전이도 0 이다(D-09 — 시세를 못 보는 사용자에게 시세 축을 알리지 않는다).
     * 하네스는 index.ts 와 같은 결선(`quoteState: quoteStatus` · `on("frame") → deliverQuoteState`)을 쓴다.
     */
    const quoteStates = (inbox: RelayOutbound[]): RelayOutbound[] => framesOf(inbox, "quote.state");

    /** 미등록 연결 — unauthorized 상태 프레임까지 받은 뒤 돌려준다. */
    async function unregistered(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
      const conn = await open();
      conn.ws.sendAuth("token-none");
      await waitFor(() => conn.inbox.some((m) => m.t === "state" && m.s === "unauthorized"), "token-none unauthorized");
      return conn;
    }

    it("QS1 quoteState 미주입 하네스 → 인증 스냅샷에 quote.state 0 (모르면 보내지 않는다)", async () => {
      const a = await authed("token-a");
      await flushIo(20);
      expect(quoteStates(a.inbox)).toHaveLength(0);
    });

    describe("QuoteStatus 주입", () => {
      beforeEach(async () => {
        // 바깥 하네스를 상태 원천 주입 하네스로 다시 세운다. 옛 quote 소켓이 닫힌 뒤에 새 연결을 기다려야 옛 소켓을 집지 않는다.
        const oldQuoteSock = quoteSock;
        await h.close();
        await waitFor(() => oldQuoteSock.destroyed, "옛 quote 소켓 종료");
        h = await startHarness({}, undefined, { quoteStatus: true });
        quoteSock = await quoteGateway.waitForQuoteConnection();
      });

      it("QS2 feed ready 뒤 인증 → 인증 스냅샷 묶음에 {t:quote.state, s:live} 정확히 1프레임 · 미등록 0", async () => {
        expect(h.quoteStatus?.frame()).toEqual({ t: "quote.state", s: "live" });
        const a = await authed("token-a");
        const none = await unregistered();
        await waitFor(() => quoteStates(a.inbox).length === 1, "A quote.state 스냅샷");
        await flushIo(20);

        expect(quoteStates(a.inbox)).toEqual([{ t: "quote.state", s: "live" }]);
        expect(quoteStates(none.inbox)).toHaveLength(0);
      });

      it("QS3 quote 소켓 끊김 → +3초 인증된 A · B 에 down 각 1건 · 미등록 0, 재접속 ready → live 각 1건", async () => {
        const a = await authed("token-a");
        const b = await authed("token-b");
        const none = await unregistered();
        await waitFor(() => quoteStates(a.inbox).length === 1 && quoteStates(b.inbox).length === 1, "A · B 스냅샷");

        // 재로그인을 막고 quote 소켓을 끊는다 — 짧은 깜빡임이 아니라 3초 넘는 끊김을 만든다.
        quoteGateway.respondQuoteLogin(null);
        const cutAtMs = Date.now();
        quoteGateway.hardClose(quoteSock);
        await waitFor(() => !h.feed.isReady, "quote 연결 끊김 감지");

        // 디바운스 직전까지는 아무것도 안 간다.
        vi.advanceTimersByTime(QUOTE_DOWN_AFTER_MS - 1);
        await flushIo(10);
        expect(quoteStates(a.inbox)).toHaveLength(1);

        vi.advanceTimersByTime(1);
        await waitFor(() => quoteStates(a.inbox).length === 2 && quoteStates(b.inbox).length === 2, "A · B down");
        for (const inbox of [a.inbox, b.inbox]) {
          const down = quoteStates(inbox)[1] as { t: "quote.state"; s: string; since?: string };
          expect(down.s).toBe("down");
          expect(down.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
          // 이탈 시각이다 — 끊은 시각 전후(실시계)로 잡힌다.
          expect(Math.abs(Date.parse(down.since as string) - cutAtMs)).toBeLessThan(2_000);
        }
        expect(quoteStates(none.inbox)).toHaveLength(0);

        // 로그인 응답을 되살리고 재접속 · 로그인 타임아웃 · 백오프를 시계로 흘려 ready 까지 간다.
        quoteGateway.respondQuoteLogin({ success: true });
        for (let i = 0; i < 60 && !h.feed.isReady; i++) {
          vi.advanceTimersByTime(1_000);
          await flushIo(10);
        }
        expect(h.feed.isReady).toBe(true);
        await waitFor(() => quoteStates(a.inbox).length === 3 && quoteStates(b.inbox).length === 3, "A · B live");
        await flushIo(20);

        expect(quoteStates(a.inbox)[2]).toEqual({ t: "quote.state", s: "live" });
        expect(quoteStates(b.inbox)[2]).toEqual({ t: "quote.state", s: "live" });
        expect(quoteStates(a.inbox)).toHaveLength(3);
        expect(quoteStates(b.inbox)).toHaveLength(3);
        expect(quoteStates(none.inbox)).toHaveLength(0);
      });
    });
  });

  // ============================================================
  // quick-260923-ge2 — 가격 전용 구독 lv (full|price)
  // ============================================================
  describe("가격 전용 구독 lv (quick-260923-ge2)", () => {
    /** quote 연결로 나간 요청 수 (Phase 26 — 업스트림 송신자는 quote 연결 하나다). */
    const countOf = (msgType: number): number =>
      quoteMsgTypes.filter((t) => t === msgType).length;

    afterEach(() => {
      // 이 describe 의 어떤 케이스도 사용자 세션으로 시세 요청을 보내지 않는다 (D-08).
      expect(userQuoteReqCount()).toBe(0);
    });

    /** 체결 1건을 hub 전역 링버퍼까지 들이고 200ms 배치 창을 닫는다. */
    async function pushTapeAndFlush(tradeTime: string): Promise<void> {
      const before = h.hub.getTape(SAMPLE_ISIN, "KRX")?.length ?? 0;
      quoteGateway.pushTape(quoteSock, { snapshot: false, entries: [{ tradeTime }] });
      await waitFor(
        () => (h.hub.getTape(SAMPLE_ISIN, "KRX")?.length ?? 0) > before,
        "hub 링버퍼에 체결 도착",
      );
      vi.advanceTimersByTime(TAPE_BATCH_MS);
    }

    /**
     * 시세 1건을 밀어 넣고 `inboxes` 전부에 도착할 때까지 기다린다. 소켓 전송은 순서 보존이라
     * q 가 왔는데 그 앞의 tape 가 없으면 tape 는 오지 않은 것이다.
     */
    async function pushQuoteAndAwait(inboxes: RelayOutbound[][], lastPrice: bigint): Promise<void> {
      const before = inboxes.map((inbox) => framesOf(inbox, "q").length);
      quoteGateway.pushQuote(quoteSock, { snapshot: false, lastPrice });
      await waitFor(
        () => inboxes.every((inbox, i) => framesOf(inbox, "q").length > (before[i] ?? 0)),
        "시세 도착",
      );
    }

    it("F1 price 단독 구독은 28·29 만 보내고 tape 를 받지 않으며 q 는 호가 배열까지 그대로 온다", async () => {
      const b = await authed("token-a");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 1, "게이트웨이 구독 요청");

      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");
      expect(countOf(MSG.GetQuoteReq)).toBe(1);

      await pushTapeAndFlush("090000000001");
      await pushQuoteAndAwait([b.inbox], 71_000n);
      await flushIo(20);

      expect(countOf(MSG.GetTradeTapeReq)).toBe(0);
      expect(framesOf(b.inbox, "tape")).toHaveLength(0);
      const quote = framesOf(b.inbox, "q").at(-1);
      expect(quote).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", p: 71_000 });
      expect(quote).toHaveProperty("ap");
      expect(quote).toHaveProperty("bp");
    });

    it("F2 같은 사용자 full 탭과 price 탭 — 업스트림은 full 1건, tape 는 full 탭에만 간다", async () => {
      const a = await authed("token-a");
      const b = await authed("token-a");
      a.ws.sendSub(SAMPLE_ISIN, "KRX");
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 1, "A 구독");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "B 구독");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "게이트웨이 체결 요청");

      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
      // 실효 level 이 그대로라 price 추가는 재송신이 없다.
      expect(countOf(MSG.SubscribeQuoteReq)).toBe(1);

      await pushTapeAndFlush("090000000002");
      await pushQuoteAndAwait([a.inbox, b.inbox], 71_100n);

      expect(framesOf(a.inbox, "tape")).toHaveLength(1);
      expect(framesOf(b.inbox, "tape")).toHaveLength(0);
    });

    it("F3 같은 소켓 price→full 재 sub 은 참조계수를 늘리지 않고 28·29·32 재송신 + 링버퍼 tape 스냅샷을 준다", async () => {
      const b = await authed("token-a");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 1, "price 구독");
      expect(countOf(MSG.GetTradeTapeReq)).toBe(0);

      // B 는 받지 못하지만 hub 링버퍼에는 쌓인다.
      await pushTapeAndFlush("090000000003");
      await pushQuoteAndAwait([b.inbox], 71_200n);
      expect(framesOf(b.inbox, "tape")).toHaveLength(0);

      b.ws.sendSub(SAMPLE_ISIN, "KRX", "full");
      await waitFor(() => framesOf(b.inbox, "tape").length === 1, "승격 tape 스냅샷");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "승격 재송신");

      expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
      expect(countOf(MSG.GetQuoteReq)).toBe(2);
      expect(countOf(MSG.SubscribeQuoteReq)).toBe(2);
      expect(framesOf(b.inbox, "tape")[0]).toMatchObject({ i: SAMPLE_ISIN, x: "KRX", snap: true });
    });

    it("F4 같은 소켓 full→price 재 sub 은 29 1건만 더 보낸다", async () => {
      const b = await authed("token-a");
      b.ws.sendSub(SAMPLE_ISIN, "KRX");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "full 구독");

      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 2, "강등 29");
      await flushIo(20);

      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("price");
      expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
      expect(countOf(MSG.GetTradeTapeReq)).toBe(1);
      expect(countOf(MSG.GetQuoteReq)).toBe(1);
    });

    it("F5 같은 소켓 같은 level 재 sub 은 무시한다", async () => {
      const b = await authed("token-a");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 1, "price 구독");

      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      // 뒤따르는 프레임이 처리됐음을 보장하는 표식 — 다른 키 구독.
      b.ws.sendSub(OTHER_ISIN, "KRX", "price");
      await waitFor(() => h.hub.refCount(OTHER_ISIN, "KRX") === 1, "표식 구독");
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 2, "표식 29");
      await flushIo(20);

      expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);
      expect(countOf(MSG.SubscribeQuoteReq)).toBe(2);
    });

    it("F6 price 소켓이 닫히면 그 level 로 해제돼 참조계수 0 · 29 가 구독+해제 2건이다", async () => {
      const b = await authed("token-a");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 1, "price 구독");

      await b.ws.close();
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 0, "참조계수 0");
      // 해제 프레임은 linger(D-10) 만료에서 나간다.
      vi.advanceTimersByTime(LINGER_MS);
      await waitFor(() => countOf(MSG.SubscribeQuoteReq) === 2, "업스트림 해제");
      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBeUndefined();
    });

    it("F7 열거 밖 lv 는 close(4400) 이다", async () => {
      const { ws } = await authed("token-a");

      ws.sendRaw({ t: "sub", isin: SAMPLE_ISIN, ex: "KRX", lv: "turbo" });
      await waitFor(() => ws.closeInfo !== null, "스키마 위반 close");

      expect(ws.closeInfo?.code).toBe(4400);
      expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
    });

    it("F8 PRICE/FULL 혼합 소켓 — 호가 틱 price 0 · 체결 price 1 · tape full 만 · 75 브라우저 0 (D-05 · D-07)", async () => {
      // 같은 KRX 키를 A 는 full(호가창) · B 는 price(돌파 칩)로 본다 — 업스트림은 FULL 이라 호가 틱까지 흐르고,
      // relay 가 서버 PRICE 규칙을 복제해 B 에게 가격 섹션이 바뀐 59 만 준다(hub 키 단위 판정 → fanout 소켓 level 필터).
      const a = await authed("token-a");
      const b = await authed("token-b");
      a.ws.sendSub(SAMPLE_ISIN, "KRX");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "A full · B price 구독");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "게이트웨이 체결 요청");
      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");

      // 58 — 두 소켓 모두.
      quoteGateway.pushQuote(quoteSock, { snapshot: true });
      await waitFor(
        () => framesOf(a.inbox, "q").length === 1 && framesOf(b.inbox, "q").length === 1,
        "A · B 스냅샷",
      );

      // 호가 · 체결 시각만 바뀐 59 → A 1 · B 0.
      quoteGateway.pushQuote(quoteSock, {
        snapshot: false,
        askPrices: [71_100n, 71_200n, 71_300n, 71_400n, 71_500n, 71_600n, 71_700n, 71_800n, 71_900n, 72_000n],
        bidQtys: [999n, 998n, 997n, 996n, 995n, 994n, 993n, 992n, 991n, 990n],
        exchangeTime: "093016000000",
      });
      await waitFor(() => framesOf(a.inbox, "q").length === 2, "A 호가 틱");
      await flushIo(20);
      expect(framesOf(a.inbox, "q")[1]).toMatchObject({ snap: false, ap: expect.arrayContaining([71_100]) });
      expect(framesOf(b.inbox, "q")).toHaveLength(1);

      // 체결 59(마지막 PRICE 송신 +100ms) → A 1 · B 1. 하네스의 가짜 타이머는 `Date` 를 가짜로 두지 않아
      // `vi.setSystemTime` 이 `Date.now()` 에 닿지 않는다 — 실시계에 단조 오프셋을 더하는 스파이로 100ms 를 민다
      // (afterEach 의 restoreAllMocks 가 원복). 지연 방출 타이머가 아니라 「간격 충족 즉시 통과」 경로를 본다.
      const realNow = Date.now.bind(Date);
      vi.spyOn(Date, "now").mockImplementation(() => realNow() + PRICE_MIN_INTERVAL_MS);
      await pushQuoteAndAwait([a.inbox, b.inbox], 71_200n);
      await flushIo(20);
      expect(framesOf(a.inbox, "q")).toHaveLength(3);
      expect(framesOf(b.inbox, "q")).toHaveLength(2);
      // D-07 — price 소켓이 받는 59 본문은 full 과 같은 RelayQuote 프레임(호가 배열까지 그대로).
      expect(framesOf(b.inbox, "q")[1]).toEqual(framesOf(a.inbox, "q")[2]);
      expect(framesOf(b.inbox, "q")[1]).toMatchObject({ p: 71_200, snap: false });

      // 71 tape → A 1 · B 0.
      await pushTapeAndFlush("090000000008");
      await waitFor(() => framesOf(a.inbox, "tape").length === 1, "A tape");
      await flushIo(20);
      expect(framesOf(b.inbox, "tape")).toHaveLength(0);

      // 75 거래원 → envelope 단계에서 드롭 — 두 소켓 모두 0 · 명시 case 없는 번호 계수도 0.
      const aBefore = a.inbox.length;
      const bBefore = b.inbox.length;
      const dropsBefore = droppedEnvelopeCount();
      quoteGateway.sendFrame(quoteSock, buildBareEnvelope(75));
      await waitFor(() => droppedEnvelopeCount() === dropsBefore + 1, "75 envelope 드롭");
      await flushIo(20);
      expect(a.inbox).toHaveLength(aBefore);
      expect(b.inbox).toHaveLength(bBefore);
      expect(h.hub.unhandledFrameCount()).toBe(0);
    });

    it("F10 이미 흐르는 종목을 새 full 소켓이 200ms 배치 창 안에 구독해도 같은 체결이 두 번 오지 않는다 (26-REVIEW WR-02)", async () => {
      const a = await authed("token-a");
      a.ws.sendSub(SAMPLE_ISIN, "KRX");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "게이트웨이 체결 요청");
      await pushTapeAndFlush("090000000011");
      await waitFor(() => framesOf(a.inbox, "tape").length === 1, "A tape 1");

      // 배치 창 안의 증분 1건 — hub 링버퍼에는 들어갔지만 아직 브라우저로 나가지 않았다.
      const before = h.hub.getTape(SAMPLE_ISIN, "KRX")?.length ?? 0;
      quoteGateway.pushTape(quoteSock, { snapshot: false, entries: [{ tradeTime: "090000000012" }] });
      await waitFor(() => (h.hub.getTape(SAMPLE_ISIN, "KRX")?.length ?? 0) > before, "hub 링버퍼에 체결 도착");

      // 그 창 안에 B 가 붙는다 — 스냅샷은 플러시된 부분(11)만, 대기분(12)은 곧 나갈 증분이 준다.
      const b = await authed("token-b");
      b.ws.sendSub(SAMPLE_ISIN, "KRX");
      await waitFor(() => framesOf(b.inbox, "tape").length === 1, "B tape 스냅샷");
      vi.advanceTimersByTime(TAPE_BATCH_MS);
      await waitFor(() => framesOf(b.inbox, "tape").length === 2, "B 배치 증분");
      await flushIo(20);

      const bTapes = framesOf(b.inbox, "tape");
      expect(bTapes).toHaveLength(2);
      expect(bTapes[0]).toMatchObject({ snap: true });
      expect(bTapes[1]).toMatchObject({ snap: false });
      expect(bTapes.flatMap((f) => f.e.map((e) => e.t))).toEqual(["090000000011", "090000000012"]);
      // A 는 증분만 한 번 더 받는다.
      expect(framesOf(a.inbox, "tape").flatMap((f) => f.e.map((e) => e.t))).toEqual(["090000000011", "090000000012"]);
    });

    it("F9 업스트림 FULL 에서 price 소켓이 full 로 승격하면 캐시 q(호가 틱 반영)를 tape 보다 먼저 즉시 받는다 · 업스트림 재요청 0 (quick-261001-dyi)", async () => {
      // 작업대 카드 펼치기 = 같은 소켓 price→full 재 sub. 다른 소비자(A)가 이미 FULL 이면 hub 승격도 58 도 없다 —
      // relay 가 캐시를 주지 않으면 B 의 호가는 「접힌 동안 마지막 체결 시점」 값으로 다음 FULL 59 까지 남는다.
      const a = await authed("token-a");
      const b = await authed("token-b");
      a.ws.sendSub(SAMPLE_ISIN, "KRX");
      b.ws.sendSub(SAMPLE_ISIN, "KRX", "price");
      await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 2, "A full · B price 구독");
      await waitFor(() => countOf(MSG.GetTradeTapeReq) === 1, "게이트웨이 체결 요청");
      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");

      quoteGateway.pushQuote(quoteSock, { snapshot: true });
      await waitFor(
        () => framesOf(a.inbox, "q").length === 1 && framesOf(b.inbox, "q").length === 1,
        "A · B 스냅샷",
      );
      // tape 캐시도 채워 둔다 — 승격 스냅샷 순서(q → tape)를 보기 위해.
      await pushTapeAndFlush("090000000009");
      await waitFor(() => framesOf(a.inbox, "tape").length === 1, "A tape");

      // 호가만 바뀐 59 — A 1 · B 0 (F8 재확인). hub 캐시는 이 틱으로 갱신된다.
      quoteGateway.pushQuote(quoteSock, {
        snapshot: false,
        askPrices: [71_100n, 71_200n, 71_300n, 71_400n, 71_500n, 71_600n, 71_700n, 71_800n, 71_900n, 72_000n],
        bidQtys: [999n, 998n, 997n, 996n, 995n, 994n, 993n, 992n, 991n, 990n],
        exchangeTime: "093016000000",
      });
      await waitFor(() => framesOf(a.inbox, "q").length === 2, "A 호가 틱");
      await flushIo(20);
      expect(framesOf(b.inbox, "q")).toHaveLength(1);
      expect(framesOf(b.inbox, "tape")).toHaveLength(0);

      const quoteReqBefore = countOf(MSG.GetQuoteReq);
      const subReqBefore = countOf(MSG.SubscribeQuoteReq);
      const tapeReqBefore = countOf(MSG.GetTradeTapeReq);
      const bBefore = b.inbox.length;

      b.ws.sendSub(SAMPLE_ISIN, "KRX", "full");
      await waitFor(() => framesOf(b.inbox, "q").length === 2, "승격 q 스냅샷");
      await waitFor(() => framesOf(b.inbox, "tape").length === 1, "승격 tape 스냅샷");
      await flushIo(20);

      // 캐시 q 는 호가 틱을 반영한다 — 매수1잔량 999.
      const promoted = framesOf(b.inbox, "q")[1];
      expect(promoted).toMatchObject({ i: SAMPLE_ISIN, x: "KRX" });
      expect(promoted.bq).toContain(999);
      // 순서: q 다음 tape.
      const after = b.inbox.slice(bBefore);
      const qIdx = after.findIndex((f) => f.t === "q");
      const tapeIdx = after.findIndex((f) => f.t === "tape");
      expect(qIdx).toBeGreaterThanOrEqual(0);
      expect(qIdx).toBeLessThan(tapeIdx);
      // 업스트림 재요청 없이 캐시에서 왔다.
      expect(countOf(MSG.GetQuoteReq)).toBe(quoteReqBefore);
      expect(countOf(MSG.SubscribeQuoteReq)).toBe(subReqBefore);
      expect(countOf(MSG.GetTradeTapeReq)).toBe(tapeReqBefore);
      expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(2);
      expect(h.hub.subscriptionLevel(SAMPLE_ISIN, "KRX")).toBe("full");
    });
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
    // 스텁 게이트웨이는 21 두 건 모두에 같은 61 로 답하고 그 본문에는 거래소 슬롯이 없다
    // (= KRX). **본문이 정본**이므로 둘 다 KRX 칸에 들어가고 NXT 는 「모름」으로 남는다
    // (17-05 / D-06) — KRX 전략만 있는 세션의 정확한 모습이다.
    await waitFor(() => h.hub.getViTrigger(USER_A, "KRX") != null, "VI 설정 캐시(KRX)");
    expect(h.hub.getViTrigger(USER_A, "NXT")).toBeUndefined();
    await waitFor(() => h.hub.getViOrders(USER_A).length === 3, "VI 주문 캐시 3건");

    // 새 탭은 **구독을 한 건도 보내지 않고** 캐시에서 3프레임을 받는다.
    const second = await open();
    second.ws.sendAuth("token-a");
    await waitFor(() => framesOf(second.inbox, "vi.list").length === 1, "새 탭 VI 주문 스냅샷");
    await flushIo(20);

    const [lcSnap] = framesOf(second.inbox, "lc.snap");
    expect(lcSnap?.items).toHaveLength(2);
    expect(lcSnap?.items.map((i) => i.isin).sort()).toEqual([OTHER_ISIN, SAMPLE_ISIN].sort());

    // NXT 는 「모름」이므로 프레임이 **1건**이다 — 지어낸 NXT 미등록을 내리지 않는다.
    const viFrames = framesOf(second.inbox, "vi");
    expect(viFrames).toHaveLength(1);
    const [vi] = viFrames;
    expect(vi?.x).toBe("KRX");
    expect(vi?.cfg).toMatchObject({ run: true, orderAmountKrw: 3_000_000, checkRate: 25 });

    const [viList] = framesOf(second.inbox, "vi.list");
    expect(viList?.snap).toBe(true);
    expect(viList?.items).toHaveLength(3);

    // 페이지는 전략을 따로 요청하지 않는다 — 구독이 0건인 채로 다 왔다.
    expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(0);
  });

  it("⑭ 0건도 프레임이 오지만, VI 를 아직 모르면 vi 프레임은 오지 않는다", async () => {
    // (A) 조회 결과 **미등록**(`null`) — 확정 정보이므로 `cfg:null` 을 보낸다.
    gateway.respondViTrigger(null);
    await authed("token-a");
    // 빈 61 두 건이 요청 거래소 FIFO 로 **각각** 귀속된다 (17-05 / Pitfall 3).
    await waitFor(() => h.hub.getViTrigger(USER_A, "KRX") === null, "KRX 미등록 확정");
    await waitFor(() => h.hub.getViTrigger(USER_A, "NXT") === null, "NXT 미등록 확정");

    const tabA = await open();
    tabA.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabA.inbox, "vi.list").length === 1, "A 새 탭 스냅샷");
    await flushIo(20);

    expect(framesOf(tabA.inbox, "lc.snap")[0]).toEqual({ t: "lc.snap", items: [] });
    // `x` 는 거래소별 프레임의 축이다 (D-06). 미등록(`cfg: null`)의 거래소는 **21 요청 FIFO**
    // 가 정한다 (17-05) — 두 거래소를 다 조회했으므로 **두 칸 모두** 확정이고 프레임도 2건이다.
    expect(framesOf(tabA.inbox, "vi")).toEqual([
      { t: "vi", x: "KRX", cfg: null },
      { t: "vi", x: "NXT", cfg: null },
    ]);
    expect(framesOf(tabA.inbox, "vi.list")[0]).toEqual({ t: "vi.list", snap: true, items: [] });

    // (B) **아직 모른다**(`undefined`) — 로그인이 끝나지 않아 61 을 받은 적이 없다.
    //     지어낸 「미등록」을 내리면 브라우저가 사용자가 입력 중인 금액을 지운다.
    gateway.silenceLogin();
    const tabB = await open();
    tabB.ws.sendAuth("token-b");
    await waitFor(() => framesOf(tabB.inbox, "vi.list").length === 1, "B 스냅샷");
    await flushIo(20);

    expect(h.hub.getViTrigger(USER_B, "KRX")).toBeUndefined();
    expect(h.hub.getViTrigger(USER_B, "NXT")).toBeUndefined();
    expect(framesOf(tabB.inbox, "vi")).toHaveLength(0);
    // 상따 목록도 같은 규율이다 (18-26 / GC-IN-02). 64 를 받은 적 없는 사용자에게 `lc.snap []`
    // 을 내리면 「모름」을 「전략 없음」으로 말하는 셈이다 — 옛 단언(`items: []` 1프레임)은
    // 그 결함을 진실로 잠그고 있었다(18-22 deferred-items). 모르면 **프레임이 없다**.
    expect(framesOf(tabB.inbox, "lc.snap")).toHaveLength(0);
    expect(h.hub.hasLimitChaserList(USER_B)).toBe(false);
    expect(framesOf(tabB.inbox, "vi.list")[0]).toEqual({ t: "vi.list", snap: true, items: [] });
  });

  it("⑭-4 콜드 세션 — 64 전에 인증한 탭은 lc.snap 을 받지 않고, 첫 lc.snap 이 곧 64 다 (18-26 / GC-IN-02)", async () => {
    // 로그인 응답을 붙잡아 두면 세션이 ready 에 못 가고 24 프리페치도 나가지 않는다 —
    // 「탭이 게이트웨이 64 보다 먼저 인증했다」는 콜드 세션의 정확한 모습이다.
    gateway.silenceLogin();
    gateway.respondLimitChaserList([
      { isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO },
      { isin: OTHER_ISIN, accountNo: SAMPLE_ACCOUNT_NO },
    ]);
    const tab = await open();
    tab.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tab.inbox, "vi.list").length === 1, "콜드 탭 인증 스냅샷");
    await waitFor(() => gatewayMsgTypes.includes(MSG.LoginReq), "게이트웨이 로그인 요청");
    await flushIo(20);

    // 인증 직후에는 상따 목록 프레임이 **없다** — 빈 캐시를 확정 목록으로 내리지 않는다.
    expect(framesOf(tab.inbox, "lc.snap")).toHaveLength(0);
    expect(h.hub.hasLimitChaserList(USER_A)).toBe(false);

    // 이제 로그인이 끝나면 Ready 프리페치(24) → 64(2건) 팬아웃이 이 탭의 **첫** lc.snap 이다.
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.sendFrame(sock, buildLoginRespFrame({ success: true }));
    await waitFor(() => framesOf(tab.inbox, "lc.snap").length >= 1, "64 팬아웃");
    await flushIo(20);

    const snaps = framesOf(tab.inbox, "lc.snap");
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.items.map((i) => i.isin).sort()).toEqual([OTHER_ISIN, SAMPLE_ISIN].sort());
    expect(h.hub.hasLimitChaserList(USER_A)).toBe(true);
  });

  it("⑭-2 인증 직후 rate.cross.snap 은 비어 있어도 1프레임 — queued.window 는 모르면 안 온다 (17-03)", async () => {
    // (A) 77 을 한 번도 못 받은 세션. `lc.snap` 과 같은 규율로 above 집합은 **빈 배열이라도**
    //     1프레임 나가고(「돌파 없음」의 확정 정보), 예약창은 `vi` 의 3상태 규율대로
    //     **지어내지 않는다** — 거짓 라벨을 그리느니 아무 말도 하지 않는다.
    await authed("token-a");
    const tabA = await open();
    tabA.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabA.inbox, "vi.list").length === 1, "A 새 탭 스냅샷");
    await flushIo(20);

    expect(framesOf(tabA.inbox, "rate.cross.snap")[0]).toEqual({ t: "rate.cross.snap", items: [] });
    expect(framesOf(tabA.inbox, "queued.window")).toHaveLength(0);

    // (B) 게이트웨이가 77 을 한 번 밀어 넣으면 그 뒤 인증하는 연결은 예약창도 받는다.
    await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.sendFrame(sock, buildQueuedWindowStateFrame({ open: true, maxPieces: 7 }));
    await waitFor(() => h.hub.getQueuedWindow(USER_A) !== undefined, "예약창 캐시");

    const tabB = await open();
    tabB.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabB.inbox, "vi.list").length === 1, "B 새 탭 스냅샷");
    await flushIo(20);

    expect(framesOf(tabB.inbox, "queued.window")[0]).toMatchObject({ open: true, maxPieces: 7 });
    expect(framesOf(tabB.inbox, "rate.cross.snap")[0]).toEqual({ t: "rate.cross.snap", items: [] });
  });

  it("⑭-2b 같은 ISIN 으로 76 KRX 뒤 76 NXT 가 오면 새 탭의 첫 rate.cross.snap 은 그 ISIN 1원소 · NXT (quick-260926-rcc)", async () => {
    // gh-trade quick-260923-cfo 결정 A — 서버 상태는 ISIN 당 1개, 뒤에 온 76 이 거래소째 덮는다.
    // 캐시 키에 거래소를 두면 인증 직후 스냅샷에 같은 종목이 두 원소로 내려간다.
    await authed("token-a");
    await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");

    gateway.sendRateCrossAlert(sock, { isin: SAMPLE_ISIN, exchange: "KRX" });
    gateway.sendRateCrossAlert(sock, { isin: SAMPLE_ISIN, exchange: "NXT" });
    await waitFor(
      () => h.hub.getRateCrossItems(USER_A)[0]?.exchange === "NXT",
      "hub 캐시 NXT 덮기",
    );

    const tab = await open();
    tab.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tab.inbox, "rate.cross.snap").length >= 1, "새 탭 스냅샷");
    await flushIo(20);

    const snap = framesOf(tab.inbox, "rate.cross.snap")[0];
    expect(snap?.items).toHaveLength(1);
    expect(snap?.items[0]?.isin).toBe(SAMPLE_ISIN);
    expect(snap?.items[0]?.exchange).toBe("NXT");
  });

  describe("unf.progress (Phase 25)", () => {
    it("P1 인증 직후 unf.progress snap:true 는 캐시가 비어도 1프레임이다 (rate.cross.snap 규율)", async () => {
      const conn = await authed("token-a");
      await waitFor(() => framesOf(conn.inbox, "unf.progress").length >= 1, "진행률 스냅");
      await flushIo(20);

      expect(framesOf(conn.inbox, "unf.progress")).toEqual([{ t: "unf.progress", snap: true, entries: [] }]);
    });

    it("P2 가짜 게이트웨이 83 → 실 세션 → hub → ws: 허용 계좌 1건만 · dmaUserId 키 없음 (T-25-24 · T-25-25)", async () => {
      const conn = await authed("token-a");
      await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
      const sock = gateway.sockets[0];
      if (sock === undefined) throw new Error("게이트웨이 소켓 없음");

      gateway.sendFrame(
        sock,
        buildQueueProgressFrame({
          isin: SAMPLE_ISIN,
          exchange: "KRX",
          items: [
            { accountNo: SAMPLE_ACCOUNT_NO, dmaUserId: "kb-a", orderNo: "12453", group: 3, progressBp: 8800 },
            { accountNo: FOREIGN_ACCOUNT_NO, dmaUserId: "kb-other", orderNo: "99999" },
          ],
        }),
      );
      await waitFor(
        () => framesOf(conn.inbox, "unf.progress").some((m) => m.snap === false),
        "진행률 라이브 프레임",
      );

      const live = framesOf(conn.inbox, "unf.progress").filter((m) => m.snap === false);
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ t: "unf.progress", snap: false, i: SAMPLE_ISIN, x: "KRX" });
      const items = live[0]?.snap === false ? live[0].items : [];
      expect(items.map((it) => [it.accountNo, it.orderNo])).toEqual([[SAMPLE_ACCOUNT_NO, "12453"]]);
      expect(Object.keys(items[0] ?? {})).not.toContain("dmaUserId");
      expect(JSON.stringify(conn.inbox)).not.toContain(FOREIGN_ACCOUNT_NO);
      expect(h.hub.unhandledFrameCount()).toBe(0);
    });

    it("P3 두 번째 탭이 인증하면 그 연결의 snap:true entries 에 직전 항목이 있다", async () => {
      await authed("token-a");
      await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
      const sock = gateway.sockets[0];
      if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
      gateway.sendFrame(sock, buildQueueProgressFrame({ exchange: "NXT", items: [{ orderNo: "777" }] }));
      await waitFor(() => h.hub.getQueueProgressEntries(USER_A).length === 1, "진행률 캐시");

      const tab = await open();
      tab.ws.sendAuth("token-a");
      await waitFor(() => framesOf(tab.inbox, "unf.progress").length >= 1, "새 탭 진행률 스냅");
      await flushIo(20);

      const snaps = framesOf(tab.inbox, "unf.progress");
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toMatchObject({
        t: "unf.progress",
        snap: true,
        entries: [{ i: SAMPLE_ISIN, x: "NXT", items: [expect.objectContaining({ orderNo: "777", accountNo: SAMPLE_ACCOUNT_NO })] }],
      });
      expect(JSON.stringify(snaps[0])).not.toContain("dmaUserId");
    });

    it("P4 세션 교체 — 이미 연결된 탭이 진행률 초기화 snap:true 를 받고, 새 세션의 빈 83 억제 뒤에도 옛 키가 남지 않는다 (WR-02 · Pitfall 6)", async () => {
      const conn = await authed("token-a");
      await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
      const sock = gateway.sockets[0];
      if (sock === undefined) throw new Error("게이트웨이 소켓 없음");

      gateway.sendFrame(sock, buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "12453", group: 3 }] }));
      await waitFor(
        () => framesOf(conn.inbox, "unf.progress").some((m) => m.snap === false),
        "옛 세션 진행률 라이브 프레임",
      );

      // 탭이 연결된 채 세션이 교체된다 — hub 캐시와 함께 브라우저 사본도 비워야 한다.
      const replacement = new ReplacementSession(USER_A);
      h.hub.attach(replacement);
      await waitFor(
        () => framesOf(conn.inbox, "unf.progress").filter((m) => m.snap === true).length === 2,
        "교체 초기화 스냅",
      );
      expect(h.hub.getQueueProgressEntries(USER_A)).toEqual([]);

      // 새 세션의 같은 키 빈 83 — 빈→빈 억제로 프레임이 없다(T-25-27 불변). 사본은 이미 비었다.
      replacement.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [] }));
      replacement.pushFrame(buildQueueProgressFrame({ exchange: "NXT", items: [{ orderNo: "777" }] }));
      // ws 는 순서를 지킨다 — 빈 83 프레임이 있었다면 NXT 보다 먼저 와 있다.
      await waitFor(
        () => framesOf(conn.inbox, "unf.progress").some((m) => m.snap === false && m.x === "NXT"),
        "새 세션 NXT 라이브 프레임",
      );

      const frames = framesOf(conn.inbox, "unf.progress");
      expect(frames).toHaveLength(4);
      expect(frames[0]).toEqual({ t: "unf.progress", snap: true, entries: [] });
      expect(frames[1]).toMatchObject({ snap: false, i: SAMPLE_ISIN, x: "KRX" });
      expect(frames[1]?.snap === false ? frames[1].items.map((it) => it.orderNo) : null).toEqual(["12453"]);
      expect(frames[2]).toEqual({ t: "unf.progress", snap: true, entries: [] });
      expect(frames[3]).toMatchObject({ snap: false, i: SAMPLE_ISIN, x: "NXT" });
      expect(frames[3]?.snap === false ? frames[3].items.map((it) => it.orderNo) : null).toEqual(["777"]);
      expect(JSON.stringify(conn.inbox)).not.toContain("dmaUserId");
    });
  });

  it("⑭-3 드롭 0 게이트 — 76·77·78 왕복에 default 0·warn 0, 미등록 99 는 여전히 warn 1 (T-17-10)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const conn = await authed("token-a");
    await waitFor(() => gateway.sockets.length >= 1, "게이트웨이 연결");
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");

    // 게이트웨이가 세 프레임을 각 1건씩 실제로 내보낸다 — grep 이 아니라 소켓 왕복이다.
    gateway.sendRateCrossAlert(sock, { isin: SAMPLE_ISIN });
    gateway.sendRateCrossSnapshot(sock, [{ isin: SAMPLE_ISIN }, { isin: OTHER_ISIN }]);
    gateway.sendQueuedWindowState(sock, { open: true, maxPieces: 3 });

    await waitFor(() => framesOf(conn.inbox, "queued.window").length >= 1, "예약창 프레임");
    await flushIo(20);

    // ⓐ 브라우저가 세 프레임을 각각 받았다.
    expect(framesOf(conn.inbox, "rate.cross")[0]?.item.isin).toBe(SAMPLE_ISIN);
    expect(framesOf(conn.inbox, "rate.cross.snap").at(-1)?.items).toHaveLength(2);
    expect(framesOf(conn.inbox, "queued.window")[0]).toMatchObject({ open: true, maxPieces: 3 });

    // ⓑ hub 의 `default:` 로 떨어진 프레임이 0이다 — 화이트리스트와 명시 case 가 갈리지 않았다.
    expect(h.hub.unhandledFrameCount()).toBe(0);

    // ⓒ `unknown-msg-type` 사유의 warn 이 0건이다.
    const unknownWarns = (): number =>
      warnSpy.mock.calls.filter((args) => {
        const body: unknown = args[0];
        return (
          typeof body === "object" &&
          body !== null &&
          (body as { reason?: unknown }).reason === "unknown-msg-type"
        );
      }).length;
    expect(unknownWarns()).toBe(0);

    // ⓓ **대조군** — 미등록 번호(99)는 여전히 warn 1건을 남긴다. 게이트가 살아 있다는 증거다.
    //    이 단언이 없으면 「warn 0」은 「경고 경로가 죽었다」와 구분되지 않는다.
    gateway.sendGarbage(sock, "unknown-msg-type");
    await waitFor(() => unknownWarns() === 1, "미등록 번호 경고 1건");
    // 화이트리스트 밖이라 hub 까지 오지 않는다 — `default:` 카운터는 여전히 0이다.
    expect(h.hub.unhandledFrameCount()).toBe(0);
  });

  it("⑭-5 nxt.snap — 적재 전엔 0프레임, 적재 뒤 인증하면 스냅샷 묶음 끝에 1프레임, updated 시 인증된 모든 연결에 재전송, 미인증 소켓엔 없음, close 가 리스너를 뗀다 (quick-260923-pq2)", async () => {
    /** 게이트웨이 종목마스터의 최소 표면 스텁 — `GatewaySymbolMaster` 가 구조적으로 만족하는 모양. */
    class StubNxtFeed extends EventEmitter {
      isins: readonly string[] | null = null;
      nxtTradableIsins(): readonly string[] | null {
        return this.isins;
      }
    }
    const feed = new StubNxtFeed();
    // 기본 `h` 는 건드리지 않는다 — dep 를 주입한 별도 하네스(⑧ strict 선례).
    const nx = await startHarness({ nxtTradable: feed });
    expect(feed.listenerCount("updated")).toBe(1);

    async function openNx(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
      const ws = await connectWs(nx.port, WS_PATH);
      sockets.push(ws);
      const inbox: RelayOutbound[] = [];
      ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
      return { ws, inbox };
    }

    // (a) 모름(null) — 빈 배열로 위장하지 않고 아예 보내지 않는다. rate.cross.snap 은 1(다른 규율).
    const tabA = await openNx();
    tabA.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabA.inbox, "vi.list").length === 1, "A 스냅샷");
    await flushIo(20);
    expect(framesOf(tabA.inbox, "nxt.snap")).toHaveLength(0);
    expect(framesOf(tabA.inbox, "rate.cross.snap")).toHaveLength(1);

    // (b) 적재 뒤 인증 — 스냅샷 묶음 끝(rate.cross.snap 뒤)에 정확히 1프레임.
    feed.isins = [SAMPLE_ISIN];
    const tabB = await openNx();
    tabB.ws.sendAuth("token-a");
    await waitFor(() => framesOf(tabB.inbox, "vi.list").length === 1, "B 스냅샷");
    await flushIo(20);
    expect(framesOf(tabB.inbox, "nxt.snap")).toEqual([{ t: "nxt.snap", isins: [SAMPLE_ISIN] }]);
    const nxtIdx = tabB.inbox.findIndex((m) => m.t === "nxt.snap");
    const crossIdx = tabB.inbox.findIndex((m) => m.t === "rate.cross.snap");
    expect(crossIdx).toBeGreaterThanOrEqual(0);
    expect(nxtIdx).toBeGreaterThan(crossIdx);

    // (c) 재적재(updated) — 인증된 두 탭 모두 1프레임씩 더, 미인증 소켓은 0.
    const anon = await openNx();
    await flushIo(4);
    feed.isins = [SAMPLE_ISIN, OTHER_ISIN];
    feed.emit("updated", { count: 2 });
    await waitFor(
      () =>
        framesOf(tabA.inbox, "nxt.snap").length === 1 &&
        framesOf(tabB.inbox, "nxt.snap").length === 2,
      "updated 재전송",
    );
    await flushIo(20);
    expect(framesOf(tabA.inbox, "nxt.snap")).toEqual([
      { t: "nxt.snap", isins: [SAMPLE_ISIN, OTHER_ISIN] },
    ]);
    expect(framesOf(tabB.inbox, "nxt.snap")[1]).toEqual({
      t: "nxt.snap",
      isins: [SAMPLE_ISIN, OTHER_ISIN],
    });
    expect(framesOf(anon.inbox, "nxt.snap")).toHaveLength(0);

    // (d) close 가 리스너를 뗀다.
    await nx.close();
    expect(feed.listenerCount("updated")).toBe(0);
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

  it("⑰-buy3 lc.set 은 buy3_schema=1 · C→S 12 · buy_watch_side 없음 · S→C 슬롯 없음으로 나가고 60 에코(보유중)가 lc 로 온다 (Phase 24 트레이서)", async () => {
    const a = await authed("token-a");

    // 옛 탭이 감시대상 "1" 을 실어 보내도 zod 가 떨어뜨려 게이트웨이에는 슬롯이 없다(T-24-01 · T-24-13).
    const cfg = {
      ...lcInput({
      preBuyEnabled: true,
      extraBuyEnabled: true,
      extraBuyMinQty: 50_000,
      extraBuyMaxQty: 150_000,
      extraBuyOrderAmount: 4000,
      extraBuyOrderQty: 571,
      postBuyEnabled: true,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      postBuyOrderAmount: 4000,
      postBuyOrderQty: 571,
      }),
      buyWatchSide: "1",
    };
    a.ws.sendRaw({ t: "lc.set", cfg });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );

    const sets = gateway
      .strategyRequests()
      .filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    expect(sets).toHaveLength(1);
    const req = readSetLimitChaserRequest(sets[0]!.msgType, sets[0]!.payload);
    expect(req).toMatchObject({
      buy3Schema: 1,
      preBuyEnabled: true,
      extraBuyEnabled: true,
      extraBuyMinQty: 50_000,
      extraBuyMaxQty: 150_000,
      extraBuyOrderAmount: 4000,
      extraBuyOrderQty: 571,
      postBuyEnabled: true,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      postBuyOrderAmount: 4000,
      postBuyOrderQty: 571,
      buyWatchSide: null,
      serverOnlySlots: [],
    });

    // 게이트웨이가 60 에코(후매수 보유중)를 민다 → 그 ws 에 lc 프레임.
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.pushLimitChaserEcho(sock, {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      buyEnabled: true,
      postBuyEnabled: true,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
    });
    await waitFor(() => framesOf(a.inbox, "lc").length > 0, "lc 에코 프레임");

    const item = framesOf(a.inbox, "lc").at(-1)!.item;
    expect(item.postBuyPhase).toBe(2);
    expect(item.buy3Schema).toBe(1);
    expect(item.postBuyTriggerQty).toBe(330_000);
    expect(item.postBuyReentryLeft).toBe(2);
    expect(item.buyWatchSide).toBe("0");
    // 활성 58(+ postBuyAuto · quick-260929-vzy · extraBuyAbandonQty · quick-260930-fi4 · postBuyUnlockQty · quick-261002-fim)
    // + key — 봉인된 매수 진입 래치는 없다.
    expect(Object.keys(item)).toHaveLength(59);
  });

  /*
    24-03 구 탭 관용 (RESEARCH F-4 · Pitfall 3 · T-24-11 · T-24-14 · T-24-15 · T-24-42).

    relay 가 webapp push 보다 먼저 배포되고, push 뒤에도 열린 탭 · 앱 WebView 는 새로고침 전까지 옛 JS 다.
    옛 모양 `lc.set`(신필드 없음)을 zod 위반으로 끊으면 시세 · 에코 · 수동주문까지 멈추는 재접속 루프가
    된다 — 거부 프레임 + 소켓 유지로 답하고, 게이트웨이에는 0바이트다(`buy3_schema=0` 레거시 중계 없음).
  */
  it("⑰-legacy 옛 모양 lc.set 은 게이트웨이 0바이트 · 거부 프레임 1건 · 소켓 유지 — 같은 소켓의 새 모양 lc.set 은 10 으로 간다", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: legacyCfg() });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "구 탭 거부 프레임");
    await flushIo(30);

    const setsOf = () =>
      gateway.strategyRequests().filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    expect(setsOf()).toHaveLength(0);
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({
      lv: "ERROR",
      src: RELAY_MSG_SOURCE,
      m: LC_LEGACY_SET_REJECT_TEXT,
      i: SAMPLE_ISIN,
      a: "",
    });
    expect(a.ws.closeInfo).toBeNull();
    // 로그에 계좌번호를 싣지 않는다 (T-16-45).
    const logged = warnSpy.mock.calls.find((call) => String(call[1] ?? "").includes("구 탭 lc.set"));
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);

    // 같은 소켓의 다음 새 모양 lc.set 은 그대로 중계된다 = 소켓 OPEN 의 증거.
    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(() => setsOf().length === 1, "새 모양 10 수신");
    const req = readSetLimitChaserRequest(setsOf()[0]!.msgType, setsOf()[0]!.payload);
    expect(req?.buy3Schema).toBe(1);
    expect(framesOf(a.inbox, "msg")).toHaveLength(1);
    expect(a.ws.closeInfo).toBeNull();
  });

  it("⑰-legacy-b 게이트 4종이 전부 OFF 인 옛 모양 lc.set(철거)은 신필드 중립값 · buy3_schema=1 로 10 이 나간다 (T-16-44)", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: legacyCfg({
        crud: "D",
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "철거 10 수신",
    );
    await flushIo(30);

    const sets = gateway
      .strategyRequests()
      .filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    expect(sets).toHaveLength(1);
    const req = readSetLimitChaserRequest(sets[0]!.msgType, sets[0]!.payload);
    expect(req).toMatchObject({
      buy3Schema: 1,
      buyEnabled: false,
      preBuyEnabled: false,
      extraBuyEnabled: false,
      extraBuyMinQty: 0,
      extraBuyMaxQty: 0,
      extraBuyOrderAmount: 0,
      extraBuyOrderQty: 0,
      postBuyEnabled: false,
      postBuyReboundPct: 0,
      postBuyFloorQty: 0,
      postBuyReentry: 0,
      postBuyOrderAmount: 0,
      postBuyOrderQty: 0,
      buyWatchSide: null,
      serverOnlySlots: [],
    });
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
    expect(a.ws.closeInfo).toBeNull();
  });

  it("⑰-legacy-c 허용 목록 밖 계좌의 옛 모양 lc.set 은 종전 계좌 거부로 끝난다 — 구 탭 문구가 아니다 (판정 순서 · T-24-14)", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({ t: "lc.set", cfg: legacyCfg({ accountNo: FOREIGN_ACCOUNT_NO }) });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "계좌 거부 통지");
    await flushIo(30);

    expect(
      gateway.strategyRequests().filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
    ).toHaveLength(0);
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected?.m).toBe("이 세션에서 사용할 수 없는 계좌입니다.");
    expect(rejected?.m).not.toBe(LC_LEGACY_SET_REJECT_TEXT);
    expect(a.ws.closeInfo).toBeNull();
  });

  /*
    17-05 / D-06 / T-17-17 — `vi.set` 의 거래소는 **호출부(이 분기)가** 채운다.

    조립기(`buildSetVITriggerReq`)에는 기본값이 없다. 기본값을 조립기에 두면 호출 경로마다
    다른 기본값이 생기고, `buildSetLimitChaserReq` 의 `market` 기본값 `"K"` 가 코스닥 전략을
    코스피로 등록시킨 선례가 정확히 그 실패다. 그래서 「생략 = KRX」는 여기 한 곳에서만
    일어나야 하고, 그 사실은 **게이트웨이가 읽은 바이트**로만 확인할 수 있다.
  */
  it("⑰-c vi.set 의 거래소가 그대로 나간다 — 생략하면 호출부가 KRX 를 채운다 (17-05 / D-06)", async () => {
    const a = await authed("token-a");
    const viSetBase = {
      t: "vi.set" as const,
      accountNo: SAMPLE_ACCOUNT_NO,
      orderAmountKrw: 3_000_000,
      checkRate: 25,
      run: true,
    };

    // ① 명시한 NXT 가 와이어까지 살아 간다.
    a.ws.sendRaw({ ...viSetBase, exchange: "NXT" });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetVITriggerReq),
      "11 수신(NXT)",
    );
    const first = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetVITriggerReq);
    expect(readViSetRequest(first!.msgType, first!.payload)?.exchange).toBe("NXT");

    // ② 생략하면 **명시로 "KRX" 가 실려 나간다** — 슬롯을 비워 서버 기본값에 기대지 않는다.
    a.ws.sendRaw({ ...viSetBase });
    await waitFor(
      () =>
        gateway.strategyRequests().filter((r) => r.msgType === STRATEGY_MSG.SetVITriggerReq)
          .length === 2,
      "11 수신(생략)",
    );
    const second = gateway
      .strategyRequests()
      .filter((r) => r.msgType === STRATEGY_MSG.SetVITriggerReq)[1];
    expect(readViSetRequest(second!.msgType, second!.payload)?.exchange).toBe("KRX");

    // ③ 미지 거래소는 zod 가 끊는다 — 게이트웨이로 **한 바이트도 더 나가지 않는다**.
    a.ws.sendRaw({ ...viSetBase, exchange: "KOSPI" });
    await flushIo(40);
    expect(
      gateway.strategyRequests().filter((r) => r.msgType === STRATEGY_MSG.SetVITriggerReq),
    ).toHaveLength(2);
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

  /*
    quick-260929-vzy — 후매수 ☐자동. 브라우저 cfg 의 `postBuyAuto` 존재가 10 의 buy3_schema 를 정한다(D-03).
    「자동만 켠 등록」은 철거가 아니다 — gh-trade dcaa78b1 은 이 등록을 삭제로 정규화하지 않는다(P-1 · T-vzy-04).
  */
  it("⑰-auto lc.set 의 postBuyAuto true → 10 buy3Schema 2 · true / false → 2 · false / 필드 없음 → 1 · false (D-03)", async () => {
    const a = await authed("token-a");
    const cases: { over: Partial<LcSetCfg>; schema: number; auto: boolean }[] = [
      { over: { postBuyAuto: true }, schema: 2, auto: true },
      { over: { postBuyAuto: false }, schema: 2, auto: false },
      { over: {}, schema: 1, auto: false },
    ];
    for (const [i, c] of cases.entries()) {
      a.ws.sendRaw({ t: "lc.set", cfg: lcInput(c.over) });
      await waitFor(
        () =>
          gateway.strategyRequests().filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq).length ===
          i + 1,
        `10 수신 ${i + 1}`,
      );
    }
    const reqs = gateway
      .strategyRequests()
      .filter((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq)
      .map((r) => readSetLimitChaserRequest(r.msgType, r.payload)!);
    expect(reqs.map((r) => [r.buy3Schema, r.postBuyAuto])).toEqual(
      cases.map((c) => [c.schema, c.auto]),
    );
  });

  it("⑰-auto-b 게이트 4종 OFF + postBuyAuto true(crud C)는 철거가 아니다 — 모르는 ISIN 이면 거부 · 0바이트, 자동 false 면 종전 철거 (P-1 · T-16-42)", async () => {
    const a = await authed("token-a");
    const gatesOff = {
      isin: UNKNOWN_ISIN,
      crud: "C" as const,
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
      cancelTradeEnabled: false,
    };

    // ① 자동만 켠 등록 — 엄격 시장 해석이 걸린다(기본 "K" 폴백 금지).
    a.ws.sendRaw({ t: "lc.set", cfg: lcInput({ ...gatesOff, postBuyAuto: true }) });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);
    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    const [rejected] = framesOf(a.inbox, "msg");
    expect(rejected).toMatchObject({ lv: "ERROR", src: RELAY_MSG_SOURCE, i: UNKNOWN_ISIN });
    expect(rejected?.m).toContain("전략을 등록할 수 없습니다");

    // ② 같은 조건에 자동 false — 종전 ⑰-e 처럼 철거로 나간다.
    a.ws.sendRaw({ t: "lc.set", cfg: lcInput({ ...gatesOff, postBuyAuto: false }) });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    const req = gateway
      .strategyRequests()
      .find((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq);
    expect(rootEnvelope(req!.payload).setLimitChaser()?.market()).toBe("K");
    expect(framesOf(a.inbox, "msg")).toHaveLength(1);
  });

  it("⑰-auto-c 60 에코 postBuyAuto true → ws lc 프레임 item.postBuyAuto true · 59키 (D-01)", async () => {
    const a = await authed("token-a");
    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.pushLimitChaserEcho(sock, {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      buyEnabled: true,
      postBuyAuto: true,
    });
    await waitFor(() => framesOf(a.inbox, "lc").length > 0, "lc 에코 프레임");
    const item = framesOf(a.inbox, "lc").at(-1)!.item;
    expect(item.postBuyAuto).toBe(true);
    expect(Object.keys(item)).toHaveLength(59);
  });

  it("⑰-unlock 60 에코 postBuyUnlockQty 264000 → ws lc 프레임 item 그대로 · 59키 (quick-261002-fim)", async () => {
    // hub 는 상따 에코 객체를 통째로 캐시 · 팬아웃한다 — 필드 합류에 hub 코드 변경이 없다는 것을 이 통과가 증명한다.
    const a = await authed("token-a");
    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 소켓 없음");
    gateway.pushLimitChaserEcho(sock, {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      buyEnabled: true,
      postBuyEnabled: true,
      postBuyPhase: 1,
      postBuyUnlockQty: 264_000,
    });
    await waitFor(() => framesOf(a.inbox, "lc").length > 0, "lc 에코 프레임");
    const item = framesOf(a.inbox, "lc").at(-1)!.item;
    expect(item.postBuyUnlockQty).toBe(264_000);
    expect(item.postBuyTriggerQty).toBe(0);
    expect(Object.keys(item)).toHaveLength(59);
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
      // Phase 24 — 마스터 갈래는 주문가격 · 비교가격 0 이다(선매수 수량 0 은 선매수 갈래 — Pitfall 5).
      cfg: lcInput({ isin: SAMPLE_ISIN, crud: "D", buyEnabled: true, buyOrderPrice: 0 }),
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

  it("⑰-h 선매수 ON + 한방 ON + 한방가격 0 은 거부된다 — UI armBlockOf 「선매수 한방」과 동형 (GC-WR-05 · Phase 24)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ preBuyEnabled: true, sweepEnabled: true, sweepWatchPrice: 0 }),
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

  it("⑰-h2 선매수 OFF 면 한방 ON + 한방가격 0 이어도 통과한다 — 한방은 선매수 안 체크라 판정되지 않는 값이다 (Phase 24)", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw({
      t: "lc.set",
      cfg: lcInput({ preBuyEnabled: false, sweepEnabled: true, sweepWatchPrice: 0 }),
    });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  });

  /*
    Phase 24 Pitfall 5 — 무장 가드는 **그룹별**이다(서버 §9-2 ③~⑤ · 웹 `canArmOf` 와 같은 커밋).
    옛 식은 마스터 ON ∧ `buyOrderQty === 0` 을 전 프레임 거부로 읽어, 선매수 금액이 비어 있는(레거시 · 사용자가
    비움) 정상 후매수 전략까지 게이트웨이에 닿지 못했다. 갈래 = buy(가격) · preBuy · extraBuy · postBuy(각 그룹 수량)
    · sweep(선매수 하위) · sell.
  */
  async function expectArmReject(cfg: LcSetCfg, gate: string): Promise<void> {
    const errSpy = vi.spyOn(logger, "error");
    const a = await authed("token-a");
    a.ws.sendRaw({ t: "lc.set", cfg });
    await waitFor(() => framesOf(a.inbox, "msg").length === 1, "거부 통지");
    await flushIo(30);
    expect(gateway.strategyRequests().map((r) => r.msgType)).not.toContain(
      STRATEGY_MSG.SetLimitChaserReq,
    );
    expect(framesOf(a.inbox, "msg")[0]?.m).toContain("전략을 켤 수 없습니다");
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("발주가·수량 0 인 게이트 무장"),
    );
    expect(logged?.[0]).toMatchObject({ gate });
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(SAMPLE_ACCOUNT_NO);
  }

  async function expectArmPass(cfg: LcSetCfg): Promise<void> {
    const a = await authed("token-a");
    a.ws.sendRaw({ t: "lc.set", cfg });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "10 수신",
    );
    await flushIo(20);
    expect(framesOf(a.inbox, "msg")).toHaveLength(0);
  }

  it("⑰-i1 Pitfall 5 — 마스터 ON + 후매수만 ON(수량 3) + 선매수 금액 0(buyOrderQty 0) 은 게이트웨이에 도달한다", async () => {
    await expectArmPass(
      lcInput({
        buyEnabled: true,
        buyOrderAmount: 0,
        buyOrderQty: 0,
        postBuyEnabled: true,
        postBuyOrderAmount: 30,
        postBuyOrderQty: 3,
        postBuyReboundPct: 10,
      }),
    );
  });

  it("⑰-i2 마스터 ON + 추가매수 ON + extraBuyOrderQty 0 → 거부 · gate extraBuy", async () => {
    await expectArmReject(lcInput({ extraBuyEnabled: true, extraBuyOrderQty: 0 }), "extraBuy");
  });

  it("⑰-i3 마스터 ON + 비교가격 0 → 거부 · gate buy (서버가 마스터를 눕히는 값)", async () => {
    await expectArmReject(lcInput({ buyWatchPrice: 0 }), "buy");
  });

  it("⑰-i4 마스터 ON + 선매수 ON + buyOrderQty 0 → 거부 · gate preBuy", async () => {
    await expectArmReject(lcInput({ preBuyEnabled: true, buyOrderQty: 0 }), "preBuy");
  });

  it("⑰-i5 마스터 ON + 후매수 ON + postBuyOrderQty 0 → 거부 · gate postBuy", async () => {
    await expectArmReject(
      lcInput({ postBuyEnabled: true, postBuyOrderQty: 0, postBuyReboundPct: 10 }),
      "postBuy",
    );
  });

  it("⑰-i6 마스터 OFF + 추가매수 ON + 수량 0 → 통과 (서버가 D-32 로 그룹을 접는다 · 매도 ON 이라 철거 아님)", async () => {
    await expectArmPass(
      lcInput({ buyEnabled: false, sellEnabled: true, extraBuyEnabled: true, extraBuyOrderQty: 0 }),
    );
  });

  it("⑰-i7 마스터 ON + 선매수 금액 0 이어도 선매수가 꺼져 있으면 통과한다(마스터만으로는 수량을 보지 않는다)", async () => {
    await expectArmPass(lcInput({ buyEnabled: true, buyOrderQty: 0 }));
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
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 1, "구독 성립");

    a.ws.sendRaw({ t: "lc.set", cfg: lcInput() });
    await waitFor(
      () => gateway.strategyRequests().some((r) => r.msgType === STRATEGY_MSG.SetLimitChaserReq),
      "전략 요청 수신",
    );
    await flushIo(30);

    // 전략 메시지는 구독 회계에 손대지 않는다.
    expect(h.hub.refCount(SAMPLE_ISIN, "KRX")).toBe(1);

    // `undefined|undefined` 키가 만들어졌다면 이 해제가 「잡지 않은 키」로 무시된다.
    a.ws.sendUnsub(SAMPLE_ISIN, "KRX");
    await waitFor(() => h.hub.refCount(SAMPLE_ISIN, "KRX") === 0, "구독 해제");
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

  /**
   * ㉓㉔ — R2-WR-05. `#register` 의 docstring 이 선언한 「상태 리스너는 **사용자당 1개**」가
   * 실제로 성립하는지 본다.
   *
   * 전제: `#onClose` 는 마지막 소켓에서 `#users` 엔트리를 지우지만 `DmaSession` 은 유예
   * 5분 동안 살아 있다(D-15). 가짜 타이머라 유예가 흐르지 않으므로 재접속은 **같은 세션**을
   * 받는다 — 각 케이스가 그 사실을 `toBe(session)` 으로 먼저 확인한다. 그 전제가 깨지면
   * (세션이 새로 생기면) 리스너가 1개인 것은 당연해져 검증이 무의미해지기 때문이다.
   */
  async function refresh(
    times: number,
    session: DmaSession,
  ): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    let conn = await authed("token-a");
    for (let i = 0; i < times; i += 1) {
      await conn.ws.close();
      // 클라이언트 close 만으로는 서버측 `#onClose` 가 끝났다고 볼 수 없다.
      await waitFor(() => h.fanout.stats().authedUserCount === 0, `${i + 1}회차 서버측 엔트리 회수`);
      conn = await authed("token-a");
      expect(h.sessions.get(USER_A)).toBe(session);
    }
    return conn;
  }

  it("㉓ 새로고침을 3회 반복해도 세션 \"state\" 리스너는 1개다 (R2-WR-05)", async () => {
    const boot = await authed("token-a");
    const session = h.sessions.get(USER_A);
    expect(session).toBeDefined();
    if (session === undefined) throw new Error("세션이 없다");
    // 이 파일 밖에서 `"state"` 를 듣는 곳은 없다 — 이 수는 곧 팬아웃 리스너 수다.
    expect(session.listenerCount("state")).toBe(1);
    await boot.ws.close();
    await waitFor(() => h.fanout.stats().authedUserCount === 0, "부팅 소켓 회수");

    await refresh(3, session);

    // 누적이 있으면 4(부팅 1 + 재접속 3)가 된다.
    expect(session.listenerCount("state")).toBe(1);
  });

  it("㉔ 재접속을 반복해도 상태 프레임은 브라우저로 한 번만 간다 (R2-WR-05)", async () => {
    const boot = await authed("token-a");
    const session = h.sessions.get(USER_A);
    if (session === undefined) throw new Error("세션이 없다");
    await boot.ws.close();
    await waitFor(() => h.fanout.stats().authedUserCount === 0, "부팅 소켓 회수");

    const last = await refresh(3, session);
    const before = framesOf(last.inbox, "state").length;

    // 인증 ACK 는 `#send` 직접 경로다 — 리스너 경로를 보려면 상태 전이를 따로 발행한다.
    session.emit("state", { t: "state", s: "reconnecting", attempt: 7 });
    await waitFor(
      () => framesOf(last.inbox, "state").length > before,
      "리스너 경로로 내려온 상태 프레임",
    );
    await flushIo(30);

    const delivered = framesOf(last.inbox, "state").slice(before);
    // 리스너가 k 개면 같은 프레임이 k 건 온다. 이것이 증상 그 자체다.
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toEqual({ t: "state", s: "reconnecting", attempt: 7 });
  });
});
