-- ============================================================
-- Phase 09.2 RESEARCH 단계 fix:
-- stock_daily_ohlcv 의 SELECT 정책이 `TO anon` 만 명시되어
-- Google 로그인한 사용자(authenticated role)가 default-deny 로 0 행 받음.
--
-- 전례: 20260416120000_watchlists.sql 가 stocks/stock_quotes 의 동일 함정을
--       fix 한 패턴 (`TO anon, authenticated`) 그대로 승계.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "anon_read_stock_daily_ohlcv" ON stock_daily_ohlcv;

CREATE POLICY "public_read_stock_daily_ohlcv"
  ON stock_daily_ohlcv FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
