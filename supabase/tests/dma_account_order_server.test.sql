-- ============================================================
-- Phase 29 Plan 29 — G-1 계좌별 주문 서버 DB 계약 pgTAP (안 A: dma_account_servers.is_order).
--
-- 잠그는 것:
--   - 보존: 마이그레이션 재생 직후 · 기존 등록 행은 전부 지정 없음(is_order false · 조회 RPC 0행) — 백필 없음
--   - 지정: dma_admin_set_account_order_server → { orderServer } · dma_account_order_servers() 1행 ·
--     dma_admin_intent 의 isOrder(지정 행만 true) · 같은 값 재지정 멱등 · 다른 서버로 옮기면 계좌당 1개 ·
--     NULL(또는 빈 키) → 증권사 기본값(조회 0행)
--   - 거부: 미등록 서버 · removing 서버 · 다른 증권사 서버 · 없는 서버 → ORDER_SERVER_NOT_REGISTERED ·
--     없는 계좌 NO_SUCH_ACCOUNT · 없는 유저 NO_DMA_USER — 거부는 기존 지정을 바꾸지 않는다
--   - 해제 복귀: put 에서 빠짐(→ removing) · 계좌 제거(→ removing) · settle 로 행 삭제 — 지정이 남지 않는다.
--     put 으로 그 서버를 되살려도 지정은 되살아나지 않는다(기본값 유지)
--   - 꺼진 서버: 지정은 받는다(유효 주문 서버 판정 = relay — 꺼지면 기본값, 지정은 지우지 않는다)
--   - 안 A 제약: removing 행 플래그 CHECK 23514 · 한 계좌 두 행 플래그 부분 유니크 23505
--   - 모양: admin_users_raw().intent[].isOrder · servers[] 키 = key · broker · enabled · isOrderServer
--   - 권한: 새 RPC 2종 anon/authenticated EXECUTE 없음 · service_role 있음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_account_order_server.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 픽스처(표에 직접 — 생성 RPC 규칙과 무관하게 지정 계약만 본다):
--   g1u1  KB …0001 (KB120 · KB121) · KB …0002 (KB120) · KB …0003 (KB120 · KB121) · KYOBO 7900000001 (KYOBO119)
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(48);

-- ── 열 · 보존 ───────────────────────────────────────────────────────
SELECT has_column('public', 'dma_account_servers', 'is_order', '(dma_account_servers, is_order 열)');
SELECT col_not_null('public', 'dma_account_servers', 'is_order', '(dma_account_servers.is_order, NOT NULL)');
SELECT col_default_is('public', 'dma_account_servers', 'is_order', 'false', '(dma_account_servers.is_order, 기본값 false)');
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(마이그레이션 재생 직후 dma_account_order_servers(), 0행 — 백필 없음)'
);

INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('g1u1', 'enc-g1u1');
INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority) VALUES
  ('g1u1', 'KB',    '6100000001', '첫째', '00001', '000001', 1),
  ('g1u1', 'KB',    '6100000002', '둘째', '00001', '000001', 2),
  ('g1u1', 'KB',    '6100000003', '셋째', '00001', '000001', 3),
  ('g1u1', 'KYOBO', '7900000001', '교보', '',      '',       4);
INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key) VALUES
  ('g1u1', 'KB',    '6100000001', 'KB120'),
  ('g1u1', 'KB',    '6100000001', 'KB121'),
  ('g1u1', 'KB',    '6100000002', 'KB120'),
  ('g1u1', 'KB',    '6100000003', 'KB120'),
  ('g1u1', 'KB',    '6100000003', 'KB121'),
  ('g1u1', 'KYOBO', '7900000001', 'KYOBO119');

