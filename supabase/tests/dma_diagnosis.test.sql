-- ============================================================
-- Phase 39 — 매매진단 「진단 조회」 RPC pgTAP 전체 행렬(39-03 Task 1 스모크 1~10 + Task 2 절 A~F · H).
--
-- 대상: 20261106100000_dma_diagnosis_for_user.sql(dma_diagnosis_for_user · 부분 인덱스 1)
--
-- 잠그는 것(SC-2 · SC-4 · SC-5 · D-11 · T-19-08 · Phase 38 D-03):
--   1~10  스모크 — 함수 · 권한 · U1 자기 주문 1 · 체결 1 · 이벤트 2(kind 3 · 예약 kind 9) · U2 는 U1 계좌 0행
--   A 게이트   — NULL · 매핑 없음(U3) · 매핑 없는 어드민(U5) → {"access": false} · 최상위 키 6 · date · isin 반향 ·
--                SECURITY INVOKER · STABLE
--   B 가시성 · 어드민 우회 없음 — U1 ↔ U2 서로 안 보임 · 어드민 U4 도 자기 가시 계좌만(tick_own 절 D 와 반대 —
--                오케스트레이터 결정 3) · 대조 1(같은 경로식이 U1 응답에선 참)
--   C kind 조건 — kind 15 · 16 · 17 · 18 제외(대조: 원천 행은 있다) · 계좌가 빈 kind 9 는 누구에게도 안 보임 ·
--                kind 9 원소에 order_condition · reason_code 원문
--   D 종목 필터 · 시세 맥락 — 시세 kind 1 · 2 · 10 은 p_isin 지정 + 그 게이트웨이에 가시 계좌가 있을 때만 ·
--                p_isin 지정 시 다른 종목 0행(대조: NULL 이면 있음) · p_isin NULL 이면 전 종목
--   E 모양     — dma_user_id · requester · applied_at 키 없음(대조: 원천 행에는 있다) · orders 키 20 · fills 키 11 ·
--                events 키 = 표 칸 − dma_user_id − applied_at + stock_code · stock_name · stocks 조인 · *_ms 절사 ·
--                (gw_time_ms, gateway, seq) 정렬(같은 ms 는 seq · 같은 ms 다른 게이트웨이는 gateway 순 — F)
--   F 켜진 서버 — 꺼진 KB121 행은 빠지고 켜면 같은 호출에 들어온다 · KYOBO119 끄면 시세 맥락도 빠진다.
--                레지스트리를 바꾸므로 맨 뒤(H 앞).
--   H 인덱스   — 부분 인덱스 idx_dma_strategy_events_isin_day_acct (trade_date, isin, exchange)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
--
-- 사용자(역할 · DMA id · 매핑):
--   U1 …3901 trader dma-dg1 → KB120 …3901 · KB121 …3911(꺼진 서버)
--   U2 …3902 trader dma-dg2 → KB120 …3902(자기 행은 2026-11-06 에만 — 스모크 8~10 의 「11-05 0행」 유지)
--   U3 …3903 trader dma-dg3 → 매핑 없음(자격증명만)
--   U4 …3904 admin  dma-dg4 → KB120 …3904(종목 A · B 행 — 종목 필터 · 어드민 우회 없음)
--   U5 …3905 admin  DMA 연결 없음 → 매핑 없음
--   U6 …3906 trader dma-dg6 → KYOBO119 …3916(시세 맥락은 자기 게이트웨이 것만)
-- 날짜 · 종목: 2026-11-05 · A = KR7282720005(금양그린파워 — stocks 픽스처 없이 문자열만 · stock_code null 허용) ·
--   B = KR7005930003(삼성전자 — stocks 픽스처 있음 · stock_code · stock_name 조인 확인) · KRX.
-- 시각: T = 2026-11-05 10:00:00 KST = 1793840400000 ms. 결과 비교는 「gateway:seq」 / 「gateway:order_no」 문자열(배열 순서 그대로).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(61);

