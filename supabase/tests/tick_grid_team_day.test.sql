-- ============================================================
-- quick 261103-j4d — 틱뷰어 목록 팀 칸 · 누적 순매수 · 백필 RPC pgTAP.
--
-- 대상: 20261103230000_tick_grid_team_day.sql(tick_grids 팀 3칸 + CHECK · tick_grid_upsert · tick_day_for_user 교체 ·
--       tick_grid_team_pending · tick_grid_team_set).
--
-- 잠그는 것:
--   - 권한: 새/교체 함수 4개 anon · authenticated EXECUTE 없음 · service_role 있음 · SECURITY INVOKER
--   - upsert 가 팀 3키를 저장 · 키 없는 옛 행 모양이면 null · CHECK 위반(0 인데 값 · n > 0 인데 null · 음수)은 오류
--   - day rows 에 team_fills · team_day_net_krw · team_day_pnl_krw · accum_pos_net_krw — 매집감지 등록 isin 은 pos_net_krw
--     (KRX · NXT 두 행 같은 값) · 미등록은 null
--   - pending = team_fills IS NULL ∧ 날짜 범위 · date 내림차순 · set = object_path 같고 미계산 행만(이미 값 있는 행 안 덮음)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_grid_team_day.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-tg1 → KB120 …4101(가시 계좌 있음) — tick_viewer.test.sql 동형(uuid · email 은 겹치지 않는 새 값).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(27);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004101', 'tg-u1@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('dma-tg1', 'test-enc');
INSERT INTO public.app_users (email, role, dma_user_id) VALUES ('tg-u1@example.invalid', 'trader', 'dma-tg1');
SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-tg1","account_no":"1234564101","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000004101'::uuid $$;

-- 격자 메타 한 행(옛 워커 모양 — 팀 키 없음).
CREATE FUNCTION pg_temp.grow(p_date text, p_ex text, p_isin text, p_mode text, p_high double precision) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'date', p_date, 'exchange', p_ex, 'isin', p_isin, 'sources', jsonb_build_array('accum'),
    'object_path', 'grid/' || p_date || '/' || p_ex || '/' || p_isin || '.' || p_mode || '.ticks.zst',
    'bytes', 1000, 'records', 50, 'a3_count', 20, 'first_recv_ms', 1793000000000, 'last_recv_ms', 1793000100000,
    'base_px', 10000, 'high_rate', p_high, 'last_rate', 12.5)
$$;
-- 새 워커 모양 — 팀 3키.
CREATE FUNCTION pg_temp.team(p_row jsonb, p_fills integer, p_net bigint, p_pnl bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT p_row || jsonb_build_object('team_fills', p_fills, 'team_day_net_krw', p_net, 'team_day_pnl_krw', p_pnl)
$$;
CREATE FUNCTION pg_temp.teamOf(p_date text, p_ex text, p_isin text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(g.team_fills::text, '~') || ' ' || coalesce(g.team_day_net_krw::text, '~') || ' ' ||
         coalesce(g.team_day_pnl_krw::text, '~')
    FROM public.tick_grids g WHERE g.date = p_date AND g.exchange = p_ex AND g.isin = p_isin
$$;
CREATE FUNCTION pg_temp.dayrow(p_date text, p_ex text, p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(public.tick_day_for_user(pg_temp.u1(), p_date)->'rows') e
   WHERE e->>'exchange' = p_ex AND e->>'isin' = p_isin
$$;

-- ── A. 권한 ────────────────────────────────────────────────────────
CREATE TEMP TABLE t_fn (sig text PRIMARY KEY);
INSERT INTO t_fn VALUES
  ('public.tick_grid_upsert(text, jsonb)'), ('public.tick_day_for_user(uuid, text)'),
  ('public.tick_grid_team_pending(text, text)'), ('public.tick_grid_team_set(jsonb)');

SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, f.sig, 'EXECUTE'))
                 FROM t_fn f, unnest(ARRAY['anon', 'authenticated']) r),
          'A 함수 4 — anon · authenticated EXECUTE 불가');
