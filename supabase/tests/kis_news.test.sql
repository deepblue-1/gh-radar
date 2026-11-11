-- ============================================================
-- Phase 41 Plan 01 — 한투 뉴스·공시 저장 · 묶음 조회 pgTAP.
--
-- 대상: 20261112100000_kis_news_feed.sql (표 kis_news · kis_news_stocks · kis_news_targets · kis_news_state ·
--       RPC kis_news_ingest · stock_feed_by_codes).
--
-- 잠그는 것:
--   A. 들여오기(SC-1 · D-13 · 리서치 뒤 확정)
--      - 같은 srno 두 번 → kis_news 1행 · 반환 inserted 1 → 0
--      - 같은 KST 날 같은 (provider_code, title_key) 다른 srno(시각 더 이름) → 1행 · written_at = 이른 값(연결 사본 포함) · revisions 1
--      - 다음 날 같은 제목 → 2행 · UTC 로는 같은 날이어도 KST 날짜가 다르면 2행
--      - 종목별 조회(via='stock') 연결 · p_queried_code → last_collected_at · 행 0개여도 찍힘(D-06)
--      - p_via='feed' → feed_at · last_srno(최대값) · 잘못된 p_via 는 예외
--   B. 묶음 조회(D-04 · D-06 · D-09)
--      - stocks 길이 = 입력 길이 · 입력 순서 · 글 없는 코드 kis · naver 빈 배열 · 수집 전 collected_at null
--      - kis · naver 원소 키 집합(server/shared 계약 · StockFeedRpcKisRow · StockFeedRpcNaverRow)
--      - hidden_reason 연결 제외(목록 · codes 둘 다) · p_per_source 상한 · p_before 경계(미만) · p_since 경계(이상)
--   C. 등록(D-05) — p_register false 면 행 없음 · 처음 호출 → last_requested_at · 30초 전 값 그대로 · 90초 전 값 now 로
--      (트랜잭션 안 now() 고정이라 값을 UPDATE 로 미리 당겨 놓고 본다) · last_collected_at 은 건드리지 않음
--   D. 권한 — anon · authenticated 는 두 함수 EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · 네 표 SELECT 불가
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(61);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('005930', '삼성전자', 'KOSPI', 'KR7005930003'),
  ('000660', 'SK하이닉스', 'KOSPI', 'KR7000660001'),
  ('035720', '카카오', 'KOSPI', 'KR7035720002');

INSERT INTO public.news_articles (stock_code, title, description, source, url, published_at) VALUES
  ('005930', '삼성전자, 대형 공급계약 체결', '요약문 1', '한국경제', 'https://example.invalid/n1', '2026-11-12T09:20:00+09:00'),
  ('005930', '삼성전자 장 초반 강세', NULL, NULL, 'https://example.invalid/n2', '2026-11-12T08:00:00+09:00');

-- 들여오기 행 1건(jsonb). links = [{code, hidden_reason}]
CREATE FUNCTION pg_temp.row(p_srno text, p_provider text, p_kind text, p_title text, p_key text, p_at text, p_links jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'srno', p_srno, 'provider_code', p_provider,
    'source', CASE p_provider WHEN 'F' THEN '거래소 공시' WHEN 'G' THEN '코스닥 공시' ELSE '연합뉴스' END,
    'kind', p_kind, 'category', '01', 'title', p_title, 'title_key', p_key, 'written_at', p_at, 'links', p_links)