-- ── 픽스처: 사용자 · 계좌 매핑 ─────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000003901', 'dg-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000003902', 'dg-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000003903', 'dg-u3@example.invalid'),
  ('00000000-0000-4000-8000-000000003904', 'dg-u4@example.invalid'),
  ('00000000-0000-4000-8000-000000003905', 'dg-u5@example.invalid'),
  ('00000000-0000-4000-8000-000000003906', 'dg-u6@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-dg1','dma-dg2','dma-dg3','dma-dg4','dma-dg6']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('dg-u1@example.invalid','trader','dma-dg1'),
  ('dg-u2@example.invalid','trader','dma-dg2'),
  ('dg-u3@example.invalid','trader','dma-dg3'),
  ('dg-u4@example.invalid','admin','dma-dg4'),
  ('dg-u5@example.invalid','admin',NULL),
  ('dg-u6@example.invalid','trader','dma-dg6');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 게이트웨이 단위 원자 교체라 KB120 매핑은 한 번에 넣는다.
SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-dg1","account_no":"1234563901","name":"위탁","priority":1},
  {"dma_user_id":"dma-dg2","account_no":"1234563902","name":"위탁","priority":1},
  {"dma_user_id":"dma-dg4","account_no":"1234563904","name":"위탁","priority":1}
]'::jsonb);
-- 가시성 v2 는 꺼진 서버 키도 곱한다 — KB121 매핑이 있으면 U1 가시 계좌에 KB121 행이 생긴다(켜진 서버 조인이 거른다).
SELECT public.dma_journal_sync_access('KB121', '[
  {"dma_user_id":"dma-dg1","account_no":"1234563911","name":"위탁","priority":1}
]'::jsonb);
SELECT public.dma_journal_sync_access('KYOBO119', '[
  {"dma_user_id":"dma-dg6","account_no":"1234563916","name":"위탁","priority":1}
]'::jsonb);

-- ── 픽스처: 계좌 주문 투영(dma_account_orders) ─────────────────────
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange,
                                       side, order_type, qty, price, filled_qty, status, requester, dma_user_id,
                                       first_seq, last_seq, created_at, updated_at) VALUES
  -- 포함 — U1 종목 A(스모크 4)
  ('KB120', '2026-11-05', '1234563901', '0000390101', NULL, NULL, 'KR7282720005', 'KRX',
   'B', 'N', 100, 12000, 100, 'filled', 'Manual', 'dma-dg1', 1, 2, '2026-11-05 10:00:00.100+09', '2026-11-05 10:00:00.200+09'),
  -- 빠짐 — U1 주문번호 NULL(거부 행 · reject_seq 키) · 다른 날짜
  ('KB120', '2026-11-05', '1234563901', NULL, 'ep-dg', 50, 'KR7282720005', 'KRX',
   'B', 'N', 100, 12000, 0, 'rejected', 'Manual', 'dma-dg1', 50, 50, '2026-11-05 10:00:00.050+09', '2026-11-05 10:00:00.050+09'),
  ('KB120', '2026-11-04', '1234563901', '0000390199', NULL, NULL, 'KR7282720005', 'KRX',
   'B', 'N', 100, 12000, 100, 'filled', 'Manual', 'dma-dg1', 51, 51, '2026-11-04 10:00:00.100+09', '2026-11-04 10:00:00.200+09'),
  -- 꺼진 서버 — U1 KB121 …3911(절 F 에서 켠다)
  ('KB121', '2026-11-05', '1234563911', '0000391101', NULL, NULL, 'KR7282720005', 'KRX',
   'S', 'N', 10, 12100, 10, 'filled', 'Manual', 'dma-dg1', 1, 1, '2026-11-05 10:00:00.300+09', '2026-11-05 10:00:00.300+09'),
  -- U4 admin 자기 계좌 — 종목 A · B
  ('KB120', '2026-11-05', '1234563904', '0000390401', NULL, NULL, 'KR7282720005', 'KRX',
   'B', 'N', 30, 12000, 30, 'filled', 'Manual', 'dma-dg4', 6, 6, '2026-11-05 10:01:00.100+09', '2026-11-05 10:01:00.200+09'),
  ('KB120', '2026-11-05', '1234563904', '0000390402', NULL, NULL, 'KR7005930003', 'KRX',
   'B', 'N', 5, 60000, 5, 'filled', 'Manual', 'dma-dg4', 3, 3, '2026-11-05 10:02:00.100+09', '2026-11-05 10:02:00.200+09'),
  -- U2 자기 계좌 — 2026-11-06 에만
  ('KB120', '2026-11-06', '1234563902', '0000390201', NULL, NULL, 'KR7282720005', 'KRX',
   'B', 'N', 20, 12500, 20, 'filled', 'Manual', 'dma-dg2', 8, 8, '2026-11-06 10:00:00.100+09', '2026-11-06 10:00:00.200+09');

