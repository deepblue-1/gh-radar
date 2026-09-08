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
 * **현행 계약 = 분류 정지(CLASSIFY_PAUSED)** — quick 260706-erk 가 Haiku 의미성 분류
 * 파이프라인을 제거하면서 `discussion-page-client.tsx` 의 `CLASSIFY_PAUSED` 를 true 로
 * 고정했다. 그 뒤로 토글은 항상 disabled/OFF 이고 필터는 `all` 로 고정된다
 * (URL `?filter=meaningful` 도 무시). 단위 테스트
 * `src/components/stock/__tests__/discussion-page-client.test.tsx` 는 그때 갱신됐지만
 * 이 E2E 스펙만 Phase 08.1 시절 단언을 그대로 들고 있어 3건이 상시 빨간 상태였다
 * (quick 260908-qnf · 이관 6). 아래 시나리오는 단위 테스트와 같은 계약을 본다.
 *
 * 시나리오:
 *  1. 기본 (URL 에 filter 없음) — Switch OFF/disabled + noise 포함 전체 렌더
 *  2. 토글 클릭 — disabled 라 URL·목록 모두 불변
 *  3. 직접 ?filter=all 진입 — 토글 OFF + 전체 렌더
 *  4. ?filter=meaningful + mock 응답 빈 배열 — meaningful 전용 카피가 아닌 전체-수집 안내 카피
 *
 * 분류를 다시 켜면(`CLASSIFY_PAUSED = false`) 1·2·4 를 Phase 08.1 계약으로 되돌려야 한다.
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

test.describe('Discussion filter toggle — 분류 정지(CLASSIFY_PAUSED) 계약', () => {
  test('기본 (filter 없음) — Switch OFF/disabled + noise 포함 전체 렌더', async ({
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
    // 분류 정지 중이므로 URL 에 filter 가 없어도 OFF + disabled 다.
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeDisabled();

    const list = page.getByTestId('discussion-list');
    await expect(list).toBeVisible();
    const items = list.getByTestId('discussion-item');
    // filter=all 고정 → 4 행 전부 (noise 포함)
    await expect(items).toHaveCount(4);
    await expect(list.getByText('실적 발표 후 급등 이유 분석')).toBeVisible();
    await expect(list.getByText('ㅋㅋㅋ 뇌피셜 끝')).toBeVisible();
  });

  test('토글 클릭 — disabled 라 URL·목록 모두 불변', async ({ page }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: ROWS });

    await page.goto(`/stocks/${STOCK_CODE}/discussions`);
    // 초기 로드 완료 대기 (filter=all 고정 → 4건)
    await expect(
      page.getByTestId('discussion-list').getByTestId('discussion-item'),
    ).toHaveCount(4);

    const toggle = page.getByRole('switch', {
      name: /의미있는 토론만 보기/,
    });
    await expect(toggle).toBeDisabled();
    // disabled 요소라 실제 클릭 이벤트가 가지 않는다 — actionability 대기를 건너뛰고
    // "눌러도 아무 일이 없다" 만 확인한다.
    await toggle.click({ force: true });

    await expect(page).not.toHaveURL(/filter=/);
    await expect(toggle).not.toBeChecked();

    const list = page.getByTestId('discussion-list');
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

  test('?filter=meaningful + 빈 배열 — meaningful 전용 카피가 아닌 전체-수집 안내 카피', async ({
    page,
  }) => {
    await mockStockDetail(page);
    await mockDiscussionsApi(page, { code: STOCK_CODE, list: [] });

    await page.goto(`/stocks/${STOCK_CODE}/discussions?filter=meaningful`);

    const empty = page.getByTestId('discussion-page-empty');
    await expect(empty).toBeVisible();
    // 분류 정지 중에는 URL 의 meaningful 을 무시하므로 meaningful 전용 카피가 나오면 안 된다.
    await expect(empty).toContainText(
      '최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.',
    );
    await expect(empty).not.toContainText(
      '의미있는 토론이 아직 없어요. 토글을 꺼서 전체 글을 볼 수 있어요.',
    );
  });
});
