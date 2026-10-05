-- ============================================================
-- Phase 28 리뷰 WR-B02 — `limitup_commit_day` 에 함수 단위 statement_timeout 을 건다.
--
-- 왜: 날짜 하나의 표 교체는 RPC 한 번(8표 DELETE · INSERT · 한 트랜잭션 — D-17)이라 쪼갤 수 없다. 로컬 실측으로 가장 큰
--   날(member_alloc 79,220행)이 2~3초였고, 28-03 SUMMARY 는 PostgREST 경로의 8초 한도를 위험으로 남겼다. 상한가 종목이
--   많은 날 member_alloc 이 몇 배로 늘면 `57014 canceling statement due to statement timeout` 이 나고 그 날짜는 매일
--   같은 자리에서 실패한다. service_role 역할 설정(20260611130000 의 600s)에 기대지 않고 이 함수의 한도를 함수 정의에
--   직접 적는다.
--
-- 어떻게 동작하나: 함수 본문 안의 `SET statement_timeout` 은 이미 시작된 바깥 문장의 타이머에 효과가 없다
--   (20260611130000 머리말). 대신 함수 속성(`ALTER FUNCTION … SET`)은 PostgREST 가 호출 트랜잭션에 `SET LOCAL` 로
--   끌어올린다(db-hoisted-tx-settings 기본값에 statement_timeout 포함) — 이 RPC 호출에만 적용되고 역할 전역 설정은
--   바꾸지 않는다. 120s = 로컬 최대 실측의 수십 배 · Job task-timeout(1800s) 안.
--
-- 본문은 바꾸지 않는다(ALTER 만). 권한은 20261006090200 과 같게 다시 적는다 — PUBLIC · anon · authenticated 명시
--   REVOKE + service_role GRANT(플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 되돌리기: ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) RESET statement_timeout;
-- ============================================================

BEGIN;

ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';

REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 함수 속성을 다시 읽게 한다.
NOTIFY pgrst, 'reload schema';
