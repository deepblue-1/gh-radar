import { describe, it, expect } from "vitest";
import {
  todayBasDdKst,
  isoToBasDd,
  basDdToIso,
  iterateBusinessDays,
} from "../src/modes/businessDay";

describe("businessDay utils", () => {
  it("isoToBasDd 정상 변환", () => {
    expect(isoToBasDd("2026-05-09")).toBe("20260509");
    expect(isoToBasDd("2020-01-01")).toBe("20200101");
  });

  it("isoToBasDd 잘못된 형식이면 throw", () => {
    expect(() => isoToBasDd("2026/5/9")).toThrow();
    expect(() => isoToBasDd("2026-5-9")).toThrow();
  });

  it("basDdToIso 정상 변환", () => {
    expect(basDdToIso("20260509")).toBe("2026-05-09");
    expect(basDdToIso("20200101")).toBe("2020-01-01");
  });

  it("basDdToIso 8자 아니면 throw", () => {
    expect(() => basDdToIso("2026509")).toThrow();
  });

  it("todayBasDdKst 가 YYYYMMDD 8자 string 반환", () => {
    const today = todayBasDdKst();
    expect(today).toMatch(/^\d{8}$/);
  });

  it("iterateBusinessDays — 평일 5일 (월~금)", () => {
    // 2026-05-04 (월) ~ 2026-05-08 (금)
    const days = [...iterateBusinessDays("2026-05-04", "2026-05-08")];
    expect(days).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
    ]);
  });

  it("iterateBusinessDays — 주말 skip (금→월)", () => {
    // 2026-05-08 (금) ~ 2026-05-11 (월) — 토/일 skip
    const days = [...iterateBusinessDays("2026-05-08", "2026-05-11")];
    expect(days).toEqual(["2026-05-08", "2026-05-11"]);
  });

  it("iterateBusinessDays — from > to 빈 generator", () => {
    const days = [...iterateBusinessDays("2026-05-10", "2026-05-09")];
    expect(days).toEqual([]);
  });

  it("iterateBusinessDays — 6년 4개월 평일 ~1,650개 (한국 공휴일 미반영, ~75일 차이로 영업일 ~1,575)", () => {
    const days = [...iterateBusinessDays("2020-01-01", "2026-05-09")];
    // 6년 4개월 ≈ 1,650 평일 (휴장 calendar 없이 평일만 — 공휴일 ~75일 빼면 영업일 ~1,575)
    expect(days.length).toBeGreaterThan(1500);
    expect(days.length).toBeLessThan(1700);
  });
});
