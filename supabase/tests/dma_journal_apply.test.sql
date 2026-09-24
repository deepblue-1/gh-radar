-- ============================================================
-- Phase 19 Plan 01 — 저널 적용 추적 경로(tracer) pgTAP.
--
-- 한 경로: 게이트웨이 저널 레코드(접수 A) → dma_journal_apply → 원문 이벤트 적재 →
--          dma_account_orders 투영 → 커서 전진 → 매핑된 사용자가 dma_journal_orders_for_user 로 조회.
--
-- 잠그는 것:
--   - A 투영 값(status · qty · price · origin · created_at = gw_time · stocks 조인 stock_code)
--   - D-06 가시성: 같은 dma_user_id 를 공유하는 두 사용자 = 같은 id 집합 · 매핑 없는 사용자 = 0행
--   - D-12 재생 멱등: 같은 배치 두 번 → applied 0 · skipped N · 행·이벤트·커서 불변
--   - D-11 전 계좌 기록: 매핑 없는 계좌도 행이 생기고, 뒤에 매핑이 생기면 바로 보인다
--   - T-19-15 포이즌 격리: CHECK 위반 이벤트는 apply_error 에 남고 같은 배치의 다음 이벤트·커서는 진행
--   - T-19-08: apply 반환 rows 에 dma_user_id 가 없고, 키 집합이 조회 RPC 반환 컬럼과 같다
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유·원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 19-03 이 체결(E) · 취소(C) · 정정(M) · 거부(R) · 로컬 거부 · 견고성(epoch · 순서 · 시각 · 미지 통보) 단언을
-- 더했다(11~22절, 계좌 …9003 · 게이트웨이 KB ep-3 / KB2). 투영 규칙 표 ↔ 단언 번호 대응은 파일 끝 주석.
--
-- 단언 설명에는 (seq, 계좌 말미, 기대값) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자: U1·U2 → dma-shared(계좌 …7801), U3 → dma-solo(처음엔 매핑 없음, 뒤에 …3201).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000001901', 'journal-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000001902', 'journal-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000001903', 'journal-u3@example.invalid');

INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000001901', 'dma-shared', 'test-enc-u1'),
  ('00000000-0000-4000-8000-000000001902', 'dma-shared', 'test-enc-u2'),
  ('00000000-0000-4000-8000-000000001903', 'dma-solo',   'test-enc-u3');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 접수(A) 레코드 1건 — 이벤트 JSON 키 23종 전부(relay 기록기 계약과 같은 모양).
