import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateIso, type ThemeWithStats, type ThemeStockMember } from "@gh-radar/shared";
import { ThemeByStockQuery, ThemeDetailParams } from "../schemas/themes.js";
import {
  systemThemeListRowToThemeWithStats,
  themeRowToThemeWithStats,
  themeStockRowToMember,
  type SystemThemeListRow,
  type ThemeRow,
  type ThemeStockRow,
} from "../mappers/theme.js";
import { ApiError } from "../errors.js";
import {
  ROW_PAGE,
  fetchQuotesChunked,
  fetchMastersChunked,
} from "../lib/quoteJoin.js";

/**
 * GET /api/themes 결과 캐시 TTL. 시세(stock_quotes)가 1분 단위로 갱신되고 webapp 은 60초
 * 폴링하므로 30초면 표시 신선도는 그대로이고, 페이지 재방문·다중 사용자 요청은 쿼리 없이 응답한다.
 */
const LIST_CACHE_TTL_MS = 30_000;

/**
 * supabase 클라이언트별 목록 캐시 (진행 중 요청도 공유 — 동시 요청이 쿼리를 중복 발사하지 않는다).
 * 클라이언트 키라 테스트마다 새 mock 을 주입하면 캐시가 섞이지 않는다.
 */
const listCache = new WeakMap<
  SupabaseClient,
  { at: number; promise: Promise<ThemeWithStats[]> }
>();

const THEME_COLS =
  "id,name,description,is_system,owner_id,sources,top3_avg_change_rate,stats_updated_at,created_at,updated_at";
const THEME_STOCK_COLS =
  "theme_id,stock_code,source,confidence,reason,effective_from,effective_to";

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
    const result = await getSystemThemeList(supabase);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** LIST_CACHE_TTL_MS 안이면 캐시(진행 중 promise 포함)를, 아니면 새로 계산. 실패는 캐시하지 않는다. */
function getSystemThemeList(supabase: SupabaseClient): Promise<ThemeWithStats[]> {
  const hit = listCache.get(supabase);
  if (hit && Date.now() - hit.at < LIST_CACHE_TTL_MS) return hit.promise;
  const entry = { at: Date.now(), promise: computeSystemThemeList(supabase) };
  listCache.set(supabase, entry);
  entry.promise.catch(() => {
    if (listCache.get(supabase) === entry) listCache.delete(supabase);
  });
  return entry.promise;
}

async function computeSystemThemeList(
  supabase: SupabaseClient,
): Promise<ThemeWithStats[]> {
  // 1~4. 시스템 테마(hidden 제외) + 활성 멤버 수 + 시세 있는 멤버 등락률 상위3평균을 DB 가
  //      한 번에 집계한다 (migration 20260913150000_system_theme_list_rpc.sql — 집계 계약은 그
  //      파일 헤더). 종전엔 themes·theme_stocks 청크·stock_quotes 청크를 합쳐 PostgREST 를
  //      28회 왕복했는데, Cloud Run 은 VPC all-traffic egress 라 왕복 비용이 커 캐시 미스가
  //      1초를 넘었다. jsonb 단일 값이라 max_rows(1000) 에 잘리지 않는다.
  const { data, error } = await supabase.rpc("system_theme_list");
  if (error) throw error;
  const rows = (data ?? []) as SystemThemeListRow[];
  const result: ThemeWithStats[] = rows.map(systemThemeListRowToThemeWithStats);

  // 5. top3AvgChangeRate desc (null 은 맨 뒤 — D-14)
  result.sort((a, b) => {
    const av = a.top3AvgChangeRate;
    const bv = b.top3AvgChangeRate;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });

  return result;
}

/**
 * `GET /api/themes/by-stock` 응답 원소(inbox 261019-theme-by-stock). 클라(gh-trade WinForms)가 `themes[0].name` 을 「테마」 열에 쓴다.
 * `kind`: `today` = 오늘 최신 「오늘의 급등 테마」 스냅샷 · `recent` = 최근 거래일의 급등 테마(그날 마지막 스냅샷) ·
 * `system` = 시스템 테마(theme_stocks · 편입일 최신). 한 코드의 themes 는 한 kind 로만 채운다(사용자 규칙 2026-10-19).
 */
