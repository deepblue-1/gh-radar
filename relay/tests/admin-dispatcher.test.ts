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
 *   D10 요청 마감(29-32 WR-07) — 마감에 진 서버는 timeout(ADMIN_DEADLINE_MESSAGE)으로 접어 먼저 응답 · 뒤 반영이 끝나면 실제
 *       결과로 record 2회째 · 마감 전 완료면 종전 그대로(record 1회) · 삭제가 마감에 걸리면 deleted false · 늦은 완료에도
 *       deleteDmaUser 0 · 같은 유저 줄은 실제 완료까지 유지(대기 시간도 마감에 포함)
 *   D12 꺼진 서버 skipped 사유(29-34 WR-04) — 레지스트리에서 꺼진 · 없는 등록 서버의 skipped 에 맥락별 문구(유저 삭제 ·
 *       그 밖 반영) · 다른 서버 결과 무변화 · 꺼진 서버에는 44 0건
 *   D13 「DB 등록만 지우고 삭제」(29-34 WR-04) — deleteUser({ skipDisabled }) 는 꺼진 서버에 44 를 보내지 않고 그 서버 의도 행만
 *       settle(전 행) · 켜진 서버 전부 ok + 꺼진 서버 settle 성공이면 deleted · 켜진 서버 실패(BUSY)면 deleted false(DMA 유저 행
 *       유지) · settle 실패면 그 서버는 삭제 사유 그대로 · deleted false
 *   D11 reconcile op 2 settle = 계획 때 removing 이던 행만(29-32 WR-01) — op 2 진행 중 다른 계좌에 그 서버가 active 로 체크돼도
 *       남고(settle 인자 userRemoved=false) · 줄 서 있던 다음 반영이 그 서버에 op 1 로 다시 올린다
 *   IPMAC-01 (Phase 30 R3-01 · D-15) op 1(계좌) · op 3 직전 op 5 재조회 — 캐시에 없는 relay 밖 IP/MAC 을 새 87 에서 되싣는다 ·
 *       계좌명만 바꾼 PUT 은 등록 서버마다 op 3(IPMAC-05) · 재조회 timeout/offline 이면 그 서버 44 0건(fail closed) · 비밀번호 ·
 *       제거 · 유저 삭제 · 무변경은 재조회 0회 · 새 87 이 의도와 같으면 44 0건 · override(원문)가 새 87 값보다 이긴다(D-07 · D-10) ·
 *       재조회 왕복도 요청 마감(29-32)에 들어 마감 접기 · 뒤 기록이 그대로 처리한다(Pitfall 9)
 *   P36 setAccountCost(Phase 36 · D-01 · D-04 · D-06 · D-07) — 그 계좌 active 등록 서버마다 op 6/7 1건(user_id 빈 값 · account_no ·
 *       값) · 결과 레지스트리 순 · 꺼진 서버 skipped(44 0) · 87 없음 offline · code 1 failed(원문) · timeout · 기록 0 · 의도 쓰기 0 ·
 *       없는 계좌 NO_SUCH_ACCOUNT · removing 서버 제외 · 마감 접기도 기록 0
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminCommandOutcome } from "../src/admin/admin-conn.js";
import * as dispatcherModule from "../src/admin/dispatcher.js";
import { AdminDispatcher, type AdminConnLike } from "../src/admin/dispatcher.js";
import { AdminIntentStore, IntentError } from "../src/admin/intent-store.js";
import { ADMIN_CODE, ADMIN_CODE_NAME, type AdminUsersSnapshot } from "../src/admin/types.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { decryptDmaPassword, encryptDmaPassword } from "../src/store/credentials.js";
import { AdminDbFake } from "./helpers/admin-db-fake.js";
import { defaultAdminHandler, type FakeAdminHandler, type FakeAdminState } from "./helpers/fake-gateway.js";

type CommandInput = Parameters<AdminConnLike["command"]>[0];

const PASSWORD = "stored-p@ss-절대노출금지";
/** 요청 마감(29-32 WR-07) — dispatcher 상수와 같은 값 · 같은 문구(아래 D10 이 상수 자체도 잠근다). */
const DEADLINE_MS = 10_000;
const DEADLINE_MESSAGE = "10초 안에 끝나지 않아 먼저 응답했어요 — 서버 반영은 계속돼요";
const KEY = randomBytes(32).toString("base64");
const BUSY_MESSAGE = "미체결 1건 등록 — 먼저 정리";
/** 꺼진 · 없는 등록 서버의 skipped 사유(29-34 WR-04) — dispatcher 상수와 같은 문구(D12 가 상수 자체도 잠근다). */
const SKIPPED_DELETE = "사용이 꺼진 서버 — 켜고 다시 삭제하거나, DB 등록만 지우고 삭제";
const SKIPPED_RECONCILE = "사용이 꺼진 서버 — 켜면 「다시 반영」 으로 맞춰요";
const SKIPPED_SETTLED = "사용이 꺼진 서버 — DB 등록만 지웠어요(켜면 「서버에만 있음」)";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Acc = {
  accountNo: string;
  name?: string;
  branchNo?: string;
  traderId?: string;
  priority?: number;
  /** 서버 계좌별 주문자 IP/MAC(gh-trade 인박스 261010) — 87 이 비어 있지 않을 때만 싣는다. */
  orderIp?: string;
  orderMac?: string;
};

function kb(accountNo: string, priority = 1): Required<Omit<Acc, "orderIp" | "orderMac">> {
  return { accountNo, name: "위탁", branchNo: "00001", traderId: "000001", priority };
}

/** op 1 · op 3 command 에 실리는 계좌 — 87 에 주문자 IP/MAC 이 없으면 빈 문자열(= 미설정 · GC-02 · 29-47). */
function wire<T extends object>(a: T): T & { orderIp: string; orderMac: string } {
  return { ...a, orderIp: "", orderMac: "" };
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
          // 87 파서와 같은 규칙 — 비어 있지 않은 값만 키로 둔다.
          ...(a.orderIp ? { orderIp: a.orderIp } : {}),
          ...(a.orderMac ? { orderMac: a.orderMac } : {}),
        })),
    })),
  };
}

