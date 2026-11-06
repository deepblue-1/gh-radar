-- ============================================================
-- Phase 40 Plan 01 — 체결 푸시 기기 · 결과 보고 RPC pgTAP.
--
-- 잠그는 것:
--   | 절 | 무엇                                                                                     | 결정        |
--   |----|------------------------------------------------------------------------------------------|-------------|
--   | 1  | 새 표 4개 존재                                                                             | D-07 · D-12 |
--   | 2  | 「이 기기 켜기」 upsert → enabled = true 행 1 · 목록 1 · 목록 원소에 token 키 없음 · 키 집합 | D-12 · D-13 |
--   | 3  | 같은 기기 키로 새 토큰 upsert → 행 수 1 유지 · 토큰 교체                                     | D-12        |
--   | 4  | upsert · 목록 RPC EXECUTE (anon, authenticated, service_role) = (f, f, t)                    | SC-4        |
--   | 5  | 토큰 인계 — 다른 사용자가 같은 토큰 등록 → 앞 사용자 행 삭제 · 같은 사용자 새 기기 키 → 옛 키 행 삭제 · 표 기본 enabled = false | D-15 · D-12 |
--   | 6  | 끄기 · 지우기 · 결과 보고 RPC 존재                                                          | D-13 · D-15 |
--   | 7  | 끄기 — 자기 키 true · enabled = false · 토큰 그대로 / 남의 키 · 없는 키 false · 남의 행 불변 | D-13 · SC-4 |
--   | 8  | 지우기 — 자기 키 true · 행 삭제 / 남의 키 · 없는 키 false · 남의 행 남음                     | D-13 · SC-4 |
--   | 9  | 결과 보고 — token_removed ∧ 토큰 일치만 기기 삭제 · 불일치 남음 · ok/failed 불변 · 없는 log_id 건너뜀 · reason 200자 · token 칸 없음 | D-15 · SC-3 |
--   | 10 | 새 RPC 3개 EXECUTE (f, f, t) · 새 표 4개 SELECT (f, f, t) · RLS 켜짐 · 정책 0              | SC-4        |
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_devices.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (사용자, 기기 키 말미, 기대값) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자: U1 = 00000000-0000-4000-8000-000000004001 · U2 = …4002.
-- 기기 키: K1 = 11111111-1111-4111-8111-111111111111(U1) · K2 = 22222222-2222-4222-8222-222222222222(U2) ·
--          K3 = 33333333-3333-4333-8333-333333333333(U1 새 키) · K4 = 44444444-4444-4444-8444-444444444444(없는 키).
-- 토큰은 64자 고정 문자열 — 2·3절 리터럴 aaaa…/bbbb… 와 5절 이후 repeat('b', 64) 는 같은 값이다.
-- 결과 보고 픽스처: dma_push_log 1행(KB120 · 오늘 KST · 계좌 9900004001 · 체인 0000001 · filled · sent)을 직접 넣는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(48);

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004001', 'push-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000004002', 'push-u2@example.invalid');

CREATE TEMP TABLE t_res (label text PRIMARY KEY, r jsonb) ON COMMIT DROP;

-- ── 1. 표 4개 ────────────────────────────────────────────────────
SELECT has_table('public', 'dma_push_devices', '표 dma_push_devices 가 있다');
SELECT has_table('public', 'dma_push_chains', '표 dma_push_chains 가 있다');
SELECT has_table('public', 'dma_push_log', '표 dma_push_log 가 있다');
SELECT has_table('public', 'dma_push_deliveries', '표 dma_push_deliveries 가 있다');

-- ── 2. 「이 기기 켜기」 ────────────────────────────────────────────
INSERT INTO t_res VALUES ('u1_on', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004001', '11111111-1111-4111-8111-111111111111',
  'ios', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'iPhone'));

