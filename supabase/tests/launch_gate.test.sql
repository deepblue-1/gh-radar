-- ============================================================
-- Phase 35 Plan 02 — 발사 경계 지도 어드민 저장소(launch_pieces · launch_heads) · 조건부 upsert · 어드민 RPC pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261027200000_launch_gate.sql
--
-- 잠그는 것:
--   - 트레이서: 첨부 pieces.json 의 한 발사(10/12 KB120 코스피 Q16 16:00 · wire 0~2 · rel −305 · −303 · −302 · 101)가
--     launch_backfill_apply → 두 표 → launch_orders_for_admin 으로 나온다(전 마이그레이션 재생 위).
--   - 응답 모양: trade_date YYYYMMDD · fire_base HH:MM:SS · created_at/updated_at 없음 · 조각 행에 account ·
--     dma_user_id 키(D-02 어드민 전용 예외) · stock_code · stock_name.
--   - 빈 상태: 행 0 → {dates:[], date:null, heads:[], pieces:[]}.
--   - 권한: 두 표 RLS 켬 · pg_policies 0 · 함수 EXECUTE (anon, authenticated, service_role) = (f, f, t).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (날짜, 서버, 프로파일, 거래소, 시장, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

SELECT plan(16);

-- ── 1. 빈 상태 ─────────────────────────────────────────────────
SELECT is(
  public.launch_orders_for_admin(),
  '{"dates":[],"date":null,"heads":[],"pieces":[]}'::jsonb,
  '(—, —, —, —, —, 빈 표) launch_orders_for_admin() = {dates:[], date:null, heads:[], pieces:[]}'
);

-- ── 2. 트레이서: 첨부 첫 발사 백필 ────────────────────────────────
INSERT INTO t_setup SELECT 'bf_1012', public.launch_backfill_apply(
  '[
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":0,"queued_id":"Q153027001","piece_idx":0,"sent_rel_us":-305,"result":"101"},
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":1,"queued_id":"Q153027001","piece_idx":1,"sent_rel_us":-303,"result":"101"},
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":2,"queued_id":"Q153027001","piece_idx":2,"sent_rel_us":-302,"result":"101"}
  ]'::jsonb,
  '[
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "n_pieces":3,"n_accepted":0,"n_reject":3,"n_other":0,"gate_lo_us":-302,"gate_hi_us":null,"offset_used_us":-305}
  ]'::jsonb);

SELECT is(
  (SELECT r FROM t_setup WHERE label = 'bf_1012'),
  '{"pieces_in":3,"pieces_written":3,"heads_in":1,"heads_written":1}'::jsonb,
  '(2026-10-12, KB120, Q16, KRX, K, 백필) launch_backfill_apply → {pieces_in 3, pieces_written 3, heads_in 1, heads_written 1}'
);

INSERT INTO t_setup SELECT 'orders_latest', public.launch_orders_for_admin();

SELECT is(
  (SELECT r->'dates' FROM t_setup WHERE label = 'orders_latest'),
  '["20261012"]'::jsonb,
  '(20261012, —, —, —, —, dates) orders dates = ["20261012"]'
);
SELECT is(
  (SELECT r->'date' FROM t_setup WHERE label = 'orders_latest'),
  '"20261012"'::jsonb,
  '(20261012, —, —, —, —, date) p_date 없으면 date = 최신 "20261012"'
);
SELECT is(
  (SELECT jsonb_array_length(r->'heads') FROM t_setup WHERE label = 'orders_latest'),
  1,
  '(20261012, KB120, Q16, KRX, K, 머리) heads 길이 1'
);
SELECT is(
  (SELECT jsonb_agg((e->>'wire')::int ORDER BY o)
     FROM t_setup, jsonb_array_elements(r->'pieces') WITH ORDINALITY AS x(e, o) WHERE label = 'orders_latest'),
  '[0,1,2]'::jsonb,
  '(20261012, KB120, Q16, KRX, K, 조각 순서) pieces wire 0 · 1 · 2 순'
);
SELECT is(
  (SELECT jsonb_agg((e->>'sent_rel_us')::int ORDER BY o)
     FROM t_setup, jsonb_array_elements(r->'pieces') WITH ORDINALITY AS x(e, o) WHERE label = 'orders_latest'),
  '[-305,-303,-302]'::jsonb,
  '(20261012, KB120, Q16, KRX, K, rel) pieces sent_rel_us −305 · −303 · −302'
);
SELECT is(
  (SELECT row((r->'pieces'->0) ? 'account', (r->'pieces'->0) ? 'dma_user_id',
              (r->'pieces'->0)->'account', (r->'pieces'->0)->'dma_user_id')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(t,t,null,null)',
  '(20261012, KB120, Q16, KRX, K, D-02) 조각 행에 account · dma_user_id 키가 있고 백필이라 값 null'
);
SELECT is(
  (SELECT row(r->'pieces'->0->>'trade_date', r->'pieces'->0->>'fire_base', r->'pieces'->0->>'source',
              r->'pieces'->0->>'result', r->'pieces'->0->>'queued_id')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(20261012,16:00:00,backfill,101,Q153027001)',
  '(20261012, KB120, Q16, KRX, K, 조각 형식) trade_date "20261012" · fire_base "16:00:00" · source backfill · result 101'
);
SELECT is(
  (SELECT row(r->'heads'->0->>'trade_date', r->'heads'->0->>'fire_base', r->'heads'->0->>'source',
              r->'heads'->0->>'n_reject', r->'heads'->0->>'gate_lo_us', r->'heads'->0->'gate_hi_us',
              r->'heads'->0->>'offset_used_us')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(20261012,16:00:00,backfill,3,-302,null,-305)',
  '(20261012, KB120, Q16, KRX, K, 머리 형식) trade_date · fire_base 텍스트 · n_reject 3 · gate_lo −302 · gate_hi null · offset −305'
);
SELECT is(
  (SELECT row((r->'pieces'->0) ? 'created_at', (r->'pieces'->0) ? 'updated_at',
              (r->'heads'->0) ? 'created_at', (r->'heads'->0) ? 'journal_epoch',
              (r->'pieces'->0) ? 'stock_code', (r->'pieces'->0)->'stock_name')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(f,f,f,t,t,null)',
  '(20261012, —, —, —, —, 응답 키) created_at/updated_at 없음 · 추적 열 있음 · stock_code 키 있음 · isin null 이라 stock_name null'
);

-- ── 3. 권한 ─────────────────────────────────────────────────────
SELECT is(
  (SELECT row(
     (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.launch_pieces'::regclass),
     (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.launch_heads'::regclass),
     (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('launch_pieces', 'launch_heads'))
   )::text),
  '(t,t,0)',
  '(—, —, —, —, —, RLS) 두 표 RLS 켬 · pg_policies 0개(service_role 전용 · D-20)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_upsert_piece EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_upsert_head EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_backfill_apply EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_orders_for_admin(text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_orders_for_admin EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish();
ROLLBACK;
