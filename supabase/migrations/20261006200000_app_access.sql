-- ============================================================
-- Phase 29 Plan 01 Task 1 — 허용 gmail · 역할 표 app_users · 본인 역할 RPC · is_theme_admin 흡수 · 운영 시드.
--
-- 결정 근거:
--   D-01  허용 목록은 로그인 뒤 전면 차단 — 판정은 webapp middleware 1곳(29-12)이 매 요청 my_app_access() 를
--         1회 부른다. 행이 없으면 NULL = 「승인 대기」.
--   D-02  역할 3단 admin · trader · viewer. 테마 운영자 권한은 admin 에 흡수 — is_theme_admin() 은 시그니처 ·
--         권한 · 정책 이름(admin_update_system_themes · admin_write_system_theme_stocks) 그대로 본문만 바꾼다.
--   D-03  허용 표의 키는 이메일(소문자 · 앞뒤 공백 없음). 사전 등록(가입 전 이메일)과 가입 대기 승인 둘 다
--         같은 행 모양이다 — auth.users 와 이메일로 매칭한다.
--   D-20  초기 시드(2026-10-06 개정본): alex@jx1.io · ezmesya@gmail.com = admin, dma_credentials 보유 기존
--         사용자 = trader, 나머지 기존 가입자 = 넣지 않음(승인 대기).
--         **운영 마이그레이션에 테스트 신원을 넣지 않는다.** e2e 계정의 admin 역할은 이 파일이 아니라
--         e2e 전용 경로 `webapp/scripts/seed-test-user.ts`(29-07 이 확장 · 사용자가 실행)가 부여한다.
--
-- 적용: additive — 29-07 [BLOCKING] 체크포인트에서 원격 적용. 옛 relay 는 이 표를 읽지 않으므로 무영향.
--   단, is_theme_admin() 본문이 바뀌므로 적용 순간부터 테마 편집 권한은 app_users.role = 'admin' 이 쥔다
--   (현 테마 운영자 ezmesya@gmail.com 은 시드 ⓐ 로 admin 이라 권한이 이어진다).
--
-- 멱등: CREATE TABLE IF NOT EXISTS · CREATE OR REPLACE FUNCTION · 시드 ON CONFLICT (email) DO NOTHING ·
--   권한 줄은 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서):
--   1. is_theme_admin() 을 20260610130000_theme_admin_overrides.sql 본문(theme_admins 조회)으로 CREATE OR REPLACE
--      (권한 줄 재명시) — theme_admins 표는 이 파일이 건드리지 않으므로 그대로 남아 있다.
--   2. DROP FUNCTION public.my_app_access()
--   3. public.app_users 표 제거(DROP)
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) — app_users 는 서비스롤 전용이다. 클라이언트는 본인 1행 RPC 로만 역할을 본다.
--   - theme_admins 삭제 — 롤백 경로다.
--   - JWT 커스텀 클레임 — 강등이 다음 요청부터 즉시여야 한다(D-04). 토큰 클레임은 만료까지 옛 역할을 싣는다.
-- ============================================================

BEGIN;

-- ── ① 허용 · 역할 표 (D-01 · D-02 · D-03) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.app_users (
  email      text        PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  role       text        NOT NULL CHECK (role IN ('admin','trader','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 서비스롤 전용: RLS 활성 + 접근 규칙 0개 = 모든 클라이언트 role default deny.
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_users FROM PUBLIC;
REVOKE ALL ON public.app_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO service_role;

-- ── ② 본인 역할 RPC (D-01 · D-04) ─────────────────────────────────
-- 본인 1행만 돌려준다(JWT 이메일 기준) — 행이 없으면 NULL = 승인 대기.
-- JWT 커스텀 클레임 대신 매 요청 이 RPC 를 부르는 이유: 강등 · 허용 해제가 다음 요청부터 즉시여야 한다(D-04).
CREATE OR REPLACE FUNCTION public.my_app_access()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.role
    FROM public.app_users a
   WHERE a.email = lower(auth.jwt() ->> 'email');
$$;
-- 플랫폼이 PUBLIC · anon 에 EXECUTE 를 auto-grant 한다 → 명시 REVOKE 후 authenticated 에만 GRANT.
REVOKE EXECUTE ON FUNCTION public.my_app_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_app_access() FROM anon;
GRANT  EXECUTE ON FUNCTION public.my_app_access() TO authenticated;

-- ── ③ 테마 운영자 흡수 (D-02) ─────────────────────────────────────
-- 시그니처 · LANGUAGE · SECURITY DEFINER · search_path 는 20260610130000 과 같고 본문만 바뀐다 → 정책
-- admin_update_system_themes · admin_write_system_theme_stocks 무수정.
-- theme_admins 표는 남긴다 — 롤백은 20260610130000 본문으로 CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.is_theme_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.app_users a
     WHERE a.email = lower(auth.jwt() ->> 'email')
       AND a.role = 'admin'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_theme_admin() TO authenticated;

-- ── ④ 운영 시드 (D-20 개정본 — 순서 고정) ──────────────────────────
-- ⓐ admin — 이 둘뿐이다. 테스트 신원은 넣지 않는다(e2e 전용 경로 seed-test-user.ts).
INSERT INTO public.app_users (email, role) VALUES
  ('alex@jx1.io', 'admin'),
  ('ezmesya@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- ⓑ trader — dma_credentials 를 가진 기존 가입자(데이터 기반 · 로컬 재생에서는 0행).
--   ⓐ 가 먼저라 admin 이 자격증명을 가져도 admin 으로 남는다. 그 밖 기존 가입자는 넣지 않는다(승인 대기).
INSERT INTO public.app_users (email, role)
SELECT DISTINCT lower(btrim(u.email)), 'trader'
  FROM public.dma_credentials c
  JOIN auth.users u ON u.id = c.user_id
 WHERE u.email IS NOT NULL
   AND btrim(u.email) <> ''
ON CONFLICT (email) DO NOTHING;

COMMIT;
