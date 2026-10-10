-- ============================================================
-- Phase 29 Plan 27 — CR-01 「+ 사용자」 가 기존 DMA 연결을 덮어쓰지 않는다 (pgTAP).
--
-- 잠그는 것(정본 가드 = DB · 20261010200000_dma_admin_create_dma_linked.sql):
--   - 이미 DMA 가 연결된 허용 유저로 다시 생성 → P0001 DMA_LINKED · 호출 전후 dma_users · dma_user_accounts ·
--     dma_account_servers 행 수와 그 app_users.dma_user_id 가 같다(덮어쓰기 · 고아 DMA 유저 없음)
--   - 이메일 대소문자 · 공백 무관하게 같은 가드 · 같은 DMA id 재사용이어도 DMA_LINKED 가 먼저
--   - 미연결 허용 유저는 종전대로 생성 성공 · 허용 표에 없는 이메일 NO_APP_USER · 같은 DMA id DMA_USER_EXISTS
--   - 함수는 하나뿐(오버로드 없음) · SECURITY DEFINER · anon/authenticated EXECUTE 없음 · service_role 있음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_create_guard.test.sql`
-- 수정 전 재현(RED): 같은 명령에 `--until 20261007200100` — 옛 함수는 연결을 조용히 덮어써 DMA_LINKED 단언이 not ok.
-- 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0). 끝에서 ROLLBACK.
--
-- 픽스처:
--   cg-x@example.invalid  허용(trader) → DMA cgd1 로 연결(KB 계좌 …0001 · KB120)
--   cg-y@example.invalid  허용(trader) · 미연결 → cgd3 생성 성공 경로
--   cg-z@example.invalid  허용(trader) · 미연결 → 남의 DMA id(cgd1) 재사용 DMA_USER_EXISTS 경로
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(19);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO public.app_users (email, role) VALUES
  ('cg-x@example.invalid', 'trader'),
  ('cg-y@example.invalid', 'trader'),
  ('cg-z@example.invalid', 'trader');

-- ── 첫 연결(종전 경로) ───────────────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_create_dma_user('cg-x@example.invalid', 'cgd1', 'enc-cgd1',
      '{"broker":"KB","accountNo":"6000000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY['KB120'])$$,
  '(create cg-x → cgd1 첫 연결, 성공)'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'cg-x@example.invalid'),
  'cgd1', '(app_users cg-x, dma_user_id = cgd1)'
);

-- 거부 호출 전 행 수 스냅숏(같은 트랜잭션 안 · ROLLBACK 으로 사라진다).
CREATE TEMP TABLE cg_before AS
SELECT (SELECT count(*)::int FROM public.dma_users)           AS users,
       (SELECT count(*)::int FROM public.dma_user_accounts)   AS accounts,
       (SELECT count(*)::int FROM public.dma_account_servers) AS servers;

-- ── CR-01: 연결된 이메일로 다시 생성 → DMA_LINKED · 아무것도 바뀌지 않는다 ─────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('cg-x@example.invalid', 'cgd2', 'enc-cgd2',
      '{"broker":"KB","accountNo":"6000000002","name":"새","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'DMA_LINKED', '(create 연결된 cg-x → 새 cgd2, DMA_LINKED)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('  CG-X@Example.invalid ', 'cgd2', 'enc-cgd2',
      '{"broker":"KB","accountNo":"6000000002","name":"새","branchNo":"00001","traderId":"000001","priority":1}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'DMA_LINKED', '(create 연결된 cg-x · 대문자 · 공백 이메일, DMA_LINKED)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('cg-x@example.invalid', 'cgd1', 'enc-x',
      '{"broker":"KB","accountNo":"6000000003","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'DMA_LINKED', '(create 연결된 cg-x · 같은 cgd1 재사용, DMA_LINKED 가 DMA_USER_EXISTS 보다 먼저)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_users WHERE dma_user_id = 'cgd2'),
  0, '(DMA_LINKED 뒤, dma_users 에 cgd2 없음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_users),
  (SELECT users FROM cg_before), '(DMA_LINKED 뒤, dma_users 행 수 불변)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts),
  (SELECT accounts FROM cg_before), '(DMA_LINKED 뒤, dma_user_accounts 행 수 불변)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_servers),
  (SELECT servers FROM cg_before), '(DMA_LINKED 뒤, dma_account_servers 행 수 불변)'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'cg-x@example.invalid'),
  'cgd1', '(DMA_LINKED 뒤, app_users cg-x 연결 = cgd1 그대로)'
);

-- ── 종전 경로 회귀 ─────────────────────────────────────────────────
SELECT lives_ok(
  $$SELECT public.dma_admin_create_dma_user('cg-y@example.invalid', 'cgd3', 'enc-cgd3',
      '{"broker":"KB","accountNo":"6000000004","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  '(create 미연결 cg-y → cgd3, 성공)'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'cg-y@example.invalid'),
  'cgd3', '(app_users cg-y, dma_user_id = cgd3)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('nobody-cg@example.invalid', 'cgd9', 'enc-x',
      '{"broker":"KB","accountNo":"6000000009","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'NO_APP_USER', '(create 허용 표에 없는 이메일, NO_APP_USER)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_create_dma_user('cg-z@example.invalid', 'cgd1', 'enc-x',
      '{"broker":"KB","accountNo":"6000000005","name":"","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
      ARRAY['KB120'])$$,
  'P0001', 'DMA_USER_EXISTS', '(create 미연결 cg-z · 남의 cgd1, DMA_USER_EXISTS)'
);
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 'cg-z@example.invalid'),
  NULL, '(DMA_USER_EXISTS 뒤, app_users cg-z 연결 없음)'
);

-- ── 시그니처 · 권한(종전과 같음) ──────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'dma_admin_create_dma_user'),
  1, '(dma_admin_create_dma_user, 오버로드 없이 1개)'
);
SELECT is(
  has_function_privilege(r, 'public.dma_admin_create_dma_user(text, text, text, jsonb, text[])', 'EXECUTE'),
  r = 'service_role',
  format('(%s, dma_admin_create_dma_user EXECUTE %s)', r, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY['anon','authenticated','service_role']) AS r;

SELECT * FROM finish();
ROLLBACK;
