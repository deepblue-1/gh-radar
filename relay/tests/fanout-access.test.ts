/**
 * Phase 29 Plan 06 — wss 역할 게이트 트레이서 (D-02 · D-19).
 *
 * 경로: 브라우저 wss `{t:"auth"}` → 토큰 검증 → `AppAccess`(RPC `dma_app_access_map` 사본)에서 역할 admin/trader +
 * `dma_user_id` 확인 → `dma_users.password_enc` 를 **AAD = dma_user_id** 로 복호 → `SessionManager.acquire` → 상태 프레임.
 *
 * `fanout.test.ts` 하네스와 같은 형식이다 — 실 ws 서버 · 실 `WsFanout` · 실 `SessionManager`/`SubscriptionHub` · 실
 * `AppAccess` · 실 `createAccessCredentials` · TCP 로 붙는 스텁 게이트웨이. 가짜는 Supabase(토큰 · 접근 맵 RPC ·
 * `dma_users`) 하나뿐이다. 주입구(`credentials`)를 쓰는 운영 결선(`index.ts`)과 같은 모양이다.
 *
 * 사용자:
 *   T  trader + dmaT       → 세션 1 · ready
 *   A  admin  + dmaT(공유)  → 세션 · ready (같은 암호문 한 벌)
 *   V  viewer + dmaV       → unauthorized(연결 유지 · 세션 0)
 *   N  trader + DMA 없음    → unauthorized
 *   P  맵에 없음(승인 대기)    → unauthorized
 *   O  trader + dmaO — dma_users 행이 옛 AAD(웹 user_id)로 암호화됨 → 복호 실패 = 조회 실패(failed + 1011)
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJournalOrderRow } from "@gh-radar/shared";
import type { JournalOrderDbRow, JournalOrderRow, RelayOutbound, StrategyEventRow } from "@gh-radar/shared";

import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { AppAccess } from "../src/access/app-access.js";
import { createAccessCredentials, encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { logger } from "../src/logger.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import type { JournalAccessView } from "../src/journal/types.js";

const WS_PATH = "/ws";

const USER_T = "7c1c2b7a-9d40-4a11-8e55-0000000000a1";
const USER_A = "7c1c2b7a-9d40-4a11-8e55-0000000000a2";
const USER_V = "7c1c2b7a-9d40-4a11-8e55-0000000000a3";
const USER_N = "7c1c2b7a-9d40-4a11-8e55-0000000000a4";
const USER_P = "7c1c2b7a-9d40-4a11-8e55-0000000000a5";
const USER_O = "7c1c2b7a-9d40-4a11-8e55-0000000000a6";
/** 두 서버 푸시용 두 번째 trader(dmaX — KYOBO 매핑에만 계좌가 있다). */
const USER_X = "7c1c2b7a-9d40-4a11-8e55-0000000000a7";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-t", USER_T],
  ["token-a", USER_A],
  ["token-v", USER_V],
  ["token-n", USER_N],
  ["token-p", USER_P],
  ["token-o", USER_O],
  ["token-x", USER_X],
]);

type AccessRow = { user_id: string; email: string; role: string; dma_user_id: string | null };
type DmaUserRow = { dma_user_id: string; password_enc: string };

function baseAccessRows(): AccessRow[] {
  return [
    { user_id: USER_T, email: "t@example.com", role: "trader", dma_user_id: "dmaT" },
    { user_id: USER_A, email: "a@example.com", role: "admin", dma_user_id: "dmaT" },
    { user_id: USER_V, email: "v@example.com", role: "viewer", dma_user_id: "dmaV" },
    { user_id: USER_N, email: "n@example.com", role: "trader", dma_user_id: null },
    { user_id: USER_O, email: "o@example.com", role: "trader", dma_user_id: "dmaO" },
    { user_id: USER_X, email: "x@example.com", role: "trader", dma_user_id: "dmaX" },
  ];
}

function baseDmaUsers(): Map<string, DmaUserRow> {
  return new Map([
    ["dmaT", { dma_user_id: "dmaT", password_enc: encryptDmaPassword("pw-t", "dmaT", CRED_KEY) }],
    ["dmaV", { dma_user_id: "dmaV", password_enc: encryptDmaPassword("pw-v", "dmaV", CRED_KEY) }],
    ["dmaX", { dma_user_id: "dmaX", password_enc: encryptDmaPassword("pw-x", "dmaX", CRED_KEY) }],
    // 옛 형식 — AAD 가 웹 user_id 다(이관 전 행). 새 경로는 복호에 실패해야 한다.
    ["dmaO", { dma_user_id: "dmaO", password_enc: encryptDmaPassword("pw-o", USER_O, CRED_KEY) }],
  ]);
}

