-- ============================================================
-- quick 261103-pei — 발사 조각 대기열 값 표 · RPC pgTAP.
--
-- 대상: 20261104200000_launch_piece_queue.sql(launch_piece_queue 표 · launch_queue_inputs · launch_queue_set ·
--       launch_queue_pending 새 함수 · tick_convert_candidates · launch_orders_for_admin 교체).
--
-- 잠그는 것:
--   - 권한: 함수 5개 anon · authenticated EXECUTE 없음 · service_role 있음 · SECURITY INVOKER · 표는 anon · authenticated SELECT 없음
--   - inputs = 그날 접수 ∧ 대상 profile(Q16 · N · A) ∧ isin · side · price · qty 조각만 · 정렬 fire_exchange, isin, fire_base,
--     gateway, wire · fills = 저널 E ∧ exec_qty > 0 ∧ gateway · trade_date · order_no 일치 ∧ (조각 account null 또는 일치)
--     · gw_time, seq 순 · order_no null 이면 []
--   - set = 있는 조각만(없는 키 0) · object_path null 이거나 지금 tick_grids 경로와 같을 때만 · 다시 부르면 덮음 · 반환 = 쓴 행 수 ·
--     CHECK(kind · end_state · run 의 end_* · queue 의 fill_*) 위반은 오류 · 조각을 지우면 값도 지운다(CASCADE)
--   - pending = 그 격자 경로로 계산된 값이 없는 대상 조각이 있는 격자(date 내림차순 · 범위) + no_grid(격자도 값도 없는 키 수)
--   - candidates 에 launch 키 · 주문 내역 조각마다 queue(값 있으면 14칸 · 없으면 null)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_piece_queue.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 픽스처 날짜 2026-10-30 · 2026-10-29 · 계좌 문자열은 가짜(LPQ-ACC1 …).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(31);

-- ── 픽스처: 조각 ─────────────────────────────────────────────────
-- P1 Q16 접수 · P2 Q16 거부(101) · P3 N 매도 접수 · P4 N 매수 접수(order_no null) · P5 모르는 profile 접수 ·
-- P6 A 교보 접수(account null) · P7 10/29 Q16 접수
INSERT INTO public.launch_pieces
  (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, side, order_no, sent_rel_us, result,
   isin, price, qty, account, source)
VALUES
  ('2026-10-30', 'KB120',    'Q16', 'KRX', '16:00:00', 'Q', 0, 'buy',  'LPQ-Q1',     -300, '접수', 'KR7184230001', 2575,   100, 'LPQ-ACC1', 'backfill'),
  ('2026-10-30', 'KB120',    'Q16', 'KRX', '16:00:00', 'Q', 1, 'buy',  NULL,         -900, '101',  'KR7184230001', 2575,   100, 'LPQ-ACC1', 'backfill'),
  ('2026-10-30', 'KB120',    'N',   'NXT', '09:00:30', 'Q', 0, 'sell', '3405000033',  100, '접수', 'KR7376900007', 17910,  281, 'LPQ-ACC1', 'backfill'),
  ('2026-10-30', 'KB120',    'N',   'NXT', '09:00:30', 'K', 0, 'buy',  NULL,          100, '접수', 'KR7005930003', 222500, 22,  'LPQ-ACC1', 'backfill'),
  ('2026-10-30', 'KB120',    'X',   'KRX', '16:00:00', 'Q', 2, 'buy',  NULL,          100, '접수', NULL,           2575,   1,   'LPQ-ACC1', 'backfill'),
  ('2026-10-30', 'KYOBO119', 'A',   'KRX', '09:00:27', 'Q', 0, 'buy',  '53200000',    100, '접수', 'KR7376900007', 17770,  56,  NULL,       'backfill'),
  ('2026-10-29', 'KB120',    'Q16', 'KRX', '16:00:00', 'Q', 0, 'buy',  NULL,         -300, '접수', 'KR7060900008', 2140,   10,  'LPQ-ACC1', 'backfill');

