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

    // aria-label — `exact` 없이는 스켈레톤의 `일봉 차트 로딩 중` 까지 잡혀 strict mode
    // violation 이 난다(선재 결함, Phase 15 Plan 11 에서 발견). 의도는 차트 카드 단독 단언.
    await expect(page.getByLabel('일봉 차트', { exact: true })).toBeVisible();

    // range 토글 4종 (2026-05-16: 1Y/2Y/3Y/5Y)
    for (const range of ['1Y', '2Y', '3Y', '5Y']) {
      await expect(page.getByRole('tab', { name: range })).toBeVisible();
    }

    // 3Y 이 기본 active (2026-05-16 사용자 요청 — 충분한 과거 데이터, 화면엔 최근 60개)
    await expect(page.getByRole('tab', { name: '3Y' })).toHaveAttribute(
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

  test('차트 영역이 Hero ↓ 에 위치하고 StatsGrid 는 종목정보 탭으로 이동 (D-09 → Phase 15 D-02a)', async ({
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

    await expect(hero).toBeVisible();
    await expect(chart).toBeVisible();

    // Phase 15 Plan 11 (D-02a/T1): 히어로는 탭 밖 공통 영역, 차트는 기본 `차트` 탭 패널.
    // "히어로 아래에 차트" 라는 D-09 의 의도는 그대로이나 StatsGrid 는 더 이상 같은
    // 화면에 없다 — `종목정보` 탭으로 재배치됐다(T7 재배치, 내용 무변경).
    const heroBox = await hero.boundingBox();
    const chartBox = await chart.boundingBox();
    expect(heroBox).toBeTruthy();
    expect(chartBox).toBeTruthy();
    if (heroBox && chartBox) {
      expect(heroBox.y).toBeLessThan(chartBox.y);
    }

    // 차트 탭에는 통계 그리드가 없다.
    await expect(page.getByTestId('stock-stats-grid')).toHaveCount(0);

    // 종목정보 탭으로 전환하면 통계 그리드가 나타난다.
    await page.getByRole('tab', { name: '종목정보', exact: true }).click();
    await expect(page.getByTestId('stock-stats-grid').first()).toBeVisible();
  });

  test('range 토글 — 1Y 클릭 시 aria-selected 전환 (기본 3Y → 1Y)', async ({
    page,
  }) => {
    await mockStockApi(page);
    await mockNewsApi(page, {
      code: '005930',
      list: buildNewsList('005930', 5),
    });
    await page.goto('/stocks/005930');

    const tab1y = page.getByRole('tab', { name: '1Y' });
    await expect(tab1y).toBeVisible();
    await tab1y.click();

    await expect(tab1y).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: '3Y' })).toHaveAttribute(
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
