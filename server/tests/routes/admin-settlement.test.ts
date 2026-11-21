import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  poolAccountRows,
  type SettlementLedgerRow,
  type SettlementRaw,
  type SettlementRawRead,
  type SettlementView,
} from "@gh-radar/shared";

import { createApp } from "../../src/app";
import { logger } from "../../src/logger";
import type { RelayAdminClient } from "../../src/services/relay-admin-client";
import {
  ADMIN_TOKEN,
  TRADER_TOKEN,
  appUsersWithTraderMenus,
  baseAppUsers,
  baseUsers,
  makeAdminSupabase,
  type AdminSupabaseOpts,
  type AppUserRow,
} from "../fixtures/admin-supabase";
import { makeFakeRelay, type FakeRelayHandler } from "../fixtures/fake-relay-admin";

/**
 * Phase 44 — `GET /api/admin/settlement`(트레이서 server 조각). 표 · RPC 의 키 집합은 pgTAP(settlement.test.sql)이 진짜
 * DB 에서 잠그고, 여기는 관문(D-18) · 예수금 판정 연결(D-03) · 마지막 읽은 값(D-04) · 기록 실패 비치명 · 응답 → shared
 * `poolAccountRows` 검산(D-01)을 증명한다.
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | ① 비관리자 | TRADER_TOKEN | 403 · RPC 0 · relay 0 |
 * | ② 관리자 | relay 4계좌 값 | 200 · 4개 known · 역할 조회 1 · 기록 1회(4건 · readAt = now) · 검산 수익 |
 * | ③ relay 실패 | status 0 · DB 에 kyH 마지막 값 | kyH stale · 나머지 unset · 기록 0회 |
 * | ④ 예수금 0 | kyG 0 | kyG unset · 기록에는 0 |
 * | ⑤ RPC 오류 | admin_settlement_raw error | 500 DB_ERROR |
 * | ⑥ 기록 실패 | settlement_record_reads error | 200 · ② 와 같은 본문 · 경고 1회 |
 */

const COSTS_PATH = "/internal/admin/account-costs";

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

