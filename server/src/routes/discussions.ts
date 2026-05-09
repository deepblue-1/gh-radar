import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { parseNaverBoardDate } from "@gh-radar/shared";
import { StockCodeParam, DiscussionListQuery } from "../schemas/discussions.js";
import { toDiscussion, type DiscussionRow } from "../mappers/discussions.js";
import {
  StockNotFound,
  InvalidQueryParam,
  DiscussionRefreshCooldown,
  ProxyBudgetExhausted,
  ProxyUnavailable,
} from "../errors.js";
import { logger } from "../logger.js";
import { classifyAndPersist } from "../services/discussion-classify.js";

/**
 * Phase 08 — Express server discussion routes.
 *
 *   GET  /api/stocks/:code/discussions          (cache-first)
 *   POST /api/stocks/:code/discussions/refresh  (Bright Data on-demand scrape)
 *
 * PIVOT (08-POC-PIVOT.md):
 *  - cheerio 미사용 — Bright Data Web Unlocker → stock.naver.com JSON API 단일 경로.
 *  - body 는 JSON 응답의 `contentSwReplacedButImg` (plaintext) 그대로 + sanitize-html `allowedTags:[]` defensive.
 *
 * D4 캐싱 10분 TTL · D6 limit ≤ 50 · D8 30s 쿨다운 · D11 스팸 필터 (제목 <5자 OR URL).
 *
 * Threat model: T-01 (XSS) sanitize-html, T-02 (URL tabnabbing) post_id 기반 결정적 URL,
 * T-05 (DoS) atomic incr_api_usage RPC, T-06 (Input) Zod, T-07 (Open redirect) ALLOWED_HOSTS,
 * T-08 (SQLi) Supabase JS SDK parametric.
 */

const COOLDOWN_SECONDS = 30; // D8
const CACHE_TTL_MS = 10 * 60_000; // D4 — MAX(scraped_at) < 10min 이면 프록시 호출 skip
const DAILY_BUDGET = 5000; // 프록시 일일 예산 (env override 가능)
const PAGE_SIZE = 50;
const ALLOWED_HOSTS = new Set<string>([
  "stock.naver.com",
  "m.stock.naver.com",
  "finance.naver.com",
  "m.finance.naver.com",
]);

const DISCUSSION_SELECT =
  "id,stock_code,post_id,title,body,author,posted_at,scraped_at,relevance,classified_at";

function kstDateString(now = new Date()): string {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return t.toISOString().slice(0, 10);
}

/** D11: 제목 <5자 OR 제목에 URL 포함 → 스팸으로 간주 (UI 노출 제외, DB 원본은 보존). */
function isSpam(title: string): boolean {
  if (!title) return true;
  if (title.length < 5) return true;
  if (/https?:\/\//i.test(title)) return true;
  return false;
}

function filterSpam(rows: DiscussionRow[]): DiscussionRow[] {
  return rows.filter((r) => !isSpam(r.title));
}

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** PIVOT: body sanitize — 이미 plaintext 이지만 defensive 2차 strip (T-01). */
function sanitizeBody(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    textFilter: (text) => text.replace(/\s+/g, " "),
  }).trim();
  return cleaned.length > 0 ? cleaned : null;
}

// ── Naver discussion JSON API (PIVOT — 옵션 5) ──────────────────────────────

const WriterSchema = z
  .object({
    profileId: z.string().optional(),
    profileType: z.string().optional(),
    nickname: z.string(),
  })
  .passthrough();

const PostSchema = z
  .object({
    id: z.string(),
    itemCode: z.string().optional(),
    itemName: z.string().optional(),
    postType: z.string(),
    writer: WriterSchema,
    writtenAt: z.string(),
    title: z.string(),
    contentSwReplacedButImg: z.string().optional().default(""),
    replyDepth: z.number(),
    commentCount: z.number().optional().default(0),
    recommendCount: z.number().optional().default(0),
    isCleanbotPassed: z.boolean(),
  })
  .passthrough();

const ApiResponseSchema = z
  .object({
    pageSize: z.number().optional(),
    posts: z.array(PostSchema),
  })
  .passthrough();

