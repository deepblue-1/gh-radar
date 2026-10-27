-- ============================================================
-- Phase 35 Plan 04 — kind 17(LaunchPiece) · 18(LaunchHead) DB 쪽 해석 배선 pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261027200100_launch_gate_apply.sql
--   (launch_project_event 스텁 · dma_strategy_apply 재정의)
--
-- 잠그는 것:
--   - 트레이서: kind 1 · 17 · 18 이 섞인 한 배치 → applied 3 · rows 길이 1(kind 1 만) · 원문 3행 ·
--     launch_pieces 1 · launch_heads 1(source journal · 추적 열은 원문 epoch · seq) · 커서 전진.
--
-- 테스트 매핑은 정식 매핑이 아니다 — 칸 매핑은 gh-trade 노트 뒤 35-10 이 정한다. 이 파일은 테스트 트랜잭션 안에서
-- `launch_project_event` 를 테스트용 가짜 매핑(reason_code → profile · exchange → fire_exchange · message → market ·
-- entry_round → wire · price → sent_rel_us · result_code → result · qty → n_pieces)으로 `CREATE OR REPLACE` 해
-- apply 배선만 증명한다. 끝의 ROLLBACK 으로 사라진다.
-- 매핑 버전은 t_mode 한 칸으로 고른다: 'map'(가짜 매핑) · 'boom'(RAISE — 포이즌) · 'stub'(no-op — Wave A 와 같음).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate_apply.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
--
-- 단언 설명에는 (게이트웨이 epoch seq, kind, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 전략 이벤트 1건 — relay `STRATEGY_APPLY_KEYS` 43키 전부(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
-- (dma_strategy_apply.test.sql 의 헬퍼 + 거래일 인자)
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT '2026-09-29'
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

-- 발사 조각(kind 17) 1건 — 프로파일 · 시장 · wire · 상대 발사 시각(µs) · 결과코드.
CREATE FUNCTION pg_temp.piece(
  p_seq bigint, p_profile text, p_wire int, p_rel int, p_result int DEFAULT 101,
  p_date text DEFAULT '2026-09-29', p_over jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 17, 0, '', '', '15:59:59.700', jsonb_build_object(
    'reason_code', p_profile, 'message', 'K', 'entry_round', p_wire, 'price', p_rel, 'result_code', p_result
  ) || p_over, p_date)
$$;

-- 발사 머리(kind 18) 1건 — 조각 수는 qty.
CREATE FUNCTION pg_temp.head(
  p_seq bigint, p_profile text, p_n int, p_date text DEFAULT '2026-09-29'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 18, 0, '', '', '16:00:01.000', jsonb_build_object(
    'reason_code', p_profile, 'message', 'K', 'qty', p_n
  ), p_date)
$$;

-- 테스트 매핑 스위치 · 호출 계수.
CREATE TEMP TABLE t_mode (mode text NOT NULL);
INSERT INTO t_mode VALUES ('map');
CREATE TEMP TABLE t_calls (kind smallint NOT NULL, seq bigint NOT NULL);

-- 테스트용 가짜 매핑(정식 매핑 아님 — ROLLBACK 으로 사라진다). 같은 시그니처로 교체한다.
CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := (SELECT mode FROM pg_temp.t_mode LIMIT 1);
BEGIN
  IF v_mode = 'stub' THEN
    RETURN;
  ELSIF v_mode = 'boom' THEN
    RAISE EXCEPTION 'boom (kind %, seq %)', p_ev.kind, p_ev.seq;
  END IF;

  INSERT INTO pg_temp.t_calls VALUES (p_ev.kind, p_ev.seq);

  IF p_ev.kind = 17 THEN
    PERFORM public.launch_upsert_piece(jsonb_build_object(
      'trade_date', p_ev.trade_date, 'gateway', p_ev.gateway, 'profile', p_ev.reason_code,
      'fire_exchange', p_ev.exchange, 'fire_base', '16:00:00', 'market', p_ev.message,
      'wire', p_ev.entry_round, 'sent_rel_us', p_ev.price, 'result', p_ev.result_code::text,
      'order_no', nullif(p_ev.order_no, ''), 'account', nullif(p_ev.account_no, ''),
      'dma_user_id', nullif(p_ev.dma_user_id, ''),
      'journal_epoch', p_ev.journal_epoch, 'seq', p_ev.seq, 'gw_time_ms', p_ev.gw_time_ms
    ), 'journal');
  ELSIF p_ev.kind = 18 THEN
    PERFORM public.launch_upsert_head(jsonb_build_object(
      'trade_date', p_ev.trade_date, 'gateway', p_ev.gateway, 'profile', p_ev.reason_code,
      'fire_exchange', p_ev.exchange, 'fire_base', '16:00:00', 'market', p_ev.message,
      'n_pieces', p_ev.qty,
      'journal_epoch', p_ev.journal_epoch, 'seq', p_ev.seq, 'gw_time_ms', p_ev.gw_time_ms
    ), 'journal');
  END IF;
  RETURN;
END;
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

SELECT plan(7);

-- ── 1. 트레이서: kind 1 · 17 · 18 이 섞인 한 배치 ─────────────────
INSERT INTO t_apply
SELECT 'mixed', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:42:13.215', '{"ask_qty_at_limit":185400}'::jsonb),
  pg_temp.piece(2, 'Q16', 0, -305, 101),
  pg_temp.head(3, 'Q16', 3)
));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors')::text FROM t_apply WHERE label = 'mixed'),
  '(3,0,[])', '(KB120 e1 seq 1·2·3, kind 1·17·18) (applied, skipped, errors) = (3, 0, [])'
);
SELECT is(
  (SELECT row(jsonb_array_length(r->'rows'), (r->'rows'->0->>'kind')::int, (r->'rows'->0->>'seq')::int)::text
     FROM t_apply WHERE label = 'mixed'),
  '(1,1,1)', '(KB120 e1 seq 1·2·3, kind 1·17·18) rows 길이 1 · rows[0] = kind 1 seq 1 — 17·18 은 rows 에 없다(ws 푸시 0)'
);
SELECT is(
  (SELECT array_agg(kind ORDER BY seq)::text FROM public.dma_strategy_events WHERE gateway = 'KB120' AND journal_epoch = 'e1'),
  '{1,17,18}', '(KB120 e1 seq 1·2·3) 원문 3행 — kind {1, 17, 18} 모두 남는다'
);
SELECT is(
  (SELECT row(source, journal_epoch, seq, sent_rel_us, wire, result, fire_exchange, market, fire_base)::text
     FROM public.launch_pieces WHERE gateway = 'KB120' AND profile = 'Q16'),
  '(journal,e1,2,-305,0,101,KRX,K,16:00:00)',
  '(KB120 e1 seq 2, kind 17, Q16) launch_pieces 1행 (source, epoch, seq, sent_rel_us, wire, result, 거래소, 시장, 기준) = (journal, e1, 2, −305, 0, 101, KRX, K, 16:00:00)'
);
SELECT is(
  (SELECT row(source, journal_epoch, seq, n_pieces)::text FROM public.launch_heads WHERE gateway = 'KB120' AND profile = 'Q16'),
  '(journal,e1,3,3)', '(KB120 e1 seq 3, kind 18, Q16) launch_heads 1행 (source, epoch, seq, n_pieces) = (journal, e1, 3, 3)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces) + (SELECT count(*)::int FROM public.launch_heads),
  2, '(KB120 e1, kind 17·18) 두 표 합계 2행 — kind 1 은 투영되지 않는다'
);
SELECT is(
  (SELECT row(strategy_journal_epoch, strategy_last_seq, (SELECT r->>'last_seq' FROM t_apply WHERE label = 'mixed'))::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB120'),
  '(e1,3,3)', '(KB120 e1 seq 3) 전략 커서 (epoch, strategy_last_seq, 반환 last_seq) = (e1, 3, 3)'
);

SELECT * FROM finish();
ROLLBACK;
