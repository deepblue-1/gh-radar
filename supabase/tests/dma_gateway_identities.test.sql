-- ============================================================
-- quick-260929-sas — 게이트웨이 인지 가시성 pgTAP (T-c8e-02 대체).
--
-- 잠그는 것:
--   - 스키마: dma_credentials.gateway (NOT NULL · 기본 'KB') · 신원 연결 테이블 dma_gateway_identities
--     (PK (user_id, gateway) · auth.users FK cascade · RLS 활성 · 정책 0개) · 규칙 뷰 dma_visibility_identities
--     (security_invoker) · 헬퍼 dma_visible_accounts(uuid)
--   - 권한: 연결 테이블 · 뷰 · dma_visible_accounts · ⑨ 모두 anon/authenticated 불가 · service_role 가능 (T-sas-02)
--   - 가시성 매트릭스: 같은 자격증명 문자열이라도 추가 게이트웨이(KYOBO)는 명시 연결로만 보인다(T-sas-01) ·
--     자격증명과 같은 게이트웨이의 연결은 무시(T-sas-05) · 자격증명 없는 연결은 무시(T-sas-04) ·
--     연결 id 가 자격증명 id 와 달라도 된다
--   - ⑨ dma_journal_orders_for_user 가 같은 규칙으로 · 중복 없이
--   - Phase 25 전략 조회 RPC 2종도 같은 규칙: 시세 이벤트(kind 1·2)는 그 게이트웨이 가시 계좌가 있는 사용자만 ·
--     주문 이벤트는 그 계좌 가시 사용자만 · 주문 1건 이벤트는 행이 보이는 사용자만 · 권한 재명시
--   - 수명: 자격증명 삭제 → 연결 행이 남아도 가시 집합 0 · 사용자 삭제 → 연결 cascade
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_gateway_identities.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (사용자, 게이트웨이, 계좌 말미, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자(자격증명 dma_user_id · 연결):
--   U1 dma-shared · 연결 (KYOBO, dma-shared)
--   U2 dma-shared · 연결 없음                 ← 핵심: 같은 문자열이지만 KYOBO 는 안 보인다
--   U3 dma-solo   · 연결 (KB, dma-shared)     ← 자기 게이트웨이 연결 — 무시
--   U4 dma-kb4    · 연결 (KYOBO, dma-ky4)     ← 연결 id 가 자격증명 id 와 다르다
--   U5 자격증명 없음 · 연결 (KYOBO, dma-shared) ← 자격증명 없는 연결 — 무시(D-12 allowlist)
-- 매핑: KB dma-shared → …0001 · dma-solo → …0002 / KYOBO dma-shared → …0011 · dma-ky4 → …0012.
-- 계좌 …0099 는 어느 매핑에도 없다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처: 사용자 · 자격증명(gateway 생략 — 기본값 검증) · 매핑 · 주문 · 연결 ─────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002601', 'sas-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000002602', 'sas-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000002603', 'sas-u3@example.invalid'),
  ('00000000-0000-4000-8000-000000002604', 'sas-u4@example.invalid'),
  ('00000000-0000-4000-8000-000000002605', 'sas-u5@example.invalid');

INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000002601', 'dma-shared', 'test-enc-u1'),
  ('00000000-0000-4000-8000-000000002602', 'dma-shared', 'test-enc-u2'),
  ('00000000-0000-4000-8000-000000002603', 'dma-solo',   'test-enc-u3'),
  ('00000000-0000-4000-8000-000000002604', 'dma-kb4',    'test-enc-u4');

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

INSERT INTO t_setup SELECT 'access_kb', to_jsonb(public.dma_journal_sync_access('KB', '[
  {"dma_user_id":"dma-shared","account_no":"2600000001","name":"위탁","priority":1},
  {"dma_user_id":"dma-solo","account_no":"2600000002","name":"위탁","priority":1}
]'::jsonb));
INSERT INTO t_setup SELECT 'access_kyobo', to_jsonb(public.dma_journal_sync_access('KYOBO', '[
  {"dma_user_id":"dma-shared","account_no":"2600000011","name":"위탁","priority":1},
  {"dma_user_id":"dma-ky4","account_no":"2600000012","name":"위탁","priority":1}
]'::jsonb));

-- 주문: 계좌당 1행(2026-09-29) + 매핑 밖 계좌 1행.
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
VALUES
  ('KB',    '2026-09-29', '2600000001', '0000100001', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-29 09:00:01+09', '2026-09-29 09:00:01+09'),
  ('KB',    '2026-09-29', '2600000002', '0000100002', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 2, 2, '2026-09-29 09:00:02+09', '2026-09-29 09:00:02+09'),
  ('KYOBO', '2026-09-29', '2600000011', '0000100011', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-29 09:00:11+09', '2026-09-29 09:00:11+09'),
  ('KYOBO', '2026-09-29', '2600000012', '0000100012', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 2, 2, '2026-09-29 09:00:12+09', '2026-09-29 09:00:12+09'),
  ('KYOBO', '2026-09-29', '2600000099', '0000100099', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 3, 3, '2026-09-29 09:00:19+09', '2026-09-29 09:00:19+09');

-- 전략 이벤트 1건 — relay STRATEGY_APPLY_KEYS 43키(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다
-- (dma_strategy_read.test.sql 과 같은 헬퍼).
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT '2026-09-29'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind, 'group', p_group, 'exchange', 'KRX', 'isin', 'KR7005930003', 'cum_volume', 0,
    'dma_user_id', CASE WHEN p_account = '' THEN '' ELSE 'dma-audit' END,
    'account_no', p_account, 'order_no', p_order_no, 'price', 0, 'qty', 0, 'order_condition', '',
    'reason_code', '', 'cond_threshold', 0, 'cond_actual', 0, 'cond_metric', 0, 'ev_kind', 0, 'ev_price', 0,
    'ev_qty_before', 0, 'ev_qty_after', 0, 'ev_trade_qty', 0, 'limit_bid_qty', 0, 'bid1_price', 0,
    'bid1_qty', 0, 'accept_latency_us', 0, 'immediate_fill_qty', 0, 'queue_case', 0, 'base_cum', 0,
    'ahead_qty', 0, 'expected_cum', 0, 'error_volume', 0, 'remaining_volume', 0, 'has_remaining', false,
    'cancel_reason', 0, 'result_code', 0, 'message', '', 'entry_round', 0,
    'snap_qty', '[]'::jsonb, 'snap_cum', '[]'::jsonb, 'ask_qty_at_limit', 0, 'open_at_limit', false
  ) || p_over
$$;

-- 주문 통보 1건 — relay 주문 기록기 23키(접수 A 기본값) 위에 p_over 를 덮는다(dma_strategy_read.test.sql 과 같은 헬퍼).
CREATE FUNCTION pg_temp.jev(
  p_seq bigint, p_account text, p_order_no text, p_hms text, p_over jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', '2026-09-29',
    'gw_time_ms', (extract(epoch FROM ('2026-09-29 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'dma-audit', 'account_no', p_account, 'isin', 'KR7005930003',
    'side', 'B', 'side_trusted', true, 'order_no', p_order_no, 'org_order_no', '',
    'notice_type', 'A', 'request_kind', 'New', 'requester', '', 'origin', 'LimitChaser',
    'exchange', 'KRX', 'board', '', 'order_price', 12350, 'order_qty', 300,
    'exec_price', 0, 'exec_qty', 0, 'result_code', 0, 'message', '접수', 'local_reject', false
  ) || p_over
$$;

-- 신원 연결 4행 (서비스롤 · 운영자 SQL 과 같은 직접 INSERT).
INSERT INTO public.dma_gateway_identities (user_id, gateway, dma_user_id) VALUES
  ('00000000-0000-4000-8000-000000002601', 'KYOBO', 'dma-shared'),
  ('00000000-0000-4000-8000-000000002603', 'KB',    'dma-shared'),
  ('00000000-0000-4000-8000-000000002604', 'KYOBO', 'dma-ky4'),
  ('00000000-0000-4000-8000-000000002605', 'KYOBO', 'dma-shared');

SELECT plan(42);

-- ── 1. 스키마: dma_credentials.gateway ────────────────────────────
SELECT has_column('public', 'dma_credentials', 'gateway', '(스키마, dma_credentials, gateway, 존재)');
SELECT col_not_null('public', 'dma_credentials', 'gateway', '(스키마, dma_credentials, gateway, NOT NULL)');
SELECT col_default_is('public', 'dma_credentials', 'gateway', 'KB'::text, '(스키마, dma_credentials, gateway, 기본값 KB)');
SELECT is(
  (SELECT gateway FROM public.dma_credentials WHERE user_id = '00000000-0000-4000-8000-000000002601'),
  'KB', '(U1, gateway 생략 INSERT, —, 값 KB)'
);

-- ── 2. 스키마 · 권한: 연결 테이블 ────────────────────────────────
SELECT has_table('public', 'dma_gateway_identities', '(스키마, dma_gateway_identities, —, 존재)');
SELECT col_is_pk('public', 'dma_gateway_identities', ARRAY['user_id', 'gateway'], '(스키마, dma_gateway_identities, —, PK (user_id, gateway))');
SELECT fk_ok('public', 'dma_gateway_identities', 'user_id', 'auth', 'users', 'id', '(스키마, dma_gateway_identities.user_id, —, → auth.users.id)');
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_gateway_identities'::regclass),
  true, '(스키마, dma_gateway_identities, —, RLS 활성)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dma_gateway_identities'),
  0, '(스키마, dma_gateway_identities, —, 정책 0개 — default deny)'
);
SELECT is(
  row(
    has_table_privilege('anon', 'public.dma_gateway_identities', 'SELECT'),
    has_table_privilege('anon', 'public.dma_gateway_identities', 'INSERT'),
    has_table_privilege('anon', 'public.dma_gateway_identities', 'UPDATE'),
    has_table_privilege('anon', 'public.dma_gateway_identities', 'DELETE')
  )::text,
  '(f,f,f,f)', '(anon, dma_gateway_identities, —, SELECT/INSERT/UPDATE/DELETE 불가)'
);
SELECT is(
  row(
    has_table_privilege('authenticated', 'public.dma_gateway_identities', 'SELECT'),
    has_table_privilege('authenticated', 'public.dma_gateway_identities', 'INSERT'),
    has_table_privilege('authenticated', 'public.dma_gateway_identities', 'UPDATE'),
    has_table_privilege('authenticated', 'public.dma_gateway_identities', 'DELETE')
  )::text,
  '(f,f,f,f)', '(authenticated, dma_gateway_identities, —, SELECT/INSERT/UPDATE/DELETE 불가)'
);
SELECT is(
  row(
    has_table_privilege('service_role', 'public.dma_gateway_identities', 'SELECT'),
    has_table_privilege('service_role', 'public.dma_gateway_identities', 'INSERT'),
    has_table_privilege('service_role', 'public.dma_gateway_identities', 'UPDATE'),
    has_table_privilege('service_role', 'public.dma_gateway_identities', 'DELETE')
  )::text,
  '(t,t,t,t)', '(service_role, dma_gateway_identities, —, SELECT/INSERT/UPDATE/DELETE 가능)'
);

-- ── 3. 스키마 · 권한: 규칙 뷰 · 헬퍼 · ⑨ ──────────────────────────
SELECT has_view('public', 'dma_visibility_identities', '(스키마, dma_visibility_identities, —, 존재)');
SELECT ok(
  (SELECT coalesce('security_invoker=true' = ANY (reloptions), false)
     FROM pg_class WHERE oid = 'public.dma_visibility_identities'::regclass),
  '(스키마, dma_visibility_identities, —, security_invoker=true)'
);
SELECT is(
  row(
    has_table_privilege('anon', 'public.dma_visibility_identities', 'SELECT'),
    has_table_privilege('authenticated', 'public.dma_visibility_identities', 'SELECT'),
    has_table_privilege('service_role', 'public.dma_visibility_identities', 'SELECT')
  )::text,
  '(f,f,t)', '(anon · authenticated · service_role, dma_visibility_identities, —, SELECT = (f, f, t))'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_visible_accounts(uuid)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_visible_accounts(uuid)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_visible_accounts(uuid)', 'EXECUTE')
  )::text,
  '(f,f,t)', '(anon · authenticated · service_role, dma_visible_accounts(uuid), —, EXECUTE = (f, f, t))'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_journal_orders_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_journal_orders_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_journal_orders_for_user(uuid,date)', 'EXECUTE')
  )::text,
  '(f,f,t)', '(anon · authenticated · service_role, dma_journal_orders_for_user(uuid,date), —, EXECUTE = (f, f, t))'
);

-- ── 4. 가시성 매트릭스: dma_visible_accounts · 뷰 ─────────────────
SELECT set_eq(
  $$SELECT gateway, account_no FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002601')$$,
  $$VALUES ('KB', '2600000001'), ('KYOBO', '2600000011')$$,
  '(U1, KB+KYOBO, …0001 · …0011, 자격증명 KB + 명시 연결 KYOBO)'
);
SELECT set_eq(
  $$SELECT gateway, account_no FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002602')$$,
  $$VALUES ('KB', '2600000001')$$,
  '(U2, KB, …0001, KB 만 — 같은 문자열 dma-shared 지만 KYOBO 연결 없음 → …0011 안 보임)'
);
SELECT set_eq(
  $$SELECT gateway, account_no FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002603')$$,
  $$VALUES ('KB', '2600000002')$$,
  '(U3, KB, …0002, 자기 자격증명만 — 자격증명과 같은 게이트웨이(KB) 연결 dma-shared 는 무시)'
);
SELECT set_eq(
  $$SELECT gateway, account_no FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002604')$$,
  $$VALUES ('KYOBO', '2600000012')$$,
  '(U4, KYOBO, …0012, 연결 id dma-ky4 ≠ 자격증명 id dma-kb4 — 연결 계좌만)'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002605')$$,
  '(U5, KYOBO, —, 자격증명 없는 연결 — 0행)'
);
SELECT set_eq(
  $$SELECT gateway, dma_user_id FROM public.dma_visibility_identities WHERE user_id = '00000000-0000-4000-8000-000000002603'$$,
  $$VALUES ('KB', 'dma-solo')$$,
  '(U3, 뷰, —, KB 자격증명 1행만 — 같은 게이트웨이 연결 행은 뷰에 없다)'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_visibility_identities WHERE user_id = '00000000-0000-4000-8000-000000002605'$$,
  '(U5, 뷰, —, 0행 — 자격증명 없는 연결은 뷰에 없다)'
);

-- ── 5. ⑨ dma_journal_orders_for_user — 같은 규칙 · 중복 없음 ────────
SELECT set_eq(
  $$SELECT account_no FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002601', '2026-09-29')$$,
  $$VALUES ('2600000001'), ('2600000011')$$,
  '(U1, KB+KYOBO, …0001 · …0011, ⑨ 두 계좌 행)'
);
SELECT set_eq(
  $$SELECT account_no FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002602', '2026-09-29')$$,
  $$VALUES ('2600000001')$$,
  '(U2, KB, …0001, ⑨ KB 행만 — KYOBO …0011 행 없음)'
);
SELECT set_eq(
  $$SELECT account_no FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002603', '2026-09-29')$$,
  $$VALUES ('2600000002')$$,
  '(U3, KB, …0002, ⑨ 자기 계좌 행만)'
);
SELECT set_eq(
  $$SELECT account_no FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002604', '2026-09-29')$$,
  $$VALUES ('2600000012')$$,
  '(U4, KYOBO, …0012, ⑨ 연결 계좌 행만)'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002605', '2026-09-29')$$,
  '(U5, KYOBO, —, ⑨ 0행)'
);
SELECT is(
  (SELECT count(*)::int - count(DISTINCT id)::int
     FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000002601', '2026-09-29')),
  0, '(U1, KB+KYOBO, …0001 · …0011, ⑨ 행 수 = distinct id 수 — 중복 없음)'
);

-- ── 6. Phase 25 전략 조회 RPC 2종 — 같은 규칙 (수명 단언보다 앞) ───────
-- 픽스처는 ⑨ 단언 뒤에 넣는다 — KYOBO 통보가 …0011 에 주문 행 하나를 더 만들기 때문이다.
INSERT INTO t_setup SELECT 'strategy_kb', public.dma_strategy_apply('KB', 'ep-sas', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:10:00.000'),                              -- KB 시세 LimitExposed
  pg_temp.sev(2, 3, 1, '2600000001', '0000100001', '09:10:01.000')           -- KB …0001 BuyOrder
));
INSERT INTO t_setup SELECT 'strategy_kyobo', public.dma_strategy_apply('KYOBO', 'ep-sas-k', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:20:00.000'),                              -- KYOBO 시세 LimitExposed
  pg_temp.sev(2, 3, 1, '2600000011', '0000200011', '09:20:01.000')           -- KYOBO …0011 BuyOrder
));
-- KYOBO …0011 접수 통보 1건 — 주문 1건 이벤트 RPC 용 주문 행(0000200011)을 만든다.
INSERT INTO t_setup SELECT 'journal_kyobo', public.dma_journal_apply('KYOBO', 'ep-sas-k', jsonb_build_array(
  pg_temp.jev(1, '2600000011', '0000200011', '09:20:01.000')
));

CREATE FUNCTION pg_temp.kyobo_oid() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.dma_account_orders
   WHERE gateway = 'KYOBO' AND trade_date = '2026-09-29' AND account_no = '2600000011' AND order_no = '0000200011'
$$;

SELECT set_eq(
  $$SELECT r->>'gateway' AS gateway, (r->>'kind')::int AS kind, r->>'account_no' AS account_no
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002601', '2026-09-29') r$$,
  $$VALUES ('KB', 1, ''), ('KB', 3, '2600000001'), ('KYOBO', 1, ''), ('KYOBO', 3, '2600000011')$$,
  '(U1, KB+KYOBO, …0001 · …0011, 전략 목록) KB 시세 · 주문 + KYOBO 시세 · 주문'
);
SELECT set_eq(
  $$SELECT r->>'gateway' AS gateway, (r->>'kind')::int AS kind, r->>'account_no' AS account_no
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002602', '2026-09-29') r$$,
  $$VALUES ('KB', 1, ''), ('KB', 3, '2600000001')$$,
  '(U2, KB, …0001, 전략 목록) KB 만 — 같은 문자열 dma-shared 지만 KYOBO 시세 · 주문 이벤트 없음'
);
SELECT set_eq(
  $$SELECT r->>'gateway' AS gateway, (r->>'kind')::int AS kind, r->>'account_no' AS account_no
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002603', '2026-09-29') r$$,
  $$VALUES ('KB', 1, '')$$,
  '(U3, KB, …0002, 전략 목록) KB 시세만 — 같은 게이트웨이 연결로 …0001 주문 이벤트가 보이지 않는다'
);
SELECT set_eq(
  $$SELECT r->>'gateway' AS gateway, (r->>'kind')::int AS kind, r->>'account_no' AS account_no
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002604', '2026-09-29') r$$,
  $$VALUES ('KYOBO', 1, '')$$,
  '(U4, KYOBO, …0012, 전략 목록) KYOBO 시세만 — …0011 주문 이벤트 · KB 시세 없음'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002605', '2026-09-29')$$,
  '(U5, KYOBO, —, 전략 목록) 0행 — 자격증명 없는 연결'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002602', pg_temp.kyobo_oid(), NULL)$$,
  '(U2, KYOBO, …0011 행 id, NULL) 0행 — 같은 문자열이지만 연결 없음'
);
SELECT ok(
  (SELECT count(*) FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002601', pg_temp.kyobo_oid(), NULL)) >= 1,
  '(U1, KYOBO, …0011 행 id, NULL) 통보 행 ≥ 1 — 명시 연결'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE')
  )::text,
  '(f,f,t)', '(anon · authenticated · service_role, dma_strategy_events_for_user(uuid,date), —, EXECUTE = (f, f, t))'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE')
  )::text,
  '(f,f,t)', '(anon · authenticated · service_role, dma_order_events_for_user(uuid,uuid,text[]), —, EXECUTE = (f, f, t))'
);

-- ── 7. 수명: 자격증명 삭제 · 사용자 삭제 ───────────────────────────
DELETE FROM public.dma_credentials WHERE user_id = '00000000-0000-4000-8000-000000002601';
SELECT is_empty(
  $$SELECT 1 FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002601')$$,
  '(U1, 자격증명 삭제 뒤, —, 가시 집합 0 — 연결 행이 남아도 allowlist 밖)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_gateway_identities WHERE user_id = '00000000-0000-4000-8000-000000002601'),
  1, '(U1, 자격증명 삭제 뒤, KYOBO, 연결 행 1 남음 — 삭제는 운영자 몫)'
);
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000002604';
SELECT is(
  (SELECT count(*)::int FROM public.dma_gateway_identities WHERE user_id = '00000000-0000-4000-8000-000000002604'),
  0, '(U4, auth.users 삭제 뒤, KYOBO, 연결 행 0 — ON DELETE CASCADE)'
);

SELECT * FROM finish(true);

ROLLBACK;
