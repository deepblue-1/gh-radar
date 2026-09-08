// Phase 08 — Playwright fixture: /api/stocks/:code/discussions* 라우트 mock.
// 필드명 = Discussion (camelCase). server/src/mappers/discussions.ts::toDiscussion 출력과 일치.
// Plan 08-04 (webapp discussion section) 이 이 fixture 를 소비.
// Phase 08.1 Plan 06 — relevance 필드 추가 + filter=meaningful 쿼리 수용.
import type { Page } from "@playwright/test";

type DiscussionRelevance =
  | "price_reason"
  | "theme"
  | "news_info"
  | "noise"
  | null;

export const DISCUSSION_ITEM_SAMPLE = {
  id: "d1e2f3a4",
  stockCode: "005930",
  postId: "272617128",
  title: "삼성전자 실적 기대감",
  body: "1분기 영업이익 시장 컨센서스 상회. 외인 순매수 유입.",
  author: "abc****",
  postedAt: "2026-04-17T05:32:00+00:00",
  scrapedAt: "2026-04-17T05:40:00+00:00",
  url: "https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128",
  // Phase 08.1 — 분류 결과 (null = 미분류). 기본 fixture 는 의미성 있음.
  relevance: "news_info" as DiscussionRelevance,
  classifiedAt: "2026-04-17T05:41:00+00:00" as string | null,
};

export function buildDiscussionList(code: string, n: number) {
  return Array.from({ length: n }).map((_, i) => ({
    ...DISCUSSION_ITEM_SAMPLE,
    id: `disc-${code}-${i}`,
    stockCode: code,
    postId: String(100000000 + i),
    title: `${DISCUSSION_ITEM_SAMPLE.title} #${i}`,
    url: `https://finance.naver.com/item/board_read.naver?code=${code}&nid=${100000000 + i}`,
  }));
}

export async function mockDiscussionsApi(
  page: Page,
  opts: {
    code: string;
    list?: unknown[];
    /** GET 응답 envelope 의 `hasMore`. 기본 false (더 불러올 페이지 없음). */
    hasMore?: boolean;
    refreshResult?: "ok" | "cooldown" | "error" | "stale";
    refreshRetryAfter?: number;
  },
) {
  const {
    code,
    list = [],
    hasMore = false,
    refreshResult = "ok",
    refreshRetryAfter = 25,
  } = opts;

  // GET — 쿼리 string 있음/없음 양쪽 커버
  // Phase 08.1 Plan 06: `?filter=meaningful` 쿼리 수용.
  //   - meaningful → `relevance` 가 'noise' 가 아닌 항목만 반환 (null / price_reason / theme / news_info 통과)
  //   - all / 미지정 → 전체 반환 (서버 default 'all' 동일 동작)
  // Phase 15 이관 6 (quick 260908-qnf): GET 은 배열이 아니라
  // `DiscussionListResponse = { items, hasMore }` envelope 다
  // (`packages/shared/src/discussion.ts` · `stock-api.ts::fetchStockDiscussions`).
  // 스텁이 배열을 그대로 돌려주던 동안 웹앱은 `items` 를 찾지 못해 항상 빈 목록을 그렸다.
  // `filter=meaningful` 필터링은 **items 배열에만** 적용한다.
  await page.route(`**/api/stocks/${code}/discussions?**`, (route) => {
    const url = new URL(route.request().url());
    const filter = url.searchParams.get("filter") ?? "all";
    const items =
      filter === "meaningful"
        ? (list as Array<Record<string, unknown>>).filter(
            (r) => r.relevance !== "noise",
          )
        : list;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, hasMore }),
    });
  });
  await page.route(`**/api/stocks/${code}/discussions`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: list, hasMore }),
    }),
  );

  // POST refresh — 이쪽 계약은 `Discussion[]` **배열**이 맞다
  // (`stock-api.ts::refreshStockDiscussions`). envelope 로 바꾸지 말 것.
  await page.route(
    `**/api/stocks/${code}/discussions/refresh`,
    (route) => {
      if (refreshResult === "cooldown") {
        return route.fulfill({
          status: 429,
          headers: { "Retry-After": String(refreshRetryAfter) },
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "DISCUSSION_REFRESH_COOLDOWN",
              message: "잠시 후 다시 시도해주세요",
            },
            retry_after_seconds: refreshRetryAfter,
          }),
        });
      }
      if (refreshResult === "error") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "PROXY_UNAVAILABLE",
              message: "proxy client not configured",
            },
          }),
        });
      }
      if (refreshResult === "stale") {
        // stale: 프록시 실패로 500 응답. D7 — webapp 은 기존 list 유지 + "X분 전 데이터" Badge.
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "PROXY_UNAVAILABLE",
              message: "upstream failure",
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([...(list as unknown[])]),
      });
    },
  );
}
