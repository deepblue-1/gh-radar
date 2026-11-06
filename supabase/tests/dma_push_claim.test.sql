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
--   | 9  | 정정 체인: 정정 행 accepted 는 0 · 원주문 300 → first_fill · 정정 200 → filled · 키 = 루트 | D-10          |
--   | 10 | 거부: 신규 rejected · message 원문 · kind 8 group / 로컬 거부 키 R:ep:seq · 3초 짝 /       | D-04 · D-08 · |
--   |    | 정정 · 취소 요청 거부 행은 판정 대상 아님                                               | D-02          |
--   | 11 | 서버 취소: C 행 requester '' + kind 7 사유 3 → cancelled · 잔량 300 · 같은 체인 1건       | D-04          |
--   | 12 | 거래소 자기 취소(C 행 · kind 7 없음) → cancelReason 5 · 대기 없음                         | D-04          |
--   | 13 | 수동 취소(requester Manual · kind 7 사유 1) → sends 0 · suppressed 기록                   | D-02          |
--   | 14 | 어제 거래일 → stale 기록 · 뒤 재호출도 0                                                  | D-11          |
--   | 15 | 구분 짝 대기: 상따 · kind 3 없음 · false → deferred(기록 0) → 늦은 짝 반영 / true → null /  | D-03          |
--   |    | manual 은 대기 없음                                                                     |               |
--   | 16 | 취소 사유 대기: kind 7 없음 · false → deferred / true → cancelReason null                 | D-04          |
--   | 17 | 자동매도 주문(group 9) 접수 · 전량 · 서버 취소 → sends 0 · suppressed                     | D-22 · D-02   |
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

SELECT plan(67);

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

-- 주문 투영 행 1개(fixture 전용 — 9절 이후). 계좌 '9900004011' · 종목 금양그린파워 · KRX.
CREATE PROCEDURE pg_temp.ord(
  p_order_no text, p_type text, p_org text, p_qty integer, p_price integer, p_filled integer, p_status text,
  p_origin text, p_side text, p_hms text, p_requester text DEFAULT NULL, p_date date DEFAULT NULL,
  p_message text DEFAULT NULL
) LANGUAGE sql AS $$
  INSERT INTO public.dma_account_orders (
    gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, org_order_no, qty, price,
    filled_qty, status, origin, requester, message, first_seq, last_seq, created_at, updated_at
  ) VALUES (
    'KB120', coalesce(p_date, pg_temp.today()), '9900004011', p_order_no, 'KR7282720005', 'KRX', p_side, p_type,
    p_org, p_qty, p_price, p_filled, p_status, p_origin, p_requester, p_message, 1, 1,
    pg_temp.kst(p_hms), pg_temp.kst(p_hms)
  );
$$;

-- 체결(E) 원문 1개(fixture 전용).
CREATE PROCEDURE pg_temp.fill(p_seq bigint, p_order_no text, p_qty integer, p_price integer, p_hms text,
                             p_side text DEFAULT 'B', p_avg bigint DEFAULT 0, p_pnl bigint DEFAULT 0)
LANGUAGE sql AS $$
  INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side,
                                         order_no, notice_type, exec_price, exec_qty, avg_price, realized_pnl_krw)
  VALUES ('KB120', 'ep-40', p_seq, pg_temp.today(), pg_temp.kst(p_hms), '9900004011', 'KR7282720005', p_side,
          p_order_no, 'E', p_price, p_qty, p_avg, p_pnl);
$$;

-- 전략 이벤트 1개(fixture 전용). kind 3/6 구분 · 7 취소 사유 · 8 거부.
CREATE PROCEDURE pg_temp.sev(p_seq bigint, p_kind smallint, p_group smallint, p_order_no text, p_hms text,
                            p_cancel_reason smallint DEFAULT 0, p_result_code integer DEFAULT 0)
