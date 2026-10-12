/**
 * Phase 31 — gh-trade LimitChaserForm.cs 5691~5757 이식 검증(`QtyFromAmount` · `QtyForSubmit` · `NarrowQty` · `AmountFromQty` ·
 * `AmountOrDerive`). 수치는 UI-SPEC 「예시 수치 정정」 표(CONTEXT · 목업 예시는 10배 틀림 — Pitfall 4).
 *
 * 제출은 내림(floor) · 표시 역산은 반올림((주×가격+5000)÷10000 정수 나눗셈) 한 번뿐이다.
 */
import { describe, expect, it } from "vitest";

import type { RelayLimitChaser } from "../relay";
import {
  LC_AMOUNT_MAX_MANWON,
  LC_AMOUNT_PAIRS,
  LC_QTY_WIRE_MAX,
  amountEchoIsAmbiguous,
  amountEchoMatches,
  amountFromQty,
  amountOrDerive,
  echoAmountOf,
  formatManwon,
  formatQtyAmt,
  lcAmountPairOf,
  narrowQty,
  qtyForSubmit,
  qtyAmt,
  qtyFromAmount,
  type LcAmountPair,
} from "../lc-amount";

/** 에코 한 건 — 이 테스트가 읽는 필드만 채운다(나머지는 판정에 쓰이지 않는다). */
function echo(over: Partial<RelayLimitChaser>): RelayLimitChaser {
  return {
    buyWatchPrice: 0,
    sellWatchPrice: 0,
    sellQtyTrackEnabled: false,
    sellQtyTrackBaseline: 0,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    ...over,
  } as RelayLimitChaser;
}

function pairOf(amount: string): LcAmountPair {
  const pair = lcAmountPairOf(amount);
  if (pair === undefined) throw new Error(`쌍 없음: ${amount}`);
  return pair;
}

describe("P31 qtyFromAmount · amountFromQty — 정정표 (UI-SPEC 예시 수치 정정)", () => {
  it.each([
    { price: 12_870, manwon: 1000, qty: 777 },
    { price: 12_870, manwon: 1001, qty: 777 },
    { price: 12_870, manwon: 500, qty: 388 },
    { price: 12_870, manwon: 2000, qty: 1554 },
    { price: 12_870, manwon: 1500, qty: 1165 },
    { price: 12_870, manwon: 84, qty: 65 },
    { price: 12_870, manwon: 10_000, qty: 7770 },
    { price: 127_400, manwon: 12, qty: 0 },
    { price: 127_400, manwon: 13, qty: 1 },
  ])("$manwon만 @ $price원 → $qty주(내림)", ({ price, manwon, qty }) => {
    expect(qtyFromAmount(manwon, price)).toBe(qty);
  });

  it.each([
    { qty: 777, price: 12_870, manwon: 1000 },
    { qty: 25_000, price: 12_870, manwon: 32_175 },
    { qty: 1, price: 127_400, manwon: 13 },
    { qty: 1554, price: 12_870, manwon: 2000 },
  ])("$qty주 @ $price원 → $manwon만(반올림 역산)", ({ qty, price, manwon }) => {
    expect(amountFromQty(qty, price)).toBe(manwon);
  });

  it("비교가 0 · 음수는 0주 — 나눗셈을 하지 않는다", () => {
    expect(qtyFromAmount(1000, 0)).toBe(0);
    expect(qtyFromAmount(1000, -1)).toBe(0);
  });

  it("amountFromQty — 주 0 · 가격 0 이면 0", () => {
    expect(amountFromQty(0, 12_870)).toBe(0);
    expect(amountFromQty(777, 0)).toBe(0);
  });

  it("amountFromQty — 주×가격이 2^53 을 넘으면 BigInt 경로로 정확히 계산한다(Pitfall 14)", () => {
    expect(Number.isSafeInteger(2_147_483_647 * 5_000_000)).toBe(false);
    expect(amountFromQty(2_147_483_647, 5_000_000)).toBe(1_073_741_823_500);
  });

  it("amountFromQty — 곱은 안전 정수지만 + 5000 이 2^53 을 넘으면 BigInt 경로와 같은 값(IN-05 경계)", () => {
    const price = Number.MAX_SAFE_INTEGER; // 2^53 − 1 — 곱(주 1)은 안전 정수, + 5000 은 아니다.
    expect(Number.isSafeInteger(1 * price)).toBe(true);
    expect(Number.isSafeInteger(price + 5_000)).toBe(false);
    expect(amountFromQty(1, price)).toBe(Number((BigInt(price) + 5_000n) / 10_000n));
  });
});

