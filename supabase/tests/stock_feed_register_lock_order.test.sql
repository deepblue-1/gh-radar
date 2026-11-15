-- ============================================================
-- Phase 41 코드 리뷰 WR-32(2026-11-15) — 묶음 조회 등록 잠금 순서 pgTAP.
--
-- 대상: 20261115100000_stock_feed_register_lock_order.sql (stock_feed_by_codes 등록 INSERT 의 ORDER BY)
--
-- 잠그는 것:
--   O. 등록 INSERT 는 코드를 정렬해 넣는다(잠금 순서 고정 — 겹치는 묶음 동시 등록의 교착 방지).
--      교착 자체는 한 세션 pgTAP 으로 재현할 수 없어 본문 · 실행 계획으로 잠근다.
--   R. 등록 동작은 그대로 — 중복 · 빈 값 · NULL 은 한 번 · 60초 안 재등록은 시각을 바꾸지 않는다 · 60초 지나면 갱신
--   S. 서명 6인자 · SECURITY INVOKER · search_path 고정 · service_role 만 실행
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_feed_register_lock_order.test.sql`
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

-- ── O. 잠금 순서 ──────────────────────────────────────────────────
SELECT ok(
  (SELECT p.prosrc FROM pg_proc p
    WHERE p.oid = 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)'::regprocedure)
    ~ 'INSERT INTO public\.kis_news_targets[^;]*ORDER BY d\.c[^;]*ON CONFLICT',
  'O1 등록 INSERT 는 ORDER BY 로 코드 순 정렬 뒤 ON CONFLICT');

-- 등록 INSERT 와 같은 문장의 실행 계획에 정렬(Sort)이 있다 — 잠금은 정렬된 순서로 일어난다.
CREATE FUNCTION pg_temp.plan_has_sort() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_line text;
  v_found boolean := false;
BEGIN
  FOR v_line IN
    EXPLAIN (COSTS OFF)
    INSERT INTO public.kis_news_targets AS t (stock_code, last_requested_at)
    SELECT d.c, now()
      FROM (SELECT DISTINCT c FROM unnest(ARRAY['900203', '900201', '900202']) AS c
             WHERE c IS NOT NULL AND c <> '') d
     ORDER BY d.c
    ON CONFLICT (stock_code) DO UPDATE
      SET last_requested_at = now()
      WHERE t.last_requested_at IS NULL OR t.last_requested_at < now() - interval '60 seconds'
  LOOP
    IF v_line ~ 'Sort' THEN v_found := true; END IF;
  END LOOP;
  RETURN v_found;
END $$;
SELECT ok(pg_temp.plan_has_sort(), 'O2 등록 INSERT 계획에 Sort 노드가 있다');

-- ── R. 등록 동작 ──────────────────────────────────────────────────
DELETE FROM public.kis_news_targets WHERE stock_code IN ('900201', '900202', '900203');

SELECT lives_ok(
  $$ SELECT public.stock_feed_by_codes(ARRAY['900203', '900201', '900203', '', NULL, '900202'], now() - interval '3 days', 5, true) $$,
  'R1 중복 · 빈 값 · NULL 이 섞인 묶음도 등록된다');
SELECT is(
  (SELECT array_agg(stock_code ORDER BY stock_code) FROM public.kis_news_targets
    WHERE stock_code IN ('900201', '900202', '900203')),
  ARRAY['900201', '900202', '900203'],
  'R2 코드마다 한 행(빈 값 · NULL 제외)');

UPDATE public.kis_news_targets SET last_requested_at = now() - interval '30 seconds' WHERE stock_code = '900201';
UPDATE public.kis_news_targets SET last_requested_at = now() - interval '5 minutes' WHERE stock_code = '900202';
SELECT public.stock_feed_by_codes(ARRAY['900202', '900201'], now() - interval '3 days', 5, true);
SELECT is(
  (SELECT last_requested_at FROM public.kis_news_targets WHERE stock_code = '900201'),
  now() - interval '30 seconds',
  'R3 60초 안 재등록은 시각을 바꾸지 않는다');
SELECT is(
  (SELECT last_requested_at FROM public.kis_news_targets WHERE stock_code = '900202'),
  now(),
  'R4 60초 지난 등록은 지금 시각으로 갱신');

-- ── S. 서명 · 속성 · 권한 ─────────────────────────────────────────
SELECT ok(
  NOT (SELECT p.prosecdef FROM pg_proc p
        WHERE p.oid = 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)'::regprocedure),
  'S1 SECURITY INVOKER');
SELECT ok(
  (SELECT 'search_path=public, pg_temp' = ANY (p.proconfig) FROM pg_proc p
    WHERE p.oid = 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)'::regprocedure),
  'S2 search_path 고정');
SELECT ok(NOT has_function_privilege('anon', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE'),
          'S3 권한 — service_role 만');

SELECT * FROM finish();
ROLLBACK;
