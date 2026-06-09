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
import type { ThemeStockMember, ThemeWithStats } from '@gh-radar/shared';

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

/** PostgREST `theme_stocks(count)` 응답에서 stockCount 추출 (1:1 object / 1:N array 방어). */
function extractStockCount(
  raw: RawMyThemeRow['theme_stocks'],
): number {
  if (raw == null) return 0;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  return entry?.count ?? 0;
}

function mapMyThemeRow(row: RawMyThemeRow): ThemeWithStats {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    ownerId: row.owner_id,
    sources: (row.sources ?? []) as ThemeWithStats['sources'],
    top3AvgChangeRate:
      row.top3_avg_change_rate == null ? null : Number(row.top3_avg_change_rate),
    statsUpdatedAt: row.stats_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stockCount: extractStockCount(row.theme_stocks),
  };
}

/**
 * 로그인 사용자의 유저 테마 목록 (최신순). RLS read_own_themes 가 owner 자동 필터 —
 * 클라이언트에서 user_id 전달 불필요(T-10-05-01). is_system=false 명시로 시스템 테마 제외
 * (단일 테이블이라 RLS 만으로 시스템이 섞이진 않지만, 의도 명시 + 인덱스 활용).
 *
 * 활성 종목 수는 `theme_stocks!inner(count)` 가 아닌 `theme_stocks(count)` 로 임베드 —
 * 종목 0개 테마도 stockCount=0 으로 포함(left join). effective_to 필터는 임베드 count 에
 * 적용 불가(PostgREST 제약)라, 유저 테마는 본인이 직접 add/remove 하므로 effective_to 가
 * 항상 NULL(제외 이력 없음 — D-05 단순화) → 전체 count 가 곧 active count.
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
      theme_stocks (count)
      `,
    )
    .eq('is_system', false)
    .order('updated_at', { ascending: false });

  if (error) throw toThrowable(error);
  if (!data) return [];

  return (data as unknown as RawMyThemeRow[]).map(mapMyThemeRow);
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
