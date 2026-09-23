-- ============================================================
-- quick-260923-m23 — `dma_orders.modified_qty` · status 'modified' 회귀.
--
-- 대상 (20260923120000_dma_orders_modified.sql):
--   - `modified_qty integer NOT NULL DEFAULT 0 CHECK (modified_qty >= 0)` — 정정 이동 누적 수량.
--   - status CHECK 8종 = 기존 7종 + 'modified'. 이름은 `dma_orders_status_check` 명시.
--   - 조회로 떨어뜨린 옛 인라인 status CHECK 가 남아 있지 않다(= status 를 참조하는 CHECK 는 정확히 1개).
--     남아 있으면 'modified' insert 가 옛 CHECK 에 걸려 거부된다 — lives_ok 가 그것도 잰다.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_orders_modified.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- FK 충족: 트랜잭션 안에서 `auth.users` 에 고정 uuid 1행을 넣는다(superuser 세션).
-- 단언 설명에는 `(status, modified_qty)` 튜플을 그대로 적는다 — `not ok` 줄만 보고도 어느 행인지
-- 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000923', 'dma-modified@example.invalid');

SELECT plan(15);

-- ── 컬럼 ────────────────────────────────────────────────────────
SELECT has_column('public', 'dma_orders', 'modified_qty', 'dma_orders.modified_qty 컬럼이 있다');
SELECT col_not_null('public', 'dma_orders', 'modified_qty', 'dma_orders.modified_qty 는 NOT NULL 이다');
SELECT col_default_is('public', 'dma_orders', 'modified_qty', '0', 'dma_orders.modified_qty 기본값은 0 이다');

-- ── status 8종 허용 ─────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'requested')$$,
  'accepts (''requested'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'accepted')$$,
  'accepts (''accepted'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'rejected')$$,
  'accepts (''rejected'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status, filled_qty)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'filled', 10)$$,
  'accepts (''filled'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status, filled_qty)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'partially_filled', 3)$$,
  'accepts (''partially_filled'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'cancelled')$$,
  'accepts (''cancelled'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'timeout')$$,
  'accepts (''timeout'', 0)'
);
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status, filled_qty, modified_qty)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 18249, 1000, 'modified', 7432, 10817)$$,
  'accepts (''modified'', 10817) — 정정 이동으로 닫힌 원주문 행'
);

-- ── 거부 2건 (check_violation 23514) ─────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'bogus')$$,
  '23514', NULL,
  'rejects (''bogus'', 0) — 미지 status'
);
SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, qty, price, status, modified_qty)
    VALUES ('00000000-0000-4000-8000-000000000923', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'S', 'N', 10, 1000, 'accepted', -1)$$,
  '23514', NULL,
  'rejects (''accepted'', -1) — 음수 modified_qty'
);

-- ── status CHECK 가 정확히 1개이고 이름이 명시 이름이다 ─────────
SELECT is(
  (SELECT count(*)::int
     FROM pg_constraint
    WHERE conrelid = 'public.dma_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mstatus\M'),
  1,
  'exactly one CHECK on public.dma_orders references status'
);
SELECT is(
  (SELECT conname::text
     FROM pg_constraint
    WHERE conrelid = 'public.dma_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mstatus\M'
    LIMIT 1),
  'dma_orders_status_check',
  'the status CHECK is named dma_orders_status_check'
);

SELECT * FROM finish(true);

ROLLBACK;
