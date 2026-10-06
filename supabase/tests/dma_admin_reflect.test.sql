-- ============================================================
-- Phase 29 Plan 05 — 87 반영 상태 · Admin 개요 원자료 pgTAP (D-05 · D-23 ③ · D-03).
--
-- 잠그는 것:
--   - 트레이서: dma_admin_create_dma_user → admin_users_raw().intent 에 그 행 · snapshotAccounts 빈 배열 →
--     dma_admin_apply_snapshot('KB120', …) → snapshotAccounts 에 같은 계좌(shared AdminUsersRaw camelCase 키)
--   - 87 적재: 넣은 계좌 행 수 · 같은 서버 재적재 = 통째 교체(이전 행 사라짐) · 다른 서버 행 불변 ·
--     users_rev 는 낮아져도 그대로 저장(비교 금지) · 교보 빈 branch/trader 그대로 · 빈 accountNo 는 교체 전체 거부
--   - admin_users_raw(): 7키 정확히 · pending = 가입했지만 허용 표에 없는 이메일 · 사전 등록 이메일 signedUp false ·
--     usersRev 는 문자열 · snapshotAccounts 행 키 = AdminSnapshotAccountRow
--   - 최근 결과: 같은 (유저, 서버) 두 번 → 1행 최신 · 같은 호출 안 중복은 뒤가 이김 · 모르는 서버 · 없는 DMA id 버림 ·
--     raw.results 에 반영(AdminResultRow 키)
--   - admin_servers_raw(): 3키 · servers camelCase 전 열 · userCounts = 87 의 서로 다른 DMA id 수 · usersRev 문자열
--   - 입양: dma_users 에 있는 DMA id 만 · 이미 있는 계좌/등록 행 불변(removing 유지) · 의도 CHECK 를 못 맞추는 87 행 제외 ·
--     두 번째 호출 0(멱등) · 없는 서버 P0002
--   - 잠금: 새 표 3개 RLS · 정책 0 · anon/authenticated 권한 없음 · 새 RPC 5종 anon/authenticated EXECUTE 없음 · service_role 있음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_reflect.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 픽스처:
--   r5-a@example.invalid     가입 + 허용(trader) → DMA r5d1(KB 계좌 5100000001 · KB120)
--   r5-pre@example.invalid   사전 등록(가입 전 · viewer) → signedUp false
--   r5-wait@example.invalid  가입했지만 허용 표에 없음 → pending
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(72);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, created_at) VALUES
  ('00000000-0000-4000-8000-000000002961', 'r5-a@example.invalid',    '2026-10-01 09:00:00+09'),
  ('00000000-0000-4000-8000-000000002962', 'R5-Wait@example.invalid', '2026-10-02 09:00:00+09');
INSERT INTO public.app_users (email, role) VALUES
  ('r5-a@example.invalid',   'trader'),
  ('r5-pre@example.invalid', 'viewer');

CREATE TEMP TABLE t_raw (label text PRIMARY KEY, r jsonb);

