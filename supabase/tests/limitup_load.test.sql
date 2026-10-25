-- ============================================================
-- Phase 28 Plan 03 — 상한가 특징 밤 적재(stage → 날짜 원자 commit) pgTAP.
--
-- 대상: 20261006090100_limitup_tables.sql(표 10개 · 잠금) · 20261006090200_limitup_load_rpcs.sql
--   (limitup_stage_clear · limitup_commit_day · limitup_record_skip) · 20261006090300_limitup_retention_storage.sql
--   (limitup_purge_old — 28-06).
--
-- 잠그는 것:
--   - commit 한 번이 8표(노트 6 + 파생 2)에 stage 행을 그대로 옮긴다 — 예약어 열 "foreign" · "values" · 배열 열 q_krw 포함
--   - 적재 이력(files_sig · manifest_sha256 · 표별 행 수 · skip_streak 0) 기록 · stage 비움
--   - 재적재로 행이 줄면 옛 행이 남지 않는다(삭제 후 삽입 — upsert 아님)
--   - 기대 수가 틀리거나 payload date 가 다르면 예외이고 기존 행 · stage 가 그대로(원자성)
--   - limitup_record_skip 연속 1 · 2 · 3, 성공 commit 이 0 으로 · skip 은 files_sig 를 건드리지 않는다
--   - 보존 정리 limitup_purge_old(90, 30): 91일 전 날짜의 표 5 · 파생 2 · 이력 · stage 삭제 · 89일 전은 남김 ·
--     member_alloc 은 31일 전 삭제 · 29일 전 남김 · 보존 일수 0 이하 예외 (28-06)
--   - 권한: anon · authenticated 는 10표 · 4 RPC 불가, service_role 가능 · RLS 10표 활성 · 정책 0개 · facts GIN 없음
--   - quick-261006-ide: locks 새 6열(sell_krw · cancel_krw · risk_3s/10s/60s · risk_pre — 20261006120000) — 새 키가 있는
--     payload 는 같은 이름 열로 그대로(1 초과 위험도 · null 포함), 키가 없는 옛 payload 는 null · 열 타입 · 열 권한
--   - Phase 33(20261016200000): limitup_team_flow 9번째 쌍 · stage CHECK 9값 · 이력 rows.team_flow 는 p_expected 에 키가
--     있을 때만(옛 워커 호출 호환 · D-03 감지 전제) · 날짜 교체 · purge · statement_timeout 120s 보존 · 열 타입 · 잠금 (J 절)
--   - Phase 34(20261020200000): limitup_accum_flow 10번째 쌍 · stage CHECK 10값 · 이력 rows.accum_flow 는 p_expected 에 키가
--     있을 때만(옛 워커 호출 호환) · 날짜 교체 · 원자성 · purge 90일 · statement_timeout 120s 보존 · 열 타입 · PK · 잠금 (K 절)
--   - quick-261025-uf2(20261025200000): limitup_accum_flow 당일 축 4열 — 새 키가 있는 payload 는 같은 이름 열로 그대로
--     (int4 초과 금액 포함), 키 없음 · JSON null 은 NULL · 열 타입 · commit 본문 무변경 (L 절)
--   - quick-261026-0ty(20261026120000): limitup_accum_flow pos_day_avg_px 열 — 값 그대로 · 0 은 0(NULL 아님) ·
--     키 없음 · JSON null 은 NULL · 열 타입 bigint · commit 본문 무변경 (M 절)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(288);  -- 163(Phase 28) + 55(J · Phase 33 team_flow) + 53(K · Phase 34 accum_flow) + 11(L · quick-261025-uf2 당일 축 4열)
                   -- + 6(M · quick-261026-0ty pos_day_avg_px)

-- stage 행 1개 — payload 에 date 를 기본으로 싣는다(p_payload 가 덮을 수 있다).
CREATE FUNCTION pg_temp.st(p_date text, p_tbl text, p_seq int, p_payload jsonb) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.limitup_stage (date, tbl, seq, payload)
  VALUES (p_date, p_tbl, p_seq, jsonb_build_object('date', p_date) || p_payload)
$$;

-- ── A. 첫 commit — 8표 · 예약어 · 배열 · 이력 · stage 비움 ─────────────
SELECT pg_temp.st('20261002', 'entries', 1, '{"isin":"KR7000000001","short_code":"000001","name":"가종목","upper_px":5690,"reached":true,"max_rate":0.3,"schema_version":1}');
SELECT pg_temp.st('20261002', 'entries', 2, '{"isin":"KR7000000002","short_code":"000002","name":"나종목","reached":false,"schema_version":1}');
SELECT pg_temp.st('20261002', 'locks', 1, '{"isin":"KR7000000001","lock_id":1,"broke":true,"outcome":"깨짐","start_ms":1790917028087,"end_ms":null,"schema_version":1}');
SELECT pg_temp.st('20261002', 'jumps', 1, '{"isin":"KR7000000001","jump_no":1,"kind":"burst_sell","krw":14730010,"lock_state":1,"schema_version":1}');
SELECT pg_temp.st('20261002', 'member_alloc', 1, '{"isin":"KR7000000001","sweep_no":1,"side":"buy","member":"00002","name":"신한증권","foreign":false,"share":0.38,"schema_version":1}');
SELECT pg_temp.st('20261002', 'member_alloc', 2, '{"isin":"KR7000000001","sweep_no":1,"side":"buy","member":"00036","name":"JP모간","foreign":true,"share":0.62,"schema_version":1}');
SELECT pg_temp.st('20261002', 'facts', 1, '{"isin":"KR7000000001","event_no":1,"fact_no":1,"template_id":"q_max","text":"잔량 최대 17.3억","values":{"lock_id":1,"krw":1730000000},"source":"실측","schema_version":1}');
SELECT pg_temp.st('20261002', 'touches', 1, '{"isin":"KR7000000001","touch_id":1,"first_trade":"13:57:08.020355","first_qty":1177,"schema_version":1}');
SELECT pg_temp.st('20261002', 'grid_summary', 1, '{"isin":"KR7000000001","step_s":10,"sec0":32400,"q_krw":[0,120,null],"q_max_krw":120,"q_max_ms":1790917028087,"sell_share_60s":0.37}');
SELECT pg_temp.st('20261002', 'member_daily', 1, '{"member":"00002","name":"신한증권","n":1,"entry_sum":0.38,"entry_cnt":1,"lock_buy_sum":0,"lock_buy_cnt":1,"pre_sell_sum":0,"pre_sell_cnt":0,"lead":0,"n_broke":1,"n_lock":1,"n_held":0}');

CREATE TEMP TABLE t_res (label text PRIMARY KEY, r jsonb);
INSERT INTO t_res SELECT 'c1', public.limitup_commit_day('20261002', 'mf-sha-1', 'sig-1', 1,
  '{"entries":2,"locks":1,"jumps":1,"member_alloc":2,"facts":1,"touches":1,"grid_summary":1,"member_daily":1}');

