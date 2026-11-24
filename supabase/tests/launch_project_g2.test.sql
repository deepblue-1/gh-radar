-- ============================================================
-- gh-trade Phase 49 — 발사 저널 kind 17 · 18 profile 4 = G2(08:30 장개시전 시간외종가) 투영 pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261125090000_launch_project_g2.sql
-- 정본: docs/inbox/from-gh-trade/261125-sigan-ttaeng-g2.md ⓓ · ⓔ
--   profile 4 = G2 · exchange KRX · expected_cum 83000000 → fire_base 08:30:00 · round 0 · probe false ·
--   wire 는 시장 안에서 0, 1, 2 … · 예약 1건 = kind 17 1행 · 머리는 시장마다 1행 · 5(G3)는 저널에 오지 않는다.
--
-- 잠그는 것:
--   1. G2 조각 3건(코스피 wire 0 · 1, 코스닥 wire 0) · 머리 2건 → errors 0 · launch_pieces / launch_heads 에 profile G2 ·
--      KRX · 08:30:00 · 시장별 wire 로 들어간다(Q16 · N 과 같은 칸 매핑 — 바뀐 것은 profile 한 줄).
--   2. 같은 날 Q16 조각과 키가 겹치지 않는다(같은 KRX · 같은 시장 · 같은 wire 0 이 둘 다 산다).
--   3. cond_metric 5 는 여전히 매핑 밖 → errors 1(필수 키 누락) · 원문은 남는다.
--   4. 기존 화면에 섞이지 않는다 — launch_map_for_admin('q16' · 'n0930') 에 G2 없음 · launch_queue_inputs 에 G2 없음.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_project_g2.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 전략 이벤트 1건 — relay 43키 전부(없는 값은 0 / "" / false / []) 위에 p_over 를 덮는다
-- (launch_project_mapping.test.sql 의 헬퍼 그대로).
CREATE FUNCTION pg_temp.sev(p_seq bigint, p_kind int, p_hms text, p_over jsonb, p_date text DEFAULT '2026-11-26')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind, 'group', 0, 'exchange', 'KRX', 'isin', 'KR7005930003', 'cum_volume', 0,
    'dma_user_id', '', 'account_no', '', 'order_no', '', 'price', 0, 'qty', 0,
    'order_condition', '', 'reason_code', '', 'cond_threshold', 0, 'cond_actual', 0, 'cond_metric', 0,
    'ev_kind', 0, 'ev_price', 0, 'ev_qty_before', 0, 'ev_qty_after', 0, 'ev_trade_qty', 0,
    'limit_bid_qty', 0, 'bid1_price', 0, 'bid1_qty', 0, 'accept_latency_us', 0, 'immediate_fill_qty', 0,
    'queue_case', 0, 'base_cum', 0, 'ahead_qty', 0, 'expected_cum', 0, 'error_volume', 0,
    'remaining_volume', 0, 'has_remaining', false, 'cancel_reason', 0, 'result_code', 0, 'message', '',
    'entry_round', 0, 'snap_qty', '[]'::jsonb, 'snap_cum', '[]'::jsonb, 'ask_qty_at_limit', 0, 'open_at_limit', false
  ) || p_over
$$;

CREATE FUNCTION pg_temp.prow(p_profile text, p_market text, p_wire int) RETURNS text LANGUAGE sql AS $$
  SELECT row(p.profile, p.fire_exchange, p.fire_base, p.market, p.wire, p.side, p.queued_id, p.piece_idx, p.round,
             p.probe, p.order_no, p.sent_rel_us, p.result, p.result_code, p.accept_time, p.isin, p.price, p.qty,
             p.account, p.source)::text
    FROM public.launch_pieces p
   WHERE p.gateway = 'KB120' AND p.profile = p_profile AND p.market = p_market AND p.wire = p_wire
$$;

CREATE FUNCTION pg_temp.hrow(p_profile text, p_market text) RETURNS text LANGUAGE sql AS $$
  SELECT row(h.profile, h.fire_exchange, h.fire_base, h.market, h.offset_used_us, h.n_pieces, h.n_accepted,
             h.n_reject, h.n_other, h.first_accept_idx, h.next_offset_us, h.source)::text
    FROM public.launch_heads h
   WHERE h.gateway = 'KB120' AND h.profile = p_profile AND h.market = p_market
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

