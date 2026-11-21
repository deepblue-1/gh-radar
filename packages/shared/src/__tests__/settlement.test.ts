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
 * | 정산 전 수익 (R3 · D-01) | 시드 · 정산 없음 / p1 정산 10.49억 | p1 open 10.49억 · p2 open −2,800만 · p2 dist 0 / p1 open 0 |
 * | 몫 (R6) | p1 10.49억 · kbH 예수금 500,000,005 | H · G 각 5.245억 / J 40,000,002 · H · G 30,000,001 · 합 100,000,004 |
 * | 원금 (R7) | 시드 · 원금 회수 · p1 계좌에 심쥬니 출자 | p1 {H · G 2.5억} · p2 {H · G 1.5억 · J 1억} · J 회수 반영 · p1 에 J 칸 없음 |
 * | 사람 (R8 · D-06) | 시드 / kyG 미설정 / kbH 2.5억 | H · G stake 9.245억 · J loss 2,800만 stake 7,200만 / H · G unk / J loss 1억 · H · G 각 2,500만 |
 * | 이체 (R9) | 시드 | H → G 4억 1건 · G → H 7억 4건 · 법인 용역 3억 1건 |
 * | 명의 대 몫 (R10) | 시드 / kyG 미설정 | bal H 10.56억 · G 8.65억 · x 5,950만 / unk |
 * | 뺄 계좌 · 출금액 (R11 · R15) | 시드 / kbG 미설정 | p1 H kyH · p1 G kbG · p2 J kbH / p1 G kyG · 만원 미만 버림 |
 * | 정산 계획 (D-16 · D-17) | 바로 출금 고름 · 미설정 · 이월 · 0 · 끝전 | outs · unset · carry · none · 0원 줄 없음 |
 * | 정산 뒤 회귀 (D-09) | p1 정산 + 김현중 바로 출금 · kyH 1.595억 | H due 0 stake 4억 · G due 5.245억 stake 9.245억 · x 5,950만 |
 * | 사람-묶음 (D-29) | 출자 · 원금 회수 · 계좌 옮김 · 수익 출금 | p1 계좌의 심쥬니만 false |
 * | 거래 줄 순서 | 날짜 · id | 날짜 최신 위 · 같은 날 id 큰 것 위 |
 */
import { describe, expect, it } from "vitest";