CREATE FUNCTION pg_temp.ev_a(
  p_seq bigint, p_account text, p_order_no text, p_hms text,
  p_isin text DEFAULT 'KR7005930003', p_qty integer DEFAULT 10
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', '2026-09-28',
    'gw_time_ms', (extract(epoch FROM ('2026-09-28 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'dma-shared',
    'account_no', p_account,
    'isin', p_isin,
    'side', 'B',
    'side_trusted', true,
    'order_no', p_order_no,
    'org_order_no', '',
    'notice_type', 'A',
    'request_kind', 'New',
    'requester', 'Manual',
    'origin', 'Manual',
    'exchange', 'KRX',
    'board', '',
    'order_price', 1000,
    'order_qty', p_qty,
    'exec_price', 0,
    'exec_qty', 0,
    'result_code', 0,
    'message', '접수',
    'local_reject', false
  )
$$;

-- (19-03) 임의 통보 1건 — 키 23종 기본값(계좌 …9003 · 매수 · New · 1000원 × 10주 · 접수 A) 위에 p_over 를 덮는다.
-- 투영 규칙 단언은 전부 이 빌더로 만든다: `pg_temp.ev(seq, 'HH:MM:SS', '{"notice_type":"E", …}')`.
CREATE FUNCTION pg_temp.ev(p_seq bigint, p_hms text, p_over jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', '2026-09-28',
    'gw_time_ms', (extract(epoch FROM ('2026-09-28 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'dma-shared',
    'account_no', '1111119003',
    'isin', 'KR7005930003',
    'side', 'B',
    'side_trusted', true,
    'order_no', '',
    'org_order_no', '',
    'notice_type', 'A',
    'request_kind', 'New',
    'requester', 'Manual',
    'origin', 'Manual',
    'exchange', 'KRX',
    'board', '',
    'order_price', 1000,
    'order_qty', 10,
    'exec_price', 0,
    'exec_qty', 0,
    'result_code', 0,
    'message', '',
    'local_reject', false
  ) || p_over
$$;

-- (19-03) 계좌 …9003 의 주문번호 행 1개(게이트웨이 기본 KB).
CREATE FUNCTION pg_temp.o(p_order_no text, p_gateway text DEFAULT 'KB')
RETURNS SETOF public.dma_account_orders LANGUAGE sql AS $$
  SELECT * FROM public.dma_account_orders
   WHERE gateway = p_gateway AND trade_date = '2026-09-28' AND account_no = '1111119003' AND order_no = p_order_no
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

SELECT plan(79);

-- ── 1. 매핑 동기화: dma-shared → …7801 ──────────────────────────
SELECT is(
  public.dma_journal_sync_access('KB', '[{"dma_user_id":"dma-shared","account_no":"1234567801","name":"위탁종합","priority":1}]'::jsonb),
  1,
  'sync_access(KB, [dma-shared→…7801]) 반환 1'
);

-- ── 2. 접수 A seq 1 적용 ────────────────────────────────────────
INSERT INTO t_apply
SELECT 'first', public.dma_journal_apply('KB', 'ep-1',
  jsonb_build_array(pg_temp.ev_a(1, '1234567801', '0000100001', '09:00:01')));

SELECT is((SELECT (r->>'applied')::int FROM t_apply WHERE label = 'first'), 1, '(seq 1, …7801) applied = 1');
SELECT is((SELECT (r->>'skipped')::int FROM t_apply WHERE label = 'first'), 0, '(seq 1, …7801) skipped = 0');
SELECT is((SELECT r->'errors' FROM t_apply WHERE label = 'first'), '[]'::jsonb, '(seq 1, …7801) errors = []');

-- ── 3. U1 조회: 투영 값 ──────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  1, '(seq 1, …7801) U1(dma-shared) 조회 1행'
);
SELECT is(
  (SELECT status FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  'accepted', '(seq 1, …7801) status = accepted'
);
SELECT is(
  (SELECT qty FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  10, '(seq 1, …7801) qty = 10'
);
SELECT is(
  (SELECT price FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  1000, '(seq 1, …7801) price = 1000'
);
SELECT is(
  (SELECT origin FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  'manual', '(seq 1, …7801) origin Manual → manual'
);
SELECT is(
  (SELECT created_at FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  '2026-09-28 09:00:01+09'::timestamptz, '(seq 1, …7801) created_at = gw_time 09:00:01 KST (DEFAULT now() 아님)'
);
SELECT is(
  (SELECT stock_code FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  '005930', '(seq 1, …7801) stock_code = 005930 (stocks.isin 조인)'
);
SELECT is(
  (SELECT row(order_type, exchange, side, order_no)::text
     FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  '(N,KRX,B,0000100001)', '(seq 1, …7801) (order_type, exchange, side, order_no) = (N, KRX, B, 0000100001)'
);

-- ── 4. D-06 가시성 ───────────────────────────────────────────────
SELECT results_eq(
  $$SELECT id FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001902', '2026-09-28') ORDER BY id$$,
  $$SELECT id FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28') ORDER BY id$$,
  '(seq 1, …7801) U2(같은 dma-shared) id 집합 = U1 id 집합 (D-06)'
);
SELECT is_empty(
  $$SELECT id FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001903', '2026-09-28')$$,
  '(seq 1, …7801) U3(dma-solo, 매핑 없음) 조회 0행'
);

-- ── 5. T-19-08: apply rows 공개 컬럼 ─────────────────────────────
SELECT ok(
  NOT ((SELECT r->'rows'->0 FROM t_apply WHERE label = 'first') ? 'dma_user_id'),
  '(seq 1, …7801) apply rows 원소에 dma_user_id 키가 없다'
);
SELECT set_eq(
  $$SELECT jsonb_object_keys(r->'rows'->0) FROM t_apply WHERE label = 'first'$$,
  $$SELECT jsonb_object_keys(to_jsonb(x))
      FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28') x$$,
  '(seq 1, …7801) apply rows 키 집합 = dma_journal_orders_for_user 반환 컬럼 집합'
);
SELECT is(
  (SELECT r->'rows'->0->>'stock_code' FROM t_apply WHERE label = 'first'),
  '005930', '(seq 1, …7801) apply rows stock_code = 005930'
);

-- ── 6. D-12 재생 멱등: 같은 배치 재호출 ───────────────────────────
INSERT INTO t_apply
SELECT 'replay', public.dma_journal_apply('KB', 'ep-1',
  jsonb_build_array(pg_temp.ev_a(1, '1234567801', '0000100001', '09:00:01')));

SELECT is((SELECT (r->>'applied')::int FROM t_apply WHERE label = 'replay'), 0, '(seq 1 재생, …7801) applied = 0');
SELECT is((SELECT (r->>'skipped')::int FROM t_apply WHERE label = 'replay'), 1, '(seq 1 재생, …7801) skipped = 1');
SELECT is(
  (SELECT row(last_seq, filled_qty, status, updated_at = '2026-09-28 09:00:01+09'::timestamptz)::text
     FROM public.dma_account_orders WHERE account_no = '1234567801' AND order_no = '0000100001'),
  '(1,0,accepted,t)', '(seq 1 재생, …7801) 행 (last_seq, filled_qty, status, updated_at 불변) = (1, 0, accepted, t)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_journal_events WHERE gateway = 'KB'),
  1, '(seq 1 재생, …7801) events 1행 그대로'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-1,1)', '(seq 1 재생, …7801) 커서 (ep-1, 1) 불변'
);

-- ── 7. D-11 전 계좌 기록: 매핑 없는 계좌 …3201 ─────────────────────
INSERT INTO t_apply
SELECT 'unmapped', public.dma_journal_apply('KB', 'ep-1',
  jsonb_build_array(pg_temp.ev_a(2, '9876543201', '0000200002', '09:10:00')));

SELECT is((SELECT (r->>'applied')::int FROM t_apply WHERE label = 'unmapped'), 1, '(seq 2, …3201) applied = 1');
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_orders WHERE account_no = '9876543201' AND order_no = '0000200002'),
  1, '(seq 2, …3201) 매핑 없는 계좌도 dma_account_orders 행이 있다 (D-11)'
);
SELECT is(
  (SELECT string_agg(account_no, ',' ORDER BY account_no)
     FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001901', '2026-09-28')),
  '1234567801', '(seq 2, …3201) U1 에게 안 보인다 — U1 은 …7801 만'
);
SELECT is_empty(
  $$SELECT id FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001903', '2026-09-28')$$,
  '(seq 2, …3201) 매핑 전 U3 조회 0행'
);
SELECT is(
  public.dma_journal_sync_access('KB', '[
    {"dma_user_id":"dma-shared","account_no":"1234567801","name":"위탁종합","priority":1},
    {"dma_user_id":"dma-solo","account_no":"9876543201","name":"위탁","priority":1}
  ]'::jsonb),
  2, '(seq 2, …3201) sync_access 로 dma-solo→…3201 추가 — 반환 2 (원자 교체)'
);
SELECT is(
  (SELECT string_agg(account_no || '/' || order_no, ',')
     FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001903', '2026-09-28')),
  '9876543201/0000200002', '(seq 2, …3201) 매핑 뒤 U3 에게 그날 앞선 행 1행이 바로 보인다'
);
SELECT is(
  (SELECT string_agg(account_no, ',' ORDER BY account_no)
     FROM public.dma_journal_orders_for_user('00000000-0000-4000-8000-000000001902', '2026-09-28')),
  '1234567801', '(seq 2, …3201) U2 는 여전히 …7801 만'
);

-- ── 8. T-19-15 포이즌 격리: [seq 3 isin 5자 · seq 4 정상 A] ─────────
INSERT INTO t_apply
SELECT 'poison', public.dma_journal_apply('KB', 'ep-1', jsonb_build_array(
  pg_temp.ev_a(3, '1234567801', '0000100003', '09:20:00', 'KR700'),
  pg_temp.ev_a(4, '1234567801', '0000100004', '09:21:00')
));

SELECT is((SELECT (r->>'applied')::int FROM t_apply WHERE label = 'poison'), 1, '(seq 3·4, …7801) applied = 1 (seq 4 만)');
SELECT is(
  (SELECT r->'errors' @? '$[*] ? (@.seq == 3)' AND jsonb_array_length(r->'errors') = 1 FROM t_apply WHERE label = 'poison'),
  true, '(seq 3, …7801) errors 에 seq 3 한 건'
);
SELECT isnt(
  (SELECT apply_error FROM public.dma_journal_events WHERE gateway = 'KB' AND journal_epoch = 'ep-1' AND seq = 3),
  NULL, '(seq 3, …7801, isin KR700) 이벤트 apply_error 에 사유가 남는다'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_orders WHERE order_no = '0000100003'),
  0, '(seq 3, …7801) 포이즌 이벤트는 투영 행이 없다'
);
SELECT is(
  (SELECT status FROM public.dma_account_orders WHERE account_no = '1234567801' AND order_no = '0000100004'),
  'accepted', '(seq 4, …7801) 같은 배치의 다음 이벤트는 투영된다 — accepted'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-1,4)', '(seq 3·4, …7801) 커서 (ep-1, 4) — 포이즌이 커서를 막지 않는다'
);
SELECT is(
  (SELECT (r->>'last_seq')::bigint FROM t_apply WHERE label = 'poison'),
  4::bigint, '(seq 3·4, …7801) apply 반환 last_seq = 4'
);

-- ── 9. 체결이 먼저 온 행에 A 가 qty 를 채우면 격자로 재판정 ───────────
-- (19-03 의 E 투영이 만들 모양을 직접 넣는다: qty NULL · filled 10 · partially_filled)
INSERT INTO public.dma_account_orders (
  gateway, trade_date, account_no, order_no, isin, exchange, order_type, qty, price,
  filled_qty, status, first_seq, last_seq, created_at, updated_at
) VALUES (
  'KB', '2026-09-28', '1234567801', '0000100005', 'KR7005930003', 'KRX', 'N', NULL, 1000,
  10, 'partially_filled', 5, 5, '2026-09-28 09:30:00+09', '2026-09-28 09:30:00+09'
);
INSERT INTO t_apply
SELECT 'late_a', public.dma_journal_apply('KB', 'ep-1',
  jsonb_build_array(pg_temp.ev_a(6, '1234567801', '0000100005', '09:29:59')));

SELECT is(
  (SELECT row(qty, filled_qty, status, first_seq, last_seq)::text
     FROM public.dma_account_orders WHERE account_no = '1234567801' AND order_no = '0000100005'),
  '(10,10,filled,5,6)', '(seq 6 A 늦게, …7801) (qty, filled, status, first_seq, last_seq) = (10, 10, filled, 5, 6)'
);
SELECT is(
  (SELECT row(created_at = '2026-09-28 09:29:59+09'::timestamptz, updated_at = '2026-09-28 09:30:00+09'::timestamptz, side, origin)::text
     FROM public.dma_account_orders WHERE account_no = '1234567801' AND order_no = '0000100005'),
  '(t,t,B,manual)', '(seq 6 A 늦게, …7801) created_at = LEAST · updated_at = GREATEST · 빈 side/origin 만 채움'
);

-- ── 10. epoch 변경(resync)은 커서를 교체한다 ─────────────────────
SELECT is(
  (SELECT (public.dma_journal_apply('KB', 'ep-2',
     jsonb_build_array(pg_temp.ev_a(1, '1234567801', '0000100007', '10:00:00')))->>'last_seq')::bigint),
  1::bigint, '(ep-2 seq 1, …7801) 다른 epoch 적용 → 반환 last_seq 1'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(ep-2,1)', '(ep-2 seq 1, …7801) 커서 (ep-2, 1) 로 교체 — GREATEST 아님'
);

-- ============================================================
-- 19-03 — 투영 규칙 표 전 행. 계좌 …9003 · epoch ep-3 (위 ep-1/ep-2 경로와 seq 가 섞이지 않게).
-- ============================================================

-- ── 11. [tracer] 체결 E — A 행 체결 누적 · 부분→전량 · 재생 무증가 ──────
INSERT INTO t_apply SELECT 'a10', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(10, '10:00:00', '{"order_no":"0000300010","message":"접수"}')));
INSERT INTO t_apply
SELECT 'e11', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(11, '10:00:05', '{"order_no":"0000300010","notice_type":"E","exec_qty":4,"exec_price":1005}')));

SELECT is(
  (SELECT row((r->>'applied')::int, r->'errors')::text FROM t_apply WHERE label = 'e11'),
  '(1,[])', '(seq 11 E 4주, …9003) (applied, errors) = (1, []) — E 가 apply_error 로 떨어지지 않는다'
);
SELECT is(
  (SELECT row(qty, filled_qty, status)::text FROM pg_temp.o('0000300010')),
  '(10,4,partially_filled)', '(seq 11 E 4주, …9003) (qty, filled_qty, status) = (10, 4, partially_filled)'
);

INSERT INTO t_apply SELECT 'e12', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(12, '10:00:09', '{"order_no":"0000300010","notice_type":"E","exec_qty":6,"exec_price":1005,"message":"체결"}')));
SELECT is(
  (SELECT row(qty, filled_qty, status, last_seq, notice_type)::text FROM pg_temp.o('0000300010')),
  '(10,10,filled,12,E)', '(seq 12 E 6주, …9003) (qty, filled_qty, status, last_seq, notice_type) = (10, 10, filled, 12, E)'
);
SELECT is(
  (SELECT price FROM pg_temp.o('0000300010')),
  1000, '(seq 12 E exec_price 1005, …9003) price = 1000 — 체결가는 주문가를 바꾸지 않는다'
);

-- 같은 [seq 11, 12] 배치 재호출 — 이벤트 PK 게이트가 누적을 막는다(T-19-06).
INSERT INTO t_apply
SELECT 'e_replay', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(11, '10:00:05', '{"order_no":"0000300010","notice_type":"E","exec_qty":4,"exec_price":1005}'),
  pg_temp.ev(12, '10:00:09', '{"order_no":"0000300010","notice_type":"E","exec_qty":6,"exec_price":1005,"message":"체결"}')));
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int)::text FROM t_apply WHERE label = 'e_replay'),
  '(0,2)', '(seq 11·12 재생, …9003) (applied, skipped) = (0, 2)'
);
SELECT is(
  (SELECT row(filled_qty, status, last_seq)::text FROM pg_temp.o('0000300010')),
  '(10,filled,12)', '(seq 11·12 재생, …9003) (filled_qty, status, last_seq) = (10, filled, 12) — 두 배 아님'
);

