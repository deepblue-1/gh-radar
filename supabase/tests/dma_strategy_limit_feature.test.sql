-- ============================================================
-- Phase 28 Plan 02 — kind 15(상한가 특징 · LimitFeature) 시세 가시성 · jsonb 래퍼 · 30일 purge pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql
--
-- 잠그는 것:
--   - D-06 가시성: 계좌가 빈 kind 15 행은 그 게이트웨이에 가시 계좌가 있는 사용자 전원에게 보인다(시세 kind 집합
--     {1, 2, 10, 15} — packages/shared/src/strategy-event.ts isMarketStrategyEvent 와 같다). 매핑 없는 사용자 ·
--     다른 게이트웨이만 가진 사용자에게는 보이지 않는다.
--   - D-18 조회 분리: dma_strategy_events_for_user_json 은 SETOF 함수 결과를 같은 정렬(gw_time_ms → gateway → seq)로
--     jsonb 배열 하나에 접는다(PostgREST max_rows 1000 침묵 절단 회피 — RESEARCH Pitfall 2). 기본(인자 2개)은
--     kind 15 를 빼고, p_include_limit_feature = true 일 때만 싣는다. 행 없는 날은 '[]'.
--   - D-08 purge: dma_strategy_events_purge_limit_feature(p_keep_days) 는 kind = 15 AND trade_date < KST 오늘 − p_keep_days
--     만 지우고 지운 수를 돌려준다. 같은 옛날짜의 시세 1 · 주문 이벤트와 경계일(오늘 − 30) · 최근 kind 15 는 남는다.
--   - 부분 인덱스 idx_dma_strategy_events_limit_feature_day 존재 · 술어 kind = 15.
--   - 권한: 세 함수 모두 anon · authenticated EXECUTE 불가 · service_role 가능 (메모리 「Supabase RPC 는 REVOKE
--     anon/authenticated 명시」 · Pitfall 13).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_limit_feature.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다(픽스처를 이 파일 안에 다시 선언).
--
-- 날짜는 전부 KST 오늘 기준 상대값이다 — purge 의 기준이 now() 라 고정 날짜를 쓰면 시간이 지나며 단언이 바뀐다.
-- 단언 설명에는 (사용자, 게이트웨이, kind, 기대) 튜플을 적는다.
-- 사용자: U1 dma-lf-a → KB …7801 · U2 dma-lf-b → KB …7802 · U3 매핑 없음 · U4 dma-lf-k(KYOBO 연결) → KYOBO …7803.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처: 사용자 · 자격증명 · 종목 · 계좌 매핑 ──────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002801', 'lf-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000002802', 'lf-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000002803', 'lf-u3@example.invalid'),
  ('00000000-0000-4000-8000-000000002804', 'lf-u4@example.invalid');

-- Phase 29 v2 레지스트리: 가시성 = app_users(admin/trader)+DMA 연결 × dma_servers 전 서버 키. 키는 KB120 · KYOBO119.
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-lf-a','dma-lf-b','dma-lf-n','dma-lf-k']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('lf-u1@example.invalid','trader','dma-lf-a'),
  ('lf-u2@example.invalid','trader','dma-lf-b'),
  ('lf-u3@example.invalid','trader','dma-lf-n'),
  ('lf-u4@example.invalid','trader','dma-lf-k');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

INSERT INTO t_setup SELECT 'access_kb', to_jsonb(public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-lf-a","account_no":"1234567801","name":"위탁","priority":1},
  {"dma_user_id":"dma-lf-b","account_no":"1234567802","name":"위탁","priority":1}
]'::jsonb));
INSERT INTO t_setup SELECT 'access_kyobo', to_jsonb(public.dma_journal_sync_access('KYOBO119', '[
  {"dma_user_id":"dma-lf-k","account_no":"1234567803","name":"위탁","priority":1}
]'::jsonb));

-- KST 오늘 기준 날짜(문자열). 트랜잭션 안이라 now() 는 고정이다.
CREATE FUNCTION pg_temp.kd(p_offset int) RETURNS text LANGUAGE sql AS $$
  SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date - p_offset, 'YYYY-MM-DD')
$$;

