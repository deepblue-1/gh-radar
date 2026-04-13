import { describe, it, expect } from "vitest";
import { isHoliday } from "../src/holidayGuard";
import type { KisRankingRow } from "@gh-radar/shared";

function makeRankings(acml_hgpr_date: string) {
  return [
    {
      market: "KOSPI" as const,
      rows: [{ acml_hgpr_date } as KisRankingRow],
    },
  ];
}

describe("isHoliday", () => {
  it("acml_hgpr_date가 오늘(KST)이면 거래일", () => {
    // 2026-04-13 월요일 10:00 KST = 2026-04-13 01:00 UTC
    const now = new Date("2026-04-13T01:00:00Z");
    const rankings = makeRankings("20260413");
    expect(isHoliday(rankings, now)).toBe(false);
  });

  it("acml_hgpr_date가 어제이면 휴장일", () => {
    const now = new Date("2026-04-13T01:00:00Z");
    const rankings = makeRankings("20260410");
    expect(isHoliday(rankings, now)).toBe(true);
  });

  it("빈 응답이면 휴장일로 판단", () => {
    expect(isHoliday([{ market: "KOSPI" as const, rows: [] }])).toBe(true);
  });

  it("acml_hgpr_date가 없으면 휴장일로 판단", () => {
    const rankings = [
      {
        market: "KOSPI" as const,
        rows: [{ acml_hgpr_date: "" } as KisRankingRow],
      },
    ];
    expect(isHoliday(rankings)).toBe(true);
  });
});
