-- ============================================================
-- Phase 28 Plan 10 — 보고서 RPC 2개(limitup_report_for_user · limitup_grid_isins_for_user) pgTAP.
--
-- 대상: 20261006090400_limitup_report_rpcs.sql. 적재는 28-03 의 stage → limitup_commit_day 로 채운다.
--
-- 잠그는 것:
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 → {"access": false} 만 (두 함수)
--   - 날짜 규칙(D-11): 적재 이력 0 → {access, dates: [], date: null, loaded: false} · skip 만 있던 날짜(files_sig null)는
--     dates 에 없다 · p_date null = 최신 적재 날짜 · 적재 안 된 날짜는 loaded false(빈 상태의 원천)
--   - 하루 묶음: entries(isin) · locks(isin, lock_id) · facts(isin, t_ms NULLS LAST, event_no, fact_no) · summaries ·
--     marks(종목마다 burst_sell · cancel 을 krw 큰 순 40개 · new 제외) · rows(manifest 행 수)
--   - 어제 결과: prev = 바로 이전 적재 날짜 + 그날 locks · 이전 날짜 없으면 null
--   - 지문(D-17): member_daily 의 D−90일 < date ≤ D 를 창구마다 합산 · 이름 = 최신 non-null · n 내림차순 → member
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_report.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-lu1 → KB …7811(가시 계좌 있음) · U3 dma-lu3(자격증명만 · 계좌 매핑 없음).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(50);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002801', 'lu-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000002803', 'lu-u3@example.invalid');
INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000002801', 'dma-lu1', 'test-enc-lu1'),
  ('00000000-0000-4000-8000-000000002803', 'dma-lu3', 'test-enc-lu3');
