-- ============================================================
-- Phase 35 Plan 10 — kind 17(LaunchPiece) · 18(LaunchHead) 정식 칸 매핑 pgTAP(Wave B · D-06).
--
-- 대상 마이그레이션: supabase/migrations/20261028200000_launch_project_mapping.sql
--   (launch_project_event 를 같은 시그니처로 교체 — 스텁 → 정식 매핑)
-- 매핑 정본: docs/inbox/from-gh-trade/261028-launch-plan-contract.md ⓑ (from_commit 2e090eb9 · fbs_sync_marker f156cb6f)
--   = gh-trade server/src/trade/queued/LaunchJournal.h 머리 주석.
--
-- 잠그는 것(원문 값은 노트 예시 · 10/12 백필 ndjson 의 KB120 코스피 Q16 조각 값):
--   1. Q16 조각 4건(101 · 접수 · 탐침 무응답 · 기타 F083) → launch_pieces 의 모든 칸이 노트 표대로 —
--      칸별 센티널(order_no "" · accept_time 0 · result_code 0 → null · round −1 = 탐침 그대로 · filled_qty 0 = 모름 → null) ·
--      result(queue_case) · result_code(message rc= 원문) · 버리는 3칸(base_cum · error_volume · remaining_volume) 비투영.
--   2. A1: N 매수(NXT 090030000 B) · A KRX 090027000 매수 · N NXT 090030000 매도 = 세 행 · 키가 서로 다름 ·
--      side buy/buy/sell · N 재전송대상 거부의 515 판정(result_code 515 또는 rc 0515/E127).
--   3. Q16 머리 · N 머리 · A 머리 → launch_heads — next_offset_us = cond_threshold 직접(A2 폴백 공식 미사용) ·
--      gate lo/hi 는 0 + lo=-/hi=- 일 때만 null(hi=0 은 0) · first_accept_idx −1 · one_way/rtt 0 → null ·
--      fire_at_us = message fire=(KST) epoch µs · 학습 8칸 null · plan_rev(entry_round) 비투영.
--   4. 도착 순서 무관(머리 먼저 배치 / 조각 먼저 배치) · 같은 배치 재전송 = skipped · updated_at 불변.
--   5. 스텁 시절 원문(테스트 안에서 스텁으로 갈아 끼우고 적재 → 매핑 복원) → launch_reproject 로 같은 행 · 2회 멱등.
--   6. 가시성(D-05): apply rows 에 17·18 없음 · 주문로그 래퍼에 17·18 없음 · launch_map_for_admin('n0930') =
--      N 매수 + N 매도(A KRX 다리 없음) · 주문 내역에는 A KRX 다리가 있다.
--   7. 포이즌: profile 을 모르는 kind 17(cond_metric 0) → errors 1(필수 키 누락) · 원문은 남는다 · kind 1 은 투영 안 함.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_project_mapping.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (게이트웨이 epoch seq, kind, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 전략 이벤트 1건 — relay `STRATEGY_APPLY_KEYS` 43키 전부(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
-- (launch_gate_apply.test.sql 의 헬퍼 그대로)
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT '2026-10-28'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind,
    'group', p_group,
    'exchange', 'KRX',
    'isin', 'KR7005930003',
    'cum_volume', 0,
    'dma_user_id', CASE WHEN p_account = '' THEN '' ELSE 'dma-shared' END,
    'account_no', p_account,
    'order_no', p_order_no,
    'price', 0,
    'qty', 0,
    'order_condition', '',
    'reason_code', '',
    'cond_threshold', 0,
    'cond_actual', 0,
    'cond_metric', 0,
    'ev_kind', 0,
    'ev_price', 0,
    'ev_qty_before', 0,
    'ev_qty_after', 0,
    'ev_trade_qty', 0,
    'limit_bid_qty', 0,
    'bid1_price', 0,
    'bid1_qty', 0,
    'accept_latency_us', 0,
    'immediate_fill_qty', 0,
    'queue_case', 0,
    'base_cum', 0,
    'ahead_qty', 0,
    'expected_cum', 0,
    'error_volume', 0,
    'remaining_volume', 0,
    'has_remaining', false,
    'cancel_reason', 0,
    'result_code', 0,
    'message', '',
    'entry_round', 0,
    'snap_qty', '[]'::jsonb,
    'snap_cum', '[]'::jsonb,
    'ask_qty_at_limit', 0,
    'open_at_limit', false
  ) || p_over
$$;

-- 노트 예시 원문 칸(이름 → 덮어쓸 칸). kind 17 은 계좌 · 사용자를 싣고, kind 18 은 비운다(노트 ⓑ).
CREATE TEMP TABLE t_ex (name text PRIMARY KEY, kind smallint NOT NULL, hms text NOT NULL, over jsonb NOT NULL);
INSERT INTO t_ex VALUES
-- Q16 KB120 코스피 — wire 0: 재전송대상 거부 101(재전송 1 · 포기) · 버리는 칸(base_cum · error_volume · remaining_volume)에 값이 있다
('q16_w0', 17, '15:59:59.999', '{
  "exchange":"KRX","cond_metric":1,"expected_cum":160000000,"ev_kind":75,"entry_round":0,
  "message":"q=Q153027001|res=101|rc=0101","ev_qty_before":0,"ev_price":0,"has_remaining":false,
  "order_no":"3404000288","base_cum":3404000287,"cond_threshold":-305,"error_volume":-350,"remaining_volume":-350,
  "queue_case":2,"result_code":101,"cond_actual":155959999,"ev_qty_after":1,"cancel_reason":1,
  "order_condition":"B","isin":"KR7005930003","price":11070,"qty":3613,"ev_trade_qty":0,
  "account_no":"37728502101","dma_user_id":"junysim"}'),
-- wire 1: 접수(rc 빈 값 · result_code 0)
('q16_w1', 17, '15:59:59.999', '{
  "exchange":"KRX","cond_metric":1,"expected_cum":160000000,"ev_kind":75,"entry_round":1,
  "message":"q=Q153027001|res=접수|rc=","ev_qty_before":1,"ev_price":1,"has_remaining":false,
  "order_no":"3404000289","base_cum":3404000289,"cond_threshold":-296,"error_volume":-345,"remaining_volume":-350,
  "queue_case":1,"result_code":0,"cond_actual":160000012,"ev_qty_after":0,"cancel_reason":0,
  "order_condition":"B","isin":"KR7005930003","price":11070,"qty":3613,"ev_trade_qty":0,
  "account_no":"37728502101","dma_user_id":"junysim"}'),
-- wire 2: 탐침(round −1 · probe) · 무응답 · 주문번호 "" · 접수시각 0
('q16_w2', 17, '15:59:59.999', '{
  "exchange":"KRX","cond_metric":1,"expected_cum":160000000,"ev_kind":75,"entry_round":2,
  "message":"q=Q153027001|res=무응답|rc=","ev_qty_before":2,"ev_price":-1,"has_remaining":true,
  "order_no":"","base_cum":0,"cond_threshold":-290,"error_volume":-350,"remaining_volume":-350,
  "queue_case":4,"result_code":0,"cond_actual":0,"ev_qty_after":0,"cancel_reason":0,
  "order_condition":"B","isin":"KR7005930003","price":11070,"qty":1,"ev_trade_qty":0,
  "account_no":"37728502101","dma_user_id":"junysim"}'),
-- wire 3: 기타 거부 F083(정수 result_code 는 −1000 으로 접힌다 — rc 원문이 이긴다)
('q16_w3', 17, '15:59:59.999', '{
  "exchange":"KRX","cond_metric":1,"expected_cum":160000000,"ev_kind":75,"entry_round":3,
  "message":"q=Q153027001|res=기타|rc=F083","ev_qty_before":3,"ev_price":2,"has_remaining":false,
  "order_no":"3404000291","base_cum":3404000291,"cond_threshold":-285,"error_volume":-325,"remaining_volume":-350,
  "queue_case":3,"result_code":-1000,"cond_actual":0,"ev_qty_after":0,"cancel_reason":0,
  "order_condition":"B","isin":"KR7005930003","price":11070,"qty":3614,"ev_trade_qty":0,
  "account_no":"37728502101","dma_user_id":"junysim"}'),
-- Q16 머리 — 그 회차 17 들 뒤(seq 큼). 학습값 칸은 노트에서 폐지(D-12) — 원문에 없다.
('q16_head', 18, '16:00:01.000', '{
  "exchange":"KRX","cond_metric":1,"expected_cum":160000000,"ev_kind":75,"isin":"",
  "cond_threshold":-337,"cond_actual":-350,"error_volume":-305,"remaining_volume":-296,"has_remaining":true,
  "cancel_reason":0,"ev_price":4,"ev_qty_before":1,"ev_qty_after":2,"ev_trade_qty":2,"limit_bid_qty":1,
  "bid1_price":1,"bid1_qty":1,"accept_latency_us":1850,"immediate_fill_qty":3700,"entry_round":2,
  "message":"plan=-350,-345,-325|rev=2|fire=155959.999650|lo=-305|hi=-296"}'),
-- 09:00 KYOBO119 코스닥 — N 매수(NXT · B · 재전송대상 거부 515: result_code 515 · rc 0515)
('n_buy', 17, '09:00:29.999', '{
  "exchange":"NXT","cond_metric":3,"expected_cum":90030000,"ev_kind":81,"entry_round":0,
  "message":"q=N|res=101|rc=0515","ev_qty_before":0,"ev_price":0,"has_remaining":false,
  "order_no":"0000071001","base_cum":71000,"cond_threshold":-200,"error_volume":-200,"remaining_volume":-200,
  "queue_case":2,"result_code":515,"cond_actual":90030001,"ev_qty_after":2,"cancel_reason":1,
  "order_condition":"B","isin":"KR7005930003","price":12350,"qty":300,"ev_trade_qty":0,
  "account_no":"1234567801","dma_user_id":"dma-lg-a"}'),
-- A 09:00:27 KRX 매수(접수)
('a_krx_buy', 17, '09:00:26.999', '{
  "exchange":"KRX","cond_metric":2,"expected_cum":90027000,"ev_kind":81,"entry_round":0,
  "message":"q=A|res=접수|rc=","ev_qty_before":0,"ev_price":0,"has_remaining":false,
  "order_no":"0000070001","base_cum":70001,"cond_threshold":-150,"error_volume":-150,"remaining_volume":-150,
  "queue_case":1,"result_code":0,"cond_actual":90027000,"ev_qty_after":0,"cancel_reason":0,
  "order_condition":"B","isin":"KR7005930003","price":12350,"qty":300,"ev_trade_qty":0,
  "account_no":"1234567801","dma_user_id":"dma-lg-a"}'),
-- A 의 「둘째 다리」 = N 프로파일 NXT 매도(S) — 재전송대상 거부지만 정수 result_code 는 −1000 · rc E127 → 515
('n_sell', 17, '09:00:29.999', '{
  "exchange":"NXT","cond_metric":3,"expected_cum":90030000,"ev_kind":81,"entry_round":1,
  "message":"q=N|res=101|rc=E127","ev_qty_before":1,"ev_price":0,"has_remaining":false,
  "order_no":"0000071002","base_cum":71002,"cond_threshold":-195,"error_volume":-200,"remaining_volume":-200,
  "queue_case":2,"result_code":-1000,"cond_actual":0,"ev_qty_after":0,"cancel_reason":0,
  "order_condition":"S","isin":"KR7005930003","price":12400,"qty":300,"ev_trade_qty":0,
  "account_no":"1234567801","dma_user_id":"dma-lg-a"}'),
-- A 머리 1행(KRX 다리)
('a_head', 18, '09:00:28.000', '{
  "exchange":"KRX","cond_metric":2,"expected_cum":90027000,"ev_kind":81,"isin":"",
  "cond_threshold":-150,"cond_actual":-150,"error_volume":0,"remaining_volume":-150,"has_remaining":false,
  "cancel_reason":0,"ev_price":1,"ev_qty_before":1,"ev_qty_after":0,"ev_trade_qty":0,"limit_bid_qty":0,
  "bid1_price":0,"bid1_qty":0,"accept_latency_us":900,"immediate_fill_qty":1800,"entry_round":3,
  "message":"plan=-150|rev=3|fire=090026.999850|lo=-|hi=-150"}'),
-- N 머리 1행(매수 · 매도 합산) — lo 없음(0 + lo=-) · hi 는 진짜 0(0 + hi=0) · 접수 없음(−1) · 예열 표본 없음(0)
('n_head', 18, '09:00:31.000', '{
  "exchange":"NXT","cond_metric":3,"expected_cum":90030000,"ev_kind":81,"isin":"",
  "cond_threshold":-180,"cond_actual":-200,"error_volume":0,"remaining_volume":0,"has_remaining":false,
  "cancel_reason":0,"ev_price":2,"ev_qty_before":0,"ev_qty_after":2,"ev_trade_qty":0,"limit_bid_qty":-1,
  "bid1_price":0,"bid1_qty":0,"accept_latency_us":0,"immediate_fill_qty":0,"entry_round":3,
  "message":"plan=-200|rev=3|fire=090029.999800|lo=-|hi=0"}'),
-- 포이즌 — profile 을 모르는 kind 17(cond_metric 0)
('bad_profile', 17, '15:59:59.999', '{
  "exchange":"KRX","cond_metric":0,"expected_cum":160000000,"ev_kind":75,"entry_round":9,
  "message":"q=Q153027001|res=접수|rc=","queue_case":1,"cond_threshold":-300}');

-- 이름 → 원문 이벤트(seq 지정).
CREATE FUNCTION pg_temp.ex(p_seq bigint, p_name text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, e.kind, 0, '', '', e.hms, e.over) FROM t_ex e WHERE e.name = p_name
$$;

-- 조각 · 머리 한 행을 비교용 텍스트로(게이트웨이 · 추적 열 · 시각 열 제외 — 순서 · 재해석 비교용).
CREATE FUNCTION pg_temp.prow(p_gw text, p_profile text, p_ex text, p_wire int) RETURNS text LANGUAGE sql AS $$
  SELECT row(p.profile, p.fire_exchange, p.fire_base, p.market, p.wire, p.side, p.queued_id, p.piece_idx, p.round,
             p.probe, p.order_no, p.sent_rel_us, p.result, p.result_code, p.accept_time, p.retry, p.abandoned, p.isin,
             p.price, p.qty, p.filled_qty, p.account, p.dma_user_id, p.source)::text
    FROM public.launch_pieces p
   WHERE p.gateway = p_gw AND p.profile = p_profile AND p.fire_exchange = p_ex AND p.wire = p_wire
$$;
CREATE FUNCTION pg_temp.hrow(p_gw text, p_profile text, p_ex text) RETURNS text LANGUAGE sql AS $$
  SELECT row(h.profile, h.fire_exchange, h.fire_base, h.market, h.offset_used_us, h.fire_at_us, h.n_pieces,
             h.n_accepted, h.n_reject, h.n_other, h.first_accept_idx, h.retries, h.abandoned, h.gate_lo_us,
             h.gate_hi_us, h.nonmono, h.one_way_us, h.rtt_min_us, h.next_offset_us, h.source)::text
    FROM public.launch_heads h
   WHERE h.gateway = p_gw AND h.profile = p_profile AND h.fire_exchange = p_ex
$$;

-- 가시성 픽스처: U1(dma-lg-a) → KYOBO119 …7801.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-000000003510', 'lpm-u1@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('dma-lg-a', 'test-enc');
INSERT INTO public.app_users (email, role, dma_user_id) VALUES ('lpm-u1@example.invalid', 'trader', 'dma-lg-a');

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

INSERT INTO t_apply SELECT 'access', to_jsonb(public.dma_journal_sync_access('KYOBO119', '[
  {"dma_user_id":"dma-lg-a","account_no":"1234567801","name":"위탁","priority":1}
]'::jsonb));

-- ── 적재 ────────────────────────────────────────────────────────
-- KB120 e1 — kind 1(시세) + Q16 조각 4 + 머리 1.
INSERT INTO t_apply
SELECT 'q16', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.sev(100, 1, 0, '', '', '15:59:59.000', '{"ask_qty_at_limit":185400}'::jsonb),
  pg_temp.ex(101, 'q16_w0'), pg_temp.ex(102, 'q16_w1'), pg_temp.ex(103, 'q16_w2'), pg_temp.ex(104, 'q16_w3'),
  pg_temp.ex(105, 'q16_head')
));

