import { describe, it, expect } from "vitest";
import {
  CANCEL_REASON_LABELS,
  COND_METRIC_LABELS,
  EVIDENCE_KIND_LABELS,
  ORDER_CONDITION_LABELS,
  ORDER_GROUP_LABELS,
  REASON_CODE_OPERATORS,
  STRATEGY_EVENT_KIND_LABELS,
  cancelReasonLabel,
  condMetricLabel,
  orderConditionLabel,
  orderGroupLabel,
  orderGroupSide,
  reasonOperator,
  strategyKindLabel,
} from "../strategy-event-labels";

/**
 * Phase 25-04 — 표시명 표 전수 (D-10 · G1 ⓓ).
 *
 * 잠그는 것:
 *   ① 표 6종의 **모든 키** 표시명 — v0.1 밖 말미 추가(CondMetric 6·7 · CancelReason 7·8·9) 포함.
 *   ② 모르는 값은 원문 숫자(지어내지 않는다).
 *   ③ 연산자 표 키 = gh-trade `server/src/trade/strategy/LimitChaser.h` `OrderReasonName` 반환 원문(한 글자도
 *      다르지 않다) · 정확 일치 조회만(D-36 — 쪼개 읽지 않는다).
 */

describe("표시명 표 전수 (D-10)", () => {
  it("StrategyEventKind 1~8", () => {
    expect(STRATEGY_EVENT_KIND_LABELS).toEqual({
      1: "상한가노출",
      2: "상한가진입",
      3: "주문",
      4: "대기",
      5: "체결",
      6: "주문",
      7: "취소",
      8: "거부",
    });
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(strategyKindLabel)).toEqual([
      "상한가노출", "상한가진입", "주문", "대기", "체결", "주문", "취소", "거부",
    ]);
    expect(strategyKindLabel(0)).toBe("0");
    expect(strategyKindLabel(99)).toBe("99");
  });

  it("OrderGroup 1~6 · 0 은 null · 모르면 원문 숫자 · 방향 1~3 매수 · 4~6 매도", () => {
    expect(ORDER_GROUP_LABELS).toEqual({
      1: "선매수",
      2: "추가매수",
      3: "후매수",
      4: "호가매도",
      5: "체결매도",
      6: "체결훅",
    });
    expect(orderGroupLabel(0)).toBeNull();
    expect(orderGroupLabel(4)).toBe("호가매도");
    expect(orderGroupLabel(9)).toBe("9");
    expect([1, 2, 3].map(orderGroupSide)).toEqual(["buy", "buy", "buy"]);
    expect([4, 5, 6].map(orderGroupSide)).toEqual(["sell", "sell", "sell"]);
    expect(orderGroupSide(0)).toBeNull();
    expect(orderGroupSide(7)).toBeNull();
  });

  it("CondMetric 1~7 (6 스윕 호가변경 · 7 상승률 말미 추가) · 3 은 매도 그룹이면 단건 매도체결", () => {
    expect(COND_METRIC_LABELS).toEqual({
      1: "매도잔량",
      2: "매수잔량",
      3: "단건 체결",
      4: "가격",
      5: "체결 누적",
      6: "스윕 호가변경",
      7: "상승률",
    });
    expect(condMetricLabel(3, 1)).toBe("단건 체결");
    expect(condMetricLabel(3, 5)).toBe("단건 매도체결");
    expect(condMetricLabel(3, 0)).toBe("단건 체결");
    expect(condMetricLabel(6, 1)).toBe("스윕 호가변경");
    expect(condMetricLabel(7, 1)).toBe("상승률");
    expect(condMetricLabel(8, 1)).toBe("8");
  });

  it("EvidenceKind 1~3", () => {
    expect(EVIDENCE_KIND_LABELS).toEqual({ 1: "호가", 2: "체결", 3: "체결통보" });
  });

  it("CancelReason 1~9 (7 체결 감시 · 8 재취소 · 9 기타 말미 추가) · 모르면 원문 숫자", () => {
    expect(CANCEL_REASON_LABELS).toEqual({
      1: "수동 취소",
      2: "이탈 매도",
      3: "매수1 이탈",
      4: "VI 감시",
      5: "거래소 취소",
      6: "마감 정리",
      7: "체결 감시",
      8: "재취소",
      9: "기타",
    });
    expect(cancelReasonLabel(3)).toBe("매수1 이탈");
    expect(cancelReasonLabel(7)).toBe("체결 감시");
    expect(cancelReasonLabel(8)).toBe("재취소");
    expect(cancelReasonLabel(9)).toBe("기타");
    expect(cancelReasonLabel(0)).toBe("0");
    expect(cancelReasonLabel(42)).toBe("42");
  });

  it("order_condition — 「0」 지정가 · 모르면 원문 그대로 · 프로토타입 키는 원문", () => {
    expect(ORDER_CONDITION_LABELS).toEqual({ "0": "지정가" });
    expect(orderConditionLabel("0")).toBe("지정가");
    expect(orderConditionLabel("3")).toBe("3");
    expect(orderConditionLabel("constructor")).toBe("constructor");
  });
});

