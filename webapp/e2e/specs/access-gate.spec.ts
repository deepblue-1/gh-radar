import { test, expect } from "@playwright/test";

/**
 * Phase 29 Plan 12 — access-gate.spec.ts (역할 게이트 · 로그인 사용자 전용 · ADMIN-02).
 *
 * Playwright 프로젝트-레벨 `storageState: auth.json`(실 Supabase 로그인 세션)을 그대로 쓴다 — 미인증 경로는
 * auth-guards.spec.ts 소관이라 이 파일에 섞지 않는다(파일-레벨 storageState 경합 · 06.2-08).
 *
 * middleware 는 서버에서 실 `my_app_access()` RPC 를 부르므로 `page.route` 로 가로챌 수 없다. 그래서 이 스펙은
 * 29-07 의 e2e 전용 시드(`webapp/scripts/seed-test-user.ts` → `app_users: e2e@… = admin`)가 원격에 들어가
 * 있다는 전제 위에 선다(D-20 개정 — 운영 마이그레이션에는 테스트 신원이 없다). 시드가 빠지면 두 테스트 모두
 * 「승인 대기」 로 떨어져 실패한다 — 그게 이 스펙이 잡으려는 회귀다.
 *
 * 판정 표 전부(admin 접두 · viewer 차단 · 오류 fail-closed)는 단위 테스트
 * `src/lib/supabase/__tests__/access-gate.test.ts` 가 고정한다. 여기서는 실 RPC 왕복을 끝에서 끝까지 본다.
 */

test.describe("역할 게이트 — 승인된 admin(e2e 시드)", () => {
  test("P29-G1 승인된 사용자는 /pending 에서 홈으로", async ({ page }) => {
    await page.goto("/pending");
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
    await expect(page.getByText("관리자 승인을 기다리고 있어요")).toHaveCount(0);
  });

  test("P29-G2 admin 시드는 스캐너를 연다", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/scanner$/);
    await expect(page.getByText("관리자 승인을 기다리고 있어요")).toHaveCount(0);
  });
});