-- KYOBO119 k1 — 09:00 한 회차(노트 질문 ④: 18 이 그 회차 17 들 뒤 · 한 80 프레임에 섞여 온다).
INSERT INTO t_apply
SELECT 'nxt', public.dma_strategy_apply('KYOBO119', 'k1', jsonb_build_array(
  pg_temp.ex(201, 'n_buy'), pg_temp.ex(202, 'a_krx_buy'), pg_temp.ex(203, 'n_sell'),
  pg_temp.ex(204, 'a_head'), pg_temp.ex(205, 'n_head')
));

SELECT plan(36);

-- ── 1. Q16 조각 → launch_pieces (노트 표 칸 그대로) ────────────────
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors', jsonb_array_length(r->'rows'),
              (r->'rows'->0->>'kind')::int)::text FROM t_apply WHERE label = 'q16'),
  '(6,0,[],1,1)', '(KB120 e1 seq 100~105, kind 1·17×4·18) (applied, skipped, errors, rows 길이, rows[0].kind) = (6, 0, [], 1, 1) — 17·18 은 rows 에 없다'
);
SELECT is(
  pg_temp.prow('KB120', 'Q16', 'KRX', 0),
  '(Q16,KRX,16:00:00,K,0,buy,Q153027001,0,0,f,3404000288,-305,101,0101,155959999,1,t,KR7005930003,11070,3613,,37728502101,junysim,journal)',
  '(KB120 e1 seq 101, kind 17, Q16 wire 0) 노트 표 그대로 — profile(cond_metric 1) · KRX · 16:00:00(expected_cum) · K(ev_kind 75) · wire(entry_round) · buy(B) · q= · piece_idx · round · probe · order_no · sent_rel_us · 101(queue_case 2) · rc 원문 0101 · accept_time · retry · abandoned · isin · price · qty · filled_qty null(0 = 모름) · account · user'
);
SELECT is(
  (SELECT row(p.journal_epoch, p.seq, p.gw_time_ms = e.gw_time_ms, p.trade_date)::text
     FROM public.launch_pieces p
     JOIN public.dma_strategy_events e ON e.gateway = p.gateway AND e.journal_epoch = p.journal_epoch AND e.seq = p.seq
    WHERE p.gateway = 'KB120' AND p.wire = 0),
  '(e1,101,t,2026-10-28)', '(KB120 e1 seq 101, Q16 wire 0) 추적 열 (journal_epoch, seq, gw_time_ms = 원문, trade_date) = (e1, 101, t, 2026-10-28)'
);
SELECT is(
  pg_temp.prow('KB120', 'Q16', 'KRX', 1),
  '(Q16,KRX,16:00:00,K,1,buy,Q153027001,1,1,f,3404000289,-296,접수,,160000012,0,f,KR7005930003,11070,3613,,37728502101,junysim,journal)',
  '(KB120 e1 seq 102, Q16 wire 1) 접수(queue_case 1) · result_code null(rc 빈 값 · 정수 0 센티널)'
);
SELECT is(
  pg_temp.prow('KB120', 'Q16', 'KRX', 2),
  '(Q16,KRX,16:00:00,K,2,buy,Q153027001,2,-1,t,,-290,무응답,,,0,f,KR7005930003,11070,1,,37728502101,junysim,journal)',
  '(KB120 e1 seq 103, Q16 wire 2 탐침) round −1 그대로 · probe t · order_no null("") · 무응답(queue_case 4) · accept_time null(0)'
);
SELECT is(
  pg_temp.prow('KB120', 'Q16', 'KRX', 3),
  '(Q16,KRX,16:00:00,K,3,buy,Q153027001,3,2,f,3404000291,-285,기타,F083,,0,f,KR7005930003,11070,3614,,37728502101,junysim,journal)',
  '(KB120 e1 seq 104, Q16 wire 3) 기타(queue_case 3) · result_code = rc 원문 F083(정수 −1000 아님)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'KB120'),
  4, '(KB120 e1, kind 17 ×4) launch_pieces 4행 — kind 1 은 투영하지 않는다'
);

