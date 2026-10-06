-- ============================================================
-- Phase 29 Plan 01 Task 1 — 허용 · 역할 표 app_users pgTAP (D-01 · D-02 · D-03 · D-20 개정본).
--
-- 잠그는 것:
--   - 운영 시드: 재생 직후 app_users = 정확히 admin 2행(alex@jx1.io · ezmesya@gmail.com) — 테스트 신원 · 그 밖 행 없음
--     (D-20 개정 — e2e 계정 역할은 webapp/scripts/seed-test-user.ts 가 부여한다)
--   - trader 시드 문: dma_credentials 보유 가입자 → trader · admin 시드 이메일은 자격증명이 있어도 admin 유지 ·
--     자격증명 없는 가입자는 행 없음(승인 대기) · 재실행해도 행 수 불변(멱등)
--   - 스키마: 이메일 소문자 PK CHECK · 역할 CHECK(admin/trader/viewer)
--   - 잠금: RLS 활성 · 정책 0개 · anon/authenticated 표 권한 없음
--   - RPC: my_app_access() = JWT 이메일(대소문자 무관) 본인 역할 또는 NULL · anon EXECUTE 없음 · authenticated 있음
--   - D-02 흡수: is_theme_admin() = app_users.role = 'admin' · 테마 정책 2개 이름 그대로 · theme_admins 표 남음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/app_access.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (이메일, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(30);

-- ── 첫 단언 — 픽스처 삽입 전 · 재생 직후 운영 시드 ─────────────────
SELECT is(
  (SELECT array_agg(email ORDER BY email) FROM public.app_users),
  ARRAY['alex@jx1.io','ezmesya@gmail.com'],
  '(재생 직후, 운영 시드 = admin 2행뿐 — 테스트 신원 · 그 밖 행 없음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.app_users WHERE role = 'admin'),
  2, '(재생 직후, admin 2 — alex · ezmesya)'
);

-- ── 스키마 · 잠금 ────────────────────────────────────────────────
SELECT has_table('public', 'app_users', '(app_users, 표 존재)');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_users'::regclass),
  true, '(app_users, RLS 켜짐)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_users'),
  0, '(app_users, 정책 0개 — 서비스롤 전용)'
);
SELECT is(has_table_privilege('anon', 'public.app_users', 'SELECT'), false, '(anon, app_users SELECT 없음)');
SELECT is(has_table_privilege('authenticated', 'public.app_users', 'SELECT'), false, '(authenticated, app_users SELECT 없음)');
SELECT is(has_table_privilege('authenticated', 'public.app_users', 'INSERT'), false, '(authenticated, app_users INSERT 없음)');
SELECT is(has_table_privilege('service_role', 'public.app_users', 'SELECT'), true, '(service_role, app_users SELECT 있음)');

-- ── 픽스처: auth.users 3명 + 자격증명 2행 ─────────────────────────
-- admin 시드 이메일(자격증명도 보유 — admin 유지 검증) · trader 후보 · 자격증명 없는 가입자.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002901', 'alex@jx1.io'),
  ('00000000-0000-4000-8000-000000002902', 't29-trader@example.invalid'),
  ('00000000-0000-4000-8000-000000002903', 't29-pending@example.invalid');

INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000002901', 't29adm', 'test-enc-admin'),
  ('00000000-0000-4000-8000-000000002902', 't29trd', 'test-enc-trader');

-- 시드 ⓑ 는 재생 시점(빈 auth.users)에 이미 돌았다 — 마이그레이션과 같은 문을 다시 실행한다.
INSERT INTO public.app_users (email, role)
SELECT DISTINCT lower(btrim(u.email)), 'trader'
  FROM public.dma_credentials c
  JOIN auth.users u ON u.id = c.user_id
 WHERE u.email IS NOT NULL
   AND btrim(u.email) <> ''
ON CONFLICT (email) DO NOTHING;

