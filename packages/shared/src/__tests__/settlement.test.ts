/**
 * Phase 44 — 어드민 정산 shared 계산 · 표기 검증.
 *
 * 출처: 44-CONTEXT D-01 · D-03 · D-04 · D-08 · 44-RESEARCH 「검산 픽스처」 · 「시드 9건」 · 44-UI-SPEC 「숫자 · 날짜 표기 계약」.
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 넣은 돈 | 시드 9건 | kbG in 8억 · out 10.2억 · put −2.2억 / kyH 7억 / kyG 2,000만 / kbH 4억 |
 * | 계좌 수익 | 예수금 8.45억 · 6.84억 · 2,000만 · 3.72억 | +10.65억 · −1,600만 · 0 · −2,800만 |
 * | 묶음 누적 | 같은 입력 | p1 +10.49억 · p2 −2,800만 |
 * | 미설정 | kyG unset | poolOk(p1) false · 수익 null |
 * | 지운 줄 | 줄을 더했다 뺀 목록 | 원래 결과와 같음 |
 * | 포매터 | 원 | 억 · 만 · 만 미만 버림 · U+2212 · 0 은 「0」 |
 * | 날짜 · 시각 | KST | 「M/D」 · 「YY년 말」 · 「YY/M/D」 · 「오늘 / 어제 HH:MM」 |
 * | 예수금 선택 | 67 live · 87 · 첫 사용자 모름 · 서버 간 다름 | live 값 · 87 값 · 둘째 사용자 값 · 주문 서버 값 + mismatch |
 * | 계좌 뷰 | known · 0 · 못 읽음 + 기록 · 못 읽음 · 대응 없음 | known + 기록 · unset + 기록 · stale · unset · unset |
 */
import { describe, expect, it } from "vitest";

import type { AdminAccountCostRow, AdminAccountCostsRaw } from "../admin";
import {
  buildSettlementAccounts,
  cumProfit,
  formatEokMan,
  formatEokManMinus,
  formatEokManSigned,
  ledgerFlows,
  poolAccountRows,
  poolOk,
  profitTone,
  SETTLEMENT_ACC_KEYS,
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_KIND_ORDER,
  SETTLEMENT_MINUS,
  settlementBudgetOf,
  settlementDateLabel,
  settlementReadLabel,
  settlementStampLabel,
  settlementTimeLabel,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementLedgerRow,
  type SettlementRaw,
  type SettlementRawAccount,
  type SettlementRawServer,
} from "../settlement";

const NOW = "2026-11-20T01:00:00.000Z"; // KST 2026-11-20 10:00

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

/** 시드 9건(원) — 44-RESEARCH 「시드 9건」 표 그대로. */
const SEED: SettlementLedgerRow[] = [
  row(1, { txDate: "2025-12-31", kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 400_000_000 }),
  row(2, { txDate: "2025-12-31", kind: "contribute", who: "G", toAcc: "kbG", amountKrw: 400_000_000 }),
  row(3, { txDate: "2026-08-10", kind: "move", fromAcc: "kbG", toAcc: "kyH", via: "corp_service", amountKrw: 300_000_000 }),
  row(4, { txDate: "2026-09-10", kind: "contribute", who: "J", toAcc: "kbH", amountKrw: 100_000_000 }),
  row(5, { txDate: "2026-09-10", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000, memo: "쥬니 묶음 원금" }),
  row(6, { txDate: "2026-09-13", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000, memo: "쥬니 묶음 원금" }),
  row(7, { txDate: "2026-09-13", kind: "move", fromAcc: "kbG", toAcc: "kyH", via: "transfer", amountKrw: 400_000_000 }),
  row(8, { txDate: "2026-09-18", kind: "move", fromAcc: "kbG", toAcc: "kbH", via: "transfer", amountKrw: 100_000_000, memo: "쥬니 묶음 원금" }),
  row(9, { txDate: "2026-11-01", kind: "move", fromAcc: "kbG", toAcc: "kyG", via: "transfer", amountKrw: 20_000_000 }),
];

