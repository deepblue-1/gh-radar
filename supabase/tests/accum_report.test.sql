-- ============================================================
-- Phase 34 Plan 05 — 매집감지 보고서 RPC accum_report_for_user · accum_detail_for_user pgTAP.
--
-- 대상: 20261020200100_accum_report_rpc.sql (+ 20261021140000 목록 pnl). 적재는 20261020200000 의 stage → limitup_commit_day(accum_flow 10번째 쌍)로 채운다.
--
-- 잠그는 것(D-03 · D-06 · D-07):
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 · NULL → 두 RPC 모두 {"access": false} 만
--   - 이력 0 → 목록 {access: true, dates: [], date: null, rows: []} · 상세 {access: true, row: null}
--   - dates = limitup_accum_flow 행이 있는 날짜 내림차순 · p_date 없음 = 최신 · 행 없는 날짜 p_date → rows [] (dates 그대로)
--   - 정렬 state, pos_net_krw DESC NULLS LAST, isin
--   - 목록 rows 는 평평한 37열 + pnl(payload.pnl 그대로 · 20261021140000) — 어느 행에도 payload 키가 없다(Pitfall 6) ·
--     당일 축 4열(quick-261025-uf2 · 20261025200000)도 없다(목록 RPC 37열 명시 그대로) ·
--     상세 row 는 41열(37 + 당일 축 4) + payload(to_jsonb) · 없는 (date, isin) → row null
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY INVOKER · STABLE ·
--     limitup_accum_flow RLS 활성 · 정책 0 · anon/authenticated SELECT 불가
--   - D-03(RESEARCH Pitfall 8 정정): 탐지 0 거래일(6표 0 · 파생 0 · team_flow 0 · accum_flow 1 commit)은
--     매집감지 dates 에 있고 · 상한가 보고서 dates 에도 있으며(files_sig 기준 — 빈 날 문구로 그린다) · 팀 매집 dates 에는 없다
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/accum_report.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-af1 → KB120 …7834(가시 계좌 있음) · U3 dma-af3(자격증명만 · 계좌 매핑 없음) — teamflow_report.test.sql 동형.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(55);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003401', 'af-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003403', 'af-u3@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-af1','dma-af3']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('af-u1@example.invalid','trader','dma-af1'),
  ('af-u3@example.invalid','trader','dma-af3');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-af1","account_no":"1234567834","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003401'::uuid $$;
CREATE FUNCTION pg_temp.u3() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003403'::uuid $$;

CREATE FUNCTION pg_temp.st(p_date text, p_tbl text, p_seq int, p_payload jsonb) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.limitup_stage (date, tbl, seq, payload)
  VALUES (p_date, p_tbl, p_seq, jsonb_build_object('date', p_date) || p_payload)
$$;
-- accum_flow export 행 — 평평한 40열(date 는 st 가 싣는다 → 41열 · 끝 4 = 당일 축 quick-261025-uf2) + payload(price · orders · buckets · day_cum_net · pnl · cycles 최소 모양).
CREATE FUNCTION pg_temp.af(p_isin text, p_state int, p_pos bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'isin', p_isin, 'short_code', substr(p_isin, 4, 6), 'name', '매집종목' || right(p_isin, 2), 'market', 'KOSDAQ',
    'base', 10000, 'upper', 13000, 'last_px', 12978, 'last_rate', 29.78, 'high_px', 13000, 'high_rate', 30.0,
    'state', p_state, 'end_reason', CASE WHEN p_state = 3 THEN 1 ELSE 0 END, 'cycle', 1, 'carry_days', 2,
    'since_date', '20261009', 'reg_time_ms', 1792200000000, 'end_time_ms', NULL, 'our_excluded_qty', 0,
    'mcap_krw', 120000000000, 'th_net_krw', 100000000, 'th_same', 5, 'th_mcap_krw', 300000000000,
    'pos_buy_qty', 20000, 'pos_buy_krw', 250000000, 'pos_sell_qty', 5000, 'pos_sell_krw', 70000000,
    'pos_net_krw', p_pos, 'pos_avg_px', 12500, 'pos_peak_net_krw', 200000000, 'pos_reg_px', 11000,
    'day_buy_krw', 90000000, 'day_sell_krw', 30000000, 'day_net_krw', 60000000,
    'day_buy_qty', 7000, 'day_sell_qty', 2300, 'schema_version', 1,
    'pos_day_buy_krw', 3000000000, 'pos_day_sell_krw', 1200000000, 'th_recent_pieces', 30, 'th_recent_sec', 60,
    'payload', jsonb_build_object(
      'price', jsonb_build_object('step_s', 10, 't0_ms', 1792200000000, 'px', jsonb_build_array(12000, 12500, 12978)),
      'orders', jsonb_build_array(jsonb_build_object('t_ms', 1792200100000, 'side', 'B', 'px', 12500, 'qty', 100)),
      'buckets', jsonb_build_array(jsonb_build_object('key', 54, 'start', '09:00', 'net_krw', 1250000)),
      'day_cum_net', jsonb_build_array(0, 1250000, 60000000),
      'pnl', jsonb_build_object('buy_val', 250000000, 'sell_val', 70000000, 'ret', 0.012),
      'cycles', jsonb_build_array(jsonb_build_object('cycle', 1, 'state', p_state, 'since_date', '20261009'))))
