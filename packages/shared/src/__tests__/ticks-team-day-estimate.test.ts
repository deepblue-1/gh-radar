/**
 * quick 261104-n9h (결정 1) 오늘 목록 추정 당일손익 — 매집감지 kind 16 당일 축(매수 · 매도 · 평단 · 순수량) + 현재가로
 * 순서 무시 근사. 화면은 「≈」 를 붙인다(격자 평균단가법과 정의가 다르다).
 *
 * 깨지면: 틱뷰어 오늘 목록 「당일손익」 이 평균단가법 손익과 크게 어긋나거나, 모르는 값을 0 으로 그린다.
 */
import { describe, it, expect } from "vitest";
import { estimateTeamDayPnl } from "../ticks/team-day-estimate";

const BASE = { buyKrw: 1_000_000_000, sellKrw: 550_000_000, avgPx: 10_000, netQty: 50_000, lastPx: 12_000 };

describe("estimateTeamDayPnl", () => {
  it("당일 매수 · 매도 금액 중 하나라도 null/undefined/비유한 → null", () => {
    expect(estimateTeamDayPnl({ ...BASE, buyKrw: null })).toBeNull();
    expect(estimateTeamDayPnl({ ...BASE, sellKrw: undefined })).toBeNull();
    expect(estimateTeamDayPnl({ ...BASE, buyKrw: Number.NaN })).toBeNull();
    expect(estimateTeamDayPnl({ ...BASE, sellKrw: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("당일 매수 · 매도 둘 다 0 → null(「—」)", () => {
    expect(estimateTeamDayPnl({ buyKrw: 0, sellKrw: 0, avgPx: 0, netQty: 0, lastPx: 12_000 })).toBeNull();
  });

  it("순수량 null → null", () => {
    expect(estimateTeamDayPnl({ ...BASE, netQty: null })).toBeNull();
  });

  it("순수량 ≥ 0 — 매도 − 매수 + 순수량 × 현재가(평균단가법 실현 5천만 + 미실현 1억과 같다)", () => {
    expect(estimateTeamDayPnl(BASE)).toBe(150_000_000);
  });

  it("순수량 0(전량 매도) — 현재가 불필요", () => {
    expect(
      estimateTeamDayPnl({ buyKrw: 100_000_000, sellKrw: 120_000_000, avgPx: 10_000, netQty: 0, lastPx: null }),
    ).toBe(20_000_000);
  });

  it("순수량 > 0 인데 현재가 null 또는 ≤ 0 → null", () => {
    expect(estimateTeamDayPnl({ ...BASE, lastPx: null })).toBeNull();
    expect(estimateTeamDayPnl({ ...BASE, lastPx: 0 })).toBeNull();
    expect(estimateTeamDayPnl({ ...BASE, lastPx: -1 })).toBeNull();
  });

  it("순수량 < 0(이월분까지 매도) — 오늘 산 몫만 매도 평균가로 실현", () => {
    // 매수 1만 주(1억 / 10,000) · 매도 2.5만 주(1만 − (−1.5만)) · 매도 평균 12,000 → 1만 × 12,000 − 1억
    expect(
      estimateTeamDayPnl({ buyKrw: 100_000_000, sellKrw: 300_000_000, avgPx: 10_000, netQty: -15_000, lastPx: 9_000 }),
    ).toBe(20_000_000);
  });

  it("순수량 < 0 ∧ 오늘 매수 없음 → 0", () => {
    expect(estimateTeamDayPnl({ buyKrw: 0, sellKrw: 100_000_000, avgPx: 0, netQty: -8_000, lastPx: 12_500 })).toBe(0);
  });

  it("결과는 늘 정수(원)", () => {
    // 매수 1억 / 평단 3,333 → 30,003주 · 매도 0.7억 · 순수량 −10,000 → 매도 40,003주
    const v = estimateTeamDayPnl({ buyKrw: 100_000_000, sellKrw: 70_000_000, avgPx: 3_333, netQty: -10_000, lastPx: 3_000 });
    expect(v).not.toBeNull();
    expect(Number.isInteger(v)).toBe(true);
    const w = estimateTeamDayPnl({ buyKrw: 100_000_001, sellKrw: 0.5, avgPx: 10_000, netQty: 3, lastPx: 10_000.4 });
    expect(Number.isInteger(w)).toBe(true);
  });
});
