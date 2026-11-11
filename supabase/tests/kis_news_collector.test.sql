-- ============================================================
-- Phase 41 Plan 02 — 한투 뉴스·공시 수집기 받침 pgTAP.
--
-- 대상: 20261112200000_kis_news_collector.sql (표 kis_access_tokens · RPC kis_news_lease_acquire ·
--       kis_news_lease_release · kis_news_targets_list · kis_news_stock_meta · kis_news_cleanup ·
--       kis_disclosure_kinds · kis_news_ops_stats).
--
-- 잠그는 것:
--   L. 임대(D-01 · SC-1) — 빈 상태 A 획득 · B 거절 · A 연장 · 만료 뒤 B 넘겨받음 · 주인 아닌 해제 거절 · 주인 해제 → 빈 상태
--   T. 대상 목록(D-05 · D-06) — 최신 scan 의 급등(순위 ≤ p_top) ∪ 관심 ∪ 최근 등록(최근 순 상한) · 마스터 밖 코드 제외 ·
--      같은 코드 한 줄(reasons 여럿) · 한 번도 모으지 않은 종목이 앞 · 옛 scan 행 제외 · 마스터 밖 등록은 상한 자리를 먹지 않는다
--   M. 종목 정보 — {"<code>": {"n": 이름, "g": 증권그룹}}
--   S. 운영 수치(SC-1 · SC-4) — 키 집합 · 건수 · 종류별 · 경로별 · 지연 p50/p90(KST 평일 07:00 ~ 20:00 작성분만) ·
--      feed_at · 활성 등록 · 오늘 호출 수 · 한도 의심 표시 수
--   K. 공시 종류(D-10 · SC-7) — 회사명 걷기((주) · 주식회사 · 두 낱말 회사명) · (정정) 따로 셈 · 숨김 사유별 묶음 ·
--      마스터 이름이 제목에 없으면 첫 낱말 걷기 · 뉴스 제외 · 건수 내림차순
--   C. 정리(SC-1 · 보관 90일) — 90일 지난 글 + 연결 삭제 · 10일 글 유지 · 하루 넘게 조회도 수집도 없는 등록 행 삭제 ·
--      cleanup_date = KST 오늘 · 반환 {news_deleted, targets_deleted}
--   P. 권한 — 7개 RPC anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER ·
--      kis_access_tokens anon · authenticated SELECT 불가 · RLS 켜짐
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news_collector.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 트랜잭션 안 now() 는 고정이라 「n분 전」 은 now() - interval 로 미리 박아 둔다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(84);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin, security_group) VALUES
  ('900001', '가람전자',     'KOSDAQ', 'KR7900001001', '주권'),   -- 급등 1위 + 관심
  ('900002', '나래테크',     'KOSDAQ', 'KR7900002009', '주권'),   -- 급등 50위 · 5분 전 수집
  ('900003', '다온바이오',   'KOSDAQ', 'KR7900003007', '주권'),   -- 급등 150위(p_top 100 밖)
  ('900004', '라온소재',     'KOSPI',  'KR7900004005', '주권'),   -- 관심만
  ('900005', '마루텍',       'KOSDAQ', 'KR7900005002', '주권'),   -- 5분 전 등록 · 1분 전 수집
  ('900006', '바다식품',     'KOSPI',  'KR7900006000', '주권'),   -- 20분 전 등록
  ('900007', '사랑에너지',   'KOSDAQ', 'KR7900007008', '주권'),   -- 12분 전 등록
  ('900008', '프로티아',     'KOSDAQ', 'KR7900008006', '주권'),   -- 공시 종류(두 낱말 회사명)
  ('900009', 'KODEX 테스트', 'KOSPI',  'KR7900009004', 'ETF'),    -- 종목 정보 증권그룹
  ('900010', '아라전기',     'KOSPI',  'KR7900010002', '주권');   -- 옛 scan 의 급등 2위

-- 급등: 최신 scan(지금) 3행 + 옛 scan(10분 전) 1행
INSERT INTO public.top_movers (code, name, market, rank, ranked_at, scan_id, updated_at) VALUES
  ('900001', '가람전자',   'KOSDAQ', 1,   now(),                        '11111111-1111-4111-8111-111111111111', now()),
  ('900002', '나래테크',   'KOSDAQ', 50,  now(),                        '11111111-1111-4111-8111-111111111111', now()),
  ('900003', '다온바이오', 'KOSDAQ', 150, now(),                        '11111111-1111-4111-8111-111111111111', now()),
  ('900010', '아라전기',   'KOSPI',  2,   now() - interval '10 minutes', '00000000-0000-4000-8000-000000000000', now());

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004102', 't41-02@example.invalid');
INSERT INTO public.watchlists (user_id, stock_code) VALUES
  ('00000000-0000-4000-8000-000000004102', '900001'),
  ('00000000-0000-4000-8000-000000004102', '900004');

