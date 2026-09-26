import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';

/**
 * Phase 07 Plan 06 — news E2E (V-17 / V-18 / V-19 / V-20).
 *
 * 구성:
 *  - V-17 detail list: /stocks/005930 상세 내 "관련 뉴스" 섹션 렌더 + 보안 링크 속성
 *  - V-18 full list: 옛 /stocks/005930/news → 탭 안 전체목록 리다이렉트 + ← = 요약 (Phase 21 D-29)
 *  - G-21-R3-8: 탭 안 전체목록 열기 · 뒤로가기 · 스크롤 복원 · ← · Esc
 *  - V-19 refresh cooldown: 429 수신 시 버튼 disabled + data-remaining-seconds
 *  - V-20 a11y: @axe-core/playwright 로 serious/critical 0 violation
 *
 * Fixture 재사용: Plan 07-01 Task 3 산출 `webapp/e2e/fixtures/news.ts` 그대로 import.
 * storageState: playwright.config.ts `chromium` project 가 webapp/.playwright/auth.json 로드.
 */
const STOCK_CODE = '005930';

async function mockStockDetail(page: Page) {
  // Next.js /stocks/[code] 라우트가 StockDetailClient 에서 /api/stocks/005930 을 호출하므로
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
  test('renders 5 news items + 전체 뉴스 보기 button', async ({ page }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 5),
    });

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
    await expect(page.getByTestId('stock-news-section')).toBeVisible();

    const items = page.getByTestId('stock-news-section').getByTestId('news-item');
    await expect(items).toHaveCount(5);

    // Phase 21 D-29 — 종목상세에서는 페이지 이동 Link 가 아니라 탭 안 전체목록을 여는 버튼이다.
    await expect(page.getByRole('button', { name: /전체 뉴스 보기/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /전체 뉴스 보기/ })).toHaveCount(0);
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

test.describe('News — G-21-R3-8 탭 안 전체 뉴스 (D-29)', () => {
  test('G-21-R3-8 탭 안 전체 뉴스 — 열기 · 뒤로가기 = 요약 + 창 스크롤 복원 · ← · 딥링크 ←', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 50),
    });
    const summary = page.getByTestId('stock-news-section');
    const showAll = page.getByRole('button', { name: /전체 뉴스 보기/ });
    const backBtn = page.getByRole('button', { name: '요약으로 돌아가기' });

    await page.goto(`/stocks/${STOCK_CODE}?tab=news`);
    await expect(summary).toBeVisible();

    // 창(window)이 스크롤 주체다 — AppShell main 은 높이 제한이 없다(news-view.ts 머리 주석).
    const target = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = Math.max(0, Math.min(300, max));
      window.scrollTo(0, y);
      return window.scrollY;
    });
    expect(target).toBeGreaterThan(0);

    // ① 열기 — 페이지를 떠나지 않고 같은 탭 안에서 전체목록
    await showAll.click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news&view=news$`));
    await expect(page.getByTestId('news-list')).toBeVisible();
    await expect(page.getByTestId('news-list').getByTestId('news-item')).toHaveCount(50);
    await expect(summary).toBeHidden();

    // ② 브라우저 뒤로 = 요약 · 창 스크롤 복원(±2)
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(summary).toBeVisible();
    await expect(page.getByTestId('news-list')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(target - 2);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(target + 2);

    // ③ 다시 열고 화면 안 ← = 요약(우리가 쌓은 기록이라 history.back — 기록 증가 0)
    await showAll.click();
    await expect(page).toHaveURL(/view=news$/);
    await backBtn.click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(summary).toBeVisible();
    // 앞으로 가기로 전체목록이 다시 나온다 = ← 가 replace 가 아니라 history.back 이었다.
    await page.goForward();
    await expect(page).toHaveURL(/view=news$/);
    await expect(page.getByTestId('news-list')).toBeVisible();
    await page.goBack();
    await expect(summary).toBeVisible();

    // ④ 딥링크로 들어와 ← = ?tab=news 로 바뀔 뿐 같은 경로(페이지 이탈 없음)
    await page.goto(`/stocks/${STOCK_CODE}?tab=news&view=news`);
    await expect(page.getByTestId('news-list')).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(summary).toBeVisible();

    // ⑤ Esc = 요약
    await showAll.click();
    await expect(page.getByTestId('news-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(summary).toBeVisible();

    // ⑥ 활성 「뉴스토론」 탭 재클릭 = 요약(실제 Radix — 활성 탭 재클릭은 onValueChange 를 안 부른다)
    await showAll.click();
    await expect(page.getByTestId('news-list')).toBeVisible();
    await page.getByRole('tab', { name: '뉴스토론' }).click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(summary).toBeVisible();
  });

  test('G-21-R3-8 허용 목록 밖 view 는 요약으로 떨어진다(T-21-82)', async ({ page }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 5),
    });
    await page.goto(`/stocks/${STOCK_CODE}?tab=news&view=%3Cscript%3E`);
    await expect(page.getByTestId('stock-news-section')).toBeVisible();
    await expect(page.getByTestId('news-full-list')).toHaveCount(0);
  });
});

test.describe('News — 옛 전체 페이지 URL → 탭 안 전체목록 (V-18 · D-29)', () => {
  test('옛 /news → ?tab=news&view=news 리다이렉트 · 탭 안 전체목록 · ← = 요약', async ({ page }) => {
    await mockStockDetail(page);
    await mockNewsApi(page, {
      code: STOCK_CODE,
      list: buildNewsList(STOCK_CODE, 50),
    });

    await page.goto(`/stocks/${STOCK_CODE}/news`);
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news&view=news$`));
    await expect(
      page.getByRole('heading', { level: 2, name: '최근 7일 뉴스' }),
    ).toBeVisible();

    const items = page.getByTestId('news-list').getByTestId('news-item');
    await expect(items).toHaveCount(50);

    // ← = 요약(리다이렉트로 들어온 딥링크라 replaceState ?tab=news — 페이지 이탈 없음)
    await page.getByRole('button', { name: '요약으로 돌아가기' }).click();
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}\\?tab=news$`));
    await expect(page.getByTestId('stock-news-section')).toBeVisible();
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
    await expect(page).toHaveURL(/view=news$/);

    /*
      ★ 제목은 **동기화 지점이 아니다** (16-17 진단).

      제목은 첫 클라이언트 렌더부터 존재한다 — 목록이 아직 스켈레톤이어도 걸린다. 그 뒤
      `count()` 는 **재시도하지 않는 즉시 조회**라 100건 페이로드가 조금만 늦어도 0 을 읽는다
      (선행 실패의 진짜 원인 — 16-11/16-15 가 「뉴스 목록 상한 계약 회귀」로 기록했지만 계약이
      아니라 이 경주였다).

      그래서 목록 컨테이너를 기다린 뒤, 재시도하는 단언으로 「1건 이상」을 확인하고
      나서 상한을 잰다. 요약 섹션(숨김)의 news-item 이 섞이지 않게 목록 안으로 좁힌다.
    */
    const list = page.getByTestId('news-list');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('news-item').first()).toBeVisible();
    await expect
      .poll(() => list.getByTestId('news-item').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const count = await list.getByTestId('news-item').count();
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