-- E 가 A 보다 먼저 — qty 를 모르므로 partially_filled 로 만들고, 뒤의 A 가 qty 를 채워 재판정.
INSERT INTO t_apply SELECT 'e20', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(20, '10:05:00', '{"order_no":"0000300020","notice_type":"E","exec_qty":3,"exec_price":1000,"order_qty":0}')));
SELECT is(
  (SELECT row(qty, filled_qty, status, price, order_type, side)::text FROM pg_temp.o('0000300020')),
  '(,3,partially_filled,,N,B)', '(seq 20 E 3주 먼저, …9003) (qty, filled_qty, status, price, order_type, side) = (NULL, 3, partially_filled, NULL, N, B)'
);
INSERT INTO t_apply SELECT 'a21', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(21, '10:05:02', '{"order_no":"0000300020","order_qty":3}')));
SELECT is(
  (SELECT row(qty, filled_qty, status, first_seq, last_seq, price,
              created_at = '2026-09-28 10:05:00+09'::timestamptz,
              updated_at = '2026-09-28 10:05:02+09'::timestamptz)::text
     FROM pg_temp.o('0000300020')),
  '(3,3,filled,20,21,1000,t,t)', '(seq 21 A qty 3 늦게, …9003) (qty, filled, status, first/last_seq, price, created_at = E 시각, updated_at = A 시각) = (3, 3, filled, 20, 21, 1000, t, t)'
);

