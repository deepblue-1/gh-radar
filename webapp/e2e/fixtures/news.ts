// Phase 07 — Playwright fixture: /api/stocks/:code/news* 라우트 mock.
// Phase 41 — 응답 줄은 shared `StockFeedItem` 하나다(server `GET /api/stocks/:code/news` · `GET /api/news/by-stock` 와 같은 타입).
// 옛 `NewsArticle` 모양(stockCode · createdAt)으로 두면 `kind` 가 없어 배지가 빈 칸이 되고, 링크 없는 줄 · 「공시」 배지 ·
// 자료원 줄을 실브라우저가 한 번도 지나가지 않는다(41-REVIEW WR-63) — `satisfies` 로 계약에 묶는다.
import type { Page } from "@playwright/test";
import type { NewsByStockResponse, StockFeedEntry, StockFeedItem } from "@gh-radar/shared";

export const NEWS_ITEM_SAMPLE = {
  id: "naver:a1b2",
  kind: "news",
  publishedAt: "2026-04-17T14:32:00.000+09:00",
  title: "삼성전자, 1분기 영업익 6.6조원 기록",
  source: "한국경제",
  stockCodes: ["005930"],
  url: "https://www.hankyung.com/article/202604170142",
  description: null,
  receivedAt: "2026-04-17T14:32:10.000+09:00",
} satisfies StockFeedItem;

/** 공시 — 원문 링크가 없다(`url: null` · D-20). 화면은 링크 아닌 글자 줄 · 「공시」 배지 · 거래소 자료원. */
export const DISCLOSURE_ITEM_SAMPLE = {
  id: "kis:2026041714300012345",
  kind: "disclosure",
  publishedAt: "2026-04-17T14:30:00.000+09:00",
  title: "삼성전자 단일판매ㆍ공급계약체결",
  source: "거래소 공시",
  stockCodes: ["005930"],
  url: null,
  description: null,
  receivedAt: "2026-04-17T14:30:05.000+09:00",
} satisfies StockFeedItem;

export function buildNewsList(code: string, n: number): StockFeedItem[] {
  return Array.from({ length: n }).map((_, i) => ({
    ...NEWS_ITEM_SAMPLE,
    id: `naver:news-${code}-${i}`,
    stockCodes: [code],
    title: `${NEWS_ITEM_SAMPLE.title} #${i}`,
  }));
}

/**
 * 작업대 뉴스·공시 묶음 조회 `GET /api/news/by-stock` mock(Phase 41 D-04). 코드별 글을 주고, 없는 코드는 빈 묶음(수집함 · 0건).
 * 작업대는 10초마다 이 조회를 부른다 — mock 이 없으면 dev 서버의 API 주소로 실요청이 나가 조용히 실패한다.
 */
export async function mockNewsByStockApi(
  page: Page,
  byCode: Record<string, StockFeedItem[]> = {},
): Promise<void> {
  await page.route("**/api/news/by-stock?**", (route) => {
    const url = new URL(route.request().url());
    const codes = (url.searchParams.get("codes") ?? "").split(",").filter((c) => c !== "");
    const stocks: StockFeedEntry[] = codes.map((code) => {
      const items = byCode[code] ?? [];
      return { code, collectedAt: "2026-04-17T14:33:00.000+09:00", count: items.length, truncated: false, items };
    });
    const body: NewsByStockResponse = { asOf: "2026-04-17T14:33:00.000+09:00", feedAt: null, stocks };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
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
