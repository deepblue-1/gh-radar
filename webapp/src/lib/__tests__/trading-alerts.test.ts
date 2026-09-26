import { describe, expect, it } from "vitest";

import type {
  RelayOrderMsg,
  RelayRateCrossItem,
  RelayUnfilled,
  RelayViNoticeMsg,
} from "@gh-radar/shared";

import {
  alertFromBreakout,
  alertFromOrder,
  alertFromVi,
  alertIcon,
  alertSubtitle,
  alertTabFor,
  alertTitle,
  indexUnfilled,
  MAX_TOASTS,
  mergeAlert,
  orderAlertKind,
  resolveOrderEntry,
  type OrderIndexEntry,
  type TradingAlert,
} from "../trading-alerts";
import { MERGE_WINDOW_MS } from "../order-notices";

/**
 * quick-260923-pgu Task 1 — 작업대 이벤트 알림의 **순수 모델** (목업 ③A · 결정 갱신 D-36/D-27).
 *
 * 잠그는 것:
 *  ① 통보 종류 → 알림 종류는 `nt` 동등 비교뿐이다(문구 파싱 없음 · D-08).
 *  ② 주문번호 색인은 **추가만** 한다 — 전량 체결로 미체결 행이 사라져도 이름·종목이 남는다.
 *  ③ 같은 주문의 체결은 첫 통보 기준 3초 창(`MERGE_WINDOW_MS`)으로 한 알림에 누적된다.
 *  ④ 표시 문구는 목업 `textOf` 그대로 — 취소·정정에는 방향 단어가 없다(order-notices ②).
 */

const ACCOUNT_A = "37728502101";
const ACCOUNT_B = "37728502102";

function unf(orderNo: string, over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo,
    orgOrderNo: "",
    isin: "KR7096530001",
    side: "B",
    price: 12_100,
    orderQty: 500,
    filledQty: 0,
    unfilledQty: 500,
    exchange: "KRX",
    orderTime: "094131",
    queuedStatus: "",
    pendingStatus: "",
    board: "",
    pendingCancelSent: false,
    name: "씨젠",
    code: "096530",
    ...over,
  };
}

function order(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
  return { t: "order", no: "123", nt: "E", rc: 0, msg: "", org: "", p: 128_500, q: 100, x: "KRX", ...over };
}

function entry(over: Partial<OrderIndexEntry> = {}): OrderIndexEntry {
  return {
    isin: "KR7042700005",
    exchange: "KRX",
    side: "B",
    name: "한미반도체",
    code: "042700",
    orderQty: 500,
    accountNo: ACCOUNT_A,
    ...over,
  };
}

function vi(over: Partial<RelayViNoticeMsg> = {}): RelayViNoticeMsg {
  return {
    t: "vi.notice",
    isin: "KR7196170005",
    exchange: "NXT",
    accountNo: ACCOUNT_A,
    triggerPrice: 453_200,
    basePrice: 412_000,
    changeRate: 10,
    orderPrice: 535_500,
    orderQty: 3,
    market: "Q",
    orderSeq: 1,
    viEndTime: "094412000",
    name: "알테오젠",
    ...over,
  } as RelayViNoticeMsg;
}

function rc(over: Partial<RelayRateCrossItem> = {}): RelayRateCrossItem {
  return {
    isin: "KR7096530001",
    exchange: "KRX",
    lastPrice: 12_100,
    changeRate: 20.13,
    thresholdPct: 20,
    basePrice: 10_000,
    exchangeTime: "094131000000",
    serverTime: "09:41:31",
    name: "씨젠",
    code: "096530",
    ...over,
  };
}

function fill(at: number, id: string, over: Partial<RelayOrderMsg> = {}): TradingAlert {
  return alertFromOrder(order(over), entry(), at, id);
}

