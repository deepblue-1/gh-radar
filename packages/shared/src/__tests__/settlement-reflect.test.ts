/**
 * Phase 44 — 정산 예수금 반영 증감 · 장중 판정 검증.
 *
 * 출처: 44-CONTEXT D-10 · D-13 · D-19 · D-23 · D-26 · 44-RESEARCH R12 ~ R14 · R16 · Pattern 2 · Pitfall 6 · 목업 `eff` · `applied` · `addMap` · `diff`.
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | reflectEffect | 출자 · 수익 출금 · 원금 회수 · 계좌 옮김 · 보낸 = 받은 | 받은 + · 뺀 − · 보낸 − 받은 + · {} |
 * | appliedEffect | 반영 안 함 · null · pend 없음 · 한 계좌 pend · 전부 pend | {} · {} · reflectEffect · 남은 계좌만 · {}(0 인 계좌 없음) |
 * | effectDiff(고치기) | 금액만 바뀜 · 계좌만 바뀜 · 같음 · 지우기 · 새로 적기 | 차이 · 두 계좌 · {} · 되돌림 · 그대로 |
 * | addEffects | 정산 바로 출금 여러 줄 · 취소 되돌림 | 계좌별 합 |
 * | pendAccKeys | 항목 있는 계좌 | SETTLEMENT_ACCOUNTS 순서 |
 * | reconcilePend · appliedEffectAt(CR-01) | 지금 = 목표값 · 다름 · 못 읽음 · 목표값 없음 | 들어감(뺌) · 남김 · unknown(남김 · 옵션이면 들어감) · 남김 |
 * | nowBudgetsOfReads · nowBudgetsOfAccounts | 읽은 값 · known / stale / unset | 그대로 · known 만 |
 * | isSettlementMarketHours | 금 07:59 · 08:00 · 19:59 · 20:00 · 토 10:00 · UTC 자정 근처 | false · true · true · false · false · KST 기준 |
 */
import { describe, expect, it } from "vitest";

import {
  addEffects,
  appliedEffect,
  appliedEffectAt,
  effectDiff,
  isSettlementMarketHours,
  nowBudgetsOfAccounts,
  nowBudgetsOfReads,
  pendAccKeys,
  reconcilePend,
  reflectEffect,
  type SettlementAccountView,
  type SettlementLedgerRow,
  type SettlementPend,
} from "../settlement";

type Applied = Pick<SettlementLedgerRow, "kind" | "fromAcc" | "toAcc" | "amountKrw" | "reflect" | "pend">;
const tx = (r: Partial<Applied> & Pick<Applied, "kind" | "amountKrw">): Applied => ({
  fromAcc: null,
  toAcc: null,
  reflect: true,
  pend: {},
  ...r,
});

describe("reflectEffect (R12 · D-10)", () => {
  it("출자 — 받은 계좌 +", () => {
    expect(reflectEffect({ kind: "contribute", fromAcc: null, toAcc: "kbG", amountKrw: 100_000_000 })).toEqual({ kbG: 100_000_000 });
  });

  it("수익 출금 · 원금 회수 — 뺀 계좌 −", () => {
    expect(reflectEffect({ kind: "withdraw_profit", fromAcc: "kyH", toAcc: null, amountKrw: 50_000_000 })).toEqual({ kyH: -50_000_000 });
    expect(reflectEffect({ kind: "withdraw_principal", fromAcc: "kyH", toAcc: null, amountKrw: 50_000_000 })).toEqual({ kyH: -50_000_000 });
  });

  it("계좌 옮김 — 보낸 계좌 − · 받은 계좌 + · 보낸 = 받은 이면 {}", () => {
    expect(reflectEffect({ kind: "move", fromAcc: "kbG", toAcc: "kyH", amountKrw: 400_000_000 })).toEqual({
      kbG: -400_000_000,
      kyH: 400_000_000,
    });
    expect(reflectEffect({ kind: "move", fromAcc: "kbG", toAcc: "kbG", amountKrw: 400_000_000 })).toEqual({});
  });

  it("계좌가 비면 그 쪽은 없다", () => {
    expect(reflectEffect({ kind: "contribute", fromAcc: null, toAcc: null, amountKrw: 1 })).toEqual({});
    expect(reflectEffect({ kind: "withdraw_profit", fromAcc: null, toAcc: null, amountKrw: 1 })).toEqual({});
  });
});

