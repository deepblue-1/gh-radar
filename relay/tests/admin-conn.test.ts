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
 *
 * 잠그는 것 (Task 2 — 명령 상관 · 서버당 1건 비행):
 *   B1  command 두 건 동시 → 스텁은 하나씩 받는다(두 번째 44 는 첫 86 뒤) · request_id 단조 · 86 의 request_id 로 각자 풀린다
 *   B2  변경 성공(86 ok · rev 변화) → 바로 뒤 87 까지 { result, snapshot } · 무변경(code 0 · rev 같음) → 87 안 기다림 ·
 *       BUSY(9) → code 9 · message 원문
 *   B3  무응답 → 주입 50ms 뒤 timeout · 늦게 온 86 은 버리고 warn 1 · 다음 명령은 정상
 *   B4  ready 아님 → offline · 비행 중 끊김 → 비행 · 대기열 전부 offline
 *   B5  요청 없는 87 → 캐시 갱신 + snapshot 이벤트
 *   B6  79 거부 → rejected · 짧은 재시도 · 12회 넘으면 멈춤 / role 1 응답 → role_mismatch · 소켓 닫힘 · 재시도 없음
 *   B7  health() = { state, usersRev(문자열) } · disabled 는 usersRev null
 *   B8  86 rev 변화 뒤 87 이 상한 안에 안 오면 op 5 를 한 번 더 보내고 결과는 snapshot 없이 풀린다
 *   B9  command(op 5) → 86 없이 87 이 응답 — 합성 result(code 0 · 87 rev) + snapshot
 *   P36 87 budget_krw · fee_ppm · sell_tax_ppm 이 currentSnapshot 계좌에 실린다(구 서버 = 0) · op 6/7 변경 뒤 87 로 새 값
 *
 * 잠그는 것 (35-16 — 발사 계획 op 8/9 · 94 · gh-trade 43 · 인박스 261028-launch-plan-contract):
 *   P35-1  command(op 9) → 44 op 9 · 같은 request_id 94 → { result 합성(code 0), launchPlan 4행 · planRev bigint }
 *   P35-S1 op 8 → 86 code 0 → 87 안 기다리고 풀림 → op 9 비행 중 op 8 의 94(다른 request_id) → debug 버림 → op 9 는 자기 94 로
 *   P35-S2 op 9 → 같은 request_id 86 code 1(구 서버) · 10 · 11 → 즉시 result(launchPlan 없음 · 타임아웃 아님)
 *   P35-R  users_rev null(접속 87 전)이어도 op 8/9 뒤 op 5 를 다시 보내지 않는다 · 결과 usersRev = 0n(모름)
 *   P35-D  op 9 비행 중 끊김 → offline
 *   공통 — 비밀은 어떤 로그 인자에도 없다(T-19-03) · admin 연결이 보낸 msg_type ⊆ {4, 5, 44}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_CLIENT_NAME, AdminConn, type AdminSnapshotEvent } from "../src/admin/admin-conn.js";
