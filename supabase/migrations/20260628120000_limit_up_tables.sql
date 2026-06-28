-- ============================================================
-- Phase 12 Plan 02: limit_up_events / limit_up_stock_stats / limit_up_theme_stats
--   (마감상한가 다음날 이력 사전계산 + 호가단위 함수 + full-rebuild RPC)
--   LIMIT-01 토대 — RESEARCH §1 호가단위 / §2 백테스트 CTE / §3 회전율 / §4 테마 풀링 을
--   comovement_tables.sql 톤(BEGIN/COMMIT · 공개 read RLS · REVOKE 3줄 ·
--   SECURITY DEFINER search_path · TRUNCATE+INSERT · GET DIAGNOSTICS · jsonb_build_object)으로 작성.
--
-- 핵심 판별(D-01): 마감상한가 = close = limit_up_price(prev_close) (정수 정확 비교, 비율 임계 아님).
--   limit_up_price() 는 12-01 의 TS 미러 limitUpPrice() 의 plpgsql 대응 — 황금 케이스로 회귀 대조.
--
-- 결정 근거 (12-CONTEXT.md / 12-RESEARCH.md):
--   D-01: 이벤트 판별 = close == 전일종가×1.30 호가단위 산출값 (price 매칭, 비율 게이트 아님).
--   D-03: 점상 = open=high=low=close (OHLC 만으로 판별).
--   D-10: 최근 N(=3)회 보조 스탯 (감쇠공식 미사용, 최신순 + recent_wins/losses).
--   D-11: 시초가 수익률 분포 5버킷 히스토그램 [−10~−5, −5~0, 0~+5, +5~+10, +10%+].
--   D-15~D-17: 테마 풀링 = active 시스템 테마(hidden=false, effective_to IS NULL) 멤버 이벤트 풀.
--   회전율 = volume / stocks.listing_shares (listing_shares NULL/0 이면 NULL).
--
--   Pitfall 1: 호가단위 tick 은 target(prev_close×1.3) 가격대 기준 (prev_close 기준 시 경계 오류).
--   Pitfall 3: 수익률은 ::numeric 유지 (float8 캐스팅 금지 — 정밀도 손실 회귀).
--   Pitfall 4: WHERE next_open IS NOT NULL — 가장 최근 이벤트(다음날 부재) 통계 제외.
--   Pitfall 7: 신규 테이블 RLS TO anon, authenticated 둘 다 + RPC REVOKE 3줄.
--
--   threat register:
--     T-12-02-01 (권한상승): rebuild_limit_up() REVOKE 3줄 (PUBLIC + anon,authenticated + GRANT service_role)
--     T-12-02-02 (권한상승): SECURITY DEFINER SET search_path = public, pg_temp (하이재킹 방지)
--     T-12-02-03 (DoS자기):  신규 3테이블 RLS TO anon, authenticated 둘 다 (default-deny 회피)
--     T-12-02-04 (변조):     워커만 service_role 로 RPC 호출 → INSERT, 사용자 쓰기 경로 없음(read-only RLS)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1) limit_up_price(prev_close) — 호가단위 마감상한가 산출 (RESEARCH §1, IMMUTABLE)
--    target = prev_close × 1.3, tick 은 target 가격대 7-tier (2023-01-25 개정표, Pitfall 1).
--    순수 산술 — SECURITY DEFINER 아님, REVOKE 불요(읽기 전용 산술).
--    12-01 packages/shared/src/limitUp.ts 의 limitUpPrice() 와 동형 (회귀 대조 기준).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limit_up_price(prev_close numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN prev_close * 1.3 < 2000   THEN floor(prev_close * 1.3 / 1)    * 1
    WHEN prev_close * 1.3 < 5000   THEN floor(prev_close * 1.3 / 5)    * 5
    WHEN prev_close * 1.3 < 20000  THEN floor(prev_close * 1.3 / 10)   * 10
    WHEN prev_close * 1.3 < 50000  THEN floor(prev_close * 1.3 / 50)   * 50
    WHEN prev_close * 1.3 < 200000 THEN floor(prev_close * 1.3 / 100)  * 100
    WHEN prev_close * 1.3 < 500000 THEN floor(prev_close * 1.3 / 500)  * 500
    ELSE                                floor(prev_close * 1.3 / 1000) * 1000
  END;
$$;

-- ─────────────────────────────────────────────────────────
-- 2) limit_up_events — 마감상한가 이벤트 1건 = 다음날 OHLC 수익률 + 거래대금/회전율 (히어로 리스트 row)
--    PK (code, date). next_open IS NOT NULL 인 이벤트만 적재 (Pitfall 4).
-- ─────────────────────────────────────────────────────────
CREATE TABLE limit_up_events (
  code           text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  date           date NOT NULL,
  is_jeomsang    boolean NOT NULL,                  -- 점상 = open=high=low=close (D-03)
  next_open_ret  numeric(8,2) NOT NULL,             -- 다음날 시초가 수익률 % (핵심 지표)
  next_high_ret  numeric(8,2) NOT NULL,             -- 다음날 고가 수익률 % (참고용)
  next_low_ret   numeric(8,2) NOT NULL,             -- 다음날 저가 수익률 %
  next_close_ret numeric(8,2) NOT NULL,             -- 다음날 종가 수익률 %
  trade_amount   bigint NOT NULL,                   -- 상한가 당일 거래대금 (원)
  turnover       numeric(8,4),                      -- 회전율 = volume/listing_shares (NULL 허용)
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, date)
);
CREATE INDEX idx_limit_up_events_code ON limit_up_events (code);

