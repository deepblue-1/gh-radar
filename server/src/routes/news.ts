import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  stripHtml,
  parsePubDate,
  extractSourcePrefix,
  mergeStockFeed,
  stockFeedPerSource,
  type StockFeedItem,
  type StockFeedRpcResult,
  type StockFeedRpcStock,
} from "@gh-radar/shared";
import { StockCodeParam, NewsListQuery } from "../schemas/news.js";
import {
  ApiError,
  StockNotFound,
  InvalidQueryParam,
  NaverBudgetExhausted,
  NaverUnavailable,
} from "../errors.js";
import { logger } from "../logger.js";

// Phase 41 D-12 · D-14 · SC-5 — 종목 뉴스 조회 · 새로고침 응답은 한투 뉴스 · 공시 · 네이버 뉴스를 합친 `StockFeedItem[]`
// (RPC stock_feed_by_codes · 등록 안 함 + shared mergeStockFeed). 새로고침은 여전히 네이버만 부른다(server 에 한투 클라이언트 없음).

const COOLDOWN_S = 30;
const NAVER_DAILY_BUDGET = Number(process.env.NAVER_DAILY_BUDGET ?? "24500");
const DAY_MS = 86_400_000;
/** 새로고침 응답 목록 — 7일 · 100건(Phase 7 그대로). */
const REFRESH_LIST_DAYS = 7;
const REFRESH_LIST_LIMIT = 100;

/** RPC 결과가 계약 모양인지 — 아니면 조용히 빈 목록을 내지 않고 500 으로 드러낸다(news-by-stock 과 같은 검사). */
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
 * 한 종목의 합친 목록(최신순 최대 limit 줄) — 종목 뉴스 조회 · 새로고침 응답이 같이 쓴다.
 * - D-05: 종목 상세 조회는 수집 대상으로 등록하지 않는다(`p_register: false` — 등록은 묶음 조회만).
 * - D-14: 합치기는 shared `mergeStockFeed` 하나(묶음 조회 · 홈과 같은 결과).
 * - `before`(무한 스크롤 커서): RPC 가 출처별로 `< before` 로 거르고, 합친 뒤에도 `publishedAt < before` 만 남긴다.
 */
async function loadMergedFeed(
  supabase: SupabaseClient,
  code: string,
  opts: { days: number; limit: number; before?: string },
): Promise<StockFeedItem[]> {
  const { days, limit, before } = opts;
  const { data, error } = await supabase.rpc("stock_feed_by_codes", {
    p_codes: [code],
    p_since: new Date(Date.now() - days * DAY_MS).toISOString(),
    p_per_source: stockFeedPerSource(limit),
    p_register: false,
    p_before: before ?? null,
  });
  if (error) throw error;
  if (!isRpcResult(data)) {
    throw new Error("stock_feed_by_codes 모양 위반 — { feed_at, stocks[] } 가 아니다");
  }
  const stock = data.stocks.find((s) => s.code === code);
  if (!stock) throw new Error(`stock_feed_by_codes 모양 위반 — 요청 코드 ${code} 가 결과에 없다`);
  const cutoff = before ? Date.parse(before) : Number.POSITIVE_INFINITY;
  return mergeStockFeed(stock.kis, stock.naver)
    .filter((item) => Date.parse(item.publishedAt) < cutoff)
    .slice(0, limit);
}

function kstDateString(now = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return t.toISOString().slice(0, 10);
}

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

interface NaverItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

function mapToNewsRow(code: string, item: NaverItem) {
  const rawUrl = item.originallink?.trim() || item.link?.trim();
  if (!rawUrl || !isAllowedUrl(rawUrl)) return null;
  const title = stripHtml(item.title);
  if (!title) return null;
  const publishedIso = parsePubDate(item.pubDate);
  if (!publishedIso) return null;
  const descStripped = stripHtml(item.description);
  const hash = createHash("sha256")
    .update(title + "\n" + descStripped)
    .digest("hex");
  return {
    stock_code: code,
    title,
    // Phase 07.1 — descStripped 을 row.description 에 저장 (content_hash 계산 입력과 공유).
    description: descStripped.length > 0 ? descStripped : null,
    source: extractSourcePrefix(rawUrl),
    url: rawUrl,
    published_at: publishedIso,
    content_hash: hash,
  };
}

