-- ============================================================
-- Phase 29 Plan 01 Task 3 — 서버 레지스트리 · DMA 의도 표 · 접근 맵 · 레지스트리 RPC pgTAP (D-05 · D-09 · D-19 · D-23 ⑤).
--
-- 잠그는 것:
--   - 시드: 키 4개 · enabled 2(KB120 · KYOBO119) · 주문 서버 KB=KB120 · KYOBO=KYOBO119 · 시세 주 KB120 1대
--     (서버 **키**만 단언 — 주소 리터럴은 시드 한 곳에만 있다, D-27)
--   - 잠금: 새 표 4개 RLS 활성 · 정책 0 · anon/authenticated 권한 없음 · service_role 있음
--     새 RPC 5종 anon/authenticated EXECUTE 없음 · service_role 있음
--   - 레지스트리 불변식: 증권사당 주문 서버 1(23505) · 끈 서버는 주문/시세 불가(CHECK 23514 · RPC P0001) ·
--     주문/시세 서버는 끌 수 없다 · 교체는 한 번에 단 1행 · upsert 는 broker 변경 거부 · 신규는 꺼진 채
--   - 의도 표 CHECK: dma_user_id ≤ 8 바이트 · 계좌번호 ≤ 12 · KB branch 5 · trader 6 · 교보는 빈 값 · state 2값
--   - 증권사 트리거: 계좌 증권사 ≠ 서버 증권사 → 23514
--   - 접근 맵: auth.users 가 있는 허용 사용자만 · dma_user_id 연결을 싣는다
--   - 수명: dma_users 삭제 → app_users.dma_user_id NULL · 계좌 · 등록 서버 cascade
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_registry_intent.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 테스트가 넣는 주소는 TEST-NET(192.0.2.x)뿐이다.
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(83);

-- ── 시드 (키만) ───────────────────────────────────────────────────
SELECT is(
  (SELECT array_agg(key ORDER BY sort_order) FROM public.dma_servers),
  ARRAY['KB120','KB121','KYOBO119','KYOBO127'], '(dma_servers, 시드 4키 · 정렬 순서)'
);
SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM public.dma_servers WHERE enabled),
  ARRAY['KB120','KYOBO119'], '(dma_servers, enabled = KB120 · KYOBO119 — KB121 · KYOBO127 꺼짐)'
);
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE broker = 'KB' AND is_order_server),
  ARRAY['KB120'], '(KB, 주문 서버 = KB120)'
);
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE broker = 'KYOBO' AND is_order_server),
  ARRAY['KYOBO119'], '(KYOBO, 주문 서버 = KYOBO119)'
);
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE is_quote_primary),
  ARRAY['KB120'], '(전체, 시세 주 서버 = KB120 단 1대)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_servers WHERE port = 9100),
  4, '(dma_servers, 시드 포트 전부 9100)'
);
SELECT has_column('public', 'app_users', 'dma_user_id', '(app_users, dma_user_id 열 추가)');

-- ── 잠금: 새 표 4개 × (RLS · 정책 0 · anon · authenticated · service_role) = 20 ──
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass),
  true, format('(%s, RLS 켜짐)', t)
) FROM unnest(ARRAY['dma_servers','dma_users','dma_user_accounts','dma_account_servers']) AS t;
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = t),
  0, format('(%s, 정책 0개 — 서비스롤 전용)', t)
) FROM unnest(ARRAY['dma_servers','dma_users','dma_user_accounts','dma_account_servers']) AS t;
SELECT is(
  has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE'),
  false, format('(anon, %s 권한 없음)', t)
) FROM unnest(ARRAY['dma_servers','dma_users','dma_user_accounts','dma_account_servers']) AS t;
SELECT is(
  has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE'),
  false, format('(authenticated, %s 권한 없음)', t)
) FROM unnest(ARRAY['dma_servers','dma_users','dma_user_accounts','dma_account_servers']) AS t;
SELECT is(
  has_table_privilege('service_role', 'public.' || t, 'SELECT'),
  true, format('(service_role, %s SELECT 있음)', t)
) FROM unnest(ARRAY['dma_servers','dma_users','dma_user_accounts','dma_account_servers']) AS t;

