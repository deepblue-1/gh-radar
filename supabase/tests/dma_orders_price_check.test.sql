-- ============================================================
-- Phase 18 Plan 24 — GC-CR-01 회귀: `dma_orders_price_check` 가 NULL 을 통과시키지 않는다.
--
-- 대상 규칙 (D-21 · D-23): 가격 0 은 두 갈래로만 열린다 — 취소('C', 원주문 가격 사본) ·
-- 시간외종가 신규('N' + krx_session G2/G3). 세션 없는 가격 0 신규·가격 0 정정은 거부.
-- 음수는 종류·세션과 무관하게 거부. 양수 신규·정정은 통과.
--
-- 함정: Postgres 는 CHECK 식이 NULL 이면 **통과**로 본다. `krx_session IN ('G2','G3')` 는
-- krx_session 이 NULL 일 때 NULL 이고, 그 NULL 이 OR/AND 를 타고 식 전체로 번지면 행이 들어간다.
-- 이 회귀의 거부 단언 3건 `(0,'N',NULL)` · `(0,'M',NULL)` · `(0,'M','G2')` 가 그 구멍을 잰다.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh` — 일회용 로컬 컨테이너에 저장소 마이그레이션을
-- 재생한 뒤에만 돈다(공유·원격 DB 접촉 0). 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- FK 충족: 트랜잭션 안에서 `auth.users` 에 고정 uuid 1행을 넣는다(superuser 세션). CHECK 는
-- 트리거가 아니므로 어떤 세션 설정과도 무관하게 강제된다.
-- 단언 설명에는 `(price, order_type, krx_session)` 튜플을 그대로 적는다 — `not ok` 줄만 보고도
-- 어느 행인지 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000024', 'dma-price-check@example.invalid');

SELECT plan(12);

-- ── 거부 6건 (check_violation 23514) ─────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, 0, NULL)$$,
  '23514', NULL,
  'rejects (0,''N'',NULL) — 세션 없는 가격 0 신규'
);

SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'M', '0000000001', 1, 0, NULL)$$,
  '23514', NULL,
  'rejects (0,''M'',NULL) — 가격 0 정정'
);

SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'M', '0000000001', 1, 0, 'G2')$$,
  '23514', NULL,
  'rejects (0,''M'',''G2'') — 세션 실린 가격 0 정정'
);

SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, -1, NULL)$$,
  '23514', NULL,
  'rejects (-1,''N'',NULL) — 음수 신규'
);

SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'C', '0000000001', 1, -1, NULL)$$,
  '23514', NULL,
  'rejects (-1,''C'',NULL) — 음수 취소'
);

SELECT throws_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, -1, 'G2')$$,
  '23514', NULL,
  'rejects (-1,''N'',''G2'') — 세션 실린 음수 신규'
);

-- ── 통과 5건 ───────────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'C', '0000000001', 1, 0, NULL)$$,
  'accepts (0,''C'',NULL) — 시간외종가 원주문(가격 0) 취소'
);

SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, 0, 'G2')$$,
  'accepts (0,''N'',''G2'') — 장개시전 시간외종가 신규'
);

SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, 0, 'G3')$$,
  'accepts (0,''N'',''G3'') — 장종료후 시간외종가 신규'
);

SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'N', NULL, 1, 70000, NULL)$$,
  'accepts (70000,''N'',NULL) — 양수 신규'
);

SELECT lives_ok(
  $$INSERT INTO public.dma_orders (user_id, account_no, isin, exchange, market, side, order_type, org_order_no, qty, price, krx_session)
    VALUES ('00000000-0000-4000-8000-000000000024', 'ACCT-TEST', 'KR7005930003', 'KRX', 'K', 'B', 'M', '0000000001', 1, 70000, NULL)$$,
  'accepts (70000,''M'',NULL) — 양수 정정'
);

-- ── 구조 1건: price 를 참조하는 CHECK 는 정확히 1개 (겹쳐 걸린 상태를 잡는다) ──
SELECT is(
  (SELECT count(*)::int
     FROM pg_constraint
    WHERE conrelid = 'public.dma_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mprice\M'),
  1,
  'exactly one CHECK on public.dma_orders references price'
);

SELECT * FROM finish(true);

ROLLBACK;