const DEP: Record<SettlementAccKey, number> = {
  kbG: 845_000_000,
  kyH: 684_000_000,
  kyG: 20_000_000,
  kbH: 372_000_000,
};

const views = (over: Partial<Record<SettlementAccKey, number | null>> = {}): SettlementAccountView[] =>
  SETTLEMENT_ACCOUNTS.map((a) => {
    const v = a.key in over ? (over[a.key] ?? null) : DEP[a.key];
    return {
      accKey: a.key,
      label: a.label,
      owner: a.owner,
      pool: a.pool,
      state: v === null ? "unset" : "known",
      budgetKrw: v,
      readAt: v === null ? null : NOW,
      mismatch: false,
    };
  });

describe("상수", () => {
  it("계좌 4개 순서 · 거래 종류 네 가지뿐(D-05 · D-07)", () => {
    expect(SETTLEMENT_ACC_KEYS).toEqual(["kbG", "kyH", "kyG", "kbH"]);
    expect(SETTLEMENT_KIND_ORDER).toEqual(["withdraw_profit", "withdraw_principal", "contribute", "move"]);
    expect(SETTLEMENT_MINUS).toBe("−");
  });
});

describe("넣은 돈 · 계좌 수익 (R1 ~ R3 · 검산 픽스처)", () => {
  it("ledgerFlows — 시드 9건", () => {
    expect(ledgerFlows(SEED, "kbG")).toEqual({ inKrw: 800_000_000, outKrw: 1_020_000_000, putKrw: -220_000_000 });
    expect(ledgerFlows(SEED, "kyH").putKrw).toBe(700_000_000);
    expect(ledgerFlows(SEED, "kyG").putKrw).toBe(20_000_000);
    expect(ledgerFlows(SEED, "kbH").putKrw).toBe(400_000_000);
  });

  it("poolAccountRows — 수익 = 예수금 − 넣은 돈", () => {
    const p1 = poolAccountRows("p1", views(), SEED);
    expect(p1.map((r) => r.accKey)).toEqual(["kbG", "kyH", "kyG"]);
    expect(p1.map((r) => r.profitKrw)).toEqual([1_065_000_000, -16_000_000, 0]);
    expect(p1[0]).toMatchObject({ budgetKrw: 845_000_000, putKrw: -220_000_000, inKrw: 800_000_000, outKrw: 1_020_000_000, stale: false });
    const p2 = poolAccountRows("p2", views(), SEED);
    expect(p2.map((r) => [r.accKey, r.profitKrw])).toEqual([["kbH", -28_000_000]]);
  });

  it("cumProfit — p1 +10억 4,900만 · p2 −2,800만", () => {
    expect(cumProfit("p1", views(), SEED)).toBe(1_049_000_000);
    expect(cumProfit("p2", views(), SEED)).toBe(-28_000_000);
    expect(poolOk("p1", views())).toBe(true);
  });

  it("kyG 미설정 → poolOk(p1) false · 그 줄 수익 null · p2 는 그대로", () => {
    const v = views({ kyG: null });
    expect(poolOk("p1", v)).toBe(false);
    expect(poolOk("p2", v)).toBe(true);
    expect(poolAccountRows("p1", v, SEED)[2]).toMatchObject({ accKey: "kyG", budgetKrw: null, profitKrw: null });
  });

  it("stale 계좌는 행에 stale 표시", () => {
    const v = views().map((a) => (a.accKey === "kyH" ? { ...a, state: "stale" as const } : a));
    expect(poolAccountRows("p1", v, SEED)[1]!.stale).toBe(true);
  });

  it("지운 줄 제외 — 줄을 더했다가 뺀 목록은 원래와 같은 결과", () => {
    const extra = row(99, { txDate: "2026-11-02", kind: "contribute", who: "H", toAcc: "kbG", amountKrw: 500_000_000 });
    const withDeleted = [...SEED, extra];
    expect(cumProfit("p1", views(), withDeleted)).not.toBe(1_049_000_000);
    const live = withDeleted.filter((t) => t.id !== 99);
    expect(poolAccountRows("p1", views(), live)).toEqual(poolAccountRows("p1", views(), SEED));
    expect(cumProfit("p1", views(), live)).toBe(1_049_000_000);
  });
});