-- 전략 이벤트 1건 — relay STRATEGY_APPLY_KEYS 43키(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT pg_temp.kd(0)
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind, 'group', p_group, 'exchange', 'KRX', 'isin', 'KR7005930003', 'cum_volume', 0,
    'dma_user_id', CASE WHEN p_account = '' THEN '' ELSE 'dma-audit' END,
    'account_no', p_account, 'order_no', p_order_no, 'price', 0, 'qty', 0, 'order_condition', '',
    'reason_code', '', 'cond_threshold', 0, 'cond_actual', 0, 'cond_metric', 0, 'ev_kind', 0, 'ev_price', 0,
    'ev_qty_before', 0, 'ev_qty_after', 0, 'ev_trade_qty', 0, 'limit_bid_qty', 0, 'bid1_price', 0,
    'bid1_qty', 0, 'accept_latency_us', 0, 'immediate_fill_qty', 0, 'queue_case', 0, 'base_cum', 0,
    'ahead_qty', 0, 'expected_cum', 0, 'error_volume', 0, 'remaining_volume', 0, 'has_remaining', false,
    'cancel_reason', 0, 'result_code', 0, 'message', '', 'entry_round', 0,
    'snap_qty', '[]'::jsonb, 'snap_cum', '[]'::jsonb, 'ask_qty_at_limit', 0, 'open_at_limit', false
  ) || p_over
$$;

-- kind 15 슬롯 예시(인박스 261005-limitup-feature-85 「(B)」 매핑 — 값 자체는 이 테스트가 판정하지 않는다).
CREATE FUNCTION pg_temp.lf() RETURNS jsonb LANGUAGE sql AS $$
  SELECT '{"entry_round":1,"qty":43,"ev_qty_before":1730000000,"message":"buy:00050=7407;sell:00002=10000|m=0","result_code":-1}'::jsonb
$$;

-- KB 전략 이벤트 (epoch ep-28).
INSERT INTO t_setup SELECT 'strategy_kb', public.dma_strategy_apply('KB120', 'ep-28', jsonb_build_array(
  -- 오늘 (가시성 · 래퍼)
  pg_temp.sev(1, 1, 0, '', '', '09:42:00.000', '{"ask_qty_at_limit":185400}'::jsonb),          -- 시세 LimitExposed
  pg_temp.sev(2, 3, 1, '1234567801', '12451', '09:45:00.000', '{"price":12350,"qty":300}'::jsonb), -- …7801 BuyOrder
  pg_temp.sev(3, 15, 0, '', '', '09:46:00.000', pg_temp.lf()),                                  -- 상한가 특징
  pg_temp.sev(4, 10, 0, '', '', '09:47:00.000', '{"cond_actual":3,"ev_trade_qty":123456}'::jsonb), -- 시세 BurstLimit
  pg_temp.sev(5, 15, 0, '', '', '09:48:00.000', pg_temp.lf()),                                  -- 상한가 특징
  pg_temp.sev(6, 4, 1, '1234567802', '22001', '09:49:00.000'),                                  -- …7802 Queued
  pg_temp.sev(7, 2, 0, '', '', '09:50:00.000'),                                                 -- 시세 LimitEntered
  -- KST 오늘 − 31일 (purge 대상은 kind 15 만)
  pg_temp.sev(11, 15, 0, '', '', '10:00:00.000', pg_temp.lf(), pg_temp.kd(31)),
  pg_temp.sev(12, 1, 0, '', '', '10:00:01.000', '{}'::jsonb, pg_temp.kd(31)),
  pg_temp.sev(13, 3, 1, '1234567801', '30001', '10:00:02.000', '{}'::jsonb, pg_temp.kd(31)),
  -- 경계일 KST 오늘 − 30일 (keep 30 → 남는다)
  pg_temp.sev(14, 15, 0, '', '', '10:00:00.000', pg_temp.lf(), pg_temp.kd(30)),
  -- 최근 KST 오늘 − 1일
  pg_temp.sev(15, 15, 0, '', '', '10:00:00.000', pg_temp.lf(), pg_temp.kd(1)),
  pg_temp.sev(16, 3, 1, '1234567801', '30002', '10:00:01.000', '{}'::jsonb, pg_temp.kd(1))
));
-- KYOBO 상한가 특징 1건 (오늘).
INSERT INTO t_setup SELECT 'strategy_kyobo', public.dma_strategy_apply('KYOBO119', 'ep-28k', jsonb_build_array(
  pg_temp.sev(1, 15, 0, '', '', '09:46:30.000', pg_temp.lf())
));

