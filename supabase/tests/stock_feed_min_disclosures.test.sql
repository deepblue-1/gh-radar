-- ============================================================
-- Phase 41 후속(2026-11-13 · gh-trade 인박스 261113-news-disclosure-quota) — 공시 보장 pgTAP.
--
-- 대상: 20261113300000_stock_feed_min_disclosures.sql (stock_feed_by_codes 의 p_min_disclosures)
--
-- 잠그는 것:
--   A. 기본(0) 은 지금과 같다 — 뉴스에 밀린 공시는 안 온다
--   B. p_min_disclosures 면 기간 안 최신 공시를 그만큼 따로 싣는다 · 작성 시각 최신순 하나 · 겹치면 한 번만
--   C. 기간(p_since) · 시각 커서(p_before) · 숨김 연결은 공시 보장에도 그대로
--   D. 범위 밖 값은 예외 · 권한(service_role 만)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_feed_min_disclosures.test.sql`
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(10);

INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('002990', '금호건설', 'KOSPI', 'KR7002990003')
ON CONFLICT (code) DO NOTHING;

CREATE FUNCTION pg_temp.row(p_srno text, p_kind text, p_title text, p_at text, p_hidden text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'srno', p_srno, 'provider_code', CASE p_kind WHEN 'disclosure' THEN 'F' ELSE 'H' END,
    'source', CASE p_kind WHEN 'disclosure' THEN '거래소 공시' ELSE '연합뉴스' END,
    'kind', p_kind, 'category', '01', 'title', p_title, 'title_key', 'k-' || p_srno, 'written_at', p_at,
    'links', jsonb_build_array(jsonb_build_object('code', '002990', 'hidden_reason', p_hidden)))
$$;

-- 공시 D1(가장 오래됨) · 숨긴 공시 DH · 공시 D2 · 뉴스 N1 ~ N5(공시보다 새로움) · 기간 밖 공시 D0
SELECT public.kis_news_ingest(jsonb_build_array(
  pg_temp.row('D0', 'disclosure', '금호건설(주) 기간 밖 공시',      '2026-11-08T10:00:00+09:00'),
  pg_temp.row('D1', 'disclosure', '금호건설(주) 단일판매ㆍ공급계약체결', '2026-11-12T17:36:54+09:00'),
  pg_temp.row('DH', 'disclosure', '금호건설 주식선물 안내',          '2026-11-12T17:40:00+09:00', 'derivative_notice'),
  pg_temp.row('D2', 'disclosure', '금호건설(주) 기타 공시',          '2026-11-12T18:00:00+09:00'),
  pg_temp.row('N1', 'news', '금호건설 기사 1', '2026-11-12T19:00:00+09:00'),
  pg_temp.row('N2', 'news', '금호건설 기사 2', '2026-11-12T20:00:00+09:00'),
  pg_temp.row('N3', 'news', '금호건설 기사 3', '2026-11-12T21:00:00+09:00'),
  pg_temp.row('N4', 'news', '금호건설 기사 4', '2026-11-12T22:00:00+09:00'),
  pg_temp.row('N5', 'news', '금호건설 기사 5', '2026-11-12T23:00:00+09:00')), 'feed');

CREATE FUNCTION pg_temp.srnos(p_per int, p_min int, p_since timestamptz DEFAULT timestamptz '2026-11-10 00:00+09',
                              p_before timestamptz DEFAULT NULL) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(k->>'srno' ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(
           public.stock_feed_by_codes(ARRAY['002990'], p_since, p_per, false, p_before, p_min)->'stocks') e,
         jsonb_array_elements(e->'kis') WITH ORDINALITY AS t(k, i)
$$;

SELECT is(pg_temp.srnos(3, 0), ARRAY['N5', 'N4', 'N3'], 'A1 기본 0 — 최신 3건만(공시는 밀려 안 옴)');
SELECT is(
  (SELECT coalesce(array_agg(k->>'srno' ORDER BY i), ARRAY[]::text[])
     FROM jsonb_array_elements(public.stock_feed_by_codes(ARRAY['002990'], timestamptz '2026-11-10 00:00+09', 3, false)->'stocks') e,
          jsonb_array_elements(e->'kis') WITH ORDINALITY AS t(k, i)),
  ARRAY['N5', 'N4', 'N3'], 'A2 인자를 안 넘긴 5인자 호출도 그대로');

SELECT is(pg_temp.srnos(3, 3), ARRAY['N5', 'N4', 'N3', 'D2', 'D1'],
          'B1 공시 3건 보장 — 기간 안 공시 2건이 최신순 끝에 붙는다(숨김 · 기간 밖 제외)');
SELECT is(pg_temp.srnos(3, 1), ARRAY['N5', 'N4', 'N3', 'D2'], 'B2 공시 1건 보장 — 가장 최근 공시만');
SELECT is(pg_temp.srnos(7, 3), ARRAY['N5', 'N4', 'N3', 'N2', 'N1', 'D2', 'D1'],
          'B3 최신 N건 안에 이미 있는 공시는 한 번만');

SELECT is(pg_temp.srnos(3, 3, timestamptz '2026-11-12 17:50+09'), ARRAY['N5', 'N4', 'N3', 'D2'],
          'C1 기간(p_since) 밖 공시는 보장하지 않는다');
SELECT is(pg_temp.srnos(2, 3, timestamptz '2026-11-10 00:00+09', timestamptz '2026-11-12 21:00+09'), ARRAY['N2', 'N1', 'D2', 'D1'],
          'C2 시각 커서(p_before) 이후 공시는 안 싣는다');
SELECT ok(NOT ('DH' = ANY (pg_temp.srnos(20, 10))), 'C3 숨긴 연결 공시는 보장에도 안 나온다');

SELECT throws_ok($$ SELECT public.stock_feed_by_codes(ARRAY['002990'], now(), 3, false, NULL, 11) $$,
                 'P0001', NULL, 'D1 p_min_disclosures 11 → 예외');
SELECT ok(NOT has_function_privilege('anon', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)', 'EXECUTE'),
          'D2 권한 — service_role 만');

SELECT * FROM finish();
ROLLBACK;
