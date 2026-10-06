/**
 * Phase 29 Plan 11 Task 2 — `AdminDispatcher` 변경 경로 단위 테스트.
 *
 * 실 planner(29-04) · 실 `AdminIntentStore` ↔ 메모리 RPC 대역(`AdminDbFake`) · admin 연결은 프로세스 안 대역(`FakeConn` —
 * 가짜 게이트웨이의 `defaultAdminHandler` 를 그대로 돌린다: op 판정 · rev · 87 이 스텁과 같다).
 *
 * 잠그는 것:
 *   D1  계좌 등록 서버 교체 — 새 서버 op 3(유저 있음) / op 1(없음 · 저장 암호문 복호) · 빠진 서버 op 4(→ settle) / op 2(마지막)
 *   D2  op 4 code 8 → ok + settle · code 9 → failed · message 원문 · removing 유지
 *   D3  87 에만 있는 계좌 X 가 있는 서버 — op 4 만 · X 그대로 · op 2 없음 · 마지막 계좌 제거는 LAST_ACCOUNT(44 0건)
 *   D4  유저 삭제 — 한 서버 BUSY → 그 서버만 failed · 다른 서버 settle(userRemoved) · delete 없음 / 전 서버 ok(0 · 4) → delete 1회
 *   D5  비밀번호 — 암호문 AAD = dmaUserId · 87 에 유저 있는 서버만 op 1(password 만) · dual-write(연결된 웹 사용자 행만)
 *   D6  다시 반영 — 의도 = 87 이면 44 0건 · 전 서버 ok
 *   D7  부분 실패 — 무응답 timeout · offline · skipped 는 그 서버만 · 응답 시간 상한
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminCommandOutcome } from "../src/admin/admin-conn.js";
import { AdminDispatcher, type AdminConnLike } from "../src/admin/dispatcher.js";
import { AdminIntentStore, IntentError } from "../src/admin/intent-store.js";
import type { AdminUsersSnapshot } from "../src/admin/types.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { decryptDmaPassword, encryptDmaPassword } from "../src/store/credentials.js";
import { AdminDbFake } from "./helpers/admin-db-fake.js";
import { defaultAdminHandler, type FakeAdminHandler, type FakeAdminState } from "./helpers/fake-gateway.js";

type CommandInput = Parameters<AdminConnLike["command"]>[0];

const PASSWORD = "stored-p@ss-절대노출금지";
const KEY = randomBytes(32).toString("base64");
const BUSY_MESSAGE = "미체결 1건 등록 — 먼저 정리";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Acc = { accountNo: string; name?: string; branchNo?: string; traderId?: string; priority?: number };

function kb(accountNo: string, priority = 1): Required<Acc> {
  return { accountNo, name: "위탁", branchNo: "00001", traderId: "000001", priority };
}

function snapshotOf(state: FakeAdminState): AdminUsersSnapshot {
  return {
    usersRev: state.usersRev,
    users: [...state.users].map(([userId, accounts]) => ({
      userId,
      accounts: [...accounts]
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .map((a) => ({
          accountNo: a.accountNo ?? "",
          name: a.name ?? "",
          branchNo: a.branchNo ?? "",
          traderId: a.traderId ?? "",
          priority: a.priority ?? 0,
        })),
    })),
  };
}

/** admin 연결 대역 — 스텁 handler 로 86 · 87 을 만들고, 87 이 오면 캐시를 갈아 끼운다. */
class FakeConn implements AdminConnLike {
  readonly sent: CommandInput[] = [];
  mode: "normal" | "timeout" | "offline" = "normal";
  timeoutMs = 80;
  #snapshot: AdminUsersSnapshot | null;
  #requestId = 10n;
  readonly #handler: FakeAdminHandler;

  constructor(readonly state: FakeAdminState) {
    this.#handler = defaultAdminHandler(state);
    this.#snapshot = snapshotOf(state);
  }

  /** 87 미수신 흉내. */
  forgetSnapshot(): void {
    this.#snapshot = null;
  }

  currentSnapshot(): AdminUsersSnapshot | null {
    return this.#snapshot;
  }