LANGUAGE sql AS $$
  INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, "group",
                                          exchange, isin, account_no, order_no, cancel_reason, result_code)
  VALUES ('KB120', 'ep-40', p_seq, pg_temp.today(), (extract(epoch FROM pg_temp.kst(p_hms)) * 1000)::bigint,
          p_kind, p_group, 'KRX', 'KR7282720005', '9900004011', p_order_no, p_cancel_reason, p_result_code);
$$;

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

-- ════════════════════════════════════════════════════════════════
-- Task 2 — 정정 체인 · 거부 · 취소 · 당일 밖 · 짝 대기 · 자동매도 주문 억제
-- (주문번호 '00040NN' 대역 · 절마다 겹치지 않음 · 받는 사람은 계좌 9900004011 → U1)
-- ════════════════════════════════════════════════════════════════

-- ── 9절: 정정 체인(D-10) ────────────────────────────────────────
CALL pg_temp.ord('0004021', 'N', NULL, 500, 3120, 0, 'accepted', 'manual', 'B', '09:10:00');
INSERT INTO t_res VALUES ('m1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004021'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'm1') #>> '{sends,0,stage}', 'accepted',
  '(0004021, 원주문 접수) stage = accepted');

-- 정정확인: 새 번호 0004022(org 0004021 · 200 이동) · 원주문 modified_qty 200.
CALL pg_temp.ord('0004022', 'M', '0004021', 200, 3100, 0, 'accepted', 'manual', 'B', '09:10:05');
UPDATE public.dma_account_orders SET modified_qty = 200 WHERE order_no = '0004021';
INSERT INTO t_res VALUES ('m2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004021', '0004022')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'm2') -> 'sends'), 0,
  '(0004022, 정정 행 accepted) sends 0 — 정정은 접수를 다시 울리지 않는다(D-10)');

-- 원주문 잔량 300 체결.
UPDATE public.dma_account_orders SET filled_qty = 300, status = 'filled' WHERE order_no = '0004021';
CALL pg_temp.fill(101, '0004021', 300, 3120, '09:10:10');
INSERT INTO t_res VALUES ('m3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004021'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'm3') #>> '{sends,0,stage}', 'first_fill',
  '(0004021, 원주문 300 체결 · 체인 Σ 300 < 500) stage = first_fill');

-- 정정 행 200 체결 → 체인 Σ 500 = 루트 수량.
UPDATE public.dma_account_orders SET filled_qty = 200, status = 'filled' WHERE order_no = '0004022';
CALL pg_temp.fill(102, '0004022', 200, 3100, '09:10:20');
INSERT INTO t_res VALUES ('m4', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004022'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'm4') #>> '{sends,0,stage}', 'filled',
  '(0004022 트리거, 체인 Σ 500) stage = filled');
SELECT is((SELECT r FROM t_res WHERE name = 'm4') #>> '{sends,0,chain_key}', '0004021',
  '(0004022 트리거) chain_key = 루트 0004021');