INSERT INTO public.kis_news_targets (stock_code, last_requested_at, last_collected_at) VALUES
  ('900002', NULL,                          now() - interval '5 minutes'),
  ('900005', now() - interval '5 minutes',  now() - interval '1 minute'),
  ('900006', now() - interval '20 minutes', NULL),
  ('900007', now() - interval '12 minutes', NULL),
  ('999999', now() - interval '3 minutes',  NULL),                           -- 마스터에 없는 코드(최근 등록)
  ('800001', now() - interval '2 days',     NULL),                           -- 정리 대상
  ('800002', now() - interval '2 days',     now() - interval '1 hour');      -- 등록은 오래됐지만 수집 중 → 유지

-- 결과 배열에서 코드 하나의 항목 · 코드 배열(순서 그대로).
CREATE FUNCTION pg_temp.tgt(p_r jsonb, p_code text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p_r) e WHERE e->>'code' = p_code
$$;
CREATE FUNCTION pg_temp.codes(p_r jsonb) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(e->>'code' ORDER BY i), ARRAY[]::text[])
    FROM jsonb_array_elements(p_r) WITH ORDINALITY AS x(e, i)
$$;

-- ── L. 임대 ───────────────────────────────────────────────────────
SELECT is(public.kis_news_lease_acquire('A', 90), true, 'L1 빈 상태 → A 획득');
SELECT is((SELECT lease_holder FROM public.kis_news_state WHERE id = 1), 'A', 'L2 lease_holder = A');
SELECT is((SELECT lease_until FROM public.kis_news_state WHERE id = 1), now() + interval '90 seconds',
          'L3 lease_until = now + TTL');
SELECT is(public.kis_news_lease_acquire('B', 90), false, 'L4 살아 있는 임대 → B 거절');
SELECT is(public.kis_news_lease_acquire('A', 120), true, 'L5 같은 실행 연장 → true');
SELECT is((SELECT lease_until FROM public.kis_news_state WHERE id = 1), now() + interval '120 seconds',
          'L6 연장 → lease_until 갱신');
UPDATE public.kis_news_state SET lease_until = now() - interval '1 second' WHERE id = 1;
SELECT is(public.kis_news_lease_acquire('B', 90), true, 'L7 만료 뒤 → B 넘겨받음');
SELECT is(public.kis_news_lease_release('A'), false, 'L8 주인 아닌 해제 → false');
SELECT is((SELECT lease_holder FROM public.kis_news_state WHERE id = 1), 'B', 'L9 주인 아닌 해제 뒤에도 B');
SELECT is(public.kis_news_lease_release('B'), true, 'L10 주인 해제 → true');
SELECT ok((SELECT lease_holder IS NULL AND lease_until IS NULL FROM public.kis_news_state WHERE id = 1),
          'L11 해제 뒤 lease_holder · lease_until NULL');
SELECT throws_ok($$SELECT public.kis_news_lease_acquire('A', 0)$$, '22023', NULL, 'L12 TTL ≤ 0 → 예외');
SELECT throws_ok($$SELECT public.kis_news_lease_acquire('', 90)$$, '22023', NULL, 'L13 빈 holder → 예외');

-- ── T. 대상 목록 ──────────────────────────────────────────────────
SELECT is(pg_temp.codes(public.kis_news_targets_list(100, 10, 200)),
          ARRAY['900001', '900004', '900002', '900005'],
          'T1 급등 2(순위 ≤ 100 · 최신 scan) + 관심 1 + 최근 등록 1 · 마스터 밖 제외 · 수집 전 먼저 → 오래 전 수집 순');
SELECT is(pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900001')->'reasons', '["mover", "watch"]'::jsonb,
          'T2 급등 + 관심 같은 코드 → 한 줄 · reasons 둘');
SELECT is((pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900001')->>'rank')::int, 1, 'T3 급등 rank');
SELECT ok(pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900004')->'rank' = 'null'::jsonb
          AND pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900004')->'reasons' = '["watch"]'::jsonb,
          'T4 관심만 → reasons [watch] · rank null');
SELECT is(pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900005')->'reasons', '["registered"]'::jsonb,
          'T5 최근 등록 → reasons [registered]');
SELECT is((pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900005')->>'last_collected_at')::timestamptz,
          now() - interval '1 minute', 'T6 last_collected_at 그대로');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.tgt(public.kis_news_targets_list(100, 10, 200), '900002')) k),
          ARRAY['code', 'last_collected_at', 'last_requested_at', 'rank', 'reasons'], 'T7 원소 키 집합');
