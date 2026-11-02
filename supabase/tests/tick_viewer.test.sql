-- ============================================================
-- Phase 37 Plan 04 — 틱 전문 뷰어 DB(격자 메타 · 열기 · 요청 큐 · Job RPC · 오늘 목록 · purge) pgTAP.
--
-- 대상: 20261102200000_tick_viewer.sql(표 3 · tick_grid_upsert · tick_day_for_user · tick_open_for_user ·
--       tick_eta_s · tick_trigger_blocked · 버킷) · 20261102200100_tick_viewer_queue.sql(요청 큐 · Job RPC · 오늘 · purge).
--
-- 잠그는 것(D-02 · D-03 · D-04 · D-08 · D-09 · D-15):
--   - 권한: 표 3 RLS 켜짐 · 정책 0 · anon · authenticated 권한 0 · service_role CRUD · 함수 EXECUTE service_role 만
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 · NULL → {"access": false} 만
--   - 모드 규칙: nightly 무조건 · request 는 nightly 를 못 덮음 · promoted 는 promoted 위에만(반환 = 쓴 행 수)
--   - accum(D-09) · eta_s 기본값 · stale 판정(2분 · 25분 · 같은 (날짜, 거래소) running 차단)
--   - (Task 2) should_trigger 원자 판정 · JOB_TIMEOUT 회수 · NOT_UPLOADED · 하루 상한 · 취소 · claim/finish · 후보 · 오늘 · purge
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
--   한 트랜잭션이라 now() 는 고정이다 — 「n분 전」 은 행 값을 now() − interval 로 돌려 만든다.
-- 사용자: U1 dma-tv1 → KB120 …3701(가시 계좌 있음) · U3 dma-tv3(자격증명만 · 계좌 매핑 없음) — teamflow_report.test.sql 동형.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(43);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003701', 'tv-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003703', 'tv-u3@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-tv1','dma-tv3']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('tv-u1@example.invalid','trader','dma-tv1'),
  ('tv-u3@example.invalid','trader','dma-tv3');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-tv1","account_no":"1234563701","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003701'::uuid $$;
CREATE FUNCTION pg_temp.u3() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003703'::uuid $$;

-- 격자 메타 한 행(Job 이 넘기는 모양).
CREATE FUNCTION pg_temp.grow(p_date text, p_ex text, p_isin text, p_mode text, p_high double precision) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'date', p_date, 'exchange', p_ex, 'isin', p_isin, 'sources', jsonb_build_array('accum'),
    'object_path', 'grid/' || p_date || '/' || p_ex || '/' || p_isin || '.' || p_mode || '.ticks.zst',
    'bytes', 1000, 'records', 50, 'a3_count', 20, 'first_recv_ms', 1793000000000, 'last_recv_ms', 1793000100000,
    'base_px', 10000, 'high_rate', p_high, 'last_rate', 12.5)
$$;
CREATE FUNCTION pg_temp.open1(p_date text, p_ex text, p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.tick_open_for_user(pg_temp.u1(), p_date, p_isin, p_ex)
$$;

INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('370001', '틱종목일', 'KOSDAQ', 'KR7370001001'),
  ('370002', '틱종목이', 'KOSPI',  'KR7370002009');

-- ── A. 표 · 권한 ───────────────────────────────────────────────────
SELECT has_table('public', 'tick_grids', 'A tick_grids 있음');
SELECT has_table('public', 'tick_convert_requests', 'A tick_convert_requests 있음');
SELECT has_table('public', 'tick_convert_runs', 'A tick_convert_runs 있음');
SELECT ok((SELECT bool_and(c.relrowsecurity) FROM pg_class c
            WHERE c.oid IN ('public.tick_grids'::regclass, 'public.tick_convert_requests'::regclass,
                            'public.tick_convert_runs'::regclass)),
          'A 표 3 RLS 켜짐');
SELECT is((SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('tick_grids', 'tick_convert_requests', 'tick_convert_runs')),
          0, 'A 표 3 정책 0개(service_role 전용)');
SELECT ok(NOT (SELECT bool_or(has_table_privilege(r, t, p))
                 FROM unnest(ARRAY['anon', 'authenticated']) r,
                      unnest(ARRAY['public.tick_grids', 'public.tick_convert_requests', 'public.tick_convert_runs']) t,
                      unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
          'A anon · authenticated 는 표 3 에 SELECT/INSERT/UPDATE/DELETE 권한 0');
SELECT ok((SELECT bool_and(has_table_privilege('service_role', t, p))
             FROM unnest(ARRAY['public.tick_grids', 'public.tick_convert_requests', 'public.tick_convert_runs']) t,
                  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
          'A service_role 은 표 3 CRUD');

CREATE TEMP TABLE t_fn (sig text PRIMARY KEY);
INSERT INTO t_fn VALUES
  ('public.tick_eta_s(text)'), ('public.tick_trigger_blocked(text, text)'), ('public.tick_grid_upsert(text, jsonb)'),
  ('public.tick_day_for_user(uuid, text)'), ('public.tick_open_for_user(uuid, text, text, text)');

SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, f.sig, 'EXECUTE'))
                 FROM t_fn f, unnest(ARRAY['anon', 'authenticated']) r),
          'A 함수 5 — anon · authenticated EXECUTE 불가');
