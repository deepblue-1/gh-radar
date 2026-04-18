import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';

/**
 * Phase 08 Plan 06 — 토론방 E2E (Plan 08-01 스텁 → concrete 7 시나리오).
 *
 * 시나리오 (PIVOT + 무한 스크롤 포함):
 *  1. detail list (5 items + 더보기 + target/rel 속성)
 *  2. detail fields (title/body/author/time)
 *  3. full page (≤50 items + Compact 3열 헤더 desktop)
 *  4. full page 쿨다운 (detail refresh 429 → disabled + data-remaining-seconds)
 *  5. full page 새로고침 버튼 없음 + ← back link
 *  6. 무한 스크롤 (before cursor 추가 fetch + append)
 *  7. a11y (detail section + 풀페이지 — axe-core serious/critical 0)
 *
 * Fixture: `webapp/e2e/fixtures/discussions.ts` (Plan 08-01 산출 — 본 spec 은 수정 금지).
 */
const STOCK_CODE = '005930';

async function mockStockDetail(page: Page) {
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
      headers: { 'x-request-id': 'disc-spec-req-id' },
      body: JSON.stringify(FIXTURE_SAMSUNG),
    });
  });

  // News API mock (상세 페이지가 StockNewsSection 을 마운트하므로 404/에러 회피)
  await page.route(`**/api/stocks/${STOCK_CODE}/news**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

test.describe('Discussion — detail Card (Phase 8)', () => {
  test('renders 5 items + 더보기 link + external link attrs (T-02)', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 5),
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    const section = page.getByTestId('stock-discussion-section');
    await expect(section).toBeVisible();

    const items = section.getByTestId('discussion-item');
    await expect(items).toHaveCount(5);

    // 첫 item 의 링크 — target=_blank + rel noopener noreferrer
    const firstLink = items.first().locator('a').first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    const rel = (await firstLink.getAttribute('rel')) ?? '';
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);

    // 더보기 링크 — /stocks/:code/discussions 로
    const more = page.getByRole('link', { name: /전체 토론 보기/ });
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute('href', `/stocks/${STOCK_CODE}/discussions`);
  });

  test('each item shows title + author + time', async ({ page }) => {
    await mockStockDetail(page);
    const list = buildDiscussionList(STOCK_CODE, 3);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list });

    await page.goto(`/stocks/${STOCK_CODE}`);
    const section = page.getByTestId('stock-discussion-section');
    const first = section.getByTestId('discussion-item').first();
    await expect(first).toContainText(list[0].title);
    if (list[0].author) await expect(first).toContainText(list[0].author);
    await expect(first.locator('time')).toBeVisible();
  });
});

test.describe('Discussion — full page (/stocks/:code/discussions)', () => {
  test('renders up to 50 items + Compact column headers at desktop', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 50),
    });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    await expect(
      page.getByRole('heading', { level: 1, name: /최근 7일 토론/ }),
    ).toBeVisible();

    const list = page.getByTestId('discussion-list');
    await expect(list).toBeVisible();
    const items = list.getByTestId('discussion-item');
    await expect(items).toHaveCount(50);

    // Compact 컬럼 헤더 3종 (desktop viewport 기본)
    await expect(list.getByText('제목', { exact: true })).toBeVisible();
    await expect(list.getByText('작성자', { exact: true })).toBeVisible();
    await expect(list.getByText('시간', { exact: true })).toBeVisible();
  });

  test('full page has NO refresh button + ← back link navigates', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 10),
    });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    // 풀페이지는 새로고침 버튼 0
    await expect(page.getByTestId('discussion-refresh-button')).toHaveCount(0);

    // ← back link 클릭 → /stocks/:code
    const back = page.getByRole('link', { name: '종목 상세로 돌아가기' });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}$`));
  });
});

test.describe('Discussion — refresh cooldown (detail)', () => {
  test('refresh click → 429 → button disabled with data-remaining-seconds', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 5),
      refreshResult: 'cooldown',
      refreshRetryAfter: 25,
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    const btn = page.getByTestId('discussion-refresh-button');
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

test.describe('Discussion — infinite scroll (before cursor)', () => {
  test('sentinel visibility triggers before-cursor fetch and appends more items', async ({
    page,
  }) => {
    await mockStockDetail(page);

    const firstPage = buildDiscussionList(STOCK_CODE, 50);
    // 두 번째 페이지는 postId 겹치지 않도록 변형
    const secondPage = buildDiscussionList(STOCK_CODE, 30).map((d, i) => ({
      ...d,
      id: `disc-second-${i}`,
      postId: String(200000000 + i),
      title: `second-${i}`,
      // 이전 페이지 마지막 postedAt 보다 더 과거로 세팅
      postedAt: '2026-04-16T05:00:00+00:00',
    }));

    let beforeCalls = 0;
    // 첫 페이지: before 없음
    await page.route(
      (url) =>
        url.pathname.endsWith(`/api/stocks/${STOCK_CODE}/discussions`) &&
        !url.searchParams.get('before'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(firstPage),
        }),
    );
    // 두 번째 페이지: before 있음
    await page.route(
      (url) =>
        url.pathname.endsWith(`/api/stocks/${STOCK_CODE}/discussions`) &&
        !!url.searchParams.get('before'),
      (route) => {
        beforeCalls += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(secondPage),
        });
      },
    );
    // POST refresh 는 풀페이지에서 호출 안 되지만 안전망
    await page.route(`**/api/stocks/${STOCK_CODE}/discussions/refresh`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    const list = page.getByTestId('discussion-list');
    await expect(list.getByTestId('discussion-item')).toHaveCount(50);

    // sentinel 을 viewport 로 스크롤 → IntersectionObserver 가 loadMore 호출
    const sentinel = page.getByTestId('discussion-pagination-sentinel');
    await sentinel.scrollIntoViewIfNeeded();

    // 두 번째 페이지 fetch 성공 후 합계 80 건
    await expect(list.getByTestId('discussion-item')).toHaveCount(80, { timeout: 5000 });
    expect(beforeCalls).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Discussion — a11y (axe-core scan)', () => {
  test('detail section has 0 serious/critical violations', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 5),
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    const section = page.getByTestId('stock-discussion-section');
    await expect(section).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="stock-discussion-section"]')
      .disableRules(['color-contrast'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking).toEqual([]);
  });

  test('full page has 0 serious/critical violations', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, {
      code: STOCK_CODE,
      list: buildDiscussionList(STOCK_CODE, 20),
    });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    await expect(page.getByTestId('discussion-list')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="discussion-list"]')
      .disableRules(['color-contrast'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking).toEqual([]);
  });
});
