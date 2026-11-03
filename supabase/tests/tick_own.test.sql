-- ============================================================
-- Phase 38 Plan 01 — 틱 뷰어 「우리 주문 · 체결」 RPC pgTAP 스모크.
--
-- 대상: 20261104100000_tick_own_for_user.sql(tick_own_for_user · 부분 인덱스 2).
--
-- 잠그는 것(D-01 · D-03 · T-19-08):
--   - 권한: EXECUTE 는 service_role 만(anon · authenticated 0)
--   - 게이트: 가시 계좌(dma_visible_accounts) 없는 사용자 → {"access": false} 만
--   - 가시 계좌만: U1 은 자기 KB120 체결 1행만 본다(U2 체결 안 보임)
--   - 켜진 서버만: U1 의 KB121(enabled=false) 체결은 가시성 뷰에 걸려도 빠진다(Pitfall 6)
--   - servers = enabled 키 sort_order 순 · dma_user_id 키는 어디에도 없다
-- 38-03 이 전체 행렬(어드민 전 계좌 · KB121 켜기 · notice_type/exec_qty 거름 · kind 3·6 · orders · 정렬)로 넓힌다.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-ow1 → KB120 …3801 · KB121 …3811 / U2 dma-ow2 → KB120 …3802 / U3 dma-ow3(자격증명만 · 계좌 매핑 없음).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

-- ── 픽스처: 사용자 · 계좌 매핑 ─────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003801', 'ow-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003802', 'ow-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000003803', 'ow-u3@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-ow1','dma-ow2','dma-ow3']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('ow-u1@example.invalid','trader','dma-ow1'),
  ('ow-u2@example.invalid','trader','dma-ow2'),
  ('ow-u3@example.invalid','trader','dma-ow3');

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-ow1","account_no":"1234563801","name":"위탁","priority":1},
  {"dma_user_id":"dma-ow2","account_no":"1234563802","name":"위탁","priority":1}
]'::jsonb);
-- 가시성 v2 는 꺼진 서버 키도 곱한다 — KB121 매핑이 있으면 U1 가시 계좌에 KB121 행이 생긴다(Pitfall 6).
SELECT public.dma_journal_sync_access('KB121', '[
  {"dma_user_id":"dma-ow1","account_no":"1234563811","name":"위탁","priority":1}
]'::jsonb);

-- ── 픽스처: 2026-10-30 · KR7184230001 · KRX 체결 E 3행 + 주문 이벤트 · 보조 주문(dma_user_id 비반환 대조용) ──
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin,
                                       side, order_no, notice_type, exchange, exec_price, exec_qty) VALUES
  ('KB120', 'ep-own', 1, '2026-10-30', '2026-10-30 13:00:00.130+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380101', 'E', 'KRX', 16400, 300),
  ('KB120', 'ep-own', 2, '2026-10-30', '2026-10-30 13:00:00.210+09', 'dma-ow2', '1234563802', 'KR7184230001',
   'B', '0000380201', 'E', 'KRX', 16400, 500),
  ('KB121', 'ep-own', 1, '2026-10-30', '2026-10-30 13:00:00.310+09', 'dma-ow1', '1234563811', 'KR7184230001',
   'S', '0000381101', 'E', 'KRX', 16450, 10);
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty) VALUES
  ('KB120', 'ep-own-s', 1, '2026-10-30', 1793332800100, 3, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '0000380101', 16400, 300);
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price,
                                       filled_qty, status, dma_user_id, first_seq, last_seq, created_at, updated_at) VALUES
  ('KB120', '2026-10-30', '1234563801', '0000380101', 'KR7184230001', 'KRX', 'B', 'N', 300, 16400,
   300, 'filled', 'dma-ow1', 1, 1, '2026-10-30 13:00:00.100+09', '2026-10-30 13:00:00.130+09');

CREATE FUNCTION pg_temp.own(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.tick_own_for_user(p_user, '20261030', 'KR7184230001', 'KRX')
$$;

-- ── 1~3. 함수 · 권한 ───────────────────────────────────────────────
SELECT has_function('public', 'tick_own_for_user', ARRAY['uuid', 'text', 'text', 'text'],
                    '1 tick_own_for_user(uuid, text, text, text) 있음');
SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, 'public.tick_own_for_user(uuid, text, text, text)', 'EXECUTE'))
                 FROM unnest(ARRAY['anon', 'authenticated']) r),
          '2 anon · authenticated EXECUTE 없음');
SELECT ok(has_function_privilege('service_role', 'public.tick_own_for_user(uuid, text, text, text)', 'EXECUTE'),
          '3 service_role EXECUTE 있음');

-- ── 4. 게이트 ──────────────────────────────────────────────────────
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003803'), '{"access": false}'::jsonb,
          '4 계좌 매핑 없는 U3 → {"access": false} 만');

-- ── 5~7. 가시 계좌만 · 켜진 서버만 ─────────────────────────────────
SELECT is(jsonb_array_length(pg_temp.own('00000000-0000-4000-8000-000000003801')->'fills'), 1,
          '5 U1 fills = 1행(U2 체결 · 꺼진 KB121 체결 제외)');
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003801')->'fills'->0->>'order_no', '0000380101',
          '6 U1 fills[0] = 자기 KB120 주문번호');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003801'),
                                '$.fills[*] ? (@.gateway == "KB121")'),
          '7 KB121(enabled=false) 체결 행 없음 — 가시성 뷰에 걸려도 켜진 서버 조인이 거른다');

-- ── 8~9. servers · dma_user_id 비반환 ──────────────────────────────
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003801')->'servers', '["KB120", "KYOBO119"]'::jsonb,
          '8 servers = 켜진 서버 키 sort_order 순');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003801'), '$.**.dma_user_id'),
          '9 dma_user_id 키는 fills · events · orders 어디에도 없다');

SELECT * FROM finish();
ROLLBACK;