-- ── 트레이서: 생성 → 원자료 → 87 적재 → 원자료 ───────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_create_dma_user('r5-a@example.invalid', 'r5d1', 'enc-r5d1',
      '{"broker":"KB","accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY['KB120'])$$,
  '(tracer create r5d1 · KB 5100000001 · KB120, 성공)'
);
INSERT INTO t_raw VALUES ('before', public.admin_users_raw());
SELECT is(
  (SELECT jsonb_agg(e) FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'before') -> 'intent') e
    WHERE e ->> 'dmaUserId' = 'r5d1'),
  '[{"dmaUserId":"r5d1","broker":"KB","accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1,"serverKey":"KB120","state":"active"}]'::jsonb,
  '(tracer raw.intent, r5d1 의 KB120 active 1행)'
);
SELECT is(
  (SELECT r -> 'snapshotAccounts' FROM t_raw WHERE label = 'before'),
  '[]'::jsonb, '(tracer raw.snapshotAccounts, 87 적재 전 빈 배열)'
);
SELECT is(
  public.dma_admin_apply_snapshot('KB120', 2, '[
    {"userId":"r5d1","accounts":[{"accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}]}
  ]'::jsonb),
  1, '(tracer apply KB120 rev 2, 계좌 1행)'
);
INSERT INTO t_raw VALUES ('after', public.admin_users_raw());
SELECT is(
  (SELECT r -> 'snapshotAccounts' FROM t_raw WHERE label = 'after'),
  '[{"serverKey":"KB120","dmaUserId":"r5d1","accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}]'::jsonb,
  '(tracer raw.snapshotAccounts, KB120 의 같은 계좌 — AdminSnapshotAccountRow 키)'
);
SELECT is(
  (SELECT r -> 'snapshots' -> 0 ->> 'serverKey' FROM t_raw WHERE label = 'after')
  || ':' || (SELECT jsonb_typeof(r -> 'snapshots' -> 0 -> 'usersRev') FROM t_raw WHERE label = 'after')
  || ':' || (SELECT r -> 'snapshots' -> 0 ->> 'usersRev' FROM t_raw WHERE label = 'after'),
  'KB120:string:2', '(tracer raw.snapshots, KB120 · usersRev 문자열 "2")'
);

-- ── 87 적재: 유저 2 · 교보 빈 branch ───────────────────────────────────
SELECT is(
  public.dma_admin_apply_snapshot('KB120', 7, '[
    {"userId":"r5u1","accounts":[
      {"accountNo":"5200000001","name":"A1","branchNo":"00002","traderId":"000002","priority":0},
      {"accountNo":"5200000002","name":"A2","branchNo":"00002","traderId":"000002","priority":1},
      {"accountNo":"5200000002","name":"A2-dup","branchNo":"00002","traderId":"000002","priority":2}]},
    {"userId":"r5u2","accounts":[
      {"accountNo":"5200000003","name":"A3","branchNo":"00003","traderId":"000003","priority":0}]},
    {"userId":"r5u3","accounts":[]}
  ]'::jsonb),
  3, '(apply KB120 rev 7 · 유저 2 + 계좌 없는 유저 · 중복 계좌, 3행)'
);
SELECT is(
  public.dma_admin_apply_snapshot('KYOBO119', 5, '[
    {"userId":"r5k1","accounts":[{"accountNo":"7100000001","name":"교보","branchNo":"","traderId":"","priority":0}]}
  ]'::jsonb),
  1, '(apply KYOBO119 rev 5, 1행)'
);
SELECT is(
  (SELECT branch_no || '|' || trader_id FROM public.dma_server_user_accounts WHERE server_key = 'KYOBO119'),
  '|', '(KYOBO119 r5k1, 교보 branch/trader 빈 문자열 그대로)'
);
SELECT is(
  (SELECT array_agg(dma_user_id || '/' || account_no || '/' || name ORDER BY account_no)
     FROM public.dma_server_user_accounts WHERE server_key = 'KB120'),
  ARRAY['r5u1/5200000001/A1','r5u1/5200000002/A2','r5u2/5200000003/A3'],
  '(KB120, 재적재로 r5d1 행 사라짐 · 중복 계좌는 첫 행)'
);

-- 같은 서버 재적재 — 통째 교체 · users_rev 가 낮아져도 그대로 저장
SELECT is(
  public.dma_admin_apply_snapshot('KB120', 1, '[
    {"userId":"r5u1","accounts":[{"accountNo":"5200000001","name":"A1","branchNo":"00002","traderId":"000002","priority":0}]}
  ]'::jsonb),
  1, '(apply KB120 rev 1 재적재, 1행)'
);
SELECT is(
  (SELECT array_agg(dma_user_id || '/' || account_no ORDER BY account_no)
     FROM public.dma_server_user_accounts WHERE server_key = 'KB120'),
  ARRAY['r5u1/5200000001'], '(KB120 재적재, 이전 행(A2 · r5u2) 사라짐)'
);
SELECT is(
  (SELECT users_rev FROM public.dma_server_snapshots WHERE server_key = 'KB120'),
  1::bigint, '(KB120 users_rev, 7 → 1 낮아져도 저장 — 비교하지 않음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_server_user_accounts WHERE server_key = 'KYOBO119'),
  1, '(KYOBO119, KB120 재적재에 행 불변)'
);

-- 빈 accountNo → 교체 전체 거부 · 기존 반영 상태 보존
SELECT throws_ok(
  $$SELECT public.dma_admin_apply_snapshot('KB120', 9, '[{"userId":"r5u1","accounts":[{"accountNo":"","name":"x"}]}]'::jsonb)$$,
  'P0001', NULL, '(apply KB120 빈 accountNo, 거부)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_apply_snapshot('KB120', 9, '[{"userId":"","accounts":[]}]'::jsonb)$$,
  'P0001', NULL, '(apply KB120 빈 userId, 거부)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_server_user_accounts WHERE server_key = 'KB120')
  || ':' || (SELECT users_rev FROM public.dma_server_snapshots WHERE server_key = 'KB120'),
  '1:1', '(KB120 거부 뒤, 기존 1행 · rev 1 보존)'
);

-- ── admin_users_raw() 모양 ───────────────────────────────────────────
INSERT INTO t_raw VALUES ('shape', public.admin_users_raw());
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT r FROM t_raw WHERE label = 'shape')) AS k),
  ARRAY['appUsers','intent','pending','results','servers','snapshotAccounts','snapshots'],
  '(admin_users_raw, 7키 정확히)'
);
SELECT is(
  (SELECT jsonb_agg(e ->> 'email') FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'shape') -> 'pending') e),
  '["r5-wait@example.invalid"]'::jsonb, '(raw.pending, 가입 · 미허용 이메일만 · 소문자)'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT r FROM t_raw WHERE label = 'shape') -> 'pending' -> 0) AS k),
  ARRAY['email','signedUpAt'], '(raw.pending 행, 키 email · signedUpAt)'
);
SELECT is(
  (SELECT e FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'shape') -> 'appUsers') e
    WHERE e ->> 'email' = 'r5-pre@example.invalid'),
  '{"email":"r5-pre@example.invalid","role":"viewer","dmaUserId":null,"signedUp":false}'::jsonb,
  '(raw.appUsers r5-pre, 사전 등록 signedUp false · dmaUserId null)'
);
SELECT is(
  (SELECT e FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'shape') -> 'appUsers') e
    WHERE e ->> 'email' = 'r5-a@example.invalid'),
  '{"email":"r5-a@example.invalid","role":"trader","dmaUserId":"r5d1","signedUp":true}'::jsonb,
  '(raw.appUsers r5-a, 가입 signedUp true · dmaUserId r5d1)'
);
SELECT is(
  (SELECT r -> 'servers' FROM t_raw WHERE label = 'shape'),
  '[{"key":"KB120","broker":"KB","enabled":true},{"key":"KB121","broker":"KB","enabled":false},
    {"key":"KYOBO119","broker":"KYOBO","enabled":true},{"key":"KYOBO127","broker":"KYOBO","enabled":false}]'::jsonb,
  '(raw.servers, 레지스트리 sort_order 순 · key · broker · enabled)'
);

