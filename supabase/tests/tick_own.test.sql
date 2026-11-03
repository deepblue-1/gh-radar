-- ============================================================
-- Phase 38 — 틱 뷰어 「우리 주문 · 체결」 RPC pgTAP 전체 행렬(38-01 스모크 9 + 38-03 절 A~H).
--
-- 대상: 20261104100000_tick_own_for_user.sql(tick_own_for_user · 부분 인덱스 2).
--
-- 잠그는 것(D-01 · D-03 · D-14 · SC-4 · SC-5 · T-19-08):
--   1~9   스모크(38-01) — 함수 · 권한 · 게이트 · 가시 계좌만 · 꺼진 KB121 제외 · servers · dma_user_id 비반환
--   A 권한   — SECURITY INVOKER(prosecdef 거짓) · STABLE(provolatile 's') (EXECUTE 는 스모크 2 · 3)
--   B 게이트 — NULL · 매핑 없는 어드민(U5) → {"access": false} · 응답 최상위 키 집합 8개
--   C 가시성 — trader 는 자기 가시 계좌의 체결 · 이벤트 · 주문만(U1 ↔ U2 서로 안 보임)
--   D 어드민 — app_users.role 'admin' + 매핑 있음(U4)이면 전 계좌(켜진 서버 안에서)
--   F 필터   — 체결 E ∧ exec_qty>0 · 날짜 · isin · 거래소 · 이벤트 kind 3·6 ∧ order_no<>'' · 주문 N ∧ filled_qty>0 ∧ order_no
--   G 모양   — (gw_time, gateway, seq) 정렬 · gw_time_ms ms 절사 · 이벤트 키 19 · 주문 키 8 · 체결 키 8 · dma_user_id 없음
--   E 켜진 서버(D-03) — KB121 켜면 같은 호출에 자동 포함 · KYOBO119 끄면 빠짐 · servers 도 레지스트리를 따른다
--     (하드코딩 없음 — 레지스트리 UPDATE 만으로 바뀐다). E 는 레지스트리를 바꾸므로 맨 뒤(H 앞)에 둔다.
--   H 인덱스 — 부분 인덱스 2개 (trade_date, isin, exchange)
--   대조 2(C16b · E45b) — 「없음」 단언에 쓰는 `$.*[*]` 경로식이 있는 행은 실제로 잡는다는 양성 대조
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
--
-- 사용자(역할 · DMA id · 매핑):
--   U1 …3801 trader dma-ow1 → KB120 …3801 · KB121 …3811(꺼진 서버)
--   U2 …3802 trader dma-ow2 → KB120 …3802
--   U3 …3803 trader dma-ow3 → 매핑 없음(자격증명만)
--   U4 …3804 admin  dma-ow4 → KB120 …3804
--   U5 …3805 admin  DMA 연결 없음 → 매핑 없음
--   KYOBO119 …3819 = 아무에게도 매핑 안 된 계좌(어드민 전 계좌 확인용)
-- 날짜 · 종목: 2026-10-30 · KR7184230001 · KRX. 결과 비교는 「gateway:seq」 / 「gateway:order_no」 문자열(배열 순서 그대로).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(52);

-- ── 픽스처: 사용자 · 계좌 매핑 ─────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003801', 'ow-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003802', 'ow-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000003803', 'ow-u3@example.invalid'),
  ('00000000-0000-4000-8000-000000003804', 'ow-u4@example.invalid'),
  ('00000000-0000-4000-8000-000000003805', 'ow-u5@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-ow1','dma-ow2','dma-ow3','dma-ow4']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('ow-u1@example.invalid','trader','dma-ow1'),
  ('ow-u2@example.invalid','trader','dma-ow2'),
  ('ow-u3@example.invalid','trader','dma-ow3'),
  ('ow-u4@example.invalid','admin','dma-ow4'),
  ('ow-u5@example.invalid','admin',NULL);

SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-ow1","account_no":"1234563801","name":"위탁","priority":1},
  {"dma_user_id":"dma-ow2","account_no":"1234563802","name":"위탁","priority":1},
  {"dma_user_id":"dma-ow4","account_no":"1234563804","name":"위탁","priority":1}
]'::jsonb);
-- 가시성 v2 는 꺼진 서버 키도 곱한다 — KB121 매핑이 있으면 U1 가시 계좌에 KB121 행이 생긴다(Pitfall 6).
SELECT public.dma_journal_sync_access('KB121', '[
  {"dma_user_id":"dma-ow1","account_no":"1234563811","name":"위탁","priority":1}
]'::jsonb);

-- ── 픽스처: 체결 저널(dma_journal_events) ───────────────────────────
-- 포함돼야 할 체결 E — KB120 1·2·3·4·5·6 · KB121 1(꺼짐) · KYOBO119 1.
--   KB120 5 를 4 보다 먼저 넣는다(같은 gw_time → seq 오름차순 확인) · KYOBO119 1 도 같은 gw_time(게이트웨이 순 확인).
--   KB120 6 = 09:00:00.9995 → gw_time_ms 끝 세 자리 999(절사 · 반올림이면 000).
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin,
                                       side, order_no, notice_type, exchange, exec_price, exec_qty) VALUES
  ('KB120', 'ep-own', 1, '2026-10-30', '2026-10-30 13:00:00.130+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380101', 'E', 'KRX', 16400, 300),
  ('KB120', 'ep-own', 2, '2026-10-30', '2026-10-30 13:00:00.210+09', 'dma-ow2', '1234563802', 'KR7184230001',
   'B', '0000380201', 'E', 'KRX', 16400, 500),
  ('KB121', 'ep-own', 1, '2026-10-30', '2026-10-30 13:00:00.310+09', 'dma-ow1', '1234563811', 'KR7184230001',
   'S', '0000381101', 'E', 'KRX', 16450, 10),
  ('KB120', 'ep-own', 3, '2026-10-30', '2026-10-30 13:00:00.400+09', 'dma-ow4', '1234563804', 'KR7184230001',
   'B', '0000380401', 'E', 'KRX', 16400, 100),
  ('KYOBO119', 'ep-own', 1, '2026-10-30', '2026-10-30 13:00:01.000+09', 'dma-ow9', '1234563819', 'KR7184230001',
   'B', '0000381901', 'E', 'KRX', 16450, 50),
  ('KB120', 'ep-own', 5, '2026-10-30', '2026-10-30 13:00:01.000+09', 'dma-ow2', '1234563802', 'KR7184230001',
   'B', '0000380202', 'E', 'KRX', 16450, 20),
  ('KB120', 'ep-own', 4, '2026-10-30', '2026-10-30 13:00:01.000+09', 'dma-ow2', '1234563802', 'KR7184230001',
   'B', '0000380202', 'E', 'KRX', 16450, 30),
  ('KB120', 'ep-own', 6, '2026-10-30', '2026-10-30 09:00:00.9995+09', 'dma-ow2', '1234563802', 'KR7184230001',
   'S', '0000380203', 'E', 'KRX', 16000, 1);
-- 빠져야 할 체결 — 전부 U1 계좌(어드민 U4 에게도 빠져야 한다 = 필터만이 이유).
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin,
                                       side, order_no, notice_type, exchange, exec_price, exec_qty) VALUES
  ('KB120', 'ep-own', 10, '2026-10-30', '2026-10-30 13:00:02+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380101', 'A', 'KRX', 16400, 300),                                           -- 접수 통보(A)
  ('KB120', 'ep-own', 11, '2026-10-30', '2026-10-30 13:00:02+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380101', 'E', 'KRX', 16400, 0),                                             -- E 인데 exec_qty 0
  ('KB120', 'ep-own', 12, '2026-10-29', '2026-10-29 13:00:02+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380101', 'E', 'KRX', 16400, 300),                                           -- 다른 날짜
  ('KB120', 'ep-own', 13, '2026-10-30', '2026-10-30 13:00:02+09', 'dma-ow1', '1234563801', 'KR7005930003',
   'B', '0000380109', 'E', 'KRX', 60000, 10),                                            -- 다른 isin
  ('KB120', 'ep-own', 14, '2026-10-30', '2026-10-30 13:00:02+09', 'dma-ow1', '1234563801', 'KR7184230001',
   'B', '0000380108', 'E', 'NXT', 16400, 300);                                           -- 같은 isin 의 NXT

