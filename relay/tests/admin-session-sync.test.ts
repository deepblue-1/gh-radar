/**
 * Phase 29 Plan 21 — ADMIN-06. 87 → 열린 세션 반영 통합 테스트 (`AdminSessionSync`).
 *
 * 경로(index.ts 결선 모양 그대로): 서버 admin 연결(`AdminConn` · role 2) 의 87 → `AdminSnapshotSink.onSnapshot`(매핑 교체 ·
 * 반영 상태 RPC 스텁) → `applied` → `AdminSessionSync.onApplied` → 그 서버 세션의 `declareAccounts`(Ready 중 mode 1 자가 선언)
 * → 응답 대조 → `accounts` 이벤트 → `WsFanout` 병합 상태 프레임.
 *
 * 실 `AdminConn` · 실 `AdminSnapshotSink` · 실 `SessionManager`(레지스트리 흉내 — KB120 · KYOBO119) · 실 `WsFanout` · 실
 * `SubscriptionHub` · TCP 로 붙는 스텁 게이트웨이 2대(사용자 로그인 + admin 로그인 · `defaultAdminHandler`). 가짜는 Supabase
 * 토큰 검증 · 반영 상태 RPC · 자격증명 공급자 · 저널 매핑(sink `accessOf` 가 갈아 끼우는 메모리 표 — `brokersFor` 원천) 뿐이다.
 *
 * 검증 대상:
 *   ① (트레이서) Admin 이 op 3 으로 d1 에 A2 를 더함 → KB120 87 → d1 KB 세션이 mode "1" A2 1건 선언 → 응답 [A1, A2] →
 *      `allowedAccounts` [A1, A2] → 브라우저 상태 프레임 accounts 에 A2 · 재로그인 0(LoginReq 1 그대로)
 *   ② 같은 87(변화 없음 · op 5) → 선언 0
 *   ③ op 4 로 A2 제외 → 87 → 그 세션 allowedAccounts 에서 A2 즉시 제외(fail closed) · 상태 프레임 갱신 · A2 `order.new` → 「허용 계좌 아님」
 *   ④ KB 만 쓰던 d1 에 교보 주문 서버 87 이 d1 계좌를 처음 실음 → `refreshUserSessions` → 교보 세션 acquire · hub 결선 ·
 *      상태 프레임에 교보 계좌(교보 LoginReq 1)
 *   ⑤ `closeForDmaUser(d1, { serverKey: KB120 })` → KB120 세션만 unauthorized · 재로그인 0 · 브라우저는 남은 교보 세션 기준
 *      (ready · 교보 계좌만) → 교보도 닫으면 `unauthorized` 프레임
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { AdminConn } from "../src/admin/admin-conn.js";
import { AdminSessionSync } from "../src/admin/session-sync.js";
import { AdminSnapshotSink } from "../src/admin/snapshot-sink.js";
import { SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import type { JournalAccess } from "../src/journal/access.js";
import type { ObserverAccountRow } from "../src/journal/types.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { DmaBroker } from "../src/registry/registry.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { WsFanout } from "../src/ws/fanout.js";
import { logger } from "../src/logger.js";
import { defaultAdminHandler, startFakeGateway, type FakeAdminState, type FakeGateway } from "./helpers/fake-gateway.js";
import { SAMPLE_ISIN } from "./helpers/frames.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const SECRET = "session-sync-observer-secret-DO-NOT-LOG";
const WAIT_MS = 5_000;
const USER_D1 = "8c1c2b7a-9d40-4a11-8e55-0000000021d1";
const CREDS: DmaCredentials = { dmaUserId: "d1", password: "pw-절대노출금지" };
const A1 = "1111222201";
const A2 = "1111222202";
/** 교보 계좌 — KB 계좌와 겹치지 않는다(같은 계좌번호 두 증권사는 다루지 않는다 · 29-20 가정). */
const B1 = "7777777701";

const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined =>
    isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
};

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
  vi.restoreAllMocks();
});

