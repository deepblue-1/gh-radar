/**
 * Phase 36 — 주문가능 계산 · 만원 내림 표기 검증.
 *
 * 출처: gh-trade 인박스 `261027-account-budget.md` 「계산식」(WinForms 동형) · 36-UI-SPEC 「숫자 표기 계약」.
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 미설정 | budget 0 · 없음 | null |
 * | 기본 | 보유 10주×평단 10,000 + 매수 미체결 10주×5,000 | budget − 150,000 |
 * | 매도 미체결 | side S | 빼지 않음 |
 * | 취소 송신 | pendingCancelSent | 빼지 않음 |
 * | 시장가 | price 0 + priceOf 7,000 | 7,000 으로 계산 · priceOf 없으면 0 |
 * | 평단 소수 | 10,000.5 | 그대로 곱함 |
 * | 초과 | used > budget | 음수 그대로 |
 */
import { describe, expect, it } from "vitest";

import type { RelayHolding, RelayUnfilled } from "../relay";
import { availableKrwOf, formatManwonFloor } from "../account-budget";

const ISIN_A = "KR7005930003";
const ISIN_B = "KR7000660001";

function hold(over: Partial<RelayHolding> = {}): RelayHolding {
  return { isin: ISIN_A, qty: 10, sellableQty: 10, avgPrice: 10_000, ...over };
}

function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo: "ORD0000001",
    orgOrderNo: "",
    isin: ISIN_A,
    side: "B",
    price: 5_000,
    orderQty: 10,
    filledQty: 0,
    unfilledQty: 10,
    exchange: "KRX",
    orderTime: "093015",
    queuedStatus: "",
    pendingStatus: "",
    board: "",
    pendingCancelSent: false,
    ...over,
  };
}

describe("availableKrwOf", () => {
  it("예수금 0 · 없음 = 미설정(null)", () => {
    expect(availableKrwOf({ hold: [hold()], unf: [], budgetKrw: 0 })).toBeNull();
    expect(availableKrwOf({ hold: [hold()], unf: [] })).toBeNull();
  });

  it("보유 10주×평단 10,000 + 매수 미체결 10주×5,000 → budget − 150,000", () => {
    expect(availableKrwOf({ hold: [hold()], unf: [unf()], budgetKrw: 1_000_000 })).toBe(850_000);
  });

  it("매도 미체결은 빼지 않는다", () => {
    expect(availableKrwOf({ hold: [], unf: [unf({ side: "S" })], budgetKrw: 1_000_000 })).toBe(1_000_000);
  });

  it("pendingCancelSent 매수 미체결은 빼지 않는다", () => {
    expect(
      availableKrwOf({ hold: [], unf: [unf({ pendingCancelSent: true })], budgetKrw: 1_000_000 }),
    ).toBe(1_000_000);
  });

  it("price 0(시장가) 매수 미체결은 priceOf 현재가로 센다", () => {
    const priceOf = (isin: string) => (isin === ISIN_B ? 7_000 : undefined);
    expect(
      availableKrwOf({ hold: [], unf: [unf({ isin: ISIN_B, price: 0 })], budgetKrw: 1_000_000 }, priceOf),
    ).toBe(930_000);
  });

  it("price 0 · priceOf 없음(또는 현재가 모름) → 0 으로 센다", () => {
    expect(availableKrwOf({ hold: [], unf: [unf({ price: 0 })], budgetKrw: 1_000_000 })).toBe(1_000_000);
    expect(
      availableKrwOf({ hold: [], unf: [unf({ price: 0 })], budgetKrw: 1_000_000 }, () => undefined),
    ).toBe(1_000_000);
  });

  it("평단 소수(10,000.5)는 그대로 곱한다", () => {
    expect(availableKrwOf({ hold: [hold({ avgPrice: 10_000.5 })], unf: [], budgetKrw: 1_000_000 })).toBe(
      1_000_000 - 100_005,
    );
  });

  it("초과는 음수 그대로 돌려준다", () => {
    expect(availableKrwOf({ hold: [hold()], unf: [unf()], budgetKrw: 100_000 })).toBe(-50_000);
  });

  it("예약 요약 · 접수대기 매수 행도 거르지 않는다", () => {
    expect(
      availableKrwOf({
        hold: [],
        unf: [unf({ queuedStatus: "예약", exchange: "NXT" }), unf({ orderNo: "ORD0000002", pendingStatus: "접수대기" })],
        budgetKrw: 1_000_000,
      }),
    ).toBe(900_000);
  });
});

describe("formatManwonFloor", () => {
  it("만원 내림 · ko-KR 콤마 · 억 없음", () => {
    expect(formatManwonFloor(12_345_678)).toBe("1,234만");
    expect(formatManwonFloor(0)).toBe("0만");
    expect(formatManwonFloor(1_234_567_890_000)).toBe("123,456,789만");
  });

  it("9,999 → 「0만」 · 음수 → 「0만」", () => {
    expect(formatManwonFloor(9_999)).toBe("0만");
    expect(formatManwonFloor(-50_000)).toBe("0만");
  });
});