SELECT is((SELECT r #>> '{rows,entries}' FROM t_res WHERE label = 'c1'), '2', 'A commit 반환 rows.entries = 2');
SELECT is((SELECT count(*)::int FROM public.limitup_entries      WHERE date = '20261002'), 2, 'A entries 2행');
SELECT is((SELECT count(*)::int FROM public.limitup_locks        WHERE date = '20261002'), 1, 'A locks 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_jumps        WHERE date = '20261002'), 1, 'A jumps 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_member_alloc WHERE date = '20261002'), 2, 'A member_alloc 2행');
SELECT is((SELECT count(*)::int FROM public.limitup_facts        WHERE date = '20261002'), 1, 'A facts 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_touches      WHERE date = '20261002'), 1, 'A touches 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_grid_summary WHERE date = '20261002'), 1, 'A grid_summary 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_member_daily WHERE date = '20261002'), 1, 'A member_daily 1행');
SELECT is((SELECT count(*)::int FROM public.limitup_member_alloc WHERE date = '20261002' AND "foreign"), 1,
          'A 예약어 열 "foreign" = true 1행(member 00036)');
SELECT is((SELECT "values"->>'krw' FROM public.limitup_facts WHERE date = '20261002'), '1730000000',
          'A 예약어 jsonb 열 "values"->>krw = 1730000000');
SELECT is((SELECT q_krw[2] FROM public.limitup_grid_summary WHERE date = '20261002'), 120::bigint,
          'A 배열 열 q_krw[2] = 120');
SELECT ok((SELECT q_krw[3] IS NULL FROM public.limitup_grid_summary WHERE date = '20261002'),
          'A 배열 열 q_krw[3] = null(결측 유지)');
SELECT is((SELECT files_sig || '|' || manifest_sha256 || '|' || schema_version || '|' || skip_streak
             FROM public.limitup_loads WHERE date = '20261002'), 'sig-1|mf-sha-1|1|0',
          'A 이력 files_sig · manifest_sha256 · schema_version · skip_streak 0');
SELECT is((SELECT "rows"->>'member_alloc' FROM public.limitup_loads WHERE date = '20261002'), '2',
          'A 이력 rows.member_alloc = 실제 삽입 수 2');
SELECT is((SELECT count(*)::int FROM public.limitup_stage WHERE date = '20261002'), 0, 'A commit 뒤 그날 stage 0행');
SELECT ok((SELECT sell_krw IS NULL FROM public.limitup_locks WHERE date = '20261002'),
          'A 새 키 없는 옛 locks payload → sell_krw null(quick-261006-ide)');
SELECT ok((SELECT risk_pre IS NULL FROM public.limitup_locks WHERE date = '20261002'),
          'A 새 키 없는 옛 locks payload → risk_pre null');

-- ── B. 재적재로 축소 — entries 1 · 나머지 0 → 옛 행이 남지 않는다 ──────
SELECT pg_temp.st('20261002', 'entries', 1, '{"isin":"KR7000000002","name":"나종목-재처리","schema_version":1}');
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261002', 'mf-sha-2', 'sig-2', 1, '{"entries":1}') $$,
                'B 재commit(entries 1 · 나머지 키 없음 = 0) 성공');
SELECT is((SELECT count(*)::int FROM public.limitup_entries WHERE date = '20261002'), 1, 'B entries 2 → 1행');
SELECT is((SELECT isin || '|' || name FROM public.limitup_entries WHERE date = '20261002'), 'KR7000000002|나종목-재처리',
          'B 남은 entries 행 = 재처리 행');
SELECT is((SELECT count(*)::int FROM public.limitup_locks WHERE date = '20261002'), 0, 'B locks 옛 행 삭제(0행)');
SELECT is((SELECT count(*)::int FROM public.limitup_member_alloc WHERE date = '20261002'), 0, 'B member_alloc 옛 행 삭제(0행)');
SELECT is((SELECT count(*)::int FROM public.limitup_grid_summary WHERE date = '20261002'), 0, 'B grid_summary 옛 행 삭제(0행)');

-- ── C. 기대 수 불일치 → 예외 · 기존 행 · stage 그대로 ────────────────
SELECT pg_temp.st('20261002', 'entries', 1, '{"isin":"KR7000000003","name":"다종목","schema_version":1}');
SELECT throws_like($$ SELECT public.limitup_commit_day('20261002', 'mf-sha-3', 'sig-3', 1, '{"entries":2}') $$,
                   '%20261002 entries stage 1 expected 2%', 'C stage 1 ≠ 기대 2 → 예외');
SELECT is((SELECT isin || '|' || name FROM public.limitup_entries WHERE date = '20261002'), 'KR7000000002|나종목-재처리',
          'C 예외 뒤 기존 entries 행 그대로');
SELECT is((SELECT count(*)::int FROM public.limitup_stage WHERE date = '20261002'), 1, 'C 예외 뒤 stage 1행 그대로');

-- ── D. payload date 불일치 → 예외 ────────────────────────────────────
SELECT is(public.limitup_stage_clear('20261002'), 1, 'D limitup_stage_clear 가 지운 행 수 1');
SELECT pg_temp.st('20261002', 'entries', 1, '{"date":"20261001","isin":"KR7000000004","schema_version":1}');
SELECT throws_like($$ SELECT public.limitup_commit_day('20261002', 'mf-sha-4', 'sig-4', 1, '{"entries":1}') $$,
                   '%payload date mismatch%', 'D payload date 20261001 ≠ 20261002 → 예외');
SELECT is((SELECT isin FROM public.limitup_entries WHERE date = '20261002'), 'KR7000000002', 'D 예외 뒤 기존 entries 행 그대로');

-- ── E. skip streak ────────────────────────────────────────────────
SELECT is(public.limitup_record_skip('20261003', 'sha'), 1, 'E skip 1회째 → 1');
SELECT is(public.limitup_record_skip('20261003', 'sha'), 2, 'E skip 2회째 → 2');
SELECT is(public.limitup_record_skip('20261003', 'schema'), 3, 'E skip 3회째 → 3');
SELECT is((SELECT coalesce(files_sig, '<null>') || '|' || last_skip_reason FROM public.limitup_loads WHERE date = '20261003'),
          '<null>|schema', 'E skip 만 있던 날짜 files_sig null · 마지막 사유 schema');
SELECT is(public.limitup_commit_day('20261003', 'mf-sha-5', 'sig-5', 1, '{}') #>> '{rows,entries}', '0',
          'E 빈 날짜 commit(행 0 · 기대 {}) 성공');
SELECT is((SELECT skip_streak || '|' || files_sig FROM public.limitup_loads WHERE date = '20261003'), '0|sig-5',
          'E 성공 commit 이 skip_streak 를 0 으로 · files_sig 기록');
SELECT is(public.limitup_record_skip('20261002', 'manifest'), 1, 'E 적재된 날짜 skip → streak 1');
SELECT is((SELECT files_sig FROM public.limitup_loads WHERE date = '20261002'), 'sig-2', 'E skip 은 files_sig 를 건드리지 않는다');

-- ── G. 날짜 형식 ───────────────────────────────────────────────────
SELECT throws_like($$ SELECT public.limitup_commit_day('2026-10-02', 'x', 'y', 1, '{}') $$,
                   '%bad date%', 'G 날짜 형식 YYYYMMDD 아니면 예외');

