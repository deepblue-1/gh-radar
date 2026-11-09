-- ============================================================
-- quick-261109-dz1 — 매매 알림 계좌별 끄기(`dma_push_account_mutes` · RPC 2개 · dma_push_claim 기기 제외) pgTAP.
--
-- 잠그는 것:
--   | 절 | 내용                                                                                   | 근거          |
--   |----|----------------------------------------------------------------------------------------|---------------|
--   | 1  | 표 RLS 켜짐 · 정책 0 · SELECT (anon, authenticated, service_role) = (f, f, t) ·          | D-09          |
--   |    | 두 RPC EXECUTE = (f, f, t)                                                              |               |
--   | 2  | for_user 처음 [] · 끄기 true → 다시 false(멱등) · [A] · 다른 사용자 목록에 A 없음 ·     | D-02 · D-04 · |
--   |    | 두 계좌 오름차순 · 켜기 true → 다시 false · A 사라짐                                     | D-08          |
--   | 3  | 거부: 계좌 '' · 13자 · NULL / p_user_id NULL / p_enabled NULL                             | D-09          |
--   | 4  | claim: 끈 행 없음 기기 2 / U1 이 이 계좌 끔(U2 는 다른 계좌만) → U2 기기만 /              | D-01 · D-04 · |
--   |    | 둘 다 끔 → sends 0 · 체인 0 · 로그 0 / U1 다시 켬 → 같은 주문 재호출 U1 기기 1              | D-05          |
--   | 5  | auth.users 삭제 → 끈 행 CASCADE                                                         | D-09          |
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_account_mutes.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 픽스처: 사용자 U1 `00000000-0000-4000-8000-000000004021` · U2 `…4022` · 게이트웨이 'KB120' ·
-- 공유 계좌 '9900004021'(U1 · U2) · 종목 KR7282720005 금양그린파워 · 날짜 = 오늘 KST. 주문은 origin 'manual'
-- 신규(구분 짝 없이 바로 판정 — dma_push_claim.test.sql 19절과 같은 꼴).
-- 단언 설명에는 (사용자 · 계좌 · 상황, 기대) 를 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004021', 'push-mute-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000004022', 'push-mute-u2@example.invalid');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('282720', '금양그린파워', 'KOSDAQ', 'KR7282720005')
ON CONFLICT DO NOTHING;

-- 오늘 KST 의 hh:mi:ss 시각(fixture 전용).
CREATE FUNCTION pg_temp.kst(p_hms text) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (((now() AT TIME ZONE 'Asia/Seoul')::date)::text || ' ' || p_hms || '+09')::timestamptz;
$$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date;
$$;

CREATE TEMP TABLE t_res (name text PRIMARY KEY, r jsonb) ON COMMIT DROP;

-- 주문 투영 행 1개(fixture 전용). 계좌 '9900004021' · 종목 금양그린파워 · KRX.
CREATE PROCEDURE pg_temp.ord(
  p_order_no text, p_type text, p_org text, p_qty integer, p_price integer, p_filled integer, p_status text,
  p_origin text, p_side text, p_hms text, p_requester text DEFAULT NULL, p_date date DEFAULT NULL,
  p_message text DEFAULT NULL, p_account text DEFAULT '9900004021'
) LANGUAGE sql AS $$
  INSERT INTO public.dma_account_orders (
    gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, org_order_no, qty, price,
    filled_qty, status, origin, requester, message, first_seq, last_seq, created_at, updated_at
  ) VALUES (
    'KB120', coalesce(p_date, pg_temp.today()), p_account, p_order_no, 'KR7282720005', 'KRX', p_side, p_type,
    p_org, p_qty, p_price, p_filled, p_status, p_origin, p_requester, p_message, 1, 1,
    pg_temp.kst(p_hms), pg_temp.kst(p_hms)
  );
$$;

