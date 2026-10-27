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
import {
  availableKrwOf,
  BUDGET_MANWON_MAX,
  COST_PPM_MAX,
  formatManwon1,
  formatManwonFloor,
  formatPnlManwon,
  lcBuyAmountSumKrw,
  parseBudgetManwon,
  parseCostPct,
  pctToPpm,
  pnlToneOf,
  ppmToPct,
} from "../account-budget";

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

// ─── 36-10 표기 · 입력 · 상따 합 (UI-SPEC 「숫자 표기 계약」 · D-02 · D-13 · D-18 · Pitfall 13) ───

describe("formatPnlManwon · pnlToneOf — 절댓값 내림 후 부호(U+2212)", () => {
  it.each([
    [1_234_567, "+123만", "up"],
    [-12_345, "\u22121만", "down"], // −1만 — Math.floor(-1.2345) = −2 가 아니다
    [5_000, "+0만", "up"], // 부호 · 색은 원 값 기준
    [0, "0만", "flat"],
    [-123_456_789_000, "\u221212,345,678만", "down"],
  ] as const)("%d → %s · %s", (krw, text, tone) => {
    expect(formatPnlManwon(krw)).toBe(text);
    expect(pnlToneOf(krw)).toBe(tone);
  });

  it("음수 부호는 하이픈이 아니라 U+2212", () => {
    expect(formatPnlManwon(-12_345)).toBe("−1만");
    expect(formatPnlManwon(-12_345).startsWith("-")).toBe(false);
  });
});

describe("formatManwon1 — 소수 1자리 내림 · 부호 없음", () => {
  it.each([
    [16_400, "1.6만"],
    [10_000, "1만"],
    [800, "0만"],
    [12_345_600, "1,234.5만"],
    [-16_400, "1.6만"], // 음수는 절댓값
  ] as const)("%d → %s", (krw, text) => {
    expect(formatManwon1(krw)).toBe(text);
  });
});

describe("pctToPpm · ppmToPct — % ↔ ppm (D-02)", () => {
  it.each([
    [0.01, 100],
    [0.05, 500],
    [0.2, 2000],
    [1, 10_000],
  ] as const)("pctToPpm(%d) = %d", (pct, ppm) => {
    expect(pctToPpm(pct)).toBe(ppm);
  });

  it.each([
    [100, "0.01"],
    [2000, "0.2"],
    [125, "0.0125"],
    [0, "0"],
    [10_000, "1"],
    [500, "0.05"],
  ] as const)("ppmToPct(%d) = %s", (ppm, pct) => {
    expect(ppmToPct(ppm)).toBe(pct);
  });

  it("상한 상수 — 1% = 10,000ppm · 예수금 9자리 만원", () => {
    expect(COST_PPM_MAX).toBe(10_000);
    expect(BUDGET_MANWON_MAX).toBe(999_999_999);
  });
});

describe("parseCostPct — 비용률 % 입력(0~1% · 소수 넷째 자리까지)", () => {
  it.each([
    ["", 0],
    ["0.2", 2000],
    ["1", 10_000],
    [" 0.015 ", 150],
    ["0.0125", 125],
  ] as const)("%j → ok %d", (text, ppm) => {
    expect(parseCostPct(text)).toEqual({ ok: true, ppm });
  });

  it.each(["1.5", "-0.1", "0.00001", "abc", "0.2.1", "1.0001"])("%j → 실패", (text) => {
    expect(parseCostPct(text)).toEqual({ ok: false });
  });
});

describe("parseBudgetManwon — 예수금 만원 입력(9자리 · 콤마 허용)", () => {
  it.each([
    ["1,000", 10_000_000],
    ["", 0],
    ["0", 0],
    ["999,999,999", 9_999_999_990_000],
    [" 5 000 ", 50_000_000],
  ] as const)("%j → ok %d", (text, krw) => {
    expect(parseBudgetManwon(text)).toEqual({ ok: true, krw });
  });

  it.each(["1234567890", "12a", "-5", "1.5"])("%j → 실패", (text) => {
    expect(parseBudgetManwon(text)).toEqual({ ok: false });
  });
});

describe("lcBuyAmountSumKrw — 상따 매수 금액 합(D-13 · 자동 무장 그룹도 돈을 쓴다)", () => {
  const base = {
    buyOrderAmount: 100,
    extraBuyOrderAmount: 50,
    postBuyOrderAmount: 30,
    extraBuyEnabled: false,
    extraBuyAuto: false,
    postBuyEnabled: false,
    postBuyAuto: false,
  };

  it("선매수만 — 줄매수 · 후매수 꺼짐 → 선매수 금액만(만원 → 원)", () => {
    expect(lcBuyAmountSumKrw(base)).toBe(1_000_000);
  });

  it("줄매수 Enabled · 후매수 Auto → 셋 다 더한다", () => {
    expect(lcBuyAmountSumKrw({ ...base, extraBuyEnabled: true, postBuyAuto: true })).toBe(1_800_000);
  });

  it("줄매수 Auto · 후매수 Enabled → 셋 다 더한다", () => {
    expect(lcBuyAmountSumKrw({ ...base, extraBuyAuto: true, postBuyEnabled: true })).toBe(1_800_000);
  });

  it("줄매수만 켜짐 → 선매수 + 줄매수", () => {
    expect(lcBuyAmountSumKrw({ ...base, extraBuyEnabled: true })).toBe(1_500_000);
  });
});