type StubDb = {
  client: SupabaseClient;
  accessRows: AccessRow[];
  dmaUsers: Map<string, DmaUserRow>;
  /** true 면 접근 맵 RPC 가 오류를 낸다. */
  failAccess: boolean;
  rpcCalls: number;
  /** `dma_users` 외 표 조회(옛 `dma_credentials` 등) — 새 경로에서는 0 이어야 한다. */
  otherTables: string[];
};

/** 토큰 검증 + 접근 맵 RPC + `dma_users` 조회만 흉내 내는 스텁. */
function stubDb(): StubDb {
  const db: StubDb = {
    client: undefined as unknown as SupabaseClient,
    accessRows: baseAccessRows(),
    dmaUsers: baseDmaUsers(),
    failAccess: false,
    rpcCalls: 0,
    otherTables: [],
  };
  db.client = {
    auth: {
      getUser: (token: string) => {
        const userId = TOKENS.get(token);
        if (userId === undefined) return Promise.resolve({ data: { user: null }, error: { message: "invalid JWT" } });
        return Promise.resolve({ data: { user: { id: userId } }, error: null });
      },
    },
    rpc: (fn: string) => {
      db.rpcCalls += 1;
      if (fn !== "dma_app_access_map") return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
      if (db.failAccess) return Promise.resolve({ data: null, error: { code: "57P01", message: "terminating connection" } });
      return Promise.resolve({ data: db.accessRows.map((r) => ({ ...r })), error: null });
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => {
            if (table !== "dma_users") {
              db.otherTables.push(table);
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: db.dmaUsers.get(value) ?? null, error: null });
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return db;
}

/** 서버별 매핑 읽기 뷰(그 서버의 79 스냅샷 사본 대역) — dma id → 계좌 집합. */
function accessView(map: Readonly<Record<string, readonly string[]>>): JournalAccessView {
  return { accountsOf: (dmaUserId) => (map[dmaUserId] === undefined ? undefined : new Set(map[dmaUserId])) };
}

/** 적용 RPC 반환 공개 행 1건(계좌 · seq 만 의미 있다). */
function journalRow(seq: number, accountNo: string): JournalOrderRow {
  const db: JournalOrderDbRow = {
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
  return toJournalOrderRow(db);
}

function journalFrames(inbox: RelayOutbound[]): string[][] {
  return inbox
    .filter((m): m is Extract<RelayOutbound, { t: "journal.rows" }> => m.t === "journal.rows")
    .map((m) => m.rows.map((r) => r.accountNo));
}

function eventFrames(inbox: RelayOutbound[]): string[][] {
  return inbox
    .filter((m): m is Extract<RelayOutbound, { t: "journal.events" }> => m.t === "journal.events")
    .map((m) => m.rows.map((r) => `${r.kind}:${r.accountNo}`));
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

describe("wss 역할 게이트 — 접근 맵 → dma_users(AAD dma_user_id) → 세션 (Phase 29 D-02 · D-19)", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let fanout: WsFanout;
  let access: AppAccess;
  let db: StubDb;
  let acquireSpy: ReturnType<typeof vi.spyOn>;
  const sockets: TestWs[] = [];

  async function start(opts: { failAccess?: boolean } = {}): Promise<void> {
    db = stubDb();
    db.failAccess = opts.failAccess === true;
    server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as AddressInfo).port;
    hub = new SubscriptionHub();
    sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
    acquireSpy = vi.spyOn(sessions, "acquire");
    access = new AppAccess({ supabase: db.client, refreshMs: 60_000, missReloadMinMs: 0 });
    fanout = new WsFanout({
      server,
      supabase: db.client,
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      // 운영 결선(index.ts)과 같은 모양.
      credentials: createAccessCredentials({ access, supabase: db.client, credKey: CRED_KEY }),
    });
    access.start();
    if (!db.failAccess) await access.ready();
  }

  async function open(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    return { ws, inbox };
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    access.close();
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await gateway.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("① trader + DMA 연결 → dma_users 를 AAD = dma_user_id 로 복호해 세션 1 · ready 상태 프레임 · 옛 표 조회 0", async () => {
    await start();
    const { ws, inbox } = await open("token-t");
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === "ready"), "T ready");

    expect(inbox[0]?.t).toBe("state");
    expect(acquireSpy).toHaveBeenCalledTimes(1);
    expect(acquireSpy.mock.calls[0]?.[0]).toBe(USER_T);
    expect(acquireSpy.mock.calls[0]?.[1]).toEqual({ dmaUserId: "dmaT", password: "pw-t" });
    expect(ws.closeInfo).toBeNull();
    // 새 원천만 읽는다 — 옛 `dma_credentials` 조회가 없다.
    expect(db.otherTables).toEqual([]);
  });

  it("② admin 도 DMA 연결이 있으면 같은 DMA id 의 암호문 한 벌로 세션을 연다", async () => {
    await start();
    const { inbox } = await open("token-a");
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === "ready"), "A ready");

    expect(acquireSpy.mock.calls[0]?.[1]).toEqual({ dmaUserId: "dmaT", password: "pw-t" });
  });

  it("③ viewer → unauthorized(연결 유지) · 세션 0 · 게이트웨이 연결 0 · 이후 sub 도 unauthorized", async () => {
    await start();
    const { ws, inbox } = await open("token-v");
    await waitFor(() => inbox.length > 0, "V 상태 프레임");

    expect(inbox[0]).toEqual({ t: "state", s: "unauthorized" });
    expect(ws.closeInfo).toBeNull();
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(gateway.sockets).toHaveLength(0);

    ws.sendSub("KR7005930003", "KRX");
    await waitFor(() => inbox.length > 1, "V 구독 거부");
    expect(inbox[1]).toEqual({ t: "state", s: "unauthorized" });
    expect(ws.closeInfo).toBeNull();
  });

  it("④ trader 인데 DMA 연결 없음 → unauthorized · 세션 0", async () => {
    await start();
    const { ws, inbox } = await open("token-n");
    await waitFor(() => inbox.length > 0, "N 상태 프레임");

    expect(inbox[0]).toEqual({ t: "state", s: "unauthorized" });
    expect(ws.closeInfo).toBeNull();
    expect(acquireSpy).not.toHaveBeenCalled();
  });

  it("⑤ 접근 맵에 없음(승인 대기) → 단발 재적재 1회 뒤 unauthorized · 세션 0", async () => {
    await start();
    const before = db.rpcCalls;
    const { ws, inbox } = await open("token-p");
    await waitFor(() => inbox.length > 0, "P 상태 프레임");

    expect(inbox[0]).toEqual({ t: "state", s: "unauthorized" });
    expect(ws.closeInfo).toBeNull();
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(db.rpcCalls - before).toBe(1);
  });

  it("⑥ 방금 승인된 사용자 — 맵 미스 → 단발 재적재가 새 행을 받아 60초를 기다리지 않고 세션을 연다", async () => {
    await start();
    db.accessRows.push({ user_id: USER_P, email: "p@example.com", role: "trader", dma_user_id: "dmaT" });
    const { inbox } = await open("token-p");
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === "ready"), "P ready");

    expect(acquireSpy.mock.calls[0]?.[0]).toBe(USER_P);
  });

  it("⑦ 접근 맵 미적재 → {t:state, s:failed} + 1011 종료(「권한 없음」 으로 위장하지 않는다) · 세션 0", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    await start({ failAccess: true });
    const { ws, inbox } = await open("token-t");
    await waitFor(() => ws.closeInfo !== null, "미적재 close");

    expect(inbox[0]).toEqual(expect.objectContaining({ t: "state", s: "failed" }));
    expect(ws.closeInfo?.code).toBe(1011);
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(access.loaded).toBe(false);
  });

  it("⑧ dma_users 행이 옛 AAD(웹 user_id)로 암호화돼 있으면 복호 실패 = 조회 실패(failed + 1011) · 세션 0", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    await start();
    const { ws, inbox } = await open("token-o");
    await waitFor(() => ws.closeInfo !== null, "옛 AAD close");

    expect(inbox[0]).toEqual(expect.objectContaining({ t: "state", s: "failed" }));
    expect(ws.closeInfo?.code).toBe(1011);
    expect(acquireSpy).not.toHaveBeenCalled();
  });
});