-- ── 픽스처: 전략 주문 이벤트(dma_strategy_events) ───────────────────
-- 13:00:00 KST = 1793332800000 ms. 포함 — KB120 1(U1 kind 3) · 2(U2 kind 6) · 3(U4 kind 3) · KB121 4(꺼짐) · KYOBO119 5.
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty) VALUES
  ('KB120',    'ep-own-s', 1, '2026-10-30', 1793332800100, 3, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '0000380101', 16400, 300),
  ('KB120',    'ep-own-s', 2, '2026-10-30', 1793332800200, 6, 'KRX', 'KR7184230001', 'dma-ow2', '1234563802', '0000380201', 16400, 500),
  ('KB120',    'ep-own-s', 3, '2026-10-30', 1793332800300, 3, 'KRX', 'KR7184230001', 'dma-ow4', '1234563804', '0000380401', 16400, 100),
  ('KB121',    'ep-own-s', 4, '2026-10-30', 1793332800250, 3, 'KRX', 'KR7184230001', 'dma-ow1', '1234563811', '0000381101', 16450, 10),
  ('KYOBO119', 'ep-own-s', 5, '2026-10-30', 1793332800400, 3, 'KRX', 'KR7184230001', 'dma-ow9', '1234563819', '0000381901', 16450, 50);
-- 빠져야 할 이벤트 — 전부 U1 계좌 · 주문번호 있음(kind 2·5·15) / kind 3 인데 order_no ''(거부).
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty) VALUES
  ('KB120', 'ep-own-s', 10, '2026-10-30', 1793332800500,  2, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '0000380101', 16400, 300),
  ('KB120', 'ep-own-s', 11, '2026-10-30', 1793332800500,  5, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '0000380101', 16400, 300),
  ('KB120', 'ep-own-s', 12, '2026-10-30', 1793332800500, 15, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '0000380101', 16400, 300),
  ('KB120', 'ep-own-s', 13, '2026-10-30', 1793332800500,  3, 'KRX', 'KR7184230001', 'dma-ow1', '1234563801', '',           16400, 300);

-- ── 픽스처: 계좌 주문 투영(dma_account_orders) ─────────────────────
-- 포함 — N · 주문번호 · 체결 있음. created_at 순: 380101 · 380201 · 381101(KB121) · 380401 · 381901(KYOBO119).
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price,
                                       filled_qty, status, dma_user_id, first_seq, last_seq, created_at, updated_at) VALUES
  ('KB120',    '2026-10-30', '1234563801', '0000380101', 'KR7184230001', 'KRX', 'B', 'N', 300, 16400,
   300, 'filled', 'dma-ow1', 1, 1, '2026-10-30 13:00:00.100+09', '2026-10-30 13:00:00.130+09'),
  ('KB120',    '2026-10-30', '1234563802', '0000380201', 'KR7184230001', 'KRX', 'B', 'N', 500, 16400,
   500, 'filled', 'dma-ow2', 2, 2, '2026-10-30 13:00:00.200+09', '2026-10-30 13:00:00.210+09'),
  ('KB121',    '2026-10-30', '1234563811', '0000381101', 'KR7184230001', 'KRX', 'S', 'N', 10, 16450,
   10, 'filled', 'dma-ow1', 1, 1, '2026-10-30 13:00:00.300+09', '2026-10-30 13:00:00.310+09'),
  ('KB120',    '2026-10-30', '1234563804', '0000380401', 'KR7184230001', 'KRX', 'B', 'N', 100, 16400,
   100, 'filled', 'dma-ow4', 3, 3, '2026-10-30 13:00:00.350+09', '2026-10-30 13:00:00.400+09'),
  ('KYOBO119', '2026-10-30', '1234563819', '0000381901', 'KR7184230001', 'KRX', 'B', 'N', 50, 16450,
   50, 'filled', 'dma-ow9', 1, 1, '2026-10-30 13:00:00.450+09', '2026-10-30 13:00:01.000+09');
