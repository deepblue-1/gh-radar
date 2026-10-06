/**
 * Phase 29 Plan 14 — ADMIN-05 · D-05. 87 적재 (`AdminSnapshotSink`).
 *
 * T1 트레이서 (RESEARCH Pattern 4) — 실 `ServerPipelines`(실 `JournalObserver` · `JournalWriter` · `JournalAccess` · `AdminConn` ·
 *    실 `DmaClient`) + 실 `WsFanout` · `AppAccess` · `SessionManager`. 가짜는 게이트웨이 소켓 스텁 · Supabase 스텁(파이프라인 ·
 *    sink 는 HTTP PostgREST 스텁, wss 인증은 메모리 스텁)뿐이다. 결선은 index.ts `wirePipeline` 과 같은 모양이다.
 *    Admin 이 서버에 계좌(A2)를 더하면 그 87 하나가 (a) 그 서버 매핑 · `dma_journal_sync_access` (b) `dma_admin_apply_snapshot`
 *    에 들어가고, 그 뒤 A2 의 저널 행이 **관찰자 재로그인 없이** d1 사용자 브라우저에 푸시된다.
 *
 * 규율: 주소는 127.0.0.1 만(D-27). 비밀은 테스트 더미이고 로그에 실리지 않는다(T-19-03).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalOrderDbRow, RelayOutbound } from "@gh-radar/shared";

import { AdminSnapshotSink, type AdminSnapshotAppliedEvent } from "../src/admin/snapshot-sink.js";
import { ADMIN_OP, type AdminUsersSnapshot } from "../src/admin/types.js";
import { AppAccess } from "../src/access/app-access.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { JournalAccess } from "../src/journal/access.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { ServerPipelines, type ServerPipeline } from "../src/registry/pipelines.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { createAccessCredentials, encryptDmaPassword } from "../src/store/credentials.js";
import { createRelaySupabase } from "../src/store/supabase.js";
import { WsFanout } from "../src/ws/fanout.js";
import { defaultAdminHandler, startFakeGateway, type FakeAdminState, type FakeGateway } from "./helpers/fake-gateway.js";
import { startSupabaseStub, type SupabaseStub } from "./helpers/supabase-stub.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const WS_PATH = "/ws";
const SECRET = "sink-observer-secret-DO-NOT-LOG";
const CRED_KEY = randomBytes(32).toString("base64");
const WAIT_MS = 5_000;

const SERVER = "KB120";
const A1 = "1111222201";
const A2 = "1111222202";

const USER_D1 = "8c1c2b7a-9d40-4a11-8e55-0000000000d1";
/** 같은 서버에 DMA 계정 d2(계좌 없음) — A2 행을 받으면 안 된다. */
const USER_D2 = "8c1c2b7a-9d40-4a11-8e55-0000000000d2";

const TOKENS = new Map<string, string>([
  ["token-d1", USER_D1],
  ["token-d2", USER_D2],
]);

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

