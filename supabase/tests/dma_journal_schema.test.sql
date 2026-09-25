-- ============================================================
-- Phase 19 Plan 01 — 저널 테이블·RPC 스키마·권한 pgTAP (T-19-01 · T-19-11 회귀 정본).
--
-- 잠그는 것:
--   - 테이블 4종 존재 · RLS 활성(pg_class.relrowsecurity) · 접근 규칙 0개(pg_policies)
--   - anon · authenticated 는 네 테이블에 SELECT/INSERT/UPDATE/DELETE 권한이 없다(T-19-11),
--     service_role 은 네 권한을 모두 가진다(relay·server 쓰기·읽기 경로)
--   - 함수 7종 EXECUTE(19-03 dma_journal_origin 포함): anon · authenticated false · service_role true (T-19-01 · Pitfall 10 —
--     조회 RPC 가 authenticated 에 열리면 PostgREST 로 남의 p_user_id 를 넣어 조회하는 IDOR)
--   - dma_account_orders 행 모델 제약: 키 xor(order_no ↔ reject_seq) · reject_seq 의 epoch 필수 ·
--     상태 6종 · 거래소 KRX/NXT · 방향 B/S · 출처 3종 · ISIN 12자 · qty > 0 · 두 부분 유니크
--   - dma_journal_cursor.last_seq >= 0
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 이 테스트가 실패하면 테스트가 아니라 마이그레이션(20260924200000 · 20260924200100)을 고친다 —
-- 권한이 새면 원격 반영(19-11) 전에 막아야 한다.
-- 함수 시그니처 문자열은 20260924200100 의 REVOKE/GRANT 줄 원문 그대로다.
-- 제약 단언 설명에는 위반 튜플을 그대로 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(93);

-- ── 테이블 존재 ──────────────────────────────────────────────────
SELECT has_table('public', 'dma_journal_events', 'public.dma_journal_events 테이블이 있다');
SELECT has_table('public', 'dma_account_orders', 'public.dma_account_orders 테이블이 있다');
SELECT has_table('public', 'dma_account_access', 'public.dma_account_access 테이블이 있다');
SELECT has_table('public', 'dma_journal_cursor', 'public.dma_journal_cursor 테이블이 있다');

-- ── RLS 활성 · 접근 규칙 0개 (T-19-11) ────────────────────────────
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_journal_events'::regclass), true, 'public.dma_journal_events RLS 활성 (relrowsecurity)');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_account_orders'::regclass), true, 'public.dma_account_orders RLS 활성 (relrowsecurity)');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_account_access'::regclass), true, 'public.dma_account_access RLS 활성 (relrowsecurity)');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_journal_cursor'::regclass), true, 'public.dma_journal_cursor RLS 활성 (relrowsecurity)');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('dma_journal_events','dma_account_orders','dma_account_access','dma_journal_cursor')),
  0, '네 테이블의 pg_policies 행 0 — 접근 규칙 없음(서비스롤 전용)'
);