-- ── 최근 결과: upsert(같은 키 두 번 → 1행 최신) · 같은 호출 안 중복은 뒤가 이김 · 모르는 서버/유저 버림 ──
SELECT is(
  public.dma_admin_record_results('r5d1', '[{"server":"KB120","outcome":"failed","code":9,"message":"다른 요청 처리 중입니다"}]'::jsonb),
  1, '(record r5d1 KB120 failed 9, 1행)'
);
SELECT is(
  public.dma_admin_record_results('r5d1', '[{"server":"KB120","outcome":"ok","code":0}]'::jsonb),
  1, '(record r5d1 KB120 ok 0 — 같은 키 두 번째, 1행)'
);
SELECT is(
  (SELECT count(*)::int || ':' || min(outcome) || ':' || min(code) || ':' || coalesce(min(message), '<null>')
     FROM public.dma_admin_results WHERE dma_user_id = 'r5d1' AND server_key = 'KB120'),
  '1:ok:0:<null>', '(dma_admin_results r5d1 KB120, 1행 · 최신 ok · message 없음)'
);
SELECT is(
  public.dma_admin_record_results('r5d1', '[
    {"server":"KB121","outcome":"timeout"},
    {"server":"KB121","outcome":"offline"},
    {"server":"KB999","outcome":"ok","code":0}]'::jsonb),
  1, '(record r5d1 KB121 두 번 · 모르는 서버 KB999, 1행 — KB999 버림)'
);
SELECT is(
  (SELECT outcome || ':' || coalesce(code::text, '<null>') FROM public.dma_admin_results WHERE dma_user_id = 'r5d1' AND server_key = 'KB121'),
  'offline:<null>', '(dma_admin_results r5d1 KB121, 같은 호출 안 뒤 결과 offline · code 없음)'
);
SELECT is(
  public.dma_admin_record_results('r5ghost', '[{"server":"KB120","outcome":"ok","code":0}]'::jsonb),
  0, '(record dma_users 에 없는 r5ghost, 0행 — 버림)'
);
INSERT INTO t_raw VALUES ('results', public.admin_users_raw());
SELECT is(
  (SELECT jsonb_agg(e - 'at') FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'results') -> 'results') e),
  '[{"dmaUserId":"r5d1","serverKey":"KB120","outcome":"ok","code":0,"message":null},
    {"dmaUserId":"r5d1","serverKey":"KB121","outcome":"offline","code":null,"message":null}]'::jsonb,
  '(raw.results, 표 반영 · AdminResultRow 키)'
);
SELECT is(
  (SELECT jsonb_typeof(r -> 'results' -> 0 -> 'at') FROM t_raw WHERE label = 'results'),
  'string', '(raw.results[0].at, 시각 문자열)'
);

