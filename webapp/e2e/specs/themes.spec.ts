import { test, expect } from '@playwright/test';

import {
  mockThemesApi,
  type MockThemeListItem,
  type MockThemeStockMember,
} from '../fixtures/themes';
import { mockStockApi } from '../fixtures/mock-api';

/**
 * Phase 10 Plan 08 — /themes 목록 + /themes/[id] E2E (THEME-02).
 *
 * VALIDATION.md #16/#17:
 *   - /themes 시스템 테마 랭킹 리스트 렌더(상위3 평균 등락률 표시, top3avg desc 순서)
 *   - 랭킹 행 클릭 → /themes/[id] 종목 리스트(scanner row) 렌더
 *   - 종목 클릭 → /stocks/[code] 이동
 *
 * 시스템 테마 데이터는 Express `/api/themes` mock(결정론) — 실서버 적재 여부와 무관하게
 * 흐름/카피 계약을 검증. (기존 stock-detail/news spec 의 mock-api 패턴 동형.)
 * storageState 는 config 의 chromium project 가 자동 주입(로그인 상태) — 단 목록은 비로그인도 동작.
 */

const THEME_A: MockThemeListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '2차전지',
  sources: ['naver', 'alphasquare'],
  top3AvgChangeRate: 12.3,
  stockCount: 18,
};
const THEME_B: MockThemeListItem = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '정치인주',
  sources: ['alphasquare'],
  top3AvgChangeRate: 5.1,
  stockCount: 22,
};

const THEME_A_MEMBERS: MockThemeStockMember[] = [
  { code: '005930', name: '삼성전자', market: 'KOSPI', changeRate: 14.2 },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI', changeRate: 11.0 },
];

test.describe('Phase 10 — 테마 목록/상세 (THEME-02)', () => {
  test('/themes — 시스템 테마 랭킹 리스트 + 상위3 평균 등락률 렌더', async ({
    page,
  }) => {
    await mockThemesApi(page, {
      list: [THEME_A, THEME_B],
      detailById: { [THEME_A.id]: THEME_A_MEMBERS },
    });
    await page.goto('/themes');

    // 헤더 + 정렬 라벨(카피 계약).
    await expect(page.getByRole('heading', { name: '테마', exact: true })).toBeVisible();
    await expect(
      page.getByText('상위 3종목 평균 등락률').first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '시스템 테마 랭킹' }),
    ).toBeVisible();

    // 랭킹 행 — 테마명 + 상위3 평균(+12.3%) 표시.
    const rankRow = page.getByRole('link', { name: `${THEME_A.name} 테마 상세 보기` });
    await expect(rankRow).toBeVisible();
    await expect(rankRow).toContainText('2차전지');
    await expect(rankRow).toContainText('+12.3%');
    await expect(rankRow).toContainText('18종목');

    // 2위 테마도 렌더.
    await expect(
      page.getByRole('link', { name: `${THEME_B.name} 테마 상세 보기` }),
    ).toBeVisible();
  });

  test('랭킹 행 클릭 → /themes/[id] 종목 리스트(scanner row) → 종목 클릭 → /stocks/[code]', async ({
    page,
  }) => {
    await mockThemesApi(page, {
      list: [THEME_A, THEME_B],
      detailById: { [THEME_A.id]: THEME_A_MEMBERS },
    });
    // 상세 종목 → /stocks/005930 이동 후 종목 상세가 렌더되도록 stock API 도 mock.
    await mockStockApi(page);

    await page.goto('/themes');
    await page.getByRole('link', { name: `${THEME_A.name} 테마 상세 보기` }).click();

    // /themes/[id] 진입 — 테마명 h1 + 상위3 평균 + scanner row.
    await expect(page).toHaveURL(new RegExp(`/themes/${THEME_A.id}$`));
    await expect(
      page.getByRole('heading', { name: '2차전지', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('상위 3종목 평균').first()).toBeVisible();

    // 종목 행(scanner-table/-card 재사용) — 삼성전자 종목 링크 존재.
    const stockLink = page
      .getByRole('link', { name: /삼성전자/ })
      .first();
    await expect(stockLink).toBeVisible({ timeout: 10_000 });
    await expect(stockLink).toHaveAttribute('href', /\/stocks\/005930/);

    // 종목 클릭 → /stocks/005930 이동(종목 상세 Hero 렌더).
    await stockLink.click();
    await expect(page).toHaveURL(/\/stocks\/005930$/);
    await expect(
      page.getByRole('heading', { name: '삼성전자' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/themes/[id] — 없는 테마는 404(시스템) → 빈 종목 안내 또는 에러 카피', async ({
    page,
  }) => {
    // detailById 미지정 → mock 이 404. 유저 테마 폴백도 비로그인/미존재라 실패 → 고정 에러 카피.
    await mockThemesApi(page, { list: [THEME_A] });
    await page.goto(`/themes/${THEME_A.id}`);

    await expect(
      page.getByText('테마를 불러오지 못했습니다. 새로고침해주세요.'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