SELECT is(pg_temp.codes(public.kis_news_targets_list(10, 10, 200)), ARRAY['900001', '900004', '900005'],
          'T8 p_top 10 → 50위 빠짐');
SELECT ok('900007' = ANY (pg_temp.codes(public.kis_news_targets_list(100, 30, 2)))
          AND NOT '900006' = ANY (pg_temp.codes(public.kis_news_targets_list(100, 30, 2))),
          'T9 등록 3개 · 상한 2 → 최근 2개만(마스터 밖 코드는 자리를 먹지 않는다)');
SELECT ok('900006' = ANY (pg_temp.codes(public.kis_news_targets_list(100, 30, 3))), 'T10 상한 3 → 20분 전 등록 포함');
SELECT is(jsonb_typeof(public.kis_news_targets_list(100, 10, 200)), 'array', 'T11 반환은 jsonb 배열');

-- ── M. 종목 정보 ──────────────────────────────────────────────────
SELECT is(jsonb_typeof(public.kis_news_stock_meta()), 'object', 'M1 반환은 jsonb 객체');
SELECT is(public.kis_news_stock_meta()->'900009', '{"n": "KODEX 테스트", "g": "ETF"}'::jsonb, 'M2 {n, g}');
SELECT is(public.kis_news_stock_meta()->'900001'->>'n', '가람전자', 'M3 이름');

-- ── 공시 · 뉴스 픽스처(지난 평일 KST 날 하나) ─────────────────────
CREATE TEMP TABLE fx_day AS
  SELECT d::date AS d
    FROM generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - 7, (now() AT TIME ZONE 'Asia/Seoul')::date - 1,
                         interval '1 day') AS g(d)
   WHERE extract(isodow FROM d) <= 5
   ORDER BY d DESC
   LIMIT 1;

-- 행 하나 넣기: 작성 = 그 날 KST p_hhmm · 받음 = 작성 + p_lag 초.
CREATE FUNCTION pg_temp.put(p_srno text, p_provider text, p_kind text, p_title text, p_hhmm text, p_lag integer,
                            p_code text, p_via text, p_hidden text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz;
BEGIN
  SELECT ((d + p_hhmm::time) AT TIME ZONE 'Asia/Seoul') INTO v_at FROM fx_day;
  INSERT INTO public.kis_news (srno, provider_code, source, kind, category, title, title_key, written_at, written_date, received_at)
  VALUES (p_srno, p_provider, CASE p_provider WHEN 'F' THEN '거래소 공시' WHEN 'G' THEN '코스닥 공시' ELSE '연합뉴스' END,
          p_kind, '01', p_title, 'k-' || p_srno, v_at, (v_at AT TIME ZONE 'Asia/Seoul')::date,
          v_at + make_interval(secs => p_lag));
  INSERT INTO public.kis_news_stocks (srno, stock_code, via, hidden_reason, written_at)
  VALUES (p_srno, p_code, p_via, p_hidden, v_at);
END $$;

SELECT pg_temp.put('D1', 'G', 'disclosure', '(주)가람전자 단일판매ㆍ공급계약체결',           '09:00', 10, '900001', 'feed');
SELECT pg_temp.put('D2', 'G', 'disclosure', '나래테크(주) 단일판매ㆍ공급계약체결',           '09:05', 20, '900002', 'feed');
SELECT pg_temp.put('D3', 'F', 'disclosure', '(정정) 라온소재 유상증자결정',                   '10:00', 30, '900004', 'feed');
SELECT pg_temp.put('D4', 'F', 'disclosure', '라온소재 유상증자결정',                           '09:30', 40, '900004', 'feed');
SELECT pg_temp.put('D5', 'G', 'disclosure', '주식회사 프로티아 공매도 과열종목 지정(2026.11.12)', '08:10', 50, '900008', 'feed');
SELECT pg_temp.put('D7', 'G', 'disclosure', '마루텍 단일판매ㆍ공급계약체결',                 '11:00', 60, '900005', 'feed', 'derivative_notice');
SELECT pg_temp.put('D8', 'G', 'disclosure', '없는회사 최대주주변경',                           '13:00', 70, '900006', 'stock');
SELECT pg_temp.put('D9', 'G', 'disclosure', '사랑에너지 주식등의대량보유상황보고서',         '22:00', 3600, '900007', 'feed');
SELECT pg_temp.put('N1', '2', 'news',       '가람전자, 대형 공급계약 수주에 강세',             '09:20', 50, '900001', 'feed');

-- 정리 픽스처(보관 창 밖 · 안)
INSERT INTO public.kis_news (srno, provider_code, source, kind, title, title_key, written_at, written_date) VALUES
  ('C-OLD', 'G', '코스닥 공시', 'disclosure', '가람전자 옛 공시', 'k-old', now() - interval '91 days',
   ((now() - interval '91 days') AT TIME ZONE 'Asia/Seoul')::date),
  ('C-NEW', 'G', '코스닥 공시', 'disclosure', '가람전자 열흘 전 공시', 'k-new', now() - interval '10 days',
   ((now() - interval '10 days') AT TIME ZONE 'Asia/Seoul')::date);
INSERT INTO public.kis_news_stocks (srno, stock_code, via, written_at) VALUES
  ('C-OLD', '900001', 'feed', now() - interval '91 days'),
  ('C-NEW', '900001', 'feed', now() - interval '10 days');

UPDATE public.kis_news_state SET feed_at = now() - interval '30 seconds' WHERE id = 1;
INSERT INTO public.api_usage (service, usage_date, count) VALUES
  ('kis_news_title', (now() AT TIME ZONE 'Asia/Seoul')::date, 1234),
  ('kis_news_title', (now() AT TIME ZONE 'Asia/Seoul')::date - 1, 99999);   -- 어제 값은 세지 않는다

-- ── S. 운영 수치 ──────────────────────────────────────────────────
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.kis_news_ops_stats(7)) k),
          ARRAY['by_kind', 'by_via', 'days', 'feed_at', 'lag_seconds', 'rows_total', 'strikes_today', 'targets_active', 'usage_today'],
          'S1 키 집합');