-- ── admin_servers_raw(): 키 · servers 전 열 · userCounts = 87 의 서로 다른 DMA id 수 ─────
SELECT is(
  public.dma_admin_apply_snapshot('KB121', 3, '[
    {"userId":"r5d1","accounts":[
      {"accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1},
      {"accountNo":"5100000005","name":"다섯","branchNo":"00001","traderId":"000001","priority":5}]},
    {"userId":"r5ghost","accounts":[{"accountNo":"5300000001","name":"유령","branchNo":"00009","traderId":"000009","priority":0}]}
  ]'::jsonb),
  3, '(apply KB121 rev 3 · 유저 2 · 계좌 3, 3행)'
);
INSERT INTO t_raw VALUES ('servers', public.admin_servers_raw());
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((SELECT r FROM t_raw WHERE label = 'servers')) AS k),
  ARRAY['servers','snapshots','userCounts'], '(admin_servers_raw, 3키 정확히)'
);
SELECT is(
  (SELECT r -> 'servers' -> 0 FROM t_raw WHERE label = 'servers') - 'host',
  '{"key":"KB120","broker":"KB","port":9100,"enabled":true,"isOrderServer":true,"isQuotePrimary":true,"sortOrder":10}'::jsonb,
  '(admin_servers_raw.servers[0], KB120 camelCase 전 열(host 제외 비교))'
);
SELECT is(
  (SELECT jsonb_typeof(r -> 'servers' -> 0 -> 'host') FROM t_raw WHERE label = 'servers'),
  'string', '(admin_servers_raw.servers[0].host, 문자열)'
);
SELECT is(
  (SELECT r -> 'userCounts' FROM t_raw WHERE label = 'servers'),
  '[{"serverKey":"KB120","users":1},{"serverKey":"KB121","users":2},{"serverKey":"KYOBO119","users":1}]'::jsonb,
  '(admin_servers_raw.userCounts, 87 받은 서버만 · 서로 다른 DMA id 수)'
);
SELECT is(
  (SELECT jsonb_agg(e ->> 'serverKey' || '@' || (e ->> 'usersRev')) FROM jsonb_array_elements((SELECT r FROM t_raw WHERE label = 'servers') -> 'snapshots') e),
  '["KB120@1","KB121@3","KYOBO119@5"]'::jsonb, '(admin_servers_raw.snapshots, serverKey · usersRev 문자열)'
);

