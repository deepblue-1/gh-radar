-- ============================================================
-- Phase 37 Plan 04 — 틱 전문 뷰어 DB(격자 메타 · 열기 · 요청 큐 · Job RPC · 오늘 목록 · purge) pgTAP.
--
-- 대상: 20261102200000_tick_viewer.sql(표 3 · tick_grid_upsert · tick_day_for_user · tick_open_for_user ·
--       tick_eta_s · tick_trigger_blocked · 버킷) · 20261102200100_tick_viewer_queue.sql(요청 큐 · Job RPC · 오늘 · purge).
--       · 20261104300000(WR-01 하루 상한 = 깨운 횟수) · 20261104300100(WR-02 취소 = 내 몫 빼기)
--       · 20261104300200(IN-06 배치 안 중복 키).
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
-- 사용자: U1 dma-tv1 → KB120 …3701 · U2 dma-tv2 → KB120 …3702(가시 계좌 있음 · 취소 「본인만」 대조용)
--         U3 dma-tv3(자격증명만 · 계좌 매핑 없음) — teamflow_report.test.sql 동형.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(138);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003701', 'tv-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003702', 'tv-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000003703', 'tv-u3@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-tv1','dma-tv2','dma-tv3']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('tv-u1@example.invalid','trader','dma-tv1'),
  ('tv-u2@example.invalid','trader','dma-tv2'),
  ('tv-u3@example.invalid','trader','dma-tv3');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-tv1","account_no":"1234563701","name":"위탁","priority":1},
  {"dma_user_id":"dma-tv2","account_no":"1234563702","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003701'::uuid $$;
CREATE FUNCTION pg_temp.u2() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000003702'::uuid $$;
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
            "grid": null, "request": null, "accum": null, "stock": {"code": "370001", "name": "틱종목일", "listing_shares": null}}'::jsonb,
          'C open 격자 · 요청 · 매집 없음 → grid · request · accum null · stock 은 있음(listing_shares — 20261103210000)');
SELECT is((pg_temp.open1('20261030', 'NXT', 'KR7370001001')->>'eta_s')::int, 90, 'C open eta_s NXT 기본 90');

-- ── D. nightly upsert → day · open ────────────────────────────────
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(pg_temp.grow('20261030', 'KRX', 'KR7370001001', 'nightly', 29.9))),
          1, 'D nightly upsert 새 행 → 1');
SELECT is(jsonb_array_length(public.tick_day_for_user(pg_temp.u1())->'rows'), 1, 'D day rows 1');
SELECT is((public.tick_day_for_user(pg_temp.u1())->'rows'->0) - 'created_at',
          '{"date": "20261030", "exchange": "KRX", "isin": "KR7370001001", "code": "370001", "name": "틱종목일",
            "mode": "nightly", "sources": ["accum"], "bytes": 1000, "records": 50, "a3_count": 20,
            "high_rate": 29.9, "last_rate": 12.5,
            "team_fills": null, "team_day_net_krw": null, "team_day_pnl_krw": null, "accum_pos_net_krw": null}'::jsonb,
          'D day rows[0] = 격자 열 + stocks code · name(object_path 없음) + 팀 3칸 · 누적(20261103230000 · 옛 행 null)');
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
-- IN-06(20261104300200) — 한 배치 안 같은 키 두 번은 롤백 없이 마지막 원소 하나만(뒤 절에 영향 없게 그 행은 지운다)
SELECT is(public.tick_grid_upsert('nightly', jsonb_build_array(
            pg_temp.grow('20261027', 'NXT', 'KR7370002009', 'nightly', 11.0),
            pg_temp.grow('20261027', 'NXT', 'KR7370002009', 'nightly', 12.0))),
          1, 'E 배치 안 같은 키 두 번 → 문장 롤백 없이 1행');
SELECT is((SELECT g.high_rate FROM public.tick_grids g
            WHERE g.date = '20261027' AND g.exchange = 'NXT' AND g.isin = 'KR7370002009'),
          12.0::double precision, 'E 배치 안 중복 키는 마지막 원소가 남는다');
DELETE FROM public.tick_grids WHERE date = '20261027';

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

-- ══ Task 2 — 요청 큐 · Job RPC · 오늘 · purge ════════════════════════
DELETE FROM public.tick_convert_requests;

