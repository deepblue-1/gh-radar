-- ============================================================
-- Phase 36 Plan 07 — 일자별 매매손익 집계 RPC pgTAP (D-17 ~ D-19).
--
-- 대상 마이그레이션: supabase/migrations/20261027210100_dma_pnl_rpcs.sql
--   (dma_pnl_daily_build 내부 조립 · dma_pnl_daily_for_user · dma_pnl_daily_for_admin)
--
-- 잠그는 것:
--   - /me 트레이서: u1 이 계좌 A(KB120) 를 본다 → for_user(u1, A, 10/20 ~ 10/27) 한 호출이 groups 1 · 기간 합 ·
--     일자 최신순 · 일자 합 · 종목 줄(마스터 이름 · 마스터 밖 isin = code/name null · 실현손익 큰 순)을 낸다.
--   - 집계 규칙(D-18): notice_type 'E' 만(접수 A 통보 제외) · 범위 밖 제외 · B/S 금액 = exec_qty × exec_price ·
--     apply_error 행 포함(A6) · 다른 계좌(B) 체결은 p_account_no 로 걸러진다.
--   - 가시성(D-17 ②): 매핑 없는 u2 · 남의 계좌 C · p_user_id NULL = groups [].
--   - T-19-08: /me 응답 dma_user_ids = [] · account_name = null.
--   - 어드민(D-17 ① · 7~10절 · 기간 10/10 ~ 10/14 — /me 픽스처와 겹치지 않는다):
--       'user'    = dma_user_id 묶음 오름차순 · "" 「미상」 한 묶음 맨 뒤 · accounts = 그 묶음 체결 계좌(distinct) ·
--                   dma_user_ids = [key](미상은 []).
--       'account' = account_no 묶음(KB120 · KB121 에 나뉜 같은 계좌 = 한 묶음 · accounts 2) · KB → 교보 → 계좌번호 ·
--                   account_name = dma_user_accounts.name(비면 null) · dma_user_ids = 그 계좌 체결의 빈 값 아닌 id.
--       1,000,000주 × 30,000원 E 한 건 → buy 30,000,000,000(int4 overflow 없음 — Pitfall 4).
--       p_group 'x' · 'me' · NULL → 22023 예외.
--   - 권한: 세 함수 EXECUTE (anon, authenticated, service_role) = (f, f, t) · SECURITY INVOKER.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
--
-- 단언 설명에는 (사용자, 계좌, 기간, 기대) 튜플을 적는다.
-- 계좌: A = 1111150701(u1 의 pnl-u1 · KB120) · B = 1111150702(pnl-u1 · KB120) · C = 1111150703(pnl-x · KB120 — u1 못 봄).
-- 어드민: D = 2222260001(KB120 · KB121 · 이름 「위탁종합」) · E = 2222260002(KB120 · 이름 없음) · K = 11110001(KYOBO119 · 이름 '').
--         계정 ezmesya · kim01 · ""(미상).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003601', 'pnl-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003602', 'pnl-u2@example.invalid');

INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['pnl-u1', 'pnl-x', 'ezmesya', 'kim01']) d;
-- u2 는 app_users 에 있지만 DMA 연결이 없다(매핑 없음).
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('pnl-u1@example.invalid', 'trader', 'pnl-u1'),
  ('pnl-u2@example.invalid', 'trader', NULL);