$$;
CREATE FUNCTION pg_temp.lk(p_code text, p_hidden text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('code', p_code, 'hidden_reason', p_hidden)
$$;
-- 묶음 조회 결과에서 코드 하나의 항목.
CREATE FUNCTION pg_temp.entry(p_r jsonb, p_code text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p_r->'stocks') e WHERE e->>'code' = p_code
$$;
-- 항목의 kis srno 배열(순서 그대로).
CREATE FUNCTION pg_temp.srnos(p_entry jsonb) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(k->>'srno' ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(p_entry->'kis') WITH ORDINALITY AS x(k, i)
$$;

-- ── A. 들여오기 ───────────────────────────────────────────────────
-- S1: 거래소 공시 · 005930
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0001', 'F', 'disclosure', '삼성전자(주) 단일판매ㆍ공급계약체결',
            'k-contract', '2026-11-12T09:14:35+09:00', jsonb_build_array(pg_temp.lk('005930')))), 'feed'),
  '{"inserted":1,"revisions":0,"linked":1}'::jsonb,
  'A1 새 srno → inserted 1 · linked 1');
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0001', 'F', 'disclosure', '삼성전자(주) 단일판매ㆍ공급계약체결',
            'k-contract', '2026-11-12T09:14:35+09:00', jsonb_build_array(pg_temp.lk('005930')))), 'feed'),
  '{"inserted":0,"revisions":0,"linked":0}'::jsonb,
  'A2 같은 srno 두 번 → inserted 0 · linked 0');
SELECT is((SELECT count(*)::int FROM public.kis_news WHERE srno = 'S0001'), 1, 'A3 같은 srno 두 번 → kis_news 1행');
SELECT ok((SELECT feed_at IS NOT NULL FROM public.kis_news_state WHERE id = 1), 'A4 p_via=feed → feed_at 찍힘');
SELECT is((SELECT last_srno FROM public.kis_news_state WHERE id = 1), 'S0001', 'A5 p_via=feed → last_srno = 이번 최대 srno');

-- S2: 같은 날 수정본(시각 더 이름 · 다른 srno) — 종목별 조회(005930) 결과로 들어옴 · 000660 도 연결
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0002', 'F', 'disclosure', '삼성전자(주) 단일판매ㆍ공급계약체결',
            'k-contract', '2026-11-12T09:10:00+09:00', jsonb_build_array(pg_temp.lk('005930'), pg_temp.lk('000660')))),
         'stock', '005930'),
  '{"inserted":0,"revisions":1,"linked":1}'::jsonb,
  'A6 같은 날 같은 (provider, title_key) 다른 srno → revisions 1 · 새 연결 1(000660)');
SELECT is((SELECT count(*)::int FROM public.kis_news WHERE title_key = 'k-contract'), 1, 'A7 같은 날 수정본 → 1행');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news WHERE srno = 'S0002'), 'A8 수정본 srno 는 새 행이 아니다(첫 srno 유지)');
SELECT is((SELECT written_at FROM public.kis_news WHERE srno = 'S0001'), '2026-11-12T09:10:00+09:00'::timestamptz,
          'A9 수정본 → written_at = 둘 중 이른 쪽');
SELECT is((SELECT array_agg(DISTINCT written_at) FROM public.kis_news_stocks WHERE srno = 'S0001'),
          ARRAY['2026-11-12T09:10:00+09:00'::timestamptz], 'A10 연결 사본 written_at 도 이른 쪽으로');
SELECT is((SELECT via FROM public.kis_news_stocks WHERE srno = 'S0001' AND stock_code = '000660'), 'stock',
          'A11 종목별 조회 연결 via = stock');
SELECT is((SELECT via FROM public.kis_news_stocks WHERE srno = 'S0001' AND stock_code = '005930'), 'feed',
          'A12 이미 있던 연결은 그대로(via = feed)');
SELECT ok((SELECT last_collected_at IS NOT NULL FROM public.kis_news_targets WHERE stock_code = '005930'),
          'A13 p_queried_code → last_collected_at 찍힘');
-- 수정본이 시각이 더 늦으면 written_at 그대로
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0007', 'F', 'disclosure', '삼성전자(주) 단일판매ㆍ공급계약체결',
            'k-contract', '2026-11-12T10:00:00+09:00', jsonb_build_array(pg_temp.lk('005930')))), 'feed'),
  '{"inserted":0,"revisions":1,"linked":0}'::jsonb,
  'A14 더 늦은 수정본 → revisions 1 · 연결 없음');
SELECT is((SELECT written_at FROM public.kis_news WHERE srno = 'S0001'), '2026-11-12T09:10:00+09:00'::timestamptz,
          'A15 더 늦은 수정본은 written_at 을 늦추지 않는다');