-- ── 픽스처: 체결 저널(dma_journal_events) ───────────────────────────
INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin,
                                       side, order_no, notice_type, requester, exchange, exec_price, exec_qty) VALUES
  ('KB120', 'ep-dg', 2, '2026-11-05', '2026-11-05 10:00:00.200+09', 'dma-dg1', '1234563901', 'KR7282720005',
   'B', '0000390101', 'E', 'Manual', 'KRX', 12000, 100),                    -- 포함 — U1 체결(스모크 5)
  ('KB120', 'ep-dg', 4, '2026-11-05', '2026-11-05 10:00:00.100+09', 'dma-dg1', '1234563901', 'KR7282720005',
   'B', '0000390101', 'A', 'Manual', 'KRX', 0, 0),                          -- 빠짐 — 접수 통보(A)
  ('KB120', 'ep-dg', 5, '2026-11-05', '2026-11-05 10:00:00.250+09', 'dma-dg1', '1234563901', 'KR7282720005',
   'B', '0000390101', 'E', 'Manual', 'KRX', 12000, 0),                      -- 빠짐 — E 인데 exec_qty 0
  ('KB120', 'ep-dg', 7, '2026-11-04', '2026-11-04 10:00:00.200+09', 'dma-dg1', '1234563901', 'KR7282720005',
   'B', '0000390199', 'E', 'Manual', 'KRX', 12000, 100),                    -- 빠짐 — 다른 날짜
  ('KB121', 'ep-dg', 1, '2026-11-05', '2026-11-05 10:00:00.300+09', 'dma-dg1', '1234563911', 'KR7282720005',
   'S', '0000391101', 'E', 'Manual', 'KRX', 12100, 10),                     -- 꺼진 서버 KB121
  ('KB120', 'ep-dg', 6, '2026-11-05', '2026-11-05 10:01:00.200+09', 'dma-dg4', '1234563904', 'KR7282720005',
   'B', '0000390401', 'E', 'Manual', 'KRX', 12000, 30),                     -- U4 종목 A
  ('KB120', 'ep-dg', 3, '2026-11-05', '2026-11-05 10:02:00.200+09', 'dma-dg4', '1234563904', 'KR7005930003',
   'B', '0000390402', 'E', 'Manual', 'KRX', 60000, 5),                      -- U4 종목 B(seq 가 작아도 시각 순 뒤)
  ('KB120', 'ep-dg', 8, '2026-11-06', '2026-11-06 10:00:00.200+09', 'dma-dg2', '1234563902', 'KR7282720005',
   'B', '0000390201', 'E', 'Manual', 'KRX', 12500, 20);                     -- U2 — 2026-11-06

