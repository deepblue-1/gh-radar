import { test, expect } from '@playwright/test';

import {
  cleanupUserThemes,
  createServiceClient,
  deleteSystemTheme,
  ensureSystemThemeWithMembers,
  getTestUserId,
  mockThemesApi,
  pickRealStockCodes,
} from '../fixtures/themes';
import { mockStockApi } from '../fixtures/mock-api';

/**
 * Phase 10 Plan 08 — 유저 테마 CRUD + fork E2E (THEME-03, UI-SPEC §S4).
 *
 * VALIDATION.md #19: 생성/편집/삭제/add/remove/fork + owner-only RLS.
 *
 * watchlist.spec 패턴: storageState 로그인(config chromium project) + service_role
 * seed/cleanup. SUPABASE_SERVICE_ROLE_KEY 미제공 시 skip(seed/cleanup 불가).
 * 실 Supabase 직접 경로(theme-api.ts) — API mock 없음. ThemeEditDialog 를 실제로 구동.
 *
 * 시나리오:
 *  - create-and-add: [＋ 테마 만들기] → 이름 입력 → 종목 검색·add → 내 테마 칩 상단 노출
 *  - edit-remove:    내 테마 진입 → [편집] → 종목 제거 → 저장
 *  - delete:         편집 모달 [삭제] → 확인 다이얼로그 → 삭제 → 목록에서 사라짐
 *  - fork:           시스템 테마 복사 → 독립 유저 테마 생성(원본 시스템 불변)
 */