-- ── 잠금: 새 RPC 5종 × (anon · authenticated · service_role) = 15 ──
SELECT is(
  has_function_privilege(r, f, 'EXECUTE'),
  r = 'service_role', format('(%s, %s EXECUTE %s)', r, f, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY[
    'public.dma_app_access_map()',
    'public.dma_admin_upsert_server(text, text, text, integer)',
    'public.dma_admin_set_server_enabled(text, boolean)',
    'public.dma_admin_set_order_server(text)',
    'public.dma_admin_set_quote_primary(text)'
  ]) AS f
  CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r;

-- ── 레지스트리 불변식 (직접 UPDATE) ───────────────────────────────
SELECT throws_ok(
  $$UPDATE public.dma_servers SET enabled = true, is_order_server = true WHERE key = 'KB121'$$,
  '23505', NULL, '(KB121, 같은 증권사 두 번째 주문 서버 → 부분 유니크 위반)'
);
SELECT throws_ok(
  $$UPDATE public.dma_servers SET is_order_server = true WHERE key = 'KYOBO127'$$,
  '23514', NULL, '(KYOBO127 꺼짐, 주문 서버 직접 지정 → CHECK 위반)'
);
SELECT throws_ok(
  $$UPDATE public.dma_servers SET is_quote_primary = true WHERE key = 'KB121'$$,
  '23514', NULL, '(KB121 꺼짐, 시세 주 직접 지정 → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_servers (key, broker, host) VALUES ('KYOBO5', 'KB', '192.0.2.5')$$,
  '23514', NULL, '(KYOBO5 · broker KB, 키 접두와 broker 불일치 → CHECK 위반)'
);

-- ── 레지스트리 RPC ───────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_set_order_server('KYOBO127')$$,
  'P0001', 'server disabled', '(KYOBO127 꺼짐, set_order_server → 거부)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_server_enabled('KB120', false)$$,
  'P0001', 'server in use', '(KB120 주문 · 시세 서버, 끄기 → 거부)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_quote_primary('KB121')$$,
  'P0001', 'server disabled', '(KB121 꺼짐, set_quote_primary → 거부)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_set_server_enabled('KB999', true)$$,
  'P0002', 'server not found', '(KB999 없음, set_server_enabled → 거부)'
);

SELECT lives_ok($$SELECT public.dma_admin_set_quote_primary('KYOBO119')$$, '(KYOBO119, set_quote_primary 성공)');
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE is_quote_primary),
  ARRAY['KYOBO119'], '(전체, 시세 주 = KYOBO119 단 1행)'
);

SELECT lives_ok($$SELECT public.dma_admin_set_server_enabled('KB121', true)$$, '(KB121, 켜기 성공)');
SELECT lives_ok($$SELECT public.dma_admin_set_order_server('KB121')$$, '(KB121, set_order_server 성공)');
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE broker = 'KB' AND is_order_server),
  ARRAY['KB121'], '(KB, 주문 서버 = KB121 단 1행 — KB120 해제)'
);
SELECT is(
  (SELECT array_agg(key) FROM public.dma_servers WHERE broker = 'KYOBO' AND is_order_server),
  ARRAY['KYOBO119'], '(KYOBO, 주문 서버 = KYOBO119 그대로 — 다른 증권사 무영향)'
);
SELECT lives_ok($$SELECT public.dma_admin_set_server_enabled('KB120', false)$$, '(KB120 역할 없음, 끄기 성공)');
SELECT is(
  (SELECT enabled FROM public.dma_servers WHERE key = 'KB120'),
  false, '(KB120, enabled = false)'
);

SELECT lives_ok(
  $$SELECT public.dma_admin_upsert_server('KB122', 'KB', '192.0.2.22', NULL)$$,
  '(KB122 신규, upsert 성공)'
);
SELECT is(
  (SELECT enabled::text || '/' || port::text || '/' || (sort_order > 40)::text FROM public.dma_servers WHERE key = 'KB122'),
  'false/9100/true', '(KB122 신규, 꺼진 채 · 기본 포트 9100 · 맨 뒤 정렬)'
);
SELECT lives_ok(
  $$SELECT public.dma_admin_upsert_server('KB122', 'KB', '192.0.2.23', 9200)$$,
  '(KB122 기존, 주소 변경 upsert 성공)'
);
SELECT is(
  (SELECT host || ':' || port FROM public.dma_servers WHERE key = 'KB122'),
  '192.0.2.23:9200', '(KB122 기존, host/port 갱신)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_upsert_server('KB122', 'KYOBO', '192.0.2.24', 9100)$$,
  'P0001', 'broker change not allowed', '(KB122 기존 · broker KYOBO, upsert → 거부)'
);

-- ── 의도 표 CHECK ────────────────────────────────────────────────
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES
  ('t29u1', 'test-enc-u1'),
  ('t29u2', 'test-enc-u2');