export type ThemeByStockEntry = {
  code: string;
  themes: {
    kind: "today" | "recent" | "system";
    name: string;
    /** 시스템 테마 id — today · recent 는 null(AI 클러스터는 id 가 없다). */
    id: string | null;
    /** today · recent — 그 스냅샷의 거래일(YYYY-MM-DD) · 시각(ISO). system 은 null. */
    tradeDate: string | null;
    capturedAt: string | null;
    /** system — 편입 시각(ISO) · source. today · recent 는 null. */
    effectiveFrom: string | null;
    source: string | null;
  }[];
};

/** 코드별 테마 상한 — 인박스 계약 「최대 3」. */
export const THEME_BY_STOCK_TOP = 3;
/** 급등 테마 역조회 창(KST 달력일) — ② 「최근 날짜의 급등 테마」 를 거슬러 보는 범위. */
export const THEME_BY_STOCK_DAYS = 30;
/** by-stock 응답 캐시 TTL — 「오늘의 급등 테마」 가 1분마다 바뀌므로 60초(클라 폴링 1분). */
export const BY_STOCK_CACHE_TTL_MS = 60_000;

/** `home_theme_by_stock` RPC 행 — 거래일 내림차순 · 거래일별 최신 스냅샷의 (code, 테마) 쌍. */
type HomeThemeHitRow = { code: string; trade_date: string; captured_at: string; theme_name: string };

/** 코드 집합(정렬 · 결합 문자열) → 응답 캐시(진행 중 promise 포함). 클라이언트별이라 테스트 목이 섞이지 않는다. */
const byStockCache = new WeakMap<SupabaseClient, Map<string, { at: number; promise: Promise<ThemeByStockEntry[]> }>>();

/**
 * 여러 종목의 active(effective_to IS NULL) theme_stocks 행 — ROW_PAGE 페이지네이션 전수 수집(db-max-rows 절단 방지 ·
 * `fetchActiveThemeStocksForOne` 과 같은 규율). 정렬은 DB 가 effective_from desc 로 준다.
 */
async function fetchActiveThemeStocksForCodes(
  supabase: SupabaseClient,
  codes: readonly string[],
): Promise<ThemeStockRow[]> {
  const out: ThemeStockRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("theme_stocks")
      .select(THEME_STOCK_COLS)
      .in("stock_code", codes as string[])
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .range(from, from + ROW_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ThemeStockRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    from += rows.length;
    if (rows.length < ROW_PAGE) break;
  }
  return out;
}

/** ③ 시스템 테마 폴백 — 코드별 active 행을 편입일 최신순 최대 THEME_BY_STOCK_TOP. 유저 테마 · hidden 제외. */
async function systemThemesByCode(
  supabase: SupabaseClient,
  codes: readonly string[],
): Promise<Map<string, ThemeByStockEntry["themes"]>> {
  const byCode = new Map<string, ThemeByStockEntry["themes"]>();
  if (codes.length === 0) return byCode;
  const memberRows = await fetchActiveThemeStocksForCodes(supabase, codes);
  const themeIds = [...new Set(memberRows.map((r) => r.theme_id))];
  const nameById = new Map<string, string>();
  if (themeIds.length > 0) {
    const { data, error } = await supabase
      .from("themes")
      .select("id,name")
      .in("id", themeIds)
      .eq("is_system", true)
      .eq("hidden", false);
    if (error) throw error;
    for (const t of (data ?? []) as { id: string; name: string }[]) nameById.set(t.id, t.name);
  }
  for (const r of memberRows) {
    const name = nameById.get(r.theme_id);
    if (name === undefined) continue; // 유저 테마 · hidden
    const list = byCode.get(r.stock_code) ?? [];
    if (list.length >= THEME_BY_STOCK_TOP) continue;
    list.push({
      kind: "system",
      name,
      id: r.theme_id,
      tradeDate: null,
      capturedAt: null,
      effectiveFrom: r.effective_from,
      source: r.source,
    });
    byCode.set(r.stock_code, list);
  }
  // DB 정렬(effective_from desc)을 믿되, 페이지 경계에서 섞였을 때를 대비해 코드 안에서 한 번 더 정렬한다.
  for (const list of byCode.values()) {
    list.sort((a, b) => ((a.effectiveFrom ?? "") < (b.effectiveFrom ?? "") ? 1 : (a.effectiveFrom ?? "") > (b.effectiveFrom ?? "") ? -1 : 0));
  }
  return byCode;
}

