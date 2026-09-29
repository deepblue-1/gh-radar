-- ============================================================
-- Phase 25 Plan 03 — 조회 RPC 2(dma_strategy_events_for_user · dma_order_events_for_user) pgTAP.
--
-- 두 경로:
--   ① 하루치 평면 목록 — 작업대 「주문로그」 탭 복원 · 창 분리 날짜 이동(GET /api/strategy-events).
--      주문 이벤트는 dma_account_access 계좌 조인, 시세 이벤트(kind 1·2)는 그 게이트웨이 매핑 보유 사용자 전원.
--   ② 주문 1건 이벤트 — 오늘 주문 행 펼침(GET /api/orders/:id/events). 통보(dma_journal_events) + 전략
--      (dma_strategy_events) UNION ALL · 게이트웨이 · 거래일 · 계좌는 :id 행에서 읽는다.
--
-- 잠그는 것:
--   - 가시성 매트릭스: 계좌 · 시세 공개 · 다른 게이트웨이 시세 비공개 · 계좌 빈 주문 이벤트(형식 이상) 비공개 ·
--     매핑 없음 0행 · 남의 행 id 0행 · 다른 계좌 같은 주문번호 제외(T-25-12 · T-25-13 · T-25-14)
--   - 순서: gw_time_ms → 같은 ms 는 통보 먼저 → seq (D-01 · Pitfall 9)
--   - 원주문번호 일치로 취소 확인 줄 포함 · 포이즌(apply_error) 제외 (Open Q3)
--   - 공개 컬럼: dma_user_id · apply_error · applied_at 없음 · 전략 ev 키 = 공개 45키 (T-19-08 · T-25-16)
--   - p_order_nos 가 빈 배열 · NULL 이면 행 자신의 주문번호로 대체
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능 (Pitfall 13)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (사용자, 게이트웨이, 계좌 말미, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자: U1 dma-shared → KB …7801 · U2 dma-other → KB …7802 · U3 매핑 없음 · U4 dma-kyobo(KYOBO 연결) → KYOBO …7803.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처: 사용자 · 자격증명 · 종목 · 계좌 매핑 ──────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002501', 'read-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000002502', 'read-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000002503', 'read-u3@example.invalid'),
  ('00000000-0000-4000-8000-000000002504', 'read-u4@example.invalid');

INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000002501', 'dma-shared', 'test-enc-u1'),
  ('00000000-0000-4000-8000-000000002502', 'dma-other',  'test-enc-u2'),
  ('00000000-0000-4000-8000-000000002503', 'dma-none',   'test-enc-u3'),
  ('00000000-0000-4000-8000-000000002504', 'dma-kyobo',  'test-enc-u4');
-- quick-260929-sas — 추가 게이트웨이 가시성은 명시 연결로만.
INSERT INTO public.dma_gateway_identities (user_id, gateway, dma_user_id) VALUES ('00000000-0000-4000-8000-000000002504', 'KYOBO', 'dma-kyobo');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

INSERT INTO t_setup SELECT 'access_kb', to_jsonb(public.dma_journal_sync_access('KB', '[
  {"dma_user_id":"dma-shared","account_no":"1234567801","name":"위탁","priority":1},
  {"dma_user_id":"dma-other","account_no":"1234567802","name":"위탁","priority":1}
]'::jsonb));
INSERT INTO t_setup SELECT 'access_kyobo', to_jsonb(public.dma_journal_sync_access('KYOBO', '[
  {"dma_user_id":"dma-kyobo","account_no":"1234567803","name":"위탁","priority":1}
]'::jsonb));

-- 전략 이벤트 1건 — relay STRATEGY_APPLY_KEYS 43키(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
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

-- 주문 통보 1건 — relay 주문 기록기 23키(접수 A 기본값) 위에 p_over 를 덮는다.
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

-- KB 전략 이벤트 (seq 1~6 · epoch ep-25).
INSERT INTO t_setup SELECT 'strategy_kb', public.dma_strategy_apply('KB', 'ep-25', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:42:13.215', '{"ask_qty_at_limit":185400}'::jsonb),            -- 시세 LimitExposed
  pg_temp.sev(2, 3, 1, '1234567801', '12451', '09:45:02.861', '{"price":12350,"qty":300}'::jsonb), -- …7801 BuyOrder
  pg_temp.sev(3, 4, 1, '1234567802', '22001', '09:46:00.000'),                                    -- …7802 Queued
  pg_temp.sev(4, 3, 1, '', '12999', '09:47:00.000'),                                              -- 형식 이상(계좌 '') 주문 이벤트
  pg_temp.sev(5, 3, 1, '1234567801', '11111', '14:00:00.000', '{}'::jsonb, '2026-09-28'),         -- …7801 어제
  pg_temp.sev(6, 4, 1, '1234567801', '12451', '09:45:02.880', '{"qty":300}'::jsonb)               -- …7801 Queued 12451
));
-- KYOBO 시세 이벤트 1건.
INSERT INTO t_setup SELECT 'strategy_kyobo', public.dma_strategy_apply('KYOBO', 'ep-k', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:50:00.000')
));

-- KB 통보 (주문 저널 seq 11~15 · epoch ep-25 — 전략과 별도 seq 공간).
-- 통보 A 의 seq(11)를 같은 ms 전략 BuyOrder 의 seq(2)보다 크게 둔다 — seq 만으로 정렬하면 전략이 먼저 나와
-- 「같은 ms 는 통보 먼저」 규칙이 실제로 판별된다.
INSERT INTO t_setup SELECT 'journal_kb', public.dma_journal_apply('KB', 'ep-25', jsonb_build_array(
  pg_temp.jev(11, '1234567801', '12451', '09:45:02.861'),                                          -- A — BuyOrder 와 같은 ms
  pg_temp.jev(12, '1234567801', '12451', '09:45:03.000',
    '{"notice_type":"E","exec_price":12350,"exec_qty":100,"message":"체결"}'::jsonb),              -- E 100주
  pg_temp.jev(13, '1234567801', '12460', '09:50:00.000',
    '{"notice_type":"C","org_order_no":"12451","request_kind":"Cancel","order_price":0,"side":"","side_trusted":false,"message":"취소확인"}'::jsonb),
  pg_temp.jev(14, '1234567801', '12470', '09:51:00.000',
    '{"notice_type":"M","org_order_no":"12451","request_kind":"Modify","isin":"KR700593000"}'::jsonb), -- 포이즌(새 행 isin 11자 · 원주문 12451)
  pg_temp.jev(15, '1234567802', '12451', '09:45:05.000')                                           -- 다른 계좌 같은 주문번호
));

-- …7801 12451 투영 행 id.
CREATE FUNCTION pg_temp.oid12451() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.dma_account_orders
   WHERE gateway = 'KB' AND trade_date = '2026-09-29' AND account_no = '1234567801' AND order_no = '12451'
$$;

SELECT plan(24);

-- ── 0. 픽스처 전제 ─────────────────────────────────────────────
SELECT isnt(
  (SELECT apply_error FROM public.dma_journal_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 14),
  NULL, '(픽스처, KB, …7801, 통보 seq 14 정정 12470 · org 12451 · isin 11자) 포이즌 — apply_error 가 남았다'
);

-- ── 1. 하루치 평면 목록: 가시성 매트릭스 ──────────────────────────
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-29') r$$,
  $$VALUES ('KB', 1, 1, ''), ('KB', 2, 3, '1234567801'), ('KB', 6, 4, '1234567801')$$,
  '(U1, KB, …7801, 오늘) 시세 seq 1 + 자기 계좌 BuyOrder seq 2 · Queued seq 6 — gw_time_ms 오름차순'
);
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002502', '2026-09-29') r$$,
  $$VALUES ('KB', 1, 1, ''), ('KB', 3, 4, '1234567802')$$,
  '(U2, KB, …7802, 오늘) 시세 seq 1 + 자기 계좌 Queued seq 3'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002503', '2026-09-29')$$,
  '(U3, 매핑 없음, —, 오늘) 0행 — 시세도 보이지 않는다'
);
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002504', '2026-09-29') r$$,
  $$VALUES ('KYOBO', 1, 1, '')$$,
  '(U4, KYOBO, …7803, 오늘) KYOBO 시세만 — KB 시세 비공개'
);
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-29') r
     UNION ALL SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002502', '2026-09-29') r
     UNION ALL SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002503', '2026-09-29') r
     UNION ALL SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002504', '2026-09-29') r
   ) x WHERE x.r->>'gateway' = 'KB' AND (x.r->>'seq')::int = 4),
  0, '(U1~U4, KB, 계좌 '''', 형식 이상 주문 이벤트 seq 4) 누구에게도 보이지 않는다'
);
SELECT results_eq(
  $$SELECT (r->>'seq')::int FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-28') r$$,
  $$VALUES (5)$$,
  '(U1, KB, …7801, 어제 2026-09-28) 그날 것만 — seq 5'
);

-- ── 2. 하루치 평면 목록: 공개 컬럼 ─────────────────────────────────
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-29') r
     WHERE r ?| ARRAY['dma_user_id', 'applied_at']),
  '(U1, KB, …7801, 오늘) 어느 행에도 dma_user_id · applied_at 키가 없다'
);
SELECT set_eq(
  $$SELECT DISTINCT jsonb_object_keys(r) FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-29') r$$,
  $$SELECT unnest(ARRAY[
      'gateway','journal_epoch','seq','trade_date','gw_time_ms','kind','group','exchange','isin','stock_code',
      'cum_volume','account_no','order_no','price','qty','order_condition','reason_code','cond_threshold',
      'cond_actual','cond_metric','ev_kind','ev_price','ev_qty_before','ev_qty_after','ev_trade_qty',
      'limit_bid_qty','bid1_price','bid1_qty','accept_latency_us','immediate_fill_qty','queue_case','base_cum',
      'ahead_qty','expected_cum','error_volume','remaining_volume','has_remaining','cancel_reason',
      'result_code','message','entry_round','snap_qty','snap_cum','ask_qty_at_limit','open_at_limit'])$$,
  '(U1, KB, …7801, 오늘) 행 키 집합 = 공개 45키 (dma_strategy_apply rows 와 같은 투영)'
);
SELECT is(
  (SELECT r->>'stock_code' FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002501', '2026-09-29') r
    WHERE (r->>'seq')::int = 2),
  '005930', '(U1, KB, …7801, seq 2) stock_code = 005930 (stocks.isin 조인)'
);

-- ── 3. 주문 1건 이벤트: 순서 · 포함 · 제외 ─────────────────────────
SELECT results_eq(
  $$SELECT source, seq::int, ev->>'order_no'
      FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])$$,
  $$VALUES ('journal', 11, '12451'), ('strategy', 2, '12451'), ('strategy', 6, '12451'),
           ('journal', 12, '12451'), ('journal', 13, '12460')$$,
  '(U1, KB, …7801, [12451]) A → BuyOrder(같은 ms 통보 먼저) → Queued → E → C(원주문번호 일치) · 포이즌 · 다른 계좌 제외'
);
SELECT is(
  (SELECT count(DISTINCT gw_time_ms)::int
     FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])
    WHERE (source = 'journal' AND seq = 11) OR (source = 'strategy' AND seq = 2)),
  1, '(U1, KB, …7801, 통보 A seq 11 · 전략 BuyOrder seq 2) gw_time_ms 가 같은 ms 다'
);
SELECT is(
  (SELECT gw_time_ms
     FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])
    WHERE source = 'journal' AND seq = 11),
  (extract(epoch FROM '2026-09-29 09:45:02.861+09'::timestamptz) * 1000)::bigint,
  '(U1, KB, …7801, 통보 A seq 11) gw_time_ms = 09:45:02.861 KST 원문 ms (timestamptz 왕복 무손실)'
);
SELECT results_eq(
  $$SELECT source, seq::int
      FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451', '22001'])$$,
  $$SELECT source, seq::int
      FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])$$,
  '(U1, KB, …7801, [12451, 22001]) 남의 계좌(…7802) 주문번호를 끼워도 행의 계좌 밖으로 나가지 않는다'
);

-- ── 4. 주문 1건 이벤트: 공개 컬럼 ──────────────────────────────────
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451']) t
     WHERE t.source = 'journal' AND t.ev ?| ARRAY['dma_user_id', 'apply_error', 'applied_at']),
  '(U1, KB, …7801, 통보 ev) dma_user_id · apply_error · applied_at 키가 없다'
);
SELECT is(
  (SELECT ev->>'gw_time' IS NOT NULL AND ev->>'notice_type' = 'A'
     FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])
    WHERE source = 'journal' AND seq = 11),
  true, '(U1, KB, …7801, 통보 seq 11) ev 에 gw_time · notice_type A 원문'
);
SELECT set_eq(
  $$SELECT DISTINCT jsonb_object_keys(ev)
      FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])
     WHERE source = 'strategy'$$,
  $$SELECT unnest(ARRAY[
      'gateway','journal_epoch','seq','trade_date','gw_time_ms','kind','group','exchange','isin','stock_code',
      'cum_volume','account_no','order_no','price','qty','order_condition','reason_code','cond_threshold',
      'cond_actual','cond_metric','ev_kind','ev_price','ev_qty_before','ev_qty_after','ev_trade_qty',
      'limit_bid_qty','bid1_price','bid1_qty','accept_latency_us','immediate_fill_qty','queue_case','base_cum',
      'ahead_qty','expected_cum','error_volume','remaining_volume','has_remaining','cancel_reason',
      'result_code','message','entry_round','snap_qty','snap_cum','ask_qty_at_limit','open_at_limit'])$$,
  '(U1, KB, …7801, 전략 ev) 키 집합 = 공개 45키'
);

-- ── 5. 주문 1건 이벤트: 남의 행 id · 매핑 없음 · 빈 배열 / NULL ──────
SELECT is_empty(
  $$SELECT 1 FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002502', pg_temp.oid12451(), ARRAY['12451'])$$,
  '(U2, KB, …7801 행 id, [12451]) 남의 계좌 행 id — 0행'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002503', pg_temp.oid12451(), ARRAY['12451'])$$,
  '(U3, 매핑 없음, …7801 행 id) 0행'
);
SELECT results_eq(
  $$SELECT source, seq::int FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY[]::text[])$$,
  $$SELECT source, seq::int FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])$$,
  '(U1, KB, …7801, []) 빈 배열 → 행 자신의 주문번호 12451 로 대체'
);
SELECT results_eq(
  $$SELECT source, seq::int FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), NULL)$$,
  $$SELECT source, seq::int FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', pg_temp.oid12451(), ARRAY['12451'])$$,
  '(U1, KB, …7801, NULL) NULL → 행 자신의 주문번호 12451 로 대체'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000002501', '00000000-0000-4000-8000-00000000dead', ARRAY['12451'])$$,
  '(U1, KB, 없는 행 id, [12451]) 0행'
);

-- ── 6. 권한 (T-25-12 · Pitfall 13) ────────────────────────────────
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_strategy_events_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_order_events_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish(true);

ROLLBACK;
