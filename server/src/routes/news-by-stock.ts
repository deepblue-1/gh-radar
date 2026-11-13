import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeStockFeed,
  STOCK_FEED_MIN_DISCLOSURES,
  stockFeedPerSource,
  takeFeedWithDisclosures,
  toKstOffsetIso,
  type NewsByStockResponse,
  type StockFeedEntry,
  type StockFeedRpcResult,
  type StockFeedRpcStock,
} from "@gh-radar/shared";
import { NewsByStockQuery } from "../schemas/news-by-stock.js";
import { ApiError } from "../errors.js";
import { newsByStockRateLimiter } from "../middleware/rate-limit.js";

export const newsByStockRouter: RouterT = Router();

const DAY_MS = 86_400_000;

/**
 * 묶음 조회 응답 캐시 TTL — D-01 · gh-trade 클라가 5 ~ 10초마다 부른다. 테마(60초)보다 짧게,
 * 수집기 전체 흐름 주기(5초)와 같게 — 캐시가 새 글을 한 주기 넘게 가리지 않는다.
 */
export const NEWS_BY_STOCK_CACHE_TTL_MS = 5_000;

/** 캐시 값 — 코드 집합 단위로 한 번 계산하고, 응답 `stocks` 는 요청마다 그 요청의 입력 순서로 조립한다. */
export type NewsByStockSnapshot = {
  asOf: string;
  feedAt: string | null;
  byCode: Map<string, StockFeedEntry>;
};

/** (정렬한 코드 집합 | days | limit) → 스냅샷(진행 중 promise 포함). 클라이언트별이라 테스트 목이 섞이지 않는다. */
const newsByStockCache = new WeakMap<
  SupabaseClient,
  Map<string, { at: number; promise: Promise<NewsByStockSnapshot> }>
>();

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
    // 공시가 뉴스에 밀려 빠지지 않게 기간 안 최신 공시를 따로 받는다(gh-trade 인박스 261113).
    p_min_disclosures: STOCK_FEED_MIN_DISCLOSURES,
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
      // 앞 limit 줄 + 그 안에 없는 기간 안 최신 공시 최대 3건 — 최신순 하나(최대 limit + 3 줄).
      items: takeFeedWithDisclosures(merged, limit, STOCK_FEED_MIN_DISCLOSURES),
    };
  });
  return {
    asOf: toKstOffsetIso(new Date()),
    feedAt: data.feed_at ? toKstOffsetIso(data.feed_at) : null,
    stocks,
  };
}

/**
 * NEWS_BY_STOCK_CACHE_TTL_MS 안이면 같은 (코드 집합 · days · limit) 의 스냅샷(진행 중 promise 포함)을, 아니면 새로 계산.
 * 실패는 캐시하지 않는다(themes `getThemesByStock` 와 같은 꼴). 키는 정렬한 코드라 순서만 다른 요청도 RPC 를 나눠 쓴다 —
 * 입력 순서는 핸들러가 요청마다 다시 맞춘다.
 */
export function getNewsByStock(
  supabase: SupabaseClient,
  codes: readonly string[],
  days: number,
  limit: number,
): Promise<NewsByStockSnapshot> {
  let perClient = newsByStockCache.get(supabase);
  if (perClient === undefined) {
    perClient = new Map();
    newsByStockCache.set(supabase, perClient);
  }
  const key = `${[...codes].sort().join(",")}|${days}|${limit}`;
  const now = Date.now();
  const hit = perClient.get(key);
  if (hit && now - hit.at < NEWS_BY_STOCK_CACHE_TTL_MS) return hit.promise;
  // 오래된 항목 정리 — 코드 집합이 매번 달라도 맵이 자라지 않게.
  for (const [k, v] of perClient) if (now - v.at >= NEWS_BY_STOCK_CACHE_TTL_MS) perClient.delete(k);
  const entry = {
    at: now,
    promise: computeNewsByStock(supabase, codes, days, limit).then((r) => ({
      asOf: r.asOf,
      feedAt: r.feedAt,
      byCode: new Map(r.stocks.map((s) => [s.code, s])),
    })),
  };
  perClient.set(key, entry);
  entry.promise.catch(() => {
    if (perClient!.get(key) === entry) perClient!.delete(key);
  });
  return entry.promise;
}

/** 요청의 입력 순서로 `stocks` 를 조립 — RPC 는 모든 코드를 주므로 빠지는 코드는 없다(없으면 RPC 결과 그대로 생략). */
function toResponse(snap: NewsByStockSnapshot, codes: readonly string[]): NewsByStockResponse {
  const stocks: StockFeedEntry[] = [];
  for (const code of codes) {
    const entry = snap.byCode.get(code);
    if (entry !== undefined) stocks.push(entry);
  }
  return { asOf: snap.asOf, feedAt: snap.feedAt, stocks };
}

/** 모듈 범위에 한 번 — 카운터 저장소가 요청마다 새로 생기지 않게. */
const newsByStockLimiter = newsByStockRateLimiter();

/**
 * GET /api/news/by-stock?codes=005930,0011T0,…&days=3&limit=20
 *
 * - D-03(costly): gh-trade 클라(돌파감지 창 · 상따창)가 5 ~ 10초마다 이 계약으로 조회한다 — 경로 · 필드 · 시각 표기(+09:00) ·
 *   글 없는 코드(items []) · 수집 전(collectedAt null)을 바꾸면 클라 재배포가 필요하다. 웹 작업대도 같은 조회를 쓴다.
 * - D-04: 종목 묶음 조회 하나 — 입력 순서 · 모든 코드 · 종목별 최신 limit 줄.
 *   2026-11-13(gh-trade 인박스 261113): 그 limit 줄에 없는 기간 안 최신 공시 최대 3건을 덧붙인다(최신순 하나 · 최대 limit + 3 줄).
 *   `truncated` 는 그대로 「출처별 상한에 닿음」(덧붙은 공시는 상한이 찼을 때만 생긴다).
 * - D-05: 한투를 부르지 않는다 — RPC 안에서 「이 종목도 모아 달라」 등록(last_requested_at)만 하고 수집은 서버 수집기가 한다
 *   (CLAUDE.md 공식 API 운영 기준 ③ · 호출량은 사용자 수와 독립).
 * - D-08: days 기본 3(1 ~ 7) · limit 기본 20(1 ~ 100) 잘라 맞춤 · codes 1 ~ 100 · 위반 400 INVALID_QUERY_PARAM.
 * - 인증 없음(themes by-stock 과 같음) · `Cache-Control: public, max-age=5` · 왕복 = RPC 1회(같은 집합은 5초 캐시 · 진행 중 공유).
 * - SC-4: 전역 `/api` 분 200회 제한에서 빠지고 전용 제한기(IP 당 분 600회 · 같은 429 JSON)를 쓴다 — 사무실 IP 공유.
 */
newsByStockRouter.get("/by-stock", newsByStockLimiter, async (req, res, next) => {
  try {
    const parsed = NewsByStockQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(400, "INVALID_QUERY_PARAM", `${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { codes, days, limit } = parsed.data;
    const snap = await getNewsByStock(supabase, codes, days, limit);
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(toResponse(snap, codes));
  } catch (e) {
    next(e);
  }
});