SELECT is(
  (SELECT count(*)::int FROM public.dma_account_servers WHERE is_order)
  + (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(기존 등록 행 6개, 지정 없음 · 조회 0행 — 증권사 기본 주문 서버를 따른다)'
);

-- ── 지정 · 멱등 · 옮김 · 해제 ─────────────────────────────────────────
SELECT is(
  public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB121'),
  '{"orderServer":"KB121"}'::jsonb, '(set g1u1 KB …0001 → KB121, { orderServer: KB121 })'
);
SELECT is(
  (SELECT array_agg(dma_user_id || '/' || broker || '/' || account_no || '@' || server_key)
     FROM public.dma_account_order_servers()),
  ARRAY['g1u1/KB/6100000001@KB121'], '(dma_account_order_servers(), 지정 계좌 1행 = …0001@KB121)'
);
SELECT is(
  (SELECT array_agg(e ->> 'serverKey' || ':' || (e ->> 'isOrder') ORDER BY e ->> 'serverKey')
     FROM jsonb_array_elements(public.dma_admin_intent('g1u1')) e WHERE e ->> 'accountNo' = '6100000001'),
  ARRAY['KB120:false','KB121:true'], '(intent g1u1 …0001, KB121 isOrder true · KB120 false)'
);
SELECT is(
  (SELECT jsonb_typeof(public.dma_admin_intent('g1u1') -> 0 -> 'isOrder')),
  'boolean', '(intent 행 isOrder, boolean)'
);
SELECT is(
  public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB121'),
  '{"orderServer":"KB121"}'::jsonb, '(set …0001 → KB121 재지정, 같은 결과 — 멱등)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_servers WHERE dma_user_id = 'g1u1' AND is_order),
  1, '(…0001 재지정 뒤, 지정 행 1개)'
);
SELECT is(
  public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB120'),
  '{"orderServer":"KB120"}'::jsonb, '(set …0001 → KB120, 옮김)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || is_order::text ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'g1u1' AND account_no = '6100000001'),
  ARRAY['KB120:true','KB121:false'], '(…0001 옮긴 뒤, KB120 하나만 지정 — 계좌당 1개)'
);
SELECT is(
  public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', NULL),
  '{"orderServer":null}'::jsonb, '(set …0001 → NULL, { orderServer: null } = 증권사 기본값)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(…0001 NULL 뒤 dma_account_order_servers(), 0행)'
);
SELECT is(
  public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', '  '),
  '{"orderServer":null}'::jsonb, '(set …0001 → 빈 키, NULL 과 같다)'
);

-- ── 거부 ─────────────────────────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB121')$$,
  '(set …0001 → KB121, 거부 경로 전 기준 지정)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000002', 'KB121')$$,
  'P0001', 'ORDER_SERVER_NOT_REGISTERED', '(set …0002 → KB121 미등록, ORDER_SERVER_NOT_REGISTERED)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KYOBO119')$$,
  'P0001', 'ORDER_SERVER_NOT_REGISTERED', '(set KB …0001 → KYOBO119 다른 증권사, ORDER_SERVER_NOT_REGISTERED)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB999')$$,
  'P0001', 'ORDER_SERVER_NOT_REGISTERED', '(set …0001 → 없는 서버 KB999, ORDER_SERVER_NOT_REGISTERED)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000099', 'KB120')$$,
  'P0001', 'NO_SUCH_ACCOUNT', '(set 없는 계좌 …0099, NO_SUCH_ACCOUNT)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KYOBO', '6100000001', 'KYOBO119')$$,
  'P0001', 'NO_SUCH_ACCOUNT', '(set 증권사가 다른 같은 번호 계좌 KYOBO …0001, NO_SUCH_ACCOUNT)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('nobody', 'KB', '6100000001', 'KB120')$$,
  'P0001', 'NO_DMA_USER', '(set 없는 DMA id, NO_DMA_USER)'
);
SELECT is(
  (SELECT array_agg(dma_user_id || '/' || broker || '/' || account_no || '@' || server_key)
     FROM public.dma_account_order_servers()),
  ARRAY['g1u1/KB/6100000001@KB121'], '(거부 6건 뒤, 기존 지정 …0001@KB121 그대로)'
);

-- ── 해제 복귀: put 에서 빠짐 → removing ───────────────────────────────
SELECT is(
  public.dma_admin_put_account('g1u1',
    '{"broker":"KB","accountNo":"6100000001","name":"첫째","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
    ARRAY['KB120']),
  '{"activated":["KB120"],"removing":["KB121"]}'::jsonb,
  '(put …0001 서버 KB120 만, 지정 서버 KB121 → removing)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(put 으로 KB121 빠진 뒤 dma_account_order_servers(), 0행 — 기본값 복귀)'
);
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.dma_admin_intent('g1u1')) e WHERE (e ->> 'isOrder')::boolean),
  0, '(put 뒤 intent g1u1, isOrder 전부 false)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB121')$$,
  'P0001', 'ORDER_SERVER_NOT_REGISTERED', '(set …0001 → removing 서버 KB121, ORDER_SERVER_NOT_REGISTERED)'
);
SELECT is(
  public.dma_admin_put_account('g1u1',
    '{"broker":"KB","accountNo":"6100000001","name":"첫째","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
    ARRAY['KB120','KB121']),
  '{"activated":["KB120","KB121"],"removing":[]}'::jsonb,
  '(put …0001 KB121 되살림, removing 없음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(KB121 되살린 뒤, 지정은 되살아나지 않음 — 기본값 유지)'
);

