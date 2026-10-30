-- ============================================================
-- quick-261030-d7b — 발사 조각 · 머리 키에 fire_base pgTAP(A KRX 재확인 회차 공존).
--
-- 대상 마이그레이션: supabase/migrations/20261030200000_launch_fire_base_key.sql
--   (launch_pieces · launch_heads PK 에 fire_base · launch_upsert_piece/head 의 ON CONFLICT 대상 교체)
-- 결함 원문(35-11 Task 2 진행): KYOBO119 A 마감선 09:00:29.5 재확인 재발사가 expected_cum 090029000 · entry_round 0 부터
--   다시 오면서 옛 키(…, fire_exchange, market, wire)에서 09:00:27 본회차 행을 덮었다(seq 3160182 · 3372361 등이 사라짐).
--
-- 잠그는 것(원문 kind 17·18 → dma_strategy_apply → launch_project_event → 헬퍼 upsert → 주문 내역 RPC 한 경로):
--   1. A KRX 본회차(09:00:27 · wire 0 · 1) + 재확인 회차(09:00:29 · wire 0) 조각 3행 공존 — 뒤 회차가 앞 회차를 덮지 않는다.
--   2. 머리 kind 18 도 회차마다 한 행(09:00:27 n_pieces 2 · 09:00:29 n_pieces 1).
--   3. launch_orders_for_admin 의 pieces · heads 순서(fire_base 순).
--   4. 같은 배치 재적용(skipped) · launch_reproject 두 번 = 스냅숏 불변(멱등).
--   5. 조건부 덮기 규칙은 새 키 안에서 그대로 — backfill 은 journal 을 못 덮고(written 0) · journal 은 backfill 을 덮고 ·
--      같은 epoch 의 낮은 seq 는 거절(false).
--   6. PK 열(col_is_pk) · 두 헬퍼 EXECUTE 권한(anon · authenticated · service_role = f · f · t).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_fire_base_key.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (날짜, 서버, 프로파일, 거래소, 시장, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
-- 전략 이벤트 1건 — relay `STRATEGY_APPLY_KEYS` 43키 전부(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
-- (launch_project_mapping.test.sql 의 헬퍼 그대로)
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT '2026-10-28'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
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

-- A KRX 조각(kind 17) — 계좌 · 주문번호를 싣는다(노트 ⓑ). p_cum = expected_cum(HHMMSSmmm) · p_wire = entry_round.
CREATE FUNCTION pg_temp.apiece(p_seq bigint, p_cum bigint, p_wire int, p_order_no text, p_date text DEFAULT '2026-10-30')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 17, 0, '53200001', p_order_no, '09:00:26.999', jsonb_build_object(
    'exchange', 'KRX', 'cond_metric', 2, 'ev_kind', 81, 'expected_cum', p_cum, 'entry_round', p_wire,
    'order_condition', 'B', 'cond_threshold', -150 + p_wire, 'queue_case', 1, 'ev_qty_before', p_wire,
    'price', 12350, 'qty', 300, 'message', 'q=A|res=접수|rc='), p_date)
$$;

-- A KRX 머리(kind 18) — 계좌 · 주문번호는 비운다(노트 ⓑ). p_n = n_pieces(ev_price).
CREATE FUNCTION pg_temp.ahead(p_seq bigint, p_cum bigint, p_n int, p_date text DEFAULT '2026-10-30')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 18, 0, '', '', '09:00:28.000', jsonb_build_object(
    'exchange', 'KRX', 'cond_metric', 2, 'ev_kind', 81, 'expected_cum', p_cum, 'isin', '',
    'cond_threshold', -150, 'cond_actual', -150, 'remaining_volume', -150, 'ev_price', p_n,
    'ev_qty_before', p_n, 'entry_round', 0,
    'message', 'plan=-150|rev=0|lo=-|hi=-150|fire=' || lpad((p_cum / 1000)::text, 6, '0') || '.000100'), p_date)
$$;

