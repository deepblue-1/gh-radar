import { describe, it, expect } from "vitest";
import { limitUpPrice } from "./limitUp";

/**
 * limitUpPrice() TS 미러 단위 테스트 — RPC plpgsql limit_up_price() 회귀 대조용.
 *
 * 상한가 가격 = floor(prev_close × 1.3 / tick(target)) × tick(target),
 * tick 은 **target 가격(prev_close×1.3)** 기준 7-tier 구간 (2023-01-25 개정표).
 * 실측 derivation (probe_tick3.cjs, 4-window 검증, RESEARCH §1 Pattern 1).
 */
describe("limitUpPrice (호가단위 TS 미러)", () => {
  it("실측 황금 케이스 — 4-window 검증된 6종", () => {
    // 95500 × 1.3 = 124150 → <200000 bucket=100 → floor(124150/100)*100 = 124100
    expect(limitUpPrice(95500)).toBe(124100);
    // 297000 × 1.3 = 386100 → <500000 bucket=500 → floor(386100/500)*500 = 386000
    expect(limitUpPrice(297000)).toBe(386000);
    // 386000 × 1.3 = 501800 → ≥500000 bucket=1000 → floor(501800/1000)*1000 = 501000 (500k 경계, Pitfall 1)
    expect(limitUpPrice(386000)).toBe(501000);
    // 876000 × 1.3 = 1138800 → ≥500000 bucket=1000 → floor(1138800/1000)*1000 = 1138000
    expect(limitUpPrice(876000)).toBe(1138000);
    // 60000 × 1.3 = 78000 → <200000 bucket=100 → floor(78000/100)*100 = 78000
    expect(limitUpPrice(60000)).toBe(78000);
  });

  it("tier 경계 직하/직상 — target 이 각 경계를 막 넘는 prev_close 에서 tick 전환", () => {
    // 경계 2000: target<2000 → tick=1, target≥2000 → tick=5
    // prev_close=1538 → tgt=1999.4 (<2000) → tick=1 → floor(1999.4/1)*1 = 1999
    expect(limitUpPrice(1538)).toBe(1999);
    // prev_close=1539 → tgt=2000.7 (≥2000) → tick=5 → floor(2000.7/5)*5 = 2000
    expect(limitUpPrice(1539)).toBe(2000);

    // 경계 5000: target<5000 → tick=5, target≥5000 → tick=10
    // prev_close=3845 → tgt=4998.5 (<5000) → tick=5 → floor(4998.5/5)*5 = 4995
    expect(limitUpPrice(3845)).toBe(4995);
    // prev_close=3847 → tgt=5001.1 (≥5000) → tick=10 → floor(5001.1/10)*10 = 5000
    expect(limitUpPrice(3847)).toBe(5000);

    // 경계 20000: target<20000 → tick=10, target≥20000 → tick=50
    // prev_close=15384 → tgt=19999.2 (<20000) → tick=10 → floor(19999.2/10)*10 = 19990
    expect(limitUpPrice(15384)).toBe(19990);
    // prev_close=15385 → tgt=20000.5 (≥20000) → tick=50 → floor(20000.5/50)*50 = 20000
    expect(limitUpPrice(15385)).toBe(20000);

    // 경계 50000: target<50000 → tick=50, target≥50000 → tick=100
    // prev_close=38461 → tgt=49999.3 (<50000) → tick=50 → floor(49999.3/50)*50 = 49950
    expect(limitUpPrice(38461)).toBe(49950);
    // prev_close=38462 → tgt=50000.6 (≥50000) → tick=100 → floor(50000.6/100)*100 = 50000
    expect(limitUpPrice(38462)).toBe(50000);

    // 경계 200000: target<200000 → tick=100, target≥200000 → tick=500
    // prev_close=153845 → tgt=199998.5 (<200000) → tick=100 → floor(199998.5/100)*100 = 199900
    expect(limitUpPrice(153845)).toBe(199900);
    // prev_close=153847 → tgt=200001.1 (≥200000) → tick=500 → floor(200001.1/500)*500 = 200000
    expect(limitUpPrice(153847)).toBe(200000);

    // 경계 500000: target<500000 → tick=500, target≥500000 → tick=1000
    // prev_close=384614 → tgt=499998.2 (<500000) → tick=500 → floor(499998.2/500)*500 = 499500
    expect(limitUpPrice(384614)).toBe(499500);
    // prev_close=384616 → tgt=500000.8 (≥500000) → tick=1000 → floor(500000.8/1000)*1000 = 500000
    expect(limitUpPrice(384616)).toBe(500000);
  });
});
