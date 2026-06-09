import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThemeWithStats, ThemeStockMember } from "@gh-radar/shared";
import { ThemeDetailParams } from "../schemas/themes.js";
import {
  themeRowToThemeWithStats,
  themeStockRowToMember,
  type ThemeRow,
  type ThemeStockRow,
} from "../mappers/theme.js";
import type { StockMasterRow, StockQuoteRow } from "../mappers/stock.js";
import { ApiError } from "../errors.js";

const THEME_COLS =
  "id,name,description,is_system,owner_id,sources,top3_avg_change_rate,stats_updated_at,created_at,updated_at";
const THEME_STOCK_COLS =
  "theme_id,stock_code,source,confidence,reason,effective_from,effective_to";
const QUOTE_COLS =
  "code,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";
const MASTER_COLS = "code,name,market";

/**
 * stock_quotes IN 청크 크기.
 *
 * codes 가 수백~수천 개로 늘면 단일 .in() 이 PostgREST URL 한계(414)로 통째 실패해
 * 빈 응답 회귀를 일으킨다 (2026-06-09 intraday-sync 강세장 회귀, commit 37afcde + tasks/lessons.md).
 * 테마는 종목 합집합이 수천 개일 수 있으므로 반드시 청크 분할 + error throw.
 */
const QUOTE_CHUNK = 200;

/**
 * stock_quotes 를 code 청크(QUOTE_CHUNK)로 나눠 IN fetch → Map<code, quote>.
 *
 * error 는 throw — 조용히 빈 결과로 진행하면 등락률이 전부 0/누락되어
 * 정렬/표시가 silent 하게 깨진다 (37afcde 교훈: error 무시 금지).
 */
async function fetchQuotesChunked(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, StockQuoteRow>> {
  const byCode = new Map<string, StockQuoteRow>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("stock_quotes")
      .select(QUOTE_COLS)
      .in("code", chunk);
    if (error) throw error;
    for (const q of (data ?? []) as unknown as StockQuoteRow[]) {
      byCode.set(q.code, q);
    }
  }
  return byCode;
}

/**
 * stocks 마스터(name/market)를 code 청크로 나눠 IN fetch → Map<code, master>.
 * 상세 응답(ThemeStockMember)의 종목명/마켓 캐노니컬 소스. (목록은 마스터 불필요.)
 */
async function fetchMastersChunked(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, StockMasterRow>> {
  const byCode = new Map<string, StockMasterRow>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("stocks")
      .select(MASTER_COLS)
      .in("code", chunk);
    if (error) throw error;
    for (const m of (data ?? []) as unknown as StockMasterRow[]) {
      byCode.set(m.code, m);
    }
  }
  return byCode;
}

/**
 * theme_stocks active(effective_to IS NULL) 행을 theme_id 청크로 IN fetch.
 * theme_id 도 시스템 테마가 수백 개일 수 있어 청크 분할(목록 경로).
 */
async function fetchActiveThemeStocksChunked(
  supabase: SupabaseClient,
  themeIds: string[],
): Promise<ThemeStockRow[]> {
  const out: ThemeStockRow[] = [];
  for (let i = 0; i < themeIds.length; i += QUOTE_CHUNK) {
    const chunk = themeIds.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("theme_stocks")
      .select(THEME_STOCK_COLS)
      .in("theme_id", chunk)
      .is("effective_to", null);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as ThemeStockRow[]));
  }
  return out;
}

export const themesRouter: RouterT = Router();

/**
 * GET /api/themes
 * 시스템 테마 목록 + 소속 종목 등락률 상위3 평균(D-14) 내림차순 정렬.
 *
 * 흐름 (scanner.ts 동형 — codes → stock_quotes IN → 메모리 집계):
 *   1. themes(is_system=true)
 *   2. theme_stocks active(effective_to IS NULL) IN(themeIds) — 청크
 *   3. 종목 code 합집합 → stock_quotes 청크 IN → Map<code, quote>
 *   4. 테마별 등락률 상위3 평균 계산 → ThemeWithStats[]
 *   5. top3AvgChangeRate desc 정렬 (null 은 뒤로)
 */