$$;
-- team_flow 최소 행(D-03 교차용 — 팀 매집 dates 가 「행 있는 날짜」 임을 보이려고 20261014 에 1행).
CREATE FUNCTION pg_temp.tf(p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('isin', p_isin, 'team_net_val', 100000000, 'team_buy_share', 0.3, 'schema_version', 1,
                            'payload', jsonb_build_object('bands', '[]'::jsonb))
$$;
-- 결과 rows[] 의 isin 배열(원소 순서 그대로).
CREATE FUNCTION pg_temp.isins(p_r jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(e->'isin' ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(p_r->'rows') WITH ORDINALITY AS x(e, n)
$$;
-- 「탐지 0 이 아닌」 날짜용 p_expected — 6표 · 파생 2 · team_flow 를 명시(새 워커 호출 모양).
CREATE FUNCTION pg_temp.exp(p_tf int, p_af int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('entries', 0, 'locks', 0, 'jumps', 0, 'member_alloc', 0, 'facts', 0, 'touches', 0,
                            'grid_summary', 0, 'member_daily', 0, 'team_flow', p_tf, 'accum_flow', p_af)
$$;

-- ── ① 게이트(D-06) ─────────────────────────────────────────────────
SELECT is(public.accum_report_for_user(pg_temp.u3()), '{"access": false}'::jsonb,
          '① D-06 U3(가시 계좌 없음) 목록 → {"access": false} 만');
SELECT is(public.accum_report_for_user(pg_temp.u3(), '20261014'), '{"access": false}'::jsonb,
          '① D-06 U3(p_date 지정) 목록 → {"access": false} 만');
SELECT is(public.accum_detail_for_user(pg_temp.u3(), '20261014', 'KR7000000413'), '{"access": false}'::jsonb,
          '① D-06 U3 상세 → {"access": false} 만');
SELECT is(public.accum_report_for_user(NULL), '{"access": false}'::jsonb,
          '① D-06 p_user_id null 목록 → {"access": false}');
SELECT is(public.accum_detail_for_user(NULL, '20261014', 'KR7000000413'), '{"access": false}'::jsonb,
          '① D-06 p_user_id null 상세 → {"access": false}');

-- ── ② 이력 0(D-07) ─────────────────────────────────────────────────
SELECT is(public.accum_report_for_user(pg_temp.u1()),
          '{"access": true, "dates": [], "date": null, "rows": []}'::jsonb,
          '② D-07 U1 accum_flow 이력 0 → dates [] · date null · rows []');
SELECT is(public.accum_report_for_user(pg_temp.u1(), '20261014'),
          '{"access": true, "dates": [], "date": null, "rows": []}'::jsonb,
          '② D-07 U1 이력 0 + p_date → 같은 빈 모양');
SELECT is(public.accum_detail_for_user(pg_temp.u1(), '20261014', 'KR7000000413'),
          '{"access": true, "row": null}'::jsonb,
          '② D-06 U1 이력 0 상세 → {access: true, row: null}');

-- ── 적재 ───────────────────────────────────────────────────────────
-- 20261013: 2행(state 1)
SELECT pg_temp.st('20261013', 'accum_flow', 1, pg_temp.af('KR7000000402', 1, 200000000));
SELECT pg_temp.st('20261013', 'accum_flow', 2, pg_temp.af('KR7000000401', 1, 300000000));
SELECT public.limitup_commit_day('20261013', 'mf-1013', 'sig-1013', 1, pg_temp.exp(0, 2));
-- 20261014: 5행 — state 3 이 pos 최대(411) · state 1 pos 5억(413) · 1억 동률(416 · 412 역순 삽입) · null(414)
--   + team_flow 1행(D-03 교차)
SELECT pg_temp.st('20261014', 'accum_flow', 1, pg_temp.af('KR7000000416', 1, 100000000));
SELECT pg_temp.st('20261014', 'accum_flow', 2, pg_temp.af('KR7000000411', 3, 900000000));
SELECT pg_temp.st('20261014', 'accum_flow', 3, pg_temp.af('KR7000000414', 1, NULL));
SELECT pg_temp.st('20261014', 'accum_flow', 4, pg_temp.af('KR7000000412', 1, 100000000));
SELECT pg_temp.st('20261014', 'accum_flow', 5, pg_temp.af('KR7000000413', 1, 500000000));
SELECT pg_temp.st('20261014', 'team_flow', 1, pg_temp.tf('KR7000000413'));
SELECT public.limitup_commit_day('20261014', 'mf-1014', 'sig-1014', 1, pg_temp.exp(1, 5));

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb);
INSERT INTO t_r VALUES
  ('latest', public.accum_report_for_user(pg_temp.u1())),
  ('d1013',  public.accum_report_for_user(pg_temp.u1(), '20261013')),
  ('d1012',  public.accum_report_for_user(pg_temp.u1(), '20261012')),
  ('det',    public.accum_detail_for_user(pg_temp.u1(), '20261014', 'KR7000000413')),
  ('det-no', public.accum_detail_for_user(pg_temp.u1(), '20261014', 'KR7000000499')),
  ('det-dt', public.accum_detail_for_user(pg_temp.u1(), '20261013', 'KR7000000413'));
CREATE FUNCTION pg_temp.r(p_label text) RETURNS jsonb LANGUAGE sql AS $$ SELECT r FROM t_r WHERE label = p_label $$;

-- ── ③ 날짜 · 최신 · 정렬(D-07) ──────────────────────────────────────
SELECT is(pg_temp.r('latest')->'dates', '["20261014", "20261013"]'::jsonb,
          '③ D-07 dates = 행 있는 날짜 내림차순');
SELECT is(pg_temp.r('latest')->>'date', '20261014', '③ D-07 p_date 없음 → 최신 행 있는 날짜');
SELECT is(pg_temp.r('latest')->>'access', 'true', '③ D-07 access true');
SELECT is(jsonb_array_length(pg_temp.r('latest')->'rows'), 5, '③ D-07 20261014 rows 5');
SELECT is(pg_temp.isins(pg_temp.r('latest')),
          '["KR7000000413", "KR7000000412", "KR7000000416", "KR7000000414", "KR7000000411"]'::jsonb,
          '③ D-07 정렬 state → pos_net_krw DESC NULLS LAST → isin(state 3 은 pos 최대여도 맨 뒤)');
SELECT is(pg_temp.r('d1013')->>'date', '20261013', '③ D-07 p_date 20261013 → date 그 값');
SELECT is(pg_temp.isins(pg_temp.r('d1013')), '["KR7000000401", "KR7000000402"]'::jsonb,
          '③ D-07 20261013 rows pos 3억 → 2억');

-- ── ④ 목록 행 모양 — 평평한 37열 + pnl · payload 없음(D-06 · Pitfall 6) ───
SELECT ok(NOT EXISTS (SELECT 1 FROM t_r, jsonb_array_elements(t_r.r->'rows') e
                       WHERE t_r.label IN ('latest', 'd1013') AND e ? 'payload'),
          '④ D-06 목록 rows 어느 행에도 payload 키 없음(Pitfall 6)');
SELECT is((SELECT array_agg(DISTINCT n) FROM (
             SELECT (SELECT count(*)::int FROM jsonb_object_keys(e)) AS n
               FROM t_r, jsonb_array_elements(t_r.r->'rows') e WHERE t_r.label IN ('latest', 'd1013')) k),
          ARRAY[38], '④ D-06 목록 모든 행 키 수 38(37열 + pnl)');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.r('latest')->'rows'->0) k),
          (SELECT array_agg(c ORDER BY c) FROM (
             SELECT column_name::text AS c FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'limitup_accum_flow'
                AND column_name NOT IN ('payload', 'pos_day_buy_krw', 'pos_day_sell_krw', 'th_recent_pieces', 'th_recent_sec')
             UNION ALL SELECT 'pnl') cols),
          '④ D-06 목록 행 키 집합 = limitup_accum_flow 열 − payload − 당일 축 4열(목록 RPC 37열 명시) + pnl');
