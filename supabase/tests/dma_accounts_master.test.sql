-- ============================================================
-- quick 261106-lwu — 계좌 마스터 dma_accounts 계약 pgTAP (D-03 · D-05 · D-08 · 서버측 정합 규칙).
--
-- 잠그는 것:
--   - 백필(D-05): 픽스처 연결 행 4개(A 를 lw1 · lw2 가 값 · updated_at 다르게 보유 · B · 교보 C) → 마스터 3행 ·
--     A 는 updated_at 최신(lw2) 행 값 · 연결 행 값은 건드리지 않는다 · 마이그레이션 두 번 적용 뒤에도 3행 · FK 1개
--   - 불변식: 연결 행은 늘 마스터를 가진다(고아 0 · FK) · 트리거가 마스터 없는 연결 INSERT 에 마스터를 만든다 ·
--     마스터가 있으면 연결 INSERT 가 마스터 값을 바꾸지 않는다 · 연결 있는 마스터 직접 DELETE 는 23503
--   - RPC: admin_accounts_raw 모양(accounts[] 키 · users[].emails · servers[].state · 연결 0 계좌 users []) ·
--     create 정상 / ACCOUNT_EXISTS / KB 길이 23514 / 교보 지점 23514 · update 가 마스터 + 모든 연결 행을 같은 값으로 ·
--     links 에 active 서버만(removing-only 링크 servers []) · 없는 계좌 NO_SUCH_ACCOUNT · delete 연결 있으면
--     ACCOUNT_IN_USE · 연결 0 이면 삭제 · 없는 계좌 NO_SUCH_ACCOUNT
--   - 권한: RPC 4종 anon/authenticated EXECUTE 없음 · service_role 있음 · 표 anon/authenticated 권한 없음 · RLS on
--
-- 실행(픽스처 → 마스터 마이그레이션 2회 → 테스트):
--   bash scripts/verify-dma-orders-price-check.sh --until 20261106200000 \
--     --with supabase/tests/fixtures/261106_pre_accounts_master.sql \
--     --with supabase/migrations/20261106300000_dma_accounts_master.sql \
--     --with supabase/migrations/20261106300000_dma_accounts_master.sql \
--     --test supabase/tests/dma_accounts_master.test.sql
-- — 일회용 로컬 컨테이너에서만 돈다(공유 · 원격 DB 접촉 0). 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 픽스처 행은 supabase/tests/fixtures/261106_pre_accounts_master.sql 머리 표가 정본이다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(52);

-- ── 표 · RLS ────────────────────────────────────────────────────────
SELECT has_table('public', 'dma_accounts', '(dma_accounts, 표 있음)');
SELECT col_is_pk('public', 'dma_accounts', ARRAY['broker', 'account_no'], '(dma_accounts PK, (broker, account_no))');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_accounts'::regclass),
  true, '(dma_accounts, RLS on)'
);

-- ── 백필 (D-05) · 멱등 ──────────────────────────────────────────────
SELECT is((SELECT count(*)::int FROM public.dma_accounts), 3, '(백필 · 마이그레이션 2회 적용, 마스터 3행)');
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000001'),
  'A새/00002/000002', '(백필 A KB 8800000001, updated_at 최신 lw2 행 값)'
);
SELECT is(
  (SELECT updated_at FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000001'),
  '2026-11-03T00:00:00Z'::timestamptz, '(백필 A updated_at, 고른 행 updated_at)'
);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000002'),
  'B/00003/000003', '(백필 B KB 8800000002, 그 행 값)'
);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KYOBO' AND account_no = '8800000003'),
  'C//', '(백필 C KYOBO 8800000003, 지점 · 트레이더 빈 값)'
);
SELECT is(
  (SELECT name FROM public.dma_user_accounts WHERE dma_user_id = 'lw1' AND broker = 'KB' AND account_no = '8800000001'),
  'A옛', '(백필 뒤 연결 행 lw1·A, 값 그대로 — 건드리지 않음)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conname = 'fk_dma_user_accounts_master' AND conrelid = 'public.dma_user_accounts'::regclass),
  1, '(fk_dma_user_accounts_master, 2회 적용 뒤에도 1개)'
);
SELECT has_trigger('public', 'dma_user_accounts', 'trg_dma_user_accounts_ensure_master',
  '(dma_user_accounts, 마스터 자동 등록 트리거 있음)');
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts l
    WHERE NOT EXISTS (SELECT 1 FROM public.dma_accounts m WHERE m.broker = l.broker AND m.account_no = l.account_no)),
  0, '(백필 뒤 마스터 없는 연결 행, 0)'
);