-- SETOF / jsonb 래퍼 결과를 (gateway, seq, kind, account_no) 순서열로 펼친다.
CREATE FUNCTION pg_temp.json_rows(p_user uuid, p_date date, p_lf boolean)
RETURNS TABLE (ord bigint, gateway text, seq int, kind int, account_no text) LANGUAGE sql AS $$
  SELECT x.ord, x.e->>'gateway', (x.e->>'seq')::int, (x.e->>'kind')::int, x.e->>'account_no'
    FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(p_user, p_date, p_lf)) WITH ORDINALITY AS x(e, ord)
$$;

SELECT plan(24);

-- ── 0. 픽스처 전제 ─────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE kind = 15),
  6, '(픽스처, KB+KYOBO, kind 15, 적재) 6행 — 오늘 KB 2 · KYOBO 1 · −31 · −30 · −1 각 1'
);

-- ── 1. SETOF 가시성 (D-06) ─────────────────────────────────────
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date) r$$,
  $$VALUES ('KB120', 1, 1, ''), ('KB120', 2, 3, '1234567801'), ('KB120', 3, 15, ''), ('KB120', 4, 10, ''),
           ('KB120', 5, 15, ''), ('KB120', 7, 2, '')$$,
  '(U1, KB, kind 15 계좌 '''', 오늘) 상한가 특징 seq 3 · 5 가 시세 1/2/10 · 자기 주문과 함께 gw_time_ms 순으로 보인다'
);
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002802', pg_temp.kd(0)::date) r$$,
  $$VALUES ('KB120', 1, 1, ''), ('KB120', 3, 15, ''), ('KB120', 4, 10, ''), ('KB120', 5, 15, ''),
           ('KB120', 6, 4, '1234567802'), ('KB120', 7, 2, '')$$,
  '(U2, KB, kind 15 계좌 '''', 오늘) 다른 계좌 사용자에게도 상한가 특징 seq 3 · 5 — 남의 주문 seq 2 는 없다'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002803', pg_temp.kd(0)::date)$$,
  '(U3, 매핑 없음, kind 15, 오늘) 0행 — 상한가 특징도 보이지 않는다'
);
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002804', pg_temp.kd(0)::date) r$$,
  $$VALUES ('KYOBO119', 1, 15, '')$$,
  '(U4, KYOBO, kind 15, 오늘) KYOBO 상한가 특징만 — KB kind 15 비공개'
);

-- ── 2. jsonb 래퍼 (D-18) ─────────────────────────────────────────
SELECT is(
  jsonb_typeof(public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date)),
  'array', '(U1, KB, —, 오늘) 래퍼는 jsonb 배열 하나(스칼라 — max_rows 무관)'
);
SELECT results_eq(
  $$SELECT x->>'gateway', (x->>'seq')::int, (x->>'kind')::int, x->>'account_no'
      FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(
        '00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date)) x$$,
  $$VALUES ('KB120', 1, 1, ''), ('KB120', 2, 3, '1234567801'), ('KB120', 4, 10, ''), ('KB120', 7, 2, '')$$,
  '(U1, KB, kind 15 제외, 오늘 · 인자 2개) 기본은 kind 15 를 빼고 시세 1/10/2 · 주문 이벤트를 gw_time_ms 순으로'
);
SELECT results_eq(
  $$SELECT gateway, seq, kind, account_no FROM pg_temp.json_rows('00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date, false) ORDER BY ord$$,
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date) r
     WHERE (r->>'kind')::int <> 15$$,
  '(U1, KB, kind 15 제외, 오늘 · false 명시) SETOF 결과에서 kind 15 만 뺀 것과 같은 행 · 같은 순서'
);
SELECT results_eq(
  $$SELECT gateway, seq, kind, account_no FROM pg_temp.json_rows('00000000-0000-4000-8000-000000002801', pg_temp.kd(0)::date, true) ORDER BY ord$$,
  $$VALUES ('KB120', 1, 1, ''), ('KB120', 2, 3, '1234567801'), ('KB120', 3, 15, ''), ('KB120', 4, 10, ''),
           ('KB120', 5, 15, ''), ('KB120', 7, 2, '')$$,
  '(U1, KB, kind 15 포함, 오늘 · true) 상한가 특징 seq 3 · 5 가 실린다 — SETOF 와 같은 순서'
);
SELECT results_eq(
  $$SELECT x FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(
      '00000000-0000-4000-8000-000000002802', pg_temp.kd(0)::date, true)) x$$,
  $$SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002802', pg_temp.kd(0)::date) r$$,
  '(U2, KB, kind 15 포함, 오늘) 원소가 SETOF 행 jsonb 와 바이트 단위로 같다(공개 키 · stock_code 그대로)'
);
SELECT results_eq(
  $$SELECT gateway, seq, kind FROM pg_temp.json_rows('00000000-0000-4000-8000-000000002804', pg_temp.kd(0)::date, true) ORDER BY ord$$,
  $$VALUES ('KYOBO119', 1, 15)$$,
  '(U4, KYOBO, kind 15 포함, 오늘) KYOBO 상한가 특징 한 행'
);
SELECT is(
  public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000002804', pg_temp.kd(0)::date),
  '[]'::jsonb, '(U4, KYOBO, kind 15 제외, 오늘 · 기본) kind 15 만 있는 날은 [] '
);
SELECT is(
  public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000002803', pg_temp.kd(0)::date, true),
  '[]'::jsonb, '(U3, 매핑 없음, kind 15 포함, 오늘) []'
);
SELECT is(
  public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000002801', '2020-01-02', true),
  '[]'::jsonb, '(U1, KB, —, 행 없는 날 2020-01-02) [] — null 이 아니다'
);

