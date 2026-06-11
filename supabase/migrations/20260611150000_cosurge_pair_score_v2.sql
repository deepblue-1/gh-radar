-- ============================================================
-- Phase 11 — cosurge 페어 점수 v2 (사용자 설계 피드백 반영)
--
-- 사용자 요구 (핵심 의도):
--   "X 가 상한가/급등 간 날, Y 가 얼마나 같이 갔느냐" 가 핵심.
--   30% 갈 때 27% 따라갔으면 0.9 "같이 간 것". 최근일수록 더 크게 반영.
--   직접동반 경로 만점은 테마 경로와 동일하게 1.0. 횟수/15 정규화는 폐기.
--
-- 변경 범위:
--   - **페어 후보 게이트는 기존 유지** (20260611120000):
--     co-surge 양측 ≥10% 동반 ≥3일, 적격성 JOIN(상폐·스팩·ETP 제외 + FK 고아 가드),
--     광역일 제외(R2), 무향 정규화 code_a<code_b. "어떤 페어가 존재하는가" 는 불변.
--   - **그 페어의 점수만 신규**: 방향별 (강도비율 × 최근성 가중) 합산을 위한
--     w_sum / ws_sum 4개 컬럼을 cosurge_edges 에 추가하고, rebuild_comovement() 가 채운다.
--     server(computeComovement.ts)가 pairScore = ws_sum/w_sum × min(1, w_sum/W0) 로 환산.
--
-- 방향별 집계 정의 (a-방향 = code_a 가 급등한 날 기준; b-방향 대칭):
--   각 급등일 t (code_a change_rate ∈ [15,31], 광역일 제외) 마다:
--     s_t = LEAST(1, GREATEST(0, ret_b_t / ret_a_t))   -- b 가 하락이면 0, 비율 상한 1
--     w_t = power(0.5, (CURRENT_DATE - t)/365.0)        -- 1년 반감기 최근성 가중
--   ws_sum_a = Σ w_t·s_t ,  w_sum_a = Σ w_t
--   b 의 당일 데이터가 없으면(미거래·미동반) s_t = 0 으로 카운트(w_t 는 포함 —
--   "같이 안 간 날" 은 감점이 맞다). pairScore = ws_sum/w_sum 이 강도비율의 최근성 가중평균.
--
-- 게이트(daily_bars ≥10% / co_count ≥3)는 ≥15% 발화 표본보다 느슨하므로 일부 페어는
--   ws_sum_*/w_sum_* 가 0(≥15% 동반일이 0)일 수 있다 — 정상. server 는 그런 경우
--   pairScore 0 으로 처리(테마 경로 또는 강한 페어가 우선됨).
--
-- co_count / lift / avg_pair_ret 는 기존 그대로 (표시·게이트·결합 보조항).
-- 멱등 full-rebuild(TRUNCATE+INSERT), BEGIN/COMMIT, SECURITY DEFINER 유지.
-- ============================================================

BEGIN;

-- 1) cosurge_edges 점수 v2 컬럼 (방향별 최근성-가중 누적) — 멱등 ADD
ALTER TABLE cosurge_edges
  ADD COLUMN IF NOT EXISTS w_sum_a  numeric,   -- a-방향 Σ w_t  (code_a 급등일 가중합)
  ADD COLUMN IF NOT EXISTS ws_sum_a numeric,   -- a-방향 Σ w_t·s_t
  ADD COLUMN IF NOT EXISTS w_sum_b  numeric,   -- b-방향 Σ w_t  (code_b 급등일 가중합)
  ADD COLUMN IF NOT EXISTS ws_sum_b numeric;   -- b-방향 Σ w_t·s_t