const NAVER_DISCUSSION_API =
  "https://stock.naver.com/api/community/discussion/posts/by-item";

function buildNaverApiUrl(code: string): string {
  const params = new URLSearchParams({
    discussionType: "domesticStock",
    itemCode: code,
    isHolderOnly: "false",
    excludesItemNews: "false",
    isItemNewsOnly: "false",
    isCleanbotPassedOnly: "false",
    pageSize: String(PAGE_SIZE),
  });
  return `${NAVER_DISCUSSION_API}?${params.toString()}`;
}

function buildPostUrl(code: string, postId: string): string {
  return `https://stock.naver.com/domestic/stock/${encodeURIComponent(code)}/discussion/${encodeURIComponent(postId)}?chip=all`;
}

/** Bright Data Web Unlocker 경유 fetch — POST /request body 는 zone+url+format+country. */
async function fetchViaBrightData(
  client: AxiosInstance,
  apiKey: string,
  zone: string,
  targetUrl: string,
): Promise<string> {
  const body = {
    zone,
    url: targetUrl,
    format: "raw",
    country: "kr",
  };
  const res = await client.post<string>("", body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json,text/plain,*/*",
    },
    responseType: "text",
    transformResponse: [
      (data) => (typeof data === "string" ? data : String(data)),
    ],
  });
  return res.data;
}

interface ScrapedDiscussion {
  post_id: string;
  title: string;
  body: string | null;
  author: string | null;
  posted_at: string;
  url: string;
}

/** PIVOT 옵션 5 — JSON API 응답을 ScrapedDiscussion[] 으로 정규화. */
function parseDiscussionsJson(raw: string, code: string): ScrapedDiscussion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `naver api response not JSON (first 200B): ${raw.slice(0, 200)}`,
    );
  }
  // 207B fieldErrors 가드 — 필수 파라미터 누락 시 응답.
  if (raw.length < 400 && /fieldErrors|detailCode|invalid_type/i.test(raw)) {
    throw new Error(
      `naver api validation error: ${raw.slice(0, 200)}`,
    );
  }
  const result = ApiResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`naver api schema mismatch: ${result.error.message}`);
  }

  const out: ScrapedDiscussion[] = [];
  for (const post of result.data.posts) {
    if (post.replyDepth !== 0) continue; // 최상위 글만
    if (post.postType !== "normal") continue; // 뉴스봇 itemNewsResearch 제외
    if (post.isCleanbotPassed === false) continue; // cleanbot 1차 필터 (D11)

    const postedAt = parseNaverBoardDate(post.writtenAt);
    if (!postedAt) continue;

    const title = post.title?.trim();
    if (!title) continue;

    const author = post.writer?.nickname?.trim();
    if (!author) continue;

    const url = buildPostUrl(code, post.id);
    if (!isAllowedUrl(url)) continue; // T-07

    out.push({
      post_id: post.id,
      title,
      body: sanitizeBody(post.contentSwReplacedButImg),
      author,
      posted_at: postedAt,
      url,
    });
  }
  return out;
}

// ── Routes ─────────────────────────────────────────────────────────────────

export const discussionsRouter: RouterT = Router({ mergeParams: true });