-- ── 입양: dma_users 에 있는 DMA id 만 · 이미 있는 행 불변 · CHECK 못 맞추는 87 행 제외 · 멱등 ─────
-- KB121 87: r5d1 …0001(의도 계좌 · KB120 만 등록) · r5d1 …0005(의도에 없음) · r5ghost(dma_users 에 없음)
-- KB120 87 을 CHECK 를 못 맞추는 행(branch 빈 값)으로 다시 적재
SELECT is(
  public.dma_admin_apply_snapshot('KB120', 4, '[
    {"userId":"r5d1","accounts":[
      {"accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1},
      {"accountNo":"5100000007","name":"깨진값","branchNo":"","traderId":"","priority":7}]}
  ]'::jsonb),
  2, '(apply KB120 rev 4 · CHECK 못 맞추는 …0007 포함, 2행)'
);
SELECT is(
  public.dma_admin_adopt_server_accounts('KB121'),
  2, '(adopt KB121, r5d1 …0001@KB121 · …0005@KB121 = 2행)'
);
SELECT is(
  (SELECT array_agg(e ->> 'accountNo' || '@' || (e ->> 'serverKey') || ':' || (e ->> 'state'))
     FROM jsonb_array_elements(public.dma_admin_intent('r5d1')) e),
  ARRAY['5100000001@KB120:active','5100000001@KB121:active','5100000005@KB121:active'],
  '(intent r5d1 입양 뒤, …0001 KB120 · KB121 · …0005 KB121 active)'
);
SELECT is(
  (SELECT name || ':' || priority FROM public.dma_user_accounts WHERE dma_user_id = 'r5d1' AND account_no = '5100000005'),
  '다섯:5', '(입양 계좌 …0005, 87 값 그대로)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts WHERE dma_user_id = 'r5ghost')
  + (SELECT count(*)::int FROM public.dma_users WHERE dma_user_id = 'r5ghost'),
  0, '(adopt KB121 r5ghost — dma_users 에 없음, 들여오지 않음)'
);
SELECT is(public.dma_admin_adopt_server_accounts('KB121'), 0, '(adopt KB121 두 번째, 0행 멱등)');
SELECT is(
  public.dma_admin_adopt_server_accounts('KB120'),
  0, '(adopt KB120, …0001 이미 등록 · …0007 CHECK 불가 → 0행)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts WHERE dma_user_id = 'r5d1' AND account_no = '5100000007'),
  0, '(adopt KB120 …0007 branch 빈 KB 계좌, 들여오지 않음 — 서버에만 있음)'
);
UPDATE public.dma_account_servers SET state = 'removing'
 WHERE dma_user_id = 'r5d1' AND account_no = '5100000005' AND server_key = 'KB121';
SELECT is(public.dma_admin_adopt_server_accounts('KB121'), 0, '(adopt KB121 · …0005 removing 중, 0행)');
SELECT is(
  (SELECT state FROM public.dma_account_servers WHERE dma_user_id = 'r5d1' AND account_no = '5100000005' AND server_key = 'KB121'),
  'removing', '(adopt 뒤 …0005@KB121, removing 그대로 — 입양이 제거 의도를 되돌리지 않음)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_accounts('KB999')$$,
  'P0002', 'server not found', '(adopt 없는 서버 KB999, 거부)'
);

-- ── 잠금: 새 표 3개 × (RLS · 정책 0) + 3개 × anon · authenticated = 9 ──────────
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)
  AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) = 0,
  true, format('(%s, RLS 켜짐 · 정책 0개)', t)
) FROM unnest(ARRAY['dma_server_snapshots','dma_server_user_accounts','dma_admin_results']) AS t;
SELECT is(
  has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE'),
  false, format('(%s, %s 권한 없음)', r, t)
) FROM unnest(ARRAY['dma_server_snapshots','dma_server_user_accounts','dma_admin_results']) AS t
  CROSS JOIN unnest(ARRAY['anon','authenticated']) AS r;

-- ── 잠금: 새 RPC 5종 × (anon · authenticated · service_role) = 15 ─────────────
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  r = 'service_role', format('(%s, %s EXECUTE %s)', r, f, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY[
    'public.dma_admin_apply_snapshot(text, bigint, jsonb)',
    'public.dma_admin_record_results(text, jsonb)',
    'public.admin_users_raw()',
    'public.admin_servers_raw()',
    'public.dma_admin_adopt_server_accounts(text)'
  ]) AS f
  CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r;

SELECT * FROM finish();
ROLLBACK;
