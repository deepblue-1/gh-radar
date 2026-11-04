-- ============================================================
-- quick 261104-n9h 핫픽스 — tick_today_for_user 가 60초 걸리던 것을 고친다.
--
-- 사고(2026-11-04 17:20 KST 실측): 20261104700000 배포 직후 GET /api/ticks/today 가 60.5초 · 64.3초(전 0.6초).
--   웹은 그 전에 포기해 틱뷰어 오늘 목록이 「불러오지 못했어요」.
-- 원인: kind 16 칸을 dma_accum_signals_for_user_json 으로 읽었는데, 그 함수는 dma_strategy_events_for_user(그날 **전 kind** 이벤트를
--   행마다 to_jsonb + 가시성 EXISTS(dma_visible_accounts 호출))를 다 펼친 뒤 kind 16 만 거른다.
-- 고침: tick_today_for_user 의 ac CTE 만 교체 — 오늘 kind 16 을 부분 인덱스로 직접 읽고 같은 규칙을 그대로 옮긴다:
--   가시성 = 그 게이트웨이에 가시 계좌(시세 kind 규칙) · 게이트웨이별 최근 복원 묶음(queue_case 3 · 2분 창) 앞 행 자르기 ·
--   isin 별 최신 1행(gw_time_ms DESC, seq DESC, gateway) · state(qty) ∈ {1,2,3} · 당일 칸은 snap 길이 3 행만(배열 1-기반 [3]).
--   반환 키 · 값 의미는 20261104700000 과 같다(웹 · shared 무변경).
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261104700000 의 tick_today_for_user 정의를 CREATE OR REPLACE 로 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tick_today_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  RETURN jsonb_build_object(
    'access', true,
    'date', to_char(v_today, 'YYYYMMDD'),
    'rows', (
      WITH fq AS (  -- 오늘 갱신 시세 · high = 오늘 고가일 때만(ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가) 아니면 NULL
                    -- open = 같은 가드 ∧ 저가 ≤ 시가 ≤ 고가 일 때만 아니면 NULL
        SELECT q.code,
               q.change_rate,
               q.price - q.change_amount AS base,
               CASE WHEN q.high IS NOT NULL
                     AND (q.ohlc_updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
                     AND q.price <= q.high
                     AND (q.low IS NULL OR q.low <= q.price)
                    THEN q.high END AS high,
               CASE WHEN q.open IS NOT NULL
                     AND q.open > 0
                     AND q.high IS NOT NULL
                     AND (q.ohlc_updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
                     AND q.price <= q.high
                     AND (q.low IS NULL OR q.low <= q.price)
                     AND q.open <= q.high
                     AND (q.low IS NULL OR q.low <= q.open)
                    THEN q.open END AS open
          FROM public.stock_quotes q
         WHERE (q.updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
      ), k AS (  -- (a) 오늘 매집감지 등록(kind 16 부분 인덱스 trade_date)
        SELECT DISTINCT e.isin FROM public.dma_strategy_events e
         WHERE e.kind = 16 AND e.trade_date = v_today AND e.isin <> ''
      ), u AS (    -- (b) 오늘 고가 기준 +15% 이상 — 정수 경계 (high − base)·100 ≥ base·15
        SELECT s.isin FROM fq JOIN public.stocks s ON s.code = fq.code
         WHERE s.isin IS NOT NULL
           AND fq.high IS NOT NULL
           AND fq.base > 0
           AND (fq.high - fq.base) * 100 >= fq.base * 15
      ), ids AS (
        SELECT isin FROM k UNION SELECT isin FROM u
      ), vis AS (  -- (c) 가시 게이트웨이 — dma_strategy_events_for_user 시세 kind 규칙과 같다(그 게이트웨이에 가시 계좌)
        SELECT DISTINCT v.gateway FROM public.dma_visible_accounts(p_user_id) v
      ), e16 AS (  -- 오늘 kind 16 만 부분 인덱스(idx_dma_strategy_events_accum_signal_day)로 — 그날 전 이벤트를 jsonb 로 펼치지 않는다
        SELECT e.gateway, e.isin, e.gw_time_ms, e.seq, e.queue_case, e.qty, e.cond_threshold,
               e.snap_qty, e.snap_cum, e.accept_latency_us, e.message, e.price
          FROM public.dma_strategy_events e
          JOIN vis ON vis.gateway = e.gateway
         WHERE e.kind = 16 AND e.trade_date = v_today
      ), cut AS (  -- 게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 마지막 복원 행 기준 2분 창) 시작 — dma_accum_signals_for_user_json 과 같은 규칙
        SELECT r.gateway, min(r.gw_time_ms) AS cut_ms
          FROM (SELECT x.gateway, x.gw_time_ms, max(x.gw_time_ms) OVER (PARTITION BY x.gateway) AS last_ms
                  FROM e16 x WHERE x.queue_case = 3) r
         WHERE r.gw_time_ms >= r.last_ms - 120000
         GROUP BY r.gateway
      ), ac AS (   -- isin 별 최신 1행(자르기 뒤 · state 1·2·3)
        SELECT DISTINCT ON (x.isin)
               x.isin,
               x.cond_threshold AS net_krw,
               (cardinality(x.snap_qty) >= 3 AND cardinality(x.snap_cum) >= 3) AS has_day,
               x.snap_qty[3] AS day_buy,
               x.snap_cum[3] AS day_sell,
               x.accept_latency_us AS avg_px,
               ((regexp_match(x.message, '(?:^|\|)day=(-?\d+)/\d+/\d+(?:\||$)'))[1])::bigint AS net_qty,
               nullif(x.price, 0) AS last_px
          FROM e16 x
          LEFT JOIN cut c ON c.gateway = x.gateway
         WHERE (c.cut_ms IS NULL OR x.gw_time_ms >= c.cut_ms)
           AND x.qty IN (1, 2, 3)
           AND x.isin <> ''
         ORDER BY x.isin, x.gw_time_ms DESC, x.seq DESC, x.gateway
      )
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.rate DESC NULLS LAST, t.isin), '[]'::jsonb)
        FROM (SELECT i.isin, st.code, st.name,
                     array_remove(ARRAY[CASE WHEN i.isin IN (SELECT isin FROM k) THEN 'accum' END,
                                        CASE WHEN i.isin IN (SELECT isin FROM u) THEN 'up15' END], NULL) AS sources,
                     fq.change_rate::double precision AS rate,
                     CASE WHEN fq.high IS NOT NULL AND fq.base > 0
                          THEN ((fq.high - fq.base) * 100 / fq.base)::double precision
                     END AS high_rate,
                     CASE WHEN fq.open IS NOT NULL AND fq.base > 0
                          THEN ((fq.open - fq.base) * 100 / fq.base)::double precision
                     END AS open_rate,
                     ac.net_krw AS accum_pos_net_krw,
                     CASE WHEN ac.has_day THEN ac.day_buy - ac.day_sell END AS team_day_net_krw,
                     CASE WHEN ac.has_day THEN ac.day_buy END AS team_day_buy_krw,
                     CASE WHEN ac.has_day THEN ac.day_sell END AS team_day_sell_krw,
                     CASE WHEN ac.has_day THEN ac.avg_px END AS team_day_avg_px,
                     CASE WHEN ac.has_day THEN ac.net_qty END AS team_day_net_qty,
                     ac.last_px AS accum_last_px
                FROM ids i
                LEFT JOIN public.stocks st ON st.isin = i.isin
                LEFT JOIN fq ON fq.code = st.code
                LEFT JOIN ac ON ac.isin = i.isin) t));
END;
$$;

COMMENT ON FUNCTION public.tick_today_for_user(uuid) IS
  'Phase 37 D-15 · quick 261104-n9h(+ 직접 읽기 핫픽스) — 오늘(KST) 목록: kind 16 등록(accum) ∪ 오늘 고가 +15% 이상(up15 · 고가는 ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가) · 정렬 rate DESC · open_rate(같은 가드 ∧ 저가 ≤ 시가 ≤ 고가) · kind 16 isin 별 최신 행 팀 칸 7키(가시 게이트웨이만 · 당일 값은 snap 길이 3 행만). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_today_for_user(uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
