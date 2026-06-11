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
import { ApiError } from "../errors.js";
import {
  QUOTE_CHUNK,
  ROW_PAGE,
  fetchQuotesChunked,
  fetchMastersChunked,
} from "../lib/quoteJoin.js";

const THEME_COLS =
  "id,name,description,is_system,owner_id,sources,top3_avg_change_rate,stats_updated_at,created_at,updated_at";
const THEME_STOCK_COLS =
  "theme_id,stock_code,source,confidence,reason,effective_from,effective_to";

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
    // 결과 행 페이지네이션(ROW_PAGE) — 한 theme_id 청크의 active 행이 1000 을 넘으면
    // PostgREST 가 통째로 잘라 그 너머 테마가 stockCount=0 으로 사라진다(목록 합계가
    // 정확히 2000=2×1000 으로 관측됨). 안정 정렬(PK) + .range() 로 끝까지 수집.
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("theme_stocks")
        .select(THEME_STOCK_COLS)
        .in("theme_id", chunk)
        .is("effective_to", null)
        .order("theme_id", { ascending: true })
        .order("stock_code", { ascending: true })
        .range(from, from + ROW_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ThemeStockRow[];
      if (rows.length === 0) break;
      out.push(...rows);
      from += rows.length;
    }
  }
  return out;
}

/**
 * 단일 테마의 active(effective_to IS NULL) theme_stocks 행을 ROW_PAGE 페이지네이션으로 전수 수집.
 *
 * 상세 라우트(GET /api/themes/:id)용. 목록 라우트의 청크 페이지네이션과 동일 버그 클래스
 * (활성 멤버 >1000 테마면 PostgREST db-max-rows 1000 으로 침묵 절단 → stockCount 오류 +
 * top3 불완전)를 detail 경로에서도 방어한다.
 */
async function fetchActiveThemeStocksForOne(
  supabase: SupabaseClient,
  themeId: string,
): Promise<ThemeStockRow[]> {
  const out: ThemeStockRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("theme_stocks")
      .select(THEME_STOCK_COLS)
      .eq("theme_id", themeId)
      .is("effective_to", null)
      .order("stock_code", { ascending: true })
      .range(from, from + ROW_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ThemeStockRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    from += rows.length;
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
    //    hidden=false 만 — service_role 은 RLS 우회라 코드로 tombstone(운영자 삭제) 필터 필수.
    const { data: themes, error: tErr } = await supabase
      .from("themes")
      .select(THEME_COLS)
      .eq("is_system", true)
      .eq("hidden", false);
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
 * 시스템 테마 단건 — 메타 + 실시간 통계 + 소속 active 종목.
 * 반환 형태: `ThemeWithStats & { stocks: ThemeStockMember[] }` (webapp fetchSystemThemeDetail 계약).
 *
 *   - :id uuid 검증 (T-10-04-01) → 400
 *   - 시스템 테마(is_system=true) 단건 없으면 404 (유저 테마는 webapp→Supabase 경로, T-10-04-04)
 *   - theme_stocks active → stocks 마스터 + stock_quotes 청크 조인 → stocks[]
 *   - 테마 메타(name/sources/...) + 상위3평균/종목수 실시간 계산 → 상세 헤더가 필요로 하는 객체
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

    // 1. 시스템 테마 단건 — 전체 컬럼(상세 헤더 메타 + 상위3평균 계산 소스).
    //    유저 테마는 404 (시스템 전용 라우트 — 유저 테마는 webapp→Supabase 경로).
    const { data: theme, error: tErr } = await supabase
      .from("themes")
      .select(THEME_COLS)
      .eq("id", id)
      .eq("is_system", true)
      .eq("hidden", false) // tombstone(운영자 삭제) 은 404 (service_role RLS 우회 → 코드 필터)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!theme) throw new ApiError(404, "THEME_NOT_FOUND", `Theme ${id} not found`);
    const themeRow = theme as unknown as ThemeRow;

    // 2. active 멤버 (effective_to IS NULL) — ROW_PAGE 페이지네이션으로 전수 수집.
    //    멤버 >1000 테마(반도체/2차전지 union)에서 db-max-rows 1000 침묵 절단 방지
    //    (목록 라우트와 동일 버그 클래스, detail 에도 동일 하드닝).
    const memberRows = await fetchActiveThemeStocksForOne(supabase, id);

    // 3. 마스터(name/market) + 시세 청크 조인 (37afcde 회귀 방지).
    //    멤버 0개면 codes=[] → 청크 루프 미실행(빈 Map) → stocks=[] 로 자연 처리.
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

    // 4. 테마 메타 + 실시간 상위3평균/종목수 → ThemeWithStats & { stocks }.
    //    webapp ThemeDetailClient 계약(theme-api.ts fetchSystemThemeDetail)과 정확히 일치.
    //    이전엔 bare ThemeStockMember[] 만 반환 → 상세 헤더의 theme.sources 가 undefined →
    //    ThemeSourceBadges 의 sources.filter() 가 throw → 전역 error.tsx("문제가 발생했어요").
    const withStats = themeRowToThemeWithStats(themeRow, codes, quoteByCode);

    res.setHeader("Cache-Control", "no-store");
    res.json({ ...withStats, stocks });
  } catch (e) {
    next(e);
  }
});