SELECT public.dma_journal_sync_access('KB', '[
  {"dma_user_id":"dma-lu1","account_no":"1234567811","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000002801'::uuid $$;
CREATE FUNCTION pg_temp.u3() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000002803'::uuid $$;

-- stage 행 1개(28-03 limitup_load.test.sql 과 같은 모양).
CREATE FUNCTION pg_temp.st(p_date text, p_tbl text, p_seq int, p_payload jsonb) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.limitup_stage (date, tbl, seq, payload)
  VALUES (p_date, p_tbl, p_seq, jsonb_build_object('date', p_date) || p_payload)
$$;
-- member_daily payload — 합계 열은 n 을 따라 단순하게.
CREATE FUNCTION pg_temp.md(p_member text, p_name text, p_n int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('member', p_member, 'name', p_name, 'n', p_n,
    'entry_sum', p_n * 0.5, 'entry_cnt', p_n, 'lock_buy_sum', p_n * 0.25, 'lock_buy_cnt', p_n,
    'pre_sell_sum', 0, 'pre_sell_cnt', 0, 'lead', 1, 'n_broke', 1, 'n_lock', p_n, 'n_held', 0)
$$;
-- D=20261002 기준 N일 전 날짜.
CREATE FUNCTION pg_temp.ago(p_days int) RETURNS text LANGUAGE sql AS $$
  SELECT to_char(to_date('20261002', 'YYYYMMDD') - p_days, 'YYYYMMDD')
$$;

-- ── A. 게이트 실패 · 적재 이력 0 ──────────────────────────────────
-- skip 만 있는 날짜를 먼저 만든다 — files_sig null 이라 「적재된 날짜」 가 아니다.
SELECT public.limitup_record_skip('20261003', 'sha');

SELECT is(public.limitup_report_for_user(pg_temp.u3()), '{"access": false}'::jsonb,
          'A U3(가시 계좌 없음) report → {"access": false} 만');
SELECT is(public.limitup_report_for_user(pg_temp.u3(), '20261002'), '{"access": false}'::jsonb,
          'A U3 report(p_date 지정) → {"access": false} 만');
SELECT is(public.limitup_grid_isins_for_user(pg_temp.u3(), '20261002'), '{"access": false}'::jsonb,
          'A U3 grid_isins → {"access": false} 만');
SELECT is(public.limitup_report_for_user(pg_temp.u1()),
          '{"access": true, "dates": [], "date": null, "loaded": false}'::jsonb,
          'A U1 적재 이력 0(skip 날짜만) → dates [] · date null · loaded false');
SELECT is(public.limitup_report_for_user(NULL), '{"access": false}'::jsonb,
          'A p_user_id null → {"access": false}');

-- ── 적재: 20261001 · 20261002 ────────────────────────────────────
-- 20261001: entries 1 · locks 1 · member_daily 1 (00002 신한증권 n 1)
SELECT pg_temp.st('20261001', 'entries', 1, '{"isin":"KR7000000001","short_code":"000001","name":"가종목","schema_version":1}');
SELECT pg_temp.st('20261001', 'locks', 1, '{"isin":"KR7000000001","lock_id":1,"outcome":"깨짐","broke":true,"d1_ret":-0.115,"schema_version":1}');
SELECT pg_temp.st('20261001', 'member_daily', 1, pg_temp.md('00002', '신한증권', 1));
SELECT public.limitup_commit_day('20261001', 'mf-1001', 'sig-1001', 1, '{"entries":1,"locks":1,"member_daily":1}');

-- 20261002: entries 2(isin 역순 삽입 · 하나는 short_code/name null — 실데이터 20/99 행) · locks 2(lock_id 역순) ·
--   facts 4 · grid_summary 2 · jumps(종목 01: burst_sell/cancel 45 + new 10, 종목 02: cancel 2) · member_daily 3
SELECT pg_temp.st('20261002', 'entries', 1, '{"isin":"KR7000000002","short_code":null,"name":null,"schema_version":1}');
SELECT pg_temp.st('20261002', 'entries', 2, '{"isin":"KR7000000001","short_code":"000001","name":"가종목","schema_version":1}');
SELECT pg_temp.st('20261002', 'locks', 1, '{"isin":"KR7000000001","lock_id":2,"outcome":"유지","schema_version":1}');
SELECT pg_temp.st('20261002', 'locks', 2, '{"isin":"KR7000000001","lock_id":1,"outcome":"깨짐","schema_version":1}');
SELECT pg_temp.st('20261002', 'facts', 1, '{"isin":"KR7000000002","event_no":0,"fact_no":1,"t_ms":50,"text":"다","values":{"k":4},"source":"실측","schema_version":1}');
SELECT pg_temp.st('20261002', 'facts', 2, '{"isin":"KR7000000001","event_no":1,"fact_no":2,"t_ms":null,"text":"라","values":{"k":3},"source":"모형","schema_version":1}');
SELECT pg_temp.st('20261002', 'facts', 3, '{"isin":"KR7000000001","event_no":1,"fact_no":1,"t_ms":200,"text":"나","values":{"k":2},"source":"실측","schema_version":1}');
SELECT pg_temp.st('20261002', 'facts', 4, '{"isin":"KR7000000001","event_no":0,"fact_no":1,"t_ms":100,"text":"가","values":{"lock_id":1,"krw":1730000000},"source":"실측","schema_version":1}');
SELECT pg_temp.st('20261002', 'grid_summary', 1, '{"isin":"KR7000000002","step_s":10,"sec0":32400,"q_krw":[0,5,null],"q_max_krw":5,"q_max_ms":1,"sell_share_60s":null}');
SELECT pg_temp.st('20261002', 'grid_summary', 2, '{"isin":"KR7000000001","step_s":10,"sec0":32400,"q_krw":[0,120,null],"q_max_krw":120,"q_max_ms":2,"sell_share_60s":0.37}');
-- 종목 01 마커 45개: jump_no 1~45 · krw = jump_no * 1000 · 홀수 burst_sell · 짝수 cancel
SELECT pg_temp.st('20261002', 'jumps', g, jsonb_build_object(
         'isin', 'KR7000000001', 'jump_no', g, 't_ms', 1000 + g,
         'kind', CASE WHEN g % 2 = 1 THEN 'burst_sell' ELSE 'cancel' END,
         'qty', g, 'krw', g * 1000, 'px', 5690, 'q_before', 100, 'q_after', 90, 'schema_version', 1))
  FROM generate_series(1, 45) g;
-- 종목 01 new 10개 — krw 가 훨씬 커도 마커가 아니다
SELECT pg_temp.st('20261002', 'jumps', 100 + g, jsonb_build_object(
         'isin', 'KR7000000001', 'jump_no', 100 + g, 't_ms', 5000 + g, 'kind', 'new',
         'qty', g, 'krw', 999999999, 'schema_version', 1))
  FROM generate_series(1, 10) g;
SELECT pg_temp.st('20261002', 'jumps', 201, '{"isin":"KR7000000002","jump_no":1,"t_ms":10,"kind":"cancel","qty":1,"krw":700,"schema_version":1}');
SELECT pg_temp.st('20261002', 'jumps', 202, '{"isin":"KR7000000002","jump_no":2,"t_ms":11,"kind":"cancel","qty":1,"krw":900,"schema_version":1}');
SELECT pg_temp.st('20261002', 'member_daily', 1, pg_temp.md('00002', NULL, 1));
SELECT pg_temp.st('20261002', 'member_daily', 2, pg_temp.md('00036', 'JP모간', 3));
SELECT pg_temp.st('20261002', 'member_daily', 3, pg_temp.md('00050', '키움증권', 5));
SELECT public.limitup_commit_day('20261002', 'mf-1002', 'sig-1002', 1,
  '{"entries":2,"locks":2,"facts":4,"grid_summary":2,"jumps":57,"member_daily":3}');

-- 90일 창 경계 — 직접 INSERT(적재 이력과 무관하게 member_daily 만 본다).
INSERT INTO public.limitup_member_daily (date, member, name, n, entry_sum, entry_cnt, lock_buy_sum, lock_buy_cnt,
                                         pre_sell_sum, pre_sell_cnt, lead, n_broke, n_lock, n_held)
VALUES (pg_temp.ago(89), '00002', '옛이름', 1, 0.5, 1, 0.25, 1, 0, 0, 1, 1, 1, 0),     -- 창 안
       (pg_temp.ago(91), '00002', '아주옛이름', 100, 50, 100, 25, 100, 0, 0, 1, 1, 100, 0),  -- 창 밖
       (pg_temp.ago(90), '00099', '경계', 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);            -- D−90 정확히 = 창 밖

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb);
INSERT INTO t_r VALUES
  ('latest', public.limitup_report_for_user(pg_temp.u1())),
  ('d1002',  public.limitup_report_for_user(pg_temp.u1(), '20261002')),
  ('d1001',  public.limitup_report_for_user(pg_temp.u1(), '20261001')),
  ('d1003',  public.limitup_report_for_user(pg_temp.u1(), '20261003')),
  ('d1005',  public.limitup_report_for_user(pg_temp.u1(), '20261005')),
  ('bad',    public.limitup_report_for_user(pg_temp.u1(), '2026-10-02'));
CREATE FUNCTION pg_temp.r(p_label text) RETURNS jsonb LANGUAGE sql AS $$ SELECT r FROM t_r WHERE label = p_label $$;

-- ── B. 날짜 규칙 ─────────────────────────────────────────────────
SELECT is(pg_temp.r('latest')->'dates', '["20261002", "20261001"]'::jsonb,
          'B dates = 적재 날짜 내림차순 · skip 날짜 20261003 제외');
SELECT is(pg_temp.r('latest')->>'date', '20261002', 'B p_date null → 최신 적재 날짜 20261002');
SELECT is(pg_temp.r('latest')->'loaded', 'true'::jsonb, 'B 최신 → loaded true');
SELECT is(pg_temp.r('latest'), pg_temp.r('d1002'), 'B p_date null 응답 = p_date 20261002 응답');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.r('latest')) k),
          ARRAY['access', 'date', 'dates', 'day', 'fingerprint', 'loaded', 'prev'],
          'B loaded 응답 키 7개');
