-- ============================================================
-- gh-trade Phase 49 — 발사 저널 kind 17 · 18 profile 정수 4 = G2(08:30 장개시전 시간외종가 예약 발사) 투영.
--
-- 정본: gh-trade 인계 노트 `docs/inbox/from-gh-trade/261125-sigan-ttaeng-g2.md` ⓓ
--   (from_commit 3b80cfcd · 합의 gh-radar-27 ↔ gh-trade-12 2026-11-24 · gh-trade 49-CONTEXT D-18 · D-19).
--   profile 4 = G2(94 문자열 "G2" 와 같은 발사) · exchange "KRX" · expected_cum 83000000(→ fire_base 08:30:00) ·
--   queued_id = Q-ID · round 0 · probe false · wire 는 시장 안에서 0, 1, 2 … · 예약 1건 = kind 17 1행 · 머리 시장마다 1행.
--
-- 바뀐 곳은 `launch_project_event` 의 cond_metric CASE 한 줄(`WHEN 4 THEN 'G2'`)뿐이다 — 나머지 본문은 20261028200000 글자 그대로.
--   5(15:30 G3)는 매핑하지 않는다 — gh-trade 가 kind 17/18 을 남기지 않는다(노트 ⓔ). 오면 지금처럼 「필수 키 누락」 포이즌.
--
-- 기존 화면에 섞이지 않는다(변경 없음 · pgTAP 로 잠금):
--   - 경계 지도 `launch_map_for_admin` — q16 = KRX [15:00, 18:00) · n0930 = NXT 09:00:30 창이라 KRX 08:30:00 은 밖.
--   - 발사 대기열 입력 `launch_queue_inputs` — profile IN ('Q16', 'N', 'A') 라 G2 제외.
--   - 주문 내역 `launch_orders_for_admin` 은 그날 조각을 다 싣지만 웹 `isOrderTabRow`(shared isLaunchFireBaseOf)가 G2 를 거른다.
--
-- 원격 적용: 메인 세션 `supabase db push --linked --yes`. gh-trade 는 이 적용 회신 전에는 08:30 스위치를 켜지 않는다(D-19) —
--   적용 시점에 profile 4 원문이 없으므로 `launch_reproject()` 는 필요 없다(혹시 있으면 그 날짜 범위로 1회 — 멱등).
-- 되돌리기: 20261028200000 의 launch_project_event 본문 재적용(G2 행은 launch_* 에 남는다).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile text;
  v_market  text;
  v_base    time;
  v_msg     text := coalesce(p_ev.message, '');
  v_res     text;
  v_rc      text;
  v_lo      text;
  v_hi      text;
  v_fire    text;
  v_fire_us bigint;