-- 종결(filled) 행에 늦은 A — 상태는 뒤로 가지 않는다(T-19-22).
INSERT INTO t_apply SELECT 'a13', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(13, '10:00:10', '{"order_no":"0000300010"}')));
SELECT is(
  (SELECT row(status, last_seq, filled_qty)::text FROM pg_temp.o('0000300010')),
  '(filled,13,10)', '(seq 13 늦은 A, …9003) (status, last_seq, filled_qty) = (filled, 13, 10) — filled 유지'
);

-- ── 12. 취소확인 C ────────────────────────────────────────────────
-- 원주문 A(매도 · LimitChaser) → C(자기 번호 0000200002 · 원주문 0000200001 · side 미신뢰).
INSERT INTO t_apply SELECT 'a40', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(40, '10:10:00', '{"order_no":"0000200001","side":"S","origin":"LimitChaser","requester":""}')));
INSERT INTO t_apply SELECT 'c41', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(41, '10:10:03', '{"order_no":"0000200002","org_order_no":"0000200001","notice_type":"C",
    "request_kind":"Cancel","side":"","side_trusted":false,"origin":"LimitChaser","requester":"","order_price":0}')));
SELECT is(
  (SELECT row(order_type, status, side, origin, org_order_no, qty, price)::text FROM pg_temp.o('0000200002')),
  '(C,cancelled,S,limit_chaser,0000200001,10,0)',
  '(seq 41 C, …9003) 취소 행 (order_type, status, side, origin, org, qty, price) = (C, cancelled, S ← 원주문, limit_chaser, 0000200001, 10, 0)'
);
SELECT is(
  (SELECT row(status, last_seq)::text FROM pg_temp.o('0000200001')),
  '(cancelled,41)', '(seq 41 C, …9003) 원주문 0000200001 (status, last_seq) = (cancelled, 41)'
);
SELECT is(
  (SELECT jsonb_array_length(r->'rows') FROM t_apply WHERE label = 'c41'),
  2, '(seq 41 C, …9003) apply rows = 2 (취소 행 + 원주문 행 — relay 가 둘 다 푸시)'
);