SELECT is(
  (SELECT (r->>'enabled')::boolean FROM t_res WHERE label = 'u1_on'),
  true, '(U1, K1…1111, 첫 upsert) 반환 enabled = true — 표 기본값 false 를 켠다'
);
SELECT is(
  (SELECT jsonb_array_length(public.dma_push_devices_for_user('00000000-0000-4000-8000-000000004001'))),
  1, '(U1 목록) 길이 1'
);
SELECT ok(
  NOT (public.dma_push_devices_for_user('00000000-0000-4000-8000-000000004001')->0 ? 'token'),
  '(U1 목록 원소) token 키 없음'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k)
     FROM jsonb_object_keys(public.dma_push_devices_for_user('00000000-0000-4000-8000-000000004001')->0) k),
  ARRAY['createdAt', 'deviceKey', 'enabled', 'label', 'lastSeenAt', 'platform'],
  '(U1 목록 원소) 키 집합 = shared PushDevice 6키'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM t_res, jsonb_object_keys(r) k WHERE label = 'u1_on'),
  ARRAY['createdAt', 'deviceKey', 'enabled', 'label', 'lastSeenAt', 'platform'],
  '(U1 upsert 반환) 키 집합 = shared PushDevice 6키 · token 없음'
);

-- ── 3. 같은 기기 키 · 새 토큰 ─────────────────────────────────────
INSERT INTO t_res VALUES ('u1_rotate', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004001', '11111111-1111-4111-8111-111111111111',
  'ios', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'iPhone'));

SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004001'),
  1, '(U1, K1…1111, 토큰 갱신) 행 수 1 유지'
);
SELECT is(
  (SELECT token FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001'
      AND device_key = '11111111-1111-4111-8111-111111111111'),
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '(U1, K1…1111, 토큰 갱신) 토큰 = bbbb… 로 교체'
);

-- ── 4. 권한 ─────────────────────────────────────────────────────
SELECT is(
  row(has_function_privilege('anon', 'public.dma_push_device_upsert(uuid, text, text, text, text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_push_device_upsert(uuid, text, text, text, text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_push_device_upsert(uuid, text, text, text, text)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_push_device_upsert EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_push_devices_for_user(uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_push_devices_for_user(uuid)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_push_devices_for_user(uuid)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_push_devices_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

-- ── 5. 토큰 인계 (D-15 · RESEARCH Pitfall 12) ──────────────────────
-- 지금: U1 K1 토큰 bbbb…. U2 가 같은 폰에 로그인해 같은 토큰을 자기 기기 키 K2 로 등록한다(U1 로그아웃 DELETE 실패 가정).
INSERT INTO t_res VALUES ('u2_takeover', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004002', '22222222-2222-4222-8222-222222222222',
  'ios', repeat('b', 64), 'iPhone'));

SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004001'),
  0, '(U2, K2…2222, U1 과 같은 토큰 bbbb…) U1 의 그 토큰 행이 먼저 지워진다 — U1 행 0'
);
SELECT is(
  (SELECT row(device_key, token = repeat('b', 64), enabled)::text
     FROM public.dma_push_devices WHERE user_id = '00000000-0000-4000-8000-000000004002'),
  '(22222222-2222-4222-8222-222222222222,t,t)', '(U2, K2…2222 인계 뒤) U2 행 1 · 토큰 bbbb… · enabled = true'
);
SELECT is(
  public.dma_push_devices_for_user('00000000-0000-4000-8000-000000004001'),
  '[]'::jsonb, '(U1 목록, 인계 뒤) [] — 앞 사람 기기가 목록에서 사라진다'
);

-- 같은 사용자 · 새 기기 키(localStorage 초기화) · 같은 토큰 → 옛 기기 키 행 정리.
INSERT INTO t_res VALUES ('u1_k1_c', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004001', '11111111-1111-4111-8111-111111111111',
  'android', repeat('c', 64), 'Galaxy'));
