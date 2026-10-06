/**
 * Phase 29 Plan 08 — 서버별 admin 연결(role 2) 실 TCP 통합: 실 `DmaClient` + 가짜 게이트웨이(admin 모드) + 실 `AdminConn`.
 *
 * 가짜는 게이트웨이 소켓 스텁뿐이다. 와이어는 끝까지 실제다 — 연결이 보낸 로그인 · 44 바이트를 스텁이 생성 코드로 되읽고,
 * 스텁이 보낸 79 · 86 · 87 바이트를 화이트리스트 → `parseObserverLoginResp` · `parseAdminCommandResp` · `parseAdminUsersSnapshot` 이 푼다.
 *
 * 잠그는 것 (Task 1 트레이서):
 *   A1  비밀 없음 → disabled · 소켓 0 · 로그인 0
 *   A2  role 2 로그인(client gh-radar-relay/admin · since 0 · epoch "") → 79 role 2 → ready → 44 op 5 정확히 1건 → 87 →
 *       "snapshot" 이벤트 1회 · `currentSnapshot()` = 유저 2명 · usersRev bigint
 *   A3  끊고 재접속 → 세대가 바뀌어 87 전 `currentSnapshot()` null → op 5 가 다시 나가고(2건째) 새 87 로 채워진다 —
 *       스텁 rev 를 1 로 되돌려도(재기동 흉내) 캐시가 갱신된다
 *   공통 — 비밀은 어떤 로그 인자에도 없다(T-19-03) · admin 연결이 보낸 msg_type ⊆ {4, 5, 44}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_CLIENT_NAME, AdminConn, type AdminSnapshotEvent } from "../src/admin/admin-conn.js";
import { ADMIN_OP } from "../src/admin/types.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { defaultAdminHandler, startFakeGateway, type FakeAdminState, type FakeGateway } from "./helpers/fake-gateway.js";

const SECRET = "test-admin-secret-DO-NOT-LOG";

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

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 유저 2명(KB 계좌 각 1개) — 스텁 handler 가 제자리 갱신한다. */
function twoUsers(): FakeAdminState {
  return {
    usersRev: 3n,
    users: new Map([
      ["alice", [{ accountNo: "1111111101", name: "위탁", branchNo: "00001", traderId: "000001", priority: 1 }]],
      ["bob", [{ accountNo: "2222222201", name: "위탁", branchNo: "00002", traderId: "000002", priority: 1 }]],
    ]),
    busyAccounts: new Set(),
  };
}