describe("orderAlertKind — nt 동등 비교뿐 (D-08)", () => {
  it.each([
    ["A", "accept"],
    ["E", "fill"],
    ["M", "modify"],
    ["C", "cancel"],
    ["R", "reject"],
  ])("%s → %s", (nt, kind) => {
    expect(orderAlertKind(nt)).toBe(kind);
  });

  it("빈 값·모르는 값은 null — 지어내지 않는다", () => {
    expect(orderAlertKind("")).toBeNull();
    expect(orderAlertKind("X")).toBeNull();
  });
});

describe("indexUnfilled — 주문번호 색인은 add-only", () => {
  it("두 계좌의 행이 전부 orderNo 키로 들어가고 계좌번호를 싣는다", () => {
    let idx = indexUnfilled(new Map(), ACCOUNT_A, [unf("1"), unf("2", { isin: "KR7005930003", side: "S" })]);
    idx = indexUnfilled(idx, ACCOUNT_B, [unf("3", { exchange: "NXT", orderQty: 7 })]);
    expect([...idx.keys()]).toEqual(["1", "2", "3"]);
    expect(idx.get("2")).toMatchObject({ isin: "KR7005930003", side: "S", accountNo: ACCOUNT_A });
    expect(idx.get("3")).toMatchObject({ exchange: "NXT", orderQty: 7, accountNo: ACCOUNT_B, name: "씨젠" });
  });

  it("다음 호출에서 행이 사라져도 기존 항목이 남는다 — 먼저 본 값이 정본", () => {
    const first = indexUnfilled(new Map(), ACCOUNT_A, [unf("1")]);
    const next = indexUnfilled(first, ACCOUNT_A, [unf("1", { name: "다른이름" }), unf("2")]);
    expect(next.get("1")?.name).toBe("씨젠");
    expect(next.has("2")).toBe(true);
    const after = indexUnfilled(next, ACCOUNT_A, []);
    expect(after.get("1")).toBeDefined();
  });

  it("전량 체결 톰스톤(unfilledQty 0) 행도 색인한다", () => {
    const idx = indexUnfilled(new Map(), ACCOUNT_A, [unf("9", { unfilledQty: 0, filledQty: 500 })]);
    expect(idx.get("9")?.orderQty).toBe(500);
  });

  it("새 행이 없으면 같은 Map 참조를 돌려준다", () => {
    const first = indexUnfilled(new Map(), ACCOUNT_A, [unf("1")]);
    expect(indexUnfilled(first, ACCOUNT_A, [unf("1")])).toBe(first);
    expect(indexUnfilled(first, ACCOUNT_A, [])).toBe(first);
  });
});

describe("resolveOrderEntry — no → org", () => {
  const idx = new Map([["100", entry({ name: "원주문" })]]);
  it("no 로 못 찾으면 org 로 찾는다", () => {
    expect(resolveOrderEntry(idx, order({ no: "200", org: "100" }))?.name).toBe("원주문");
  });
  it("둘 다 없으면 null · 빈 org 는 건너뛴다", () => {
    expect(resolveOrderEntry(idx, order({ no: "200", org: "" }))).toBeNull();
    expect(resolveOrderEntry(new Map([["", entry()]]), order({ no: "200", org: "" }))).toBeNull();
  });
});

