import { test, expect } from "@playwright/test";

/**
 * Phase 06.2 Plan 08 Task 3.1 — auth-guards.spec.ts (미인증 경로 전용).
 *
 * 파일-레벨 `test.use({ storageState })` 로 context 가 쿠키 없이 생성되도록
 * 강제한다 (describe-레벨은 worker reuse 환경에서 프로젝트-레벨 storageState
 * 와 경합하는 flake 가 관찰되어 파일 분리로 격리 — D2 Deferred 해소, 06.2-08 SUMMARY 참조).
 *
 * 검증:
 * - middleware-guard (D2): 미인증 /scanner, /watchlist → /login?next=<원본>
 * - public whitelist: "/" 루트는 미인증도 접근 가능 (200 유지 · /login 리다이렉트 없음)
 * - login error 파라미터 한글 메시지 + Google 버튼
 * - open-redirect 가드: /auth/callback, /login 의 `//attacker.com` next 차단
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("auth — 로그인 벽 + 리다이렉트 (미인증)", () => {
  test.beforeEach(async ({ context }) => {
    // 이중 방어: context.clearCookies() — 파일-레벨 storageState 외에
    // 워커 재사용 시 누수되는 쿠키까지 제거.
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

  test("public whitelist: 미인증 루트 / 는 200 으로 유지되고 /login 으로 튕기지 않는다", async ({
    page,
    baseURL,
  }) => {
    // `/` 는 PUBLIC_EXACT(`src/lib/supabase/middleware.ts`)라 미인증도 middleware 를 통과한다.
    // Phase 13 D-07 로 홈이 루트로 승격되면서 예전의 `/` → `/scanner` 서버사이드 이동이
    // 사라졌으므로, 지금 보장해야 할 것은 "리다이렉트되지 않고 그대로 렌더된다" 이다
    // (quick 260908-qnf · 이관 6 — 예전 서사 `/ → /scanner → /login` 단언을 현재 동작으로 교체).
    //
    // 홈의 **내용**은 여기서 단언하지 않는다 — 이 파일은 auth 가드 전용이고 `/api/home` 을
    // 목하지 않는다(내용 단언은 `home.spec.ts` 소관).
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("login page: ?error=auth_failed → 한글 alert", async ({ page }) => {
    await page.goto("/login?error=auth_failed");
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
    await page.goto("/auth/callback?code=fake-code&next=//attacker.com/steal");
    await expect(page).not.toHaveURL(/attacker/);
    await expect(page).toHaveURL(/\/(login|scanner)/);
  });

  test("open-redirect-guard: /login?next=//attacker.com 은 safeNext 로 치환", async ({
    page,
  }) => {
    await page.goto("/login?next=//attacker.com");
    // login 페이지 자체는 정상 렌더 — next 는 query string 에만 남고 리다이렉트 타겟으로 사용되지 않음
    await expect(
      page.getByRole("button", { name: /Google.*로그인|Google로 로그인/ }),
    ).toBeVisible();
    // 호스트가 attacker 로 변경되지 않아야 함 — URL 의 query 부분에 attacker 가 남는 것은 정상
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/login/);
  });
});