-- filled 원주문에 늦은 C — 종결은 덮지 않는다.
INSERT INTO t_apply SELECT 'a42_e43_c44', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(42, '10:11:00', '{"order_no":"0000200003","order_qty":5}'),
  pg_temp.ev(43, '10:11:01', '{"order_no":"0000200003","notice_type":"E","exec_qty":5}'),
  pg_temp.ev(44, '10:11:02', '{"order_no":"0000200004","org_order_no":"0000200003","notice_type":"C","request_kind":"Cancel","order_qty":5}')));
SELECT is(
  (SELECT row((SELECT status FROM pg_temp.o('0000200003')), (SELECT status FROM pg_temp.o('0000200004')))::text),
  '(filled,cancelled)', '(seq 42·43·44, …9003) (filled 원주문, 늦은 취소 행) = (filled 유지, cancelled)'
);

-- 원주문번호가 빈 C = 거래소 자동취소 — 자기 번호 행 자체가 cancelled, order_type 유지.
INSERT INTO t_apply SELECT 'a45_c46', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(45, '10:12:00', '{"order_no":"0000200009"}'),
  pg_temp.ev(46, '15:30:00', '{"order_no":"0000200009","notice_type":"C","request_kind":"","order_price":0}')));
SELECT is(
  (SELECT row(status, order_type, qty, price, last_seq)::text FROM pg_temp.o('0000200009')),
  '(cancelled,N,10,1000,46)', '(seq 46 C org 빈 값, …9003) 자기 행 (status, order_type, qty, price, last_seq) = (cancelled, N 유지, 10, 1000, 46)'
);

-- ── 13. 정정확인 M ────────────────────────────────────────────────
-- 원주문 A(qty 10) · E 3 → M(0000200011 · 10주 요청) → 이동 = LEAST(10, 잔량 7) = 7.
INSERT INTO t_apply SELECT 'a50_e51_m52', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(50, '10:20:00', '{"order_no":"0000200010"}'),
  pg_temp.ev(51, '10:20:01', '{"order_no":"0000200010","notice_type":"E","exec_qty":3}'),
  pg_temp.ev(52, '10:20:05', '{"order_no":"0000200011","org_order_no":"0000200010","notice_type":"M",
    "request_kind":"Modify","order_qty":10,"order_price":1100,"side":"","side_trusted":false}')));
SELECT is(
  (SELECT row(order_type, qty, status, price, org_order_no, side)::text FROM pg_temp.o('0000200011')),
  '(M,7,accepted,1100,0000200010,B)', '(seq 52 M, …9003) 정정 행 (order_type, qty, status, price, org, side) = (M, 7 = LEAST(10, 잔량 7), accepted, 1100, 0000200010, B ← 원주문)'
);
SELECT is(
  (SELECT row(filled_qty, modified_qty, status, last_seq)::text FROM pg_temp.o('0000200010')),
  '(3,7,modified,52)', '(seq 52 M, …9003) 원주문 (filled, modified_qty, status, last_seq) = (3, 7, modified — 3+7 >= 10, 52)'
);

-- 원주문을 모른다(전일·예약 — Assumption A4) → M 수량 그대로 · 원주문 행을 만들지 않는다.
INSERT INTO t_apply SELECT 'm53', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(53, '10:21:00', '{"order_no":"0000200013","org_order_no":"0000299999","notice_type":"M",
    "request_kind":"Modify","order_qty":4,"side":"B","side_trusted":false}')));
SELECT is(
  (SELECT row(order_type, qty, status, side)::text FROM pg_temp.o('0000200013')),
  '(M,4,accepted,)', '(seq 53 M 원주문 모름, …9003) 정정 행 (order_type, qty, status, side) = (M, 4 폴백, accepted, NULL — 미신뢰 side 를 쓰지 않는다)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_temp.o('0000299999')),
  0, '(seq 53 M 원주문 모름, …9003) 원주문 0000299999 행을 지어내지 않는다'
);

