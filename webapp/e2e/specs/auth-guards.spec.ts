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
 * - middleware-guard (Phase 16): 미인증 /trading/limit-chaser/new, /trading/vi, /me → 동일
 * - middleware-guard (quick 260911-tuk): 미인증 루트 "/" 도 → /login?next=%2F (공개 exact 경로 없음)
 * - login error 파라미터 한글 메시지 + Google 버튼
 * - open-redirect 가드: /auth/callback, /login 의 `//attacker.com` next 차단
 *
 * ★ **로그인 + DMA 매핑 없음** 경로(= `data-slot="dma-gate"`)는 이 파일에 두지 않는다.
 *   그 경로는 relay wss 가 `unauthorized` 를 확정해야 성립하므로 로컬 relay 프로세스가
 *   필요하고, 이 파일은 파일-레벨 `storageState` 로 **쿠키 없는 context** 를 강제한다
 *   (아래 주석 참조 — describe-레벨 override 는 워커 재사용에서 경합한다).
 *   해당 검증은 이미 relay 를 소유한 `sidebar-tree.spec.ts` 가 3라우트 전부에 대해 한다.
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

  /**
   * Phase 16 — 트레이딩·My page 3라우트도 같은 벽 뒤에 있다.
   *
   * 사이드바가 이 항목들을 숨기는 것은 **오진입 방지**일 뿐이다(T-16-04). 주소창으로
   * 직접 들어오는 경로가 진짜 표면이고, 그 앞은 middleware 가 막는다. 숨김만 믿고
   * 이 단언을 빼면 「메뉴에 없으니 안전하다」는 착각이 코드에 남는다.
   */
  for (const path of ["/trading/limit-chaser/new", "/trading/vi", "/me"]) {
    test(`middleware-guard: 미인증 ${path} → /login?next=${encodeURIComponent(path)}`, async ({
      page,
    }) => {
      await page.goto(path);
      // `next` 는 **한 번만** 인코딩된다 — `%2F...`. 정규식에서 `%` 는 메타문자가 아니다.
      await expect(page).toHaveURL(
        new RegExp(`/login\\?next=${encodeURIComponent(path)}$`),
      );
    });
  }

  test("middleware-guard: 미인증 /trading/limit-chaser 는 redirect 이전에 로그인 벽에 막힌다", async ({
    page,
  }) => {
    // `/trading/limit-chaser` 는 `/new` 로 서버 redirect 하는 라우트지만, middleware 가
    // 먼저 돈다 — 비로그인에게 리다이렉트 체인을 보여 주지 않는다.
    await page.goto("/trading/limit-chaser");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("middleware-guard: 미인증 루트 / → /login?next=%2F", async ({ page }) => {
    // `middleware.ts` 에 공개 exact 경로가 더 이상 없다 — 공개 판정은 `PUBLIC_PREFIXES`
    // (`/login`·`/auth`) 하나뿐이라 홈도 나머지 보호 경로와 **같은 벽 뒤**에 있다
    // (quick 260911-tuk — 예전 "public whitelist: 루트는 200 유지" 단언을 뒤집었다).
    //
    // 홈의 **내용**은 여기서 단언하지 않는다 — 이 파일은 auth 가드 전용이고 `/api/home` 을
    // 목하지 않는다(내용 단언은 `home.spec.ts` 소관).
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
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