INSERT INTO t_res VALUES ('u1_k3_c', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004001', '33333333-3333-4333-8333-333333333333',
  'android', repeat('c', 64), 'Galaxy'));

SELECT is(
  (SELECT array_agg(device_key)::text FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001'),
  '{33333333-3333-4333-8333-333333333333}',
  '(U1, K1…1111 → K3…3333 같은 토큰 cccc…) 옛 키 K1 행이 지워지고 K3 만 남는다'
);
SELECT col_default_is(
  'public', 'dma_push_devices', 'enabled', 'false',
  '표 기본값 enabled = false — 새 기기 기본 꺼짐(D-12)'
);

-- 뒤 절 픽스처: U1 K1 을 자기 토큰 dddd… 로 다시 켠다 → U1 = K1(dddd… · 켜짐) · K3(cccc… · 켜짐), U2 = K2(bbbb…).
INSERT INTO t_res VALUES ('u1_k1_d', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004001', '11111111-1111-4111-8111-111111111111',
  'ios', repeat('d', 64), 'iPhone'));

-- ── 6. 끄기 · 지우기 · 결과 보고 RPC 존재 ──────────────────────────
SELECT has_function('public', 'dma_push_device_disable', ARRAY['uuid', 'text'],
  'dma_push_device_disable(uuid, text) 가 있다');
SELECT has_function('public', 'dma_push_device_delete', ARRAY['uuid', 'text'],
  'dma_push_device_delete(uuid, text) 가 있다');
SELECT has_function('public', 'dma_push_report', ARRAY['jsonb'],
  'dma_push_report(jsonb) 가 있다');

