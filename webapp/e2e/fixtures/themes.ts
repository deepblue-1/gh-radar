import type { Page, Route } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Phase 10 Plan 08 — theme E2E fixtures.
 *
 * 두 갈래:
 *  1. mockThemesApi/mockThemeChips — Express `/api/themes`(시스템 목록·상세) + Supabase
 *     `theme_stocks` 역조회(칩)를 결정론적으로 모킹. themes.spec / theme-chips.spec 가 사용
 *     (기존 mock-api/news 패턴 — 실서버 데이터 적재 여부와 무관하게 흐름 검증).
 *  2. createServiceClient/getTestUserId/cleanupUserThemes — service_role 로 유저 테마
 *     CRUD seed/cleanup (watchlist-seed 패턴). user-themes.spec 가 사용. service key 없으면 skip.
 *
 * 모든 라우트는 `**` host-agnostic 매칭(NEXT_PUBLIC_API_BASE_URL 무관).
 */

// =============================================================================
// 1) 시스템 테마 API mock (themes.spec)
// =============================================================================

export interface MockThemeListItem {
  id: string;
  name: string;
  isSystem?: boolean;
  ownerId?: string | null;
  sources?: string[];
  top3AvgChangeRate?: number | null;
  stockCount?: number;
}

export interface MockThemeStockMember {
  code: string;
  name: string;
  market?: 'KOSPI' | 'KOSDAQ';
  price?: number;
  changeRate?: number;
  tradeAmount?: number;
  source?: 'naver' | 'alphasquare' | 'ai' | 'user';
}

function toListResponse(items: MockThemeListItem[]) {
  return items.map((t) => ({
    id: t.id,
    name: t.name,
    description: null,
    isSystem: t.isSystem ?? true,
    ownerId: t.ownerId ?? null,
    sources: t.sources ?? ['naver'],
    top3AvgChangeRate: t.top3AvgChangeRate ?? null,
    statsUpdatedAt: null,
    createdAt: '2026-06-09T07:00:00.000Z',
    updatedAt: '2026-06-09T07:00:00.000Z',
    stockCount: t.stockCount ?? 0,
  }));
}

function toDetailResponse(
  meta: MockThemeListItem,
  members: MockThemeStockMember[],
) {
  return {
    ...toListResponse([meta])[0],
    stocks: members.map((m) => ({
      code: m.code,
      name: m.name,
      market: m.market ?? 'KOSPI',
      price: m.price ?? 50_000,
      changeRate: m.changeRate ?? 0,
      tradeAmount: m.tradeAmount ?? 1_000_000_000,
      source: m.source ?? 'naver',
    })),
  };
}

export interface MockThemesApiOptions {
  list?: MockThemeListItem[];
  /** id → 상세 멤버. 미지정 id 는 404. */
  detailById?: Record<string, MockThemeStockMember[]>;
}

/**
 * `/api/themes`(목록) + `/api/themes/:id`(상세) 모킹.
 * 시스템 테마 랭킹(top3AvgChangeRate desc 는 서버가 정렬 — 여기선 list 순서 그대로) +
 * 상세 종목 리스트(scanner row 로 렌더).
 */
export async function mockThemesApi(
  page: Page,
  opts: MockThemesApiOptions = {},
): Promise<void> {
  const list = opts.list ?? [];
  const detailById = opts.detailById ?? {};
  const metaById = new Map(list.map((t) => [t.id, t]));

  // 상세: /api/themes/<uuid> — 목록보다 먼저 등록(더 구체적 패턴 우선 매칭 보장).
  await page.route(
    /\/api\/themes\/([0-9a-fA-F-]{8,40})(?:\?[^/]*)?$/,
    async (route: Route) => {
      const url = route.request().url();
      const m = url.match(/\/api\/themes\/([0-9a-fA-F-]{8,40})/);
      const id = m?.[1] ?? '';
      const members = detailById[id];
      const meta = metaById.get(id);
      if (!members || !meta) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'THEME_NOT_FOUND', message: `theme ${id} not found` },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(toDetailResponse(meta, members)),
      });
    },
  );

  // 목록: /api/themes
  await page.route(/\/api\/themes(?:\?[^/]*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(toListResponse(list)),
    });
  });
}

// =============================================================================
// 2) Supabase theme_stocks 역조회 mock (theme-chips.spec)
// =============================================================================

