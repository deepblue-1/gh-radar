-- ============================================================
-- quick 261106-ldl — 유통주식수 표 stock_float + 전 종목 RPC stock_float_all.
--
-- 목적: gh-trade 클라 호가창 「발행1%」 클릭 때 보여 줄 유통주식수.
-- 원천: 키움 ka10001 의 flo_stk(상장주식) · dstr_stk(유통주식) · dstr_rt(유통비율 %).
--   평일 21:30 KST 고정 야간 배치(gh-radar-float-sync Job, intraday-sync 이미지 JOB_MODE=float)가 채운다.
-- 값: float_shares · listed_shares 는 모두 **주 단위**(키움 단위가 천주여도 워커가 정규화), float_rate 는 % 숫자.
--   dstr_stk 가 빈 종목(ETF 등)은 float_shares · float_rate 가 null.
-- 쓰기: service_role 배치만(쓰기 정책 없음). 읽기: RLS TO anon, authenticated 둘 다(default-deny 함정 회피).
-- RPC: SETOF 는 PostgREST max_rows(1000)에 잘리므로 jsonb 값 하나로 묶는다. SECURITY INVOKER + search_path 고정.
--   REVOKE 는 PUBLIC · anon · authenticated 명시(Supabase auto-grant 가 FROM PUBLIC 단독을 덮는다) + service_role GRANT.
-- 되돌리기:
--   DROP FUNCTION IF EXISTS public.stock_float_all();
--   DROP TABLE IF EXISTS public.stock_float;
-- ============================================================

BEGIN;

CREATE TABLE public.stock_float (
  code          text PRIMARY KEY REFERENCES stocks(code) ON DELETE CASCADE,
  float_shares  bigint,
  float_rate    numeric,
  listed_shares bigint,
  as_of         date NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_float ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_stock_float" ON public.stock_float FOR SELECT TO anon, authenticated USING (true);

-- 전 종목 압축 JSON — { asOf: max(as_of), rows: { code: [float_shares, float_rate, listed_shares] } }.
-- 배열 순서 = server/src/routes/stocks.ts 의 STOCK_FLOAT_FIELDS [floatShares, floatRate, listedShares] 와 같아야 한다.
-- 빈 표면 { asOf: null, rows: {} }.
CREATE FUNCTION public.stock_float_all()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'asOf', to_char(max(f.as_of), 'YYYY-MM-DD'),
    'rows', COALESCE(
      jsonb_object_agg(f.code, jsonb_build_array(f.float_shares, f.float_rate, f.listed_shares)),
      '{}'::jsonb
    )
  )
  FROM public.stock_float f;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_float_all() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_float_all() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_float_all() TO service_role;

COMMIT;
