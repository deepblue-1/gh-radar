import { test, expect, type Page } from '@playwright/test';
import {
  mockDiscussionsApi,
  DISCUSSION_ITEM_SAMPLE,
} from '../fixtures/discussions';
import { FIXTURE_SAMSUNG } from '../fixtures/stocks';

/**
 * Phase 08.1 Plan 07 — 의미성 필터 토글 E2E 4 시나리오.
 *
 * 대상 페이지: /stocks/[code]/discussions (풀페이지)
 * - Plan 06 에서 추가된 Switch 토글 ("의미있는 토론만 보기") + URL sync (?filter=meaningful|all)
 *
 * 시나리오:
 *  1. 기본 ON (URL 에 filter 없음) — Switch checked + noise 항목 미노출
 *  2. 토글 OFF 클릭 — URL 에 ?filter=all 추가 + noise 포함 전체 렌더
 *  3. 직접 ?filter=all 진입 — 토글 OFF 상태로 하이드레이션 + 전체 렌더
 *  4. ?filter=meaningful + mock 응답 빈 배열 — 전용 빈 상태 카피 노출
 */

const STOCK_CODE = '005930';

type DiscussionRelevance =
  | 'price_reason'
  | 'theme'
  | 'news_info'
  | 'noise'
  | null;

function makeRow(partial: {
  id: string;
  postId: string;
  title: string;
  relevance: DiscussionRelevance;
}) {
  return {
    ...DISCUSSION_ITEM_SAMPLE,
    id: partial.id,
    postId: partial.postId,
    stockCode: STOCK_CODE,
    title: partial.title,
    url: `https://finance.naver.com/item/board_read.naver?code=${STOCK_CODE}&nid=${partial.postId}`,
    relevance: partial.relevance,
    classifiedAt:
      partial.relevance !== null ? '2026-04-22T05:41:00+00:00' : null,
  };
}

const ROWS = [
  makeRow({
    id: 'row-1',
    postId: '272617001',
    title: '실적 발표 후 급등 이유 분석',
    relevance: 'price_reason',
  }),
  makeRow({
    id: 'row-2',
    postId: '272617002',
    title: '2차전지 테마 로테이션 흐름',
    relevance: 'theme',
  }),
  makeRow({
    id: 'row-3',
    postId: '272617003',
    title: 'ㅋㅋㅋ 뇌피셜 끝',
    relevance: 'noise',
  }),
  makeRow({
    id: 'row-4',
    postId: '272617004',
    title: '공시 내용 요약 공유',
    relevance: 'news_info',
  }),
];

async function mockStockDetail(page: Page) {
  await page.route(
    /\/api\/stocks\/([A-Za-z0-9]{1,10})(?:\?[^/]*)?$/,
    async (route) => {
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
        headers: { 'x-request-id': 'disc-filter-spec-req-id' },
        body: JSON.stringify(FIXTURE_SAMSUNG),
      });
    },
  );

  // 상세 페이지 아니지만 안전망 (풀페이지는 /news 직접 호출 안함)
  await page.route(`**/api/stocks/${STOCK_CODE}/news**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

test.describe('Phase 08.1 — Discussion filter toggle', () => {
  test('기본 ON (filter 없음) — Switch checked + noise 항목 미노출', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: ROWS });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);

    const toggleCard = page.getByTestId('discussion-filter-toggle');
    await expect(toggleCard).toBeVisible();
    const toggle = page.getByRole('switch', {
      name: /의미있는 토론만 보기/,
    });
    await expect(toggle).toBeChecked();

    const list = page.getByTestId('discussion-list');
    await expect(list).toBeVisible();
    const items = list.getByTestId('discussion-item');
    // meaningful 필터 → 4 행 중 noise 1건 제외 = 3건
    await expect(items).toHaveCount(3);
    await expect(list.getByText('실적 발표 후 급등 이유 분석')).toBeVisible();
    await expect(list.getByText('ㅋㅋㅋ 뇌피셜 끝')).toHaveCount(0);
  });

  test('토글 OFF 클릭 — URL ?filter=all + noise 포함 전체 렌더', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: ROWS });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    // 초기 meaningful 로드 완료 대기
    await expect(
      page.getByTestId('discussion-list').getByTestId('discussion-item'),
    ).toHaveCount(3);

    const toggle = page.getByRole('switch', {
      name: /의미있는 토론만 보기/,
    });
    await toggle.click();

    await expect(page).toHaveURL(/filter=all/);

    const list = page.getByTestId('discussion-list');
    // all → 전체 4 건 (noise 포함)
    await expect(list.getByTestId('discussion-item')).toHaveCount(4);
    await expect(list.getByText('ㅋㅋㅋ 뇌피셜 끝')).toBeVisible();
  });

  test('직접 ?filter=all 진입 — 토글 OFF + noise 포함', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: ROWS });

    await page.goto(`/stocks/${STOCK_CODE}/discussions?filter=all`);

    const toggle = page.getByRole('switch', {
      name: /의미있는 토론만 보기/,
    });
    await expect(toggle).not.toBeChecked();

    const list = page.getByTestId('discussion-list');
    await expect(list.getByTestId('discussion-item')).toHaveCount(4);
    await expect(list.getByText('ㅋㅋㅋ 뇌피셜 끝')).toBeVisible();
  });

  test('?filter=meaningful + 빈 배열 — 전용 빈 상태 카피', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: [] });

    await page.goto(`/stocks/${STOCK_CODE}/discussions?filter=meaningful`);

    const empty = page.getByTestId('discussion-page-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(
      '의미있는 토론이 아직 없어요. 토글을 꺼서 전체 글을 볼 수 있어요.',
    );
  });
});
