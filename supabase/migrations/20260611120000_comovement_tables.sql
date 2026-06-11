-- ============================================================
-- Phase 11 Plan 01: theme_comovement + cosurge_edges (동조 후보 사전계산 + RPC)
--   COMV-01 토대 — RESEARCH §스키마 + §SQL 사전계산 DDL·CTE 를 theme_tables.sql 톤
--   (BEGIN/COMMIT · 공개 read RLS · REVOKE 3줄 · SECURITY DEFINER search_path)으로 작성.
--
-- 두 경로 사전계산(하이브리드, CONTEXT):
--   1) theme_comovement — 테마-풀링 참여도 (주 경로). 종목당 급등 이벤트 중앙값 2회라
--      페어 단독 통계 불가(~75% 종목) → 테마 풀링 필수(커버리지 89%).
--   2) cosurge_edges   — 글로벌 페어 직접동조 (보조 경로, 무향 code_a<code_b).
--
-- 결정 근거:
--   D-04: 적재 컷 ≥5(테마 LOO 발화일)·≥3(co-surge) — 노출 최저. ≥8/≥5 강함은 읽기 시 배지(§6).
--   D-07: conf_d1 익일 후행율 → 후행형 판정.
--   D-11: member_count = active 멤버 수 → 타이트니스 분모.
--   D-12: conf_d0 동반율 = 주 점수. lookback 24m.
--   D-13: 시장 광역일(>100 종목 ≥10%) 제외 — 베타로 일괄 부풀려지는 아티팩트 제거.
--   R1:   co-surge daily_bars 적격성 JOIN — 상폐·스팩·ETP 제외 + ohlcv→stocks FK 고아 가드.
--   R2:   광역일 제외를 발화일(ignite) + co-surge daily_bars 양쪽에 일관 적용.
--   R4:   leave-one-out 발화일 — 멤버 자신의 발화 기여를 뺀 분모로 자기발화 편향 제거.
--
--   threat register:
--     T-11-01 (권한상승): rebuild_comovement() REVOKE 3줄 (PUBLIC + anon,authenticated + GRANT service_role)
--     T-11-02 (DoS자기):  신규 2테이블 RLS TO anon, authenticated 둘 다 (default-deny 회피)
--     T-11-03 (권한상승): SECURITY DEFINER SET search_path = public, pg_temp (하이재킹 방지)
--     T-11-05 (변조):     active_members 가 manual_override='excluded' + hidden 테마 제외
-- ============================================================

BEGIN;

-- 1) theme_comovement (테마-풀링 경로) — RESEARCH §스키마
CREATE TABLE theme_comovement (
  theme_id      uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  ignite_days   int  NOT NULL,                 -- 멤버별 LOO 발화일 수 (R4 — 해당 멤버 제외 ≥2 발화한 날; 게이팅·표본수 배지 분모)
  member_count  int  NOT NULL,                 -- 현재 active 멤버 수 (타이트니스 분모, D-11)
  conf_d0       numeric(5,4) NOT NULL,         -- 동반율 (주 점수, D-12) 0~1
  conf_d1       numeric(5,4) NOT NULL,         -- 익일 후행율 (후행형 판정, D-07)
  lift          numeric(8,4),                  -- conf_d0 / base_rate (디노이즈, nullable)
  avg_ret       numeric(8,4),                  -- 발화일 평균 수익률 (강도)
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id, stock_code)
);
CREATE INDEX idx_theme_comovement_code  ON theme_comovement (stock_code);
CREATE INDEX idx_theme_comovement_theme ON theme_comovement (theme_id);

-- 2) cosurge_edges (글로벌 co-surge 경로, 무향 code_a<code_b)
CREATE TABLE cosurge_edges (
  code_a       text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  code_b       text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  co_count     int  NOT NULL,                  -- 동반급등 횟수 ("직접동반 N회")
  lift         numeric(8,4),                   -- 독립 대비 초과 동반 (디노이즈)
  avg_pair_ret numeric(8,4),                   -- 페어 평균 수익률 (강도)
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_a, code_b),
  CHECK (code_a < code_b)                      -- 무향 정규화 강제
);
CREATE INDEX idx_cosurge_a ON cosurge_edges (code_a);
CREATE INDEX idx_cosurge_b ON cosurge_edges (code_b);

-- 3) 부분 인덱스 — co-surge self-join 커버 (date 선두, change_rate>=10 부분조건)
CREATE INDEX idx_ohlcv_surge_bar
  ON stock_daily_ohlcv (date, code) WHERE change_rate >= 10;

-- 4) RLS — 공개 read (TO anon, authenticated 둘 다 — default-deny 함정 회피)
ALTER TABLE theme_comovement ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosurge_edges    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_theme_comovement" ON theme_comovement FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read_cosurge_edges"    ON cosurge_edges    FOR SELECT TO anon, authenticated USING (true);