  async command(input: CommandInput): Promise<AdminCommandOutcome> {
    this.sent.push(structuredClone(input));
    if (this.mode === "offline") return { kind: "offline" };
    if (this.mode === "timeout") {
      await sleep(this.timeoutMs);
      return { kind: "timeout" };
    }
    this.#requestId += 1n;
    const reply = this.#handler({
      requestId: this.#requestId,
      op: input.op,
      userId: input.userId,
      password: input.password ?? "",
      account: input.account ?? null,
    });
    if (reply?.resp === undefined) return { kind: "timeout" };
    if (reply.snapshot !== undefined) this.#snapshot = snapshotOf(this.state);
    const r = reply.resp;
    return {
      kind: "result",
      result: {
        requestId: r.requestId ?? this.#requestId,
        ok: r.ok ?? (r.code ?? 0) === 0,
        code: r.code ?? 0,
        message: r.message ?? "",
        usersRev: r.usersRev ?? 1n,
      },
      ...(reply.snapshot !== undefined ? { snapshot: snapshotOf(this.state) } : {}),
    };
  }
}

function state(users: Record<string, Acc[]>, busy: string[] = []): FakeAdminState {
  const map = new Map<string, Acc[]>([["other", [kb("9999")]]]);
  for (const [u, accounts] of Object.entries(users)) map.set(u, accounts.map((a) => ({ ...a })));
  return { usersRev: 5n, users: map, busyAccounts: new Set(busy) };
}

function row(key: string, enabled = true): DmaServerRow {
  return { key, broker: "KB", host: "127.0.0.1", port: 1, enabled, isOrderServer: false, isQuotePrimary: false, sortOrder: 0 };
}

type Env = {
  db: AdminDbFake;
  store: AdminIntentStore;
  conns: Record<string, FakeConn>;
  rows: DmaServerRow[];
  access: Map<string, string | null>;
  /** 열린 세션 훅 기록(29-21) — op 2 ok → closeForDmaUser · 비밀번호 → updatePassword. */
  sessionCalls: Array<{ fn: "closeForDmaUser" | "updatePassword"; dmaUserId: string; serverKey?: string; password?: string }>;
  dispatcher: AdminDispatcher;
};

function setup(states: Record<string, FakeAdminState>, rows: DmaServerRow[] = [row("KB120"), row("KB121")]): Env {
  const db = new AdminDbFake(rows.map((r) => ({ key: r.key, broker: r.broker })));
  const store = new AdminIntentStore({ supabase: db.client });
  const conns: Record<string, FakeConn> = {};
  for (const [k, s] of Object.entries(states)) conns[k] = new FakeConn(s);
  const access = new Map<string, string | null>();
  const sessionCalls: Env["sessionCalls"] = [];
  const dispatcher = new AdminDispatcher({
    store,
    pipelines: { get: (k) => (conns[k] ? { admin: conns[k]! } : undefined) },
    registry: { all: () => rows.map((r) => ({ ...r })), get: (k) => rows.find((r) => r.key === k) },
    credKey: KEY,
    access: { entryOf: (u) => (access.has(u) ? { dmaUserId: access.get(u) ?? null } : undefined) },
    sessions: {
      closeForDmaUser: (dmaUserId, _reason, opts) => {
        sessionCalls.push({ fn: "closeForDmaUser", dmaUserId, ...(opts?.serverKey !== undefined ? { serverKey: opts.serverKey } : {}) });
        return 1;
      },
      updatePassword: (dmaUserId, password) => {
        sessionCalls.push({ fn: "updatePassword", dmaUserId, password });
        return 1;
      },
    },
  });
  return { db, store, conns, rows, access, sessionCalls, dispatcher };
}

function seedU1(env: Env, accounts: Parameters<AdminDbFake["seedUser"]>[0]["accounts"]): void {
  env.db.seedUser({ dmaUserId: "u1", passwordEnc: encryptDmaPassword(PASSWORD, "u1", KEY), accounts });
}

const ops = (c: FakeConn): number[] => c.sent.map((s) => s.op);