SELECT ok(NOT EXISTS (SELECT 1 FROM t_r, jsonb_array_elements(t_r.r->'rows') e
                       WHERE t_r.label IN ('latest', 'd1013')
                         AND e ?| ARRAY['pos_day_buy_krw', 'pos_day_sell_krw', 'th_recent_pieces', 'th_recent_sec']),
          '④ 목록 rows 어느 행에도 당일 축 4키 없음(quick-261025-uf2 — 목록 RPC 무변경)');
SELECT is(pg_temp.r('latest')->'rows'->0->'pnl'->'ret', '0.012'::jsonb, '④ 목록 행 pnl = payload.pnl 그대로');
SELECT is(pg_temp.r('latest')->'rows'->0->'last_rate', '29.78'::jsonb, '④ D-06 last_rate 29.78(JSON 숫자 · double)');
SELECT is(pg_temp.r('latest')->'rows'->0->'since_date', '"20261009"'::jsonb, '④ D-06 since_date "20261009" 문자열');
SELECT is(jsonb_typeof(pg_temp.r('latest')->'rows'->3->'pos_net_krw'), 'null', '④ D-06 rows[3].pos_net_krw null(state 1 끝)');
SELECT is(jsonb_typeof(pg_temp.r('latest')->'rows'->0->'end_time_ms'), 'null', '④ D-06 end_time_ms 키 있음 · null');