-- KB120 g1 — 08:30 G2 예약 발사(코스피 2건 · 코스닥 1건 · 머리 시장마다 1) + 같은 날 16:00 Q16 코스피 wire 0 + G3(5) 1건.
INSERT INTO t_apply
SELECT 'g2', public.dma_strategy_apply('KB120', 'g1', jsonb_build_array(
  -- G2 코스피 wire 0 — 접수
  pg_temp.sev(301, 17, '08:29:59.999', '{
    "cond_metric":4,"expected_cum":83000000,"ev_kind":75,"entry_round":0,
    "message":"q=Q083000001|res=접수|rc=","ev_qty_before":0,"ev_price":0,"has_remaining":false,
    "order_no":"5100000001","cond_threshold":0,"queue_case":1,"cond_actual":83000004,
    "order_condition":"B","price":71000,"qty":10,"account_no":"37728502101","dma_user_id":"junysim"}'::jsonb),
  -- G2 코스피 wire 1 — 이른 거부(queue_case 2 · rc 원문 보존)
  pg_temp.sev(302, 17, '08:29:59.999', '{
    "cond_metric":4,"expected_cum":83000000,"ev_kind":75,"entry_round":1,
    "message":"q=Q083000002|res=101|rc=0101","ev_qty_before":0,"ev_price":0,"has_remaining":false,
    "order_no":"5100000002","cond_threshold":0,"queue_case":2,"result_code":101,
    "order_condition":"B","price":71000,"qty":5,"account_no":"37728502101","dma_user_id":"junysim"}'::jsonb),
  -- G2 코스닥 wire 0 — 접수
  pg_temp.sev(303, 17, '08:29:59.999', '{
    "cond_metric":4,"expected_cum":83000000,"ev_kind":81,"entry_round":0,
    "message":"q=Q083000003|res=접수|rc=","ev_qty_before":0,"ev_price":0,"has_remaining":false,
    "order_no":"5100000003","cond_threshold":0,"queue_case":1,"cond_actual":83000006,
    "order_condition":"S","price":12350,"qty":20,"account_no":"37728502101","dma_user_id":"junysim"}'::jsonb),
  -- G2 머리 — 시장마다 1행
  pg_temp.sev(304, 18, '08:30:01.000', '{
    "cond_metric":4,"expected_cum":83000000,"ev_kind":75,"isin":"",
    "cond_threshold":0,"cond_actual":0,"ev_price":2,"ev_qty_before":1,"ev_qty_after":1,"ev_trade_qty":0,
    "limit_bid_qty":0,"message":"plan=0|rev=2|fire=083000.000010|lo=-|hi=-"}'::jsonb),
  pg_temp.sev(305, 18, '08:30:01.000', '{
    "cond_metric":4,"expected_cum":83000000,"ev_kind":81,"isin":"",
    "cond_threshold":0,"cond_actual":0,"ev_price":1,"ev_qty_before":1,"ev_qty_after":0,"ev_trade_qty":0,
    "limit_bid_qty":0,"message":"plan=0|rev=2|fire=083000.000012|lo=-|hi=-"}'::jsonb),
  -- 같은 날 16:00 Q16 코스피 wire 0 — G2 코스피 wire 0 과 키가 겹치지 않아야 한다
  pg_temp.sev(306, 17, '15:59:59.999', '{
    "cond_metric":1,"expected_cum":160000000,"ev_kind":75,"entry_round":0,
    "message":"q=Q153027001|res=접수|rc=","queue_case":1,"cond_threshold":-300,
    "order_condition":"B","price":71000,"qty":3,"account_no":"37728502101"}'::jsonb),
  -- G3(5) — 저널에 오지 않기로 했다(노트 ⓔ) · 오면 매핑 밖 포이즌
  pg_temp.sev(307, 17, '15:29:59.999', '{
    "cond_metric":5,"expected_cum":153000000,"ev_kind":75,"entry_round":0,
    "message":"q=Q153000001|res=접수|rc=","queue_case":1,"cond_threshold":0}'::jsonb)
));

SELECT plan(14);