SELECT ok((SELECT bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE')) FROM t_fn f),
          'A 함수 4 — service_role EXECUTE 가능');
SELECT ok((SELECT bool_and(NOT p.prosecdef) FROM pg_proc p WHERE p.oid IN (SELECT f.sig::regprocedure FROM t_fn f)),
          'A 함수 4 — SECURITY INVOKER');
SELECT has_column('public', 'tick_grids', 'team_fills', 'A tick_grids.team_fills');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tick_grids_team_chk'), 'A CHECK tick_grids_team_chk 있음');

-- ── B. upsert 팀 칸 · CHECK ───────────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(
            pg_temp.team(pg_temp.grow('20261030', 'KRX', 'KR7410001001', 'nightly', 29.9), 120, -312000000, 184000000),
            pg_temp.team(pg_temp.grow('20261030', 'NXT', 'KR7410001001', 'nightly', 20.0), 14, 89000000, -21500000),
            pg_temp.team(pg_temp.grow('20261030', 'KRX', 'KR7410002009', 'nightly', 15.0), 0, NULL, NULL),
            pg_temp.grow('20261030', 'KRX', 'KR7410003007', 'nightly', 10.0))),
          4, 'B nightly upsert 4행(팀 값 · 팀 0 · 옛 모양)');
SELECT is(pg_temp.teamOf('20261030', 'KRX', 'KR7410001001'), '120 -312000000 184000000', 'B 팀 3키 저장');
SELECT is(pg_temp.teamOf('20261030', 'KRX', 'KR7410002009'), '0 ~ ~', 'B 팀 체결 0 → 0 · null · null');
SELECT is(pg_temp.teamOf('20261030', 'KRX', 'KR7410003007'), '~ ~ ~', 'B 키 없는 옛 행 모양 → 셋 다 null');
SELECT throws_ok($$ SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
                     pg_temp.team(pg_temp.grow('20261031', 'KRX', 'KR7410001001', 'nightly', 1.0), 0, 5, NULL))) $$,
                 '23514', NULL, 'B CHECK — team_fills 0 인데 순매수 값 → 오류');
SELECT throws_ok($$ SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
                     pg_temp.team(pg_temp.grow('20261031', 'KRX', 'KR7410001001', 'nightly', 1.0), 3, 5, NULL))) $$,
                 '23514', NULL, 'B CHECK — team_fills > 0 인데 손익 null → 오류');
SELECT throws_ok($$ SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
                     pg_temp.team(pg_temp.grow('20261031', 'KRX', 'KR7410001001', 'nightly', 1.0), -1, NULL, NULL))) $$,
                 '23514', NULL, 'B CHECK — team_fills 음수 → 오류');

-- ── C. day rows 팀 · 누적 ─────────────────────────────────────────
INSERT INTO public.limitup_accum_flow (date, isin, reg_time_ms, pos_net_krw, payload)
VALUES ('20261030', 'KR7410001001', 1793010000000, 4520000000, '{"pos_net": [], "price": []}'::jsonb);

SELECT is(pg_temp.dayrow('20261030', 'KRX', 'KR7410001001')
            - ARRAY['date', 'exchange', 'isin', 'code', 'name', 'mode', 'sources', 'bytes', 'records', 'a3_count',
                    'high_rate', 'last_rate', 'created_at', 'open_rate'],
          '{"team_fills": 120, "team_day_net_krw": -312000000, "team_day_pnl_krw": 184000000,
            "accum_pos_net_krw": 4520000000}'::jsonb,
          'C day rows 새 키 4개(KRX · 매집감지 등록)');
SELECT is(pg_temp.dayrow('20261030', 'NXT', 'KR7410001001')->'accum_pos_net_krw', '4520000000'::jsonb,
          'C 같은 isin NXT 행도 같은 누적 순매수(KRX+NXT 합산값 · 거래소 무관)');