-- ── 트리거 · FK ─────────────────────────────────────────────────────
INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority) VALUES
  ('lw3', 'KB', '8800000009', '신규', '00009', '000009', 3);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000009'),
  '신규/00009/000009', '(트리거 · 마스터 없는 연결 INSERT, 마스터가 그 값으로 생김)'
);
INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority) VALUES
  ('lw3', 'KB', '8800000002', 'B다름', '00008', '000008', 4);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000002'),
  'B/00003/000003', '(트리거 · 마스터 있는 계좌 연결 INSERT, 마스터 값 그대로)'
);
SELECT throws_ok(
  $$DELETE FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000001'$$,
  '23503', NULL, '(연결 있는 마스터 A 직접 DELETE, 23503 FK)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id)
    VALUES ('lw3', 'KB', '8800000011', 'x', '123', '000001')$$,
  '23514', NULL, '(트리거 · KB 지점 3자 연결 INSERT, 23514 — 마스터 CHECK)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_accounts WHERE account_no = '8800000011'),
  0, '(KB 길이 위반 연결 INSERT 뒤 마스터, 생기지 않음)'
);

-- ── RPC (b) 등록 ────────────────────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_create_account(
      '{"broker":"KB","accountNo":"8800000010","name":"새계좌","branchNo":"00010","traderId":"000010"}'::jsonb)$$,
  '(create KB 8800000010, 정상)'
);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000010'),
  '새계좌/00010/000010', '(create 뒤 마스터 KB 8800000010, 넘긴 값)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_account(
      '{"broker":"KB","accountNo":"8800000010","name":"중복","branchNo":"00010","traderId":"000010"}'::jsonb)$$,
  'P0001', 'ACCOUNT_EXISTS', '(create 같은 KB 8800000010, ACCOUNT_EXISTS)'
);
SELECT is(
  (SELECT name FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000010'),
  '새계좌', '(중복 create 뒤 기존 값, 그대로)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_account(
      '{"broker":"KB","accountNo":"8800000012","name":"","branchNo":"0001","traderId":"000001"}'::jsonb)$$,
  '23514', NULL, '(create KB 지점 4자, 23514)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_account(
      '{"broker":"KYOBO","accountNo":"8800000013","name":"","branchNo":"00001","traderId":""}'::jsonb)$$,
  '23514', NULL, '(create 교보 지점 값 있음, 23514)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_account('{"broker":"KYOBO","accountNo":"8800000003"}'::jsonb)$$,
  'P0001', 'ACCOUNT_EXISTS', '(create 백필된 교보 C, ACCOUNT_EXISTS — 다른 증권사 같은 번호와 구분은 PK)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_create_account('{"broker":"KYOBO","accountNo":"8800000001"}'::jsonb)$$,
  '(create 교보 8800000001 — KB A 와 번호가 같아도 증권사가 달라 정상)'
);

-- ── RPC (a) 목록 모양 ────────────────────────────────────────────────
SELECT is(
  (SELECT array_agg((e ->> 'broker') || ' ' || (e ->> 'accountNo') ORDER BY ord)
     FROM jsonb_array_elements(public.admin_accounts_raw() -> 'accounts') WITH ORDINALITY AS t(e, ord)),
  ARRAY['KB 8800000001', 'KB 8800000002', 'KB 8800000009', 'KB 8800000010', 'KYOBO 8800000001', 'KYOBO 8800000003'],
  '(admin_accounts_raw accounts, broker · accountNo 순 6행)'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.admin_accounts_raw() -> 'accounts' -> 0) k),
  ARRAY['accountNo', 'branchNo', 'broker', 'name', 'traderId', 'updatedAt', 'users'],
  '(admin_accounts_raw 계좌 키, shared AdminAccountMaster 7키)'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.admin_accounts_raw() -> 'accounts' -> 0 -> 'users' -> 0) k),
  ARRAY['dmaUserId', 'emails', 'priority', 'servers'],
  '(admin_accounts_raw 사용자 키, shared AdminAccountMasterUser 4키)'
);
SELECT is(
  (SELECT array_agg(u ->> 'dmaUserId' ORDER BY ord)
     FROM jsonb_array_elements(public.admin_accounts_raw() -> 'accounts' -> 0 -> 'users') WITH ORDINALITY AS t(u, ord)),
  ARRAY['lw1', 'lw2'], '(A 쓰는 사용자, lw1 · lw2 dmaUserId 순)'
);
SELECT is(
  public.admin_accounts_raw() -> 'accounts' -> 0 -> 'users' -> 0 -> 'emails',
  '["lwu-a@example.invalid", "lwu-b@example.invalid"]'::jsonb, '(A lw1 emails, 공유 이메일 2개 오름차순)'
);
SELECT is(
  public.admin_accounts_raw() -> 'accounts' -> 0 -> 'users' -> 0 -> 'servers',
  '[{"serverKey":"KB120","state":"active"},{"serverKey":"KB121","state":"removing"}]'::jsonb,
  '(A lw1 servers, sort_order 순 · state 포함)'
);
SELECT is(
  (public.admin_accounts_raw() -> 'accounts' -> 0 -> 'users' -> 1 ->> 'priority')::int,
  5, '(A lw2 priority, 연결 행 priority)'
);
SELECT is(
  public.admin_accounts_raw() -> 'accounts' -> 2 -> 'users' -> 0 -> 'emails',
  '[]'::jsonb, '(KB 8800000009 lw3 emails, app_users 없음 → [])'
);
SELECT is(
  public.admin_accounts_raw() -> 'accounts' -> 3 -> 'users',
  '[]'::jsonb, '(KB 8800000010 연결 0, users [])'
);
SELECT is(
  public.admin_accounts_raw() -> 'accounts' -> 2 -> 'users' -> 0 -> 'servers',
  '[]'::jsonb, '(KB 8800000009 lw3 등록 서버 없음, servers [])'
);

