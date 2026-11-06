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

describe("pushMessageOf — 스케치 029 C 안 골든(거부 · 취소 · 자동매도)", () => {
  it("④ 거부 — 게이트웨이 사유 원문", () => {
    expect(
      pushMessageOf(
        facts({
          stage: "rejected",
          group: 2,
          qty: 300,
          exchange: "NXT",
          message: "주문가능금액 부족",
          gwTimeMs: kst("09:00:32"),
        }),
      ),
    ).toEqual({
      title: "금양그린파워 · 줄매수 거부",
      body: "주문가능금액 부족 · 300주 (94만) · 3,120 · NXT 09:00:32",
    });
  });

  it("⑤ 서버 자동 취소 — 사유 낱말 + 잔량", () => {
    expect(pushMessageOf(cancelled())).toEqual({
      title: "금양그린파워 · 줄매수 취소",
      body: "매수1 이탈 · 잔량 300주 (94만) · KRX 09:05:10",
    });
  });

  it("⑥ 자동매도 시작 — 보유 있음", () => {
    expect(pushMessageOf(autoStart())).toEqual({
      title: "금양그린파워 · 자동매도 시작",
      body: "보유 500주 (156만) · 기준 상한가 · 09:40:00",
    });
  });

  it("⑦ 자동매도 완료 — 손익 % 음수 부호 U+2212", () => {
    expect(pushMessageOf(autoDone())).toEqual({
      title: "금양그린파워 · 자동매도 완료",
      body: "500주 (155만) 매도 · 평균 3,105 · 손익 −0.5% · 09:41:12",
    });
  });
});

function cancelled(over: Partial<PushFacts> = {}): PushFacts {
  return facts({
    stage: "cancelled",
    group: 2,
    qty: 300,
    cancelReason: 3,
    cancelledQty: 300,
    gwTimeMs: kst("09:05:10"),
    ...over,
  });
}

type AutoOver = Partial<NonNullable<PushFacts["autosell"]>>;

function autoStart(auto: AutoOver = {}): PushFacts {
  return facts({
    stage: "autosell_start",
    group: 9,
    side: "S",
    qty: null,
    price: null,
    gwTimeMs: kst("09:40:00"),
    autosell: {
      basis: 1,
      basePrice: 3120,
      triggerPrice: 3050,
      soldQty: 0,
      avgSellPrice: null,
      pnlPct: null,
      holdingQty: 500,
      holdingAvgPrice: 3120,
      ...auto,
    },
  });
}

function autoDone(auto: AutoOver = {}): PushFacts {
  return facts({
    stage: "autosell_done",
    group: 9,
    side: "S",
    qty: null,
    price: null,
    gwTimeMs: kst("09:41:12"),
    autosell: {
      basis: 1,
      basePrice: 3120,
      triggerPrice: 3050,
      soldQty: 500,
      avgSellPrice: 3105,
      pnlPct: -0.48,
      ...auto,
    },
  });
}

describe("경계 — 취소", () => {
  it("사유 없음 → 「잔량 N주 (M만) 취소」", () => {
    expect(pushMessageOf(cancelled({ cancelReason: null })).body).toBe("잔량 300주 (94만) 취소 · KRX 09:05:10");
  });

  it("표에 없는 사유 = 사유 없음", () => {
    expect(pushMessageOf(cancelled({ cancelReason: 99 })).body).toBe("잔량 300주 (94만) 취소 · KRX 09:05:10");
  });

  it("잔량 모름 → 잔량 조각 없음", () => {
    expect(pushMessageOf(cancelled({ cancelledQty: null })).body).toBe("매수1 이탈 · KRX 09:05:10");
    expect(pushMessageOf(cancelled({ cancelledQty: null, cancelReason: null })).body).toBe("취소 · KRX 09:05:10");
  });
});

describe("경계 — 거부", () => {
  const base = { stage: "rejected", group: 2, qty: 300, exchange: "NXT", gwTimeMs: kst("09:00:32") } as const;

  it("사유 빈 문자열 · 공백 · null → 사유 조각 생략", () => {
    const want = "300주 (94만) · 3,120 · NXT 09:00:32";
    expect(pushMessageOf(facts({ ...base, message: "" })).body).toBe(want);
    expect(pushMessageOf(facts({ ...base, message: "   " })).body).toBe(want);
    expect(pushMessageOf(facts({ ...base, message: null })).body).toBe(want);
  });

  it("사유는 trim 한 원문 그대로", () => {
    expect(pushMessageOf(facts({ ...base, message: "  호가단위 오류  " })).body).toBe(
      "호가단위 오류 · 300주 (94만) · 3,120 · NXT 09:00:32",
    );
  });
});