SELECT is(((SELECT r FROM t_res WHERE name = 'm4') #>> '{sends,0,facts,filledQty}')::int, 500,
  '(0004021 체인) filledQty = 500 (원주문 300 + 정정 200)');
SELECT is(((SELECT r FROM t_res WHERE name = 'm4') #>> '{sends,0,facts,avgFillPrice}')::int, 3112,
  '(0004021 체인) avgFillPrice = (300×3120 + 200×3100)/500 = 3112');
SELECT is((SELECT count(*)::int FROM public.dma_push_chains WHERE chain_key IN ('0004021', '0004022')), 1,
  '(0004021 체인) 체인 행 1개 — 정정 번호로 따로 세지 않는다');

-- ── 10절: 거부(D-04 · D-08) ─────────────────────────────────────
CALL pg_temp.ord('0004031', 'N', NULL, 100, 3000, 0, 'rejected', 'limit_chaser', 'B', '09:20:00',
                 p_message => '주문가능금액 부족');
CALL pg_temp.sev(103, 8::smallint, 2::smallint, '0004031', '09:20:00', p_result_code => 7001);
INSERT INTO t_res VALUES ('r1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004031'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'r1') #>> '{sends,0,stage}', 'rejected',
  '(0004031, 신규 거부) stage = rejected (접수 없이 거부 1건)');
SELECT is((SELECT r FROM t_res WHERE name = 'r1') #>> '{sends,0,facts,message}', '주문가능금액 부족',
  '(0004031, 신규 거부) facts.message = 게이트웨이 원문');
SELECT is(((SELECT r FROM t_res WHERE name = 'r1') #>> '{sends,0,facts,group}')::int, 2,
  '(0004031, 신규 거부) group = 2 (kind 8 짝 by 주문번호)');

-- 로컬 거부(주문번호 없음 · reject_seq 7) + kind 8(계좌 · isin · result_code · 1초 뒤).
INSERT INTO public.dma_account_orders (
  gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type,
  qty, price, status, result_code, message, origin, first_seq, last_seq, created_at, updated_at
) VALUES (
  'KB120', pg_temp.today(), '9900004011', NULL, 'ep-40', 7, 'KR7282720005', 'KRX', 'B', 'N',
  100, 3000, 'rejected', 7002, '호가 범위 밖', 'limit_chaser', 7, 7, pg_temp.kst('09:21:00'), pg_temp.kst('09:21:00')
);
CALL pg_temp.sev(104, 8::smallint, 2::smallint, '', '09:21:01', p_result_code => 7002);
INSERT INTO t_res VALUES ('r2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE reject_seq = 7 AND journal_epoch = 'ep-40'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'r2') #>> '{sends,0,chain_key}', 'R:ep-40:7',
  '(로컬 거부 reject_seq 7) chain_key = R:ep-40:7');
SELECT is((SELECT r FROM t_res WHERE name = 'r2') #>> '{sends,0,stage}', 'rejected',
  '(로컬 거부 reject_seq 7) stage = rejected');
SELECT is(((SELECT r FROM t_res WHERE name = 'r2') #>> '{sends,0,facts,group}')::int, 2,
  '(로컬 거부 reject_seq 7) group = 2 (kind 8 · 계좌 · isin · result_code · 3초 안)');

-- 정정/취소 요청 거부(M/C rejected)는 판정 대상이 아니다 — 원주문 0004032 는 부분 체결 상태로 살아 있다.
CALL pg_temp.ord('0004032', 'N', NULL, 300, 3000, 100, 'partially_filled', 'manual', 'B', '09:22:00');
CALL pg_temp.fill(105, '0004032', 100, 3000, '09:22:01');
CALL pg_temp.ord('0004033', 'M', '0004032', 200, 2990, 0, 'rejected', 'manual', 'B', '09:22:05');
INSERT INTO public.dma_account_orders (
  gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, side, order_type,
  org_order_no, qty, price, status, origin, first_seq, last_seq, created_at, updated_at
) VALUES (
  'KB120', pg_temp.today(), '9900004011', NULL, 'ep-40', 8, 'KR7282720005', 'KRX', 'B', 'C',
  '0004032', NULL, 0, 'rejected', 'manual', 8, 8, pg_temp.kst('09:22:06'), pg_temp.kst('09:22:06')
);
INSERT INTO t_res VALUES ('r3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders
         WHERE order_no = '0004033' OR (reject_seq = 8 AND journal_epoch = 'ep-40')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'r3') -> 'sends'), 0,
  '(0004033 정정 거부 · reject_seq 8 취소 거부) sends 0 (D-02)');
SELECT is((SELECT count(*)::int FROM public.dma_push_chains
            WHERE chain_key IN ('0004032', '0004033', 'R:ep-40:8')), 0,
  '(0004032 체인) 요청 거부로는 체인 행이 생기지 않는다');

-- ── 11절: 서버 취소(D-04 · 부분 체결 뒤 잔량) ───────────────────
CALL pg_temp.ord('0004041', 'N', NULL, 500, 3120, 200, 'cancelled', 'manual', 'B', '09:30:00');
CALL pg_temp.fill(106, '0004041', 200, 3120, '09:30:01');
CALL pg_temp.ord('0004042', 'C', '0004041', 300, 0, 0, 'cancelled', 'manual', 'B', '09:30:05', p_requester => '');
CALL pg_temp.sev(107, 7::smallint, 7::smallint, '0004041', '09:30:05', p_cancel_reason => 3::smallint);
INSERT INTO t_res VALUES ('x1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004041', '0004042')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'x1') -> 'sends'), 1,
  '(0004041, 서버 취소 · 원주문 + C 행 둘 다 후보) sends 1건 — 같은 체인은 한 번만');