export interface MockChipTheme {
  id: string;
  name: string;
  isSystem?: boolean;
  ownerId?: string | null;
}

/**
 * StockThemeChips 가 호출하는 Supabase REST:
 *   GET /rest/v1/theme_stocks?select=theme_id,themes!inner(...)&stock_code=eq.<code>&effective_to=is.null
 * → theme_stocks 행(themes 임베드) 배열로 응답. 칩이 /themes/[id] Link 로 렌더된다.
 */
export async function mockThemeChips(
  page: Page,
  themes: MockChipTheme[],
): Promise<void> {
  await page.route('**/rest/v1/theme_stocks*', async (route: Route) => {
    const url = route.request().url();
    // select 에 themes 임베드가 있는 칩 조회만 가로챔(다른 theme_stocks 쿼리는 통과).
    if (!url.includes('themes')) {
      await route.fallback();
      return;
    }
    const body = themes.map((t) => ({
      theme_id: t.id,
      themes: {
        id: t.id,
        name: t.name,
        is_system: t.isSystem ?? true,
        owner_id: t.ownerId ?? null,
      },
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(0, themes.length - 1)}/*` },
      body: JSON.stringify(body),
    });
  });
}

// =============================================================================
// 3) 유저 테마 service_role seed/cleanup (user-themes.spec) — watchlist-seed 패턴
// =============================================================================

/** service_role admin 클라이언트 — E2E 전용. webapp runtime 절대 사용 금지. */
export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for theme seed helper',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 테스트 유저 id 조회 (email 기반). */
export async function getTestUserId(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`Test user not found: ${email}`);
  return found.id;
}

/** 테스트 유저의 모든 유저 테마(is_system=false) 삭제 — theme_stocks 는 FK ON DELETE CASCADE. */
export async function cleanupUserThemes(
  userId: string,
  admin: SupabaseClient,
): Promise<void> {
  const { error } = await admin
    .from('themes')
    .delete()
    .eq('owner_id', userId)
    .eq('is_system', false);
  if (error) throw error;
}

/** stocks 마스터에서 실재 종목 코드 N개 조회 — 종목 추가 시 FK 위반 회피(watchlist-seed 톤). */
export async function pickRealStockCodes(
  admin: SupabaseClient,
  n: number,
): Promise<string[]> {
  const { data, error } = await admin.from('stocks').select('code').limit(n);
  if (error) throw error;
  const codes = (data ?? []).map((s) => (s as { code: string }).code);
  if (codes.length < n) {
    throw new Error(
      `pickRealStockCodes: stocks 테이블에 ${n}개 이상 필요, 현재 ${codes.length}개`,
    );
  }
  return codes;
}

/**
 * 시스템 테마 1건 + active 멤버 보장 — fork 시나리오용. service_role 로 직접 적재.
 * 반환: 생성/재사용한 시스템 테마 id.
 */
export async function ensureSystemThemeWithMembers(
  admin: SupabaseClient,
  name: string,
  memberCodes: string[],
): Promise<string> {
  // 동일 이름 시스템 테마 있으면 재사용(idempotent).
  const { data: existing } = await admin
    .from('themes')
    .select('id')
    .eq('name', name)
    .eq('is_system', true)
    .maybeSingle();

  let themeId = (existing as { id: string } | null)?.id;
  if (!themeId) {
    const { data: inserted, error: insErr } = await admin
      .from('themes')
      .insert({ name, is_system: true, owner_id: null, sources: ['naver'] })
      .select('id')
      .single();
    if (insErr) throw insErr;
    themeId = (inserted as { id: string }).id;
  }

  // active 멤버 보장(ON CONFLICT 무시).
  const rows = memberCodes.map((code) => ({
    theme_id: themeId,
    stock_code: code,
    source: 'naver',
    effective_from: new Date().toISOString(),
    effective_to: null,
  }));
  const { error: msErr } = await admin
    .from('theme_stocks')
    .upsert(rows, { onConflict: 'theme_id,stock_code', ignoreDuplicates: true });
  if (msErr) throw msErr;

  return themeId;
}

/** 시스템 테마 정리 — fork 시나리오 후 생성한 시스템 테마 제거. */
export async function deleteSystemTheme(
  admin: SupabaseClient,
  themeId: string,
): Promise<void> {
  const { error } = await admin.from('themes').delete().eq('id', themeId);
  if (error) throw error;
}
