import { test, expect, type Page } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';
import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';
import { mockThemeChips } from '../fixtures/themes';
import { FIXTURE_NULL_PRICE } from '../fixtures/stocks';
import { E2E_ISIN, withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * Phase 15 Plan 11 — 종목상세 4탭 재구성 회귀 E2E (RELAY-01 · D-02a · UI-SPEC T1~T7).
 *
 * 스코프:
 *   - 상단 4탭(`차트`/`호가주문`/`종목정보`/`뉴스토론`)이 role="tab" 으로 존재 (T2)
 *   - 탭 전환이 서버 요청 없이(네이티브 pushState) `?tab=` 에 반영되고 딥링크·뒤로가기가 동작 (T3)
 *   - test 10: 탭 전환이 `tab=` 을 담은 RSC 요청을 0건 만든다 — 지연 해소 증명 (260913-v2e)
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
    // quick 260908-qnf(이관 6)가 `mockDiscussionsApi` 를 `{items,hasMore}` 계약으로
    // 고쳐 정상 상태를 강제할 수 있게 됐다 — 접두사 매칭(로딩/에러 접미사 허용)을
    // 정확한 testid 로 좁힌다.
    await expect(page.getByTestId('stock-discussion-section')).toBeVisible();
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

  test('8. 뒤로가기 한 번이 이전 탭으로 돌아간다 — history.pushState 증명 (T3)', async ({
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

    // 두 실패 모드를 함께 잡는다: replace 였다면 종목상세를 벗어났을 것이고, 한 클릭이 기록을
    // 2개 남겼다면(Radix mousedown+focus 이중 호출) goBack 한 번으로는 종목정보에 머물렀을 것이다.
    // push 1회이므로 `차트` 탭으로 되돌아온다 (260913-v2e).
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

    // exact — `뉴스토론` 탭 안의 "뉴스 새로고침"·"토론방 새로고침" 버튼까지 substring 으로 잡으면
    // strict mode 위반이 난다. 여기서 보는 것은 탭 밖 공통 영역의 새로고침 하나다.
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    await expect(refresh).toBeVisible();

    for (const label of ['호가주문', '종목정보', '뉴스토론']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '삼성전자' }),
      ).toBeVisible();
      await expect(refresh).toBeVisible();
    }
  });

  test('10. 탭 전환은 서버(RSC) 요청을 만들지 않는다 — 지연 해소 증명 (260913-v2e)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);

    // `tab=` 을 담은 RSC 요청만 센다. 사이드바 Link 프리페치는 `next-router-prefetch` 헤더가
    // 붙으므로 뺀다(Playwright 는 헤더 이름을 소문자로 준다).
    const rscTabRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      const headers = request.headers();
      const isRsc = headers['rsc'] === '1' || url.includes('_rsc=');
      if (url.includes('tab=') && isRsc && !headers['next-router-prefetch']) {
        rscTabRequests.push(url);
      }
    });

    for (const label of ['종목정보', '뉴스토론', '호가주문']) {
      const trigger = page.getByRole('tab', { name: label, exact: true });
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page).toHaveURL(/\?tab=orderbook$/);

    // 배열 자체를 비교해 실패 시 모인 URL 목록이 보이게 한다.
    expect(rscTabRequests).toEqual([]);
  });

  test('11. 한 번 연 탭은 다시 열 때 재조회하지 않고, 숨겼던 차트도 제 크기로 돌아온다 (T8)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    const limitUpRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/limit-up')) limitUpRequests.push(request.url());
    });

    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);
    const chartCanvas = page
      .getByTestId('stock-tab-panel-chart')
      .locator('canvas')
      .first();
    await expect(chartCanvas).toBeVisible();

    const infoTab = page.getByRole('tab', { name: '종목정보', exact: true });
    const chartTab = page.getByRole('tab', { name: '차트', exact: true });

    await infoTab.click();
    await expect(page.getByTestId('stock-tab-panel-info')).toBeVisible();
    await expect.poll(() => limitUpRequests.length).toBeGreaterThan(0);
    // 첫 마운트 요청 수가 안정될 때까지 둔다 — 개발 서버는 React StrictMode 가 effect 를 두 번
    // 돌려 1회가 아니라 2회일 수 있다. 단언 대상은 "재방문에서 늘지 않는다" 이다.
    await page.waitForTimeout(1_000);
    const afterFirstOpen = limitUpRequests.length;
    // 떠난 차트는 언마운트가 아니라 숨김.
    await expect(page.getByTestId('stock-tab-panel-chart')).toBeHidden();

    await chartTab.click();
    await expect(chartCanvas).toBeVisible();
    // display:none 동안 autoSize 가 0 으로 줄었다가 다시 펼쳐져야 한다.
    await expect
      .poll(async () => (await chartCanvas.boundingBox())?.width ?? 0)
      .toBeGreaterThan(100);

    await infoTab.click();
    await expect(page.getByTestId('stock-tab-panel-info')).toBeVisible();
    await page.waitForTimeout(1_000);
    // 재방문은 재마운트가 아니므로 상한가 섹션이 다시 부르지 않는다.
    expect(limitUpRequests).toHaveLength(afterFirstOpen);
  });
});