SELECT is((SELECT last_srno FROM public.kis_news_state WHERE id = 1), 'S0007', 'A16 last_srno 는 더 큰 srno 로 전진');

-- S3: 다음 날 같은 제목 → 별개 행
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0003', 'F', 'disclosure', '삼성전자(주) 단일판매ㆍ공급계약체결',
            'k-contract', '2026-11-13T09:00:00+09:00', jsonb_build_array(pg_temp.lk('005930')))), 'stock', '005930'),
  '{"inserted":1,"revisions":0,"linked":1}'::jsonb,
  'A17 다음 날 같은 제목 → 새 글');
SELECT is((SELECT count(*)::int FROM public.kis_news WHERE title_key = 'k-contract'), 2, 'A18 다음 날 같은 제목 → 2행');

-- S4 · S5: KST 23:30 과 다음 날 00:30(UTC 로는 같은 날) — 「공매도 과열종목 지정」
SELECT is(
  public.kis_news_ingest(jsonb_build_array(
    pg_temp.row('S0004', 'G', 'disclosure', '공매도 과열종목 지정', 'k-short', '2026-11-12T23:30:00+09:00',
                jsonb_build_array(pg_temp.lk('000660'))),
    pg_temp.row('S0005', 'G', 'disclosure', '공매도 과열종목 지정', 'k-short', '2026-11-13T00:30:00+09:00',
                jsonb_build_array(pg_temp.lk('000660')))), 'feed'),
  '{"inserted":2,"revisions":0,"linked":2}'::jsonb,
  'A19 KST 날짜 경계(UTC 같은 날) 같은 제목 → 2건 새 글');
SELECT is((SELECT array_agg(written_date ORDER BY written_date) FROM public.kis_news WHERE title_key = 'k-short'),
          ARRAY['2026-11-12'::date, '2026-11-13'::date], 'A20 written_date = KST 날짜');

-- S6: 언론사 뉴스 · 005930 보임 + 000660 숨김(etp)
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('S0006', '2', 'news', '반도체 레버리지 ETN 거래 급증',
            'k-etn', '2026-11-12T12:00:00+09:00', jsonb_build_array(pg_temp.lk('005930'), pg_temp.lk('000660', 'etp')))),
         'feed'),
  '{"inserted":1,"revisions":0,"linked":2}'::jsonb,
  'A21 숨김 연결도 저장한다(linked 2)');

-- 행 0개 + p_queried_code → 수집 시각만
SELECT is(public.kis_news_ingest('[]'::jsonb, 'stock', '035720'), '{"inserted":0,"revisions":0,"linked":0}'::jsonb,
          'A22 행 0개 → 0 · 0 · 0');
SELECT ok((SELECT last_collected_at IS NOT NULL FROM public.kis_news_targets WHERE stock_code = '035720'),
          'A23 행 0개여도 p_queried_code → last_collected_at 찍힘(D-06 수집했는데 글 없음)');
SELECT throws_ok($$ SELECT public.kis_news_ingest('[]'::jsonb, 'bad') $$, 'P0001', NULL, 'A24 잘못된 p_via → 예외');

-- ── B. 묶음 조회 ───────────────────────────────────────────────────
CREATE TEMP TABLE r_all AS
  SELECT public.stock_feed_by_codes(ARRAY['000660', '005930', '999999'], '2026-11-01T00:00:00+09:00', 10, false) AS r;

SELECT is((SELECT jsonb_array_length(r->'stocks') FROM r_all), 3, 'B1 stocks 길이 = 입력 코드 수');
SELECT is((SELECT array_agg(e->>'code' ORDER BY i) FROM r_all, jsonb_array_elements(r->'stocks') WITH ORDINALITY AS x(e, i)),
          ARRAY['000660', '005930', '999999'], 'B2 입력 순서 그대로');