export const newsRouter: RouterT = Router({ mergeParams: true });

// GET /api/stocks/:code/news
newsRouter.get("/", async (req, res, next) => {
  try {
    const paramsParsed = StockCodeParam.safeParse(req.params);
    if (!paramsParsed.success) {
      throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
    }
    const { code } = paramsParsed.data;
    const queryParsed = NewsListQuery.safeParse(req.query);
    if (!queryParsed.success) {
      throw InvalidQueryParam(
        queryParsed.error.issues[0].path.join("."),
        queryParsed.error.issues[0].message,
      );
    }
    const { days, limit, before } = queryParsed.data;
    const supabase = req.app.locals.supabase as SupabaseClient;

    const { data: master, error: mErr } = await supabase
      .from("stocks")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    // since = now - days · before 가 있으면 publishedAt < before (무한 스크롤 cursor, Phase 8 미러)
    res.json(await loadMergedFeed(supabase, code, { days, limit, before }));
  } catch (e) {
    if (e instanceof z.ZodError)
      return next(InvalidQueryParam("news", e.issues[0].message));
    next(e);
  }
});

// POST /api/stocks/:code/news/refresh
newsRouter.post("/refresh", async (req, res, next) => {
  try {
    const paramsParsed = StockCodeParam.safeParse(req.params);
    if (!paramsParsed.success) {
      throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
    }
    const { code } = paramsParsed.data;
    const supabase = req.app.locals.supabase as SupabaseClient;
    const naver = req.app.locals.naverClient as AxiosInstance | undefined;
    if (!naver) throw NaverUnavailable();

    const { data: master, error: mErr } = await supabase
      .from("stocks")
      .select("code,name")
      .eq("code", code)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    // 쿨다운 체크
    const { data: latest, error: lErr } = await supabase
      .from("news_articles")
      .select("created_at")
      .eq("stock_code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) throw lErr;
    if (latest?.created_at) {
      const elapsed = (Date.now() - Date.parse(latest.created_at)) / 1000;
      if (elapsed < COOLDOWN_S) {
        const retry_after_seconds = Math.ceil(COOLDOWN_S - elapsed);
        res.setHeader("Retry-After", String(retry_after_seconds));
        res.status(429).json({
          error: {
            code: "NEWS_REFRESH_COOLDOWN",
            message: "잠시 후 다시 시도해주세요",
          },
          retry_after_seconds,
        });
        return;
      }
    }

    // Budget 체크
    const { data: usedCount, error: uErr } = await supabase.rpc(
      "incr_api_usage",
      {
        p_service: "naver_search_news",
        p_date: kstDateString(),
        p_amount: 1,
      },
    );
    if (uErr) throw uErr;
    if (Number(usedCount) > NAVER_DAILY_BUDGET) throw NaverBudgetExhausted();

    // Naver fetch
    const nvRes = await naver.get<{ items: NaverItem[] }>(
      "/v1/search/news.json",
      {
        params: {
          query: (master as { name: string }).name,
          display: 20,
          sort: "date",
          start: 1,
        },
      },
    );
    const items = nvRes.data.items ?? [];
    const rows = items
      .map((it) => mapToNewsRow(code, it))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from("news_articles")
        .upsert(rows, {
          onConflict: "stock_code,url",
          ignoreDuplicates: true,
        });
      if (upErr) throw upErr;
    }

    // 갱신된 목록 (7d/100) — 합친 목록이라 새로고침 뒤에도 공시 · 한투 뉴스가 사라지지 않는다(SC-5)
    res.json(
      await loadMergedFeed(supabase, code, {
        days: REFRESH_LIST_DAYS,
        limit: REFRESH_LIST_LIMIT,
      }),
    );
  } catch (e: unknown) {
    const axiosErr = e as { response?: { status?: number } };
    if (axiosErr?.response?.status === 401) {
      logger.error(
        { code: (req.params as { code?: string }).code },
        "naver auth failed on refresh",
      );
      next(new ApiError(503, "NAVER_UNAVAILABLE", "naver auth failed"));
      return;
    }
    if (axiosErr?.response?.status === 429) {
      next(NaverBudgetExhausted());
      return;
    }
    next(e);
  }
});
