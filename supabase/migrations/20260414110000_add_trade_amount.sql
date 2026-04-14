-- ============================================================
-- Phase 05.2: SCAN-04 trade_amount 컬럼 추가
-- stocks.volume(주식수)과 별개로 거래대금(KRW)을 보관한다.
-- KIS 등락률 순위 응답 acml_tr_pbmn 필드를 upsert한다.
--
-- 결정 근거: .planning/phases/05.2-scanner-db-inserted/05.2-CONTEXT.md
--   D-01: stocks 테이블에 trade_amount bigint NOT NULL DEFAULT 0 추가, volume 유지
--   D-02: 별도 backfill 없음 - DEFAULT 0 후 다음 ingestion cycle에서 자동 갱신
--   D-03: RLS 정책은 Phase 1 D-17 자동 상속 (column-level 변경)
-- ============================================================

ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS trade_amount bigint NOT NULL DEFAULT 0;