-- ── 14. 정정·취소 거부 R(주문번호 있음) — 원주문은 살아 있다 ──────────
INSERT INTO t_apply SELECT 'a60_r61', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(60, '10:30:00', '{"order_no":"0000200020","side":"S"}'),
  pg_temp.ev(61, '10:30:02', '{"order_no":"0000200021","org_order_no":"0000200020","notice_type":"R",
    "request_kind":"Modify","side":"","side_trusted":false,"result_code":7,"message":"정정 거부"}')));
SELECT is(
  (SELECT row(order_type, status, side, org_order_no, result_code)::text FROM pg_temp.o('0000200021')),
  '(M,rejected,S,0000200020,7)', '(seq 61 R Modify, …9003) 거부 행 (order_type, status, side, org, result_code) = (M, rejected, S ← 원주문, 0000200020, 7)'
);
SELECT is(
  (SELECT row(status, modified_qty, last_seq)::text FROM pg_temp.o('0000200020')),
  '(accepted,0,60)', '(seq 61 R Modify, …9003) 원주문 (status, modified_qty, last_seq) = (accepted, 0, 60) 불변'
);

-- 거부 통보가 원주문 번호를 자기 번호로 실어 와도(order_no = org) 원주문을 rejected 로 만들지 않는다.
INSERT INTO t_apply SELECT 'r62', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(62, '10:30:05', '{"order_no":"0000200020","org_order_no":"0000200020","notice_type":"R",
    "request_kind":"Cancel","result_code":8}')));
SELECT is(
  (SELECT row(
     (SELECT status FROM pg_temp.o('0000200020')),
     (SELECT row(order_type, status, org_order_no, order_no IS NULL)::text
        FROM public.dma_account_orders WHERE gateway = 'KB' AND journal_epoch = 'ep-3' AND reject_seq = 62))::text),
  '(accepted,"(C,rejected,0000200020,t)")', '(seq 62 R Cancel order_no = org, …9003) (원주문 status, 거부 행) = (accepted, (C, rejected, 0000200020, order_no NULL)) — reject_seq 행으로 분리'
);

-- ── 15. 로컬 거부 · 주문번호 없는 R — reject_seq 행 (D-02 · Pitfall 6) ─────
INSERT INTO t_apply SELECT 'local', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(30, '10:40:00', '{"local_reject":true,"notice_type":"R","order_qty":5,"result_code":-1,"message":"한도 초과"}'),
  pg_temp.ev(31, '10:40:00', '{"local_reject":true,"notice_type":"R","order_qty":0,"result_code":-1,"message":"한도 초과"}')));
SELECT is(
  (SELECT (r->>'applied')::int FROM t_apply WHERE label = 'local'),
  2, '(seq 30·31 로컬 거부, …9003) applied = 2'
);
SELECT is(
  (SELECT string_agg(row(reject_seq, order_no, status, journal_epoch, qty, price, order_type, side)::text, ';' ORDER BY reject_seq)
     FROM public.dma_account_orders WHERE gateway = 'KB' AND journal_epoch = 'ep-3' AND reject_seq IN (30, 31)),
  '(30,,rejected,ep-3,5,1000,N,B);(31,,rejected,ep-3,,1000,N,B)',
  '(seq 30·31 로컬 거부, …9003) 서로 다른 두 행 (reject_seq, order_no NULL, rejected, epoch, qty 5 / 0→NULL, price, N, B) — 한 행에 겹치지 않는다'
);

INSERT INTO t_apply SELECT 'r32', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(32, '10:41:00', '{"notice_type":"R","request_kind":"Cancel","org_order_no":"0000200020","side":"","side_trusted":false,"result_code":9}')));
SELECT is(
  (SELECT row(order_type, status, org_order_no, side, order_no IS NULL)::text
     FROM public.dma_account_orders WHERE gateway = 'KB' AND journal_epoch = 'ep-3' AND reject_seq = 32),
  '(C,rejected,0000200020,S,t)', '(seq 32 브로커 R 주문번호 없음, …9003) reject_seq 행 (order_type, status, org, side ← 원주문, order_no NULL) = (C, rejected, 0000200020, S, t)'
);

-- ── 16. 예약 Q-ID — 일반 주문번호와 같은 규칙(오케스트레이터 Q3) ─────────
INSERT INTO t_apply SELECT 'q70', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(70, '08:00:00', '{"order_no":"Q000000001"}')));
SELECT is(
  (SELECT status FROM pg_temp.o('Q000000001')),
  'accepted', '(seq 70 A Q000000001, …9003) 예약 접수 행 status = accepted'
);
INSERT INTO t_apply SELECT 'q71', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(71, '08:01:00', '{"order_no":"Q000000001","notice_type":"C","request_kind":"Cancel","order_price":0}')));
SELECT is(
  (SELECT row(status, order_type)::text FROM pg_temp.o('Q000000001')),
  '(cancelled,N)', '(seq 71 C Q000000001 org 빈 값, …9003) 예약 행 (status, order_type) = (cancelled, N)'
);

-- ── 17. origin 사상 — 모르는 값·빈 값은 NULL(D-08 보충) ────────────────
INSERT INTO t_apply SELECT 'origin', public.dma_journal_apply('KB', 'ep-3', jsonb_build_array(
  pg_temp.ev(80, '11:00:00', '{"order_no":"0000200080","origin":""}'),
  pg_temp.ev(81, '11:00:01', '{"order_no":"0000200081","origin":"Unknown"}'),
  pg_temp.ev(82, '11:00:02', '{"order_no":"0000200082","origin":"VITrigger"}')));