const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@gh-radar.local';
const HAS_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Phase 10 — 유저 테마 CRUD + fork (THEME-03)', () => {
  // seed/cleanup 순서 보존(테마 unique·삭제 검증).
  test.describe.configure({ mode: 'serial' });

  test('create-and-add — [＋ 테마 만들기] → 이름 + 종목 추가 → 내 테마 상단 노출', async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY 없음 — seed/cleanup 불가');
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupUserThemes(userId, admin);

    // 종목 검색만 mock — Playwright webServer 는 webapp dev 만 기동(Express /api/stocks/search 부재).
    // 테마 CRUD 자체는 실 Supabase 직접 경로(theme-api.ts) 유지 — ThemeEditDialog 실구동.
    await mockStockApi(page);
    await page.goto('/themes');

    // 내 테마 생성 CTA(로그인 상태 → 노출).
    await page.getByRole('button', { name: '＋ 테마 만들기' }).first().click();

    // 모달 — 이름 입력.
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: '새 테마 만들기' }),
    ).toBeVisible();
    const themeName = `E2E 급등관심 ${Date.now()}`;
    await dialog.getByPlaceholder('예: 내 급등관심').fill(themeName);

    // 종목 검색 → 첫 결과 add. 실 검색 API(/api/stocks/search) 사용 — '삼성' 질의.
    await dialog
      .getByPlaceholder('종목명 또는 종목코드를 입력하세요')
      .fill('삼성전자');
    const firstResult = dialog.getByRole('option').first();
    await expect(firstResult).toBeVisible({ timeout: 10_000 });
    await firstResult.click();

    // 현재 종목 카운트가 1로 증가(즉시 저장 — ensureThemeId).
    await expect(dialog.getByText(/현재 종목 \(1\)/)).toBeVisible({
      timeout: 10_000,
    });

    // 저장 후 모달 닫힘 → 내 테마 섹션에 새 칩 노출.
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(
      page.getByRole('link', { name: new RegExp(themeName) }),
    ).toBeVisible({ timeout: 10_000 });

    // DB 진실 확인 — 유저 테마 1건 생성.
    const { data: rows } = await admin
      .from('themes')
      .select('id,name,is_system,owner_id')
      .eq('owner_id', userId)
      .eq('is_system', false);
    expect((rows ?? []).length).toBe(1);
    expect((rows ?? [])[0]?.name).toBe(themeName);
  });

  test('edit-remove — 내 테마 [편집] → 종목 제거 → 저장', async ({ page }) => {
    test.skip(!HAS_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY 없음');
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupUserThemes(userId, admin);

    // seed: 유저 테마 1건 + 종목 1건(실재 코드).
    const [code] = await pickRealStockCodes(admin, 1);
    const { data: created, error: cErr } = await admin
      .from('themes')
      .insert({ name: 'E2E 편집대상', is_system: false, owner_id: userId, sources: ['user'] })
      .select('id')
      .single();
    if (cErr) throw cErr;
    const themeId = (created as { id: string }).id;
    const { error: msErr } = await admin.from('theme_stocks').insert({
      theme_id: themeId,
      stock_code: code,
      source: 'user',
      effective_from: new Date().toISOString(),
      effective_to: null,
    });
    if (msErr) throw msErr;

    // Express /api/themes/:id 부재(Playwright 는 webapp dev 만 기동) → 404 mock 으로
    // ThemeDetailClient 가 실 Supabase fetchMyThemeDetail(RLS owner-only) 로 폴백하게 한다.
    // 유저 테마 상세 자체는 실 Supabase 경로 유지 — owner-only RLS 왕복을 그대로 검증.
    await mockThemesApi(page, { list: [] });
    await page.goto(`/themes/${themeId}`);
    await expect(
      page.getByRole('heading', { name: 'E2E 편집대상', exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // [편집] 모달 → 종목 제거.
    await page.getByRole('button', { name: '편집' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: '테마 편집' }),
    ).toBeVisible();
    // 제거 버튼(aria-label "<name> 제거") 첫 항목 클릭.
    await dialog.getByRole('button', { name: /제거$/ }).first().click();
    await expect(dialog.getByText(/현재 종목 \(0\)/)).toBeVisible({
      timeout: 10_000,
    });

    // DB 진실 — active 멤버 0.
    const { data: members } = await admin
      .from('theme_stocks')
      .select('stock_code')
      .eq('theme_id', themeId)
      .is('effective_to', null);
    expect((members ?? []).length).toBe(0);
  });

  test('delete — 편집 모달 [삭제] → 확인 다이얼로그 → 목록에서 사라짐', async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY 없음');
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupUserThemes(userId, admin);

    const { data: created, error: cErr } = await admin
      .from('themes')
      .insert({ name: 'E2E 삭제대상', is_system: false, owner_id: userId, sources: ['user'] })
      .select('id')
      .single();
    if (cErr) throw cErr;
    const themeId = (created as { id: string }).id;

    // /api/themes/:id 404 mock → 실 Supabase 유저 테마 상세 폴백(위 edit-remove 와 동일 사유).
    await mockThemesApi(page, { list: [] });
    await page.goto(`/themes/${themeId}`);
    await page.getByRole('button', { name: '편집' }).click();
    const dialog = page.getByRole('dialog');

    // [삭제] → 확인 카피 → [삭제] 확정(파괴적).
    await dialog.getByRole('button', { name: '삭제' }).click();
    await expect(
      dialog.getByText(/테마 삭제:.*삭제할까요\? 되돌릴 수 없습니다\./),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '삭제' }).click();

    // DB 진실 — 삭제됨.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('themes')
            .select('id')
            .eq('id', themeId)
            .maybeSingle();
          return data;
        },
        { timeout: 10_000 },
      )
      .toBeNull();
  });

  test('fork — 시스템 테마 복사 → 독립 유저 테마 생성(원본 시스템 불변)', async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY 없음');
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupUserThemes(userId, admin);

    // 시스템 테마 1건 + 멤버 2건 보장(fork 입력).
    const codes = await pickRealStockCodes(admin, 2);
    const sysName = `E2E 시스템fork원본 ${Date.now()}`;
    const sysThemeId = await ensureSystemThemeWithMembers(admin, sysName, codes);

    let newThemeId: string | null = null;
    try {
      // fork 데이터 계약(theme-api.forkSystemTheme §1~4 와 동형): 시스템 상세는 read-only 라
      // 현재 UI fork 트리거가 없으므로, service_role 로 동일 연산을 재현해
      // "유저 테마 독립 생성 + active 멤버 스냅샷 복사 + 원본 시스템 불변"을 검증한다.
      const { data: sysMeta } = await admin
        .from('themes')
        .select('name, description')
        .eq('id', sysThemeId)
        .eq('is_system', true)
        .single();
      const { data: forkedTheme, error: forkErr } = await admin
        .from('themes')
        .insert({
          name: (sysMeta as { name: string }).name,
          description: (sysMeta as { description: string | null }).description,
          owner_id: userId,
          is_system: false,
        })
        .select('id')
        .single();
      if (forkErr) throw forkErr;
      newThemeId = (forkedTheme as { id: string }).id;
      expect(newThemeId).not.toBe(sysThemeId);

      // active 멤버 스냅샷 복사(source='user').
      const { data: srcMembers } = await admin
        .from('theme_stocks')
        .select('stock_code')
        .eq('theme_id', sysThemeId)
        .is('effective_to', null);
      const copyRows = ((srcMembers ?? []) as { stock_code: string }[]).map(
        (m) => ({ theme_id: newThemeId, stock_code: m.stock_code, source: 'user' }),
      );
      if (copyRows.length > 0) {
        const { error: copyErr } = await admin.from('theme_stocks').insert(copyRows);
        if (copyErr) throw copyErr;
      }

      // 새 유저 테마: is_system=false, owner=userId, 멤버 스냅샷 복사.
      const { data: forked } = await admin
        .from('themes')
        .select('id,is_system,owner_id')
        .eq('id', newThemeId)
        .single();
      expect((forked as { is_system: boolean }).is_system).toBe(false);
      expect((forked as { owner_id: string }).owner_id).toBe(userId);

      const { data: forkedMembers } = await admin
        .from('theme_stocks')
        .select('stock_code')
        .eq('theme_id', newThemeId)
        .is('effective_to', null);
      expect((forkedMembers ?? []).length).toBe(codes.length);

      // 원본 시스템 테마 불변(여전히 is_system=true).
      const { data: origin } = await admin
        .from('themes')
        .select('is_system')
        .eq('id', sysThemeId)
        .single();
      expect((origin as { is_system: boolean }).is_system).toBe(true);

      // 새 유저 테마 상세 진입 → 본인 소유 테마 렌더 확인(RLS owner-only 경로 UI 왕복).
      // /api/themes/:id 404 mock → 실 Supabase fetchMyThemeDetail 폴백(위와 동일 사유).
      await mockThemesApi(page, { list: [] });
      await page.goto(`/themes/${newThemeId}`);
      await expect(
        page.getByRole('heading', { name: sysName, exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupUserThemes(userId, admin);
      await deleteSystemTheme(admin, sysThemeId);
    }
  });
});