-- ── ⑤ 행 없는 날짜(D-07) ───────────────────────────────────────────
SELECT is(pg_temp.r('d1012')->'rows', '[]'::jsonb, '⑤ D-07 p_date 20261012(행 없음) → rows []');
SELECT is(pg_temp.r('d1012')->>'date', '20261012', '⑤ D-07 p_date 20261012 → date 그 값(404 아님)');
SELECT is(pg_temp.r('d1012')->'dates', '["20261014", "20261013"]'::jsonb, '⑤ D-07 행 없는 날짜여도 dates 그대로');

-- ── ⑥ 상세(D-06) ───────────────────────────────────────────────────
SELECT is(pg_temp.r('det')->>'access', 'true', '⑥ D-06 상세 access true');
SELECT is(pg_temp.r('det')->'row'->>'isin', 'KR7000000413', '⑥ D-06 상세 row.isin 일치');
SELECT is(pg_temp.r('det')->'row'->>'date', '20261014', '⑥ D-06 상세 row.date 일치');
SELECT is(jsonb_typeof(pg_temp.r('det')->'row'->'payload'), 'object', '⑥ D-06 상세 row 에 payload 객체');
SELECT is(pg_temp.r('det')->'row' #>> '{payload,price,step_s}', '10', '⑥ D-06 상세 payload.price.step_s 중첩 그대로');
SELECT is(pg_temp.r('det')->'row' #>> '{payload,cycles,0,since_date}', '20261009', '⑥ D-06 상세 payload.cycles[0] 그대로');
SELECT is((SELECT count(*)::int FROM jsonb_object_keys(pg_temp.r('det')->'row')), 42,
          '⑥ D-06 상세 row 키 42(37열 + 당일 축 4열 + payload)');
SELECT ok(pg_temp.r('det')->'row' @> '{"pos_day_buy_krw":3000000000,"pos_day_sell_krw":1200000000,"th_recent_pieces":30,"th_recent_sec":60}'::jsonb,
          '⑥ 상세 row 가 당일 축 4키 값을 싣는다(to_jsonb — quick-261025-uf2)');
SELECT ok(pg_temp.r('det-no') ? 'row' AND jsonb_typeof(pg_temp.r('det-no')->'row') = 'null',
          '⑥ D-06 없는 isin → row 키 있음 · jsonb null');
SELECT ok(pg_temp.r('det-dt') ? 'row' AND jsonb_typeof(pg_temp.r('det-dt')->'row') = 'null',
          '⑥ D-06 그 날짜에 없는 isin(20261013 · 413) → row null');

-- ── ⑦ 권한 · 함수 속성 · 표 잠금(D-06) ─────────────────────────────
SELECT is(has_function_privilege(r.role, r.fn, 'EXECUTE'), r.expect,
          format('⑦ D-06 %s EXECUTE %s = %s', r.role, r.fn, r.expect))
  FROM (VALUES ('anon', 'public.accum_report_for_user(uuid, text)', false),
               ('authenticated', 'public.accum_report_for_user(uuid, text)', false),
               ('service_role', 'public.accum_report_for_user(uuid, text)', true),
               ('anon', 'public.accum_detail_for_user(uuid, text, text)', false),
               ('authenticated', 'public.accum_detail_for_user(uuid, text, text)', false),
               ('service_role', 'public.accum_detail_for_user(uuid, text, text)', true)) AS r(role, fn, expect)
 ORDER BY r.fn, r.role;
SELECT ok(NOT p.prosecdef, format('⑦ D-06 %s SECURITY INVOKER(prosecdef false)', p.oid::regprocedure))
  FROM pg_proc p
 WHERE p.oid IN ('public.accum_report_for_user(uuid,text)'::regprocedure,
                 'public.accum_detail_for_user(uuid,text,text)'::regprocedure)
 ORDER BY p.proname;
SELECT is(p.provolatile::text, 's', format('⑦ D-06 %s STABLE', p.oid::regprocedure))
  FROM pg_proc p
 WHERE p.oid IN ('public.accum_report_for_user(uuid,text)'::regprocedure,
                 'public.accum_detail_for_user(uuid,text,text)'::regprocedure)
 ORDER BY p.proname;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.limitup_accum_flow'::regclass),
          '⑦ D-06 limitup_accum_flow RLS 활성');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'limitup_accum_flow'), 0,
          '⑦ D-06 limitup_accum_flow 정책 0개(읽기는 서버 RPC 뿐)');
