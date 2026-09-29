-- ============================================================
-- Phase 25 Plan 01 — 전략 이벤트 적재 경로(dma_strategy_apply) pgTAP.
--
-- 한 경로: 관찰자 80 전략 이벤트(기획서 하루 흐름 seq 1 상한가노출 · seq 2 12451 선매수 BuyOrder) →
--          relay 전략 기록기 → dma_strategy_apply → dma_strategy_events 원문 적재 → 전략 커서 칸 전진 →
--          공개 45키 rows 반환(relay 가 journal.events 로 푸시).
--
-- 잠그는 것:
--   - 멱등: 같은 배치 2회 = applied 0 · skipped N · 행 · 커서 불변 (PK (gateway, journal_epoch, seq))
--   - 전략 커서 독립: 전략 적용은 strategy_journal_epoch · strategy_last_seq 만 전진(주문 커서 불변) ·
--     주문 적용(dma_journal_apply)은 전략 칸을 건드리지 않는다 · 새 epoch 는 GREATEST 가 아니라 교체
--   - T-19-08 · T-25-02: 반환 rows 키 = 공개 45키(stock_code 는 stocks 조인) · dma_user_id · applied_at 없음
--   - G1 ⓓ: enum 칸은 CHECK 없는 smallint — v0.1 밖 말미 추가 값 · 모르는 값(99)도 그대로 적재
--   - 계약 위반(필수 키 trade_date 없음)은 배치 전체 예외
--   - T-19-01 · T-25-03: anon · authenticated EXECUTE/SELECT 불가 · service_role 가능 · RLS 활성 · 정책 0개
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 단언 설명에는 (게이트웨이 epoch seq, 계좌 말미, 기대값) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 값은 shared 픽스처 `packages/shared/src/__fixtures__/strategy-day.ts` 의 exposed · buy12451 과 같다(185,400 · 12451 · 38,200).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 전략 이벤트 1건 — relay `STRATEGY_APPLY_KEYS` 43키 전부(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', '2026-09-29',
    'gw_time_ms', (extract(epoch FROM ('2026-09-29 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind,
    'group', p_group,
    'exchange', 'KRX',
    'isin', 'KR7005930003',
    'cum_volume', 0,
    'dma_user_id', CASE WHEN p_account = '' THEN '' ELSE 'dma-shared' END,
    'account_no', p_account,
    'order_no', p_order_no,
    'price', 0,
    'qty', 0,
    'order_condition', '',
    'reason_code', '',
    'cond_threshold', 0,
    'cond_actual', 0,
    'cond_metric', 0,
    'ev_kind', 0,
    'ev_price', 0,
    'ev_qty_before', 0,
    'ev_qty_after', 0,
    'ev_trade_qty', 0,
    'limit_bid_qty', 0,
    'bid1_price', 0,
    'bid1_qty', 0,
    'accept_latency_us', 0,
    'immediate_fill_qty', 0,
    'queue_case', 0,
    'base_cum', 0,
    'ahead_qty', 0,
    'expected_cum', 0,
    'error_volume', 0,
    'remaining_volume', 0,
    'has_remaining', false,
    'cancel_reason', 0,
    'result_code', 0,
    'message', '',
    'entry_round', 0,
    'snap_qty', '[]'::jsonb,
    'snap_cum', '[]'::jsonb,
    'ask_qty_at_limit', 0,
    'open_at_limit', false
  ) || p_over
$$;

-- 픽스처 exposed (seq 1 · 09:42:13.215 상한가노출 · 계좌 없음).
CREATE FUNCTION pg_temp.exposed() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(1, 1, 0, '', '', '09:42:13.215', '{"cum_volume":620000,"ask_qty_at_limit":185400}'::jsonb)
$$;

-- 픽스처 buy12451 (seq 2 · 09:45:02.861 12451 선매수 BuyOrder · 계좌 …7801).
CREATE FUNCTION pg_temp.buy12451() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(2, 3, 1, '1234567801', '12451', '09:45:02.861', jsonb_build_object(
    'cum_volume', 861800,
    'price', 12350,
    'qty', 300,
    'reason_code', 'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)',
    'cond_threshold', 50000,
    'cond_actual', 38200,
    'cond_metric', 1,
    'ev_kind', 1,
    'ev_price', 12350,
    'ev_qty_before', 52100,
    'ev_qty_after', 38200,
    'limit_bid_qty', 0,
    'accept_latency_us', 18000
  ))
$$;

-- 주문 저널 이벤트 1건(23키 · 접수 A) — 주문 적용이 전략 커서 칸을 건드리지 않는지 보는 데만 쓴다.
CREATE FUNCTION pg_temp.jev(p_seq bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', '2026-09-29',
    'gw_time_ms', (extract(epoch FROM '2026-09-29 09:45:02.900+09'::timestamptz) * 1000)::bigint,
    'dma_user_id', 'dma-shared', 'account_no', '1234567801', 'isin', 'KR7005930003',
    'side', 'B', 'side_trusted', true, 'order_no', '0000012451', 'org_order_no', '',
    'notice_type', 'A', 'request_kind', 'New', 'requester', '', 'origin', 'LimitChaser',
    'exchange', 'KRX', 'board', '', 'order_price', 12350, 'order_qty', 300,
    'exec_price', 0, 'exec_qty', 0, 'result_code', 0, 'message', '접수', 'local_reject', false
  )
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

SELECT plan(30);

-- ── 1. 첫 적용: 커서 행이 없던 게이트웨이 KB ─────────────────────
INSERT INTO t_apply
SELECT 'first', public.dma_strategy_apply('KB', 'ep-25', jsonb_build_array(pg_temp.exposed(), pg_temp.buy12451()));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors', (r->>'last_seq')::bigint)::text FROM t_apply WHERE label = 'first'),
  '(2,0,[],2)', '(KB ep-25 seq 1·2, —·…7801) (applied, skipped, errors, last_seq) = (2, 0, [], 2)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25'),
  2, '(KB ep-25 seq 1·2) 테이블 2행'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-25,0,ep-25,2)', '(KB ep-25 첫 적용) 커서 1행 (journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq) = (ep-25, 0, ep-25, 2)'
);

