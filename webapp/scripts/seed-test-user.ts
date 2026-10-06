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
 *   - 유저가 이미 존재하면 생성은 건너뛴다 (`User exists: …` 출력)
 *   - 존재하지 않으면 createUser({ email_confirm: true }) 후 출력 (`Created: …`)
 *   - 두 경로 모두 이어서 `app_users` 에 그 이메일(소문자 · 앞뒤 공백 제거)을 admin 으로 멱등 upsert 하고
 *     다시 읽어 `app_users: <email> = <role>` 한 줄을 출력한다 (exit 0)
 *   - 실패 시 에러 메시지 출력 + exit 1 (재조회 결과가 admin 이 아니어도 exit 1)
 *   - 출력은 이메일 · user id · 역할뿐 — 키 · 비밀번호는 출력하지 않는다
 *
 * Phase 29 D-20(개정) — e2e 계정 admin 은 이 스크립트만 부여한다(e2e 전용 경로 · 운영 마이그레이션에는
 * 테스트 신원이 없다). 없으면 middleware 역할 게이트가 e2e 를 /pending 으로 보낸다.
 * 되돌리기 = `app_users` 에서 그 이메일 행 삭제.
 * 표(`app_users`)는 Phase 29 마이그레이션(20261006200000_app_access)이 원격에 적용된 뒤에만 있다 —
 * 29-07 Task 2 의 push 전에 실행하면 upsert 단계에서 exit 1 로 끝난다.
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
  } else {
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

  await grantAdminRole();
}

/**
 * Phase 29 D-20(개정) — e2e 계정을 `app_users` admin 으로 멱등 upsert 한 뒤 다시 읽어 확인한다.
 * 표 CHECK 가 소문자 · btrim 을 요구하므로 키를 정규화한다.
 */
async function grantAdminRole() {
  const roleEmail = email.trim().toLowerCase();
  const hint =
    "app_users 표가 없으면 Phase 29 마이그레이션 원격 적용(29-07 Task 2 의 push) 뒤에 다시 실행하세요.";

  const { error: upsertErr } = await admin
    .from("app_users")
    .upsert({ email: roleEmail, role: "admin" }, { onConflict: "email" });
  if (upsertErr) {
    console.error(`app_users upsert failed: ${upsertErr.message}`);
    console.error(hint);
    process.exit(1);
  }

  const { data: row, error: readErr } = await admin
    .from("app_users")
    .select("email, role")
    .eq("email", roleEmail)
    .maybeSingle();
  if (readErr) {
    console.error(`app_users read-back failed: ${readErr.message}`);
    console.error(hint);
    process.exit(1);
  }
  if (!row || row.role !== "admin") {
    console.error(`app_users: ${roleEmail} = ${row?.role ?? "(none)"} — admin 이 아님`);
    process.exit(1);
  }

  console.log(`app_users: ${row.email} = ${row.role}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