/**
 * 종목별 테마 판정(사용자 규칙 2026-10-19) — ① 오늘 최신 「오늘의 급등 테마」 스냅샷 → ② 최근 거래일(창 THEME_BY_STOCK_DAYS)의
 * 급등 테마(그날 마지막 스냅샷) → ③ 시스템 테마 최신. ①② 는 RPC `home_theme_by_stock` 1회(거래일 내림차순 · 거래일별 최신
 * 스냅샷), ③ 은 ①② 에 없는 코드만 theme_stocks 로 보충. 응답은 입력 코드 순서 · 테마 없는 코드 생략.
 */
async function computeThemesByStock(supabase: SupabaseClient, codes: readonly string[]): Promise<ThemeByStockEntry[]> {
  const { data, error } = await supabase.rpc("home_theme_by_stock", {
    p_codes: codes as string[],
    p_days: THEME_BY_STOCK_DAYS,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("home_theme_by_stock 모양 위반 — 배열이 아니다");
  const today = kstDateIso();
  // 코드별로 가장 최근 거래일 한 날의 테마만(RPC 가 거래일 내림차순이라 첫 거래일 = 가장 최근).
  const surge = new Map<string, ThemeByStockEntry["themes"]>();
  for (const r of data as HomeThemeHitRow[]) {
    const list = surge.get(r.code);
    if (list !== undefined && list[0]!.tradeDate !== r.trade_date) continue; // 더 옛 거래일
    if (list !== undefined && list.length >= THEME_BY_STOCK_TOP) continue;
    const entry = {
      kind: (r.trade_date === today ? "today" : "recent") as "today" | "recent",
      name: r.theme_name,
      id: null,
      tradeDate: r.trade_date,
      capturedAt: r.captured_at,
      effectiveFrom: null,
      source: null,
    };
    if (list === undefined) surge.set(r.code, [entry]);
    else list.push(entry);
  }
  const missing = codes.filter((c) => !surge.has(c));
  const system = await systemThemesByCode(supabase, missing);
  const out: ThemeByStockEntry[] = [];
  for (const code of codes) {
    const themes = surge.get(code) ?? system.get(code);
    if (themes === undefined || themes.length === 0) continue;
    out.push({ code, themes });
  }
  return out;
}

/** BY_STOCK_CACHE_TTL_MS 안이면 같은 코드 집합의 캐시(진행 중 promise 포함)를, 아니면 새로 계산. 실패는 캐시하지 않는다. */
function getThemesByStock(supabase: SupabaseClient, codes: readonly string[]): Promise<ThemeByStockEntry[]> {
  let perClient = byStockCache.get(supabase);
  if (perClient === undefined) {
    perClient = new Map();
    byStockCache.set(supabase, perClient);
  }
  const key = [...codes].sort().join(",");
  const hit = perClient.get(key);
  if (hit && Date.now() - hit.at < BY_STOCK_CACHE_TTL_MS) return hit.promise;
  // 오래된 항목 정리 — 코드 집합이 매번 달라도 맵이 자라지 않게.
  for (const [k, v] of perClient) if (Date.now() - v.at >= BY_STOCK_CACHE_TTL_MS) perClient.delete(k);
  const entry = { at: Date.now(), promise: computeThemesByStock(supabase, codes) };
  perClient.set(key, entry);
  entry.promise.catch(() => {
    if (perClient!.get(key) === entry) perClient!.delete(key);
  });
  return entry.promise;
}

/**
 * GET /api/themes/by-stock?codes=005930,000660,…  (inbox 261019-theme-by-stock · gh-trade 매집감지창·돌파감지창 「테마」 열)
 *
 * - 쿼리: 6자리 코드 쉼표 구분 · 최대 100 · 초과/형식 오류 400 (`ThemeByStockQuery`).
 * - 응답: bare array `ThemeByStockEntry[]` — 입력 순서 · 코드별 `kind` 하나(today → recent → system)로 최대 3개 · 테마 없는 코드 생략.
 * - 인증 없음(`/api/themes` 와 같음) · `Cache-Control: public, max-age=60`(「오늘의 급등 테마」 1분 갱신 · 클라 폴링 1분).
 * - 왕복: RPC 1회 + (폴백 코드가 있을 때만) theme_stocks · themes 각 1회. 코드 집합별 60초 캐시.
 *   ★ 라우트 순서: `/:id` 보다 앞에 둔다 — 뒤에 두면 "by-stock" 이 uuid 검증에 걸려 400 이 된다.
 */
themesRouter.get("/by-stock", async (req, res, next) => {
  try {
    const parsed = ThemeByStockQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(400, "INVALID_QUERY_PARAM", `${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const out = await getThemesByStock(supabase, parsed.data.codes);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(out);
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
