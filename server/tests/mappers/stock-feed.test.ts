import { describe, it, expect } from "vitest";
import { isStockFeedRpcResult } from "../../src/mappers/stock-feed";

// IN-31 — 종목 뉴스(news.ts) · 묶음 조회(news-by-stock.ts)가 같이 쓰는 RPC 모양 검사 하나.
describe("isStockFeedRpcResult", () => {
  it("계약 모양 — stocks 가 비었거나 code · kis[] · naver[] 를 가진 원소뿐", () => {
    expect(isStockFeedRpcResult({ feed_at: null, stocks: [] })).toBe(true);
    expect(
      isStockFeedRpcResult({
        feed_at: "2026-11-12T00:15:00+00:00",
        stocks: [{ code: "005930", collected_at: null, kis: [], naver: [] }],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["배열", []],
    ["stocks 없음", { feed_at: null }],
    ["stocks 가 배열 아님", { feed_at: null, stocks: {} }],
    ["원소가 null", { stocks: [null] }],
    ["code 가 문자열 아님", { stocks: [{ code: 5930, kis: [], naver: [] }] }],
    ["kis 없음", { stocks: [{ code: "005930", naver: [] }] }],
    ["naver 가 배열 아님", { stocks: [{ code: "005930", kis: [], naver: null }] }],
  ])("모양 위반(%s) → false", (_label, data) => {
    expect(isStockFeedRpcResult(data)).toBe(false);
  });
});
