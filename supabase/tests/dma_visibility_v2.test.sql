-- ============================================================
-- Phase 29 Plan 09 Task 2 — 가시성 뷰 v2 매트릭스 pgTAP (D-05 · D-21 · ADMIN-03).
--
-- 실행(픽스처는 새 키로 직접 만든다 · 29-26 배포 뒤 v2 는 migrations 에 있어 옵션 없이 전 재생):
--   bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_visibility_v2.test.sql
-- — 일회용 로컬 컨테이너에서만 돈다(공유 · 원격 DB 접촉 0). 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 잠그는 것:
--   - 뷰 v2 = 허용 표(app_users) admin/trader + DMA 연결 × 레지스트리(dma_servers) 전 서버 키.
--     열 (user_id, gateway, dma_user_id) 그대로 — dma_visible_accounts · 조회 RPC 는 무수정으로 v2 를 따른다
--   - viewer 0 (D-21) · 승인 대기(app_users 없음) 0 · DMA 연결 없는 trader 0
--   - 꺼진 서버(KB121) 키의 행도 보인다 · 레지스트리에 없는 키(옛 'KB')의 행은 아무에게도 안 보인다
--   - 같은 DMA id 를 공유하는 웹 사용자는 같은 계좌를 본다
--   - dma_journal_orders_for_user_json · dma_strategy_events_for_user 가 v2 아래에서 같은 가시 계좌만 돌려준다
--   - service_role 로 호출해도 동작(auth.users 는 SECURITY DEFINER 접근 맵이 읽는다) · 뷰 권한 3줄
--
-- 단언 설명에는 (사용자, 서버 키, 계좌 말미, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 사용자(역할 · DMA 연결):
--   T1 trader · d1     T3 trader · d1(공유)     A1 admin · d2
--   V1 viewer · d1     P1 승인 대기(app_users 없음)     T2 trader · 연결 없음
-- 매핑: KB120 d1 → …0001 · KYOBO119 d1 → …0011 · KB121(꺼짐) d1 → …0021 · KB120 d2 → …0002 · KB(옛 키) d1 → …0099
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002911', 'v2-t1@example.invalid'),
  ('00000000-0000-4000-8000-000000002912', 'v2-v1@example.invalid'),
  ('00000000-0000-4000-8000-000000002913', 'v2-p1@example.invalid'),
  ('00000000-0000-4000-8000-000000002914', 'v2-t2@example.invalid'),
  ('00000000-0000-4000-8000-000000002915', 'V2-T3@Example.invalid'),   -- 대소문자 — 접근 맵이 lower 로 맞춘다
  ('00000000-0000-4000-8000-000000002916', 'v2-a1@example.invalid');

INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('d1', 'test-enc-d1'), ('d2', 'test-enc-d2');

INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('v2-t1@example.invalid', 'trader', 'd1'),
  ('v2-v1@example.invalid', 'viewer', 'd1'),
  ('v2-t2@example.invalid', 'trader', NULL),
  ('v2-t3@example.invalid', 'trader', 'd1'),
  ('v2-a1@example.invalid', 'admin',  'd2');

INSERT INTO public.dma_account_access (gateway, dma_user_id, account_no) VALUES
  ('KB120',    'd1', '2900000001'),
  ('KYOBO119', 'd1', '2900000011'),
  ('KB121',    'd1', '2900000021'),
  ('KB120',    'd2', '2900000002'),
  ('KB',       'd1', '2900000099');

-- 오늘 주문 3건(…0001 · …0011 · …0002) + 매핑 밖 계좌 1건(…0099, 옛 키).
INSERT INTO public.dma_account_orders (gateway, trade_date, account_no, order_no, isin, exchange, order_type, qty, price,
                                       status, first_seq, last_seq, created_at, updated_at) VALUES
  ('KB120',    '2026-10-06', '2900000001', '0000291001', 'KR7005930003', 'KRX', 'N', 10, 1000, 'accepted', 1, 1, '2026-10-06 09:00:01+09', '2026-10-06 09:00:01+09'),
  ('KYOBO119', '2026-10-06', '2900000011', '0000291011', 'KR7005930003', 'KRX', 'N', 10, 1000, 'accepted', 1, 1, '2026-10-06 09:00:02+09', '2026-10-06 09:00:02+09'),
  ('KB120',    '2026-10-06', '2900000002', '0000291002', 'KR7005930003', 'KRX', 'N', 10, 1000, 'accepted', 2, 2, '2026-10-06 09:00:03+09', '2026-10-06 09:00:03+09'),
  ('KB',       '2026-10-06', '2900000099', '0000291099', 'KR7005930003', 'KRX', 'N', 10, 1000, 'accepted', 9, 9, '2026-10-06 09:00:04+09', '2026-10-06 09:00:04+09');

-- 전략 이벤트: 시세(kind 2, KB120) 1 · 주문(kind 3) KB120 …0001 · KB120 …0002 · KB …0099.
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty) VALUES
  ('KB120', 'v2-s', 1, '2026-10-06', 1791248401000, 2, 'KRX', 'KR7005930003', '',   '',           '',           1300, 0),
  ('KB120', 'v2-s', 2, '2026-10-06', 1791248402000, 3, 'KRX', 'KR7005930003', 'd1', '2900000001', '0000291001', 1000, 10),
  ('KB120', 'v2-s', 3, '2026-10-06', 1791248403000, 3, 'KRX', 'KR7005930003', 'd2', '2900000002', '0000291002', 1000, 10),
  ('KB',    'v2-s', 4, '2026-10-06', 1791248404000, 3, 'KRX', 'KR7005930003', 'd1', '2900000099', '0000291099', 1000, 10);