describe("포매터 (D-08)", () => {
  const M = SETTLEMENT_MINUS;
  it("formatEokMan — 부호 없음 · 만 미만 버림", () => {
    expect(formatEokMan(924_500_000)).toBe("9억 2,450만");
    expect(formatEokMan(59_500_000)).toBe("5,950만");
    expect(formatEokMan(400_000_000)).toBe("4억");
    expect(formatEokMan(9_999)).toBe("0만");
    expect(formatEokMan(100_000_000)).toBe("1억");
    expect(formatEokMan(99_990_000)).toBe("9,999만");
    expect(formatEokMan(1_000_010_000)).toBe("10억 1만");
    expect(formatEokMan(-220_000_000)).toBe("2억 2,000만");
  });

  it("formatEokManMinus — 음수만 U+2212 · 0 은 「0」", () => {
    expect(formatEokManMinus(-220_000_000)).toBe(`${M}2억 2,000만`);
    expect(formatEokManMinus(845_000_000)).toBe("8억 4,500만");
    expect(formatEokManMinus(0)).toBe("0");
    expect(formatEokManMinus(9_999)).toBe("0");
    expect(formatEokManMinus(-5_000)).toBe("0");
  });

  it("formatEokManSigned — + / U+2212 · 0 은 「0」", () => {
    expect(formatEokManSigned(1_065_000_000)).toBe("+10억 6,500만");
    expect(formatEokManSigned(-28_000_000)).toBe(`${M}2,800만`);
    expect(formatEokManSigned(9_999)).toBe("0");
    expect(formatEokManSigned(-5_000)).toBe("0");
    expect(formatEokManSigned(5_000)).toBe("0");
    expect(formatEokManSigned(0)).toBe("0");
    expect(formatEokManSigned(-28_000_000)).not.toContain("-");
  });

  it("profitTone — 글자와 같은 판정", () => {
    expect(profitTone(5_000)).toBeNull();
    expect(profitTone(-5_000)).toBeNull();
    expect(profitTone(10_000)).toBe("up");
    expect(profitTone(-28_000_000)).toBe("down");
  });
});

describe("날짜 · 시각 라벨 (KST)", () => {
  it("settlementDateLabel", () => {
    expect(settlementDateLabel("2026-09-13", NOW)).toBe("9/13");
    expect(settlementDateLabel("2025-12-31", NOW)).toBe("25년 말");
    expect(settlementDateLabel("2025-06-02", NOW)).toBe("25/6/2");
  });

  it("settlementReadLabel — 오늘 · 어제 · 그 전", () => {
    const now = "2026-11-20T05:32:00.000Z"; // KST 14:32
    expect(settlementReadLabel("2026-11-20T05:32:00.000Z", now)).toBe("오늘 14:32");
    expect(settlementReadLabel("2026-11-19T10:58:00.000Z", now)).toBe("어제 19:58");
    expect(settlementReadLabel("2026-11-18T05:32:00.000Z", now)).toBe("11/18 14:32");
  });

  it("settlementReadLabel — UTC 자정 근처는 KST 날짜로 판정", () => {
    expect(settlementReadLabel("2026-11-19T23:30:00.000Z", "2026-11-20T01:00:00.000Z")).toBe("오늘 08:30");
    // now KST 11-20 01:00 · 읽은 시각 KST 11-19 23:00 → 어제
    expect(settlementReadLabel("2026-11-19T14:00:00.000Z", "2026-11-19T16:00:00.000Z")).toBe("어제 23:00");
  });

  it("settlementStampLabel · settlementTimeLabel", () => {
    expect(settlementStampLabel("2026-11-19T05:32:00.000Z")).toBe("11/19 14:32");
    expect(settlementTimeLabel("2026-11-19T15:05:00.000Z")).toBe("00:05");
  });
});

