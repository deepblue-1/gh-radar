/**
 * Phase 29 Plan 20 — ADMIN-06 트레이서. 증권사별 세션 acquire · hub 세션 소유 키 · 병합 상태 프레임 · 교보 계좌 주문 라우팅.
 *
 * 경로: 브라우저 wss `{t:"auth"}` → 토큰 검증 → 자격증명(주입 스텁) → `brokersFor(dmaUserId)`(교보 저널 매핑 스텁) 의
 * 증권사마다 `SessionManager.acquireFor` → `hub.attach`(세션 소유 키 `${userId}|${serverKey}`) → 병합 상태 프레임.
 *
 * 실 `WsFanout` · 실 `SessionManager`(레지스트리 흉내 `resolveTarget` — KB120 · KYOBO119) · 실 `SubscriptionHub` · TCP 로
 * 붙는 스텁 게이트웨이 2대. 가짜는 Supabase 토큰 검증 · 자격증명 공급자 · 교보 매핑(`brokersFor`) 셋뿐이다.
 *
 * 검증 대상 (29-20 Task 1 behavior):
 *   ① KB · 교보 계좌를 모두 가진 사용자 → 세션 2(KB120 · KYOBO119) · 두 스텁이 각자 LoginReq 1건 · 상태 프레임 accounts 합집합
 *      · 교보 세션은 24(상따 목록)만, 21 · 34 · 43 은 primary(KB) 만(D-18)
 *   ② 교보 매핑에 없으면 교보 LoginReq 0 · KB 세션 1개만(종전과 같다)
 *   ③ KB 만 ready(교보 로그인 무응답)여도 상태 프레임 s = ready
 *   ④ 잔고 66 — 두 스텁의 계좌를 브라우저가 둘 다 받고, 교보 세션 결선 뒤에도 KB 계좌 캐시가 남는다(재접속 탭 스냅샷에 둘 다)
 *   ⑤ `order.new` — 교보 계좌는 교보 스텁으로만, KB 계좌는 KB 스텁으로만
 *   ⑥ 탭 닫힘 → 두 세션 모두 release(유예) → 유예 만료 뒤 세션 0
 *
 * Phase 29-35 (G-1 ④) — 같은 증권사 두 서버(KB120 · KB121) 스텁 · 운영 결선(`serversFor` · `acquireOn` · `ownerOf`)으로 아래
 * `describe` 가 「같은 사용자의 두 서버 세션이 hub 에 함께 결선되고, 계좌 프레임은 그 계좌 주문 서버 세션 것만 브라우저로 간다」 를 본다.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RelayAccountState,
  RelayLimitChaserSnapMsg,
  RelayOutbound,
  RelayStateMsg,
  RelayViTriggerMsg,
} from "@gh-radar/shared";

import { SESSION_GRACE_MS, SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { createOrderServerRouting } from "../src/access/account-order-servers.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { DmaBroker, DmaServerRow } from "../src/registry/registry.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import {
  readGetVITriggerExchange,
  readViConfirmRequest,
  readViSetRequest,
  startFakeGateway,
  type FakeGateway,
} from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildLimitChaserListRespFrame,
  buildSetVITriggerRespFrame,
  buildViOrderListFrame,
} from "./helpers/frames.js";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-0000000020a1";
const CREDS: DmaCredentials = { dmaUserId: "dma-d1", password: "pw-절대노출금지" };
/** KB 스텁 계좌 = `SAMPLE_ACCOUNT_NO`(A1). 교보 스텁 계좌(B1) — 겹치지 않는다(같은 계좌번호 두 증권사는 다루지 않는다). */
const A1 = SAMPLE_ACCOUNT_NO;
const B1 = "7777777701";

const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined =>
    isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
};

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 400): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

function envOf(p: Buffer): Envelope {
  return Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(new Uint8Array(p.buffer, p.byteOffset, p.length)));
}

function countOf(payloads: Buffer[], msgType: number): number {
  return payloads.filter((p) => envOf(p).msgType() === msgType).length;
}

/** 게이트웨이가 받은 `DirectOrderReq(2)` 의 계좌번호들. */
function orderAccountsOf(payloads: Buffer[]): string[] {
  return payloads
    .map(envOf)
    .filter((env) => env.msgType() === MSG.DirectOrderReq)
    .map((env) => env.directOrderReq()?.accountNo() ?? "");
}

function orderNew(accountNo: string, rid: string) {
  return {
    t: "order.new" as const,
    rid,
    isin: SAMPLE_ISIN,
    exchange: "KRX" as const,
    side: "B" as const,
    qty: 10,
    price: 70_000,
    accountNo,
  };
}

/** 게이트웨이가 받은 `GetVITriggerReq(21)` 의 요청 거래소들(보낸 순). */
function viGetsOf(payloads: Buffer[]): string[] {
  return payloads
    .filter((p) => envOf(p).msgType() === MSG.GetVITriggerReq)
    .map((p) => readGetVITriggerExchange(MSG.GetVITriggerReq, p) ?? "<bare>");
}

