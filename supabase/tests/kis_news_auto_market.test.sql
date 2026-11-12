-- ============================================================
-- Phase 41 UAT(2026-11-12) — 재료 없는 자동 기사 숨김 소급 pgTAP.
--
-- 대상: 20261112300000_kis_news_auto_market_hidden.sql(시세 · 시황 · 목록) + 20261112310000_kis_news_auto_market_supply.sql(수급)
--
-- 잠그는 것:
--   H. 시세 한 줄 · 시황 · 목록 꼴 뉴스의 연결이 전부 auto_market 이 된다(같은 글의 여러 종목 연결 포함)
--   S. 수급 자동 기사(「[장중수급포착]」 · 「52주 신고가 경신, 외국인 N일 연속 순매수」)도 auto_market 이 된다
--   K. 재료 · 리포트 · 특징주 뉴스는 그대로 보인다(「52주 신고가 경신, <리포트 제목>」 포함)
--   D. 공시는 제목이 같은 꼴이어도 건드리지 않는다 · 이미 etp 인 연결은 etp 그대로
--   R. 조회 RPC(stock_feed_by_codes)가 숨긴 줄을 내지 않는다 · 글 자체는 지우지 않는다
--   I. 같은 UPDATE 를 다시 돌려도 바뀌는 행이 없다
--
-- 실행(마이그레이션 「전」 상태를 먼저 만들고 그 위에 마이그레이션을 얹는다):
--   bash scripts/verify-dma-orders-price-check.sh --until 20261112200000 \
--     --with supabase/tests/fixtures/41_auto_market_pre.sql \
--     --with supabase/migrations/20261112300000_kis_news_auto_market_hidden.sql \
--     --with supabase/migrations/20261112310000_kis_news_auto_market_supply.sql \
--     --test supabase/tests/kis_news_auto_market.test.sql
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 테스트 본문은 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(10);

SELECT is(
  (SELECT count(*)::int FROM public.kis_news_stocks WHERE srno LIKE 'H%' AND hidden_reason = 'auto_market'),
  16, 'H1 자동 기사 연결 16개(15글 + 같은 글의 둘째 종목) 전부 auto_market');
SELECT is(
  (SELECT count(*)::int FROM public.kis_news_stocks WHERE srno LIKE 'H%' AND hidden_reason IS DISTINCT FROM 'auto_market'),
  0, 'H2 자동 기사 중 보이는 연결 0');
SELECT is(
  (SELECT string_agg(srno, ',' ORDER BY srno) FROM public.kis_news_stocks WHERE srno LIKE 'K%' AND hidden_reason IS NULL),
  'K01,K02,K03,K04,K05,K06', 'K1 재료 · 리포트 · 특징주 뉴스 6건은 그대로 보인다');
SELECT is(
  (SELECT string_agg(srno, ',' ORDER BY srno) FROM public.kis_news_stocks WHERE srno LIKE 'S%' AND hidden_reason = 'auto_market'),
  'S01,S02,S03', 'S1 수급 자동 기사 3건도 auto_market');
SELECT is(
  (SELECT hidden_reason FROM public.kis_news_stocks WHERE srno = 'D01'),
  NULL, 'D1 공시는 제목이 목록 꼴이어도 숨기지 않는다');
SELECT is(
  (SELECT hidden_reason FROM public.kis_news_stocks WHERE srno = 'E01'),
  'etp', 'D2 이미 etp 인 연결은 etp 그대로');
SELECT is(
  (SELECT count(*)::int FROM public.kis_news WHERE srno LIKE 'H%'),
  15, 'R1 글 자체는 지우지 않는다(연결만 숨김)');

-- 조회 RPC — 900001 에 보이는 한투 줄은 남긴 뉴스 6 + 공시 1.
SELECT is(
  (SELECT jsonb_array_length(e->'kis')
     FROM jsonb_array_elements(public.stock_feed_by_codes(
            ARRAY['900001'], timestamptz '2026-11-11 00:00+09', 50, false, timestamptz '2026-11-13 00:00+09')->'stocks') e
    WHERE e->>'code' = '900001'),
  7, 'R2 stock_feed_by_codes 는 숨긴 줄을 내지 않는다(뉴스 6 + 공시 1)');
SELECT is(
  (SELECT count(*)::int
     FROM jsonb_array_elements(public.stock_feed_by_codes(
            ARRAY['900001'], timestamptz '2026-11-11 00:00+09', 50, false, timestamptz '2026-11-13 00:00+09')->'stocks') e,
          jsonb_array_elements(e->'kis') k
    WHERE k->>'srno' LIKE 'H%' OR k->>'srno' LIKE 'S%'),
  0, 'R3 응답에 자동 기사 일련번호가 없다');

-- 다시 돌려도 바뀌는 행이 없다(마이그레이션과 같은 조건 · 대표 패턴 하나로 확인).
WITH again AS (
  UPDATE public.kis_news_stocks s
     SET hidden_reason = 'auto_market'
    FROM public.kis_news n
   WHERE n.srno = s.srno AND n.kind = 'news' AND s.hidden_reason IS NULL
     AND n.title ~ ANY (ARRAY['^<[^>]{1,4}>.*(상한가|하한가) ?(진입|이탈)', '상위 ?[0-9]* ?종목', '★', '^\[장중수급포착\]'])
  RETURNING 1)
SELECT is((SELECT count(*)::int FROM again), 0, 'I1 다시 돌려도 바뀌는 행 0');

SELECT * FROM finish();
ROLLBACK;
