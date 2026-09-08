import { describe, it, expect } from "vitest";
import { ChatPostBody, ConversationListQuery } from "../chat";
import { OrderPostBody } from "../orders";

/**
 * quick-260908-fis — 종목코드 zod 검증이 KRX 영문 포함 단축코드를 수용해야 한다.
 *
 * KRX 는 숫자 6자리 소진으로 2025년부터 영문이 섞인 단축코드를 발급한다(예: 채비 `0011T0`).
 * 동시에 허용 표면은 넓히지 않는다 — 소문자·길이 이탈은 계속 거부(T-fis-01/02).
 */

const VALID = "0011T0"; // 채비
const INVALID = ["0011t0", "12345", "0011T0X"]; // 소문자 / 5자 / 7자

function baseOrder(code: string) {
  return {
    code,
    accountNo: "12345678901",
    exchange: "KRX" as const,
    side: "B" as const,
    orderType: "N" as const,
    qty: 10,
    price: 4695,
  };
}

describe("ChatPostBody.stockCode", () => {
  it("영문 포함 단축코드 수용", () => {
    expect(ChatPostBody.safeParse({ message: "분석해줘", stockCode: VALID }).success).toBe(true);
  });

  it("숫자 단축코드 회귀 없음", () => {
    expect(ChatPostBody.safeParse({ message: "분석해줘", stockCode: "005930" }).success).toBe(true);
  });

  it.each(INVALID)("잘못된 형식 거부: %s", (code) => {
    expect(ChatPostBody.safeParse({ message: "분석해줘", stockCode: code }).success).toBe(false);
  });
});

describe("ConversationListQuery.stockCode", () => {
  it("영문 포함 단축코드 수용", () => {
    expect(ConversationListQuery.safeParse({ stockCode: VALID }).success).toBe(true);
  });

  it.each(INVALID)("잘못된 형식 거부: %s", (code) => {
    expect(ConversationListQuery.safeParse({ stockCode: code }).success).toBe(false);
  });
});

describe("OrderPostBody.code", () => {
  it("영문 포함 단축코드 신규 주문 수용", () => {
    expect(OrderPostBody.safeParse(baseOrder(VALID)).success).toBe(true);
  });

  it("숫자 단축코드 회귀 없음", () => {
    expect(OrderPostBody.safeParse(baseOrder("005930")).success).toBe(true);
  });

  it.each(INVALID)("잘못된 형식 거부: %s", (code) => {
    expect(OrderPostBody.safeParse(baseOrder(code)).success).toBe(false);
  });

  // 정규식만 바꿨다 — 취소 주문 orgOrderNo superRefine 규칙은 그대로여야 한다.
  it("취소 주문에 orgOrderNo 없으면 여전히 거부", () => {
    const r = OrderPostBody.safeParse({ ...baseOrder(VALID), orderType: "C" });
    expect(r.success).toBe(false);
  });

  it("취소 주문 + orgOrderNo 있으면 통과", () => {
    const r = OrderPostBody.safeParse({
      ...baseOrder(VALID),
      orderType: "C",
      orgOrderNo: "0000123",
    });
    expect(r.success).toBe(true);
  });
});