// GET /api/stocks/:code/discussions
discussionsRouter.get("/", async (req, res, next) => {
  try {
    const paramsParsed = StockCodeParam.safeParse(req.params);
    if (!paramsParsed.success) {
      throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
    }
    const { code } = paramsParsed.data;
    const queryParsed = DiscussionListQuery.safeParse(req.query);
    if (!queryParsed.success) {
      throw InvalidQueryParam(
        queryParsed.error.issues[0].path.join(".") || "query",
        queryParsed.error.issues[0].message,
      );
    }
    const { windowMs, limit, before, filter } = queryParsed.data;

    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1) 마스터 존재 확인
    const { data: master, error: mErr } = await supabase
      .from("stocks")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    // 2) DB 조회 (since = now - windowMs, posted_at DESC) — over-fetch loop.
    //    cursor: before 가 있으면 posted_at < before 로 무한 스크롤 다음 페이지.
    //    Phase 08.1 — filter=meaningful: relevance IS NULL OR relevance != 'noise'
    //      (아직 분류 안 된 행 + 유의미 라벨만 통과, noise 제외)
    //
    //    Phase 08.2 — D11 사후 스팸 필터로 응답이 limit 미만으로 깎이는 문제 해결:
    //    한 round 에 limit*2 raw 를 가져와 spam 필터링 후 acc 에 누적, acc.length >= limit
    //    채워질 때까지 cursor 를 진행해 추가 fetch (max 3 round). client 무한 스크롤이
    //    "득득득" 짧게 끊겨 trigger 되는 현상 제거.
    const since = new Date(Date.now() - windowMs).toISOString();
    const FETCH_SIZE = limit * 2;
    const MAX_ROUNDS = 3;
    const accFiltered: DiscussionRow[] = [];
    let cursor: string | undefined = before;
    let lastFetchHadFull = false;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let q = supabase
        .from("discussions")
        .select(DISCUSSION_SELECT)
        .eq("stock_code", code)
        .gte("posted_at", since);
      if (filter === 'meaningful') {
        q = q.or('relevance.is.null,relevance.neq.noise');
      }
      q = q.order("posted_at", { ascending: false }).limit(FETCH_SIZE);
      if (cursor) q = q.lt("posted_at", cursor);
      const { data, error } = await q;
      if (error) throw error;
      const rawRows = ((data ?? []) as DiscussionRow[]) || [];
      if (rawRows.length === 0) {
        lastFetchHadFull = false;
        break;
      }
      lastFetchHadFull = rawRows.length === FETCH_SIZE;
      accFiltered.push(...filterSpam(rawRows));
      if (accFiltered.length >= limit) break;
      if (!lastFetchHadFull) break; // DB 에 더 이상 row 없음
      cursor = rawRows[rawRows.length - 1].posted_at; // 다음 round 진행
    }

    // 3) hasMore: 누적된 acc 가 limit 초과 OR 마지막 fetch 가 가득 찼으면 다음 페이지 가능.
    const items = accFiltered.slice(0, limit);
    const hasMore = accFiltered.length > limit || lastFetchHadFull;
    res.json({ items: items.map(toDiscussion), hasMore });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return next(InvalidQueryParam("discussions", e.issues[0].message));
    }
    next(e);
  }
});