SELECT is(pg_temp.r('d1003'), '{"access": true, "dates": ["20261002", "20261001"], "date": "20261003", "loaded": false}'::jsonb,
          'B skip 만 있던 20261003 → loaded false(day 없음)');
SELECT is(pg_temp.r('d1005')->>'loaded', 'false', 'B 이력 없는 20261005 → loaded false');
SELECT is(pg_temp.r('d1005')->>'date', '20261005', 'B 이력 없는 날짜 → date 는 요청 값 그대로');
SELECT is(pg_temp.r('bad')->>'loaded', 'false', 'B 형식 아닌 p_date → loaded false(예외 아님)');

-- ── C. 하루 묶음 ─────────────────────────────────────────────────
SELECT is((SELECT jsonb_agg(e->>'isin') FROM jsonb_array_elements(pg_temp.r('d1002')#>'{day,entries}') e),
          '["KR7000000001", "KR7000000002"]'::jsonb, 'C entries isin 순');
SELECT ok((pg_temp.r('d1002')#>'{day,entries,1}') ? 'short_code'
          AND pg_temp.r('d1002')#>'{day,entries,1,short_code}' = 'null'::jsonb,
          'C short_code null 행도 키를 싣는다(JSON null)');
SELECT is((pg_temp.r('d1002')#>'{day,entries,0}')->>'date', '20261002', 'C 행 키는 export 열 이름 그대로(date 포함)');
SELECT is((SELECT jsonb_agg(jsonb_build_array(l->>'isin', (l->>'lock_id')::int)) FROM jsonb_array_elements(pg_temp.r('d1002')#>'{day,locks}') l),
          '[["KR7000000001", 1], ["KR7000000001", 2]]'::jsonb, 'C locks (isin, lock_id) 순');
SELECT is((SELECT jsonb_agg(f->>'text') FROM jsonb_array_elements(pg_temp.r('d1002')#>'{day,facts}') f),
          '["가", "나", "라", "다"]'::jsonb, 'C facts (isin, t_ms NULLS LAST, event_no, fact_no) 순');
SELECT is(pg_temp.r('d1002')#>>'{day,facts,0,values,krw}', '1730000000', 'C facts "values" 키 그대로');
SELECT is(pg_temp.r('d1002')#>>'{day,facts,0,source}', '실측', 'C facts source 그대로');
SELECT is(jsonb_array_length(pg_temp.r('d1002')#>'{day,summaries}'), 2, 'C summaries 2행');
SELECT is(pg_temp.r('d1002')#>'{day,summaries,0,q_krw}', '[0, 120, null]'::jsonb, 'C summaries[0] = 01 · q_krw 배열 · null 유지');
SELECT is(pg_temp.r('d1002')#>>'{day,rows,entries}', '2', 'C rows.entries = 2(적재 이력 행 수)');
SELECT is(pg_temp.r('d1002')#>>'{day,rows,jumps}', '57', 'C rows.jumps = 57');

-- marks
CREATE TEMP TABLE t_marks AS
  SELECT m FROM jsonb_array_elements(pg_temp.r('d1002')#>'{day,marks}') m;
SELECT is((SELECT count(*)::int FROM t_marks WHERE m->>'isin' = 'KR7000000001'), 40, 'C marks 종목 01 = 40개(45 중 상위)');
SELECT is((SELECT count(*)::int FROM t_marks WHERE m->>'kind' NOT IN ('burst_sell', 'cancel')), 0, 'C marks 에 new 없음');
SELECT is((SELECT min((m->>'krw')::bigint) FROM t_marks WHERE m->>'isin' = 'KR7000000001'), 6000::bigint,
          'C marks 종목 01 최소 krw 6000(1000~5000 탈락)');
SELECT is((pg_temp.r('d1002')#>>'{day,marks,0,krw}')::bigint, 45000::bigint,
          'C marks 종목 01 첫 행 = krw 최대 45000(krw 내림차순)');
SELECT is((SELECT jsonb_agg((m->>'krw')::bigint ORDER BY o)
             FROM jsonb_array_elements(pg_temp.r('d1002')#>'{day,marks}') WITH ORDINALITY AS t(m, o)
            WHERE m->>'isin' = 'KR7000000002'), '[900, 700]'::jsonb,
          'C marks 종목 02 = 2개 krw 내림차순');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.r('d1002')#>'{day,marks,0}') k),
          ARRAY['isin', 'jump_no', 'kind', 'krw', 'q_after', 'q_before', 'qty', 't_ms'], 'C marks 행 키 8개');

-- ── D. 어제 결과 ─────────────────────────────────────────────────
SELECT is(pg_temp.r('d1002')#>>'{prev,date}', '20261001', 'D prev.date = 바로 이전 적재 날짜 20261001');
SELECT is(jsonb_array_length(pg_temp.r('d1002')#>'{prev,locks}'), 1, 'D prev.locks = 그날 locks 1행');
SELECT is(pg_temp.r('d1002')#>>'{prev,locks,0,d1_ret}', '-0.115', 'D prev.locks d1_ret 소수 그대로');
SELECT is(pg_temp.r('d1001')->'prev', 'null'::jsonb, 'D 이전 적재 날짜 없음 → prev null');
SELECT is(pg_temp.r('d1001')#>'{day,marks}', '[]'::jsonb, 'D 마커 없는 날 marks = []');

-- ── E. 지문 90일 ─────────────────────────────────────────────────
SELECT is((SELECT jsonb_agg(f->>'member') FROM jsonb_array_elements(pg_temp.r('d1002')->'fingerprint') f),
          '["00050", "00002", "00036"]'::jsonb, 'E 정렬 n 내림차순 → member(00002 · 00036 동률 3) · D−90 경계 00099 제외');
SELECT is(pg_temp.r('d1002')#>>'{fingerprint,1,n}', '3', 'E 00002 n = 1 + 1 + 1(89일 전) · 91일 전 100 제외');
SELECT is(pg_temp.r('d1002')#>>'{fingerprint,1,name}', '신한증권', 'E 00002 이름 = 최신 non-null(20261002 null 건너뜀)');
SELECT is((pg_temp.r('d1002')#>>'{fingerprint,1,entry_sum}')::numeric, 1.5, 'E 00002 entry_sum 합 1.5');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.r('d1002')#>'{fingerprint,0}') k),
          ARRAY['entry_cnt', 'entry_sum', 'lead', 'lock_buy_cnt', 'lock_buy_sum', 'member', 'n', 'n_broke', 'n_held',
                'n_lock', 'name', 'pre_sell_cnt', 'pre_sell_sum'], 'E 지문 행 키 13개');
SELECT is((SELECT jsonb_agg(jsonb_build_array(f->>'member', (f->>'n')::int)) FROM jsonb_array_elements(pg_temp.r('d1001')->'fingerprint') f),
          '[["00099", 7], ["00002", 2]]'::jsonb,
          'E D=20261001 창 → 20261002 기여분 제외 · 00002 n 2(91일 전 = D−90 경계 제외) · 00099(D−89) 포함');

-- ── F. 격자 isin ─────────────────────────────────────────────────
SELECT is(public.limitup_grid_isins_for_user(pg_temp.u1(), '20261002'),
          '{"access": true, "date": "20261002", "isins": ["KR7000000001", "KR7000000002"]}'::jsonb,
          'F U1 grid_isins 20261002 → 그날 grid_summary isin');
SELECT is(public.limitup_grid_isins_for_user(pg_temp.u1(), '20261003'),
          '{"access": true, "date": "20261003", "isins": []}'::jsonb, 'F 격자 없는 날 → isins []');

-- ── G. 권한 ──────────────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, f.sig, 'EXECUTE'), r.expect, format('G %s EXECUTE %s = %s', r.role, f.sig, r.expect))
  FROM (VALUES ('public.limitup_report_for_user(uuid, text)'),
               ('public.limitup_grid_isins_for_user(uuid, text)')) AS f(sig)
 CROSS JOIN (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY f.sig, r.role;

SELECT * FROM finish();
ROLLBACK;
