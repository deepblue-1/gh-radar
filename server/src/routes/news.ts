import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  stripHtml,
  parsePubDate,
  extractSourcePrefix,
} from "@gh-radar/shared";
import { StockCodeParam, NewsListQuery } from "../schemas/news.js";
import {
  ApiError,
  StockNotFound,
  InvalidQueryParam,
  NaverBudgetExhausted,
  NaverUnavailable,
} from "../errors.js";
import { toNewsArticle, type NewsRow } from "../mappers/news.js";
import { logger } from "../logger.js";

const COOLDOWN_S = 30;
const NAVER_DAILY_BUDGET = Number(process.env.NAVER_DAILY_BUDGET ?? "24500");
const NEWS_SELECT =
  "id,stock_code,title,description,source,url,published_at,content_hash,summary_id,created_at";

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

    // since = now - days; before 가 있으면 published_at < before 추가 (무한 스크롤 cursor, Phase 8 미러)
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    let q = supabase
      .from("news_articles")
      .select(NEWS_SELECT)
      .eq("stock_code", code)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (before) q = q.lt("published_at", before);
    const { data, error } = await q;
    if (error) throw error;
    const out = ((data ?? []) as NewsRow[]).map(toNewsArticle);
    res.json(out);
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

    // 갱신된 목록 (기본 7d/100) — mapper 통과 필수
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: list, error: listErr } = await supabase
      .from("news_articles")
      .select(NEWS_SELECT)
      .eq("stock_code", code)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(100);
    if (listErr) throw listErr;
    const out = ((list ?? []) as NewsRow[]).map(toNewsArticle);
    res.json(out);
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