-- ── 2. 적재 값 (원문 보존) ───────────────────────────────────────
SELECT is(
  (SELECT row(kind, "group", cond_threshold, cond_actual, cond_metric, accept_latency_us, snap_qty)::text
     FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 2),
  '(3,1,50000,38200,1,18000,{})', '(KB ep-25 seq 2, …7801) (kind, group, cond_threshold, cond_actual, cond_metric, accept_latency_us, snap_qty) = (3, 1, 50000, 38200, 1, 18000, {})'
);
SELECT is(
  (SELECT row(order_no, price, qty, ev_qty_before, ev_qty_after, cum_volume, dma_user_id)::text
     FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 2),
  '(12451,12350,300,52100,38200,861800,dma-shared)', '(KB ep-25 seq 2, …7801) (order_no, price, qty, 근거 전→후, 누적, dma_user_id 감사 칸) = (12451, 12350, 300, 52100, 38200, 861800, dma-shared)'
);
SELECT is(
  (SELECT reason_code FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 2),
  'PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)', '(KB ep-25 seq 2, …7801) reason_code 원문 그대로'
);
SELECT is(
  (SELECT gw_time_ms FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 2),
  (extract(epoch FROM '2026-09-29 09:45:02.861+09'::timestamptz) * 1000)::bigint,
  '(KB ep-25 seq 2) gw_time_ms = 09:45:02.861 KST 원문 ms'
);
SELECT is(
  (SELECT row(kind, "group", account_no, order_no, dma_user_id, ask_qty_at_limit, cum_volume)::text
     FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-25' AND seq = 1),
  '(1,0,"","","",185400,620000)', '(KB ep-25 seq 1, 시세) (kind, group, account_no, order_no, dma_user_id, ask_qty_at_limit, cum_volume) = (1, 0, '''', '''', '''', 185400, 620000)'
);

-- ── 3. T-19-08 · T-25-02: 반환 rows 공개 45키 ──────────────────────
SELECT set_eq(
  $$SELECT jsonb_object_keys(r->'rows'->0) FROM t_apply WHERE label = 'first'$$,
  $$SELECT unnest(ARRAY[
      'gateway','journal_epoch','seq','trade_date','gw_time_ms','kind','group','exchange','isin','stock_code',
      'cum_volume','account_no','order_no','price','qty','order_condition','reason_code','cond_threshold',
      'cond_actual','cond_metric','ev_kind','ev_price','ev_qty_before','ev_qty_after','ev_trade_qty',
      'limit_bid_qty','bid1_price','bid1_qty','accept_latency_us','immediate_fill_qty','queue_case','base_cum',
      'ahead_qty','expected_cum','error_volume','remaining_volume','has_remaining','cancel_reason',
      'result_code','message','entry_round','snap_qty','snap_cum','ask_qty_at_limit','open_at_limit'])$$,
  '(KB ep-25 seq 1) rows 원소 키 집합 = 공개 45키 (shared STRATEGY_EVENT_PUBLIC_COLUMNS)'
);
SELECT ok(
  NOT ((SELECT r->'rows'->1 FROM t_apply WHERE label = 'first') ?| ARRAY['dma_user_id', 'applied_at']),
  '(KB ep-25 seq 2, …7801) rows 원소에 dma_user_id · applied_at 키가 없다'
);
SELECT is(
  (SELECT row(r->'rows'->0->>'seq', r->'rows'->1->>'seq', r->'rows'->1->>'group', r->'rows'->1->>'stock_code', r->'rows'->1->>'journal_epoch')::text
     FROM t_apply WHERE label = 'first'),
  '(1,2,1,005930,ep-25)', '(KB ep-25 seq 1·2) rows seq 오름차순 · rows[1] (group, stock_code, journal_epoch) = (1, 005930, ep-25)'
);
SELECT is(
  (SELECT jsonb_typeof(r->'rows'->1->'snap_qty') FROM t_apply WHERE label = 'first'),
  'array', '(KB ep-25 seq 2) rows snap_qty 는 JSON 배열'
);

-- ── 4. 멱등: 같은 배치 재호출 ─────────────────────────────────────
INSERT INTO t_apply
SELECT 'replay', public.dma_strategy_apply('KB', 'ep-25', jsonb_build_array(pg_temp.exposed(), pg_temp.buy12451()));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'rows', (r->>'last_seq')::bigint)::text FROM t_apply WHERE label = 'replay'),
  '(0,2,[],2)', '(KB ep-25 seq 1·2 재생) (applied, skipped, rows, last_seq) = (0, 2, [], 2)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KB'),
  2, '(KB ep-25 재생) 테이블 2행 그대로'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-25,0,ep-25,2)', '(KB ep-25 재생) 커서 (ep-25, 0, ep-25, 2) 불변'
);

-- ── 5. 이미 있던 주문 커서는 전략 적용 뒤에도 그대로 (KB2) ─────────
INSERT INTO public.dma_journal_cursor (gateway, journal_epoch, last_seq) VALUES ('KB2', 'ep-J', 40);
INSERT INTO t_apply
SELECT 'kb2', public.dma_strategy_apply('KB2', 'ep-J', jsonb_build_array(pg_temp.exposed()));
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'),
  '(ep-J,40,ep-J,1)', '(KB2 ep-J seq 1) 주문 커서 (ep-J, 40) 불변 · 전략 커서 (ep-J, 1)'
);
SELECT is(
  (SELECT (r->>'applied')::int FROM t_apply WHERE label = 'kb2'),
  1, '(KB2 ep-J seq 1) 다른 게이트웨이 같은 seq — 별도 PK 라 applied 1'
);

-- ── 6. 새 epoch — GREATEST 가 아니라 교체 ─────────────────────────
INSERT INTO t_apply
SELECT 'kb_ep26', public.dma_strategy_apply('KB', 'ep-26', jsonb_build_array(pg_temp.exposed()));
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-25,0,ep-26,1)', '(KB ep-26 seq 1) 전략 커서 (ep-26, 1) 로 교체(2 보다 작아도) · 주문 칸 (ep-25, 0) 불변'
);
SELECT is(
  (SELECT (r->>'last_seq')::bigint FROM t_apply WHERE label = 'kb_ep26'),
  1::bigint, '(KB ep-26 seq 1) 반환 last_seq = 1 (새 epoch 커서)'
);

-- ── 7. G1 ⓓ: enum 칸 CHECK 없음 — 말미 추가 값 · 모르는 값 그대로 ──
INSERT INTO t_apply
SELECT 'unknown_enum', public.dma_strategy_apply('KB', 'ep-26', jsonb_build_array(
  pg_temp.sev(2, 99, 0, '1234567801', '12460', '10:00:00.000',
    '{"cancel_reason":9,"cond_metric":7,"ev_kind":3,"queue_case":2,"snap_qty":[30000,55000,72000],"snap_cum":[900000,903000,908000],"error_volume":-12000}'::jsonb)));
SELECT is(
  (SELECT (r->>'applied')::int FROM t_apply WHERE label = 'unknown_enum'),
  1, '(KB ep-26 seq 2, …7801, kind 99 · cancel 9 · metric 7) applied 1 — CHECK 거부 없음'
);
SELECT is(
  (SELECT row(kind, cancel_reason, cond_metric, ev_kind, queue_case, error_volume, snap_qty, snap_cum)::text
     FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-26' AND seq = 2),
  '(99,9,7,3,2,-12000,"{30000,55000,72000}","{900000,903000,908000}")',
  '(KB ep-26 seq 2) (kind, cancel_reason, cond_metric, ev_kind, queue_case, error_volume, snap_qty, snap_cum) 원문 그대로'
);
SELECT is(
  (SELECT r->'rows'->0->'snap_qty' FROM t_apply WHERE label = 'unknown_enum'),
  '[30000, 55000, 72000]'::jsonb, '(KB ep-26 seq 2) rows snap_qty = [30000, 55000, 72000]'
);

-- ── 8. 계약 위반 — 필수 키 없음은 배치 전체 예외 ──────────────────
SELECT throws_ok(
  $$SELECT public.dma_strategy_apply('KB', 'ep-26', jsonb_build_array(pg_temp.sev(3, 3, 1, '1234567801', '12461', '10:01:00.000') - 'trade_date'))$$,
  '23502', NULL,
  '(KB ep-26 seq 3, …7801, trade_date 없음) 배치 전체 예외 — not_null_violation'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KB' AND journal_epoch = 'ep-26' AND seq = 3),
  0, '(KB ep-26 seq 3) 예외 배치는 적재 0'
);
SELECT throws_ok(
  $$SELECT public.dma_strategy_apply('', 'ep-26', '[]'::jsonb)$$,
  'P0001', 'dma_strategy_apply: gateway/journal_epoch 가 비어 있다',
  '(빈 gateway) 입력 검사 예외'
);

-- ── 9. 주문 적용은 전략 커서 칸을 건드리지 않는다 ────────────────
INSERT INTO t_apply SELECT 'journal', public.dma_journal_apply('KB', 'ep-26', jsonb_build_array(pg_temp.jev(7)));
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-26,7,ep-26,2)', '(KB ep-26 주문 seq 7) 주문 커서 (ep-26, 7) · 전략 커서 (ep-26, 2) 불변'
);

-- ── 10. 권한 (T-19-01 · T-25-03) ─────────────────────────────────
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_strategy_apply EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_table_privilege('anon', 'public.dma_strategy_events', 'SELECT'),
    has_table_privilege('authenticated', 'public.dma_strategy_events', 'SELECT'),
    has_table_privilege('service_role', 'public.dma_strategy_events', 'SELECT')
  )::text,
  '(f,f,t)', 'dma_strategy_events SELECT (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_strategy_events'::regclass),
  true, 'dma_strategy_events RLS 활성'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dma_strategy_events'),
  0, 'dma_strategy_events 정책 0개 (서비스롤 전용 — default deny)'
);

SELECT * FROM finish(true);

ROLLBACK;