-- ── 픽스처: 전략 이벤트(dma_strategy_events) ───────────────────────
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty, order_condition, reason_code) VALUES
  -- U1 주문 이벤트(스모크 6 · 7)
  ('KB120', 'ep-dg-s',  1, '2026-11-05', 1793840400050,  3, 'KRX', 'KR7282720005', 'dma-dg1', '1234563901', '0000390101', 12000, 100, '', ''),
  ('KB120', 'ep-dg-s',  2, '2026-11-05', 1793840400300,  9, 'KRX', 'KR7282720005', 'dma-dg1', '1234563901', 'Q000390101', 12100, 50, 'milles', 'CfgSubmit'),
  -- 계좌가 빈 kind 9 — 누구에게도 안 보인다(D-11)
  ('KB120', 'ep-dg-s',  3, '2026-11-05', 1793840400310,  9, 'KRX', 'KR7282720005', '',        '',           'Q000390199', 12100, 50, 'milles', 'CfgSubmit'),
  -- 제외 kind 15 · 16(계좌 '') · 17 · 18(U1 계좌 — 계좌가 맞아도 kind 로 빠진다)
  ('KB120', 'ep-dg-s',  4, '2026-11-05', 1793840400320, 15, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', ''),
  ('KB120', 'ep-dg-s',  5, '2026-11-05', 1793840400330, 16, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', ''),
  ('KB120', 'ep-dg-s',  6, '2026-11-05', 1793840400340, 17, 'KRX', 'KR7282720005', 'dma-dg1', '1234563901', '0000390101', 0, 0, '', ''),
  ('KB120', 'ep-dg-s',  7, '2026-11-05', 1793840400350, 18, 'KRX', 'KR7282720005', 'dma-dg1', '1234563901', '0000390101', 0, 0, '', ''),
  -- 시세 kind 1 · 2 · 10(계좌 '') — p_isin 지정 시 맥락. seq 9 는 seq 2 와 같은 ms(seq 순 확인)
  ('KB120', 'ep-dg-s',  8, '2026-11-05', 1793840400020,  1, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', ''),
  ('KB120', 'ep-dg-s',  9, '2026-11-05', 1793840400300,  2, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', ''),
  ('KB120', 'ep-dg-s', 10, '2026-11-05', 1793840400400, 10, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', ''),
  -- U4 admin 자기 계좌 — 종목 B kind 4 · 종목 A kind 3
  ('KB120', 'ep-dg-s', 11, '2026-11-05', 1793840520000,  4, 'KRX', 'KR7005930003', 'dma-dg4', '1234563904', '0000390402', 60000, 5, '', ''),
  ('KB120', 'ep-dg-s', 13, '2026-11-05', 1793840400070,  3, 'KRX', 'KR7282720005', 'dma-dg4', '1234563904', '0000390401', 12000, 30, '', ''),
  -- U1 다른 날짜 · U2 2026-11-06
  ('KB120', 'ep-dg-s', 14, '2026-11-04', 1793754000050,  3, 'KRX', 'KR7282720005', 'dma-dg1', '1234563901', '0000390199', 12000, 100, '', ''),
  ('KB120', 'ep-dg-s', 15, '2026-11-06', 1793926800050,  3, 'KRX', 'KR7282720005', 'dma-dg2', '1234563902', '0000390201', 12500, 20, '', ''),
  -- 꺼진 서버 KB121 — U1 …3911 · KB120 seq 2 와 같은 ms(켜면 gateway 순 확인)
  ('KB121', 'ep-dg-s',  1, '2026-11-05', 1793840400300,  3, 'KRX', 'KR7282720005', 'dma-dg1', '1234563911', '0000391101', 12100, 10, '', ''),
  -- KYOBO119 시세 — U6 만(KYOBO119 가시 계좌 보유)
  ('KYOBO119', 'ep-dg-s', 1, '2026-11-05', 1793840400090, 1, 'KRX', 'KR7282720005', '',        '',           '',           0, 0, '', '');

-- ── 헬퍼 ───────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.dg(p_user uuid, p_isin text DEFAULT NULL, p_date date DEFAULT '2026-11-05') RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.dma_diagnosis_for_user(p_user, p_date, p_isin)
$$;
-- 배열 순서 그대로 「gateway:seq」(fills · events) / 「gateway:order_no」(orders) 를 쉼표로 잇는다.
CREATE FUNCTION pg_temp.keys(p_obj jsonb, p_arr text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((x.e->>'gateway') || ':' ||
                             CASE WHEN p_arr = 'orders' THEN coalesce(x.e->>'order_no', 'null') ELSE x.e->>'seq' END,
                             ',' ORDER BY x.i), '')
    FROM jsonb_array_elements(p_obj->p_arr) WITH ORDINALITY AS x(e, i)
$$;
-- 객체 키 집합(바이트 순 정렬 · 쉼표).
CREATE FUNCTION pg_temp.objkeys(p_obj jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k, ',' ORDER BY k COLLATE "C") FROM jsonb_object_keys(p_obj) k
$$;
-- 세 배열 길이 합.
CREATE FUNCTION pg_temp.total(p_obj jsonb) RETURNS int LANGUAGE sql AS $$
  SELECT jsonb_array_length(p_obj->'orders') + jsonb_array_length(p_obj->'fills') + jsonb_array_length(p_obj->'events')
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

-- ── A. 게이트 · 최상위 모양 · 함수 속성 ─────────────────────────────
SELECT is(public.dma_diagnosis_for_user(NULL, '2026-11-05', NULL), '{"access": false}'::jsonb,
          'A11 p_user_id NULL → {"access": false}');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003903'), '{"access": false}'::jsonb,
          'A12 계좌 매핑 없는 U3 → {"access": false}');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003905'), '{"access": false}'::jsonb,
          'A13 매핑 없는 어드민 U5 → {"access": false}(어드민도 매핑이 없으면 막힌다)');
SELECT is(pg_temp.objkeys(pg_temp.dg('00000000-0000-4000-8000-000000003901')),
          'access,date,events,fills,isin,orders',
          'A14 U1 응답 최상위 키 = access · date · isin · orders · fills · events');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003901')->>'date', '2026-11-05',
          'A15 date = YYYY-MM-DD 문자열');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005')->>'isin', 'KR7282720005',
          'A16 p_isin 지정 → isin 그대로 반향');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'isin', 'null'::jsonb,
          'A17 p_isin NULL → isin JSON null');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.dma_diagnosis_for_user(uuid, date, text)'::regprocedure),
          'A18 SECURITY INVOKER(prosecdef 거짓) — service_role 의 표 권한으로만 읽는다');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'public.dma_diagnosis_for_user(uuid, date, text)'::regprocedure),
          's', 'A19 STABLE(provolatile s)');

