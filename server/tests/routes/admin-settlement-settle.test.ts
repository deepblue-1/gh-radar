import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import type {
  SettlementLedgerRow,
  SettlementPend,
  SettlementRaw,
  SettlementRawAccount,
  SettlementRawRead,
  SettlementSettleBody,
  SettlementSettleRow,
  SettlementSnapshotAccount,
} from "@gh-radar/shared";

import { createApp } from "../../src/app";
import type { RelayAdminClient, RelayAdminResponse } from "../../src/services/relay-admin-client";
import {
  ADMIN_EMAIL,
  ADMIN_TOKEN,
  TRADER_TOKEN,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
} from "../fixtures/admin-supabase";
import { makeFakeRelay, type FakeRelayCall, type FakeRelayHandler } from "../fixtures/fake-relay-admin";

/**
 * Phase 44 (44-08) — 정산 확정 · 취소(D-09 · D-15 · D-16 · D-17 · D-23 · D-26 · D-30 · Pitfall 5).
 *
 * 확정 숫자는 server 가 「누른 순간」 예수금으로 shared `settlePlan` 을 돌려 만든다 — 브라우저 숫자는 받지 않는다.
 * 돈 경로 순서: 검증 → 읽기 → (확정 불가 409) → 확정 · 취소 RPC → **RPC 가 성공했을 때만** relay 쓰기 → settlement_set_pend.
 *
 * 픽스처는 검산 시드 9건(admin-settlement.test.ts 와 같은 값) + 예수금 kbG 845,000,000 · kyH 684,000,000 ·
 * kyG 20,000,000 · kbH 372,000,000 → 현중 · 근형 묶음 정산 전 수익 1,049,000,000 · 쥬니 묶음 −28,000,000(이월).
 */

const COSTS_PATH = "/internal/admin/account-costs";
const BUDGET_RE = /^\/internal\/admin\/dma-users\/([^/]+)\/accounts\/([^/]+)\/([^/]+)\/budget$/;

const NO = { kbG: "88001", kyH: "77001", kyG: "77002", kbH: "88002" } as const;

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
  seeded: true,
  createdBy: null,
  createdAt: "2026-11-20T00:00:00.000Z",
  editedBy: null,
  editedAt: null,
  ...r,
});

const SEED: SettlementLedgerRow[] = [
  row(1, { txDate: "2025-12-31", kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 400_000_000 }),
  row(2, { txDate: "2025-12-31", kind: "contribute", who: "G", toAcc: "kbG", amountKrw: 400_000_000 }),
  row(3, { txDate: "2026-08-10", kind: "move", fromAcc: "kbG", toAcc: "kyH", via: "corp_service", amountKrw: 300_000_000 }),
  row(4, { txDate: "2026-09-10", kind: "contribute", who: "J", toAcc: "kbH", amountKrw: 100_000_000 }),
  row(5, { txDate: "2026-09-10", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000 }),
  row(6, { txDate: "2026-09-13", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000 }),
  row(7, { txDate: "2026-09-13", kind: "move", fromAcc: "kbG", toAcc: "kyH", via: "transfer", amountKrw: 400_000_000 }),
  row(8, { txDate: "2026-09-18", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000 }),
  row(9, { txDate: "2026-11-01", kind: "move", fromAcc: "kbG", toAcc: "kyG", via: "transfer", amountKrw: 20_000_000 }),
];

const link = (dmaUserId: string, serverKey: string) => [
  { dmaUserId, servers: [{ serverKey, state: "active" as const, isOrder: false }] },
];

const ACCOUNTS: SettlementRawAccount[] = [
  { accKey: "kbG", broker: "KB", accountNo: NO.kbG, name: "정근형", links: link("g01", "KB120") },
  { accKey: "kyH", broker: "KYOBO", accountNo: NO.kyH, name: "김현중", links: link("h01", "KYOBO119") },
  { accKey: "kyG", broker: "KYOBO", accountNo: NO.kyG, name: "정근형", links: link("g01", "KYOBO119") },
  { accKey: "kbH", broker: "KB", accountNo: NO.kbH, name: "김현중", links: link("h01", "KB120") },
];