-- ── H. 보존 정리 limitup_purge_old(90, 30) — 28-06 ───────────────────
-- 날짜는 실행 시각 기준 KST 오늘에서 계산한다(d91 · d89 · d31 · d29).
CREATE TEMP TABLE t_d (k text PRIMARY KEY, d text);
INSERT INTO t_d SELECT k, to_char((now() AT TIME ZONE 'Asia/Seoul')::date - n, 'YYYYMMDD')
  FROM (VALUES ('d91', 91), ('d90', 90), ('d89', 89), ('d31', 31), ('d29', 29)) AS v(k, n);
CREATE FUNCTION pg_temp.dd(p_k text) RETURNS text LANGUAGE sql AS $$ SELECT d FROM t_d WHERE k = p_k $$;

-- d91 · d89: 8표 1행씩 commit(이력 생김) + 남은 stage 1행. d31 · d29: member_alloc 1행 commit.
CREATE FUNCTION pg_temp.day8(p_date text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.st(p_date, 'entries', 1, '{"isin":"KR7000000001"}');
  PERFORM pg_temp.st(p_date, 'locks', 1, '{"isin":"KR7000000001","lock_id":1}');
  PERFORM pg_temp.st(p_date, 'jumps', 1, '{"isin":"KR7000000001","jump_no":1}');
  PERFORM pg_temp.st(p_date, 'member_alloc', 1, '{"isin":"KR7000000001","sweep_no":1,"side":"buy","member":"00002"}');
  PERFORM pg_temp.st(p_date, 'facts', 1, '{"isin":"KR7000000001","event_no":0,"fact_no":1}');
  PERFORM pg_temp.st(p_date, 'touches', 1, '{"isin":"KR7000000001","touch_id":1}');
  PERFORM pg_temp.st(p_date, 'grid_summary', 1, '{"isin":"KR7000000001","step_s":10,"sec0":32400,"q_krw":[1]}');
  PERFORM pg_temp.st(p_date, 'member_daily', 1, '{"member":"00002","n":1,"entry_sum":0,"entry_cnt":0,"lock_buy_sum":0,"lock_buy_cnt":0,"pre_sell_sum":0,"pre_sell_cnt":0,"lead":0,"n_broke":0,"n_lock":0,"n_held":0}');
  PERFORM public.limitup_commit_day(p_date, 'mf', 'sig-' || p_date, 1,
    '{"entries":1,"locks":1,"jumps":1,"member_alloc":1,"facts":1,"touches":1,"grid_summary":1,"member_daily":1}');
  PERFORM pg_temp.st(p_date, 'entries', 1, '{"isin":"KR7000000009"}');  -- commit 뒤 남은 stage(중단된 run 흉내)
END $$;
CREATE FUNCTION pg_temp.alloc1(p_date text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.st(p_date, 'member_alloc', 1, '{"isin":"KR7000000001","sweep_no":1,"side":"buy","member":"00002"}');
  PERFORM public.limitup_commit_day(p_date, 'mf', 'sig-' || p_date, 1, '{"member_alloc":1}');
END $$;
SELECT pg_temp.day8(pg_temp.dd('d91'));
SELECT pg_temp.day8(pg_temp.dd('d89'));
SELECT pg_temp.alloc1(pg_temp.dd('d31'));
SELECT pg_temp.alloc1(pg_temp.dd('d29'));

INSERT INTO t_res SELECT 'purge', public.limitup_purge_old(90, 30);
SELECT is((SELECT r->>'cutoff' FROM t_res WHERE label = 'purge'), pg_temp.dd('d90'), 'H cutoff = KST 오늘 − 90일');
SELECT is((SELECT r #>> '{deleted,entries}' FROM t_res WHERE label = 'purge'), '1', 'H 반환 deleted.entries = 1(d91)');

CREATE TEMP TABLE t_keep (t text PRIMARY KEY);
INSERT INTO t_keep VALUES ('limitup_entries'), ('limitup_locks'), ('limitup_jumps'), ('limitup_facts'), ('limitup_touches'),
  ('limitup_grid_summary'), ('limitup_member_daily'), ('limitup_loads'), ('limitup_stage');
CREATE FUNCTION pg_temp.cnt(p_t text, p_date text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  EXECUTE format('SELECT count(*)::int FROM public.%I WHERE date = $1', p_t) INTO v USING p_date;
  RETURN v;
END $$;
SELECT is(pg_temp.cnt(t, pg_temp.dd('d91')), 0, 'H ' || t || ' 91일 전 삭제') FROM t_keep ORDER BY t;
SELECT is(pg_temp.cnt(t, pg_temp.dd('d89')), 1, 'H ' || t || ' 89일 전 남김') FROM t_keep ORDER BY t;
SELECT is(pg_temp.cnt('limitup_member_alloc', pg_temp.dd('d89')), 0, 'H member_alloc 89일 전 삭제(30일 보존)');
SELECT is(pg_temp.cnt('limitup_member_alloc', pg_temp.dd('d31')), 0, 'H member_alloc 31일 전 삭제');
SELECT is(pg_temp.cnt('limitup_member_alloc', pg_temp.dd('d29')), 1, 'H member_alloc 29일 전 남김');
SELECT throws_like($$ SELECT public.limitup_purge_old(0, 30) $$, '%keep days must be >= 1%',
                   'H 보존 일수 0 이하 → 예외(보존 창이 사라지지 않게)');

-- ── I. locks 새 6열 — gh-trade ea8d9171 export 키(quick-261006-ide · 20261006120000) ──────────
SELECT pg_temp.st('20261005', 'locks', 1, '{"isin":"KR7000000001","lock_id":1,"broke":true,"sell_krw":980000000,"cancel_krw":920000000,"risk_3s":0.04,"risk_10s":0.40,"risk_60s":null,"risk_pre":0.25,"schema_version":2}');
SELECT pg_temp.st('20261005', 'locks', 2, '{"isin":"KR7000000001","lock_id":2,"broke":false,"sell_krw":230000000,"cancel_krw":110000000,"risk_3s":null,"risk_10s":0.01,"risk_60s":0.06,"risk_pre":1.92,"schema_version":2}');
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261005', 'mf-sha-i', 'sig-i', 2, '{"locks":2}') $$,
                'I 새 키 locks 2행 commit 성공(RPC 본문 무변경)');
SELECT is((SELECT sell_krw FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 1), 980000000::bigint,
          'I sell_krw = 980000000');
SELECT is((SELECT cancel_krw FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 1), 920000000::bigint,
          'I cancel_krw = 920000000');
SELECT is((SELECT risk_3s FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 1), 0.04::double precision,
          'I risk_3s = 0.04(소수)');
SELECT is((SELECT risk_10s FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 1), 0.40::double precision,
          'I risk_10s = 0.40');
SELECT ok((SELECT risk_60s IS NULL FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 1),
          'I risk_60s JSON null → null');
SELECT is((SELECT risk_pre FROM public.limitup_locks WHERE date = '20261005' AND lock_id = 2), 1.92::double precision,
          'I risk_pre = 1.92(100% 초과 = 1 초과 그대로)');
SELECT col_type_is('public', 'limitup_locks', c.col, c.typ, 'I 열 타입 ' || c.col || ' = ' || c.typ)
  FROM (VALUES ('sell_krw', 'bigint'), ('cancel_krw', 'bigint'), ('risk_3s', 'double precision'),
               ('risk_10s', 'double precision'), ('risk_60s', 'double precision'), ('risk_pre', 'double precision'))
       AS c(col, typ)
 ORDER BY c.col;
SELECT is(has_column_privilege(r.role, 'public.limitup_locks', 'sell_krw', 'SELECT'), r.expect,
          format('I %s SELECT limitup_locks.sell_krw = %s(표 단위 잠금이 새 열에도)', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;

-- ── F. 잠금 · 권한 ─────────────────────────────────────────────────
CREATE TEMP TABLE t_tbls (t text PRIMARY KEY);
INSERT INTO t_tbls VALUES
  ('public.limitup_entries'), ('public.limitup_locks'), ('public.limitup_jumps'), ('public.limitup_member_alloc'),
  ('public.limitup_facts'), ('public.limitup_touches'), ('public.limitup_stage'), ('public.limitup_loads'),
  ('public.limitup_grid_summary'), ('public.limitup_member_daily');

SELECT is(has_table_privilege(r.role, x.t, r.priv), r.expect, format('%s %s %s = %s', r.role, x.t, r.priv, r.expect))
  FROM t_tbls x
 CROSS JOIN (VALUES ('anon', 'SELECT', false), ('anon', 'INSERT', false),
                    ('authenticated', 'SELECT', false), ('authenticated', 'INSERT', false),
                    ('service_role', 'SELECT', true), ('service_role', 'DELETE', true)) AS r(role, priv, expect)
 ORDER BY x.t, r.role, r.priv;

SELECT is(has_function_privilege(r.role, f.sig, 'EXECUTE'), r.expect, format('%s EXECUTE %s = %s', r.role, f.sig, r.expect))
  FROM (VALUES ('public.limitup_stage_clear(text)'),
               ('public.limitup_commit_day(text, text, text, integer, jsonb)'),
               ('public.limitup_record_skip(text, text)'),
               ('public.limitup_purge_old(integer, integer)')) AS f(sig)
 CROSS JOIN (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY f.sig, r.role;

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = x.t::regclass), x.t || ' RLS 활성')
  FROM t_tbls x ORDER BY x.t;

SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'limitup\_%'), 0,
          'limitup 표 정책 0개(server 경유 읽기 · D-15)');
SELECT is((SELECT count(*)::int FROM pg_indexes
            WHERE schemaname = 'public' AND tablename LIKE 'limitup\_%' AND indexdef ILIKE '%USING gin%'), 0,
          'limitup 표 GIN 인덱스 없음(facts."values" 포함 · D-15)');

-- ── J. Phase 33 team_flow — 20261016200000_limitup_team_flow.sql ─────────────
-- 잠그는 것: stage CHECK 9값 · 9번째 쌍(payload 중첩 그대로 · *_share double · null 열) · 이력 키는 p_expected 에 있을 때만
-- (옛 워커 호출은 키 없음 · 그날 limitup_team_flow 는 비움 — Pitfall 1 · D-02 · D-03) · 날짜 단위 교체 · 대조 실패 ·
-- purge · statement_timeout 재진술(Pitfall 2) · 열 타입 · PK · 잠금(D-06).
-- team_flow export 행 — 키 이름 = gh-trade teamflow.py export_row(픽스처 20261014 와 같은 모양 · 일부 키 생략은 null).
CREATE FUNCTION pg_temp.tf(p_isin text, p_net bigint, p_share double precision) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'isin', p_isin, 'short_code', right(p_isin, 6), 'name', '팀종목' || right(p_isin, 2), 'market', 'KOSDAQ',
    'base', 10000, 'upper', 13000, 'first_limit_ms', NULL, 'first_limit_auction', false,
    'last_ms', 1792130000000, 'last_px', 12980, 'last_rate', 29.8, 'status', 'below',
    'volume', 123456, 'value', 1500000000, 'team_buy_val', 300000000, 'team_sell_val', 200000000,
    'team_net_val', p_net, 'team_buy_share', p_share, 'high_px', 13000, 'high_rate', 30.0, 'high_ms', 1792120000000,
    'schema_version', 1,
    'payload', jsonb_build_object(
      'bands', jsonb_build_array(
        jsonb_build_object('label', '0~5%', 'net_val', -9836500, 'share', 0.1),
        jsonb_build_object('label', '하루 합계', 'net_val', p_net, 'share', p_share)),
      'buckets', jsonb_build_array(jsonb_build_object('key', 54, 'start', '09:00', 'net_val', -7263500)),
      'window', NULL, 'members', NULL,
      'summary_lines', jsonb_build_array('팀 순매수 <b>+1.0억</b>')))
$$;

-- ① stage CHECK — team_flow 허용 · 목록 밖 값은 23514
SELECT lives_ok($$ SELECT pg_temp.st('20261010', 'team_flow', 1, pg_temp.tf('KR7000000101', 1, 0.5)) $$,
                'J① limitup_stage tbl team_flow 허용(CHECK 9값)');
SELECT throws_ok($$ SELECT pg_temp.st('20261010', 'bogus', 1, '{}') $$, '23514', NULL,
                 'J① limitup_stage tbl bogus → 23514(check_violation)');
SELECT is(public.limitup_stage_clear('20261010'), 1, 'J① stage_clear 가 team_flow stage 1행을 지운다');

-- ② p_expected team_flow 2 → 2행 · payload 중첩 · double · null · 이력 키
SELECT pg_temp.st('20261014', 'team_flow', 1, pg_temp.tf('KR7000000101', 500000000, 0.26));
SELECT pg_temp.st('20261014', 'team_flow', 2, pg_temp.tf('KR7000000102', -50000000, NULL));
INSERT INTO t_res SELECT 'tf1', public.limitup_commit_day('20261014', 'mf-tf-1', 'sig-tf-1', 1, '{"team_flow":2}');
SELECT is((SELECT r #>> '{rows,team_flow}' FROM t_res WHERE label = 'tf1'), '2', 'J② commit 반환 rows.team_flow = 2');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261014'), 2, 'J② limitup_team_flow 2행');
SELECT is((SELECT payload->'bands'->0->>'label' FROM public.limitup_team_flow WHERE date = '20261014' AND isin = 'KR7000000101'),
          '0~5%', 'J② payload.bands[0].label 중첩 그대로');
SELECT is((SELECT jsonb_typeof(payload->'buckets') FROM public.limitup_team_flow WHERE date = '20261014' AND isin = 'KR7000000101'),
          'array', 'J② payload.buckets 배열 그대로');
SELECT is((SELECT payload->'summary_lines'->>0 FROM public.limitup_team_flow WHERE date = '20261014' AND isin = 'KR7000000101'),
          '팀 순매수 <b>+1.0억</b>', 'J② payload.summary_lines 원문(<b> 포함) 그대로');
SELECT is((SELECT team_buy_share FROM public.limitup_team_flow WHERE date = '20261014' AND isin = 'KR7000000101'),
          0.26::double precision, 'J② team_buy_share = 0.26(double precision)');
SELECT is((SELECT last_rate FROM public.limitup_team_flow WHERE date = '20261014' AND isin = 'KR7000000101'),
          29.8::double precision, 'J② last_rate = 29.8(소수 % — bigint 아님)');
SELECT ok((SELECT first_limit_ms IS NULL AND team_buy_share IS NULL FROM public.limitup_team_flow
            WHERE date = '20261014' AND isin = 'KR7000000102'), 'J② first_limit_ms · team_buy_share JSON null → null');
SELECT is((SELECT "rows"->>'team_flow' FROM public.limitup_loads WHERE date = '20261014'), '2',
          'J② 이력 rows.team_flow = 2');

-- ③ 더 적은 행으로 재commit → 빠진 isin 이 남지 않는다(날짜 단위 교체)
SELECT pg_temp.st('20261014', 'team_flow', 1, pg_temp.tf('KR7000000102', -50000000, 0.1));
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261014', 'mf-tf-2', 'sig-tf-2', 1, '{"team_flow":1}') $$,
                'J③ team_flow 1행 재commit 성공');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261014'), 1, 'J③ 2 → 1행');
SELECT is((SELECT isin FROM public.limitup_team_flow WHERE date = '20261014'), 'KR7000000102', 'J③ 남은 행 = 재commit 행');
SELECT is((SELECT "rows"->>'team_flow' FROM public.limitup_loads WHERE date = '20261014'), '1', 'J③ 이력 rows.team_flow = 1');

-- ④ team_flow 0 → 그 날짜 비움 · 이력 키 0
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261014', 'mf-tf-3', 'sig-tf-3', 1, '{"team_flow":0}') $$,
                'J④ team_flow 0 commit 성공(파일 없는 날짜 — D-02)');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261014'), 0, 'J④ 그 날짜 0행');
SELECT ok((SELECT "rows" ? 'team_flow' FROM public.limitup_loads WHERE date = '20261014'), 'J④ 이력 rows 에 team_flow 키 있음');
SELECT is((SELECT "rows"->>'team_flow' FROM public.limitup_loads WHERE date = '20261014'), '0', 'J④ 이력 rows.team_flow = 0');

-- ⑤ 옛 워커 호출 — p_expected 에 team_flow 키 없음 → 통과 · 그날 team_flow 비움 · 이력에 키 없음(Pitfall 1)
SELECT pg_temp.st('20261013', 'team_flow', 1, pg_temp.tf('KR7000000103', 7, 0.3));
SELECT public.limitup_commit_day('20261013', 'mf-tf-4', 'sig-tf-4', 1, '{"team_flow":1}');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261013'), 1, 'J⑤ 준비 — 20261013 team_flow 1행');
SELECT pg_temp.st('20261013', 'entries', 1, '{"isin":"KR7000000103","name":"옛워커","schema_version":1}');
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261013', 'mf-tf-5', 'sig-tf-5', 1,
  '{"entries":1,"locks":0,"jumps":0,"member_alloc":0,"facts":0,"touches":0,"grid_summary":0,"member_daily":0}') $$,
                'J⑤ 옛 워커 호출(8키 · team_flow 키 없음 · stage 6표만) 통과');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261013'), 0,
          'J⑤ 옛 워커 commit 이 그날 team_flow 를 지운다(날짜 교체 — D-02)');
