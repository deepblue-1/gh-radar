-- ============================================================
-- quick 261112-tlw — launch_orders_for_admin 응답 fills 키(개장차익 체결 저널 행) pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261112400000_launch_orders_openarb_fills.sql
--
-- 잠그는 것:
--   - 빈 상태: 행 0 → {dates:[], date:null, heads:[], pieces:[], fills:[]}.
--   - fills = 그 날 dma_journal_events 의 origin 'OpenArb' · notice_type 'E' · exec_qty > 0 행만
--     (접수 통보 A · exec_qty 0 · 다른 출처 Manual · 다른 날짜는 빠진다).
--   - 순서 = (gateway, gw_time, journal_epoch, seq) — gw_time 이 이른 행이 seq 가 커도 먼저 · 같은 gw_time 은 seq 순 ·
--     gateway 가 먼저(KB120 < KYOBO119 — gw_time 이 더 늦어도).
--   - 원소 모양 = 10키(account · dma_user_id · exchange · gateway · isin · price · qty · side · stock_code · stock_name) ·
--     price/qty 는 jsonb number · stocks 에 없는 isin 은 stock_code/stock_name JSON null.
--   - p_date 로 다른 날짜를 주면 그 날 체결만 · dates 는 조각 기준 그대로 · p_date 형식 오류 22023.
--   - 권한: EXECUTE (anon, authenticated, service_role) = (f, f, t).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_orders_openarb_fills.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (날짜, 서버, 기대) 튜플을 적는다. 픽스처 날짜 2026-11-12 · 2026-11-11 · 계좌 문자열은 가짜(TLW-ACC1 …).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

-- ── 1. 빈 상태 ─────────────────────────────────────────────────
SELECT is(
  public.launch_orders_for_admin(),
  '{"dates":[],"date":null,"heads":[],"pieces":[],"fills":[]}'::jsonb,
  '(—, —, 빈 표) launch_orders_for_admin() = {dates:[], date:null, heads:[], pieces:[], fills:[]}'
);

-- ── 픽스처 ─────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('TLW001', 'TLW테스트', 'KOSDAQ', 'KR7TLW000001')
ON CONFLICT DO NOTHING;

-- 조각: 날짜 목록(dates)용 — 11/12 · 11/11 각 1행
INSERT INTO public.launch_pieces
  (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, side, order_no, sent_rel_us, result,
   isin, price, qty, account, source)
VALUES
  ('2026-11-12', 'KB120', 'A', 'KRX', '09:00:27', 'Q', 0, 'buy', NULL, 100, '접수', 'KR7TLW000001', 1000, 10, 'TLW-ACC1', 'backfill'),
  ('2026-11-11', 'KB120', 'A', 'KRX', '09:00:27', 'Q', 0, 'buy', NULL, 100, '접수', 'KR7TLW000001', 1000, 10, 'TLW-ACC1', 'backfill');

-- 체결 저널: 포함 5행(KB120 seq 1 · 4 · 2 · 3 · KYOBO119 seq 1) · 제외 4행(KB120 seq 5 ~ 8)
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side, order_no,
                                       notice_type, origin, dma_user_id, exchange, exec_price, exec_qty) VALUES
  ('KB120',    'ep-tlw', 1, '2026-11-12', '2026-11-12 09:00:27.100+09', 'TLW-ACC1', 'KR7TLW000001', 'B', 'TLW-O1', 'E', 'OpenArb', 'u1', 'KRX', 1000, 10),
  ('KB120',    'ep-tlw', 4, '2026-11-12', '2026-11-12 09:00:30.100+09', 'TLW-ACC1', 'KR7TLW000002', 'B', 'TLW-O4', 'E', 'OpenArb', '',   'NXT',  500,  3),
  ('KB120',    'ep-tlw', 2, '2026-11-12', '2026-11-12 09:00:30.200+09', 'TLW-ACC1', 'KR7TLW000001', 'S', 'TLW-O2', 'E', 'OpenArb', '',   'NXT', 1009,  6),
  ('KB120',    'ep-tlw', 3, '2026-11-12', '2026-11-12 09:00:30.200+09', 'TLW-ACC1', 'KR7TLW000001', 'S', 'TLW-O2', 'E', 'OpenArb', '',   'NXT', 1010,  4),
  ('KYOBO119', 'ep-tlw', 1, '2026-11-12', '2026-11-12 09:00:27.050+09', 'TLW-ACC9', 'KR7TLW000001', 'B', 'TLW-O9', 'E', 'OpenArb', '',   'KRX', 2000,  7),
  -- 제외: 접수 통보 A · exec_qty 0 · 다른 출처 Manual · 다른 날짜
  ('KB120',    'ep-tlw', 5, '2026-11-12', '2026-11-12 09:00:27.000+09', 'TLW-ACC1', 'KR7TLW000001', 'B', 'TLW-O1', 'A', 'OpenArb', '',   'KRX', 1000, 10),
  ('KB120',    'ep-tlw', 6, '2026-11-12', '2026-11-12 09:00:30.150+09', 'TLW-ACC1', 'KR7TLW000001', 'S', 'TLW-O2', 'E', 'OpenArb', '',   'NXT', 1009,  0),
  ('KB120',    'ep-tlw', 7, '2026-11-12', '2026-11-12 09:00:30.150+09', 'TLW-ACC1', 'KR7TLW000001', 'S', 'TLW-O7', 'E', 'Manual',  '',   'NXT', 1012,  2),
  ('KB120',    'ep-tlw', 8, '2026-11-11', '2026-11-11 09:00:30.000+09', 'TLW-ACC1', 'KR7TLW000001', 'S', 'TLW-O8', 'E', 'OpenArb', '',   'NXT', 1111,  1);