-- ── B. 가시성 · 어드민 우회 없음(SC-2 · 오케스트레이터 결정 3) ─────────
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003902', NULL, '2026-11-06'), 'orders'),
          'KB120:0000390201',
          'B20 U2 2026-11-06 orders = 자기 …3902 주문(U2 는 자기 행은 본다)');
SELECT is(pg_temp.total(pg_temp.dg('00000000-0000-4000-8000-000000003901', NULL, '2026-11-06')), 0,
          'B21 U1 2026-11-06 = 0행 — U2 계좌의 주문 · 체결 · 이벤트를 못 본다(U1 ↔ U2 서로 안 보임)');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003904'),
                                '$.*[*] ? (@.account_no == "1234563901" || @.account_no == "1234563911")'),
          'B22 어드민 U4 는 U1 계좌(…3901 · …3911) 행을 하나도 못 본다 — 어드민 우회 없음');
SELECT ok(jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901'),
                            '$.*[*] ? (@.account_no == "1234563901" || @.account_no == "1234563911")'),
          'B22b (대조) 같은 경로식이 U1 응답에선 참 — B22 의 「없음」 이 공허한 참이 아니다');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904'), 'orders'),
          'KB120:0000390401,KB120:0000390402',
          'B23 어드민 U4 orders = 자기 …3904 주문만(created_at 순)');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904'), 'fills'),
          'KB120:6,KB120:3',
          'B24 어드민 U4 fills = 자기 …3904 체결만(gw_time 순 — seq 3 이 시각상 뒤)');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904'), 'events'),
          'KB120:13,KB120:11',
          'B25 어드민 U4 events = 자기 …3904 이벤트만(U1 kind 3 · kind 9 없음)');
SELECT is(pg_temp.total(pg_temp.dg('00000000-0000-4000-8000-000000003904', NULL, '2026-11-06')), 0,
          'B26 어드민 U4 2026-11-06 = 0행 — U2 계좌도 못 본다');

-- ── C. kind 조건(D-11 · Phase 38 D-03 계열) ──────────────────────────
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'), 'events'),
          'KB120:8,KB120:1,KB120:2,KB120:9,KB120:10',
          'C27 U1 종목 A events = 시세 1 · kind 3 · kind 9 · 시세 2(같은 ms → seq 순) · 시세 10 — 15~18 · 빈 계좌 kind 9 제외');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'),
                                '$.events[*] ? (@.kind == 15 || @.kind == 16 || @.kind == 17 || @.kind == 18)'),
          'C28 kind 15 · 16 · 17 · 18 은 events 에 없다(17 · 18 은 U1 계좌여도)');
SELECT is((SELECT count(*)::int FROM public.dma_strategy_events
            WHERE trade_date = '2026-11-05' AND isin = 'KR7282720005' AND kind IN (15, 16, 17, 18)),
          4, 'C28b (대조) 원천 표에는 그날 종목 A 의 kind 15 · 16 · 17 · 18 행이 4개 있다');
SELECT is((SELECT count(*)::int
             FROM unnest(ARRAY['00000000-0000-4000-8000-000000003901', '00000000-0000-4000-8000-000000003902',
                               '00000000-0000-4000-8000-000000003904', '00000000-0000-4000-8000-000000003906']::uuid[]) u,
                  unnest(ARRAY['KR7282720005', NULL]) i,
                  LATERAL jsonb_path_query(pg_temp.dg(u, i), '$.events[*] ? (@.kind == 9 && @.account_no == "")') q),
          0, 'C29 계좌가 빈 kind 9 는 U1 · U2 · U4 · U6 누구에게도(종목 지정 · 전 종목 모두) 안 보인다');
