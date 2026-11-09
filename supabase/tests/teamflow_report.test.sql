-- ============================================================
-- Phase 33 Plan 02 — 팀 매집 보고서 RPC teamflow_report_for_user pgTAP.
--
-- 대상: 20261016200100_teamflow_report_rpc.sql · 20261102200200_teamflow_report_t20.sql(Phase 37 D-17 행 t20_ms 재정의).
--       20261109400000_teamflow_report_tick_team_net.sql(quick 261109-kzk 행 tick_team_fills · tick_team_day_net_krw · 유효값 정렬). 적재는 20261016200000 의 stage → limitup_commit_day(team_flow 쌍)로 채운다.
--
-- 잠그는 것(D-05 · D-07):
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 · NULL → {"access": false} 만
--   - 이력 0 → {access: true, dates: [], date: null, rows: []}
--   - dates = team_flow 행이 있는 날짜 내림차순 — 0행 commit 날짜 · 옛 워커 적재 날짜(키 없음)는 빠진다
--   - p_date 없음 = 최신 행 있는 날짜 · 행 없는 날짜 p_date → rows [] (date 는 그 값 · dates 그대로)
--   - 정렬 team_net_val DESC NULLS LAST, isin · rows[] = 평평한 열(snake_case) + payload 중첩 그대로
--   - (Phase 37 D-17) rows[].t20_ms = 그날 limitup_entries (date, isin) 의 t20_ms · entries 없으면 키 있음 · null
--   - (quick 261109-kzk J) rows[].tick_team_fills · tick_team_day_net_krw = tick_grids (date, 'KRX', isin) 팀 칸(NXT 아님 · 격자 없음 null) ·
--     정렬 = 유효값(fills null → team_net_val · > 0 → team_day_net_krw · 0 → null) DESC NULLS LAST, isin · team_net_val 열은 export 그대로
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · STABLE
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-tf1 → KB120 …7833(가시 계좌 있음) · U3 dma-tf3(자격증명만 · 계좌 매핑 없음) — limitup_report.test.sql 동형.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(38);

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
-- Phase 37 D-17 — isin 21 만 entries(t20_ms) · 23 · 22 는 entries 없음
SELECT pg_temp.st('20261014', 'entries', 1, '{"isin":"KR7000000221","schema_version":1,"t20_ms":1792130100000}');
SELECT public.limitup_commit_day('20261014', 'mf-1014', 'sig-1014', 1, '{"entries":1,"team_flow":3}');
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

-- ── I. (Phase 37 D-17) 행 t20_ms — limitup_entries LEFT JOIN ─────────
SELECT is((pg_temp.r('latest')->'rows'->0->>'t20_ms')::bigint, 1792130100000::bigint,
          'I rows[0](KR7000000221 · entries 있음).t20_ms = entries 값');
SELECT ok(pg_temp.r('latest')->'rows'->1 ? 't20_ms'
          AND jsonb_typeof(pg_temp.r('latest')->'rows'->1->'t20_ms') = 'null',
          'I rows[1](KR7000000223 · entries 없음).t20_ms 키 있음 · null');

-- ── J. (quick 261109-kzk) 팀 순매수 = 틱뷰어 당일순매수 — tick_grids KRX 행 LEFT JOIN ─────
-- 20261009: export +1억(231) · +2억(232) · +2.5억(233) · −1억(234). 격자 — 231 KRX 팀 +3억(NXT −7억은 무시) ·
-- 232 KRX 팀 체결 0 · 233 KRX 팀 키 없음(옛 워커 · 미계산) · 234 격자 없음.
CREATE FUNCTION pg_temp.grow(p_date text, p_ex text, p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'date', p_date, 'exchange', p_ex, 'isin', p_isin, 'sources', jsonb_build_array('accum'),
    'object_path', 'grid/' || p_date || '/' || p_ex || '/' || p_isin || '.nightly.ticks.zst',
    'bytes', 1000, 'records', 50, 'a3_count', 20, 'first_recv_ms', 1793000000000, 'last_recv_ms', 1793000100000,
    'base_px', 10000, 'high_rate', 29.9, 'last_rate', 12.5)