/**
 * LimitChaser.h:204-247 `OrderReasonName` 반환 원문 — 조건식이 있는 20개(연산자 표 키).
 * 원문을 여기에 옮겨 적은 것이 곧 대조다: 표 키가 한 글자라도 다르면 아래 deep-equal 이 깨진다.
 */
const LIMIT_CHASER_REASONS_WITH_CONDITION: ReadonlyArray<readonly [string, string]> = [
  ["PreBuy B6Buy5 가격돌파(매도1호가>감시가)", ">"],
  ["PreBuy B6Buy4 상한가도달(매수1호가==감시가)", "="],
  ["PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)", "≤"],
  ["PreBuy A3 체결수량(체결가>=감시가 && 체결수량>=최소)", "≥"],
  ["PreBuy A3 버스트매수누적(체결가>=감시가 && 누적>=최소)", "≥"],
  ["PreBuy A3Buy4 상한가안착(A3 매수1호가==상한가)", "="],
  ["PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)", "≥"],
  ["PreBuy A3 버스트횟수+상승률(횟수>=최소 && 상승률>=최소)", "≥"],
  ["PreBuy A3 차감재평가(매도1잔량-체결수량<=감시수량)", "≤"],
  ["B6Sell1 잔량(매수1호가==감시가 && 잔량<=임계)", "≤"],
  ["B6Sell2 가격이탈(매수1호가<감시가)", "<"],
  ["A3 체결수량(체결가==감시가 && 체결수량>=최소)", "≥"],
  ["A3 버스트매도누적(체결가==감시가 && 누적>=최소)", "≥"],
  ["A3 차감재평가(매수1잔량-체결수량<=임계)", "≤"],
  ["B6Cancel1 잔량(매수1호가==매도비교가 && 잔량<=임계)", "≤"],
  ["A3Cancel 매도체결수량(체결가==매도비교가 && 체결수량>=최소)", "≥"],
  ["A3Cancel 버스트매도누적(체결가==매도비교가 && 누적>=최소)", "≥"],
  ["A3Cancel 차감재평가(매수1잔량-체결수량<=임계)", "≤"],
  ["AddBuy 구간(매수1호가==감시가 && 하한<=잔량<=상한)", "≥"],
  ["PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)", ">"],
];

/** 같은 헤더의 나머지 12개 — 폐기 · FillHook · 인수 · 후속 · 포기 · 재진입 · 소진 · 마스터 해제 · 미상. 표에 없다. */
const LIMIT_CHASER_REASONS_WITHOUT_OPERATOR: readonly string[] = [
  "(폐기) B6Buy2 가격돌파(매수1호가>감시가)",
  "(폐기) B6Buy1 잔량(매수1호가==감시가 && 잔량>=감시수량)",
  "FillHook 이탈취소(매수 체결 시 이탈 → 남은 매수 미체결 취소)",
  "FillHook 취소거부재취소(취소 거부 → 차감 잔량 재취소 + 체결분 매도)",
  "수동매수인수",
  "VI매수인수",
  "호가매도후속(호가 경로 매도 → 남은 매수 선취소 + 이후 체결분 매도)",
  "AddBuy 포기(매수1잔량>최대)",
  "(폐기) AddBuy 포기(상한가 이탈 — 최소 미달)",
  "PostBuy 재진입(보유중 && 미체결0 && 보유0 && 잔여>0)",
  "PostBuy 소진(보유중 && 미체결0 && 보유0 && 잔여0)",
  "마스터 해제(선·추가·후매수 모두 접힘)",
  "미상",
];

describe("연산자 표 (reason_code 원문 정확 일치 · D-36)", () => {
  it("표 키 20개 = LimitChaser.h 원문 목록 · 연산자 값까지 같다", () => {
    expect(Object.keys(REASON_CODE_OPERATORS)).toHaveLength(20);
    expect(REASON_CODE_OPERATORS).toEqual(Object.fromEntries(LIMIT_CHASER_REASONS_WITH_CONDITION));
    for (const [code, op] of LIMIT_CHASER_REASONS_WITH_CONDITION) expect(reasonOperator(code)).toBe(op);
  });

  it("조건식 없는 사유 · 미상은 null", () => {
    for (const code of LIMIT_CHASER_REASONS_WITHOUT_OPERATOR) expect(reasonOperator(code)).toBeNull();
  });

  it("정확 일치가 아니면 null — 접두 · 꼬리 공백 · 빈 값 · 프로토타입 키", () => {
    expect(reasonOperator("PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)")).toBe("≤");
    expect(reasonOperator("PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)")).toBe(">");
    expect(reasonOperator("PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량) ")).toBeNull();
    expect(reasonOperator(" PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)")).toBeNull();
    expect(reasonOperator("PreBuy B6Buy3")).toBeNull();
    expect(reasonOperator("")).toBeNull();
    expect(reasonOperator("constructor")).toBeNull();
    expect(reasonOperator("__proto__")).toBeNull();
  });
});
