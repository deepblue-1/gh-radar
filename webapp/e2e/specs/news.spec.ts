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

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
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

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
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

    /*
      ★ h1 은 **동기화 지점이 아니다** (16-17 진단).

      `headingName = stock?.name ?? code` 라서 제목은 첫 클라이언트 렌더부터
      「005930 — 최근 7일 뉴스」로 존재한다 — 목록이 아직 스켈레톤이어도 이 정규식에
      걸린다. 그 뒤 `count()` 는 **재시도하지 않는 즉시 조회**라 100건 페이로드가
      50건보다 조금만 늦어도 0 을 읽는다(선행 실패의 진짜 원인 — 16-11/16-15 가
      「뉴스 목록 상한 계약 회귀」로 기록했지만 계약이 아니라 이 경주였다).

      그래서 목록 컨테이너를 기다린 뒤, 재시도하는 단언으로 「1건 이상」을 확인하고
      나서 상한을 잰다.
    */
    await expect(page.getByTestId('news-list')).toBeVisible();
    await expect(page.getByTestId('news-item').first()).toBeVisible();
    await expect
      .poll(() => page.getByTestId('news-item').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const count = await page.getByTestId('news-item').count();
    expect(count).toBeLessThanOrEqual(100);
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

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
    const btn = page.getByTestId('news-refresh-button');
    await expect(btn).toBeEnabled();
    await btn.click();

    /*
      ★ `disabled` 는 **두 상태를 겹쳐 쓴다** — `isRefreshing || isCooldown`
        (`news-refresh-button.tsx:27`). 그래서 클릭 직후 429 가 도착하기 **전에도**
        버튼은 이미 disabled 다. 거기서 곧바로 속성을 읽으면 `null` 이 나온다
        (deferred-items 가 「실행에 따라 갈린다」로 기록한 불안정의 정체 — 16-17 확인).

        기다려야 하는 것은 disabled 가 아니라 **쿨다운 진입**이고, 그 유일한 증거가
        이 속성이다. 재시도하는 단언으로 그것을 기다린 뒤에 값을 읽는다.
    */
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('data-remaining-seconds', /^\d+$/, { timeout: 15_000 });
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

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
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
