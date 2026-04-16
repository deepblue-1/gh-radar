import { test, expect } from "@playwright/test";

/**
 * Phase 06.2 Plan 08 Task 3.1 — auth.spec.ts.
 *
 * VALIDATION.md D1 / D2 + 06.2-03 open-redirect 가드를 E2E 로 검증.
 *
 * 1. middleware-guard (D2): 미인증 /scanner, /watchlist → /login?next=<원본>
 * 2. public whitelist: "/" 루트는 미인증도 접근 가능
 * 3. login error 파라미터 한글 메시지 (4종 중 2종 + Google 버튼 표시)
 * 4. open-redirect 가드: /auth/callback, /login 의 `//attacker.com` next 차단
 * 5. 로그인 상태에서 /login 접근 → /scanner 리다이렉트 (D-12)
 * 6. AppSidebar nav / UserSection 팝오버 노출
 */

test.describe("auth — 로그인 벽 + 리다이렉트 (미인증)", () => {
  // 이 describe 블록은 storageState 를 비워 middleware 가드를 실제 경험.
  // `test.use({ storageState: {...} })` + `beforeEach` 에서 쿠키 강제 clear — 이중 방어.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("middleware-guard: 미인증 /scanner → /login?next=%2Fscanner", async ({
    page,
  }) => {
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/login\?next=%2Fscanner/);
  });

  test("middleware-guard: 미인증 /watchlist → /login?next=%2Fwatchlist", async ({
    page,
  }) => {
    await page.goto("/watchlist");
    await expect(page).toHaveURL(/\/login\?next=%2Fwatchlist/);
  });

  test("public whitelist: 루트 / 는 미인증도 접근 가능", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("login page: ?error=auth_failed → 한글 alert", async ({ page }) => {
    await page.goto("/login?error=auth_failed");
    // Next.js 가 `__next-route-announcer__` 도 role=alert 로 띄움 → Card 내부 alert 만 선택
    await expect(
      page.getByText("로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요."),
    ).toBeVisible();
  });

  test("login page: ?error=oauth_denied → 한글 alert", async ({ page }) => {
    await page.goto("/login?error=oauth_denied");
    await expect(
      page.getByText(/Google 로그인을 취소하셨습니다/),
    ).toBeVisible();
  });

  test("login page: Google 로그인 버튼 노출", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Google.*로그인|Google로 로그인/ }),
    ).toBeVisible();
  });

  test("open-redirect-guard: /auth/callback?next=//attacker.com 거부", async ({
    page,
  }) => {
    // code=fake 는 exchangeCodeForSession 실패 → /login?error=auth_failed 로 귀결.
    // 핵심은 최종 URL 이 attacker 도메인 이 아닐 것 + login or scanner fallback 에 안착.
    await page.goto("/auth/callback?code=fake-code&next=//attacker.com/steal");
    await expect(page).not.toHaveURL(/attacker/);
    await expect(page).toHaveURL(/\/(login|scanner)/);
  });

  test("open-redirect-guard: /login?next=//attacker.com 은 safeNext 로 치환", async ({
    page,
  }) => {
    await page.goto("/login?next=//attacker.com");
    // login 페이지 자체는 정상 렌더 (safeNext 는 내부 state 로만 사용)
    await expect(
      page.getByRole("button", { name: /Google.*로그인|Google로 로그인/ }),
    ).toBeVisible();
    // 자동으로 attacker 로 튕겨나가지 않음
    await expect(page).not.toHaveURL(/attacker/);
  });
});

test.describe("auth — 로그인된 사용자 (storageState 기본)", () => {
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
    // 트리거 버튼 (aria-haspopup="menu") — 이름은 displayName (E2E Tester) 또는 fallback "사용자"
    const trigger = page
      .getByRole("button", { name: /E2E Tester|사용자/ })
      .first();
    await trigger.click();
    // 로그아웃 버튼은 팝오버 내부에 aria-label="로그아웃"
    await expect(
      page.getByRole("button", { name: "로그아웃" }),
    ).toBeVisible();
  });
});