-- ── 2. A1 — N 매수 · A KRX 매수 · N NXT 매도 = 세 행 ─────────────────
SELECT is(
  (SELECT row((r->>'applied')::int, r->'errors', jsonb_array_length(r->'rows'))::text FROM t_apply WHERE label = 'nxt'),
  '(5,[],0)', '(KYOBO119 k1 seq 201~205, kind 17×3·18×2) (applied, errors, rows 길이) = (5, [], 0)'
);
SELECT results_eq(
  $$SELECT profile, fire_exchange, to_char(fire_base, 'HH24:MI:SS'), market, wire, side, queued_id, result, result_code
      FROM public.launch_pieces WHERE gateway = 'KYOBO119' ORDER BY fire_base, fire_exchange, side, wire$$,
  $$VALUES ('A', 'KRX', '09:00:27', 'Q', 0, 'buy', 'A', '접수', NULL::text),
           ('N', 'NXT', '09:00:30', 'Q', 0, 'buy', 'N', '515', '0515'),
           ('N', 'NXT', '09:00:30', 'Q', 1, 'sell', 'N', '515', 'E127')$$,
  '(KYOBO119 k1 seq 201·202·203, kind 17) 세 행 (A KRX 09:00:27 매수 접수) · (N NXT 09:00:30 매수 wire 0 515/0515) · (N NXT 09:00:30 매도 wire 1 515/E127)'
);
SELECT is(
  (SELECT count(DISTINCT (trade_date, gateway, profile, fire_exchange, market, wire))::int FROM public.launch_pieces WHERE gateway = 'KYOBO119'),
  3, '(KYOBO119 k1, kind 17 ×3) 논리 키 3개가 서로 다르다 — A 의 두 다리가 각자 한 행'
);
SELECT is(
  (SELECT array_agg(side ORDER BY seq)::text FROM public.launch_pieces WHERE gateway = 'KYOBO119'),
  '{buy,buy,sell}', '(KYOBO119 k1 seq 201·202·203) side (N 매수, A KRX 매수, N 매도) = {buy, buy, sell}'
);
SELECT is(
  pg_temp.prow('KYOBO119', 'N', 'NXT', 0),
  '(N,NXT,09:00:30,Q,0,buy,N,0,0,f,0000071001,-200,515,0515,90030001,2,t,KR7005930003,12350,300,,1234567801,dma-lg-a,journal)',
  '(KYOBO119 k1 seq 201, N 매수) 515 판정(queue_case 2 · result_code 515) · accept_time 8자리 그대로(90030001 · Pitfall 7) · 계좌 · 사용자 그대로(D-02)'
);

