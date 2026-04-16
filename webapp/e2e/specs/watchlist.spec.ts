import { test, expect } from "@playwright/test";

import {
  cleanupWatchlists,
  createServiceClient,
  getTestUserId,
  seed50Watchlists,
} from "../fixtures/watchlist-seed";
import { mockWatchlistInsertFail } from "../fixtures/supabase-mock";

/**
 * Phase 06.2 Plan 08 Task 3.2 — watchlist.spec.ts.
 *
 * VALIDATION.md D5 (50 limit) + D7 (responsive breakpoint) + PERS-01 E2E 커버리지.
 *
 * 시나리오:
 *  - empty-state: cleanup → /watchlist 에 "아직 관심종목이 없습니다" 카피 + "스캐너로 가기" CTA
 *  - toggle-roundtrip: Scanner 에서 ⭐ 클릭 → /watchlist 에 반영
 *  - responsive-breakpoint (D7): lg+ Table 노출 / <lg Table 숨김
 *  - 50-limit (D5): 50 row seed → Scanner 에서 unset ⭐ 가 disabled + title
 *  - rollback-on-error: Supabase POST 500 mock → inline 에러 + aria-pressed=false 복귀
 *
 * 모든 테스트는 SUPABASE_SERVICE_ROLE_KEY 필요 (seed/cleanup). 미제공 시 skip.
 */

const E2E_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e@gh-radar.local";
const HAS_SERVICE_KEY = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("watchlist — CRUD + 반응형", () => {
  // seed/cleanup 순서 보존
  test.describe.configure({ mode: "serial" });

  test("empty state — 관심종목 없을 때 한글 카피 + CTA 노출", async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY 없음 — seed/cleanup 불가");
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupWatchlists(userId, admin);

    await page.goto("/watchlist");
    await expect(
      page.getByRole("heading", { name: "아직 관심종목이 없습니다" }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: /스캐너로 가기/ });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/scanner");
  });

  test("toggle-roundtrip — /scanner 에서 ⭐ 추가 → /watchlist 에 반영", async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY 없음");
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupWatchlists(userId, admin);

    await page.goto("/scanner");
    // Scanner 의 ⭐ 토글 — aria-label 은 "{종목명} 관심종목 추가"
    const firstToggle = page
      .getByRole("button", { name: /관심종목 추가/ })
      .first();
    await expect(firstToggle).toBeVisible({ timeout: 10_000 });
    await firstToggle.click();
    // optimistic 반영: aria-pressed=true
    await expect(firstToggle).toHaveAttribute("aria-pressed", "true", {
      timeout: 5_000,
    });

    await page.goto("/watchlist");
    // 최소 1 row 렌더 — Table (lg+) 또는 Card (<lg). 기본 viewport 는 Desktop Chrome.
    await expect(page.locator('[role="table"]').first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("responsive-breakpoint — lg+ Table 노출 / <lg Table 숨김 (D7)", async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY 없음");
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupWatchlists(userId, admin);
    // 1 row seed — Table/Card 각각 렌더 보장
    const { error: insertErr } = await admin
      .from("watchlists")
      .insert({ user_id: userId, stock_code: "005930", position: 0 });
    if (insertErr) throw insertErr;

    // Desktop 1280 — lg breakpoint (1024+) 이상 → Table 가시
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/watchlist");
    await expect(page.locator('[role="table"]')).toBeVisible({
      timeout: 5_000,
    });

    // Mobile 375 — lg 미만 → Table 은 hidden (class "hidden lg:block")
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await expect(page.locator('[role="table"]')).toBeHidden({
      timeout: 5_000,
    });
  });

  test("50-limit — 50 row seed 후 Scanner 의 unset ⭐ 가 disabled + title (D5)", async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY 없음 — 50-row seed 불가");
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupWatchlists(userId, admin);
    await seed50Watchlists(userId, admin);

    await page.goto("/scanner");
    // Scanner 의 unset ⭐ — seed 된 50 코드와 다를 것 (Scanner universe 는 별개 집합)
    // 첫 unset 토글을 찾아 disabled 상태 + title 한글 메시지 확인
    const unsetToggle = page
      .getByRole("button", { name: /관심종목 추가/ })
      .first();
    await expect(unsetToggle).toBeVisible({ timeout: 10_000 });
    await expect(unsetToggle).toBeDisabled();
    await expect(unsetToggle).toHaveAttribute(
      "title",
      "관심종목은 최대 50개까지 저장할 수 있습니다.",
    );
  });

  test("rollback-on-error — 네트워크 실패 시 optimistic 롤백 + inline 에러", async ({
    page,
  }) => {
    test.skip(!HAS_SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY 없음");
    const admin = createServiceClient();
    const userId = await getTestUserId(admin, E2E_EMAIL);
    await cleanupWatchlists(userId, admin);

    await mockWatchlistInsertFail(page);
    await page.goto("/scanner");
    const firstToggle = page
      .getByRole("button", { name: /관심종목 추가/ })
      .first();
    await expect(firstToggle).toBeVisible({ timeout: 10_000 });
    await firstToggle.click();

    // inline 에러 "관심종목 변경에 실패했습니다." (role=alert, 2초 후 자동 소거)
    await expect(page.getByRole("alert")).toContainText(
      "관심종목 변경에 실패했습니다",
      { timeout: 3_000 },
    );
    // rollback: aria-pressed 가 다시 false
    await expect(firstToggle).toHaveAttribute("aria-pressed", "false", {
      timeout: 3_000,
    });
  });
});
