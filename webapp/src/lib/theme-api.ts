/**
 * Phase 10 Plan 05 Task 1 — Theme API (유저 테마 Supabase 직접 + 시스템 테마 Express).
 *
 * 데이터 경로 분리 (RESEARCH §데이터 흐름, D-01):
 * - **시스템 테마** (전역, read-only): Express `GET /api/themes` (service-role 집계 +
 *   stock_quotes 조인으로 상위3평균 정렬). RLS 우회 — 공개 데이터. `fetchSystemThemes` /
 *   `fetchSystemThemeDetail` 이 `apiFetch` 경유.
 * - **유저 테마** (per-user CRUD): webapp → Supabase PostgREST 직접. RLS `owner_id = auth.uid()`
 *   가 자동 필터 (watchlist 선례). 유저 쓰기는 절대 Express 를 경유하지 않음 — RLS 가 owner
 *   강제, service-role 라우트는 유저 테마를 노출하지 않음(Plan 04 is_system 필터).
 *
 * 보안 (Plan 02 마이그레이션이 강제):
 * - 모든 유저 쓰기에 `is_system=false` + `owner_id=userId` → RLS WITH CHECK(insert/update_own_themes)
 *   통과 + 시스템 테마 위조 차단 (T-10-05-02). fork 도 새 row 생성 — 원본 시스템 테마 불변.
 * - fetchMyThemes 는 user_id 필터 없이 호출해도 RLS read_own_themes(owner_id=auth.uid()) 가
 *   DB 레벨에서 타인 테마를 차단 (T-10-05-01, watchlist 선례).
 * - fork 는 active 멤버십(effective_to IS NULL)만 복사 — D-05 스냅샷 의미 (T-10-05-03).
 * - 유저 종목 50-limit / 테마 50-limit = BEFORE INSERT trigger (P0001). 호출자가
 *   `isThemeStockLimitError` 로 식별해 UI 안내 (T-10-05-04).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Market,
  ThemeStockMember,
  ThemeStockSource,
  ThemeWithStats,
} from '@gh-radar/shared';

import { apiFetch } from './api';

/**
 * 유저 테마/종목 50-limit trigger 가 던지는 PostgreSQL SQLSTATE.
 * - 종목수 초과: message='user_theme_stock_limit_exceeded'
 * - 테마수 초과: message='user_theme_count_limit_exceeded'
 * 둘 다 동일 코드 P0001 — UI 는 message 로 세부 구분(Plan 07).
 */
export const THEME_STOCK_LIMIT_CODE = 'P0001' as const;

/** Supabase 에러(또는 throw 된 값)가 50-limit trigger(P0001) 인지 식별. */
export function isThemeStockLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === THEME_STOCK_LIMIT_CODE
  );
}

/**
 * Supabase 에러 객체를 throw 가능한 Error 로 정규화한다.
 * PostgREST 에러는 plain object({code, message, details, hint}) 라 그대로 throw 하면
 * stack 이 없다. P0001 식별을 위해 code 를 보존한 Error 로 감싼다.
 */
function toThrowable(error: { code?: string; message?: string }): Error {
  const err = new Error(error.message ?? 'Supabase request failed') as Error & {
    code?: string;
  };
  if (error.code) err.code = error.code;
  return err;
}

// =============================================================================
// 시스템 테마 — Express /api/themes (service-role)
// =============================================================================

/**
 * 시스템 테마 목록 (등락률 상위3 평균 desc 정렬). Express service-role 경로.
 * RLS 우회 + stock_quotes 조인 집계는 서버에 적합 (scanner 선례, Plan 04).
 */
export function fetchSystemThemes(): Promise<ThemeWithStats[]> {
  return apiFetch<ThemeWithStats[]>('/api/themes');
}

/** 시스템 테마 상세 (소속 active 종목 ThemeStockMember[]). Plan 04 GET /api/themes/:id. */
export function fetchSystemThemeDetail(
  id: string,
): Promise<ThemeWithStats & { stocks: ThemeStockMember[] }> {
  return apiFetch<ThemeWithStats & { stocks: ThemeStockMember[] }>(
    `/api/themes/${id}`,
  );
}