/** admin 연결 대역 — 스텁 handler 로 86 · 87 을 만들고, 87 이 오면 캐시를 갈아 끼운다. */
class FakeConn implements AdminConnLike {
  readonly sent: CommandInput[] = [];
  mode: "normal" | "timeout" | "offline" = "normal";
  timeoutMs = 80;
  /** normal 모드 op 1개의 처리 지연(ms) — 느린 서버 흉내(29-32 마감 테스트 · 가짜 타이머). */
  delayMs = 0;
  /**
   * op 5(ListUsers) 재조회 횟수 · 결과 · 지연(Phase 30 IPMAC-01 · R3-01). op 5 는 `sent` 에 넣지 않고 `mode` · `delayMs` 도
   * 적용하지 않는다 — 기존 D1~D15 단언(`sent` · timeout · 마감)이 그대로 서게(30-RESEARCH Pitfall 3).
   */
  refreshes = 0;
  refreshMode: "normal" | "timeout" | "offline" = "normal";
  refreshDelayMs = 0;
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
    if (input.op === 5) {
      // 서버의 지금 users.toml(state)을 87 로 — relay 밖 변경(state 직접 수정)이 여기서 처음 캐시에 들어온다.
      this.refreshes += 1;
      if (this.refreshMode === "offline") return { kind: "offline" };
      if (this.refreshMode === "timeout") {
        await sleep(this.timeoutMs);
        return { kind: "timeout" };
      }
      if (this.refreshDelayMs > 0) await sleep(this.refreshDelayMs);
      this.#requestId += 1n;
      this.#snapshot = snapshotOf(this.state);
      return {
        kind: "result",
        result: { requestId: this.#requestId, ok: true, code: 0, message: "", usersRev: this.state.usersRev },
        snapshot: snapshotOf(this.state),
      };
    }
    this.sent.push(structuredClone(input));
    if (this.mode === "offline") return { kind: "offline" };
    if (this.mode === "timeout") {
      await sleep(this.timeoutMs);
      return { kind: "timeout" };
    }
    if (this.delayMs > 0) await sleep(this.delayMs);
    this.#requestId += 1n;
    const reply = this.#handler({
      requestId: this.#requestId,
      op: input.op,
      userId: input.userId,
      password: input.password ?? "",
      account: input.account ?? null,
      budgetKrw: input.budgetKrw ?? 0n,
      feePpm: input.feePpm ?? 0,
      sellTaxPpm: input.sellTaxPpm ?? 0,
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
    expect(env.conns.KB121!.sent).toEqual([{ op: 3, userId: "u1", account: wire(kb("B", 2)) }]);
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
    expect(env.conns.KB121!.sent).toEqual([{ op: 1, userId: "u1", password: PASSWORD, account: wire(kb("A")) }]);
    expect(env.conns.KB120!.sent).toEqual([{ op: 2, userId: "u1" }]);
    // 29-32 WR-01 — reconcile 의 op 2 settle 은 계획 때 removing 이던 행만(전 행 삭제는 유저 삭제 경로 전용).
    expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args)).toEqual([
      { p_dma_user_id: "u1", p_server_key: "KB120", p_removed_accounts: ["A"], p_user_removed: false },
    ]);
    expect(env.db.intentOf("u1").map((r) => `${r.accountNo}@${r.serverKey}:${r.state}`)).toEqual(["A@KB121:active"]);
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

  it("D14 GC-02(29-47) — 87 의 주문자 IP/MAC 을 op 3 command 에 되싣는다 · 서버 값이 남는다", async () => {
    const IP = "010041001124";
    const MAC = "1CFD087D978E";
    const env = setup({ KB120: state({ u1: [{ ...kb("A"), name: "옛 이름", orderIp: IP, orderMac: MAC }] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });

    expect(results).toEqual([{ server: "KB120", outcome: "ok", usersRev: "6" }]);
    expect(env.conns.KB120!.sent).toEqual([{ op: 3, userId: "u1", account: { ...kb("A"), orderIp: IP, orderMac: MAC } }]);
    const kept = env.conns.KB120!.state.users.get("u1")![0]!;
    expect([kept.name, kept.orderIp, kept.orderMac]).toEqual(["위탁", IP, MAC]);
  });

  it("D15 86 code 13 BAD_ORDER_ENDPOINT(gh-trade 인박스 261010) → failed · message 원문 · 로그 이름표 BAD_ORDER_ENDPOINT", async () => {
    const message = "주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다";
    const env = setup({ KB120: state({ u1: [{ ...kb("A"), name: "옛 이름" }] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    const conn = env.conns.KB120!;
    const original = conn.command.bind(conn);
    vi.spyOn(conn, "command").mockImplementation(async (input) => {
      // Phase 30 IPMAC-01 — op 3 직전 op 5 재조회는 대역 그대로(새 87). 86 code 13 은 op 3 에만.
      if (input.op === 5) return original(input);
      conn.sent.push(structuredClone(input));
      return { kind: "result", result: { requestId: 11n, ok: false, code: 13, message, usersRev: 5n } };
    });

    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });

    expect(ops(conn)).toEqual([3]);
    expect(results).toEqual([{ server: "KB120", outcome: "failed", code: 13, message, usersRev: "5" }]);
    // admin-conn 의 86 감사 로그 codeName 은 이 표를 읽는다.
    expect(ADMIN_CODE.BadOrderEndpoint).toBe(13);
    expect(ADMIN_CODE_NAME[13]).toBe("BAD_ORDER_ENDPOINT");
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
      { server: "KB122", outcome: "skipped", message: SKIPPED_RECONCILE },
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

  describe("D10 요청 마감 10초 (29-32 WR-07)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const recorded = (env: Env): unknown[] => env.db.callsTo("dma_admin_record_results").map((c) => c.args.p_results);

    it("상수 — ADMIN_REQUEST_DEADLINE_MS 10_000 · ADMIN_DEADLINE_MESSAGE 화면 문구", () => {
      expect(dispatcherModule.ADMIN_REQUEST_DEADLINE_MS).toBe(DEADLINE_MS);
      expect(dispatcherModule.ADMIN_DEADLINE_MESSAGE).toBe(DEADLINE_MESSAGE);
    });

    it("마감 접기 — KB120(op 7초 × 2)은 10초에 timeout 으로 접고 KB121 ok 로 먼저 응답 · 뒤 반영이 끝나면 실제 결과로 기록 2회째", async () => {
      const env = setup({ KB120: state({}), KB121: state({}) });
      seedU1(env, [
        { accountNo: "A", priority: 1, servers: ["KB120", "KB121"] },
        { accountNo: "B", priority: 2, servers: ["KB120"] },
      ]);
      env.conns.KB120!.delayMs = 7_000;

      let answered: unknown = null;
      void env.dispatcher
        .reconcileUser("u1", { adminEmail: "boss@gmail.com", deadlineAt: Date.now() + DEADLINE_MS })
        .then((r) => {
          answered = r;
        });

      await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);
      expect(answered).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(answered).toEqual([
        { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
        { server: "KB121", outcome: "ok", usersRev: "6" },
      ]);
      expect(recorded(env)).toEqual([
        [
          { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
          { server: "KB121", outcome: "ok" },
        ],
      ]);
      // 마감에 걸린 서버의 반영은 취소되지 않는다 — 두 번째 op(op 3 B)가 7초에 이미 나가 진행 중이다.
      expect(ops(env.conns.KB120!)).toEqual([1, 3]);

      await vi.advanceTimersByTimeAsync(4_000);
      expect(recorded(env)).toHaveLength(2);
      expect(recorded(env)[1]).toEqual([
        { server: "KB120", outcome: "ok" },
        { server: "KB121", outcome: "ok" },
      ]);
      expect(env.conns.KB120!.state.users.get("u1")?.map((a) => a.accountNo)).toEqual(["A", "B"]);
    });

    it("마감 전에 모두 끝나면 종전과 같은 결과 · record 1회(늦은 기록 없음)", async () => {
      const env = setup({ KB120: state({}), KB121: state({}) });
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
      env.conns.KB120!.delayMs = 3_000;

      const p = env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com", deadlineAt: Date.now() + DEADLINE_MS });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await p).toEqual([
        { server: "KB120", outcome: "ok", usersRev: "6" },
        { server: "KB121", outcome: "ok", usersRev: "6" },
      ]);
      await vi.advanceTimersByTimeAsync(DEADLINE_MS * 2);
      expect(recorded(env)).toHaveLength(1);
    });

    it("삭제 마감 → { deleted: false } 응답 · 뒤에서 전 서버 ok 로 끝나도 deleteDmaUser 0 · 다음 삭제 요청이 마저 처리", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
      env.conns.KB120!.delayMs = 12_000;

      let answered: unknown = null;
      void env.dispatcher.deleteUser("u1", "boss@gmail.com", { deadlineAt: Date.now() + DEADLINE_MS }).then((r) => {
        answered = r;
      });
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      expect(answered).toEqual({
        results: [
          { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
          { server: "KB121", outcome: "ok", usersRev: "6" },
        ],
        deleted: false,
      });

      // 뒤 반영 완료 — 두 서버 다 op 2 ok · settle 은 되지만 DB 유저 삭제는 부르지 않는다(응답은 이미 deleted false 였다).
      await vi.advanceTimersByTimeAsync(3_000);
      expect(recorded(env)).toHaveLength(2);
      expect(recorded(env)[1]).toEqual([
        { server: "KB120", outcome: "ok" },
        { server: "KB121", outcome: "ok" },
      ]);
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);
      expect(env.db.dmaUsers.has("u1")).toBe(true);
      expect(env.db.intentOf("u1")).toEqual([]);

      // 다음 삭제 요청 — 남은 등록 행이 없으니 44 0건 · DB 삭제로 마저 끝난다.
      const again = await env.dispatcher.deleteUser("u1", "boss@gmail.com", { deadlineAt: Date.now() + DEADLINE_MS });
      expect(again).toEqual({ results: [], deleted: true });
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toHaveLength(1);
    });

    it("같은 유저 줄 — 다음 요청은 앞 요청의 뒤 반영이 끝난 뒤에 op 를 보낸다 · 그 대기 시간도 다음 요청의 마감에 포함", async () => {
      const env = setup({ KB120: state({}), KB121: state({}) });
      seedU1(env, [
        { accountNo: "A", priority: 1, servers: ["KB120", "KB121"] },
        { accountNo: "B", priority: 2, servers: ["KB120"] },
      ]);
      env.conns.KB120!.delayMs = 7_000;

      let first: unknown = null;
      void env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com", deadlineAt: Date.now() + DEADLINE_MS }).then((r) => {
        first = r;
      });
      await vi.advanceTimersByTimeAsync(0); // 첫 요청이 의도를 읽고 op 를 보냈다
      expect(ops(env.conns.KB120!)).toEqual([1]);

      // 첫 요청 진행 중에 계좌 C 를 KB120 에 등록 → 두 번째 요청(같은 유저)은 줄을 선다.
      await env.store.putAccount("u1", { broker: "KB", ...kb("C", 3) }, ["KB120"]);
      let second: unknown = null;
      void env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com", deadlineAt: Date.now() + DEADLINE_MS }).then((r) => {
        second = r;
      });

      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      expect(first).toEqual([
        { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
        { server: "KB121", outcome: "ok", usersRev: "6" },
      ]);
      // 두 번째 요청은 마감까지 줄에서 기다렸다 — 아무 서버도 시작하지 못했으니 전부 timeout 으로 접는다.
      expect(second).toEqual([
        { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
        { server: "KB121", outcome: "timeout", message: DEADLINE_MESSAGE },
      ]);
      // 줄은 응답과 함께 풀리지 않는다 — 첫 요청의 뒤 반영(14초)이 끝나기 전에는 C 를 보내지 않는다.
      await vi.advanceTimersByTimeAsync(3_999);
      expect(env.conns.KB120!.sent.map((s) => s.account?.accountNo)).toEqual(["A", "B"]);
      await vi.advanceTimersByTimeAsync(1);
      expect(env.conns.KB120!.sent.map((s) => s.account?.accountNo)).toEqual(["A", "B", "C"]);

      // 두 번째 요청의 뒤 반영이 끝나면 실제 결과로 기록된다.
      await vi.advanceTimersByTimeAsync(7_000);
      expect(recorded(env).at(-1)).toEqual([
        { server: "KB120", outcome: "ok" },
        { server: "KB121", outcome: "ok" },
      ]);
    });
  });

  it("D11 (29-32 WR-01) op 2 진행 중 다른 계좌에 그 서버 active 체크 → settle 뒤에도 남음 · userRemoved=false · 다음 반영이 op 1 로 다시 올린다", async () => {
    vi.useFakeTimers();
    try {
      const env = setup({ KB120: state({ u1: [kb("A", 1), kb("B", 2)] }), KB121: state({ u1: [kb("A", 1)] }) });
      seedU1(env, [
        { accountNo: "A", priority: 1, servers: ["KB120", { key: "KB121", state: "removing" }] },
        { accountNo: "B", priority: 2, servers: ["KB120"] },
      ]);
      env.conns.KB121!.delayMs = 1_000;

      // ① 계좌 A 의 KB121 해제 반영 — KB121 active 0 · removing [A] → op 2 진행 중.
      const first = env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
      await vi.advanceTimersByTimeAsync(0);
      expect(ops(env.conns.KB121!)).toEqual([2]);

      // ② 그 사이 계좌 B 에 KB121 체크 — B/KB121 active 행이 바로 커밋되고 반영은 같은 유저 줄에 선다.
      await env.store.putAccount("u1", { broker: "KB", ...kb("B", 2) }, ["KB120", "KB121"]);
      const second = env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });

      // ③ op 2 ok → settle 은 계획 때 removing 이던 A/KB121 만 지운다 — B/KB121 active 는 남는다.
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await first).map((r) => r.outcome)).toEqual(["ok", "ok"]);
      expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args)).toEqual([
        { p_dma_user_id: "u1", p_server_key: "KB121", p_removed_accounts: ["A"], p_user_removed: false },
      ]);
      expect(env.db.intentOf("u1").map((r) => `${r.accountNo}@${r.serverKey}:${r.state}`)).toEqual([
        "A@KB120:active",
        "B@KB120:active",
        "B@KB121:active",
      ]);

      // ④ 줄 서 있던 반영 — KB121 에 유저가 없으니 op 1(B 계좌) 1건.
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await second).map((r) => r.outcome)).toEqual(["ok", "ok"]);
      expect(env.conns.KB121!.sent).toEqual([
        { op: 2, userId: "u1" },
        { op: 1, userId: "u1", password: PASSWORD, account: wire(kb("B", 2)) },
      ]);
      expect(env.conns.KB121!.state.users.get("u1")?.map((a) => a.accountNo)).toEqual(["B"]);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("D12 꺼진 서버 skipped 사유 (29-34 WR-04)", () => {
    it("상수 — 유저 삭제 · 그 밖 반영 사유 문구", () => {
      expect(dispatcherModule.SKIPPED_DISABLED_DELETE_MESSAGE).toBe(SKIPPED_DELETE);
      expect(dispatcherModule.SKIPPED_DISABLED_RECONCILE_MESSAGE).toBe(SKIPPED_RECONCILE);
    });

    it("다시 반영 — 꺼진 KB121 은 skipped + 「켜면 다시 반영」 사유 · 켜진 KB120 은 ok 그대로 · KB121 44 0건", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) }, [row("KB120"), row("KB121", false)]);
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

      const results = await env.dispatcher.reconcileUser("u1", { adminEmail: "boss@gmail.com" });
      expect(results).toEqual([
        { server: "KB120", outcome: "ok", usersRev: "5" },
        { server: "KB121", outcome: "skipped", message: SKIPPED_RECONCILE },
      ]);
      expect(env.conns.KB121!.sent).toEqual([]);
    });

    it("유저 삭제 — 꺼진 KB121 은 skipped + 「켜고 다시 삭제하거나, DB 등록만 지우고 삭제」 사유 · KB120 op 2 ok · deleted false", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) }, [row("KB120"), row("KB121", false)]);
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

      const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com");
      expect(out).toEqual({
        results: [
          { server: "KB120", outcome: "ok", usersRev: "6" },
          { server: "KB121", outcome: "skipped", message: SKIPPED_DELETE },
        ],
        deleted: false,
      });
      expect(env.conns.KB121!.sent).toEqual([]);
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);
      expect(env.db.intentOf("u1").map((r) => `${r.serverKey}:${r.state}`)).toEqual(["KB121:active"]);
    });
  });

  describe("D13 DB 등록만 지우고 삭제 — skipDisabled (29-34 WR-04)", () => {
    const disabledRows = (): DmaServerRow[] => [row("KB120"), row("KB121", false)];

    it("상수 — 꺼진 서버 settle 결과 문구", () => {
      expect(dispatcherModule.SKIPPED_SETTLED_MESSAGE).toBe(SKIPPED_SETTLED);
    });

    it("skipDisabled — 꺼진 KB121 44 0건 · settle(전 행) · 결과 skipped + settle 문구 · KB120 op 2 ok · deleteDmaUser 1회 · deleted true", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) }, disabledRows());
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

      const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com", { skipDisabled: true });
      expect(out).toEqual({
        results: [
          { server: "KB120", outcome: "ok", usersRev: "6" },
          { server: "KB121", outcome: "skipped", message: SKIPPED_SETTLED },
        ],
        deleted: true,
      });
      expect(ops(env.conns.KB120!)).toEqual([2]);
      expect(env.conns.KB121!.sent).toEqual([]);
      expect(
        env.db
          .callsTo("dma_admin_settle_server")
          .map((c) => c.args)
          .sort((a, b) => String(a.p_server_key).localeCompare(String(b.p_server_key))),
      ).toEqual([
        { p_dma_user_id: "u1", p_server_key: "KB120", p_removed_accounts: [], p_user_removed: true },
        { p_dma_user_id: "u1", p_server_key: "KB121", p_removed_accounts: [], p_user_removed: true },
      ]);
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toHaveLength(1);
      expect(env.db.dmaUsers.has("u1")).toBe(false);
      // 꺼진 서버의 실제 users.toml 은 그대로 — 켜지면 87 대조가 「서버에만 있음」 으로 보인다(D-23 ⑤ 표시만).
      expect(env.conns.KB121!.state.users.has("u1")).toBe(true);
    });

    it("skipDisabled 없음 — 종전(꺼진 서버 settle 0 · deleted false)", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) }, disabledRows());
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

      const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com");
      expect(out.deleted).toBe(false);
      expect(env.db.callsTo("dma_admin_settle_server").map((c) => c.args.p_server_key)).toEqual(["KB120"]);
      expect(env.db.intentOf("u1").map((r) => `${r.serverKey}:${r.state}`)).toEqual(["KB121:active"]);
    });

    it("skipDisabled 여도 켜진 KB120 이 BUSY 면 deleted false — KB121 의도는 settle 됐어도 DMA 유저 행은 남는다(다음 삭제가 KB120 만 다시)", async () => {
      const env = setup({ KB120: state({ u1: [kb("A")] }, ["A"]), KB121: state({ u1: [kb("A")] }) }, disabledRows());
      seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);

      const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com", { skipDisabled: true });
      expect(out).toEqual({
        results: [
          { server: "KB120", outcome: "failed", code: 9, message: BUSY_MESSAGE, usersRev: "5" },
          { server: "KB121", outcome: "skipped", message: SKIPPED_SETTLED },
        ],
        deleted: false,
      });
      expect(env.conns.KB121!.sent).toEqual([]);
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);
      expect(env.db.dmaUsers.has("u1")).toBe(true);
      expect(env.db.intentOf("u1").map((r) => `${r.serverKey}:${r.state}`)).toEqual(["KB120:active"]);
    });

    it("꺼진 서버 settle 실패 → 그 서버는 삭제 사유 그대로(skipped · 「켜고 다시 삭제하거나 …」) · deleted false · deleteDmaUser 0", async () => {
      const env = setup({ KB121: state({ u1: [kb("A")] }) }, disabledRows());
      seedU1(env, [{ accountNo: "A", servers: ["KB121"] }]);
      env.db.failNext.set("dma_admin_settle_server", { code: "08006", message: "connection failure", details: null, hint: null });

      const out = await env.dispatcher.deleteUser("u1", "boss@gmail.com", { skipDisabled: true });
      expect(out).toEqual({ results: [{ server: "KB121", outcome: "skipped", message: SKIPPED_DELETE }], deleted: false });
      expect(env.db.callsTo("dma_admin_delete_dma_user")).toEqual([]);
      expect(env.db.intentOf("u1").map((r) => `${r.serverKey}:${r.state}`)).toEqual(["KB121:active"]);
    });
  });
});