/**
 * Task 2 — D-04 즉시 반영 · 푸시 신원 한 벌. 위 하네스와 같은 모양을 쓰되, 결선을 index.ts 와 같게 붙인다:
 * `access.on("revoked", ids => ids.forEach(u => fanout.revokeUser(u, "access-revoked")))`.
 */
describe("D-04 즉시 반영 · 푸시 신원 = AppAccess (Phase 29)", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let fanout: WsFanout;
  let access: AppAccess;
  let db: StubDb;
  let releaseSpy: ReturnType<typeof vi.spyOn>;
  const sockets: TestWs[] = [];
  const extraLoaders: AppAccess[] = [];

  async function start(): Promise<void> {
    db = stubDb();
    server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as AddressInfo).port;
    hub = new SubscriptionHub();
    sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
    releaseSpy = vi.spyOn(sessions, "release");
    access = new AppAccess({ supabase: db.client, refreshMs: 60_000, missReloadMinMs: 0 });
    fanout = new WsFanout({
      server,
      supabase: db.client,
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      credentials: createAccessCredentials({ access, supabase: db.client, credKey: CRED_KEY }),
    });
    // index.ts 결선과 같은 모양.
    access.on("revoked", (ids: string[]) => ids.forEach((u) => fanout.revokeUser(u, "access-revoked")));
    access.start();
    await access.ready();
  }

  async function authed(token: string, until: "ready" | "unauthorized" = "ready"): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === until), `${token} ${until}`);
    return { ws, inbox };
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    await start();
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    for (const a of extraLoaders.splice(0)) a.close();
    access.close();
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await gateway.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("⑨ revokeUser — 그 사용자의 모든 연결에 unauthorized 1프레임 → 1008 종료 → 세션 release(유예) · 다른 사용자 무영향", async () => {
    const t1 = await authed("token-t");
    const t2 = await authed("token-t");
    const a = await authed("token-a");
    const aBefore = a.inbox.length;

    fanout.revokeUser(USER_T, "access-revoked");
    await waitFor(() => t1.ws.closeInfo !== null && t2.ws.closeInfo !== null, "T 두 탭 종료");

    for (const t of [t1, t2]) {
      expect(t.ws.closeInfo?.code).toBe(1008);
      expect(t.inbox.at(-1)).toEqual({ t: "state", s: "unauthorized" });
      expect(t.inbox.filter((m) => m.t === "state" && m.s === "unauthorized")).toHaveLength(1);
    }
    // 세션은 즉시 끊지 않는다 — release 로 종전 유예(5분)에 맡긴다. 서버 쪽 전략 · 미체결은 건드리지 않는다.
    expect(releaseSpy.mock.calls.filter((c) => c[0] === USER_T)).toHaveLength(2);
    expect(sessions.get(USER_T)).toBeDefined();
    // 같은 DMA id 를 쓰는 다른 사용자(A)는 그대로다.
    expect(a.ws.closeInfo).toBeNull();
    expect(a.inbox.slice(aBefore).some((m) => m.t === "state" && m.s === "unauthorized")).toBe(false);
  });

  it("⑩ 재적재에서 viewer 로 강등 → revoked → 연결 1008 종료 · 재접속하면 unauthorized(연결 유지 · 새 세션 없음)", async () => {
    const t = await authed("token-t");
    const x = await authed("token-x");
    const row = db.accessRows.find((r) => r.user_id === USER_T);
    if (row === undefined) throw new Error("시드 행 없음");
    row.role = "viewer";

    const r = await access.reload();
    expect(r.revoked).toEqual([USER_T]);
    await waitFor(() => t.ws.closeInfo !== null, "강등 사용자 종료");
    expect(t.ws.closeInfo?.code).toBe(1008);
    expect(x.ws.closeInfo).toBeNull();

    const again = await authed("token-t", "unauthorized");
    expect(again.ws.closeInfo).toBeNull();
    expect(again.inbox.some((m) => m.t === "state" && m.s === "ready")).toBe(false);
  });

  it("⑪ 재적재에서 허용 해제(행 삭제) · DMA 연결 끊김도 같은 갈래로 끊긴다", async () => {
    const t = await authed("token-t");
    const x = await authed("token-x");
    db.accessRows = db.accessRows.filter((r) => r.user_id !== USER_T);
    const xRow = db.accessRows.find((r) => r.user_id === USER_X);
    if (xRow === undefined) throw new Error("시드 행 없음");
    xRow.dma_user_id = null;

    const r = await access.reload();
    expect([...r.revoked].sort()).toEqual([USER_T, USER_X].sort());
    await waitFor(() => t.ws.closeInfo !== null && x.ws.closeInfo !== null, "두 사용자 종료");
    expect(t.ws.closeInfo?.code).toBe(1008);
    expect(x.ws.closeInfo?.code).toBe(1008);
  });

  it("⑫ 두 서버(KB · KYOBO) 적용 행 — 각 서버 매핑 + AppAccess 신원으로만 그 사용자에게 간다", async () => {
    const t = await authed("token-t");
    const a = await authed("token-a");
    const x = await authed("token-x");
    const kb = { access: accessView({ dmaT: ["KB-ACC-T"] }), identities: access };
    const kyobo = { access: accessView({ dmaT: ["KY-ACC-T"], dmaX: ["KY-ACC-X"] }), identities: access };

    fanout.deliverJournalRows([journalRow(1, "KB-ACC-T"), journalRow(2, "KY-ACC-T")], kb);
    fanout.deliverJournalRows([journalRow(3, "KY-ACC-T"), journalRow(4, "KY-ACC-X"), journalRow(5, "KB-ACC-T")], kyobo);
    await waitFor(() => journalFrames(t.inbox).length === 2 && journalFrames(x.inbox).length === 1, "두 서버 푸시");
    await flushIo(8);

    // T · A(같은 DMA id 공유)는 각 서버에서 그 서버 매핑의 자기 계좌 행만.
    expect(journalFrames(t.inbox)).toEqual([["KB-ACC-T"], ["KY-ACC-T"]]);
    expect(journalFrames(a.inbox)).toEqual([["KB-ACC-T"], ["KY-ACC-T"]]);
    // X 는 KB 매핑이 없어 KB 푸시 0 · KYOBO 는 자기 계좌만. 다른 서버의 같은 계좌번호 문자열(KB-ACC-T)은 새지 않는다.
    expect(journalFrames(x.inbox)).toEqual([["KY-ACC-X"]]);
  });

  it("⑬ 전략 이벤트도 같은 경로 — 주문 이벤트는 계좌 필터 · 시세 이벤트는 그 서버 매핑 보유자만", async () => {
    const t = await authed("token-t");
    const x = await authed("token-x");
    const kb = { access: accessView({ dmaT: ["KB-ACC-T"] }), identities: access };
    const ev = (kind: number, accountNo: string): StrategyEventRow => ({ kind, accountNo }) as unknown as StrategyEventRow;

    fanout.deliverStrategyEvents([ev(1, ""), ev(3, "KB-ACC-T"), ev(3, "KY-ACC-X")], kb);
    await waitFor(() => eventFrames(t.inbox).length === 1, "T 전략 이벤트");
    await flushIo(8);

    expect(eventFrames(t.inbox)).toEqual([["1:", "3:KB-ACC-T"]]);
    // X 는 KB 매핑이 없다 — 시세 이벤트도 받지 않는다.
    expect(eventFrames(x.inbox)).toEqual([]);
  });

  it("⑭ AppAccess 에 없는 사용자 · 첫 적재 전 신원은 0 프레임(fail closed)", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const t = await authed("token-t");
    const x = await authed("token-x");

    // X 만 아는 신원 사본 — T 는 이 사본에 없다.
    const onlyX = stubDb();
    onlyX.accessRows = onlyX.accessRows.filter((r) => r.user_id === USER_X);
    const partial = new AppAccess({ supabase: onlyX.client });
    extraLoaders.push(partial);
    await partial.reload();
    // 첫 적재 전(실패) 사본.
    const broken = stubDb();
    broken.failAccess = true;
    const unloaded = new AppAccess({ supabase: broken.client });
    extraLoaders.push(unloaded);
    await unloaded.reload();
    expect(unloaded.loaded).toBe(false);

    const map = accessView({ dmaT: ["KY-ACC-T"], dmaX: ["KY-ACC-X"] });
    fanout.deliverJournalRows([journalRow(1, "KY-ACC-T"), journalRow(2, "KY-ACC-X")], { access: map, identities: partial });
    fanout.deliverJournalRows([journalRow(3, "KY-ACC-T"), journalRow(4, "KY-ACC-X")], { access: map, identities: unloaded });
    await waitFor(() => journalFrames(x.inbox).length === 1, "X 푸시");
    await flushIo(8);

    expect(journalFrames(t.inbox)).toEqual([]);
    expect(journalFrames(x.inbox)).toEqual([["KY-ACC-X"]]);
  });
});
