-- ============================================================
-- quick 261016-miy: intraday_update_quotes_step2(jsonb) RPC — STEP2 stock_quotes 일괄 UPDATE
--
-- 근거:
--   intraday-sync(Cloud Run Job, 매분, --task-timeout=60s)의 STEP2 가 hot set ~100~250 종목을
--   종목별 직렬 UPDATE 로 보냈다. Cloud Run 은 VPC all-traffic egress 라 왕복마다 ~120ms →
--   ~100건 × ~120ms ≈ 12s 가 들어 성공 실행 p95 가 58s 로 한도에 붙었고 60s timeout 실패가 났다.
--   이를 UPDATE ... FROM jsonb_to_recordset 단일 문장(Supabase 왕복 1회)으로 대체한다.
--
-- 계약:
--   - recordset 컬럼 7개(code/open/high/low/upper_limit/lower_limit/market_cap)가 곧 워커 payload 키다.
--     키가 다르면 해당 컬럼이 조용히 null 로 들어간다.
--   - UPDATE 만 한다 — stock_quotes 에 없는 code 는 매칭되지 않아 no-op (INSERT 분기 없음).
--   - 반환값 = 실제 갱신 행 수 (GET DIAGNOSTICS ROW_COUNT).
--   - MEMORY feedback_supabase_rpc_revoke: REVOKE PUBLIC + REVOKE anon, authenticated + GRANT service_role.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.intraday_update_quotes_step2(
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  UPDATE public.stock_quotes AS q
     SET open        = r.open,
         high        = r.high,
         low         = r.low,
         -- upper_limit / lower_limit 는 NOT NULL 이다. 단일 문장이라 null 하나만 와도 배치 전체가
         -- 23502 로 중단된다. null 은 「ka10001 값 없음」이므로 STEP1 이 전일종가로 채워 둔 값을 유지한다.
         upper_limit = COALESCE(r.upper_limit, q.upper_limit),
         lower_limit = COALESCE(r.lower_limit, q.lower_limit),
         market_cap  = r.market_cap,   -- null 이 와도 그대로 대입 (기존 동작 유지)
         updated_at  = now()
         -- price / change_amount / change_rate / volume / trade_amount / rate_updated_at: 의도적 omit.
         -- STEP1 이 매분 쓰는 컬럼이다. rate_updated_at 은 change_rate 를 쓰지 않으므로 찍지 않는다 (261001-bnc).
    FROM jsonb_to_recordset(p_rows) AS r(
           code text,
           open numeric,
           high numeric,
           low numeric,
           upper_limit numeric,
           lower_limit numeric,
           market_cap bigint
         )
   WHERE q.code = r.code;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) TO service_role;

COMMIT;
