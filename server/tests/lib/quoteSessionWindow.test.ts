import { describe, it, expect } from "vitest";
import { isQuoteSessionWindow } from "../../src/lib/quoteSessionWindow";

/**
 * quick 261001-bnc — server 상세 on-demand stock_quotes upsert 게이트.
 * KRX 거래일(KST 평일 · isKrxHoliday 아님) AND 08:00 ≤ KST < 20:00.
 * 입력은 전부 +09:00 오프셋 포함 — 실행 머신 TZ 무관.
 */
describe("isQuoteSessionWindow", () => {
  const at = (iso: string) => isQuoteSessionWindow(new Date(iso));

  it("2026-10-01(목) 07:59 → false (창 시작 전)", () => {
    expect(at("2026-10-01T07:59:00+09:00")).toBe(false);
  });

  it("2026-10-01(목) 08:00 → true (시작 포함)", () => {
    expect(at("2026-10-01T08:00:00+09:00")).toBe(true);
  });

  it("2026-10-01(목) 19:59 → true", () => {
    expect(at("2026-10-01T19:59:00+09:00")).toBe(true);
  });

  it("2026-10-01(목) 20:00 → false (종료 미포함)", () => {
    expect(at("2026-10-01T20:00:00+09:00")).toBe(false);
  });

  it("2026-10-01(목) 00:28 → false (261001 사고 시각)", () => {
    expect(at("2026-10-01T00:28:00+09:00")).toBe(false);
  });

  it("2026-10-03(토) 10:00 → false", () => {
    expect(at("2026-10-03T10:00:00+09:00")).toBe(false);
  });

  it("2026-10-04(일) 10:00 → false", () => {
    expect(at("2026-10-04T10:00:00+09:00")).toBe(false);
  });

  it("2026-10-05(월, 개천절 대체공휴일) 10:00 → false", () => {
    expect(at("2026-10-05T10:00:00+09:00")).toBe(false);
  });

  it("2026-10-06(화) 10:00 → true", () => {
    expect(at("2026-10-06T10:00:00+09:00")).toBe(true);
  });
});
