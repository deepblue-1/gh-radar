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
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_devices.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (사용자, 기기 키 말미, 기대값) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자: U1 = 00000000-0000-4000-8000-000000004001 · U2 = …4002.
-- 기기 키: K1 = 11111111-1111-4111-8111-111111111111(U1) · K2 = 22222222-2222-4222-8222-222222222222(U2).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

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

SELECT * FROM finish(true);

ROLLBACK;
