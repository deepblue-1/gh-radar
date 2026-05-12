-- ============================================================
-- Phase 9 hotfix — change_rate 컬럼 numeric(8,4) → numeric(10,4)
--
-- 발견 (Plan 06 백필 실행 2026-05-12 12:18 KST):
--   basDd=20260209 에서 KOSDAQ 052670 (제일바이오) FLUC_RT="29948.08" 응답.
--   원 schema 의 numeric(8,4) (max ±9999.9999) 가 overflow → 해당일 전체 upsert 실패
--   (daysFailed=1, per-day 격리로 다른 1657일은 정상 적재됨).
--
-- 결정: numeric(10,4) (max ±999,999.9999, 30,000% 의 33배 마진) 으로 확장.
--   - 거래정지/감자/액면분할/신규상장 첫 거래일 등의 비정상 등락률 정상 저장
--   - D-04 raw 데이터 보존 정신 유지 — cap 하지 않음
--   - PostgreSQL ALTER COLUMN ... TYPE 는 동일 정밀도 확장이므로 row 재작성 없음
-- ============================================================

BEGIN;

ALTER TABLE stock_daily_ohlcv
  ALTER COLUMN change_rate TYPE numeric(10,4);

COMMIT;
