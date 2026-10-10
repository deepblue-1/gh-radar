-- ============================================================
-- Phase 29 Plan 05 — DMA 의도 변경 RPC pgTAP (D-05 · D-15 · D-16 · D-23 ⑤).
--
-- 잠그는 것:
--   - 생성(dma_admin_create_dma_user): 허용 유저 연결 + DMA 유저 + 첫 계좌 + 등록 서버(active) 한 트랜잭션 ·
--     이메일 대소문자 · 공백 무관 · 중복 서버 키 1행 · 오류 규약 NO_APP_USER · DMA_USER_EXISTS · NO_SERVERS ·
--     SERVER_BROKER_MISMATCH(거부 시 부분 생성 없음)
--   - 의도 조회(dma_admin_intent): shared AdminIntentRow 키 10개 정확히(29-29 isOrder 추가) · priority → accountNo → serverKey 순
--   - 계좌 put: 서버 빼기 → removing(행 유지) · 다시 넣기 → active · 값 갱신 · NO_SERVERS · NO_DMA_USER · 증권사 불일치
--   - 계좌 제거: 마지막 active 계좌 LAST_ACCOUNT · 두 계좌 중 하나 → 그 계좌 서버 행 전부 removing · NO_SUCH_ACCOUNT
--   - settle: 계좌 단위 removing 행만 삭제(active 불변) → 서버 0 된 계좌 삭제 · user_removed → 그 서버 행 전부 · 없는 유저 0
--   - 유저 삭제: 서버 행 남으면 SERVERS_REMAIN · settle 뒤 삭제 → app_users.dma_user_id NULL · 최근 결과 cascade
--   - 비밀번호: 암호문 교체 · password_set_at 갱신 · NO_DMA_USER
--   - 권한: 새 RPC 전부 anon/authenticated EXECUTE 없음 · 공개 RPC 는 service_role 있음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_intent.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 픽스처:
--   p5-a@example.invalid    가입 + 허용(trader) → DMA p5d1 생성(KB 계좌 …0001 · KB120 · KB121)
--   p5-pre@example.invalid  사전 등록(가입 전 · viewer)
--   p5-ky@example.invalid   가입 + 허용(trader) — 교보 계좌 거부 경로
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(69);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002951', 'p5-a@example.invalid'),
  ('00000000-0000-4000-8000-000000002953', 'p5-ky@example.invalid');
INSERT INTO public.app_users (email, role) VALUES
  ('p5-a@example.invalid',   'trader'),
  ('p5-pre@example.invalid', 'viewer'),
  ('p5-ky@example.invalid',  'trader');

-- ── 생성 ─────────────────────────────────────────────────────────
SELECT is(
  public.dma_admin_create_dma_user(
    '  P5-A@Example.invalid ', 'p5d1', 'enc-p5d1',
    '{"broker":"KB","accountNo":"5000000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
    ARRAY['KB121','KB120','KB120', NULL, '']
  ),
  '{"dmaUserId":"p5d1"}'::jsonb,
  '(create p5d1 · 대문자 · 공백 이메일, 반환 { dmaUserId })'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'p5-a@example.invalid'),
  'p5d1', '(app_users p5-a, dma_user_id 연결 = p5d1)'
);
SELECT is(
  (SELECT password_enc FROM public.dma_users WHERE dma_user_id = 'p5d1'),
  'enc-p5d1', '(dma_users p5d1, 암호문 그대로 저장)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'p5d1'),
  ARRAY['KB120:active','KB121:active'], '(p5d1 계좌 …0001, 등록 서버 KB120 · KB121 active — 중복 · NULL · 빈 키 제거)'
);

