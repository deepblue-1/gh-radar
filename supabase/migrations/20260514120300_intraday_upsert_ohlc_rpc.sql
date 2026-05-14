-- ============================================================
-- Phase 09.1 Plan 01: intraday_upsert_ohlc(jsonb) RPC (STEP 2, 신규)
--
-- 결정 근거 (09.1-CONTEXT.md / 09.1-RESEARCH.md §3.2):
--   D-34: STEP2 의 hot set ~250 종목 정확 OHLC. RPC #1 의 임시값
--         (open=high=low=close) 위에 ka10001 의 정확값으로 덮어쓰기
--   D-14: hot set 외 ~1,700 종목은 STEP1 임시값 유지 → EOD 17:30 candle-sync 가
--         모든 OHLCV 컬럼을 KRX 공식값으로 최종 overlay
--   호출 순서 보장: 항상 RPC #1 → RPC #2 (STEP1 임시 row INSERT 후 STEP2 진입)
--     INSERT branch 는 거의 발생 안 함 (안전상 명시: close 폴백 = open, volume/trade_amount = 0)
--   ON CONFLICT DO UPDATE:
--     - open / high / low: EXCLUDED 정확값으로 덮어쓰기
--     - close / volume / trade_amount / change_amount / change_rate: 의도적 omit
--       (STEP1 의 intraday_upsert_close 가 매분 갱신하는 컬럼)
--   D-35 / MEMORY feedback_supabase_rpc_revoke:
--         REVOKE FROM PUBLIC + REVOKE FROM anon, authenticated 둘 다 명시
--   T-09.1-01: SECURITY DEFINER + service_role only EXECUTE
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.intraday_upsert_ohlc(
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
      (r->>'open')::numeric(20,2),
      (r->>'high')::numeric(20,2),
      (r->>'low')::numeric(20,2),
      (r->>'open')::numeric(20,2),     -- INSERT-only branch (희귀): close 폴백 = open
      0,                                -- volume — STEP1 RPC 가 매분 갱신
      0,                                -- trade_amount — STEP1 RPC 가 매분 갱신
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (code, date) DO UPDATE
      SET open  = EXCLUDED.open,        -- ka10001 의 정확 시가로 덮어쓰기 (D-14, D-34)
          high  = EXCLUDED.high,        -- ka10001 의 정확 고가
          low   = EXCLUDED.low,         -- ka10001 의 정확 저가
          inserted_at = now();
          -- close, volume, trade_amount, change_amount, change_rate: 의도적 omit
          -- STEP1 의 intraday_upsert_close 가 매분 갱신하는 컬럼 — STEP2 가 덮어쓰면 안 됨
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.intraday_upsert_ohlc(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.intraday_upsert_ohlc(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intraday_upsert_ohlc(jsonb) TO service_role;

COMMIT;