// =============================================================================
// 내 테마 — Supabase 직접 (RLS owner-only)
// =============================================================================

interface RawMyThemeRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  owner_id: string | null;
  sources: string[] | null;
  top3_avg_change_rate: number | string | null;
  stats_updated_at: string | null;
  created_at: string;
  updated_at: string;
  // PostgREST count 집계: `theme_stocks(count)` → [{ count: N }] (1:N 은 array)
  theme_stocks: { count: number }[] | { count: number } | null;
}

/**
 * active 멤버의 등락률 상위 3 평균 — 시스템 테마 랭킹과 동일 지표(상세 헤더/랭킹 행 표시).
 * 종목 없으면 null. 시세 부재 종목(changeRate=0 폴백)은 finite 라 포함(상세 표시와 일관).
 */
function computeTop3Avg(members: ThemeStockMember[]): number | null {
  const rates = members
    .map((m) => m.changeRate)
    .filter((r) => Number.isFinite(r))
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (rates.length === 0) return null;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

/**
 * 로그인 사용자의 유저 테마 목록 — 시스템 랭킹과 동일하게 상위3평균 desc 정렬.
 *
 * RLS read_own_themes 가 owner 자동 필터(T-10-05-01) — user_id 전달 불필요. is_system=false
 * 명시로 시스템 테마 제외. fetchMyThemeDetail 과 동일한 nested embed(theme_stocks → stocks →
 * stock_quotes)로 멤버 시세를 끌어와 클라이언트에서 top3평균 계산 → ThemeRankRow 가 시스템
 * 테마와 동일한 행으로 렌더(Express 가 시스템 테마를 서버에서 계산하는 것을 클라에서 미러).
 * 내 테마는 ≤50개 × ≤50종목이라 단일 쿼리 + 클라 계산 부담이 작다.
 *
 * active 멤버(effective_to IS NULL) 만 집계 — embed 에 필터 못 거니 클라이언트 필터.
 */
export async function fetchMyThemes(
  supabase: SupabaseClient,
): Promise<ThemeWithStats[]> {
  const { data, error } = await supabase
    .from('themes')
    .select(
      `
      id,
      name,
      description,
      is_system,
      owner_id,
      sources,
      top3_avg_change_rate,
      stats_updated_at,
      created_at,
      updated_at,
      theme_stocks (
        stock_code,
        source,
        effective_to,
        stocks!inner (
          code,
          name,
          market,
          stock_quotes (
            price,
            change_rate,
            trade_amount
          )
        )
      )
      `,
    )
    .eq('is_system', false);

  if (error) throw toThrowable(error);
  if (!data) return [];

  const themes = (data as unknown as RawMyThemeDetailRow[]).map((row) => {
    const members: ThemeStockMember[] = (row.theme_stocks ?? [])
      .filter((ts) => ts.effective_to == null)
      .map(mapThemeStockToMember)
      .filter((m): m is ThemeStockMember => m !== null);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.is_system,
      ownerId: row.owner_id,
      sources: (row.sources ?? []) as ThemeWithStats['sources'],
      top3AvgChangeRate: computeTop3Avg(members),
      statsUpdatedAt: row.stats_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stockCount: members.length,
    } satisfies ThemeWithStats;
  });

  // 상위3평균 desc (null 맨 뒤) — 시스템 랭킹과 동일 방향. 동률/미계산은 최신순 보조 정렬.
  themes.sort((a, b) => {
    const av = a.top3AvgChangeRate;
    const bv = b.top3AvgChangeRate;
    if (av == null && bv == null) return b.updatedAt.localeCompare(a.updatedAt);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });

  return themes;
}

