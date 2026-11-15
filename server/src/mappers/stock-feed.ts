import type { StockFeedRpcResult, StockFeedRpcStock } from "@gh-radar/shared";

/**
 * RPC `stock_feed_by_codes` 결과가 계약 모양(`{ feed_at, stocks[{ code, kis[], naver[] }] }`)인지.
 * 아니면 호출부가 조용히 빈 목록을 내지 않고 500 으로 드러낸다 — 종목 뉴스(news.ts) · 묶음 조회(news-by-stock.ts)가 같이 쓴다.
 */
export function isStockFeedRpcResult(data: unknown): data is StockFeedRpcResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const stocks = (data as { stocks?: unknown }).stocks;
  if (!Array.isArray(stocks)) return false;
  return stocks.every(
    (s) =>
      s !== null &&
      typeof s === "object" &&
      typeof (s as StockFeedRpcStock).code === "string" &&
      Array.isArray((s as StockFeedRpcStock).kis) &&
      Array.isArray((s as StockFeedRpcStock).naver),
  );
}