-- ── 1절: 잠금 (D-09) ─────────────────────────────────────────────
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dma_push_account_mutes'::regclass),
  true, '(dma_push_account_mutes, 표) RLS 켜짐'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dma_push_account_mutes'),
  0, '(dma_push_account_mutes, 표) 정책 0 — 서비스롤 전용'
);
SELECT is(
  ARRAY[has_table_privilege('anon', 'public.dma_push_account_mutes', 'SELECT'),
        has_table_privilege('authenticated', 'public.dma_push_account_mutes', 'SELECT'),
        has_table_privilege('service_role', 'public.dma_push_account_mutes', 'SELECT')],
  ARRAY[false, false, true],
  '(dma_push_account_mutes, 표) SELECT (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  ARRAY[has_function_privilege('anon', 'public.dma_push_account_mutes_for_user(uuid)', 'EXECUTE'),
        has_function_privilege('authenticated', 'public.dma_push_account_mutes_for_user(uuid)', 'EXECUTE'),
        has_function_privilege('service_role', 'public.dma_push_account_mutes_for_user(uuid)', 'EXECUTE')],
  ARRAY[false, false, true],
  '(dma_push_account_mutes_for_user, RPC) EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  ARRAY[has_function_privilege('anon', 'public.dma_push_account_mute_set(uuid, text, boolean)', 'EXECUTE'),
        has_function_privilege('authenticated', 'public.dma_push_account_mute_set(uuid, text, boolean)', 'EXECUTE'),
        has_function_privilege('service_role', 'public.dma_push_account_mute_set(uuid, text, boolean)', 'EXECUTE')],
  ARRAY[false, false, true],
  '(dma_push_account_mute_set, RPC) EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

-- ── 2절: RPC 멱등 · 본인 행만 (D-02 · D-04 · D-08) ─────────────────
SELECT is(
  public.dma_push_account_mutes_for_user('00000000-0000-4000-8000-000000004021'),
  '[]'::jsonb, '(U1, 끈 행 없음) for_user = [] — 기본 켜짐'
);
SELECT is(
  public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '9900004021', false),
  true, '(U1 · 9900004021, 끄기 처음) = true(상태 바뀜)'
);
SELECT is(
  public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '9900004021', false),
  false, '(U1 · 9900004021, 끄기 다시) = false(멱등)'
);
SELECT is(
  public.dma_push_account_mutes_for_user('00000000-0000-4000-8000-000000004021'),
  '["9900004021"]'::jsonb, '(U1, 9900004021 끔) for_user = ["9900004021"]'
);
SELECT ok(
  NOT (public.dma_push_account_mutes_for_user('00000000-0000-4000-8000-000000004022') ? '9900004021'),
  '(U2, U1 이 공유 계좌 9900004021 끔) U2 목록에 9900004021 없음 (D-04)'
);
INSERT INTO t_res VALUES ('mute_u1_b', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004021', '1100000001', false)));
SELECT is(
  public.dma_push_account_mutes_for_user('00000000-0000-4000-8000-000000004021'),
  '["1100000001", "9900004021"]'::jsonb, '(U1, 두 계좌 끔) for_user = account_no 오름차순'
);
SELECT is(
  public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '9900004021', true),
  true, '(U1 · 9900004021, 켜기 처음) = true(행 지움)'
);
SELECT is(
  public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '9900004021', true),
  false, '(U1 · 9900004021, 켜기 다시) = false(멱등)'
);
SELECT is(
  public.dma_push_account_mutes_for_user('00000000-0000-4000-8000-000000004021'),
  '["1100000001"]'::jsonb, '(U1, 9900004021 다시 켬) for_user 에서 9900004021 사라짐'
);
-- 다른 계좌도 켜 둔다 — 4절은 끈 행 없음에서 시작한다.
INSERT INTO t_res VALUES ('unmute_u1_b', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004021', '1100000001', true)));

-- ── 3절: 거부 (D-09) ─────────────────────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '', false)$$,
  '22023', NULL, '(U1 · 계좌 빈 문자열, 끄기) 22023 거부'
);
SELECT throws_ok(
  $$SELECT public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '1234567890123', false)$$,
  '22023', NULL, '(U1 · 계좌 13자, 끄기) 22023 거부'
);
SELECT throws_ok(
  $$SELECT public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', NULL, false)$$,
  '22023', NULL, '(U1 · 계좌 NULL, 끄기) 22023 거부'
);
SELECT throws_ok(
  $$SELECT public.dma_push_account_mute_set(NULL, '9900004021', false)$$,
  '22004', NULL, '(사용자 NULL · 9900004021, 끄기) 22004 거부'
);
SELECT throws_ok(
  $$SELECT public.dma_push_account_mute_set('00000000-0000-4000-8000-000000004021', '9900004021', NULL)$$,
  '22004', NULL, '(U1 · 9900004021, p_enabled NULL) 22004 거부'
);

-- ── 4절: dma_push_claim 기기 제외 (D-01 · D-04 · D-05) ──────────────
-- U1 iOS · U2 Android 기기 각 1(켜짐).
INSERT INTO t_res VALUES ('dev_u1_ios', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004021', '40214021-0000-4000-8000-000000000001', 'ios',
  'ios-token-u1-0000000000004021', 'iPhone'));
INSERT INTO t_res VALUES ('dev_u2_android', public.dma_push_device_upsert(
  '00000000-0000-4000-8000-000000004022', '40224022-0000-4000-8000-000000000002', 'android',
  'android-token-u2-000000000004022', 'Galaxy'));

