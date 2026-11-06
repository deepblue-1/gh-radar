-- ============================================================
-- Phase 40 Plan 05 — 체결 푸시 판정 RPC `dma_push_claim` pgTAP.
--
-- 잠그는 것:
--   | 절 | 내용                                                                                  | 근거          |
--   |----|---------------------------------------------------------------------------------------|---------------|
--   | 1  | 접수(accepted) → sends 1 · facts.qty 500 · group 1(kind 3 짝) · 기기 1 · 계좌 키 없음    | D-08 · SC-4   |
--   | 2  | 200 체결 → first_fill · filledQty 200 · lastFillPrice 3120                              | SC-1          |
--   | 3  | 150 더(누적 350) → sends 0 (가운데 조각)                                                | SC-1 · D-02   |
--   | 4  | 150 더(누적 500) → filled · avgFillPrice 3120                                           | SC-1          |
--   | 5  | 같은 호출 반복 → sends 0                                                                | SC-2          |
--   | 6  | 접수 없이 곧바로 전량인 새 주문 한 번 호출 → filled 1건                                 | D-09          |
--   | 7  | 로그 4행 outcome sent · 두 체인 sent_rank 3                                             | D-07          |
--   | 8  | EXECUTE (anon, authenticated, service_role) = (f, f, t)                                 | SC-4 · T-19-14|
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 픽스처: 사용자 U1 `00000000-0000-4000-8000-000000004011` · U2 `…4012` · 게이트웨이 'KB120' ·
-- 계좌 '9900004011'(U1) · '9900004012'(U2) · 종목 KR7282720005 금양그린파워 · 날짜 = 오늘 KST(now() 는 트랜잭션
-- 안에서 고정). 주문 행 · E 행 · 전략 행은 표에 직접 INSERT 한다(저널 적용 RPC 를 거치지 않는다 — 판정만 잠근다).
-- 단언 설명에는 (주문번호, 상황, 기대값) 을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(18);

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004011', 'push-claim-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000004012', 'push-claim-u2@example.invalid');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('282720', '금양그린파워', 'KOSDAQ', 'KR7282720005')
ON CONFLICT DO NOTHING;

-- 오늘 KST 의 hh:mi:ss 시각(fixture 전용).
CREATE FUNCTION pg_temp.kst(p_hms text) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (((now() AT TIME ZONE 'Asia/Seoul')::date)::text || ' ' || p_hms || '+09')::timestamptz;
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date;
$$;

CREATE TEMP TABLE t_res (name text PRIMARY KEY, r jsonb) ON COMMIT DROP;

-- U1 iOS 기기 1 (켜짐).
INSERT INTO t_res VALUES ('dev_u1_ios', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004011', '40114011-0000-4000-8000-000000000001', 'ios',
  'ios-token-u1-0000000000000001', 'iPhone'));

-- 주문 0004011: 신규 500 @3120 · KRX · 매수 · 상따 · 접수 상태.
INSERT INTO public.dma_account_orders (
  gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price, filled_qty,
  status, origin, first_seq, last_seq, created_at, updated_at
) VALUES (
  'KB120', pg_temp.today(), '9900004011', '0004011', 'KR7282720005', 'KRX', 'B', 'N', 500, 3120, 0,
  'accepted', 'limit_chaser', 1, 1, pg_temp.kst('09:00:01'), pg_temp.kst('09:00:01')
);

-- 구분 짝: kind 3(매수 발주) group 1(선매수).
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, "group",
                                        exchange, isin, account_no, order_no, price, qty)
VALUES ('KB120', 'ep-40', 1, pg_temp.today(),
        (extract(epoch FROM pg_temp.kst('09:00:00')) * 1000)::bigint, 3, 1,
        'KRX', 'KR7282720005', '9900004011', '0004011', 3120, 500);

-- ── 1절: 접수 ────────────────────────────────────────────────────
INSERT INTO t_res VALUES ('a', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004011'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'a') -> 'sends'), 1,
  '(0004011, 접수) sends 1건');
SELECT is((SELECT r FROM t_res WHERE name = 'a') #>> '{sends,0,stage}', 'accepted',
  '(0004011, 접수) stage = accepted');
SELECT is(((SELECT r FROM t_res WHERE name = 'a') #>> '{sends,0,facts,qty}')::int, 500,
  '(0004011, 접수) facts.qty = 500');
SELECT is(((SELECT r FROM t_res WHERE name = 'a') #>> '{sends,0,facts,group}')::int, 1,
  '(0004011, 접수) facts.group = 1 (kind 3 짝)');
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'a') #> '{sends,0,devices}'), 1,
  '(0004011, 접수) devices 1 (U1 iOS)');
