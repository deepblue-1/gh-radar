import { test, expect } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';

/**
 * Phase 06 Plan 06 — 종목 상세 E2E (SRCH-03).
 * 6-06-02: Hero / Stats / News section / Discussion placeholder 렌더 + 새로고침 + 404 카피.
 *
 * Phase 07 Plan 04 에서 "관련 뉴스" placeholder 가 실제 StockNewsSection 으로 교체됨 —
 * 테스트는 뉴스 API 를 mock 해 section 렌더를 검증한다. 종목토론방 placeholder 는 Phase 8 에 잔존.
 */

test.describe('Phase 6 — 종목 상세 (SRCH-03)', () => {
  test('/stocks/005930 — Hero + Stats + News + 종목토론방 Placeholder 렌더', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    // Hero
    await expect(
      page.getByRole('heading', { name: '삼성전자' }),
    ).toBeVisible();
    await expect(page.getByTestId('stock-hero-price')).toContainText('58,700');

    // Stats grid 라벨 8개
    for (const label of [
      '시가',
      '고가',
      '저가',
      '거래량',
      '거래대금',
      '시가총액',
      '상한가',
      '하한가',
    ]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }

    // Phase 07: 관련 뉴스 섹션 (StockNewsSection) 실제 렌더
    await expect(page.getByTestId('stock-news-section')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '관련 뉴스' }),
    ).toBeVisible();

    // Phase 8: 종목토론방 placeholder 는 잔존
    await expect(
      page.getByRole('heading', { name: '종목토론방' }),
    ).toBeVisible();
    await expect(
      page.getByText('Phase 8 로드맵에서 제공됩니다.'),
    ).toBeVisible();

    // 갱신시각 포맷
    await expect(page.getByText(/갱신 \d{2}:\d{2}:\d{2} KST/)).toBeVisible();
  });

  test('새로고침 버튼 클릭 → 재요청', async ({ page }) => {
    let callCount = 0;
    await mockStockApi(page);
    // playwright route 우선순위: 마지막 등록이 우선 → 카운터 라우트를 나중에 등록
    await page.route(/\/api\/stocks\/005930(?:\?[^/]*)?$/, async (route) => {
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_SAMSUNG),
      });
    });

    await page.goto('/stocks/005930');
    await expect(
      page.getByRole('heading', { name: '삼성전자' }),
    ).toBeVisible();

    const initial = callCount;
    expect(initial).toBeGreaterThan(0);

    await page.getByRole('button', { name: '새로고침' }).click();
    await expect.poll(() => callCount, { timeout: 3000 }).toBeGreaterThan(
      initial,
    );
  });

  test('/stocks/INVALID → not-found 카피', async ({ page }) => {
    await mockStockApi(page, { detailStatusByCode: { INVALID: 404 } });
    await page.goto('/stocks/INVALID');

    // notFound() 전환에 시간이 걸릴 수 있어 timeout 을 늘린다 (dev mode compile + 404 rehydrate)
    await expect(
      page.getByRole('heading', { name: '종목을 찾을 수 없습니다' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/영문\/숫자 1~10자, 예: 005930/),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '스캐너로 돌아가기' }),
    ).toHaveAttribute('href', '/scanner');
  });
});