describe("IPMAC-01 R3-01 — op 1/3 직전 op 5 재조회 (D-15)", () => {
  /** relay 밖(gh-trade 도구)에서 서버에만 설정된 값 — 캐시(생성 때 87)에는 없다. */
  const OUT_IP = "010041001124";
  const OUT_MAC = "1CFD087D978E";
  const ADMIN_EMAIL = "boss@gmail.com";

  beforeEach(async () => {
    const { logger } = await import("../src/logger.js");
    for (const level of ["debug", "info", "warn", "error"] as const) vi.spyOn(logger, level).mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 서버 state 의 그 유저 계좌에만 값을 넣는다(캐시는 그대로 — relay 밖 변경 흉내). */
  function setOutside(conn: FakeConn, accountNo: string, orderIp: string, orderMac: string): void {
    const a = conn.state.users.get("u1")!.find((x) => x.accountNo === accountNo)!;
    a.orderIp = orderIp;
    a.orderMac = orderMac;
  }

  it("캐시에 없는 relay 밖 IP/MAC — 계좌명 변경 op 3 에 새 87 값이 실린다 · 재조회 1회", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    setOutside(env.conns.KB120!, "A", OUT_IP, OUT_MAC);
    expect(env.conns.KB120!.currentSnapshot()!.users.find((u) => u.userId === "u1")!.accounts[0]).not.toHaveProperty("orderIp");

    await env.store.putAccount("u1", { broker: "KB", ...kb("A"), name: "새 이름" }, ["KB120"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL });

    expect(results).toEqual([{ server: "KB120", outcome: "ok", usersRev: "6" }]);
    expect(env.conns.KB120!.refreshes).toBe(1);
    expect(env.conns.KB120!.sent).toEqual([
      { op: 3, userId: "u1", account: { ...kb("A"), name: "새 이름", orderIp: OUT_IP, orderMac: OUT_MAC } },
    ]);
    // 서버 값이 지워지지 않았다(R3-01 해제).
    const kept = env.conns.KB120!.state.users.get("u1")![0]!;
    expect([kept.name, kept.orderIp, kept.orderMac]).toEqual(["새 이름", OUT_IP, OUT_MAC]);
  });

  it("IPMAC-05 계좌명만 바꾼 PUT — active 등록 서버마다 op 3(새 name) · 각 서버 새 87 의 IP/MAC", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    setOutside(env.conns.KB120!, "A", OUT_IP, OUT_MAC);
    setOutside(env.conns.KB121!, "A", "010041001125", "1CFD087D978F");

    await env.store.putAccount("u1", { broker: "KB", ...kb("A"), name: "새 이름" }, ["KB120", "KB121"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL });

    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(env.conns.KB120!.sent).toEqual([
      { op: 3, userId: "u1", account: { ...kb("A"), name: "새 이름", orderIp: OUT_IP, orderMac: OUT_MAC } },
    ]);
    expect(env.conns.KB121!.sent).toEqual([
      { op: 3, userId: "u1", account: { ...kb("A"), name: "새 이름", orderIp: "010041001125", orderMac: "1CFD087D978F" } },
    ]);
    expect([env.conns.KB120!.refreshes, env.conns.KB121!.refreshes]).toEqual([1, 1]);
  });

  it("재조회 timeout → 그 서버 timeout · 44 0건(fail closed) · 다른 서버는 그대로 진행", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    setOutside(env.conns.KB120!, "A", OUT_IP, OUT_MAC);
    env.conns.KB120!.refreshMode = "timeout";

    await env.store.putAccount("u1", { broker: "KB", ...kb("A"), name: "새 이름" }, ["KB120", "KB121"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL });

    expect(results).toEqual([
      { server: "KB120", outcome: "timeout" },
      { server: "KB121", outcome: "ok", usersRev: "6" },
    ]);
    expect(env.conns.KB120!.refreshes).toBe(1);
    expect(env.conns.KB120!.sent).toHaveLength(0);
    // 서버의 relay 밖 값 · 옛 이름이 그대로다(캐시로 진행했다면 빈 IP/MAC 이 나가 지워졌다).
    const kept = env.conns.KB120!.state.users.get("u1")![0]!;
    expect([kept.name, kept.orderIp, kept.orderMac]).toEqual(["위탁", OUT_IP, OUT_MAC]);
  });

  it("재조회 offline → 그 서버 offline · 44 0건(fail closed)", async () => {
    const env = setup({ KB120: state({}) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    env.conns.KB120!.refreshMode = "offline";

    // 87 에 유저가 없다 → 캐시 계획 = op 1(계좌) → 재조회 대상.
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL });

    expect(results).toEqual([{ server: "KB120", outcome: "offline" }]);
    expect(env.conns.KB120!.refreshes).toBe(1);
    expect(env.conns.KB120!.sent).toHaveLength(0);
    expect(env.conns.KB120!.state.users.has("u1")).toBe(false);
  });

  it("op 1(계좌) · op 3 이 없는 경로는 재조회 0회 — 무변경 다시 반영 · 비밀번호 · 계좌 제거(op 4) · 유저 삭제(op 2)", async () => {
    const env = setup({ KB120: state({ u1: [kb("A", 1), kb("B", 2)] }) }, [row("KB120")]);
    seedU1(env, [
      { accountNo: "A", priority: 1, servers: ["KB120"] },
      { accountNo: "B", priority: 2, servers: ["KB120"] },
    ]);
    const conn = env.conns.KB120!;

    expect((await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL })).map((r) => r.outcome)).toEqual(["ok"]);
    expect([ops(conn), conn.refreshes]).toEqual([[], 0]);

    expect((await env.dispatcher.changePassword("u1", "새-p@ss", ADMIN_EMAIL)).map((r) => r.outcome)).toEqual(["ok"]);
    expect([ops(conn), conn.refreshes]).toEqual([[1], 0]);

    await env.store.markAccountRemoved("u1", "KB", "B");
    expect((await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL })).map((r) => r.outcome)).toEqual(["ok"]);
    expect([ops(conn), conn.refreshes]).toEqual([[1, 4], 0]);

    const del = await env.dispatcher.deleteUser("u1", ADMIN_EMAIL);
    expect(del.results.map((r) => r.outcome)).toEqual(["ok"]);
    expect([ops(conn), conn.refreshes]).toEqual([[1, 4, 2], 0]);
  });

  it("새 87 이 이미 의도와 같으면 재계획 결과 op 0 · ok · 44 0건 · usersRev = 새 87", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    // relay 밖에서 이미 같은 이름으로 바꿨다 — 캐시는 옛 이름이라 캐시 계획은 op 3 이다.
    const conn = env.conns.KB120!;
    conn.state.users.get("u1")![0]!.name = "새 이름";
    conn.state.usersRev = 9n;

    await env.store.putAccount("u1", { broker: "KB", ...kb("A"), name: "새 이름" }, ["KB120"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL });

    expect(results).toEqual([{ server: "KB120", outcome: "ok", usersRev: "9" }]);
    expect(conn.refreshes).toBe(1);
    expect(conn.sent).toHaveLength(0);
  });

  it("재조회 왕복도 요청 마감에 든다 — op 5 가 마감을 넘기면 timeout(마감 문구)으로 먼저 응답 · 뒤에서 op 3 까지 끝나 실제 결과 기록", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }) }, [row("KB120")]);
    seedU1(env, [{ accountNo: "A", servers: ["KB120"] }]);
    env.conns.KB120!.refreshDelayMs = 150;

    await env.store.putAccount("u1", { broker: "KB", ...kb("A"), name: "새 이름" }, ["KB120"]);
    const results = await env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN_EMAIL, deadlineAt: Date.now() + 30 });

    expect(results).toEqual([{ server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE }]);
    await vi.waitFor(() => expect(env.db.callsTo("dma_admin_record_results")).toHaveLength(2), { timeout: 2000 });
    expect(ops(env.conns.KB120!)).toEqual([3]);
    expect(env.conns.KB120!.state.users.get("u1")![0]!.name).toBe("새 이름");
  });

  it("override(orderEndpoint 원문)가 새 87 값보다 이긴다 — KB120 · KB121 둘 다 같은 원문(D-10 · D-07)", async () => {
    const env = setup({ KB120: state({ u1: [kb("A")] }), KB121: state({ u1: [kb("A")] }) });
    seedU1(env, [{ accountNo: "A", servers: ["KB120", "KB121"] }]);
    // 서버 값은 override 를 정규화해도 다른 값 — 정규화 멱등 비교(30-02)가 와도 op 3 이 나가야 한다.
    setOutside(env.conns.KB120!, "A", "010041001120", "1CFD087D9700");
    setOutside(env.conns.KB121!, "A", "010041001120", "1CFD087D9700");

    const results = await env.dispatcher.reconcileUser("u1", {
      adminEmail: ADMIN_EMAIL,
      orderEndpoint: { broker: "KB", accountNo: "A", orderIp: "10.41.1.124", orderMac: "1c:fd:08:7d:97:8e" },
    });

    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    for (const key of ["KB120", "KB121"]) {
      expect(env.conns[key]!.sent).toEqual([
        { op: 3, userId: "u1", account: { ...kb("A"), orderIp: "10.41.1.124", orderMac: "1c:fd:08:7d:97:8e" } },
      ]);
      expect(env.conns[key]!.refreshes).toBe(1);
    }
  });
});