-- 2) rebuild_comovement() — theme 경로 불변, cosurge 경로에 v2 방향별 점수 추가
CREATE OR REPLACE FUNCTION public.rebuild_comovement(
  p_lookback_months int DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since date := (current_date - (p_lookback_months || ' months')::interval)::date;
  v_theme_rows int;
  v_edge_rows  int;
BEGIN
  -- ── theme_comovement: 발화일 → 멤버 통계 (20260611120000 과 동일 — 불변) ──
  TRUNCATE theme_comovement;
  INSERT INTO theme_comovement (theme_id, stock_code, ignite_days, member_count, conf_d0, conf_d1, lift, avg_ret)
  WITH
  trading_next AS (
    SELECT code, date, LEAD(date) OVER (PARTITION BY code ORDER BY date) AS next_date
    FROM stock_daily_ohlcv WHERE date >= v_since
  ),
  broad_days AS (
    SELECT date FROM stock_daily_ohlcv
    WHERE date >= v_since AND change_rate >= 10
    GROUP BY date HAVING count(*) > 100
  ),
  base_rate AS (
    SELECT code,
           count(*) FILTER (WHERE change_rate >= 10)::numeric / NULLIF(count(*), 0) AS p_surge
    FROM stock_daily_ohlcv WHERE date >= v_since GROUP BY code
  ),
  active_members AS (
    SELECT ts.theme_id, ts.stock_code
    FROM theme_stocks ts
    JOIN themes th ON th.id = ts.theme_id AND th.hidden = false
    WHERE ts.effective_to IS NULL
      AND ts.manual_override IS DISTINCT FROM 'excluded'
  ),
  theme_member_count AS (
    SELECT theme_id, count(*) AS member_count FROM active_members GROUP BY theme_id
  ),
  ignite AS (
    SELECT am.theme_id, o.date AS ignite_date,
           count(*) AS ignite_member_cnt
    FROM active_members am
    JOIN stock_daily_ohlcv o
      ON o.code = am.stock_code AND o.date >= v_since
     AND o.change_rate >= 15 AND o.change_rate <= 31
    WHERE o.date NOT IN (SELECT date FROM broad_days)
    GROUP BY am.theme_id, o.date
    HAVING count(*) >= 2
  ),
  member_day AS (
    SELECT am.theme_id, am.stock_code, i.ignite_date,
           (i.ignite_member_cnt
              - CASE WHEN o0.change_rate >= 15 AND o0.change_rate <= 31 THEN 1 ELSE 0 END) >= 2 AS loo_day,
           o0.change_rate AS d0_rate,
           o1.change_rate AS d1_rate
    FROM active_members am
    JOIN ignite i ON i.theme_id = am.theme_id
    LEFT JOIN stock_daily_ohlcv o0 ON o0.code = am.stock_code AND o0.date = i.ignite_date
    LEFT JOIN trading_next tn      ON tn.code = am.stock_code AND tn.date = i.ignite_date
    LEFT JOIN stock_daily_ohlcv o1 ON o1.code = am.stock_code AND o1.date = tn.next_date
  ),
  member_stats AS (
    SELECT
      theme_id, stock_code,
      count(*) FILTER (WHERE loo_day)                        AS ignite_days,
      count(*) FILTER (WHERE loo_day AND d0_rate >= 10)      AS d0_co,
      count(*) FILTER (WHERE loo_day AND d1_rate >= 10)      AS d1_co,
      avg(d0_rate) FILTER (WHERE loo_day AND d0_rate >= 10)  AS avg_ret
    FROM member_day
    GROUP BY theme_id, stock_code
  )
  SELECT
    ms.theme_id, ms.stock_code, ms.ignite_days, tmc.member_count,
    (ms.d0_co::numeric / NULLIF(ms.ignite_days, 0))::numeric(5,4)            AS conf_d0,
    (ms.d1_co::numeric / NULLIF(ms.ignite_days, 0))::numeric(5,4)            AS conf_d1,
    ((ms.d0_co::numeric / NULLIF(ms.ignite_days, 0))
       / NULLIF(br.p_surge, 0))::numeric(8,4)                               AS lift,
    ms.avg_ret::numeric(8,4)                                                AS avg_ret
  FROM member_stats ms
  JOIN theme_member_count tmc ON tmc.theme_id = ms.theme_id
  LEFT JOIN base_rate br ON br.code = ms.stock_code
  WHERE ms.ignite_days >= 5;
  GET DIAGNOSTICS v_theme_rows = ROW_COUNT;

  -- ── cosurge_edges: 페어 동반급등 (게이트 불변) + v2 방향별 강도-최근성 점수 ──
  TRUNCATE cosurge_edges;
  INSERT INTO cosurge_edges (
    code_a, code_b, co_count, lift, avg_pair_ret,
    w_sum_a, ws_sum_a, w_sum_b, ws_sum_b
  )
  WITH
  broad_days AS (   -- 시장 광역일 (>100 종목 동반) 제외 (D-13, R2)
    SELECT date FROM stock_daily_ohlcv
    WHERE date >= v_since AND change_rate >= 10
    GROUP BY date HAVING count(*) > 100
  ),
  -- 적격성 JOIN (R1) — 상폐·스팩·ETP 제외 + FK 고아 가드. ≥10% 바 (페어 후보 게이트용).
  daily_bars AS (
    SELECT o.date, o.code, o.change_rate
    FROM stock_daily_ohlcv o
    JOIN stocks s ON s.code = o.code
      AND s.is_delisted = false
      AND s.security_group NOT IN ('ETF', 'ETN', 'ELW')
      AND (s.kosdaq_segment IS NULL OR s.kosdaq_segment NOT LIKE 'SPAC%')
      AND s.name NOT LIKE '%스팩%'
    WHERE o.date >= v_since AND o.change_rate >= 10
      AND o.date NOT IN (SELECT date FROM broad_days)
  ),
  total_days AS (SELECT count(DISTINCT date) AS n FROM daily_bars),
  surge_count AS (SELECT code, count(*) AS n FROM daily_bars GROUP BY code),
  -- 페어 후보 + 기존 표시·게이트 메트릭 (≥3 동반일 게이트 — 기존 유지)
  pairs AS (
    SELECT
      a.code AS code_a, b.code AS code_b,
      count(*) AS co_count,
      (count(*)::numeric
        / NULLIF((sa.n::numeric * sb.n::numeric) / NULLIF(td.n, 0), 0))::numeric(8,4) AS lift,
      avg((a.change_rate + b.change_rate) / 2)::numeric(8,4)                           AS avg_pair_ret
    FROM daily_bars a
    JOIN daily_bars b ON a.date = b.date AND a.code < b.code
    JOIN surge_count sa ON sa.code = a.code
    JOIN surge_count sb ON sb.code = b.code
    CROSS JOIN total_days td
    GROUP BY a.code, b.code, sa.n, sb.n, td.n
    HAVING count(*) >= 3
  ),
  -- ── v2 방향별 점수 ──
  -- 각 페어의 양측 종목에 대한 ≥15% 발화일(광역일 제외) — 강도비율 분자/분모 기준일.
  -- (페어 후보 게이트는 ≥10% 동반이지만, "X 가 급등 간 날" 의 X 발화 기준은 ≥15% — 테마 발화와 동형.)
  ignite_bars AS (
    SELECT db.date, db.code, db.change_rate
    FROM daily_bars db
    WHERE db.change_rate >= 15 AND db.change_rate <= 31
  ),
  -- a-방향: code_a 의 발화일 t 마다 code_b 의 당일 수익률로 s_t 계산.
  --   b 미거래·미동반이면 ob.change_rate NULL → COALESCE 0 → s=0 (w 는 포함).
  dir_a AS (
    SELECT
      p.code_a, p.code_b,
      sum(power(0.5, (current_date - ia.date) / 365.0))                                       AS w_sum_a,
      sum(power(0.5, (current_date - ia.date) / 365.0)
          * LEAST(1, GREATEST(0, COALESCE(ob.change_rate, 0) / NULLIF(ia.change_rate, 0))))   AS ws_sum_a
    FROM pairs p
    JOIN ignite_bars ia ON ia.code = p.code_a
    LEFT JOIN stock_daily_ohlcv ob ON ob.code = p.code_b AND ob.date = ia.date
    GROUP BY p.code_a, p.code_b
  ),
  -- b-방향: 대칭 (code_b 발화일 기준, code_a 수익률).
  dir_b AS (
    SELECT
      p.code_a, p.code_b,
      sum(power(0.5, (current_date - ib.date) / 365.0))                                       AS w_sum_b,
      sum(power(0.5, (current_date - ib.date) / 365.0)
          * LEAST(1, GREATEST(0, COALESCE(oa.change_rate, 0) / NULLIF(ib.change_rate, 0))))   AS ws_sum_b
    FROM pairs p
    JOIN ignite_bars ib ON ib.code = p.code_b
    LEFT JOIN stock_daily_ohlcv oa ON oa.code = p.code_a AND oa.date = ib.date
    GROUP BY p.code_a, p.code_b
  )
  SELECT
    p.code_a, p.code_b, p.co_count, p.lift, p.avg_pair_ret,
    da.w_sum_a::numeric, da.ws_sum_a::numeric,
    db.w_sum_b::numeric, db.ws_sum_b::numeric
  FROM pairs p
  LEFT JOIN dir_a da ON da.code_a = p.code_a AND da.code_b = p.code_b
  LEFT JOIN dir_b db ON db.code_a = p.code_a AND db.code_b = p.code_b;
  GET DIAGNOSTICS v_edge_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'lookback_since', v_since,
    'theme_comovement_rows', v_theme_rows,
    'cosurge_edge_rows', v_edge_rows,
    'rebuilt_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rebuild_comovement(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_comovement(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rebuild_comovement(int) TO service_role;

COMMIT;