-- ── 3. 머리 → launch_heads ────────────────────────────────────
SELECT is(
  pg_temp.hrow('KB120', 'Q16', 'KRX'),
  row('Q16', 'KRX', '16:00:00', 'K', -350,
      (extract(epoch FROM timestamptz '2026-10-28 15:59:59.99965+09') * 1000000)::bigint,
      4, 1, 2, 2, 1, 1, 1, -305, -296, false, 1850, 3700, -337, 'journal')::text,
  '(KB120 e1 seq 105, kind 18, Q16) 노트 표 그대로 — offset_used_us(cond_actual) · fire_at_us(fire= KST epoch µs) · n_pieces · n_accepted · n_reject(n_retry_rejects) · n_other · first_accept_idx · retries · abandoned · gate lo/hi · nonmono · one_way · rtt_min · next_offset_us = cond_threshold −337'
);
SELECT is(
  (SELECT row(journal_epoch, seq, trade_date,
              num_nulls(correction_before_us, correction_after_us, step_us, last_dir, bracketed, same_dir_run, reject_span_us, jump))::text
     FROM public.launch_heads WHERE gateway = 'KB120' AND profile = 'Q16'),
  '(e1,105,2026-10-28,8)', '(KB120 e1 seq 105, Q16 머리) 추적 열 (e1, 105) · 학습 8칸 전부 null(노트 D-12 폐지)'
);
SELECT ok(
  (SELECT next_offset_us IS DISTINCT FROM (correction_after_us - one_way_us) FROM public.launch_heads WHERE gateway = 'KB120' AND profile = 'Q16')
  AND (SELECT next_offset_us FROM public.launch_heads WHERE gateway = 'KB120' AND profile = 'Q16') = -337,
  '(KB120 e1 seq 105, Q16 머리) next_offset_us 는 kind 18 cond_threshold 직접(A2 폴백 correction_after − one_way 아님)'
);
SELECT is(
  pg_temp.hrow('KYOBO119', 'N', 'NXT'),
  row('N', 'NXT', '09:00:30', 'Q', -200,
      (extract(epoch FROM timestamptz '2026-10-28 09:00:29.9998+09') * 1000000)::bigint,
      2, 0, 2, 0, NULL::int, 0, 0, NULL::int, 0, false, NULL::int, NULL::int, -180, 'journal')::text,
  '(KYOBO119 k1 seq 205, kind 18, N) gate_lo null(0 + lo=-) · gate_hi 0(0 + hi=0 — 진짜 0) · first_accept_idx null(−1) · one_way · rtt null(0 = 표본 없음) · next_offset_us −180(노트 값)'
);
SELECT is(
  (SELECT row(profile, fire_exchange, to_char(fire_base, 'HH24:MI:SS'), market, gate_lo_us, gate_hi_us, next_offset_us)::text
     FROM public.launch_heads WHERE gateway = 'KYOBO119' AND profile = 'A'),
  '(A,KRX,09:00:27,Q,,-150,-150)', '(KYOBO119 k1 seq 204, kind 18, A) A 머리 1행 = KRX 09:00:27 다리'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_heads WHERE gateway = 'KYOBO119'),
  2, '(KYOBO119 k1, kind 18 ×2) 머리 2행 — A(KRX) 1 · N(NXT 매수 · 매도 합산) 1'
);