SELECT is((SELECT pg_temp.entry(r, '999999')->'kis' FROM r_all), '[]'::jsonb, 'B3 글 없는 코드 kis = []');
SELECT is((SELECT pg_temp.entry(r, '999999')->'naver' FROM r_all), '[]'::jsonb, 'B4 글 없는 코드 naver = []');
SELECT ok((SELECT pg_temp.entry(r, '999999') ? 'collected_at'
              AND jsonb_typeof(pg_temp.entry(r, '999999')->'collected_at') = 'null' FROM r_all),
          'B5 수집 전 코드 collected_at 키 있음 · null');
SELECT ok((SELECT jsonb_typeof(pg_temp.entry(r, '005930')->'collected_at') = 'string' FROM r_all),
          'B6 종목별 조회를 한 코드 collected_at 시각');
SELECT ok((SELECT jsonb_typeof(r->'feed_at') = 'string' FROM r_all), 'B7 feed_at = state.feed_at');
SELECT is((SELECT array_agg(k ORDER BY k) FROM r_all, jsonb_object_keys(pg_temp.entry(r, '005930')->'kis'->0) AS k),
          ARRAY['codes', 'kind', 'received_at', 'source', 'srno', 'title', 'title_key', 'written_at'],
          'B8 kis 원소 키 집합');
SELECT is((SELECT array_agg(k ORDER BY k) FROM r_all, jsonb_object_keys(pg_temp.entry(r, '005930')->'naver'->0) AS k),
          ARRAY['created_at', 'description', 'id', 'published_at', 'source', 'title', 'url'],
          'B9 naver 원소 키 집합');
SELECT is((SELECT pg_temp.srnos(pg_temp.entry(r, '005930')) FROM r_all), ARRAY['S0003', 'S0006', 'S0001'],
          'B10 005930 kis = 작성 시각 내림차순');
SELECT is((SELECT pg_temp.srnos(pg_temp.entry(r, '000660')) FROM r_all), ARRAY['S0005', 'S0004', 'S0001'],
          'B11 000660 kis — 숨김 연결(S0006 etp) 제외');
SELECT is((SELECT k->'codes' FROM r_all, jsonb_array_elements(pg_temp.entry(r, '005930')->'kis') k WHERE k->>'srno' = 'S0001'),
          '["000660", "005930"]'::jsonb, 'B12 codes = 보이는 연결 코드 · 코드순');
SELECT is((SELECT k->'codes' FROM r_all, jsonb_array_elements(pg_temp.entry(r, '005930')->'kis') k WHERE k->>'srno' = 'S0006'),
          '["005930"]'::jsonb, 'B13 codes 에서도 숨김 연결 제외');
SELECT is((SELECT array_agg(n->>'url' ORDER BY i) FROM r_all, jsonb_array_elements(pg_temp.entry(r, '005930')->'naver') WITH ORDINALITY AS x(n, i)),
          ARRAY['https://example.invalid/n1', 'https://example.invalid/n2'], 'B14 naver = published_at 내림차순');
SELECT is((SELECT jsonb_typeof(pg_temp.entry(r, '005930')->'naver'->1->'source') FROM r_all), 'null',
          'B15 naver source null 은 그대로 null(대체 표기는 shared 몫)');

CREATE TEMP TABLE r_cap AS
  SELECT public.stock_feed_by_codes(ARRAY['005930'], '2026-11-01T00:00:00+09:00', 1, false) AS r;
SELECT is((SELECT pg_temp.srnos(pg_temp.entry(r, '005930')) FROM r_cap), ARRAY['S0003'], 'B16 p_per_source 1 → kis 최신 1건');
SELECT is((SELECT jsonb_array_length(pg_temp.entry(r, '005930')->'naver') FROM r_cap), 1, 'B17 p_per_source 1 → naver 1건');

CREATE TEMP TABLE r_before AS
  SELECT public.stock_feed_by_codes(ARRAY['005930'], '2026-11-01T00:00:00+09:00', 10, false, '2026-11-12T12:00:00+09:00') AS r;
SELECT is((SELECT pg_temp.srnos(pg_temp.entry(r, '005930')) FROM r_before), ARRAY['S0001'],
          'B18 p_before 경계 — written_at < before 만(12:00 정각 S0006 제외)');