-- 끈 행 없음 → 두 사용자 기기 모두(D-02 기존 동작).
CALL pg_temp.ord('0004221', 'N', NULL, 100, 3000, 0, 'accepted', 'manual', 'B', '10:00:00');
INSERT INTO t_res VALUES ('c1', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004221'),
  '[]'::jsonb, '{"9900004021": ["00000000-0000-4000-8000-000000004021", "00000000-0000-4000-8000-000000004022"]}'::jsonb,
  '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c1') #> '{sends,0,devices}'), 2,
  '(U1 · U2 · 9900004021 · 0004221, 끈 행 없음) devices 2');

-- U2 는 다른 계좌만 끔 · U1 은 이 계좌를 끔 → U2 기기만.
INSERT INTO t_res VALUES ('mute_u2_other', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004022', '9900004099', false)));
INSERT INTO t_res VALUES ('mute_u1_a', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004021', '9900004021', false)));
CALL pg_temp.ord('0004222', 'N', NULL, 100, 3000, 0, 'accepted', 'manual', 'B', '10:01:00');
INSERT INTO t_res VALUES ('c2', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004222'),
  '[]'::jsonb, '{"9900004021": ["00000000-0000-4000-8000-000000004021", "00000000-0000-4000-8000-000000004022"]}'::jsonb,
  '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c2') #> '{sends,0,devices}'), 1,
  '(U1 이 9900004021 끔 · U2 는 9900004099 만 끔 · 0004222) devices 1');
SELECT is((SELECT r FROM t_res WHERE name = 'c2') #>> '{sends,0,devices,0,platform}', 'android',
  '(U1 이 9900004021 끔 · 0004222) 남은 기기 = U2 Android (U1 iOS 제외 · D-04 다른 계좌 끈 행 영향 없음)');

-- 둘 다 이 계좌를 끔 → 기기 0 → 체인 · 로그 미기록.
INSERT INTO t_res VALUES ('mute_u2_a', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004022', '9900004021', false)));
CALL pg_temp.ord('0004223', 'N', NULL, 100, 3000, 0, 'accepted', 'manual', 'B', '10:02:00');
INSERT INTO t_res VALUES ('c3', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004223'),
  '[]'::jsonb, '{"9900004021": ["00000000-0000-4000-8000-000000004021", "00000000-0000-4000-8000-000000004022"]}'::jsonb,
  '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c3') -> 'sends'), 0,
  '(U1 · U2 둘 다 9900004021 끔 · 0004223) sends 0');
SELECT is((SELECT count(*)::int FROM public.dma_push_chains WHERE chain_key = '0004223'), 0,
  '(U1 · U2 둘 다 끔 · 0004223) 체인 행 0 — 다시 켜면 받는다');
SELECT is((SELECT count(*)::int FROM public.dma_push_log WHERE chain_key = '0004223'), 0,
  '(U1 · U2 둘 다 끔 · 0004223) 로그 행 0');

-- U1 다시 켬 → 같은 주문 재판정 → U1 기기만 받는다.
INSERT INTO t_res VALUES ('unmute_u1_a', to_jsonb(public.dma_push_account_mute_set(
  '00000000-0000-4000-8000-000000004021', '9900004021', true)));
INSERT INTO t_res VALUES ('c4', public.dma_push_claim('KB120',
  ARRAY(SELECT id FROM public.dma_account_orders WHERE order_no = '0004223'),
  '[]'::jsonb, '{"9900004021": ["00000000-0000-4000-8000-000000004021", "00000000-0000-4000-8000-000000004022"]}'::jsonb,
  '{ios,android}', false));
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c4') -> 'sends'), 1,
  '(U1 다시 켬 · 0004223 재호출) sends 1');
SELECT is(jsonb_array_length((SELECT r FROM t_res WHERE name = 'c4') #> '{sends,0,devices}'), 1,
  '(U1 다시 켬 · U2 는 끈 채 · 0004223 재호출) devices 1');
SELECT is((SELECT r FROM t_res WHERE name = 'c4') #>> '{sends,0,devices,0,platform}', 'ios',
  '(U1 다시 켬 · 0004223 재호출) 기기 = U1 iOS');

-- ── 5절: 사용자 삭제 → 끈 행 CASCADE (D-09) ─────────────────────────
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000004022';
SELECT is(
  (SELECT count(*)::int FROM public.dma_push_account_mutes WHERE user_id = '00000000-0000-4000-8000-000000004022'),
  0, '(U2 auth.users 삭제) U2 끈 행 0 — ON DELETE CASCADE'
);

SELECT * FROM finish();

ROLLBACK;