-- ── RPC (c) 저장 — 마스터 + 모든 연결 행 · links ─────────────────────────
SELECT is(
  public.dma_admin_update_account('KB', '8800000001', 'A정본', '00007', '000007'),
  '{"links":[{"dmaUserId":"lw1","priority":1,"servers":["KB120"]},{"dmaUserId":"lw2","priority":5,"servers":[]}]}'::jsonb,
  '(update A, links = lw1 active KB120 · lw2 removing-only servers [])'
);
SELECT is(
  (SELECT name || '/' || branch_no || '/' || trader_id FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000001'),
  'A정본/00007/000007', '(update 뒤 마스터 A, 저장한 값)'
);
SELECT is(
  (SELECT array_agg(dma_user_id || ':' || name || '/' || branch_no || '/' || trader_id ORDER BY dma_user_id)
     FROM public.dma_user_accounts WHERE broker = 'KB' AND account_no = '8800000001'),
  ARRAY['lw1:A정본/00007/000007', 'lw2:A정본/00007/000007'], '(update 뒤 A 연결 행 2개, 마스터와 같은 값으로 왕복)'
);
SELECT isnt(
  (SELECT updated_at FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000001'),
  '2026-11-03T00:00:00Z'::timestamptz, '(update 뒤 마스터 A updated_at, 갱신됨)'
);
SELECT is(
  (SELECT name FROM public.dma_user_accounts WHERE dma_user_id = 'lw1' AND account_no = '8800000002'),
  'B', '(A update 뒤 다른 계좌 B 연결 행, 그대로)'
);
SELECT is(
  public.dma_admin_update_account('KB', '8800000010', '새이름', '00010', '000010'),
  '{"links":[]}'::jsonb, '(update 연결 0 계좌, links [])'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_update_account('KB', '8899999999', 'x', '00001', '000001')$$,
  'P0001', 'NO_SUCH_ACCOUNT', '(update 없는 계좌, NO_SUCH_ACCOUNT)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_update_account('KB', '8800000002', 'x', '1', '000001')$$,
  '23514', NULL, '(update KB 지점 1자, 23514)'
);

-- ── RPC (d) 삭제 ────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_delete_account('KB', '8800000001')$$,
  'P0001', 'ACCOUNT_IN_USE', '(delete 연결 있는 A, ACCOUNT_IN_USE)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_delete_account('KB', '8800000010')$$,
  '(delete 연결 0 KB 8800000010, 정상)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '8800000010'),
  0, '(delete 뒤 KB 8800000010, 없음)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_delete_account('KB', '8800000010')$$,
  'P0001', 'NO_SUCH_ACCOUNT', '(delete 없는 계좌, NO_SUCH_ACCOUNT)'
);

-- ── 권한 ────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int
     FROM unnest(ARRAY[
       'public.admin_accounts_raw()',
       'public.dma_admin_create_account(jsonb)',
       'public.dma_admin_update_account(text, text, text, text, text)',
       'public.dma_admin_delete_account(text, text)'
     ]) AS f(sig),
     unnest(ARRAY['anon', 'authenticated']) AS r(role)
    WHERE has_function_privilege(r.role, f.sig, 'EXECUTE')),
  0, '(RPC 4종 × anon · authenticated, EXECUTE 없음)'
);
SELECT is(
  (SELECT count(*)::int
     FROM unnest(ARRAY[
       'public.admin_accounts_raw()',
       'public.dma_admin_create_account(jsonb)',
       'public.dma_admin_update_account(text, text, text, text, text)',
       'public.dma_admin_delete_account(text, text)'
     ]) AS f(sig)
    WHERE has_function_privilege('service_role', f.sig, 'EXECUTE')),
  4, '(RPC 4종 × service_role, EXECUTE 있음)'
);
SELECT is(
  (SELECT count(*)::int
     FROM unnest(ARRAY['anon', 'authenticated']) AS r(role),
          unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p(priv)
    WHERE has_table_privilege(r.role, 'public.dma_accounts', p.priv)),
  0, '(dma_accounts × anon · authenticated, 표 권한 없음)'
);
SELECT ok(
  has_table_privilege('service_role', 'public.dma_accounts', 'SELECT'),
  '(dma_accounts × service_role, SELECT 있음)'
);
SELECT is(
  (SELECT count(*)::int FROM unnest(ARRAY['anon', 'authenticated']) AS r(role)
    WHERE has_function_privilege(r.role, 'public.dma_user_accounts_ensure_master()', 'EXECUTE')),
  0, '(트리거 함수 × anon · authenticated, EXECUTE 없음)'
);

SELECT * FROM finish();
ROLLBACK;
