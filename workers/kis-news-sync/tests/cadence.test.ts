import { describe, expect, it } from "vitest";
import {
  FAST_WINDOW_END_MIN,
  FAST_WINDOW_START_MIN,
  fastWindowEndOf,
  isCleanupDue,
  kstDayOfWeek,
  kstMinuteOfDay,
  resolveCollectorMode,
} from "../src/pipeline/cadence";

/**
 * Phase 41-08 — 빠른 창 판정(D-02). 시각은 +9h 뒤 getUTC* 로만 계산한다(컨테이너 TZ 무관).
 * 2026-11-16 = 월요일 · 2026-11-13 = 금요일 · 2026-11-14 = 토요일.
 */
function kst(y: number, m: number, d: number, h: number, mi: number, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, mi, s));
}

describe("상수 · KST 분 · 요일", () => {
  it("빠른 창 = KST 07:00(420분) 이상 20:00(1200분) 미만", () => {
    expect(FAST_WINDOW_START_MIN).toBe(420);
    expect(FAST_WINDOW_END_MIN).toBe(1200);
  });

  it("kstMinuteOfDay · kstDayOfWeek 는 UTC 시각을 KST 로 옮겨 읽는다", () => {
    // UTC 일요일 22:00 = KST 월요일 07:00
    const at = new Date(Date.UTC(2026, 10, 15, 22, 0));
    expect(kstMinuteOfDay(at)).toBe(420);
    expect(kstDayOfWeek(at)).toBe(1);
  });
});

describe("resolveCollectorMode (auto)", () => {
  it("월 06:59 KST → slow", () => {
    expect(resolveCollectorMode(kst(2026, 11, 16, 6, 59), "auto")).toBe("slow");
  });

  it("월 07:00 KST → fast", () => {
    expect(resolveCollectorMode(kst(2026, 11, 16, 7, 0), "auto")).toBe("fast");
  });

  it("금 19:59 KST → fast", () => {
    expect(resolveCollectorMode(kst(2026, 11, 13, 19, 59), "auto")).toBe("fast");
  });

  it("금 20:00 KST → slow", () => {
    expect(resolveCollectorMode(kst(2026, 11, 13, 20, 0), "auto")).toBe("slow");
  });

  it("토 10:00 KST → slow", () => {
    expect(resolveCollectorMode(kst(2026, 11, 14, 10, 0), "auto")).toBe("slow");
  });

  it("UTC 일요일 22:00(= KST 월 07:00) → fast", () => {
    expect(resolveCollectorMode(new Date(Date.UTC(2026, 10, 15, 22, 0)), "auto")).toBe("fast");
  });
});

describe("resolveCollectorMode (설정 강제)", () => {
  it.each(["fast", "slow", "probe"] as const)("설정 %s 는 시각과 무관하게 그대로", (m) => {
    expect(resolveCollectorMode(kst(2026, 11, 14, 3, 0), m)).toBe(m);
    expect(resolveCollectorMode(kst(2026, 11, 16, 10, 0), m)).toBe(m);
  });
});

describe("fastWindowEndOf · isCleanupDue", () => {
  it("fastWindowEndOf(KST 월 09:00) = KST 월 20:00", () => {
    expect(fastWindowEndOf(kst(2026, 11, 16, 9, 0)).toISOString()).toBe(
      kst(2026, 11, 16, 20, 0).toISOString(),
    );
  });

  it("fastWindowEndOf 는 KST 자정 직후에도 그 KST 날의 20:00 (UTC 날짜와 다르다)", () => {
    // KST 화 00:30 = UTC 월 15:30
    expect(fastWindowEndOf(kst(2026, 11, 17, 0, 30)).toISOString()).toBe(
      kst(2026, 11, 17, 20, 0).toISOString(),
    );
  });

  it("isCleanupDue(now, null) 참", () => {
    expect(isCleanupDue(kst(2026, 11, 16, 20, 15), null)).toBe(true);
  });

  it("같은 KST 날짜면 거짓 · 다른 날짜면 참", () => {
    const at = kst(2026, 11, 17, 0, 15); // UTC 로는 11-16
    expect(isCleanupDue(at, "2026-11-17")).toBe(false);
    expect(isCleanupDue(at, "2026-11-16")).toBe(true);
  });
});