-- ── 7. 끄기 (D-13 · SC-4) ──────────────────────────────────────────
SELECT is(
  public.dma_push_device_disable('00000000-0000-4000-8000-000000004002', '11111111-1111-4111-8111-111111111111'),
  false, '(U2 가 U1 의 K1…1111 끄기) false — 남의 기기 키'
);
SELECT is(
  (SELECT enabled FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001' AND device_key = '11111111-1111-4111-8111-111111111111'),
  true, '(U2 끄기 시도 뒤 U1, K1…1111) enabled = true 그대로'
);
SELECT is(
  public.dma_push_device_disable('00000000-0000-4000-8000-000000004001', '11111111-1111-4111-8111-111111111111'),
  true, '(U1, K1…1111 끄기) true'
);
SELECT is(
  (SELECT row(enabled, token = repeat('d', 64))::text FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001' AND device_key = '11111111-1111-4111-8111-111111111111'),
  '(f,t)', '(U1, K1…1111 끈 뒤) enabled = false · 토큰 dddd… 그대로'
);
SELECT is(
  public.dma_push_device_disable('00000000-0000-4000-8000-000000004001', '44444444-4444-4444-8444-444444444444'),
  false, '(U1, 없는 키 K4…4444 끄기) false'
);

-- ── 8. 지우기 (D-13 · SC-4) ────────────────────────────────────────
SELECT is(
  public.dma_push_device_delete('00000000-0000-4000-8000-000000004002', '33333333-3333-4333-8333-333333333333'),
  false, '(U2 가 U1 의 K3…3333 지우기) false — 남의 기기 키'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001' AND device_key = '33333333-3333-4333-8333-333333333333'),
  1, '(U2 지우기 시도 뒤 U1, K3…3333) 행 남음'
);
SELECT is(
  public.dma_push_device_delete('00000000-0000-4000-8000-000000004001', '44444444-4444-4444-8444-444444444444'),
  false, '(U1, 없는 키 K4…4444 지우기) false'
);
SELECT is(
  public.dma_push_device_delete('00000000-0000-4000-8000-000000004001', '33333333-3333-4333-8333-333333333333'),
  true, '(U1, K3…3333 지우기) true'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001' AND device_key = '33333333-3333-4333-8333-333333333333'),
  0, '(U1, K3…3333 지운 뒤) 행 0'
);

-- ── 9. 결과 보고 · 죽은 토큰 정리 (D-15 · SC-3) ─────────────────────
-- 지금: U1 = K1(dddd… · 꺼짐), U2 = K2(bbbb… · 켜짐). 송신 로그 1행(KB120 · 오늘 KST · …4001 · 체인 0000001 · filled).
INSERT INTO public.dma_push_log (gateway, trade_date, account_no, chain_key, stage, outcome)
VALUES ('KB120', (now() AT TIME ZONE 'Asia/Seoul')::date, '9900004001', '0000001', 'filled', 'sent');

CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.dma_push_log WHERE account_no = '9900004001' AND chain_key = '0000001') AS log_id,
  (SELECT id FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004001' AND device_key = '11111111-1111-4111-8111-111111111111') AS d1,
  (SELECT id FROM public.dma_push_devices
    WHERE user_id = '00000000-0000-4000-8000-000000004002' AND device_key = '22222222-2222-4222-8222-222222222222') AS d2;

-- 9a. token_removed · 보낸 토큰 = 지금 토큰 → 기기 행 삭제.
INSERT INTO t_res
SELECT 'rep_removed', public.dma_push_report(jsonb_build_array(jsonb_build_object(
  'log_id', log_id, 'device_id', d1, 'platform', 'ios', 'token', repeat('d', 64),
  'result', 'token_removed', 'http_status', 410, 'reason', 'Unregistered')))
FROM t_ids;

SELECT is(
  (SELECT r FROM t_res WHERE label = 'rep_removed'),
  '{"recorded":1,"removed":1}'::jsonb,
  '(U1 K1…1111 token_removed 410, 토큰 dddd… 일치) 반환 {recorded 1, removed 1}'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE id = (SELECT d1 FROM t_ids)),
  0, '(U1 K1…1111 token_removed, 토큰 일치) 기기 행 삭제'
);
SELECT is(
  (SELECT row(result, http_status, reason, platform)::text FROM public.dma_push_deliveries
    WHERE device_id = (SELECT d1 FROM t_ids)),
  '(token_removed,410,Unregistered,ios)',
  '(U1 K1…1111 token_removed) deliveries 1행 = (token_removed, 410, Unregistered, ios) — 기기가 지워져도 결과는 남는다'
);

-- 9b. token_removed · 보낸 토큰 ≠ 지금 토큰(그사이 갱신) → 기기 행 남음.
INSERT INTO t_res
SELECT 'rep_stale_token', public.dma_push_report(jsonb_build_array(jsonb_build_object(
  'log_id', log_id, 'device_id', d2, 'platform', 'ios', 'token', repeat('z', 64),
  'result', 'token_removed', 'http_status', 410, 'reason', 'Unregistered')))
FROM t_ids;

SELECT is(
  (SELECT r FROM t_res WHERE label = 'rep_stale_token'),
  '{"recorded":1,"removed":0}'::jsonb,
  '(U2 K2…2222 token_removed, 보낸 토큰 zzzz… ≠ 지금 bbbb…) 반환 {recorded 1, removed 0}'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_devices WHERE id = (SELECT d2 FROM t_ids)),
  1, '(U2 K2…2222 token_removed, 토큰 불일치) 기기 행 남음 — 갱신된 토큰을 지우지 않는다'
);

-- 9c. ok · failed · 긴 사유 · 없는 log_id(토큰은 일치) 한 묶음.
INSERT INTO t_res
SELECT 'rep_mixed', public.dma_push_report(jsonb_build_array(
  jsonb_build_object('log_id', log_id, 'device_id', d2, 'platform', 'ios', 'token', repeat('b', 64),
                     'result', 'ok', 'http_status', 200, 'reason', ''),
  jsonb_build_object('log_id', log_id, 'device_id', d2, 'platform', 'ios', 'token', repeat('b', 64),
                     'result', 'failed', 'http_status', 400, 'reason', 'BadDeviceToken'),
  jsonb_build_object('log_id', log_id, 'device_id', d2, 'platform', 'ios', 'token', repeat('b', 64),
                     'result', 'failed', 'http_status', 500, 'reason', repeat('x', 300)),
  jsonb_build_object('log_id', '00000000-0000-4000-8000-0000000040ff', 'device_id', d2, 'platform', 'ios',
                     'token', repeat('b', 64), 'result', 'token_removed', 'http_status', 410, 'reason', 'Unregistered')))