SELECT ok(NOT ((SELECT r FROM t_res WHERE name = 'a') #> '{sends,0,facts}' ?| ARRAY['accountNo', 'account_no'])
          AND NOT ((SELECT r FROM t_res WHERE name = 'a') #> '{sends,0}' ?| ARRAY['accountNo', 'account_no']),
  '(0004011, 접수) facts · send 원소에 accountNo/account_no 키 없음 (SC-4)');

-- ── 2절: 첫 조각 200 ─────────────────────────────────────────────
UPDATE public.dma_account_orders SET filled_qty = 200, status = 'partially_filled', last_seq = 2,
       updated_at = pg_temp.kst('09:00:02')
 WHERE order_no = '0004011';
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side,
                                       order_no, notice_type, exec_price, exec_qty)
VALUES ('KB120', 'ep-40', 2, pg_temp.today(), pg_temp.kst('09:00:02'), '9900004011', 'KR7282720005', 'B',
        '0004011', 'E', 3120, 200);

INSERT INTO t_res VALUES ('b', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004011'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is((SELECT r FROM t_res WHERE name = 'b') #>> '{sends,0,stage}', 'first_fill',
  '(0004011, 200 체결) stage = first_fill');
SELECT is(((SELECT r FROM t_res WHERE name = 'b') #>> '{sends,0,facts,filledQty}')::int, 200,
  '(0004011, 200 체결) filledQty = 200');
SELECT is(((SELECT r FROM t_res WHERE name = 'b') #>> '{sends,0,facts,lastFillPrice}')::int, 3120,
  '(0004011, 200 체결) lastFillPrice = 3120');

-- ── 3절: 가운데 조각 150(누적 350) ───────────────────────────────
UPDATE public.dma_account_orders SET filled_qty = 350, last_seq = 3, updated_at = pg_temp.kst('09:00:03')
 WHERE order_no = '0004011';
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side,
                                       order_no, notice_type, exec_price, exec_qty)
VALUES ('KB120', 'ep-40', 3, pg_temp.today(), pg_temp.kst('09:00:03'), '9900004011', 'KR7282720005', 'B',
        '0004011', 'E', 3120, 150);

INSERT INTO t_res VALUES ('c', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004011'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c') -> 'sends'), 0,
  '(0004011, 누적 350 가운데 조각) sends 0 (SC-1 · D-02)');

-- ── 4절: 마지막 조각 150(누적 500) ───────────────────────────────
UPDATE public.dma_account_orders SET filled_qty = 500, status = 'filled', last_seq = 4,
       updated_at = pg_temp.kst('09:00:04')
 WHERE order_no = '0004011';
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side,
                                       order_no, notice_type, exec_price, exec_qty)
VALUES ('KB120', 'ep-40', 4, pg_temp.today(), pg_temp.kst('09:00:04'), '9900004011', 'KR7282720005', 'B',
        '0004011', 'E', 3120, 150);

INSERT INTO t_res VALUES ('d', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004011'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is((SELECT r FROM t_res WHERE name = 'd') #>> '{sends,0,stage}', 'filled',
  '(0004011, 누적 500) stage = filled');
SELECT is(((SELECT r FROM t_res WHERE name = 'd') #>> '{sends,0,facts,avgFillPrice}')::int, 3120,
  '(0004011, 누적 500) avgFillPrice = 3120');

-- ── 5절: 재생 ────────────────────────────────────────────────────
INSERT INTO t_res VALUES ('e', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004011'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'e') -> 'sends'), 0,
  '(0004011, 같은 호출 반복) sends 0 (SC-2 재생)');

-- ── 6절: 한 묶음 접수→전량 ───────────────────────────────────────
INSERT INTO public.dma_account_orders (
  gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price, filled_qty,
  status, origin, first_seq, last_seq, created_at, updated_at
) VALUES (
  'KB120', pg_temp.today(), '9900004011', '0004012', 'KR7282720005', 'KRX', 'B', 'N', 500, 3120, 500,
  'filled', 'manual', 5, 6, pg_temp.kst('09:01:00'), pg_temp.kst('09:01:01')
);
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side,
                                       order_no, notice_type, exec_price, exec_qty)
VALUES ('KB120', 'ep-40', 6, pg_temp.today(), pg_temp.kst('09:01:01'), '9900004011', 'KR7282720005', 'B',
        '0004012', 'E', 3120, 500);

INSERT INTO t_res VALUES ('f', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004012'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));

SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'f') -> 'sends'), 1,
  '(0004012, 접수 없이 전량) sends 1건 (D-09)');
SELECT is((SELECT r FROM t_res WHERE name = 'f') #>> '{sends,0,stage}', 'filled',
  '(0004012, 접수 없이 전량) stage = filled');

-- ── 7절: 기록 ────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_log
    WHERE gateway = 'KB120' AND account_no = '9900004011' AND chain_key IN ('0004011', '0004012') AND outcome = 'sent'),
  4, '(로그) 0004011 accepted · first_fill · filled + 0004012 filled = 4행 sent');
SELECT is(
  (SELECT array_agg(sent_rank::int ORDER BY chain_key) FROM public.dma_push_chains
    WHERE gateway = 'KB120' AND account_no = '9900004011' AND chain_key IN ('0004011', '0004012')),
  ARRAY[3, 3], '(체인) 0004011 · 0004012 sent_rank = 3');

-- ── 8절: 권한 ────────────────────────────────────────────────────
SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean)', 'EXECUTE')
  ],
  ARRAY[false, false, true],
  'dma_push_claim EXECUTE (anon, authenticated, service_role) = (f, f, t)');

SELECT * FROM finish();

ROLLBACK;
