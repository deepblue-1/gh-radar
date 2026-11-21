import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { Request } from "express";
import {
  buildSettlementAccounts,
  kstDateIso,
  type SettlementLedgerBody,
  type SettlementLedgerRow,
  type SettlementPend,
  type SettlementRaw,
  type SettlementRawAccount,
} from "@gh-radar/shared";

import { createApp } from "../../src/app";
import type { RelayAdminClient, RelayAdminResponse } from "../../src/services/relay-admin-client";
import { reflectRows, type SettlementRead } from "../../src/services/settlement-budget";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { makeFakeRelay, relayReject, type FakeRelayCall, type FakeRelayHandler } from "../fixtures/fake-relay-admin";

/**
 * Phase 44 (44-05) — 거래 쓰기 + 예수금 반영(D-10 · D-12 · D-13 · D-19 · D-20 · D-23 · D-26 · D-29 · D-30).
 *
 * 「절댓값만 쓸 수 있는 명령(op 6)으로 증감을 흉내 내는」 틈을 잠근다:
 *   Pitfall 1 — 새 값 1원 미만은 보내지 않음(below_one · op 6 의 0 = 해제)
 *   Pitfall 2 — 다시 반영은 지금 값 = 기록된 목표값이면 보내지 않음(두 번 더하지 않음)
 *   Pitfall 3 — 계좌 옮김 두 계좌는 병렬
 *   Pitfall 8 — 빈 fan-out(결과 0건)은 반영됨이 아니다
 * 돈 경로 순서: 검증 → (읽기) → 저장 RPC → **RPC 가 성공했을 때만** relay 쓰기 → settlement_set_pend.
 */

const COSTS_PATH = "/internal/admin/account-costs";
const BUDGET_RE = /^\/internal\/admin\/dma-users\/([^/]+)\/accounts\/([^/]+)\/([^/]+)\/budget$/;

type AccNo = "88001" | "77001" | "77002" | "88002";
const NO: Record<"kbG" | "kyH" | "kyG" | "kbH", AccNo> = { kbG: "88001", kyH: "77001", kyG: "77002", kbH: "88002" };

type RowIn = Pick<SettlementLedgerRow, "txDate" | "kind" | "amountKrw"> & Partial<SettlementLedgerRow>;
const row = (id: number, r: RowIn): SettlementLedgerRow => ({
  id,
  who: null,
  fromAcc: null,
  toAcc: null,
  via: null,
  memo: "",
  settleId: null,
  reflect: false,
  pend: {},
  seeded: false,
  createdBy: ADMIN_EMAIL,
  createdAt: "2026-11-20T00:00:00.000Z",
  editedBy: null,
  editedAt: null,
  ...r,
});

/** id 10 — 반영한 수익 출금(kbG 1억) · id 11 — 정산 때 만든 줄 · id 12 — 반영한 출자(H → kbG 1억) · id 13 — 반영 안 한 출자 · id 14 — 반영한 계좌 옮김(kyH 못 보냄). */
const LEDGER: SettlementLedgerRow[] = [
  row(1, { txDate: "2025-12-31", kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 400_000_000, seeded: true }),
  row(10, { txDate: "2026-11-18", kind: "withdraw_profit", who: "H", fromAcc: "kbG", amountKrw: 100_000_000, reflect: true }),
  row(11, { txDate: "2026-11-18", kind: "withdraw_profit", who: "G", fromAcc: "kbG", amountKrw: 50_000_000, settleId: 5, reflect: true }),
  row(12, { txDate: "2026-11-19", kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 100_000_000, reflect: true }),
  row(13, { txDate: "2026-11-19", kind: "contribute", who: "G", toAcc: "kbG", amountKrw: 100_000_000, reflect: false }),
  row(14, {
    txDate: "2026-11-19",
    kind: "move",
    fromAcc: "kbG",
    toAcc: "kyH",
    via: "transfer",
    amountKrw: 400_000_000,
    reflect: true,
    pend: { kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "failed" } },
  }),
];

const link = (dmaUserId: string, serverKey: string, state: "active" | "removing" = "active") => [
  { dmaUserId, servers: [{ serverKey, state, isOrder: false }] },
];

const ACCOUNTS: SettlementRawAccount[] = [
  { accKey: "kbG", broker: "KB", accountNo: NO.kbG, name: "정근형", links: link("g01", "KB120") },
  { accKey: "kyH", broker: "KYOBO", accountNo: NO.kyH, name: "김현중", links: link("h01", "KYOBO119") },
  { accKey: "kyG", broker: "KYOBO", accountNo: NO.kyG, name: "정근형", links: link("g01", "KYOBO119") },
  { accKey: "kbH", broker: "KB", accountNo: NO.kbH, name: "김현중", links: link("h01", "KB120") },
];

const RAW = (o: { accounts?: SettlementRawAccount[]; ledger?: SettlementLedgerRow[] } = {}): SettlementRaw => ({
  accounts: o.accounts ?? ACCOUNTS,
  registry: [
    { key: "KB120", broker: "KB", enabled: true, isOrderServer: true },
    { key: "KYOBO119", broker: "KYOBO", enabled: true, isOrderServer: true },
  ],
  reads: [],
  ledger: o.ledger ?? LEDGER,
  settles: [],
});