-- ── 3. purge (D-08) ─────────────────────────────────────────────
SELECT is(
  public.dma_strategy_events_purge_limit_feature(30),
  1, '(—, KB, kind 15, KST 오늘 − 31일) keep 30 → 1행 삭제 · 수를 돌려준다'
);
SELECT results_eq(
  $$SELECT gateway, seq::int, trade_date FROM public.dma_strategy_events WHERE kind = 15 ORDER BY gateway, seq$$,
  $$VALUES ('KB120', 3, pg_temp.kd(0)::date), ('KB120', 5, pg_temp.kd(0)::date), ('KB120', 14, pg_temp.kd(30)::date),
           ('KB120', 15, pg_temp.kd(1)::date), ('KYOBO119', 1, pg_temp.kd(0)::date)$$,
  '(—, KB+KYOBO, kind 15, 오늘 · −30 경계 · −1) 남는다 — −31 seq 11 만 사라졌다'
);
SELECT results_eq(
  $$SELECT seq::int, kind::int FROM public.dma_strategy_events
     WHERE gateway = 'KB120' AND trade_date = pg_temp.kd(31)::date ORDER BY seq$$,
  $$VALUES (12, 1), (13, 3)$$,
  '(—, KB, kind 1 · 3, KST 오늘 − 31일) 같은 옛날짜 시세 · 주문 이벤트는 감사 기록이라 남는다'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE kind <> 15),
  8, '(—, KB, kind ≠ 15, 전체) 비-15 행 8개 그대로'
);
SELECT is(
  public.dma_strategy_events_purge_limit_feature(30),
  0, '(—, KB, kind 15, 재실행) 지울 것이 없으면 0'
);

-- ── 4. 부분 인덱스 ─────────────────────────────────────────────
SELECT has_index(
  'public', 'dma_strategy_events', 'idx_dma_strategy_events_limit_feature_day',
  '(—, —, kind 15, 인덱스) idx_dma_strategy_events_limit_feature_day 가 있다'
);
SELECT is(
  (SELECT pg_get_expr(i.indpred, i.indrelid)
     FROM pg_index i WHERE i.indexrelid = 'public.idx_dma_strategy_events_limit_feature_day'::regclass),
  '(kind = 15)', '(—, —, kind 15, 인덱스 술어) WHERE kind = 15 부분 인덱스'
);

-- ── 5. 권한 (service_role 전용) ─────────────────────────────────
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_events_for_user(uuid,date)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_strategy_events_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_strategy_events_for_user_json EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_strategy_events_purge_limit_feature(integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_strategy_events_purge_limit_feature(integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_strategy_events_purge_limit_feature(integer)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_strategy_events_purge_limit_feature EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish(true);

ROLLBACK;
