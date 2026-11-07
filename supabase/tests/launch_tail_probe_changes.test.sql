-- ============================================================
-- quick-261107-l7w — 발사 뒤탐침 변경 이력(launch_tail_probe_changes) · 기록/읽기 RPC pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261107200000_launch_tail_probe_changes.sql
--
-- 잠그는 것:
--   - 트레이서: launch_tail_probe_change_record 로 한 행(KB120 · q16 · before 5/10 · after 3/20 · ok · plan_rev 7) →
--     반환 jsonb 키 집합 = shared LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 13개(계약 핀) →
--     launch_tail_probe_changes_for_admin(20) 이 { tail_probe_changes: [그 행] } 으로 같은 키를 돌려준다.
--   - 읽기 모양: (gateway, fire) 마다 최근 p_limit 행 + 같은 키의 마지막 ok 1행(중복 없음) · 다른 키는 섞이지 않는다 ·
--     전체 at 내림차순(같은 at 은 id 내림차순).
--   - 실패 시도 행: offline · before null · 범위 밖 값(after_count 12)도 기록된다(범위 CHECK 없음).
--   - 입력 오류: p_limit NULL · 0 · 201 → 22023 · 필수 키 누락 · after_count 숫자 아님 · before_step_us 문자열 → 22023 ·
--     outcome 'weird' · fire 'x' → 23514.
--   - 권한: 표 RLS 켬 · pg_policies 0 · anon/authenticated SELECT · INSERT 불가 · service_role SELECT · INSERT 만 ·
--     두 RPC EXECUTE (anon, authenticated, service_role) = (f, f, t) · service_role 로 기록 실제 성공.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_tail_probe_changes.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (서버, 발사, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

SELECT plan(27);

-- shared LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 와 같은 13개(정렬본 비교).
CREATE TEMP TABLE t_cols AS
SELECT ARRAY(SELECT unnest(ARRAY[
  'id', 'at', 'admin_email', 'gateway', 'fire',
  'before_count', 'before_step_us', 'after_count', 'after_step_us',
  'outcome', 'code', 'message', 'plan_rev'
]) ORDER BY 1) AS cols;

-- ── 1. 트레이서: 한 행 기록 → 읽기 ─────────────────────────────────
INSERT INTO t_setup SELECT 'ok_1', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com',
  'gateway', 'KB120',
  'fire', 'q16',
  'before_count', 5,
  'before_step_us', 10,
  'after_count', 3,
  'after_step_us', 20,
  'outcome', 'ok',
  'plan_rev', 7
));

SELECT is(
  (SELECT ARRAY(SELECT jsonb_object_keys(r) ORDER BY 1) FROM t_setup WHERE label = 'ok_1'),
  (SELECT cols FROM t_cols),
  '(KB120, q16, 키 13개) launch_tail_probe_change_record 반환 키 집합 = LAUNCH_TAIL_PROBE_CHANGE_COLUMNS'
);

SELECT is(
  (SELECT jsonb_build_array(r -> 'before_count', r -> 'before_step_us', r -> 'after_count', r -> 'after_step_us')
     FROM t_setup WHERE label = 'ok_1'),
  '[5, 10, 3, 20]'::jsonb,
  '(KB120, q16, 5/10 → 3/20) before · after 숫자 왕복'
);

SELECT is(
  (SELECT jsonb_build_array(r ->> 'outcome', (r ->> 'plan_rev')::bigint, r -> 'code', r -> 'message')
     FROM t_setup WHERE label = 'ok_1'),
  jsonb_build_array('ok', 7, NULL, NULL),
  '(KB120, q16, ok · rev 7) outcome · plan_rev 왕복 · code/message null'
);

SELECT is(
  public.launch_tail_probe_changes_for_admin(20),
  jsonb_build_object('tail_probe_changes', jsonb_build_array((SELECT r FROM t_setup WHERE label = 'ok_1'))),
  '(—, —, 1행) launch_tail_probe_changes_for_admin(20) = { tail_probe_changes: [기록 행] }'
);

SELECT is(
  ARRAY(SELECT jsonb_object_keys(public.launch_tail_probe_changes_for_admin(20) -> 'tail_probe_changes' -> 0) ORDER BY 1),
  (SELECT cols FROM t_cols),
  '(KB120, q16, 키 13개) 읽기 tail_probe_changes[0] 키 집합 = LAUNCH_TAIL_PROBE_CHANGE_COLUMNS'
);

-- ── 2. (gateway, fire)별 최근 N + 마지막 ok ──────────────────────────
-- KB120 · n0930: ok 1행(10/01) 뒤 failed 25행(10/02 10:00 + i분 · i = 1..25).
WITH x AS (
  INSERT INTO public.launch_tail_probe_changes
         (at, admin_email, gateway, fire, before_count, before_step_us, after_count, after_step_us, outcome, plan_rev)
  VALUES ('2026-10-01 10:00:00+09', 'admin@example.com', 'KB120', 'n0930', 5, 10, 0, 10, 'ok', 3)
  RETURNING *
)
INSERT INTO t_setup SELECT 'n_ok', to_jsonb(x) FROM x;