-- ── 의도 조회 ─────────────────────────────────────────────────────
SELECT is(
  jsonb_array_length(public.dma_admin_intent('p5d1')),
  2, '(intent p5d1, 계좌 1 × 서버 2 = 2행)'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.dma_admin_intent('p5d1') -> 0) AS k),
  ARRAY['accountNo','branchNo','broker','dmaUserId','isOrder','name','priority','serverKey','state','traderId'],
  '(intent 행, 키 = AdminIntentRow 10개 정확히 — isOrder 포함)'
);
SELECT is(
  public.dma_admin_intent('p5d1') -> 0,
  '{"dmaUserId":"p5d1","broker":"KB","accountNo":"5000000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1,"serverKey":"KB120","state":"active","isOrder":false}'::jsonb,
  '(intent 첫 행, KB120 · 값 그대로 · priority 숫자 · 지정 없음 isOrder false)'
);
SELECT is(
  public.dma_admin_intent('nobody'),
  '[]'::jsonb, '(intent 없는 DMA id, 빈 배열)'
);

-- ── 오류 규약 ─────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('p5-pre@example.invalid', 'p5d1', 'enc-x',
      '{"broker":"KB","accountNo":"5000000009","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'DMA_USER_EXISTS', '(create p5d1 재생성, DMA_USER_EXISTS)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('nobody@example.invalid', 'p5d9', 'enc-x',
      '{"broker":"KB","accountNo":"5000000009","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'NO_APP_USER', '(create 허용 표에 없는 이메일, NO_APP_USER)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('p5-ky@example.invalid', 'p5k1', 'enc-x',
      '{"broker":"KYOBO","accountNo":"7000000001","name":"교보","branchNo":"","traderId":"","priority":0}'::jsonb,
      ARRAY['KYOBO119','KB120'])$$,
  'P0001', 'SERVER_BROKER_MISMATCH', '(create 교보 계좌 · KB120 등록, SERVER_BROKER_MISMATCH)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_users WHERE dma_user_id = 'p5k1')
  + (SELECT count(*)::int FROM public.dma_user_accounts WHERE dma_user_id = 'p5k1'),
  0, '(p5k1 거부 뒤, DMA 유저 · 계좌 부분 생성 없음)'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'p5-ky@example.invalid'),
  NULL, '(p5-ky 거부 뒤, app_users 연결 없음)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('p5-ky@example.invalid', 'p5k1', 'enc-x',
      '{"broker":"KYOBO","accountNo":"7000000001","name":"교보","branchNo":"","traderId":"","priority":0}'::jsonb,
      ARRAY[]::text[])$$,
  'P0001', 'NO_SERVERS', '(create 빈 서버 목록, NO_SERVERS)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('p5-ky@example.invalid', 'p5k1', 'enc-x',
      '{"broker":"KYOBO","accountNo":"7000000001","name":"교보","branchNo":"","traderId":"","priority":0}'::jsonb,
      NULL)$$,
  'P0001', 'NO_SERVERS', '(create 서버 NULL, NO_SERVERS)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_create_dma_user('p5-ky@example.invalid', 'p5k1', 'enc-k1',
      '{"broker":"KYOBO","accountNo":"7000000001","name":"교보","branchNo":"","traderId":"","priority":0}'::jsonb,
      ARRAY['KYOBO119'])$$,
  '(create 교보 계좌 · KYOBO119, 성공 — branch/trader 빈 값)'
);
SELECT is(
  (SELECT branch_no || '|' || trader_id FROM public.dma_user_accounts WHERE dma_user_id = 'p5k1'),
  '|', '(p5k1 교보 계좌, branch/trader 빈 문자열 그대로)'
);

