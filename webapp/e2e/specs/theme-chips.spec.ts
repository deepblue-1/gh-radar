import { test, expect } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import {
  mockThemeChips,
  mockThemesApi,
  type MockChipTheme,
  type MockThemeListItem,
  type MockThemeStockMember,
} from '../fixtures/themes';

/**
 * Phase 10 Plan 08 — 종목 상세 "이 종목의 테마" 칩 E2E (THEME-02, UI-SPEC §S3).
 *
 * VALIDATION.md #18:
 *   - /stocks/[code] 에 테마 칩 표시(시스템 출처 도트 / 내 테마 accent)
 *   - 칩 클릭 → /themes/[id] 이동
 *
 * 칩 데이터(theme_stocks 역조회)는 Supabase REST mock(결정론). 칩 클릭 후 /themes/[id]
 * 진입을 확인하기 위해 Express /api/themes/:id 도 mock.
 */

const CHIP_SYSTEM: MockChipTheme = {
  id: '33333333-3333-4333-8333-333333333333',
  name: '반도체',
  isSystem: true,
};
const CHIP_USER: MockChipTheme = {
  id: '44444444-4444-4444-8444-444444444444',
  name: '내 급등관심',
  isSystem: false,
  ownerId: 'e2e-user',
};

const CHIP_THEME_META: MockThemeListItem = {
  id: CHIP_SYSTEM.id,
  name: CHIP_SYSTEM.name,
  top3AvgChangeRate: 8.8,
  stockCount: 30,
};
const CHIP_THEME_MEMBERS: MockThemeStockMember[] = [
  { code: '005930', name: '삼성전자', changeRate: 9.1 },
];

test.describe('Phase 10 — 종목 테마 칩 (THEME-02 §S3)', () => {
  test('/stocks/[code] — 이 종목의 테마 칩 표시 + 칩 클릭 → /themes/[id]', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, { code: '005930', list: buildNewsList('005930', 3) });
    await mockThemeChips(page, [CHIP_SYSTEM, CHIP_USER]);
    await mockThemesApi(page, {
      list: [CHIP_THEME_META],
      detailById: { [CHIP_SYSTEM.id]: CHIP_THEME_MEMBERS },
    });

    await page.goto('/stocks/005930');

    // "이 종목의 테마" 섹션 + 칩 2개(시스템 + 내 테마).
    await expect(
      page.getByRole('heading', { name: '이 종목의 테마' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('link', { name: `${CHIP_SYSTEM.name} 테마로 이동` }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: `${CHIP_USER.name} 테마로 이동` }),
    ).toBeVisible();

    // 시스템 칩 클릭 → /themes/[id] 이동 + 테마 상세 렌더.
    await page
      .getByRole('link', { name: `${CHIP_SYSTEM.name} 테마로 이동` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/themes/${CHIP_SYSTEM.id}$`));
    await expect(
      page.getByRole('heading', { name: '반도체', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/stocks/[code] — 분류 테마 없으면 "분류된 테마 없음" 안내', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, { code: '005930', list: buildNewsList('005930', 3) });
    await mockThemeChips(page, []); // 빈 역조회

    await page.goto('/stocks/005930');

    await expect(
      page.getByRole('heading', { name: '이 종목의 테마' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('분류된 테마 없음')).toBeVisible();
  });
});
