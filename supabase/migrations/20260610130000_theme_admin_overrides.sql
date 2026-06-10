-- Phase 10 후속 — 시스템 테마 admin 편집 + worker 재동기화 종목단위 오버라이드.
--
-- 배경: 시스템 테마는 매일 16:00 KST worker(service_role)가 재동기화한다. 운영자가
-- 시스템 테마를 편집(종목 가감/테마 삭제)해도 다음 사이클이 덮어쓰던 문제를 해결한다.
--
-- 모델 (사용자 확정 — freeze 아님, 종목 단위 수동 오버라이드):
--   theme_stocks.manual_override
--     NULL       = sync 관리 (기본; 기존 행·worker 작성 행 모두 auto)
--     'included' = 운영자가 추가/고정 — worker 가 retire 하지 않음
--     'excluded' = 운영자가 제외 — worker 가 (네이버 재스크랩해도) 되살리지 않음
--   themes.hidden = true → soft-delete(tombstone). norm_key 슬롯을 유지해 worker 의
--     findSystemThemeId 가 계속 찾게 하여 재생성(INSERT)을 막는다. 공개 read 에서 제외.
--
-- 권한: admin 허용목록(theme_admins) + SECURITY DEFINER is_theme_admin(). admin 쓰기는
-- webapp → Supabase 직접(RLS 게이트). Express 에는 auth 가 없으므로 경유하지 않는다.

BEGIN;

-- 1) theme_stocks: 종목 단위 수동 오버라이드 -----------------------------------
ALTER TABLE theme_stocks
  ADD COLUMN manual_override text
    CHECK (manual_override IN ('included', 'excluded'));
-- 컬럼 기본값 NULL → 기존 행은 자동으로 sync 관리(auto). 백필 불필요.

-- worker 가 사이클마다 테마별 override 행을 조회(Edit B/C). override 가 있는 행만 인덱스.
CREATE INDEX idx_theme_stocks_override
  ON theme_stocks (theme_id) WHERE manual_override IS NOT NULL;

-- 2) themes: soft-delete(hide). tombstone 으로 norm_key 슬롯 유지 → worker 재생성 차단.
ALTER TABLE themes ADD COLUMN hidden boolean NOT NULL DEFAULT false;
-- 불변식: hidden tombstone 도 is_system=true, owner_id=NULL 유지 →
--   themes_owner_consistency CHECK 통과 + uq_themes_system_norm(norm_key WHERE is_system)
--   유니크 슬롯 유지. 이 유니크/findSystemThemeId 가 hidden 을 무시하면 재생성되므로 금지.

-- 3) admin 허용목록 + 헬퍼 ------------------------------------------------------
CREATE TABLE theme_admins (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE theme_admins ENABLE ROW LEVEL SECURITY;
-- 정책 없음 → anon/authenticated 접근 전면 차단. service_role(RLS 우회)과 아래
-- SECURITY DEFINER 함수만 읽는다(허용목록 이메일 비밀 유지 — 자기노출 트랩 회피).

-- 현재 JWT 이메일이 admin 허용목록에 있는가? theme_admins deny-all 을 넘어 읽도록 DEFINER.
CREATE OR REPLACE FUNCTION public.is_theme_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM theme_admins a
    WHERE a.email = (auth.jwt() ->> 'email')
  );
$$;
-- 플랫폼이 PUBLIC 에 EXECUTE auto-grant → REVOKE 후 authenticated 에만 GRANT.
REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_theme_admin() TO authenticated;

-- 4) admin write 정책: themes (system 테마 hide/rename 만, is_system/owner 위조 차단) ----
-- 의도적으로 INSERT/DELETE 미부여: 생성은 worker 전담, "삭제"는 hidden=true(UPDATE).
-- hard DELETE 는 norm_key tombstone 을 제거해 worker 재생성을 유발하므로 허용하지 않는다.
CREATE POLICY "admin_update_system_themes" ON themes
  FOR UPDATE TO authenticated
  USING (is_system = true AND public.is_theme_admin())
  WITH CHECK (is_system = true AND owner_id IS NULL AND public.is_theme_admin());

-- 5) admin write 정책: theme_stocks (system 테마 멤버 INSERT/UPDATE/DELETE) ----------
CREATE POLICY "admin_write_system_theme_stocks" ON theme_stocks
  FOR ALL TO authenticated
  USING (
    public.is_theme_admin()
    AND EXISTS (SELECT 1 FROM themes t WHERE t.id = theme_id AND t.is_system = true)
  )
  WITH CHECK (
    public.is_theme_admin()
    AND EXISTS (SELECT 1 FROM themes t WHERE t.id = theme_id AND t.is_system = true)
  );

-- 6) hidden 테마를 public read 에서 제외 (TO anon, authenticated 둘 다 — default-deny 함정) ----
DROP POLICY "read_system_themes" ON themes;
CREATE POLICY "read_system_themes" ON themes
  FOR SELECT TO anon, authenticated
  USING (is_system = true AND hidden = false);

-- 7) 운영자 시드 (소유자 이메일) ------------------------------------------------
INSERT INTO theme_admins(email) VALUES ('ezmesya@gmail.com') ON CONFLICT DO NOTHING;

COMMIT;
