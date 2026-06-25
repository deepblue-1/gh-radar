-- ============================================================
-- Phase 11 — 동반급등 상한 캡 (이상 등락률 제외)
--
-- 버그: 동반상승 후보 "최근 직접 동반"에 +300% 같은 불가능한 값이 노출.
--   원인 = IPO 상장일(공모가의 60~400% → +300% 데뷔), 정리매매, 데이터 오류 등
--   change_rate > 31% 인 이상치(24개월 108행)가 "동반급등"으로 집계됨.
--   한국 일일 가격제한은 ±30% — 31% 초과는 정상 거래일의 등락이 아님.
--
-- 근본 수정: "유효 급등 = 10% ≤ change_rate ≤ 31%" 를 양 경로에 일관 적용.
--   - co-surge daily_bars: 기존 `>= 10` 만 → `>= 10 AND <= 31` (상한 신규).
--   - theme member_stats: d0_co / d1_co / avg_ret 필터에 `<= 31` 추가.
--     (테마 ignite 발화일은 이미 15~31 캡 적용됨 — d0/d1 동반·후행 카운트만 미적용이었음.)
--
-- 효과: 이상치 동반일이 co_count·recent_pairs·conf_d0·avg_ret 에서 제외됨.
--   서버/웹앱 코드 불변(SQL 함수 + rebuild 데이터만). 멱등 full-rebuild.
-- ============================================================

BEGIN;

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
  -- ── theme_comovement: 발화일 → 멤버 통계 ──
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
      count(*) FILTER (WHERE loo_day)                                            AS ignite_days,
      -- 동반(d0)·후행(d1)·강도(avg_ret) 모두 유효 급등 ≤31 캡 (IPO 데뷔·정리매매 이상치 제외)
      count(*) FILTER (WHERE loo_day AND d0_rate >= 10 AND d0_rate <= 31)         AS d0_co,
      count(*) FILTER (WHERE loo_day AND d1_rate >= 10 AND d1_rate <= 31)         AS d1_co,
      avg(d0_rate) FILTER (WHERE loo_day AND d0_rate >= 10 AND d0_rate <= 31)     AS avg_ret
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

  -- ── cosurge_edges: 페어 동반급등 + recent_pairs 히스토리 ──
  TRUNCATE cosurge_edges;
  INSERT INTO cosurge_edges (
    code_a, code_b, co_count, lift, avg_pair_ret,
    w_sum_a, ws_sum_a, w_sum_b, ws_sum_b, recent_pairs
  )
  WITH
  broad_days AS (   -- 시장 광역일 (>100 종목 동반) 제외 (D-13, R2)
    SELECT date FROM stock_daily_ohlcv
    WHERE date >= v_since AND change_rate >= 10
    GROUP BY date HAVING count(*) > 100
  ),
  daily_bars AS (
    SELECT o.date, o.code, o.change_rate
    FROM stock_daily_ohlcv o
    JOIN stocks s ON s.code = o.code
      AND s.is_delisted = false
      AND s.security_group NOT IN ('ETF', 'ETN', 'ELW')
      AND (s.kosdaq_segment IS NULL OR s.kosdaq_segment NOT LIKE 'SPAC%')
      AND s.name NOT LIKE '%스팩%'
    -- 유효 급등 = 10% ≤ change_rate ≤ 31% (상한 신규 — IPO 데뷔 +300% 등 이상치 제외)
    WHERE o.date >= v_since AND o.change_rate >= 10 AND o.change_rate <= 31
      AND o.date NOT IN (SELECT date FROM broad_days)
  ),
  total_days AS (SELECT count(DISTINCT date) AS n FROM daily_bars),
  surge_count AS (SELECT code, count(*) AS n FROM daily_bars GROUP BY code),
  pairs AS (
    SELECT
      a.code AS code_a, b.code AS code_b,
      count(*) AS co_count,
      (count(*)::numeric
        / NULLIF((sa.n::numeric * sb.n::numeric) / NULLIF(td.n, 0), 0))::numeric(8,4) AS lift,
      avg((a.change_rate + b.change_rate) / 2)::numeric(8,4)                           AS avg_pair_ret,
      -- 최근 동반급등 5건 (날짜 desc) — UI "최근 직접 동반" 히스토리. d=날짜, ra=code_a%, rb=code_b%.
      to_jsonb((array_agg(
        jsonb_build_object('d', a.date, 'ra', round(a.change_rate, 2), 'rb', round(b.change_rate, 2))
        ORDER BY a.date DESC
      ))[1:5])                                                                         AS recent_pairs
    FROM daily_bars a
    JOIN daily_bars b ON a.date = b.date AND a.code < b.code
    JOIN surge_count sa ON sa.code = a.code
    JOIN surge_count sb ON sb.code = b.code
    CROSS JOIN total_days td
    GROUP BY a.code, b.code, sa.n, sb.n, td.n
    HAVING count(*) >= 3
  ),
  ignite_bars AS (
    SELECT db.date, db.code, db.change_rate
    FROM daily_bars db
    WHERE db.change_rate >= 15 AND db.change_rate <= 31
  ),
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
    db.w_sum_b::numeric, db.ws_sum_b::numeric,
    p.recent_pairs
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
