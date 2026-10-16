-- ============================================================
-- Phase 33 Plan 02 — 팀 매집 보고서 RPC teamflow_report_for_user pgTAP.
--
-- 대상: 20261016200100_teamflow_report_rpc.sql. 적재는 20261016200000 의 stage → limitup_commit_day(team_flow 쌍)로 채운다.
--
-- 잠그는 것(D-05 · D-07):
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 · NULL → {"access": false} 만
--   - 이력 0 → {access: true, dates: [], date: null, rows: []}
--   - dates = team_flow 행이 있는 날짜 내림차순 — 0행 commit 날짜 · 옛 워커 적재 날짜(키 없음)는 빠진다
--   - p_date 없음 = 최신 행 있는 날짜 · 행 없는 날짜 p_date → rows [] (date 는 그 값 · dates 그대로)
--   - 정렬 team_net_val DESC NULLS LAST, isin · rows[] = 평평한 열(snake_case) + payload 중첩 그대로
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · STABLE
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-tf1 → KB120 …7833(가시 계좌 있음) · U3 dma-tf3(자격증명만 · 계좌 매핑 없음) — limitup_report.test.sql 동형.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(28);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003301', 'tf-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003303', 'tf-u3@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-tf1','dma-tf3']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('tf-u1@example.invalid','trader','dma-tf1'),
  ('tf-u3@example.invalid','trader','dma-tf3');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-tf1","account_no":"1234567833","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003301'::uuid $$;
CREATE FUNCTION pg_temp.u3() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003303'::uuid $$;

CREATE FUNCTION pg_temp.st(p_date text, p_tbl text, p_seq int, p_payload jsonb) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.limitup_stage (date, tbl, seq, payload)
  VALUES (p_date, p_tbl, p_seq, jsonb_build_object('date', p_date) || p_payload)
$$;
-- team_flow export 행(limitup_load.test.sql J 절과 같은 모양).
CREATE FUNCTION pg_temp.tf(p_isin text, p_net bigint, p_share double precision) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'isin', p_isin, 'short_code', right(p_isin, 6), 'name', '팀종목' || right(p_isin, 2), 'market', 'KOSDAQ',
    'base', 10000, 'upper', 13000, 'first_limit_ms', NULL, 'first_limit_auction', false,
    'last_ms', 1792130000000, 'last_px', 12980, 'last_rate', 29.8, 'status', 'below',
    'volume', 123456, 'value', 1500000000, 'team_net_val', p_net, 'team_buy_share', p_share, 'schema_version', 1,
    'payload', jsonb_build_object(
      'bands', jsonb_build_array(
        jsonb_build_object('label', '0~5%', 'net_val', -9836500, 'share', 0.1),
        jsonb_build_object('label', '하루 합계', 'net_val', p_net, 'share', p_share)),
      'buckets', jsonb_build_array(jsonb_build_object('key', 54, 'start', '09:00', 'net_val', -7263500)),
      'window', NULL, 'members', NULL,
      'summary_lines', jsonb_build_array('팀 순매수 <b>+1.0억</b>')))
