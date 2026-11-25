-- ============================================================
-- quick-261125-lju — 발사 탐침 이력 목록 모드(시장 · 정각 기준 µs 목록) pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261125120000_launch_tail_probe_offsets.sql
--   (옛 개수 · 간격 모드 · 표 권한은 supabase/tests/launch_tail_probe_changes.test.sql 이 잠근다)
--
-- 잠그는 것:
--   - 목록 모드 기록: (KB120, q16, Q, [−300, −290]) · 빈 목록(꺼짐) · before 목록 왕복 · after_count · after_step_us null ·
--     반환 after_offsets_us 가 숫자 배열.
--   - 옛 모드 기록이 여전히 된다(after_offsets_us 없음 + after_count · after_step_us) · market null.
--   - 입력 오류: 두 모드 다 없음 · 목록인데 market 없음 · after_offsets_us 원소 문자열 · before_offsets_us 문자열 → 22023 ·
--     market 'X' → 23514 · 표에 직접 넣는 모드 위반(목록 + market NULL · 옛 + after_count NULL) → 23514.
--   - 읽기: (gateway, fire, market) 별 최근 p_limit — K 3행 · Q 2행 · p_limit 2 → 시장마다 2행(+ 마지막 ok).
--   - 권한: 두 RPC EXECUTE (anon, authenticated, service_role) = (f, f, t) · service_role 로 목록 모드 기록 성공.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_tail_probe_offsets.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (서버, 발사, 시장, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

SELECT plan(22);

-- ── 1. 목록 모드 기록 ───────────────────────────────────────────────
INSERT INTO t_setup SELECT 'list_1', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com',
  'gateway', 'KB120',
  'fire', 'q16',
  'market', 'Q',
  'before_offsets_us', jsonb_build_array(-210, -200),
  'after_offsets_us', jsonb_build_array(-300, -290),
  'before_count', NULL,
  'before_step_us', NULL,
  'after_count', NULL,
  'after_step_us', NULL,
  'outcome', 'ok',
  'plan_rev', 8
));

SELECT is(
  (SELECT jsonb_build_array(r ->> 'market', r -> 'before_offsets_us', r -> 'after_offsets_us') FROM t_setup WHERE label = 'list_1'),
  jsonb_build_array('Q', jsonb_build_array(-210, -200), jsonb_build_array(-300, -290)),
  '(KB120, q16, Q, 목록) market · before · after 목록 왕복'
);

SELECT is(
  (SELECT jsonb_typeof(r -> 'after_offsets_us') || '|' || jsonb_typeof(r -> 'after_offsets_us' -> 0) FROM t_setup WHERE label = 'list_1'),
  'array|number',
  '(KB120, q16, Q, 숫자 배열) 반환 after_offsets_us 는 숫자 배열'
);

SELECT is(
  (SELECT jsonb_build_array(r -> 'after_count', r -> 'after_step_us', r -> 'before_count', r -> 'before_step_us')
     FROM t_setup WHERE label = 'list_1'),
  jsonb_build_array(NULL, NULL, NULL, NULL),
  '(KB120, q16, Q, 옛 칸 null) 목록 행의 after_count · after_step_us · before 둘은 null'
);

SELECT is(
  (SELECT jsonb_build_array(r ->> 'outcome', (r ->> 'plan_rev')::bigint) FROM t_setup WHERE label = 'list_1'),
  jsonb_build_array('ok', 8),
  '(KB120, q16, Q, ok · rev 8) outcome · plan_rev 왕복'
);

-- 빈 목록(꺼짐) · before 모름.
INSERT INTO t_setup SELECT 'list_off', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com',
  'gateway', 'KYOBO119',
  'fire', 'n0930',
  'market', 'K',
  'before_offsets_us', NULL,
  'after_offsets_us', '[]'::jsonb,
  'outcome', 'offline',
  'message', 'relay 가 거부했어요(503 LAUNCH_TAIL_PROBE_UNAVAILABLE)'
));

SELECT is(
  (SELECT jsonb_build_array(r ->> 'market', r -> 'before_offsets_us', r -> 'after_offsets_us', r ->> 'outcome') FROM t_setup WHERE label = 'list_off'),
  jsonb_build_array('K', NULL, '[]'::jsonb, 'offline'),
  '(KYOBO119, n0930, K, 빈 목록) 꺼짐 저장 시도 · before null 기록'
);

-- 범위 밖 · 11발 · 비감소 위반도 기록된다(CHECK 없음 — 서버 거부 시도).
INSERT INTO t_setup SELECT 'list_bad', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com', 'gateway', 'KB120', 'fire', 'q16', 'market', 'K',
  'after_offsets_us', jsonb_build_array(5000, -10, -20, -30, -40, -50, -60, -70, -80, -90, -100),
  'outcome', 'failed', 'code', 1, 'message', '서버 거부 원문'
));

SELECT is(
  (SELECT jsonb_array_length(r -> 'after_offsets_us') FROM t_setup WHERE label = 'list_bad'),
  11,
  '(KB120, q16, K, 11발 · 범위 밖) 서버 거부 시도도 그대로 기록(범위 · 개수 · 순서 CHECK 없음)'
);

-- ── 2. 옛 모드 유지 ─────────────────────────────────────────────────
INSERT INTO t_setup SELECT 'legacy', public.launch_tail_probe_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com', 'gateway', 'KB120', 'fire', 'q16',
  'before_count', 5, 'before_step_us', 10, 'after_count', 3, 'after_step_us', 20, 'outcome', 'ok'
));

SELECT is(
  (SELECT jsonb_build_array(r -> 'market', r -> 'after_offsets_us', r -> 'after_count', r -> 'after_step_us') FROM t_setup WHERE label = 'legacy'),
  jsonb_build_array(NULL, NULL, 3, 20),
  '(KB120, q16, —, 옛 모드) 개수 · 간격 기록 유지 · market · 목록 null'
);