$$;
CREATE FUNCTION pg_temp.team(p_row jsonb, p_fills integer, p_net bigint, p_pnl bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT p_row || jsonb_build_object('team_fills', p_fills, 'team_day_net_krw', p_net, 'team_day_pnl_krw', p_pnl)
$$;
SELECT pg_temp.st('20261009', 'team_flow', 1, pg_temp.tf('KR7000000231', 100000000, 0.1));
SELECT pg_temp.st('20261009', 'team_flow', 2, pg_temp.tf('KR7000000232', 200000000, 0.1));
SELECT pg_temp.st('20261009', 'team_flow', 3, pg_temp.tf('KR7000000233', 250000000, 0.1));
SELECT pg_temp.st('20261009', 'team_flow', 4, pg_temp.tf('KR7000000234', -100000000, 0.1));
SELECT public.limitup_commit_day('20261009', 'mf-1009', 'sig-1009', 1, '{"team_flow":4}');
SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
  pg_temp.team(pg_temp.grow('20261009', 'KRX', 'KR7000000231'), 5, 300000000, 1),
  pg_temp.team(pg_temp.grow('20261009', 'NXT', 'KR7000000231'), 2, -700000000, 1),
  pg_temp.team(pg_temp.grow('20261009', 'KRX', 'KR7000000232'), 0, NULL, NULL),
  pg_temp.grow('20261009', 'KRX', 'KR7000000233')));
INSERT INTO t_r VALUES ('d1009', public.teamflow_report_for_user(pg_temp.u1(), '20261009'));
CREATE FUNCTION pg_temp.row(p_label text, p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(pg_temp.r(p_label)->'rows') e WHERE e->>'isin' = p_isin
$$;

SELECT is(pg_temp.isins(pg_temp.r('d1009')), '["KR7000000231", "KR7000000233", "KR7000000234", "KR7000000232"]'::jsonb,
          'J1 정렬 = 틱 +3억 → export +2.5억(미계산) → export −1억(격자 없음) → 팀 체결 0(맨 뒤)');
SELECT ok((pg_temp.row('d1009', 'KR7000000231')->>'tick_team_fills')::int = 5
          AND (pg_temp.row('d1009', 'KR7000000231')->>'tick_team_day_net_krw')::bigint = 300000000,
          'J2 231 tick_team_fills 5 · tick_team_day_net_krw +3억(KRX 행 — NXT −7억 아님)');
SELECT is((pg_temp.row('d1009', 'KR7000000231')->>'team_net_val')::bigint, 100000000::bigint,
          'J3 231 team_net_val = export +1억 그대로');
SELECT ok((pg_temp.row('d1009', 'KR7000000232')->>'tick_team_fills')::int = 0
          AND pg_temp.row('d1009', 'KR7000000232') ? 'tick_team_day_net_krw'
          AND jsonb_typeof(pg_temp.row('d1009', 'KR7000000232')->'tick_team_day_net_krw') = 'null',
          'J4 232 tick_team_fills 0 · tick_team_day_net_krw 키 있음 · null');
SELECT ok(pg_temp.row('d1009', 'KR7000000233') ? 'tick_team_fills'
          AND jsonb_typeof(pg_temp.row('d1009', 'KR7000000233')->'tick_team_fills') = 'null',
          'J5 233(팀 키 없는 옛 격자) tick_team_fills 키 있음 · null');
SELECT ok(pg_temp.row('d1009', 'KR7000000234') ? 'tick_team_fills'
          AND pg_temp.row('d1009', 'KR7000000234') ? 'tick_team_day_net_krw'
          AND jsonb_typeof(pg_temp.row('d1009', 'KR7000000234')->'tick_team_fills') = 'null'
          AND jsonb_typeof(pg_temp.row('d1009', 'KR7000000234')->'tick_team_day_net_krw') = 'null',
          'J6 234(격자 없음) 두 키 있음 · null');
SELECT ok(pg_temp.row('d1009', 'KR7000000231') ? 't20_ms', 'J7 231 t20_ms 키 여전히 있음');
SELECT ok(pg_temp.r('latest')->'rows'->0 ? 'tick_team_fills'
          AND jsonb_typeof(pg_temp.r('latest')->'rows'->0->'tick_team_fills') = 'null',
          'J8 latest(20261014 · 격자 없음) rows[0].tick_team_fills 키 있음 · null');

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