CREATE FUNCTION pg_temp.vis(p_user uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(gateway || ':' || account_no, ',' ORDER BY gateway, account_no), '')
    FROM public.dma_visible_accounts(p_user)
$$;

CREATE FUNCTION pg_temp.orders(p_user uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e->>'account_no', ',' ORDER BY e->>'account_no'), '')
    FROM jsonb_array_elements(public.dma_journal_orders_for_user_json(p_user, '2026-10-06')) e
$$;

CREATE FUNCTION pg_temp.strat(p_user uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((e->>'seq') || ':' || (e->>'gateway'), ',' ORDER BY (e->>'seq')::int), '')
    FROM public.dma_strategy_events_for_user(p_user, '2026-10-06') e
$$;

SELECT plan(19);

-- ── 1. 뷰 형태 — 열 · 원천 ──────────────────────────────────────
SELECT is(
  (SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY ordinal_position)
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dma_visibility_identities'),
  'user_id:uuid,gateway:text,dma_user_id:text', '(뷰 열) (user_id uuid, gateway text, dma_user_id text) — 옛 뷰와 같다(D-05)'
);
SELECT ok(
  pg_get_viewdef('public.dma_visibility_identities'::regclass) LIKE '%dma_app_access_map%'
  AND pg_get_viewdef('public.dma_visibility_identities'::regclass) LIKE '%dma_servers%'
  AND pg_get_viewdef('public.dma_visibility_identities'::regclass) NOT LIKE '%dma_credentials%',
  '(뷰 본문) 접근 맵 × 레지스트리 — dma_credentials 를 읽지 않는다'
);
SELECT is(
  (SELECT string_agg(gateway, ',' ORDER BY gateway) FROM public.dma_visibility_identities
    WHERE user_id = '00000000-0000-4000-8000-000000002911'),
  'KB120,KB121,KYOBO119,KYOBO127', '(T1 trader d1, 신원 키) = 레지스트리 전 서버 4개(꺼진 KB121 · KYOBO127 포함)'
);

