-- ============================================================
-- Phase 06.1 Plan 02: stocks 테이블 3-분리 (D1, D2, D5, D6)
--   기존 stocks (마스터+시세+랭킹) → stocks (마스터) + stock_quotes (시세) + top_movers (랭킹)
--
-- 결정 근거:
--   D1: 역할 분리 (stocks=무엇이 존재 / stock_quotes=지금 얼마 / top_movers=이번 스캔에 뽑힘)
--   D2: 마이그레이션 경로 — 기존 stocks → top_movers rename → 시세 분리 → 새 stocks 신설
--   D5: ingestion 은 stock_quotes + top_movers 에만 쓰기, stocks 는 master-sync Job 만 쓰기
--   D6: 마스터 메타 = code/name/market/sector/security_type/listing_date/is_delisted
--   Pitfall 1: news_articles/discussions FK 명시적 drop+re-create (rename 후 OID 가 top_movers 가리킴)
--   Open Q2: top_movers 는 매 cycle 교체 모델 (옵션 A) — scan_id 컬럼은 추가하되 단일 row/code
-- ============================================================

BEGIN;

-- ---------------------------------------------------------
-- Step 1. 기존 stocks → top_movers 로 rename + 인덱스 rename
--   인덱스/시퀀스 자동 승계되지만 인덱스 이름은 명시 rename 필요
-- ---------------------------------------------------------
ALTER TABLE stocks RENAME TO top_movers;
ALTER INDEX idx_stocks_change_rate_desc RENAME TO idx_top_movers_change_rate_desc;
ALTER INDEX idx_stocks_market           RENAME TO idx_top_movers_market;

-- Pitfall 1 — news_articles/discussions FK 가 rename 후 top_movers 를 가리킴.
-- Step 7 에서 새 stocks 생성 후 명시적으로 re-point.