describe("alertFromOrder — 색인 조인", () => {
  it("색인 히트 → 종목·거래소·방향·이름·주문수량을 채운다", () => {
    const a = alertFromOrder(order({ nt: "E", q: 100, p: 128_500 }), entry(), 1_000, "a1");
    expect(a).toMatchObject({
      id: "a1",
      kind: "fill",
      at: 1_000,
      firstAt: 1_000,
      isin: "KR7042700005",
      exchange: "KRX",
      accountNo: ACCOUNT_A,
      name: "한미반도체",
      side: "B",
      price: 128_500,
      qty: 100,
      filledQty: 100,
      orderQty: 500,
      orderNo: "123",
      count: 1,
      label: "매수",
    });
  });

  it("취소·정정 label 은 방향이 없다 · 시간외종가 접두", () => {
    expect(alertFromOrder(order({ nt: "C" }), entry(), 0, "x").label).toBe("취소");
    expect(alertFromOrder(order({ nt: "C" }), entry(), 0, "x").side).toBeNull();
    expect(alertFromOrder(order({ nt: "M" }), entry(), 0, "x").label).toBe("정정");
    expect(alertFromOrder(order({ nt: "A", bd: "G2" }), entry(), 0, "x").label).toBe("시간외종가 매수");
    expect(alertFromOrder(order({ nt: "C", bd: "G3" }), entry(), 0, "x").label).toBe("시간외종가");
  });

  it("색인 미스 → 이름 자리에 「주문 {no}」 · isin 없음", () => {
    const a = alertFromOrder(order({ no: "777" }), null, 0, "x");
    expect(a.name).toBe("주문 777");
    expect(a.isin).toBeUndefined();
    expect(a.orderQty).toBeUndefined();
  });

  it("거부는 msg 원문을 그대로 싣는다(파싱 없음) · 그 밖 종류는 msg 를 싣지 않는다", () => {
    const text = "주문가능금액 초과 (서버 메시지 원문)";
    expect(alertFromOrder(order({ nt: "R", msg: text }), entry(), 0, "x").msg).toBe(text);
    expect(alertFromOrder(order({ nt: "E", msg: "정상처리" }), entry(), 0, "x").msg).toBeUndefined();
  });
});

