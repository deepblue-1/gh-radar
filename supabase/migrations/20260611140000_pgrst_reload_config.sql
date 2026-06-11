-- ============================================================
-- Phase 11 Plan 02: PostgREST config reload — 20260611130000 의 service_role
--   statement_timeout=600s 변경을 PostgREST 가 재인식하도록 강제.
--
-- 배경: ALTER ROLE service_role SET statement_timeout 은 새 DB 세션에만 적용되나,
--   PostgREST 는 role 별 GUC 를 캐싱하고 pre-request 로 `SET LOCAL statement_timeout`
--   을 주입한다. reload 없이는 변경 전 캐시 값(~8s)을 계속 사용해 rebuild_comovement(24)
--   REST RPC 가 57014 로 실패.
--
-- 본 마이그레이션은 comovement 로직(rebuild_comovement 함수 본문)을 일절 변경하지 않는다.
--   오직 이미 승인된 ALTER ROLE 의 효과를 PostgREST 에 반영시키는 메커니즘만 수행.
-- ============================================================

NOTIFY pgrst, 'reload config';