-- ── 4. 도착 순서 · 재생 ────────────────────────────────────────
-- OA: 머리 먼저(배치 1) → 조각(배치 2) · OB: 조각 먼저 → 머리. 같은 원문 값.
INSERT INTO t_apply SELECT 'oa1', public.dma_strategy_apply('OA', 'o1', jsonb_build_array(pg_temp.ex(11, 'q16_head')));
INSERT INTO t_apply SELECT 'oa2', public.dma_strategy_apply('OA', 'o1', jsonb_build_array(pg_temp.ex(10, 'q16_w0')));
INSERT INTO t_apply SELECT 'ob1', public.dma_strategy_apply('OB', 'o1', jsonb_build_array(pg_temp.ex(10, 'q16_w0')));
INSERT INTO t_apply SELECT 'ob2', public.dma_strategy_apply('OB', 'o1', jsonb_build_array(pg_temp.ex(11, 'q16_head')));

SELECT is(
  row(pg_temp.prow('OA', 'Q16', 'KRX', 0), pg_temp.hrow('OA', 'Q16', 'KRX'))::text,
  row(pg_temp.prow('OB', 'Q16', 'KRX', 0), pg_temp.hrow('OB', 'Q16', 'KRX'))::text,
  '(OA · OB o1 seq 10·11, kind 17·18) 머리 먼저 배치와 조각 먼저 배치의 조각 · 머리 행이 같다'
);
SELECT is(
  pg_temp.prow('OA', 'Q16', 'KRX', 0), pg_temp.prow('KB120', 'Q16', 'KRX', 0),
  '(OA o1 seq 10, Q16 wire 0) 순서를 바꿔도 KB120 한 배치 적재와 같은 행'
);