const costRow = (dmaUserId: string, accountNo: string, budgetKrw: number) => ({
  dmaUserId,
  accountNo,
  budgetKrw,
  feePpm: 150,
  sellTaxPpm: 2000,
  liveBudgetKrw: null,
});

type Budgets = { kbG: number; kyH: number; kyG: number; kbH: number };
const BUDGETS: Budgets = { kbG: 845_000_000, kyH: 684_000_000, kyG: 20_000_000, kbH: 372_000_000 };

const costsOf = (b: Partial<Budgets> = {}) => {
  const v = { ...BUDGETS, ...b };
  return {
    servers: {
      KB120: [costRow("g01", NO.kbG, v.kbG), costRow("h01", NO.kbH, v.kbH)],
      KYOBO119: [costRow("h01", NO.kyH, v.kyH), costRow("g01", NO.kyG, v.kyG)],
    },
  };
};

type BudgetCall = { dma: string; broker: string; accountNo: string; budgetKrw: number };
type BudgetHandler = (b: BudgetCall) => RelayAdminResponse<unknown> | undefined | Promise<RelayAdminResponse<unknown> | undefined>;

/** account-costs 는 costs(없으면 읽기 실패 status 0) · 예수금 PUT 은 budget 핸들러(없으면 기본 ok). */
const relayOf = (o: { costs?: unknown | null; budget?: BudgetHandler } = {}) => {
  const handler: FakeRelayHandler = (c) => {
    if (c.path === COSTS_PATH) return o.costs === null ? { status: 0, data: null } : { status: 200, data: o.costs ?? costsOf() };
    const m = BUDGET_RE.exec(c.path);
    if (m && c.method === "PUT" && o.budget) {
      return o.budget({
        dma: m[1]!,
        broker: m[2]!,
        accountNo: m[3]!,
        budgetKrw: (c.body as { budgetKrw: number }).budgetKrw,
      });
    }
    return undefined;
  };
  return makeFakeRelay(handler);
};

const budgetCalls = (calls: FakeRelayCall[]) =>
  calls
    .filter((c) => c.method === "PUT" && BUDGET_RE.test(c.path))
    .map((c) => {
      const m = BUDGET_RE.exec(c.path)!;
      return { dma: m[1], broker: m[2], accountNo: m[3], body: c.body };
    });

const outcome = (o: string) => ({ status: 200, data: { results: [{ server: "KB120", outcome: o }] } });

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];
type SaveParams = { p_id: number | null; p_row: Record<string, unknown> & { pend: SettlementPend }; p_by: string };
type SetPendParams = { p_pends: { id: number; pend: SettlementPend }[] };

const saveOk: RpcHandler = (params) => {
  const p = params as SaveParams;
  return { data: { ...p.p_row, id: p.p_id ?? 101 }, error: null };
};
const pgErr = (code: string, message: string): RpcHandler => () => ({ data: null, error: { code, message } });

function makeApp(
  opts: { raw?: SettlementRaw; save?: RpcHandler; del?: RpcHandler; setPend?: RpcHandler } = {},
  relayAdmin?: RelayAdminClient,
) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    rpc: {
      admin_settlement_raw: () => ({ data: opts.raw ?? RAW(), error: null }),
      settlement_record_reads: () => ({ data: null, error: null }),
      settlement_ledger_save: opts.save ?? saveOk,
      settlement_ledger_delete: opts.del ?? ((params) => ({ data: { id: (params as { p_id: number }).p_id }, error: null })),
      settlement_set_pend: opts.setPend ?? (() => ({ data: null, error: null })),
    },
  });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
const fns = (rec: { rpcCalls: { fn: string }[] }) => rec.rpcCalls.map((c) => c.fn);
const paramsOf = <T>(rec: { rpcCalls: { fn: string; params?: unknown }[] }, fn: string): T[] =>
  rec.rpcCalls.filter((c) => c.fn === fn).map((c) => c.params as T);

const TODAY = () => kstDateIso();
const TOMORROW = () => kstDateIso(new Date(Date.now() + 24 * 60 * 60 * 1000));