SELECT is((SELECT jsonb_array_length(pg_temp.entry(r, '005930')->'naver') FROM r_before), 2, 'B19 p_before — naver 도 같은 조건');

CREATE TEMP TABLE r_since AS
  SELECT public.stock_feed_by_codes(ARRAY['005930'], '2026-11-12T12:00:00+09:00', 10, false) AS r;
SELECT is((SELECT pg_temp.srnos(pg_temp.entry(r, '005930')) FROM r_since), ARRAY['S0003', 'S0006'],
          'B20 p_since 경계 — written_at >= since(12:00 정각 S0006 포함)');
SELECT is((SELECT pg_temp.entry(r, '005930')->'naver' FROM r_since), '[]'::jsonb, 'B21 p_since — naver 도 같은 조건');

-- ── C. 등록 ───────────────────────────────────────────────────────
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news_targets WHERE stock_code = '999999'),
          'C1 p_register false → 등록 행 없음');
SELECT lives_ok($$ SELECT public.stock_feed_by_codes(ARRAY['999999', '005930', '999999'], now() - interval '3 days', 20, true) $$,
          'C2 p_register true(중복 코드 포함)');
SELECT is((SELECT last_requested_at FROM public.kis_news_targets WHERE stock_code = '999999'), now(),
          'C3 처음 호출 → last_requested_at = now');
SELECT ok((SELECT last_collected_at IS NOT NULL FROM public.kis_news_targets WHERE stock_code = '005930'),
          'C4 등록은 last_collected_at 을 건드리지 않는다');
UPDATE public.kis_news_targets SET last_requested_at = now() - interval '30 seconds' WHERE stock_code = '999999';
DO $$ BEGIN PERFORM public.stock_feed_by_codes(ARRAY['999999'], now() - interval '3 days', 20, true); END $$;
SELECT is((SELECT last_requested_at FROM public.kis_news_targets WHERE stock_code = '999999'), now() - interval '30 seconds',
          'C5 30초 전 등록 → 그대로(60초에 1회 쓰기)');
UPDATE public.kis_news_targets SET last_requested_at = now() - interval '90 seconds' WHERE stock_code = '999999';
DO $$ BEGIN PERFORM public.stock_feed_by_codes(ARRAY['999999'], now() - interval '3 days', 20, true); END $$;
SELECT is((SELECT last_requested_at FROM public.kis_news_targets WHERE stock_code = '999999'), now(),
          'C6 90초 전 등록 → now 로 갱신');

-- ── D. 권한 · 함수 속성 ────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, 'public.kis_news_ingest(jsonb,text,text)', 'EXECUTE'), r.expect,
          format('D %s EXECUTE kis_news_ingest = %s', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;
SELECT is(has_function_privilege(r.role, 'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz)', 'EXECUTE'),
          r.expect, format('D %s EXECUTE stock_feed_by_codes = %s', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;
SELECT ok(NOT (SELECT bool_or(prosecdef) FROM pg_proc
                WHERE oid IN ('public.kis_news_ingest(jsonb,text,text)'::regprocedure,
                              'public.stock_feed_by_codes(text[],timestamptz,integer,boolean,timestamptz)'::regprocedure)),
          'D 두 함수 SECURITY INVOKER');
SELECT ok(NOT bool_or(has_table_privilege(r.role, t.tbl, 'SELECT')),
          format('D %s 네 표 SELECT 불가', r.role))
  FROM (VALUES ('anon'), ('authenticated')) AS r(role)
 CROSS JOIN (VALUES ('public.kis_news'), ('public.kis_news_stocks'), ('public.kis_news_targets'), ('public.kis_news_state')) AS t(tbl)
 GROUP BY r.role
 ORDER BY r.role;
SELECT is((SELECT count(*)::int FROM pg_class
            WHERE oid IN ('public.kis_news'::regclass, 'public.kis_news_stocks'::regclass,
                          'public.kis_news_targets'::regclass, 'public.kis_news_state'::regclass)
              AND relrowsecurity),
          4, 'D 네 표 RLS 활성');

SELECT * FROM finish();
ROLLBACK;