SELECT is((SELECT r FROM t_res WHERE name = 'x1') #>> '{sends,0,stage}', 'cancelled',
  '(0004041, 서버 취소) stage = cancelled');
SELECT is(((SELECT r FROM t_res WHERE name = 'x1') #>> '{sends,0,facts,cancelReason}')::int, 3,
  '(0004041, 서버 취소) cancelReason = 3 (kind 7)');
SELECT is(((SELECT r FROM t_res WHERE name = 'x1') #>> '{sends,0,facts,cancelledQty}')::int, 300,
  '(0004041, 서버 취소) cancelledQty = 500 − 200 = 300');
SELECT is(((SELECT r FROM t_res WHERE name = 'x1') #>> '{sends,0,facts,price}')::int, 3120,
  '(0004041, 서버 취소) price = 마지막 살아 있던 구성원 가격 3120');

-- ── 12절: 거래소 자기 취소(C 행 없음 · kind 7 없음) ─────────────
CALL pg_temp.ord('0004051', 'N', NULL, 300, 3000, 0, 'cancelled', 'limit_chaser', 'B', '09:31:00');
CALL pg_temp.sev(114, 3::smallint, 1::smallint, '0004051', '09:31:00');
INSERT INTO t_res VALUES ('x2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004051'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'x2') #>> '{sends,0,stage}', 'cancelled',
  '(0004051, 거래소 자기 취소) stage = cancelled (fallback false 여도 대기 없음)');
SELECT is(((SELECT r FROM t_res WHERE name = 'x2') #>> '{sends,0,facts,cancelReason}')::int, 5,
  '(0004051, 거래소 자기 취소 · kind 7 없음) cancelReason = 5 「거래소 취소」');

-- ── 13절: 수동 취소 → suppressed ────────────────────────────────
CALL pg_temp.ord('0004061', 'N', NULL, 100, 3000, 0, 'cancelled', 'manual', 'B', '09:32:00');
CALL pg_temp.ord('0004062', 'C', '0004061', 100, 0, 0, 'cancelled', 'manual', 'B', '09:32:05', p_requester => 'Manual');
INSERT INTO t_res VALUES ('x3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004061', '0004062')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'x3') -> 'sends'), 0,
  '(0004061, C 행 requester Manual) sends 0');
SELECT is((SELECT sent_stage FROM public.dma_push_chains WHERE chain_key = '0004061'), 'suppressed',
  '(0004061, 수동 취소) 체인 sent_stage = suppressed');
SELECT is((SELECT outcome FROM public.dma_push_log WHERE chain_key = '0004061' AND stage = 'cancelled'), 'suppressed',
  '(0004061, 수동 취소) 로그 outcome = suppressed');

CALL pg_temp.ord('0004071', 'N', NULL, 100, 3000, 0, 'cancelled', 'manual', 'B', '09:33:00');
CALL pg_temp.ord('0004072', 'C', '0004071', 100, 0, 0, 'cancelled', 'manual', 'B', '09:33:05', p_requester => '');
CALL pg_temp.sev(108, 7::smallint, 7::smallint, '0004071', '09:33:05', p_cancel_reason => 1::smallint);
INSERT INTO t_res VALUES ('x4', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004071', '0004072')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'x4') -> 'sends'), 0,
  '(0004071, kind 7 cancel_reason 1) sends 0');
