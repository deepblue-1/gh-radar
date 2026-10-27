-- ============================================================
-- Phase 35 Plan 12 — 발사 계획 변경 이력(launch_plan_changes) · 기록/읽기 RPC pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261028200100_launch_plan_changes.sql
--
-- 잠그는 것:
--   - 트레이서: launch_plan_change_record 로 한 행(KB120 · q16 · Q · before [-350,-345,-325] · after [-340,-335,-322] ·
--     ok · plan_rev 7) → 반환 jsonb 키 집합 = shared LAUNCH_PLAN_CHANGE_COLUMNS 12개(계약 핀) →
--     launch_plan_changes_for_admin(20) 이 { changes: [그 행] } 으로 같은 키를 돌려준다.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_plan_changes.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (서버, 발사, 시장, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

SELECT plan(5);

-- shared LAUNCH_PLAN_CHANGE_COLUMNS 와 같은 12개(정렬본 비교).
CREATE TEMP TABLE t_cols AS
SELECT ARRAY(SELECT unnest(ARRAY[
  'id', 'at', 'admin_email', 'gateway', 'fire', 'market',
  'before_us', 'after_us', 'outcome', 'code', 'message', 'plan_rev'
]) ORDER BY 1) AS cols;

-- ── 1. 트레이서: 한 행 기록 → 읽기 ─────────────────────────────────
INSERT INTO t_setup SELECT 'ok_1', public.launch_plan_change_record(jsonb_build_object(
  'admin_email', 'admin@example.com',
  'gateway', 'KB120',
  'fire', 'q16',
  'market', 'Q',
  'before_us', jsonb_build_array(-350, -345, -325),
  'after_us', jsonb_build_array(-340, -335, -322),
  'outcome', 'ok',
  'plan_rev', 7
));

SELECT is(
  (SELECT ARRAY(SELECT jsonb_object_keys(r) ORDER BY 1) FROM t_setup WHERE label = 'ok_1'),
  (SELECT cols FROM t_cols),
  '(KB120, q16, Q, 키 12개) launch_plan_change_record 반환 키 집합 = LAUNCH_PLAN_CHANGE_COLUMNS'
);

SELECT is(
  (SELECT r -> 'after_us' FROM t_setup WHERE label = 'ok_1'),
  '[-340, -335, -322]'::jsonb,
  '(KB120, q16, Q, after) after_us = [-340,-335,-322]'
);

SELECT is(
  (SELECT jsonb_build_array(r -> 'before_us', r ->> 'outcome', (r ->> 'plan_rev')::bigint, r -> 'code', r -> 'message')
     FROM t_setup WHERE label = 'ok_1'),
  jsonb_build_array('[-350, -345, -325]'::jsonb, 'ok', 7, NULL, NULL),
  '(KB120, q16, Q, before · ok · rev 7) before_us · outcome · plan_rev 왕복 · code/message null'
);

SELECT is(
  public.launch_plan_changes_for_admin(20),
  jsonb_build_object('changes', jsonb_build_array((SELECT r FROM t_setup WHERE label = 'ok_1'))),
  '(—, —, —, 1행) launch_plan_changes_for_admin(20) = { changes: [기록 행] }'
);

SELECT is(
  ARRAY(SELECT jsonb_object_keys(public.launch_plan_changes_for_admin(20) -> 'changes' -> 0) ORDER BY 1),
  (SELECT cols FROM t_cols),
  '(KB120, q16, Q, 키 12개) 읽기 changes[0] 키 집합 = LAUNCH_PLAN_CHANGE_COLUMNS'
);

SELECT * FROM finish();
ROLLBACK;
