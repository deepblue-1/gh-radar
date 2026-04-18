-- ============================================================
-- Phase 07.1 — news_articles.description 컬럼 추가.
-- Naver Search API 의 description 스니펫(평균 126자, HTML 태그 포함)을
-- stripHtml 처리 후 저장하여 Phase 9 Claude Haiku 요약의 입력으로 사용한다.
--
-- 결정 근거:
--   Phase 7 D4 revision — 원 결정은 "description → content_hash 계산 입력, DB 저장 안 함".
--   2026-04-17 Naver API 실측 결과, description 이 유니크 주제 4-5개/20건 커버하며
--   트레이더 핵심 정보 70-80% 포함 → Phase 9 AI 요약의 핵심 입력으로 승격.
--
-- 영향 범위:
--   - nullable 컬럼 추가 → 기존 1,103 행은 description=NULL 로 유지 (backfill 없음).
--   - content_hash 계산은 변경 없음 (title + '\n' + stripHtml(description)) — idempotency 유지.
--   - UNIQUE(stock_code, url) + ignoreDuplicates=true → 동일 URL 재수집 시 insert skip,
--     기존 row 의 description(NULL)은 업데이트되지 않음 → 첫 수집값 보존 정책 유지.
--   - URL 원문 scraping 은 본 phase 범위 아님 (Phase 9 POC 후 재검토).
-- ============================================================

ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS description text;
