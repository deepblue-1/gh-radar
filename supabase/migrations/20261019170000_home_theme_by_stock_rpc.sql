-- ============================================================
-- home_theme_by_stock(p_codes, p_days) — 종목별 「오늘의 급등 테마」 역조회 (inbox 261019-theme-by-stock · gh-trade 매집·돌파감지창 「테마」 열)
--
-- 무엇: 최근 p_days 일(KST 달력일) 안의 home_theme_snapshots 를 **거래일별 가장 최근 스냅샷 1장**으로 줄인 뒤,
--       그 payload.themes[].stocks[].code 가 p_codes 에 드는 (code, 거래일, 스냅샷 시각, 테마 이름)을 jsonb 배열로 돌려준다.
--       거래일 내림차순 → 같은 날은 payload.themes 순서. 한 종목이 같은 날 두 테마에 들면 두 행.
-- 왜:   사용자 규칙(2026-10-19): 종목의 테마 = ① 오늘 최신 스냅샷의 급등 테마 → ② 없으면 최근 날짜의 급등 테마 목록을 거슬러
--       찾은 것 → ③ 그마저 없으면 시스템 테마(theme_stocks) 최신. ①②를 이 RPC 한 번으로 받고(Cloud Run 왕복 1회 — 메모리
--       「다중 쿼리는 RPC 1회로」), ③ 은 server 가 theme_stocks 로 보충한다. 「최근 날짜의 급등 테마 목록」 = 그날 마지막 스냅샷
--       (홈이 그 날짜를 열 때 기본으로 보이는 장면)이다.
-- 반환형이 jsonb 단일 값인 이유: 집합 반환 RPC 는 PostgREST max_rows(1000)에 잘린다.
-- 보안 (MEMORY feedback_supabase_rpc_revoke): SECURITY INVOKER · service_role 전용 — PUBLIC + anon, authenticated 모두 REVOKE.
-- 비용: 거래일별 DISTINCT ON 은 idx_home_snapshots_date (trade_date DESC, captured_at DESC) 를 탄다. p_days=30 이면 ≈22장 ·
--       장당 jsonb 수십 KB 를 펼친다 — server 가 코드 집합별 60초 캐시로 감싼다.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.home_theme_by_stock(p_codes text[], p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    SELECT DISTINCT ON (s.trade_date) s.trade_date, s.captured_at, s.payload
      FROM public.home_theme_snapshots s
     WHERE s.trade_date >= (now() AT TIME ZONE 'Asia/Seoul')::date - greatest(p_days, 0)
       AND s.payload IS NOT NULL
     ORDER BY s.trade_date DESC, s.captured_at DESC
  ),
  hits AS (
    SELECT d.trade_date, d.captured_at, t.ord AS theme_ord, t.theme->>'name' AS theme_name, st->>'code' AS code
      FROM days d
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.payload->'themes', '[]'::jsonb)) WITH ORDINALITY AS t(theme, ord)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(t.theme->'stocks', '[]'::jsonb)) AS st
     WHERE st->>'code' = ANY (p_codes)
       AND coalesce(t.theme->>'name', '') <> ''
  )
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'code', h.code,
               'trade_date', to_char(h.trade_date, 'YYYY-MM-DD'),
               'captured_at', to_char(h.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'theme_name', h.theme_name
             )
             ORDER BY h.trade_date DESC, h.code, h.theme_ord
           ),
           '[]'::jsonb)
    FROM hits h;
$$;

REVOKE EXECUTE ON FUNCTION public.home_theme_by_stock(text[], integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.home_theme_by_stock(text[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.home_theme_by_stock(text[], integer) TO service_role;

COMMIT;