SELECT ok((SELECT bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE')) FROM t_fn f),
          'A 함수 5 — service_role EXECUTE 가능');
SELECT ok((SELECT bool_and(NOT p.prosecdef) FROM pg_proc p WHERE p.oid IN (SELECT f.sig::regprocedure FROM t_fn f)),
          'A 함수 5 — SECURITY INVOKER');

-- ── B. 게이트 ──────────────────────────────────────────────────────
SELECT is(public.tick_day_for_user(pg_temp.u3()), '{"access": false}'::jsonb, 'B day U3(가시 계좌 없음) → {"access": false} 만');
SELECT is(public.tick_open_for_user(pg_temp.u3(), '20261030', 'KR7370001001', 'KRX'), '{"access": false}'::jsonb,
          'B open U3 → {"access": false} 만');
SELECT is(public.tick_day_for_user(NULL, '20261030'), '{"access": false}'::jsonb, 'B day p_user_id null → {"access": false}');

-- ── C. 이력 0 ──────────────────────────────────────────────────────
SELECT is(public.tick_day_for_user(pg_temp.u1()) - 'eta_s',
          '{"access": true, "dates": [], "date": null, "rows": [], "requests": []}'::jsonb,
          'C day U1 이력 0 → dates [] · date null · rows [] · requests []');
SELECT is(public.tick_day_for_user(pg_temp.u1())->'eta_s', '{"KRX": 120, "NXT": 90}'::jsonb,
          'C eta_s 이력 0 → KRX 120 · NXT 90');
SELECT is(pg_temp.open1('20261030', 'NXT', 'KR7370001001') - 'eta_s',
          '{"access": true, "date": "20261030", "exchange": "NXT", "isin": "KR7370001001",
            "grid": null, "request": null, "accum": null, "stock": {"code": "370001", "name": "틱종목일"}}'::jsonb,
          'C open 격자 · 요청 · 매집 없음 → grid · request · accum null · stock 은 있음');
SELECT is((pg_temp.open1('20261030', 'NXT', 'KR7370001001')->>'eta_s')::int, 90, 'C open eta_s NXT 기본 90');

-- ── D. nightly upsert → day · open ────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7370001001', 'nightly', 29.9))),
          1, 'D nightly upsert 새 행 → 1');
SELECT is(jsonb_array_length(public.tick_day_for_user(pg_temp.u1())->'rows'), 1, 'D day rows 1');
SELECT is((public.tick_day_for_user(pg_temp.u1())->'rows'->0) - 'created_at',
          '{"date": "20261030", "exchange": "KRX", "isin": "KR7370001001", "code": "370001", "name": "틱종목일",
            "mode": "nightly", "sources": ["accum"], "bytes": 1000, "records": 50, "a3_count": 20,
            "high_rate": 29.9, "last_rate": 12.5}'::jsonb,
          'D day rows[0] = 격자 열 + stocks code · name(object_path 없음)');
SELECT is(pg_temp.open1('20261030', 'KRX', 'KR7370001001')->'grid'->>'object_path',
          'grid/20261030/KRX/KR7370001001.nightly.ticks.zst', 'D open grid.object_path');
SELECT is(pg_temp.open1('20261030', 'KRX', 'KR7370001001')->'accum', 'null'::jsonb, 'D open accum — limitup_accum_flow 행 없음 → null');

INSERT INTO public.limitup_accum_flow (date, isin, reg_time_ms, payload)
VALUES ('20261030', 'KR7370001001', 1793010000000,
        '{"pos_net": [[1793010000000, 0], [1793010060000, 1500000]], "price": []}'::jsonb);
SELECT is((pg_temp.open1('20261030', 'KRX', 'KR7370001001')->'accum'->>'reg_time_ms')::bigint, 1793010000000::bigint,
          'D open accum.reg_time_ms(D-09)');
SELECT is(pg_temp.open1('20261030', 'KRX', 'KR7370001001')->'accum'->'pos_net',
          '[[1793010000000, 0], [1793010060000, 1500000]]'::jsonb, 'D open accum.pos_net = payload.pos_net 그대로');