SELECT is((public.kis_news_ops_stats(7)->>'days')::int, 7, 'S2 days');
SELECT is((public.kis_news_ops_stats(7)->>'rows_total')::int, 9, 'S3 rows_total — 7일 창(10일 · 91일 글 제외)');
SELECT is(public.kis_news_ops_stats(7)->'by_kind', '{"disclosure": 8, "news": 1}'::jsonb, 'S4 종류별');
SELECT is(public.kis_news_ops_stats(7)->'by_via', '{"feed": 8, "stock": 1}'::jsonb, 'S5 경로별(글 수)');
SELECT is((public.kis_news_ops_stats(7)->'lag_seconds'->>'disclosure_p50')::numeric, 40::numeric,
          'S6 공시 지연 중앙값(평일 07:00 ~ 20:00 작성분만 · 22:00 글 제외)');
SELECT is((public.kis_news_ops_stats(7)->'lag_seconds'->>'disclosure_p90')::numeric, 64::numeric, 'S7 공시 지연 90%');
SELECT is((public.kis_news_ops_stats(7)->'lag_seconds'->>'news_p50')::numeric, 50::numeric, 'S8 뉴스 지연 중앙값');
SELECT is((public.kis_news_ops_stats(7)->>'feed_at')::timestamptz, now() - interval '30 seconds', 'S9 feed_at');
SELECT is((public.kis_news_ops_stats(7)->>'targets_active')::int, 2, 'S10 최근 10분 등록 수(마스터 밖 포함)');
SELECT is((public.kis_news_ops_stats(7)->>'usage_today')::bigint, 1234::bigint, 'S11 오늘(KST) 한투 호출 수');
SELECT is((public.kis_news_ops_stats(7)->>'strikes_today')::bigint, 0::bigint, 'S12 한도 의심 표시 없으면 0');
SELECT is((public.kis_news_ops_stats(1)->>'rows_total')::int,
          (SELECT count(*)::int FROM public.kis_news WHERE written_at >= now() - interval '1 day'),
          'S13 p_days 가 창을 정한다');