-- ── 픽스처: 체결 저널 ─────────────────────────────────────────────
-- P3(3405000033 · LPQ-ACC1): seq 3 이 가장 이른 gw_time · seq 1 · 2 는 같은 gw_time(→ seq 순).
-- 빠져야 할 것: exec_qty 0 · 접수 통보 A · 다른 계좌 · 다른 게이트웨이 · 다른 날짜.
-- P6(53200000 · 조각 account null): 어느 계좌든.
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side, order_no,
                                       notice_type, exchange, exec_price, exec_qty) VALUES
  ('KB120',    'ep-lpq', 1, '2026-10-30', '2026-10-30 09:00:30.200+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 50),
  ('KB120',    'ep-lpq', 2, '2026-10-30', '2026-10-30 09:00:30.200+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 31),
  ('KB120',    'ep-lpq', 3, '2026-10-30', '2026-10-30 09:00:30.100+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18010, 200),
  ('KB120',    'ep-lpq', 4, '2026-10-30', '2026-10-30 09:00:30.300+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 0),
  ('KB120',    'ep-lpq', 5, '2026-10-30', '2026-10-30 09:00:30.050+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'A', 'NXT', 17910, 281),
  ('KB120',    'ep-lpq', 6, '2026-10-30', '2026-10-30 09:00:30.400+09', 'LPQ-ACC2', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 7),
  ('KYOBO119', 'ep-lpq', 1, '2026-10-30', '2026-10-30 09:00:30.400+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 8),
  ('KB120',    'ep-lpq', 7, '2026-10-29', '2026-10-29 09:00:30.400+09', 'LPQ-ACC1', 'KR7376900007', 'S', '3405000033', 'E', 'NXT', 18000, 9),
  ('KYOBO119', 'ep-lpq', 2, '2026-10-30', '2026-10-30 09:00:27.100+09', 'LPQ-ACC9', 'KR7376900007', 'B', '53200000',   'E', 'KRX', 17770, 5);

-- 격자 메타 한 행.
CREATE FUNCTION pg_temp.grow(p_date text, p_ex text, p_isin text, p_mode text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'date', p_date, 'exchange', p_ex, 'isin', p_isin, 'sources', '[]'::jsonb,
    'object_path', 'grid/' || p_date || '/' || p_ex || '/' || p_isin || '.' || p_mode || '.ticks.zst',
    'bytes', 1000, 'records', 50, 'a3_count', 20)
$$;
-- 값 한 행(set 입력).
CREATE FUNCTION pg_temp.qrow(p_gw text, p_profile text, p_ex text, p_base text, p_market text, p_wire integer,
                             p_path text, p_kind text, p_rank integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'trade_date', '20261030', 'gateway', p_gw, 'profile', p_profile, 'fire_exchange', p_ex, 'fire_base', p_base,
    'market', p_market, 'wire', p_wire, 'object_path', p_path, 'kind', p_kind, 'matched', true, 'rank', p_rank,
    'ahead_n', CASE WHEN p_kind = 'run' THEN 0 END, 'ahead_qty', 68808, 'ahead_amt', 177180600,
    'end_state', CASE WHEN p_kind = 'queue' THEN 'open' END, 'end_n', CASE WHEN p_kind = 'queue' THEN 4 END,
    'end_qty', CASE WHEN p_kind = 'queue' THEN 30560 END, 'end_amt', CASE WHEN p_kind = 'queue' THEN 78692000 END,
    'fill_qty', CASE WHEN p_kind = 'run' THEN 281 END, 'fill_px_min', CASE WHEN p_kind = 'run' THEN 18000 END,
    'fill_px_max', CASE WHEN p_kind = 'run' THEN 18010 END, 'order_est', false)
$$;
CREATE FUNCTION pg_temp.piece(p_date text, p_gw text, p_profile text, p_wire integer, p_market text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(public.launch_orders_for_admin(p_date)->'pieces') e
   WHERE e->>'gateway' = p_gw AND e->>'profile' = p_profile AND (e->>'wire')::int = p_wire AND e->>'market' = p_market
$$;

-- ── A. 권한 ────────────────────────────────────────────────────────
CREATE TEMP TABLE t_fn (sig text PRIMARY KEY);
INSERT INTO t_fn VALUES
  ('public.launch_queue_inputs(text)'), ('public.launch_queue_set(jsonb)'), ('public.launch_queue_pending(text, text)'),
  ('public.tick_convert_candidates(text)'), ('public.launch_orders_for_admin(text)');

SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, f.sig, 'EXECUTE'))
                 FROM t_fn f, unnest(ARRAY['anon', 'authenticated']) r),
          'A 함수 5 — anon · authenticated EXECUTE 불가');
SELECT ok((SELECT bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE')) FROM t_fn f),
          'A 함수 5 — service_role EXECUTE 가능');
SELECT ok((SELECT bool_and(NOT p.prosecdef) FROM pg_proc p WHERE p.oid IN (SELECT f.sig::regprocedure FROM t_fn f)),
          'A 함수 5 — SECURITY INVOKER');
SELECT ok(NOT has_table_privilege('anon', 'public.launch_piece_queue', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.launch_piece_queue', 'SELECT')
          AND has_table_privilege('service_role', 'public.launch_piece_queue', 'SELECT'),
          'A 표 launch_piece_queue — anon · authenticated SELECT 없음 · service_role 있음');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'launch_piece_queue'), 0,
          'A 표 RLS 정책 0(서비스롤 전용)');

-- ── B. inputs ─────────────────────────────────────────────────────
SELECT is((SELECT jsonb_agg(e->>'fire_exchange' || ' ' || (e->>'isin') || ' ' || (e->>'gateway') || ' ' || (e->>'profile')
                            || ' ' || (e->>'wire') ORDER BY o)
             FROM jsonb_array_elements(public.launch_queue_inputs('20261030')) WITH ORDINALITY AS x(e, o)),
          '["KRX KR7184230001 KB120 Q16 0", "KRX KR7376900007 KYOBO119 A 0", "NXT KR7005930003 KB120 N 0", "NXT KR7376900007 KB120 N 0"]'::jsonb,
          'B inputs = 접수 ∧ 대상 profile 조각만(거부 · 모르는 profile 제외) · fire_exchange, isin, fire_base, gateway, wire 순');
SELECT is((SELECT e FROM jsonb_array_elements(public.launch_queue_inputs('20261030')) e WHERE e->>'profile' = 'Q16'),
          '{"trade_date": "20261030", "gateway": "KB120", "profile": "Q16", "fire_exchange": "KRX", "fire_base": "16:00:00",
            "market": "Q", "wire": 0, "side": "buy", "isin": "KR7184230001", "price": 2575, "qty": 100, "fills": []}'::jsonb,
          'B inputs 행 모양 — 7키(YYYYMMDD · HH24:MI:SS) · side · isin · price · qty · fills(저널 없음 → [])');
SELECT is((SELECT e->'fills' FROM jsonb_array_elements(public.launch_queue_inputs('20261030')) e
            WHERE e->>'profile' = 'N' AND e->>'side' = 'sell'),
          '[[18010, 200], [18000, 50], [18000, 31]]'::jsonb,
          'B fills = E ∧ exec_qty > 0 ∧ 같은 gateway · 날짜 · order_no · 계좌 · gw_time, seq 순(0 · A · 다른 계좌 · 게이트웨이 · 날짜 제외)');
SELECT is((SELECT e->'fills' FROM jsonb_array_elements(public.launch_queue_inputs('20261030')) e
            WHERE e->>'profile' = 'N' AND e->>'side' = 'buy'),
          '[]'::jsonb, 'B fills — order_no null 이면 []');
SELECT is((SELECT e->'fills' FROM jsonb_array_elements(public.launch_queue_inputs('20261030')) e WHERE e->>'profile' = 'A'),
          '[[17770, 5]]'::jsonb, 'B fills — 조각 account null 이면 계좌를 맞추지 않는다');
SELECT is(public.launch_queue_inputs('20261031'), '[]'::jsonb, 'B 조각 없는 날 → []');
SELECT throws_ok($$SELECT public.launch_queue_inputs('2026-10-30')$$, '22023', NULL, 'B p_date 형식 오류 → 22023');

-- ── C. set ────────────────────────────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7184230001', 'nightly'))), 1,
          'C 픽스처 — 10/30 KRX 184230 격자');
SELECT is(public.launch_queue_set(jsonb_build_array(
            pg_temp.qrow('KB120', 'Q16', 'KRX', '16:00:00', 'Q', 0, 'grid/20261030/KRX/KR7184230001.nightly.ticks.zst', 'queue', 9),
            pg_temp.qrow('KB120', 'N', 'NXT', '09:00:30', 'Q', 0, NULL, 'run', 1),
            pg_temp.qrow('KB120', 'Q16', 'KRX', '16:00:00', 'Q', 9, NULL, 'queue', 3))), 2,
          'C set — 격자 경로 일치 1 + object_path null 1 = 2 · 없는 조각 키(wire 9)는 버린다');
SELECT is(public.launch_queue_set(jsonb_build_array(
            pg_temp.qrow('KB120', 'Q16', 'KRX', '16:00:00', 'Q', 0, 'grid/20261030/KRX/KR7184230001.request.ticks.zst', 'queue', 99))), 0,
          'C set — 지금 격자 경로와 다르면 쓰지 않는다(0)');
SELECT is((SELECT rank FROM public.launch_piece_queue WHERE gateway = 'KB120' AND profile = 'Q16' AND wire = 0), 9,
          'C 경로 다른 set 뒤에도 값 그대로(9)');
SELECT is(public.launch_queue_set(jsonb_build_array(
            pg_temp.qrow('KB120', 'Q16', 'KRX', '16:00:00', 'Q', 0, 'grid/20261030/KRX/KR7184230001.nightly.ticks.zst', 'queue', 10))), 1,
          'C set 다시 — 덮는다(1)');
SELECT is((SELECT rank FROM public.launch_piece_queue WHERE gateway = 'KB120' AND profile = 'Q16' AND wire = 0), 10,
          'C 다시 부른 값으로 덮였다(10)');
SELECT throws_ok(
  $$SELECT public.launch_queue_set(jsonb_build_array(
      pg_temp.qrow('KB120', 'N', 'NXT', '09:00:30', 'Q', 0, NULL, 'bogus', 1)))$$,
  '23514', NULL, 'C CHECK — kind 는 queue | run');
SELECT throws_ok(
  $$SELECT public.launch_queue_set(jsonb_build_array(
      pg_temp.qrow('KB120', 'N', 'NXT', '09:00:30', 'Q', 0, NULL, 'run', 1) || '{"end_state": "open"}'::jsonb))$$,
  '23514', NULL, 'C CHECK — run 에 end_* 가 있으면 오류');
SELECT throws_ok(
  $$SELECT public.launch_queue_set(jsonb_build_array(
      pg_temp.qrow('KB120', 'Q16', 'KRX', '16:00:00', 'Q', 0, NULL, 'queue', 1) || '{"end_state": "gone"}'::jsonb))$$,
  '23514', NULL, 'C CHECK — end_state 는 open | cancelled | filled');
SELECT throws_ok($$SELECT public.launch_queue_set('{}'::jsonb)$$, '22023', NULL, 'C p_rows 배열 아님 → 22023');

-- ── D. 주문 내역 queue · candidates ────────────────────────────────
SELECT is(pg_temp.piece('20261030', 'KB120', 'Q16', 0, 'Q')->'queue',
          '{"kind": "queue", "matched": true, "rank": 10, "ahead_n": null, "ahead_qty": 68808, "ahead_amt": 177180600,
            "end_state": "open", "end_n": 4, "end_qty": 30560, "end_amt": 78692000, "fill_qty": null, "fill_px_min": null,
            "fill_px_max": null, "order_est": false}'::jsonb,
          'D 주문 내역 조각 queue = 값 14칸(키 · object_path · computed_at 없음)');