/**
 * 단일 유저 테마 상세 (메타 + 소속 active 종목 ThemeStockMember[]).
 * 시스템 테마는 Express `fetchSystemThemeDetail` 경로 — 유저 테마는 /api/themes/:id 가
 * is_system=true 만 노출(Plan 04 T-10-04-04)하므로 404. 그래서 유저 테마 상세는
 * Supabase 직접(RLS owner-only). watchlist nested embed 톤으로 theme_stocks →
 * stocks(name/market) → stock_quotes(price/change_rate/trade_amount) 1쿼리 조인.
 *
 * RLS read_own_themes + read_theme_stocks(부모 테마 가시성 따라감)가 owner 자동 필터 —
 * 타인 테마 id 는 빈 결과(throw). 시세 부재 종목은 price/changeRate/tradeAmount=0 폴백.
 */
export async function fetchMyThemeDetail(
  supabase: SupabaseClient,
  themeId: string,
): Promise<ThemeWithStats & { stocks: ThemeStockMember[] }> {
  const { data, error } = await supabase
    .from('themes')
    .select(
      `
      id,
      name,
      description,
      is_system,
      owner_id,
      sources,
      top3_avg_change_rate,
      stats_updated_at,
      created_at,
      updated_at,
      theme_stocks (
        stock_code,
        source,
        effective_to,
        stocks!inner (
          code,
          name,
          market,
          stock_quotes (
            price,
            change_rate,
            trade_amount
          )
        )
      )
      `,
    )
    .eq('id', themeId)
    .eq('is_system', false)
    .single();

  if (error) throw toThrowable(error);
  if (!data) throw new Error(`테마를 찾을 수 없습니다 (id: ${themeId})`);

  const row = data as unknown as RawMyThemeDetailRow;
  const members: ThemeStockMember[] = (row.theme_stocks ?? [])
    // active 멤버십만(effective_to IS NULL) — embed 에 필터 못 거니 클라이언트 필터.
    .filter((ts) => ts.effective_to == null)
    .map(mapThemeStockToMember)
    .filter((m): m is ThemeStockMember => m !== null);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    ownerId: row.owner_id,
    sources: (row.sources ?? []) as ThemeWithStats['sources'],
    top3AvgChangeRate:
      row.top3_avg_change_rate == null
        ? null
        : Number(row.top3_avg_change_rate),
    statsUpdatedAt: row.stats_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stockCount: members.length,
    stocks: members,
  };
}

interface RawThemeStockQuote {
  price: number | string;
  change_rate: number | string;
  trade_amount: number | string;
}

interface RawThemeStockJoined {
  stock_code: string;
  source: string;
  effective_to: string | null;
  stocks: {
    code: string;
    name: string;
    market: Market;
    stock_quotes: RawThemeStockQuote | RawThemeStockQuote[] | null;
  } | null;
}

interface RawMyThemeDetailRow extends Omit<RawMyThemeRow, 'theme_stocks'> {
  theme_stocks: RawThemeStockJoined[] | null;
}

/** theme_stocks ⋈ stocks ⋈ stock_quotes row → ThemeStockMember (시세 부재 0 폴백). */
function mapThemeStockToMember(ts: RawThemeStockJoined): ThemeStockMember | null {
  const stock = ts.stocks;
  if (!stock) return null; // FK 누락(있을 수 없으나 방어)
  const rawQuote = Array.isArray(stock.stock_quotes)
    ? (stock.stock_quotes[0] ?? null)
    : stock.stock_quotes;
  return {
    code: stock.code,
    name: stock.name,
    market: stock.market,
    price: rawQuote ? Number(rawQuote.price) : 0,
    changeRate: rawQuote ? Number(rawQuote.change_rate) : 0,
    tradeAmount: rawQuote ? Number(rawQuote.trade_amount) : 0,
    source: (ts.source as ThemeStockSource) ?? 'user',
  };
}

// =============================================================================
// 유저 테마 CRUD — Supabase 직접 (모든 쓰기에 is_system=false + owner_id)
// =============================================================================

/**
 * 유저 테마 생성. is_system=false + owner_id 로 RLS WITH CHECK(insert_own_themes) 통과.
 * 테마 50-limit(P0001 user_theme_count_limit_exceeded) 위반 시 식별 가능한 Error throw.
 * @returns 새 테마 id
 */
export async function createUserTheme(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('themes')
    .insert({ name, owner_id: userId, is_system: false })
    .select('id')
    .single();

  if (error) throw toThrowable(error);
  return (data as { id: string }).id;
}

