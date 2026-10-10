import { describe, it, expect } from "vitest";
import { STALE_TRADING_DAYS, freshnessOf } from "../src/freshness";

/** KST 21:20 (Scheduler 시각) 의 Date. */
const at = (ymd: string) => new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T21:20:00+09:00`);
const SINCE = "20260707";

describe("freshnessOf — 최신 export 뒤 export 없는 KRX 거래일 수 (WR-B01)", () => {
  it("임계 = 3 거래일", () => {
    expect(STALE_TRADING_DAYS).toBe(3);
  });

  it("오늘 export 있음 → 0", () => {
    expect(freshnessOf(["20261001", "20261002"], SINCE, at("20261002"))).toEqual({
      latestExport: "20261002",
      missingTradingDays: 0,
      stale: false,
      calendarStale: false,
    });
  });

  it("주말 · KRX 휴장일(10/5 개천절 대체)은 세지 않는다 — 금 export 뒤 월 휴장 = 0", () => {
    expect(freshnessOf(["20261002"], SINCE, at("20261005")).missingTradingDays).toBe(0);
  });

  it("추석 연휴(9/24 · 9/25 휴장 + 주말) 뒤 첫 거래일 = 1 — 연휴는 stale 이 아니다", () => {
    expect(freshnessOf(["20260923"], SINCE, at("20260928"))).toMatchObject({ missingTradingDays: 1, stale: false });
  });

  it("탐지 0 인 거래일이 끼어도 2일까지는 정상 · 3 거래일째 없으면 stale", () => {
    expect(freshnessOf(["20261002"], SINCE, at("20261007"))).toMatchObject({ missingTradingDays: 2, stale: false });
    expect(freshnessOf(["20261002"], SINCE, at("20261008"))).toMatchObject({ missingTradingDays: 3, stale: true });
  });

  it("적재 창 안에 export 가 하나도 없음 → since 부터 센다(stale)", () => {
    const f = freshnessOf([], SINCE, at("20261005"));
    expect(f.latestExport).toBeNull();
    expect(f.stale).toBe(true);
    expect(f.missingTradingDays).toBeGreaterThan(50);
  });

  it("날짜 순서와 무관하게 가장 새 날짜를 쓴다", () => {
    expect(freshnessOf(["20261002", "20260930"], SINCE, at("20261002")).latestExport).toBe("20261002");
  });

  it("KRX 휴장일 seed 범위(2026-12-31) 뒤 KST 오늘 → calendarStale (IN-R2-02) · 휴장일은 지어내지 않는다", () => {
    expect(freshnessOf(["20261231"], SINCE, at("20261231")).calendarStale).toBe(false);
    const f = freshnessOf(["20261231"], SINCE, at("20270104"));
    expect(f.calendarStale).toBe(true);
    // 2027 은 주말만 빠진다 — 1/1(금 · 신정) 도 거래일로 센다(seed 밖 · 그래서 calendarStale 로 드러낸다)
    expect(f.missingTradingDays).toBe(2);
  });
});