-- 빠져야 할 주문 — 전부 U1 계좌: 취소(C) · 체결 0 · 주문번호 NULL(거부 행 — reject_seq 키 · 일부러 filled_qty>0).
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange,
                                       side, order_type, org_order_no, qty, price, filled_qty, status, dma_user_id,
                                       first_seq, last_seq, created_at, updated_at) VALUES
  ('KB120', '2026-10-30', '1234563801', '0000380102', NULL, NULL, 'KR7184230001', 'KRX',
   'B', 'C', '0000380101', 300, 0, 300, 'cancelled', 'dma-ow1', 20, 20, '2026-10-30 13:00:03+09', '2026-10-30 13:00:03+09'),
  ('KB120', '2026-10-30', '1234563801', '0000380103', NULL, NULL, 'KR7184230001', 'KRX',
   'B', 'N', NULL, 300, 16400, 0, 'accepted', 'dma-ow1', 21, 21, '2026-10-30 13:00:03+09', '2026-10-30 13:00:03+09'),
  ('KB120', '2026-10-30', '1234563801', NULL, 'ep-own', 22, 'KR7184230001', 'KRX',
   'B', 'N', NULL, 300, 16400, 5, 'rejected', 'dma-ow1', 22, 22, '2026-10-30 13:00:03+09', '2026-10-30 13:00:03+09');

-- ── 헬퍼 ───────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.own(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.tick_own_for_user(p_user, '20261030', 'KR7184230001', 'KRX')
$$;
-- 배열 순서 그대로 「gateway:seq」(fills · events) / 「gateway:order_no」(orders) 를 쉼표로 잇는다.
CREATE FUNCTION pg_temp.keys(p_user uuid, p_arr text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((x.e->>'gateway') || ':' ||
                             CASE WHEN p_arr = 'orders' THEN coalesce(x.e->>'order_no', 'null') ELSE x.e->>'seq' END,
                             ',' ORDER BY x.i), '')
    FROM jsonb_array_elements(pg_temp.own(p_user)->p_arr) WITH ORDINALITY AS x(e, i)
$$;
-- 객체 키 집합(정렬 · 쉼표).
CREATE FUNCTION pg_temp.objkeys(p_obj jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(p_obj) k
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
          '5 U1 fills = 1행(U2 체결 · 꺼진 KB121 체결 · 필터 대상 제외)');
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

-- ── A. 권한 — SECURITY INVOKER · STABLE ─────────────────────────────
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.tick_own_for_user(uuid, text, text, text)'::regprocedure),
          'A10 SECURITY INVOKER(prosecdef 거짓) — service_role 의 표 권한으로만 읽는다');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'public.tick_own_for_user(uuid, text, text, text)'::regprocedure),
          's', 'A11 STABLE(provolatile s)');

-- ── B. 게이트 · 최상위 모양 ─────────────────────────────────────────
SELECT is(public.tick_own_for_user(NULL, '20261030', 'KR7184230001', 'KRX'), '{"access": false}'::jsonb,
          'B12 p_user_id NULL → {"access": false}');
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003805'), '{"access": false}'::jsonb,
          'B13 매핑 없는 어드민 U5 → {"access": false}(어드민도 매핑이 없으면 틱뷰어 게이트와 같이 막힌다 — 37 D-08)');
SELECT is(pg_temp.objkeys(pg_temp.own('00000000-0000-4000-8000-000000003801')),
          'access,date,events,exchange,fills,isin,orders,servers',
          'B14 U1 응답 최상위 키 = access · date · exchange · isin · servers · fills · events · orders');

-- ── C. 가시성(D-01) — trader 는 자기 가시 계좌만 ──────────────────────
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003802', 'fills'),
          'KB120:6,KB120:2,KB120:4,KB120:5',
          'C15 U2 fills = 자기 KB120 …3802 체결만(시각 순)');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003801'),
                                '$.*[*] ? (@.account_no == "1234563802" || @.account_no == "1234563804" || @.account_no == "1234563819")'),
          'C16 U1 은 U2 · U4 · 매핑 밖 계좌의 체결 · 이벤트 · 주문을 하나도 못 본다');
