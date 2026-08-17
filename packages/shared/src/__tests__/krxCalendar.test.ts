import { describe, it, expect } from "vitest";
import {
  KRX_HOLIDAYS,
  KRX_HOLIDAYS_SEEDED_THROUGH,
  isKrxHoliday,
  isKrxCalendarStale,
  kstDateIso,
} from "../krxCalendar";

/**
 * quick-260817-f1a — KRX 휴장일 캘린더(0차 가드).
 *
 * 배경: 2026-08-17(광복절 대체공휴일) 휴장일에 키움 ka10027 이 직전 거래일 + 시간외 보정
 * 스냅샷을 재방출해 값 비교 휴리스틱(staleGuard)을 뚫고 stock_daily_ohlcv 를 오염시켰다.
 * 캘린더는 비용 0 의 결정적 신호 — seed 오타는 정상 거래일 전량 skip(더 큰 사고)이므로
 * seed 내용 자체를 테스트로 고정한다 (T-f1a-05).
 */
describe("KRX_HOLIDAYS seed", () => {
  it("정확히 7일 seed (2026-08-17 + 잔여 6일)", () => {
    expect(KRX_HOLIDAYS).toHaveLength(7);
  });

  it("전부 YYYY-MM-DD 형식", () => {
    for (const d of KRX_HOLIDAYS) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("seed 종료일은 2026-12-31", () => {
    expect(KRX_HOLIDAYS_SEEDED_THROUGH).toBe("2026-12-31");
  });
});

describe("isKrxHoliday", () => {
  it("2026-08-17(광복절 대체공휴일, 사고 당일) → true", () => {
    expect(isKrxHoliday("2026-08-17")).toBe(true);
  });

  it.each([
    ["2026-09-24", "추석 연휴"],
    ["2026-09-25", "추석"],
    ["2026-10-05", "개천절 대체공휴일"],
    ["2026-10-09", "한글날"],
    ["2026-12-25", "성탄절"],
    ["2026-12-31", "연말 휴장"],
  ])("%s (%s) → true", (dateIso) => {
    expect(isKrxHoliday(dateIso)).toBe(true);
  });

  it("2026-08-18(정상 거래일) → false", () => {
    expect(isKrxHoliday("2026-08-18")).toBe(false);
  });

  it("2026-09-28 → false — 추석 대체공휴일 없음(연휴 겹침이 토요일 9/26 뿐)", () => {
    // RESEARCH §Q2 주의사항: 설·추석 연휴는 '일요일 겹침'만 대체공휴일 대상.
    expect(isKrxHoliday("2026-09-28")).toBe(false);
  });

  it("2027-01-01(미seed 구간) → false — 캘린더는 조용히 통과시킨다", () => {
    expect(isKrxHoliday("2027-01-01")).toBe(false);
  });
});

describe("isKrxCalendarStale", () => {
  it("2027-01-01 → true (seed 만료 감지, fail-loud)", () => {
    expect(isKrxCalendarStale("2027-01-01")).toBe(true);
  });

  it("2026-12-31(seed 마지막 날) → false", () => {
    expect(isKrxCalendarStale("2026-12-31")).toBe(false);
  });

  it("2026-08-17 → false", () => {
    expect(isKrxCalendarStale("2026-08-17")).toBe(false);
  });
});

describe("kstDateIso", () => {
  it("UTC 00:30 = KST 09:30 → 같은 날", () => {
    expect(kstDateIso(new Date("2026-08-17T00:30:00Z"))).toBe("2026-08-17");
  });

  it("UTC 16:00 = KST 익일 01:00 → 다음 날 (KST 자정 경계)", () => {
    expect(kstDateIso(new Date("2026-08-16T16:00:00Z"))).toBe("2026-08-17");
  });

  it("UTC 14:59 = KST 23:59 → 같은 날 (경계 직전)", () => {
    expect(kstDateIso(new Date("2026-08-17T14:59:00Z"))).toBe("2026-08-17");
  });
});