-- 두 표 스냅숏(created_at · updated_at 제외 · 키 순) — 재적용 · 재해석 멱등 비교용.
CREATE FUNCTION pg_temp.snap() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg((to_jsonb(p) - 'created_at' - 'updated_at')::text, E'\n'
                                     ORDER BY p.profile, p.fire_exchange, p.fire_base, p.market, p.wire)
                     FROM public.launch_pieces p
                    WHERE p.trade_date = '2026-10-30' AND p.gateway = 'KYOBO119'), '')
      || E'\n--\n'
      || coalesce((SELECT string_agg((to_jsonb(h) - 'created_at' - 'updated_at')::text, E'\n'
                                     ORDER BY h.profile, h.fire_exchange, h.fire_base, h.market)
                     FROM public.launch_heads h
                    WHERE h.trade_date = '2026-10-30' AND h.gateway = 'KYOBO119'), '')
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);
CREATE TEMP TABLE t_snap (label text PRIMARY KEY, s text NOT NULL);

-- ── 적재 — KYOBO119 k1 2026-10-30 A KRX 코스닥(Q) 한 배치 ─────────
--   101 조각 09:00:27 w0 · 102 조각 09:00:27 w1 · 103 머리 09:00:27(n 2) · 104 조각 09:00:29 w0(재확인) · 105 머리 09:00:29(n 1)
INSERT INTO t_apply
SELECT 'k1', public.dma_strategy_apply('KYOBO119', 'k1', jsonb_build_array(
  pg_temp.apiece(101, 90027000, 0, '53200003'),
  pg_temp.apiece(102, 90027000, 1, '53200004'),
  pg_temp.ahead(103, 90027000, 2),
  pg_temp.apiece(104, 90029000, 0, '53200005'),
  pg_temp.ahead(105, 90029000, 1)
));
INSERT INTO t_snap SELECT 'apply', pg_temp.snap();

SELECT plan(23);

-- ── 1. 두 회차 공존 ─────────────────────────────────────────────
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors')::text FROM t_apply WHERE label = 'k1'),
  '(5,0,[])', '(2026-10-30, KYOBO119 k1, A, KRX, Q, seq 101~105) (applied, skipped, errors) = (5, 0, [])'
);
SELECT is(
  (SELECT string_agg(to_char(p.fire_base, 'HH24:MI:SS') || '/' || p.seq, ',' ORDER BY p.fire_base)
     FROM public.launch_pieces p
    WHERE p.trade_date = '2026-10-30' AND p.gateway = 'KYOBO119' AND p.profile = 'A' AND p.fire_exchange = 'KRX'
      AND p.market = 'Q' AND p.wire = 0),
  '09:00:27/101,09:00:29/104',
  '(2026-10-30, KYOBO119, A, KRX, Q, wire 0) 두 행 — 09:00:27/101 · 09:00:29/104(재확인 회차가 본회차를 덮지 않는다)'
);
SELECT is(
  (SELECT string_agg(to_char(p.fire_base, 'HH24:MI:SS') || '/' || p.seq, ',' ORDER BY p.fire_base)
     FROM public.launch_pieces p
    WHERE p.trade_date = '2026-10-30' AND p.gateway = 'KYOBO119' AND p.profile = 'A' AND p.fire_exchange = 'KRX'
      AND p.market = 'Q' AND p.wire = 1),
  '09:00:27/102', '(2026-10-30, KYOBO119, A, KRX, Q, wire 1) 한 행 — 09:00:27/102'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces p
    WHERE p.trade_date = '2026-10-30' AND p.gateway = 'KYOBO119' AND p.profile = 'A' AND p.fire_exchange = 'KRX'),
  3, '(2026-10-30, KYOBO119, A, KRX, *, 조각 총수) = 3'
);

-- ── 2. 머리도 회차마다 한 행 ─────────────────────────────────────
SELECT is(
  (SELECT string_agg(to_char(h.fire_base, 'HH24:MI:SS') || '/' || h.seq || '/' || h.n_pieces, ',' ORDER BY h.fire_base)
     FROM public.launch_heads h
    WHERE h.trade_date = '2026-10-30' AND h.gateway = 'KYOBO119' AND h.profile = 'A' AND h.fire_exchange = 'KRX'
      AND h.market = 'Q'),
  '09:00:27/103/2,09:00:29/105/1',
  '(2026-10-30, KYOBO119, A, KRX, Q, 머리) 두 행 — 09:00:27/103/n_pieces 2 · 09:00:29/105/n_pieces 1'
);

