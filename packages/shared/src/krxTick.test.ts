import { describe, it, expect } from "vitest";
import { krxTickSize, tickUp, tickDown, priceInputIssue } from "./krxTick";

/**
 * krxTick 단위 테스트 — Phase 20 D-15 · D-17.
 *
 * 호가 단위 7구간(KRX 2023-01-25 개정) 의 정본은 krxTick.ts 한 곳이다.
 * limitUpPrice(limitUp.test.ts) 와 order-panel 의 호가 단위 폴백이 같은 함수를 부르므로,
 * 여기 경계가 곧 두 소비처의 경계다 — 직하/직상을 나란히 둔다.
 */
describe("krxTickSize (KRX 호가 단위 7구간)", () => {
  it("경계 2,000 — 직하 1원 · 직상 5원", () => {
    expect(krxTickSize(1999)).toBe(1);
    expect(krxTickSize(2000)).toBe(5);
  });

  it("경계 5,000 — 직하 5원 · 직상 10원", () => {
    expect(krxTickSize(4999)).toBe(5);
    expect(krxTickSize(5000)).toBe(10);
  });

  it("경계 20,000 — 직하 10원 · 직상 50원", () => {
    expect(krxTickSize(19999)).toBe(10);
    expect(krxTickSize(20000)).toBe(50);
  });

  it("경계 50,000 — 직하 50원 · 직상 100원", () => {
    expect(krxTickSize(49999)).toBe(50);
    expect(krxTickSize(50000)).toBe(100);
  });

  it("경계 200,000 — 직하 100원 · 직상 500원", () => {
    expect(krxTickSize(199999)).toBe(100);
    expect(krxTickSize(200000)).toBe(500);
  });

  it("경계 500,000 — 직하 500원 · 직상 1,000원(그 이상 전부 1,000)", () => {
    expect(krxTickSize(499999)).toBe(500);
    expect(krxTickSize(500000)).toBe(1000);
    expect(krxTickSize(1274000)).toBe(1000);
  });

  it("0 · 음수 · 비유한수는 1원(옛 order-panel 폴백 `price <= 0 → 1` 과 동치)", () => {
    expect(krxTickSize(0)).toBe(1);
    expect(krxTickSize(-5)).toBe(1);
    expect(krxTickSize(Number.NaN)).toBe(1);
    expect(krxTickSize(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("limitUp 의 float target(1538 × 1.3 = 1999.4)도 2,000 미만이므로 1원", () => {
    expect(krxTickSize(1999.4)).toBe(1);
  });
});

describe("tickUp (+1호가 = v + tick(v))", () => {
  it("1,999 → 2,000 (구간을 넘어가도 v 기준 단위 1)", () => {
    expect(tickUp(1999)).toBe(2000);
  });

  it("2,000 → 2,005 · 98,100 → 98,200", () => {
    expect(tickUp(2000)).toBe(2005);
    expect(tickUp(98100)).toBe(98200);
  });

  it("499,500 → 500,000 (500원 구간의 마지막 호가)", () => {
    expect(tickUp(499500)).toBe(500000);
  });

  it("0 → 1 (빈 값에서 +1호가)", () => {
    expect(tickUp(0)).toBe(1);
  });
});

describe("tickDown (−1호가 = max(0, v − tick(v−1)))", () => {
  it("2,000 → 1,999 (한 칸 아래는 1원 구간)", () => {
    expect(tickDown(2000)).toBe(1999);
  });

  it("2,005 → 2,000 · 5,000 → 4,995 · 50,000 → 49,950", () => {
    expect(tickDown(2005)).toBe(2000);
    expect(tickDown(5000)).toBe(4995);
    expect(tickDown(50000)).toBe(49950);
  });

  it("0 → 0 · 1 → 0 (음수로 내려가지 않는다)", () => {
    expect(tickDown(0)).toBe(0);
    expect(tickDown(1)).toBe(0);
  });
});

describe("priceInputIssue (입력 보조 검증 · 자동 보정 없음)", () => {
  it("빈 값(0)은 검증하지 않는다", () => {
    expect(priceInputIssue(0, 127400)).toBeNull();
  });

  it("단위에 맞고 상한 이하면 문제 없음", () => {
    expect(priceInputIssue(98100, 127400)).toBeNull();
  });

  it("단위 불일치 — 가까운 두 값(아래 = floor(v/t)·t · 위 = 아래 + t)", () => {
    // 98,150 → 100원 구간 · floor(981.5) = 981 → 98,100 / 98,200
    expect(priceInputIssue(98150, 127400)).toEqual({
      kind: "offTick",
      tick: 100,
      lower: 98100,
      upper: 98200,
    });
  });

  it("상한가 초과 — overUpper", () => {
    expect(priceInputIssue(127500, 127400)).toEqual({ kind: "overUpper", upper: 127400 });
  });

  it("상한가 초과이면서 단위도 불일치이면 overUpper 가 이긴다", () => {
    // 127,450 은 100원 단위도 아니지만 상한 초과가 먼저 보고된다
    expect(priceInputIssue(127450, 127400)).toEqual({ kind: "overUpper", upper: 127400 });
  });

  it("상한 0(시세 미수신)이면 초과 검사를 건너뛰고 단위만 본다", () => {
    expect(priceInputIssue(999900, 0)).toBeNull();
    expect(priceInputIssue(999950, 0)).toEqual({
      kind: "offTick",
      tick: 1000,
      lower: 999000,
      upper: 1000000,
    });
  });

  it("2,003 → 5원 단위 불일치 · 가까운 값 2,000 / 2,005", () => {
    expect(priceInputIssue(2003, 127400)).toEqual({
      kind: "offTick",
      tick: 5,
      lower: 2000,
      upper: 2005,
    });
  });

  it("입력 값을 바꾸지 않는다 — 돌려주는 것은 이유뿐이다", () => {
    const v = 98150;
    const issue = priceInputIssue(v, 127400);
    expect(v).toBe(98150);
    expect(issue).not.toHaveProperty("value");
  });
});