-- ── E. 모드 규칙(D-04) ────────────────────────────────────────────
SELECT is(public.tick_grid_upsert('promoted', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7370001001', 'promoted', 30.0))),
          0, 'E promoted 는 nightly 를 못 덮음 → 0');
SELECT is(public.tick_grid_upsert('request', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7370001001', 'request', 30.0))),
          0, 'E request 는 nightly 를 못 덮음 → 0');
SELECT is((SELECT g.mode || ' ' || g.object_path FROM public.tick_grids g
            WHERE g.date = '20261030' AND g.exchange = 'KRX' AND g.isin = 'KR7370001001'),
          'nightly grid/20261030/KRX/KR7370001001.nightly.ticks.zst', 'E 못 덮은 뒤 mode · object_path 그대로(nightly)');
SELECT is(public.tick_grid_upsert('promoted', jsonb_build_array(pg_temp.grow('20261030', 'NXT', 'KR7370001001', 'promoted', 18.0))),
          1, 'E promoted 새 키 → 1');
SELECT is(public.tick_grid_upsert('promoted', jsonb_build_array(pg_temp.grow('20261030', 'NXT', 'KR7370001001', 'promoted', 19.0))),
          1, 'E promoted 는 promoted 를 덮음 → 1');
SELECT is(public.tick_grid_upsert('request', jsonb_build_array(pg_temp.grow('20261030', 'NXT', 'KR7370001001', 'request', 19.5))),
          1, 'E request 는 promoted 를 덮음 → 1');
SELECT is(public.tick_grid_upsert('promoted', jsonb_build_array(pg_temp.grow('20261030', 'NXT', 'KR7370001001', 'promoted', 19.0))),
          0, 'E promoted 는 request 를 못 덮음 → 0');
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(
            pg_temp.grow('20261030', 'NXT', 'KR7370001001', 'nightly', 20.0),
            pg_temp.grow('20261029', 'KRX', 'KR7370002009', 'nightly', NULL))),
          2, 'E nightly 는 request 를 덮고 새 날짜도 쓴다 → 2');
SELECT is((SELECT g.mode || ' ' || g.object_path FROM public.tick_grids g
            WHERE g.date = '20261030' AND g.exchange = 'NXT' AND g.isin = 'KR7370001001'),
          'nightly grid/20261030/NXT/KR7370001001.nightly.ticks.zst', 'E nightly 가 덮은 뒤 mode · object_path = nightly');
SELECT throws_ok($$ SELECT public.tick_grid_upsert('bogus', '[]'::jsonb) $$, 'P0001', NULL, 'E 모르는 mode → RAISE');
SELECT is(public.tick_day_for_user(pg_temp.u1())->'dates', '["20261030", "20261029"]'::jsonb, 'E dates 내림차순');
SELECT is((SELECT jsonb_agg(e->>'exchange' ORDER BY n)
             FROM jsonb_array_elements(public.tick_day_for_user(pg_temp.u1(), '20261030')->'rows') WITH ORDINALITY x(e, n)),
          '["KRX", "NXT"]'::jsonb, 'E rows 정렬 high_rate DESC(29.9 KRX → 20.0 NXT)');

-- ── F. stale 판정(2분 · 25분 · 같은 (날짜, 거래소) running) ───────────
INSERT INTO public.tick_convert_requests (date, exchange, isin, status, requested_by, triggered_at)
VALUES ('20261028', 'KRX', 'KR7370001001', 'pending', pg_temp.u1(), now() - interval '3 minutes');
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370001001')->'request'->>'stale', 'true',
          'F pending · triggered_at 3분 전 · running 없음 → stale true');
SELECT ok(NOT (pg_temp.open1('20261028', 'KRX', 'KR7370001001')->'request' ? 'requested_by'),
          'F open request 에 requested_by 를 내보내지 않는다');
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '1 minute' WHERE date = '20261028';
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370001001')->'request'->>'stale', 'false',
          'F pending · triggered_at 1분 전 → stale false');
UPDATE public.tick_convert_requests
   SET status = 'running', triggered_at = now() - interval '27 minutes', started_at = now() - interval '26 minutes'
 WHERE date = '20261028';
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370001001')->'request'->>'stale', 'true',
          'F running · started_at 26분 전 → stale true');
UPDATE public.tick_convert_requests
   SET triggered_at = now() - interval '11 minutes', started_at = now() - interval '10 minutes'
 WHERE date = '20261028';
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370001001')->'request'->>'stale', 'false',
          'F running · started_at 10분 전 → stale false');
INSERT INTO public.tick_convert_requests (date, exchange, isin, status, requested_by)
VALUES ('20261028', 'KRX', 'KR7370002009', 'pending', pg_temp.u1());
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370002009')->'request'->>'stale', 'false',
          'F 같은 (날짜, 거래소) 10분 전 시작 running 이 있으면 다른 isin pending(triggered_at NULL)도 stale false');
DELETE FROM public.tick_convert_requests WHERE date = '20261028' AND isin = 'KR7370001001';
SELECT is(pg_temp.open1('20261028', 'KRX', 'KR7370002009')->'request'->>'stale', 'true',
          'F running 이 사라지면 pending(triggered_at NULL) → stale true');

SELECT * FROM finish();
ROLLBACK;
