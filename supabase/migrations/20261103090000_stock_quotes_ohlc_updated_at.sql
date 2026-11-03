-- ============================================================
-- stock_quotes.ohlc_updated_at — 시가 · 고가 · 저가가 마지막으로 바뀐 시각 + 틱뷰어 오늘 목록이 그 시각으로 고가를 거른다.
--
-- 사고(2026-11-03 08:24 KST 실측): 틱뷰어 오늘 목록 「15%↑」 에 한양디지텍 +24.5% · 삼현 +24.2% · 티에스이 +23.0% 등
--   7종목이 떴는데 실제 등락률은 전부 마이너스였다.
--   - price · change_amount 는 intraday-sync STEP1 이 전 종목 매분 쓴다(updated_at 도 오늘이 된다).
--   - open · high · low 는 STEP2(hot set ~250 종목 · intraday_update_quotes_step2)와 server 종목 상세(ka10001)만 쓴다.
--     hot set 밖 종목은 마지막으로 hot set 에 들었던 날 값에 멈춰 있다(한양디지텍 = 10/28 일봉 고가 42,700 그대로).
--   - tick_today_for_user 는 updated_at 이 오늘인지만 봐서 「며칠 전 고가 − 오늘 기준가」 를 오늘 고가 등락률로 셌다
--     (42,700 − 34,300) / 34,300 = 24.5%. 7종목 모두 현재가 < 저가 — 같은 날 값일 수 없다.
--
-- 고침:
--   ① ohlc_updated_at 컬럼 + BEFORE INSERT/UPDATE 트리거 — open · high · low 중 하나라도 값이 바뀌면 now().
--      쓰는 쪽(STEP2 RPC · server upsert) 재배포 없이 모든 writer 를 덮는다. 같은 값 재기록(STEP1 은 OHLC 를 안 보냄 ·
--      창 밖 ka10001 의 묵은 스냅샷이 저장값과 같음)은 시각을 올리지 않는다.
--      기존 행은 NULL(언제 값인지 모름) — 오늘 처음 바뀔 때 찍힌다.
--   ② tick_today_for_user — 고가는 ohlc_updated_at 이 오늘 ∧ 저가 ≤ 현재가 ≤ 고가 일 때만 쓴다(아니면 high_rate NULL ·
--      up15 판정 제외). 나머지 계약(정렬 · 키 · 게이트)은 20261102200100 그대로.
-- ============================================================

BEGIN;

ALTER TABLE public.stock_quotes ADD COLUMN ohlc_updated_at timestamptz;

COMMENT ON COLUMN public.stock_quotes.ohlc_updated_at IS
  'open · high · low 중 하나가 마지막으로 바뀐 시각(트리거 stock_quotes_ohlc_stamp). NULL = 모름. 오늘 고가가 필요하면 이 값이 오늘인지 본다 — updated_at 은 STEP1 이 매분 올려 고가 신선도를 말하지 않는다';

CREATE FUNCTION public.stock_quotes_ohlc_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ohlc_updated_at IS NULL AND (NEW.open IS NOT NULL OR NEW.high IS NOT NULL OR NEW.low IS NOT NULL) THEN
      NEW.ohlc_updated_at := now();
    END IF;
  ELSIF NEW.open IS DISTINCT FROM OLD.open
     OR NEW.high IS DISTINCT FROM OLD.high
     OR NEW.low  IS DISTINCT FROM OLD.low THEN
    NEW.ohlc_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_quotes_ohlc_stamp() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_quotes_ohlc_stamp() FROM anon, authenticated;

CREATE TRIGGER stock_quotes_ohlc_stamp
  BEFORE INSERT OR UPDATE ON public.stock_quotes
  FOR EACH ROW EXECUTE FUNCTION public.stock_quotes_ohlc_stamp();

-- ── tick_today_for_user — 오늘 고가만 ─────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_today_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  RETURN jsonb_build_object(
    'access', true,
    'date', to_char(v_today, 'YYYYMMDD'),
    'rows', (
      WITH fq AS (  -- 오늘 갱신 시세 · high = 오늘 고가일 때만(ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가) 아니면 NULL
        SELECT q.code,
               q.change_rate,
               q.price - q.change_amount AS base,
               CASE WHEN q.high IS NOT NULL
                     AND (q.ohlc_updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
                     AND q.price <= q.high
                     AND (q.low IS NULL OR q.low <= q.price)
                    THEN q.high END AS high
          FROM public.stock_quotes q
         WHERE (q.updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
      ), k AS (  -- (a) 오늘 매집감지 등록(kind 16 부분 인덱스 trade_date)
        SELECT DISTINCT e.isin FROM public.dma_strategy_events e
         WHERE e.kind = 16 AND e.trade_date = v_today AND e.isin <> ''
      ), u AS (    -- (b) 오늘 고가 기준 +15% 이상 — 정수 경계 (high − base)·100 ≥ base·15
        SELECT s.isin FROM fq JOIN public.stocks s ON s.code = fq.code
         WHERE s.isin IS NOT NULL
           AND fq.high IS NOT NULL
           AND fq.base > 0
           AND (fq.high - fq.base) * 100 >= fq.base * 15
      ), ids AS (
        SELECT isin FROM k UNION SELECT isin FROM u
      )
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.rate DESC NULLS LAST, t.isin), '[]'::jsonb)
        FROM (SELECT i.isin, st.code, st.name,
                     array_remove(ARRAY[CASE WHEN i.isin IN (SELECT isin FROM k) THEN 'accum' END,
                                        CASE WHEN i.isin IN (SELECT isin FROM u) THEN 'up15' END], NULL) AS sources,
                     fq.change_rate::double precision AS rate,
                     CASE WHEN fq.high IS NOT NULL AND fq.base > 0
                          THEN ((fq.high - fq.base) * 100 / fq.base)::double precision
                     END AS high_rate
                FROM ids i
                LEFT JOIN public.stocks st ON st.isin = i.isin
                LEFT JOIN fq ON fq.code = st.code) t));
END;
$$;

COMMENT ON FUNCTION public.tick_today_for_user(uuid) IS
  'Phase 37 D-15 — 오늘(KST) 목록: kind 16 등록(accum) ∪ 오늘 고가 +15% 이상(up15 · 고가는 ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가) · 정렬 rate DESC. DMA 매핑 사용자만. service_role 전용';

COMMIT;