describe("P31 narrowQty — C# NarrowQty 동형(int.MaxValue 에서 자른다 · Pitfall 5)", () => {
  it.each([
    { raw: 2_147_483_648, out: 2_147_483_647 },
    { raw: qtyFromAmount(999_999_999, 1), out: 2_147_483_647 },
    { raw: 0, out: 0 },
    { raw: -5, out: 0 },
    { raw: 777, out: 777 },
  ])("$raw → $out", ({ raw, out }) => {
    expect(narrowQty(raw)).toBe(out);
  });

  it("상한 상수는 int.MaxValue 다(uint32 아님)", () => {
    expect(LC_QTY_WIRE_MAX).toBe(2_147_483_647);
    expect(LC_AMOUNT_MAX_MANWON).toBe(999_999_999);
  });
});

describe("P31 amountOrDerive — 짝이면 원값 · 아니면 역산 (D-06)", () => {
  it.each([
    { name: "짝(floor 777 = 에코 주) → 원값 1001", amount: 1001, qty: 777, price: 12_870, out: 1001 },
    { name: "짝 1000/777 → 원값", amount: 1000, qty: 777, price: 12_870, out: 1000 },
    { name: "짝 아님(776) → 역산 999", amount: 1000, qty: 776, price: 12_870, out: 999 },
    { name: "비교가 0 → 원값", amount: 500, qty: 0, price: 0, out: 500 },
    { name: "금액 0(구 서버) → 역산 1000", amount: 0, qty: 777, price: 12_870, out: 1000 },
    { name: "금액 0 ∧ 비교가 0 → 0", amount: 0, qty: 777, price: 0, out: 0 },
  ])("$name", ({ amount, qty, price, out }) => {
    expect(amountOrDerive(amount, qty, price)).toBe(out);
  });
});

describe("P31 LC_AMOUNT_PAIRS — 8쌍 표 한 벌 (D-01 나열 순서 · 그룹 비교가)", () => {
  it("8쌍이다", () => {
    expect(LC_AMOUNT_PAIRS.length).toBe(8);
  });

  it("8쌍이고 D-01 나열 순서다", () => {
    expect(LC_AMOUNT_PAIRS.map((p) => [p.amount, p.qty])).toEqual([
      ["buyWatchAmount", "buyWatchQty"],
      ["buyMinTradeAmount", "buyMinTradeQty"],
      ["extraBuyMinAmount", "extraBuyMinQty"],
      ["extraBuyMaxAmount", "extraBuyMaxQty"],
      ["postBuyFloorAmount", "postBuyFloorQty"],
      ["sellWatchAmount", "sellWatchQty"],
      ["sellMinTradeAmount", "sellMinTradeQty"],
      ["cancelWatchAmount", "cancelWatchQty"],
    ]);
  });

  it("매수 5쌍 = buyWatchPrice · 매도 · 취소 3쌍 = sellWatchPrice", () => {
    const pairs = LC_AMOUNT_PAIRS as readonly LcAmountPair[];
    expect(pairs.slice(0, 5).every((p) => p.price === "buyWatchPrice")).toBe(true);
    expect(pairs.slice(5).every((p) => p.price === "sellWatchPrice")).toBe(true);
  });

  it("track/baseline 은 매도 매수잔량 · 취소 매수잔량 쌍에만 있다", () => {
    const tracked = (LC_AMOUNT_PAIRS as readonly LcAmountPair[]).filter((p) => p.track !== undefined);
    expect(tracked.map((p) => [p.amount, p.track, p.baseline])).toEqual([
      ["sellWatchAmount", "sellQtyTrackEnabled", "sellQtyTrackBaseline"],
      ["cancelWatchAmount", "cancelQtyTrackEnabled", "cancelQtyTrackBaseline"],
    ]);
  });

  it("lcAmountPairOf — 금액 키 · 짝 주 키 둘 다 찾고 그 밖 키는 undefined", () => {
    expect(lcAmountPairOf("cancelWatchAmount")?.qty).toBe("cancelWatchQty");
    expect(lcAmountPairOf("postBuyFloorQty")?.amount).toBe("postBuyFloorAmount");
    expect(lcAmountPairOf("buyOrderAmount")).toBeUndefined();
    expect(lcAmountPairOf("sellWatchPrice")).toBeUndefined();
  });
});