function vis(inbox: RelayOutbound[]): RelayViTriggerMsg[] {
  return inbox.filter((m): m is RelayViTriggerMsg => m.t === "vi");
}

/** 게이트웨이가 받은 `SetVITriggerReq(11)` 내용들. */
function viSetsOf(payloads: Buffer[]): NonNullable<ReturnType<typeof readViSetRequest>>[] {
  return payloads
    .map((p) => readViSetRequest(envOf(p).msgType(), p))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** 게이트웨이가 받은 `ConfirmVIOrderReq(33)` 의 주문번호들. */
function viConfirmsOf(payloads: Buffer[]): string[] {
  return payloads
    .map((p) => readViConfirmRequest(envOf(p).msgType(), p))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => r.orderNo);
}

/** relay 가 낸 거부 프레임(`msg` ERROR) 중 그 명령 몫. */
function rejectsOf(inbox: RelayOutbound[], kind: string): RelayOutbound[] {
  return inbox.filter((m) => m.t === "msg" && m.lv === "ERROR" && m.kind === kind);
}

function statesOf(inbox: RelayOutbound[]): RelayStateMsg[] {
  return inbox.filter((m): m is RelayStateMsg => m.t === "state");
}

function acctsOf(inbox: RelayOutbound[]): RelayAccountState[] {
  return inbox.filter((m): m is RelayAccountState => m.t === "acct");
}

function supabaseStub(): SupabaseClient {
  return {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          token === "token-a"
            ? { data: { user: { id: USER_A } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        ),
    },
  } as unknown as SupabaseClient;
}