-- ─────────────────────────────────────────────────────────
-- 3) limit_up_stock_stats — 종목 자체 히어로 통계 (익절률/평균/최악/히스토그램)
--    PK (code). win_rate 적재는 항상(NULL 가능), N≥3 게이팅은 읽기 시 (D-09).
-- ─────────────────────────────────────────────────────────
CREATE TABLE limit_up_stock_stats (
  code            text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  total_events    int NOT NULL,                     -- 전체 마감상한가 이벤트 수
  resolved_events int NOT NULL,                     -- 다음날 데이터 존재 이벤트 수 (events 가 이미 next_open NOT NULL)
  win_count       int NOT NULL,                     -- 시초가 익절(>0) 횟수
  win_rate        numeric(5,4),                     -- 시초가 익절률 (적재는 항상, N≥3 게이팅은 읽기 시)
  avg_open_ret    numeric(8,2),                     -- 평균 시초가 수익률
  worst_low_ret   numeric(8,2),                     -- 최악 저가 수익률
  recent_wins     int NOT NULL,                     -- 최근 3회 익절 (D-10)
  recent_losses   int NOT NULL,                     -- 최근 3회 손실 (D-10)
  bucket_n10_n5   int NOT NULL,                     -- 히스토그램 [−10~−5) (D-11)
  bucket_n5_0     int NOT NULL,                     --             [−5~0)
  bucket_0_p5     int NOT NULL,                     --             [0~+5)
  bucket_p5_p10   int NOT NULL,                     --             [+5~+10)
  bucket_p10      int NOT NULL,                     --             [+10%+]
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code)
);

-- ─────────────────────────────────────────────────────────
-- 4) limit_up_theme_stats — 소속 테마별 분리 익절 통계 (per-stock 과 별도)
--    PK (theme_id). sample_n = 멤버 풀 누적 마감상한가 이벤트 수 (D-17). theme_id PK 라 인덱스 불요.
-- ─────────────────────────────────────────────────────────
CREATE TABLE limit_up_theme_stats (
  theme_id     uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  sample_n     int NOT NULL,                        -- 테마 멤버 풀 누적 이벤트 수 (D-17)
  win_count    int NOT NULL,                        -- 시초가 익절 횟수
  win_rate     numeric(5,4),                        -- 테마 익절률 (sample_n 게이팅은 읽기 시)
  avg_open_ret numeric(8,2),                        -- 테마 평균 시초가 수익률
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id)
);

