-- ============================================================
-- Phase 35 Plan 04 — 발사 조각(kind 17 LaunchPiece) · 머리(kind 18 LaunchHead)의 DB 쪽 해석 배선(D-05 · D-06).
--
-- 목적: relay 를 바꾸지 않고 kind 17·18 원문이 `launch_pieces` · `launch_heads` 로 풀리는 자리를 만든다.
--   relay 전략 기록기는 지금처럼 `dma_strategy_apply` 하나만 부른다(같은 이름 · 시그니처 · 반환 모양).
--
-- 왜 트리거가 아니라 apply 재정의인가(RESEARCH Q1):
--   - 실패 격리: 원문 INSERT 는 예외 블록 **밖**에 두고 해석만 `BEGIN … EXCEPTION` 서브블록에 넣는다 — 해석이 실패해도
--     원문은 남고 같은 배치의 다른 이벤트 · 커서 전진은 그대로다(주문 저널 포이즌 격리 T-19-15 동형). 트리거 오류는
--     INSERT 문 오류가 되어 배치 전체가 실패하고 기록기가 같은 배치를 영구 재시도한다.
--   - 실패 보고: `errors[{seq, error}]` 로 돌려준다 → relay 의 기존 warn 로그 + /healthz projectionErrors 계수.
--   - rows 제외: kind 17·18 은 반환 rows 에 싣지 않는다 → relay 가 `journal.events` 로 푸시할 행이 없다(ws fan-out
--     누설 차단 · isMarketStrategyEvent 무변경). 트리거로는 rows 를 거를 수 없다.
--
-- 20260929180100 본문에서 바뀐 곳은 3개뿐이다 — ① DECLARE `v_errors` ② 새로 들어간 행이 kind 17·18 이면 서브블록
--   투영 후 CONTINUE(rows 에 안 실음) ③ 반환 `'errors', v_errors`. 나머지(검사 · advisory lock · 43칸 INSERT ·
--   커서 · 권한)는 글자 그대로다 — 드리프트는 dma_strategy_apply.test.sql(30 단언 · 공개 45키)이 잠근다.
--
-- 하지 않는 것:
--   - 원문 표에 칸을 더하지 않는다(공개 45키 계약 — `apply_error` 같은 칸 금지). 해석 실패 사유는 errors 로만 알리고,
--     매핑을 고친 뒤 `launch_reproject` 로 다시 푼다.
--   - 모든 이벤트에 예외 블록을 걸지 않는다 — EXCEPTION 블록은 savepoint 비용이 커서 kind 17·18 일 때만 들어간다
--     (kind 15 는 분당 수십 행).
--   - kind 15·16 보존 purge 함수(dma_strategy_events_purge_limit_feature)는 재정의하지 않는다 — 17·18 원문과
--     launch_* 는 영구 보관(D-05 · pgTAP 로 잠금).
--
-- 투영 함수 `launch_project_event` 는 Wave A 스텁이다(아무것도 안 함 = 모르는 kind 무시 → gh-trade 서버가 먼저 배포돼도
--   안전 · D-21 ③). 칸 매핑이 노트로 확정되면 35-10 이 같은 시그니처로 교체하고 `launch_reproject()` 로 쌓인 원문을 푼다.
--
-- 원격 적용: 35-09 메인 세션(`supabase db push`).
-- 되돌리기: 20260929180100(apply) · 20261018120000(json 래퍼 (나)) · 20260929190000 ⑦-②(주문 타임라인) 본문 재적용 후
--   `DROP FUNCTION public.launch_reproject(date, date); DROP FUNCTION public.launch_project_event(public.dma_strategy_events);`
-- ============================================================

BEGIN;

