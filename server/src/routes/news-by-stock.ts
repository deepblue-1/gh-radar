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
} from "@gh-radar/shared";
import { NewsByStockQuery } from "../schemas/news-by-stock.js";
import { isStockFeedRpcResult } from "../mappers/stock-feed.js";
import { ApiError } from "../errors.js";
import { newsByStockRateLimiter } from "../middleware/rate-limit.js";

export const newsByStockRouter: RouterT = Router();

const DAY_MS = 86_400_000;

/**
 * 묶음 조회 응답 캐시 TTL — D-01 · gh-trade 클라가 5 ~ 10초마다 부른다. 테마(60초)보다 짧게,
 * 수집기 전체 흐름 주기(5초)와 같게 — 캐시가 새 글을 한 주기 넘게 가리지 않는다.
 */
export const NEWS_BY_STOCK_CACHE_TTL_MS = 5_000;

/** 응답 조립용 값 — 요청마다 그 요청의 코드로 만들고, 응답 `stocks` 는 입력 순서로 다시 맞춘다. */
export type NewsByStockSnapshot = {
  asOf: string;
  feedAt: string | null;
  byCode: Map<string, StockFeedEntry>;
};

/** RPC 1회의 결과 — 그 RPC 로 부른 코드들의 캐시 칸이 같은 값(진행 중 promise)을 함께 가리킨다. */
type NewsByStockBatch = {
  asOfMs: number;
  feedAtMs: number | null;
  asOf: string;
  feedAt: string | null;
  byCode: Map<string, StockFeedEntry>;
};

type NewsByStockCacheSlot = { at: number; promise: Promise<NewsByStockBatch> };

/**
 * 코드별 캐시 — (days | limit | 코드) → 그 코드를 부른 RPC 결과(진행 중 promise 포함). 클라이언트별이라 테스트 목이 섞이지 않는다.
 *
 * IN-62: 키를 「정렬한 코드 집합」 에서 코드 하나로 바꿨다. 웹 작업대는 공용 돌파 코드와 사용자별 카드 코드를 한 묶음으로 부르므로
 * 집합 키는 사용자마다 달라 캐시를 나눠 쓰지 못했다. 이제 요청 코드 중 5초 안에 누가 이미 부른 코드는 재사용하고
 * 빠진 코드만 RPC 1회로 모아 부른다 — 접속 사용자가 늘어도 공용 코드의 RPC 는 5초에 한 번이다.
 */
const newsByStockCache = new WeakMap<SupabaseClient, Map<string, NewsByStockCacheSlot>>();

const cacheKey = (code: string, days: number, limit: number) => `${days}|${limit}|${code}`;

/** 테스트용 — 그 클라이언트의 캐시 칸 수(만료 정리 확인). */
export function newsByStockCacheSize(supabase: SupabaseClient): number {
  return newsByStockCache.get(supabase)?.size ?? 0;
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
  if (!isStockFeedRpcResult(data)) throw new Error("stock_feed_by_codes 모양 위반 — { feed_at, stocks[] } 가 아니다");

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
 * 코드마다 NEWS_BY_STOCK_CACHE_TTL_MS 안의 같은 (days · limit) 결과(진행 중 promise 포함)를 재사용하고,
 * 없거나 지난 코드만 RPC 1회로 모아 계산한다(입력 순서 · IN-62). 실패는 캐시하지 않는다(그 RPC 의 칸을 모두 지운다).
 *
 * - 등록(`p_register` → `kis_news_targets.last_requested_at`)은 RPC 로 간 코드만 한다. 캐시 칸은 5초면 지나고 등록은 RPC 안에서
 *   60초에 한 번만 쓰므로, 계속 조회되는 코드는 늦어도 TTL 한 번 뒤 RPC 로 가서 등록이 이어진다(집합 키 때와 같은 보장).
 * - 응답 `asOf` 는 쓴 RPC 결과 중 가장 오래된 계산 시각(데이터가 그 시각 기준이라는 뜻), `feedAt` 은 가장 최근 값.
 * - 만료 칸은 RPC 를 새로 부를 때 정리한다 — 코드가 매번 달라도 맵이 TTL 안에 부른 코드 수 넘게 자라지 않는다.
 */
export async function getNewsByStock(
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
  const cache = perClient;
  const now = Date.now();
  const unique = [...new Set(codes)];
  if (unique.length === 0) return { asOf: toKstOffsetIso(new Date()), feedAt: null, byCode: new Map() };
  const slotOf = new Map<string, NewsByStockCacheSlot>();
  const missing: string[] = [];
  for (const code of unique) {
    const hit = cache.get(cacheKey(code, days, limit));
    if (hit && now - hit.at < NEWS_BY_STOCK_CACHE_TTL_MS) slotOf.set(code, hit);
    else missing.push(code);
  }

  if (missing.length > 0) {
    for (const [k, v] of cache) if (now - v.at >= NEWS_BY_STOCK_CACHE_TTL_MS) cache.delete(k);
    const slot: NewsByStockCacheSlot = {
      at: now,
      promise: computeNewsByStock(supabase, missing, days, limit).then((r) => ({
        asOfMs: Date.parse(r.asOf),
        feedAtMs: r.feedAt === null ? null : Date.parse(r.feedAt),
        asOf: r.asOf,
        feedAt: r.feedAt,
        byCode: new Map(r.stocks.map((s) => [s.code, s])),
      })),
    };
    for (const code of missing) {
      cache.set(cacheKey(code, days, limit), slot);
      slotOf.set(code, slot);
    }
    slot.promise.catch(() => {
      for (const code of missing) {
        const k = cacheKey(code, days, limit);
        if (cache.get(k) === slot) cache.delete(k);
      }
    });
  }

  const pending = [...new Set([...slotOf.values()].map((slot) => slot.promise))];
  const done = await Promise.all(pending);
  const batchOf = new Map(pending.map((p, i) => [p, done[i]!]));

  let oldest = done[0]!;
  let latestFeed: NewsByStockBatch | null = null;
  for (const b of done) {
    if (b.asOfMs < oldest.asOfMs) oldest = b;
    if (b.feedAtMs !== null && (latestFeed?.feedAtMs == null || b.feedAtMs > latestFeed.feedAtMs)) latestFeed = b;
  }
  const byCode = new Map<string, StockFeedEntry>();
  for (const code of unique) {
    const entry = batchOf.get(slotOf.get(code)!.promise)!.byCode.get(code);
    if (entry !== undefined) byCode.set(code, entry);
  }
  return { asOf: oldest.asOf, feedAt: latestFeed?.feedAt ?? null, byCode };
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
 * - 인증 없음(themes by-stock 과 같음) · `Cache-Control: public, max-age=5` · 왕복 = RPC 최대 1회(코드별 5초 캐시 · 진행 중 공유 —
 *   5초 안에 누가 부른 코드는 재사용하고 빠진 코드만 모아 부른다 · IN-62).
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
