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
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayAccountState, RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { SESSION_GRACE_MS, SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { DmaBroker } from "../src/registry/registry.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN, buildAccountStateFrame } from "./helpers/frames.js";

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