describe("P31 echoAmountOf — 에코 적용값(C# ApplyServerConfig + RememberEchoQty)", () => {
  it("추적 OFF · 짝 → shown = 에코 금액 원값 · qty = 에코 주", () => {
    const s = echo({ sellWatchPrice: 12_870, sellWatchQty: 777, sellWatchAmount: 1001 });
    expect(echoAmountOf(s, pairOf("sellWatchAmount"))).toEqual({ shown: 1001, qty: 777, price: 12_870 });
  });

  it("추적 OFF · 구 서버(금액 0) → shown = 역산(500만 → 388주 → 499만 · 왕복은 몇 주만큼 어긋날 수 있다)", () => {
    const s = echo({ buyWatchPrice: 12_870, buyMinTradeQty: 388, buyMinTradeAmount: 0 });
    expect(echoAmountOf(s, pairOf("buyMinTradeAmount"))).toEqual({ shown: 499, qty: 388, price: 12_870 });
  });

  it("매도 추적 ON → shown = 기준선 역산 · qty = 기준선", () => {
    const s = echo({
      sellWatchPrice: 12_870,
      sellWatchQty: 777,
      sellWatchAmount: 1000,
      sellQtyTrackEnabled: true,
      sellQtyTrackBaseline: 1554,
    });
    expect(echoAmountOf(s, pairOf("sellWatchAmount"))).toEqual({ shown: 2000, qty: 1554, price: 12_870 });
  });

  it("취소 추적 ON → shown = 기준선 역산 · qty = 기준선", () => {
    const s = echo({
      sellWatchPrice: 12_870,
      cancelWatchQty: 777,
      cancelWatchAmount: 1000,
      cancelQtyTrackEnabled: true,
      cancelQtyTrackBaseline: 1165,
    });
    // 1165주 × 12,870원 = 14,993,550 → (+5000)÷10000 = 1499만(1500만 → 1165주 왕복 손실).
    expect(echoAmountOf(s, pairOf("cancelWatchAmount"))).toEqual({ shown: 1499, qty: 1165, price: 12_870 });
  });

  it("매도 추적 ON 은 매도 체결 쌍에 영향이 없다(track 없는 쌍)", () => {
    const s = echo({
      sellWatchPrice: 12_870,
      sellMinTradeQty: 388,
      sellMinTradeAmount: 500,
      sellQtyTrackEnabled: true,
      sellQtyTrackBaseline: 9999,
    });
    expect(echoAmountOf(s, pairOf("sellMinTradeAmount"))).toEqual({ shown: 500, qty: 388, price: 12_870 });
  });

  it("shown 은 999,999,999 에서 멈춘다(C# Clamp)", () => {
    const s = echo({ buyWatchPrice: 5_000_000, buyWatchQty: 2_147_483_647, buyWatchAmount: 0 });
    expect(echoAmountOf(s, pairOf("buyWatchAmount")).shown).toBe(LC_AMOUNT_MAX_MANWON);
  });
});

describe("P31 qtyForSubmit — 에코 메모 되싣기 · 아니면 내림", () => {
  const memo = { shown: 2000, qty: 1554, price: 12_870 };
  it.each([
    { name: "칸 · 비교가가 에코 그대로 → 서버 주(기준선)", amount: 2000, price: 12_870, echo: memo, out: 1554 },
    { name: "칸 2001 → 내림 1554", amount: 2001, price: 12_870, echo: memo, out: 1554 },
    { name: "비교가 12,880 → 내림 1552", amount: 2000, price: 12_880, echo: memo, out: 1552 },
    { name: "echo null(미등록) → 내림 777", amount: 1000, price: 12_870, echo: null, out: 777 },
    { name: "메모 주도 int.MaxValue 로 좁힌다", amount: 5, price: 1, echo: { shown: 5, qty: 3_000_000_000, price: 1 }, out: 2_147_483_647 },
  ])("$name", ({ amount, price, echo: e, out }) => {
    expect(qtyForSubmit(amount, price, e)).toBe(out);
  });
});