CREATE FUNCTION pg_temp.req(p_user uuid, p_date text, p_isin text, p_ex text, p_cap integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.tick_request_convert_for_user(p_user, p_date, p_isin, p_ex, p_cap)
$$;
CREATE FUNCTION pg_temp.st(p_date text, p_ex text, p_isin text) RETURNS text LANGUAGE sql AS $$
  SELECT r.status || coalesce(' ' || r.error, '') FROM public.tick_convert_requests r
   WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin
$$;

-- ── G. 큐 권한 · 게이트 ────────────────────────────────────────────
CREATE TEMP TABLE t_fn2 (sig text PRIMARY KEY);
INSERT INTO t_fn2 VALUES
  ('public.tick_upload_retry_at(timestamptz)'), ('public.tick_request_convert_for_user(uuid, text, text, text, integer)'),
  ('public.tick_cancel_convert_for_user(uuid, text, text, text)'), ('public.tick_request_trigger_failed(text, text, text)'),
  ('public.tick_request_claim(text, text)'), ('public.tick_request_finish(text, text, jsonb)'),
  ('public.tick_convert_run_record(jsonb)'), ('public.tick_convert_runs_since(text)'),
  ('public.tick_convert_candidates(text)'), ('public.tick_today_for_user(uuid)'),
  ('public.tick_access_for_user(uuid)'), ('public.tick_purge_old(integer)');
SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, f.sig, 'EXECUTE'))
                 FROM t_fn2 f, unnest(ARRAY['anon', 'authenticated']) r),
          'G 큐 함수 12 — anon · authenticated EXECUTE 불가');
