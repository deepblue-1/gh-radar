-- ============================================================
-- Phase 36 Plan 07 — 일자별 매매손익 집계 RPC pgTAP (D-17 ~ D-19).
--
-- 대상 마이그레이션: supabase/migrations/20261027210100_dma_pnl_rpcs.sql
--   (dma_pnl_daily_build 내부 조립 · dma_pnl_daily_for_user)
--
-- 잠그는 것:
--   - /me 트레이서: u1 이 계좌 A(KB120) 를 본다 → for_user(u1, A, 10/20 ~ 10/27) 한 호출이 groups 1 · 기간 합 ·
--     일자 최신순 · 일자 합 · 종목 줄(마스터 이름 · 마스터 밖 isin = code/name null · 실현손익 큰 순)을 낸다.
--   - 집계 규칙(D-18): notice_type 'E' 만(접수 A 통보 제외) · 범위 밖 제외 · B/S 금액 = exec_qty × exec_price ·
--     apply_error 행 포함(A6) · 다른 계좌(B) 체결은 p_account_no 로 걸러진다.
--   - 가시성(D-17 ②): 매핑 없는 u2 · 남의 계좌 C · p_user_id NULL = groups [].
--   - T-19-08: /me 응답 dma_user_ids = [] · account_name = null.
--   - 권한: 두 함수 EXECUTE (anon, authenticated, service_role) = (f, f, t).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
--
-- 단언 설명에는 (사용자, 계좌, 기간, 기대) 튜플을 적는다.
-- 계좌: A = 1111150701(u1 의 pnl-u1 · KB120) · B = 1111150702(pnl-u1 · KB120) · C = 1111150703(pnl-x · KB120 — u1 못 봄).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003601', 'pnl-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003602', 'pnl-u2@example.invalid');

INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['pnl-u1', 'pnl-x']) d;
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

CREATE TEMP TABLE t_r (label text PRIMARY KEY, r jsonb);
INSERT INTO t_r VALUES
  ('me',     public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-10-20', '2026-10-27')),
  ('me1d',   public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-10-27', '2026-10-27')),
  ('meB',    public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150702', '2026-10-20', '2026-10-27')),
  ('meC',    public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150703', '2026-10-20', '2026-10-27')),
  ('u2',     public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003602', '1111150701', '2026-10-20', '2026-10-27')),
  ('nulluser', public.dma_pnl_daily_for_user(NULL, '1111150701', '2026-10-20', '2026-10-27')),
  ('empty',  public.dma_pnl_daily_for_user('00000000-0000-4000-8000-000000003601', '1111150701', '2026-09-01', '2026-09-30'));

SELECT plan(21);

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
SELECT ok(
  (SELECT bool_and(NOT p.prosecdef) FROM pg_proc p
    WHERE p.oid IN ('public.dma_pnl_daily_for_user(uuid,text,date,date)'::regprocedure,
                    'public.dma_pnl_daily_build(date,date,text,uuid,text)'::regprocedure)),
  'dma_pnl_daily_for_user · dma_pnl_daily_build 는 SECURITY INVOKER'
);

SELECT * FROM finish();
ROLLBACK;