-- ─────────────────────────────────────────────────────────
-- 5) RLS — 공개 read (TO anon, authenticated 둘 다 — default-deny 함정 회피, Pitfall 7)
-- ─────────────────────────────────────────────────────────
ALTER TABLE limit_up_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE limit_up_stock_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE limit_up_theme_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_limit_up_events"      ON limit_up_events      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read_limit_up_stock_stats" ON limit_up_stock_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read_limit_up_theme_stats" ON limit_up_theme_stats FOR SELECT TO anon, authenticated USING (true);

-- ─────────────────────────────────────────────────────────
-- 6) rebuild_limit_up() — full-rebuild plpgsql (RESEARCH §2 백테스트 CTE → §4 테마 풀링)
--    STEP A: limit_up_events (호가단위 마감상한가 + 다음날 수익률 + 회전율)
--    STEP B: limit_up_stock_stats (종목 GROUP BY 익절률/히스토그램/최근3회)
--    STEP C: limit_up_theme_stats (active 시스템 테마 멤버 풀 GROUP BY)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rebuild_limit_up(
  p_lookback_months int DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since      date := (current_date - (p_lookback_months || ' months')::interval)::date;
  v_event_rows int;
  v_stat_rows  int;
  v_theme_rows int;
BEGIN
  -- ── STEP A — limit_up_events (RESEARCH §2 ordered → events CTE) ──
  TRUNCATE limit_up_events;
  INSERT INTO limit_up_events
    (code, date, is_jeomsang, next_open_ret, next_high_ret, next_low_ret, next_close_ret, trade_amount, turnover)
  WITH ordered AS (
    SELECT o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.trade_amount, o.change_rate,
      LAG(o.close)  OVER (PARTITION BY o.code ORDER BY o.date) AS prev_close,
      LEAD(o.open)  OVER (PARTITION BY o.code ORDER BY o.date) AS next_open,
      LEAD(o.high)  OVER (PARTITION BY o.code ORDER BY o.date) AS next_high,
      LEAD(o.low)   OVER (PARTITION BY o.code ORDER BY o.date) AS next_low,
      LEAD(o.close) OVER (PARTITION BY o.code ORDER BY o.date) AS next_close
    FROM stock_daily_ohlcv o
    WHERE o.date >= v_since
  ),
  events AS (
    SELECT * FROM ordered
    WHERE prev_close IS NOT NULL
      AND change_rate <= 31                          -- 신규상장/증자 아티팩트 배제 (D-01 게이트)
      AND close = limit_up_price(prev_close)         -- 마감상한가 (정수 정확 비교, D-01)
      AND next_open IS NOT NULL                      -- 다음날 부재 이벤트 제외 (Pitfall 4)
  )
  SELECT
    e.code,
    e.date,
    (e.open = e.high AND e.high = e.low AND e.low = e.close)        AS is_jeomsang,  -- 점상 (D-03)
    ((e.next_open  - e.close) / e.close * 100)::numeric(8,2)         AS next_open_ret,
    ((e.next_high  - e.close) / e.close * 100)::numeric(8,2)         AS next_high_ret,
    ((e.next_low   - e.close) / e.close * 100)::numeric(8,2)         AS next_low_ret,
    ((e.next_close - e.close) / e.close * 100)::numeric(8,2)         AS next_close_ret,
    e.trade_amount,
    CASE
      WHEN s.listing_shares IS NULL OR s.listing_shares = 0 THEN NULL
      ELSE (e.volume::numeric / s.listing_shares)::numeric(8,4)      -- 회전율 = 거래량/상장주식수
    END                                                             AS turnover
  FROM events e
  JOIN stocks s ON s.code = e.code;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  -- ── STEP B — limit_up_stock_stats (종목 GROUP BY) ──
  TRUNCATE limit_up_stock_stats;
  INSERT INTO limit_up_stock_stats
    (code, total_events, resolved_events, win_count, win_rate, avg_open_ret, worst_low_ret,
     recent_wins, recent_losses,
     bucket_n10_n5, bucket_n5_0, bucket_0_p5, bucket_p5_p10, bucket_p10)
  WITH recent AS (
    -- 종목별 최근 3 이벤트 (date DESC) — recent_wins/losses 분모 (D-10)
    SELECT code, next_open_ret,
           row_number() OVER (PARTITION BY code ORDER BY date DESC) AS rn
    FROM limit_up_events
  ),
  recent_agg AS (
    SELECT code,
           count(*) FILTER (WHERE next_open_ret > 0)  AS recent_wins,
           count(*) FILTER (WHERE next_open_ret <= 0) AS recent_losses
    FROM recent WHERE rn <= 3 GROUP BY code
  )
  SELECT
    e.code,
    count(*)                                                                        AS total_events,
    count(*)                                                                        AS resolved_events,  -- events 가 이미 next_open NOT NULL
    count(*) FILTER (WHERE e.next_open_ret > 0)                                      AS win_count,
    (count(*) FILTER (WHERE e.next_open_ret > 0)::numeric
       / NULLIF(count(*), 0))::numeric(5,4)                                          AS win_rate,
    avg(e.next_open_ret)::numeric(8,2)                                              AS avg_open_ret,
    min(e.next_low_ret)::numeric(8,2)                                              AS worst_low_ret,
    COALESCE(ra.recent_wins, 0)                                                     AS recent_wins,
    COALESCE(ra.recent_losses, 0)                                                   AS recent_losses,
    count(*) FILTER (WHERE e.next_open_ret < -5)                                     AS bucket_n10_n5,
    count(*) FILTER (WHERE e.next_open_ret >= -5 AND e.next_open_ret < 0)            AS bucket_n5_0,
    count(*) FILTER (WHERE e.next_open_ret >= 0  AND e.next_open_ret < 5)            AS bucket_0_p5,
    count(*) FILTER (WHERE e.next_open_ret >= 5  AND e.next_open_ret < 10)           AS bucket_p5_p10,
    count(*) FILTER (WHERE e.next_open_ret >= 10)                                    AS bucket_p10
  FROM limit_up_events e
  LEFT JOIN recent_agg ra ON ra.code = e.code
  GROUP BY e.code, ra.recent_wins, ra.recent_losses;
  GET DIAGNOSTICS v_stat_rows = ROW_COUNT;

  -- ── STEP C — limit_up_theme_stats (active 시스템 테마 멤버 풀, §4 / D-15~D-17) ──
  TRUNCATE limit_up_theme_stats;
  INSERT INTO limit_up_theme_stats
    (theme_id, sample_n, win_count, win_rate, avg_open_ret)
  WITH active_members AS (
    -- active 시스템 테마 멤버 (hidden=false, effective_to IS NULL)
    SELECT ts.theme_id, ts.stock_code
    FROM theme_stocks ts
    JOIN themes th ON th.id = ts.theme_id AND th.is_system = true AND th.hidden = false
    WHERE ts.effective_to IS NULL
  ),
  theme_pool AS (
    -- 멤버 종목들의 마감상한가 이벤트 풀 → theme_id 별 집계 입력
    SELECT am.theme_id, e.next_open_ret
    FROM active_members am
    JOIN limit_up_events e ON e.code = am.stock_code
  )
  SELECT
    theme_id,
    count(*)                                                                        AS sample_n,
    count(*) FILTER (WHERE next_open_ret > 0)                                        AS win_count,
    (count(*) FILTER (WHERE next_open_ret > 0)::numeric
       / NULLIF(count(*), 0))::numeric(5,4)                                          AS win_rate,
    avg(next_open_ret)::numeric(8,2)                                                AS avg_open_ret
  FROM theme_pool
  GROUP BY theme_id
  HAVING count(*) >= 1;        -- 모든 풀 적재 (노출 정렬은 읽기 시 N desc)
  GET DIAGNOSTICS v_theme_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'lookback_since',  v_since,
    'event_rows',      v_event_rows,
    'stock_stat_rows', v_stat_rows,
    'theme_stat_rows', v_theme_rows,
    'rebuilt_at',      now()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 7) REVOKE/GRANT — rebuild RPC 만 (재계산은 워커 service_role 전용, Pitfall 7 / T-12-02-01)
--    limit_up_price 는 REVOKE 없음 (순수 산술, 읽기 전용).
-- ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.rebuild_limit_up(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_limit_up(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rebuild_limit_up(int) TO service_role;

COMMIT;