SELECT ok((SELECT NOT ("rows" ? 'team_flow') FROM public.limitup_loads WHERE date = '20261013'),
          'J⑤ 이력 rows 에 team_flow 키 없음(새 워커가 다음 run 에 재적재를 감지 — D-03)');
SELECT is((SELECT count(*)::int FROM public.limitup_loads l, jsonb_object_keys(l."rows") k WHERE l.date = '20261013'), 8,
          'J⑤ 이력 rows 키 8개(옛 8표)');
SELECT is((SELECT "rows"->>'entries' FROM public.limitup_loads WHERE date = '20261013'), '1', 'J⑤ 이력 rows.entries = 1');

-- ⑥ stage 2 · 기대 1 → 대조 실패 예외 · 아무것도 바뀌지 않음
SELECT pg_temp.st('20261012', 'team_flow', 1, pg_temp.tf('KR7000000104', 1, 0.1));
SELECT pg_temp.st('20261012', 'team_flow', 2, pg_temp.tf('KR7000000105', 2, 0.2));
SELECT throws_like($$ SELECT public.limitup_commit_day('20261012', 'mf-tf-6', 'sig-tf-6', 1, '{"team_flow":1}') $$,
                   '%20261012 team_flow stage 2 expected 1%', 'J⑥ team_flow stage 2 ≠ 기대 1 → 예외');
