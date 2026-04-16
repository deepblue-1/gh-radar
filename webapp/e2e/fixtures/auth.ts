/**
 * Playwright 인증 fixture — storageState 는 playwright.config.ts 의
 * `projects.chromium.use.storageState` 에서 프로젝트 레벨로 자동 주입되므로,
 * 이 파일은 `@playwright/test` 의 test/expect 를 그대로 re-export 한다.
 *
 * 사용법:
 *   import { test, expect } from "../fixtures/auth";
 *
 * 로그인 상태가 필요 없는 (or 직접 빈 storageState 를 쓰고 싶은) 스펙은
 *   test.use({ storageState: { cookies: [], origins: [] } });
 * 로 override 한다 (예: auth.spec.ts 의 미인증 가드 테스트).
 */
export { test, expect } from "@playwright/test";
