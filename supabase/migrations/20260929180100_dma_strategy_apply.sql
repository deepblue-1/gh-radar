-- ============================================================
-- Phase 25 Plan 01 — 전략 이벤트 적용 RPC `dma_strategy_apply(text, text, jsonb)`.
--
-- relay 전략 기록기(`relay/src/journal/strategy-stream.ts` — `STRATEGY_STREAM`)의 유일한 적재 경로다.
-- 입력 이벤트 키 43종은 `STRATEGY_APPLY_KEYS`(= 와이어 `table StrategyEvent` 필드명 snake_case)와 1:1 이다 —
-- 하나라도 이름이 틀리면 그 값이 0/''/false 로 조용히 적재되므로 relay 테스트가 키 집합을 잠근다.
--
-- 결정 근거:
--   - **별도 트랜잭션 · 별도 advisory 키.** 주문 적용(`dma_journal_apply` — 키 'dma_journal:'||gateway)과 다른 키
--     'dma_strategy:'||gateway 를 쓴다 — 두 스트림 적용이 서로 기다리지 않는다(같은 게이트웨이의 같은 스트림만 직렬화).
--   - **삽입뿐(투영 없음).** `INSERT … ON CONFLICT DO NOTHING RETURNING *` — 충돌 = 이미 적재된 seq(재생 멱등).
--   - **필수 3키(seq · trade_date · gw_time_ms)는 엄격 캐스트** — 형식 오류 · 누락은 배치 전체 실패(계약 위반 ·
--     relay 기록기가 같은 배치를 재시도하며 드러낸다). 나머지 키는 coalesce(0 / '' / false / '{}') — 없는 값은 0/"" 인
--     와이어 규약과 같다.
--   - **커서는 전략 칸만.** 행이 없으면 `(gateway, journal_epoch = p_epoch, last_seq = 0, strategy_journal_epoch =
--     p_epoch, strategy_last_seq = max)` 로 만들고(주문 칸은 NOT NULL 이라 같은 epoch · 0 으로 채운다 — 주문 기록기는
--     last_seq 0 을 「since 0」 으로 읽어 결과가 같다), 충돌이면 `strategy_journal_epoch` · `strategy_last_seq` ·
--     `updated_at` **만** 고친다 — 같은 epoch 면 GREATEST, 다르면(resync · 저장소 교체) 교체. `journal_epoch` ·
--     `last_seq` 는 건드리지 않는다. 주문 적용의 upsert 도 전략 칸을 건드리지 않아 두 스트림이 한 행에서 독립이다.
--   - **반환 rows = 삽입분만 · 공개 45키.** `to_jsonb(e) - 'dma_user_id' - 'applied_at' || stock_code`(stocks 조인) ·
--     seq 오름차순. 주문자는 싣지 않는다(T-19-08). relay 가 이 rows 를 `journal.events` 로 푸시한다.
--   - 반환 모양은 `dma_journal_apply` 와 같다(`applied · skipped · errors · last_seq · rows`) — relay 기록기의 형식 검사
--     (`isApplyResult`)를 그대로 쓴다. 투영이 없어 `errors` 는 늘 빈 배열이다.
--
-- 하지 않는 것:
--   - enum 값 검사 — 원문 보존(G1 ⓓ · 테이블 마이그레이션 머리 주석).
--   - 원격 적용 — 25-11 에서 사용자가 `supabase db push` 한다.
-- ============================================================

BEGIN;

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

    -- 이미 적재된 seq — 재생 멱등의 유일한 근거.
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;
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
    'errors',   '[]'::jsonb,
    'last_seq', coalesce(v_last, 0),
    'rows',     v_rows
  );
END;
$$;

-- ── 권한: service_role 전용 (시그니처 정확히 — Pitfall 10 · 메모리 「RPC 는 REVOKE anon/authenticated 명시」) ──
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_apply(text, text, jsonb) TO service_role;

COMMIT;