-- ── 해제 복귀: 계좌 제거 → removing ─────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000002', 'KB120')$$,
  '(set …0002 → KB120, 지정)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_mark_account_removed('g1u1', 'KB', '6100000002')$$,
  '(mark …0002 — 다른 active 계좌 있음, 성공)'
);
SELECT is(
  (SELECT state || ':' || is_order::text FROM public.dma_account_servers
    WHERE dma_user_id = 'g1u1' AND account_no = '6100000002' AND server_key = 'KB120'),
  'removing:false', '(mark 뒤 …0002@KB120, removing · 지정 해제)'
);

-- ── 해제 복귀: settle 로 행 삭제 ──────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KB', '6100000001', 'KB121')$$,
  '(set …0001 → KB121(꺼진 서버), 지정은 받는다 — 유효 판정은 relay)'
);
SELECT is(
  public.dma_admin_settle_server('g1u1', 'KB121', NULL, true),
  '{"deletedRows":2,"deletedAccounts":0}'::jsonb, '(settle g1u1 KB121 user_removed, …0001 · …0003 의 KB121 행 삭제)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_order_servers()),
  0, '(settle 로 지정 행 삭제 뒤 dma_account_order_servers(), 0행)'
);

-- ── 안 A 제약 ─────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE public.dma_account_servers SET is_order = true
     WHERE dma_user_id = 'g1u1' AND account_no = '6100000002' AND server_key = 'KB120'$$,
  '23514', NULL, '(removing 행 …0002@KB120 에 직접 플래그, CHECK 23514)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_put_account('g1u1',
      '{"broker":"KB","accountNo":"6100000003","name":"셋째","branchNo":"00001","traderId":"000001","priority":3}'::jsonb,
      ARRAY['KB120','KB121'])$$,
  '(put …0003 KB120 · KB121 active, 유니크 경로 준비)'
);
SELECT throws_ok(
  $$UPDATE public.dma_account_servers SET is_order = true
     WHERE dma_user_id = 'g1u1' AND account_no = '6100000003'$$,
  '23505', NULL, '(한 계좌 …0003 두 행에 직접 플래그, 부분 유니크 23505)'
);

-- ── 모양: admin_users_raw ──────────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_set_account_order_server('g1u1', 'KYOBO', '7900000001', 'KYOBO119')$$,
  '(set 교보 7900000001 → KYOBO119, 지정)'
);
SELECT is(
  (SELECT array_agg(e ->> 'accountNo' || '@' || (e ->> 'serverKey') || ':' || (e ->> 'isOrder')
                    ORDER BY e ->> 'accountNo', e ->> 'serverKey')
     FROM jsonb_array_elements(public.admin_users_raw() -> 'intent') e WHERE e ->> 'dmaUserId' = 'g1u1'),
  ARRAY['6100000001@KB120:false','6100000002@KB120:false','6100000003@KB120:false','6100000003@KB121:false',
        '7900000001@KYOBO119:true'],
  '(admin_users_raw().intent g1u1, isOrder — 교보 KYOBO119 만 true)'
);
SELECT is(
  public.admin_users_raw() -> 'servers',
  '[{"key":"KB120","broker":"KB","enabled":true,"isOrderServer":true},
    {"key":"KB121","broker":"KB","enabled":false,"isOrderServer":false},
    {"key":"KYOBO119","broker":"KYOBO","enabled":true,"isOrderServer":true},
    {"key":"KYOBO127","broker":"KYOBO","enabled":false,"isOrderServer":false}]'::jsonb,
  '(admin_users_raw().servers, key · broker · enabled · isOrderServer — 증권사 기본 주문 서버)'
);

-- ── 권한: 새 RPC 2종 × 3역할 = 6 ──────────────────────────────────────
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  r = 'service_role', format('(%s, %s EXECUTE %s)', r, f, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY[
    'public.dma_admin_set_account_order_server(text, text, text, text)',
    'public.dma_account_order_servers()'
  ]) AS f
  CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r;

SELECT * FROM finish();
ROLLBACK;