describe("P31 amountEchoMatches — 짝 성공 판정 (Pitfall 1 · RESEARCH A6)", () => {
  const pair = (): LcAmountPair => pairOf("sellWatchAmount");
  const sent = { amount: 1000, qty: 777 };
  it.each([
    { name: "구 서버(금액 0 · 주 일치) → 성공", qty: 777, amount: 0, out: true },
    { name: "새 서버(금액 원값 · 주 일치) → 성공", qty: 777, amount: 1000, out: true },
    { name: "주 불일치 → 실패", qty: 776, amount: 0, out: false },
    { name: "금액이 다른 값 → 실패", qty: 777, amount: 500, out: false },
  ])("$name", ({ qty, amount, out }) => {
    const s = echo({ sellWatchPrice: 12_870, sellWatchQty: qty, sellWatchAmount: amount });
    expect(amountEchoMatches(s, pair(), sent)).toBe(out);
  });

  it("IN-02 금액을 아는 서버(다른 칸 금액 > 0)의 금액 0 · 같은 주 에코는 성공이 아니다 — 답보다 먼저 온 옛 푸시", () => {
    const s = echo({ sellWatchPrice: 12_870, sellWatchQty: 777, sellWatchAmount: 0, buyWatchAmount: 300 });
    expect(amountEchoMatches(s, pair(), sent)).toBe(false);
    // 답 에코(금액 원값)는 성공 · 0 을 보낸 확정은 금액 0 에코로 성공이다.
    expect(amountEchoMatches({ ...s, sellWatchAmount: 1000 }, pair(), sent)).toBe(true);
    expect(amountEchoMatches(s, pair(), { amount: 0, qty: 777 })).toBe(true);
  });

  it("31-REVIEW-R3 R3-WR-01 amountEchoIsAmbiguous — 주 일치 · 금액 0 · 금액을 아는 서버 · 보낸 금액 ≠ 0 일 때만 참", () => {
    const s = echo({ sellWatchPrice: 12_870, sellWatchQty: 777, sellWatchAmount: 0, buyWatchAmount: 300 });
    expect(amountEchoIsAmbiguous(s, pair(), sent)).toBe(true);
    // 금액을 모르는 서버(8필드 모두 0)는 matches 가 이미 참 — 모호하지 않다.
    expect(amountEchoIsAmbiguous({ ...s, buyWatchAmount: 0 }, pair(), sent)).toBe(false);
    // 주 불일치 · 금액 원값 · 0 을 보낸 확정은 판정이 분명하다.
    expect(amountEchoIsAmbiguous({ ...s, sellWatchQty: 776 }, pair(), sent)).toBe(false);
    expect(amountEchoIsAmbiguous({ ...s, sellWatchAmount: 1000 }, pair(), sent)).toBe(false);
    expect(amountEchoIsAmbiguous(s, pair(), { amount: 0, qty: 777 })).toBe(false);
  });
});

describe("P31 주문로그 서식 (D-19 · gh-trade StrategyEventFormatter.cs 이식)", () => {
  it.each([
    { manwon: 0, out: "0만" },
    { manwon: 3999, out: "3999만" },
    { manwon: 9999, out: "9999만" },
    { manwon: 10_000, out: "1억" },
    { manwon: 10_449, out: "1억" },
    { manwon: 10_450, out: "1억" },
    { manwon: 10_500, out: "1.1억" },
    { manwon: 12_345, out: "1.2억" },
    { manwon: 100_000, out: "10억" },
    { manwon: 104_975, out: "10.5억" },
    { manwon: 999_999_999, out: "100000억" },
  ])("formatManwon($manwon) → $out", ({ manwon, out }) => {
    expect(formatManwon(manwon)).toBe(out);
  });

  it.each([
    { qty: 15_000, price: 1000, out: "1500만(15,000주)" },
    { qty: 10_000, price: 0, out: "10,000주" },
    { qty: 85_000, price: 12_350, out: "10.5억(85,000주)" },
    { qty: 100_000, price: 10_000, out: "10억(100,000주)" },
    { qty: 12_345, price: 10_000, out: "1.2억(12,345주)" },
    { qty: 0, price: 12_350, out: "0만(0주)" },
    { qty: 300, price: -1, out: "300주" },
  ])("formatQtyAmt($qty, $price) → $out", ({ qty, price, out }) => {
    expect(formatQtyAmt(qty, price)).toBe(out);
  });

  it.each([
    { qty: 0, price: 12_350, out: "0주" },
    { qty: 300, price: 12_350, out: "371만(300주)" },
    { qty: 30_000, price: 12_350, out: "3.7억(30,000주)" },
    { qty: 38_200, price: 12_350, out: "4.7억(38,200주)" },
    { qty: 50_000, price: 12_350, out: "6.2억(50,000주)" },
    { qty: 16_000, price: 12_350, out: "2억(16,000주)" },
    { qty: 3000, price: 12_350, out: "3705만(3,000주)" },
    { qty: 200, price: 12_350, out: "247만(200주)" },
    { qty: 100, price: 12_350, out: "124만(100주)" },
    { qty: 30_000, price: 13_000, out: "3.9억(30,000주)" },
    { qty: 5000, price: 13_000, out: "6500만(5,000주)" },
    { qty: 100, price: 13_000, out: "130만(100주)" },
    { qty: 5000, price: 0, out: "5,000주" },
  ])("qtyAmt($qty, $price) → $out", ({ qty, price, out }) => {
    expect(qtyAmt(qty, price)).toBe(out);
  });

  it("큰 값 — 주×가격이 2^53 을 넘으면 BigInt 경로 만원(1,073,741,823,500)으로 억 갈래를 쓴다", () => {
    // tenths = floor((1073741823500 + 500) / 1000) = 1073741824 → 107374182.4억
    expect(formatQtyAmt(2_147_483_647, 5_000_000)).toBe("107374182.4억(2,147,483,647주)");
  });

  it("폼 「1,000만」(천단위 · 억 없음)과 다른 함수다 — 1억 미만 만원에 천단위 구분을 넣지 않는다", () => {
    expect(formatManwon(1000)).toBe("1000만");
  });
});