-- ── K. 공시 종류 ──────────────────────────────────────────────────
CREATE FUNCTION pg_temp.kind(p_provider text, p_label text, p_hidden text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(public.kis_disclosure_kinds(7)) e
   WHERE e->>'provider_code' = p_provider AND e->>'kind_label' = p_label
     AND (e->>'hidden_reason') IS NOT DISTINCT FROM p_hidden
$$;
SELECT is((pg_temp.kind('G', '단일판매ㆍ공급계약체결')->>'count')::int, 2,
          'K1 같은 종류 다른 회사((주) 앞 · 뒤) → 한 묶음 2건');
SELECT is((pg_temp.kind('G', '공매도 과열종목 지정(2026.11.12)')->>'count')::int, 1,
          'K2 「주식회사 프로티아 …」 → 마스터 이름으로 회사명 걷힘');
SELECT is((pg_temp.kind('F', '유상증자결정')->>'count')::int, 2, 'K3 (정정) 떼고 같은 묶음');
SELECT is((pg_temp.kind('F', '유상증자결정')->>'corrected_count')::int, 1, 'K4 (정정) 은 corrected_count 로 따로 셈');
SELECT is((pg_temp.kind('G', '단일판매ㆍ공급계약체결', 'derivative_notice')->>'count')::int, 1, 'K5 숨김 사유별로 다른 묶음');
SELECT is((pg_temp.kind('G', '최대주주변경')->>'count')::int, 1, 'K6 마스터 이름이 제목에 없으면 첫 낱말 걷기');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(public.kis_disclosure_kinds(7)) e WHERE e->>'provider_code' = '2'),
          0, 'K7 뉴스는 빠진다');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.kind('F', '유상증자결정')) k),
          ARRAY['corrected_count', 'count', 'example_title', 'hidden_reason', 'kind_label', 'latest_at', 'provider_code'],
          'K8 원소 키 집합');
SELECT is(pg_temp.kind('F', '유상증자결정')->>'example_title', '(정정) 라온소재 유상증자결정', 'K9 예시 제목 = 가장 최근 글');
SELECT is((public.kis_disclosure_kinds(7)->0->>'count')::int, 2, 'K10 건수 내림차순(첫 묶음 = 최다)');
SELECT is((SELECT sum((e->>'count')::int)::int FROM jsonb_array_elements(public.kis_disclosure_kinds(7)) e), 8,
          'K11 묶음 건수 합 = 창 안 공시 수');

-- ── C. 정리 ───────────────────────────────────────────────────────
SELECT is(public.kis_news_cleanup(90, 1), '{"news_deleted": 1, "targets_deleted": 1}'::jsonb,
          'C1 반환 {news_deleted, targets_deleted}');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news WHERE srno = 'C-OLD'), 'C2 91일 전 글 삭제');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news_stocks WHERE srno = 'C-OLD'), 'C3 연결도 삭제(cascade)');
SELECT ok(EXISTS (SELECT 1 FROM public.kis_news WHERE srno = 'C-NEW'), 'C4 10일 전 글 유지');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news_targets WHERE stock_code = '800001'), 'C5 2일 전 마지막 조회 등록 행 삭제');
SELECT ok(EXISTS (SELECT 1 FROM public.kis_news_targets WHERE stock_code = '800002'),
          'C6 등록은 오래됐어도 최근 수집된 행은 유지(collectedAt 보존)');
SELECT is((SELECT cleanup_date FROM public.kis_news_state WHERE id = 1), (now() AT TIME ZONE 'Asia/Seoul')::date,
          'C7 cleanup_date = KST 오늘');

-- ── P. 권한 · 함수 속성 ────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, f.sig, 'EXECUTE'), r.expect,
          format('P %s EXECUTE %s = %s', r.role, f.sig, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 CROSS JOIN (VALUES
   ('public.kis_news_lease_acquire(text,integer)'),
   ('public.kis_news_lease_release(text)'),
   ('public.kis_news_targets_list(integer,integer,integer)'),
   ('public.kis_news_stock_meta()'),
   ('public.kis_news_cleanup(integer,integer)'),
   ('public.kis_disclosure_kinds(integer)'),
   ('public.kis_news_ops_stats(integer)')) AS f(sig)
 ORDER BY f.sig, r.role;
SELECT ok(NOT (SELECT bool_or(prosecdef) FROM pg_proc
                WHERE oid IN ('public.kis_news_lease_acquire(text,integer)'::regprocedure,
                              'public.kis_news_lease_release(text)'::regprocedure,
                              'public.kis_news_targets_list(integer,integer,integer)'::regprocedure,
                              'public.kis_news_stock_meta()'::regprocedure,
                              'public.kis_news_cleanup(integer,integer)'::regprocedure,
                              'public.kis_disclosure_kinds(integer)'::regprocedure,
                              'public.kis_news_ops_stats(integer)'::regprocedure)),
          'P 7개 함수 SECURITY INVOKER');
SELECT is(has_table_privilege(r.role, 'public.kis_access_tokens', 'SELECT'), r.expect,
          format('P %s SELECT kis_access_tokens = %s', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kis_access_tokens'::regclass), 'P kis_access_tokens RLS 활성');

SELECT * FROM finish();
ROLLBACK;