SELECT ok(jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                            '$.*[*] ? (@.account_no == "1234563802" || @.account_no == "1234563804" || @.account_no == "1234563819")'),
          'C16b (대조) 같은 경로식이 어드민 U4 응답에선 참 — C16 · E47 의 「없음」 이 공허한 참이 아니다');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003801', 'events'), 'KB120:1',
          'C17 U1 events = 자기 KB120 kind 3 1건(KB121 꺼짐 · 필터 대상 제외)');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003802', 'events'), 'KB120:2',
          'C18 U2 events = 자기 KB120 kind 6 1건');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003801', 'orders'), 'KB120:0000380101',
          'C19 U1 orders = 자기 KB120 체결 주문 1건');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003802', 'orders'), 'KB120:0000380201',
          'C20 U2 orders = 자기 KB120 체결 주문 1건');

-- ── D. 어드민(D-01) — 전 계좌(켜진 서버 안에서) ─────────────────────
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003804', 'fills'),
          'KB120:6,KB120:1,KB120:2,KB120:3,KB120:4,KB120:5,KYOBO119:1',
          'D21 U4 admin fills = U1 · U2 · U4 · 매핑 밖 KYOBO119 계좌 전부(KB121 꺼짐 제외)');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003804', 'events'),
          'KB120:1,KB120:2,KB120:3,KYOBO119:5',
          'D22 U4 admin events = 전 계좌 kind 3·6(KB121 꺼짐 제외)');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003804', 'orders'),
          'KB120:0000380101,KB120:0000380201,KB120:0000380401,KYOBO119:0000381901',
          'D23 U4 admin orders = 전 계좌 체결 주문(created_at 순 · KB121 꺼짐 제외)');

-- ── F. 필터(D-14) — 어드민 U4 로도 빠진다(= 필터만이 이유) ─────────────
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.fills[*] ? (@.gateway == "KB120" && @.seq == 10)'),
          'F24 notice_type A(접수) 행은 fills 에 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.fills[*] ? (@.gateway == "KB120" && @.seq == 11)'),
          'F25 E 인데 exec_qty 0 인 행은 fills 에 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.fills[*] ? (@.gateway == "KB120" && @.seq == 12)'),
          'F26 다른 날짜(2026-10-29) 체결은 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.fills[*] ? (@.gateway == "KB120" && @.seq == 13)'),
          'F27 다른 isin 체결은 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.fills[*] ? (@.gateway == "KB120" && @.seq == 14)'),
          'F28 같은 isin 의 NXT 체결은 p_ex KRX 호출에 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.events[*] ? (@.kind == 2)'),
          'F29 이벤트 kind 2 는 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.events[*] ? (@.kind == 5)'),
          'F30 이벤트 kind 5 는 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.events[*] ? (@.kind == 15)'),
          'F31 이벤트 kind 15 는 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.events[*] ? (@.order_no == "")'),
          'F32 kind 3 인데 order_no 빈 이벤트(거부)는 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.orders[*] ? (@.order_no == "0000380102")'),
          'F33 주문 order_type C(취소) 행은 orders 에 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                '$.orders[*] ? (@.order_no == "0000380103")'),
          'F34 filled_qty 0 주문은 orders 에 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.orders[*] ? (@.order_no == null)'),
          'F35 order_no NULL(거부 행 · reject_seq 키) 주문은 orders 에 없다');

-- ── G. 모양 · 정렬 ─────────────────────────────────────────────────
SELECT is((SELECT string_agg(e->>'seq', ',' ORDER BY i)
             FROM jsonb_array_elements(pg_temp.own('00000000-0000-4000-8000-000000003802')->'fills') WITH ORDINALITY x(e, i)
            WHERE e->>'gw_time_ms' = '1793332801000'),
          '4,5', 'G36 같은 gw_time 두 체결은 seq 오름차순(넣은 순서 5 → 4 와 무관)');
SELECT is((SELECT (e->>'gw_time_ms')::bigint
             FROM jsonb_array_elements(pg_temp.own('00000000-0000-4000-8000-000000003802')->'fills') e
            WHERE e->>'seq' = '6'),
          1793318400999::bigint, 'G37 gw_time 09:00:00.9995 → gw_time_ms …999(ms 절사 · 반올림 아님)');
SELECT is(pg_temp.objkeys(pg_temp.own('00000000-0000-4000-8000-000000003804')->'events'->0),
          'account_no,cond_actual,cond_metric,cond_threshold,cum_volume,ev_kind,ev_price,ev_qty_after,ev_qty_before,'
          || 'ev_trade_qty,gateway,group,gw_time_ms,kind,order_no,price,qty,reason_code,seq',
          'G38 이벤트 객체 키 19개');
