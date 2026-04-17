// Phase 07 — Playwright fixture: /api/stocks/:code/news* 라우트 mock.
// 필드명 = NewsArticle (camelCase). 서버 mapper(server/src/mappers/news.ts) 출력과 동일.
// Plan 07-03 이 snake_case → camelCase 변환을 서버에서 처리하므로 E2E 는 최종 클라이언트 응답을 흉내냄.
import type { Page } from "@playwright/test";

export const NEWS_ITEM_SAMPLE = {
  id: "a1b2",
  stockCode: "005930",
  title: "삼성전자, 1분기 영업익 6.6조원 기록",
  source: "hankyung",
  url: "https://www.hankyung.com/article/202604170142",
  publishedAt: "2026-04-17T05:32:00.000Z",
  createdAt: "2026-04-17T05:32:10.000Z",
};

export function buildNewsList(code: string, n: number) {
  return Array.from({ length: n }).map((_, i) => ({
    ...NEWS_ITEM_SAMPLE,
    id: `news-${code}-${i}`,
    stockCode: code,
    title: `${NEWS_ITEM_SAMPLE.title} #${i}`,
  }));
}

export async function mockNewsApi(
  page: Page,
  opts: {
    code: string;
    list?: unknown[];
    refreshResult?: "ok" | "cooldown" | "error";
    refreshRetryAfter?: number;
  },
) {
  const {
    code,
    list = [],
    refreshResult = "ok",
    refreshRetryAfter = 25,
  } = opts;

  await page.route(`**/api/stocks/${code}/news?**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    }),
  );
  await page.route(`**/api/stocks/${code}/news`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    }),
  );
  await page.route(`**/api/stocks/${code}/news/refresh`, (route) => {
    if (refreshResult === "cooldown") {
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": String(refreshRetryAfter) },
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "NEWS_REFRESH_COOLDOWN",
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
            code: "NAVER_UNAVAILABLE",
            message: "naver client not configured",
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([...(list as unknown[])]),
    });
  });
}