import type { AdminAccountCostRow, AdminAccountCostsRaw } from "../admin";
import {
  buildSettlementAccounts,
  carryBasisLabel,
  carryShown,
  cumProfit,
  distributable,
  formatEokMan,
  formatEokManMinus,
  formatEokManSigned,
  hgOf,
  hgSum,
  ledgerFlows,
  nameVs,
  openProfit,
  payAccount,
  personAllowedFor,
  personSummary,
  poolAccountRows,
  poolOk,
  principalCaps,
  profitTone,
  settledSum,
  settlePlan,
  settleShares,
  SETTLEMENT_ACC_KEYS,
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_KIND_ORDER,
  SETTLEMENT_MINUS,
  settlementBudgetOf,
  settlementDateLabel,
  settlementReadLabel,
  settlementStampLabel,
  settlementTimeLabel,
  shareOf,
  sortLedgerRows,
  withdrawAmount,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementCtx,
  type SettlementLedgerRow,
  type SettlementPerson,
  type SettlementPoolId,
  type SettlementRaw,
  type SettlementRawAccount,
  type SettlementRawServer,
  type SettlementSettleRow,
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

  it("(IN-03) known 음수 → 「미설정」 이 아니라 known 음수 그대로 · reads 에도 남는다(기록에서 빼는 것은 라우트 몫)", () => {
    const costs: AdminAccountCostsRaw = { servers: { KB120: [costRow("a01", "1001", -5_000_000)] } };
    const { accounts, reads } = buildSettlementAccounts(raw(), costs, NOW);
    expect(accounts[0]).toMatchObject({ accKey: "kbG", state: "known", budgetKrw: -5_000_000, readAt: NOW });
    expect(reads).toEqual([{ accKey: "kbG", budgetKrw: -5_000_000, source: "snapshot", serverKey: "KB120", readAt: NOW }]);
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

// ── 정산 계산(44-02) ──────────────────────────────────────────────────────────

const ctxOf = (
  over: Partial<Record<SettlementAccKey, number | null>> = {},
  ledger: SettlementLedgerRow[] = SEED,
  settles: SettlementSettleRow[] = [],
): SettlementCtx => ({ accounts: views(over), ledger, settles });

const settleRow = (
  id: number,
  pool: SettlementPoolId,
  profitKrw: number,
  shares: Partial<Record<SettlementPerson, number>>,
): SettlementSettleRow => ({
  id,
  pool,
  profitKrw,
  shares,
  snapshot: { accounts: [], cumKrw: 0, prevKrw: 0 },
  readAt: NOW,
  memo: "",
  createdBy: "admin@example.com",
  createdAt: NOW,
});

/** p1 정산(10억 4,900만 · 반반) + 김현중 바로 출금 5억 2,450만(교보 김현중) — 정산 뒤 회귀 픽스처. */
const P1_SETTLE = settleRow(1, "p1", 1_049_000_000, { H: 524_500_000, G: 524_500_000 });
const P1_OUT_H = row(10, {
  txDate: "2026-11-20",
  kind: "withdraw_profit",
  who: "H",
  fromAcc: "kyH",
  amountKrw: 524_500_000,
  settleId: 1,
  seeded: false,
});

describe("정산 전 수익 · 나눌 수익 (R3 · D-01 · 규칙 2)", () => {
  it("정산 없음 — p1 open = 누적 10억 4,900만 · p2 open −2,800만 · p2 나눌 수익 0", () => {
    const ctx = ctxOf();
    expect(settledSum("p1", ctx.settles)).toBe(0);
    expect(openProfit("p1", ctx)).toBe(1_049_000_000);
    expect(distributable("p1", ctx)).toBe(1_049_000_000);
    expect(openProfit("p2", ctx)).toBe(-28_000_000);
    expect(distributable("p2", ctx)).toBe(0);
  });

  it("정산 수익 합은 그 묶음 정산만 · open = 누적 − 정산 합", () => {
    const settles = [P1_SETTLE, settleRow(2, "p2", 10_000_000, { J: 4_000_000, H: 3_000_000, G: 3_000_000 })];
    expect(settledSum("p1", settles)).toBe(1_049_000_000);
    expect(settledSum("p2", settles)).toBe(10_000_000);
    expect(openProfit("p1", ctxOf({}, SEED, settles))).toBe(0);
  });

  it("현중 · 근형 묶음(기준 없음)은 손실도 그대로 나눌 수익", () => {
    const ctx = ctxOf({ kbG: 1 });
    // kbG 1원 → kbG 수익 1 + 220,000,000 · 묶음 = 220,000,001 − 16,000,000 + 0
    expect(distributable("p1", ctx)).toBe(204_000_001);
    const loss = ctxOf({}, SEED, [settleRow(1, "p1", 1_100_000_000, { H: 550_000_000, G: 550_000_000 })]);
    expect(distributable("p1", loss)).toBe(-51_000_000);
  });
});

describe("이월 문장 기준 carryBasisLabel · carryShown (IN-02)", () => {
  it("정산 없음 → 「원금 4억」(쥬니 계좌 넣은 돈 합) · 쥬니 정산이 있으면 「지난 정산 수준」(p1 정산은 상관없음)", () => {
    expect(carryBasisLabel("p2", ctxOf())).toBe("원금 4억");
    expect(carryBasisLabel("p2", ctxOf({}, SEED, [P1_SETTLE]))).toBe("원금 4억");
    const p2 = settleRow(2, "p2", 10_000_000, { J: 4_000_000, H: 3_000_000, G: 3_000_000 });
    expect(carryBasisLabel("p2", ctxOf({}, SEED, [p2]))).toBe("지난 정산 수준");
  });

  it("남은 금액이 만으로 0(0 · 9,999원)이면 문장을 보이지 않는다 · 1만 이상이면 보인다", () => {
    expect(carryShown(0)).toBe(false);
    expect(carryShown(9_999)).toBe(false);
    expect(carryShown(10_000)).toBe(true);
    expect(carryShown(28_000_000)).toBe(true);
  });
});

describe("몫 (R6 · D-09 — 원 미만 버림)", () => {
  it("shareOf — 비율 · 비율에 없는 사람 0 · 음수는 0 쪽 버림", () => {
    expect(shareOf("p1", 1_049_000_000, "H")).toBe(524_500_000);
    expect(shareOf("p1", 1_049_000_000, "J")).toBe(0);
    expect(shareOf("p1", -5, "H")).toBe(-2);
  });

  it("4 : 3 : 3 끝전 — 정산 전 수익 100,000,005 → J 40,000,002 · H · G 30,000,001 · 합 100,000,004", () => {
    const ctx = ctxOf({ kbH: 500_000_005 });
    expect(openProfit("p2", ctx)).toBe(100_000_005);
    const r = settleShares("p2", distributable("p2", ctx));
    expect(r.shares).toEqual({ J: 40_000_002, H: 30_000_001, G: 30_000_001 });
    expect(r.profitKrw).toBe(100_000_004);
  });
});

describe("원금 (R7)", () => {
  it("시드 — p1 {H · G 2억 5,000만} · p2 {H · G 1억 5,000만 · J 1억}", () => {
    expect(principalCaps(SEED)).toEqual({
      p1: { H: 250_000_000, G: 250_000_000 },
      p2: { H: 150_000_000, G: 150_000_000, J: 100_000_000 },
    });
  });

  it("원금 회수는 뺀 계좌 묶음에서 그 사람 원금을 줄인다", () => {
    const back = row(20, { txDate: "2026-11-02", kind: "withdraw_principal", who: "J", fromAcc: "kbH", amountKrw: 30_000_000 });
    expect(principalCaps([...SEED, back]).p2.J).toBe(70_000_000);
  });

  it("현중 · 근형 묶음 계좌의 심쥬니 출자는 더하지 않는다(숫자 아님 값 방지)", () => {
    const bad = row(21, { txDate: "2026-11-02", kind: "contribute", who: "J", toAcc: "kbG", amountKrw: 10_000_000 });
    const c = principalCaps([...SEED, bad]);
    expect(c.p1).toEqual({ H: 250_000_000, G: 250_000_000 });
    expect(Object.values(c.p1).every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("사람 (R8 · D-06)", () => {
  it("검산 — 김현중 · 정근형 지금 몫 전체 924,500,000", () => {
    for (const p of ["H", "G"] as const) {
      const s = personSummary(p, ctxOf());
      expect(s).toMatchObject({
        dueKrw: 0,
        open: { p1: 524_500_000, p2: 0 },
        openSum: 524_500_000,
        cap: { p1: 250_000_000, p2: 150_000_000 },
        capSum: 400_000_000,
        lossKrw: 0,
        unk: false,
        totalKrw: 524_500_000,
      });
      expect(s.stakeKrw).toBe(924_500_000);
    }
  });

  it("검산 — 심쥬니 손실 2,800만 · 지금 몫 전체 7,200만", () => {
    const s = personSummary("J", ctxOf());
    expect(s).toMatchObject({ open: { p2: 0 }, openSum: 0, cap: { p2: 100_000_000 }, capSum: 100_000_000, unk: false });
    expect(s.open).not.toHaveProperty("p1");
    expect(s.lossKrw).toBe(28_000_000);
    expect(s.stakeKrw).toBe(72_000_000);
  });

  it("kyG 미설정(D-25) — 김현중 · 정근형 unk · 심쥬니 아님", () => {
    const ctx = ctxOf({ kyG: null });
    expect(personSummary("H", ctx).unk).toBe(true);
    expect(personSummary("G", ctx).unk).toBe(true);
    expect(personSummary("H", ctx).open.p1).toBeNull();
    expect(personSummary("J", ctx).unk).toBe(false);
  });

  it("손실 1억 넘음 — 정산 전 수익 −1억 5,000만 → 심쥬니 1억 · 김현중 · 정근형 각 2,500만", () => {
    const ctx = ctxOf({ kbH: 250_000_000 });
    expect(openProfit("p2", ctx)).toBe(-150_000_000);
    expect(personSummary("J", ctx).lossKrw).toBe(100_000_000);
    expect(personSummary("H", ctx).lossKrw).toBe(25_000_000);
    expect(personSummary("G", ctx).lossKrw).toBe(25_000_000);
  });

  it("남겨 둔 돈 = 저장된 정산 몫 − 수익 출금(다시 계산하지 않는다)", () => {
    const odd = settleRow(1, "p1", 1_049_000_000, { H: 600_000_000, G: 449_000_000 });
    expect(personSummary("H", ctxOf({}, SEED, [odd])).dueKrw).toBe(600_000_000);
    expect(personSummary("G", ctxOf({}, SEED, [odd])).dueKrw).toBe(449_000_000);
  });
});

describe("이체 (R9)", () => {
  it("hgOf — 출자 · 계좌 옮김 · 수익 출금 · 같은 사람 · 심쥬니", () => {
    expect(hgOf(SEED[0]!)).toEqual({ from: "H", to: "G", corp: false });
    expect(hgOf(SEED[2]!)).toEqual({ from: "G", to: "H", corp: true });
    expect(hgOf(SEED[1]!)).toBeNull();
    expect(hgOf(SEED[3]!)).toBeNull();
    expect(hgOf(SEED[8]!)).toBeNull();
    const out = row(30, { txDate: "2026-11-02", kind: "withdraw_profit", who: "G", fromAcc: "kyH", amountKrw: 10_000_000 });
    expect(hgOf(out)).toEqual({ from: "H", to: "G", corp: false });
  });

  it("hgSum — 김현중 → 정근형 4억(1건) · 정근형 → 김현중 7억(4건) · 법인 용역 3억(1건)", () => {
    expect(hgSum(SEED)).toEqual({
      hgKrw: 400_000_000,
      hgCount: 1,
      ghKrw: 700_000_000,
      ghCount: 4,
      corpKrw: 300_000_000,
      corpCount: 1,
    });
  });
});

describe("명의 대 몫 (R10 · 규칙 6)", () => {
  it("검산 — 명의 H 10억 5,600만 · G 8억 6,500만 · x 59,500,000(김현중 → 정근형)", () => {
    const v = nameVs(ctxOf());
    expect(v.balKrw).toEqual({ H: 1_056_000_000, G: 865_000_000 });
    expect(v.unkBal).toEqual({ H: false, G: false });
    expect(v.unk).toBe(false);
    expect(v.people.G.stakeKrw).toBe(924_500_000);
    expect(v.xKrw).toBe(59_500_000);
  });

  it("kyG 미설정 → unk", () => {
    const v = nameVs(ctxOf({ kyG: null }));
    expect(v.unkBal.G).toBe(true);
    expect(v.unk).toBe(true);
  });
});

describe("뺄 계좌 · 바로 출금 금액 (R11 · R15 · D-15)", () => {
  it("검산 — p1 H → kyH · p1 G → kbG · p2 J → kbH(본인 명의 없음 → 첫 계좌)", () => {
    const a = views();
    expect(payAccount("p1", "H", a)).toBe("kyH");
    expect(payAccount("p1", "G", a)).toBe("kbG");
    expect(payAccount("p2", "J", a)).toBe("kbH");
    expect(payAccount("p2", "H", a)).toBe("kbH");
  });

  it("예수금 내림차순(미설정 0) 뒤 본인 명의 첫 계좌", () => {
    expect(payAccount("p1", "G", views({ kbG: null }))).toBe("kyG");
    expect(payAccount("p1", "G", views({ kyG: 900_000_000 }))).toBe("kyG");
  });

  it("withdrawAmount — 만원 미만 버림 · 0 · 음수는 0", () => {
    expect(withdrawAmount(524_500_007)).toBe(524_500_000);
    expect(withdrawAmount(9_999)).toBe(0);
    expect(withdrawAmount(0)).toBe(0);
    expect(withdrawAmount(-50_000)).toBe(0);
  });
});

describe("정산 계획 settlePlan (D-16 · D-17)", () => {
  it("p1 · 바로 출금 없음 — 확정 가능 · 몫 · 정산 수익", () => {
    expect(settlePlan("p1", ctxOf(), [])).toEqual({
      can: true,
      block: null,
      openKrw: 1_049_000_000,
      distKrw: 1_049_000_000,
      carryKrw: 0,
      shares: { H: 524_500_000, G: 524_500_000 },
      profitKrw: 1_049_000_000,
      outs: [],
    });
  });

  it("바로 출금 — 김현중 kyH · 정근형 kbG · 묶음에 없는 사람은 무시", () => {
    expect(settlePlan("p1", ctxOf(), ["H"]).outs).toEqual([{ who: "H", fromAcc: "kyH", amountKrw: 524_500_000 }]);
    expect(settlePlan("p1", ctxOf(), ["G"]).outs).toEqual([{ who: "G", fromAcc: "kbG", amountKrw: 524_500_000 }]);
    expect(settlePlan("p1", ctxOf(), ["J", "G", "H"]).outs.map((o) => o.who)).toEqual(["H", "G"]);
  });

  it("몫 524,500,007 → 바로 출금 524,500,000(만원 미만 버림)", () => {
    const plan = settlePlan("p1", ctxOf({ kbG: 845_000_014 }), ["H"]);
    expect(plan.shares.H).toBe(524_500_007);
    expect(plan.outs).toEqual([{ who: "H", fromAcc: "kyH", amountKrw: 524_500_000 }]);
  });

  it("4 : 3 : 3 — 묶음 비율 순서(J · H · G) · 정산 수익 = 몫 합", () => {
    const plan = settlePlan("p2", ctxOf({ kbH: 500_000_005 }), ["G", "H", "J"]);
    expect(plan.can).toBe(true);
    expect(plan.profitKrw).toBe(100_000_004);
    expect(plan.outs).toEqual([
      { who: "J", fromAcc: "kbH", amountKrw: 40_000_000 },
      { who: "H", fromAcc: "kbH", amountKrw: 30_000_000 },
      { who: "G", fromAcc: "kbH", amountKrw: 30_000_000 },
    ]);
  });

  it("바로 출금 금액이 0 인 줄은 만들지 않는다", () => {
    const plan = settlePlan("p2", ctxOf({ kbH: 400_005_000 }), ["J", "H", "G"]);
    expect(plan.can).toBe(true);
    expect(plan.shares).toEqual({ J: 2_000, H: 1_500, G: 1_500 });
    expect(plan.outs).toEqual([]);
  });

  it("미설정 → unset", () => {
    expect(settlePlan("p1", ctxOf({ kyG: null }), ["H"])).toMatchObject({
      can: false,
      block: "unset",
      openKrw: null,
      outs: [],
    });
  });

  it("쥬니 손실 이월 → carry(남은 금액)", () => {
    expect(settlePlan("p2", ctxOf(), ["J"])).toMatchObject({ can: false, block: "carry", openKrw: -28_000_000, carryKrw: 28_000_000, outs: [] });
    expect(settlePlan("p2", ctxOf({ kbH: 250_000_000 }), [])).toMatchObject({ block: "carry", carryKrw: 150_000_000 });
  });

  it("p1 정산 전 수익 0 이하 → none", () => {
    expect(settlePlan("p1", ctxOf({}, SEED, [P1_SETTLE]), ["H"])).toMatchObject({ can: false, block: "none", openKrw: 0, outs: [] });
  });
});

describe("정산 뒤 회귀 (D-09)", () => {
  // p1 정산 확정 + 김현중 바로 출금(교보 김현중) → 교보 김현중 예수금 684,000,000 − 524,500,000 = 159,500,000 반영.
  const after = ctxOf({ kyH: 159_500_000 }, [...SEED, P1_OUT_H], [P1_SETTLE]);

  it("묶음 누적 그대로 · 정산 전 수익 0", () => {
    expect(cumProfit("p1", after.accounts, after.ledger)).toBe(1_049_000_000);
    expect(openProfit("p1", after)).toBe(0);
  });

  it("김현중 남겨 둔 돈 0 · 지금 몫 전체 4억 / 정근형 남겨 둔 돈 5억 2,450만 · 지금 몫 전체 924,500,000", () => {
    const h = personSummary("H", after);
    expect(h.dueKrw).toBe(0);
    expect(h.stakeKrw).toBe(400_000_000);
    const g = personSummary("G", after);
    expect(g.dueKrw).toBe(524_500_000);
    expect(g.stakeKrw).toBe(924_500_000);
  });

  it("명의 대 몫 x 59,500,000 그대로", () => {
    expect(nameVs(after).xKrw).toBe(59_500_000);
  });
});

describe("사람-묶음 규칙 personAllowedFor (D-29)", () => {
  it("출자 · 원금 회수 — 그 계좌 묶음 비율에 없는 사람만 false", () => {
    expect(personAllowedFor("contribute", "kbG", "J")).toBe(false);
    expect(personAllowedFor("contribute", "kbH", "J")).toBe(true);
    expect(personAllowedFor("contribute", "kbG", "H")).toBe(true);
    expect(personAllowedFor("withdraw_principal", "kyG", "J")).toBe(false);
    expect(personAllowedFor("withdraw_principal", "kbH", "G")).toBe(true);
  });

  it("수익 출금 · 계좌 옮김 — 늘 true", () => {
    expect(personAllowedFor("withdraw_profit", "kbG", "J")).toBe(true);
    expect(personAllowedFor("move", "kbG", null)).toBe(true);
  });
});

describe("sortLedgerRows (목업 ledgerList)", () => {
  it("날짜 최신이 위 · 같은 날은 id 큰 것이 위 · 입력은 그대로", () => {
    const input = [
      row(1, { txDate: "2026-09-13", kind: "contribute", amountKrw: 1 }),
      row(2, { txDate: "2026-11-01", kind: "contribute", amountKrw: 1 }),
      row(3, { txDate: "2026-09-13", kind: "contribute", amountKrw: 1 }),
      row(4, { txDate: "2025-12-31", kind: "contribute", amountKrw: 1 }),
    ];
    expect(sortLedgerRows(input).map((t) => t.id)).toEqual([2, 3, 1, 4]);
    expect(input.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });
});
