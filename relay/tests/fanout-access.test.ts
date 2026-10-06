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
import type { RelayOutbound } from "@gh-radar/shared";

import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { AppAccess } from "../src/access/app-access.js";
import { createAccessCredentials, encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { logger } from "../src/logger.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const WS_PATH = "/ws";

const USER_T = "7c1c2b7a-9d40-4a11-8e55-0000000000a1";
const USER_A = "7c1c2b7a-9d40-4a11-8e55-0000000000a2";
const USER_V = "7c1c2b7a-9d40-4a11-8e55-0000000000a3";
const USER_N = "7c1c2b7a-9d40-4a11-8e55-0000000000a4";
const USER_P = "7c1c2b7a-9d40-4a11-8e55-0000000000a5";
const USER_O = "7c1c2b7a-9d40-4a11-8e55-0000000000a6";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-t", USER_T],
  ["token-a", USER_A],
  ["token-v", USER_V],
  ["token-n", USER_N],
  ["token-p", USER_P],
  ["token-o", USER_O],
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
  ];
}

function baseDmaUsers(): Map<string, DmaUserRow> {
  return new Map([
    ["dmaT", { dma_user_id: "dmaT", password_enc: encryptDmaPassword("pw-t", "dmaT", CRED_KEY) }],
    ["dmaV", { dma_user_id: "dmaV", password_enc: encryptDmaPassword("pw-v", "dmaV", CRED_KEY) }],
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
