import type { Page } from "@playwright/test";

/**
 * Supabase REST 라우트 인터셉터 helper — Phase 06.2 Plan 08 Task 3.
 *
 * Playwright route 로 브라우저에서 나가는 Supabase REST 호출을 가로채 실패 시나리오를
 * 재현한다. E2E 유저의 실제 DB 상태를 건드리지 않고 optimistic rollback 경로만 검증.
 */

/**
 * watchlists POST 를 500 Internal Server Error 로 실패시킴.
 *
 * 용도: WatchlistToggle 의 "기타 에러 → FAIL_MESSAGE + rollback" 경로 테스트.
 * (P0001/23505 외 에러는 "관심종목 변경에 실패했습니다." 로 처리됨.)
 */
export async function mockWatchlistInsertFail(page: Page): Promise<void> {
  await page.route("**/rest/v1/watchlists*", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "internal" }),
      });
    }
    return route.continue();
  });
}