UPDATE public.launch_pieces SET updated_at = '2000-01-01 00:00:00+00' WHERE gateway = 'KB120';
UPDATE public.launch_heads  SET updated_at = '2000-01-01 00:00:00+00' WHERE gateway = 'KB120';
INSERT INTO t_apply
SELECT 'q16_replay', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.sev(100, 1, 0, '', '', '15:59:59.000', '{"ask_qty_at_limit":185400}'::jsonb),
  pg_temp.ex(101, 'q16_w0'), pg_temp.ex(102, 'q16_w1'), pg_temp.ex(103, 'q16_w2'), pg_temp.ex(104, 'q16_w3'),
  pg_temp.ex(105, 'q16_head')
));
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors', jsonb_array_length(r->'rows'))::text
     FROM t_apply WHERE label = 'q16_replay'),
  '(0,6,[],0)', '(KB120 e1 seq 100~105 재전송) (applied, skipped, errors, rows 길이) = (0, 6, [], 0)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'KB120' AND updated_at <> '2000-01-01 00:00:00+00')
  + (SELECT count(*)::int FROM public.launch_heads WHERE gateway = 'KB120' AND updated_at <> '2000-01-01 00:00:00+00'),
  0, '(KB120 e1 seq 101~105 재전송) launch_* updated_at 불변 — 재생은 투영을 다시 돌리지 않는다'
);

