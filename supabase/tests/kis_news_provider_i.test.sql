-- ============================================================
-- Phase 41 UAT(2026-11-12) — 제공처 I 공시 전환 · 파생 안내 숨김 소급 pgTAP.
--
-- 대상: 20261112330000_kis_news_provider_i_disclosure.sql
--
-- 실행:
--   bash scripts/verify-dma-orders-price-check.sh --until 20261112320000 \
--     --with supabase/tests/fixtures/41_provider_i_pre.sql \
--     --with supabase/migrations/20261112330000_kis_news_provider_i_disclosure.sql \
--     --test supabase/tests/kis_news_provider_i.test.sql
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 테스트 본문은 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(7);

SELECT is(
  (SELECT string_agg(srno || ':' || kind, ',' ORDER BY srno) FROM public.kis_news WHERE provider_code = 'I'),
  'I01:disclosure,I02:disclosure,I03:disclosure,I04:disclosure', 'K1 제공처 I 글은 전부 공시');
SELECT is(
  (SELECT string_agg(srno || ':' || coalesce(hidden_reason, '-'), ',' ORDER BY srno) FROM public.kis_news_stocks WHERE srno LIKE 'I%'),
  'I01:derivative_notice,I02:derivative_notice,I03:etp,I04:-', 'H1 파생 안내만 숨김 · etp 는 etp 그대로 · 다른 제목은 보임');
SELECT is(
  (SELECT kind || ':' || coalesce(s.hidden_reason, '-') FROM public.kis_news n JOIN public.kis_news_stocks s USING (srno) WHERE srno = 'N01'),
  'news:-', 'O1 언론사 뉴스는 제목에 주식선물이 있어도 그대로');
SELECT is(
  (SELECT kind || ':' || coalesce(s.hidden_reason, '-') FROM public.kis_news n JOIN public.kis_news_stocks s USING (srno) WHERE srno = 'F01'),
  'disclosure:-', 'O2 F 공시는 그대로');
SELECT is((SELECT count(*)::int FROM public.kis_news WHERE srno LIKE 'I%'), 4, 'R1 글은 지우지 않는다');

-- 조회 RPC 가 숨긴 줄을 내지 않는다
SELECT is(
  (SELECT string_agg(x->>'srno', ',' ORDER BY x->>'srno')
     FROM jsonb_array_elements(
            public.stock_feed_by_codes(ARRAY['900001'], timestamptz '2026-11-11 00:00:00+09', 50, false, timestamptz '2026-11-13 00:00:00+09')
              -> 'stocks' -> 0 -> 'kis') AS x),
  'F01,I04,N01', 'R2 조회에 파생 안내(I01 · I02)가 없다');

-- 다시 돌려도 바뀌는 행이 없다
UPDATE public.kis_news SET kind = 'disclosure' WHERE provider_code = 'I' AND kind = 'news';
SELECT is((SELECT count(*)::int FROM public.kis_news WHERE provider_code = 'I' AND kind = 'news'), 0, 'I1 재실행해도 news 0');

SELECT * FROM finish();
ROLLBACK;