import { ADMIN_OP } from "../src/admin/types.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { defaultAdminHandler, startFakeGateway, type FakeAdminState, type FakeGateway } from "./helpers/fake-gateway.js";
import { buildLaunchPlanSnapshotFrame } from "./helpers/frames.js";

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
      // Phase 36 — 87 예수금 · 비용률은 늘 키가 있다(필드 없는 구 서버 = 0).
      budgetKrw: 0,
      feePpm: 0,
      sellTaxPpm: 0,
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

  // ----------------------------------------------------------
  // Task 2 — 명령 상관
  // ----------------------------------------------------------

  /** 유저 2명 표 · 기본 handler 로 ready + 첫 87 까지 세운다. */
  async function readyConn(
    over: Partial<ConstructorParameters<typeof AdminConn>[0]> = {},
  ): Promise<{ c: AdminConn; state: FakeAdminState }> {
    const state = twoUsers();
    gateway.respondAdminLogin({});
    gateway.onAdminCommand(defaultAdminHandler(state));
    const c = startConn(over);
    await waitFor(() => snapshots.length === 1, "첫 87");
    return { c, state };
  }

  /** op 5 를 뺀 명령 44 목록. */
  const commands = () => gateway.adminCommandRequests().filter((r) => r.op !== ADMIN_OP.ListUsers);

  it("B1 두 건 동시 → 스텁은 하나씩(두 번째 44 는 첫 86 뒤) · request_id 단조 · 각자 자기 86 으로 풀린다", async () => {
    const { c } = await readyConn();
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();
    const account = { accountNo: "3333333301", name: "위탁", branchNo: "00003", traderId: "000003", priority: 2 };

    const p1 = c.command({ op: ADMIN_OP.SetAccount, userId: "alice", account });
    const p2 = c.command({ op: ADMIN_OP.SetAccount, userId: "bob", account: { ...account, accountNo: "4444444401" } });
    await waitFor(() => commands().length === 1, "첫 44");
    await sleep(150);
    // 첫 86 전에는 두 번째 44 가 나가지 않는다(서버당 1건 비행).
    expect(commands()).toHaveLength(1);
    const first = commands()[0];
    expect(first?.userId).toBe("alice");

    gateway.respondAdminCommand(sock, { requestId: first?.requestId, ok: true, code: 0, message: "", usersRev: 3n });
    const o1 = await p1;
    expect(o1).toEqual({
      kind: "result",
      result: { requestId: first?.requestId, ok: true, code: 0, message: "", usersRev: 3n },
    });

    await waitFor(() => commands().length === 2, "두 번째 44");
    const second = commands()[1];
    expect(second?.userId).toBe("bob");
    const ids = gateway.adminCommandRequests().map((r) => r.requestId);
    // 접속 op 5 · 명령 1 · 명령 2 — 한 줄로 단조 증가(1n, 2n, 3n).
    expect(ids).toEqual([1n, 2n, 3n]);
    gateway.respondAdminCommand(sock, { requestId: second?.requestId, ok: false, code: 4, message: "없는 사용자입니다", usersRev: 3n });
    const o2 = await p2;
    expect(o2.kind).toBe("result");
    if (o2.kind === "result") {
      expect(o2.result.requestId).toBe(3n);
      expect(o2.result.code).toBe(4);
      expect(o2.result.message).toBe("없는 사용자입니다");
    }
  });

  it("B2 변경 성공 → 86 + 87 짝 { result, snapshot } · 무변경 → 87 기다리지 않음 · BUSY → code 9 · message 원문", async () => {
    const { c, state } = await readyConn();
    const added = { accountNo: "3333333301", name: "위탁2", branchNo: "00001", traderId: "000001", priority: 2 };

    const changed = await c.command({ op: ADMIN_OP.SetAccount, userId: "alice", account: added });
    expect(changed.kind).toBe("result");
    if (changed.kind !== "result") throw new Error("unreachable");
    expect(changed.result.ok).toBe(true);
    expect(changed.result.usersRev).toBe(4n);
    expect(changed.snapshot?.usersRev).toBe(4n);
    expect(changed.snapshot?.users.find((u) => u.userId === "alice")?.accounts.map((a) => a.accountNo)).toEqual([
      "1111111101",
      "3333333301",
    ]);
    expect(c.currentSnapshot()?.usersRev).toBe(4n);
    expect(snapshots).toHaveLength(2);

    // 같은 값 다시 — 무변경(code 0 · rev 그대로 · 87 없음). 87 을 기다리지 않고 곧장 풀린다.
    const t0 = Date.now();
    const same = await c.command({ op: ADMIN_OP.SetAccount, userId: "alice", account: added });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(same.kind).toBe("result");
    if (same.kind !== "result") throw new Error("unreachable");
    expect(same.result).toMatchObject({ ok: true, code: 0, usersRev: 4n });
    expect("snapshot" in same).toBe(false);

    // BUSY — 서버 한국어 message 그대로.
    state.busyAccounts.add("2222222201");
    const busy = await c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" });
    expect(busy.kind).toBe("result");
    if (busy.kind !== "result") throw new Error("unreachable");
    expect(busy.result).toMatchObject({ ok: false, code: 9, message: "미체결 1건 등록 — 먼저 정리", usersRev: 4n });
    expect("snapshot" in busy).toBe(false);
  });

  it("B3 무응답 → 50ms 뒤 timeout · 늦게 온 86 은 버리고 warn 1 · 다음 명령은 정상", async () => {
    const { c, state } = await readyConn({ commandTimeoutMs: 50 });
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();

    const lost = await c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" });
    expect(lost).toEqual({ kind: "timeout" });
    const lostId = commands()[0]?.requestId;

    // 늦게 온 86 — 누구의 Promise 도 풀지 않고 warn 1 로 버린다.
    gateway.respondAdminCommand(sock, { requestId: lostId, ok: true, code: 0, usersRev: 3n });
    await waitFor(() => logs.some((l) => l.level === "warn" && String(l.args[1]).includes("짝 없는 86")), "늦은 86 warn");
    expect(logs.filter((l) => l.level === "warn" && String(l.args[1]).includes("짝 없는 86"))).toHaveLength(1);

    gateway.onAdminCommand(defaultAdminHandler(state));
    const next = await c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" });
    expect(next.kind).toBe("result");
    if (next.kind === "result") expect(next.result).toMatchObject({ ok: true, code: 0, usersRev: 4n });
    expect(c.state).toBe("ready");
  });

  it("B4 ready 아님 → offline · 비행 중 끊김 → 비행 · 대기열 전부 offline", async () => {
    // 로그인 응답 없음 → logging_in 에 머문다.
    const pending = startConn();
    await waitFor(() => gateway.adminLoginRequests().length === 1, "로그인 요청");
    expect(pending.state).toBe("logging_in");
    expect(await pending.command({ op: ADMIN_OP.DeleteUser, userId: "bob" })).toEqual({ kind: "offline" });
    expect(gateway.adminCommandRequests()).toEqual([]);
    pending.stop();
    conn = null;
    snapshots = [];

    const { c } = await readyConn();
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();
    const p1 = c.command({ op: ADMIN_OP.DeleteUser, userId: "alice" });
    const p2 = c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" });
    await waitFor(() => commands().length === 1, "첫 44 비행");
    gateway.hardClose(sock);
    expect(await p1).toEqual({ kind: "offline" });
    expect(await p2).toEqual({ kind: "offline" });
    // 두 번째는 끝내 나가지 않았다.
    expect(commands()).toHaveLength(1);
  });

  it("B5 요청 없는 87 → 캐시 갱신 + snapshot 이벤트", async () => {
    const { c } = await readyConn();
    const sock = await gateway.waitForAdminConnection();
    gateway.pushAdminSnapshot(sock, { usersRev: 9n, users: [{ userId: "carol", accounts: [{ accountNo: "5555555501" }] }] });
    await waitFor(() => snapshots.length === 2, "요청 없는 87");
    expect(snapshots[1]?.serverKey).toBe("KB120");
    expect(c.currentSnapshot()?.usersRev).toBe(9n);
    expect(c.currentSnapshot()?.users.map((u) => u.userId)).toEqual(["carol"]);
    expect(c.health()).toEqual({ state: "ready", usersRev: "9" });
  });

  it("B6a 79 거부 → rejected · 짧은 재시도 뒤 재로그인 · 12회 넘으면 멈춤", async () => {
    gateway.respondAdminLogin({ success: false, message: "거부" });
    const c = startConn({ rejectedRetryMs: 20 });
    await waitFor(() => c.state === "rejected", "rejected");
    // 첫 로그인 + 재시도 12회 = 13건에서 멈춘다.
    await waitFor(() => gateway.adminLoginRequests().length === 13, "재시도 12회", 6000);
    await sleep(300);
    expect(gateway.adminLoginRequests()).toHaveLength(13);
    expect(c.state).toBe("rejected");
    expect(c.health()).toEqual({ state: "rejected", usersRev: null });
    expect(await c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" })).toEqual({ kind: "offline" });
  });

  it("B6b role 1 응답 → role_mismatch · 소켓 닫힘 · 재시도 없음", async () => {
    gateway.respondAdminLogin({ success: true, role: 1 });
    const c = startConn({ rejectedRetryMs: 20 });
    await waitFor(() => c.state === "role_mismatch", "role_mismatch");
    await waitFor(() => gateway.sockets.every((s) => s.destroyed), "소켓 닫힘");
    await sleep(1_500);
    expect(gateway.adminLoginRequests()).toHaveLength(1);
    expect(c.state).toBe("role_mismatch");
    expect(gateway.adminCommandRequests()).toEqual([]);
  });

  it("B7 health() — ready 는 usersRev 문자열 · disabled 는 null", async () => {
    const { c } = await readyConn();
    expect(c.health()).toEqual({ state: "ready", usersRev: "3" });
    const off = new AdminConn({ serverKey: "KYOBO119", broker: "KYOBO", secret: "", host: "127.0.0.1", port: gateway.port });
    off.start();
    expect(off.health()).toEqual({ state: "disabled", usersRev: null });
    off.stop();
  });

  it("B8 변경 86 뒤 87 이 상한 안에 안 오면 op 5 를 한 번 더 보내고 결과는 snapshot 없이 풀린다", async () => {
    const { c, state } = await readyConn({ snapshotWaitMs: 50 });
    const sock = await gateway.waitForAdminConnection();
    // 86 만 쓰고 87 은 빼먹는 서버 흉내 — op 5 에는 정상 87.
    const base = defaultAdminHandler(state);
    gateway.onAdminCommand((req) => {
      const reply = base(req);
      if (req.op === ADMIN_OP.ListUsers || reply === null) return reply;
      return reply.resp !== undefined ? { resp: reply.resp } : reply;
    });
    const out = await c.command({ op: ADMIN_OP.DeleteUser, userId: "bob" });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") throw new Error("unreachable");
    expect(out.result.usersRev).toBe(4n);
    expect("snapshot" in out).toBe(false);
    // 보정 op 5 → 87(rev 4) 가 캐시를 맞춘다.
    await waitFor(() => c.currentSnapshot()?.usersRev === 4n, "보정 87");
    const ops = gateway.adminCommandRequests().map((r) => r.op);
    expect(ops).toEqual([ADMIN_OP.ListUsers, ADMIN_OP.DeleteUser, ADMIN_OP.ListUsers]);
    expect(c.currentSnapshot()?.users.map((u) => u.userId)).toEqual(["alice"]);
    void sock;
  });

  it("B9 command(op 5) → 86 없이 87 이 응답 — 합성 result(code 0 · 87 rev) + snapshot", async () => {
    const { c } = await readyConn();
    const out = await c.command({ op: ADMIN_OP.ListUsers, userId: "" });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") throw new Error("unreachable");
    expect(out.result).toMatchObject({ ok: true, code: 0, message: "", usersRev: 3n });
    expect(out.result.requestId).toBe(gateway.adminCommandRequests()[1]?.requestId);
    expect(out.snapshot?.users.map((u) => u.userId)).toEqual(["alice", "bob"]);
    expect(snapshots).toHaveLength(2);
  });

  it("P36 87 예수금 · 비용률 — 접속 87 의 세 값이 currentSnapshot 계좌에 실리고 · op 6/op 7 변경 뒤 87 로 새 값(D-05)", async () => {
    const { c, state } = await readyConn();
    // 접속 87 은 비용 없음 → 0 · 0 · 0.
    expect(c.currentSnapshot()?.users[0]?.accounts[0]).toMatchObject({ budgetKrw: 0, feePpm: 0, sellTaxPpm: 0 });

    const account = { accountNo: "1111111101", name: "", branchNo: "", traderId: "", priority: 0 };
    const b = await c.command({ op: ADMIN_OP.SetAccountBudget, userId: "", account, budgetKrw: 700_000_000n });
    expect(b.kind).toBe("result");
    const f = await c.command({ op: ADMIN_OP.SetAccountFee, userId: "", account, feePpm: 500, sellTaxPpm: 2000 });
    expect(f.kind === "result" && f.snapshot !== undefined).toBe(true);
    expect(state.costs?.get("1111111101")).toEqual({ budgetKrw: 700_000_000n, feePpm: 500, sellTaxPpm: 2000 });

    const snap = c.currentSnapshot()!;
    expect(snap.users.find((u) => u.userId === "alice")?.accounts[0]).toMatchObject({
      accountNo: "1111111101",
      budgetKrw: 700_000_000,
      feePpm: 500,
      sellTaxPpm: 2000,
    });
    // 다른 계좌는 그대로 0.
    expect(snap.users.find((u) => u.userId === "bob")?.accounts[0]).toMatchObject({ budgetKrw: 0, feePpm: 0, sellTaxPpm: 0 });
    // 44 에 실린 값(가짜 게이트웨이가 생성 리더로 되읽음).
    expect(commands().map((r) => [r.op, r.budgetKrw, r.feePpm, r.sellTaxPpm])).toEqual([
      [6, 700_000_000n, 0, 0],
      [7, 0n, 500, 2000],
    ]);
  });

  // ----------------------------------------------------------
  // 35-16 — 발사 계획 op 8/9 · 94 (gh-trade 43)
  // ----------------------------------------------------------

  it("P35-1 발사 계획 조회 — command(op 9) → 44 op 9 → 같은 request_id 94 → { result code 0, launchPlan 4행 }", async () => {
    const { c } = await readyConn();
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();

    const p = c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    await waitFor(() => commands().length === 1, "op 9 44");
    const req = commands()[0]!;
    expect(req.op).toBe(9);
    expect(req.account).toBeNull();

    gateway.sendFrame(sock, buildLaunchPlanSnapshotFrame({ requestId: req.requestId, planRev: 3n, updatedAt: "2026-10-27T22:41:00" }));
    const out = await p;
    expect(out.kind).toBe("result");
    if (out.kind !== "result") throw new Error("unreachable");
    expect(out.result).toEqual({ requestId: req.requestId, ok: true, code: 0, message: "", usersRev: 3n });
    expect("snapshot" in out).toBe(false);
    expect(out.launchPlan).toEqual({
      requestId: req.requestId,
      planRev: 3n,
      updatedAt: "2026-10-27T22:41:00",
      entries: [
        { profile: "Q16", market: "K", offsetsUs: [-350, -345, -325] },
        { profile: "Q16", market: "Q", offsetsUs: [-340, -335, -322] },
        { profile: "N", market: "K", offsetsUs: [-200] },
        { profile: "N", market: "Q", offsetsUs: [-245] },
      ],
    });
    // 94 는 users.toml 과 무관 — 87 캐시 · snapshot 이벤트를 건드리지 않는다.
    expect(snapshots).toHaveLength(1);
    expect(c.currentSnapshot()?.usersRev).toBe(3n);
  });

  it("P35-S1 op 8 → 86 code 0 → 바로 풀림 · op 9 비행 중 op 8 의 94 는 버리고 op 9 는 자기 94 로 풀린다", async () => {
    const { c } = await readyConn();
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();

    const p8 = c.command({
      op: ADMIN_OP.SetLaunchPlan,
      userId: "",
      launchProfile: "Q16",
      launchMarket: "K",
      launchOffsetsUs: [-350, -345, -325],
    });
    const p9 = c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    await waitFor(() => commands().length === 1, "op 8 44");
    const r8 = commands()[0]!;
    expect(r8.op).toBe(8);

    // 서버: 86(저장 — 다음 발사부터 적용 · users_rev 는 users 레지스트리 값 그대로) → (실제 변경) 94. 94 는 op 9 가 나간 뒤에 닿게 한다.
    gateway.respondAdminCommand(sock, { requestId: r8.requestId, ok: true, code: 0, message: "저장 — 다음 발사부터 적용", usersRev: 3n });
    const o8 = await p8;
    expect(o8).toEqual({
      kind: "result",
      result: { requestId: r8.requestId, ok: true, code: 0, message: "저장 — 다음 발사부터 적용", usersRev: 3n },
    });

    await waitFor(() => commands().length === 2, "op 9 44");
    const r9 = commands()[1]!;
    expect(r9.op).toBe(9);
    // op 8 의 늦은 94(plan_rev 4) — 짝 없음 → debug 1줄로 버린다(op 9 를 풀지 않는다).
    gateway.sendFrame(sock, buildLaunchPlanSnapshotFrame({ requestId: r8.requestId, planRev: 4n }));
    await waitFor(() => logs.some((l) => l.level === "debug" && String(l.args[1]).includes("짝 없는 발사 계획 스냅샷")), "짝 없는 94");
    // op 9 의 94(plan_rev 5 — 그 사이 다른 저장이 있었다고 친다).
    gateway.sendFrame(sock, buildLaunchPlanSnapshotFrame({ requestId: r9.requestId, planRev: 5n }));
    const o9 = await p9;
    expect(o9.kind).toBe("result");
    if (o9.kind !== "result") throw new Error("unreachable");
    expect(o9.launchPlan?.requestId).toBe(r9.requestId);
    expect(o9.launchPlan?.planRev).toBe(5n);
    expect(logs.filter((l) => String(l.args[1]).includes("짝 없는 발사 계획 스냅샷"))).toHaveLength(1);
    // users.toml 과 무관 — op 5 를 더 보내지 않았고 87 이벤트도 그대로다.
    expect(gateway.adminCommandRequests().map((r) => r.op)).toEqual([ADMIN_OP.ListUsers, 8, 9]);
    expect(snapshots).toHaveLength(1);
  });

  it("P35-S2 op 9 → 같은 request_id 86 code 1(구 서버) · 10 · 11 → 즉시 result(launchPlan 없음 · 타임아웃 아님)", async () => {
    // 기본 handler 는 op 6 이상을 code 1 「알 수 없는 명령입니다」 로 답한다 = 구 서버(op 8/9 모름) 흉내.
    const { c } = await readyConn();
    const t0 = Date.now();
    const old = await c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(old.kind).toBe("result");
    if (old.kind !== "result") throw new Error("unreachable");
    expect(old.result).toMatchObject({ ok: false, code: 1, message: "알 수 없는 명령입니다" });
    expect(old.result.requestId).toBe(commands()[0]?.requestId);
    expect("launchPlan" in old).toBe(false);

    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();
    for (const [code, message] of [
      [10, "발사 계획 미초기화"],
      [11, "관리자 연결이 아닙니다"],
    ] as const) {
      const before = commands().length;
      const p = c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
      await waitFor(() => commands().length === before + 1, `op 9 (${code})`);
      const req = commands().at(-1)!;
      expect(req.op).toBe(9);
      gateway.respondAdminCommand(sock, { requestId: req.requestId, ok: false, code, message, usersRev: 3n });
      const out = await p;
      expect(out.kind).toBe("result");
      if (out.kind !== "result") throw new Error("unreachable");
      expect(out.result).toMatchObject({ ok: false, code, message });
      expect("launchPlan" in out).toBe(false);
    }
    // 실패 86 은 짝이 있으므로 「짝 없는 86」 warn 이 아니다.
    expect(logs.filter((l) => l.level === "warn" && String(l.args[1]).includes("짝 없는 86"))).toEqual([]);
  });

  it("P35-R users_rev null(접속 87 전)이어도 op 8/9 뒤 op 5 를 다시 보내지 않는다 · op 9 결과 usersRev 0n", async () => {
    gateway.respondAdminLogin({});
    gateway.onAdminCommand(null); // 접속 op 5 에 답하지 않는다 → 87 없음 → 이 세대 rev 모름
    const c = startConn({ snapshotWaitMs: 50 });
    await waitFor(() => c.state === "ready" && gateway.adminCommandRequests().length === 1, "ready · op 5");
    const sock = await gateway.waitForAdminConnection();
    expect(c.health().usersRev).toBeNull();

    const p9 = c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    await waitFor(() => commands().length === 1, "op 9");
    gateway.sendFrame(sock, buildLaunchPlanSnapshotFrame({ requestId: commands()[0]!.requestId }));
    const o9 = await p9;
    expect(o9.kind === "result" && o9.result.usersRev).toBe(0n);

    const p8 = c.command({ op: ADMIN_OP.SetLaunchPlan, userId: "", launchProfile: "N", launchMarket: "Q", launchOffsetsUs: [-180] });
    await waitFor(() => commands().length === 2, "op 8");
    gateway.respondAdminCommand(sock, { requestId: commands()[1]!.requestId, ok: true, code: 0, message: "저장 — 다음 발사부터 적용", usersRev: 3n });
    const o8 = await p8;
    expect(o8.kind).toBe("result");
    expect("snapshot" in o8).toBe(false);
    // 87 대기 상한(50ms)을 넘겨도 보정 op 5 가 나가지 않는다 — op 8/9 는 users_rev 변경 판정 밖.
    await sleep(200);
    expect(gateway.adminCommandRequests().map((r) => r.op)).toEqual([ADMIN_OP.ListUsers, 9, 8]);
  });

  it("P35-D op 9 비행 중 끊김 → offline", async () => {
    const { c } = await readyConn();
    gateway.onAdminCommand(null);
    const sock = await gateway.waitForAdminConnection();
    const p = c.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    await waitFor(() => commands().length === 1, "op 9 비행");
    gateway.hardClose(sock);
    expect(await p).toEqual({ kind: "offline" });
  });
});
