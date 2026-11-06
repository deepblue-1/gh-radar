-- ============================================================
-- Phase 39 — 매매진단 「진단 조회」 RPC pgTAP(39-03 Task 1 스모크).
--
-- 대상: 20261106100000_dma_diagnosis_for_user.sql(dma_diagnosis_for_user · 부분 인덱스 1)
--
-- 잠그는 것(SC-2 · SC-5 · D-11):
--   1~3  함수 · 권한 — (uuid, date, text) 시그니처 · anon/authenticated EXECUTE 없음 · service_role 있음
--   4~7  U1 은 자기 가시 계좌의 주문 1 · 체결 1 · 전략 이벤트 2(kind 3 · 예약 kind 9)를 RPC 한 번으로 본다
--   8~10 U2 는 U1 계좌의 주문 · 체결 · 이벤트를 하나도 못 본다(SC-2 — 다른 사용자 계좌 0행)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
--
-- 사용자(역할 · DMA id · 매핑):
--   U1 …3901 trader dma-dg1 → KB120 …3901
--   U2 …3902 trader dma-dg2 → KB120 …3902
-- 날짜 · 종목: 2026-11-05 · KR7282720005(금양그린파워 — stocks 픽스처 없이 문자열만 · stock_code null 허용) · KRX.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(10);

-- ── 픽스처: 사용자 · 계좌 매핑 ─────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003901', 'dg-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003902', 'dg-u2@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-dg1','dma-dg2']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('dg-u1@example.invalid','trader','dma-dg1'),
  ('dg-u2@example.invalid','trader','dma-dg2');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-dg1","account_no":"1234563901","name":"위탁","priority":1},
  {"dma_user_id":"dma-dg2","account_no":"1234563902","name":"위탁","priority":1}
]'::jsonb);

-- ── 픽스처: U1 계좌 주문 1 · 체결 1 · 전략 이벤트 2(kind 3 · kind 9) ──
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price,
                                       filled_qty, status, requester, dma_user_id, first_seq, last_seq, created_at, updated_at) VALUES
  ('KB120', '2026-11-05', '1234563901', '0000390101', 'KR7282720005', 'KRX', 'B', 'N', 100, 12000,
   100, 'filled', 'Manual', 'dma-dg1', 1, 2, '2026-11-05 10:00:00.100+09', '2026-11-05 10:00:00.200+09');

INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin,
                                       side, order_no, notice_type, requester, exchange, exec_price, exec_qty) VALUES
  ('KB120', 'ep-dg', 2, '2026-11-05', '2026-11-05 10:00:00.200+09', 'dma-dg1', '1234563901', 'KR7282720005',
   'B', '0000390101', 'E', 'Manual', 'KRX', 12000, 100);

-- 10:00:00 KST 2026-11-05 = 1793840400000 ms.
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty, order_condition, reason_code) VALUES
  ('KB120', 'ep-dg-s', 1, '2026-11-05', 1793840400050, 3, 'KRX', 'KR7282720005',
   'dma-dg1', '1234563901', '0000390101', 12000, 100, '', ''),
  ('KB120', 'ep-dg-s', 2, '2026-11-05', 1793840400300, 9, 'KRX', 'KR7282720005',
   'dma-dg1', '1234563901', 'Q000390101', 12100, 50, 'milles', 'CfgSubmit');

-- ── 헬퍼 ───────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.dg(p_user uuid, p_isin text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.dma_diagnosis_for_user(p_user, '2026-11-05'::date, p_isin)
$$;

-- ── 1~3. 함수 · 권한(SC-5) ─────────────────────────────────────────
SELECT has_function('public', 'dma_diagnosis_for_user', ARRAY['uuid', 'date', 'text'],
                    '1 dma_diagnosis_for_user(uuid, date, text) 있음');
SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, 'public.dma_diagnosis_for_user(uuid, date, text)', 'EXECUTE'))
                 FROM unnest(ARRAY['anon', 'authenticated']) r),
          '2 anon · authenticated EXECUTE 없음');
SELECT ok(has_function_privilege('service_role', 'public.dma_diagnosis_for_user(uuid, date, text)', 'EXECUTE'),
          '3 service_role EXECUTE 있음');

-- ── 4~7. U1 — 자기 계좌 주문 · 체결 · 이벤트를 RPC 한 번으로 ──────────
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'orders'), 1,
          '4 U1 orders = 1행(자기 KB120 …3901 주문)');
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'fills'), 1,
          '5 U1 fills = 1행(자기 KB120 …3901 체결)');
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'events'), 2,
          '6 U1 events = 2행(kind 3 · 예약 kind 9)');
SELECT ok(jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901'), '$.events[*] ? (@.kind == 9)'),
          '7 U1 events 에 예약 kind 9 가 있다(D-11 — DB 가 kind 9 를 돌려준다)');

-- ── 8~10. U2 — U1 계좌는 0행(SC-2) ─────────────────────────────────
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003902')->'orders'), 0,
          '8 U2 orders = 0행(U1 계좌 주문 안 보임)');
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003902')->'fills'), 0,
          '9 U2 fills = 0행(U1 계좌 체결 안 보임)');
SELECT is(jsonb_array_length(pg_temp.dg('00000000-0000-4000-8000-000000003902')->'events'), 0,
          '10 U2 events = 0행(U1 계좌 kind 3 · kind 9 안 보임)');

SELECT * FROM finish();
ROLLBACK;
