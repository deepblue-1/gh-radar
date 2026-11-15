-- ============================================================
-- Phase 41 코드 리뷰 IN-33(2026-11-15) — 네이버 「제목에 종목명」 낱말 규칙 좁히기 pgTAP.
--
-- 대상: 20261115120000_stock_title_needles_tighten.sql (stock_title_needles · stock_feed_by_codes 네이버 조건)
--
-- 잠그는 것:
--   N. 우선주 본주 낱말은 3자 이상만 — 「LG우」 → lg 를 넣지 않는다 · 「LG화학우」 → lg화학 은 넣는다
--   F. 조회 — 2자 그룹 우선주 줄에 계열사 기사가 남지 않는다 · 띄어 쓴 이름의 첫 낱말이 다른 종목 이름이면 그 낱말로 남의 기사를
--      끌어오지 않는다(「NHN KCP」 ↔ 「NHN」) · 다른 종목 이름이 아닌 첫 낱말은 그대로(「JYP Ent.」 → jyp) ·
--      탭 · NBSP · 전각 공백이 든 제목도 「가람 전자」 꼴로 찾는다
--   S. stock_title_needles 는 IMMUTABLE · service_role 만
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_title_needles_tighten.test.sql`
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(11);

-- ── N. 낱말 배열 ──────────────────────────────────────────────────
SELECT is(public.stock_title_needles('LG우'),       ARRAY['lg우'],               'N1 「LG우」 → 본주 낱말 lg(2자)는 넣지 않는다');
SELECT is(public.stock_title_needles('SK우'),       ARRAY['sk우'],               'N2 「SK우」 도 같다');
SELECT is(public.stock_title_needles('LG화학우'),   ARRAY['lg화학', 'lg화학우'], 'N3 3자 이상 본주 낱말은 그대로');
SELECT is(public.stock_title_needles('계양전기우'), ARRAY['계양전기', '계양전기우'], 'N4 한글 우선주 그대로');

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('900401', 'NHN',      'KOSPI',  'KR7900401003'),
  ('900402', 'NHN KCP',  'KOSDAQ', 'KR7900402001'),
  ('900403', 'LG우',     'KOSPI',  'KR7900403009'),
  ('900404', '가람전자', 'KOSDAQ', 'KR7900404007'),
  ('900405', 'JYP Ent.', 'KOSDAQ', 'KR7900405004')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.news_articles (stock_code, title, description, source, url, published_at) VALUES
  -- NHN KCP: 첫 낱말 nhn 은 다른 종목(NHN) 이름이라 낱말이 아니다
  ('900402', 'NHN, 3분기 게임 매출 증가',             NULL, 'mk',  'https://example.invalid/k1', '2026-11-12T09:00:00+09:00'),
  ('900402', 'NHN KCP, 결제 거래액 사상 최대',         NULL, 'mk',  'https://example.invalid/k2', '2026-11-12T09:01:00+09:00'),
  -- LG우: 계열사 기사는 빠지고 제목에 「LG우」 가 있는 기사만
  ('900403', 'LG전자, 신형 가전 공개',                 NULL, 'hk',  'https://example.invalid/l1', '2026-11-12T09:00:00+09:00'),
  ('900403', '우선주 강세… LG우 장중 8% 상승',         NULL, 'hk',  'https://example.invalid/l2', '2026-11-12T09:01:00+09:00'),
  -- 가람전자: 탭 · NBSP · 전각 공백이 든 제목도 찾는다
  ('900404', E'가람\t전자, 300억 공급계약',            NULL, 'yna', 'https://example.invalid/g1', '2026-11-12T09:00:00+09:00'),
  ('900404', E'[특징주] 가람 전자 상한가',        NULL, 'yna', 'https://example.invalid/g2', '2026-11-12T09:01:00+09:00'),
  ('900404', E'가람　전자 3분기 흑자',             NULL, 'yna', 'https://example.invalid/g3', '2026-11-12T09:02:00+09:00'),
  ('900404', '전자부품주 강세',                        NULL, 'yna', 'https://example.invalid/g4', '2026-11-12T09:03:00+09:00'),
  -- JYP Ent.: 첫 낱말 jyp 는 다른 종목 이름이 아니라 그대로 낱말
  ('900405', '[특징주] JYP엔터, 호실적에 급등',        NULL, 'yna', 'https://example.invalid/j1', '2026-11-12T09:00:00+09:00');

CREATE FUNCTION pg_temp.urls(p_code text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(n->>'url', 2) ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(
           public.stock_feed_by_codes(ARRAY[p_code], timestamptz '2026-11-11 00:00+09', 50, false,
                                      timestamptz '2026-11-13 00:00+09')->'stocks') e,
         jsonb_array_elements(e->'naver') WITH ORDINALITY AS t(n, i)
   WHERE e->>'code' = p_code
$$;

-- ── F. 조회 ───────────────────────────────────────────────────────
SELECT is(pg_temp.urls('900402'), ARRAY['k2'], 'F1 「NHN KCP」 — 다른 종목 이름인 첫 낱말(nhn)로 NHN 기사를 끌어오지 않는다');
SELECT is(pg_temp.urls('900403'), ARRAY['l2'], 'F2 「LG우」 — 계열사(LG전자) 기사는 빠지고 「LG우」 기사만');
SELECT is(pg_temp.urls('900404'), ARRAY['g3', 'g2', 'g1'], 'F3 탭 · NBSP · 전각 공백이 든 제목도 남는다 · 종목명 없는 기사는 빠진다');
SELECT is(pg_temp.urls('900405'), ARRAY['j1'], 'F4 다른 종목 이름이 아닌 첫 낱말(jyp)은 그대로 쓴다');

-- ── S. 속성 · 권한 ────────────────────────────────────────────────
SELECT is((SELECT p.provolatile FROM pg_proc p WHERE p.oid = 'public.stock_title_needles(text)'::regprocedure),
          'i'::"char", 'S1 stock_title_needles 는 IMMUTABLE 그대로');
SELECT ok(NOT has_function_privilege('anon', 'public.stock_title_needles(text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.stock_title_needles(text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.stock_title_needles(text)', 'EXECUTE'),
          'S2 stock_title_needles 권한 — service_role 만');
SELECT ok(
  (SELECT NOT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')
     FROM pg_proc p
    WHERE p.oid = 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz,integer)'::regprocedure),
  'S3 stock_feed_by_codes — SECURITY INVOKER · search_path 고정 · service_role 만');

SELECT * FROM finish();
ROLLBACK;