SELECT ok((SELECT bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE')) FROM t_fn2 f),
          'G 큐 함수 12 — service_role EXECUTE 가능');
SELECT is(pg_temp.req(pg_temp.u3(), '20261027', 'KR7370001001', 'KRX', 20), '{"access": false}'::jsonb,
          'G U3 요청 → {"access": false} 만(행 0)');
SELECT is(public.tick_cancel_convert_for_user(pg_temp.u3(), '20261027', 'KR7370001001', 'KRX'), '{"access": false}'::jsonb,
          'G U3 취소 → {"access": false} 만');
SELECT is(public.tick_today_for_user(pg_temp.u3()), '{"access": false}'::jsonb, 'G U3 오늘 → {"access": false} 만');
SELECT is(public.tick_access_for_user(pg_temp.u3()), '{"access": false}'::jsonb, 'G U3 access → false');
SELECT is(public.tick_access_for_user(pg_temp.u1()), '{"access": true}'::jsonb, 'G U1 access → true');
SELECT is((SELECT count(*)::int FROM public.tick_convert_requests), 0, 'G U3 호출은 큐에 행을 만들지 않는다');

-- ── H. should_trigger 원자 판정 ────────────────────────────────────
SELECT is(pg_temp.req(pg_temp.u1(), '20261027', 'KR7370001001', 'KRX', 20)->>'should_trigger', 'true',
          'H 첫 요청 → should_trigger true');
SELECT is(pg_temp.st('20261027', 'KRX', 'KR7370001001'), 'pending', 'H 첫 요청 행 pending');
SELECT is(pg_temp.req(pg_temp.u2(), '20261027', 'KR7370001001', 'KRX', 20)->>'should_trigger', 'false',
          'H 두 번째 호출(같은 isin · 다른 사용자) → should_trigger false');
SELECT is(pg_temp.req(pg_temp.u2(), '20261027', 'KR7370002009', 'KRX', 20)->>'should_trigger', 'false',
          'H 두 번째 호출(다른 isin · 같은 날짜·거래소) → should_trigger false');
SELECT ok((SELECT r.status = 'pending' AND r.triggered_at IS NULL FROM public.tick_convert_requests r
            WHERE r.date = '20261027' AND r.exchange = 'KRX' AND r.isin = 'KR7370002009'),
          'H 다른 isin 행은 pending · triggered_at NULL 로 남는다');
SELECT is(pg_temp.req(pg_temp.u1(), '20261027', 'KR7370001001', 'NXT', 20)->>'should_trigger', 'true',
          'H 다른 거래소(NXT)는 따로 판정 → should_trigger true');
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '3 minutes'
 WHERE date = '20261027' AND exchange = 'KRX' AND isin = 'KR7370001001';
SELECT is(pg_temp.req(pg_temp.u2(), '20261027', 'KR7370002009', 'KRX', 20)->>'should_trigger', 'true',
          'H triggered_at 을 3분 전으로 돌리면 다시 should_trigger true');
SELECT is((SELECT count(*)::int FROM public.tick_convert_requests
            WHERE date = '20261027' AND exchange = 'KRX' AND triggered_at = now()),
          2, 'H 깨울 pending 전부(두 isin)에 triggered_at 을 함께 찍는다');

-- running 차단 · JOB_TIMEOUT 회수(①: 다른 isin 호출이 죽은 running 을 닫는다)
INSERT INTO public.tick_convert_requests (date, exchange, isin, status, requested_by, triggered_at, started_at)
VALUES ('20261026', 'KRX', 'KR7370001001', 'running', pg_temp.u1(), now() - interval '11 minutes', now() - interval '10 minutes');
SELECT is(pg_temp.req(pg_temp.u1(), '20261026', 'KR7370002009', 'KRX', 20)->>'should_trigger', 'false',
          'H 10분 전 시작 running 이 있으면 다른 isin 요청 should_trigger false');
UPDATE public.tick_convert_requests
   SET triggered_at = now() - interval '27 minutes', started_at = now() - interval '26 minutes'
 WHERE date = '20261026' AND isin = 'KR7370001001';
SELECT is(pg_temp.req(pg_temp.u1(), '20261026', 'KR7370002009', 'KRX', 20)->>'should_trigger', 'true',
          'H running 26분 전 시작 → JOB_TIMEOUT 회수 뒤 should_trigger true');
SELECT is(pg_temp.st('20261026', 'KRX', 'KR7370001001'), 'failed JOB_TIMEOUT', 'H 죽은 running 은 failed JOB_TIMEOUT 으로 닫힌다');
-- ②: 같은 isin 호출은 닫은 뒤 다시 pending 으로 올려 트리거
INSERT INTO public.tick_convert_requests (date, exchange, isin, status, requested_by, triggered_at, started_at)
VALUES ('20261025', 'KRX', 'KR7370001001', 'running', pg_temp.u1(), now() - interval '27 minutes', now() - interval '26 minutes');
SELECT is(pg_temp.req(pg_temp.u2(), '20261025', 'KR7370001001', 'KRX', 20) #>> '{request,status}', 'pending',
          'H JOB_TIMEOUT 회수 뒤 같은 isin 은 다시 pending · should_trigger');
SELECT ok((SELECT r.triggered_at = now() AND r.started_at IS NULL AND r.error IS NULL FROM public.tick_convert_requests r
            WHERE r.date = '20261025' AND r.isin = 'KR7370001001'),
          'H 다시 올린 행은 triggered_at = now · started_at · error 초기화');
-- finish 는 running 행만
SELECT is(public.tick_request_finish('20261026', 'KRX', '[{"isin": "KR7370002009", "ok": true}]'::jsonb), 0,
          'H finish 는 running 아닌(pending) 행을 바꾸지 않는다 → 0');
SELECT is(pg_temp.st('20261026', 'KRX', 'KR7370002009'), 'pending', 'H finish 뒤에도 pending 그대로');

-- ── I. claim · finish · eta_s ─────────────────────────────────────
DELETE FROM public.tick_convert_requests;
SELECT pg_temp.req(pg_temp.u1(), '20261022', 'KR7370001001', 'KRX', 20);
SELECT pg_temp.req(pg_temp.u1(), '20261022', 'KR7370002009', 'KRX', 20);
SELECT is(public.tick_request_claim('20261022', 'KRX'), '["KR7370001001", "KR7370002009"]'::jsonb,
          'I claim → pending 전부 running · isin 배열');
SELECT ok((SELECT bool_and(r.status = 'running' AND r.started_at = now()) FROM public.tick_convert_requests r
            WHERE r.date = '20261022'), 'I claim 뒤 running · started_at');
SELECT is(public.tick_request_claim('20261022', 'KRX'), '[]'::jsonb, 'I 두 번째 claim → []');
SELECT is(public.tick_request_finish('20261022', 'KRX',
            '[{"isin": "KR7370001001", "ok": true}, {"isin": "KR7370002009", "ok": false, "error": "NO_RECORDS"}]'::jsonb),
          2, 'I finish → 2행');
SELECT is(pg_temp.st('20261022', 'KRX', 'KR7370001001') || ' / ' || pg_temp.st('20261022', 'KRX', 'KR7370002009'),
          'done / failed NO_RECORDS', 'I finish → done · failed NO_RECORDS');
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '200 seconds', finished_at = now()
 WHERE date = '20261022' AND isin = 'KR7370001001';
INSERT INTO public.tick_convert_requests (date, exchange, isin, status, triggered_at, finished_at) VALUES
  ('20261021', 'KRX', 'KR7370001001', 'done', now() - interval '100 seconds', now()),
  ('20261021', 'KRX', 'KR7370002009', 'done', now() - interval '300.4 seconds', now());
SELECT is(public.tick_day_for_user(pg_temp.u1())->'eta_s', '{"KRX": 200, "NXT": 90}'::jsonb,
          'I eta_s KRX = done 이력 (finished − triggered) 중앙값 200 · NXT 이력 0 → 90');
SELECT is(public.tick_request_trigger_failed('20261022', 'KRX', 'boom'), 0, 'I trigger_failed — pending 없으면 0');

-- ── J. NOT_UPLOADED · 하루 상한 · retry_at ────────────────────────
DELETE FROM public.tick_convert_requests;
SELECT is(public.tick_upload_retry_at('2026-11-01 23:29:00+09'), '2026-11-01 23:30:00+09'::timestamptz,
          'J tick_upload_retry_at(23:29 KST) = 같은 날 23:30');
SELECT is(public.tick_upload_retry_at('2026-11-01 23:31:00+09'), '2026-11-02 23:30:00+09'::timestamptz,
          'J tick_upload_retry_at(23:31 KST) = 다음 날 23:30');
SELECT is(public.tick_upload_retry_at('2026-11-01 15:00:00+09'), '2026-11-01 23:30:00+09'::timestamptz,
          'J tick_upload_retry_at(15:00 KST) = 같은 날 23:30');

SELECT pg_temp.req(pg_temp.u1(), '20261024', 'KR7370001001', 'NXT', 1);
SELECT tick_request_claim('20261024', 'NXT');
SELECT is(public.tick_request_finish('20261024', 'NXT', '[{"isin": "KR7370001001", "ok": false, "error": "NOT_UPLOADED"}]'::jsonb),
          1, 'J finish NOT_UPLOADED → 1');
SELECT is(pg_temp.req(pg_temp.u1(), '20261024', 'KR7370001001', 'NXT', 1) - 'request' - 'eta_s',
          jsonb_build_object('access', true, 'should_trigger', false, 'capped', false, 'grid_ready', false,
                             'not_uploaded', true, 'retry_after', public.tick_upload_retry_at(now())),
          'J NOT_UPLOADED 직후 같은 키 재요청 → not_uploaded true · retry_after · should_trigger false');
SELECT is(pg_temp.st('20261024', 'NXT', 'KR7370001001'), 'failed NOT_UPLOADED', 'J NOT_UPLOADED 재요청 뒤 status 그대로');
SELECT is(pg_temp.req(pg_temp.u1(), '20261020', 'KR7370002009', 'NXT', 1)->>'capped', 'false',
          'J cap 1 에서 NOT_UPLOADED 1건 뒤 새 키 요청 → capped 아님(NOT_UPLOADED 상한 제외)');
SELECT is(pg_temp.req(pg_temp.u1(), '20261018', 'KR7370004005', 'NXT', 2)->>'should_trigger', 'true',
          'J cap 2 에서 두 번째 새 키 → should_trigger true');
SELECT is(pg_temp.req(pg_temp.u1(), '20261019', 'KR7370003007', 'NXT', 2)->>'should_trigger', 'false',
          'J cap 2 에서 세 번째 새 키 → should_trigger false');
SELECT is(pg_temp.req(pg_temp.u1(), '20261019', 'KR7370003007', 'NXT', 2)->>'capped', 'true',
          'J cap 2 에서 세 번째 새 키 → capped true');
SELECT is(pg_temp.st('20261019', 'NXT', 'KR7370003007'), NULL, 'J capped 요청은 행을 만들지 않는다');
SELECT is(pg_temp.req(pg_temp.u1(), '20261020', 'KR7370002009', 'NXT', 1)->>'capped', 'false',
          'J 이 키가 2분 안에 깨운 pending 이면 상한과 무관(합류 · Job 0) → capped 아님');
UPDATE public.tick_convert_requests SET finished_at = '2026-10-31 22:00:00+09'
 WHERE date = '20261024' AND exchange = 'NXT' AND isin = 'KR7370001001';
SELECT is(pg_temp.req(pg_temp.u1(), '20261024', 'KR7370001001', 'NXT', 20)->>'should_trigger', 'true',
          'J finished_at 전날 22:00(retry_at 지남) → 다시 pending · should_trigger true');
SELECT is(pg_temp.st('20261024', 'NXT', 'KR7370001001'), 'pending', 'J retry_at 지난 NOT_UPLOADED → pending');

-- grid_ready · 취소
SELECT is(pg_temp.req(pg_temp.u1(), '20261030', 'KR7370001001', 'KRX', 20) - 'request' - 'eta_s',
          '{"access": true, "should_trigger": false, "capped": false, "grid_ready": true,
            "not_uploaded": false, "retry_after": null}'::jsonb,
          'J 격자가 이미 있으면 grid_ready true · should_trigger false');