BEGIN
  IF p_ev.kind NOT IN (17, 18) THEN
    RETURN;  -- 그 밖 kind 는 무시(apply 는 17·18 만 부른다 — 직접 호출 방어)
  END IF;

  -- 공통 축(노트 ⓑ 「공통」) — 정할 수 없으면 null → 헬퍼 「필수 키 누락」.
  --   4 = G2(08:30 장개시전 시간외종가 · gh-trade Phase 49 · 인계 261125-sigan-ttaeng-g2 ⓓ).
  v_profile := CASE p_ev.cond_metric WHEN 1 THEN 'Q16' WHEN 2 THEN 'A' WHEN 3 THEN 'N' WHEN 4 THEN 'G2' END;
  v_market  := CASE p_ev.ev_kind WHEN 75 THEN 'K' WHEN 81 THEN 'Q' END;
  -- HHMMSSmmm 정수(09시대는 앞 0 이 빠진 8자리) → time. 0 = 없음. 범위 밖이면 make_time 이 RAISE(→ errors).
  v_base := CASE WHEN p_ev.expected_cum > 0 THEN
              make_time((p_ev.expected_cum / 10000000)::int,
                        ((p_ev.expected_cum / 100000) % 100)::int,
                        ((p_ev.expected_cum / 1000) % 100) + (p_ev.expected_cum % 1000) / 1000.0)
            END;

  IF p_ev.kind = 17 THEN
    v_res := (regexp_match(v_msg, '(?:^|\|)res=([^|]*)'))[1];
    v_rc  := nullif((regexp_match(v_msg, '(?:^|\|)rc=([^|]*)'))[1], '');

    PERFORM public.launch_upsert_piece(jsonb_build_object(
      'trade_date',    p_ev.trade_date,
      'gateway',       p_ev.gateway,
      'profile',       v_profile,
      'fire_exchange', nullif(p_ev.exchange, ''),
      'fire_base',     v_base,
      'market',        v_market,
      'wire',          p_ev.entry_round,
      'side',          CASE p_ev.order_condition WHEN 'B' THEN 'buy' WHEN 'S' THEN 'sell' END,
      'queued_id',     nullif((regexp_match(v_msg, '(?:^|\|)q=([^|]*)'))[1], ''),
      'piece_idx',     p_ev.ev_qty_before,
      'round',         p_ev.ev_price,
      'probe',         p_ev.has_remaining,
      'order_no',      nullif(p_ev.order_no, ''),
      'sent_rel_us',   p_ev.cond_threshold,
      'result',        CASE p_ev.queue_case
                         WHEN 1 THEN '접수'
                         WHEN 2 THEN CASE WHEN p_ev.result_code = 515 OR v_rc IN ('0515', 'E127') THEN '515' ELSE '101' END
                         WHEN 3 THEN '기타'
                         WHEN 4 THEN '무응답'
                         ELSE coalesce(nullif(v_res, ''), p_ev.queue_case::text)
                       END,
      'result_code',   coalesce(v_rc, nullif(p_ev.result_code, 0)::text),
      'accept_time',   nullif(p_ev.cond_actual, 0),
      'retry',         p_ev.ev_qty_after,
      'abandoned',     p_ev.cancel_reason <> 0,
      'isin',          nullif(p_ev.isin, ''),
      'price',         p_ev.price,
      'qty',           p_ev.qty,
      'filled_qty',    nullif(p_ev.ev_trade_qty, 0),
      'account',       nullif(p_ev.account_no, ''),
      'dma_user_id',   nullif(p_ev.dma_user_id, ''),
      'journal_epoch', p_ev.journal_epoch,
      'seq',           p_ev.seq,
      'gw_time_ms',    p_ev.gw_time_ms
    ), 'journal');

  ELSE  -- kind 18
    v_lo   := (regexp_match(v_msg, '(?:^|\|)lo=([^|]*)'))[1];
    v_hi   := (regexp_match(v_msg, '(?:^|\|)hi=([^|]*)'))[1];
    v_fire := (regexp_match(v_msg, '(?:^|\|)fire=([0-9]{6}\.[0-9]{6})(?:\||$)'))[1];
    v_fire_us := CASE
      WHEN v_fire IS NOT NULL AND substr(v_fire, 1, 2)::int < 24 AND substr(v_fire, 3, 2)::int < 60
           AND substr(v_fire, 5, 2)::int < 60 THEN
        (extract(epoch FROM ((p_ev.trade_date
                              + make_time(substr(v_fire, 1, 2)::int, substr(v_fire, 3, 2)::int,
                                          substr(v_fire, 5, 9)::numeric::double precision))
                             AT TIME ZONE 'Asia/Seoul')) * 1000000)::bigint
      ELSE p_ev.gw_time_ms * 1000
    END;

    PERFORM public.launch_upsert_head(jsonb_build_object(
      'trade_date',       p_ev.trade_date,
      'gateway',          p_ev.gateway,
      'profile',          v_profile,
      'fire_exchange',    nullif(p_ev.exchange, ''),
      'fire_base',        v_base,
      'market',           v_market,
      'offset_used_us',   p_ev.cond_actual,
      'fire_at_us',       v_fire_us,
      'n_pieces',         p_ev.ev_price,
      'n_accepted',       p_ev.ev_qty_before,
      'n_reject',         p_ev.ev_qty_after,
      'n_other',          p_ev.ev_trade_qty,
      'first_accept_idx', nullif(p_ev.limit_bid_qty, -1),
      'retries',          p_ev.bid1_price,
      'abandoned',        p_ev.bid1_qty,
      'gate_lo_us',       CASE WHEN p_ev.error_volume = 0 AND v_lo = '-' THEN NULL ELSE p_ev.error_volume END,
      'gate_hi_us',       CASE WHEN p_ev.remaining_volume = 0 AND v_hi = '-' THEN NULL ELSE p_ev.remaining_volume END,
      'nonmono',          p_ev.cancel_reason <> 0,
      'one_way_us',       nullif(p_ev.accept_latency_us, 0),
      'rtt_min_us',       nullif(p_ev.immediate_fill_qty, 0),
      'next_offset_us',   p_ev.cond_threshold,
      'journal_epoch',    p_ev.journal_epoch,
      'seq',              p_ev.seq,
      'gw_time_ms',       p_ev.gw_time_ms
    ), 'journal');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.launch_project_event(public.dma_strategy_events) IS
  'Phase 35 D-06 — kind 17·18 원문 1행 → launch_pieces/launch_heads 정식 칸 매핑(gh-trade 261028-launch-plan-contract ⓑ · 35-10). profile cond_metric 1 Q16 · 2 A · 3 N · 4 G2(08:30 · 261125-sigan-ttaeng-g2). 그 밖 kind 무시. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