describe("AdminDispatcher — 변경 경로 (29-11 Task 2)", () => {
  beforeEach(async () => {
    const { logger } = await import("../src/logger.js");
    for (const level of ["debug", "info", "warn", "error"] as const) vi.spyOn(logger, level).mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("D1 계좌 서버 교체(유저 있음) — KB121 op 3 · KB120 op 4 → settle · 두 서버 ok", async () => {
    const env = setup({
      KB120: state({ u1: [kb("A", 1), kb("B", 2)] }),
      KB121: state({ u1: [kb("A", 1)] }),
    });
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120", "KB121"] },
      { accountNo: "B", priority: 2, servers: ["KB120"] },
    ]);

    await env.store.putAccount("u1", { broker: "KB", ...kb("B", 2) }, ["KB121"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "ok", usersRev: "6" },
    ]);
    expect(env.conns.KB121!.sent).toEqual([{ op: 3, userId: "u1", account: kb("B", 2) }]);
    expect(env.conns.KB120!.sent).toEqual([
      { op: 4, userId: "u1", account: { accountNo: "B", name: "", branchNo: "", traderId: "", priority: 0 } },
    ]);
    expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args)).toEqual([
      { p_dma_user_id: "u1", p_server_key: "KB120", p_removed_accounts: ["B"], p_user_removed: false },
    ]);
    expect(env.db.intentOf("u1").map((r) => `${r.accountNo}@${r.serverKey}:${r.state}`)).toEqual([
      "A@KB120:active",
      "A@KB121:active",
      "B@KB121:active",
    ]);
    expect(env.db.callsTo("dma_admin_record_results")).toHaveLength(1);
  });

  it("D1 계좌 서버 교체(유저 없음) — 새 서버 op 1(저장 암호문 복호 · AAD dmaUserId) · 빠진 서버 마지막 계좌 = op 2", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({}) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);

    await env.store.putAccount("u1", { broker: "KB", ...kb("A") }, ["KB121"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });

    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(env.conns.KB121!.sent).toEqual([{ op: 1, userId: "u1", password: PASSWORD, account: kb("A") }]);
    expect(env.conns.KB120!.sent).toEqual([{ op: 2, userId: "u1" }]);
    expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args)).toEqual([
      { p_dma_user_id: "u1", p_server_key: "KB120", p_removed_accounts: [], p_user_removed: true },
    ]);
    expect(env.conns.KB120!.state.users.has("u1")).toBe(false);
  });

  it("D2 op 4 code 8(이미 없음) → ok + settle", async () => {
    const env = setup({ KB120: state({ u1: [kb("A", 1), kb("B", 2)] }) }, [row("KB120")]);
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120"] },
      { accountNo: "B", priority: 2, servers: [{ key: "KB120", state: "removing" }] },
    ]);
    // 서버에서는 이미 지워졌는데 87 캐시는 아직 옛 값이다.
    env.conns.KB120!.state.users.set("u1", [kb("A", 1)]);

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(results).toEqual([{ server: "KB120", outcome: "ok", usersRev: "5" }]);
    expect(ops(env.conns.KB120!)).toEqual([4]);
    expect(env.db.callsTo("dma_admin_settle_server")[0]!.args.p_removed_accounts).toEqual(["B"]);
    expect(env.db.intentOf("u1").map((r) => r.accountNo)).toEqual(["A"]);
  });

  it("D2 op 4 code 9(BUSY) → failed · code 9 · message 원문 · 행은 removing 으로 남는다", async () => {
    const env = setup({ KB120: state({ u1: [kb("A", 1), kb("B", 2)] }, ["B"]) }, [row("KB120")]);
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120"] },
      { accountNo: "B", priority: 2, servers: ["KB120"] },
    ]);
    await env.store.markAccountRemoved("u1", "KB", "B");

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(results).toEqual([{ server: "KB120", outcome: "failed", code: 9, message: BUSY_MESSAGE, usersRev: "5" }]);
    expect(env.db.callsTo("dma_admin_settle_server")).toEqual([]);
    expect(env.db.intentOf("u1").find((r) => r.accountNo === "B")?.state).toBe("removing");
    expect(env.db.callsTo("dma_admin_record_results")[0]!.args.p_results).toEqual([
      { server: "KB120", outcome: "failed", code: 9, message: BUSY_MESSAGE },
    ]);

    // BUSY 가 풀리면 「다시 반영」 이 재시도한다.
    env.conns.KB120!.state.busyAccounts.clear();
    const again = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(again.map((r) => r.outcome)).toEqual(["ok"]);
    expect(env.db.intentOf("u1").map((r) => r.accountNo)).toEqual(["A"]);
  });

  it("D3 87 에만 있는 계좌 X 가 있는 서버에서 의도 계좌 제거 → op 4 만 · X 그대로 · op 2 없음", async () => {
    const env = setup({
      KB120: state({ u1: [kb("A", 1), kb("X", 9)] }),
      KB121: state({ u1: [kb("C", 1)] }),
    });
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120"] },
      { accountNo: "C", priority: 1, servers: ["KB121"] },
    ]);
    await env.store.markAccountRemoved("u1", "KB", "A");

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(env.conns.KB120!.sent.map((s) => [s.op, s.account?.accountNo])).toEqual([[4, "A"]]);
    expect(env.conns.KB120!.state.users.get("u1")?.map((a) => a.accountNo)).toEqual(["X"]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("D3 마지막 active 계좌 제거 → LAST_ACCOUNT · 44 0건", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    await expect(env.store.markAccountRemoved("u1", "KB", "A")).rejects.toMatchObject({ code: "LAST_ACCOUNT" });
    await expect(env.store.markAccountRemoved("u1", "KB", "A")).rejects.toBeInstanceOf(IntentError);
    expect(env.conns.KB120!.sent).toEqual([]);
  });

  it("D4 유저 삭제 — 한 서버 BUSY → 그 서버만 failed · 다른 서버 op 2 + settle(userRemoved) · delete 없음", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }, ["A"]) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

    const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com");
    expect(out.deleted).toBe(false);
    expect(out.results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "failed", code: 9, message: BUSY_MESSAGE, usersRev: "5" },
    ]);
    expect(ops(env.conns.KB120!)).toEqual([2]);
    expect(ops(env.conns.KB121!)).toEqual([2]);
    expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args)).toEqual([
      { p_dma_user_id: "u1", p_server_key: "KB120", p_removed_accounts: [], p_user_removed: true },
    ]);
    expect(env.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);
    // KB121 의도는 그대로(결과 칩이 실패를 보여 준다).
    expect(env.db.intentOf("u1").map((r) => `${r.serverKey}:${r.state}`)).toEqual(["KB121:active"]);
  });

  it("D4 유저 삭제 — 전 서버 ok(0 · 4 = 이미 없음) → delete 1회", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    env.conns.KB121!.state.users.delete("u1"); // 87 캐시엔 있지만 서버엔 없다 → op 2 code 4

    const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com");
    expect(out.deleted).toBe(true);
    expect(out.results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(env.db.callsTo("dma_admin_delete_dma_user")).toHaveLength(1);
    expect(env.db.dmaUsers.has("u1")).toBe(false);
  });

  it("D4 유저 삭제 — 87 에만 있는 계좌가 있는 서버는 op 2 대신 의도 계좌 op 4 만(유저 · X 유지)", async () => {
    const env = setup({ KB120: state({ u1: [kb("A"), kb("X", 9)] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);

    const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com");
    expect(out.deleted).toBe(true);
    expect(env.conns.KB120!.sent.map((s) => [s.op, s.account?.accountNo])).toEqual([[4, "A"]]);
    expect(env.conns.KB120!.state.users.get("u1")?.map((a) => a.accountNo)).toEqual(["X"]);
  });

  it("D5 비밀번호 — AAD dmaUserId · 87 에 유저 있는 서버만 op 1(password 만) · dual-write 연결 사용자만", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({}) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    env.access.set("web-1", "u1");
    env.access.set("web-2", "u1");
    env.access.set("web-3", "zz"); // 다른 DMA id 에 연결 — 옛 행이 u1 이어도 건드리지 않는다
    env.db.legacy.push(
      { user_id: "web-1", dma_user_id: "u1", dma_password_enc: "old-1" },
      { user_id: "web-2", dma_user_id: "u1", dma_password_enc: "old-2" },
      { user_id: "web-3", dma_user_id: "u1", dma_password_enc: "old-3" },
    );

    const NEW = "new-p@ss-절대노출금지";
    const results = await env.dispatcher.changePassword("u1", NEW, "boss@gmail.com");

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "ok", usersRev: "5" },
    ]);
    expect(env.conns.KB120!.sent).toEqual([{ op: 1, userId: "u1", password: NEW }]);
    expect(env.conns.KB121!.sent).toEqual([]);

    const enc = env.db.callsTo("dma_admin_set_password")[0]!.args.p_password_enc as string;
    expect(enc).not.toContain(NEW);
    expect(decryptDmaPassword(enc, "u1", KEY)).toBe(NEW);

    const legacy = Object.fromEntries(env.db.legacy.map((r) => [r.user_id, r.dma_password_enc]));
    expect(decryptDmaPassword(legacy["web-1"]!, "web-1", KEY)).toBe(NEW);
    expect(decryptDmaPassword(legacy["web-2"]!, "web-2", KEY)).toBe(NEW);
    expect(legacy["web-3"]).toBe("old-3");
    expect(JSON.stringify(env.db.calls)).not.toContain(NEW);
  });

  it("D5 비밀번호 — 옛 행이 없으면 dual-write 건너뜀 · 없는 DMA id 는 NO_DMA_USER · 44 0건", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    env.access.set("web-1", "u1");
    await env.dispatcher.changePassword("u1", "n1", "boss@gmail.com");
    expect(env.db.calls.filter((c) => c.name.startsWith("update:"))).toEqual([]);

    await expect(env.dispatcher.changePassword("nope", "n1", "boss@gmail.com")).rejects.toMatchObject({ code: "NO_DMA_USER" });
    expect(env.conns.KB120!.sent).toHaveLength(1);
  });

  it("D6 다시 반영 — 의도 = 87 이면 44 0건 · 전 서버 ok", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "5" },
      { server: "KB121", outcome: "ok", usersRev: "5" },
    ]);
    expect(env.conns.KB120!.sent).toEqual([]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("D7 부분 실패 — 무응답 timeout · 다른 서버 ok · 응답 시간 ≤ 타임아웃 × op 수 + 여유", async () => {
    const env = setup({ KB120: state({}), KB121: state({}) });
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120", "KB121"] },
      { accountNo: "B", priority: 2, servers: ["KB120", "KB121"] },
    ]);
    env.conns.KB121!.mode = "timeout";
    const t0 = Date.now();
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    const elapsed = Date.now() - t0;

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "7" },
      { server: "KB121", outcome: "timeout" },
    ]);
    // 첫 실패에서 그 서버는 멈춘다(op 1 하나만 나갔다).
    expect(ops(env.conns.KB121!)).toEqual([1]);
    expect(ops(env.conns.KB120!)).toEqual([1, 3]);
    expect(elapsed).toBeLessThan(env.conns.KB121!.timeoutMs * 2 + 400);
  });

  it("D7 skipped(레지스트리에서 꺼짐) · offline(연결 없음 · 87 미수신)은 그 서버만", async () => {
    const rows = [row("KB120"), row("KB121"), row("KB122", false), row("KB123")];
    const env = setup({ KB120: state({}), KB121: state({}) }, rows);
    env.conns.KB121!.forgetSnapshot();
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121", "KB122", "KB123"] }]);

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "offline" },
      { server: "KB122", outcome: "skipped" },
      { server: "KB123", outcome: "offline" },
    ]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("D8 유저 삭제 — op 2 ok 서버(KB120)만 closeForDmaUser(serverKey) · BUSY 서버(KB121)는 세션 유지", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }, ["A"]) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

    await env.dispatcher.deleteUser("u1", "boss@gmail.com");
    expect(env.sessionCalls).toEqual([{ fn: "closeForDmaUser", dmaUserId: "u1", serverKey: "KB120" }]);
  });

  it("D8 유저 삭제 — 87 전용 계좌가 있어 op 4 만 간 서버는 유저가 남으므로 세션을 닫지 않는다", async () => {
    const env = setup({ KB120: state({ u1: [kb("A"), kb("X", 9)] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);

    await env.dispatcher.deleteUser("u1", "boss@gmail.com");
    expect(env.sessionCalls).toEqual([]);
  });

  it("D9 비밀번호 — 성공 뒤 updatePassword(u1, 새 값) 1회(열린 세션 유지) · 모든 서버 실패여도 호출 · 없는 DMA id 는 0회", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);

    await env.dispatcher.changePassword("u1", "n1-절대노출금지", "boss@gmail.com");
    expect(env.sessionCalls).toEqual([{ fn: "updatePassword", dmaUserId: "u1", password: "n1-절대노출금지" }]);

    env.conns.KB120!.mode = "offline";
    const results = await env.dispatcher.changePassword("u1", "n2-절대노출금지", "boss@gmail.com");
    expect(results.map((r) => r.outcome)).toEqual(["offline"]);
    expect(env.sessionCalls.at(-1)).toEqual({ fn: "updatePassword", dmaUserId: "u1", password: "n2-절대노출금지" });
    expect(env.sessionCalls).toHaveLength(2);

    await expect(env.dispatcher.changePassword("nope", "n3", "boss@gmail.com")).rejects.toMatchObject({ code: "NO_DMA_USER" });
    expect(env.sessionCalls).toHaveLength(2);
  });
});