describe("AdminConn 실 TCP — 가짜 게이트웨이 admin 모드 · 실 DmaClient (29-08 트레이서)", () => {
  let gateway: FakeGateway;
  let conn: AdminConn | null = null;
  let logs: LogCall[];
  let received: number[];
  let snapshots: AdminSnapshotEvent[];

  beforeEach(async () => {
    resetDroppedEnvelopeCount();
    logs = await spyLogs();
    gateway = await startFakeGateway({ autoLogin: false, autoAccount: false });
    received = [];
    gateway.onFrame((msgType) => received.push(msgType));
    snapshots = [];
  });

  afterEach(async () => {
    conn?.stop();
    conn = null;
    await gateway.close();
    vi.restoreAllMocks();
    // T-19-03: 비밀은 어떤 로그 인자에도 없다.
    expect(JSON.stringify(logs.map((c) => c.args), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(
      SECRET,
    );
    // admin 연결은 로그인 · 핑 · 44 외에 아무것도 보내지 않는다(관문 D-02 — 그 밖은 드롭된다).
    expect(
      received.filter((t) => t !== MSG.ObserverLoginReq && t !== MSG.LivePing && t !== MSG.AdminCommandReq),
    ).toEqual([]);
  });

  function startConn(over: Partial<ConstructorParameters<typeof AdminConn>[0]> = {}): AdminConn {
    const c = new AdminConn({
      serverKey: "KB120",
      broker: "KB",
      secret: SECRET,
      host: "127.0.0.1",
      port: gateway.port,
      ...over,
    });
    c.on("snapshot", (e) => snapshots.push(e));
    conn = c;
    c.start();
    return c;
  }

  it("A1 비밀 없음 → disabled · 소켓 0 · 로그인 0", async () => {
    const c = startConn({ secret: undefined });
    expect(c.state).toBe("disabled");
    expect(c.enabled).toBe(false);
    await sleep(200);
    expect(gateway.sockets).toHaveLength(0);
    expect(gateway.adminLoginRequests()).toEqual([]);
    expect(c.currentSnapshot()).toBeNull();
  });

  it("A2 role 2 로그인 → 79 role 2 → ready → op 5 1건 → 87 → snapshot 이벤트 1회 · 유저 2명 캐시", async () => {
    const state = twoUsers();
    gateway.respondAdminLogin({});
    gateway.onAdminCommand(defaultAdminHandler(state));
    const c = startConn();

    await waitFor(() => snapshots.length === 1, "첫 87");
    expect(gateway.adminLoginRequests()).toHaveLength(1);
    expect(gateway.adminLoginRequests()[0]).toMatchObject({
      secret: SECRET,
      role: 2,
      client: ADMIN_CLIENT_NAME,
      sinceSeq: 0,
      epoch: "",
    });
    // 저널 · quote 목록에는 아무것도 없다(role 2 는 admin 목록에만).
    expect(gateway.observerLoginRequests()).toEqual([]);
    expect(gateway.quoteLoginRequests()).toEqual([]);
    expect(c.state).toBe("ready");

    const cmds = gateway.adminCommandRequests();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.op).toBe(ADMIN_OP.ListUsers);

    expect(snapshots[0]?.serverKey).toBe("KB120");
    const snap = c.currentSnapshot();
    expect(snap).not.toBeNull();
    expect(typeof snap?.usersRev).toBe("bigint");
    expect(snap?.usersRev).toBe(3n);
    expect(snap?.users.map((u) => u.userId)).toEqual(["alice", "bob"]);
    expect(snap?.users[0]?.accounts[0]).toEqual({
      accountNo: "1111111101",
      name: "위탁",
      branchNo: "00001",
      traderId: "000001",
      priority: 1,
    });

    // 더 기다려도 op 5 는 접속당 1건이다.
    await sleep(200);
    expect(gateway.adminCommandRequests()).toHaveLength(1);
    expect(snapshots).toHaveLength(1);
  });

  it("A3 재접속 → 87 전 currentSnapshot null → op 5 재송신 → 새 87(rev 1 — 재기동 흉내)로 캐시 갱신", async () => {
    const state = twoUsers();
    gateway.respondAdminLogin({});
    gateway.onAdminCommand(defaultAdminHandler(state));
    const c = startConn();
    await waitFor(() => snapshots.length === 1, "첫 87");
    expect(c.currentSnapshot()?.usersRev).toBe(3n);

    // 재접속 뒤 op 5 에 바로 답하지 않게 한다 — 87 전 구간을 관찰한다.
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();
    gateway.hardClose(sock);

    // 재접속(DmaClient 백오프 첫 1초) → 재로그인 → ready → op 5 2건째.
    await waitFor(() => gateway.adminCommandRequests().length === 2, "재접속 뒤 op 5", 4000);
    expect(gateway.adminLoginRequests()).toHaveLength(2);
    expect(c.state).toBe("ready");
    expect(gateway.adminCommandRequests()[1]?.op).toBe(ADMIN_OP.ListUsers);
    // 새 세대의 87 이 아직 없다 — 옛 스냅샷(rev 3)을 내놓지 않는다.
    expect(c.currentSnapshot()).toBeNull();

    // 서버 재기동 흉내 — rev 가 1 로 돌아가고 유저 하나가 빠졌다. rev 가 줄어도 새 세대의 87 이면 캐시를 갈아 끼운다.
    const live = await gateway.waitForAdminConnection();
    gateway.pushAdminSnapshot(live, { usersRev: 1n, users: [{ userId: "alice", accounts: [{ accountNo: "1111111101" }] }] });
    await waitFor(() => snapshots.length === 2, "새 87");
    expect(c.currentSnapshot()?.usersRev).toBe(1n);
    expect(c.currentSnapshot()?.users.map((u) => u.userId)).toEqual(["alice"]);
  });
});