INSERT INTO public.launch_tail_probe_changes
       (at, admin_email, gateway, fire, before_count, before_step_us, after_count, after_step_us, outcome, code, message)
SELECT '2026-10-02 10:00:00+09'::timestamptz + make_interval(mins => i), 'admin@example.com', 'KB120', 'n0930',
       0, 10, 11, 10, 'failed', 1, '뒤탐침 발 수 범위 밖'
  FROM generate_series(1, 25) AS i;

-- KYOBO119 · q16: ok(T1) · failed(T2) · ok(T2 — 같은 at · 더 큰 id).
INSERT INTO public.launch_tail_probe_changes
       (at, admin_email, gateway, fire, before_count, before_step_us, after_count, after_step_us, outcome)
VALUES ('2026-10-03 09:00:00+09', 'b@example.com', 'KYOBO119', 'q16', NULL, NULL, 5, 10, 'ok'),
       ('2026-10-04 09:00:00+09', 'b@example.com', 'KYOBO119', 'q16', 5, 10, 3, 200, 'failed'),
       ('2026-10-04 09:00:00+09', 'b@example.com', 'KYOBO119', 'q16', 5, 10, 3, 20, 'ok');

-- 실패 시도 행 — relay 도달 실패 · 범위 밖 값도 그대로(CHECK 없음).
INSERT INTO t_setup SELECT 'offline', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com',
  'gateway', 'KYOBO112',
  'fire', 'q16',
  'before_count', NULL,
  'before_step_us', NULL,
  'after_count', 12,
  'after_step_us', 10,
  'outcome', 'offline',
  'code', NULL,
  'message', 'relay 가 거부했어요(503 LAUNCH_TAIL_PROBE_UNAVAILABLE)'
));

CREATE TEMP TABLE t_res AS
SELECT e, o FROM jsonb_array_elements(public.launch_tail_probe_changes_for_admin(20) -> 'tail_probe_changes')
  WITH ORDINALITY AS t(e, o);

SELECT is(
  (SELECT count(*)::int FROM t_res WHERE e ->> 'gateway' = 'KB120' AND e ->> 'fire' = 'n0930'),
  21,
  '(KB120, n0930, 21행) p_limit 20 → 최근 failed 20행 + 마지막 ok 1행'
);

SELECT is(
  ARRAY(SELECT (e ->> 'id')::bigint FROM t_res
         WHERE e ->> 'gateway' = 'KB120' AND e ->> 'fire' = 'n0930' AND e ->> 'outcome' = 'ok'),
  ARRAY[(SELECT (r ->> 'id')::bigint FROM t_setup WHERE label = 'n_ok')],
  '(KB120, n0930, ok 1번) 마지막 ok 행이 결과에 정확히 1번'
);

SELECT is(
  ARRAY(SELECT (e ->> 'id')::bigint FROM t_res
         WHERE e ->> 'gateway' = 'KB120' AND e ->> 'fire' = 'n0930' AND e ->> 'outcome' = 'failed'
         ORDER BY o),
  ARRAY(SELECT id FROM public.launch_tail_probe_changes
         WHERE gateway = 'KB120' AND fire = 'n0930' AND outcome = 'failed'
         ORDER BY at DESC, id DESC LIMIT 20),
  '(KB120, n0930, failed 최근 20) 가장 이른 failed 5행은 빠진다'
);

SELECT is(
  ARRAY(SELECT e ->> 'outcome' FROM t_res
         WHERE e ->> 'gateway' = 'KYOBO119' AND e ->> 'fire' = 'q16' ORDER BY o),
  ARRAY['ok', 'failed', 'ok'],
  '(KYOBO119, q16, 3행) 다른 키는 섞이지 않고 자기 행 전부 · 같은 at 은 id 내림차순'
);

SELECT is(
  (SELECT count(*)::int FROM t_res),
  26,
  '(—, —, 26행) 전체 = KB120·q16 1 + KB120·n0930 21 + KYOBO119·q16 3 + KYOBO112·q16 1'
);

SELECT is(
  ARRAY(SELECT (e ->> 'id')::bigint FROM t_res ORDER BY o),
  ARRAY(SELECT (e ->> 'id')::bigint FROM t_res ORDER BY (e ->> 'at')::timestamptz DESC, (e ->> 'id')::bigint DESC),
  '(—, —, 순서) 결과 전체 at 내림차순 · 같은 at 은 id 내림차순'
);

SELECT is(
  (SELECT jsonb_build_array(r -> 'before_count', r -> 'before_step_us', r ->> 'outcome', r -> 'code', r ->> 'message',
                            r -> 'after_count', r -> 'plan_rev')
     FROM t_setup WHERE label = 'offline'),
  jsonb_build_array(NULL, NULL, 'offline', NULL, 'relay 가 거부했어요(503 LAUNCH_TAIL_PROBE_UNAVAILABLE)', 12, NULL),
  '(KYOBO112, q16, offline · after 12) 실패 시도 행 왕복 — before null · 범위 밖 값도 기록(CHECK 없음)'
);

