/**
 * Phase 36 (36-10) — 매매손익 기간 · 일자 표기(D-17 ~ D-19 · UI-SPEC 「숫자 표기 계약」 일자 행).
 * 날짜는 KST `YYYY-MM-DD` 문자열 그대로 산술한다(UTC 달력 산술 — 실행 TZ 무관).
 */
import { describe, expect, it } from "vitest";

import { formatPnlDay, formatPnlRangeCaption, PNL_RANGES, pnlRangeOf } from "../pnl";

describe("pnlRangeOf — N일 = 오늘 포함 N일 · 이달 = 그달 1일", () => {
  it.each([
    ["30", "2026-10-27", "2026-09-28"],
    ["7", "2026-10-27", "2026-10-21"],
    ["90", "2026-10-27", "2026-07-30"],
    ["month", "2026-10-27", "2026-10-01"],
    ["7", "2026-03-01", "2026-02-23"], // 달 · 2월 넘김
    ["7", "2026-01-03", "2025-12-28"], // 해 넘김
  ] as const)("(%s, %s) → from %s", (range, today, from) => {
    expect(pnlRangeOf(range, today)).toEqual({ from, to: today });
  });

  it("기간 순서 — 7 · 30 · 90 · 이달", () => {
    expect(PNL_RANGES).toEqual(["7", "30", "90", "month"]);
  });
});

describe("formatPnlDay · formatPnlRangeCaption — 「M/D (요일)」 · 「M/D ~ M/D」", () => {
  it.each([
    ["2026-10-27", "10/27 (화)"],
    ["2026-10-25", "10/25 (일)"],
    ["2026-09-28", "9/28 (월)"],
    ["2026-01-03", "1/3 (토)"],
  ] as const)("%s → %s", (iso, text) => {
    expect(formatPnlDay(iso)).toBe(text);
  });

  it("기간 캡션", () => {
    expect(formatPnlRangeCaption("2026-09-28", "2026-10-27")).toBe("9/28 ~ 10/27");
  });
});
