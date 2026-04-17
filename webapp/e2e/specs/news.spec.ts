import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';

/**
 * Phase 07 Plan 06 — news E2E (V-17 / V-18 / V-19 / V-20).
 *
 * 구성:
 *  - V-17 detail list: /stocks/005930 상세 내 "관련 뉴스" 섹션 렌더 + 보안 링크 속성
 *  - V-18 full page: /stocks/005930/news 전체 페이지 렌더 + ← back 링크
 *  - V-19 refresh cooldown: 429 수신 시 버튼 disabled + data-remaining-seconds
 *  - V-20 a11y: @axe-core/playwright 로 serious/critical 0 violation
 *
 * Fixture 재사용: Plan 07-01 Task 3 산출 `webapp/e2e/fixtures/news.ts` 그대로 import.
 * storageState: playwright.config.ts `chromium` project 가 webapp/.playwright/auth.json 로드.
 */
const STOCK_CODE = '005930';

async function mockStockDetail(page: Page) {
  // Next.js /stocks/[code] 라우트가 NewsPageClient 에서 추가로 /api/stocks/005930 을 호출하므로
  // /api/stocks/:code 를 고정 응답으로 확정한다. mockStockApi 의 regex 와 충돌하지 않도록
  // exact 경로 매칭으로 등록 — news.spec.ts 는 mockStockApi 를 쓰지 않는다.
  await page.route(/\/api\/stocks\/([A-Za-z0-9]{1,10})(?:\?[^/]*)?$/, async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/stocks\/([A-Za-z0-9]{1,10})/);
    const code = match?.[1] ?? '';
    if (code === 'search') {
      await route.fallback();
      return;
    }
    if (code !== STOCK_CODE) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'STOCK_NOT_FOUND', message: `stock ${code} not found` },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'news-spec-req-id' },
      body: JSON.stringify(FIXTURE_SAMSUNG),
    });
  });
}

test.describe('News — detail list (V-17, external link security)', () => {
  test('renders 5 news items + 전체 뉴스 보기 link', async ({ page }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 5),
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    await expect(page.getByTestId('stock-news-section')).toBeVisible();

    const items = page.getByTestId('stock-news-section').getByTestId('news-item');
    await expect(items).toHaveCount(5);

    await expect(page.getByRole('link', { name: /전체 뉴스 보기/ })).toHaveAttribute(
      'href',
      `/stocks/${STOCK_CODE}/news`,
    );
  });

  test('items have target="_blank" rel containing noopener noreferrer', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 3),
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    await expect(page.getByTestId('stock-news-section')).toBeVisible();

    const firstLink = page
      .getByTestId('stock-news-section')
      .getByTestId('news-item')
      .first()
      .locator('a')
      .first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    const rel = (await firstLink.getAttribute('rel')) ?? '';
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);
  });
});

test.describe('News — full page (V-18)', () => {
  test('renders all items on /news with ← back link', async ({ page }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 50),
    });

    await page.goto(`/stocks/${STOCK_CODE}/news`);
    await expect(
      page.getByRole('heading', { level: 1, name: /최근 7일 뉴스/ }),
    ).toBeVisible();

    const items = page.getByTestId('news-item');
    await expect(items).toHaveCount(50);

    const backLink = page.getByRole('link', { name: '종목 상세로 돌아가기' });
    await backLink.click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}$`));
  });

  test('caps list at server-provided limit (mock provides 100)', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 100),
    });

    await page.goto(`/stocks/${STOCK_CODE}/news`);
    await expect(
      page.getByRole('heading', { level: 1, name: /최근 7일 뉴스/ }),
    ).toBeVisible();

    const count = await page.getByTestId('news-item').count();
    expect(count).toBeLessThanOrEqual(100);
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('News — refresh cooldown (V-19)', () => {
  test('refresh click → 429 → button disabled with data-remaining-seconds', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 3),
      refreshResult: 'cooldown',
      refreshRetryAfter: 25,
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    const btn = page.getByTestId('news-refresh-button');
    await expect(btn).toBeEnabled();
    await btn.click();

    // 서버 429 수신 후 버튼이 disabled + data-remaining-seconds 속성 존재
    await expect(btn).toBeDisabled();
    const remaining = await btn.getAttribute('data-remaining-seconds');
    expect(remaining).not.toBeNull();
    const seconds = Number(remaining);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(30);
  });
});

test.describe('News — a11y (V-20)', () => {
  test('axe scan on stock-news-section → 0 serious/critical violations', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 5),
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    await expect(page.getByTestId('stock-news-section')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="stock-news-section"]')
      .disableRules(['color-contrast'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking).toEqual([]);
  });
});
