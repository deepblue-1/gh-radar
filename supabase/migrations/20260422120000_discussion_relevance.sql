-- ============================================================
-- Phase 08.1 — discussions.relevance + classified_at 컬럼 추가.
-- Requirement: DISC-01.1 (종목토론 의미성 AI 분류 저장소)
--
-- 목적:
--   Claude Haiku 4.5 로 분류한 4-카테고리 의미성 라벨을 discussions row 단위로
--   저장하여, server DiscussionListQuery 의 filter=meaningful 토글 및
--   Phase 08.1 후속 plan (classify 모듈, backfill, webapp Switch) 의 기반을 제공한다.
--
-- 분류 카테고리:
--   price_reason : 가격 움직임 이유·차트·수급 언급
--   theme        : 테마·업종·정책 언급
--   news_info    : 뉴스 인용·공시·실적 사실
--   noise        : 욕설·감탄사·뇌피셜·광고·단순 반응
--   NULL         : 아직 분류 전 또는 Claude 호출 실패
--
-- 영향 범위:
--   - nullable 컬럼 2개 추가 → 기존 15,463 행은 relevance=NULL / classified_at=NULL 유지.
--   - CHECK 제약: relevance IS NULL OR relevance IN (price_reason|theme|news_info|noise).
--   - Partial index 2개:
--       idx_discussions_unclassified : classify 워커가 미분류 행을 빠르게 조회.
--       idx_discussions_meaningful   : filter=meaningful (NULL OR != 'noise') 쿼리 가속.
--   - RLS 미변경: 기존 anon_read_discussions 정책이 새 컬럼을 자동 SELECT.
--
-- approved plan: /Users/alex/.claude/plans/08-1-breezy-pine.md §Approach Wave 1 Plan 08.1-01
-- ============================================================

ALTER TABLE discussions
  ADD COLUMN relevance TEXT,
  ADD COLUMN classified_at TIMESTAMPTZ;
ALTER TABLE discussions
  ADD CONSTRAINT discussions_relevance_check
  CHECK (relevance IS NULL OR relevance IN ('price_reason','theme','news_info','noise'));
CREATE INDEX idx_discussions_unclassified
  ON discussions (stock_code, posted_at DESC)
  WHERE classified_at IS NULL;
CREATE INDEX idx_discussions_meaningful
  ON discussions (stock_code, posted_at DESC)
  WHERE relevance IS NULL OR relevance <> 'noise';
