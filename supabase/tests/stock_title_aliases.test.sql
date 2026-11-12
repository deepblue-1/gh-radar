-- ============================================================
-- Phase 41 UAT(2026-11-12) — 네이버 뉴스 종목명 조건의 별칭 pgTAP.
--
-- 대상: 20261112340000_stock_title_aliases.sql (표 stock_title_aliases · RPC stock_feed_by_codes 낱말 = 종목명 + 별칭)
--
-- 잠그는 것:
--   A. 별칭이 있는 종목은 별칭만 든 제목도 남는다(대소문자 · 공백 무시) · 종목명 기사도 그대로
--   B. 별칭과 비슷하지만 다른 이름(「SM그룹」)·종목명 · 별칭 없는 제목은 빠진다
--   C. 별칭은 그 종목에만 — 다른 종목 조회에 새지 않는다
--   S. 처음 넣은 별칭 표 값(에스엠 → SM엔터 · NAVER → 네이버 등)
--   P. 표는 anon · authenticated 가 읽지 못한다
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_title_aliases.test.sql`
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(8);

INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('041510', '에스엠',   'KOSDAQ', 'KR7041510009'),
  ('900001', '가람전자', 'KOSDAQ', 'KR7900001001')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.news_articles (stock_code, title, description, source, url, published_at) VALUES
  ('041510', 'SM엔터, 해킹으로 개인정보 유출…공식 사과',          NULL, 'yna',  'https://example.invalid/s1', '2026-11-12T09:00:00+09:00'),
  ('041510', 'sm 엔터 주가 급등세... 왜?',                        NULL, 'gg',   'https://example.invalid/s2', '2026-11-12T09:01:00+09:00'),
  ('041510', '에스엠, 3분기 영업이익 컨센서스 상회',              NULL, 'mk',   'https://example.invalid/s3', '2026-11-12T09:02:00+09:00'),
  ('041510', '1조 베팅한 SM그룹, HMM 투자손실 1700억 추산',       NULL, 'hk',   'https://example.invalid/s4', '2026-11-12T09:03:00+09:00'),
  ('041510', '엔터주 일제히 강세',                                NULL, 'hk',   'https://example.invalid/s5', '2026-11-12T09:04:00+09:00'),
  ('900001', 'SM엔터와 손잡은 가람전자',                          NULL, 'mk',   'https://example.invalid/g1', '2026-11-12T09:05:00+09:00'),
  ('900001', 'SM엔터, 신인 그룹 데뷔',                            NULL, 'mk',   'https://example.invalid/g2', '2026-11-12T09:06:00+09:00');

CREATE FUNCTION pg_temp.urls(p_code text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(n->>'url', 2) ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(
           public.stock_feed_by_codes(ARRAY[p_code], timestamptz '2026-11-11 00:00+09', 50, false, timestamptz '2026-11-13 00:00+09')->'stocks') e,
         jsonb_array_elements(e->'naver') WITH ORDINALITY AS t(n, i)
   WHERE e->>'code' = p_code
$$;

SELECT is(pg_temp.urls('041510'), ARRAY['s3', 's2', 's1'],
          'A1 별칭 「SM엔터」 만 든 제목(띄어 쓴 소문자 포함)과 종목명 기사가 남는다');
SELECT ok(NOT ('s4' = ANY (pg_temp.urls('041510'))), 'B1 「SM그룹」 은 별칭이 아니라 빠진다');
SELECT ok(NOT ('s5' = ANY (pg_temp.urls('041510'))), 'B2 종목명 · 별칭 없는 제목은 빠진다');
SELECT is(pg_temp.urls('900001'), ARRAY['g1'], 'C1 다른 종목은 자기 이름으로만 — 에스엠 별칭이 새지 않는다');

SELECT is((SELECT alias FROM public.stock_title_aliases WHERE stock_code = '041510'), 'SM엔터', 'S1 에스엠 → SM엔터');
SELECT is((SELECT alias FROM public.stock_title_aliases WHERE stock_code = '035420'), '네이버', 'S2 NAVER → 네이버');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.stock_title_aliases WHERE char_length(btrim(alias)) < 2), 'S3 두 글자 미만 별칭 없음');

SELECT ok(NOT has_table_privilege('anon', 'public.stock_title_aliases', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.stock_title_aliases', 'SELECT'),
          'P1 별칭 표 — anon · authenticated 읽기 불가');

SELECT * FROM finish();
ROLLBACK;