const RAW = (reads: SettlementRawRead[] = []): SettlementRaw => ({
  accounts: [
    { accKey: "kbG", broker: "KB", accountNo: "88001", name: "정근형", links: link("g01", "KB120") },
    { accKey: "kyH", broker: "KYOBO", accountNo: "77001", name: "김현중", links: link("h01", "KYOBO119") },
    { accKey: "kyG", broker: "KYOBO", accountNo: "77002", name: "정근형", links: link("g01", "KYOBO119") },
    { accKey: "kbH", broker: "KB", accountNo: "88002", name: "김현중", links: link("h01", "KB120") },
  ],
  registry: [
    { key: "KB120", broker: "KB", enabled: true, isOrderServer: true },
    { key: "KYOBO119", broker: "KYOBO", enabled: true, isOrderServer: true },
  ],
  reads,
  ledger: SEED,
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

const costsOf = (kyG = 20_000_000) => ({
  servers: {
    KB120: [costRow("g01", "88001", 845_000_000), costRow("h01", "88002", 372_000_000)],
    KYOBO119: [costRow("h01", "77001", 684_000_000), costRow("g01", "77002", kyG)],
  },
});

const relayWith = (costs: unknown): FakeRelayHandler => (c) =>
  c.path === COSTS_PATH ? { status: 200, data: costs } : undefined;

type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];

function makeApp(
  opts: { raw?: RpcHandler; record?: RpcHandler; appUsers?: AppUserRow[] } = {},
  relayAdmin?: RelayAdminClient,
) {
  const sb = makeAdminSupabase({
    users: baseUsers,
    appUsers: opts.appUsers ?? baseAppUsers(),
    rpc: {
      admin_settlement_raw: opts.raw ?? (() => ({ data: RAW(), error: null })),
      settlement_record_reads: opts.record ?? (() => ({ data: null, error: null })),
    },
  });
  const app = createApp({ supabase: sb.client, relayAdmin });
  return { app, ...sb };
}

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
const fns = (rec: { rpcCalls: { fn: string }[] }) => rec.rpcCalls.map((c) => c.fn);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/settlement", () => {
  it("① 비관리자 → 403 · RPC 0 · relay 0", async () => {
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app, rec } = makeApp({}, relay.client);
    const res = await request(app).get("/api/admin/settlement").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("①-b (quick 261121-n1b) 정산이 열린 trader → 200 · 역할 조회 1", async () => {
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app, rec } = makeApp({ appUsers: appUsersWithTraderMenus(["settlement"]) }, relay.client);
    const res = await request(app).get("/api/admin/settlement").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(res.status).toBe(200);
    expect((res.body as SettlementView).accounts).toHaveLength(4);
    expect(rec.ops.filter((o) => o.table === "app_users" && o.kind === "select")).toHaveLength(1);
  });

  it("①-c (quick 261121-n1b) 매매손익만 열린 trader → 403 · RPC 0 · relay 0", async () => {
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app, rec } = makeApp({ appUsers: appUsersWithTraderMenus(["pnl"]) }, relay.client);
    const res = await request(app).get("/api/admin/settlement").set("Authorization", `Bearer ${TRADER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(rec.rpcCalls).toHaveLength(0);
    expect(relay.calls).toHaveLength(0);
  });

  it("미인증 → 401", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/admin/settlement");
    expect(res.status).toBe(401);
  });

  it("② 관리자 → 200 · 계좌 4개 known · 역할 조회 1 · 읽은 값 기록 1회 · 응답이 검산 수익을 만든다", async () => {
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const body = res.body as SettlementView;
    expect(body.accounts.map((a) => a.accKey)).toEqual(["kbG", "kyH", "kyG", "kbH"]);
    expect(body.accounts.map((a) => a.budgetKrw)).toEqual([845_000_000, 684_000_000, 20_000_000, 372_000_000]);
    expect(body.accounts.every((a) => a.state === "known" && a.readAt === body.now && a.mismatch === false)).toBe(true);
    expect(body.ledger).toEqual(SEED);
    expect(body.settles).toEqual([]);

    expect(rec.ops.filter((o) => o.table === "app_users" && o.kind === "select")).toHaveLength(1);
    expect(fns(rec)).toEqual(["admin_settlement_raw", "settlement_record_reads"]);
    expect(relay.calls.filter((c) => c.path === COSTS_PATH)).toHaveLength(1);
    const p = rec.rpcCalls[1]!.params as { p_reads: SettlementRawRead[] };
    expect(p.p_reads).toHaveLength(4);
    expect(p.p_reads.map((r) => [r.accKey, r.budgetKrw, r.serverKey])).toEqual([
      ["kbG", 845_000_000, "KB120"],
      ["kyH", 684_000_000, "KYOBO119"],
      ["kyG", 20_000_000, "KYOBO119"],
      ["kbH", 372_000_000, "KB120"],
    ]);
    expect(p.p_reads.every((r) => r.readAt === body.now && r.source === "snapshot")).toBe(true);

    // server ↔ shared 한 길(D-01) — 응답을 그대로 계좌 표 계산에 넣으면 검산 수익.
    const profits = [
      ...poolAccountRows("p1", body.accounts, body.ledger),
      ...poolAccountRows("p2", body.accounts, body.ledger),
    ].map((r) => r.profitKrw);
    expect(profits).toEqual([1_065_000_000, -16_000_000, 0, -28_000_000]);
  });

  it("③ relay 실패(status 0) → DB 마지막 값이 있는 kyH 는 stale · 나머지 unset · 기록 0회", async () => {
    const at = "2026-11-19T10:58:00.000Z";
    const relay = makeFakeRelay((c) => (c.path === COSTS_PATH ? { status: 0, data: null } : undefined));
    const { app, rec } = makeApp(
      {
        raw: () => ({
          data: RAW([{ accKey: "kyH", budgetKrw: 680_000_000, source: "live", serverKey: "KYOBO119", readAt: at }]),
          error: null,
        }),
      },
      relay.client,
    );
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const body = res.body as SettlementView;
    expect(body.accounts.find((a) => a.accKey === "kyH")).toMatchObject({ state: "stale", budgetKrw: 680_000_000, readAt: at });
    for (const k of ["kbG", "kyG", "kbH"]) {
      expect(body.accounts.find((a) => a.accKey === k)).toMatchObject({ state: "unset", budgetKrw: null, readAt: null });
    }
    expect(fns(rec)).not.toContain("settlement_record_reads");
  });

  it("④ relay 가 kyG 예수금 0 → kyG unset · 기록에는 0 이 남는다", async () => {
    const relay = makeFakeRelay(relayWith(costsOf(0)));
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const body = res.body as SettlementView;
    expect(body.accounts.find((a) => a.accKey === "kyG")).toMatchObject({ state: "unset", budgetKrw: null, readAt: body.now });
    const p = rec.rpcCalls.find((c) => c.fn === "settlement_record_reads")!.params as { p_reads: SettlementRawRead[] };
    expect(p.p_reads.find((r) => r.accKey === "kyG")).toMatchObject({ budgetKrw: 0 });
  });

  it("(IN-03) relay 가 kyG 예수금 −5,000,000 → 화면은 known 음수 그대로 · 기록에서는 kyG 만 빼고 세 계좌 기록 · 경고 1회", async () => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay(relayWith(costsOf(-5_000_000)));
    const { app, rec } = makeApp({}, relay.client);
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const body = res.body as SettlementView;
    expect(body.accounts.find((a) => a.accKey === "kyG")).toMatchObject({ state: "known", budgetKrw: -5_000_000 });
    const p = rec.rpcCalls.find((c) => c.fn === "settlement_record_reads")!.params as { p_reads: SettlementRawRead[] };
    expect(p.p_reads.map((r) => r.accKey)).toEqual(["kbG", "kyH", "kbH"]);
    const ours = warn.mock.calls.filter(
      (args) => (args[0] as { settlement?: { op?: string } })?.settlement?.op === "record-reads",
    );
    expect(ours.map((c) => c[0])).toEqual([{ settlement: { op: "record-reads", negative: ["kyG"] } }]);
  });

  it("⑤ admin_settlement_raw 오류 · 모양 위반 → 500 DB_ERROR", async () => {
    const relay = makeFakeRelay(relayWith(costsOf()));
    const e1 = makeApp({ raw: () => ({ data: null, error: { code: "XX000", message: "boom" } }) }, relay.client);
    const r1 = await auth(request(e1.app).get("/api/admin/settlement"));
    expect(r1.status).toBe(500);
    expect(r1.body.error.code).toBe("DB_ERROR");
    expect(fns(e1.rec)).not.toContain("settlement_record_reads");

    const e2 = makeApp({ raw: () => ({ data: { accounts: [], registry: [] }, error: null }) }, relay.client);
    const r2 = await auth(request(e2.app).get("/api/admin/settlement"));
    expect(r2.status).toBe(500);
    expect(r2.body.error.code).toBe("DB_ERROR");
  });

  it("⑥ 읽은 값 기록 실패 → 그래도 200 · ② 와 같은 계좌 값 · 경고 1회(계좌 키 · 코드만)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app } = makeApp({ record: () => ({ data: null, error: { code: "XX000", message: "boom" } }) }, relay.client);
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const body = res.body as SettlementView;
    expect(body.accounts.every((a) => a.state === "known")).toBe(true);
    expect(body.accounts.map((a) => a.budgetKrw)).toEqual([845_000_000, 684_000_000, 20_000_000, 372_000_000]);
    const ours = warn.mock.calls.filter(
      (args) => (args[0] as { settlement?: { op?: string } })?.settlement?.op === "record-reads",
    );
    expect(ours).toHaveLength(1);
    expect(ours[0]![0]).toEqual({
      settlement: { op: "record-reads", accounts: ["kbG", "kyH", "kyG", "kbH"], code: "XX000" },
    });
  });

  it("⑥' 기록 RPC 가 throw 해도 → 200 · 경고 1회", async () => {
    const warn = vi.spyOn(logger, "warn");
    const relay = makeFakeRelay(relayWith(costsOf()));
    const { app } = makeApp(
      {
        record: () => {
          throw new Error("socket hang up");
        },
      },
      relay.client,
    );
    const res = await auth(request(app).get("/api/admin/settlement"));
    expect(res.status).toBe(200);
    const ours = warn.mock.calls.filter(
      (args) => (args[0] as { settlement?: { op?: string } })?.settlement?.op === "record-reads",
    );
    expect(ours).toHaveLength(1);
  });
});