// ── 예수금 선택(D-03) ──────────────────────────────────────────────────────────

const REG_KB: SettlementRawServer[] = [
  { key: "KB120", broker: "KB", enabled: true, isOrderServer: true },
  { key: "KB121", broker: "KB", enabled: true, isOrderServer: false },
  { key: "KYOBO119", broker: "KYOBO", enabled: true, isOrderServer: true },
];

const costRow = (dmaUserId: string, accountNo: string, budgetKrw: number, liveBudgetKrw: number | null = null): AdminAccountCostRow => ({
  dmaUserId,
  accountNo,
  budgetKrw,
  feePpm: 150,
  sellTaxPpm: 2000,
  liveBudgetKrw,
});

const kbAccount = (links: SettlementRawAccount["links"]): SettlementRawAccount => ({
  accKey: "kbG",
  broker: "KB",
  accountNo: "00880001",
  name: "정근형",
  links,
});

describe("settlementBudgetOf (D-03 — 계좌 메뉴와 같은 판정)", () => {
  it("67 live 가 있으면 그 값 · 출처 서버 · mismatch false", () => {
    const acc = kbAccount([{ dmaUserId: "a01", servers: [{ serverKey: "KB120", state: "active", isOrder: false }] }]);
    const costs: AdminAccountCostsRaw = { servers: { KB120: [costRow("a01", "880001", 500_000_000, 845_000_000)] } };
    expect(settlementBudgetOf(acc, REG_KB, costs)).toEqual({
      state: "known",
      budgetKrw: 845_000_000,
      source: "KB120",
      budgetSource: "live",
      mismatch: false,
    });
  });

  it("live 가 없으면 87 값", () => {
    const acc = kbAccount([{ dmaUserId: "a01", servers: [{ serverKey: "KB120", state: "active", isOrder: false }] }]);
    const costs: AdminAccountCostsRaw = { servers: { KB120: [costRow("a01", "880001", 500_000_000)] } };
    expect(settlementBudgetOf(acc, REG_KB, costs)).toMatchObject({ state: "known", budgetKrw: 500_000_000, budgetSource: "snapshot" });
  });

  it("첫 사용자가 그 계좌 87 을 모르면 둘째 사용자 값", () => {
    const acc = kbAccount([
      { dmaUserId: "a01", servers: [{ serverKey: "KB121", state: "active", isOrder: false }] },
      { dmaUserId: "b02", servers: [{ serverKey: "KB120", state: "active", isOrder: false }] },
    ]);
    const costs: AdminAccountCostsRaw = { servers: { KB120: [costRow("b02", "880001", 300_000_000)] } };
    expect(settlementBudgetOf(acc, REG_KB, costs)).toMatchObject({ state: "known", budgetKrw: 300_000_000, source: "KB120", mismatch: false });
  });

  it("두 서버 값이 다르면 출처 = 유효 주문 서버(isOrder 지정) 값 + mismatch true", () => {
    const acc = kbAccount([
      {
        dmaUserId: "a01",
        servers: [
          { serverKey: "KB120", state: "active", isOrder: false },
          { serverKey: "KB121", state: "active", isOrder: true },
        ],
      },
    ]);
    const costs: AdminAccountCostsRaw = {
      servers: { KB120: [costRow("a01", "880001", 100_000_000)], KB121: [costRow("a01", "880001", 200_000_000)] },
    };
    expect(settlementBudgetOf(acc, REG_KB, costs)).toEqual({
      state: "known",
      budgetKrw: 200_000_000,
      source: "KB121",
      budgetSource: "snapshot",
      mismatch: true,
    });
  });

  it("removing 서버만 있는 사용자는 자리가 아니다 · 아무도 모르면 unknown", () => {
    const acc = kbAccount([{ dmaUserId: "a01", servers: [{ serverKey: "KB120", state: "removing", isOrder: false }] }]);
    const costs: AdminAccountCostsRaw = { servers: { KB120: [costRow("a01", "880001", 100_000_000)] } };
    expect(settlementBudgetOf(acc, REG_KB, costs)).toEqual({ state: "unknown" });
    expect(settlementBudgetOf(kbAccount([]), REG_KB, null)).toEqual({ state: "unknown" });
  });
});

