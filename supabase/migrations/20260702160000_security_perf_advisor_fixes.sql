-- Security/Performance Advisor 정리 (2026-07-02 대시보드 점검)
--
-- 1) SECURITY DEFINER RPC 노출 축소 — 플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮어쓰므로
--    anon/authenticated 를 명시 REVOKE (Phase 11 교훈).
--    - incr_api_usage: server/workers 의 service_role 전용 (클라이언트 호출 없음)
--    - rls_auto_enable: 마이그레이션 유틸 (클라이언트 호출 없음)
--    - is_theme_admin: webapp 이 authenticated 로 rpc() 호출 → authenticated 는 유지, anon 만 차단
-- 2) Function Search Path Mutable — 고정 안 된 함수 4개에 search_path 고정.
-- 3) Auth RLS Initialization Plan — auth.uid() 를 (select auth.uid()) 로 감싸 per-row
--    재평가를 initplan 1회 평가로 (watchlists/themes/theme_stocks 10개 정책).
-- 4) Unindexed FK — news_articles/watchlists FK 인덱스.
--
-- 참고: "RLS Enabled No Policy" INFO 3건(api_usage/kiwoom_tokens/theme_admins)은 서버 전용
-- 테이블의 의도된 default-deny(service_role 만 접근) — 정책을 추가하지 않는 것이 맞다.

-- ─────────────────────────────────────────────────────────────
-- 0) rls_auto_enable() 정의 보정 (2026-09-08 quick 260908-qnf · 이관 5)
-- ─────────────────────────────────────────────────────────────
-- 이 함수는 Supabase 대시보드에서 직접 만들어져 마이그레이션 이력에 CREATE 가 없었다.
-- 그 결과 아래 REVOKE 3줄이 "존재하지 않는 함수" 를 참조해, 빈 DB 에서 이력을 처음부터
-- 재생하면 여기서 멈춘다(재해복구·신규 스테이징이 막힌 상태였다).
--
-- 배치를 이 파일 안 REVOKE 앞으로 정한 이유:
--   ① REVOKE 보다 앞에 와야 빈 DB 재생이 성립한다.
--   ② 이 파일은 이미 원격에 적용돼 있다(`supabase migration list` 로 확인). `db push` 는
--      버전(파일명)만 비교하므로 본문을 다시 실행하지 않는다 → production 영향 0.
--   ③ `20260702155900_*.sql` 같은 더 이른 타임스탬프의 새 파일을 끼우면, 이후 모든
--      `db push` 가 "원격 마지막 마이그레이션보다 앞선 로컬 파일" 로 막혀 `--include-all`
--      을 요구하는 함정을 남긴다.
--
-- 본문은 2026-09-08 `supabase db dump --linked --schema public` 실측 덤프를 글자 그대로
-- 옮긴 것이다(`CREATE OR REPLACE` 라 임의 작성은 다음 push 때 production 함수를 덮어쓴다).
-- 짝이 되는 EVENT TRIGGER 객체는 클러스터 레벨이라 여기에 넣지 않는다 — 마이그레이션에서
-- `CREATE EVENT TRIGGER` 를 시도하면 실제 Supabase 대상에서 권한 오류로 실패한다.
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 1) SECURITY DEFINER RPC REVOKE
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.incr_api_usage(text, date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.incr_api_usage(text, date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.incr_api_usage(text, date, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM anon;
-- authenticated 유지 — webapp use-is-theme-admin 훅이 rpc('is_theme_admin') 호출.

-- ─────────────────────────────────────────────────────────────
-- 2) search_path 고정 (advisor: Function Search Path Mutable)
--    함수 본문의 unqualified 테이블 참조 호환을 위해 public 고정.
-- ─────────────────────────────────────────────────────────────
ALTER FUNCTION public.enforce_watchlist_limit() SET search_path = public;
ALTER FUNCTION public.intraday_upsert_close(jsonb) SET search_path = public;
ALTER FUNCTION public.intraday_upsert_ohlc(jsonb) SET search_path = public;
ALTER FUNCTION public.limit_up_price(numeric) SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 3) RLS InitPlan — auth.uid() → (select auth.uid())
-- ─────────────────────────────────────────────────────────────
-- watchlists
ALTER POLICY auth_select_own_watchlists ON public.watchlists
  USING ((select auth.uid()) = user_id);
ALTER POLICY auth_insert_own_watchlists ON public.watchlists
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY auth_update_own_watchlists ON public.watchlists
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY auth_delete_own_watchlists ON public.watchlists
  USING ((select auth.uid()) = user_id);

-- themes
ALTER POLICY read_own_themes ON public.themes
  USING (owner_id = (select auth.uid()));
ALTER POLICY insert_own_themes ON public.themes
  WITH CHECK ((owner_id = (select auth.uid())) AND (is_system = false));
ALTER POLICY update_own_themes ON public.themes
  USING ((owner_id = (select auth.uid())) AND (is_system = false))
  WITH CHECK ((owner_id = (select auth.uid())) AND (is_system = false));
ALTER POLICY delete_own_themes ON public.themes
  USING ((owner_id = (select auth.uid())) AND (is_system = false));

-- theme_stocks (EXISTS 서브쿼리 내부도 동일하게 initplan 화)
ALTER POLICY read_theme_stocks ON public.theme_stocks
  USING (EXISTS (
    SELECT 1 FROM themes t
    WHERE t.id = theme_stocks.theme_id
      AND (t.is_system OR t.owner_id = (select auth.uid()))
  ));
ALTER POLICY write_own_theme_stocks ON public.theme_stocks
  USING (EXISTS (
    SELECT 1 FROM themes t
    WHERE t.id = theme_stocks.theme_id
      AND t.owner_id = (select auth.uid())
      AND NOT t.is_system
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM themes t
    WHERE t.id = theme_stocks.theme_id
      AND t.owner_id = (select auth.uid())
      AND NOT t.is_system
  ));

-- ─────────────────────────────────────────────────────────────
-- 4) Unindexed FK 인덱스
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_news_articles_summary_id ON public.news_articles (summary_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_stock_code ON public.news_articles (stock_code);
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON public.watchlists (user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stock_code ON public.watchlists (stock_code);
