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
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(163);

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

SELECT * FROM finish();
ROLLBACK;
