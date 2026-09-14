import { describe, expect, it } from "vitest";
import { previousTradingDate } from "./tradingDay";

/**
 * quick-260915-boq — 직전 거래일 계산 (공유 KRX 캘린더 + 주말 스킵).
 */
describe("previousTradingDate", () => {
  it("화 → 월", () => {
    expect(previousTradingDate("2026-09-15")).toBe("2026-09-14");
  });

  it("월 → 금 (주말 건너뜀)", () => {
    expect(previousTradingDate("2026-09-14")).toBe("2026-09-11");
  });

  it("추석 연휴 다음날(월) → 추석 전 수요일 (9/24·9/25 + 주말)", () => {
    expect(previousTradingDate("2026-09-28")).toBe("2026-09-23");
  });

  it("광복절 대체공휴일 다음날(화) → 금 (8/17 + 주말)", () => {
    expect(previousTradingDate("2026-08-18")).toBe("2026-08-14");
  });

  it("개천절 대체공휴일 다음날(화) → 금 (10/5 + 주말)", () => {
    expect(previousTradingDate("2026-10-06")).toBe("2026-10-02");
  });

  it("한글날(금) 뒤 월 → 목 (10/9 + 주말)", () => {
    expect(previousTradingDate("2026-10-12")).toBe("2026-10-08");
  });
});
