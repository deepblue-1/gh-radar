-- ============================================================
-- Phase 09.1 Plan 01: intraday_upsert_close(jsonb) RPC (STEP 1)
--
-- 결정 근거 (09.1-CONTEXT.md / 09.1-RESEARCH.md §3.1):
--   D-33: STEP1 의 1,898 종목 close/change/volume + 09:00 첫 cycle INSERT 시
--         OHL = close 임시 초기화 (RPC #2 가 hot set 정확값으로 후속 덮어쓰기)
--   ON CONFLICT DO UPDATE branch:
--     - close  = EXCLUDED.close (현재가)
--     - high   = GREATEST(stock_daily_ohlcv.high, EXCLUDED.close) — 단조 갱신
--     - low    = LEAST(stock_daily_ohlcv.low, EXCLUDED.close)    — 단조 갱신
--     - volume / trade_amount / change_amount / change_rate
--     - open: 의도적 omit (첫 INSERT 만 set, STEP2 가 정확값으로 덮어쓰기)
--   D-23: trade_amount = volume × close 근사값 (트레이딩 시그널 용도)
--   D-35 / MEMORY feedback_supabase_rpc_revoke:
--         REVOKE FROM PUBLIC + REVOKE FROM anon, authenticated 둘 다 명시
--   T-09.1-01: SECURITY DEFINER + service_role only EXECUTE
--   T-09.1-03: open 의도적 omit (Tampering accept — RPC #2 + EOD 17:30 overlay 보완)
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.intraday_upsert_close(
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r jsonb;
  affected integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.stock_daily_ohlcv
      (code, date, open, high, low, close, volume, trade_amount, change_amount, change_rate, inserted_at)
    VALUES (
      r->>'code',
      (r->>'date')::date,
      (r->>'close')::numeric(20,2),    -- INSERT 시: open = cur_prc 임시 (D-33)
      (r->>'close')::numeric(20,2),    -- INSERT 시: high = cur_prc 임시
      (r->>'close')::numeric(20,2),    -- INSERT 시: low  = cur_prc 임시
      (r->>'close')::numeric(20,2),
      (r->>'volume')::bigint,
      (r->>'trade_amount')::bigint,    -- D-22, D-23: volume × close 근사값
      NULLIF(r->>'change_amount', '')::numeric(20,2),
      NULLIF(r->>'change_rate', '')::numeric(10,4),
      now()
    )
    ON CONFLICT (code, date) DO UPDATE
      SET close         = EXCLUDED.close,
          high          = GREATEST(stock_daily_ohlcv.high, EXCLUDED.close),
          low           = LEAST(stock_daily_ohlcv.low, EXCLUDED.close),
          volume        = EXCLUDED.volume,
          trade_amount  = EXCLUDED.trade_amount,
          change_amount = EXCLUDED.change_amount,
          change_rate   = EXCLUDED.change_rate,
          inserted_at   = now();
          -- open: 의도적 omit (첫 INSERT 만 set, STEP2 의 intraday_upsert_ohlc 가 정확값 덮어쓰기)
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.intraday_upsert_close(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.intraday_upsert_close(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intraday_upsert_close(jsonb) TO service_role;

COMMIT;
