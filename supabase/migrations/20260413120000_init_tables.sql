-- ============================================================
-- gh-radar: 초기 테이블 생성
-- Phase 1: stocks, kis_tokens (데이터 채움)
-- Phase 7-9: news_articles, discussions, summaries (스켈레톤)
-- ============================================================

-- summaries를 먼저 생성 (news_articles에서 FK 참조)
CREATE TABLE IF NOT EXISTS summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash  text NOT NULL UNIQUE,
  summary_type  text NOT NULL CHECK (summary_type IN ('news', 'discussion')),
  summary_text  text NOT NULL,
  sentiment     jsonb,
  model         text NOT NULL,
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stocks (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  market        text NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ')),
  price         numeric(20,2) NOT NULL,
  change_amount numeric(20,2) NOT NULL,
  change_rate   numeric(8,4)  NOT NULL,
  volume        bigint NOT NULL DEFAULT 0,
  open          numeric(20,2),
  high          numeric(20,2),
  low           numeric(20,2),
  market_cap    bigint,
  upper_limit   numeric(20,2) NOT NULL,
  lower_limit   numeric(20,2) NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stocks_change_rate_desc
  ON stocks (change_rate DESC NULLS LAST);
CREATE INDEX idx_stocks_market
  ON stocks (market);

CREATE TABLE IF NOT EXISTS news_articles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  title         text NOT NULL,
  source        text,
  url           text NOT NULL,
  published_at  timestamptz NOT NULL,
  content_hash  text,
  summary_id    uuid REFERENCES summaries(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, url)
);

CREATE INDEX idx_news_stock_published
  ON news_articles (stock_code, published_at DESC);

CREATE TABLE IF NOT EXISTS discussions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  post_id       text NOT NULL,
  title         text,
  body          text,
  author        text,
  posted_at     timestamptz,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, post_id)
);

CREATE INDEX idx_discussions_stock_posted
  ON discussions (stock_code, posted_at DESC);

CREATE TABLE IF NOT EXISTS kis_tokens (
  id            text PRIMARY KEY CHECK (id = 'current'),
  access_token  text NOT NULL,
  token_type    text NOT NULL DEFAULT 'Bearer',
  expires_at    timestamptz NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now()
);