describe("buildSettlementAccounts (D-04)", () => {
  const accountOf = (accKey: SettlementAccKey, broker: "KB" | "KYOBO", accountNo: string, server: string): SettlementRawAccount => ({
    accKey,
    broker,
    accountNo,
    name: "",
    links: [{ dmaUserId: "a01", servers: [{ serverKey: server, state: "active", isOrder: false }] }],
  });
  const raw = (over: Partial<SettlementRaw> = {}): SettlementRaw => ({
    accounts: [
      accountOf("kbG", "KB", "1001", "KB120"),
      accountOf("kyH", "KYOBO", "2001", "KYOBO119"),
      accountOf("kyG", "KYOBO", "2002", "KYOBO119"),
    ],
    registry: REG_KB,
    reads: [],
    ledger: [],
    settles: [],
    ...over,
  });

  it("known → reads 1건 · 0 → unset + 기록 · 대응 없는 계좌 → unset", () => {
    const costs: AdminAccountCostsRaw = {
      servers: { KB120: [costRow("a01", "1001", 845_000_000)], KYOBO119: [costRow("a01", "2002", 0)] },
    };
    const { accounts, reads } = buildSettlementAccounts(raw(), costs, NOW);
    expect(accounts.map((a) => a.accKey)).toEqual(["kbG", "kyH", "kyG", "kbH"]);
    expect(accounts[0]).toMatchObject({ state: "known", budgetKrw: 845_000_000, readAt: NOW, mismatch: false, label: "KB 정근형" });
    expect(accounts[2]).toMatchObject({ accKey: "kyG", state: "unset", budgetKrw: null, readAt: NOW });
    expect(accounts[3]).toMatchObject({ accKey: "kbH", state: "unset", budgetKrw: null, readAt: null });
    expect(reads).toEqual([
      { accKey: "kbG", budgetKrw: 845_000_000, source: "snapshot", serverKey: "KB120", readAt: NOW },
      { accKey: "kyG", budgetKrw: 0, source: "snapshot", serverKey: "KYOBO119", readAt: NOW },
    ]);
  });

  it("못 읽음 + 마지막 값 → stale(그 값 · 그 시각) · 못 읽음 + 기록 없음 → unset", () => {
    const at = "2026-11-19T10:58:00.000Z";
    const { accounts, reads } = buildSettlementAccounts(
      raw({ reads: [{ accKey: "kyH", budgetKrw: 680_000_000, source: "live", serverKey: "KYOBO119", readAt: at }] }),
      null,
      NOW,
    );
    expect(reads).toEqual([]);
    expect(accounts[1]).toMatchObject({ accKey: "kyH", state: "stale", budgetKrw: 680_000_000, readAt: at });
    expect(accounts[0]).toMatchObject({ accKey: "kbG", state: "unset", budgetKrw: null, readAt: null });
  });

  it("못 읽음 + 마지막 값 0 → unset(그 시각)", () => {
    const at = "2026-11-19T10:58:00.000Z";
    const { accounts } = buildSettlementAccounts(
      raw({ reads: [{ accKey: "kyG", budgetKrw: 0, source: "snapshot", serverKey: null, readAt: at }] }),
      null,
      NOW,
    );
    expect(accounts[2]).toMatchObject({ state: "unset", budgetKrw: null, readAt: at });
  });
});