/** wss 인증용 메모리 스텁 — 토큰 · 접근 맵 RPC · `dma_users`(AAD = dma_user_id). */
function authStub(): SupabaseClient {
  const accessRows = [
    { user_id: USER_D1, email: "d1@example.com", role: "trader", dma_user_id: "d1" },
    { user_id: USER_D2, email: "d2@example.com", role: "trader", dma_user_id: "d2" },
  ];
  const dmaUsers = new Map([
    ["d1", { dma_user_id: "d1", password_enc: encryptDmaPassword("pw-1", "d1", CRED_KEY) }],
    ["d2", { dma_user_id: "d2", password_enc: encryptDmaPassword("pw-2", "d2", CRED_KEY) }],
  ]);
  return {
    auth: {
      getUser: (token: string) => {
        const id = TOKENS.get(token);
        return Promise.resolve(id === undefined ? { data: { user: null }, error: { message: "invalid JWT" } } : { data: { user: { id } }, error: null });
      },
    },
    rpc: (fn: string) =>
      Promise.resolve(fn === "dma_app_access_map" ? { data: accessRows.map((r) => ({ ...r })), error: null } : { data: null, error: { message: fn } }),
    from: () => ({
      select: () => ({
        eq: (_c: string, value: string) => ({ maybeSingle: () => Promise.resolve({ data: dmaUsers.get(value) ?? null, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

/** 적용 RPC 가 돌려줄 공개 행(DB 투영 흉내) — 계좌 · seq 만 의미 있다. */
function dbRow(seq: number, accountNo: string): JournalOrderDbRow {
  return {
    id: `row-${seq}`,
    trade_date: "2026-10-07",
    account_no: accountNo,
    isin: "KR7005930003",
    stock_code: "005930",
    exchange: "KRX",
    board: null,
    side: "B",
    order_type: "N",
    org_order_no: null,
    qty: 1,
    price: 70_000,
    order_no: `000${seq}`,
    filled_qty: 0,
    modified_qty: 0,
    status: "accepted",
    result_code: 0,
    notice_type: "A",
    message: null,
    origin: null,
    requester: null,
    request_kind: "new",
    last_seq: String(seq),
    created_at: "2026-10-07T00:00:00.000Z",
    updated_at: "2026-10-07T00:00:00.000Z",
  };
}

function serverRow(port: number): DmaServerRow {
  return { key: SERVER, broker: "KB", host: "127.0.0.1", port, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 0 };
}

function journalFrames(inbox: RelayOutbound[]): string[][] {
  return inbox
    .filter((m): m is Extract<RelayOutbound, { t: "journal.rows" }> => m.t === "journal.rows")
    .map((m) => m.rows.map((r) => r.accountNo));
}

type Rig = {
  gateway: FakeGateway;
  db: SupabaseStub;
  pipelines: ServerPipelines;
  sink: AdminSnapshotSink;
  applied: AdminSnapshotAppliedEvent[];
  adminState: FakeAdminState;
  open(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }>;
};

/** index.ts 결선 모양 그대로 — fanout · 접근 맵 · 파이프라인(onCreated: writer applied → fanout · admin snapshot → sink). */
async function rig(): Promise<Rig> {
  resetDroppedEnvelopeCount();
  const gateway = await startFakeGateway({ autoLogin: true });
  cleanups.push(() => gateway.close());
  // 관찰자 로그인(79) — 서버 users.toml 의 지금 모습: d1 → A1 하나.
  gateway.respondObserverLogin({
    broker: "KB",
    epoch: "ep-1",
    headSeq: 0,
    oldestSeq: 0,
    resync: true,
    accounts: [{ dmaUserId: "d1", accountNo: A1, name: "위탁", priority: 1 }],
  });
  gateway.respondAdminLogin({ broker: "KB" });
  const adminState: FakeAdminState = {
    usersRev: 1n,
    users: new Map([
      ["d1", [{ accountNo: A1, name: "위탁", branchNo: "00001", traderId: "000001", priority: 1 }]],
      ["d2", [{ accountNo: "9999000001", name: "위탁", branchNo: "00002", traderId: "000002", priority: 1 }]],
    ]),
    busyAccounts: new Set(),
  };
  gateway.onAdminCommand(defaultAdminHandler(adminState));

  const db = await startSupabaseStub();
  cleanups.push(() => db.close());
  const supabase = createRelaySupabase(db.url, "sink-test-service-role-key");

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const hub = new SubscriptionHub();
  cleanups.push(() => hub.closeAll());
  const sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
  cleanups.push(() => sessions.closeAll());
  const auth = authStub();
  const appAccess = new AppAccess({ supabase: auth, refreshMs: 60_000, missReloadMinMs: 0 });
  cleanups.push(() => appAccess.close());
  const fanout = new WsFanout({
    server,
    supabase: auth,
    sessions,
    hub,
    credKey: CRED_KEY,
    path: WS_PATH,
    credentials: createAccessCredentials({ access: appAccess, supabase: auth, credKey: CRED_KEY }),
  });
  cleanups.push(() => fanout.close());
  appAccess.start();
  await appAccess.ready();

  let pipelines: ServerPipelines | null = null;
  const sink = new AdminSnapshotSink({ supabase, accessOf: (key) => pipelines?.get(key)?.access });
  cleanups.push(() => sink.close());
  const applied: AdminSnapshotAppliedEvent[] = [];
  sink.on("applied", (e) => applied.push(e));

  pipelines = new ServerPipelines({
    supabase,
    secretOf: (broker) => (broker === "KB" ? SECRET : undefined),
    drainTimeoutMs: 200,
    onCreated: (p: ServerPipeline) => {
      p.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, { access: p.access, identities: appAccess }));
      p.admin.on("snapshot", (e) => sink.onSnapshot(p.server.key, e));
    },
  });
  const ps = pipelines;
  cleanups.push(async () => {
    ps.stopAll();
    await ps.drainAll(200);
    ps.closeAll();
  });

  const sockets: TestWs[] = [];
  cleanups.push(async () => {
    for (const ws of sockets) await ws.close();
  });
  async function open(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === "ready"), `${token} ready`);
    return { ws, inbox };
  }

  return { gateway, db, pipelines, sink, applied, adminState, open };
}

const ADMIN_APPLY = "/rest/v1/rpc/dma_admin_apply_snapshot";
const SYNC_ACCESS = "/rest/v1/rpc/dma_journal_sync_access";

describe("87 적재 트레이서 — 87 → JournalAccess.replace + dma_admin_apply_snapshot → 새 계좌 주문 행 푸시 (29-14 T1)", () => {
  it("Admin 이 d1 에 A2 를 더하면 87 하나로 매핑 · REST 가시성 · 반영 상태가 갱신되고, A2 행이 관찰자 재로그인 없이 d1 에게만 간다", async () => {
    const r = await rig();
    const d1 = await r.open("token-d1");
    const d2 = await r.open("token-d2");

    r.pipelines.sync([serverRow(r.gateway.port)]);
    const p = r.pipelines.get(SERVER)!;
    // 관찰자 live + 접속 op 5 의 첫 87(d1 → A1) 적재.
    await waitFor(() => p.observer.state === "live" && r.applied.length === 1, "관찰자 live · 첫 87 적재");
    await waitFor(() => r.db.requestsTo(ADMIN_APPLY).length === 1, "첫 반영 상태 RPC");
    expect([...(p.access.accountsOf("d1") ?? [])]).toEqual([A1]);
    const syncBefore = r.db.requestsTo(SYNC_ACCESS).length;

    // Admin 변경 — op 3 SetAccount(d1 · A2). 서버는 86 → 87(d1: A1, A2).
    const outcome = await p.admin.command({
      op: ADMIN_OP.SetAccount,
      userId: "d1",
      account: { accountNo: A2, name: "위탁2", branchNo: "00001", traderId: "000001", priority: 2 },
    });
    expect(outcome.kind).toBe("result");

    // (a) 메모리 라우팅은 87 수신과 동시에(동기) 갱신된다.
    expect([...(p.access.accountsOf("d1") ?? [])].sort()).toEqual([A1, A2]);
    expect(r.applied).toHaveLength(2);
    expect(r.applied[1]?.serverKey).toBe(SERVER);
    expect(r.applied[1]?.snapshot.users.map((u) => u.userId)).toEqual(["d1", "d2"]);

    // (a) REST 가시성 — dma_journal_sync_access 1회 더(p_gateway = 서버 키 · d1 의 두 계좌 포함).
    await waitFor(() => r.db.requestsTo(SYNC_ACCESS).length === syncBefore + 1, "매핑 DB 동기화");
    const sync = r.db.requestsTo(SYNC_ACCESS).at(-1)!.body as { p_gateway: string; p_rows: Array<{ dma_user_id: string; account_no: string }> };
    expect(sync.p_gateway).toBe(SERVER);
    expect(sync.p_rows.filter((x) => x.dma_user_id === "d1").map((x) => x.account_no).sort()).toEqual([A1, A2]);

    // (b) 반영 상태 — dma_admin_apply_snapshot 1회 더 · rev 는 숫자(문자열 아님) · p_users 는 87 그대로 camelCase.
    await waitFor(() => r.db.requestsTo(ADMIN_APPLY).length === 2, "반영 상태 RPC");
    const apply = r.db.requestsTo(ADMIN_APPLY).at(-1)!.body as { p_server: string; p_users_rev: unknown; p_users: unknown };
    expect(apply.p_server).toBe(SERVER);
    expect(typeof apply.p_users_rev).toBe("number");
    expect(apply.p_users_rev).toBe(Number(r.adminState.usersRev));
    expect(apply.p_users).toEqual([
      {
        userId: "d1",
        accounts: [
          { accountNo: A1, name: "위탁", branchNo: "00001", traderId: "000001", priority: 1 },
          { accountNo: A2, name: "위탁2", branchNo: "00001", traderId: "000001", priority: 2 },
        ],
      },
      { userId: "d2", accounts: [{ accountNo: "9999000001", name: "위탁", branchNo: "00002", traderId: "000002", priority: 1 }] },
    ]);

    // 그 뒤 A2 의 저널 행 — 관찰자 80 → 기록기 → 적용 RPC(행 A2) → applied → d1 브라우저 1프레임.
    r.db.seedJournalApplyRows([dbRow(1, A2)]);
    const observerSock = await r.gateway.waitForObserverConnection();
    r.gateway.pushJournalBatch(observerSock, { records: [{ seq: 1, dmaUserId: "d1", accountNo: A2 }] });
    await waitFor(() => journalFrames(d1.inbox).length === 1, "d1 journal.rows");
    expect(journalFrames(d1.inbox)).toEqual([[A2]]);
    await sleep(100);
    expect(journalFrames(d2.inbox)).toEqual([]);

    // 관찰자 재로그인 없음 — 79 는 처음 1건뿐.
    expect(r.gateway.observerLoginRequests()).toHaveLength(1);
    expect(r.db.unknownRequests()).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// T2 — 적재 규율: 세대 가드 · DB 재시도(최신만) · 빈 스냅샷 · 재접속 전량 교체 · rev 1 복귀 (29-14 Task 2)
//
// 실 `JournalAccess` + 메모리 Supabase 스텁(rpc 만 · 함수별 실패 주입). 타이머는 가짜(setTimeout 계열만)다.
// ───────────────────────────────────────────────────────────────────────────────────────────────

type RpcCall = { fn: string; args: Record<string, unknown> };

type RpcStub = {
  client: SupabaseClient;
  calls: RpcCall[];
  /** `dma_admin_apply_snapshot` 을 앞에서부터 이 횟수만큼 실패시킨다. */
  failApply: number;
};

function rpcStub(): RpcStub {
  const stub: RpcStub = { client: undefined as unknown as SupabaseClient, calls: [], failApply: 0 };
  stub.client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      stub.calls.push({ fn, args });
      if (fn === "dma_admin_apply_snapshot" && stub.failApply > 0) {
        stub.failApply -= 1;
        return Promise.resolve({ data: null, error: { code: "57P01", message: "terminating connection" } });
      }
      return Promise.resolve({ data: 1, error: null });
    },
  } as unknown as SupabaseClient;
  return stub;
}

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

const msgOf = (c: LogCall): string => String(c.args[1] ?? "");

/** 87 조립 — users: [dmaUserId, 계좌번호[]][]. 계좌는 priority = 순번. */
function snap(rev: bigint, users: Array<[string, string[]]>): AdminUsersSnapshot {
  return {
    usersRev: rev,
    users: users.map(([userId, accounts]) => ({
      userId,
      accounts: accounts.map((accountNo, i) => ({ accountNo, name: "위탁", branchNo: "00001", traderId: "000001", priority: i + 1 })),
    })),
  };
}

const applyCalls = (s: RpcStub): Array<Record<string, unknown>> => s.calls.filter((c) => c.fn === "dma_admin_apply_snapshot").map((c) => c.args);
const appliedAccounts = (args: Record<string, unknown> | undefined): string[] =>
  ((args?.p_users ?? []) as Array<{ accounts: Array<{ accountNo: string }> }>).flatMap((u) => u.accounts.map((a) => a.accountNo));

const B1 = "5555666601";
const B2 = "5555666602";
const B3 = "5555666603";

describe("87 적재 규율 (29-14 T2)", () => {
  let db: RpcStub;
  let access: JournalAccess;
  let sink: AdminSnapshotSink;
  let logs: LogCall[];

  async function setup(opts: { retryBaseMs?: number; retryMaxMs?: number } = {}): Promise<void> {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    logs = await spyLogs();
    db = rpcStub();
    access = new JournalAccess({ supabase: db.client, gateway: SERVER, retryBaseMs: 1_000 });
    sink = new AdminSnapshotSink({
      supabase: db.client,
      accessOf: (key) => (key === SERVER ? access : undefined),
      retryBaseMs: opts.retryBaseMs ?? 100,
      retryMaxMs: opts.retryMaxMs ?? 10_000,
    });
    cleanups.push(() => {
      sink.close();
      access.close();
      vi.useRealTimers();
    });
  }

  /** 마이크로태스크 · 대기 중 RPC Promise 를 비운다(가짜 타이머는 건드리지 않는다). */
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  it("세대 가드 — 세대 2 의 87 뒤 늦게 온 세대 1 의 87 은 버린다(debug 1 · RPC 0 · 매핑 · applied 그대로)", async () => {
    await setup();
    const applied: AdminSnapshotAppliedEvent[] = [];
    sink.on("applied", (e) => applied.push(e));

    sink.onSnapshot(SERVER, { generation: 2, snapshot: snap(4n, [["u1", [B1, B2]]]) });
    await settle();
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(9n, [["u1", [B3]]]) });
    await settle();

    expect(applyCalls(db)).toHaveLength(1);
    expect(appliedAccounts(applyCalls(db)[0])).toEqual([B1, B2]);
    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B1, B2]);
    expect(applied).toHaveLength(1);
    expect(logs.filter((c) => c.level === "debug" && msgOf(c).includes("옛 세대"))).toHaveLength(1);
  });

  it("같은 세대 안의 연속 87 은 순서대로 모두 적용한다(나중 것이 이긴다)", async () => {
    await setup();
    sink.onSnapshot(SERVER, { generation: 3, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();
    sink.onSnapshot(SERVER, { generation: 3, snapshot: snap(2n, [["u1", [B1, B2]]]) });
    await settle();

    expect(applyCalls(db).map(appliedAccounts)).toEqual([[B1], [B1, B2]]);
    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B1, B2]);
  });

  it("RPC 실패 → 지수 백오프 재시도 · 재시도 사이 새 87 이 오면 그 최신 것만 보낸다 · 메모리 라우팅은 이미 유효", async () => {
    await setup({ retryBaseMs: 100 });
    db.failApply = 2;

    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();
    expect(applyCalls(db)).toHaveLength(1); // 실패 1
    expect(logs.filter((c) => c.level === "error" && msgOf(c).includes("dma_admin_apply_snapshot"))).toHaveLength(1);

    // 백오프 중 새 87 — 즉시 보내지 않고 대기 1건을 갈아 끼운다. 메모리 매핑은 바로 새 값.
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(2n, [["u1", [B1, B2]]]) });
    await settle();
    expect(applyCalls(db)).toHaveLength(1);
    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B1, B2]);

    await vi.advanceTimersByTimeAsync(99);
    expect(applyCalls(db)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // 첫 재시도 = 100ms — 최신(B1, B2)만 · 실패 2
    expect(applyCalls(db)).toHaveLength(2);
    expect(appliedAccounts(applyCalls(db)[1])).toEqual([B1, B2]);

    await vi.advanceTimersByTimeAsync(199); // 두 번째 재시도 = 200ms(지수)
    expect(applyCalls(db)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(applyCalls(db)).toHaveLength(3);
    expect(appliedAccounts(applyCalls(db)[2])).toEqual([B1, B2]);
    // 옛 스냅샷(B1 만)은 첫 실패 뒤 다시 나가지 않았다.
    expect(applyCalls(db).map(appliedAccounts)).toEqual([[B1], [B1, B2], [B1, B2]]);

    // 복구 뒤에는 더 보내지 않는다.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(applyCalls(db)).toHaveLength(3);
  });

  it("close() 뒤 재시도 타이머 0 · 이후 87 · 타이머 진행에도 RPC 없음", async () => {
    await setup({ retryBaseMs: 100 });
    db.failApply = 5;
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();
    access.close(); // 매핑 쪽 재시도(1초)도 정리 — 아래 타이머 수는 sink 만 본다.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    sink.close();
    expect(vi.getTimerCount()).toBe(0);
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(2n, [["u1", [B1, B2]]]) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(applyCalls(db)).toHaveLength(1);
  });

  it("유저 0명 87 → RPC 는 보낸다(반영 상태 = 비었다) · 매핑 교체는 거부(라우팅 유지) · warn 1", async () => {
    await setup();
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();

    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(2n, []) });
    await settle();

    expect(applyCalls(db)).toHaveLength(2);
    expect(applyCalls(db)[1]).toEqual({ p_server: SERVER, p_users_rev: 2, p_users: [] });
    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B1]);
    expect(access.health().emptySnapshotsRejected).toBe(1);
    expect(logs.filter((c) => c.level === "warn" && msgOf(c).includes("[ADMIN]"))).toHaveLength(1);
  });

  it("서버 재기동 흉내 — rev 5 → 새 연결 rev 1(계좌 하나 빠짐)도 통째 교체(rev 감소를 이유로 버리지 않는다)", async () => {
    await setup();
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(5n, [["u1", [B1, B2]]]) });
    await settle();
    // 재접속(세대 2) · 서버 재기동으로 users_rev 는 1 로 돌아갔다 · B2 가 빠졌다.
    sink.onSnapshot(SERVER, { generation: 2, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();

    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B1]);
    const last = applyCalls(db).at(-1);
    expect(last?.p_users_rev).toBe(1);
    expect(appliedAccounts(last)).toEqual([B1]);
    // 매핑 DB 동기화도 B2 없이.
    const sync = db.calls.filter((c) => c.fn === "dma_journal_sync_access").at(-1)?.args as { p_rows: Array<{ account_no: string }> };
    expect(sync.p_rows.map((r) => r.account_no)).toEqual([B1]);
  });

  it("파이프라인 재생성(resetGeneration) — 새 admin 연결은 세대 1 부터 다시 센다 · 옛 세대 눈금으로 버리지 않는다", async () => {
    await setup();
    sink.onSnapshot(SERVER, { generation: 4, snapshot: snap(3n, [["u1", [B1]]]) });
    await settle();
    sink.resetGeneration(SERVER);
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B2]]]) });
    await settle();

    expect([...(access.accountsOf("u1") ?? [])]).toEqual([B2]);
    expect(applyCalls(db).map(appliedAccounts)).toEqual([[B1], [B2]]);
  });

  it("forget — 제거된 서버의 대기 재시도를 버린다(타이머 0 · 이후 RPC 없음)", async () => {
    await setup({ retryBaseMs: 100 });
    db.failApply = 5;
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();
    access.close();
    sink.forget(SERVER);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(applyCalls(db)).toHaveLength(1);
  });

  it("서버별 독립 — 한 서버의 RPC 실패 · 재시도가 다른 서버 적재를 막지 않는다", async () => {
    await setup({ retryBaseMs: 100 });
    db.failApply = 1;
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(1n, [["u1", [B1]]]) });
    await settle();
    sink.onSnapshot("KYOBO119", { generation: 1, snapshot: snap(1n, [["u2", [B3]]]) });
    await settle();

    expect(applyCalls(db).map((a) => a.p_server)).toEqual([SERVER, "KYOBO119"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(applyCalls(db).map((a) => a.p_server)).toEqual([SERVER, "KYOBO119", SERVER]);
  });

  it("빈 userId · accountNo 항목은 DB 적재에서 뺀다(RPC 전체 거부 → 영구 재시도 방지) · warn 에는 계수만", async () => {
    await setup();
    sink.onSnapshot(SERVER, {
      generation: 1,
      snapshot: {
        usersRev: 1n,
        users: [
          { userId: "u1", accounts: [{ accountNo: B1, name: "위탁", branchNo: "", traderId: "", priority: 1 }, { accountNo: "", name: "", branchNo: "", traderId: "", priority: 2 }] },
          { userId: "", accounts: [{ accountNo: B2, name: "위탁", branchNo: "", traderId: "", priority: 1 }] },
        ],
      },
    });
    await settle();

    expect(applyCalls(db)[0]?.p_users).toEqual([
      { userId: "u1", accounts: [{ accountNo: B1, name: "위탁", branchNo: "", traderId: "", priority: 1 }] },
    ]);
    const warn = logs.find((c) => c.level === "warn" && msgOf(c).includes("[ADMIN]"));
    expect(warn?.args[0]).toMatchObject({ serverKey: SERVER, droppedUsers: 1, droppedAccounts: 1 });
  });

  it("users_rev 가 JSON 안전 범위를 넘으면 문자열로 보낸다(PostgREST bigint) · 로그에 dmaUserId · 계좌번호 없음", async () => {
    await setup();
    const big = 2n ** 60n;
    sink.onSnapshot(SERVER, { generation: 1, snapshot: snap(big, [["secret-dma-id", [B1]]]) });
    await settle();

    expect(applyCalls(db)[0]?.p_users_rev).toBe(big.toString());
    const sinkLogs = JSON.stringify(logs.filter((c) => msgOf(c).includes("[ADMIN]")).map((c) => c.args));
    expect(sinkLogs).not.toContain("secret-dma-id");
    expect(sinkLogs).not.toContain(B1);
  });
});