describe("경계 — 자동매도", () => {
  it("시작 · 보유 없음 → 기준가 · 발동가", () => {
    const want = "기준 상한가 3,120 · 발동가 3,050 · 09:40:00";
    expect(pushMessageOf(autoStart({ holdingQty: undefined, holdingAvgPrice: undefined })).body).toBe(want);
    expect(pushMessageOf(autoStart({ holdingQty: 0 })).body).toBe(want);
  });

  it("시작 · 기준가 0 → 기준 낱말만", () => {
    expect(pushMessageOf(autoStart({ holdingQty: undefined, basePrice: 0 })).body).toBe(
      "기준 상한가 · 발동가 3,050 · 09:40:00",
    );
  });

  it("시작 · 발동가 0 → 발동가 조각 생략", () => {
    expect(pushMessageOf(autoStart({ holdingQty: undefined, triggerPrice: 0 })).body).toBe(
      "기준 상한가 3,120 · 09:40:00",
    );
  });

  it("시작 · basis 2 → 「매수가」", () => {
    expect(pushMessageOf(autoStart({ basis: 2 })).body).toBe("보유 500주 (156만) · 기준 매수가 · 09:40:00");
  });

  it("시작 · 보유 평균가 모름 → 금액 조각 생략", () => {
    expect(pushMessageOf(autoStart({ holdingAvgPrice: undefined })).body).toBe("보유 500주 · 기준 상한가 · 09:40:00");
  });

  it("완료 · 손익 부호", () => {
    expect(pushMessageOf(autoDone({ pnlPct: 1.24 })).body).toBe(
      "500주 (155만) 매도 · 평균 3,105 · 손익 +1.2% · 09:41:12",
    );
    expect(pushMessageOf(autoDone({ pnlPct: 0 })).body).toBe("500주 (155만) 매도 · 평균 3,105 · 손익 0.0% · 09:41:12");
    expect(pushMessageOf(autoDone({ pnlPct: -0.04 })).body).toBe(
      "500주 (155만) 매도 · 평균 3,105 · 손익 0.0% · 09:41:12",
    );
    expect(pushMessageOf(autoDone({ pnlPct: -12.35 })).body).toBe(
      "500주 (155만) 매도 · 평균 3,105 · 손익 −12.4% · 09:41:12",
    );
  });

  it("완료 · 손익 없음 → 손익 조각 생략", () => {
    expect(pushMessageOf(autoDone({ pnlPct: null })).body).toBe("500주 (155만) 매도 · 평균 3,105 · 09:41:12");
  });

  it("완료 · 평균 없음 → 금액 · 평균 · 손익 조각 생략", () => {
    expect(pushMessageOf(autoDone({ avgSellPrice: null })).body).toBe("500주 매도 · 09:41:12");
  });

  it("자동매도 사실이 없으면 시각만", () => {
    expect(pushMessageOf(facts({ stage: "autosell_done", autosell: null, gwTimeMs: kst("09:41:12") }))).toEqual({
      title: "금양그린파워 · 자동매도 완료",
      body: "09:41:12",
    });
  });
});

describe("경계 — 구분 낱말(D-03)", () => {
  it("수동(7) + 매수 → 「수동 매수」", () => {
    expect(pushMessageOf(facts({ group: 7, origin: "manual" })).title).toBe("금양그린파워 · 수동 매수 접수");
  });

  it("group 없음 + origin vi + 매도 → 「VI 매도」", () => {
    const f = facts({ stage: "first_fill", group: null, origin: "vi", side: "S", filledQty: 200, lastFillPrice: 3120 });
    expect(pushMessageOf(f).title).toBe("금양그린파워 · VI 매도 체결");
  });

  it("group 없음 + origin limit_chaser → 「상따 매수」", () => {
    expect(pushMessageOf(facts({ group: null })).title).toBe("금양그린파워 · 상따 매수 접수");
  });

  it("group · origin 없음 + 매도 → 「매도」", () => {
    const f = facts({ stage: "filled", group: null, origin: null, side: "S", filledQty: 500, avgFillPrice: 3120 });
    expect(pushMessageOf(f).title).toBe("금양그린파워 · 매도 전량 체결");
  });

  it("방향도 없으면 「주문」", () => {
    expect(pushMessageOf(facts({ group: null, origin: null, side: null })).title).toBe("금양그린파워 · 주문 접수");
  });

  it("체결훅(6) → 「체결훅 매수」 · 매수/매도로 끝나는 낱말은 그대로", () => {
    expect(pushMessageOf(facts({ group: 6 })).title).toBe("금양그린파워 · 체결훅 매수 접수");
    expect(pushMessageOf(facts({ group: 4, side: "S" })).title).toBe("금양그린파워 · 호가매도 접수");
  });
});

describe("경계 — 금액 · 가격 · 종목 표기", () => {
  it("가격 0(시장가) → 금액 · 가격 조각 생략", () => {
    expect(pushMessageOf(facts({ price: 0 })).body).toBe("500주 · KRX 09:00:31");
  });

  it("억 표기 — 30,000주 × 12,350", () => {
    expect(pushMessageOf(facts({ qty: 30_000, price: 12_350 })).body).toBe("30,000주 (3.7억) · 12,350 · KRX 09:00:31");
  });

  it("거래소 빈 값 → 시각만", () => {
    expect(pushMessageOf(facts({ exchange: "" })).body).toBe("500주 (156만) · 3,120 · 09:00:31");
  });

  it("종목명 없음 → 코드 → ISIN", () => {
    expect(pushMessageOf(facts({ stockName: null })).title).toBe("282720 · 선매수 접수");
    expect(pushMessageOf(facts({ stockName: null, stockCode: null })).title).toBe("KR7282720005 · 선매수 접수");
  });
});

describe("SC-4 — 계좌 꼴 숫자(8자리 이상 연속)가 문안에 없다", () => {
  const reps: Record<(typeof PUSH_STAGES)[number], PushFacts> = {
    accepted: facts({ qty: 30_000, price: 12_350 }),
    first_fill: facts({ stage: "first_fill", filledQty: 200, lastFillPrice: 3120 }),
    filled: facts({ stage: "filled", filledQty: 500, avgFillPrice: 3120 }),
    rejected: facts({ stage: "rejected", message: "주문가능금액 부족" }),
    cancelled: cancelled(),
    autosell_start: autoStart({ holdingQty: undefined }),
    autosell_done: autoDone(),
  };

  it.each(PUSH_STAGES)("%s", (stage) => {
    const { title, body } = pushMessageOf(reps[stage]);
    expect(`${title}\n${body}`).not.toMatch(/\d{8,}/);
  });
});