SELECT is(pg_temp.objkeys(pg_temp.own('00000000-0000-4000-8000-000000003804')->'orders'->0),
          'account_no,created_ms,gateway,order_no,origin,price,qty,side',
          'G39 주문 객체 키 8개(created_ms 포함)');
SELECT is(pg_temp.objkeys(pg_temp.own('00000000-0000-4000-8000-000000003804')->'fills'->0),
          'account_no,exec_price,exec_qty,gateway,gw_time_ms,order_no,seq,side',
          'G40 체결 객체 키 8개');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.**.dma_user_id'),
          'G41 어드민 전 계좌 응답에도 dma_user_id 키 없음');

-- ── E. 켜진 서버(D-03) — 레지스트리만 따른다 ─────────────────────────
-- 시드: KB121 꺼짐(스모크 5 · 7 · 8 · C17 · C19 가 「없음」 을 이미 잠갔다). 켜면 같은 호출에 자동 포함.
UPDATE public.dma_servers SET enabled = true WHERE key = 'KB121';
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003801', 'fills'), 'KB120:1,KB121:1',
          'E42 KB121 켠 뒤 U1 fills 에 KB121 체결 자동 포함(시각 순)');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003801', 'events'), 'KB120:1,KB121:4',
          'E43 KB121 켠 뒤 U1 events 에 KB121 이벤트 자동 포함');
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003801', 'orders'), 'KB120:0000380101,KB121:0000381101',
          'E44 KB121 켠 뒤 U1 orders 에 KB121 주문 자동 포함');
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003801')->'servers', '["KB120", "KB121", "KYOBO119"]'::jsonb,
          'E45 KB121 켠 뒤 servers = KB120 · KB121 · KYOBO119(sort_order 순)');

SELECT is((SELECT count(*)::int FROM jsonb_path_query(pg_temp.own('00000000-0000-4000-8000-000000003804'),
                                                      '$.*[*] ? (@.gateway == "KYOBO119")')),
          3, 'E45b (대조) KYOBO119 끄기 전 U4 admin 응답의 KYOBO119 행 = 체결 · 이벤트 · 주문 각 1');

-- KYOBO119 를 끈다 — 주문 서버 플래그는 켜진 서버에만 설 수 있어(CHECK NOT is_order_server OR enabled) 같이 내린다.
UPDATE public.dma_servers SET enabled = false, is_order_server = false WHERE key = 'KYOBO119';
SELECT is(pg_temp.keys('00000000-0000-4000-8000-000000003804', 'fills'),
          'KB120:6,KB120:1,KB120:2,KB121:1,KB120:3,KB120:4,KB120:5',
          'E46 KYOBO119 끈 뒤 U4 admin fills 에서 KYOBO119 체결 빠짐 · KB121 체결 포함');
SELECT ok(NOT jsonb_path_exists(pg_temp.own('00000000-0000-4000-8000-000000003804'), '$.*[*] ? (@.gateway == "KYOBO119")'),
          'E47 KYOBO119 끈 뒤 events · orders 에도 KYOBO119 행 없음');
SELECT is(pg_temp.own('00000000-0000-4000-8000-000000003804')->'servers', '["KB120", "KB121"]'::jsonb,
          'E48 KYOBO119 끈 뒤 servers 에서 빠짐');

-- ── H. 인덱스 ──────────────────────────────────────────────────────
SELECT has_index('public', 'dma_journal_events', 'idx_dma_journal_events_fill_isin_day',
                 ARRAY['trade_date', 'isin', 'exchange'],
                 'H49 부분 인덱스 idx_dma_journal_events_fill_isin_day (trade_date, isin, exchange) 있음');
SELECT has_index('public', 'dma_strategy_events', 'idx_dma_strategy_events_order_isin_day',
                 ARRAY['trade_date', 'isin', 'exchange'],
                 'H50 부분 인덱스 idx_dma_strategy_events_order_isin_day (trade_date, isin, exchange) 있음');

SELECT * FROM finish();
ROLLBACK;