describe("P36 setAccountCost op 6 · op 7 (D-01 · D-04 · D-06 · D-07)", () => {
  const ACC = "1234567801";
  const ADMIN = "boss@gmail.com";
  /** 계좌 비용 경로가 부를 수 있는 RPC — 의도 읽기만(기록 · 의도 쓰기 없음 · D-04). */
  const writes = (env: Env): string[] => env.db.calls.map((c) => c.name).filter((n) => n !== "dma_admin_intent");
  const budgetOf = (c: FakeConn): bigint | undefined => c.state.costs?.get(ACC)?.budgetKrw;

  beforeEach(async () => {
    const { logger } = await import("../src/logger.js");
    for (const level of ["debug", "info", "warn", "error"] as const) vi.spyOn(logger, level).mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupTwo(): Env {
    const env = setup({ KB120: state({ u1: [kb(ACC)] }), KB121: state({ u1: [kb(ACC)] }) });
    seedU1(env, [{ accountNo: ACC, servers: ["KB120", "KB121"] }]);
    return env;
  }

  it("① active 등록 KB120 · KB121 → 서버마다 op 6 1건(account_no · budgetKrw · userId 빈 값) · 결과 레지스트리 순 ok 2", async () => {
    const env = setupTwo();
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 10_000_000 }, { adminEmail: ADMIN });

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "ok", usersRev: "6" },
    ]);
    for (const key of ["KB120", "KB121"]) {
      expect(env.conns[key]!.sent).toEqual([
        { op: 6, userId: "", account: { accountNo: ACC, name: "", branchNo: "", traderId: "", priority: 0 }, budgetKrw: 10_000_000n },
      ]);
      expect(budgetOf(env.conns[key]!)).toBe(10_000_000n);
      // planner 경로가 아니다 — op 5 재조회 없음.
      expect(env.conns[key]!.refreshes).toBe(0);
    }
  });

  it("① 계좌번호는 정규화로 대조한다(경로 \" 001234567801\" 도 같은 계좌) · 같은 값 재전송 = 「변경 없음」 ok · rev 불변", async () => {
    const env = setupTwo();
    await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 5_000_000 }, { adminEmail: ADMIN });
    const again = await env.dispatcher.setAccountCost(
      "u1",
      { broker: "KB", accountNo: ` 00${ACC}` },
      { op: 6, budgetKrw: 5_000_000 },
      { adminEmail: ADMIN },
    );
    expect(again).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "ok", usersRev: "6" },
    ]);
  });

  it("② 꺼진 서버 → skipped(사유 문구) · 그 서버 command 0회 · 켜진 서버는 ok", async () => {
    const env = setup({ KB120: state({ u1: [kb(ACC)] }), KB121: state({ u1: [kb(ACC)] }) }, [row("KB120"), row("KB121", false)]);
    seedU1(env, [{ accountNo: ACC, servers: ["KB120", "KB121"] }]);
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "skipped", message: SKIPPED_RECONCILE },
    ]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("③ 87 미수신 → offline · 44 0건 · 다른 서버 무영향", async () => {
    const env = setupTwo();
    env.conns.KB121!.forgetSnapshot();
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "offline" },
    ]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("④ 구 서버 code 1(BAD_OP) → failed · code 1 · message 원문 그대로(문장 대조 없음)", async () => {
    const env = setupTwo();
    env.conns.KB121!.state.legacyCostOps = true;
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });

    expect(results).toEqual([
      { server: "KB120", outcome: "ok", usersRev: "6" },
      { server: "KB121", outcome: "failed", code: ADMIN_CODE.BadOp, message: "알 수 없는 명령입니다", usersRev: "5" },
    ]);
  });

  it("④ code 8(이 서버에 없는 계좌) → failed · 원문", async () => {
    const env = setupTwo();
    env.conns.KB121!.state.users.set("u1", [kb("9999999999")]);
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });
    expect(results[1]).toEqual({ server: "KB121", outcome: "failed", code: ADMIN_CODE.NoSuchAccount, message: "이 서버에 없는 계좌", usersRev: "5" });
  });

  it("⑤ 무응답 → timeout(그 서버만)", async () => {
    const env = setupTwo();
    env.conns.KB120!.mode = "timeout";
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });
    expect(results).toEqual([
      { server: "KB120", outcome: "timeout" },
      { server: "KB121", outcome: "ok", usersRev: "6" },
    ]);
  });

  it("⑥ 결과 기록(dma_admin_record_results) 0회 · 의도 쓰기 0회 — 의도 읽기만", async () => {
    const env = setupTwo();
    env.conns.KB121!.state.legacyCostOps = true;
    const before = env.db.intentOf("u1");
    await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 7 }, { adminEmail: ADMIN });

    expect(env.db.callsTo("dma_admin_record_results")).toEqual([]);
    expect(writes(env)).toEqual([]);
    expect(env.db.callsTo("dma_admin_intent")).toHaveLength(1);
    expect(env.db.intentOf("u1")).toEqual(before);
  });

  it("⑦ 의도에 없는 계좌 · 다른 증권사 → IntentError NO_SUCH_ACCOUNT · 44 0건", async () => {
    const env = setupTwo();
    for (const target of [
      { broker: "KB" as const, accountNo: "5555555555" },
      { broker: "KYOBO" as const, accountNo: ACC },
    ]) {
      const err = await env.dispatcher.setAccountCost("u1", target, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(IntentError);
      expect((err as IntentError).code).toBe("NO_SUCH_ACCOUNT");
    }
    expect(env.conns.KB120!.sent).toEqual([]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("⑧ removing 행 서버는 대상이 아니다 — active 서버에만 op 6", async () => {
    const env = setup({ KB120: state({ u1: [kb(ACC)] }), KB121: state({ u1: [kb(ACC)] }) });
    seedU1(env, [{ accountNo: ACC, servers: ["KB120", { key: "KB121", state: "removing" }] }]);
    const results = await env.dispatcher.setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN });

    expect(results).toEqual([{ server: "KB120", outcome: "ok", usersRev: "6" }]);
    expect(env.conns.KB121!.sent).toEqual([]);
  });

  it("⑧ 전부 removing 이면 NO_SUCH_ACCOUNT", async () => {
    const env = setupTwo();
    env.db.seedUser({ dmaUserId: "u2", passwordEnc: "x", accounts: [{ accountNo: ACC, servers: [{ key: "KB120", state: "removing" }] }] });
    const err = await env.dispatcher.setAccountCost("u2", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 1 }, { adminEmail: ADMIN }).catch((e: unknown) => e);
    expect((err as IntentError).code).toBe("NO_SUCH_ACCOUNT");
  });

  describe("⑨ 마감 접기 (29-32 WR-07 재사용)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("마감 접기 — KB120(12초)은 timeout 으로 접어 먼저 응답 · 접을 때도 · 뒤 완료 때도 기록 0회", async () => {
      const env = setupTwo();
      env.conns.KB120!.delayMs = 12_000;

      let answered: unknown = null;
      void env.dispatcher
        .setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 3 }, { adminEmail: ADMIN, deadlineAt: Date.now() + DEADLINE_MS })
        .then((r) => {
          answered = r;
        });

      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      expect(answered).toEqual([
        { server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE },
        { server: "KB121", outcome: "ok", usersRev: "6" },
      ]);
      expect(env.db.callsTo("dma_admin_record_results")).toEqual([]);

      await vi.advanceTimersByTimeAsync(5_000);
      // 반영은 취소되지 않고 끝났다 — 그래도 기록 없음.
      expect(budgetOf(env.conns.KB120!)).toBe(3n);
      expect(env.db.callsTo("dma_admin_record_results")).toEqual([]);
      expect(writes(env)).toEqual([]);
    });

    it("같은 DMA 유저 줄(#serial) — 앞 계좌 PUT 반영이 끝난 뒤에 op 6 이 나간다 · 줄에서 마감을 맞으면 그 계좌 서버만 접는다", async () => {
      const env = setup({ KB120: state({}), KB121: state({}) });
      seedU1(env, [
        { accountNo: ACC, priority: 1, servers: ["KB120"] },
        { accountNo: "B", priority: 2, servers: ["KB120", "KB121"] },
      ]);
      env.conns.KB120!.delayMs = 6_000;

      void env.dispatcher.reconcileUser("u1", { adminEmail: ADMIN });
      let answered: unknown = null;
      void env.dispatcher
        .setAccountCost("u1", { broker: "KB", accountNo: ACC }, { op: 6, budgetKrw: 3 }, { adminEmail: ADMIN, deadlineAt: Date.now() + DEADLINE_MS })
        .then((r) => {
          answered = r;
        });

      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      // reconcile(op 1 · op 3 = 12초)이 줄을 쥐고 있다 — op 6 은 아직 안 나갔고, 접힌 응답은 그 계좌 서버(KB120)뿐.
      expect(answered).toEqual([{ server: "KB120", outcome: "timeout", message: DEADLINE_MESSAGE }]);
      expect(ops(env.conns.KB120!)).toEqual([1, 3]);
      const recordsBefore = env.db.callsTo("dma_admin_record_results").length;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(ops(env.conns.KB120!)).toEqual([1, 3, 6]);
      // 기록은 reconcile 몫(완료 때 1회)뿐 — op 6 은 접을 때도 끝날 때도 기록하지 않는다.
      expect(recordsBefore).toBe(0);
      expect(env.db.callsTo("dma_admin_record_results")).toHaveLength(1);
    });
  });

  it("op 7 — 두 서버에 op 7 1건씩(feePpm · sellTaxPpm 두 값) · 결과 ok", async () => {
    const env = setupTwo();
    const results = await env.dispatcher.setAccountCost(
      "u1",
      { broker: "KB", accountNo: ACC },
      { op: 7, feePpm: 150, sellTaxPpm: 2000 },
      { adminEmail: ADMIN },
    );
    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    for (const key of ["KB120", "KB121"]) {
      expect(env.conns[key]!.sent).toEqual([
        { op: 7, userId: "", account: { accountNo: ACC, name: "", branchNo: "", traderId: "", priority: 0 }, feePpm: 150, sellTaxPpm: 2000 },
      ]);
      expect(env.conns[key]!.state.costs?.get(ACC)).toEqual({ budgetKrw: 0n, feePpm: 150, sellTaxPpm: 2000 });
    }
    expect(env.db.callsTo("dma_admin_record_results")).toEqual([]);
  });
});