SELECT is(pg_temp.st('20261030', 'KRX', 'KR7370001001'), NULL, 'J grid_ready 는 요청 행을 만들지 않는다');

DELETE FROM public.tick_convert_requests;
SELECT pg_temp.req(pg_temp.u1(), '20261023', 'KR7370001001', 'KRX', 20);
SELECT is(public.tick_cancel_convert_for_user(pg_temp.u2(), '20261023', 'KR7370001001', 'KRX')->>'cancelled', 'false',
          'J 취소 — 남의 pending 은 못 취소(본인만)');
SELECT is(pg_temp.st('20261023', 'KRX', 'KR7370001001'), 'pending', 'J 남의 취소 뒤 pending 그대로');
SELECT is(public.tick_cancel_convert_for_user(pg_temp.u1(), '20261023', 'KR7370001001', 'KRX') #>> '{request,status}', 'cancelled',
          'J 취소 — 본인 pending → cancelled');
UPDATE public.tick_convert_requests SET status = 'running' WHERE date = '20261023';
SELECT is(public.tick_cancel_convert_for_user(pg_temp.u1(), '20261023', 'KR7370001001', 'KRX')->>'cancelled', 'false',
          'J 취소 — running 은 못 취소(pending 만)');

-- ── J2. 상한 = 깨운 횟수(WR-01 · 20261104300000) ────────────────────
DELETE FROM public.tick_convert_requests;
CREATE FUNCTION pg_temp.tc(p_date text, p_ex text, p_isin text) RETURNS integer LANGUAGE sql AS $$
  SELECT r.trigger_count FROM public.tick_convert_requests r
   WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin AND r.trigger_day = (now() AT TIME ZONE 'Asia/Seoul')::date