SELECT is(pg_temp.dayrow('20261030', 'NXT', 'KR7410001001')->'team_day_pnl_krw', '-21500000'::jsonb, 'C NXT 행 팀 손익');
SELECT is(pg_temp.dayrow('20261030', 'KRX', 'KR7410002009')->'accum_pos_net_krw', 'null'::jsonb, 'C 매집감지 미등록 → null');
SELECT is(pg_temp.dayrow('20261030', 'KRX', 'KR7410003007')->'team_fills', 'null'::jsonb, 'C 미계산 행 → team_fills null');
SELECT is(jsonb_array_length(public.tick_day_for_user(pg_temp.u1(), '20261030')->'rows'), 4, 'C LEFT JOIN 으로 행이 늘지 않는다(4행)');

-- ── D. pending · set ───────────────────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(
            pg_temp.grow('20261029', 'NXT', 'KR7410001001', 'nightly', 9.0),
            pg_temp.grow('20261028', 'KRX', 'KR7410001001', 'nightly', 9.0))),
          2, 'D 옛 모양 2행 더(미계산)');
SELECT is((SELECT jsonb_agg(e->>'date' || ' ' || (e->>'exchange') || ' ' || (e->>'isin') ORDER BY n)
             FROM jsonb_array_elements(public.tick_grid_team_pending()) WITH ORDINALITY x(e, n)),
          '["20261030 KRX KR7410003007", "20261029 NXT KR7410001001", "20261028 KRX KR7410001001"]'::jsonb,
          'D pending = team_fills IS NULL · date DESC');
SELECT is((public.tick_grid_team_pending()->0) - ARRAY['date', 'exchange', 'isin'],
          '{"object_path": "grid/20261030/KRX/KR7410003007.nightly.ticks.zst", "bytes": 1000}'::jsonb,
          'D pending 행 = object_path · bytes');
SELECT is(jsonb_array_length(public.tick_grid_team_pending('20261029', '20261029')), 1, 'D pending 날짜 범위(from · to)');
SELECT throws_ok($$ SELECT public.tick_grid_team_pending('2026-10-29') $$, 'P0001', NULL, 'D pending 8자리 아님 → RAISE');

SELECT is(public.tick_grid_team_set(jsonb_build_array(
            jsonb_build_object('date', '20261030', 'exchange', 'KRX', 'isin', 'KR7410003007',
                               'object_path', 'grid/20261030/KRX/KR7410003007.nightly.ticks.zst',
                               'team_fills', 7, 'team_day_net_krw', 1000, 'team_day_pnl_krw', -50),
            jsonb_build_object('date', '20261030', 'exchange', 'KRX', 'isin', 'KR7410001001',
                               'object_path', 'grid/20261030/KRX/KR7410001001.nightly.ticks.zst',
                               'team_fills', 1, 'team_day_net_krw', 1, 'team_day_pnl_krw', 1),
            jsonb_build_object('date', '20261029', 'exchange', 'NXT', 'isin', 'KR7410001001',
                               'object_path', 'grid/20261029/NXT/KR7410001001.request.ticks.zst',
                               'team_fills', 0, 'team_day_net_krw', NULL, 'team_day_pnl_krw', NULL))),
          1, 'D set — 미계산 ∧ object_path 같은 행만 갱신(1)');
SELECT is(pg_temp.teamOf('20261030', 'KRX', 'KR7410003007'), '7 1000 -50', 'D set 이 채운 값');
SELECT is(pg_temp.teamOf('20261030', 'KRX', 'KR7410001001'), '120 -312000000 184000000', 'D 이미 값 있는 행은 안 덮음');
SELECT is(pg_temp.teamOf('20261029', 'NXT', 'KR7410001001'), '~ ~ ~', 'D object_path 다르면 안 씀(그 사이 격자가 바뀜)');

SELECT * FROM finish();
ROLLBACK;