/**
 * Phase 21 G-21-R3-9 (D-30) — 종목상세 「트레이딩」 → `/trading?code=` 착지.
 *
 * 폰(390)은 하단 CTA 바(`detail-order-cta` — 「주문하기」 시절 data-slot 그대로), 넓은 폭(1280)은 히어로 첫 줄 끝
 * 알약(`detail-trading-button` · 스케치 008 ② A)이 같은 링크를 맡는다. 누르면 작업대가 그 종목 카드를 보장 ·
 * 펼침한다(21-33 착지). 매매 불가 종목(isin 없음)에는 두 버튼 모두 없다(T-21-93).
 *
 * 작업대는 relay 인증·배치 복원 뒤에 착지하므로 이 describe 만 로컬 relay(8090 고정 · 스텁 게이트웨이)를
 * 띄운다 — 규약은 `trading-workbench.spec.ts` ④⑤ 와 같다(실서버에 붙지 않는다).
 */
test.describe('Phase 21 G-21-R3-9 — 「트레이딩」 → /trading?code= (로컬 relay + 스텁 게이트웨이)', () => {
  test.describe.configure({ mode: 'serial' });
  let relay: LocalRelay;

  test.beforeAll(async () => {
    relay = await withLocalRelay();
  });

  test.afterAll(async () => {
    await relay.stop();
  });

  test.beforeEach(() => {
    relay.reset();
  });

  const tradingCard = (page: Page) =>
    page.locator(`[data-slot="strategy-card"][data-key^="${E2E_ISIN}:"]`);

  /** 작업대에 도착해 그 종목 카드가 펼쳐져 있고, 착지 파라미터(code)는 URL 에서 빠졌다. */
  async function expectLandedOnCard(page: Page): Promise<void> {
    await expect(page).toHaveURL(
      (url) => url.pathname === '/trading' && !url.searchParams.has('code'),
      { timeout: 30_000 },
    );
    await expect(page.locator('[data-slot="workbench-status-bar"]')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 30_000 },
    );
    await expect(tradingCard(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(tradingCard(page)).toHaveAttribute('data-open', 'true', { timeout: 15_000 });
  }

  test('G-21-R3-9 트레이딩 버튼 — 390 폰 하단 바 · 1280 히어로 알약 각각 누르면 /trading 에 그 종목 카드가 펼쳐져 있다, 매매 불가 종목엔 둘 다 없다 (D-30 · T-21-93)', async ({
    page,
  }) => {
    await setupStockDetail(page);
    const wideButton = page.locator('[data-slot="detail-trading-button"]');
    const phoneCta = page.locator('[data-slot="detail-order-cta"]');

    // ① 폰 390 — 하단 바 「트레이딩」(56 · --up 그대로, 라벨만 바뀜). 넓은 폭 알약은 숨는다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);
    await expect(phoneCta).toBeVisible();
    await expect(phoneCta).toHaveText('트레이딩');
    await expect(phoneCta).toHaveAttribute('href', `/trading?code=${STOCK_CODE}`);
    await expect(wideButton).toBeHidden();
    await phoneCta.click();
    await expectLandedOnCard(page);

    // 카드를 접어 두고 넓은 폭에서 다시 들어온다 — 착지가 다시 펼치는지를 본다.
    // 헤더 토글 = 카드 헤더 안 `aria-expanded` 버튼 하나(trading-workbench.spec `toggleOf` 와 같은 선택자).
    await tradingCard(page).first().locator('[data-slot="card-header"] button[aria-expanded]').click();
    await expect(tradingCard(page)).toHaveAttribute('data-open', 'false');

    // ② 넓은 폭 1280 — 히어로 첫 줄 끝 알약. 폰 바는 md:hidden.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/stocks/${STOCK_CODE}`);
    await waitForHero(page);
    await expect(wideButton).toBeVisible();
    await expect(wideButton).toHaveText('트레이딩');
    await expect(page.locator('[data-slot="detail-order-cta-bar"]')).toBeHidden();
    await wideButton.click();
    await expectLandedOnCard(page);

    // ③ 매매 불가 종목(isin 없음) — 두 폭 모두 버튼 0, 예약 여백도 없다.
    await mockStockApi(page, { detailByCode: { [FIXTURE_NULL_PRICE.code]: FIXTURE_NULL_PRICE } });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/stocks/${FIXTURE_NULL_PRICE.code}`);
      await expect(page.getByRole('heading', { name: FIXTURE_NULL_PRICE.name })).toBeVisible({
        timeout: 15_000,
      });
      await expect(wideButton).toHaveCount(0);
      await expect(page.locator('[data-slot="detail-order-cta-bar"]')).toHaveCount(0);
      await expect(page.locator('[data-order-cta="true"]')).toHaveCount(0);
    }
  });
});