$$;
SELECT pg_temp.req(pg_temp.u1(), '20261017', 'KR7370001001', 'KRX', 2);
SELECT public.tick_request_claim('20261017', 'KRX');
SELECT public.tick_request_finish('20261017', 'KRX', '[{"isin": "KR7370001001", "ok": false, "error": "NO_RECORDS"}]'::jsonb);
SELECT is(pg_temp.req(pg_temp.u1(), '20261017', 'KR7370001001', 'KRX', 2)->>'should_trigger', 'true',
          'J2 같은 키 failed → 재요청 → 다시 트리거');
SELECT is(pg_temp.tc('20261017', 'KRX', 'KR7370001001'), 2, 'J2 다시 pending 으로 올려도 그날 깨운 횟수는 누적 → 2');
SELECT is(pg_temp.req(pg_temp.u1(), '20261016', 'KR7370002009', 'KRX', 2)->>'capped', 'true',
          'J2 같은 키를 두 번 깨운 뒤 cap 2 → 새 키 capped(행 수가 아니라 횟수)');
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '3 minutes' WHERE date = '20261017';
SELECT is(pg_temp.req(pg_temp.u1(), '20261017', 'KR7370001001', 'KRX', 2)->>'capped', 'true',
          'J2 stale pending(3분) 재트리거도 상한을 거친다 → capped');
SELECT is(pg_temp.st('20261017', 'KRX', 'KR7370001001') || ' ' || pg_temp.tc('20261017', 'KRX', 'KR7370001001'), 'pending 2',
          'J2 capped 재트리거는 행 · 횟수를 그대로 둔다');
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '1 minute' WHERE date = '20261017';
SELECT is(pg_temp.req(pg_temp.u2(), '20261017', 'KR7370001001', 'KRX', 2) - 'request' - 'eta_s',
          '{"access": true, "should_trigger": false, "capped": false, "grid_ready": false,
            "not_uploaded": false, "retry_after": null}'::jsonb,
          'J2 2분 안에 깨운 pending 에 합류 → 상한 넘어도 capped 아님 · should_trigger false');
DELETE FROM public.tick_convert_requests;
SELECT pg_temp.req(pg_temp.u1(), '20261015', 'KR7370001001', 'KRX', 1);
SELECT is(public.tick_request_trigger_failed('20261015', 'KRX', 'boom'), 1, 'J2 trigger_failed → pending 1행');
SELECT is(pg_temp.tc('20261015', 'KRX', 'KR7370001001'), 0, 'J2 깨우기 실패(Job 0회) → 오늘 횟수 되돌림 → 0');
SELECT is(pg_temp.req(pg_temp.u1(), '20261014', 'KR7370002009', 'KRX', 1)->>'should_trigger', 'true',
          'J2 깨우기 실패분은 상한에 남지 않는다 → cap 1 에서 새 키 트리거');
-- R2-WR-02 — 깨우기 실패로 triggered_at 이 NULL 인 pending(가장 stale) 도 상한을 거친다(NULL 3값 논리로 단락되지 않는다)
SELECT is(pg_temp.req(pg_temp.u1(), '20261015', 'KR7370001001', 'KRX', 1)->>'capped', 'true',
          'J2 triggered_at NULL pending + 상한 소진(cap 1 · 오늘 1회) → capped true(R2-WR-02)');
SELECT ok((SELECT r.status = 'pending' AND r.triggered_at IS NULL AND r.trigger_count = 0
             FROM public.tick_convert_requests r WHERE r.date = '20261015' AND r.isin = 'KR7370001001'),
          'J2 capped → 깨우지 않는다(pending · triggered_at NULL · trigger_count 0 그대로)');
SELECT is(pg_temp.req(pg_temp.u1(), '20261015', 'KR7370001001', 'KRX', 2)->>'should_trigger', 'true',
          'J2 상한이 남으면 triggered_at NULL pending 은 다시 깨운다 → should_trigger true');

-- ── J3. 합쳐진 요청의 취소 = 내 몫 빼기(WR-02 · 20261104300100) ──────────
DELETE FROM public.tick_convert_requests;
CREATE FUNCTION pg_temp.who(p_date text, p_ex text, p_isin text) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT r.requesters FROM public.tick_convert_requests r
   WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin
$$;
CREATE FUNCTION pg_temp.cx(p_user uuid, p_date text, p_isin text, p_ex text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.tick_cancel_convert_for_user(p_user, p_date, p_isin, p_ex)
$$;
SELECT pg_temp.req(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX', 20);
SELECT is(pg_temp.req(pg_temp.u2(), '20261013', 'KR7370001001', 'KRX', 20)->>'should_trigger', 'false',
          'J3 두 번째 요청자 → 앞 Job 에 합류(should_trigger false)');
SELECT is(pg_temp.who('20261013', 'KRX', 'KR7370001001'), ARRAY[pg_temp.u1(), pg_temp.u2()],
          'J3 합류하면 요청자 집합 {u1, u2}');
SELECT pg_temp.req(pg_temp.u2(), '20261013', 'KR7370001001', 'KRX', 20);
SELECT is(cardinality(pg_temp.who('20261013', 'KRX', 'KR7370001001')), 2, 'J3 같은 사람 재요청은 집합을 늘리지 않는다');
SELECT is(pg_temp.cx(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX') - 'request', '{"access": true, "cancelled": true}'::jsonb,
          'J3 첫 요청자 취소 → 내 몫만 뺀다(cancelled true)');
SELECT is(pg_temp.st('20261013', 'KRX', 'KR7370001001') || ' ' || array_to_string(pg_temp.who('20261013', 'KRX', 'KR7370001001'), ','),
          'pending ' || pg_temp.u2()::text,
          'J3 다른 요청자가 남으면 요청은 pending 그대로(남의 화면에 실패 없음) · 집합 {u2}');
SELECT is(pg_temp.cx(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX')->>'cancelled', 'false',
          'J3 이미 뺀 사람의 재취소 → false');
SELECT pg_temp.cx(pg_temp.u2(), '20261013', 'KR7370001001', 'KRX');
SELECT ok((SELECT r.status = 'cancelled' AND r.finished_at = now() AND r.requesters = '{}'
             FROM public.tick_convert_requests r WHERE r.date = '20261013' AND r.isin = 'KR7370001001'),
          'J3 마지막 요청자 취소 → cancelled · finished_at · 빈 집합');
SELECT pg_temp.req(pg_temp.u2(), '20261013', 'KR7370001001', 'KRX', 20);
SELECT is(pg_temp.st('20261013', 'KRX', 'KR7370001001') || ' ' || array_to_string(pg_temp.who('20261013', 'KRX', 'KR7370001001'), ','),
          'pending ' || pg_temp.u2()::text, 'J3 취소된 요청을 다시 올리면 새 회차 · 집합 {본인}');
SELECT pg_temp.req(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX', 20);
SELECT is(pg_temp.cx(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX') #>> '{request,status}', 'pending',
          'J3 두 번째 요청자도 자기 몫을 취소할 수 있다 · 요청은 pending 그대로');
SELECT ok(NOT (pg_temp.open1('20261013', 'KRX', 'KR7370001001')->'request' ? 'requesters')
          AND NOT (pg_temp.req(pg_temp.u1(), '20261013', 'KR7370001001', 'KRX', 20)->'request' ? 'requesters'),
          'J3 open · 요청 응답은 요청자 집합을 내보내지 않는다');

-- ── J4. 합류는 상한 밖(R2-IN-06 · 20261104600100) ───────────────────────
DELETE FROM public.tick_convert_requests;
SELECT pg_temp.req(pg_temp.u1(), '20261012', 'KR7370001001', 'KRX', 1); -- 깨움 1회 → 오늘 상한 1 소진
UPDATE public.tick_convert_requests SET triggered_at = now() - interval '3 minutes' WHERE date = '20261012';
SELECT is(pg_temp.req(pg_temp.u2(), '20261012', 'KR7370001001', 'KRX', 1)->>'capped', 'true',
          'J4 stale pending(3분) + 상한 소진 → capped(재트리거는 막는다)');
SELECT is(pg_temp.who('20261012', 'KRX', 'KR7370001001'), ARRAY[pg_temp.u1(), pg_temp.u2()],
          'J4 capped 여도 진행 중 회차에는 합류 → 요청자 집합 {u1, u2}(R2-IN-06)');
SELECT ok((SELECT r.trigger_count = 1 AND r.triggered_at < now() - interval '2 minutes'
             FROM public.tick_convert_requests r WHERE r.date = '20261012' AND r.isin = 'KR7370001001'),
          'J4 capped 합류는 깨우지 않는다(trigger_count 1 · triggered_at 그대로)');
SELECT is(pg_temp.cx(pg_temp.u1(), '20261012', 'KR7370001001', 'KRX') #>> '{request,status}', 'pending',
          'J4 원래 요청자가 취소해도 합류자가 남아 pending(합류자 화면에 cancelled 없음)');

-- ── K. 실행 기록 · 후보 ───────────────────────────────────────────
SELECT ok(public.tick_convert_run_record('{"date": "20261030", "exchange": "KRX", "mode": "nightly", "ok": true,
                                            "targets": 3, "written": 3, "bytes_read": 1000, "duration_ms": 5000}'::jsonb) > 0,
          'K run_record → 새 id');
SELECT is(public.tick_convert_runs_since('20261030') #- '{0,finished_at}',
          '[{"date": "20261030", "exchange": "KRX", "mode": "nightly", "ok": true, "error": null}]'::jsonb,
          'K runs_since → {date, exchange, mode, ok, finished_at, error}(R2-WR-03 · 20261104600200)');
SELECT is(public.tick_convert_runs_since('20261031'), '[]'::jsonb, 'K runs_since 이후 없음 → []');
SELECT public.tick_convert_run_record('{"date": "20261101", "exchange": "NXT", "mode": "nightly", "ok": null,
                                        "targets": 0, "written": 0, "bytes_read": 0, "duration_ms": 0, "error": "STARTED"}'::jsonb);
SELECT is(public.tick_convert_runs_since('20261101') #- '{0,finished_at}',
          '[{"date": "20261101", "exchange": "NXT", "mode": "nightly", "ok": null, "error": "STARTED"}]'::jsonb,
          'K 「시작」 기록(ok null · STARTED) 이 runs_since 에 error 와 함께 나온다(크래시 판정 · R2-WR-03)');
DELETE FROM public.tick_convert_runs WHERE date = '20261101';

INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin) VALUES
  ('KB120', 'tv-ep', 1, '2026-10-30', 1793000000000, 16, 'KRX', 'KR7370003007'),
  ('KB120', 'tv-ep', 2, '2026-10-30', 1793000000001, 16, 'KRX', 'KR7370003007'),
  ('KB120', 'tv-ep', 3, '2026-10-30', 1793000000002, 15, 'KRX', 'KR7370004005'),
  ('KB120', 'tv-ep', 4, '2026-10-29', 1792900000000, 16, 'KRX', 'KR7370005002');
SELECT is(public.tick_convert_candidates('20261030'),
          '{"accum": ["KR7370001001"], "live16": ["KR7370003007"], "launch": []}'::jsonb,
          'K candidates = accum(limitup_accum_flow) ∪ live16(kind 16 · 그날 · DISTINCT) · launch(발사 조각 없음 → [] · quick 261103-pei)');

-- ── L. 오늘 목록(D-15) ─────────────────────────────────────────────
DELETE FROM public.stock_quotes;
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('370003', '틱종목삼', 'KOSDAQ', 'KR7370003007'),
  ('370004', '틱종목사', 'KOSDAQ', 'KR7370004005'),
  ('370005', '틱종목오', 'KOSDAQ', 'KR7370005002');
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin) VALUES
  ('KB120', 'tv-ep', 10, (now() AT TIME ZONE 'Asia/Seoul')::date, 1793000000000, 16, 'KRX', 'KR7370001001'),
  ('KB120', 'tv-ep', 11, (now() AT TIME ZONE 'Asia/Seoul')::date, 1793000000001, 16, 'NXT', 'KR7370002009');
-- base = price − change_amount = 10000 · 1 = 정확히 +15%(포함) · 3 = +20% · 4 = +14.99%(제외) · 5 = +30% 지만 어제 갱신(제외)
INSERT INTO public.stock_quotes (code, price, change_amount, change_rate, high, upper_limit, lower_limit, updated_at) VALUES
  ('370001', 11000, 1000, 10.0, 11500, 13000, 7000, now()),
  ('370003', 10500,  500,  5.0, 12000, 13000, 7000, now()),
  ('370004', 11400, 1400, 14.0, 11499, 13000, 7000, now()),
  ('370005', 13000, 3000, 30.0, 13000, 13000, 7000, now() - interval '2 days');
SELECT is((SELECT jsonb_agg(e->>'isin' ORDER BY n) FROM jsonb_array_elements(public.tick_today_for_user(pg_temp.u1())->'rows')
             WITH ORDINALITY x(e, n)),
          '["KR7370001001", "KR7370003007", "KR7370002009"]'::jsonb,
          'L today = kind 16 ∪ +15%(정확히 +15% 포함 · 14.99% 제외 · 어제 갱신 제외) · rate DESC NULLS LAST');
SELECT is(public.tick_today_for_user(pg_temp.u1())->'rows'->0,
          '{"isin": "KR7370001001", "code": "370001", "name": "틱종목일", "sources": ["accum", "up15"],
            "rate": 10.0, "high_rate": 15.0}'::jsonb,
          'L today 행 — kind 16 + 15% 둘 다면 sources 둘 다 · high_rate');
SELECT is(public.tick_today_for_user(pg_temp.u1())->'rows'->2->'sources', '["accum"]'::jsonb,
          'L today kind 16 만(시세 없음) → sources [accum] · rate null 맨 뒤');
SELECT is(public.tick_today_for_user(pg_temp.u1())->>'date', to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYYMMDD'),
          'L today date = KST 오늘');

-- ── L2. 오늘 고가 신선도(20261103090000 · 2026-11-03 사고) ─────────────────
-- 6 = 값은 맞아 보이지만(+20%) 고가가 며칠 전 값(ohlc_updated_at 5일 전) → 제외
-- 7 = 고가는 오늘 찍혔지만 현재가 < 저가(한양디지텍꼴 섞임) → 제외
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('370006', '틱종목육', 'KOSDAQ', 'KR7370006009'),
  ('370007', '틱종목칠', 'KOSDAQ', 'KR7370007007');
INSERT INTO public.stock_quotes (code, price, change_amount, change_rate, open, high, low, upper_limit, lower_limit, updated_at) VALUES
  ('370006', 11000, 1000, 10.0, 10000, 12000, 10000, 13000, 7000, now()),
  ('370007', 10000, -500, -4.76, 12500, 13000, 12000, 13650, 7350, now());
SELECT is((SELECT ohlc_updated_at FROM public.stock_quotes WHERE code = '370006'), now(),
          'L2 트리거 — INSERT 에 OHLC 가 있으면 ohlc_updated_at = now()');
UPDATE public.stock_quotes SET ohlc_updated_at = now() - interval '5 days' WHERE code = '370006';
UPDATE public.stock_quotes SET price = 11100, change_amount = 1100, change_rate = 11.0 WHERE code = '370006';
SELECT is((SELECT ohlc_updated_at FROM public.stock_quotes WHERE code = '370006'), now() - interval '5 days',
          'L2 트리거 — OHLC 를 안 바꾸는 갱신(STEP1)은 ohlc_updated_at 을 올리지 않는다');
SELECT is((SELECT jsonb_agg(e->>'isin' ORDER BY n) FROM jsonb_array_elements(public.tick_today_for_user(pg_temp.u1())->'rows')
             WITH ORDINALITY x(e, n)),
          '["KR7370001001", "KR7370003007", "KR7370002009"]'::jsonb,
          'L2 today — 묵은 고가(5일 전) · 현재가 < 저가 는 +15% 로 세지 않는다');
UPDATE public.stock_quotes SET high = 12100 WHERE code = '370006';
SELECT is((SELECT ohlc_updated_at FROM public.stock_quotes WHERE code = '370006'), now(),
          'L2 트리거 — 고가가 바뀌면 ohlc_updated_at = now()');
SELECT is((SELECT e->'high_rate' FROM jsonb_array_elements(public.tick_today_for_user(pg_temp.u1())->'rows') e
            WHERE e->>'isin' = 'KR7370006009'),
          to_jsonb(((12100 - 10000) * 100 / 10000.0)::double precision),
          'L2 today — 고가가 오늘 값이 되면 up15 로 들어온다(high_rate 21)');

-- ── M. purge(D-04 · 90일) ─────────────────────────────────────────
DELETE FROM public.tick_grids; DELETE FROM public.tick_convert_requests; DELETE FROM public.tick_convert_runs;
CREATE FUNCTION pg_temp.kd(p_days int) RETURNS text LANGUAGE sql AS $$
  SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date - p_days, 'YYYYMMDD')
$$;
SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
  pg_temp.grow(pg_temp.kd(91), 'KRX', 'KR7370001001', 'nightly', 10.0),
  pg_temp.grow(pg_temp.kd(90), 'KRX', 'KR7370001001', 'nightly', 10.0)));
