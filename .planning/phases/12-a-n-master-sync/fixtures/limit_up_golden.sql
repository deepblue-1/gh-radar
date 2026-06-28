-- ============================================================
-- Phase 12 Plan 02 — 마감상한가 RPC 황금 케이스 검증 fixture (LIMIT-01)
--
-- rebuild_limit_up(24) 실행 후 정확성 대조 쿼리 모음.
-- RESEARCH "Validation Architecture" 실측 황금 케이스(000390 4회 / 000440 4회·점상1) 재현 +
-- 12-01 packages/shared/src/limitUp.ts TS 미러 와 plpgsql limit_up_price() 일치 대조.
--
-- 실행법:
--   1) (선행) service_role 로 RPC 재계산:  SELECT rebuild_limit_up(24);
--   2) psql "$SUPABASE_DB_URL" -f .planning/phases/12-a-n-master-sync/fixtures/limit_up_golden.sql
--      또는 Supabase SQL editor 에 붙여넣기.
--
-- 기대값 주석은 각 블록에 인라인. lookback 24m 슬라이딩 윈도우라 재실행일에 따라 카운트 ±1 변동 가능
-- (오래된 이벤트가 윈도우 밖으로 빠지거나 신규 상한가 진입) — 부등식 sanity 는 항상 성립.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 블록 1) 호가단위 함수 검증 — limit_up_price() = TS 미러(limitUpPrice) 실측 황금 케이스
--   전부 true 기대. target(prev_close×1.3) 가격대 tick 판정(Pitfall 1).
--   95500→124100(<200k unit100), 297000→386000(<500k unit500), 386000→501000(500k경계 unit1000),
--   876000→1138000(≥500k unit1000), 60000→78000(<200k unit100).
-- ─────────────────────────────────────────────────────────
-- grep 앵커(공백 무관 리터럴): limit_up_price(95500)=124100, limit_up_price(386000)=501000
SELECT
  limit_up_price(95500)  = 124100  AS c1_95500,
  limit_up_price(297000) = 386000  AS c2_297000,
  limit_up_price(386000) = 501000  AS c3_386000_500k,
  limit_up_price(876000) = 1138000 AS c4_876000,
  limit_up_price(60000)  = 78000   AS c5_60000;
-- 기대: c1~c5 전부 t (true). 하나라도 f 면 호가단위 tier 판정 회귀.

-- ─────────────────────────────────────────────────────────
-- 블록 2) 이벤트 카운트 대조 — 000390(케이블/전선), 000440(중앙에너비스)
--   기대(RESEARCH 실측, 24m 기준): 000390 events≥4 · 000440 events≥4 · 000440 jeom≥1(점상 1회 이상).
--   lookback 시점에 따라 ±1 변동 가능(재실행일 변동) — "≥" 임계로 대조.
-- ─────────────────────────────────────────────────────────
SELECT code,
       count(*)                          AS events,
       count(*) FILTER (WHERE is_jeomsang) AS jeom
FROM limit_up_events
WHERE code IN ('000390','000440')
GROUP BY code
ORDER BY code;
-- 기대: 000390 events>=4 · 000440 events>=4, jeom>=1.

-- ─────────────────────────────────────────────────────────
-- 블록 3) 다음날 수익률 sanity — 000440 모든 이벤트 (최신순)
--   부등식: next_high_ret >= next_open_ret AND next_high_ret >= next_close_ret  (고가 ≥ 시·종)
--           next_low_ret  <= next_open_ret AND next_low_ret  <= next_close_ret  (저가 ≤ 시·종)
--   모든 행에서 성립해야 정상(OHLC 정의). 위반 행이 있으면 윈도우/LEAD 매핑 회귀.
-- ─────────────────────────────────────────────────────────
SELECT code, date, is_jeomsang,
       next_open_ret, next_high_ret, next_low_ret, next_close_ret,
       (next_high_ret >= next_open_ret
        AND next_high_ret >= next_close_ret
        AND next_low_ret  <= next_open_ret
        AND next_low_ret  <= next_close_ret) AS ohlc_sane
FROM limit_up_events
WHERE code = '000440'
ORDER BY date DESC;
-- 기대: 모든 행 ohlc_sane = t.

-- ─────────────────────────────────────────────────────────
-- 블록 4) stats 일관성 — limit_up_stock_stats.total_events == limit_up_events 실제 카운트
--   사전계산 테이블 간 정합. 불일치 시 STEP B GROUP BY 회귀.
-- ─────────────────────────────────────────────────────────
SELECT s.code,
       s.total_events,
       s.win_rate,
       (SELECT count(*) FROM limit_up_events e WHERE e.code = s.code) AS event_table_count,
       s.total_events = (SELECT count(*) FROM limit_up_events e WHERE e.code = s.code) AS consistent
FROM limit_up_stock_stats s
WHERE s.code IN ('000390','000440')
ORDER BY s.code;
-- 기대: 모든 행 consistent = t, total_events == event_table_count.