-- ── 계좌 put: 서버 빼기 → removing · 다시 넣기 → active ──────────────────────
SELECT is(
  public.dma_admin_put_account('p5d1',
    '{"broker":"KB","accountNo":"5000000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
    ARRAY['KB120']),
  '{"activated":["KB120"],"removing":["KB121"]}'::jsonb,
  '(put p5d1 …0001 서버 KB120 만, KB121 → removing)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'p5d1'),
  ARRAY['KB120:active','KB121:removing'], '(p5d1 …0001, KB120 active · KB121 removing — 행은 남는다)'
);
SELECT is(
  public.dma_admin_put_account('p5d1',
    '{"broker":"KB","accountNo":"5000000001","name":"위탁-새이름","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
    ARRAY['KB120','KB121']),
  '{"activated":["KB120","KB121"],"removing":[]}'::jsonb,
  '(put p5d1 …0001 KB121 다시 넣기, removing 없음)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'p5d1')::text
  || (SELECT name FROM public.dma_user_accounts WHERE dma_user_id = 'p5d1' AND account_no = '5000000001'),
  '{KB120:active,KB121:active}위탁-새이름', '(p5d1 …0001, KB121 removing → active · 이름 갱신)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_put_account('p5d1',
      '{"broker":"KB","accountNo":"5000000001","name":"","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY[]::text[])$$,
  'P0001', 'NO_SERVERS', '(put 빈 서버 목록, NO_SERVERS)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_put_account('nobody',
      '{"broker":"KB","accountNo":"5000000001","name":"","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'NO_DMA_USER', '(put 없는 DMA id, NO_DMA_USER)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_put_account('p5d1',
      '{"broker":"KYOBO","accountNo":"7000000009","name":"","branchNo":"","traderId":"","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'SERVER_BROKER_MISMATCH', '(put 교보 계좌 · KB120, SERVER_BROKER_MISMATCH)'
);

-- ── 계좌 제거: 마지막 계좌 거부 · 두 계좌 중 하나 → removing ─────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_mark_account_removed('p5d1', 'KB', '5000000001')$$,
  'P0001', 'LAST_ACCOUNT', '(mark p5d1 유일 계좌 …0001, LAST_ACCOUNT)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_put_account('p5d1',
      '{"broker":"KB","accountNo":"5000000002","name":"둘째","branchNo":"00001","traderId":"000001","priority":2}'::jsonb,
      ARRAY['KB120'])$$,
  '(put p5d1 둘째 계좌 …0002 · KB120, 추가)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_mark_account_removed('p5d1', 'KB', '5000000001')$$,
  '(mark p5d1 …0001 — 다른 active 계좌 있음, 성공)'
);
SELECT is(
  (SELECT array_agg(e ->> 'accountNo' || '@' || (e ->> 'serverKey') || ':' || (e ->> 'state'))
     FROM jsonb_array_elements(public.dma_admin_intent('p5d1')) e),
  ARRAY['5000000001@KB120:removing','5000000001@KB121:removing','5000000002@KB120:active'],
  '(intent p5d1, …0001 서버 전부 removing · …0002 active — priority 순)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_mark_account_removed('p5d1', 'KB', '5000000002')$$,
  'P0001', 'LAST_ACCOUNT', '(mark p5d1 …0002 — 남은 active 마지막, LAST_ACCOUNT)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_mark_account_removed('p5d1', 'KB', '5000000099')$$,
  'P0001', 'NO_SUCH_ACCOUNT', '(mark p5d1 없는 계좌, NO_SUCH_ACCOUNT)'
);

-- ── settle: 계좌 단위 → 행 · 계좌 삭제, active 는 건드리지 않음 ────────────────────
SELECT is(
  public.dma_admin_settle_server('p5d1', 'KB120', ARRAY['5000000001'], false),
  '{"deletedRows":1,"deletedAccounts":0}'::jsonb, '(settle p5d1 KB120 …0001, 행 1 · 계좌는 KB121 행이 남아 유지)'
);
SELECT is(
  public.dma_admin_settle_server('p5d1', 'KB121', ARRAY['5000000001'], false),
  '{"deletedRows":1,"deletedAccounts":1}'::jsonb, '(settle p5d1 KB121 …0001, 행 1 · 서버 0 된 계좌 삭제)'
);
SELECT is(
  public.dma_admin_settle_server('p5d1', 'KB120', ARRAY['5000000002'], false),
  '{"deletedRows":0,"deletedAccounts":0}'::jsonb, '(settle p5d1 KB120 …0002 active, 지우지 않음)'
);
SELECT is(
  public.dma_admin_settle_server('nobody', 'KB120', ARRAY['5000000002'], false),
  '{"deletedRows":0,"deletedAccounts":0}'::jsonb, '(settle 없는 DMA id, 0 · 0 멱등)'
);

