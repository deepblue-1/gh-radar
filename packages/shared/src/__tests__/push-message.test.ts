import { describe, it, expect } from "vitest";
import type { PushFacts } from "../push";
import { PUSH_ORDER_LOG_PATH, PUSH_STAGES } from "../push";
import {
  formatPushKstTime,
  pushMessageOf,
  pushTapPathOf,
  pushThreadIdOf,
} from "../push-message";

/** KST 벽시계 → epoch ms. */
const kst = (hms: string, day = "2026-11-06") => Date.parse(`${day}T${hms}+09:00`);

/** 스케치 029 픽스처 — 금양그린파워 3,120 × 500주 · 선매수 · KRX. */
function facts(over: Partial<PushFacts> = {}): PushFacts {
  return {
    stage: "accepted",
    isin: "KR7282720005",
    stockName: "금양그린파워",
    stockCode: "282720",
    exchange: "KRX",
    tradeDate: "2026-11-06",
    gwTimeMs: kst("09:00:31"),
    side: "B",
    group: 1,
    origin: "limit_chaser",
    qty: 500,
    price: 3120,
    filledQty: 0,
    lastFillPrice: null,
    avgFillPrice: null,
    cancelledQty: null,
    cancelReason: null,
    message: null,
    autosell: null,
    ...over,
  };
}

describe("pushMessageOf — 스케치 029 C 안 골든(주문 3단계)", () => {
  it("① 접수", () => {
    expect(pushMessageOf(facts())).toEqual({
      title: "금양그린파워 · 선매수 접수",
      body: "500주 (156만) · 3,120 · KRX 09:00:31",
    });
  });

  it("② 첫 체결", () => {
    expect(pushMessageOf(facts({ stage: "first_fill", filledQty: 200, lastFillPrice: 3120 }))).toEqual({
      title: "금양그린파워 · 선매수 체결",
      body: "200주 체결 (62만) · 잔량 300주 · 3,120 · KRX 09:00:31",
    });
  });

  it("③ 전량 체결", () => {
    expect(
      pushMessageOf(
        facts({ stage: "filled", filledQty: 500, lastFillPrice: 3120, avgFillPrice: 3120, gwTimeMs: kst("09:00:33") }),
      ),
    ).toEqual({
      title: "금양그린파워 · 선매수 전량 체결",
      body: "500주 (156만) 전량 · 평균 3,120 · KRX 09:00:33",
    });
  });
});

describe("탭 경로 · 묶음 키 · 시각", () => {
  it("탭 경로 = 주문로그를 종목 · 거래일로 거른다(계좌 없음)", () => {
    expect(pushTapPathOf(facts())).toBe("/trading/order-log?stock=KR7282720005&date=2026-11-06");
    expect(pushTapPathOf(facts()).startsWith(PUSH_ORDER_LOG_PATH)).toBe(true);
  });

  it("묶음 키 = ISIN", () => {
    expect(pushThreadIdOf(facts())).toBe("KR7282720005");
  });

  it("KST 자정 경계", () => {
    expect(formatPushKstTime(kst("00:00:00"))).toBe("00:00:00");
    expect(formatPushKstTime(kst("23:59:59"))).toBe("23:59:59");
  });

  it("7단계 문자열(40-01 CHECK · 40-05 RPC 와 같다)", () => {
    expect(PUSH_STAGES).toEqual([
      "accepted",
      "first_fill",
      "filled",
      "rejected",
      "cancelled",
      "autosell_start",
      "autosell_done",
    ]);
  });
});