SELECT throws_ok(
  $$INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('t29abcdef', 'test-enc')$$,
  '23514', NULL, '(t29abcdef 9자, dma_user_id → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('t29e', '')$$,
  '23514', NULL, '(t29e 빈 암호문, password_enc → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, branch_no, trader_id)
    VALUES ('t29u1', 'KB', '2900000001', '1234', '123456')$$,
  '23514', NULL, '(t29u1 · KB · …0001, branch 4자 → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, branch_no, trader_id)
    VALUES ('t29u1', 'KB', '2900000001', '12345', '12345')$$,
  '23514', NULL, '(t29u1 · KB · …0001, trader 5자 → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, trader_id)
    VALUES ('t29u1', 'KYOBO', '2900000011', '123456')$$,
  '23514', NULL, '(t29u1 · KYOBO · …0011, trader 값 있음 → CHECK 위반)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no)
    VALUES ('t29u1', 'KYOBO', '2900000000011')$$,
  '23514', NULL, '(t29u1 · KYOBO · 13자, 계좌번호 길이 → CHECK 위반)'
);

INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority) VALUES
  ('t29u1', 'KB',    '2900000001', '위탁', '12345', '123456', 1),
  ('t29u1', 'KYOBO', '2900000011', '위탁', '',      '',       1);

SELECT throws_ok(
  $$INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key)
    VALUES ('t29u1', 'KYOBO', '2900000011', 'KB121')$$,
  '23514', 'server broker mismatch', '(t29u1 · KYOBO · …0011 → KB121, 증권사 불일치 → 트리거 거부)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key)
    VALUES ('t29u1', 'KYOBO', '2900000011', 'KYOBO119'),
           ('t29u1', 'KB', '2900000001', 'KB121')$$,
  '(t29u1 · 계좌 2개 → 같은 증권사 서버, 등록 성공)'
);
SELECT is(
  (SELECT array_agg(DISTINCT state) FROM public.dma_account_servers WHERE dma_user_id = 't29u1'),
  ARRAY['active'], '(t29u1 등록 서버, state 기본 = active)'
);
SELECT throws_ok(
  $$UPDATE public.dma_account_servers SET server_key = 'KYOBO119' WHERE dma_user_id = 't29u1' AND broker = 'KB'$$,
  '23514', 'server broker mismatch', '(t29u1 · KB · …0001 → KYOBO119 로 UPDATE, 트리거 거부)'
);
SELECT throws_ok(
  $$UPDATE public.dma_account_servers SET state = 'gone' WHERE dma_user_id = 't29u1' AND broker = 'KB'$$,
  '23514', NULL, '(t29u1 · KB 등록 서버, state gone → CHECK 위반)'
);
SELECT lives_ok(
  $$UPDATE public.dma_account_servers SET state = 'removing' WHERE dma_user_id = 't29u1' AND broker = 'KB'$$,
  '(t29u1 · KB 등록 서버, state removing 성공)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key)
    VALUES ('t29u1', 'KB', '2900000099', 'KB121')$$,
  '23503', NULL, '(t29u1 · KB · …0099 의도 계좌 없음, 등록 서버 → FK 위반)'
);

-- ── 접근 맵 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002911', 't29-map@example.invalid'),
  ('00000000-0000-4000-8000-000000002912', 't29-unlisted@example.invalid');
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('t29-map@example.invalid', 'trader', 't29u1'),
  ('t29-pre@example.invalid', 'viewer', NULL);

SELECT is(
  (SELECT role || '/' || coalesce(dma_user_id, '-') FROM public.dma_app_access_map()
    WHERE user_id = '00000000-0000-4000-8000-000000002911'),
  'trader/t29u1', '(t29-map@example.invalid, 접근 맵 = trader · dma_user_id t29u1)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_app_access_map() WHERE email = 't29-pre@example.invalid'),
  0, '(t29-pre@example.invalid 사전 등록 · 미가입, 접근 맵에 없음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_app_access_map() WHERE user_id = '00000000-0000-4000-8000-000000002912'),
  0, '(t29-unlisted@example.invalid 가입 · 미허용, 접근 맵에 없음)'
);
SELECT throws_ok(
  $$UPDATE public.app_users SET dma_user_id = 't29zz' WHERE email = 't29-pre@example.invalid'$$,
  '23503', NULL, '(t29-pre@example.invalid → t29zz 없는 DMA 유저, FK 위반)'
);

-- ── 수명 ─────────────────────────────────────────────────────────
DELETE FROM public.dma_users WHERE dma_user_id = 't29u1';
SELECT is(
  (SELECT dma_user_id FROM public.app_users WHERE email = 't29-map@example.invalid'),
  NULL::text, '(t29-map@example.invalid, dma_users 삭제 뒤 dma_user_id = NULL)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts WHERE dma_user_id = 't29u1')
  + (SELECT count(*)::int FROM public.dma_account_servers WHERE dma_user_id = 't29u1'),
  0, '(t29u1 삭제 뒤, 계좌 · 등록 서버 cascade 0행)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_users WHERE dma_user_id = 't29u2'),
  1, '(t29u2, 다른 DMA 유저 무영향)'
);

SELECT * FROM finish(true);

ROLLBACK;