describe("WsFanout — 증권사별 세션 · hub 세션 소유 키 · 병합 상태 프레임 (29-20 트레이서)", () => {
  let kb: FakeGateway;
  let kyobo: FakeGateway;
  let kbPayloads: Buffer[];
  let kyoboPayloads: Buffer[];
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let manager: SessionManager;
  let fanout: WsFanout;
  /** 교보 저널 매핑에 d1 이 있는가 — `brokersFor` 스텁의 원천(운영 = 교보 주문 서버 파이프라인 access.accountsOf). */
  let kyoboMapped: boolean;
  const sockets: TestWs[] = [];

  async function setup(kyoboOpts: { autoLogin?: boolean } = {}): Promise<void> {
    kb = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    kyobo = await startFakeGateway({
      autoLogin: kyoboOpts.autoLogin ?? true,
      loginResp: { success: true, accounts: [{ accountNo: B1, name: "교보 위탁" }] },
    });
    kbPayloads = [];
    kyoboPayloads = [];
    kb.onFrame((_t, payload) => kbPayloads.push(Buffer.from(payload)));
    kyobo.onFrame((_t, payload) => kyoboPayloads.push(Buffer.from(payload)));
    const orderServers = new Map<string, SessionTarget>([
      ["KB", { serverKey: "KB120", host: "127.0.0.1", port: kb.port, broker: "KB" }],
      ["KYOBO", { serverKey: "KYOBO119", host: "127.0.0.1", port: kyobo.port, broker: "KYOBO" }],
    ]);
    manager = new SessionManager({ host: "127.0.0.1", port: 1, broker: "KB", resolveTarget: (b) => orderServers.get(b) });
    hub = new SubscriptionHub();
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
    fanout = new WsFanout({
      server,
      supabase: supabaseStub(),
      sessions: manager,
      hub,
      credKey: randomBytes(32).toString("base64"),
      credentials: (userId) => Promise.resolve(userId === USER_A ? CREDS : null),
      brokersFor: (dmaUserId): DmaBroker[] => (dmaUserId === CREDS.dmaUserId && kyoboMapped ? ["KB", "KYOBO"] : ["KB"]),
      path: "/ws",
      symbols: SYMBOLS,
    });
  }

  async function tab(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, "/ws");
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth("token-a");
    await waitFor(() => statesOf(inbox).length > 0, "인증 상태 프레임");
    return { ws, inbox };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    kyoboMapped = true;
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) await ws.close();
    await fanout?.close();
    await manager?.closeAll();
    hub?.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await kb.close();
    await kyobo.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("① 두 증권사 계좌 사용자 — 세션 2 · 스텁마다 LoginReq 1 · 상태 프레임 accounts 합집합 · 교보는 24 만(21 · 34 · 43 은 KB)", async () => {
    await setup();
    const acquireSpy = vi.spyOn(manager, "acquireFor");
    const { inbox } = await tab();

    await waitFor(
      () => statesOf(inbox).some((f) => f.s === "ready" && (f.accounts ?? []).length === 2),
      "병합 상태 프레임(두 계좌)",
    );
    expect(acquireSpy.mock.calls.map((c) => c[1])).toEqual(["KB", "KYOBO"]);
    expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120", "KYOBO119"]);
    expect(countOf(kbPayloads, MSG.LoginReq)).toBe(1);
    expect(countOf(kyoboPayloads, MSG.LoginReq)).toBe(1);

    const merged = statesOf(inbox).find((f) => f.s === "ready" && (f.accounts ?? []).length === 2);
    // primary(KB) 계좌가 먼저다.
    expect(merged?.accounts?.map((a) => a.accountNo)).toEqual([A1, B1]);

    // 두 세션 모두 Ready 프리페치 — 계좌(25)는 세션마다, 상따 목록(24)도 세션마다, 21 · 34 · 43 은 primary(KB) 만.
    await waitFor(
      () => countOf(kbPayloads, MSG.GetUserSettingsReq) === 1 && countOf(kyoboPayloads, MSG.GetLimitChaserListReq) === 1,
      "두 세션 Ready 프리페치",
    );
    await flushIo(10);
    expect(countOf(kbPayloads, MSG.GetAccountStateReq)).toBe(1);
    expect(countOf(kyoboPayloads, MSG.GetAccountStateReq)).toBe(1);
    expect(countOf(kbPayloads, MSG.GetVITriggerReq)).toBe(2);
    expect(countOf(kyoboPayloads, MSG.GetVITriggerReq)).toBe(0);
    expect(countOf(kyoboPayloads, MSG.GetVIOrderListReq)).toBe(0);
    expect(countOf(kyoboPayloads, MSG.GetUserSettingsReq)).toBe(0);
  });

  it("② 교보 매핑에 없으면 교보 LoginReq 0 · KB 세션 1개만(종전과 같다)", async () => {
    kyoboMapped = false;
    await setup();
    const acquireSpy = vi.spyOn(manager, "acquireFor");
    const { inbox } = await tab();

    await waitFor(() => statesOf(inbox).some((f) => f.s === "ready"), "KB ready");
    await flushIo(10);
    expect(acquireSpy.mock.calls.map((c) => c[1])).toEqual(["KB"]);
    expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120"]);
    expect(kyobo.sockets).toHaveLength(0);
    expect(countOf(kyoboPayloads, MSG.LoginReq)).toBe(0);
    // 단일 세션 = 그 세션 프레임 그대로(「세션 1개짜리 병합」).
    expect(statesOf(inbox).find((f) => f.s === "ready")?.accounts?.map((a) => a.accountNo)).toEqual([A1]);
  });

  it("③ KB 만 ready(교보 로그인 무응답)여도 상태 프레임 s = ready — 계좌는 Ready 세션 몫", async () => {
    await setup({ autoLogin: false });
    const { inbox } = await tab();

    await waitFor(() => statesOf(inbox).some((f) => f.s === "ready"), "병합 ready");
    expect(manager.sessionsOf(USER_A).map((s) => s.state)).toEqual(["ready", "logging_in"]);
    const last = statesOf(inbox).at(-1);
    expect(last?.s).toBe("ready");
    expect(last?.accounts?.map((a) => a.accountNo)).toEqual([A1]);
  });

  it("④ 잔고 66 — 두 증권사 계좌를 둘 다 받고, 교보 세션 결선 뒤에도 KB 계좌 캐시가 남는다(새 탭 스냅샷에 둘 다)", async () => {
    // 첫 탭은 교보 매핑 전 — KB 세션만. KB 계좌 캐시를 먼저 채운다.
    kyoboMapped = false;
    await setup();
    const first = await tab();
    await waitFor(() => statesOf(first.inbox).some((f) => f.s === "ready"), "KB ready");
    const kbSock = kb.sockets[0];
    if (kbSock === undefined) throw new Error("KB 소켓 없음");
    kb.sendFrame(kbSock, buildAccountStateFrame({ accountNo: A1, holdings: [{ isin: SAMPLE_ISIN, stockQty: 3 }] }));
    await waitFor(() => acctsOf(first.inbox).some((a) => a.a === A1), "KB 66 A1");

    // 교보 매핑이 생긴 뒤 둘째 탭 — 교보 세션이 결선된다(Pitfall 9: 같은 userId 다른 세션 = 캐시 폐기 규칙이 사라졌다).
    kyoboMapped = true;
    const second = await tab();
    await waitFor(() => manager.sessionsOf(USER_A).every((s) => s.isReady) && manager.sessionsOf(USER_A).length === 2, "두 세션 ready");
    // 둘째 탭의 인증 스냅샷에 KB A1 이 있다 — 교보 결선이 KB 캐시를 지우지 않았다.
    expect(acctsOf(second.inbox).map((a) => a.a)).toContain(A1);

    const kySock = kyobo.sockets[0];
    if (kySock === undefined) throw new Error("교보 소켓 없음");
    kyobo.sendFrame(kySock, buildAccountStateFrame({ accountNo: B1, holdings: [{ isin: SAMPLE_ISIN, stockQty: 7 }] }));
    await waitFor(
      () => acctsOf(first.inbox).some((a) => a.a === B1) && acctsOf(second.inbox).some((a) => a.a === B1),
      "교보 66 B1 — 두 탭 모두",
    );

    // hub 합집합 · 셋째 탭(재접속)의 스냅샷에 둘 다.
    expect(hub.getAccountStates(USER_A).map((s) => s.a).sort()).toEqual([A1, B1].sort());
    const third = await tab();
    await waitFor(() => acctsOf(third.inbox).length >= 2, "재접속 스냅샷");
    expect(acctsOf(third.inbox).map((a) => a.a).sort()).toEqual([A1, B1].sort());
    expect(acctsOf(third.inbox).find((a) => a.a === A1)?.hold[0]?.qty).toBe(3);
    expect(acctsOf(third.inbox).find((a) => a.a === B1)?.hold[0]?.qty).toBe(7);
    // 상태 프레임은 합집합.
    expect(statesOf(third.inbox)[0]?.accounts?.map((a) => a.accountNo)).toEqual([A1, B1]);
  });

  it("⑤ order.new — 교보 계좌 B1 은 교보 스텁으로만, KB 계좌 A1 은 KB 스텁으로만", async () => {
    await setup();
    const { ws } = await tab();
    await waitFor(() => manager.sessionsOf(USER_A).length === 2 && manager.sessionsOf(USER_A).every((s) => s.isReady), "두 세션 ready");

    ws.sendRaw(orderNew(B1, "rid-b1"));
    await waitFor(() => orderAccountsOf(kyoboPayloads).length === 1, "교보 스텁 DirectOrderReq");
    expect(orderAccountsOf(kyoboPayloads)).toEqual([B1]);
    expect(orderAccountsOf(kbPayloads)).toEqual([]);

    ws.sendRaw(orderNew(A1, "rid-a1"));
    await waitFor(() => orderAccountsOf(kbPayloads).length === 1, "KB 스텁 DirectOrderReq");
    expect(orderAccountsOf(kbPayloads)).toEqual([A1]);
    expect(orderAccountsOf(kyoboPayloads)).toEqual([B1]);
  });

  it("⑥ 탭 닫힘 → 두 세션 모두 release(유예) → 유예 만료 뒤 세션 0", async () => {
    await setup();
    const releaseSpy = vi.spyOn(manager, "release");
    const { ws, inbox } = await tab();
    await waitFor(() => statesOf(inbox).some((f) => f.s === "ready" && (f.accounts ?? []).length === 2), "병합 ready");

    await ws.close();
    sockets.splice(sockets.indexOf(ws), 1);
    await waitFor(() => releaseSpy.mock.calls.length === 2, "release 2건");
    expect(releaseSpy.mock.calls).toEqual([
      [USER_A, "KB120"],
      [USER_A, "KYOBO119"],
    ]);
    // 유예 중엔 세션이 산다(새로고침 왕복 흡수 · D-15).
    expect(manager.sessionsOf(USER_A)).toHaveLength(2);
    vi.advanceTimersByTime(SESSION_GRACE_MS + 1);
    await flushIo();
    expect(manager.sessionsOf(USER_A)).toHaveLength(0);
  });
});