SELECT is(pg_temp.piece('20261030', 'KB120', 'Q16', 1, 'Q')->'queue', 'null'::jsonb,
          'D 값 없는 조각(거부) → queue null(키는 있다)');
SELECT is(public.tick_convert_candidates('20261030')->'launch',
          '["KR7005930003", "KR7184230001", "KR7376900007"]'::jsonb,
          'D candidates.launch = 그날 접수 조각 ISIN(중복 없음 · 정렬 · 거부 · isin null 제외)');

-- ── E. pending ────────────────────────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(
            pg_temp.grow('20261030', 'KRX', 'KR7376900007', 'nightly'),
            pg_temp.grow('20261029', 'KRX', 'KR7060900008', 'nightly'))), 2,
          'E 픽스처 — 10/30 KRX 376900 · 10/29 KRX 060900 격자');
SELECT is(public.launch_queue_pending(),
          '{"grids": [{"date": "20261030", "exchange": "KRX", "isin": "KR7376900007",
                       "object_path": "grid/20261030/KRX/KR7376900007.nightly.ticks.zst", "bytes": 1000},
                      {"date": "20261029", "exchange": "KRX", "isin": "KR7060900008",
                       "object_path": "grid/20261029/KRX/KR7060900008.nightly.ticks.zst", "bytes": 1000}],
            "no_grid": 1}'::jsonb,
          'E pending — 값 없는 대상 조각의 격자(date DESC) · 계산된 격자 제외 · no_grid = 격자도 값도 없는 키(NXT 005930)');
SELECT is(public.launch_queue_pending('20261030', '20261030')->'grids' -> 0 ->> 'isin', 'KR7376900007',
          'E pending 범위 — 10/30 만');
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7184230001', 'request'))), 1,
          'E 픽스처 — 184230 격자 경로가 바뀜');
SELECT ok(public.launch_queue_pending('20261030', '20261030')->'grids' @> '[{"isin": "KR7184230001"}]'::jsonb,
          'E pending — 격자가 바뀌면(다른 object_path 로 계산된 값) 다시 대상');

-- ── F. CASCADE ────────────────────────────────────────────────────
DELETE FROM public.launch_pieces WHERE trade_date = '2026-10-30' AND gateway = 'KB120' AND profile = 'Q16' AND wire = 0;
SELECT is((SELECT count(*)::int FROM public.launch_piece_queue WHERE profile = 'Q16'), 0, 'F 조각을 지우면 값도 지운다(CASCADE)');

SELECT * FROM finish();
ROLLBACK;