// POST /api/stocks/:code/discussions/refresh
discussionsRouter.post("/refresh", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const brightdataClient = req.app.locals.brightdataClient as
      | AxiosInstance
      | undefined;
    const brightdataApiKey = req.app.locals.brightdataApiKey as
      | string
      | undefined;
    const brightdataZone =
      (req.app.locals.brightdataZone as string | undefined) ?? "gh_radar_naver";

    if (!brightdataClient || !brightdataApiKey) {
      throw ProxyUnavailable();
    }

    const paramsParsed = StockCodeParam.safeParse(req.params);
    if (!paramsParsed.success) {
      throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
    }
    const { code } = paramsParsed.data;

    // 1) 마스터 존재 확인
    const { data: master, error: mErr } = await supabase
      .from("stocks")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);

    // 2) D8 30s 쿨다운 — MAX(scraped_at)
    const { data: latest, error: lErr } = await supabase
      .from("discussions")
      .select("scraped_at")
      .eq("stock_code", code)
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) throw lErr;
    if (latest?.scraped_at) {
      const elapsedMs = Date.now() - Date.parse(latest.scraped_at);
      if (elapsedMs < COOLDOWN_SECONDS * 1000) {
        const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
        res.setHeader("Retry-After", String(remaining));
        res.status(429).json({
          error: {
            code: "DISCUSSION_REFRESH_COOLDOWN",
            message: `잠시 후 다시 시도해주세요 (${remaining}s)`,
          },
          retry_after_seconds: remaining,
        });
        return;
      }
    }

    // D4 — 캐시 신선도 체크: MAX(scraped_at) < 10min 이면 프록시 호출 skip 하고 캐시 반환.
    // (cooldown 30s 보다 긴 캐시 TTL 10min 이 갱신을 한 번 더 막는다.)
    if (latest?.scraped_at) {
      const elapsedCacheMs = Date.now() - Date.parse(latest.scraped_at);
      if (elapsedCacheMs < CACHE_TTL_MS) {
        // cache fresh — 프록시 호출 없이 24h / 5건 반환 (기본 상세 Card 패턴)
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { data: fresh, error: fe } = await supabase
          .from("discussions")
          .select(DISCUSSION_SELECT)
          .eq("stock_code", code)
          .gte("posted_at", since)
          .order("posted_at", { ascending: false })
          .limit(5);
        if (fe) throw fe;
        const filtered = filterSpam(((fresh ?? []) as DiscussionRow[]) || []);
        res.json(filtered.map(toDiscussion));
        return;
      }
    }

    // 3) 예산 체크 — atomic RPC (Phase 7 패턴, label `proxy_naver_discussion`)
    const { data: usedCount, error: uErr } = await supabase.rpc(
      "incr_api_usage",
      {
        p_service: "proxy_naver_discussion",
        p_date: kstDateString(),
        p_amount: 1,
      },
    );
    if (uErr) throw uErr;
    if (Number(usedCount) > DAILY_BUDGET) throw ProxyBudgetExhausted();

    // 4) Bright Data 경유 JSON API fetch + parse
    const targetUrl = buildNaverApiUrl(code);
    let scraped: ScrapedDiscussion[] = [];
    try {
      const rawBody = await fetchViaBrightData(
        brightdataClient,
        brightdataApiKey,
        brightdataZone,
        targetUrl,
      );
      scraped = parseDiscussionsJson(rawBody, code);
    } catch (err) {
      logger.warn(
        { code, err: (err as Error).message },
        "discussion refresh proxy fetch failed",
      );
      throw ProxyUnavailable();
    }

    // 5) UPSERT — DB 스키마에 url 컬럼 없음 → row 에서 url 제외.
    const scrapedAt = new Date().toISOString();
    const upsertRows = scraped.map((s) => ({
      stock_code: code,
      post_id: s.post_id,
      title: s.title,
      body: s.body,
      author: s.author,
      posted_at: s.posted_at,
      scraped_at: scrapedAt,
    }));
    if (upsertRows.length > 0) {
      // Phase 08.1 — upsert().select('id,title,body,classified_at') 로 확장하여
      // 분류되지 않은 행(classified_at IS NULL)을 inline classify 에 전달.
      const { data: upserted, error: upErr } = await supabase
        .from("discussions")
        .upsert(upsertRows, {
          onConflict: "stock_code,post_id",
          ignoreDuplicates: false,
        })
        .select("id,title,body,classified_at");
      if (upErr) throw upErr;

      // 5.5) Phase 08.1 — inline classify: 방금 upsert 된 미분류 행만 분류.
      //       실패/미설정은 non-fatal — refresh 응답은 그대로 성공 반환.
      const unclassified = ((upserted ?? []) as Array<{
        id: string;
        title: string;
        body: string | null;
        classified_at: string | null;
      }>)
        .filter((r) => r.classified_at == null)
        .map((r) => ({ id: r.id, title: r.title, body: r.body }));
      if (unclassified.length > 0) {
        try {
          const n = await classifyAndPersist(supabase, unclassified);
          logger.info(
            { code, classified: n, attempted: unclassified.length },
            "discussion refresh inline classify",
          );
        } catch (err) {
          logger.warn(
            { code, err: (err as Error).message },
            "discussion refresh classify failed — non-fatal",
          );
        }
      }
    }

    // 6) 갱신 후 24h 상위 5건 반환 (상세 Card 기본)
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: fresh, error: fe } = await supabase
      .from("discussions")
      .select(DISCUSSION_SELECT)
      .eq("stock_code", code)
      .gte("posted_at", since)
      .order("posted_at", { ascending: false })
      .limit(5);
    if (fe) throw fe;
    const filtered = filterSpam(((fresh ?? []) as DiscussionRow[]) || []);
    res.json(filtered.map(toDiscussion));
  } catch (e) {
    next(e);
  }
});