-- ── ① 투영 스텁 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Wave A 스텁: 칸 매핑을 아직 모른다 → 아무것도 하지 않는다(원문은 apply 가 이미 남겼다).
  -- Wave B(35-10)가 같은 시그니처로 교체 — kind 17 → launch_upsert_piece(…, 'journal') ·
  -- 18 → launch_upsert_head(…, 'journal') · 추적 열 journal_epoch · seq · gw_time_ms 는 p_ev 에서.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.launch_project_event(public.dma_strategy_events) IS
  'Phase 35 D-06 — kind 17·18 원문 1행 → launch_pieces/launch_heads 투영. Wave A 는 no-op 스텁(35-10 이 교체). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) TO service_role;

-- ── ② 전략 이벤트 적용 RPC 재정의(20260929180100 + 변경 3곳) ─────────
CREATE OR REPLACE FUNCTION public.dma_strategy_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  ev        jsonb;
  v_seq     bigint;
  v_max     bigint;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_rows    jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_row     public.dma_strategy_events%ROWTYPE;
  v_last    bigint;
BEGIN
  IF coalesce(p_gateway, '') = '' OR coalesce(p_epoch, '') = '' THEN
    RAISE EXCEPTION 'dma_strategy_apply: gateway/journal_epoch 가 비어 있다';
  END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'dma_strategy_apply: p_events 는 JSON 배열이어야 한다';
  END IF;

  -- 같은 게이트웨이의 전략 적용만 직렬화한다 — 주문 적용과 다른 키(두 스트림이 서로 기다리지 않는다).
  PERFORM pg_advisory_xact_lock(hashtext('dma_strategy:' || p_gateway));

  FOR ev IN
    SELECT value FROM jsonb_array_elements(p_events) ORDER BY (value->>'seq')::bigint
  LOOP
    v_seq := (ev->>'seq')::bigint;
    v_max := GREATEST(coalesce(v_max, 0), v_seq);

    -- 원문 적재. 필수 키(seq · trade_date · gw_time_ms) 형식 오류 · 누락은 여기서 배치 전체를 실패시킨다(계약 위반).
    INSERT INTO public.dma_strategy_events (
      gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, "group", exchange, isin, cum_volume,
      dma_user_id, account_no, order_no, price, qty, order_condition, reason_code, cond_threshold,
      cond_actual, cond_metric, ev_kind, ev_price, ev_qty_before, ev_qty_after, ev_trade_qty,
      limit_bid_qty, bid1_price, bid1_qty, accept_latency_us, immediate_fill_qty, queue_case, base_cum,
      ahead_qty, expected_cum, error_volume, remaining_volume, has_remaining, cancel_reason,
      result_code, message, entry_round, snap_qty, snap_cum, ask_qty_at_limit, open_at_limit
    ) VALUES (
      p_gateway, p_epoch, v_seq,
      (ev->>'trade_date')::date,
      (ev->>'gw_time_ms')::bigint,
      coalesce((ev->>'kind')::smallint, 0),
      coalesce((ev->>'group')::smallint, 0),
      coalesce(ev->>'exchange', ''),
      coalesce(ev->>'isin', ''),
      coalesce((ev->>'cum_volume')::bigint, 0),
      coalesce(ev->>'dma_user_id', ''),
      coalesce(ev->>'account_no', ''),
      coalesce(ev->>'order_no', ''),
      coalesce((ev->>'price')::integer, 0),
      coalesce((ev->>'qty')::integer, 0),
      coalesce(ev->>'order_condition', ''),
      coalesce(ev->>'reason_code', ''),
      coalesce((ev->>'cond_threshold')::bigint, 0),
      coalesce((ev->>'cond_actual')::bigint, 0),
      coalesce((ev->>'cond_metric')::smallint, 0),
      coalesce((ev->>'ev_kind')::smallint, 0),
      coalesce((ev->>'ev_price')::integer, 0),
      coalesce((ev->>'ev_qty_before')::bigint, 0),
      coalesce((ev->>'ev_qty_after')::bigint, 0),
      coalesce((ev->>'ev_trade_qty')::bigint, 0),
      coalesce((ev->>'limit_bid_qty')::bigint, 0),
      coalesce((ev->>'bid1_price')::integer, 0),
      coalesce((ev->>'bid1_qty')::bigint, 0),
      coalesce((ev->>'accept_latency_us')::integer, 0),
      coalesce((ev->>'immediate_fill_qty')::bigint, 0),
      coalesce((ev->>'queue_case')::smallint, 0),
      coalesce((ev->>'base_cum')::bigint, 0),
      coalesce((ev->>'ahead_qty')::bigint, 0),
      coalesce((ev->>'expected_cum')::bigint, 0),
      coalesce((ev->>'error_volume')::bigint, 0),
      coalesce((ev->>'remaining_volume')::bigint, 0),
      coalesce((ev->>'has_remaining')::boolean, false),
      coalesce((ev->>'cancel_reason')::smallint, 0),
      coalesce((ev->>'result_code')::integer, 0),
      coalesce(ev->>'message', ''),
      coalesce((ev->>'entry_round')::integer, 0),
      coalesce(ARRAY(SELECT x::bigint FROM jsonb_array_elements_text(ev->'snap_qty') x), '{}'),
      coalesce(ARRAY(SELECT x::bigint FROM jsonb_array_elements_text(ev->'snap_cum') x), '{}'),
      coalesce((ev->>'ask_qty_at_limit')::bigint, 0),
      coalesce((ev->>'open_at_limit')::boolean, false)
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_row;

    -- 이미 적재된 seq — 재생 멱등의 유일한 근거(투영도 다시 돌지 않는다).
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;

    -- 발사 조각(17) · 머리(18) — 어드민 전용 원문. 원문은 이미 남았다. 해석 실패는 이 이벤트의 서브트랜잭션만
    -- 되돌리고 errors 로 알린다(T-19-15 동형 · 원문 표에 칸을 더하지 않는다). rows 에 싣지 않는다 → relay
    -- journal.events 푸시 0(사용자 전략 이벤트가 아니다 · D-05). 서브블록은 이 두 kind 에만 들어간다(savepoint 비용).
    IF v_row.kind IN (17, 18) THEN
      BEGIN
        PERFORM public.launch_project_event(v_row);
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('seq', v_seq, 'error', SQLERRM));
      END;
      CONTINUE;
    END IF;

    -- 공개 45키 — 주문자 · 적용 시각은 빼고 종목 단축코드를 붙인다(T-19-08). 루프가 seq 오름차순이라 rows 도 그 순서다.
    v_rows := v_rows || jsonb_build_array(
      to_jsonb(v_row) - 'dma_user_id' - 'applied_at'
        || jsonb_build_object('stock_code', (SELECT s.code FROM public.stocks s WHERE s.isin = v_row.isin LIMIT 1))
    );
  END LOOP;

  -- 전략 커서 전진 — 같은 트랜잭션 · 전략 칸만. 빈 배열은 커서를 건드리지 않는다.
  IF v_max IS NOT NULL THEN
    INSERT INTO public.dma_journal_cursor AS cur
      (gateway, journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq, updated_at)
    VALUES (p_gateway, p_epoch, 0, p_epoch, v_max, now())
    ON CONFLICT (gateway) DO UPDATE SET
      strategy_journal_epoch = EXCLUDED.strategy_journal_epoch,
      strategy_last_seq = CASE
        WHEN cur.strategy_journal_epoch = EXCLUDED.strategy_journal_epoch
          THEN GREATEST(cur.strategy_last_seq, EXCLUDED.strategy_last_seq)
        ELSE EXCLUDED.strategy_last_seq
      END,
      updated_at = now();
  END IF;

  SELECT c.strategy_last_seq INTO v_last
    FROM public.dma_journal_cursor c
   WHERE c.gateway = p_gateway AND c.strategy_journal_epoch = p_epoch;

  RETURN jsonb_build_object(
    'applied',  v_applied,
    'skipped',  v_skipped,
    'errors',   v_errors,
    'last_seq', coalesce(v_last, 0),
    'rows',     v_rows
  );
END;
$$;

-- ── 권한: service_role 전용 (시그니처 정확히 — CREATE OR REPLACE 뒤에도 재명시) ──
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