SELECT is(has_table_privilege(r.role, 'public.limitup_accum_flow', 'SELECT'), false,
          format('⑦ D-06 %s SELECT limitup_accum_flow = false', r.role))
  FROM (VALUES ('anon'), ('authenticated')) AS r(role)
 ORDER BY r.role;

-- ── ⑧ D-03 탐지 0 거래일 교차(RESEARCH Pitfall 8 정정) ──────────────
-- 20261015: 6표 0 · 파생 0 · team_flow 0 · accum_flow 1 commit
SELECT pg_temp.st('20261015', 'accum_flow', 1, pg_temp.af('KR7000000415', 1, 150000000));
SELECT public.limitup_commit_day('20261015', 'mf-1015', 'sig-1015', 1, pg_temp.exp(0, 1));

SELECT is(public.accum_report_for_user(pg_temp.u1())->'dates', '["20261015", "20261014", "20261013"]'::jsonb,
          '⑧ D-03 탐지 0 거래일 20261015 → 매집감지 dates 에 있음(최신)');
SELECT ok((public.limitup_report_for_user(pg_temp.u1())->'dates') ? '20261015',
          '⑧ D-03 탐지 0 거래일 → 상한가 보고서 dates 에도 있음(files_sig 기준 · 빈 날 문구로 그린다)');
SELECT is((SELECT jsonb_build_object('loaded', x->'loaded', 'entries', x #> '{day,entries}')
             FROM (SELECT public.limitup_report_for_user(pg_temp.u1(), '20261015') AS x) s),
          '{"loaded": true, "entries": []}'::jsonb,
          '⑧ D-03 상한가 보고서 그날 loaded · entries [](「이 날은 상한가 사건이 없어요」 의 원천)');
SELECT is(public.teamflow_report_for_user(pg_temp.u1())->'dates', '["20261014"]'::jsonb,
          '⑧ D-03 팀 매집 dates 에는 없음(team_flow 행 있는 20261014 만)');

SELECT * FROM finish();
ROLLBACK;