SELECT is(
  (SELECT string_agg(order_no || '=' || coalesce(origin, 'NULL'), ',' ORDER BY order_no)
     FROM public.dma_account_orders WHERE gateway = 'KB' AND order_no IN ('0000200080','0000200081','0000200082')),
  '0000200080=NULL,0000200081=NULL,0000200082=vi', '(seq 80·81·82, …9003) origin (빈 값, Unknown, VITrigger) → (NULL, NULL, vi)'
);

-- ============================================================
-- 19-03 Task 3 — 견고성. 게이트웨이 KB2(커서·seq 가 위 KB 경로와 섞이지 않는 새 게이트웨이).
-- ============================================================

-- ── 18. epoch 교체(Pitfall 3 · T-19-23) ─────────────────────────────
INSERT INTO t_apply SELECT 'kb2_ep1', public.dma_journal_apply('KB2', 'ep-1', jsonb_build_array(
  pg_temp.ev(1, '09:00:00', '{"order_no":"0000400001"}'),
  pg_temp.ev(2, '09:00:01', '{"order_no":"0000400002"}'),
  pg_temp.ev(3, '09:00:02', '{"order_no":"0000400003"}')));
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'),
  '(ep-1,3)', '(KB2 ep-1 seq 1..3) 커서 (ep-1, 3)'
);
-- 저널 저장소 초기화 → 새 epoch 의 seq 1. 옛 epoch 의 seq 1 과 다른 이벤트다.
INSERT INTO t_apply SELECT 'kb2_ep2', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(1, '09:10:00', '{"order_no":"0000400009"}')));
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'),
  '(ep-2,1)', '(KB2 ep-2 seq 1) 커서 (ep-2, 1) 로 교체 — 옛 epoch 의 3 을 GREATEST 로 붙들지 않는다'
);
SELECT is(
  (SELECT string_agg(journal_epoch || ':' || seq, ',' ORDER BY journal_epoch)
     FROM public.dma_journal_events WHERE gateway = 'KB2' AND seq = 1),
  'ep-1:1,ep-2:1', '(KB2 ep-2 seq 1) events 에 (ep-1, 1) 과 (ep-2, 1) 두 행 — 새 epoch 의 seq 1 은 재생으로 버려지지 않는다'
);
SELECT is(
  (SELECT row((r->>'applied')::int, (SELECT status FROM pg_temp.o('0000400009', 'KB2')))::text FROM t_apply WHERE label = 'kb2_ep2'),
  '(1,accepted)', '(KB2 ep-2 seq 1) (applied, 0000400009 status) = (1, accepted) — 새 epoch 이벤트가 투영된다'
);

-- 같은 epoch 에서 이미 적용된 더 작은 seq 재생 → 커서가 줄지 않는다.
INSERT INTO t_apply SELECT 'kb2_ep2_23', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(2, '09:10:01', '{"order_no":"0000400010"}'),
  pg_temp.ev(3, '09:10:02', '{"order_no":"0000400011"}')));
INSERT INTO t_apply SELECT 'kb2_ep2_replay1', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(1, '09:10:00', '{"order_no":"0000400009"}')));
SELECT is(
  (SELECT row((r->>'skipped')::int, (r->>'last_seq')::bigint,
              (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'))::text
     FROM t_apply WHERE label = 'kb2_ep2_replay1'),
  '(1,3,"(ep-2,3)")', '(KB2 ep-2 seq 1 재생 · 커서 3) (skipped, 반환 last_seq, 커서) = (1, 3, (ep-2, 3)) — 줄지 않는다'
);

-- ── 19. 배치 순서 — 배열이 뒤섞여도 seq 오름차순으로 투영된다 ─────────
-- 배열 [C6 자동취소, E5 10주, A4 10주]. 오름차순(A4 → E5 → C6)이면 filled 가 된 뒤 C 가 종결을 못 덮어 filled,
-- 배열 순서 그대로면 C6 이 먼저 행을 cancelled 로 만들어 뒤의 체결이 상태를 못 올린다 → cancelled.
INSERT INTO t_apply SELECT 'kb2_order', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(6, '09:20:02', '{"order_no":"0000400020","notice_type":"C","request_kind":"","order_price":0}'),
  pg_temp.ev(5, '09:20:01', '{"order_no":"0000400020","notice_type":"E","exec_qty":10}'),
  pg_temp.ev(4, '09:20:00', '{"order_no":"0000400020"}')));
SELECT is(
  (SELECT row(status, filled_qty, qty, first_seq, last_seq, notice_type)::text FROM pg_temp.o('0000400020', 'KB2')),
  '(filled,10,10,4,6,C)', '(KB2 ep-2 배열 [6,5,4]) (status, filled, qty, first/last_seq, notice_type) = (filled, 10, 10, 4, 6, C) — A4 → E5 → C6 순으로 투영'
);

-- ── 20. 시각 정본 — 오전 게이트웨이 시각을 저녁(=지금) 트랜잭션에서 적용(Pitfall 5) ──
INSERT INTO t_apply SELECT 'kb2_time', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(7, '09:01:00', '{"order_no":"0000400030"}'),
  pg_temp.ev(8, '09:02:30', '{"order_no":"0000400030","notice_type":"E","exec_qty":2}')));
