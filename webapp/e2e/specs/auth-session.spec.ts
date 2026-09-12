import { test, expect } from "@playwright/test";

/**
 * Phase 06.2 Plan 08 Task 3.1 — auth-session.spec.ts (인증된 사용자 전용).
 *
 * Playwright 프로젝트-레벨 `storageState: auth.json` 을 그대로 사용 (파일에서
 * override 하지 않음). 미인증 케이스는 auth-guards.spec.ts 로 분리되어 storageState
 * 경합 flake 를 해소 (06.2-08 SUMMARY Deferred Issues 참조).
 *
 * 검증:
 * - 로그인 상태로 /login 접근 → 홈(/) 리다이렉트 (D-12)
 * - AppSidebar nav (상승률 상위 / 관심종목)
 * - UserSection 팝오버 + 로그아웃 버튼
 */

test.describe("auth — 로그인된 사용자", () => {
  /*
    ★ 260912-ok2 — **착지점이 바뀐 자리다. 화면(middleware)이 정본이고 단언을 옮긴다.**
      260911-tuk 이 홈을 로그인 필수로 바꾸면서 D-12 의 착지점이 `/scanner` → `/` 가 됐다.
      근거는 `src/lib/supabase/middleware.ts` 의 그 자리 주석이다 — 「홈이 인증 표면이
      됐으므로 로그인 직후 착지점은 홈이다」. 옛 단언은 그 순간부터 거짓이었다.
      잠그던 것(로그인 사용자가 로그인 화면에 머물지 않는다 = 루프 방지)은 그대로다.
    ★ 이 파일은 계획이 열거한 6개 스펙 밖이지만, 전량 실행에서 **7번째 선재 실패**로
      드러났다. 숨기면 「실패 0」이 거짓이 되므로 같은 규율로 함께 옮긴다.
  */
  test("로그인 상태로 /login 접근 → 홈(/) 리다이렉트 (D-12)", async ({
    page,
  }) => {
    await page.goto("/login");
    // 홈 정확히 — `/scanner` 같은 다른 착지점이면 붙잡는다(`$` 가 그 일을 한다).
    await expect(page).toHaveURL(/\/$/);
    // 로그인 화면에 머물지 않는다 = 루프 방지. 옛 단언이 잠그던 것이 이것이다.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("AppSidebar 주 메뉴: 상승률 상위 + 관심종목 링크 노출", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page.getByRole("link", { name: /상승률 상위/ })).toBeVisible();
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
