import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 6 Wave 0 — E2E 설정.
 * - baseURL: http://localhost:3100 (Next dev)
 * - webServer: `pnpm dev` 자동 기동 (CI 외 reuseExistingServer=true)
 * - testDir: e2e/specs
 *
 * Phase 06.2 Plan 08 업데이트:
 * - `setup` project 가 Supabase REST 로 테스트 유저 세션을 생성 → storageState 저장
 * - `chromium` project 는 storageState 로드 후 로그인 상태로 테스트 실행
 *   (기존 4 spec search/stock-detail/smoke/a11y 전환 자동화 — RESEARCH §Pattern 11)
 */
const AUTH_FILE = './.playwright/auth.json';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    // 1) setup project — auth.setup.ts 가 storageState 를 생성
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.ts$/,
    },
    // 2) chromium project — setup 의존 + storageState 주입
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts$/,
    },
  ],
  webServer: {
    // PORT=3100 강제 — dev.sh 와 동일 (루트 규약). playwright 자체 webServer 부팅도 맞춤.
    command: 'PORT=3100 pnpm dev',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