-- ---------------------------------------------------------
-- Step 2. stock_quotes 분리 생성 — 시세 컬럼 이전
--   FK 는 Step 6 (새 stocks 생성 + 부트스트랩 후) 에서 추가
-- ---------------------------------------------------------
CREATE TABLE stock_quotes (
  code          text PRIMARY KEY,
  price         numeric(20,2) NOT NULL,
  change_amount numeric(20,2) NOT NULL,
  change_rate   numeric(8,4)  NOT NULL,
  volume        bigint NOT NULL DEFAULT 0,
  trade_amount  bigint NOT NULL DEFAULT 0,
  open          numeric(20,2),
  high          numeric(20,2),
  low           numeric(20,2),
  market_cap    bigint,
  upper_limit   numeric(20,2) NOT NULL,
  lower_limit   numeric(20,2) NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO stock_quotes (
  code, price, change_amount, change_rate, volume, trade_amount,
  open, high, low, market_cap, upper_limit, lower_limit, updated_at
)
SELECT code, price, change_amount, change_rate, volume, trade_amount,
       open, high, low, market_cap, upper_limit, lower_limit, updated_at
FROM top_movers;

-- ---------------------------------------------------------
-- Step 3. top_movers 에서 시세 컬럼 제거 + 랭킹 컬럼 추가
-- ---------------------------------------------------------
ALTER TABLE top_movers
  DROP COLUMN price,
  DROP COLUMN change_amount,
  DROP COLUMN change_rate,
  DROP COLUMN volume,
  DROP COLUMN trade_amount,
  DROP COLUMN open,
  DROP COLUMN high,
  DROP COLUMN low,
  DROP COLUMN market_cap,
  DROP COLUMN upper_limit,
  DROP COLUMN lower_limit;

-- 시세 컬럼이 빠진 후 idx_top_movers_change_rate_desc 는 무효 → drop
DROP INDEX IF EXISTS idx_top_movers_change_rate_desc;

ALTER TABLE top_movers
  ADD COLUMN rank      int,
  ADD COLUMN ranked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN scan_id   uuid;

CREATE INDEX idx_top_movers_rank ON top_movers (rank ASC NULLS LAST);
CREATE INDEX idx_top_movers_ranked_at ON top_movers (ranked_at DESC);

-- ---------------------------------------------------------
-- Step 4. 새 stocks 마스터 테이블 생성
-- ---------------------------------------------------------
CREATE TABLE stocks (
  code           text PRIMARY KEY,                           -- KRX ISU_SRT_CD
  name           text NOT NULL,                              -- KRX ISU_ABBRV
  market         text NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ')),
  sector         text,                                       -- 업종 — KRX 응답에 없음, 현 phase 는 NULL (C1 옵션 A)
  kosdaq_segment text,                                       -- KRX SECT_TP_NM — KOSDAQ 소속부 (KOSPI 는 NULL)
  security_type  text NOT NULL DEFAULT '보통주',              -- KRX KIND_STKCERT_TP_NM
  security_group text NOT NULL DEFAULT '주권',                -- KRX SECUGRP_NM
  english_name   text,                                       -- KRX ISU_ENG_NM
  listing_date   date,
  par_value      bigint,                                     -- KRX PARVAL
  listing_shares bigint,                                     -- KRX LIST_SHRS
  is_delisted    boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stocks_market     ON stocks (market);
CREATE INDEX idx_stocks_updated_at ON stocks (updated_at DESC);

-- 한국어 부분일치 검색 인덱스 (RESEARCH Standard Stack)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_stocks_name_trgm ON stocks USING GIN (name gin_trgm_ops);

-- ---------------------------------------------------------
-- Step 5. 새 stocks 부트스트랩 — 기존 top_movers 의 종목을 마스터에 시드
--   Plan 03 master-sync 가 KRX 전종목으로 덮어쓰기 전 임시 universe.
--   ingestion(stock_quotes upsert) FK 제약을 막기 위함.
-- ---------------------------------------------------------
INSERT INTO stocks (code, name, market, security_type, updated_at)
SELECT code, name, market, '보통주', now()
FROM top_movers
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------
-- Step 6. FK 정책 — stock_quotes.code → stocks(code) ON DELETE CASCADE
-- ---------------------------------------------------------
ALTER TABLE stock_quotes
  ADD CONSTRAINT stock_quotes_code_fkey
  FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE;

CREATE INDEX idx_stock_quotes_change_rate_desc
  ON stock_quotes (change_rate DESC NULLS LAST);
CREATE INDEX idx_stock_quotes_updated_at
  ON stock_quotes (updated_at DESC);

-- ---------------------------------------------------------
-- Step 7. news_articles / discussions FK 명시적 re-point (Pitfall 1)
--   rename 후 OID 가 top_movers 를 가리키므로 drop + add 필수.
--   기존 제약 이름: news_articles_stock_code_fkey, discussions_stock_code_fkey
-- ---------------------------------------------------------
ALTER TABLE news_articles
  DROP CONSTRAINT IF EXISTS news_articles_stock_code_fkey;
ALTER TABLE news_articles
  ADD CONSTRAINT news_articles_stock_code_fkey
  FOREIGN KEY (stock_code) REFERENCES stocks(code) ON DELETE CASCADE;

ALTER TABLE discussions
  DROP CONSTRAINT IF EXISTS discussions_stock_code_fkey;
ALTER TABLE discussions
  ADD CONSTRAINT discussions_stock_code_fkey
  FOREIGN KEY (stock_code) REFERENCES stocks(code) ON DELETE CASCADE;

-- ---------------------------------------------------------
-- Step 8. RLS 승계 (Phase 1 D-17 정책 — anon SELECT 허용, 쓰기는 service_role)
--   기존 stocks RLS 는 rename 후 top_movers 에 자동 승계됨 (정책명만 rename).
--   정책 이름: anon_read_stocks → anon_read_top_movers
-- ---------------------------------------------------------
ALTER POLICY "anon_read_stocks" ON top_movers RENAME TO "anon_read_top_movers";

-- 새 stocks (마스터) + stock_quotes 에 anon SELECT 정책 신설
ALTER TABLE stocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_stocks_master"
  ON stocks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_stock_quotes"
  ON stock_quotes FOR SELECT TO anon USING (true);

COMMIT;