-- ── 2. 가시 계좌 매트릭스 (dma_visible_accounts — 무수정 헬퍼) ─────────────
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002911'),
  'KB120:2900000001,KB121:2900000021,KYOBO119:2900000011',
  '(T1 trader d1, KB120 …0001 · KB121 …0021 · KYOBO119 …0011, 보임) — 두 증권사 · 꺼진 서버 키 포함');
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002915'),
  'KB120:2900000001,KB121:2900000021,KYOBO119:2900000011',
  '(T3 trader d1 공유 · 대문자 이메일, T1 과 같은 3계좌, 보임) — 같은 DMA id 는 같은 계좌');
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002916'),
  'KB120:2900000002', '(A1 admin d2, KB120 …0002, 보임) — admin 도 DMA 연결이 있으면 본다');
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002912'),
  '', '(V1 viewer d1, 전 계좌, 0) — viewer 는 DMA 연결이 있어도 0(D-21)');
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002913'),
  '', '(P1 승인 대기, 전 계좌, 0) — app_users 행 없음');
SELECT is(pg_temp.vis('00000000-0000-4000-8000-000000002914'),
  '', '(T2 trader 연결 없음, 전 계좌, 0)');
SELECT is(
  (SELECT count(*)::int FROM public.dma_visibility_identities i
     JOIN public.dma_account_access a ON a.gateway = i.gateway AND a.dma_user_id = i.dma_user_id
    WHERE a.gateway = 'KB'),
  0, '(전 사용자, KB(옛 키) …0099, 0) — 레지스트리에 없는 키의 행은 아무에게도 안 보인다');

-- ── 3. 조회 RPC — v2 아래에서 같은 가시 계좌만 ───────────────────────
SELECT is(pg_temp.orders('00000000-0000-4000-8000-000000002911'),
  '2900000001,2900000011', '(T1, 오늘 주문 …0001 · …0011, dma_journal_orders_for_user_json) — …0002 · …0099 제외');
SELECT is(pg_temp.orders('00000000-0000-4000-8000-000000002916'),
  '2900000002', '(A1, 오늘 주문 …0002, dma_journal_orders_for_user_json)');
SELECT is(pg_temp.orders('00000000-0000-4000-8000-000000002912'),
  '', '(V1 viewer, 오늘 주문 0, dma_journal_orders_for_user_json) — 빈 배열');
SELECT is(pg_temp.strat('00000000-0000-4000-8000-000000002911'),
  '1:KB120,2:KB120', '(T1, 전략 이벤트 seq 1 시세 · seq 2 …0001, dma_strategy_events_for_user) — seq 3 …0002 · seq 4 옛 키 제외');
SELECT is(pg_temp.strat('00000000-0000-4000-8000-000000002912'),
  '', '(V1 viewer, 전략 이벤트 0, dma_strategy_events_for_user) — 시세 이벤트도 0');
SELECT is(pg_temp.strat('00000000-0000-4000-8000-000000002914'),
  '', '(T2 연결 없음, 전략 이벤트 0, dma_strategy_events_for_user)');

-- ── 4. service_role 로 호출 — invoker 뷰 + SECURITY DEFINER 접근 맵 ─────────
SET LOCAL ROLE service_role;
CREATE TEMP TABLE t_sr AS
  SELECT string_agg(gateway || ':' || account_no, ',' ORDER BY gateway, account_no) AS v
    FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002911');
RESET ROLE;
SELECT is((SELECT v FROM t_sr),
  'KB120:2900000001,KB121:2900000021,KYOBO119:2900000011',
  '(T1, service_role 호출, 3계좌) — auth.users 직접 권한 없이 동작');

-- ── 5. 뷰 권한 ──────────────────────────────────────────────────
SELECT ok(
  NOT has_table_privilege('anon', 'public.dma_visibility_identities', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.dma_visibility_identities', 'SELECT'),
  '(뷰 권한, anon · authenticated) SELECT 없음'
);
SELECT ok(
  has_table_privilege('service_role', 'public.dma_visibility_identities', 'SELECT'),
  '(뷰 권한, service_role) SELECT 있음'
);

SELECT * FROM finish();

ROLLBACK;