-- ── 유저 삭제: 서버 남음 거부 → settle(user_removed) → 삭제 · 웹 사용자 연결 NULL ───────
SELECT lives_ok(
  $$SELECT public.dma_admin_record_results('p5d1', '[{"server":"KB120","outcome":"failed","code":9,"message":"처리 중"}]'::jsonb)$$,
  '(record p5d1 KB120 failed, 삭제 cascade 확인용)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_delete_dma_user('p5d1')$$,
  'P0001', 'SERVERS_REMAIN', '(delete p5d1 — KB120 행 남음, SERVERS_REMAIN)'
);
SELECT is(
  public.dma_admin_settle_server('p5d1', 'KB120', NULL, true),
  '{"deletedRows":1,"deletedAccounts":1}'::jsonb, '(settle p5d1 KB120 user_removed, 그 서버 행 전부 · 계좌 삭제)'
);
SELECT lives_ok($$SELECT public.dma_admin_delete_dma_user('p5d1')$$, '(delete p5d1 — 서버 행 0, 성공)');
SELECT is(
  (SELECT coalesce(dma_user_id, '<null>') || ':' || role FROM public.app_users WHERE email = 'p5-a@example.invalid'),
  '<null>:trader', '(app_users p5-a, dma_user_id NULL · 역할 trader 유지)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_users WHERE dma_user_id = 'p5d1')
  + (SELECT count(*)::int FROM public.dma_admin_results WHERE dma_user_id = 'p5d1'),
  0, '(p5d1 삭제 뒤, dma_users · 최근 결과 cascade 0행)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_delete_dma_user('p5d1')$$,
  'P0001', 'NO_DMA_USER', '(delete 없는 DMA id, NO_DMA_USER)'
);

-- ── 비밀번호 ─────────────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_set_password('nobody', 'enc-x')$$,
  'P0001', 'NO_DMA_USER', '(set_password 없는 DMA id, NO_DMA_USER)'
);
UPDATE public.dma_users SET password_set_at = '2026-01-01 00:00:00+00' WHERE dma_user_id = 'p5k1';
SELECT lives_ok($$SELECT public.dma_admin_set_password('p5k1', 'enc-k1-v2')$$, '(set_password p5k1, 성공)');
SELECT is(
  (SELECT password_enc || ':' || (password_set_at > '2026-01-01 00:00:00+00')::text FROM public.dma_users WHERE dma_user_id = 'p5k1'),
  'enc-k1-v2:true', '(p5k1, 암호문 교체 · password_set_at 갱신)'
);

-- ── 권한: 공개 RPC 7종 × 3역할 = 21 · 내부 헬퍼 2종 × 2역할 = 4 ───────────
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  r = 'service_role', format('(%s, %s EXECUTE %s)', r, f, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY[
    'public.dma_admin_create_dma_user(text, text, text, jsonb, text[])',
    'public.dma_admin_set_password(text, text)',
    'public.dma_admin_put_account(text, jsonb, text[])',
    'public.dma_admin_mark_account_removed(text, text, text)',
    'public.dma_admin_settle_server(text, text, text[], boolean)',
    'public.dma_admin_delete_dma_user(text)',
    'public.dma_admin_intent(text)'
  ]) AS f
  CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r;
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  false, format('(%s, 내부 헬퍼 %s EXECUTE 없음)', r, f)
) FROM unnest(ARRAY[
    'public.dma_admin__server_list(text[])',
    'public.dma_admin__activate_servers(text, text, text, text[])'
  ]) AS f
  CROSS JOIN unnest(ARRAY['anon','authenticated']) AS r;

SELECT * FROM finish();
ROLLBACK;
