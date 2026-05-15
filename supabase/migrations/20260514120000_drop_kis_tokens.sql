-- ============================================================
-- Phase 09.1 Plan 01: kis_tokens DROP
--
-- 결정 근거 (09.1-CONTEXT.md / 09.1-RESEARCH.md §5.2 Migration 1):
--   D-01: KIS 사용처 0 — workers/ingestion 폐기 + server/src/kis/ 폐기 +
--         packages/shared/src/kis.ts 폐기 후 kis_tokens 테이블 정리
--   T-09.1-04: 본 파일은 Wave 0 에 작성하지만, Wave 4 의 KIS 폐기 cutover
--              마지막 step (12.1 step 10 — Cloud Scheduler PAUSE → Job 삭제 →
--              SA 정리 → Secret 정리 후) 에서만 production push.
--              Wave 0 push 시 KIS ingestion worker 가 토큰 발급 실패
--              (kis_tokens 의존) → push 순서를 Plan 09 [BLOCKING] 에서 지정.
-- ============================================================

BEGIN;

-- CASCADE: kis_tokens 에 FK 가 걸린 객체는 없지만 안전망
DROP TABLE IF EXISTS public.kis_tokens CASCADE;

COMMIT;