INSERT INTO public.dma_account_access (gateway, dma_user_id, account_no, account_name, priority) VALUES
  ('KB120', 'pnl-u1', '1111150701', '위탁A', 1),
  ('KB120', 'pnl-u1', '1111150702', '위탁B', 2),
  ('KB120', 'pnl-x',  '1111150703', '위탁C', 1);

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 저널 이벤트 1행 — 기본 = KB120 · ep-pnl · 체결(E) · 매수 · 계좌 A · 삼성전자 · 0주. p_over 로 덮는다.
CREATE FUNCTION pg_temp.fill(p_seq bigint, p_date date, p_over jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.dma_journal_events (
    gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin, side, notice_type,
    exec_qty, exec_price, fee_krw, tax_krw, realized_pnl_krw, apply_error)
  SELECT coalesce(o->>'gateway', 'KB120'), 'ep-pnl', p_seq, p_date, (p_date::text || ' 10:00:00+09')::timestamptz,
         coalesce(o->>'dma_user_id', 'pnl-u1'), coalesce(o->>'account_no', '1111150701'),
         coalesce(o->>'isin', 'KR7005930003'), coalesce(o->>'side', 'B'), coalesce(o->>'notice_type', 'E'),
         coalesce((o->>'exec_qty')::int, 0), coalesce((o->>'exec_price')::int, 0),
         coalesce((o->>'fee_krw')::bigint, 0), coalesce((o->>'tax_krw')::bigint, 0),
         coalesce((o->>'realized_pnl_krw')::bigint, 0), o->>'apply_error'
    FROM (SELECT p_over AS o) x
$$;

-- 계좌 A
SELECT pg_temp.fill(1, '2026-10-27', '{"side":"B","exec_qty":100,"exec_price":10000,"fee_krw":150}');
SELECT pg_temp.fill(2, '2026-10-27', '{"side":"S","exec_qty":100,"exec_price":11000,"fee_krw":165,"tax_krw":2200,"realized_pnl_krw":99000}');
-- 접수(A) 통보 — 값이 실려 있어도 집계 밖
SELECT pg_temp.fill(3, '2026-10-27', '{"notice_type":"A","exec_qty":10,"exec_price":10000,"fee_krw":999,"realized_pnl_krw":-999}');
-- 마스터 밖 isin · 손실 줄
SELECT pg_temp.fill(4, '2026-10-27', '{"isin":"KR7999999990","exec_qty":10,"exec_price":5000,"fee_krw":10,"realized_pnl_krw":-10}');
-- apply_error 행(투영 실패) — 체결 사실이라 집계에 든다(A6)
SELECT pg_temp.fill(5, '2026-10-26', '{"exec_qty":50,"exec_price":9000,"fee_krw":70,"apply_error":"boom"}');
-- 범위 밖
SELECT pg_temp.fill(6, '2026-10-01', '{"exec_qty":1,"exec_price":1000,"fee_krw":1}');
-- 계좌 B(같은 사용자) · 계좌 C(남의 계좌)
SELECT pg_temp.fill(7, '2026-10-27', '{"account_no":"1111150702","exec_qty":3,"exec_price":1000,"fee_krw":5}');
SELECT pg_temp.fill(8, '2026-10-27', '{"account_no":"1111150703","dma_user_id":"pnl-x","exec_qty":4,"exec_price":1000,"fee_krw":6}');

-- 어드민 픽스처(epoch ep-adm · 10/12 ~ 10/14). 계좌 이름 정본 = dma_user_accounts.name.
INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id) VALUES
  ('ezmesya', 'KB',    '2222260001', '위탁종합', '00001', '000001'),
  ('kim01',   'KB',    '2222260001', '',         '00001', '000002'),
  ('ezmesya', 'KYOBO', '11110001',   '',         '',      '');

CREATE FUNCTION pg_temp.afill(p_seq bigint, p_date date, p_gateway text, p_account text, p_user text, p_over jsonb)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.fill(p_seq, p_date,
    jsonb_build_object('gateway', p_gateway, 'account_no', p_account, 'dma_user_id', p_user) || p_over)
$$;

