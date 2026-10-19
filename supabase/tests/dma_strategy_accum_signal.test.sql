-- ============================================================
-- quick-261018-rfy — kind 16(매집감지 · AccumSignal) 시세 가시성 · 주문로그 래퍼 제외 · 30일 purge ·
-- isin 별 최신 읽기 RPC(dma_accum_signals_for_user_json) pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql
--
-- 잠그는 것:
--   - 가시성: 계좌가 빈 kind 16 행은 그 게이트웨이에 가시 계좌가 있는 사용자 전원에게 보인다(시세 kind 집합
--     {1, 2, 10, 15, 16} — packages/shared/src/strategy-event.ts isMarketStrategyEvent 와 같다). 매핑 없는 사용자 ·
--     다른 게이트웨이만 가진 사용자에게는 보이지 않는다.
--   - 주문로그 분리: dma_strategy_events_for_user_json 은 p_include_limit_feature 와 무관하게 kind 16 을 뺀다.
--   - purge: dma_strategy_events_purge_limit_feature(30) 가 KST 오늘 − 31일 kind 15 · 16 을 함께 지운다. 경계일(오늘 − 30) ·
--     최근 kind 16 · 같은 옛날짜 시세 1 · 주문 이벤트는 남는다.
--   - 부분 인덱스 idx_dma_strategy_events_accum_signal_day 존재 · 술어 kind = 16.
--   - accum RPC(20261019160000): (gateway, isin) 별 정확히 1행 — 그 게이트웨이의 최신 행(gw_time_ms desc → seq desc).
--     서버 사이 선택은 없다(서버 기준은 웹이 고른 계좌의 serverKey 로 고른다). 원소 = SETOF 행 jsonb 그대로 ·
--     gateway, isin 오름차순. 행 없는 날 '[]'. 복원 묶음 자르기(20261018233000 ⑤)는 게이트웨이별 그대로.
--   - 권한: 네 함수 모두 anon · authenticated EXECUTE 불가 · service_role 가능.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
--
-- 날짜는 전부 KST 오늘 기준 상대값이다 — purge 의 기준이 now() 라 고정 날짜를 쓰면 시간이 지나며 단언이 바뀐다.
-- 단언 설명에는 (사용자, 게이트웨이, kind, 기대) 튜플을 적는다.
-- 사용자: U1 dma-ac-a → KB120 …7811 + KYOBO119 …7813(두 게이트웨이를 다 본다 — quote-primary 단언용) ·
--         U2 dma-ac-b → KB120 …7812 · U3 dma-ac-n 매핑 없음.
-- 종목: A = KR7005930003 · B = KR7000660001 · C = KR7035720002 (isin 오름차순 B < A < C).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처: 사용자 · 자격증명 · 종목 · 계좌 매핑 ──────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002911', 'ac-u1@example.invalid'),
  ('00000000-0000-4000-8000-000000002912', 'ac-u2@example.invalid'),
  ('00000000-0000-4000-8000-000000002913', 'ac-u3@example.invalid');

-- Phase 29 v2 레지스트리: 가시성 = app_users(admin/trader)+DMA 연결 × dma_servers 전 서버 키 × 그 게이트웨이 계좌 매핑.
INSERT INTO public.dma_users (dma_user_id, password_enc)
SELECT d, 'test-enc' FROM unnest(ARRAY['dma-ac-a','dma-ac-b','dma-ac-n']) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('ac-u1@example.invalid','trader','dma-ac-a'),
  ('ac-u2@example.invalid','trader','dma-ac-b'),
  ('ac-u3@example.invalid','trader','dma-ac-n');

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