SELECT is(
  (SELECT role FROM public.app_users WHERE email = 't29-trader@example.invalid'),
  'trader', '(t29-trader@example.invalid, 자격증명 보유 → trader)'
);
SELECT is(
  (SELECT role FROM public.app_users WHERE email = 'alex@jx1.io'),
  'admin', '(alex@jx1.io, 자격증명이 있어도 admin 유지 — 시드 ⓐ 먼저)'
);
SELECT is(
  (SELECT count(*)::int FROM public.app_users WHERE email = 't29-pending@example.invalid'),
  0, '(t29-pending@example.invalid, 자격증명 없음 → 행 없음 = 승인 대기)'
);

CREATE TEMP TABLE t_count AS SELECT count(*)::int AS n FROM public.app_users;
INSERT INTO public.app_users (email, role)
SELECT DISTINCT lower(btrim(u.email)), 'trader'
  FROM public.dma_credentials c
  JOIN auth.users u ON u.id = c.user_id
 WHERE u.email IS NOT NULL
   AND btrim(u.email) <> ''
ON CONFLICT (email) DO NOTHING;
SELECT is(
  (SELECT count(*)::int FROM public.app_users),
  (SELECT n FROM t_count),
  '(trader 시드 두 번째 실행, 행 수 불변 — 멱등)'
);

-- ── 본인 역할 RPC ────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"email":"ALEX@JX1.IO"}', true);
SELECT is(public.my_app_access(), 'admin', '(ALEX@JX1.IO, my_app_access = admin — 대소문자 무관)');
SELECT is(public.is_theme_admin(), true, '(ALEX@JX1.IO, is_theme_admin = true)');

SELECT set_config('request.jwt.claims', '{"email":"ezmesya@gmail.com"}', true);
SELECT is(public.is_theme_admin(), true, '(ezmesya@gmail.com, is_theme_admin = true — 현 테마 운영자 권한 이어짐)');

SELECT set_config('request.jwt.claims', '{"email":"t29-trader@example.invalid"}', true);
SELECT is(public.my_app_access(), 'trader', '(t29-trader@example.invalid, my_app_access = trader)');
SELECT is(public.is_theme_admin(), false, '(t29-trader@example.invalid, is_theme_admin = false)');

SELECT set_config('request.jwt.claims', '{"email":"t29-pending@example.invalid"}', true);
SELECT is(public.my_app_access(), NULL::text, '(t29-pending@example.invalid, my_app_access = NULL — 승인 대기)');
SELECT is(public.is_theme_admin(), false, '(t29-pending@example.invalid, is_theme_admin = false)');

SELECT set_config('request.jwt.claims', '{}', true);
SELECT is(public.my_app_access(), NULL::text, '(이메일 없는 JWT, my_app_access = NULL)');

SELECT is(has_function_privilege('anon', 'public.my_app_access()', 'EXECUTE'), false, '(anon, my_app_access EXECUTE 없음)');
SELECT is(has_function_privilege('authenticated', 'public.my_app_access()', 'EXECUTE'), true, '(authenticated, my_app_access EXECUTE 있음)');
SELECT is(has_function_privilege('anon', 'public.is_theme_admin()', 'EXECUTE'), false, '(anon, is_theme_admin EXECUTE 없음)');
SELECT is(has_function_privilege('authenticated', 'public.is_theme_admin()', 'EXECUTE'), true, '(authenticated, is_theme_admin EXECUTE 있음)');

-- ── D-02 흡수 회귀 — 정책 이름 · theme_admins 표 그대로 ─────────────
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('admin_update_system_themes', 'admin_write_system_theme_stocks')),
  2, '(테마 정책 2개, 이름 무변경)'
);
SELECT has_table('public', 'theme_admins', '(theme_admins, 표 남음 — 롤백 경로)');

-- ── CHECK ────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.app_users (email, role) VALUES ('t29-badrole@example.invalid', 'owner')$$,
  '23514', NULL, '(t29-badrole@example.invalid, 역할 owner → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.app_users (email, role) VALUES ('T29-Upper@example.invalid', 'viewer')$$,
  '23514', NULL, '(T29-Upper@example.invalid, 대문자 이메일 → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.app_users (email, role) VALUES (' t29-space@example.invalid', 'viewer')$$,
  '23514', NULL, '( t29-space@example.invalid, 앞 공백 이메일 → CHECK 위반)'
);

SELECT * FROM finish(true);

ROLLBACK;