-- ── 5. 스텁 시절 원문 → launch_reproject ─────────────────────────
-- 마이그레이션의 정식 본문을 떠 두고, 스텁(no-op)으로 갈아 끼워 원문만 쌓은 뒤, 정식 본문을 그대로 되살린다.
CREATE TEMP TABLE t_def AS
SELECT pg_get_functiondef('public.launch_project_event(public.dma_strategy_events)'::regprocedure) AS d;

CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$ BEGIN RETURN; END; $$;

INSERT INTO t_apply SELECT 'rp_stub', public.dma_strategy_apply('RP', 'r1', jsonb_build_array(
  pg_temp.ex(1, 'q16_w0'), pg_temp.ex(2, 'q16_w1'), pg_temp.ex(3, 'q16_head')
));

SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'RP') + (SELECT count(*)::int FROM public.launch_heads WHERE gateway = 'RP'),
  0, '(RP r1 seq 1·2·3, 스텁) 원문만 남고 launch_* 는 비어 있다'
);

DO $$ BEGIN EXECUTE (SELECT d FROM pg_temp.t_def); END $$;

INSERT INTO t_apply SELECT 'rp1', public.launch_reproject();
CREATE TEMP TABLE t_rp1 AS
SELECT (SELECT array_agg(pg_temp.prow(gateway, profile, fire_exchange, wire) ORDER BY gateway, profile, fire_exchange, market, wire)
          FROM public.launch_pieces)::text AS pieces,
       (SELECT array_agg(pg_temp.hrow(gateway, profile, fire_exchange) ORDER BY gateway, profile, fire_exchange, market)
          FROM public.launch_heads)::text AS heads;
INSERT INTO t_apply SELECT 'rp2', public.launch_reproject();

SELECT is(
  (SELECT row((r->>'projected')::int, r->'errors')::text FROM t_apply WHERE label = 'rp1'),
  row((SELECT count(*)::int FROM public.dma_strategy_events WHERE kind IN (17, 18)),
      '[]'::jsonb)::text,
  '(전 게이트웨이, kind 17·18, reproject()) (projected, errors) = (원문 17·18 행 수, []) — 정식 매핑으로 전부 풀린다'
);
SELECT is(
  row(pg_temp.prow('RP', 'Q16', 'KRX', 0), pg_temp.prow('RP', 'Q16', 'KRX', 1), pg_temp.hrow('RP', 'Q16', 'KRX'))::text,
  row(pg_temp.prow('KB120', 'Q16', 'KRX', 0), pg_temp.prow('KB120', 'Q16', 'KRX', 1), pg_temp.hrow('KB120', 'Q16', 'KRX'))::text,
  '(RP r1 seq 1·2·3, 스텁 시절 원문 → reproject) 라이브 적재(KB120)와 같은 조각 · 머리 행'
);
SELECT is(
  (SELECT row(journal_epoch, seq)::text FROM public.launch_heads WHERE gateway = 'RP'),
  '(r1,3)', '(RP r1 seq 3, 머리) reproject 행의 추적 열 = 원문 (r1, 3)'
);
SELECT is(
  row((SELECT (r->>'projected')::int FROM t_apply WHERE label = 'rp2'),
      (SELECT array_agg(pg_temp.prow(gateway, profile, fire_exchange, wire) ORDER BY gateway, profile, fire_exchange, market, wire)
         FROM public.launch_pieces)::text,
      (SELECT array_agg(pg_temp.hrow(gateway, profile, fire_exchange) ORDER BY gateway, profile, fire_exchange, market)
         FROM public.launch_heads)::text)::text,
  row((SELECT (r->>'projected')::int FROM t_apply WHERE label = 'rp1'), (SELECT pieces FROM t_rp1), (SELECT heads FROM t_rp1))::text,
  '(전 게이트웨이, reproject() 2회째) projected 같음 · 조각 · 머리 전체가 1회 뒤와 같다 — 멱등'
);