-- ── 테이블 권한: anon · authenticated 전부 false (T-19-11) ─────────
SELECT is(has_table_privilege('anon', 'public.dma_journal_events', 'SELECT'), false, 'anon 에게 public.dma_journal_events SELECT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_events', 'INSERT'), false, 'anon 에게 public.dma_journal_events INSERT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_events', 'UPDATE'), false, 'anon 에게 public.dma_journal_events UPDATE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_events', 'DELETE'), false, 'anon 에게 public.dma_journal_events DELETE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_orders', 'SELECT'), false, 'anon 에게 public.dma_account_orders SELECT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_orders', 'INSERT'), false, 'anon 에게 public.dma_account_orders INSERT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_orders', 'UPDATE'), false, 'anon 에게 public.dma_account_orders UPDATE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_orders', 'DELETE'), false, 'anon 에게 public.dma_account_orders DELETE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_access', 'SELECT'), false, 'anon 에게 public.dma_account_access SELECT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_access', 'INSERT'), false, 'anon 에게 public.dma_account_access INSERT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_access', 'UPDATE'), false, 'anon 에게 public.dma_account_access UPDATE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_account_access', 'DELETE'), false, 'anon 에게 public.dma_account_access DELETE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_cursor', 'SELECT'), false, 'anon 에게 public.dma_journal_cursor SELECT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_cursor', 'INSERT'), false, 'anon 에게 public.dma_journal_cursor INSERT 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_cursor', 'UPDATE'), false, 'anon 에게 public.dma_journal_cursor UPDATE 권한이 없다');
SELECT is(has_table_privilege('anon', 'public.dma_journal_cursor', 'DELETE'), false, 'anon 에게 public.dma_journal_cursor DELETE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_events', 'SELECT'), false, 'authenticated 에게 public.dma_journal_events SELECT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_events', 'INSERT'), false, 'authenticated 에게 public.dma_journal_events INSERT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_events', 'UPDATE'), false, 'authenticated 에게 public.dma_journal_events UPDATE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_events', 'DELETE'), false, 'authenticated 에게 public.dma_journal_events DELETE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_orders', 'SELECT'), false, 'authenticated 에게 public.dma_account_orders SELECT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_orders', 'INSERT'), false, 'authenticated 에게 public.dma_account_orders INSERT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_orders', 'UPDATE'), false, 'authenticated 에게 public.dma_account_orders UPDATE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_orders', 'DELETE'), false, 'authenticated 에게 public.dma_account_orders DELETE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_access', 'SELECT'), false, 'authenticated 에게 public.dma_account_access SELECT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_access', 'INSERT'), false, 'authenticated 에게 public.dma_account_access INSERT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_access', 'UPDATE'), false, 'authenticated 에게 public.dma_account_access UPDATE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_account_access', 'DELETE'), false, 'authenticated 에게 public.dma_account_access DELETE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_cursor', 'SELECT'), false, 'authenticated 에게 public.dma_journal_cursor SELECT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_cursor', 'INSERT'), false, 'authenticated 에게 public.dma_journal_cursor INSERT 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_cursor', 'UPDATE'), false, 'authenticated 에게 public.dma_journal_cursor UPDATE 권한이 없다');
SELECT is(has_table_privilege('authenticated', 'public.dma_journal_cursor', 'DELETE'), false, 'authenticated 에게 public.dma_journal_cursor DELETE 권한이 없다');

-- ── 테이블 권한: service_role 전부 true ─────────────────────────────
SELECT is(has_table_privilege('service_role', 'public.dma_journal_events', 'SELECT'), true, 'service_role 은 public.dma_journal_events SELECT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_events', 'INSERT'), true, 'service_role 은 public.dma_journal_events INSERT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_events', 'UPDATE'), true, 'service_role 은 public.dma_journal_events UPDATE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_events', 'DELETE'), true, 'service_role 은 public.dma_journal_events DELETE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_orders', 'SELECT'), true, 'service_role 은 public.dma_account_orders SELECT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_orders', 'INSERT'), true, 'service_role 은 public.dma_account_orders INSERT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_orders', 'UPDATE'), true, 'service_role 은 public.dma_account_orders UPDATE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_orders', 'DELETE'), true, 'service_role 은 public.dma_account_orders DELETE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_access', 'SELECT'), true, 'service_role 은 public.dma_account_access SELECT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_access', 'INSERT'), true, 'service_role 은 public.dma_account_access INSERT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_access', 'UPDATE'), true, 'service_role 은 public.dma_account_access UPDATE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_account_access', 'DELETE'), true, 'service_role 은 public.dma_account_access DELETE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_cursor', 'SELECT'), true, 'service_role 은 public.dma_journal_cursor SELECT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_cursor', 'INSERT'), true, 'service_role 은 public.dma_journal_cursor INSERT 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_cursor', 'UPDATE'), true, 'service_role 은 public.dma_journal_cursor UPDATE 권한이 있다');
SELECT is(has_table_privilege('service_role', 'public.dma_journal_cursor', 'DELETE'), true, 'service_role 은 public.dma_journal_cursor DELETE 권한이 있다');