SELECT is((SELECT e->>'order_condition' || '|' || (e->>'reason_code') || '|' || (e->>'order_no')
             FROM jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'events') e
            WHERE (e->>'kind')::int = 9),
          'milles|CfgSubmit|Q000390101',
          'C30 kind 9 원소 = order_condition milles · reason_code CfgSubmit · Q-ID 원문(제출자 표시는 order_condition)');

-- ── D. 종목 필터 · 시세 맥락 ────────────────────────────────────────
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901'),
                                '$.events[*] ? (@.kind == 1 || @.kind == 2 || @.kind == 10)'),
          'D31 p_isin NULL 이면 시세 kind 1 · 2 · 10 은 events 에 없다');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003906', 'KR7282720005'), 'events'),
          'KYOBO119:1',
          'D32 U6(KYOBO119 만) 종목 A events = KYOBO119 시세만 — KB120 시세는 가시 계좌가 없어 빠진다');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003906'), 'events'), '',
          'D33 U6 p_isin NULL → 시세 맥락도 없음(빈 배열)');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003904', 'KR7282720005'),
                                '$.*[*] ? (@.isin == "KR7005930003")'),
          'D34 U4 종목 A 지정 → 종목 B 행이 orders · fills · events 어디에도 없다');
SELECT ok(jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003904'),
                            '$.*[*] ? (@.isin == "KR7005930003")'),
          'D34b (대조) U4 p_isin NULL → 같은 경로식이 참(그날 전 종목)');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904', 'KR7282720005'), 'orders'),
          'KB120:0000390401', 'D35 U4 종목 A orders = 종목 A 주문만');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904', 'KR7282720005'), 'fills'),
          'KB120:6', 'D36 U4 종목 A fills = 종목 A 체결만');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003904', 'KR7282720005'), 'events'),
          'KB120:8,KB120:13,KB120:9,KB120:10',
          'D37 U4 종목 A events = KB120 시세 1 · 자기 kind 3 · 시세 2 · 시세 10(U1 kind 3 · 9 없음)');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901'), 'fills'), 'KB120:2',
          'D38 U1 fills = 체결 E ∧ exec_qty>0 ∧ 그날 — 접수 A · 수량 0 · 다른 날짜 제외');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901'), 'orders'), 'KB120:0000390101',
          'D39 U1 orders = 주문번호 있음 ∧ 그날 — 거부 행(order_no NULL) · 다른 날짜 제외');

-- ── E. 모양 · 비반환 키 · 정렬 ──────────────────────────────────────
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'), '$.**.dma_user_id'),
          'E40 dma_user_id 키는 orders · fills · events 어디에도 없다(T-19-08)');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'), '$.**.requester'),
          'E41 requester 키는 어디에도 없다');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'), '$.**.applied_at'),
          'E42 applied_at 키는 어디에도 없다');
SELECT ok((SELECT jsonb_path_exists(x, '$.**.dma_user_id') AND jsonb_path_exists(x, '$.**.requester')
                  AND jsonb_path_exists(x, '$.**.applied_at')
             FROM (SELECT jsonb_build_object(
                            'orders', (SELECT jsonb_agg(to_jsonb(o)) FROM public.dma_account_orders o
                                        WHERE o.account_no = '1234563901'),
                            'events', (SELECT jsonb_agg(to_jsonb(e)) FROM public.dma_strategy_events e
                                        WHERE e.account_no = '1234563901')) AS x) t),
          'E42b (대조) 같은 경로식이 원천 행 jsonb 에선 셋 다 참 — E40~E42 가 공허한 참이 아니다');
SELECT is(pg_temp.objkeys(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'orders'->0),
          'account_no,board,created_ms,exchange,filled_qty,gateway,isin,message,order_no,order_type,org_order_no,'
          || 'origin,price,qty,result_code,side,status,stock_code,stock_name,updated_ms',
          'E43 orders 원소 키 20개');
SELECT is(pg_temp.objkeys(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'fills'->0),
          'account_no,exchange,exec_price,exec_qty,gateway,gw_time_ms,isin,order_no,seq,side,stock_code',
          'E44 fills 원소 키 11개');
