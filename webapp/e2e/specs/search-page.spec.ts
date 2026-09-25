import { test, expect, type Page, type Route } from '@playwright/test';

import { mockStockApi } from '../fixtures/mock-api';
import { installNativeApp, nativeMessages } from '../fixtures/native-app';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';
import { mockThemesApi } from '../fixtures/themes';

/**
 * Phase 21 Plan 08 — `/search` 탐색 허브 e2e (MOBILE-01g · D-07 · D-07a).
 *
 * 무엇을 증명하는가:
 *   1. 초기 허브 — 제목 「검색」 · 타일 3개 href · 첫 타일 「25%↑ 3종목」(scanner 실데이터) · 테마 「오늘 4개」
 *      · 상승률 상위 미리보기 5행 · 「더보기 ›」 → `/scanner`
 *   2. 입력 「삼성」 → 허브 숨김 · 결과 행 → 클릭 → `/stocks/005930` · localStorage
 *      `gh-radar:recent-search` 에 코드 저장 → `/search` 재방문 시 「최근 검색」 행 → 「지우기」로 섹션 제거
 *   3. 1280 — 사이드바 「검색」 링크 `aria-current="page"` · 본문 폭 ≤ 900
 *   4. 앱 모드(`installNativeApp`) 390 — 같은 페이지가 렌더되고 캡처 메시지에 `route {path:'/search'}`
 *
 * ⌘K 전역 검색 e2e 는 `search.spec.ts` 가 따로 잠근다(이 파일은 페이지 `/search` 전용).
 */

const RATES = [31, 28, 26, 24, 20, 18];
const SCANNER_STOCKS = RATES.map((changeRate, i) => ({
  ...FIXTURE_SAMSUNG,
  code: String(900001 + i),
  name: `급등종목${i + 1}`,
  market: 'KOSDAQ',
  changeRate,
}));

const THEMES = ['2차전지', '반도체', '로봇', '조선'].map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  name,
}));

async function prepare(page: Page): Promise<void> {
  await mockStockApi(page, { searchResults: [FIXTURE_SAMSUNG] });
  // mockStockApi 의 빈 scanner 목보다 **나중에** 등록 — Playwright 는 나중 등록 라우트가 우선한다.
  await page.route('**/api/scanner*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-last-updated-at': new Date().toISOString() },
      body: JSON.stringify(SCANNER_STOCKS),
    });
  });
  await mockThemesApi(page, { list: THEMES });
}

const searchbox = (page: Page) => page.getByRole('searchbox', { name: '종목 검색' });
const mainArea = (page: Page) => page.locator('main');

test.describe('Phase 21 — /search 탐색 허브 (MOBILE-01g)', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('초기 허브 — 타일 3 · 25%↑ 3종목 · 오늘 4개 · 미리보기 5행 · 더보기 → /scanner', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');

    const main = mainArea(page);
    await expect(main.getByRole('heading', { level: 1, name: '검색' })).toBeVisible();
    await expect(searchbox(page)).toHaveAttribute('placeholder', '종목명 또는 코드');

    const shortcuts = main.getByRole('navigation', { name: '바로가기' });
    const tiles = shortcuts.getByRole('link');
    await expect(tiles).toHaveCount(3);
    await expect(tiles.nth(0)).toHaveAttribute('href', '/scanner');
    await expect(tiles.nth(1)).toHaveAttribute('href', '/themes');
    await expect(tiles.nth(2)).toHaveAttribute('href', '/watchlist');
    await expect(tiles.nth(0)).toContainText('25%↑ 3종목');
    await expect(tiles.nth(1)).toContainText('오늘 4개');
    await expect(tiles.nth(2)).toContainText(/\d+종목/);

    const preview = main.getByRole('region', { name: '지금 상승률 상위' });
    await expect(preview.getByRole('listitem')).toHaveCount(5);
    await expect(preview.getByRole('listitem').first()).toContainText('급등종목1');
    await expect(preview.getByRole('listitem').first()).toContainText('+31.00%');
    await expect(preview.getByText('급등종목6')).toHaveCount(0);
    await expect(preview.getByRole('link', { name: '더보기 ›' })).toHaveAttribute('href', '/scanner');

    // 최근 검색이 없으면 섹션 자체가 없다.
    await expect(main.getByRole('region', { name: '최근 검색' })).toHaveCount(0);
  });

  test('입력 「삼성」 → 결과 → /stocks/005930 · 최근 검색 저장 → 재방문 표시 → 지우기', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');
    const main = mainArea(page);
    await expect(main.getByRole('navigation', { name: '바로가기' })).toBeVisible();

    await searchbox(page).fill('삼성');
    await expect(main.getByRole('navigation', { name: '바로가기' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '검색어 지우기' })).toBeVisible();

    const results = main.getByRole('region', { name: '검색 결과' });
    const row = results.getByRole('button', { name: /삼성전자/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('005930');
    await expect(row).toContainText('KOSPI');
    await expect(row).toContainText('58,700');
    await row.click();

    await expect(page).toHaveURL(/\/stocks\/005930$/);
    const stored = await page.evaluate(() => localStorage.getItem('gh-radar:recent-search'));
    expect(stored).toContain('005930');

    await page.goto('/search');
    const recent = mainArea(page).getByRole('region', { name: '최근 검색' });
    await expect(recent.getByRole('link', { name: '삼성전자' })).toBeVisible();
    await expect(recent.getByRole('link', { name: '삼성전자' })).toHaveAttribute(
      'href',
      '/stocks/005930',
    );

    await recent.getByRole('button', { name: '지우기' }).click();
    await expect(mainArea(page).getByRole('region', { name: '최근 검색' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('gh-radar:recent-search'))).toBeNull();
  });

  test('1280 — 사이드바 「검색」 활성 · 본문 폭 ≤ 900', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/search');

    const sidebarSearch = page
      .getByRole('navigation', { name: '주 메뉴' })
      .first()
      .getByRole('link', { name: '검색', exact: true });
    await expect(sidebarSearch).toBeVisible();
    await expect(sidebarSearch).toHaveAttribute('aria-current', 'page');

    const title = mainArea(page).getByRole('heading', { level: 1, name: '검색' });
    await expect(title).toBeVisible();
    const box = await title.locator('..').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(900);
    expect(box!.width).toBeGreaterThan(600);
  });

  test('앱 모드 390 — 같은 페이지 렌더 · route {path:/search}', async ({ page }) => {
    await installNativeApp(page, { platform: 'ios' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');

    await expect(page.locator('html')).toHaveClass(/(^|\s)native-app(\s|$)/);
    const main = mainArea(page);
    await expect(main.getByRole('heading', { level: 1, name: '검색' })).toBeVisible();
    await expect(main.getByRole('navigation', { name: '바로가기' }).getByRole('link')).toHaveCount(3);
    await expect(
      main.getByRole('region', { name: '지금 상승률 상위' }).getByRole('listitem'),
    ).toHaveCount(5);

    await expect
      .poll(async () =>
        (await nativeMessages(page)).filter((m) => m.type === 'route').map((m) => m.payload),
      )
      .toContainEqual({ path: '/search' });
  });
});