-- ── 함수 EXECUTE: service_role 전용 (T-19-01 · Pitfall 10) ─────────
SELECT is(has_function_privilege('anon', 'public.dma_journal_status_rank(text)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_status_rank(text) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_status_rank(text)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_status_rank(text) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_status_rank(text)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_status_rank(text) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_next_status(text, text)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_next_status(text, text) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_next_status(text, text)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_next_status(text, text) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_next_status(text, text)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_next_status(text, text) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_project(text, text, jsonb)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_project(text, text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_project(text, text, jsonb)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_project(text, text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_project(text, text, jsonb)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_project(text, text, jsonb) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_apply(text, text, jsonb)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_apply(text, text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_apply(text, text, jsonb)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_apply(text, text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_apply(text, text, jsonb)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_apply(text, text, jsonb) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_sync_access(text, jsonb)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_sync_access(text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_sync_access(text, jsonb)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_sync_access(text, jsonb) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_sync_access(text, jsonb)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_sync_access(text, jsonb) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_origin(text)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_origin(text) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_origin(text)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_origin(text) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_origin(text)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_origin(text) EXECUTE 가 있다');
SELECT is(has_function_privilege('anon', 'public.dma_journal_orders_for_user(uuid, date)', 'EXECUTE'), false, 'anon 에게 public.dma_journal_orders_for_user(uuid, date) EXECUTE 가 없다');
SELECT is(has_function_privilege('authenticated', 'public.dma_journal_orders_for_user(uuid, date)', 'EXECUTE'), false, 'authenticated 에게 public.dma_journal_orders_for_user(uuid, date) EXECUTE 가 없다');
SELECT is(has_function_privilege('service_role', 'public.dma_journal_orders_for_user(uuid, date)', 'EXECUTE'), true, 'service_role 에게 public.dma_journal_orders_for_user(uuid, date) EXECUTE 가 있다');

-- ── dma_account_orders 정상 행 (lives_ok) ─────────────────────────
SELECT lives_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100001', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  'accepts (order_no 0000100001, reject_seq NULL) — 주문번호 행'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', NULL, 'ep-1', 7, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  'accepts (order_no NULL, ep-1, reject_seq 7) — 로컬 거부 행(D-02)'
);

-- ── 제약 위반 (check_violation 23514 · unique_violation 23505) ─────
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', NULL, NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (order_no NULL, reject_seq NULL) — 키 xor'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100002', 'ep-1', 8, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (order_no 0000100002, ep-1, reject_seq 8) — 키 xor(둘 다 채움)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100003', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'requested', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100003, status requested) — dma_orders 의 요청 상태는 새 모델에 없다'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100004', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'timeout', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100004, status timeout)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100005', NULL, NULL, 'KR7005930003', 'KOSPI', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100005, exchange KOSPI)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100006', NULL, NULL, 'KR7005930003', 'KRX', 'X', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100006, side X)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100007', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'unknown', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100007, origin unknown) — 미상은 NULL'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100008', NULL, NULL, 'KR700', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100008, isin KR700 5자)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100009', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 0, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (0000100009, qty 0)'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', '0000100001', NULL, NULL, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23505', NULL,
  'rejects 중복 (KB, 2026-09-28, 1234567801, 0000100001) — uq_dma_account_orders_order_no'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '9876543201', NULL, 'ep-1', 7, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23505', NULL,
  'rejects 중복 (KB, ep-1, reject_seq 7) — uq_dma_account_orders_reject'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type, qty, price, status, origin, first_seq, last_seq, created_at, updated_at)
    VALUES ('KB', '2026-09-28', '1234567801', NULL, NULL, 9, 'KR7005930003', 'KRX', 'B', 'N', 10, 1000, 'accepted', 'manual', 1, 1, '2026-09-28 09:00:00+09', '2026-09-28 09:00:00+09')$$,
  '23514', NULL,
  'rejects (reject_seq 9, journal_epoch NULL) — dma_account_orders_reject_epoch'
);

-- ── dma_journal_cursor ──────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.dma_journal_cursor (gateway, journal_epoch, last_seq) VALUES ('KB', 'ep-1', -1)$$,
  '23514', NULL,
  'rejects dma_journal_cursor (KB, ep-1, last_seq -1)'
);

SELECT * FROM finish(true);

ROLLBACK;