SELECT set_eq(
  $$SELECT DISTINCT jsonb_object_keys(e)
      FROM jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005')->'events') e$$,
  $$SELECT column_name::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dma_strategy_events'
       AND column_name NOT IN ('dma_user_id', 'applied_at')
    UNION SELECT unnest(ARRAY['stock_code', 'stock_name'])$$,
  'E45 events 원소 키 = 표 칸 − dma_user_id − applied_at + stock_code · stock_name(주문로그 RPC 와 같은 꼴)');
SELECT is((SELECT (e->>'stock_code') || '|' || (e->>'stock_name')
             FROM jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003904')->'events') e
            WHERE (e->>'seq')::int = 11),
          '005930|삼성전자', 'E46 events stock_code · stock_name = stocks.isin 조인(종목 B)');
SELECT is((SELECT (o->>'stock_code') || '|' || (o->>'stock_name')
             FROM jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003904')->'orders') o
            WHERE o->>'order_no' = '0000390402'),
          '005930|삼성전자', 'E47 orders stock_code · stock_name = stocks.isin 조인(종목 B)');
SELECT is((SELECT (o->>'created_ms') || '|' || (o->>'updated_ms') || '|' || (f->>'gw_time_ms')
             FROM jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'orders') o,
                  jsonb_array_elements(pg_temp.dg('00000000-0000-4000-8000-000000003901')->'fills') f),
          '1793840400100|1793840400200|1793840400200',
          'E48 orders created_ms · updated_ms · fills gw_time_ms = epoch ms(10:00:00.100 · .200)');

-- ── F. 켜진 서버(Phase 38 D-03) — 레지스트리만 따른다 ────────────────
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003901', 'KR7282720005'),
                                '$.*[*] ? (@.gateway == "KB121")'),
          'F49 KB121(enabled=false) 행 없음 — 가시성 뷰에 걸려도 켜진 서버 조인이 거른다');

UPDATE public.dma_servers SET enabled = true WHERE key = 'KB121';
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901'), 'orders'),
          'KB120:0000390101,KB121:0000391101', 'F50 KB121 켠 뒤 U1 orders 에 KB121 주문 자동 포함');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901'), 'fills'),
          'KB120:2,KB121:1', 'F51 KB121 켠 뒤 U1 fills 에 KB121 체결 자동 포함(시각 순)');
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003901'), 'events'),
          'KB120:1,KB120:2,KB121:1',
          'F52 KB121 켠 뒤 U1 events 에 KB121 이벤트 — 같은 ms 는 gateway 순(KB120 → KB121)');
SELECT ok(NOT jsonb_path_exists(pg_temp.dg('00000000-0000-4000-8000-000000003904'),
                                '$.*[*] ? (@.gateway == "KB121")'),
          'F53 KB121 켠 뒤에도 어드민 U4 는 U1 의 KB121 행을 못 본다');

-- KYOBO119 를 끈다 — 주문 서버 플래그는 켜진 서버에만 설 수 있어(CHECK NOT is_order_server OR enabled) 같이 내린다.
UPDATE public.dma_servers SET enabled = false, is_order_server = false WHERE key = 'KYOBO119';
SELECT is(pg_temp.keys(pg_temp.dg('00000000-0000-4000-8000-000000003906', 'KR7282720005'), 'events'), '',
          'F54 KYOBO119 끈 뒤 U6 종목 A events 에서 KYOBO119 시세 빠짐');
SELECT is(pg_temp.dg('00000000-0000-4000-8000-000000003906', 'KR7282720005')->>'access', 'true',
          'F55 KYOBO119 끈 뒤에도 U6 게이트는 통과(가시성은 기록 조회 — 꺼진 서버 키도 가시 계좌) · 빈 배열');

-- ── H. 인덱스 ──────────────────────────────────────────────────────
SELECT has_index('public', 'dma_strategy_events', 'idx_dma_strategy_events_isin_day_acct',
                 ARRAY['trade_date', 'isin', 'exchange'],
                 'H56 부분 인덱스 idx_dma_strategy_events_isin_day_acct (trade_date, isin, exchange) 있음');
SELECT is((SELECT pg_get_expr(i.indpred, i.indrelid) FROM pg_index i
            WHERE i.indexrelid = 'public.idx_dma_strategy_events_isin_day_acct'::regclass),
          '(kind <> ALL (ARRAY[15, 16]))',
          'H57 부분 인덱스 조건 = kind NOT IN (15, 16)');

SELECT * FROM finish();
ROLLBACK;