FROM t_ids;

SELECT is(
  (SELECT r FROM t_res WHERE label = 'rep_mixed'),
  '{"recorded":3,"removed":0}'::jsonb,
  '(U2 K2…2222 ok · failed 2 · 없는 log_id token_removed) 반환 {recorded 3, removed 0} — 없는 log_id 원소는 건너뜀'
);
SELECT is(
  (SELECT row(token = repeat('b', 64), enabled)::text FROM public.dma_push_devices WHERE id = (SELECT d2 FROM t_ids)),
  '(t,t)', '(U2 K2…2222 ok · failed · 없는 log_id 의 token_removed 뒤) 행 · 토큰 · enabled 불변'
);
SELECT is(
  (SELECT array_agg(row(result, http_status, reason)::text ORDER BY id) FROM public.dma_push_deliveries
    WHERE device_id = (SELECT d2 FROM t_ids) AND http_status IN (200, 400)),
  ARRAY['(ok,200,"")', '(failed,400,BadDeviceToken)'],
  '(U2 K2…2222 ok 200 · failed 400) deliveries 에 result · http_status · reason 그대로'
);
SELECT is(
  (SELECT length(reason) FROM public.dma_push_deliveries WHERE http_status = 500),
  200, '(U2 K2…2222 failed 500 · 사유 300자) reason 200자로 잘림'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_deliveries WHERE log_id = (SELECT log_id FROM t_ids)),
  5, '(로그 0000001) deliveries 5행 = 9a 1 + 9b 1 + 9c 3 — 결과마다 1행'
);
SELECT hasnt_column('public', 'dma_push_deliveries', 'token',
  'dma_push_deliveries 에 token 칸 없음 — 토큰 원문 저장 안 함');

-- ── 10. 권한 (SC-4) ─────────────────────────────────────────────
SELECT is(
  row(has_function_privilege('anon', 'public.dma_push_device_disable(uuid, text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_push_device_disable(uuid, text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_push_device_disable(uuid, text)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_push_device_disable EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_push_device_delete(uuid, text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_push_device_delete(uuid, text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_push_device_delete(uuid, text)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_push_device_delete EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_push_report(jsonb)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_push_report(jsonb)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_push_report(jsonb)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_push_report EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  (SELECT array_agg(row(t, has_table_privilege('anon', 'public.' || t, 'SELECT'),
                           has_table_privilege('authenticated', 'public.' || t, 'SELECT'),
                           has_table_privilege('service_role', 'public.' || t, 'SELECT'))::text ORDER BY t)
     FROM unnest(ARRAY['dma_push_chains', 'dma_push_deliveries', 'dma_push_devices', 'dma_push_log']) t),
  ARRAY['(dma_push_chains,f,f,t)', '(dma_push_deliveries,f,f,t)', '(dma_push_devices,f,f,t)', '(dma_push_log,f,f,t)'],
  '새 표 4개 SELECT (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'dma\_push\_%' AND c.relkind = 'r' AND c.relrowsecurity),
  ARRAY['dma_push_chains', 'dma_push_deliveries', 'dma_push_devices', 'dma_push_log'],
  '새 표 4개 RLS 켜짐'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'dma\_push\_%'),
  0, '새 표 4개 접근 규칙(POLICY) 0개 — 서비스롤 전용'
);

SELECT * FROM finish(true);

ROLLBACK;