SELECT is((SELECT count(*)::int FROM public.limitup_team_flow WHERE date = '20261012'), 0, 'J⑥ 예외 뒤 team_flow 0행');
SELECT is(public.limitup_stage_clear('20261012'), 2, 'J⑥ 예외 뒤 stage 2행 그대로(stage_clear 가 2행)');

-- ⑦ 보존 정리 — cutoff 이전 team_flow 삭제 · 반환에 team_flow 키
--   (d89 에는 H 의 「commit 뒤 남은 stage」 entries 1행이 있다 — 먼저 비운다)
SELECT public.limitup_stage_clear(pg_temp.dd('d91'));
SELECT public.limitup_stage_clear(pg_temp.dd('d89'));
SELECT pg_temp.st(pg_temp.dd('d91'), 'team_flow', 1, pg_temp.tf('KR7000000106', 1, 0.1));
SELECT public.limitup_commit_day(pg_temp.dd('d91'), 'mf', 'sig-tf-d91', 1, '{"team_flow":1}');
SELECT pg_temp.st(pg_temp.dd('d89'), 'team_flow', 1, pg_temp.tf('KR7000000106', 1, 0.1));
SELECT public.limitup_commit_day(pg_temp.dd('d89'), 'mf', 'sig-tf-d89', 1, '{"team_flow":1}');
INSERT INTO t_res SELECT 'purge-tf', public.limitup_purge_old(90, 30);
SELECT ok((SELECT r->'deleted' ? 'team_flow' FROM t_res WHERE label = 'purge-tf'), 'J⑦ purge 반환 deleted 에 team_flow 키');
SELECT is((SELECT r #>> '{deleted,team_flow}' FROM t_res WHERE label = 'purge-tf'), '1', 'J⑦ deleted.team_flow = 1(d91)');
SELECT is(pg_temp.cnt('limitup_team_flow', pg_temp.dd('d91')), 0, 'J⑦ limitup_team_flow 91일 전 삭제');
SELECT is(pg_temp.cnt('limitup_team_flow', pg_temp.dd('d89')), 1, 'J⑦ limitup_team_flow 89일 전 남김');

-- ⑧ Pitfall 2 — CREATE OR REPLACE 뒤에도 statement_timeout 120s
SELECT ok((SELECT proconfig FROM pg_proc
            WHERE oid = 'public.limitup_commit_day(text,text,text,integer,jsonb)'::regprocedure)
          @> ARRAY['statement_timeout=120s'], 'J⑧ limitup_commit_day proconfig statement_timeout=120s 보존');

-- ⑨ 열 타입 · PK
SELECT col_type_is('public', 'limitup_team_flow', c.col, c.typ, 'J⑨ 열 타입 ' || c.col || ' = ' || c.typ)
  FROM (VALUES ('team_buy_share', 'double precision'), ('reach_team_share', 'double precision'),
               ('last_rate', 'double precision'), ('high_rate', 'double precision'),
               ('value', 'bigint'), ('volume', 'bigint'), ('team_net_val', 'bigint'), ('first_limit_ms', 'bigint'),
               ('payload', 'jsonb'), ('first_limit_auction', 'boolean')) AS c(col, typ)
 ORDER BY c.col;
SELECT col_is_pk('public', 'limitup_team_flow', ARRAY['date', 'isin'], 'J⑨ PK (date, isin)');

-- ⑩ 잠금(D-06) — RLS 활성 · 정책 0 · anon/authenticated 불가 · service_role 4권한
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.limitup_team_flow'::regclass), 'J⑩ limitup_team_flow RLS 활성');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'limitup_team_flow'), 0,
          'J⑩ limitup_team_flow 정책 0개(읽기는 서버 RPC 뿐)');
SELECT is(has_table_privilege(r.role, 'public.limitup_team_flow', r.priv), r.expect,
          format('J⑩ %s %s limitup_team_flow = %s', r.role, r.priv, r.expect))
  FROM (VALUES ('anon', 'SELECT', false), ('anon', 'INSERT', false),
               ('authenticated', 'SELECT', false), ('authenticated', 'INSERT', false),
               ('service_role', 'SELECT', true), ('service_role', 'INSERT', true),
               ('service_role', 'UPDATE', true), ('service_role', 'DELETE', true)) AS r(role, priv, expect)
 ORDER BY r.role, r.priv;

-- ── K. Phase 34 accum_flow — 20261020200000_limitup_accum_flow.sql ───────────
-- 잠그는 것: stage CHECK 10값 · 10번째 쌍(payload 중첩 그대로 · *_rate double · since_date 문자열 · null 열) · 이력 키는
-- p_expected 에 있을 때만(옛 워커 호출은 키 없음 · 그날 limitup_accum_flow 는 비움 — Pitfall 1 · D-01 · D-02) ·
-- 날짜 단위 교체 · 대조 실패 원자성 · purge(90일) · statement_timeout 재진술(Pitfall 2) · 열 타입 · PK · 잠금.
-- J⑤ 의 「옛 워커 호출 rows 키 8개」 단언은 그대로 — accum_flow 키도 키가 있을 때만 쓰므로 8개가 유지된다.
-- accum_flow export 행 — 평평한 36열(date 는 st 가 싣는다) + payload 중첩(price · orders · buckets · day_cum_net · pnl · cycles).
CREATE FUNCTION pg_temp.af(p_isin text, p_pos bigint, p_rate double precision) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'isin', p_isin, 'short_code', substr(p_isin, 4, 6), 'name', '매집' || right(p_isin, 2), 'market', 'KOSDAQ',
    'base', 10000, 'upper', 13000, 'last_px', 12978, 'last_rate', p_rate, 'high_px', 13000, 'high_rate', 30.0,
    'state', 1, 'end_reason', 0, 'cycle', 1, 'carry_days', 2, 'since_date', '20261009',
    'reg_time_ms', 1792200000000, 'end_time_ms', NULL, 'our_excluded_qty', 0, 'mcap_krw', 120000000000,
    'th_net_krw', 100000000, 'th_same', 5, 'th_mcap_krw', 300000000000,
    'pos_buy_qty', 20000, 'pos_buy_krw', 250000000, 'pos_sell_qty', 5000, 'pos_sell_krw', 70000000,
    'pos_net_krw', p_pos, 'pos_avg_px', 12500, 'pos_peak_net_krw', 200000000, 'pos_reg_px', 11000,
    'day_buy_krw', 90000000, 'day_sell_krw', 30000000, 'day_net_krw', 60000000,
    'day_buy_qty', 7000, 'day_sell_qty', 2300, 'schema_version', 1,
    'payload', jsonb_build_object(
      'price', jsonb_build_object('step_s', 10, 't0_ms', 1792200000000, 'px', jsonb_build_array(12000, 12978)),
      'orders', jsonb_build_array(jsonb_build_object('t_ms', 1792200100000, 'side', 'B', 'px', 12500, 'qty', 100)),
      'buckets', jsonb_build_array(jsonb_build_object('key', 54, 'start', '09:00', 'net_krw', 1250000)),
      'day_cum_net', jsonb_build_array(0, 60000000),
      'pnl', jsonb_build_object('buy_val', 250000000, 'sell_val', 70000000, 'ret', 0.012),
      'cycles', jsonb_build_array(jsonb_build_object('cycle', 1, 'state', 1, 'since_date', '20261009'))))