describe("appliedEffect (R13 · D-23 · D-26)", () => {
  it("반영 안 한 거래 · null → {}", () => {
    expect(appliedEffect(tx({ kind: "contribute", toAcc: "kbG", amountKrw: 100_000_000, reflect: false }))).toEqual({});
    expect(appliedEffect(null)).toEqual({});
  });

  it("반영 · 못 보낸 것 없음 → reflectEffect 그대로", () => {
    expect(appliedEffect(tx({ kind: "move", fromAcc: "kbG", toAcc: "kyH", amountKrw: 400_000_000 }))).toEqual({
      kbG: -400_000_000,
      kyH: 400_000_000,
    });
  });

  it("계좌 옮김에서 받은 계좌만 못 보냄 → 보낸 계좌 증감만 남는다(0 인 계좌는 결과에 없다)", () => {
    const pend: SettlementPend = { kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "failed" } };
    const r = appliedEffect(tx({ kind: "move", fromAcc: "kbG", toAcc: "kyH", amountKrw: 400_000_000, pend }));
    expect(r).toEqual({ kbG: -400_000_000 });
    expect(r).not.toHaveProperty("kyH");
  });

  it("전부 못 보냄 → {}(반영했던 것이 없다)", () => {
    const pend: SettlementPend = { kyH: { deltaKrw: -50_000_000, targetKrw: null, reason: "unreachable" } };
    const r = appliedEffect(tx({ kind: "withdraw_profit", fromAcc: "kyH", amountKrw: 50_000_000, pend }));
    expect(r).toEqual({});
    expect(Object.keys(r).length > 0).toBe(false);
  });
});

describe("effectDiff (R14 · 고치기 · 지우기 미리 보기)", () => {
  const old = tx({ kind: "withdraw_profit", fromAcc: "kbG", amountKrw: 100_000_000 });

  it("금액만 바뀜 — 옛 수익 출금 kbG 1억 → 새 5,000만 → kbG +5,000만", () => {
    const want = reflectEffect({ kind: "withdraw_profit", fromAcc: "kbG", toAcc: null, amountKrw: 50_000_000 });
    expect(effectDiff(appliedEffect(old), want)).toEqual({ kbG: 50_000_000 });
  });

  it("계좌만 바뀜 — kbG → kyH → kbG +1억 · kyH −1억", () => {
    const want = reflectEffect({ kind: "withdraw_profit", fromAcc: "kyH", toAcc: null, amountKrw: 100_000_000 });
    expect(effectDiff(appliedEffect(old), want)).toEqual({ kbG: 100_000_000, kyH: -100_000_000 });
  });

  it("같으면 {}", () => {
    expect(effectDiff(appliedEffect(old), reflectEffect(old))).toEqual({});
  });

  it("지우기(want {}) = 되돌림 · 새로 적기(cur {}) = 그대로", () => {
    expect(effectDiff(appliedEffect(old), {})).toEqual({ kbG: 100_000_000 });
    expect(effectDiff({}, { kbH: -30_000_000 })).toEqual({ kbH: -30_000_000 });
  });
});

describe("addEffects · pendAccKeys", () => {
  it("addEffects — 계좌별 합(정산 바로 출금 여러 줄 · 취소 되돌림)", () => {
    expect(addEffects([{ kbH: -1 }, { kbH: -2 }, { kyH: -3 }])).toEqual({ kbH: -3, kyH: -3 });
    expect(addEffects([])).toEqual({});
  });

  it("pendAccKeys — 항목이 있는 계좌 키 · SETTLEMENT_ACCOUNTS 순서", () => {
    const pend: SettlementPend = {
      kbH: { deltaKrw: -1, targetKrw: null, reason: "unreachable" },
      kbG: { deltaKrw: 1, targetKrw: 2, reason: "timeout" },
    };
    expect(pendAccKeys(pend)).toEqual(["kbG", "kbH"]);
    expect(pendAccKeys({})).toEqual([]);
  });
});

