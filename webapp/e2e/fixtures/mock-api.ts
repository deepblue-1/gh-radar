import type { Page, Route } from '@playwright/test';
import type { Stock } from '@gh-radar/shared';
import { FIXTURE_SAMSUNG } from './stocks';

// Phase 07 — news mock API re-export (Plan 07-01 Task 3)
export { mockNewsApi, NEWS_ITEM_SAMPLE, buildNewsList } from './news';

// Phase 08 — discussion mock API re-export (Plan 08-01 Task 3)
export {
  mockDiscussionsApi,
  DISCUSSION_ITEM_SAMPLE,
  buildDiscussionList,
} from './discussions';

/**
 * playwright 테스트용 API 모킹 (Phase 06 Plan 06).
 *
 * - `/api/stocks/search?q=...` → 고정 검색 결과 JSON
 * - `/api/stocks/:code` → 단일 종목 또는 404 (detailStatusByCode 로 강제 가능)
 * - `/api/scanner` → 빈 배열 (스캐너 페이지 진입 시 백엔드 부재로 인한 폴링 실패 차단)
 *
 * baseURL 는 webapp `NEXT_PUBLIC_API_BASE_URL` 설정(미설정 시 `http://localhost:8080`)에
 * 의존하므로 모든 route 는 `**` 로 host 와 무관하게 매칭한다.
 */
export interface MockStockApiOptions {
  searchResults?: Stock[];
  detailByCode?: Record<string, Stock>;
  detailStatusByCode?: Record<string, number>;
}

export async function mockStockApi(
  page: Page,
  opts: MockStockApiOptions = {},
): Promise<void> {
  const {
    searchResults = [FIXTURE_SAMSUNG],
    detailByCode = { '005930': FIXTURE_SAMSUNG },
    detailStatusByCode = {},
  } = opts;

  // /api/stocks/search?q=...
  await page.route('**/api/stocks/search*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'test-req-id' },
      body: JSON.stringify(searchResults),
    });
  });

  // /api/stocks/:code — search 가 아닌 단건 상세만 매칭
  await page.route(
    /\/api\/stocks\/([A-Za-z0-9]{1,10})(?:\?[^/]*)?$/,
    async (route: Route) => {
      const url = route.request().url();
      const match = url.match(/\/api\/stocks\/([A-Za-z0-9]{1,10})/);
      const code = match?.[1] ?? '';
      if (code === 'search') {
        await route.fallback();
        return;
      }
      const status = detailStatusByCode[code];
      if (status && status >= 400) {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'STOCK_NOT_FOUND',
              message: `stock ${code} not found`,
            },
          }),
        });
        return;
      }
      const stock = detailByCode[code];
      if (!stock) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'STOCK_NOT_FOUND',
              message: `stock ${code} not found`,
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-request-id': 'test-req-id' },
        body: JSON.stringify(stock),
      });
    },
  );

  // /api/scanner — 스캐너 페이지 진입 시 API 부재로 인한 실패 차단
  await page.route('**/api/scanner*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'x-last-updated-at': new Date().toISOString(),
        'x-request-id': 'test-req-id',
      },
      body: JSON.stringify([]),
    });
  });
}