/**
 * Phase 29-35 (G-1 ④) — 같은 증권사 두 서버 세션 hub 공존 · 계좌 소유 필터.
 *
 * 레지스트리 KB120(KB 기본) · KB121(enabled) 두 스텁. 두 서버 users.toml(매핑) 모두에 계좌 A · B 가 있고 A 는 KB121 로 지정(B 는
 * 기본 KB120). 운영 결선 모양 그대로 — `createOrderServerRouting` 의 `serversFor` · `ownerOf` 를 `WsFanout` · `SessionManager` 에 준다.
 */
describe("WsFanout — G-1 같은 증권사 두 서버 · 계좌 프레임은 소유 서버 세션에서만 (29-35)", () => {
  const A = "1234567801";
  const B = "1234567802";
  let kb120: FakeGateway;
  let kb121: FakeGateway;
  let p120: Buffer[];
  let p121: Buffer[];
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let manager: SessionManager;
  let fanout: WsFanout;
  let rows: DmaServerRow[];
  /** 계좌 → 지정 서버 키(가변 — 지정 변경 시나리오). 기본: A → KB121. */
  let chosen: Map<string, string>;
  const sockets: TestWs[] = [];

  function row(key: string, gwPort: number, isOrderServer: boolean, sortOrder: number): DmaServerRow {
    return { key, broker: "KB", host: "127.0.0.1", port: gwPort, enabled: true, isOrderServer, isQuotePrimary: false, sortOrder };
  }

  function lcSnapsOf(inbox: RelayOutbound[]): RelayLimitChaserSnapMsg[] {
    return inbox.filter((m): m is RelayLimitChaserSnapMsg => m.t === "lc.snap");
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    const accounts = [
      { accountNo: A, name: "계좌A" },
      { accountNo: B, name: "계좌B" },
    ];
    kb120 = await startFakeGateway({ autoLogin: true, loginResp: { success: true, accounts } });
    kb121 = await startFakeGateway({ autoLogin: true, loginResp: { success: true, accounts } });
    p120 = [];
    p121 = [];
    kb120.onFrame((_t, payload) => p120.push(Buffer.from(payload)));
    kb121.onFrame((_t, payload) => p121.push(Buffer.from(payload)));
    rows = [row("KB120", kb120.port, true, 1), row("KB121", kb121.port, false, 2)];
    chosen = new Map([[A, "KB121"]]);
    const registry = {
      get: (key: string) => rows.find((r) => r.key === key),
      enabled: () => rows.filter((r) => r.enabled),
      orderServerOf: (broker: string) => rows.find((r) => r.broker === broker && r.isOrderServer && r.enabled),
    };
    const routing = createOrderServerRouting({
      loaded: () => true,
      chosenOf: (_dma, _broker, acct) => chosen.get(acct),
      registry,
      accountsOf: (serverKey, dma) =>
        dma === CREDS.dmaUserId && (serverKey === "KB120" || serverKey === "KB121") ? new Set([A, B]) : undefined,
    });
    // 29-35 — primary 선호 = KB 기본 주문 서버(운영 index 와 같은 주입을 SessionManager · hub 둘 다에).
    const preferredPrimaryServerKey = (): string | undefined => registry.orderServerOf("KB")?.key;
    manager = new SessionManager({
      host: "127.0.0.1",
      port: 1,
      broker: "KB",
      ownerOf: routing.ownerOf,
      preferredPrimaryServerKey,
    });
    hub = new SubscriptionHub({ preferredPrimaryServerKey });
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
    fanout = new WsFanout({
      server,
      supabase: supabaseStub(),
      sessions: manager,
      hub,
      credKey: randomBytes(32).toString("base64"),
      credentials: (userId) => Promise.resolve(userId === USER_A ? CREDS : null),
      serversFor: routing.serversFor,
      path: "/ws",
      symbols: SYMBOLS,
    });
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) await ws.close();
    await fanout?.close();
    await manager?.closeAll();
    hub?.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await kb120.close();
    await kb121.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function tab(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, "/ws");
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth("token-a");
    await waitFor(() => statesOf(inbox).length > 0, "인증 상태 프레임");
    return { ws, inbox };
  }

  async function bothReady(): Promise<void> {
    await waitFor(
      () => manager.sessionsOf(USER_A).length === 2 && manager.sessionsOf(USER_A).every((s) => s.isReady),
      "KB120 · KB121 세션 ready",
    );
    await flushIo(10);
  }

  it("같은 증권사 두 서버 · A 프레임은 KB121 것만 브라우저로 — KB120 의 A 66 · 64 항목은 0 · B 는 KB120 것만", async () => {
    const { inbox } = await tab();
    await bothReady();
    // hub 에 두 세션이 함께 결선돼 있다(옛 D-10 대체 규칙이면 KB121 이 KB120 을 떼어 냈다).
    expect(hub.stats().sessionCount).toBe(2);
    const s120 = kb120.sockets[0];
    const s121 = kb121.sockets[0];
    if (s120 === undefined || s121 === undefined) throw new Error("스텁 소켓 없음");
    const from = inbox.length;
    const sinceAuth = (): RelayOutbound[] => inbox.slice(from);

    // KB120(A 의 주문 서버 아님)이 A 잔고 · A/B 섞인 64 를 보낸 뒤 B 잔고(표지)를 보낸다.
    kb120.sendFrame(s120, buildAccountStateFrame({ accountNo: A, holdings: [{ isin: SAMPLE_ISIN, stockQty: 99 }] }));
    kb120.sendFrame(
      s120,
      buildLimitChaserListRespFrame([
        { isin: SAMPLE_ISIN, accountNo: A },
        { isin: SAMPLE_ISIN, accountNo: B },
      ]),
    );
    kb120.sendFrame(s120, buildAccountStateFrame({ accountNo: B, holdings: [{ isin: SAMPLE_ISIN, stockQty: 1 }] }));
    await waitFor(() => acctsOf(sinceAuth()).some((a) => a.a === B), "KB120 66 B");
    expect(acctsOf(sinceAuth()).map((a) => [a.a, a.hold[0]?.qty])).toEqual([[B, 1]]);
    expect(lcSnapsOf(sinceAuth()).at(-1)?.items.map((i) => i.accountNo)).toEqual([B]);

    // KB121(A 의 주문 서버)의 A 는 가고, KB121 의 B 는 버린다.
    kb121.sendFrame(s121, buildAccountStateFrame({ accountNo: B, holdings: [{ isin: SAMPLE_ISIN, stockQty: 77 }] }));
    kb121.sendFrame(s121, buildAccountStateFrame({ accountNo: A, holdings: [{ isin: SAMPLE_ISIN, stockQty: 5 }] }));
    await waitFor(() => acctsOf(sinceAuth()).some((a) => a.a === A), "KB121 66 A");
    expect(acctsOf(sinceAuth()).map((a) => [a.a, a.hold[0]?.qty])).toEqual([
      [B, 1],
      [A, 5],
    ]);

    // 캐시도 소유 서버 몫만 — 새 탭 스냅샷에 A=5(KB121) · B=1(KB120) 각 1건.
    const second = await tab();
    await waitFor(() => acctsOf(second.inbox).length >= 2, "재접속 스냅샷");
    expect(
      acctsOf(second.inbox)
        .map((a) => [a.a, a.hold[0]?.qty])
        .sort(),
    ).toEqual([
      [A, 5],
      [B, 1],
    ]);
    expect(hub.getLimitChasers(USER_A).map((i) => i.accountNo)).toEqual([B]);
  });

  it("생성 순서와 무관하게 primary = KB 기본 주문 서버 세션 — KB121 을 먼저 만들어도 SessionManager · hub · 병합 상태 프레임이 모두 KB120", async () => {
    // KB121 세션을 먼저 만든다(SessionManager 생성 순서 KB121 → KB120).
    const pre = manager.acquireOn(
      USER_A,
      { serverKey: "KB121", host: "127.0.0.1", port: kb121.port, broker: "KB" },
      CREDS,
    );
    await waitFor(() => pre.isReady, "KB121 선행 세션 ready");
    const { inbox } = await tab();
    await bothReady();
    expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB121", "KB120"]);

    // ① SessionManager — 사용자 단위 명령 세션.
    expect(manager.primaryOf(USER_A)?.serverKey).toBe("KB120");
    // ② hub — 43(사용자 설정)은 KB120 으로만. 21 · 34 는 KB 세션 각각이 VI 원천이다(29-51 GC-05) — 단 이 시나리오의 KB121 은
    //    hub 결선 전에 이미 Ready 라 hub Ready 프리페치가 없다(그 세션 몫 21 수는 아래 트레이서가 본다).
    await waitFor(() => countOf(p120, MSG.GetUserSettingsReq) === 1, "KB120 사용자 단위 프리페치");
    await flushIo(10);
    expect(countOf(p120, MSG.GetVITriggerReq)).toBe(2);
    expect(countOf(p121, MSG.GetUserSettingsReq)).toBe(0);
    // ③ 병합 상태 프레임 — primary(KB120) 소유 계좌(B)가 먼저.
    const merged = statesOf(inbox).filter((f) => f.s === "ready" && (f.accounts ?? []).length === 2).at(-1);
    expect(merged?.accounts?.map((a) => a.accountNo)).toEqual([B, A]);

    // VI 61 — 소유 뷰 안이면 그 세션 것도 원천(KB121 의 A · KB120 의 B) · 소유 뷰 밖(KB121 의 B)은 0.
    const s120 = kb120.sockets[0];
    const s121 = kb121.sockets[0];
    if (s120 === undefined || s121 === undefined) throw new Error("스텁 소켓 없음");
    const from = inbox.length;
    kb121.sendFrame(s121, buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true }));
    kb121.sendFrame(s121, buildSetVITriggerRespFrame({ accountNo: A, exchange: "NXT" }));
    kb120.sendFrame(s120, buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX" }));
    await waitFor(() => vis(inbox.slice(from)).length >= 2, "KB121 · KB120 61");
    await flushIo(10);
    expect(vis(inbox.slice(from)).map((m) => [m.x, m.cfg?.accountNo])).toEqual([
      ["NXT", A],
      ["KRX", B],
    ]);
  });

  it("GC-05 (29-51) 트레이서 — vi.set(A) 는 계좌 소유 KB121 세션으로 · KB121 61 에코 → 브라우저 vi KRX = A · 두 KB 세션 각각 21 KRX · NXT · vi.set(B, NXT) 는 KB120", async () => {
    // 스텁은 거래소별 모드 — 21 은 그 슬롯(미등록 = 빈 61), 11 은 저장 뒤 61 에코(서버 Set 에코 흉내).
    for (const g of [kb120, kb121]) {
      g.respondViTriggerFor("KRX", null);
      g.respondViTriggerFor("NXT", null);
    }
    const { ws, inbox } = await tab();
    await bothReady();

    // VI 원천 = 사용자의 KB 세션 각각 — 두 세션 모두 21(KRX → NXT).
    await waitFor(
      () => countOf(p120, MSG.GetVITriggerReq) === 2 && countOf(p121, MSG.GetVITriggerReq) === 2,
      "두 KB 세션 Ready 21",
    );
    expect(viGetsOf(p120)).toEqual(["KRX", "NXT"]);
    expect(viGetsOf(p121)).toEqual(["KRX", "NXT"]);
    // 두 세션 모두 미등록으로 답했다 → 거래소마다 null 이 브라우저로(병합 3상태).
    await waitFor(
      () => vis(inbox).some((m) => m.x === "KRX" && m.cfg === null) && vis(inbox).some((m) => m.x === "NXT" && m.cfg === null),
      "거래소별 미등록",
    );

    const from = inbox.length;
    const since = (): RelayOutbound[] => inbox.slice(from);
    ws.sendRaw({ t: "vi.set", accountNo: A, exchange: "KRX", orderAmountKrw: 5_000_000, checkRate: 25, run: true });
    await waitFor(() => countOf(p121, MSG.SetVITriggerReq) === 1, "KB121 11");
    await waitFor(() => vis(since()).some((m) => m.x === "KRX" && m.cfg?.accountNo === A), "브라우저 vi KRX = A");
    await flushIo(10);
    expect(countOf(p120, MSG.SetVITriggerReq)).toBe(0);
    expect(rejectsOf(since(), "vi.set")).toEqual([]);
    expect(vis(since()).map((m) => [m.x, m.cfg?.accountNo, m.cfg?.run])).toEqual([["KRX", A, true]]);
    expect(hub.getViTrigger(USER_A, "KRX")).toMatchObject({ accountNo: A, run: true });

    // B(KB120 소유)의 VI 는 종전대로 KB120 으로.
    ws.sendRaw({ t: "vi.set", accountNo: B, exchange: "NXT", orderAmountKrw: 3_000_000, checkRate: 20, run: false });
    await waitFor(() => countOf(p120, MSG.SetVITriggerReq) === 1, "KB120 11");
    await waitFor(() => vis(since()).some((m) => m.x === "NXT" && m.cfg?.accountNo === B), "브라우저 vi NXT = B");
    expect(countOf(p121, MSG.SetVITriggerReq)).toBe(1);
    expect(rejectsOf(since(), "vi.set")).toEqual([]);
  });

  it("소유 계좌 0 세션은 병합 상태 프레임의 any-ready · accounts 에 기여하지 않는다 — KB120 이 ready 여도 계좌가 전부 KB121 이면 s 는 KB121 상태", async () => {
    const { inbox } = await tab();
    await bothReady();
    // B 도 KB121 로 지정 — KB120 은 두 계좌를 선언했지만 소유 0 이 된다(재로그인 없이 소유 뷰가 따라간다).
    chosen.set(B, "KB121");
    const k120 = manager.sessionsOf(USER_A).find((s) => s.serverKey === "KB120");
    expect(k120?.allowedAccounts).toEqual([]);
    expect(k120?.isReady).toBe(true);

    // KB121 회선이 끊긴다 → 그 세션 상태 이벤트가 병합 상태 프레임을 보낸다.
    const from = inbox.length;
    const s121 = kb121.sockets[0];
    if (s121 === undefined) throw new Error("KB121 소켓 없음");
    s121.destroy();
    await waitFor(() => statesOf(inbox.slice(from)).length > 0, "KB121 끊김 상태 프레임");
    const last = statesOf(inbox.slice(from)).at(-1);
    // 소유 0 인 KB120 의 ready 가 화면을 「연결됨」 으로 덮지 않는다.
    expect(last?.s).toBe("reconnecting");
    expect(last?.accounts?.map((a) => a.accountNo).sort()).toEqual([A, B].sort());
  });

  /** 두 스텁이 받은 11 을 도착 순서대로 한 줄에 쌓는다(서버 키 · 계좌 · run). */
  function viSetLog(): { log: [string, string, boolean][] } {
    const out: { log: [string, string, boolean][] } = { log: [] };
    kb120.onFrame((t, payload) => {
      const r = readViSetRequest(t, Buffer.from(payload));
      if (r !== null) out.log.push(["KB120", r.accountNo, r.run]);
    });
    kb121.onFrame((t, payload) => {
      const r = readViSetRequest(t, Buffer.from(payload));
      if (r !== null) out.log.push(["KB121", r.accountNo, r.run]);
    });
    return out;
  }

  /** 인증 · 두 세션 Ready 뒤 KB120 의 KRX 칸에 켜진 B(가동 중)를 심는다(61 에코). 스텁은 기본 모드(21 = 빈 61 · 11 은 기록만). */
  async function withRunningBOnKb120(): Promise<{ ws: TestWs; inbox: RelayOutbound[]; s120: NonNullable<(typeof kb120.sockets)[0]>; s121: NonNullable<(typeof kb121.sockets)[0]> }> {
    const { ws, inbox } = await tab();
    await bothReady();
    const s120 = kb120.sockets[0];
    const s121 = kb121.sockets[0];
    if (s120 === undefined || s121 === undefined) throw new Error("스텁 소켓 없음");
    kb120.sendFrame(s120, buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true, orderAmountKrw: 7_000_000n, checkRate: 22 }));
    await waitFor(() => vis(inbox).some((m) => m.x === "KRX" && m.cfg?.accountNo === B && m.cfg.run), "KB120 KRX 켜진 B");
    return { ws, inbox, s120, s121 };
  }

  it("GC-05 가드 — KB120 에 KRX 켜진 B 인 채 vi.set(A, KRX, run:true) → KB120 에 11{B 같은 값 · run:false} 먼저 · KB121 에 11{A, run:true} · 브라우저 vi 는 (B run:false) 뒤 (A run:true)", async () => {
    const order = viSetLog();
    const { ws, inbox, s120, s121 } = await withRunningBOnKb120();
    const from = inbox.length;
    const since = (): RelayOutbound[] => inbox.slice(from);

    ws.sendRaw({ t: "vi.set", accountNo: A, exchange: "KRX", orderAmountKrw: 5_000_000, checkRate: 25, run: true });
    await waitFor(() => order.log.length === 2, "11 두 건");
    expect(order.log).toEqual([
      ["KB120", B, false],
      ["KB121", A, true],
    ]);
    // 끄는 11 은 B 의 등록값 그대로(run 만 false).
    expect(viSetsOf(p120)).toEqual([
      { accountNo: B, exchange: "KRX", orderAmountKrw: 7_000_000, checkRate: 22, priceType: "U", run: false },
    ]);
    expect(rejectsOf(since(), "vi.set")).toEqual([]);

    // 서버 에코 — KB120 의 run:false 가 먼저, KB121 의 run:true 가 뒤.
    kb120.sendFrame(s120, buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false, orderAmountKrw: 7_000_000n, checkRate: 22 }));
    await waitFor(() => vis(since()).length === 1, "B run:false 에코");
    kb121.sendFrame(s121, buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: true }));
    await waitFor(() => vis(since()).length === 2, "A run:true 에코");
    expect(vis(since()).map((m) => [m.x, m.cfg?.accountNo, m.cfg?.run])).toEqual([
      ["KRX", B, false],
      ["KRX", A, true],
    ]);
  });

  it("GC-05 가드 없음 — run:false 로 보내는 vi.set 은 다른 세션에 11 을 보내지 않는다", async () => {
    const { ws } = await withRunningBOnKb120();
    ws.sendRaw({ t: "vi.set", accountNo: A, exchange: "KRX", orderAmountKrw: 5_000_000, checkRate: 25, run: false });
    await waitFor(() => countOf(p121, MSG.SetVITriggerReq) === 1, "KB121 11");
    await flushIo(10);
    expect(countOf(p120, MSG.SetVITriggerReq)).toBe(0);
  });

  it("GC-05 가드 없음 — 같은 세션(B 도 KB121 소유)의 켜진 VI 는 서버가 슬롯을 갈아 끼운다 · 다른 세션 송신 0", async () => {
    const { ws, inbox } = await tab();
    await bothReady();
    // B 도 KB121 로 지정 — 재로그인 없이 소유 뷰가 따라간다(KB120 은 소유 0 · 세션은 남는다).
    chosen.set(B, "KB121");
    const s121 = kb121.sockets[0];
    if (s121 === undefined) throw new Error("KB121 소켓 없음");
    kb121.sendFrame(s121, buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true }));
    await waitFor(() => vis(inbox).some((m) => m.x === "KRX" && m.cfg?.accountNo === B), "KB121 KRX 켜진 B");

    ws.sendRaw({ t: "vi.set", accountNo: A, exchange: "KRX", orderAmountKrw: 5_000_000, checkRate: 25, run: true });
    await waitFor(() => countOf(p121, MSG.SetVITriggerReq) === 1, "KB121 11");
    await flushIo(10);
    expect(countOf(p120, MSG.SetVITriggerReq)).toBe(0);
    expect(viSetsOf(p121).map((r) => [r.accountNo, r.run])).toEqual([[A, true]]);
  });

  it("GC-05 vi.confirm — 그 주문번호가 든 VI 주문 추적의 소유 세션(KB121)으로 · 모르는 주문번호는 primary(KB120 · 종전)", async () => {
    const { ws, inbox } = await tab();
    await bothReady();
    const s120 = kb120.sockets[0];
    const s121 = kb121.sockets[0];
    if (s120 === undefined || s121 === undefined) throw new Error("스텁 소켓 없음");
    kb120.sendFrame(s120, buildViOrderListFrame([{ orderNo: "O1", accountNo: B }], true));
    kb121.sendFrame(s121, buildViOrderListFrame([{ orderNo: "O2", accountNo: A }], true));
    await waitFor(
      () => inbox.some((m) => m.t === "vi.list" && m.items.some((i) => i.orderNo === "O2")),
      "KB121 72 O2",
    );

    ws.sendRaw({ t: "vi.confirm", orderNo: "O2", confirmed: true });
    await waitFor(() => viConfirmsOf(p121).length === 1, "KB121 33");
    expect(viConfirmsOf(p120)).toEqual([]);

    ws.sendRaw({ t: "vi.confirm", orderNo: "O9", confirmed: true });
    await waitFor(() => viConfirmsOf(p120).length === 1, "KB120 33(모르는 주문번호)");
    expect(viConfirmsOf(p120)).toEqual(["O9"]);
    expect(viConfirmsOf(p121)).toEqual(["O2"]);
  });
});
