import { test, expect, type Page } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';
import { mockThemeChips } from '../fixtures/themes';

/**
 * Phase 15 Plan 11 — 종목상세 4탭 재구성 회귀 E2E (RELAY-01 · D-02a · UI-SPEC T1~T7).
 *
 * 스코프:
 *   - 상단 4탭(`차트`/`호가주문`/`종목정보`/`뉴스토론`)이 role="tab" 으로 존재 (T2)
 *   - 탭 전환이 `?tab=` 에 반영되고 딥링크·뒤로가기가 동작 (T3)
 *   - **기존 5개 phase 의 섹션이 탭 안에서 그대로 렌더된다** — 재배치가 기능을 잃지
 *     않았음을 증명하는 회귀 테스트가 이 spec 의 핵심 목적 (T7)
 *   - 히어로·새로고침이 탭 밖 공통 영역이라 모든 탭에서 보인다 (T1)
 *
 * 주의: 종목상세 페이지 안에는 차트 섹션의 기간/타임프레임 토글도 role="tab" 을 쓴다
 *       (`1Y`, `일봉 차트` 등). 페이지 레벨 탭만 잡으려면 `exact: true` 가 필수다 —
 *       `name: '차트'` 는 기본 substring 매칭에서 `일봉 차트` 까지 함께 잡는다.
 */

const STOCK_CODE = '005930';

/**
 * 종목정보 탭의 상한가·동조 섹션은 API 실패 시 조용히 null 을 반환한다(레이아웃 점프 방지).
 * 재배치 회귀를 증명하려면 두 섹션이 실제로 mount 되어야 하므로 최소 응답을 스텁한다.
 */
async function mockInfoTabApis(page: Page): Promise<void> {
  await page.route('**/api/stocks/*/limit-up', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hero: {
          totalEvents: 0,
          resolvedEvents: 0,
          winCount: 0,
          winRate: null,
          avgOpenRet: null,
          worstLowRet: null,
          recentWins: 0,
          recentLosses: 0,
          histogram: [0, 0, 0, 0, 0],
        },
        events: [],
        themes: [],
      }),
    });
  });
  await page.route('**/api/stocks/*/co-movement*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [] }),
    });
  });
}

async function setupStockDetail(page: Page): Promise<void> {
  await mockStockApi(page);
  await mockNewsApi(page, {
    code: STOCK_CODE,
    list: buildNewsList(STOCK_CODE, 5),
  });
  await mockDiscussionsApi(page, {
    code: STOCK_CODE,
    list: buildDiscussionList(STOCK_CODE, 5),
  });
  await mockThemeChips(page, []);
  await mockInfoTabApis(page);
}

/** 히어로가 뜬 뒤에야 탭 셸이 mount 된다 (StockDetailClient 의 isInitialLoading 분기). */
async function waitForHero(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '삼성전자' })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Phase 15 Plan 11 — 종목상세 4탭 (RELAY-01)', () => {
  test('1. 진입 시 히어로 + 4탭이 tablist 로 렌더된다 (T2)', async ({ page }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    for (const label of ['차트', '호가주문', '종목정보', '뉴스토론']) {
      await expect(
        page.getByRole('tab', { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test('2. 기본 활성 탭은 `차트` 이고 차트 섹션이 보인다 (T3 기본값)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    await expect(
      page.getByRole('tab', { name: '차트', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stock-daily-chart-section')).toBeVisible();
  });

  test('3. `종목정보` 탭 → ?tab=info + 통계·테마·상한가·동조 4섹션 렌더 (T7 회귀)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    await page.getByRole('tab', { name: '종목정보', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=info$/);

    // Phase 6 통계 그리드
    await expect(page.getByTestId('stock-stats-grid').first()).toBeVisible();
    // Phase 10 테마 칩
    await expect(
      page.getByRole('heading', { name: '이 종목의 테마' }),
    ).toBeVisible();
    // Phase 12 상한가 다음날 이력
    await expect(
      page.getByRole('region', { name: '상한가 다음날 이력' }),
    ).toBeVisible();
    // Phase 11 동반상승 후보
    await expect(
      page.getByRole('region', { name: '동반상승 후보' }),
    ).toBeVisible();
  });

  test('4. `뉴스토론` 탭 → ?tab=news + 뉴스·토론 섹션 렌더 (T7 회귀)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    await page.getByRole('tab', { name: '뉴스토론', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=news$/);

    // Phase 7 뉴스 / Phase 8 종목토론방
    await expect(page.getByTestId('stock-news-section')).toBeVisible();
    // 토론 섹션은 데이터 상태(정상/로딩/에러)에 따라 testid 접미사가 갈린다. 이 케이스가
    // 증명할 것은 "섹션이 뉴스토론 탭에 mount 되는가"(T7 재배치 회귀)이므로 상태와 무관하게
    // 잡는다 — e2e 픽스처 `mockDiscussionsApi` 가 `{items,hasMore}` 계약 이전의 배열을
    // 반환하는 선재 결함이 있어 정상 상태를 강제할 수 없다(deferred-items.md 참조).
    await expect(
      page.locator('[data-testid^="stock-discussion-section"]'),
    ).toBeVisible();
  });

  test('5. `호가주문` 탭 → ?tab=orderbook + 호가주문 패널이 항상 렌더된다 (UI-SPEC C1)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    await page.getByRole('tab', { name: '호가주문', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=orderbook$/);

    await expect(page.getByTestId('stock-tab-panel-orderbook')).toBeVisible();
    // 15-13 이 placeholder 를 StockOrderbookSection 으로 교체했다. 연결 상태와 무관하게
    // 섹션 자체는 **항상 렌더**된다(UI-SPEC C1 — 숨기지 않는다).
    await expect(page.getByTestId('stock-orderbook-section')).toBeVisible();
  });

  test('6. 딥링크 `?tab=info` 진입 시 종목정보 탭이 활성 상태다 (T3)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}?tab=info`);
    await waitForHero(page);

    await expect(
      page.getByRole('tab', { name: '종목정보', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stock-stats-grid').first()).toBeVisible();
  });

  test('7. 알 수 없는 `?tab=zzz` 는 기본 `차트` 로 폴백한다 (T-15-37)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}?tab=zzz`);
    await waitForHero(page);

    await expect(
      page.getByRole('tab', { name: '차트', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stock-daily-chart-section')).toBeVisible();
  });

  test('8. 뒤로가기가 이전 탭으로 돌아간다 — router.push 증명 (T3)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    await page.getByRole('tab', { name: '종목정보', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: '종목정보', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');

    await page.goBack();

    // replace 였다면 종목상세를 벗어났을 것이다. push 이므로 `차트` 탭으로 되돌아온다.
    await expect(
      page.getByRole('tab', { name: '차트', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}$`));
  });

  test('9. 히어로·새로고침은 탭 밖 공통 영역이라 모든 탭에서 보인다 (T1)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    const refresh = page.getByRole('button', { name: '새로고침' });
    await expect(refresh).toBeVisible();

    for (const label of ['호가주문', '종목정보', '뉴스토론']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '삼성전자' }),
      ).toBeVisible();
      await expect(refresh).toBeVisible();
    }
  });
});