const RAW = (
  o: {
    accounts?: SettlementRawAccount[];
    ledger?: SettlementLedgerRow[];
    settles?: SettlementSettleRow[];
    reads?: SettlementRawRead[];
  } = {},
): SettlementRaw => ({
  accounts: o.accounts ?? ACCOUNTS,
  registry: [
    { key: "KB120", broker: "KB", enabled: true, isOrderServer: true },
    { key: "KYOBO119", broker: "KYOBO", enabled: true, isOrderServer: true },
  ],
  reads: o.reads ?? [],
  ledger: o.ledger ?? SEED,
  settles: o.settles ?? [],
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
type BudgetHandler = (b: BudgetCall) => RelayAdminResponse<unknown> | undefined;

/** account-costs 는 costs(null 이면 읽기 실패 status 0) · 예수금 PUT 은 budget 핸들러(없으면 기본 ok). */
const relayOf = (o: { costs?: unknown | null; budget?: BudgetHandler } = {}) => {
  const handler: FakeRelayHandler = (c) => {
    if (c.path === COSTS_PATH) return o.costs === null ? { status: 0, data: null } : { status: 200, data: o.costs ?? costsOf() };
    const m = BUDGET_RE.exec(c.path);
    if (m && c.method === "PUT" && o.budget) {
      return o.budget({ dma: m[1]!, broker: m[2]!, accountNo: m[3]!, budgetKrw: (c.body as { budgetKrw: number }).budgetKrw });
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
type OutParam = {
  who: string;
  fromAcc: string;
  amountKrw: number;
  reflect: boolean;
  pend: SettlementPend;
};
type ConfirmParams = {
  p_pool: string;
  p_expect_prev: number | null;
  p_settle: {
    profitKrw: number;
    shares: Record<string, number>;
    snapshot: { accounts: SettlementSnapshotAccount[]; cumKrw: number; prevKrw: number };
    readAt: string;
    memo: string;
  };
  p_outs: OutParam[];
  p_by: string;
};
type SetPendParams = { p_pends: { id: number; pend: SettlementPend }[] };

const SETTLE_ID = 31;
const confirmOk: RpcHandler = (params) => {
  const p = params as ConfirmParams;
  return { data: { settleId: SETTLE_ID, rowIds: p.p_outs.map((_, i) => 201 + i) }, error: null };
};
const pgErr = (code: string, message: string): RpcHandler => () => ({ data: null, error: { code, message } });

function makeApp(
  opts: { raw?: SettlementRaw; confirm?: RpcHandler; cancel?: RpcHandler; setPend?: RpcHandler } = {},
  relayAdmin?: RelayAdminClient,
) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: baseAppUsers(),
    rpc: {
      admin_settlement_raw: () => ({ data: opts.raw ?? RAW(), error: null }),
      settlement_record_reads: () => ({ data: null, error: null }),
      settlement_settle_confirm: opts.confirm ?? confirmOk,
      settlement_settle_cancel: opts.cancel ?? (() => ({ data: { rows: [] }, error: null })),
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

const settleBody = (o: Partial<SettlementSettleBody> = {}): SettlementSettleBody => ({
  pool: "p1",
  outs: ["H"],
  memo: "",
  reflect: true,
  expectPrev: null,
  ...o,
});

const SETTLES = "/api/admin/settlement/settles";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /settlement/settles — 정산 확정
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/settlement/settles — 정산 확정", () => {
  it("검산 p1 · 김현중 바로 출금 · 반영 켬 → 그 순간 계산 · 반영 전 값 기록 · kyH 159,500,000 한 번 · set_pend {}", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ memo: "11월 정산" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: SETTLE_ID, pend: {} });

    // 순서 — 읽기 → 확정 → 보내기 → 남은 것 기록(읽은 값 기록 RPC 는 부르지 않는다)
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_settle_confirm", "settlement_set_pend"]);
    const [c] = paramsOf<ConfirmParams>(rec, "settlement_settle_confirm");
    expect(c!.p_pool).toBe("p1");
    expect(c!.p_expect_prev).toBeNull();
    expect(c!.p_by).toBe(ADMIN_EMAIL);
    expect(c!.p_settle.profitKrw).toBe(1_049_000_000);
    expect(c!.p_settle.shares).toEqual({ H: 524_500_000, G: 524_500_000 });
    expect(c!.p_settle.memo).toBe("11월 정산");
    expect(c!.p_settle.snapshot.cumKrw).toBe(1_049_000_000);
    expect(c!.p_settle.snapshot.prevKrw).toBe(0);
    // 그 묶음 계좌 3개 · 예수금은 바로 출금 반영 **전** 값(kyH 684,000,000)
    const accs = c!.p_settle.snapshot.accounts;
    expect(accs.map((a) => a.accKey)).toEqual(["kbG", "kyH", "kyG"]);
    expect(accs.map((a) => [a.budgetKrw, a.putKrw, a.inKrw, a.outKrw, a.profitKrw, a.stale])).toEqual([
      [845_000_000, -220_000_000, 800_000_000, 1_020_000_000, 1_065_000_000, false],
      [684_000_000, 700_000_000, 700_000_000, 0, -16_000_000, false],
      [20_000_000, 20_000_000, 20_000_000, 0, 0, false],
    ]);
    expect(typeof c!.p_settle.readAt).toBe("string");
    expect(accs.every((a) => a.readAt === c!.p_settle.readAt)).toBe(true);

    expect(c!.p_outs).toEqual([
      {
        who: "H",
        fromAcc: "kyH",
        amountKrw: 524_500_000,
        reflect: true,
        pend: { kyH: { deltaKrw: -524_500_000, targetKrw: 159_500_000, reason: "failed" } },
      },
    ]);

    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "h01", broker: "KYOBO", accountNo: NO.kyH, body: { budgetKrw: 159_500_000 } },
    ]);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 201, pend: {} }] }]);
  });

  it("바로 출금 없음(outs []) → p_outs [] · relay 쓰기 0 · set_pend 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ outs: [] }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: SETTLE_ID, pend: {} });
    expect(paramsOf<ConfirmParams>(rec, "settlement_settle_confirm")[0]!.p_outs).toEqual([]);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("반영 끔 → p_outs 의 reflect false · pend {} · relay 쓰기 0 · set_pend 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ reflect: false }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: SETTLE_ID, pend: {} });
    expect(paramsOf<ConfirmParams>(rec, "settlement_settle_confirm")[0]!.p_outs).toEqual([
      { who: "H", fromAcc: "kyH", amountKrw: 524_500_000, reflect: false, pend: {} },
    ]);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("4 : 3 : 3 kbH 500,000,005 · 세 사람 바로 출금 → 정산 수익 100,000,004 · 만원 미만 버림 · kbH 400,000,005 한 번", async () => {
    const relay = relayOf({ costs: costsOf({ kbH: 500_000_005 }) });
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ pool: "p2", outs: ["J", "H", "G"] }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: SETTLE_ID, pend: {} });

    const [c] = paramsOf<ConfirmParams>(rec, "settlement_settle_confirm");
    expect(c!.p_settle.profitKrw).toBe(100_000_004);
    expect(c!.p_settle.shares).toEqual({ J: 40_000_002, H: 30_000_001, G: 30_000_001 });
    expect(c!.p_settle.snapshot.accounts.map((a) => [a.accKey, a.budgetKrw])).toEqual([["kbH", 500_000_005]]);
    expect(c!.p_outs.map((o) => [o.who, o.fromAcc, o.amountKrw])).toEqual([
      ["J", "kbH", 40_000_000],
      ["H", "kbH", 30_000_000],
      ["G", "kbH", 30_000_000],
    ]);
    // 줄마다 자기 증감 + 합친 목표값
    expect(c!.p_outs.map((o) => o.pend)).toEqual([
      { kbH: { deltaKrw: -40_000_000, targetKrw: 400_000_005, reason: "failed" } },
      { kbH: { deltaKrw: -30_000_000, targetKrw: 400_000_005, reason: "failed" } },
      { kbH: { deltaKrw: -30_000_000, targetKrw: 400_000_005, reason: "failed" } },
    ]);
    // 같은 계좌 세 줄 → 합쳐 한 번
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "h01", broker: "KB", accountNo: NO.kbH, body: { budgetKrw: 400_000_005 } },
    ]);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([
      {
        p_pends: [
          { id: 201, pend: {} },
          { id: 202, pend: {} },
          { id: 203, pend: {} },
        ],
      },
    ]);
  });

  it("4 : 3 : 3 보내기 실패 → 줄마다 자기 증감 + 합친 목표값 · 응답 pend 는 계좌 합 · message", async () => {
    const relay = relayOf({ costs: costsOf({ kbH: 500_000_005 }), budget: () => outcome("failed") });
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ pool: "p2", outs: ["J", "H", "G"] }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      id: SETTLE_ID,
      pend: { kbH: { deltaKrw: -100_000_000, targetKrw: 400_000_005, reason: "failed" } },
      message: "KB 김현중 미반영 — 매매 서버에 보내지 못했어요",
    });
    expect(budgetCalls(relay.calls)).toHaveLength(1);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([
      {
        p_pends: [
          { id: 201, pend: { kbH: { deltaKrw: -40_000_000, targetKrw: 400_000_005, reason: "failed" } } },
          { id: 202, pend: { kbH: { deltaKrw: -30_000_000, targetKrw: 400_000_005, reason: "failed" } } },
          { id: 203, pend: { kbH: { deltaKrw: -30_000_000, targetKrw: 400_000_005, reason: "failed" } } },
        ],
      },
    ]);
  });

  it("앞 정산이 있으면 expectPrev 를 그대로 넘기고 이미 정산한 수익을 기록한다", async () => {
    const prev: SettlementSettleRow = {
      id: 7,
      pool: "p1",
      profitKrw: 49_000_000,
      shares: { H: 24_500_000, G: 24_500_000 },
      snapshot: { accounts: [], cumKrw: 49_000_000, prevKrw: 0 },
      readAt: "2026-11-01T06:00:00.000Z",
      memo: "",
      createdBy: ADMIN_EMAIL,
      createdAt: "2026-11-01T06:00:00.000Z",
    };
    const relay = relayOf();
    const { app, rec } = makeApp({ raw: RAW({ settles: [prev] }) }, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody({ expectPrev: 7 }));
    expect(res.status).toBe(200);
    const [c] = paramsOf<ConfirmParams>(rec, "settlement_settle_confirm");
    expect(c!.p_expect_prev).toBe(7);
    expect(c!.p_settle.profitKrw).toBe(1_000_000_000);
    expect(c!.p_settle.shares).toEqual({ H: 500_000_000, G: 500_000_000 });
    expect(c!.p_settle.snapshot.cumKrw).toBe(1_049_000_000);
    expect(c!.p_settle.snapshot.prevKrw).toBe(49_000_000);
    expect(budgetCalls(relay.calls)).toEqual([
      { dma: "h01", broker: "KYOBO", accountNo: NO.kyH, body: { budgetKrw: 184_000_000 } },
    ]);
  });

  describe("(규칙 4 · D-25) 확정할 수 없음 → 409 CANNOT_SETTLE · 확정 RPC 0 · relay 쓰기 0", () => {
    const cases: { name: string; costs?: unknown; raw?: SettlementRaw; pool: "p1" | "p2"; message: string }[] = [
      {
        name: "쥬니 손실 이월(p2 −28,000,000)",
        pool: "p2",
        message: "원금 4억까지 2,800만 남았습니다. 회복한 뒤부터 4 : 3 : 3 로 나눕니다.",
      },
      {
        name: "kyG 미설정(p1)",
        pool: "p1",
        costs: costsOf({ kyG: 0 }),
        message: "예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.",
      },
      {
        name: "p1 정산 전 수익 0(앞 정산이 전부 가져감)",
        pool: "p1",
        raw: RAW({
          settles: [
            {
              id: 7,
              pool: "p1",
              profitKrw: 1_049_000_000,
              shares: { H: 524_500_000, G: 524_500_000 },
              snapshot: { accounts: [], cumKrw: 1_049_000_000, prevKrw: 0 },
              readAt: "2026-11-19T06:00:00.000Z",
              memo: "",
              createdBy: ADMIN_EMAIL,
              createdAt: "2026-11-19T06:00:00.000Z",
            },
          ],
        }),
        message: "나눌 수익이 없습니다.",
      },
    ];
    for (const tc of cases) {
      it(tc.name, async () => {
        const relay = relayOf(tc.costs ? { costs: tc.costs } : {});
        const { app, rec } = makeApp(tc.raw ? { raw: tc.raw } : {}, relay.client);
        const res = await auth(request(app).post(SETTLES)).send(
          settleBody({ pool: tc.pool, outs: [], expectPrev: tc.raw ? 7 : null }),
        );
        expect(res.status).toBe(409);
        expect(res.body.error).toEqual({ code: "CANNOT_SETTLE", message: tc.message });
        expect(fns(rec)).toEqual(["admin_settlement_raw"]);
        expect(budgetCalls(relay.calls)).toHaveLength(0);
      });
    }
  });

  it("(D-16) relay 읽기 실패 · DB 마지막 값 → 확정됨 · 그 계좌 stale · readAt 그 시각 · 바로 출금 줄 pend unreachable", async () => {
    const reads: SettlementRawRead[] = [
      { accKey: "kbG", budgetKrw: 845_000_000, source: "live", serverKey: "KB120", readAt: "2026-11-19T10:58:00.000Z" },
      { accKey: "kyH", budgetKrw: 684_000_000, source: "live", serverKey: "KYOBO119", readAt: "2026-11-19T11:00:00.000Z" },
      { accKey: "kyG", budgetKrw: 20_000_000, source: "live", serverKey: "KYOBO119", readAt: "2026-11-19T10:59:00.000Z" },
    ];
    const relay = relayOf({ costs: null });
    const { app, rec } = makeApp({ raw: RAW({ reads }) }, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody());
    expect(res.status).toBe(200);
    const want = { kyH: { deltaKrw: -524_500_000, targetKrw: null, reason: "unreachable" } };
    expect(res.body).toEqual({
      ok: true,
      id: SETTLE_ID,
      pend: want,
      message: "교보 김현중 미반영 — 매매 서버에 보내지 못했어요",
    });
    const [c] = paramsOf<ConfirmParams>(rec, "settlement_settle_confirm");
    expect(c!.p_settle.profitKrw).toBe(1_049_000_000);
    expect(c!.p_settle.readAt).toBe("2026-11-19T11:00:00.000Z");
    expect(c!.p_settle.snapshot.accounts.map((a) => [a.accKey, a.stale, a.readAt])).toEqual([
      ["kbG", true, "2026-11-19T10:58:00.000Z"],
      ["kyH", true, "2026-11-19T11:00:00.000Z"],
      ["kyG", true, "2026-11-19T10:59:00.000Z"],
    ]);
    expect(c!.p_outs[0]!.pend).toEqual(want);
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(paramsOf<SetPendParams>(rec, "settlement_set_pend")).toEqual([{ p_pends: [{ id: 201, pend: want }] }]);
  });

  it("(Pitfall 5) 확정 RPC STALE_SETTLE → 409 · 문장 · relay 쓰기 0 · set_pend 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ confirm: pgErr("P0001", "STALE_SETTLE") }, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "STALE_SETTLE",
      message: "다른 곳에서 먼저 정산했어요 — 화면을 다시 불러와 주세요",
    });
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).not.toContain("settlement_set_pend");
  });

  it("확정 RPC 오류 → relay 쓰기 0 — 일반 오류(XX000)면 500 DB_ERROR · set_pend 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({ confirm: pgErr("XX000", "boom") }, relay.client);
    const res = await auth(request(app).post(SETTLES)).send(settleBody());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("DB_ERROR");
    expect(budgetCalls(relay.calls)).toHaveLength(0);
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_settle_confirm"]);
  });

  describe("바디 검증 → 400 · RPC 0 · relay 0", () => {
    const bad: [string, unknown][] = [
      ["p1 에 심쥬니 바로 출금", settleBody({ outs: ["J"] })],
      ["outs 중복", settleBody({ outs: ["H", "H"] })],
      ["memo 101자", settleBody({ memo: "가".repeat(101) })],
      ["모르는 키", { ...settleBody(), profitKrw: 1 }],
      ["expectPrev 0", settleBody({ expectPrev: 0 })],
      ["pool 모름", { ...settleBody(), pool: "p3" }],
    ];
    for (const [name, b] of bad) {
      it(name, async () => {
        const relay = relayOf();
        const { app, rec } = makeApp({}, relay.client);
        const res = await auth(request(app).post(SETTLES)).send(b as object);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_FAILED");
        expect(rec.rpcCalls).toHaveLength(0);
        expect(relay.calls).toHaveLength(0);
      });
    }
  });

  it("비관리자 → 403 · RPC 0 · relay 0", async () => {
    const relay = relayOf();
    const { app, rec } = makeApp({}, relay.client);
    const res = await request(app).post(SETTLES).set("Authorization", `Bearer ${TRADER_TOKEN}`).send(settleBody());
    expect(res.status).toBe(403);
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });
});