SELECT is((SELECT sent_stage FROM public.dma_push_chains WHERE chain_key = '0004071'), 'suppressed',
  '(0004071, kind 7 사유 1 = 수동) 체인 sent_stage = suppressed');

-- ── 14절: 당일 밖(D-11) ─────────────────────────────────────────
CALL pg_temp.ord('0004081', 'N', NULL, 100, 3000, 0, 'accepted', 'manual', 'B', '09:34:00',
                 p_date => pg_temp.today() - 1);
INSERT INTO t_res VALUES ('s1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004081'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 's1') -> 'sends'), 0,
  '(0004081, 어제 거래일) sends 0');
SELECT is((SELECT outcome FROM public.dma_push_log WHERE chain_key = '0004081'), 'stale',
  '(0004081, 어제 거래일) 로그 outcome = stale');
SELECT is((SELECT sent_stage FROM public.dma_push_chains WHERE chain_key = '0004081'), 'stale',
  '(0004081, 어제 거래일) 체인 sent_stage = stale');
UPDATE public.dma_account_orders SET filled_qty = 100, status = 'filled' WHERE order_no = '0004081';
INSERT INTO t_res VALUES ('s2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004081'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 's2') -> 'sends'), 0,
  '(0004081, 어제 거래일 · 뒤에 전량) 재호출도 sends 0 (stale 체인이 막는다)');

-- ── 15절: 구분 짝 대기(D-03 · Pitfall 3) ────────────────────────
CALL pg_temp.ord('0004091', 'N', NULL, 100, 3000, 0, 'accepted', 'limit_chaser', 'B', '09:40:00');
INSERT INTO t_res VALUES ('g1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004091'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'g1') -> 'sends'), 0,
  '(0004091, 상따 · kind 3 없음 · fallback false) sends 0');
SELECT ok(coalesce((SELECT r FROM t_res WHERE name = 'g1') -> 'deferred'
                   ? (SELECT id::text FROM public.dma_account_orders WHERE order_no = '0004091'), false),
  '(0004091, 짝 없음) deferred 에 그 id');
SELECT is((SELECT count(*)::int FROM public.dma_push_chains WHERE chain_key = '0004091')
        + (SELECT count(*)::int FROM public.dma_push_log WHERE chain_key = '0004091'), 0,
  '(0004091, deferred) 체인 · 로그 0행 — 대기 항목은 아무 표에도 쓰지 않는다');

CALL pg_temp.sev(109, 3::smallint, 2::smallint, '0004091', '09:40:00');
INSERT INTO t_res VALUES ('g2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004091'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is((SELECT r FROM t_res WHERE name = 'g2') #>> '{sends,0,stage}', 'accepted',
  '(0004091, 늦은 kind 3 도착 뒤 false 재호출) stage = accepted');
SELECT is(((SELECT r FROM t_res WHERE name = 'g2') #>> '{sends,0,facts,group}')::int, 2,
  '(0004091, 늦은 kind 3) group = 2');

CALL pg_temp.ord('0004092', 'N', NULL, 100, 3000, 0, 'accepted', 'limit_chaser', 'B', '09:41:00');
INSERT INTO t_res VALUES ('g3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004092'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', true));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'g3') -> 'sends'), 1,
  '(0004092, 상따 · kind 3 없음 · fallback true) sends 1');
SELECT is((SELECT r FROM t_res WHERE name = 'g3') #> '{sends,0,facts,group}', 'null'::jsonb,
  '(0004092, fallback true) group = null (문안이 origin 폴백)');

CALL pg_temp.ord('0004093', 'N', NULL, 100, 3000, 0, 'accepted', 'manual', 'B', '09:42:00');
INSERT INTO t_res VALUES ('g4', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004093'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'g4') -> 'sends'), 1,
  '(0004093, origin manual · kind 3 없음 · fallback false) 기다리지 않고 sends 1');
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'g4') -> 'deferred'), 0,
  '(0004093, origin manual) deferred 0');