-- ── 1. G2 조각 · 머리 ─────────────────────────────────────────────
SELECT is(
  (SELECT jsonb_array_length(r->'errors') FROM t_apply WHERE label = 'g2'), 1,
  '(KB120 g1, 배치) errors 1 — seq 307(cond_metric 5)만 · G2 5건 · Q16 1건은 투영 성공'
);
SELECT is(
  (SELECT (r->'errors'->0->>'seq')::bigint FROM t_apply WHERE label = 'g2'), 307::bigint,
  '(KB120 g1 seq 307, kind 17, cond_metric 5) 실패한 것은 G3 행 하나'
);
SELECT is(
  pg_temp.prow('G2', 'K', 0),
  '(G2,KRX,08:30:00,K,0,buy,Q083000001,0,0,f,5100000001,0,접수,,83000004,KR7005930003,71000,10,37728502101,journal)',
  '(KB120 g1 seq 301, kind 17, cond_metric 4) G2 · KRX · 08:30:00(expected_cum 83000000) · 코스피 wire 0 · 접수'
);
SELECT is(
  pg_temp.prow('G2', 'K', 1),
  '(G2,KRX,08:30:00,K,1,buy,Q083000002,0,0,f,5100000002,0,101,0101,,KR7005930003,71000,5,37728502101,journal)',
  '(KB120 g1 seq 302, G2 코스피 wire 1) 이른 거부 queue_case 2 → 101 · rc 원문 0101 보존(노트 질문 1)'
);
SELECT is(
  pg_temp.prow('G2', 'Q', 0),
  '(G2,KRX,08:30:00,Q,0,sell,Q083000003,0,0,f,5100000003,0,접수,,83000006,KR7005930003,12350,20,37728502101,journal)',
  '(KB120 g1 seq 303, G2 코스닥 wire 0) 시장이 다르면 wire 0 이 따로 산다'
);
SELECT is(
  pg_temp.hrow('G2', 'K'),
  '(G2,KRX,08:30:00,K,0,2,1,1,0,0,0,journal)',
  '(KB120 g1 seq 304, kind 18, G2 코스피 머리) profile G2 · KRX · 08:30:00 · n_pieces 2 · 접수 1 · 거부 1'
);
SELECT is(
  pg_temp.hrow('G2', 'Q'),
  '(G2,KRX,08:30:00,Q,0,1,1,0,0,0,0,journal)',
  '(KB120 g1 seq 305, kind 18, G2 코스닥 머리) 시장마다 1행'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_heads WHERE profile = 'G2'), 2,
  '(KB120 g1) G2 머리 = 시장 수(2)'
);

-- ── 2. 같은 날 Q16 과 키 분리 ─────────────────────────────────────
SELECT is(
  (SELECT row(p.profile, p.fire_base, p.wire)::text FROM public.launch_pieces p
    WHERE p.gateway = 'KB120' AND p.profile = 'Q16' AND p.market = 'K' AND p.wire = 0),
  '(Q16,16:00:00,0)',
  '(KB120 g1 seq 306, kind 17, cond_metric 1) Q16 코스피 wire 0 은 G2 코스피 wire 0 과 따로 산다(profile · fire_base 키)'
);

-- ── 3. G3(5) 포이즌 — 원문은 남는다 ─────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KB120' AND seq = 307 AND cond_metric = 5), 1,
  '(KB120 g1 seq 307) 매핑 밖 원문은 dma_strategy_events 에 남는다(나중에 매핑하면 launch_reproject)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE profile IS NULL OR profile NOT IN ('Q16', 'G2')), 0,
  '(KB120 g1) 조각 표에는 Q16 · G2 만 — G3 행 없음'
);

-- ── 4. 기존 화면에 섞이지 않는다 ───────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.launch_map_for_admin('q16', NULL)->'pieces') x
    WHERE x->>'profile' = 'G2')
  + (SELECT count(*)::int FROM jsonb_array_elements(public.launch_map_for_admin('q16', NULL)->'heads') x
    WHERE x->>'profile' = 'G2'),
  0,
  '(지도 q16 = KRX 15:00 ~ 18:00 창) G2 조각 · 머리 없음 — Q16 조각만'
);
SELECT is(
  (SELECT jsonb_array_length(public.launch_map_for_admin('n0930', NULL)->'pieces')
        + jsonb_array_length(public.launch_map_for_admin('n0930', NULL)->'heads')),
  0,
  '(지도 n0930 = NXT 09:00:30) G2 조각 · 머리 없음'
);
SELECT is(
  (SELECT count(*)::int FROM jsonb_array_elements(public.launch_queue_inputs('20261126')) x WHERE x->>'profile' = 'G2'),
  0,
  '(대기열 입력 20261126) 접수 G2 조각 2건이 있어도 profile IN (Q16, N, A) 라 제외'
);

SELECT * FROM finish();

ROLLBACK;