$$;
-- 결과 rows[] 의 isin 배열(원소 순서 그대로).
CREATE FUNCTION pg_temp.isins(p_r jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(e->'isin' ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(p_r->'rows') WITH ORDINALITY AS x(e, n)
$$;

-- ── A. 게이트 ──────────────────────────────────────────────────────
SELECT is(public.teamflow_report_for_user(pg_temp.u3()), '{"access": false}'::jsonb,
          'A U3(가시 계좌 없음) → {"access": false} 만');
SELECT is(public.teamflow_report_for_user(pg_temp.u3(), '20261014'), '{"access": false}'::jsonb,
          'A U3(p_date 지정) → {"access": false} 만');
SELECT is(public.teamflow_report_for_user(NULL), '{"access": false}'::jsonb,
          'A p_user_id null → {"access": false}');

-- ── B. 이력 0 ──────────────────────────────────────────────────────
SELECT is(public.teamflow_report_for_user(pg_temp.u1()),
          '{"access": true, "dates": [], "date": null, "rows": []}'::jsonb,
          'B U1 team_flow 이력 0 → dates [] · date null · rows []');
SELECT is(public.teamflow_report_for_user(pg_temp.u1(), '20261014'),
          '{"access": true, "dates": [], "date": null, "rows": []}'::jsonb,
          'B U1 이력 0 + p_date → 같은 빈 모양');

-- ── C. 적재 ────────────────────────────────────────────────────────
-- 20261013: 2행(+100억 · −50억)
SELECT pg_temp.st('20261013', 'team_flow', 1, pg_temp.tf('KR7000000202', -5000000000, 0.1));
SELECT pg_temp.st('20261013', 'team_flow', 2, pg_temp.tf('KR7000000201', 10000000000, 0.4));
SELECT public.limitup_commit_day('20261013', 'mf-1013', 'sig-1013', 1, '{"team_flow":2}');
-- 20261014: 3행 — +5억 동률 isin 23 · 21(역순 삽입) · team_net_val null 22
SELECT pg_temp.st('20261014', 'team_flow', 1, pg_temp.tf('KR7000000223', 500000000, 0.2));
SELECT pg_temp.st('20261014', 'team_flow', 2, pg_temp.tf('KR7000000222', NULL, NULL));
SELECT pg_temp.st('20261014', 'team_flow', 3, pg_temp.tf('KR7000000221', 500000000, 0.26));
SELECT public.limitup_commit_day('20261014', 'mf-1014', 'sig-1014', 1, '{"team_flow":3}');
-- 20261010: team_flow 0 commit(파일 없는 날짜 — 이력은 있다) · 20261011: 옛 워커 commit(team_flow 키 없음)
SELECT pg_temp.st('20261010', 'entries', 1, '{"isin":"KR7000000210","schema_version":1}');
SELECT public.limitup_commit_day('20261010', 'mf-1010', 'sig-1010', 1, '{"entries":1,"team_flow":0}');
SELECT pg_temp.st('20261011', 'entries', 1, '{"isin":"KR7000000211","schema_version":1}');
SELECT public.limitup_commit_day('20261011', 'mf-1011', 'sig-1011', 1, '{"entries":1}');

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb);
INSERT INTO t_r VALUES
  ('latest', public.teamflow_report_for_user(pg_temp.u1())),
  ('d1013',  public.teamflow_report_for_user(pg_temp.u1(), '20261013')),
  ('d1010',  public.teamflow_report_for_user(pg_temp.u1(), '20261010')),
  ('d1011',  public.teamflow_report_for_user(pg_temp.u1(), '20261011'));
CREATE FUNCTION pg_temp.r(p_label text) RETURNS jsonb LANGUAGE sql AS $$ SELECT r FROM t_r WHERE label = p_label $$;

SELECT is(public.teamflow_report_for_user(pg_temp.u3()), '{"access": false}'::jsonb,
          'C 적재 뒤에도 U3 → {"access": false} 만');

-- ── D. 날짜 규칙(D-07) ───────────────────────────────────────────────
SELECT is(pg_temp.r('latest')->'dates', '["20261014", "20261013"]'::jsonb,
          'D dates = 행 있는 날짜 내림차순(0행 commit 20261010 · 옛 워커 20261011 제외)');
SELECT is(pg_temp.r('latest')->>'date', '20261014', 'D p_date 없음 → 최신 행 있는 날짜');
SELECT is(pg_temp.r('latest')->>'access', 'true', 'D access true');

-- ── E. 정렬 ────────────────────────────────────────────────────────
SELECT is(jsonb_array_length(pg_temp.r('latest')->'rows'), 3, 'E 20261014 rows 3');
SELECT is(pg_temp.isins(pg_temp.r('latest')), '["KR7000000221", "KR7000000223", "KR7000000222"]'::jsonb,
          'E team_net_val DESC · 동률 isin 오름차순 · null 맨 뒤');
SELECT is(pg_temp.r('d1013')->>'date', '20261013', 'E p_date 20261013 → date 그 값');
SELECT is(pg_temp.isins(pg_temp.r('d1013')), '["KR7000000201", "KR7000000202"]'::jsonb,
          'E 20261013 rows +100억 → −50억');

-- ── F. 행 없는 날짜 ────────────────────────────────────────────────
SELECT is(pg_temp.r('d1010')->'rows', '[]'::jsonb, 'F p_date 20261010(0행 commit) → rows []');
SELECT is(pg_temp.r('d1010')->>'date', '20261010', 'F p_date 20261010 → date 그 값(404 아님)');
SELECT is(pg_temp.r('d1010')->'dates', '["20261014", "20261013"]'::jsonb, 'F 행 없는 날짜여도 dates 그대로');
SELECT is(pg_temp.r('d1011')->'rows', '[]'::jsonb, 'F p_date 20261011(옛 워커 적재) → rows []');

-- ── G. 행 모양 — 평평한 열 + payload 중첩 그대로 ─────────────────────
SELECT is(pg_temp.r('latest')->'rows'->0->'payload'->'bands'->0->>'label', '0~5%', 'G rows[0].payload.bands[0].label');
SELECT is(pg_temp.r('latest')->'rows'->0->'payload'->'bands'->1->>'label', '하루 합계', 'G rows[0].payload.bands[1].label');
SELECT is(jsonb_typeof(pg_temp.r('latest')->'rows'->0->'payload'->'buckets'), 'array', 'G rows[0].payload.buckets 배열');
SELECT is((pg_temp.r('latest')->'rows'->0->>'team_buy_share')::double precision, 0.26::double precision,
          'G rows[0].team_buy_share = 0.26');
SELECT ok(pg_temp.r('latest')->'rows'->0 ? 'first_limit_ms'
          AND jsonb_typeof(pg_temp.r('latest')->'rows'->0->'first_limit_ms') = 'null',
          'G rows[0].first_limit_ms 키 있음 · null');
SELECT is(jsonb_typeof(pg_temp.r('latest')->'rows'->2->'team_net_val'), 'null', 'G rows[2].team_net_val null(맨 뒤 행)');

-- ── H. 권한 · 함수 속성 ────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, 'public.teamflow_report_for_user(uuid,text)', 'EXECUTE'), r.expect,
          format('H %s EXECUTE teamflow_report_for_user = %s', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.teamflow_report_for_user(uuid,text)'::regprocedure),
          'H SECURITY INVOKER(prosecdef false)');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'public.teamflow_report_for_user(uuid,text)'::regprocedure),
          's', 'H STABLE');

SELECT * FROM finish();
ROLLBACK;