/** 유저 테마 메타(이름/설명) 수정. RLS update_own_themes 가 본인 테마만 허용. */
export async function updateUserTheme(
  supabase: SupabaseClient,
  themeId: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('themes')
    .update(patch)
    .eq('id', themeId);

  if (error) throw toThrowable(error);
}

/** 유저 테마 삭제. RLS delete_own_themes 가 본인 테마만 허용. theme_stocks 는 FK CASCADE. */
export async function deleteUserTheme(
  supabase: SupabaseClient,
  themeId: string,
): Promise<void> {
  const { error } = await supabase.from('themes').delete().eq('id', themeId);

  if (error) throw toThrowable(error);
}

// =============================================================================
// 유저 테마 종목 add / remove — theme_stocks (source='user')
// =============================================================================

/**
 * 유저 테마에 종목 추가. source='user'. RLS write_own_theme_stocks 가 본인 테마만 허용.
 * 종목 50-limit(P0001 user_theme_stock_limit_exceeded) 위반 시 식별 가능한 Error throw —
 * 호출자(Plan 07 UI)가 `isThemeStockLimitError` 로 분기해 안내(T-10-05-04).
 */
export async function addThemeStock(
  supabase: SupabaseClient,
  themeId: string,
  stockCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('theme_stocks')
    .insert({ theme_id: themeId, stock_code: stockCode, source: 'user' });

  if (error) throw toThrowable(error);
}

/** 유저 테마에서 종목 제거. PK (theme_id, stock_code) 로 단일 row 매칭. */
export async function removeThemeStock(
  supabase: SupabaseClient,
  themeId: string,
  stockCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('theme_stocks')
    .delete()
    .eq('theme_id', themeId)
    .eq('stock_code', stockCode);

  if (error) throw toThrowable(error);
}

// =============================================================================
// fork — 시스템 테마 스냅샷 복사 (D-05, RESEARCH §Pattern 7)
// =============================================================================

/**
 * 시스템 테마를 "내 테마로 복사" — INSERT-SELECT 스냅샷 (단일 테이블 이점).
 *
 * 흐름 (RESEARCH §Pattern 7 골격):
 *   1. 시스템 테마 메타(name, description) read — eq(is_system=true) 로 시스템만 (유저 테마 fork 차단).
 *   2. 유저 테마 INSERT (owner_id=userId, is_system=false) — RLS WITH CHECK 통과, 새 id 획득.
 *   3. 그 시점 active 멤버십(effective_to IS NULL)만 복사 — 과거 제외 이력 미복사(D-05 스냅샷).
 *   4. theme_stocks 에 복사된 종목 INSERT (source='user', 새 theme_id).
 *
 * 복사 후 유저 테마는 독립 — 시스템 테마 갱신이 전파되지 않음(D-05). 빈 시스템 테마면
 * 종목 0개로 생성(insert 스킵). 시스템 테마가 없으면(잘못된 id / 유저 테마) throw.
 *
 * @returns 새로 생성된 유저 테마 id
 */
