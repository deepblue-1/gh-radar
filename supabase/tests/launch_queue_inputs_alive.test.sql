-- ============================================================
-- quick 261106-p8h — launch_queue_inputs 의 alive(우리 주문로그 상태) pgTAP.
--
-- 대상: 20261106400000_launch_queue_inputs_alive.sql(launch_queue_inputs 교체 — 행마다 'alive').
--
-- 잠그는 것:
--   - alive = dma_account_orders 의 (gateway, trade_date, account_no = 조각 account, order_no) 한 행 상태 —
--     accepted · partially_filled · filled → true · cancelled · modified · rejected → false ·
--     행 없음 · order_no NULL/'' · 조각 account NULL · 다른 계좌 · 다른 게이트웨이 · 다른 날짜 → null
--   - 모든 행에 alive 키가 있다(null 이어도 키는 실린다)
--   - 권한: anon · authenticated EXECUTE 없음 · service_role 있음 · SECURITY INVOKER · COMMENT 에 alive
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_queue_inputs_alive.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 픽스처 날짜 2026-11-05 · 계좌 문자열은 가짜(LQA-ACC1 · LQA-ACC2).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(6);

-- ── 픽스처: 조각(KYOBO119 · Q16 · 매수 5380 × 4000 · wire 0..12) ──────────────
INSERT INTO public.launch_pieces
  (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, side, order_no, sent_rel_us, result,
   isin, price, qty, account, source)
SELECT '2026-11-05', 'KYOBO119', 'Q16', 'KRX', '16:00:00', 'Q', w, 'buy',
       CASE w WHEN 7 THEN NULL WHEN 12 THEN '' ELSE 'LQA-' || w END,
       -300, '접수', 'KR7004831004', 5380, 4000,
       CASE w WHEN 8 THEN NULL ELSE 'LQA-ACC1' END, 'backfill'
  FROM generate_series(0, 12) w;

-- ── 픽스처: 주문로그 ───────────────────────────────────────────────
-- w0..w5 = 같은 키 · 상태 6종 · w6 · w7 · w12 = 행 없음 · w8 = 조각 account NULL(주문로그는 LQA-ACC1) ·
-- w9 = 다른 계좌에만 · w10 = 다른 게이트웨이에만 · w11 = 다른 날짜에만.
INSERT INTO public.dma_account_orders
  (gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price, status, first_seq, last_seq,
   created_at, updated_at)
VALUES
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-0',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'accepted',         1,  1,  '2026-11-05 16:00:00+09', '2026-11-05 16:00:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-1',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'partially_filled', 2,  2,  '2026-11-05 16:00:00+09', '2026-11-05 17:41:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-2',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'filled',           3,  3,  '2026-11-05 16:00:00+09', '2026-11-05 17:41:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-3',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'cancelled',        4,  4,  '2026-11-05 16:00:00+09', '2026-11-05 16:10:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-4',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'modified',         5,  5,  '2026-11-05 16:00:00+09', '2026-11-05 16:10:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-5',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'rejected',         6,  6,  '2026-11-05 16:00:00+09', '2026-11-05 16:00:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC1', 'LQA-8',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'accepted',         7,  7,  '2026-11-05 16:00:00+09', '2026-11-05 16:00:00+09'),
  ('KYOBO119', '2026-11-05', 'LQA-ACC2', 'LQA-9',  'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'accepted',         8,  8,  '2026-11-05 16:00:00+09', '2026-11-05 16:00:00+09'),
  ('KB120',    '2026-11-05', 'LQA-ACC1', 'LQA-10', 'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'accepted',         9,  9,  '2026-11-05 16:00:00+09', '2026-11-05 16:00:00+09'),
  ('KYOBO119', '2026-11-04', 'LQA-ACC1', 'LQA-11', 'KR7004831004', 'KRX', 'B', 'N', 4000, 5380, 'accepted',         10, 10, '2026-11-04 16:00:00+09', '2026-11-04 16:00:00+09');

-- ── alive 매핑 ────────────────────────────────────────────────────
SELECT is((SELECT jsonb_object_agg(e->>'wire', e->'alive')
             FROM jsonb_array_elements(public.launch_queue_inputs('20261105')) e),
          '{"0": true, "1": true, "2": true, "3": false, "4": false, "5": false, "6": null, "7": null, "8": null,
            "9": null, "10": null, "11": null, "12": null}'::jsonb,
          'alive — accepted · partially_filled · filled → true · cancelled · modified · rejected → false · 행 없음 · order_no NULL/'''' · 조각 account NULL · 다른 계좌 · 게이트웨이 · 날짜 → null');
SELECT ok((SELECT bool_and(e ? 'alive') AND count(*) = 13
             FROM jsonb_array_elements(public.launch_queue_inputs('20261105')) e),
          'alive 키 — 13행 모두에 실린다(null 이어도)');

-- ── 권한 ─────────────────────────────────────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.launch_queue_inputs(text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.launch_queue_inputs(text)', 'EXECUTE'),
          '권한 — anon · authenticated EXECUTE 불가');
SELECT ok(has_function_privilege('service_role', 'public.launch_queue_inputs(text)', 'EXECUTE'),
          '권한 — service_role EXECUTE 가능');
SELECT ok((SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.launch_queue_inputs(text)'::regprocedure),
          'SECURITY INVOKER 유지');
SELECT ok(obj_description('public.launch_queue_inputs(text)'::regprocedure, 'pg_proc') LIKE '%alive%',
          'COMMENT 에 alive 언급');

SELECT * FROM finish();
ROLLBACK;