SELECT pg_temp.afill(101, '2026-10-14', 'KB120',    '2222260001', 'ezmesya', '{"exec_qty":10,"exec_price":1000,"fee_krw":1}');
SELECT pg_temp.afill(102, '2026-10-14', 'KB121',    '2222260001', 'kim01',   '{"side":"S","exec_qty":10,"exec_price":1100,"fee_krw":2,"tax_krw":20,"realized_pnl_krw":978}');
SELECT pg_temp.afill(103, '2026-10-13', 'KYOBO119', '11110001',   'ezmesya', '{"exec_qty":5,"exec_price":2000,"fee_krw":3}');
SELECT pg_temp.afill(104, '2026-10-13', 'KB120',    '2222260001', '',        '{"exec_qty":1,"exec_price":1000,"fee_krw":4}');
-- overflow 행: 1,000,000주 × 30,000원 = 300억(int4 최대 약 21억)
SELECT pg_temp.afill(105, '2026-10-12', 'KB120',    '2222260002', 'kim01',   '{"exec_qty":1000000,"exec_price":30000}');
-- 접수 통보(집계 밖)
SELECT pg_temp.afill(106, '2026-10-12', 'KB120',    '2222260002', 'kim01',   '{"notice_type":"A","exec_qty":7,"exec_price":7000}');

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb);
INSERT INTO t_r VALUES
  ('me',     public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-10-20', '2026-10-27')),
  ('me1d',   public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-10-27', '2026-10-27')),
  ('meB',    public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150702', '2026-10-20', '2026-10-27')),
  ('meC',    public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150703', '2026-10-20', '2026-10-27')),
  ('u2',     public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003602', '1111150701', '2026-10-20', '2026-10-27')),
  ('nulluser', public.dma_pnl_daily_for_user(NULL, '1111150701', '2026-10-20', '2026-10-27')),
  ('empty',  public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-09-01', '2026-09-30')),
  ('adm_user',    public.dma_pnl_daily_for_admin('2026-10-10', '2026-10-14', 'user')),
  ('adm_account', public.dma_pnl_daily_for_admin('2026-10-10', '2026-10-14', 'account'));

SELECT plan(39);

-- ── 1. /me 트레이서 — 묶음 · 기간 합 ─────────────────────────────
SELECT is((SELECT jsonb_array_length(r->'groups') FROM t_r WHERE label = 'me'), 1,
  '(u1, A, 10/20~10/27) groups 1개');
SELECT is((SELECT r - 'groups' FROM t_r WHERE label = 'me'), '{"from":"2026-10-20","to":"2026-10-27"}'::jsonb,
  '(u1, A, 10/20~10/27) from · to = 요청 기간(KST 날짜 문자열)');
SELECT is((SELECT r->'groups'->0->>'key' FROM t_r WHERE label = 'me'), '1111150701',
  '(u1, A) 묶음 key = account_no');
SELECT is((SELECT r->'groups'->0->'total' FROM t_r WHERE label = 'me'),
  '{"pnl":98990,"fee":395,"tax":2200,"buy":1500000,"sell":1100000,"fills":4}'::jsonb,
  '(u1, A, 10/20~10/27) total — E 4건(seq 1·2·4·5) · 접수 A(seq 3) · 범위 밖(seq 6) · 계좌 B/C 제외 · apply_error 포함');
SELECT is((SELECT r->'groups'->0->'accounts' FROM t_r WHERE label = 'me'),
  '[{"broker":"KB","gateway":"KB120","account_no":"1111150701"}]'::jsonb,
  '(u1, A) accounts = [{KB, KB120, A}]');
SELECT is((SELECT row(r->'groups'->0->'dma_user_ids', r->'groups'->0->'account_name')::text FROM t_r WHERE label = 'me'),
  '([],null)', '(u1, A) dma_user_ids = [] · account_name = null (T-19-08 — /me 는 DMA 유저 id 비노출)');

-- ── 2. 일자 ─────────────────────────────────────────────────────
SELECT is((SELECT jsonb_path_query_array(r, '$.groups[0].days[*].date') FROM t_r WHERE label = 'me'),
  '["2026-10-27","2026-10-26"]'::jsonb, '(u1, A) days = 10/27 → 10/26 최신순 · 체결 0 인 날 행 없음');
SELECT is((SELECT (r->'groups'->0->'days'->0) - 'stocks' FROM t_r WHERE label = 'me'),
  '{"date":"2026-10-27","pnl":98990,"fee":325,"tax":2200,"buy":1050000,"sell":1100000,"fills":3}'::jsonb,
  '(u1, A, 10/27) 일자 합 — seq 1·2·4');
SELECT is((SELECT (r->'groups'->0->'days'->1) - 'stocks' FROM t_r WHERE label = 'me'),
  '{"date":"2026-10-26","pnl":0,"fee":70,"tax":0,"buy":450000,"sell":0,"fills":1}'::jsonb,
  '(u1, A, 10/26) 일자 합 — apply_error 행 seq 5 포함(A6)');

-- ── 3. 종목 줄 ──────────────────────────────────────────────────
SELECT is((SELECT r->'groups'->0->'days'->0->'stocks'->0 FROM t_r WHERE label = 'me'),
  '{"isin":"KR7005930003","code":"005930","name":"삼성전자","pnl":99000,"buy":1000000,"sell":1100000,"fills":2}'::jsonb,
  '(u1, A, 10/27) stocks[0] = 삼성전자(마스터 이름 · 실현손익 큰 순 첫째)');
SELECT is((SELECT r->'groups'->0->'days'->0->'stocks'->1 FROM t_r WHERE label = 'me'),
  '{"isin":"KR7999999990","code":null,"name":null,"pnl":-10,"buy":50000,"sell":0,"fills":1}'::jsonb,
  '(u1, A, 10/27) stocks[1] = 마스터 밖 isin → code · name null · 손실 −10');
SELECT is((SELECT jsonb_array_length(r->'groups'->0->'days'->1->'stocks') FROM t_r WHERE label = 'me'), 1,
  '(u1, A, 10/26) stocks 1줄');

-- ── 4. 기간 · 계좌 거름 ─────────────────────────────────────────
SELECT is((SELECT jsonb_path_query_array(r, '$.groups[0].days[*].date') FROM t_r WHERE label = 'me1d'),
  '["2026-10-27"]'::jsonb, '(u1, A, 10/27~10/27) 하루 범위 = 그날만');
SELECT is((SELECT r->'groups'->0->'total' FROM t_r WHERE label = 'meB'),
  '{"pnl":0,"fee":5,"tax":0,"buy":3000,"sell":0,"fills":1}'::jsonb,
  '(u1, B, 10/20~10/27) 같은 사용자의 다른 계좌는 그 계좌 체결만(seq 7)');
SELECT is((SELECT r FROM t_r WHERE label = 'empty'),
  '{"from":"2026-09-01","to":"2026-09-30","groups":[]}'::jsonb, '(u1, A, 9월) 체결 0 → groups []');

-- ── 5. 가시성 ───────────────────────────────────────────────────
SELECT is((SELECT r->'groups' FROM t_r WHERE label = 'meC'), '[]'::jsonb,
  '(u1, C=pnl-x 계좌) 남의 계좌 → groups [] (dma_visible_accounts 조인)');
SELECT is((SELECT r->'groups' FROM t_r WHERE label = 'u2'), '[]'::jsonb,
  '(u2 매핑 없음, A) → groups []');
SELECT is((SELECT r->'groups' FROM t_r WHERE label = 'nulluser'), '[]'::jsonb,
  '(p_user_id NULL, A) → groups [] (가시 계좌 없음)');

-- ── 7. 어드민 계정별 ('user') ────────────────────────────────────
SELECT is((SELECT jsonb_path_query_array(r, '$.groups[*].key') FROM t_r WHERE label = 'adm_user'),
  '["ezmesya","kim01",""]'::jsonb, '(admin user, 10/10~10/14) 묶음 = ezmesya → kim01 → 미상("") 맨 뒤');
SELECT is((SELECT r->'groups'->0->'accounts' FROM t_r WHERE label = 'adm_user'),
  '[{"broker":"KB","gateway":"KB120","account_no":"2222260001"},{"broker":"KYOBO","gateway":"KYOBO119","account_no":"11110001"}]'::jsonb,
  '(admin user, ezmesya) accounts = 그 묶음 체결 계좌 distinct · KB → 교보');
SELECT is((SELECT r->'groups'->0->'total' FROM t_r WHERE label = 'adm_user'),
  '{"pnl":0,"fee":4,"tax":0,"buy":20000,"sell":0,"fills":2}'::jsonb, '(admin user, ezmesya) total — seq 101 · 103');
SELECT is((SELECT row(r->'groups'->0->'dma_user_ids', r->'groups'->0->'account_name')::text FROM t_r WHERE label = 'adm_user'),
  row('["ezmesya"]'::jsonb, 'null'::jsonb)::text, '(admin user, ezmesya) dma_user_ids = [key] · account_name = null');
SELECT is((SELECT r->'groups'->1->'accounts' FROM t_r WHERE label = 'adm_user'),
  '[{"broker":"KB","gateway":"KB121","account_no":"2222260001"},{"broker":"KB","gateway":"KB120","account_no":"2222260002"}]'::jsonb,
  '(admin user, kim01) accounts = KB121 D · KB120 E(계좌번호 순)');
SELECT is((SELECT row(r->'groups'->2->'dma_user_ids', r->'groups'->2->'total')::text FROM t_r WHERE label = 'adm_user'),
  row('[]'::jsonb, '{"pnl":0,"fee":4,"tax":0,"buy":1000,"sell":0,"fills":1}'::jsonb)::text,
  '(admin user, 미상) dma_user_ids = [] · total = seq 104 만');

-- ── 8. 어드민 계좌별 ('account') ─────────────────────────────────
SELECT is((SELECT jsonb_path_query_array(r, '$.groups[*].key') FROM t_r WHERE label = 'adm_account'),
  '["2222260001","2222260002","11110001"]'::jsonb, '(admin account) 묶음 = KB D → KB E → 교보 K(KB 먼저 · 계좌번호 순 · 미상 없음)');
SELECT is((SELECT r->'groups'->0->'accounts' FROM t_r WHERE label = 'adm_account'),
  '[{"broker":"KB","gateway":"KB120","account_no":"2222260001"},{"broker":"KB","gateway":"KB121","account_no":"2222260001"}]'::jsonb,
  '(admin account, D) KB120 · KB121 에 나뉜 같은 계좌 = 한 묶음 · accounts 2');
SELECT is((SELECT row(r->'groups'->0->'dma_user_ids', r->'groups'->0->>'account_name')::text FROM t_r WHERE label = 'adm_account'),
  '("[""ezmesya"", ""kim01""]",위탁종합)', '(admin account, D) dma_user_ids = 빈 값 제외 [ezmesya, kim01] · account_name = 위탁종합');
SELECT is((SELECT r->'groups'->0->'total' FROM t_r WHERE label = 'adm_account'),
  '{"pnl":978,"fee":7,"tax":20,"buy":11000,"sell":11000,"fills":3}'::jsonb, '(admin account, D) total — seq 101 · 102 · 104(미상 포함)');
SELECT is((SELECT jsonb_path_query_array(r, '$.groups[0].days[*].date') FROM t_r WHERE label = 'adm_account'),
  '["2026-10-14","2026-10-13"]'::jsonb, '(admin account, D) days 최신순');

-- ── 9. overflow · 이름 없음 ──────────────────────────────────────
SELECT is((SELECT (r->'groups'->1->'total'->>'buy')::bigint FROM t_r WHERE label = 'adm_account'), 30000000000::bigint,
  '(admin account, E) 1,000,000주 × 30,000원 → buy 30,000,000,000 (exec_qty::bigint · 예외 없음 · 접수 seq 106 제외)');
SELECT is((SELECT r->'groups'->1->'account_name' FROM t_r WHERE label = 'adm_account'), 'null'::jsonb,
  '(admin account, E) dma_user_accounts 행 없음 → account_name null');
SELECT is((SELECT row(r->'groups'->2->'accounts'->0->>'broker', r->'groups'->2->'account_name')::text FROM t_r WHERE label = 'adm_account'),
  '(KYOBO,null)', '(admin account, K) broker KYOBO · 이름 빈 값 → account_name null');

-- ── 10. p_group 검증 ─────────────────────────────────────────────
SELECT throws_ok($$SELECT public.dma_pnl_daily_for_admin('2026-10-10', '2026-10-14', 'x')$$, '22023', NULL,
  '(admin, p_group x) → 22023 예외');
SELECT throws_ok($$SELECT public.dma_pnl_daily_for_admin('2026-10-10', '2026-10-14', 'me')$$, '22023', NULL,
  '(admin, p_group me) → 22023 예외(/me 모드는 어드민 경로로 못 연다)');
SELECT throws_ok($$SELECT public.dma_pnl_daily_for_admin('2026-10-10', '2026-10-14', NULL)$$, '22023', NULL,
  '(admin, p_group NULL) → 22023 예외');

-- ── 6. 권한: service_role 전용 ───────────────────────────────────
SELECT is(
  row(has_function_privilege('anon', 'public.dma_pnl_daily_for_user(uuid,text,date,date)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_pnl_daily_for_user(uuid,text,date,date)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_pnl_daily_for_user(uuid,text,date,date)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_pnl_daily_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_pnl_daily_build(date,date,text,uuid,text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_pnl_daily_build(date,date,text,uuid,text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_pnl_daily_build(date,date,text,uuid,text)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_pnl_daily_build EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_pnl_daily_for_admin(date,date,text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_pnl_daily_for_admin(date,date,text)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_pnl_daily_for_admin(date,date,text)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_pnl_daily_for_admin EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT ok(
  (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
    WHERE p.oid IN ('public.dma_pnl_daily_for_user(uuid,text,date,date)'::regprocedure,
                    'public.dma_pnl_daily_build(date,date,text,uuid,text)'::regprocedure,
                    'public.dma_pnl_daily_for_admin(date,date,text)'::regprocedure)),
  '세 함수 모두 SECURITY INVOKER'
);

SELECT * FROM finish();
ROLLBACK;
