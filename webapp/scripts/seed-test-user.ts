#!/usr/bin/env tsx
/**
 * E2E 테스트 유저 seeder — dev Supabase 프로젝트에 Playwright 용 고정 계정 1명을 멱등 생성.
 *
 * Phase 06.2 Plan 08 Task 2 자동화. VALIDATION.md Wave 0 요건.
 *
 * 실행:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   E2E_TEST_EMAIL=e2e@gh-radar.local \
 *   E2E_TEST_PASSWORD=... \
 *   pnpm exec tsx scripts/seed-test-user.ts
 *
 * 필수 환경변수:
 *   SUPABASE_URL                  - 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY     - service_role key (webapp runtime 에서 금지 — seeder 전용)
 *   E2E_TEST_PASSWORD             - 테스트 유저 비밀번호 (32자 이상 권장)
 *
 * 선택 환경변수:
 *   E2E_TEST_EMAIL                - 기본값 "e2e@gh-radar.local"
 *
 * 동작:
 *   - 유저가 이미 존재하면 skip (exit 0)
 *   - 존재하지 않으면 createUser({ email_confirm: true }) 후 출력 (exit 0)
 *   - 실패 시 에러 메시지 출력 + exit 1
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_TEST_EMAIL ?? "e2e@gh-radar.local";
const password = process.env.E2E_TEST_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error(
    "Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_PASSWORD",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error(`listUsers failed: ${listErr.message}`);
    process.exit(1);
  }

  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    console.log(`User exists: ${email} (id=${existing.id})`);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Tester" },
  });

  if (error) {
    console.error(`createUser failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Created: ${data.user?.id} <${email}>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