-- ── 2. OpenArb 체결만 ──────────────────────────────────────────
SELECT is(
  jsonb_array_length(public.launch_orders_for_admin('20261112')->'fills'),
  5,
  '(20261112, —, fills 5행) OpenArb · E · exec_qty > 0 · 그 날만(A · qty 0 · Manual · 11/11 제외)'
);

-- ── 3. 체결 순서 ───────────────────────────────────────────────
SELECT is(
  (SELECT string_agg(e->>'gateway' || ':' || (e->>'side') || (e->>'price') || 'x' || (e->>'qty'), ',' ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261112')->'fills') WITH ORDINALITY AS t(e, o)),
  'KB120:B1000x10,KB120:B500x3,KB120:S1009x6,KB120:S1010x4,KYOBO119:B2000x7',
  '(20261112, KB120 · KYOBO119, 순서) gateway → gw_time → journal_epoch → seq'
);
SELECT is(
  public.launch_orders_for_admin()->>'date',
  '20261112',
  '(—, —, 기본 날짜) p_date 없으면 가장 최근 조각 날짜'
);

-- ── 4. 원소 모양 ───────────────────────────────────────────────
SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.launch_orders_for_admin('20261112')->'fills'->0) AS k),
  ARRAY['account','dma_user_id','exchange','gateway','isin','price','qty','side','stock_code','stock_name'],
  '(20261112, KB120, 키 10개) account · dma_user_id · exchange · gateway · isin · price · qty · side · stock_code · stock_name'
);
SELECT is(
  public.launch_orders_for_admin('20261112')->'fills'->0,
  '{"gateway":"KB120","account":"TLW-ACC1","dma_user_id":"u1","isin":"KR7TLW000001","stock_code":"TLW001",
    "stock_name":"TLW테스트","side":"B","exchange":"KRX","price":1000,"qty":10}'::jsonb,
  '(20261112, KB120, 첫 원소) stocks 조인 code · name · account = account_no · dma_user_id · exchange · side 원문'
);
SELECT is(
  (SELECT jsonb_typeof(f->'price') || '/' || jsonb_typeof(f->'qty')
     FROM (SELECT public.launch_orders_for_admin('20261112')->'fills'->0 AS f) x),
  'number/number',
  '(20261112, KB120, 숫자) price · qty 는 jsonb number'
);
SELECT is(
  public.launch_orders_for_admin('20261112')->'fills'->1->'stock_code',
  'null'::jsonb,
  '(20261112, KB120, stocks 없음) stock_code = JSON null'
);
SELECT is(
  public.launch_orders_for_admin('20261112')->'fills'->1->'stock_name',
  'null'::jsonb,
  '(20261112, KB120, stocks 없음) stock_name = JSON null'
);

-- ── 5. 다른 날짜 ───────────────────────────────────────────────
SELECT is(
  public.launch_orders_for_admin('20261111')->'fills',
  '[{"gateway":"KB120","account":"TLW-ACC1","dma_user_id":"","isin":"KR7TLW000001","stock_code":"TLW001",
     "stock_name":"TLW테스트","side":"S","exchange":"NXT","price":1111,"qty":1}]'::jsonb,
  '(20261111, KB120, fills 1행) 그 날 OpenArb 체결만'
);
SELECT is(
  public.launch_orders_for_admin('20261112')->'dates',
  '["20261112","20261111"]'::jsonb,
  '(20261112, —, dates) 조각 기준 날짜 내림차순 그대로'
);

-- ── 6. 형식 오류 · 권한 ─────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.launch_orders_for_admin('2026-11-12')$$,
  '22023',
  NULL,
  '(2026-11-12, —, 22023) p_date 형식 오류는 그대로 22023'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_orders_for_admin(text)', 'EXECUTE')
  )::text,
  '(f,f,t)', '(—, —, 권한) launch_orders_for_admin EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish();
ROLLBACK;
