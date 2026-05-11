-- ============================================================
-- Phase 9 Plan 01: stock_daily_ohlcv 테이블 생성 (DATA-01 SC #1)
--
-- 결정 근거 (09-CONTEXT.md):
--   D-03: PK (code, date) + numeric(20,2) OHLCV + bigint volume/trade_amount
--   D-04: raw close 만 저장 (수정주가 X — 후속 phase)
--   D-05: 시가총액 컬럼 X (stocks.listing_shares × close 로 계산 가능)
--   T-09-03 옵션 B: FK NOT VALID — 폐지종목 history orphan 은 candle-sync 가
--                  런타임에 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING) 으로 해소
--   RLS: anon SELECT 허용 + service_role 쓰기 (Phase 06.1 stocks/stock_quotes 패턴 승계)
--   인덱스: PK (code, date) 외 (date DESC) — 일자별 전 종목 쿼리(스캐너용)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- Step 1. stock_daily_ohlcv 테이블 생성
-- ─────────────────────────────────────────────────────────
CREATE TABLE stock_daily_ohlcv (
  code           text          NOT NULL,                -- KRX ISU_SRT_CD (6자)
  date           date          NOT NULL,                -- BAS_DD (YYYY-MM-DD)
  open           numeric(20,2) NOT NULL,                -- TDD_OPNPRC
  high           numeric(20,2) NOT NULL,                -- TDD_HGPRC
  low            numeric(20,2) NOT NULL,                -- TDD_LWPRC
  close          numeric(20,2) NOT NULL,                -- TDD_CLSPRC (raw, D-04)
  volume         bigint        NOT NULL DEFAULT 0,      -- ACC_TRDVOL
  trade_amount   bigint        NOT NULL DEFAULT 0,      -- ACC_TRDVAL (KRW)
  change_amount  numeric(20,2),                         -- CMPPREVDD_PRC (nullable — 신규 상장일/휴장 직후 등)
  change_rate    numeric(8,4),                          -- FLUC_RT (% nullable)
  inserted_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (code, date)
);

-- ─────────────────────────────────────────────────────────
-- Step 2. FK 옵션 B (T-09-03) — NOT VALID 로 추가
--   KRX bydd_trd 가 폐지종목 history 를 반환하면 해당 종목 code 가 stocks 마스터에
--   없을 수 있음. NOT VALID 는 신규 INSERT 만 검증, 기존 row 검증 skip.
--   candle-sync (Plan 04) 가 UPSERT 직전에 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING)
--   을 수행하여 신규 row 도 항상 FK 충족.
-- ─────────────────────────────────────────────────────────
ALTER TABLE stock_daily_ohlcv
  ADD CONSTRAINT stock_daily_ohlcv_code_fkey
  FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID;

-- ─────────────────────────────────────────────────────────
-- Step 3. 인덱스 — (date DESC) 만 추가 (PK 외)
--   - 일자별 전 종목 쿼리(스캐너용)에 사용
--   - 분석 친화 인덱스(change_rate, volume 등)는 후속 phase 에서 추가 (RESEARCH §8 Open Q 6)
-- ─────────────────────────────────────────────────────────
CREATE INDEX idx_stock_daily_ohlcv_date_desc
  ON stock_daily_ohlcv (date DESC);

-- ─────────────────────────────────────────────────────────
-- Step 4. RLS — anon SELECT 허용 + service_role 만 쓰기
--   Phase 06.1 의 stocks/stock_quotes 정책과 동일 패턴
-- ─────────────────────────────────────────────────────────
ALTER TABLE stock_daily_ohlcv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_stock_daily_ohlcv"
  ON stock_daily_ohlcv FOR SELECT TO anon USING (true);

COMMIT;