INSERT INTO t_setup SELECT 'access_kb', to_jsonb(public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-ac-a","account_no":"1234567811","name":"위탁","priority":1},
  {"dma_user_id":"dma-ac-b","account_no":"1234567812","name":"위탁","priority":1}
]'::jsonb));
INSERT INTO t_setup SELECT 'access_kyobo', to_jsonb(public.dma_journal_sync_access('KYOBO119', '[
  {"dma_user_id":"dma-ac-a","account_no":"1234567813","name":"위탁","priority":1}
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

-- kind 16 슬롯 예시(인박스 261018-accum-signal 43칸 표 — 값 자체는 이 테스트가 판정하지 않는다).
CREATE FUNCTION pg_temp.ac(p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'isin', p_isin, 'qty', 1, 'price', 10450, 'cond_threshold', 1234000000, 'expected_cum', 2, 'queue_case', 1,
    'snap_qty', '[9900, 10300]'::jsonb, 'snap_cum', '[100000000, 30]'::jsonb,
    'message', 'since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000')
$$;

-- KB120 전략 이벤트 (epoch ep-ac).
INSERT INTO t_setup SELECT 'strategy_kb', public.dma_strategy_apply('KB120', 'ep-ac', jsonb_build_array(
  -- 오늘
  pg_temp.sev(1, 16, 0, '', '', '10:14:30.000', pg_temp.ac('KR7005930003')),                   -- A 이른 분(10:14)
  pg_temp.sev(2, 16, 0, '', '', '10:15:00.000', pg_temp.ac('KR7000660001')),                   -- B 10:15
  pg_temp.sev(3, 16, 0, '', '', '10:15:05.000', pg_temp.ac('KR7005930003')),                   -- A 10:15 (그 분에서 KYOBO 보다 이르다)
  pg_temp.sev(4, 3, 1, '1234567811', '12451', '10:15:10.000', '{"price":12350,"qty":300}'::jsonb), -- …7811 BuyOrder
  pg_temp.sev(5, 15, 0, '', '', '10:15:20.000', '{"entry_round":1}'::jsonb),                   -- 상한가 특징
  pg_temp.sev(6, 1, 0, '', '', '10:15:30.000'),                                                 -- 시세 LimitExposed
  -- KST 오늘 − 31일 (purge 대상은 kind 15 · 16)
  pg_temp.sev(11, 16, 0, '', '', '10:00:00.000', pg_temp.ac('KR7005930003'), pg_temp.kd(31)),
  pg_temp.sev(12, 15, 0, '', '', '10:00:01.000', '{}'::jsonb, pg_temp.kd(31)),
  pg_temp.sev(13, 1, 0, '', '', '10:00:02.000', '{}'::jsonb, pg_temp.kd(31)),
  pg_temp.sev(14, 3, 1, '1234567811', '30001', '10:00:03.000', '{}'::jsonb, pg_temp.kd(31)),
  -- 경계일 KST 오늘 − 30일 (keep 30 → 남는다)
  pg_temp.sev(15, 16, 0, '', '', '10:00:00.000', pg_temp.ac('KR7005930003'), pg_temp.kd(30)),
  -- 최근 KST 오늘 − 1일
  pg_temp.sev(16, 16, 0, '', '', '10:00:00.000', pg_temp.ac('KR7005930003'), pg_temp.kd(1))
));
-- KYOBO119 전략 이벤트 (epoch ep-ack).
INSERT INTO t_setup SELECT 'strategy_kyobo', public.dma_strategy_apply('KYOBO119', 'ep-ack', jsonb_build_array(
  pg_temp.sev(1, 16, 0, '', '', '10:15:40.000', pg_temp.ac('KR7005930003')),                   -- A 같은 분 10:15 · 더 늦다
  pg_temp.sev(2, 16, 0, '', '', '10:16:00.000', pg_temp.ac('KR7000660001')),                   -- B 늦은 분 10:16
  pg_temp.sev(3, 16, 0, '', '', '10:20:00.000', pg_temp.ac('KR7035720002'))                    -- C KYOBO 만
));

-- KST 오늘 − 2일: 복원 묶음 시나리오(20261018233000 ⑤ — 2026-10-18 밤 재현). 같은 epoch · seq 는 이어서.
--   KB120: 21:32 복원 B · A(qc 3) → 21:33 B 첫 스냅샷(qc 2) → 23:16 복원 A · C(qc 3 · 40초 간격 = 같은 묶음) → 23:17 C 첫 스냅샷(qc 2).
--   KYOBO119: 21:32 복원 B(qc 3) → 23:16 복원 A(qc 3). → B 는 두 서버 모두 23:16 묶음에 없다 = 사라진 종목.
INSERT INTO t_setup SELECT 'strategy_kb_restore', public.dma_strategy_apply('KB120', 'ep-ac', jsonb_build_array(
  pg_temp.sev(21, 16, 0, '', '', '21:32:00.000', pg_temp.ac('KR7000660001') || '{"queue_case":3}', pg_temp.kd(2)),
  pg_temp.sev(22, 16, 0, '', '', '21:32:00.500', pg_temp.ac('KR7005930003') || '{"queue_case":3}', pg_temp.kd(2)),
  pg_temp.sev(23, 16, 0, '', '', '21:33:00.000', pg_temp.ac('KR7000660001') || '{"queue_case":2}', pg_temp.kd(2)),
  pg_temp.sev(24, 16, 0, '', '', '23:16:00.000', pg_temp.ac('KR7005930003') || '{"queue_case":3}', pg_temp.kd(2)),
  pg_temp.sev(25, 16, 0, '', '', '23:16:40.000', pg_temp.ac('KR7035720002') || '{"queue_case":3}', pg_temp.kd(2)),
  pg_temp.sev(26, 16, 0, '', '', '23:17:00.000', pg_temp.ac('KR7035720002') || '{"queue_case":2}', pg_temp.kd(2))
));
INSERT INTO t_setup SELECT 'strategy_kyobo_restore', public.dma_strategy_apply('KYOBO119', 'ep-ack', jsonb_build_array(
  pg_temp.sev(11, 16, 0, '', '', '21:32:00.000', pg_temp.ac('KR7000660001') || '{"queue_case":3}', pg_temp.kd(2)),
  pg_temp.sev(12, 16, 0, '', '', '23:16:05.000', pg_temp.ac('KR7005930003') || '{"queue_case":3}', pg_temp.kd(2))
));

-- jsonb 배열 RPC 결과를 (ord, gateway, seq, kind, isin) 순서열로 펼친다.
CREATE FUNCTION pg_temp.accum_rows(p_user uuid, p_date date)
RETURNS TABLE (ord bigint, gateway text, seq int, kind int, isin text) LANGUAGE sql AS $$
  SELECT x.ord, x.e->>'gateway', (x.e->>'seq')::int, (x.e->>'kind')::int, x.e->>'isin'
    FROM jsonb_array_elements(public.dma_accum_signals_for_user_json(p_user, p_date)) WITH ORDINALITY AS x(e, ord)
$$;

SELECT plan(28);

-- ── 0. 픽스처 전제 ─────────────────────────────────────────────
SELECT is(
  (SELECT key FROM public.dma_servers WHERE is_quote_primary),
  'KB120', '(픽스처, —, —, quote-primary) 시드 quote-primary 서버는 KB120'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE kind = 16),
  17, '(픽스처, KB120+KYOBO119, kind 16, 적재) 17행 — 오늘 KB 3 · KYOBO 3 · −31 · −30 · −1 각 1 · −2일 복원 묶음 KB 6 · KYOBO 2'
);

-- ── 1. SETOF 가시성 (시세 kind 16) ─────────────────────────────
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int, r->>'account_no'
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002912', pg_temp.kd(0)::date) r$$,
  $$VALUES ('KB120', 1, 16, ''), ('KB120', 2, 16, ''), ('KB120', 3, 16, ''), ('KB120', 5, 15, ''), ('KB120', 6, 1, '')$$,
  '(U2, KB120, kind 16 계좌 '''', 오늘) 매집감지 seq 1 · 2 · 3 이 시세 15 · 1 과 함께 보인다 — 남의 주문 seq 4 · KYOBO 행 없음'
);
SELECT results_eq(
  $$SELECT r->>'gateway', (r->>'seq')::int, (r->>'kind')::int
      FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date) r
     WHERE (r->>'kind')::int = 16$$,
  $$VALUES ('KB120', 1, 16), ('KB120', 2, 16), ('KB120', 3, 16), ('KYOBO119', 1, 16), ('KYOBO119', 2, 16), ('KYOBO119', 3, 16)$$,
  '(U1, KB120+KYOBO119, kind 16, 오늘) 두 게이트웨이 매집감지 6행 전부 gw_time_ms 순'
);
SELECT is_empty(
  $$SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002913', pg_temp.kd(0)::date)$$,
  '(U3, 매핑 없음, kind 16, 오늘) 0행 — 매집감지도 보이지 않는다'
);

-- ── 2. 주문로그 jsonb 래퍼는 kind 16 을 늘 뺀다 ─────────────────
SELECT results_eq(
  $$SELECT x->>'gateway', (x->>'seq')::int, (x->>'kind')::int
      FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(
        '00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date)) x$$,
  $$VALUES ('KB120', 4, 3), ('KB120', 6, 1)$$,
  '(U1, KB120+KYOBO119, kind 16 제외 · 15 제외, 오늘 · 기본) 주문 · 시세 1 만 — 매집감지 0행'
);
SELECT results_eq(
  $$SELECT x->>'gateway', (x->>'seq')::int, (x->>'kind')::int
      FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(
        '00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date, true)) x$$,
  $$VALUES ('KB120', 4, 3), ('KB120', 5, 15), ('KB120', 6, 1)$$,
  '(U1, KB120+KYOBO119, kind 16 제외 · 15 포함, 오늘 · lf=true) 상한가 특징은 실리고 매집감지는 여전히 0행'
);
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.dma_strategy_events_for_user_json(
     '00000000-0000-4000-8000-000000002912', pg_temp.kd(0)::date, true)) x WHERE (x->>'kind')::int = 16),
  0, '(U2, KB120, kind 16, 오늘 · lf=true) 래퍼 원소 중 kind 16 0개'
);

-- ── 3. accum RPC — (gateway, isin) 별 최신 1행 (20261019160000) ──
SELECT is(
  jsonb_typeof(public.dma_accum_signals_for_user_json('00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date)),
  'array', '(U1, —, kind 16, 오늘) accum RPC 는 jsonb 배열 하나'
);
SELECT results_eq(
  $$SELECT gateway, seq, kind, isin FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date) ORDER BY ord$$,
  $$VALUES ('KB120', 2, 16, 'KR7000660001'), ('KB120', 3, 16, 'KR7005930003'),
           ('KYOBO119', 2, 16, 'KR7000660001'), ('KYOBO119', 1, 16, 'KR7005930003'), ('KYOBO119', 3, 16, 'KR7035720002')$$,
  '(U1, KB120+KYOBO119, kind 16, 오늘) (gateway, isin) 별 1행 · gateway → isin 오름차순 — KB120 A 는 10:14 보다 늦은 10:15 seq 3 · KYOBO119 C 는 그 서버에만'
);
SELECT is(
  (SELECT count(*)::int FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date)),
  (SELECT count(DISTINCT (gateway, isin))::int FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002911', pg_temp.kd(0)::date)),
  '(U1, KB120+KYOBO119, kind 16, 오늘) 행 수 = 서로 다른 (gateway, isin) 수(정확히 1행씩)'
);
SELECT results_eq(
  $$SELECT gateway, seq, kind, isin FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002912', pg_temp.kd(0)::date) ORDER BY ord$$,
  $$VALUES ('KB120', 2, 16, 'KR7000660001'), ('KB120', 3, 16, 'KR7005930003')$$,
  '(U2, KB120 만, kind 16, 오늘) 가시 게이트웨이 행에서만 고른다 — A 는 10:14 보다 늦은 10:15 seq 3 · C 없음'
);
SELECT results_eq(
  $$SELECT x FROM jsonb_array_elements(public.dma_accum_signals_for_user_json(
      '00000000-0000-4000-8000-000000002912', pg_temp.kd(0)::date)) x$$,
  $$SELECT r FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000002912', pg_temp.kd(0)::date) r
     WHERE (r->>'kind')::int = 16 AND (r->>'seq')::int IN (2, 3) ORDER BY r->>'isin'$$,
  '(U2, KB120, kind 16, 오늘) 원소가 SETOF 행 jsonb 와 바이트 단위로 같다(공개 키 · stock_code 그대로 · dma_user_id 없음)'
);
SELECT is(
  public.dma_accum_signals_for_user_json('00000000-0000-4000-8000-000000002913', pg_temp.kd(0)::date),
  '[]'::jsonb, '(U3, 매핑 없음, kind 16, 오늘) []'
);
SELECT is(
  public.dma_accum_signals_for_user_json('00000000-0000-4000-8000-000000002911', '2020-01-02'),
  '[]'::jsonb, '(U1, KB120+KYOBO119, kind 16, 행 없는 날 2020-01-02) [] — null 이 아니다'
);
SELECT results_eq(
  $$SELECT gateway, seq, isin FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002911', pg_temp.kd(1)::date) ORDER BY ord$$,
  $$VALUES ('KB120', 16, 'KR7005930003')$$,
  '(U1, KB120, kind 16, KST 오늘 − 1일) 그날 행만 — 오늘 행이 섞이지 않는다'
);

-- ── 3b. 복원 묶음 = 그 서버의 전체 목록 (20261018233000 ⑤) ──────────
SELECT results_eq(
  $$SELECT gateway, seq, isin FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002911', pg_temp.kd(2)::date) ORDER BY ord$$,
  $$VALUES ('KB120', 24, 'KR7005930003'), ('KB120', 26, 'KR7035720002'), ('KYOBO119', 12, 'KR7005930003')$$,
  '(U1, KB120+KYOBO119, kind 16, −2일 복원 묶음) 23:16 묶음 전 행만 있는 B 는 두 서버 모두 빠진다 · KB120 A 복원 행 · C 첫 스냅샷 · KYOBO119 A 복원 행'
);
SELECT results_eq(
  $$SELECT gateway, seq, isin FROM pg_temp.accum_rows('00000000-0000-4000-8000-000000002912', pg_temp.kd(2)::date) ORDER BY ord$$,
  $$VALUES ('KB120', 24, 'KR7005930003'), ('KB120', 26, 'KR7035720002')$$,
  '(U2, KB120 만, kind 16, −2일 복원 묶음) 자르기는 게이트웨이별 — KB120 만 봐도 B 는 빠지고 A · C 만'
);

-- ── 4. purge — kind 15 · 16 함께 30일 ───────────────────────────
SELECT is(
  public.dma_strategy_events_purge_limit_feature(30),
  2, '(—, KB120, kind 15 · 16, KST 오늘 − 31일) keep 30 → 2행 삭제(15 하나 · 16 하나) · 수를 돌려준다'
);
SELECT results_eq(
  $$SELECT gateway, seq::int, trade_date FROM public.dma_strategy_events
     WHERE kind = 16 AND trade_date NOT IN (pg_temp.kd(0)::date, pg_temp.kd(2)::date) ORDER BY gateway, seq$$,
  $$VALUES ('KB120', 15, pg_temp.kd(30)::date), ('KB120', 16, pg_temp.kd(1)::date)$$,
  '(—, KB120, kind 16, −30 경계 · −1) 남는다 — −31 seq 11 만 사라졌다'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE kind = 16 AND trade_date = pg_temp.kd(0)::date),
  6, '(—, KB120+KYOBO119, kind 16, 오늘) 오늘 매집감지 6행 그대로'
);
SELECT results_eq(
  $$SELECT seq::int, kind::int FROM public.dma_strategy_events
     WHERE gateway = 'KB120' AND trade_date = pg_temp.kd(31)::date ORDER BY seq$$,
  $$VALUES (13, 1), (14, 3)$$,
  '(—, KB120, kind 1 · 3, KST 오늘 − 31일) 같은 옛날짜 시세 · 주문 이벤트는 감사 기록이라 남는다'
);
SELECT is(
  public.dma_strategy_events_purge_limit_feature(30),
  0, '(—, KB120, kind 15 · 16, 재실행) 지울 것이 없으면 0'
);

-- ── 5. 부분 인덱스 ─────────────────────────────────────────────
SELECT has_index(
  'public', 'dma_strategy_events', 'idx_dma_strategy_events_accum_signal_day',
  '(—, —, kind 16, 인덱스) idx_dma_strategy_events_accum_signal_day 가 있다'
);
SELECT is(
  (SELECT pg_get_expr(i.indpred, i.indrelid)
     FROM pg_index i WHERE i.indexrelid = 'public.idx_dma_strategy_events_accum_signal_day'::regclass),
  '(kind = 16)', '(—, —, kind 16, 인덱스 술어) WHERE kind = 16 부분 인덱스'
);

-- ── 6. 권한 (service_role 전용) ─────────────────────────────────
SELECT is(
  row(
    has_function_privilege('anon', 'public.dma_accum_signals_for_user_json(uuid,date)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.dma_accum_signals_for_user_json(uuid,date)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.dma_accum_signals_for_user_json(uuid,date)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'dma_accum_signals_for_user_json EXECUTE (anon, authenticated, service_role) = (f, f, t)'
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

SELECT * FROM finish();
ROLLBACK;
