-- ============================================================
-- quick-261125-c2i — 어드민 발사 08:30 G2 칸 pgTAP(이력 CHECK · 뒤탐침 CHECK 불변 · 지도 g0830).
--
-- 대상 마이그레이션: supabase/migrations/20261125110000_launch_g2_admin.sql
-- 정본: docs/inbox/from-gh-trade/261125-sigan-ttaeng-g2.md ⓐ · ⓑ · 「gh-radar 처리」 ③
--
-- 잠그는 것:
--   1. launch_plan_changes.fire 에 g0830 이 들어간다(기록 RPC 반환 fire = g0830) · 모르는 fire(g1530)는 23514.
--   2. launch_tail_probe_changes.fire 는 그대로 q16 | n0930 — g0830 은 23514(G2 는 뒤탐침 대상 아님 · L-2).
--   3. CHECK 이름 launch_plan_changes_fire_check 에 g0830 이 있다(재생 성공 = DROP 대상 이름도 맞았다).
--   4. launch_map_for_admin('g0830') = KRX 08:30:00 조각 · 머리만 · q16 · n0930 지도에는 G2 가 섞이지 않는다 ·
--      모르는 fire 는 22023.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_g2_admin.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
-- 조각 — source 'backfill'(journal_epoch · seq CHECK 를 피한다) · 2026-11-26 · KB120.
INSERT INTO public.launch_pieces
  (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, sent_rel_us, result, source)
VALUES
  -- G2 08:30:00 KRX — 코스피 2 · 코스닥 1
  ('2026-11-26', 'KB120', 'G2',  'KRX', '08:30:00', 'K', 0, 12000, '접수', 'backfill'),
  ('2026-11-26', 'KB120', 'G2',  'KRX', '08:30:00', 'K', 1, 11000, '101',  'backfill'),
  ('2026-11-26', 'KB120', 'G2',  'KRX', '08:30:00', 'Q', 0, 0,     '접수', 'backfill'),
  -- 같은 날 다른 발사 — 지도 g0830 에 섞이면 안 된다
  ('2026-11-26', 'KB120', 'Q16', 'KRX', '16:00:00', 'K', 0, -300,  '접수', 'backfill'),
  ('2026-11-26', 'KB120', 'A',   'KRX', '09:00:27', 'K', 0, -250,  '접수', 'backfill'),
  ('2026-11-26', 'KB120', 'N',   'NXT', '09:00:30', 'K', 0, -245,  '접수', 'backfill');

-- 머리 — G2 코스피(next_offset_us 12000) · Q16 코스피.
INSERT INTO public.launch_heads
  (trade_date, gateway, profile, fire_exchange, fire_base, market, offset_used_us, next_offset_us, source)
VALUES
  ('2026-11-26', 'KB120', 'G2',  'KRX', '08:30:00', 'K', 12000, 12000, 'backfill'),
  ('2026-11-26', 'KB120', 'Q16', 'KRX', '16:00:00', 'K', -300,  -300,  'backfill');

CREATE TEMP TABLE t_map (fire text PRIMARY KEY, r jsonb NOT NULL);
INSERT INTO t_map VALUES
  ('g0830', public.launch_map_for_admin('g0830')),
  ('q16',   public.launch_map_for_admin('q16')),
  ('n0930', public.launch_map_for_admin('n0930'));

SELECT plan(12);

-- ── 1. 계획 이력 — g0830 기록 · 모르는 fire 거절 ─────────────────
SELECT is(
  public.launch_plan_change_record(jsonb_build_object(
    'admin_email', 'a@x', 'gateway', 'KB120', 'fire', 'g0830', 'market', 'K',
    'before_us', jsonb_build_array(0), 'after_us', jsonb_build_array(12000), 'outcome', 'ok', 'plan_rev', 2
  ))->>'fire',
  'g0830',
  '(KB120, g0830, K, after [12000]) launch_plan_change_record 반환 fire = g0830'
);
SELECT throws_ok(
  $$SELECT public.launch_plan_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"g1530","market":"K","after_us":[0],"outcome":"ok"}'::jsonb)$$,
  '23514', NULL,
  '(KB120, g1530, K) 계획 이력 모르는 fire → 23514'
);

-- ── 2. 뒤탐침 이력 — g0830 은 여전히 거절(L-2) ────────────────────
SELECT throws_ok(
  $$SELECT public.launch_tail_probe_change_record('{"admin_email":"a@x","gateway":"KB120","fire":"g0830","after_count":0,"after_step_us":10,"outcome":"ok"}'::jsonb)$$,
  '23514', NULL,
  '(KB120, g0830) 뒤탐침 이력 fire g0830 → 23514(G2 는 뒤탐침 대상 아님)'
);

-- ── 3. CHECK 이름 · 정의 ──────────────────────────────────────────
SELECT ok(
  (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
    WHERE c.conrelid = 'public.launch_plan_changes'::regclass AND c.conname = 'launch_plan_changes_fire_check')
    LIKE '%g0830%',
  '(launch_plan_changes) launch_plan_changes_fire_check 정의에 g0830'
);

-- ── 4. 지도 g0830 ─────────────────────────────────────────────────
SELECT is(
  (SELECT jsonb_array_length(r->'pieces') FROM t_map WHERE fire = 'g0830'), 3,
  '(g0830) 조각 = 픽스처 G2 3행만'
);
SELECT ok(
  (SELECT bool_and(p->>'profile' = 'G2' AND p->>'fire_exchange' = 'KRX')
     FROM t_map, jsonb_array_elements(r->'pieces') p WHERE fire = 'g0830'),
  '(g0830) 조각 profile 전부 G2 · fire_exchange KRX'
);
SELECT is(
  (SELECT jsonb_agg(h->>'profile') FROM t_map, jsonb_array_elements(r->'heads') h WHERE fire = 'g0830'),
  '["G2"]'::jsonb,
  '(g0830) 머리 = G2 만'
);
SELECT is(
  (SELECT r->'heads'->0->>'fire_base' FROM t_map WHERE fire = 'g0830'), '08:30:00',
  '(g0830) 머리 fire_base 08:30:00'
);
SELECT is(
  (SELECT r->'days' FROM t_map WHERE fire = 'g0830'), '["20261126"]'::jsonb,
  '(g0830) days = ["20261126"]'
);

-- ── 5. 다른 지도에 G2 가 섞이지 않는다 · 모르는 fire ───────────────
SELECT ok(
  (SELECT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'pieces') p WHERE p->>'profile' = 'G2')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'heads') h WHERE h->>'profile' = 'G2')
     FROM t_map WHERE fire = 'q16'),
  '(q16) 지도 조각 · 머리에 G2 없음'
);
SELECT ok(
  (SELECT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'pieces') p WHERE p->>'profile' = 'G2')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'heads') h WHERE h->>'profile' = 'G2')
     FROM t_map WHERE fire = 'n0930'),
  '(n0930) 지도 조각 · 머리에 G2 없음'
);
SELECT throws_ok(
  $$SELECT public.launch_map_for_admin('g1530')$$,
  '22023', NULL,
  '(g1530) launch_map_for_admin 모르는 fire → 22023'
);

SELECT * FROM finish();
ROLLBACK;