-- ── 3. 입력 오류 ────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","market":"K","outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, K, 두 모드 다 없음) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","after_offsets_us":[-200],"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, —, 목록인데 market 없음) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","market":"K","after_offsets_us":["-200"],"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, K, after_offsets_us 원소 문자열) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","market":"K","after_offsets_us":-200,"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, K, after_offsets_us 배열 아님) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","market":"K","before_offsets_us":"x","after_offsets_us":[-200],"outcome":"ok"}'::jsonb)$$,
  '22023', NULL,
  '(KB120, q16, K, before_offsets_us 문자열) 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"q16","market":"X","after_offsets_us":[-200],"outcome":"ok"}'::jsonb)$$,
  '23514', NULL,
  '(KB120, q16, X, market 어휘 밖) CHECK 23514'
);
SELECT throws_ok(
  $$INSERT INTO public.launch_tail_probe_changes (admin_email, gateway, fire, after_offsets_us, outcome)
    VALUES ('a@x', 'KB120', 'q16', ARRAY[-200], 'ok')$$,
  '23514', NULL,
  '(KB120, q16, NULL, 표 직접 — 목록인데 market 없음) 모드 CHECK 23514'
);
SELECT throws_ok(
  $$INSERT INTO public.launch_tail_probe_changes (admin_email, gateway, fire, after_step_us, outcome)
    VALUES ('a@x', 'KB120', 'q16', 10, 'ok')$$,
  '23514', NULL,
  '(KB120, q16, —, 표 직접 — 옛 모드인데 after_count 없음) 모드 CHECK 23514'
);

-- ── 4. 읽기 — (gateway, fire, market) 별 ───────────────────────────
-- KB120 · n0930 · K 3행(ok · failed · failed) · Q 2행(failed · failed).
INSERT INTO public.launch_tail_probe_changes (at, admin_email, gateway, fire, market, after_offsets_us, outcome)
VALUES ('2026-11-20 09:00:00+09', 'a@x', 'KB120', 'n0930', 'K', ARRAY[-100], 'ok'),
       ('2026-11-21 09:00:00+09', 'a@x', 'KB120', 'n0930', 'K', ARRAY[-110], 'failed'),
       ('2026-11-22 09:00:00+09', 'a@x', 'KB120', 'n0930', 'K', ARRAY[-120], 'failed'),
       ('2026-11-21 09:00:00+09', 'a@x', 'KB120', 'n0930', 'Q', ARRAY[-130], 'failed'),
       ('2026-11-22 09:00:00+09', 'a@x', 'KB120', 'n0930', 'Q', ARRAY[-140], 'failed');

CREATE TEMP TABLE t_res AS
SELECT e FROM jsonb_array_elements(public.launch_tail_probe_changes_for_admin(2) -> 'tail_probe_changes') AS t(e)
 WHERE e ->> 'gateway' = 'KB120' AND e ->> 'fire' = 'n0930';

SELECT is(
  (SELECT count(*)::int FROM t_res WHERE e ->> 'market' = 'K'),
  3,
  '(KB120, n0930, K, 3행) p_limit 2 → 최근 failed 2행 + 마지막 ok 1행'
);
SELECT is(
  (SELECT count(*)::int FROM t_res WHERE e ->> 'market' = 'Q'),
  2,
  '(KB120, n0930, Q, 2행) 다른 시장은 따로 묶인다(K 행에 밀리지 않는다)'
);
SELECT is(
  ARRAY(SELECT (e -> 'after_offsets_us' ->> 0)::int FROM t_res WHERE e ->> 'market' = 'K' ORDER BY (e ->> 'at')::timestamptz DESC),
  ARRAY[-120, -110, -100],
  '(KB120, n0930, K, 순서) 최근 2 + 마지막 ok · at 내림차순'
);

SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.launch_tail_probe_changes_for_admin(1) -> 'tail_probe_changes') AS t(e)
    WHERE e ->> 'gateway' = 'KB120' AND e ->> 'fire' = 'q16' AND e -> 'market' = 'null'::jsonb),
  1,
  '(KB120, q16, NULL, p_limit 1) 옛 행은 market NULL 끼리 한 묶음 — 최근이 ok 라 1행'
);

-- ── 5. 권한 ────────────────────────────────────────────────────────
SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_tail_probe_change_record(jsonb)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  '(—, —, —, EXECUTE) 교체한 launch_tail_probe_change_record (anon, authenticated, service_role) = (f, f, t)'
);

SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_tail_probe_changes_for_admin(integer)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  '(—, —, —, EXECUTE) 교체한 launch_tail_probe_changes_for_admin (anon, authenticated, service_role) = (f, f, t)'
);

SET LOCAL ROLE service_role;
DO $svc$
BEGIN
  PERFORM set_config('t.svc_row', public.launch_tail_probe_change_record(jsonb_build_object(
    'admin_email', 'svc@example.com', 'gateway', 'KYOBO119', 'fire', 'q16', 'market', 'K',
    'before_offsets_us', jsonb_build_array(-350), 'after_offsets_us', jsonb_build_array(-350, -340),
    'outcome', 'ok', 'plan_rev', 11
  ))::text, true);
END
$svc$;
RESET ROLE;

SELECT is(
  jsonb_build_array(current_setting('t.svc_row')::jsonb ->> 'admin_email', current_setting('t.svc_row')::jsonb -> 'after_offsets_us'),
  jsonb_build_array('svc@example.com', jsonb_build_array(-350, -340)),
  '(KYOBO119, q16, K, service_role) 목록 모드 기록이 service_role 로 실제 돈다'
);

SELECT * FROM finish();
ROLLBACK;
