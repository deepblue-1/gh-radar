import { describe, it, expect } from "vitest";
import {
  kstMinutesOfDay,
  isDailyWriteWindow,
  isEodClosePass,
} from "../src/marketWindow";

/** 2026-08-20(목) 의 KST 시각 → UTC Date (KST = UTC+9, DST 없음). */
function kst(hh: number, mm: number): Date {
  return new Date(Date.UTC(2026, 7, 20, hh - 9, mm, 0));
}

describe("kstMinutesOfDay", () => {
  it("2026-08-20T00:00:00Z → 540 (09:00 KST)", () => {
    expect(kstMinutesOfDay(new Date("2026-08-20T00:00:00Z"))).toBe(540);
  });

  it("UTC 자정 경계를 넘어도 KST 기준 분을 반환 (23:30Z → 08:30 KST = 510)", () => {
    expect(kstMinutesOfDay(new Date("2026-08-17T23:30:00Z"))).toBe(510);
  });

  it("00:00 KST → 0, 23:59 KST → 1439", () => {
    expect(kstMinutesOfDay(new Date("2026-08-19T15:00:00Z"))).toBe(0);
    expect(kstMinutesOfDay(new Date("2026-08-20T14:59:00Z"))).toBe(1439);
  });
});

describe("isDailyWriteWindow — KRX 정규장 09:00~15:30 (양끝 포함)", () => {
  it.each([
    ["08:59", 8, 59, false],
    ["09:00", 9, 0, true],
    ["12:00", 12, 0, true],
    ["15:30", 15, 30, true],
    ["15:31", 15, 31, false],
    ["15:59", 15, 59, false],
  ] as const)("%s → %s", (_label, hh, mm, expected) => {
    expect(isDailyWriteWindow(kst(hh, mm))).toBe(expected);
  });
});

describe("isEodClosePass — 15:35~15:55 5분 슬롯", () => {
  it.each([
    ["15:35", 15, 35, true],
    ["15:40", 15, 40, true],
    ["15:45", 15, 45, true],
    ["15:50", 15, 50, true],
    ["15:55", 15, 55, true],
    ["15:34", 15, 34, false],
    ["15:36", 15, 36, false],
    ["15:56", 15, 56, false],
    ["16:00", 16, 0, false],
    ["14:35", 14, 35, false],
  ] as const)("%s → %s", (_label, hh, mm, expected) => {
    expect(isEodClosePass(kst(hh, mm))).toBe(expected);
  });
});
