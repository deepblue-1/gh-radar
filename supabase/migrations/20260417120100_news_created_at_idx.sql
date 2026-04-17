-- ============================================================
-- Phase 07 Plan 01 — news_articles 의 cooldown MAX(created_at) / retention 쿼리 효율화.
-- news-sync worker 의 cooldown 체크 (SELECT MAX(created_at) WHERE stock_code=?) 및
-- 주기적 retention DELETE (created_at < now() - interval '7 days') 가 이 인덱스를 사용한다.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_news_created_at
  ON news_articles (created_at DESC);