-- ── 6. 가시성(D-05) · 어드민 RPC ─────────────────────────────────
SELECT ok(
  EXISTS (SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000003510', '2026-10-28') AS t(ev)
           WHERE (t.ev->>'kind')::int = 17),
  '(U1, KYOBO119 …7801, kind 17) 전제: SETOF 원천은 실계좌 kind 17 을 그 계좌 사용자에게 돌려준다 — 거르는 곳은 래퍼'
);
SELECT is(
  (SELECT coalesce(array_agg(DISTINCT (x->>'kind')::int), '{}')::text
     FROM jsonb_array_elements(public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000003510', '2026-10-28', true)) x
    WHERE (x->>'kind')::int IN (17, 18)),
  '{}', '(U1, 2026-10-28, 주문로그 래퍼 include_limit_feature=true) kind 17·18 0건'
);
SELECT results_eq(
  $$SELECT x->>'profile', x->>'fire_exchange', x->>'side', (x->>'wire')::int, x->>'result'
      FROM jsonb_array_elements(public.launch_map_for_admin('n0930')->'pieces') x
     WHERE x->>'gateway' = 'KYOBO119' ORDER BY (x->>'wire')::int$$,
  $$VALUES ('N', 'NXT', 'buy', 0, '515'), ('N', 'NXT', 'sell', 1, '515')$$,
  '(KYOBO119, launch_map_for_admin n0930) pieces = N 매수 + N 매도 — A KRX 09:00:27 다리 없음'
);
SELECT is(
  (SELECT array_agg(x->>'profile' ORDER BY x->>'profile')::text
     FROM jsonb_array_elements(public.launch_map_for_admin('n0930')->'heads') x WHERE x->>'gateway' = 'KYOBO119'),
  '{N}', '(KYOBO119, launch_map_for_admin n0930) heads = N 머리 1행(A 머리는 KRX 09:00:27 이라 지도 밖)'
);
SELECT is(
  (SELECT row(x->>'fire_base', x->>'side', x->>'account', x->>'stock_code')::text
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261028')->'pieces') x
    WHERE x->>'gateway' = 'KYOBO119' AND x->>'profile' = 'A'),
  '(09:00:27,buy,1234567801,005930)', '(KYOBO119 2026-10-28, launch_orders_for_admin) A KRX 매수 다리는 주문 내역에 있다(account · stock_code)'
);

-- ── 7. 포이즌 · 그 밖 kind ──────────────────────────────────────
INSERT INTO t_apply SELECT 'bad', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(pg_temp.ex(110, 'bad_profile')));
SELECT is(
  (SELECT row((r->>'applied')::int, jsonb_array_length(r->'errors'), (r->'errors'->0->>'seq')::int,
              r->'errors'->0->>'error' LIKE '%profile%')::text FROM t_apply WHERE label = 'bad'),
  '(1,1,110,t)', '(KB120 e1 seq 110, kind 17 cond_metric 0) (applied, errors 길이, errors[0].seq, 사유에 profile) = (1, 1, 110, t) — 모르는 profile 은 조용히 버리지 않는다'
);
SELECT is(
  row((SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KB120' AND seq = 110),
      (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'KB120' AND wire = 9))::text,
  '(1,0)', '(KB120 e1 seq 110, 포이즌) (원문 행, launch_pieces 행) = (1, 0)'
);
SELECT lives_ok(
  $$SELECT public.launch_project_event(e) FROM public.dma_strategy_events e WHERE e.gateway = 'KB120' AND e.seq = 100$$,
  '(KB120 e1 seq 100, kind 1) launch_project_event 직접 호출 — 그 밖 kind 는 무시(예외 없음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'KB120') + (SELECT count(*)::int FROM public.launch_heads WHERE gateway = 'KB120'),
  5, '(KB120 e1, kind 1 직접 호출 뒤) launch_* KB120 = 조각 4 + 머리 1 그대로'
);

SELECT * FROM finish();
ROLLBACK;