const body = (o: Partial<SettlementLedgerBody> = {}): SettlementLedgerBody => ({
  txDate: TODAY(),
  kind: "contribute",
  who: "H",
  fromAcc: null,
  toAcc: "kbG",
  via: null,
  amountKrw: 100_000_000,
  memo: "",
  reflect: true,
  ...o,
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /settlement/ledger — 거래 저장 + 예수금 반영
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/settlement/ledger — 거래 저장 · 예수금 반영", () => {
  it("반영 켬 출자 H → kbG 1억 → kbG 945,000,000 한 번 · 저장 pend 에 목표값 · set_pend {}", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 101, pend: {} });

    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 945_000_000 } },
    ]);
    expect(relay.calls.filter((c) => BUDGET_RE.test(c.path)).every((c) => c.adminEmail === ADMIN_EMAIL)).toBe(true);
    // 순서 — 읽기 → 저장 → 보내기 → 남은 것 기록
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_ledger_save", "settlement_set_pend"]);
    const [save] = paramsOf<SaveParams>(rec, "settlement_ledger_save");
    expect(save!.p_id).toBeNull();
    expect(save!.p_by).toBe(ADMIN_EMAIL);
    expect(save!.p_row).toMatchObject({ kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 100_000_000, reflect: true });
    expect(save!.p_row.pend).toEqual({ kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "failed" } });
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 101, pend: {} }] }]);
  });

  it("한 서버 결과 failed → pend failed · 목표값 그대로", async () => {
    const relay = relayOf({ budget: () => outcome("failed") });
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    const want = { kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "failed" } };
    expect(res.body.pend).toEqual(want);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 101, pend: want }] }]);
  });

  it("relay 업무 거부(409) → pend failed", async () => {
    const relay = relayOf({ budget: () => relayReject(409, "NO_SUCH_ACCOUNT") });
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(res.body.pend).toEqual({ kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "failed" } });
  });

  it("결과 timeout → pend timeout(모름 · 다시 반영이 목표값으로 대조)", async () => {
    const relay = relayOf({ budget: () => outcome("timeout") });
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(res.body.pend).toEqual({ kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "timeout" } });
  });

  it("(Pitfall 8) 빈 fan-out — relay 가 결과 0건으로 답함 → 반영됨이 아니다 · pend failed", async () => {
    const relay = relayOf({ budget: () => ({ status: 200, data: { results: [] } }) });
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(budgetCalls(relay.calls)).toHaveLength(1);
    const want = { kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "failed" } };
    expect(res.body.pend).toEqual(want);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 101, pend: want }] }]);
  });

  it("(Pitfall 1) 수익 출금 kbG 9억 · 지금 845,000,000 → 보내지 않음 · below_one · targetKrw null", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(
      body({ kind: "withdraw_profit", who: "H", fromAcc: "kbG", toAcc: null, amountKrw: 900_000_000 }),
    );
    expect(res.status).toBe(200);
    const want = { kbG: { deltaKrw: -900_000_000, targetKrw: null, reason: "below_one" } };
    expect(res.body.pend).toEqual(want);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(paramsOf<SaveParams>(rec, "settlement_ledger_save")[0]!.p_row.pend).toEqual(want);
  });

  it("relay 읽기 실패(status 0) → 보내지 않음 · unreachable · 저장은 됨(200)", async () => {
    const relay = relayOf({ costs: null });
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      id: 101,
      pend: { kbG: { deltaKrw: 100_000_000, targetKrw: null, reason: "unreachable" } },
    });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).toContain("settlement_ledger_save");
  });

  it("계좌 대응 없음(kyG 빠짐) → no_server · 보내지 않음", async () => {
    const relay = relayOf();
    const { app } = makeApp({ raw: RAW({ accounts: ACCOUNTS.filter((a) => a.accKey !== "kyG") }) }, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body({ toAcc: "kyG" }));
    expect(res.status).toBe(200);
    expect(res.body.pend).toEqual({ kyG: { deltaKrw: 100_000_000, targetKrw: null, reason: "no_server" } });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("active 등록 서버 있는 사용자 0(removing 만) → no_server · 보내지 않음", async () => {
    const relay = relayOf();
    const accounts = ACCOUNTS.map((a) => (a.accKey === "kbG" ? { ...a, links: link("g01", "KB120", "removing") } : a));
    const { app } = makeApp({ raw: RAW({ accounts }) }, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(200);
    expect(res.body.pend).toEqual({ kbG: { deltaKrw: 100_000_000, targetKrw: null, reason: "no_server" } });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(Pitfall 3) 계좌 옮김 kbG → kyH 4억 · 두 계좌 병렬 · KYOBO119 만 실패 → pend 에 kyH 만", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let arrived = 0;
    let release: () => void = () => {};
    const both = new Promise<void>((r) => {
      release = r;
    });
    // 상한 — 두 번째 호출이 오지 않으면(차례로 보냄) 500ms 뒤 풀어 테스트가 멈추지 않게 한다.
    const guard = setTimeout(() => release(), 500);
    const relay = relayOf({
      budget: async (b) => {
        inFlight += 1;
        arrived += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (arrived >= 2) release();
        await both;
        inFlight -= 1;
        return b.broker === "KYOBO"
          ? { status: 200, data: { results: [{ server: "KYOBO119", outcome: "failed" }] } }
          : undefined;
      },
    });
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(
      body({ kind: "move", who: null, fromAcc: "kbG", toAcc: "kyH", via: "transfer", amountKrw: 400_000_000 }),
    );
    clearTimeout(guard);
    expect(res.status).toBe(200);
    expect(maxInFlight).toBe(2);
    expect(budgetCalls(relay.calls).map((c) => [c.accountNo, c.body])).toEqual(
      expect.arrayContaining([
        [NO.kbG, { budgetKrw: 445_000_000 }],
        [NO.kyH, { budgetKrw: 1_084_000_000 }],
      ]),
    );
    expect(res.body.pend).toEqual({ kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "failed" } });
  });

  it("반영 끔 → 예수금 읽기 · 쓰기 0 · reflect false · pend {}", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body({ reflect: false }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 101, pend: {} });
    expect(relay.calls).toHaveLength(0);
    expect(fns(rec)).toEqual(["settlement_ledger_save"]);
    expect(paramsOf<SaveParams>(rec, "settlement_ledger_save")[0]!.p_row).toMatchObject({ reflect: false, pend: {} });
  });

  it("(D-13) 장중이어도 server 는 반영을 막지 않는다 — 시각과 무관하게 보낸다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T01:00:00.000Z")); // 금 KST 10:00
    try {
      const relay = relayOf();
      const { app } = makeApp({}, relay.client);
      const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body({ txDate: "2026-11-20" }));
      expect(res.status).toBe(200);
      expect(budgetCalls(relay.calls)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("POST 저장 RPC 오류 → relay 쓰기 0 · set_pend 0 · 500 DB_ERROR", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ save: pgErr("XX000", "boom") }, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("RPC 업무 오류 옮김 — FUTURE_DATE · PERSON_NOT_IN_POOL · 23514 → 400 · relay 쓰기 0", async () => {
    const cases: [RpcHandler, string][] = [
      [pgErr("P0001", "FUTURE_DATE"), "미래 날짜는 적을 수 없어요"],
      [pgErr("P0001", "PERSON_NOT_IN_POOL"), "심쥬니는 현중 · 근형 묶음 계좌에 출자 · 원금 회수를 적을 수 없어요"],
      [pgErr("23514", "check violation"), "거래 값이 규칙에 맞지 않아요"],
    ];
    for (const [save, message] of cases) {
      const relay = relayOf();
      const { app, rec } = makeApp({ save }, relay.client);
      const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body());
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(message);
      expect(budgetCalls(relay.calls)).toHaveLength(0);
      expect(fns(rec)).not.toContain("settlement_set_pend");
    }
  });
});

