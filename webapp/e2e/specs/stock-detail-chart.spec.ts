import { test, expect } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';

/**
 * Phase 09.2 — DATA-03 차트 섹션 E2E.
 *
 * 스코프:
 *   - /stocks/005930 진입 시 차트 섹션이 Hero ↓ / StatsGrid ↑ 위치에 mount 되는지
 *   - 차트 캔버스 컨테이너 노출 (Skeleton → 데이터 전환 검증)
 *   - 기간 토글 4종 (1Y/2Y/3Y/5Y — 2026-05-16 사용자 요청으로 변경) 표시
 *   - timeframe 토글 3종 (일봉/주봉/월봉) 표시
 *   - aria-label="일봉 차트" 카드 부착
 *
 * 비검증 (Manual Verification — VALIDATION.md):
 *   - 캔들 픽셀 정확성 / 한국식 색상 시각 / 다크모드 토글 / 모바일 가독성
 *   - 위 항목은 jsdom 미지원 (lightweight-charts 의 Canvas 측정) — 사용자 시각 검증
 */

test.describe('Phase 09.2 — 차트 섹션 (DATA-03)', () => {
  test('/stocks/005930 — 차트 섹션 마운트 + range 4종 + timeframe 3종 표시', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    // Hero 가 먼저 보여야 후속 차트 섹션도 mount (StockDetailClient 의 isInitialLoading 분기)
    await expect(
      page.getByRole('heading', { name: '삼성전자' }),
    ).toBeVisible();

    // 차트 카드 컨테이너 (data-testid)
    const section = page.getByTestId('stock-daily-chart-section');
    await expect(section).toBeVisible();

    // 차트 캔버스 컨테이너 노출 검증
    const canvas = page.getByTestId('stock-daily-chart-canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // aria-label
    await expect(page.getByLabel('일봉 차트')).toBeVisible();

    // range 토글 4종 (2026-05-16: 1Y/2Y/3Y/5Y)
    for (const range of ['1Y', '2Y', '3Y', '5Y']) {
      await expect(page.getByRole('tab', { name: range })).toBeVisible();
    }

    // 1Y 이 기본 active (2026-05-16 사용자 요청)
    await expect(page.getByRole('tab', { name: '1Y' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // timeframe 토글 3종 (D/W/M)
    for (const tf of ['일봉', '주봉', '월봉']) {
      await expect(page.getByRole('tab', { name: tf })).toBeVisible();
    }
    // 기본 = 일봉
    await expect(page.getByRole('tab', { name: '일봉' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('차트 영역이 Hero ↓ / StatsGrid ↑ 사이에 위치 (D-09)', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    const hero = page.getByTestId('stock-hero-price');
    const chart = page.getByTestId('stock-daily-chart-section');
    const statsLabel = page.getByText('시가', { exact: true }).first();

    await expect(hero).toBeVisible();
    await expect(chart).toBeVisible();
    await expect(statsLabel).toBeVisible();

    // boundingBox y 좌표로 수직 순서 검증 — Hero < Chart < Stats
    const heroBox = await hero.boundingBox();
    const chartBox = await chart.boundingBox();
    const statsBox = await statsLabel.boundingBox();

    expect(heroBox).toBeTruthy();
    expect(chartBox).toBeTruthy();
    expect(statsBox).toBeTruthy();
    if (heroBox && chartBox && statsBox) {
      expect(heroBox.y).toBeLessThan(chartBox.y);
      expect(chartBox.y).toBeLessThan(statsBox.y);
    }
  });

  test('range 토글 — 2Y 클릭 시 aria-selected 전환', async ({ page }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    const tab2y = page.getByRole('tab', { name: '2Y' });
    await expect(tab2y).toBeVisible();
    await tab2y.click();

    await expect(tab2y).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: '1Y' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('timeframe 토글 — 주봉 클릭 시 카드 타이틀이 "주봉 차트" 로 전환', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    await expect(
      page.getByRole('heading', { name: '일봉 차트' }),
    ).toBeVisible();

    await page.getByRole('tab', { name: '주봉' }).click();
    await expect(
      page.getByRole('heading', { name: '주봉 차트' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: '주봉' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