-- ── 16절: 취소 사유 대기 ────────────────────────────────────────
CALL pg_temp.ord('0004101', 'N', NULL, 300, 3000, 0, 'cancelled', 'manual', 'B', '09:43:00');
CALL pg_temp.ord('0004102', 'C', '0004101', 300, 0, 0, 'cancelled', 'manual', 'B', '09:43:05', p_requester => '');
INSERT INTO t_res VALUES ('w1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004101', '0004102')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT ok(jsonb_array_length((SELECT r FROM t_res WHERE name = 'w1') -> 'sends') = 0
          AND coalesce((SELECT r FROM t_res WHERE name = 'w1') -> 'deferred'
                       ? (SELECT id::text FROM public.dma_account_orders WHERE order_no = '0004102'), false),
  '(0004101, 서버 취소 · kind 7 아직 없음 · false) sends 0 · deferred 에 후보 id');
INSERT INTO t_res VALUES ('w2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004101', '0004102')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', true));
SELECT is((SELECT r FROM t_res WHERE name = 'w2') #>> '{sends,0,stage}', 'cancelled',
  '(0004101, true 재호출) stage = cancelled');
SELECT is((SELECT r FROM t_res WHERE name = 'w2') #> '{sends,0,facts,cancelReason}', 'null'::jsonb,
  '(0004101, true 재호출) cancelReason = null (사유 없이 「잔량 N주 취소」)');

-- ── 17절: 자동매도 주문 억제(D-22 · group 9) ────────────────────
CALL pg_temp.ord('0004111', 'N', NULL, 100, 3200, 0, 'accepted', 'limit_chaser', 'S', '09:50:00');
CALL pg_temp.sev(110, 6::smallint, 9::smallint, '0004111', '09:50:00');
INSERT INTO t_res VALUES ('a1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004111'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'a1') -> 'sends'), 0,
  '(0004111, group 9 접수) sends 0');
SELECT is((SELECT outcome FROM public.dma_push_log WHERE chain_key = '0004111'), 'suppressed',
  '(0004111, group 9 접수) 로그 outcome = suppressed');
UPDATE public.dma_account_orders SET filled_qty = 100, status = 'filled' WHERE order_no = '0004111';
CALL pg_temp.fill(111, '0004111', 100, 3200, '09:50:03', 'S');
INSERT INTO t_res VALUES ('a2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004111'),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'a2') -> 'sends'), 0,
  '(0004111, group 9 전량) sends 0');

CALL pg_temp.ord('0004112', 'N', NULL, 100, 3200, 0, 'cancelled', 'limit_chaser', 'S', '09:51:00');
CALL pg_temp.ord('0004113', 'C', '0004112', 100, 0, 0, 'cancelled', 'limit_chaser', 'S', '09:51:05', p_requester => '');
CALL pg_temp.sev(112, 6::smallint, 9::smallint, '0004112', '09:51:00');
CALL pg_temp.sev(113, 7::smallint, 9::smallint, '0004112', '09:51:05', p_cancel_reason => 3::smallint);
INSERT INTO t_res VALUES ('a3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no IN ('0004112', '0004113')),
  '[]'::jsonb, '{"9900004011": ["00000000-0000-4000-8000-000000004011"]}'::jsonb, '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'a3') -> 'sends'), 0,
  '(0004112, group 9 서버 취소) sends 0');
SELECT is((SELECT outcome FROM public.dma_push_log WHERE chain_key = '0004112'), 'suppressed',
  '(0004112, group 9 서버 취소) 로그 outcome = suppressed');

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