INSERT INTO public.tick_convert_requests (date, exchange, isin, status) VALUES
  (pg_temp.kd(91), 'NXT', 'KR7370001001', 'done'), (pg_temp.kd(90), 'NXT', 'KR7370001001', 'done');
INSERT INTO public.tick_convert_runs (date, exchange, mode, ok) VALUES
  (pg_temp.kd(92), 'KRX', 'nightly', true), (pg_temp.kd(90), 'KRX', 'nightly', true);
SELECT is(public.tick_purge_old(90),
          jsonb_build_object('cutoff', pg_temp.kd(90), 'grids', 1, 'requests', 1, 'runs', 1,
                             'dates', jsonb_build_array(pg_temp.kd(92), pg_temp.kd(91))),
          'M purge(90) → 91일 전 격자 · 요청 · 92일 전 실행 기록 삭제 · 지운 날짜 dates');
SELECT is((SELECT count(*)::int FROM public.tick_grids) + (SELECT count(*)::int FROM public.tick_convert_requests)
          + (SELECT count(*)::int FROM public.tick_convert_runs), 3, 'M purge 뒤 90일 전(경계) 행 3개는 남는다');
SELECT throws_ok($$ SELECT public.tick_purge_old(0) $$, 'P0001', NULL, 'M purge p_keep_days < 1 → RAISE');

SELECT * FROM finish();
ROLLBACK;