$$;

-- ① stage CHECK — accum_flow 허용 · 목록 밖 값은 23514
SELECT lives_ok($$ SELECT pg_temp.st('20261020', 'accum_flow', 1, pg_temp.af('KR7000000201', 1, 29.78)) $$,
                'K① limitup_stage tbl accum_flow 허용(CHECK 10값)');
SELECT throws_ok($$ SELECT pg_temp.st('20261020', 'accum_bogus', 1, '{}') $$, '23514', NULL,
                 'K① limitup_stage tbl accum_bogus → 23514(check_violation)');
SELECT is(public.limitup_stage_clear('20261020'), 1, 'K① stage_clear 가 accum_flow stage 1행을 지운다');

-- ② p_expected accum_flow 2 → 2행 · payload 중첩 · double · since_date 문자열 · null 열 · 이력 키
SELECT pg_temp.st('20261021', 'accum_flow', 1, pg_temp.af('KR7000000201', 500000000, 29.78));
SELECT pg_temp.st('20261021', 'accum_flow', 2, pg_temp.af('KR7000000202', NULL, NULL) - 'name');
INSERT INTO t_res SELECT 'af1', public.limitup_commit_day('20261021', 'mf-af-1', 'sig-af-1', 1, '{"accum_flow":2}');
SELECT is((SELECT r #>> '{rows,accum_flow}' FROM t_res WHERE label = 'af1'), '2', 'K② commit 반환 rows.accum_flow = 2');
SELECT is((SELECT count(*)::int FROM public.limitup_accum_flow WHERE date = '20261021'), 2, 'K② limitup_accum_flow 2행');
SELECT is((SELECT payload #>> '{price,step_s}' FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000201'),
          '10', 'K② payload.price.step_s 중첩 그대로');
SELECT is((SELECT payload #>> '{cycles,0,since_date}' FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000201'),
          '20261009', 'K② payload.cycles[0].since_date 중첩 그대로');
SELECT is((SELECT last_rate FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000201'),
          29.78::double precision, 'K② last_rate = 29.78(double precision — bigint 아님)');
SELECT is((SELECT high_rate FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000201'),
          30.0::double precision, 'K② high_rate = 30.0(double precision)');
SELECT is((SELECT since_date FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000201'),
          '20261009', 'K② since_date "20261009" 문자열 그대로(앞 0 · 숫자 변환 없음)');
SELECT ok((SELECT end_time_ms IS NULL AND name IS NULL AND pos_net_krw IS NULL AND last_rate IS NULL
             FROM public.limitup_accum_flow WHERE date = '20261021' AND isin = 'KR7000000202'),
          'K② end_time_ms · pos_net_krw · last_rate JSON null · name 키 없음 → null');
SELECT is((SELECT "rows"->>'accum_flow' FROM public.limitup_loads WHERE date = '20261021'), '2',
          'K② 이력 rows.accum_flow = 2');

-- ③ 이력 rows 에 accum_flow 키(새 워커 호출)
SELECT ok((SELECT "rows" ? 'accum_flow' FROM public.limitup_loads WHERE date = '20261021'), 'K③ 이력 rows 에 accum_flow 키 있음');

-- ④ 옛 워커 호출 — p_expected 에 accum_flow 키 없음 · stage 0 → 통과 · 그날 accum_flow 비움 · 이력에 키 없음(Pitfall 1)
SELECT pg_temp.st('20261022', 'accum_flow', 1, pg_temp.af('KR7000000203', 7, 29.0));
SELECT public.limitup_commit_day('20261022', 'mf-af-2', 'sig-af-2', 1, '{"accum_flow":1}');
SELECT is((SELECT count(*)::int FROM public.limitup_accum_flow WHERE date = '20261022'), 1, 'K④ 준비 — 20261022 accum_flow 1행');
SELECT pg_temp.st('20261022', 'entries', 1, '{"isin":"KR7000000203","name":"옛워커","schema_version":1}');
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261022', 'mf-af-3', 'sig-af-3', 1,
  '{"entries":1,"locks":0,"jumps":0,"member_alloc":0,"facts":0,"touches":0,"grid_summary":0,"member_daily":0}') $$,
                'K④ 옛 워커 호출(8키 · accum_flow 키 없음 · stage 6표만) 통과');
SELECT is((SELECT count(*)::int FROM public.limitup_accum_flow WHERE date = '20261022'), 0,
          'K④ 옛 워커 commit 이 그날 accum_flow 를 지운다(날짜 교체 — D-02)');
SELECT ok((SELECT NOT ("rows" ? 'accum_flow') FROM public.limitup_loads WHERE date = '20261022'),
          'K④ 이력 rows 에 accum_flow 키 없음(새 워커가 다음 run 에 재적재를 감지)');
SELECT is((SELECT count(*)::int FROM public.limitup_loads l, jsonb_object_keys(l."rows") k WHERE l.date = '20261022'), 8,
          'K④ 이력 rows 키 8개(옛 8표 — team_flow · accum_flow 없음)');

-- ⑤ 더 적은 행으로 재commit → 빠진 isin 이 남지 않는다(2 → 1)
SELECT pg_temp.st('20261021', 'accum_flow', 1, pg_temp.af('KR7000000202', 1000, 12.5));
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261021', 'mf-af-4', 'sig-af-4', 1, '{"accum_flow":1}') $$,
                'K⑤ accum_flow 1행 재commit 성공');
SELECT is((SELECT count(*)::int FROM public.limitup_accum_flow WHERE date = '20261021'), 1, 'K⑤ 2 → 1행');
SELECT is((SELECT isin FROM public.limitup_accum_flow WHERE date = '20261021'), 'KR7000000202', 'K⑤ 남은 행 = 재commit 행');
SELECT is((SELECT "rows"->>'accum_flow' FROM public.limitup_loads WHERE date = '20261021'), '1', 'K⑤ 이력 rows.accum_flow = 1');

-- ⑥ stage 2 · 기대 1 → 대조 실패 예외 · 그 날짜 accum_flow · stage 그대로(원자성)
SELECT pg_temp.st('20261023', 'accum_flow', 1, pg_temp.af('KR7000000204', 1, 1.0));
SELECT public.limitup_commit_day('20261023', 'mf-af-5', 'sig-af-5', 1, '{"accum_flow":1}');
SELECT pg_temp.st('20261023', 'accum_flow', 1, pg_temp.af('KR7000000205', 1, 1.0));
SELECT pg_temp.st('20261023', 'accum_flow', 2, pg_temp.af('KR7000000206', 2, 2.0));
SELECT throws_like($$ SELECT public.limitup_commit_day('20261023', 'mf-af-6', 'sig-af-6', 1, '{"accum_flow":1}') $$,
                   '%20261023 accum_flow stage 2 expected 1%', 'K⑥ accum_flow stage 2 ≠ 기대 1 → 예외');
SELECT is((SELECT array_agg(isin ORDER BY isin) FROM public.limitup_accum_flow WHERE date = '20261023'),
          ARRAY['KR7000000204'], 'K⑥ 예외 뒤 그 날짜 accum_flow 그대로(이전 commit 1행)');
SELECT is((SELECT "rows"->>'accum_flow' FROM public.limitup_loads WHERE date = '20261023'), '1',
          'K⑥ 예외 뒤 이력 rows.accum_flow 그대로 1');
SELECT is(public.limitup_stage_clear('20261023'), 2, 'K⑥ 예외 뒤 stage 2행 그대로(stage_clear 가 2행)');

-- ⑦ 보존 정리 — cutoff 이전 accum_flow 삭제 · 89일 전 남김 · 반환에 accum_flow 키
SELECT public.limitup_stage_clear(pg_temp.dd('d91'));
SELECT public.limitup_stage_clear(pg_temp.dd('d89'));
SELECT pg_temp.st(pg_temp.dd('d91'), 'accum_flow', 1, pg_temp.af('KR7000000207', 1, 1.0));
SELECT public.limitup_commit_day(pg_temp.dd('d91'), 'mf', 'sig-af-d91', 1, '{"accum_flow":1}');
SELECT pg_temp.st(pg_temp.dd('d89'), 'accum_flow', 1, pg_temp.af('KR7000000207', 1, 1.0));
SELECT public.limitup_commit_day(pg_temp.dd('d89'), 'mf', 'sig-af-d89', 1, '{"accum_flow":1}');
INSERT INTO t_res SELECT 'purge-af', public.limitup_purge_old(90, 30);
SELECT ok((SELECT r->'deleted' ? 'accum_flow' FROM t_res WHERE label = 'purge-af'), 'K⑦ purge 반환 deleted 에 accum_flow 키');
SELECT is((SELECT r #>> '{deleted,accum_flow}' FROM t_res WHERE label = 'purge-af'), '1', 'K⑦ deleted.accum_flow = 1(d91)');
SELECT is(pg_temp.cnt('limitup_accum_flow', pg_temp.dd('d91')), 0, 'K⑦ limitup_accum_flow 91일 전 삭제');
SELECT is(pg_temp.cnt('limitup_accum_flow', pg_temp.dd('d89')), 1, 'K⑦ limitup_accum_flow 89일 전 남김');

-- ⑧ Pitfall 2 — 두 번째 CREATE OR REPLACE(20261020200000) 뒤에도 statement_timeout 120s
SELECT ok((SELECT proconfig FROM pg_proc
            WHERE oid = 'public.limitup_commit_day(text,text,text,integer,jsonb)'::regprocedure)
          @> ARRAY['statement_timeout=120s'], 'K⑧ limitup_commit_day proconfig statement_timeout=120s 보존(Phase 34 재정의 뒤)');

-- ⑨ 열 타입 · PK
SELECT col_type_is('public', 'limitup_accum_flow', c.col, c.typ, 'K⑨ 열 타입 ' || c.col || ' = ' || c.typ)
  FROM (VALUES ('last_rate', 'double precision'), ('high_rate', 'double precision'),
               ('state', 'integer'), ('end_reason', 'integer'), ('cycle', 'integer'), ('carry_days', 'integer'),
               ('schema_version', 'integer'), ('since_date', 'text'), ('th_same', 'bigint'), ('th_mcap_krw', 'bigint'),
               ('payload', 'jsonb')) AS c(col, typ)
 ORDER BY c.col;
SELECT col_is_pk('public', 'limitup_accum_flow', ARRAY['date', 'isin'], 'K⑨ PK (date, isin)');

-- ⑩ 잠금 — RLS 활성 · 정책 0 · anon/authenticated 불가 · service_role 4권한
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.limitup_accum_flow'::regclass), 'K⑩ limitup_accum_flow RLS 활성');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'limitup_accum_flow'), 0,
          'K⑩ limitup_accum_flow 정책 0개(읽기는 서버 RPC 뿐)');
SELECT is(has_table_privilege(r.role, 'public.limitup_accum_flow', r.priv), r.expect,
          format('K⑩ %s %s limitup_accum_flow = %s', r.role, r.priv, r.expect))
  FROM (VALUES ('anon', 'SELECT', false), ('anon', 'INSERT', false),
               ('authenticated', 'SELECT', false), ('authenticated', 'INSERT', false),
               ('service_role', 'SELECT', true), ('service_role', 'INSERT', true),
               ('service_role', 'UPDATE', true), ('service_role', 'DELETE', true)) AS r(role, priv, expect)
 ORDER BY r.role, r.priv;

-- ── L. quick-261025-uf2 accum_flow 당일 축 4열 — 20261025200000 ──────────────
-- 잠그는 것: commit 의 accum_flow INSERT(열 목록 없는 jsonb_populate_record 행 타입 위치 대응)가 본문 무변경으로
-- 새 4열을 싣는다 — 301 = 새 4키(30억 = int4 초과) · 302 = 키 없음(옛 export) · 303 = 4키 JSON null.
SELECT pg_temp.st('20261024', 'accum_flow', 1, pg_temp.af('KR7000000301', 500000000, 29.78)
  || '{"pos_day_buy_krw":3000000000,"pos_day_sell_krw":1200000000,"th_recent_pieces":30,"th_recent_sec":60}'::jsonb);
SELECT pg_temp.st('20261024', 'accum_flow', 2, pg_temp.af('KR7000000302', 1000, 12.5));
SELECT pg_temp.st('20261024', 'accum_flow', 3, pg_temp.af('KR7000000303', 2000, 1.0)
  || '{"pos_day_buy_krw":null,"pos_day_sell_krw":null,"th_recent_pieces":null,"th_recent_sec":null}'::jsonb);

-- ① commit 성공(3행)
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261024', 'mf-af-l', 'sig-af-l', 1, '{"accum_flow":3}') $$,
                'L① 당일 축 4키 실린 stage 3행 commit 성공');

-- ② 301 — 새 4키가 같은 이름 열로 그대로(30억 = bigint)
SELECT is((SELECT pos_day_buy_krw FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000301'),
          3000000000::bigint, 'L② pos_day_buy_krw = 3000000000(int4 초과 금액 그대로)');
SELECT is((SELECT pos_day_sell_krw FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000301'),
          1200000000::bigint, 'L② pos_day_sell_krw = 1200000000');
SELECT is((SELECT th_recent_pieces FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000301'),
          30, 'L② th_recent_pieces = 30');
SELECT is((SELECT th_recent_sec FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000301'),
          60, 'L② th_recent_sec = 60');

-- ③ 302(키 없음 — 옛 export) · 303(JSON null) → 네 열 NULL
SELECT ok((SELECT pos_day_buy_krw IS NULL AND pos_day_sell_krw IS NULL AND th_recent_pieces IS NULL AND th_recent_sec IS NULL
             FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000302'),
          'L③ 4키 없는 옛 export 행 → 네 열 NULL');
SELECT ok((SELECT pos_day_buy_krw IS NULL AND pos_day_sell_krw IS NULL AND th_recent_pieces IS NULL AND th_recent_sec IS NULL
             FROM public.limitup_accum_flow WHERE date = '20261024' AND isin = 'KR7000000303'),
          'L③ 4키 JSON null 행 → 네 열 NULL');

-- ④ 열 타입
SELECT col_type_is('public', 'limitup_accum_flow', c.col, c.typ, 'L④ 열 타입 ' || c.col || ' = ' || c.typ)
  FROM (VALUES ('pos_day_buy_krw', 'bigint'), ('pos_day_sell_krw', 'bigint'),
               ('th_recent_pieces', 'integer'), ('th_recent_sec', 'integer')) AS c(col, typ)
 ORDER BY c.col;

-- ── M. quick-261026-0ty accum_flow pos_day_avg_px — 20261026120000 ───────────
-- 잠그는 것: commit 본문 무변경(위치 대응)으로 새 열을 싣는다 — 311 = 14280 · 312 = 0(당일 매수 없음 — NULL 아님) ·
-- 313 = 키 없음(옛 export) · 314 = JSON null.
SELECT pg_temp.st('20261025', 'accum_flow', 1, pg_temp.af('KR7000000311', 500000000, 29.78) || '{"pos_day_avg_px":14280}'::jsonb);
SELECT pg_temp.st('20261025', 'accum_flow', 2, pg_temp.af('KR7000000312', 1000, 12.5) || '{"pos_day_avg_px":0}'::jsonb);
SELECT pg_temp.st('20261025', 'accum_flow', 3, pg_temp.af('KR7000000313', 2000, 1.0));
SELECT pg_temp.st('20261025', 'accum_flow', 4, pg_temp.af('KR7000000314', 3000, 2.0) || '{"pos_day_avg_px":null}'::jsonb);

-- ① commit 성공(4행)
SELECT lives_ok($$ SELECT public.limitup_commit_day('20261025', 'mf-af-m', 'sig-af-m', 1, '{"accum_flow":4}') $$,
                'M① pos_day_avg_px 실린 stage 4행 commit 성공');

-- ② 311 — 값 그대로
SELECT is((SELECT pos_day_avg_px FROM public.limitup_accum_flow WHERE date = '20261025' AND isin = 'KR7000000311'),
          14280::bigint, 'M② pos_day_avg_px = 14280');
-- ③ 312 — 0 은 0(NULL 아님 · 당일 매수 없음)
SELECT is((SELECT pos_day_avg_px FROM public.limitup_accum_flow WHERE date = '20261025' AND isin = 'KR7000000312'),
          0::bigint, 'M③ pos_day_avg_px = 0(NULL 아님)');
-- ④ 313(키 없음 — 옛 export) · 314(JSON null) → NULL
SELECT ok((SELECT pos_day_avg_px IS NULL FROM public.limitup_accum_flow WHERE date = '20261025' AND isin = 'KR7000000313'),
          'M④ 키 없는 옛 export 행 → pos_day_avg_px NULL');
SELECT ok((SELECT pos_day_avg_px IS NULL FROM public.limitup_accum_flow WHERE date = '20261025' AND isin = 'KR7000000314'),
          'M④ JSON null 행 → pos_day_avg_px NULL');

-- ⑤ 열 타입
SELECT col_type_is('public', 'limitup_accum_flow', 'pos_day_avg_px', 'bigint', 'M⑤ 열 타입 pos_day_avg_px = bigint');

SELECT * FROM finish();
ROLLBACK;