themesRouter.get("/", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. 시스템 테마 (RLS: read_system_themes / service_role bypass)
    const { data: themes, error: tErr } = await supabase
      .from("themes")
      .select(THEME_COLS)
      .eq("is_system", true);
    if (tErr) throw tErr;
    const themeRows = (themes ?? []) as unknown as ThemeRow[];

    if (themeRows.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.json([]);
      return;
    }

    // 2. active theme_stocks (청크 IN)
    const themeIds = themeRows.map((t) => t.id);
    const memberRows = await fetchActiveThemeStocksChunked(supabase, themeIds);

    // theme_id → code[] + 전체 code 합집합
    const codesByTheme = new Map<string, string[]>();
    const allCodes = new Set<string>();
    for (const m of memberRows) {
      const arr = codesByTheme.get(m.theme_id);
      if (arr) arr.push(m.stock_code);
      else codesByTheme.set(m.theme_id, [m.stock_code]);
      allCodes.add(m.stock_code);
    }

    // 3. stock_quotes 청크 IN (37afcde 회귀 방지)
    const quoteByCode = await fetchQuotesChunked(supabase, [...allCodes]);

    // 4. 테마별 ThemeWithStats (상위3평균 실시간 계산)
    const result: ThemeWithStats[] = themeRows.map((t) =>
      themeRowToThemeWithStats(
        t,
        codesByTheme.get(t.id) ?? [],
        quoteByCode,
      ),
    );

    // 5. top3AvgChangeRate desc (null 은 맨 뒤 — D-14)
    result.sort((a, b) => {
      const av = a.top3AvgChangeRate;
      const bv = b.top3AvgChangeRate;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/themes/:id
 * 시스템 테마 단건의 소속 active 종목 리스트(ThemeStockMember[]).
 *
 *   - :id uuid 검증 (T-10-04-01) → 400
 *   - 시스템 테마(is_system=true) 단건 없으면 404 (유저 테마는 webapp→Supabase 경로, T-10-04-04)
 *   - theme_stocks active → stocks 마스터 + stock_quotes 청크 조인 → ThemeStockMember[]
 */
themesRouter.get("/:id", async (req, res, next) => {
  try {
    const parsed = ThemeDetailParams.safeParse(req.params);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const { id } = parsed.data;
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. 시스템 테마 존재 확인 (유저 테마는 404 — 시스템 전용 라우트)
    const { data: theme, error: tErr } = await supabase
      .from("themes")
      .select("id")
      .eq("id", id)
      .eq("is_system", true)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!theme) throw new ApiError(404, "THEME_NOT_FOUND", `Theme ${id} not found`);

    // 2. active 멤버 (effective_to IS NULL)
    const { data: members, error: mErr } = await supabase
      .from("theme_stocks")
      .select(THEME_STOCK_COLS)
      .eq("theme_id", id)
      .is("effective_to", null);
    if (mErr) throw mErr;
    const memberRows = (members ?? []) as unknown as ThemeStockRow[];

    if (memberRows.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.json([]);
      return;
    }

    // 3. 마스터(name/market) + 시세 청크 조인 (37afcde 회귀 방지)
    const codes = memberRows.map((m) => m.stock_code);
    const masterByCode = await fetchMastersChunked(supabase, codes);
    const quoteByCode = await fetchQuotesChunked(supabase, codes);

    const stocks: ThemeStockMember[] = memberRows.map((m) =>
      themeStockRowToMember(
        m,
        masterByCode.get(m.stock_code) ?? null,
        quoteByCode.get(m.stock_code) ?? null,
      ),
    );

    res.setHeader("Cache-Control", "no-store");
    res.json(stocks);
  } catch (e) {
    next(e);
  }
});
