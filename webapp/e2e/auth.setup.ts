import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Playwright setup project — Supabase REST 로 E2E 테스트 유저 세션을 획득하고
 * storageState 를 저장한다.
 *
 * Phase 06.2 Plan 08 Task 1. RESEARCH §Pattern 11 의 "storageState + REST seeding" 패턴.
 *
 * 전제:
 *   1. `scripts/seed-test-user.ts` 가 선행 실행되어 테스트 유저가 존재
 *   2. 환경변수: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *               E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *   3. Next dev server 가 기동 중 (playwright.config.ts webServer 자동)
 *
 * 결과:
 *   webapp/.playwright/auth.json 파일에 세션 쿠키 + origins 저장.
 *   projects.chromium.use.storageState 에서 이 파일을 로드하여 로그인 상태 유지.
 *
 * 쿠키 형식: `sb-<project-ref>-auth-token` (supabase/ssr 0.10.x, 단일 non-chunked).
 */

const AUTH_FILE = path.resolve(__dirname, "../.playwright/auth.json");

setup("authenticate E2E user", async ({ page, request }) => {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_TEST_EMAIL ?? "e2e@gh-radar.local";
  const password = process.env.E2E_TEST_PASSWORD;

  if (!url || !anonKey || !password) {
    throw new Error(
      "E2E auth env vars missing: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_TEST_PASSWORD",
    );
  }

  // 1. Supabase REST grant_type=password 로 세션 획득
  const res = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    data: { email, password },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `Supabase token request failed: ${res.status()} ${body.slice(0, 300)}`,
    );
  }

  const session = await res.json();
  expect(session).toHaveProperty("access_token");
  expect(session).toHaveProperty("refresh_token");

  // 2. Supabase 쿠키 이름 조립 — URL 의 project ref (호스트명 첫 subdomain)
  const projectRef = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  // supabase/ssr 0.10.x 기본 `cookieEncoding="base64url"` — 쿠키 값은
  // `base64-<base64url(JSON)>` 형태. reader 는 `base64-` prefix 유무로 분기 처리.
  // 여기서는 안정적으로 공식 포맷을 사용한다.
  const b64 = Buffer.from(JSON.stringify(session), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const cookieValue = `base64-${b64}`;

  // 3. baseURL 호스트 기준으로 쿠키 심기
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const domain = new URL(baseURL).hostname;

  await page.context().addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain,
      path: "/",
      sameSite: "Lax",
      httpOnly: false,
    },
  ]);

  // 4. storageState 저장 — projects.chromium.use.storageState 에서 로드
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
