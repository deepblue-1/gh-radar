import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeStockFeed,
  stockFeedPerSource,
  toKstOffsetIso,
  type NewsByStockResponse,
  type StockFeedEntry,
  type StockFeedRpcResult,
  type StockFeedRpcStock,
} from "@gh-radar/shared";
import { NewsByStockQuery } from "../schemas/news-by-stock.js";
import { ApiError } from "../errors.js";

export const newsByStockRouter: RouterT = Router();

const DAY_MS = 86_400_000;

/** RPC 결과가 계약 모양인지 — 아니면 조용히 빈 응답을 내지 않고 500 으로 드러낸다. */
function isRpcResult(data: unknown): data is StockFeedRpcResult {
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

/**
 * 종목 묶음 조회 — RPC `stock_feed_by_codes` 1회(등록 포함) → 종목마다 shared `mergeStockFeed`(D-14 · 합치기는 여기서 한 번).
 * 응답은 RPC 가 준 입력 순서 그대로 · 글 없는 코드 포함.
 */
export async function computeNewsByStock(
  supabase: SupabaseClient,
  codes: readonly string[],
  days: number,
  limit: number,
): Promise<NewsByStockResponse> {
  const perSource = stockFeedPerSource(limit);
  const { data, error } = await supabase.rpc("stock_feed_by_codes", {
    p_codes: codes as string[],
    p_since: new Date(Date.now() - days * DAY_MS).toISOString(),
    p_per_source: perSource,
    p_register: true,
    p_before: null,
  });
  if (error) throw error;
  if (!isRpcResult(data)) throw new Error("stock_feed_by_codes 모양 위반 — { feed_at, stocks[] } 가 아니다");

  const stocks: StockFeedEntry[] = data.stocks.map((s) => {
    const merged = mergeStockFeed(s.kis, s.naver);
    return {
      code: s.code,
      collectedAt: s.collected_at ? toKstOffsetIso(s.collected_at) : null,
      count: merged.length,
      truncated: s.kis.length >= perSource || s.naver.length >= perSource,
      items: merged.slice(0, limit),
    };
  });
  return {
    asOf: toKstOffsetIso(new Date()),
    feedAt: data.feed_at ? toKstOffsetIso(data.feed_at) : null,
    stocks,
  };
}

/**
 * GET /api/news/by-stock?codes=005930,0011T0,…&days=3&limit=20
 *
 * - D-03(costly): gh-trade 클라(돌파감지 창 · 상따창)가 5 ~ 10초마다 이 계약으로 조회한다 — 경로 · 필드 · 시각 표기(+09:00) ·
 *   글 없는 코드(items []) · 수집 전(collectedAt null)을 바꾸면 클라 재배포가 필요하다. 웹 작업대도 같은 조회를 쓴다.
 * - D-04: 종목 묶음 조회 하나 — 입력 순서 · 모든 코드 · 종목별 최신 limit 줄.
 * - D-05: 한투를 부르지 않는다 — RPC 안에서 「이 종목도 모아 달라」 등록(last_requested_at)만 하고 수집은 서버 수집기가 한다
 *   (CLAUDE.md 공식 API 운영 기준 ③ · 호출량은 사용자 수와 독립).
 * - D-08: days 기본 3(1 ~ 7) · limit 기본 20(1 ~ 100) 잘라 맞춤 · codes 1 ~ 100 · 위반 400 INVALID_QUERY_PARAM.
 * - 인증 없음(themes by-stock 과 같음) · `Cache-Control: public, max-age=5` · 왕복 = RPC 1회.
 */
newsByStockRouter.get("/by-stock", async (req, res, next) => {
  try {
    const parsed = NewsByStockQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(400, "INVALID_QUERY_PARAM", `${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { codes, days, limit } = parsed.data;
    const out = await computeNewsByStock(supabase, codes, days, limit);
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(out);
  } catch (e) {
    next(e);
  }
});
