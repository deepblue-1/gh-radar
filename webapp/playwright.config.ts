import fs from 'node:fs';
import path from 'node:path';
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
 *
 * Phase 15 Plan 14 업데이트:
 * - `.env.test.local` / `.env.local` 을 **허용 목록 기반**으로 읽어 들인다 (아래 참조)
 * - `NEXT_PUBLIC_RELAY_WS_URL` 을 webServer 에 주입한다 (relay E2E — 아래 참조)
 */
const AUTH_FILE = './.playwright/auth.json';

// ---------------------------------------------------------------------------
// 로컬 env 로드 — **허용 목록만** 넣는다
// ---------------------------------------------------------------------------

/**
 * `.env.test.local` 에서 이 프로세스로 들여올 키. **여기 없는 키는 들여오지 않는다.**
 *
 * 특히 `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` 은 의도적으로 제외한다 —
 * Playwright 의 `webServer` 는 부모 프로세스 env 를 그대로 물려주므로, 통째로 로드하면
 * **서비스롤 키가 Next dev 런타임에 주입**된다. SETUP.md §3 이 명시적으로 금지한 상황이고
 * (RLS 우회 위험), 시딩 스크립트가 아닌 곳에서는 필요하지도 않다.
 * 시딩(`scripts/seed-test-user.ts`)은 지금처럼 셸에서 직접 export 해 실행한다.
 */
const E2E_ENV_ALLOWLIST = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_API_BASE_URL',
  'E2E_TEST_EMAIL',
  'E2E_TEST_PASSWORD',
  'PLAYWRIGHT_BASE_URL',
] as const;

/** `KEY=VALUE` 한 줄짜리 형식만 읽는다(따옴표 제거·주석 무시). 의존성을 늘리지 않는다. */
function loadAllowlistedEnv(file: string): void {
  const abs = path.resolve(__dirname, file);
  if (!fs.existsSync(abs)) return;
  for (const line of fs.readFileSync(abs, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!(E2E_ENV_ALLOWLIST as readonly string[]).includes(key)) continue;
    // 셸에서 직접 export 한 값이 항상 우선한다.
    if (process.env[key] !== undefined && process.env[key] !== '') continue;
    process.env[key] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
}

loadAllowlistedEnv('.env.test.local');
loadAllowlistedEnv('.env.local');

/**
 * relay wss 주소 (Phase 15 D-41).
 *
 * `NEXT_PUBLIC_*` 은 **빌드 시점에 번들로 인라인**되므로 spec 이 런타임에 임의 포트를
 * 주입할 수 없다. 그래서 relay 포트를 고정 8090 으로 두고 그 URL 을 webServer 에 넘긴다.
 * `webapp/src/lib/relay-url.ts` 의 미설정 폴백도 같은 문자열이라, dev 서버를 재사용해
 * env 가 없는 경우에도 **같은 주소로 수렴**한다(reuseExistingServer 함정 제거).
 *
 * relay 프로세스 자체는 전역 webServer 가 아니라 **spec 단위 픽스처**가 띄운다
 * (`e2e/fixtures/relay.ts`). 전역에 넣으면 relay 와 무관한 spec 도 매번 relay 부팅을
 * 기다리고, 스텁 게이트웨이 상태를 spec 사이에서 공유하게 된다.
 */
const RELAY_WS_URL = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? 'ws://localhost:8090/ws';

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
    env: {
      NEXT_PUBLIC_RELAY_WS_URL: RELAY_WS_URL,
    },
  },
});