export async function forkSystemTheme(
  supabase: SupabaseClient,
  userId: string,
  systemThemeId: string,
): Promise<string> {
  // 1) 시스템 테마 메타 (RLS read_system_themes 허용). is_system=true 로 유저 테마 fork 차단.
  const { data: sys, error: sysError } = await supabase
    .from('themes')
    .select('name, description')
    .eq('id', systemThemeId)
    .eq('is_system', true)
    .single();

  if (sysError) throw toThrowable(sysError);
  if (!sys) {
    throw new Error(`시스템 테마를 찾을 수 없습니다 (id: ${systemThemeId})`);
  }
  const sysTheme = sys as { name: string; description: string | null };

  // 2) 유저 테마 INSERT (owner=userId, is_system=false) — RLS WITH CHECK 통과.
  //    테마 50-limit(P0001) 가능 → 식별 가능 Error 로 surface.
  const { data: mine, error: insertError } = await supabase
    .from('themes')
    .insert({
      name: sysTheme.name,
      description: sysTheme.description,
      owner_id: userId,
      is_system: false,
    })
    .select('id')
    .single();

  if (insertError) throw toThrowable(insertError);
  const newThemeId = (mine as { id: string }).id;

  // 3) 그 시점 active 멤버십만 복사 (effective_to IS NULL — fork 스냅샷 범위).
  const { data: members, error: membersError } = await supabase
    .from('theme_stocks')
    .select('stock_code')
    .eq('theme_id', systemThemeId)
    .is('effective_to', null);

  if (membersError) throw toThrowable(membersError);

  // 4) 복사된 종목 INSERT (source='user'). 빈 멤버십이면 insert 스킵.
  const rows = ((members ?? []) as { stock_code: string }[]).map((m) => ({
    theme_id: newThemeId,
    stock_code: m.stock_code,
    source: 'user' as const,
  }));

  if (rows.length > 0) {
    const { error: copyError } = await supabase
      .from('theme_stocks')
      .insert(rows);
    if (copyError) throw toThrowable(copyError);
  }

  return newThemeId;
}

// =============================================================================
// 시스템 테마 admin 편집 — Supabase 직접 (RLS is_theme_admin 게이트, 마이그레이션 20260610130000)
// =============================================================================
//
// 시스템 테마는 전역 공유 데이터라 운영자(admin 허용목록)만 편집. Express 에는 auth 가 없어
// 경유 불가 — 유저 테마 쓰기와 동일하게 Supabase 직접 + RLS 가 게이트한다. 매일 worker 재동기화는
// theme_stocks.manual_override(included/excluded)/themes.hidden 을 코드로 존중(worker Edit A/B/C).

/** 현재 로그인 사용자가 테마 운영자(admin 허용목록)인지. SECURITY DEFINER RPC is_theme_admin(). */
export async function currentUserIsThemeAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_theme_admin');
  if (error) throw toThrowable(error);
  return data === true;
}

/**
 * 시스템 테마에 종목 추가(운영자). manual_override='included' 핀 → worker 가 retire 안 함.
 * 이전에 excluded 였던 종목 재추가도 upsert 로 active+included 복원(PK 충돌 처리).
 */
export async function addSystemThemeStock(
  supabase: SupabaseClient,
  themeId: string,
  stockCode: string,
): Promise<void> {
  const { error } = await supabase.from('theme_stocks').upsert(
    {
      theme_id: themeId,
      stock_code: stockCode,
      source: 'user',
      manual_override: 'included',
      effective_from: new Date().toISOString(),
      effective_to: null,
    },
    { onConflict: 'theme_id,stock_code' },
  );
  if (error) throw toThrowable(error);
}

/**
 * 시스템 테마에서 종목 제외(운영자). manual_override='excluded' + effective_to=now →
 * worker 가 네이버 재스크랩으로도 되살리지 않음. row 는 보존(오버라이드 마커 유지).
 */
export async function excludeSystemThemeStock(
  supabase: SupabaseClient,
  themeId: string,
  stockCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('theme_stocks')
    .update({
      manual_override: 'excluded',
      effective_to: new Date().toISOString(),
    })
    .eq('theme_id', themeId)
    .eq('stock_code', stockCode);
  if (error) throw toThrowable(error);
}

/** 시스템 테마 이름 수정(운영자). RLS admin_update_system_themes (is_system/owner 위조 차단). */
export async function updateSystemTheme(
  supabase: SupabaseClient,
  themeId: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const { error } = await supabase.from('themes').update(patch).eq('id', themeId);
  if (error) throw toThrowable(error);
}

/**
 * 시스템 테마 삭제(운영자) = soft-delete(hidden=true). hard DELETE 가 아닌 이유:
 * norm_key tombstone 을 유지해 worker 의 norm_key 재생성(INSERT)을 막는다(요구사항 3).
 * 공개 read(Express + RLS)는 hidden 을 제외.
 */
export async function hideSystemTheme(
  supabase: SupabaseClient,
  themeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('themes')
    .update({ hidden: true })
    .eq('id', themeId);
  if (error) throw toThrowable(error);
}