-- ── 3. 주문 내역 RPC ────────────────────────────────────────────
SELECT is(
  (SELECT string_agg((x->>'fire_base') || ' w' || (x->>'wire'), ',' ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261030')->'pieces') WITH ORDINALITY AS t(x, o)),
  '09:00:27 w0,09:00:27 w1,09:00:29 w0',
  '(2026-10-30, launch_orders_for_admin, A, KRX, Q, pieces 순서) = 09:00:27 w0 · 09:00:27 w1 · 09:00:29 w0'
);
SELECT is(
  (SELECT string_agg(x->>'fire_base', ',' ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261030')->'heads') WITH ORDINALITY AS t(x, o)),
  '09:00:27,09:00:29',
  '(2026-10-30, launch_orders_for_admin, A, KRX, Q, heads fire_base) = 09:00:27 · 09:00:29'
);

-- ── 4. 재적용 · 재해석 멱등 ──────────────────────────────────────
INSERT INTO t_apply
SELECT 'k1_again', public.dma_strategy_apply('KYOBO119', 'k1', jsonb_build_array(
  pg_temp.apiece(101, 90027000, 0, '53200003'),
  pg_temp.apiece(102, 90027000, 1, '53200004'),
  pg_temp.ahead(103, 90027000, 2),
  pg_temp.apiece(104, 90029000, 0, '53200005'),
  pg_temp.ahead(105, 90029000, 1)
));
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors')::text FROM t_apply WHERE label = 'k1_again'),
  '(0,5,[])', '(2026-10-30, KYOBO119 k1, A, KRX, Q, 같은 배치 재적용) (applied, skipped, errors) = (0, 5, [])'
);
SELECT is(pg_temp.snap(), (SELECT s FROM t_snap WHERE label = 'apply'),
  '(2026-10-30, KYOBO119, A, KRX, Q, 재적용 뒤 스냅숏) 두 표 불변(updated_at · created_at 제외)');

INSERT INTO t_apply SELECT 'rp1', public.launch_reproject('2026-10-30', '2026-10-30');
INSERT INTO t_apply SELECT 'rp2', public.launch_reproject('2026-10-30', '2026-10-30');
SELECT is(
  (SELECT row((r->>'projected')::int, r->'errors')::text FROM t_apply WHERE label = 'rp1'),
  '(5,[])', '(2026-10-30, launch_reproject 1회, A, KRX, Q, (projected, errors)) = (5, [])'
);
SELECT is(
  (SELECT row((r->>'projected')::int, r->'errors')::text FROM t_apply WHERE label = 'rp2'),
  '(5,[])', '(2026-10-30, launch_reproject 2회, A, KRX, Q, (projected, errors)) = (5, [])'
);
SELECT is(pg_temp.snap(), (SELECT s FROM t_snap WHERE label = 'apply'),
  '(2026-10-30, KYOBO119, A, KRX, Q, 재해석 두 번 뒤 스냅숏) 두 표 불변(같은 seq 재해석 멱등)');

-- ── 5. 조건부 덮기 규칙(새 키 안에서) ────────────────────────────
-- backfill 은 journal 행을 못 덮는다.
INSERT INTO t_apply SELECT 'bf', public.launch_backfill_apply(
  '[{"trade_date":"2026-10-30","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"Q","wire":0,"sent_rel_us":-1,"result":"101"},
    {"trade_date":"2026-10-30","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:29","market":"Q","wire":0,"sent_rel_us":-1,"result":"101"}]'::jsonb,
  '[{"trade_date":"2026-10-30","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"Q","n_pieces":9},
    {"trade_date":"2026-10-30","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:29","market":"Q","n_pieces":9}]'::jsonb);
SELECT is(
  (SELECT row((r->>'pieces_written')::int, (r->>'heads_written')::int)::text FROM t_apply WHERE label = 'bf'),
  '(0,0)', '(2026-10-30, KYOBO119, A, KRX, Q, 같은 키 backfill 조각 2 · 머리 2) (pieces_written, heads_written) = (0, 0)'
);
SELECT is(pg_temp.snap(), (SELECT s FROM t_snap WHERE label = 'apply'),
  '(2026-10-30, KYOBO119, A, KRX, Q, backfill 뒤 스냅숏) 행은 source journal 그대로(두 표 불변)');

-- journal 은 backfill 을 덮는다(2026-10-29 · 09:00:29 재확인 키).
INSERT INTO t_apply SELECT 'bf29', public.launch_backfill_apply(
  '[{"trade_date":"2026-10-29","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:29","market":"Q","wire":0,"sent_rel_us":-1,"result":"101"}]'::jsonb,
  '[]'::jsonb);
SELECT is(
  (SELECT (r->>'pieces_written')::int FROM t_apply WHERE label = 'bf29'),
  1, '(2026-10-29, KYOBO119, A, KRX, Q, 09:00:29 wire 0 backfill) pieces_written = 1(전제)'
);
INSERT INTO t_apply
SELECT 'k1_29', public.dma_strategy_apply('KYOBO119', 'k1', jsonb_build_array(
  pg_temp.apiece(201, 90029000, 0, '53200009', '2026-10-29')
));
SELECT is(
  (SELECT row(p.source, p.seq, p.sent_rel_us, p.result)::text FROM public.launch_pieces p
    WHERE p.trade_date = '2026-10-29' AND p.gateway = 'KYOBO119' AND p.profile = 'A' AND p.fire_exchange = 'KRX'
      AND p.fire_base = '09:00:29' AND p.market = 'Q' AND p.wire = 0),
  '(journal,201,-150,접수)', '(2026-10-29, KYOBO119, A, KRX, Q, 09:00:29 wire 0 kind 17 seq 201) backfill 행을 journal 이 덮는다'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces p WHERE p.trade_date = '2026-10-29' AND p.gateway = 'KYOBO119'),
  1, '(2026-10-29, KYOBO119, A, KRX, Q, 조각 수) = 1(같은 키라 새 행이 아니라 덮기)'
);

-- 같은 epoch 의 낮은 seq 는 거절.
SELECT is(
  public.launch_upsert_piece(
    '{"trade_date":"2026-10-30","gateway":"KYOBO119","profile":"A","fire_exchange":"KRX","fire_base":"09:00:29","market":"Q","wire":0,
      "sent_rel_us":-1,"result":"101","journal_epoch":"k1","seq":99}'::jsonb, 'journal'),
  false, '(2026-10-30, KYOBO119, A, KRX, Q, 09:00:29 wire 0 journal k1 seq 99) launch_upsert_piece = false(같은 epoch 낮은 seq)'
);
SELECT is(
  (SELECT p.seq FROM public.launch_pieces p
    WHERE p.trade_date = '2026-10-30' AND p.gateway = 'KYOBO119' AND p.profile = 'A' AND p.fire_exchange = 'KRX'
      AND p.fire_base = '09:00:29' AND p.market = 'Q' AND p.wire = 0),
  104::bigint, '(2026-10-30, KYOBO119, A, KRX, Q, 09:00:29 wire 0) seq 104 그대로'
);

-- ── 6. PK 열 · 권한 ─────────────────────────────────────────────
SELECT col_is_pk('public', 'launch_pieces',
  ARRAY['trade_date', 'gateway', 'profile', 'fire_exchange', 'fire_base', 'market', 'wire']::name[],
  '(launch_pieces, PK) = (trade_date, gateway, profile, fire_exchange, fire_base, market, wire)');
SELECT col_is_pk('public', 'launch_heads',
  ARRAY['trade_date', 'gateway', 'profile', 'fire_exchange', 'fire_base', 'market']::name[],
  '(launch_heads, PK) = (trade_date, gateway, profile, fire_exchange, fire_base, market)');
SELECT is(
  row(has_function_privilege('anon', 'public.launch_upsert_piece(jsonb, text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.launch_upsert_piece(jsonb, text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.launch_upsert_piece(jsonb, text)', 'EXECUTE'))::text,
  '(f,f,t)', '(launch_upsert_piece, EXECUTE) (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.launch_upsert_head(jsonb, text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.launch_upsert_head(jsonb, text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.launch_upsert_head(jsonb, text)', 'EXECUTE'))::text,
  '(f,f,t)', '(launch_upsert_head, EXECUTE) (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish();
ROLLBACK;