SELECT is(
  (SELECT jsonb_object_agg(k, n) FROM (
     SELECT (e ->> 'gateway') || '|' || (e ->> 'fire') AS k, count(*)::int AS n
       FROM jsonb_array_elements(public.launch_tail_probe_changes_for_admin(1) -> 'tail_probe_changes') AS t(e)
      GROUP BY 1) s),
  '{"KB120|q16": 1, "KB120|n0930": 2, "KYOBO119|q16": 1, "KYOBO112|q16": 1}'::jsonb,
  '(—, —, p_limit 1) 키마다 최근 1 + 마지막 ok(최근이 ok 면 중복 없이 1행)'
);

-- ── 3. 입력 오류 ────────────────────────────────────────────────────
SELECT throws_ok(
  'SELECT public.launch_tail_probe_changes_for_admin(0)', '22023', NULL,
  '(—, —, p_limit 0) 22023'
);
SELECT throws_ok(
  'SELECT public.launch_tail_probe_changes_for_admin(201)', '22023', NULL,
  '(—, —, p_limit 201) 22023'
);
SELECT throws_ok(
  'SELECT public.launch_tail_probe_changes_for_admin(NULL)', '22023', NULL,
  '(—, —, p_limit NULL) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","after_step_us":10,"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, after_count 없음) 기록 RPC 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","after_count":"3","after_step_us":10,"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, after_count 문자열) 기록 RPC 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","before_step_us":"10","after_count":3,"after_step_us":10,"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, before_step_us 문자열) 기록 RPC 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","after_count":3,"after_step_us":10,"outcome":"weird"}'::jsonb)$$,
  '23514', NULL,
  '(KB120, q16, outcome weird) CHECK 위반 23514 그대로'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"x","after_count":3,"after_step_us":10,"outcome":"ok"}'::jsonb)$$,
  '23514', NULL,
  '(KB120, x, fire 어휘 밖) CHECK 위반 23514 그대로'
);

-- ── 4. 권한 ────────────────────────────────────────────────────────
SELECT is(
  ARRAY[
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.launch_tail_probe_changes'::regclass)::int,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'launch_tail_probe_changes')
  ],
  ARRAY[1, 0],
  '(—, —, RLS) 표 RLS 켬 · pg_policies 0개(service_role 전용)'
);

SELECT is(
  ARRAY[
    has_table_privilege('anon', 'public.launch_tail_probe_changes', 'SELECT'),
    has_table_privilege('anon', 'public.launch_tail_probe_changes', 'INSERT'),
    has_table_privilege('authenticated', 'public.launch_tail_probe_changes', 'SELECT'),
    has_table_privilege('authenticated', 'public.launch_tail_probe_changes', 'INSERT')
  ],
  ARRAY[false, false, false, false],
  '(—, —, 표 권한) anon · authenticated SELECT · INSERT 불가'
);

SELECT is(
  ARRAY[
    has_table_privilege('service_role', 'public.launch_tail_probe_changes', 'SELECT'),
    has_table_privilege('service_role', 'public.launch_tail_probe_changes', 'INSERT'),
    has_table_privilege('service_role', 'public.launch_tail_probe_changes', 'UPDATE'),
    has_table_privilege('service_role', 'public.launch_tail_probe_changes', 'DELETE')
  ],
  ARRAY[true, true, false, false],
  '(—, —, 표 권한) service_role SELECT · INSERT 만(이력은 고치지 않는다)'
);

SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  '(—, —, EXECUTE) launch_tail_probe_change_record (anon, authenticated, service_role) = (f, f, t)'
);

SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  '(—, —, EXECUTE) launch_tail_probe_changes_for_admin (anon, authenticated, service_role) = (f, f, t)'
);

-- service_role 로 실제 기록 · 읽기(identity 시퀀스 포함) — 결과는 GUC 로 넘긴다(pgTAP 임시 표는 service_role 이 못 쓴다).
SET LOCAL ROLE service_role;
DO $svc$
BEGIN
  PERFORM set_config('t.svc_row', public.launch_tail_probe_change_record(jsonb_build_object(
    'admin_email', 'svc@example.com', 'gateway', 'KB120', 'fire', 'q16',
    'before_count', 3, 'before_step_us', 20, 'after_count', 4, 'after_step_us', 15, 'outcome', 'ok', 'plan_rev', 9
  ))::text, true);
  PERFORM set_config('t.svc_n',
    jsonb_array_length(public.launch_tail_probe_changes_for_admin(20) -> 'tail_probe_changes')::text, true);
END
$svc$;
RESET ROLE;

SELECT is(
  jsonb_build_array(current_setting('t.svc_row')::jsonb ->> 'admin_email', current_setting('t.svc_row')::jsonb -> 'after_count',
                    current_setting('t.svc_n')::int),
  jsonb_build_array('svc@example.com', 4, 27),
  '(KB120, q16, service_role) 기록 · 읽기가 service_role 로 실제 돈다(27행)'
);

SELECT * FROM finish();
ROLLBACK;
