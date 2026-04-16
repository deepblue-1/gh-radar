import { test, expect } from "@playwright/test";

/**
 * Phase 06.2 Plan 08 Task 3.1 — auth-session.spec.ts (인증된 사용자 전용).
 *
 * Playwright 프로젝트-레벨 `storageState: auth.json` 을 그대로 사용 (파일에서
 * override 하지 않음). 미인증 케이스는 auth-guards.spec.ts 로 분리되어 storageState
 * 경합 flake 를 해소 (06.2-08 SUMMARY Deferred Issues 참조).
 *
 * 검증:
 * - 로그인 상태로 /login 접근 → /scanner 리다이렉트 (D-12)
 * - AppSidebar nav (스캐너 / 관심종목)
 * - UserSection 팝오버 + 로그아웃 버튼
 */

test.describe("auth — 로그인된 사용자", () => {
  test("로그인 상태로 /login 접근 → /scanner 리다이렉트 (D-12)", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/scanner/);
  });

  test("AppSidebar 주 메뉴: 스캐너 + 관심종목 링크 노출", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page.getByRole("link", { name: /스캐너/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /관심종목/ })).toBeVisible();
  });

  test("UserSection 팝오버: 트리거 클릭 → 로그아웃 버튼 노출", async ({
    page,
  }) => {
    await page.goto("/scanner");
    const trigger = page
      .getByRole("button", { name: /E2E Tester|사용자/ })
      .first();
    await trigger.click();
    await expect(
      page.getByRole("button", { name: "로그아웃" }),
    ).toBeVisible();
  });
});