-- 5) rebuild_comovement() — full-rebuild plpgsql (RESEARCH §SQL 사전계산 a/b/c/d)
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
  -- 종목별 다음 거래일 (휴장일 안전 — 캘린더 +1 금지, Pitfall 1)
  trading_next AS (
    SELECT code, date, LEAD(date) OVER (PARTITION BY code ORDER BY date) AS next_date
    FROM stock_daily_ohlcv WHERE date >= v_since
  ),
  -- 시장 광역일 (>100 종목 ≥10% — D-13). co-surge 와 동일하게 발화일에서도 제외 (R2):
  -- 광역일엔 거의 모든 테마가 베타로 "발화"해 conf_d0 가 일괄 부풀려짐 (RESEARCH §(d) 권고).
  broad_days AS (
    SELECT date FROM stock_daily_ohlcv
    WHERE date >= v_since AND change_rate >= 10
    GROUP BY date HAVING count(*) > 100
  ),
  -- 종목별 기저 급등률 (lift 디노이즈)
  base_rate AS (
    SELECT code,
           count(*) FILTER (WHERE change_rate >= 10)::numeric / NULLIF(count(*), 0) AS p_surge
    FROM stock_daily_ohlcv WHERE date >= v_since GROUP BY code
  ),
  -- active 멤버 (admin override 'excluded' 제외, hidden 테마 제외)
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
  -- 발화일 = 멤버 >=2 종목이 같은 날 15~31% 급등 (D-13 아티팩트 제외)
  ignite AS (
    SELECT am.theme_id, o.date AS ignite_date,
           count(*) AS ignite_member_cnt              -- 그날 발화 멤버 수 (R4 LOO 판정용)
    FROM active_members am
    JOIN stock_daily_ohlcv o
      ON o.code = am.stock_code AND o.date >= v_since
     AND o.change_rate >= 15 AND o.change_rate <= 31
    WHERE o.date NOT IN (SELECT date FROM broad_days)   -- 광역일 제외 (R2 — D-13 일관 적용)
    GROUP BY am.theme_id, o.date
    HAVING count(*) >= 2
  ),
  -- 멤버×발화일 단위 행 + LOO 판정 플래그 (R4)
  member_day AS (
    SELECT am.theme_id, am.stock_code, i.ignite_date,
           -- LOO: 해당 멤버 자신의 발화 기여(15~31%)를 빼고도 ≥2 종목이 발화한 날만 그 멤버의 표본.
           -- o0 가 NULL(그날 미거래)이면 CASE=0 → 발화 멤버 ≥2 그대로 → 유효 표본 (Y 미동반으로 집계)
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
  -- 멤버별 D0 동반 + D+1 후행 + avg_ret — 전부 LOO 발화일 기준 (R4):
  -- 자기발화 포함 시 변동성 큰 테마 리더의 동반율이 구조적으로 부풀어 TOP-K 왜곡.
  -- "Y 없이도 테마가 발화했을 때 Y 가 동반한 비율"이 '따라갈 종목'의 정확한 정의.
  member_stats AS (
    SELECT
      theme_id, stock_code,
      count(*) FILTER (WHERE loo_day)                        AS ignite_days,  -- 멤버별 LOO 분모
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
  WHERE ms.ignite_days >= 5;        -- 적재 컷 ≥5 — 멤버별 LOO 발화일 기준 (노출 최저, D-04). ≥8 은 읽기 시 배지 (§6). 분모 0 행 자동 배제
  GET DIAGNOSTICS v_theme_rows = ROW_COUNT;

  -- ── cosurge_edges: 페어 동반급등 (광역일 제외) ──
  TRUNCATE cosurge_edges;
  INSERT INTO cosurge_edges (code_a, code_b, co_count, lift, avg_pair_ret)
  WITH
  broad_days AS (   -- 시장 광역일 (>100 종목 동반) 제외 (D-13, Pitfall 2)
    SELECT date FROM stock_daily_ohlcv
    WHERE date >= v_since AND change_rate >= 10
    GROUP BY date HAVING count(*) > 100
  ),
  daily_bars AS (
    SELECT o.date, o.code, o.change_rate
    FROM stock_daily_ohlcv o
    -- 적격성 JOIN (R1): FK 고아 가드(ohlcv→stocks FK NOT VALID) 겸
    -- 상폐·스팩·ETP 제외 — isThemeEligible(89ca729, upsertThemes.ts) 기준과 정확히 일치.
    -- 미필터 시 스팩 동반 상한가 클러스터·상폐 티커가 동조 후보로 노출됨
    -- (테마 경로는 theme_stocks 가 이미 필터됨 — co-surge 만 raw ohlcv 라 필수).
    -- 주의: kosdaq_segment 는 KOSPI 에서 NULL → NOT LIKE 단독 사용 금지(IS NULL OR 필수).
    JOIN stocks s ON s.code = o.code
      AND s.is_delisted = false
      AND s.security_group NOT IN ('ETF', 'ETN', 'ELW')
      AND (s.kosdaq_segment IS NULL OR s.kosdaq_segment NOT LIKE 'SPAC%')
      AND s.name NOT LIKE '%스팩%'
    WHERE o.date >= v_since AND o.change_rate >= 10
      AND o.date NOT IN (SELECT date FROM broad_days)
  ),
  total_days AS (SELECT count(DISTINCT date) AS n FROM daily_bars),
  surge_count AS (SELECT code, count(*) AS n FROM daily_bars GROUP BY code)
  SELECT
    a.code AS code_a, b.code AS code_b,
    count(*) AS co_count,
    -- lift = 관측 동반 / 독립 가정 기대 동반 (sc_a*sc_b/total_days)
    (count(*)::numeric
      / NULLIF((sa.n::numeric * sb.n::numeric) / NULLIF(td.n, 0), 0))::numeric(8,4) AS lift,
    avg((a.change_rate + b.change_rate) / 2)::numeric(8,4)                           AS avg_pair_ret
  FROM daily_bars a
  JOIN daily_bars b ON a.date = b.date AND a.code < b.code
  JOIN surge_count sa ON sa.code = a.code
  JOIN surge_count sb ON sb.code = b.code
  CROSS JOIN total_days td
  GROUP BY a.code, b.code, sa.n, sb.n, td.n
  HAVING count(*) >= 3;             -- 적재 컷 ≥3 (노출 최저, D-04). ≥5 강함은 읽기 시 (§6)
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