SELECT is(
  (SELECT row(
     o.created_at = to_timestamp((pg_temp.ev(7, '09:01:00')->>'gw_time_ms')::bigint / 1000.0),
     o.updated_at = to_timestamp((pg_temp.ev(8, '09:02:30')->>'gw_time_ms')::bigint / 1000.0),
     (SELECT e.applied_at = now() FROM public.dma_journal_events e
       WHERE e.gateway = 'KB2' AND e.journal_epoch = 'ep-2' AND e.seq = 8))::text
     FROM pg_temp.o('0000400030', 'KB2') o),
  '(t,t,t)', '(KB2 ep-2 seq 7·8, 09:01·09:02:30) (created_at = A gw_time, updated_at = E gw_time, 이벤트 applied_at = now()) — 적용 시각이 주문 시각이 되지 않는다'
);

-- ── 21. 미지 통보 — 포이즌 격리가 배치 가운데서 받는다(T-19-15) ──────────
INSERT INTO t_apply SELECT 'kb2_unknown', public.dma_journal_apply('KB2', 'ep-2', jsonb_build_array(
  pg_temp.ev(9,  '09:30:00', '{"order_no":"0000400040","notice_type":"X"}'),
  pg_temp.ev(10, '09:30:01', '{"order_no":"0000400041"}')));
SELECT ok(
  (SELECT apply_error LIKE '%알 수 없는 notice_type X%'
     FROM public.dma_journal_events WHERE gateway = 'KB2' AND journal_epoch = 'ep-2' AND seq = 9),
  '(KB2 ep-2 seq 9 notice_type X) apply_error 에 「알 수 없는 notice_type X」 사유'
);
SELECT is(
  (SELECT row((r->>'applied')::int, jsonb_path_query_array(r->'errors', '$[*].seq'), (SELECT count(*) FROM pg_temp.o('0000400040', 'KB2')))::text
     FROM t_apply WHERE label = 'kb2_unknown'),
  '(1,[9],0)', '(KB2 ep-2 seq 9·10) (applied, errors 의 seq, X 투영 행 수) = (1, [9], 0)'
);
SELECT is(
  (SELECT row((SELECT status FROM pg_temp.o('0000400041', 'KB2')),
              (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'))::text),
  '(accepted,"(ep-2,10)")', '(KB2 ep-2 seq 10) 같은 배치 뒤 이벤트 accepted · 커서 (ep-2, 10) — 미지 통보가 배치·커서를 막지 않는다'
);

-- ── 22. 빈 배열 — 커서를 건드리지 않는다 ─────────────────────────────
INSERT INTO t_apply SELECT 'kb2_empty', public.dma_journal_apply('KB2', 'ep-2', '[]'::jsonb);
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'rows', (r->>'last_seq')::bigint)::text FROM t_apply WHERE label = 'kb2_empty'),
  '(0,0,[],10)', '(KB2 ep-2 빈 배열) (applied, skipped, rows, last_seq) = (0, 0, [], 10)'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq)::text FROM public.dma_journal_cursor WHERE gateway = 'KB2'),
  '(ep-2,10)', '(KB2 ep-2 빈 배열) 커서 (ep-2, 10) 불변'
);

SELECT * FROM finish(true);

ROLLBACK;

-- ============================================================
-- 투영 규칙 표(RESEARCH §Pattern D 「투영 규칙」) ↔ 단언 번호.
-- 규칙 하나를 바꾸면 여기 적힌 번호의 `not ok` 가 떠야 한다. 번호는 `ok N` 순번이다(단언을 끼워 넣으면 갱신).
--
-- | 규칙 행                                   | 단언 번호                                                     |
-- |-------------------------------------------|---------------------------------------------------------------|
-- | A (주문번호 upsert · accepted · 빈 칸만)  | 2-12 · 37-38(체결 먼저 온 행 재판정) · 48(E 먼저 → A 가 qty) · 49(filled 행 늦은 A) · 65(Q-ID) |
-- | E (filled_qty 누적 · 격자 판정)           | 41-44(부분 → 전량 · 체결가 무시) · 45-46(재생 무증가) · 47-48(A 보다 먼저) · 73(순서) |
-- | C (자기 행 cancelled + 원주문 격자)       | 50-52(원주문 cancelled · side ← 원주문) · 53(filled 원주문 불변) · 54(org 빈 값 = 자동취소) · 66(Q-ID) |
-- | M (이동 = LEAST(M 수량, 잔량))            | 55-56(이동 7 · 원주문 modified) · 57-58(원주문 모름 → M 수량 폴백 · 지어내지 않음) |
-- | R 주문번호 있음 (자기 행만 · 원주문 불변) | 59-60 · 61(order_no = org 거부 → reject_seq 행 분리) |
-- | 로컬 거부 · 주문번호 없는 R (reject_seq)  | 62-63(두 거부가 두 행) · 64(브로커 R · side ← 원주문) |
-- | 공통 (last_seq · notice 최신 · 시각 · side/origin · epoch · 격리) | 10 · 38 · 48 · 74(시각 = gw_time, applied_at = now) · 67(origin 사상) · 50·57·59(방향) · 18-22·45-46·72(재생·커서 불감소) · 39-40·68-71(epoch 교체) · 30-36·75-77(포이즌·미지 통보 격리) · 78-79(빈 배열) |
-- ============================================================