async function waitFor(predicate: () => boolean, label: string, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function statesOf(inbox: RelayOutbound[]): RelayStateMsg[] {
  return inbox.filter((m): m is RelayStateMsg => m.t === "state");
}

function lastState(inbox: RelayOutbound[]): RelayStateMsg | undefined {
  return statesOf(inbox).at(-1);
}

function accountNosOf(frame: RelayStateMsg | undefined): string[] {
  return (frame?.accounts ?? []).map((a) => a.accountNo);
}

function kbAccount(accountNo: string, priority = 1) {
  return { accountNo, name: "위탁", branchNo: "00001", traderId: "000001", priority };
}

function supabaseStub(): SupabaseClient {
  return {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          token === "token-d1"
            ? { data: { user: { id: USER_D1 } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        ),
    },
    // 반영 상태 RPC(`dma_admin_apply_snapshot`) — 이 테스트의 관심 밖이라 늘 성공.
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as SupabaseClient;
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

type Rig = {
  kb: FakeGateway;
  kyobo: FakeGateway;
  kbState: FakeAdminState;
  kyoboState: FakeAdminState;
  kbAdmin: AdminConn;
  kyoboAdmin: AdminConn;
  manager: SessionManager;
  open(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }>;
};

/**
 * KB120: d1 → A1 · d9 → 다른 계좌(op 2 가 「마지막 사용자」 로 막히지 않게). KYOBO119: d9 만(d1 없음 — 교보 세션 안 열림).
 * 저널 매핑은 sink 가 87 로 갈아 끼운다(첫 87 = admin 로그인 직후 op 5).
 */
async function rig(opts: { d1Kb?: string[] } = {}): Promise<Rig> {
  const d1Kb = opts.d1Kb ?? [A1];
  resetDroppedEnvelopeCount();
  for (const level of ["debug", "info"] as const) vi.spyOn(logger, level).mockImplementation((() => undefined) as never);

  const kb = await startFakeGateway({ autoLogin: true });
  cleanups.push(() => kb.close());
  kb.respondLoginWithAccounts(d1Kb.map((accountNo) => ({ accountNo, name: "위탁" })));
  kb.respondAdminLogin({ broker: "KB" });
  const kbState: FakeAdminState = {
    usersRev: 1n,
    users: new Map([
      ["d1", d1Kb.map((a, i) => kbAccount(a, i + 1))],
      ["d9", [kbAccount("9999000001")]],
    ]),
    busyAccounts: new Set(),
  };
  kb.onAdminCommand(defaultAdminHandler(kbState));

  const kyobo = await startFakeGateway({ autoLogin: true });
  cleanups.push(() => kyobo.close());
  kyobo.respondLoginWithAccounts([{ accountNo: B1, name: "교보 위탁" }]);
  kyobo.respondAdminLogin({ broker: "KYOBO" });
  const kyoboState: FakeAdminState = {
    usersRev: 1n,
    users: new Map([["d9", [{ accountNo: "8888000001", name: "교보", branchNo: "", traderId: "", priority: 1 }]]]),
    busyAccounts: new Set(),
  };
  kyobo.onAdminCommand(defaultAdminHandler(kyoboState));

  const orderServers = new Map<string, SessionTarget>([
    ["KB", { serverKey: "KB120", host: "127.0.0.1", port: kb.port, broker: "KB" }],
    ["KYOBO", { serverKey: "KYOBO119", host: "127.0.0.1", port: kyobo.port, broker: "KYOBO" }],
  ]);
  const manager = new SessionManager({ host: "127.0.0.1", port: 1, broker: "KB", resolveTarget: (b) => orderServers.get(b) });
  cleanups.push(() => manager.closeAll());
  const hub = new SubscriptionHub();
  cleanups.push(() => hub.closeAll());

  // 서버별 저널 매핑(DMA id → 계좌) — sink 의 `accessOf(key).replace` 가 갈아 끼운다(운영 = JournalAccess).
  const mappings = new Map<string, Map<string, Set<string>>>();
  const accessOf = (key: string): JournalAccess =>
    ({
      replace: (rows: readonly ObserverAccountRow[]) => {
        const m = new Map<string, Set<string>>();
        for (const r of rows) {
          const set = m.get(r.dmaUserId) ?? new Set<string>();
          set.add(r.accountNo);
          m.set(r.dmaUserId, set);
        }
        mappings.set(key, m);
      },
    }) as unknown as JournalAccess;
  // index.ts `brokersFor` 와 같은 규칙 — KB 늘 · 교보는 교보 주문 서버 매핑에 그 DMA id 계좌가 있을 때만.
  const brokersFor = (dmaUserId: string): DmaBroker[] =>
    (mappings.get("KYOBO119")?.get(dmaUserId)?.size ?? 0) > 0 ? ["KB", "KYOBO"] : ["KB"];

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const fanout = new WsFanout({
    server,
    supabase: supabaseStub(),
    sessions: manager,
    hub,
    credKey: randomBytes(32).toString("base64"),
    credentials: (userId) => Promise.resolve(userId === USER_D1 ? CREDS : null),
    brokersFor,
    path: "/ws",
    symbols: SYMBOLS,
  });
  cleanups.push(() => fanout.close());

  const sink = new AdminSnapshotSink({ supabase: supabaseStub(), accessOf });
  cleanups.push(() => sink.close());
  const sync = new AdminSessionSync({ sessions: manager, fanout });
  sink.on("applied", (e) => sync.onApplied(e));

  const kbAdmin = new AdminConn({ serverKey: "KB120", broker: "KB", secret: SECRET, host: "127.0.0.1", port: kb.port });
  const kyoboAdmin = new AdminConn({ serverKey: "KYOBO119", broker: "KYOBO", secret: SECRET, host: "127.0.0.1", port: kyobo.port });
  for (const c of [kbAdmin, kyoboAdmin]) {
    c.on("snapshot", (e) => sink.onSnapshot(c.serverKey, e));
    c.start();
    cleanups.push(() => c.stop());
  }
  await waitFor(() => kbAdmin.currentSnapshot() !== null && kyoboAdmin.currentSnapshot() !== null, "admin 첫 87");

  const sockets: TestWs[] = [];
  cleanups.push(async () => {
    for (const ws of sockets) await ws.close();
  });
  async function open(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, "/ws");
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth("token-d1");
    await waitFor(() => statesOf(inbox).some((f) => f.s === "ready"), "d1 ready");
    return { ws, inbox };
  }

  return { kb, kyobo, kbState, kyoboState, kbAdmin, kyoboAdmin, manager, open };
}

/** 사용자 세션 연결 수(LoginReq) — admin 연결은 ObserverLoginReq 라 섞이지 않는다. */
function loginCount(types: number[]): number {
  return types.filter((t) => t === MSG.LoginReq).length;
}

describe("AdminSessionSync — 87 → 열린 세션 반영 (29-21)", () => {
  it("① 트레이서 — op 3 A2 → KB120 87 → Ready 세션 mode 1 A2 선언 → allowedAccounts [A1, A2] → 브라우저 상태 프레임에 A2 · 재로그인 0", async () => {
    const r = await rig();
    const kbTypes: number[] = [];
    r.kb.onFrame((t) => kbTypes.push(t));
    const { inbox } = await r.open();
    expect(accountNosOf(lastState(inbox))).toEqual([A1]);
    const session = r.manager.sessionsOf(USER_D1)[0]!;
    expect(r.kb.declaredAccounts()).toEqual([{ mode: "1", accountNo: A1 }]);

    const outcome = await r.kbAdmin.command({ op: 3, userId: "d1", account: kbAccount(A2, 2) });
    expect(outcome.kind).toBe("result");

    await waitFor(() => accountNosOf(lastState(inbox)).includes(A2), "상태 프레임에 A2");
    expect(r.kb.declaredAccounts()).toEqual([
      { mode: "1", accountNo: A1 },
      { mode: "1", accountNo: A2 },
    ]);
    expect(session.allowedAccounts.map((a) => a.accountNo)).toEqual([A1, A2]);
    expect(lastState(inbox)).toMatchObject({ s: "ready" });
    expect(session.state).toBe("ready");
    // 재로그인 없음 — LoginReq 는 인증 때 1건뿐 · 세션 1개 그대로.
    expect(loginCount(kbTypes)).toBe(1);
    expect(r.manager.sessionsOf(USER_D1)).toEqual([session]);
  });

  it("② 같은 87(변화 없음 · op 5 재요청) → 선언 0 · 상태 프레임 재송신 0", async () => {
    const r = await rig();
    const { inbox } = await r.open();
    const frames = statesOf(inbox).length;

    await r.kbAdmin.command({ op: 5, userId: "" });
    await sleep(100);
    expect(r.kb.declaredAccounts()).toHaveLength(1);
    expect(statesOf(inbox)).toHaveLength(frames);
  });

  it("③ op 4 A2 → 87 → allowedAccounts 에서 A2 즉시 제외 · 상태 프레임 갱신 · A2 order.new → 「허용 계좌 아님」", async () => {
    const r = await rig({ d1Kb: [A1, A2] });
    const { ws, inbox } = await r.open();
    await waitFor(() => accountNosOf(lastState(inbox)).length === 2, "A1 · A2 ready");
    const session = r.manager.sessionsOf(USER_D1)[0]!;

    const outcome = await r.kbAdmin.command({ op: 4, userId: "d1", account: kbAccount(A2) });
    expect(outcome.kind).toBe("result");

    await waitFor(() => !accountNosOf(lastState(inbox)).includes(A2), "상태 프레임에서 A2 제외");
    expect(session.allowedAccounts.map((a) => a.accountNo)).toEqual([A1]);
    expect(lastState(inbox)).toMatchObject({ s: "ready" });

    ws.sendRaw(orderNew(A2, "rid-a2"));
    await waitFor(() => inbox.some((m) => m.t === "order.result" && m.rid === "rid-a2"), "A2 주문 거부");
    expect(inbox.find((m) => m.t === "order.result" && m.rid === "rid-a2")).toMatchObject({
      status: "rejected",
      message: "이 세션에서 사용할 수 없는 계좌입니다.",
    });
  });

  it("④ 교보 주문 서버 87 에 d1 계좌가 처음 나타남 → 교보 세션 acquire · hub 결선 · 상태 프레임에 교보 계좌", async () => {
    const r = await rig();
    const kyoboTypes: number[] = [];
    r.kyobo.onFrame((t) => kyoboTypes.push(t));
    const { inbox } = await r.open();
    expect(r.manager.sessionsOf(USER_D1).map((x) => x.serverKey)).toEqual(["KB120"]);
    expect(loginCount(kyoboTypes)).toBe(0);

    const outcome = await r.kyoboAdmin.command({
      op: 1,
      userId: "d1",
      password: CREDS.password,
      account: { accountNo: B1, name: "교보 위탁", branchNo: "", traderId: "", priority: 1 },
    });
    expect(outcome.kind).toBe("result");

    await waitFor(() => accountNosOf(lastState(inbox)).includes(B1), "상태 프레임에 교보 계좌");
    expect(r.manager.sessionsOf(USER_D1).map((x) => x.serverKey)).toEqual(["KB120", "KYOBO119"]);
    expect(loginCount(kyoboTypes)).toBe(1);
    expect(accountNosOf(lastState(inbox))).toEqual([A1, B1]);
    expect(lastState(inbox)).toMatchObject({ s: "ready" });

    // 같은 87 이 또 와도 세션을 더 열지 않는다.
    await r.kyoboAdmin.command({ op: 5, userId: "" });
    await sleep(100);
    expect(loginCount(kyoboTypes)).toBe(1);
    expect(r.manager.sessionsOf(USER_D1)).toHaveLength(2);
  });

  it("⑤ closeForDmaUser(KB120) → KB 세션만 unauthorized · 재로그인 0 · 브라우저는 교보 기준 → 교보도 닫으면 unauthorized 프레임", async () => {
    const r = await rig();
    r.kyoboState.users.set("d1", [{ accountNo: B1, name: "교보 위탁", branchNo: "", traderId: "", priority: 1 }]);
    await r.kyoboAdmin.command({ op: 5, userId: "" });
    await sleep(50);
    const kbTypes: number[] = [];
    r.kb.onFrame((t) => kbTypes.push(t));
    const { inbox } = await r.open();
    await waitFor(() => accountNosOf(lastState(inbox)).length === 2, "KB · 교보 ready");
    const [kbSession, kyoboSession] = r.manager.sessionsOf(USER_D1);

    expect(r.manager.closeForDmaUser("d1", "deleted", { serverKey: "KB120" })).toBe(1);
    expect(kbSession!.state).toBe("unauthorized");
    expect(kbSession!.allowedAccounts).toEqual([]);
    expect(kyoboSession!.state).toBe("ready");
    await waitFor(() => accountNosOf(lastState(inbox)).join() === B1, "남은 교보 세션 기준 프레임");
    expect(lastState(inbox)).toMatchObject({ s: "ready" });

    await sleep(200);
    expect(loginCount(kbTypes)).toBe(1); // 인증 때 1건뿐 — 재접속 루프 없음

    expect(r.manager.closeForDmaUser("d1", "deleted", { serverKey: "KYOBO119" })).toBe(1);
    await waitFor(() => lastState(inbox)?.s === "unauthorized", "전부 닫힘 → unauthorized");
    expect(accountNosOf(lastState(inbox))).toEqual([]);
  });
});
