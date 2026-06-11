-- ============================================================
-- Phase 11 Plan 02: service_role statement_timeout 상향 (rebuild_comovement REST 경로 전제)
--
-- 문제: rebuild_comovement(24) 를 PostgREST REST RPC 로 호출하면 service_role 의
--   기본 statement_timeout(~8s) 에 걸려 57014 "canceling statement due to statement timeout"
--   로 500 실패. co-surge self-join(daily_bars × daily_bars)이 8s 를 초과.
--
-- 왜 role 레벨인가:
--   rebuild_comovement() 함수 본문 안에 `SET statement_timeout` 을 넣어도, 이미 시작된
--   outer statement(SELECT rebuild_comovement(...))의 타이머에는 무효 — 함수 진입 시점엔
--   이미 카운트다운이 시작됨. PostgREST 가 호출하는 service_role 자체의 기본 타임아웃을
--   올리는 role 레벨 SET 이 정답 (Plan 02 caveat 명시).
--
-- 야간 1회 배치(Plan 04 Cloud Run Job)라 사용자 트래픽과 무관 — 600s 는 안전한 상한.
-- 광역일 제외로 self-join 약 60% 절감(RESEARCH §DoS) 후에도 여유 확보.
-- service_role 은 백엔드 전용(anon/authenticated 무관)이라 공개 API 응답성에 영향 없음.
-- ============================================================

ALTER ROLE service_role SET statement_timeout = '600s';