describe("mergeAlert — 같은 주문 체결 3초 창", () => {
  it("같은 orderNo fill 이 첫 통보 기준 3000ms 이내면 count·filledQty 누적 · at 갱신", () => {
    const first = mergeAlert([], fill(1_000, "a1"));
    expect(first.merged).toBe(false);
    const r = mergeAlert(first.alerts, fill(1_000 + MERGE_WINDOW_MS, "a2", { p: 128_600 }));
    expect(r.merged).toBe(true);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({
      id: "a1",
      count: 2,
      filledQty: 200,
      price: 128_600,
      at: 1_000 + MERGE_WINDOW_MS,
      firstAt: 1_000,
    });
  });

  it("창은 첫 통보 기준이다(슬라이딩 아님) — 3001ms 는 새 항목", () => {
    let alerts = mergeAlert([], fill(0, "a1")).alerts;
    alerts = mergeAlert(alerts, fill(2_000, "a2")).alerts;
    const r = mergeAlert(alerts, fill(MERGE_WINDOW_MS + 1, "a3"));
    expect(r.merged).toBe(false);
    expect(r.alerts.map((a) => a.id)).toEqual(["a1", "a3"]);
  });

  it("accept 둘은 절대 묶이지 않는다 · 다른 주문번호 fill 도 묶이지 않는다", () => {
    let alerts = mergeAlert([], fill(0, "a1", { nt: "A" })).alerts;
    alerts = mergeAlert(alerts, fill(10, "a2", { nt: "A" })).alerts;
    alerts = mergeAlert(alerts, fill(20, "a3", { no: "999" })).alerts;
    expect(alerts.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("5번째 항목이 오면 가장 오래된 것이 빠져 길이 4", () => {
    let alerts: TradingAlert[] = [];
    for (let i = 1; i <= 5; i += 1) alerts = mergeAlert(alerts, fill(i, `a${i}`, { no: String(i), nt: "A" })).alerts;
    expect(MAX_TOASTS).toBe(4);
    expect(alerts.map((a) => a.id)).toEqual(["a2", "a3", "a4", "a5"]);
  });
});

describe("표시 문구 — 목업 textOf", () => {
  it("체결 — 매수 300/500주 · 128,500원 · KRX", () => {
    const a = { ...fill(0, "a"), filledQty: 300, count: 3 };
    expect(alertTitle(a)).toBe("한미반도체 체결");
    expect(alertSubtitle(a)).toBe("매수 300/500주 · 128,500원 · KRX");
    expect(alertIcon("fill")).toBe("체");
  });

  it("체결 · 주문수량을 모르면 체결 수량만", () => {
    const a = alertFromOrder(order({ no: "777", q: 100 }), null, 0, "x");
    expect(alertTitle(a)).toBe("주문 777 체결");
    expect(alertSubtitle(a)).toBe("100주 · 128,500원 · KRX");
  });

  it("접수 — … · No 123", () => {
    const a = alertFromOrder(order({ nt: "A", q: 500 }), entry(), 0, "x");
    expect(alertTitle(a)).toBe("한미반도체 접수");
    expect(alertSubtitle(a)).toBe("매수 500주 · 128,500원 · KRX · No 123");
    expect(alertIcon("accept")).toBe("접");
  });

  it("취소확인·정정확인 — 방향 단어 없음", () => {
    const c = alertFromOrder(order({ nt: "C", q: 50, no: "101" }), entry({ side: "S", name: "삼성전자" }), 0, "x");
    expect(alertTitle(c)).toBe("삼성전자 취소확인");
    expect(alertSubtitle(c)).toBe("취소 50주 · No 101");
    const m = alertFromOrder(order({ nt: "M", q: 50, no: "102" }), entry(), 0, "x");
    expect(alertTitle(m)).toBe("한미반도체 정정확인");
    expect(alertSubtitle(m)).toBe("정정 50주 · No 102");
    expect(alertIcon("cancel")).toBe("취");
    expect(alertIcon("modify")).toBe("정");
  });

  it("거부 — msg 원문", () => {
    const a = alertFromOrder(order({ nt: "R", msg: "주문가능금액 초과" }), entry({ name: "에코프로" }), 0, "x");
    expect(alertTitle(a)).toBe("에코프로 주문 거부");
    expect(alertSubtitle(a)).toBe("주문가능금액 초과");
    expect(alertIcon("reject")).toBe("!");
  });

  it("VI — 발동가 … · 기준 … (+10%) · NXT · 해제 09:44:12", () => {
    const a = alertFromVi(vi(), 0, "x");
    expect(a).toMatchObject({ kind: "vi", isin: "KR7196170005", exchange: "NXT", accountNo: ACCOUNT_A, qty: 3 });
    expect(alertTitle(a)).toBe("알테오젠 VI 발동");
    expect(alertSubtitle(a)).toBe("발동가 453,200 · 기준 412,000 (+10%) · NXT · 해제 09:44:12");
    expect(alertIcon("vi")).toBe("VI");
  });

  it("돌파 — +20.13% · KRX · 돌파 목록에 추가됐어요", () => {
    const a = alertFromBreakout(rc(), 0, "x");
    expect(a).toMatchObject({ kind: "breakout", isin: "KR7096530001", code: "096530", price: 12_100 });
    expect(alertTitle(a)).toBe("씨젠 등락률 돌파");
    expect(alertSubtitle(a)).toBe("+20.13% · KRX · 돌파 목록에 추가됐어요");
    expect(alertIcon("breakout")).toBe("돌");
  });

  it("이름이 없으면 ISIN", () => {
    expect(alertTitle(alertFromBreakout(rc({ name: undefined }), 0, "x"))).toBe("KR7096530001 등락률 돌파");
  });
});

describe("alertTabFor — 클릭 시 여는 탭", () => {
  const base = fill(0, "x");
  const opts = { hasHolding: false, cardIsNew: false };
  it.each(["accept", "modify", "cancel", "reject"] as const)("%s → 미체결", (kind) => {
    expect(alertTabFor({ ...base, kind }, opts)).toBe("unfilled");
  });
  it("fill — 보유 있으면 잔고 · 없으면 미체결", () => {
    expect(alertTabFor(base, { hasHolding: true, cardIsNew: false })).toBe("holdings");
    expect(alertTabFor(base, opts)).toBe("unfilled");
  });
  it("vi/breakout → 로그 · 새로 만든 카드면 정보", () => {
    expect(alertTabFor({ ...base, kind: "vi" }, opts)).toBe("log");
    expect(alertTabFor({ ...base, kind: "breakout" }, opts)).toBe("log");
    expect(alertTabFor({ ...base, kind: "vi" }, { hasHolding: false, cardIsNew: true })).toBe("info");
    expect(alertTabFor({ ...base, kind: "breakout" }, { hasHolding: true, cardIsNew: true })).toBe("info");
  });
});
