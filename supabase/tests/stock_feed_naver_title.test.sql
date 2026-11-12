-- ============================================================
-- Phase 41 UAT(2026-11-12) — 네이버 뉴스 「제목에 종목명 있는 기사만」 pgTAP.
--
-- 대상: 20261112320000_stock_feed_naver_title_name.sql (함수 stock_title_needles · RPC stock_feed_by_codes 네이버 조건)
--
-- 잠그는 것:
--   N. 낱말 배열 — 종목명 전체(소문자 · 공백 · 끝 마침표 제거) · 우선주는 본주 이름 · 띄어 쓴 이름은 첫 낱말(3자 이상) ·
--      빈 이름은 빈 배열
--   F. 조회 — 제목에 종목명이 있는 네이버 기사만 · 띄어쓰기 · 대소문자 무시 · 우선주는 본주 기사도 · 약칭(첫 낱말) 기사도 ·
--      종목명 없는 모음 기사 · 다른 종목 기사 · 시황은 빠진다
--   L. 상한은 거른 「뒤」에 센다 — 종목명 없는 최신 기사가 자리를 먹지 않는다
--   K. 한투 쪽은 그대로(제목에 종목명이 없어도 보인다 — D-11)
--   P. stock_title_needles 는 anon · authenticated 실행 불가 · service_role 가능
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/stock_feed_naver_title.test.sql`
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(17);

-- ── N. 낱말 배열 ──────────────────────────────────────────────────
SELECT is(public.stock_title_needles('가람전자'),   ARRAY['가람전자'],            'N1 보통 이름 → 이름 하나');
SELECT is(public.stock_title_needles('계양전기우'), ARRAY['계양전기', '계양전기우'], 'N2 우선주 → 본주 이름도');
SELECT is(public.stock_title_needles('나래2우B'),   ARRAY['나래', '나래2우b'],      'N3 「2우B」 걷기 · 소문자');
SELECT is(public.stock_title_needles('JYP Ent.'),   ARRAY['jyp', 'jypent'],        'N4 띄어 쓴 이름 → 첫 낱말 + 전체(끝 마침표 제거)');
SELECT is(public.stock_title_needles('SK 테스트'),  ARRAY['sk테스트'],             'N5 첫 낱말이 3자 미만이면 넣지 않는다');
SELECT is(public.stock_title_needles('연우'),       ARRAY['연우'],                 'N6 「우」 를 걷으면 1자가 되는 이름은 그대로');
SELECT is(public.stock_title_needles(''),           ARRAY[]::text[],               'N7 빈 이름 → 빈 배열');
SELECT is(public.stock_title_needles(NULL),         ARRAY[]::text[],               'N8 NULL → 빈 배열');

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('900001', '가람전자',   'KOSDAQ', 'KR7900001001'),
  ('900002', '계양전기우', 'KOSPI',  'KR7900002009'),
  ('900003', 'JYP Ent.',   'KOSDAQ', 'KR7900003007'),
  ('900004', '다온바이오', 'KOSDAQ', 'KR7900004005');

INSERT INTO public.news_articles (stock_code, title, description, source, url, published_at) VALUES
  -- 900001 가람전자: 남는 것 3 · 빠지는 것 4(최신 쪽에 몰려 있다)
  ('900001', '가람전자, 300억 규모 공급계약 체결',                  NULL, 'mk',     'https://example.invalid/a1', '2026-11-12T09:00:00+09:00'),
  ('900001', '[특징주] 가람 전자 장 초반 상한가',                    NULL, 'edaily', 'https://example.invalid/a2', '2026-11-12T09:05:00+09:00'),
  ('900001', '가람전자 주가, 상한가... 이유는?',                    NULL, 'ggilbo', 'https://example.invalid/a3', '2026-11-12T08:00:00+09:00'),
  ('900001', '11월 11일 주식시장 주요공시',                         NULL, 'catch',  'https://example.invalid/a4', '2026-11-12T10:00:00+09:00'),
  ('900001', '[특징주] 다온바이오, AI 로봇 테마 훈풍에 급등',        NULL, 'wide',   'https://example.invalid/a5', '2026-11-12T10:01:00+09:00'),
  ('900001', '신규 상장주 손바뀜 활발…바로팜 회전율 154.67%',        NULL, 'kjdaily','https://example.invalid/a6', '2026-11-12T10:02:00+09:00'),
  ('900001', '코스닥 699선 후퇴… 외국인·기관 동반 매도에 숨 고르기', NULL, 'seoul',  'https://example.invalid/a7', '2026-11-12T10:03:00+09:00'),
  -- 900002 계양전기우: 본주 기사도 남는다
  ('900002', '계양전기, 전동공구 수출 확대',                         NULL, 'mk',     'https://example.invalid/b1', '2026-11-12T09:00:00+09:00'),
  ('900002', '건설 우선주 나란히 급등',                              NULL, 'etoday', 'https://example.invalid/b2', '2026-11-12T09:10:00+09:00'),
  -- 900003 JYP Ent.: 약칭 · 소문자 표기도 남는다
  ('900003', '[특징주] JYP엔터, 호실적에 장초반 20% 급등',           NULL, 'yna',    'https://example.invalid/c1', '2026-11-12T09:00:00+09:00'),
  ('900003', 'jyp ent 주가 급등세... 왜?',                           NULL, 'ggilbo', 'https://example.invalid/c2', '2026-11-12T09:01:00+09:00'),
  ('900003', '음반 팔던 엔터주가 달라졌다… 공연·음원이 성장 견인',   NULL, 'hk',     'https://example.invalid/c3', '2026-11-12T09:02:00+09:00');

-- 한투 뉴스 — 제목에 종목명이 없어도 그대로 보인다(D-11).
INSERT INTO public.kis_news (srno, provider_code, source, kind, category, title, title_key, written_at, written_date)
VALUES ('K1', '9', '연합뉴스', 'news', '01', '금융보안원 해킹에 보안주 장 초반 급등', 'k1', '2026-11-12T09:30:00+09:00', '2026-11-12');
INSERT INTO public.kis_news_stocks (srno, stock_code, via, written_at)
VALUES ('K1', '900001', 'feed', '2026-11-12T09:30:00+09:00');

CREATE FUNCTION pg_temp.feed(p_codes text[], p_per integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.stock_feed_by_codes(p_codes, timestamptz '2026-11-11 00:00+09', p_per, false, timestamptz '2026-11-13 00:00+09')
$$;
CREATE FUNCTION pg_temp.urls(p_r jsonb, p_code text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(right(n->>'url', 2) ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(p_r->'stocks') e,
         jsonb_array_elements(e->'naver') WITH ORDINALITY AS t(n, i)
   WHERE e->>'code' = p_code
$$;

-- ── F. 조회 ───────────────────────────────────────────────────────
SELECT is(pg_temp.urls(pg_temp.feed(ARRAY['900001'], 50), '900001'), ARRAY['a2', 'a1', 'a3'],
          'F1 제목에 종목명이 있는 3건만 · 최신순 · 띄어 쓴 「가람 전자」 포함 · 모음 · 남의 특징주 · 시황은 빠진다');
SELECT is(pg_temp.urls(pg_temp.feed(ARRAY['900002'], 50), '900002'), ARRAY['b1'],
          'F2 우선주는 본주 이름 기사도 남는다 · 종목명 없는 기사는 빠진다');
SELECT is(pg_temp.urls(pg_temp.feed(ARRAY['900003'], 50), '900003'), ARRAY['c2', 'c1'],
          'F3 약칭(「JYP엔터」) · 소문자 · 마침표 없는 표기도 남는다');
SELECT is(pg_temp.urls(pg_temp.feed(ARRAY['900004'], 50), '900004'), ARRAY[]::text[],
          'F4 다른 종목(900001)에 저장된 기사는 제목에 이름이 있어도 이 종목 것으로 나오지 않는다');
SELECT is(
  (SELECT jsonb_array_length(e->'naver') FROM jsonb_array_elements(pg_temp.feed(ARRAY['900003', '900001'], 50)->'stocks') WITH ORDINALITY AS t(e, i) WHERE i = 2),
  3, 'F5 여러 코드 묶음에서도 종목마다 자기 이름으로 거른다(입력 순서 유지)');

-- ── L. 상한은 거른 뒤에 센다 ──────────────────────────────────────
SELECT is(pg_temp.urls(pg_temp.feed(ARRAY['900001'], 2), '900001'), ARRAY['a2', 'a1'],
          'L1 최신 4건이 종목명 없는 기사여도 상한 2건은 종목명 있는 기사로 찬다');

-- ── K. 한투 쪽은 그대로 ───────────────────────────────────────────
SELECT is(
  (SELECT e->'kis'->0->>'srno' FROM jsonb_array_elements(pg_temp.feed(ARRAY['900001'], 50)->'stocks') e),
  'K1', 'K1 한투 뉴스는 제목에 종목명이 없어도 보인다');

-- ── P. 권한 ───────────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.stock_title_needles(text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.stock_title_needles(text)', 'EXECUTE'),
          'P1 stock_title_needles — anon · authenticated 실행 불가');
SELECT ok(has_function_privilege('service_role', 'public.stock_title_needles(text)', 'EXECUTE'),
          'P2 stock_title_needles — service_role 실행 가능');

SELECT * FROM finish();
ROLLBACK;
