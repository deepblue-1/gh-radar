-- ============================================================
-- Phase 29 Plan 05 — DMA 의도 변경 RPC pgTAP (D-05 · D-15 · D-16 · D-23 ⑤).
--
-- 잠그는 것:
--   - 생성(dma_admin_create_dma_user): 허용 유저 연결 + DMA 유저 + 첫 계좌 + 등록 서버(active) 한 트랜잭션 ·
--     이메일 대소문자 · 공백 무관 · 중복 서버 키 1행 · 오류 규약 NO_APP_USER · DMA_USER_EXISTS · NO_SERVERS ·
--     SERVER_BROKER_MISMATCH(거부 시 부분 생성 없음)
--   - 의도 조회(dma_admin_intent): shared AdminIntentRow 키 9개 정확히 · priority → accountNo → serverKey 순
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

SELECT plan(27);

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
  ARRAY['accountNo','branchNo','broker','dmaUserId','name','priority','serverKey','state','traderId'],
  '(intent 행, 키 = AdminIntentRow 9개 정확히)'
);
SELECT is(
  public.dma_admin_intent('p5d1') -> 0,
  '{"dmaUserId":"p5d1","broker":"KB","accountNo":"5000000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1,"serverKey":"KB120","state":"active"}'::jsonb,
  '(intent 첫 행, KB120 · 값 그대로 · priority 숫자)'
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

-- ── 권한: 공개 RPC 2종 × 3역할 = 6 · 내부 헬퍼 2종 × 2역할 = 4 ───────────
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  r = 'service_role', format('(%s, %s EXECUTE %s)', r, f, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY[
    'public.dma_admin_create_dma_user(text, text, text, jsonb, text[])',
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