describe("reconcilePend · appliedEffectAt (Pitfall 2 목표값 대조 · CR-01)", () => {
  // 계좌 옮김 kbG → kyH 4억 · 두 계좌 모두 timeout(보냈는데 응답만 못 받음) · 목표값 kbG 445,000,000 · kyH 1,084,000,000.
  const move = tx({
    kind: "move",
    fromAcc: "kbG",
    toAcc: "kyH",
    amountKrw: 400_000_000,
    pend: {
      kbG: { deltaKrw: -400_000_000, targetKrw: 445_000_000, reason: "timeout" },
      kyH: { deltaKrw: 400_000_000, targetKrw: 1_084_000_000, reason: "timeout" },
    },
  });

  it("지금 값 = 목표값 → 들어감(pend 에서 뺌) · 다름 → 남김", () => {
    const r = reconcilePend(move.pend, { kbG: 445_000_000, kyH: 684_000_000 });
    expect(r.landed).toEqual(["kbG"]);
    expect(r.unknown).toEqual([]);
    expect(r.pend).toEqual({ kyH: move.pend.kyH });
    // appliedEffect 만 쓰면 두 계좌 다 「안 들어감」 → {} — 대조를 거치면 kbG −4억은 들어간 것.
    expect(appliedEffect(move)).toEqual({});
    expect(appliedEffectAt(move, { kbG: 445_000_000, kyH: 684_000_000 })).toEqual({ kbG: -400_000_000 });
  });

  it("둘 다 목표값 → 그 거래 증감 전체가 들어감", () => {
    expect(appliedEffectAt(move, { kbG: 445_000_000, kyH: 1_084_000_000 })).toEqual({ kbG: -400_000_000, kyH: 400_000_000 });
  });

  it("보냈지만 지금 못 읽음 → unknown · pend 에 남김 · unknownApplied 면 「들어갔을 수 있음」 으로 센다", () => {
    const r = reconcilePend(move.pend, { kbG: 845_000_000 });
    expect(r.unknown).toEqual(["kyH"]);
    expect(r.pend).toEqual(move.pend);
    expect(appliedEffectAt(move, { kbG: 845_000_000 })).toEqual({});
    expect(appliedEffectAt(move, { kbG: 845_000_000 }, { unknownApplied: true })).toEqual({ kyH: 400_000_000 });
  });

  it("목표값 없음(보내지 않음 — 못 읽음 · 1원 미만 · 서버 없음) → 지금 값과 무관하게 안 들어감 · unknown 도 아님", () => {
    const pend: SettlementPend = { kbG: { deltaKrw: 100_000_000, targetKrw: null, reason: "unreachable" } };
    const row = tx({ kind: "contribute", toAcc: "kbG", amountKrw: 100_000_000, pend });
    expect(reconcilePend(pend, {})).toEqual({ pend, landed: [], unknown: [] });
    expect(appliedEffectAt(row, {}, { unknownApplied: true })).toEqual({});
  });

  it("반영 안 한 줄 · null → {}", () => {
    expect(appliedEffectAt(null, {})).toEqual({});
    expect(appliedEffectAt({ ...move, reflect: false }, { kbG: 445_000_000, kyH: 1_084_000_000 })).toEqual({});
  });

  it("nowBudgetsOfReads — 읽은 값 그대로(0 포함) · nowBudgetsOfAccounts — known 만(stale · unset 제외)", () => {
    expect(nowBudgetsOfReads([{ accKey: "kbG", budgetKrw: 0 }, { accKey: "kyH", budgetKrw: 5 }])).toEqual({ kbG: 0, kyH: 5 });
    const acc = (accKey: SettlementAccountView["accKey"], state: SettlementAccountView["state"], budgetKrw: number | null) =>
      ({ accKey, label: "", owner: "H", pool: "p1", state, budgetKrw, readAt: null, mismatch: false }) as SettlementAccountView;
    expect(
      nowBudgetsOfAccounts([acc("kbG", "known", 445_000_000), acc("kyH", "stale", 684_000_000), acc("kyG", "unset", null)]),
    ).toEqual({ kbG: 445_000_000 });
  });
});

describe("isSettlementMarketHours (R16 · D-13 — 평일 KST 08:00 ~ 20:00)", () => {
  it("금요일 경계 — 07:59 false · 08:00 true · 19:59 true · 20:00 false", () => {
    expect(isSettlementMarketHours(new Date("2026-11-19T22:59:00Z"))).toBe(false);
    expect(isSettlementMarketHours(new Date("2026-11-19T23:00:00Z"))).toBe(true);
    expect(isSettlementMarketHours(new Date("2026-11-20T10:59:00Z"))).toBe(true);
    expect(isSettlementMarketHours(new Date("2026-11-20T11:00:00Z"))).toBe(false);
  });

  it("15:30 뒤 NXT 시간도 장중(기존 장 판정과 다르다)", () => {
    expect(isSettlementMarketHours(new Date("2026-11-20T07:00:00Z"))).toBe(true);
  });

  it("토요일 10:00 false", () => {
    expect(isSettlementMarketHours(new Date("2026-11-21T01:00:00Z"))).toBe(false);
  });

  it("UTC 자정 근처도 KST 기준 — 목 23:30Z = 금 08:30 true · 금 15:30Z = 토 00:30 false", () => {
    expect(isSettlementMarketHours(new Date("2026-11-19T23:30:00Z"))).toBe(true);
    expect(isSettlementMarketHours(new Date("2026-11-20T15:30:00Z"))).toBe(false);
  });
});