describe("POST /api/admin/settlement/ledger — 바디 검증(D-09 · D-12 · D-29) · RPC 0 · relay 0", () => {
  const bad: [string, Partial<SettlementLedgerBody> & Record<string, unknown>, string | null][] = [
    ["심쥬니 출자 → kbG(D-29)", { who: "J", toAcc: "kbG" }, "심쥬니"],
    ["심쥬니 원금 회수 ← kyH(D-29)", { kind: "withdraw_principal", who: "J", fromAcc: "kyH", toAcc: null }, "심쥬니"],
    ["내일 날짜(D-12)", { txDate: TOMORROW() }, "미래 날짜는 적을 수 없어요"],
    ["금액 15,000원(만원 배수 아님)", { amountKrw: 15_000 }, null],
    ["금액 0", { amountKrw: 0 }, null],
    ["계좌 옮김 보낸 = 받은", { kind: "move", who: null, fromAcc: "kbG", toAcc: "kbG", via: "transfer" }, null],
    ["출자인데 fromAcc 있음", { fromAcc: "kyH" }, null],
    ["계좌 옮김인데 via 없음", { kind: "move", who: null, fromAcc: "kbG", toAcc: "kyH", via: null }, null],
    ["메모 101자", { memo: "가".repeat(101) }, null],
    ["추가 키", { extra: 1 }, null],
  ];
  it.each(bad)("%s → 400", async (_name, patch, contains) => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send({ ...body(), ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    if (contains) expect(res.body.error.message).toContain(contains);
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("심쥬니 출자 → kbH(쥬니 묶음)는 통과", async () => {
    const relay = relayOf();
    const { app } = makeApp({}, relay.client);
    const res = await auth(request(app).post("/api/admin/settlement/ledger")).send(body({ who: "J", toAcc: "kbH" }));
    expect(res.status).toBe(200);
  });
});

describe("쓰기 경로 관문(D-18) — 비관리자 403 · RPC 0 · relay 0", () => {
  it("POST · PUT 비관리자 → 403", async () => {
    for (const send of [
      (app: Parameters<typeof request>[0]) => request(app).post("/api/admin/settlement/ledger"),
      (app: Parameters<typeof request>[0]) => request(app).put("/api/admin/settlement/ledger/10"),
    ]) {
      const relay = relayOf();
      const { app, rec } = makeApp({}, relay.client);
      const res = await send(app).set("Authorization", `Bearer ${TRADER_TOKEN}`).send(body());
      expect(res.status).toBe(403);
      expect(rec.rpcCalls).toHaveLength(0);
      expect(relay.calls).toHaveLength(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /settlement/ledger/:id — 고치기(D-19 · D-23)
// ─────────────────────────────────────────────────────────────────────────────

describe("PUT /api/admin/settlement/ledger/:id — 고치기", () => {
  const edit = (o: Partial<SettlementLedgerBody> = {}) =>
    body({ txDate: "2026-11-18", kind: "withdraw_profit", who: "H", fromAcc: "kbG", toAcc: null, amountKrw: 50_000_000, ...o });

  it("옛 줄 수익 출금 kbG 1억(반영함) → 새 5,000만 · 반영 켬 → 차이 +50,000,000 한 번만 보냄", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/10")).send(edit());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 10, pend: {} });
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 895_000_000 } },
    ]);
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_ledger_save", "settlement_set_pend"]);
    const [save] = paramsOf<SaveParams>(rec, "settlement_ledger_save");
    expect(save!.p_id).toBe(10);
    expect(save!.p_row).toMatchObject({ amountKrw: 50_000_000, reflect: true });
    expect(save!.p_row.pend).toEqual({ kbG: { deltaKrw: 50_000_000, targetKrw: 895_000_000, reason: "failed" } });
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 10, pend: {} }] }]);
  });

  it("반영 끔 → 예수금 그대로(읽기 · 쓰기 0) · reflect false · pend {}", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/10")).send(edit({ reflect: false }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 10, pend: {} });
    expect(relay.calls).toHaveLength(0);
    expect(fns(rec)).toEqual(["settlement_ledger_save"]);
    expect(paramsOf<SaveParams>(rec, "settlement_ledger_save")[0]).toMatchObject({
      p_id: 10,
      p_row: { reflect: false, pend: {} },
    });
  });

  // CR-01 — 「보냈는데 응답만 못 받은(timeout)」 반영. 출자 H → kbG 1억 · pend 에 목표값 945,000,000 이 남은 줄 15.
  const TIMEOUT_ROW = row(15, {
    txDate: "2026-11-19",
    kind: "contribute",
    who: "H",
    toAcc: "kbG",
    amountKrw: 100_000_000,
    reflect: true,
    pend: { kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "timeout" } },
  });
  const timeoutRaw = () => RAW({ ledger: [...LEDGER, TIMEOUT_ROW] });
  const editTimeout = (o: Partial<SettlementLedgerBody> = {}) =>
    body({ txDate: "2026-11-19", kind: "contribute", who: "H", fromAcc: null, toAcc: "kbG", amountKrw: 100_000_000, ...o });

  it("(CR-01) timeout 이 실제로 들어감(지금 kbG = 목표값) · 메모만 고침 → 다시 보내지 않음 · 저장 pend {}", async () => {
    const relay = relayOf({ costs: costsOf({ kbG: 945_000_000 }) });
    const { app, rec } = makeApp({ raw: timeoutRaw() }, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/15")).send(editTimeout({ memo: "메모만" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 15, pend: {} });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(paramsOf<SaveParams>(rec, "settlement_ledger_save")[0]!.p_row.pend).toEqual({});
  });

  it("(CR-01) timeout 이 실제로 들어감 · 금액 1억 → 1억 5,000만 → 차이 +5,000만만 보냄(995,000,000 · 두 번 들어가지 않음)", async () => {
    const relay = relayOf({ costs: costsOf({ kbG: 945_000_000 }) });
    const { app } = makeApp({ raw: timeoutRaw() }, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/15")).send(editTimeout({ amountKrw: 150_000_000 }));
    expect(res.status).toBe(200);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 995_000_000 } },
    ]);
  });

  it("(CR-01) timeout 이 안 들어감(지금 kbG 845,000,000 ≠ 목표값) · 메모만 고침 → 그 증감을 다시 보냄(945,000,000)", async () => {
    const relay = relayOf();
    const { app } = makeApp({ raw: timeoutRaw() }, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/15")).send(editTimeout({ memo: "메모만" }));
    expect(res.status).toBe(200);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 945_000_000 } },
    ]);
  });

  it("(CR-01) timeout 계좌를 지금 못 읽음 → 409 REFLECT_UNKNOWN · 저장 RPC 0 · relay 쓰기 0", async () => {
    const relay = relayOf({ costs: null });
    const { app, rec } = makeApp({ raw: timeoutRaw() }, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/15")).send(editTimeout({ memo: "메모만" }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "REFLECT_UNKNOWN",
      message: "KB 정근형 예수금을 읽지 못해 앞서 보낸 반영이 들어갔는지 알 수 없어요 — 예수금이 읽힌 뒤 다시 저장해 주세요",
    });
    expect(fns(rec)).not.toContain("settlement_ledger_save");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("PUT 저장 RPC 오류 → relay 쓰기 0 · set_pend 0 · 500 DB_ERROR", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ save: pgErr("XX000", "boom") }, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/10")).send(edit());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("정산 줄(settleId) → 409 SETTLE_LINKED · 저장 RPC 0 · relay 쓰기 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/11")).send(edit({ who: "G" }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "SETTLE_LINKED", message: "정산 때 만든 줄은 그 정산을 취소해야 사라져요" });
    expect(fns(rec)).not.toContain("settlement_ledger_save");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("없는 id(반영 켬) → 404 · 반영 끔이면 RPC NO_SUCH_ROW · SETTLE_LINKED 를 옮긴다", async () => {
    const relay = relayOf();
    const a = makeApp({}, relay.client);
    const r1 = await auth(request(a.app).put("/api/admin/settlement/ledger/999")).send(edit());
    expect(r1.status).toBe(404);
    expect(r1.body.error.message).toBe("없는 거래예요");
    expect(fns(a.rec)).not.toContain("settlement_ledger_save");

    const b = makeApp({ save: pgErr("P0001", "NO_SUCH_ROW") }, relay.client);
    const r2 = await auth(request(b.app).put("/api/admin/settlement/ledger/999")).send(edit({ reflect: false }));
    expect(r2.status).toBe(404);

    const c = makeApp({ save: pgErr("P0001", "SETTLE_LINKED") }, relay.client);
    const r3 = await auth(request(c.app).put("/api/admin/settlement/ledger/11")).send(edit({ reflect: false }));
    expect(r3.status).toBe(409);
    expect(r3.body.error.code).toBe("SETTLE_LINKED");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("경로 id 가 양의 정수가 아니면 → 400 · RPC 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).put("/api/admin/settlement/ledger/abc")).send(edit());
    expect(res.status).toBe(400);
    expect(rec.rpcCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reflectRows — 여러 줄을 계좌별로 합쳐 한 번 보낸다(44-08 정산 확정이 쓴다)
// ─────────────────────────────────────────────────────────────────────────────

describe("reflectRows — 같은 계좌 증감을 합쳐 한 번 · 못 보내면 줄마다 자기 증감", () => {
  const readOf = (): SettlementRead => {
    const raw = RAW();
    const nowIso = "2026-11-20T01:00:00.000Z";
    const { accounts, reads } = buildSettlementAccounts(raw, costsOf() as never, nowIso);
    return { raw, accounts, reads, nowIso };
  };
  const reqOf = (relayAdmin: RelayAdminClient) =>
    ({ app: { locals: { relayAdmin } }, adminEmail: ADMIN_EMAIL }) as unknown as Request;

  it("kbH 에서 −1억 · −2억 → kbH 한 번만(지금 − 3억 = 72,000,000) · 성공이면 두 줄 pend {}", async () => {
    const relay = relayOf();
    const out = await reflectRows(reqOf(relay.client), readOf(), [
      { id: 21, effect: { kbH: -100_000_000 } },
      { id: 22, effect: { kbH: -200_000_000 } },
    ]);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "h01", broker: "KB", accountNo: NO.kbH, body: { budgetKrw: 72_000_000 } },
    ]);
    expect(out.get(21)).toEqual({});
    expect(out.get(22)).toEqual({});
  });

  it("실패 → 두 줄 pend 의 deltaKrw 는 각자 · targetKrw 는 합친 목표값 하나", async () => {
    const relay = relayOf({ budget: () => outcome("failed") });
    const out = await reflectRows(reqOf(relay.client), readOf(), [
      { id: 21, effect: { kbH: -100_000_000 } },
      { id: 22, effect: { kbH: -200_000_000 } },
    ]);
    expect(budgetCalls(relay.calls)).toHaveLength(1);
    expect(out.get(21)).toEqual({ kbH: { deltaKrw: -100_000_000, targetKrw: 72_000_000, reason: "failed" } });
    expect(out.get(22)).toEqual({ kbH: { deltaKrw: -200_000_000, targetKrw: 72_000_000, reason: "failed" } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /settlement/ledger/:id — 지우기 + 되돌림(D-19 · D-23 · D-30)
// ─────────────────────────────────────────────────────────────────────────────

const UNREADABLE_KBG = "KB 정근형 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요";
const BELOW_KBG = "KB 정근형 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요";
const UNREVERTED_KBG = "KB 정근형 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요";

describe("DELETE /api/admin/settlement/ledger/:id — 지우기 · 되돌림", () => {
  const del = (app: Parameters<typeof request>[0], id: number | string, reflect = true) =>
    auth(request(app).delete(`/api/admin/settlement/ledger/${id}`)).send({ reflect });

  it("반영 켬 · 옛 줄 출자 H → kbG 1억 · kbG 읽힘 → 지우기 RPC 1회 → kbG 지금 − 1억 보냄 · unreverted []", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pend: {}, unreverted: [] });
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_ledger_delete"]);
    expect(paramsOf(rec, "settlement_ledger_delete")).toEqual([{ p_id: 12, p_by: ADMIN_EMAIL }]);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 745_000_000 } },
    ]);
  });

  it("계좌 옮김 kbG → kyH 4억 · kyH 는 못 보냈던 줄 → 되돌림은 kbG +4억 한 계좌만", async () => {
    const relay = relayOf();
    const { app } = makeApp({}, relay.client);
    const res = await del(app, 14);
    expect(res.status).toBe(200);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 1_245_000_000 } },
    ]);
  });

  it("(CR-01) 계좌 옮김 kyH 가 실제로 들어감(지금 kyH = 목표값 1,084,000,000) → 두 계좌 다 되돌림", async () => {
    const relay = relayOf({ costs: costsOf({ kyH: 1_084_000_000 }) });
    const { app } = makeApp({}, relay.client);
    const res = await del(app, 14);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pend: {}, unreverted: [] });
    expect(budgetCalls(relay.calls).map((c) => [c.accountNo, c.body])).toEqual(
      expect.arrayContaining([
        [NO.kbG, { budgetKrw: 1_245_000_000 }],
        [NO.kyH, { budgetKrw: 684_000_000 }],
      ]),
    );
    expect(budgetCalls(relay.calls)).toHaveLength(2);
  });

  it("(CR-01) timeout 출자 한 계좌만 걸린 줄이 실제로 들어감 → 되돌림 kbG − 1억 보냄(예수금에 남지 않음)", async () => {
    const ledger = [
      ...LEDGER,
      row(15, {
        txDate: "2026-11-19",
        kind: "contribute",
        who: "H",
        toAcc: "kbG",
        amountKrw: 100_000_000,
        reflect: true,
        pend: { kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: "timeout" } },
      }),
    ];
    const relay = relayOf({ costs: costsOf({ kbG: 945_000_000 }) });
    const { app, rec } = makeApp({ raw: RAW({ ledger }) }, relay.client);
    const res = await del(app, 15);
    expect(res.status).toBe(200);
    expect(fns(rec)).toContain("settlement_ledger_delete");
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 845_000_000 } },
    ]);
  });

  it("(CR-01) 보냈지만 지금 못 읽은 계좌(kyH)는 「들어갔을 수 있음」 → 409 REVERT_UNREADABLE · 지우기 RPC 0", async () => {
    const relay = relayOf({
      costs: { servers: { KB120: [costRow("g01", NO.kbG, BUDGETS.kbG), costRow("h01", NO.kbH, BUDGETS.kbH)] } },
    });
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 14);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "REVERT_UNREADABLE",
      message: "교보 김현중 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요",
    });
    expect(fns(rec)).not.toContain("settlement_ledger_delete");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(D-30) kbG 를 그 순간 못 읽음 → 409 REVERT_UNREADABLE · 지우기 RPC 0 · relay 쓰기 0 · 문장 그대로", async () => {
    const relay = relayOf({ costs: null });
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "REVERT_UNREADABLE", message: UNREADABLE_KBG });
    expect(fns(rec)).not.toContain("settlement_ledger_delete");
    expect(fns(rec)).not.toContain("settlement_set_pend");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(D-30) 계좌 대응 없음(kbG 빠짐) → 같은 문장 · 409 · 아무것도 바꾸지 않음", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ raw: RAW({ accounts: ACCOUNTS.filter((a) => a.accKey !== "kbG") }) }, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "REVERT_UNREADABLE", message: UNREADABLE_KBG });
    expect(fns(rec)).not.toContain("settlement_ledger_delete");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(D-30) 되돌린 값 < 1(출자 1억 · 지금 kbG 50,000,000) → 409 · 「0 이하가 되어」 문장 그대로", async () => {
    const relay = relayOf({ costs: costsOf({ kbG: 50_000_000 }) });
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "REVERT_UNREADABLE", message: BELOW_KBG });
    expect(fns(rec)).not.toContain("settlement_ledger_delete");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(D-30) 지운 뒤 보내기 실패 → 지우기는 됨 · 지운 줄 pend 기록 · unreverted [kbG] · message 그대로", async () => {
    const relay = relayOf({ budget: () => outcome("failed") });
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(200);
    const pend = { kbG: { deltaKrw: -100_000_000, targetKrw: 745_000_000, reason: "failed" } };
    expect(res.body).toEqual({ ok: true, pend, unreverted: ["kbG"], message: UNREVERTED_KBG });
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_ledger_delete", "settlement_set_pend"]);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 12, pend }] }]);
  });

  it("반영 끔 → relay 읽기 · 쓰기 0 · 지우기 RPC 1", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 12, false);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pend: {}, unreverted: [] });
    expect(relay.calls).toHaveLength(0);
    expect(fns(rec)).toEqual(["settlement_ledger_delete"]);
  });

  it("DELETE 지우기 RPC 오류 → relay 쓰기 0 · set_pend 0 · 500 DB_ERROR", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ del: pgErr("XX000", "boom") }, relay.client);
    const res = await del(app, 12);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("반영한 적 없는 줄(reflect false)을 반영 켬으로 지움 → 되돌릴 것 없음 · relay 쓰기 0 · 지우기 RPC 1", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await del(app, 13);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pend: {}, unreverted: [] });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec).filter((f) => f === "settlement_ledger_delete")).toHaveLength(1);
  });

  it("정산 줄 → 409 SETTLE_LINKED · 없는 id → 404 · 반영 끔이면 RPC 오류를 옮긴다", async () => {
    const relay = relayOf();
    const a = makeApp({}, relay.client);
    const r1 = await del(a.app, 11);
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("SETTLE_LINKED");
    const r2 = await del(a.app, 999);
    expect(r2.status).toBe(404);
    expect(r2.body.error.message).toBe("없는 거래예요");
    expect(fns(a.rec)).not.toContain("settlement_ledger_delete");

    const b = makeApp({ del: pgErr("P0001", "SETTLE_LINKED") }, relay.client);
    expect((await del(b.app, 11, false)).status).toBe(409);
    const c = makeApp({ del: pgErr("P0001", "NO_SUCH_ROW") }, relay.client);
    expect((await del(c.app, 999, false)).status).toBe(404);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("바디에 reflect 없음 → 400 · RPC 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).delete("/api/admin/settlement/ledger/12")).send({});
    expect(res.status).toBe(400);
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /settlement/ledger/:id/retry — 다시 반영(D-26 · Pitfall 2)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/settlement/ledger/:id/retry — 다시 반영(목표값 대조)", () => {
  const retry = (app: Parameters<typeof request>[0], id: number | string) =>
    auth(request(app).post(`/api/admin/settlement/ledger/${id}/retry`)).send({});

  it("지금 kyH = 기록된 목표값 1,084,000,000 → 보내지 않음(두 번 더하지 않음) · set_pend {}", async () => {
    const relay = relayOf({ costs: costsOf({ kyH: 1_084_000_000 }) });
    const { app, rec } = makeApp({}, relay.client);
    const res = await retry(app, 14);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 14, pend: {} });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 14, pend: {} }] }]);
  });

  it("지금 kyH 684,000,000 → 지금 + 4억 = 1,084,000,000 보냄 · pend {}", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await retry(app, 14);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 14, pend: {} });
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "h01", broker: "KYOBO", accountNo: NO.kyH, body: { budgetKrw: 1_084_000_000 } },
    ]);
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_set_pend"]);
  });

  it("다시 실패 → pend 그대로 + message 「교보 김현중 미반영 — 매매 서버에 보내지 못했어요」", async () => {
    const relay = relayOf({ budget: () => outcome("failed") });
    const { app, rec } = makeApp({}, relay.client);
    const res = await retry(app, 14);
    expect(res.status).toBe(200);
    const pend = { kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "failed" } };
    expect(res.body).toEqual({ ok: true, id: 14, pend, message: "교보 김현중 미반영 — 매매 서버에 보내지 못했어요" });
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 14, pend }] }]);
  });

  it("pend 없는 줄 → 200 · 아무것도 안 함(relay 쓰기 0 · set_pend 0)", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await retry(app, 12);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pend: {} });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("사유 unreachable(targetKrw null) → 지금 + delta 로 보냄", async () => {
    const relay = relayOf();
    const ledger = [
      ...LEDGER,
      row(15, {
        txDate: "2026-11-19",
        kind: "contribute",
        who: "H",
        toAcc: "kbG",
        amountKrw: 100_000_000,
        reflect: true,
        pend: { kbG: { deltaKrw: 100_000_000, targetKrw: null, reason: "unreachable" } },
      }),
    ];
    const { app } = makeApp({ raw: RAW({ ledger }) }, relay.client);
    const res = await retry(app, 15);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 15, pend: {} });
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "g01", broker: "KB", accountNo: NO.kbG, body: { budgetKrw: 945_000_000 } },
    ]);
  });

  it("1원 미만이 되는 다시 반영 → 보내지 않음 · message 「… 예수금이 0 이하가 되어 보내지 않았어요」", async () => {
    const relay = relayOf({ costs: costsOf({ kbG: 50_000_000 }) });
    const ledger = [
      ...LEDGER,
      row(16, {
        txDate: "2026-11-19",
        kind: "withdraw_profit",
        who: "G",
        fromAcc: "kbG",
        amountKrw: 100_000_000,
        reflect: true,
        pend: { kbG: { deltaKrw: -100_000_000, targetKrw: null, reason: "unreachable" } },
      }),
    ];
    const { app } = makeApp({ raw: RAW({ ledger }) }, relay.client);
    const res = await retry(app, 16);
    expect(res.status).toBe(200);
    expect(res.body.pend).toEqual({ kbG: { deltaKrw: -100_000_000, targetKrw: null, reason: "below_one" } });
    expect(res.body.message).toBe("KB 정근형 미반영 — 예수금이 0 이하가 되어 보내지 않았어요");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });

  it("(CR-01) 보냈지만 지금 못 읽음 → 보내지 않고 원래 항목(목표값 포함)을 그대로 남긴다", async () => {
    const relay = relayOf({ costs: null });
    const { app, rec } = makeApp({}, relay.client);
    const res = await retry(app, 14);
    expect(res.status).toBe(200);
    const pend = { kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "failed" } };
    expect(res.body.pend).toEqual(pend);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 14, pend }] }]);
  });

  it("없는 id → 404 · relay 쓰기 0", async () => {
    const relay = relayOf();
    const { app } = makeApp({}, relay.client);
    const res = await retry(app, 999);
    expect(res.status).toBe(404);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
  });
});

describe("지우기 · 다시 반영 관문(D-18) — 비관리자 403 · RPC 0 · relay 0", () => {
  it("DELETE · RETRY 비관리자 → 403", async () => {
    for (const send of [
      (app: Parameters<typeof request>[0]) => request(app).delete("/api/admin/settlement/ledger/12"),
      (app: Parameters<typeof request>[0]) => request(app).post("/api/admin/settlement/ledger/14/retry"),
    ]) {
      const relay = relayOf();
      const { app, rec } = makeApp({}, relay.client);
      const res = await send(app).set("Authorization", `Bearer ${TRADER_TOKEN}`).send({ reflect: true });
      expect(res.status).toBe(403);
      expect(rec.rpcCalls).toHaveLength(0);
      expect(relay.calls).toHaveLength(0);
    }
  });
});
