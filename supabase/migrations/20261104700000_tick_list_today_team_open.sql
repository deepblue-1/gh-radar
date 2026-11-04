-- ============================================================
-- quick 261104-n9h — 틱뷰어 목록 오늘 팀 3칸(매집감지 kind 16) · 시가 등락률 (사용자 결정 1 · 2).
--
-- 무엇:
--   ① tick_today_for_user(p_user_id)        교체 — rows 에 open_rate + kind 16 팀 칸 7키
--      (accum_pos_net_krw · team_day_net_krw · team_day_buy_krw · team_day_sell_krw · team_day_avg_px ·
--       team_day_net_qty · accum_last_px)
--   ② tick_day_for_user(p_user_id, p_date)  교체 — rows 에 open_rate(KRX 행만 · stock_daily_ohlcv LEFT JOIN)
--
-- 칸 의미:
--   open_rate          기준가 대비 시가 %. 오늘 = stock_quotes.open — ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가 ∧
--                      저가 ≤ 시가 ≤ 고가 일 때만(20261103090000 고가 가드와 같은 신선도 · 아니면 null).
--                      과거 = 그날 KRX 일봉 open(NXT 행 · 일봉 없음 null).
--   kind 16 칸(accum-signal.ts accumSignalOf 와 같은 매핑 · 인박스 261018 · 261025):
--     accum_pos_net_krw  cond_threshold = net_krw(매집감지 등록 이후 팀 순매수 · 이월 포함 · KRX+NXT 합산)
--     team_day_buy_krw   snap_qty[2](jsonb 인덱스 2) = day_buy_krw     — snap 길이 3 행만
--     team_day_sell_krw  snap_cum[2] = day_sell_krw                    — snap 길이 3 행만
--     team_day_net_krw   day_buy − day_sell                            — snap 길이 3 행만
--     team_day_avg_px    accept_latency_us = day_avg_px(kind 16 에서만 이 뜻) — snap 길이 3 행만
--     team_day_net_qty   message `day=<net_qty>/<lo>/<hi>` 첫 조각(정확히 3조각일 때만)       — snap 길이 3 행만
--     accum_last_px      price = last_px(지금 KRX 체결가 · 없으면 마지막 팀 체결가 · 0 이면 null)
--   행 고르기: isin 별 최신 1행(gw_time_ms DESC, seq DESC, gateway) · state(qty) ∈ {1, 2, 3} ∧ isin <> '' 만
--     (accumSignalOf 의 「표시할 수 없는 행」 규칙과 같게).
--
-- 왜 kind 16 인가: 오늘은 격자(tick_grids)가 없고 tickgw 활성 키 8개 상한이라 목록 전체를 실시간 계산할 수 없다.
--   매집감지가 1분마다 내는 kind 16 이 오늘 목록에 팀 값을 줄 수 있는 유일한 출처다.
-- 가시성: dma_accum_signals_for_user_json(p_user_id, 오늘) 을 재사용 — 매집감지 화면과 같은 가시 게이트웨이 ·
--   (gateway, isin) 최신 1행 + 청산 행 · 복원 묶음 자르기 규칙 한 벌. sources 의 accum 판정(k CTE)은 기존대로 가시성
--   필터가 없으므로, 가시 게이트웨이 밖 종목은 행은 있고(sources accum) 팀 칸만 null 이다.
-- 당일 값 정의 차이: kind 16 당일 값은 KRX+NXT 합산 · 우리 체결 제외 · 06:00 · 새 사이클(매집 종료 뒤 재등록) 때
--   0 부터 다시 쌓인다(과거 목록의 격자 팀 값 = 그 거래소 팀만 · 우리 체결 포함과 다르다 — 웹 툴팁에서 밝힌다).
--   당일 손익은 DB 가 아니라 웹(shared estimateTeamDayPnl)이 이 칸들로 추정한다(「≈」).
-- 과거 시가 기준가: coalesce(nullif(g.base_px, 0), o.close − o.change_amount). 같은 행의 high_rate · last_rate 가
--   g.base_px(거래소 기준가) 분모라 세 % 가 한 기준이어야 시가 ≤ 고가 관계가 화면에서 깨지지 않고, 권리락 날엔
--   전일 종가(close − change_amount) ≠ 기준가다. g.base_px 가 없는 옛 행만 일봉으로 폴백.
--
-- 함수 최신 정의: tick_today_for_user = 20261103090000 · tick_day_for_user = 20261103230000 ③ — 본문은 그대로에 칸만 더했다
--   (게이트 · date · 정렬 · sources · rate · high_rate · requests · eta_s 계약 불변).
-- 권한: 두 함수 PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT(auto-grant 가 REVOKE FROM PUBLIC 단독을 덮는다).
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`.
-- 되돌리기: 20261103090000 의 tick_today_for_user · 20261103230000 의 tick_day_for_user 본문을 CREATE OR REPLACE 로 재적용.
-- ============================================================

BEGIN;

-- ── ① 오늘 목록 — 시가 % + kind 16 팀 칸 ─────────────────────────────
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
      ), ac AS (   -- (c) kind 16 isin 별 최신 1행 — 가시 게이트웨이 · 복원 자르기는 dma_accum_signals_for_user_json 한 벌
        SELECT DISTINCT ON (x.ev->>'isin')
               x.ev->>'isin' AS isin,
               (x.ev->>'cond_threshold')::bigint AS net_krw,
               (jsonb_array_length(x.ev->'snap_qty') >= 3 AND jsonb_array_length(x.ev->'snap_cum') >= 3) AS has_day,
               (x.ev->'snap_qty'->>2)::bigint AS day_buy,
               (x.ev->'snap_cum'->>2)::bigint AS day_sell,
               (x.ev->>'accept_latency_us')::int AS avg_px,
               ((regexp_match(x.ev->>'message', '(?:^|\|)day=(-?\d+)/\d+/\d+(?:\||$)'))[1])::bigint AS net_qty,
               nullif((x.ev->>'price')::int, 0) AS last_px
          FROM jsonb_array_elements(public.dma_accum_signals_for_user_json(p_user_id, v_today)) AS x(ev)
         WHERE (x.ev->>'qty')::int IN (1, 2, 3)
           AND x.ev->>'isin' <> ''
         ORDER BY x.ev->>'isin', (x.ev->>'gw_time_ms')::bigint DESC, (x.ev->>'seq')::bigint DESC, x.ev->>'gateway'
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
  'Phase 37 D-15 · quick 261104-n9h — 오늘(KST) 목록: kind 16 등록(accum) ∪ 오늘 고가 +15% 이상(up15 · 고가는 ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가) · 정렬 rate DESC · open_rate(같은 가드 ∧ 저가 ≤ 시가 ≤ 고가) · kind 16 isin 별 최신 행 팀 칸 7키(가시 게이트웨이만 · 당일 값은 snap 길이 3 행만). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_today_for_user(uuid) TO service_role;

-- ── ② 하루 목록 — 시가 %(KRX 행만) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_day_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  v_dates := ARRAY(SELECT DISTINCT g.date FROM public.tick_grids g ORDER BY g.date DESC);
  v_date  := coalesce(p_date, v_dates[1]);  -- 이력 0 · p_date 없음 → null

  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.high_rate DESC NULLS LAST, s.isin, s.exchange), '[]'::jsonb)
               FROM (SELECT g.date, g.exchange, g.isin, st.code, st.name, g.mode, g.sources, g.bytes, g.records,
                            g.a3_count, g.high_rate, g.last_rate, g.created_at,
                            g.team_fills, g.team_day_net_krw, g.team_day_pnl_krw,
                            a.pos_net_krw AS accum_pos_net_krw,
                            -- 시가 % — KRX 행만 · 기준가 = 격자 base_px 우선(high_rate · last_rate 와 같은 분모) · 없으면 일봉 폴백
                            CASE WHEN g.exchange = 'KRX' AND o.open > 0
                                  AND coalesce(nullif(g.base_px, 0), o.close - o.change_amount) > 0
                                 THEN ((o.open - coalesce(nullif(g.base_px, 0), o.close - o.change_amount)) * 100
                                       / coalesce(nullif(g.base_px, 0), o.close - o.change_amount))::double precision
                            END AS open_rate
                       FROM public.tick_grids g
                       LEFT JOIN public.stocks st ON st.isin = g.isin
                       -- 매집감지 누적(결정 2) — PK (date, isin) 라 행 중복 없음 · KRX · NXT 두 행이 같은 값
                       LEFT JOIN public.limitup_accum_flow a ON a.date = g.date AND a.isin = g.isin
                       -- 일봉 — PK (code, date) 라 행 중복 없음 · KRX 행만 붙인다(NXT 시가는 KRX 일봉이 아님)
                       LEFT JOIN public.stock_daily_ohlcv o
                              ON g.exchange = 'KRX' AND o.code = st.code AND o.date = to_date(g.date, 'YYYYMMDD')
                      WHERE g.date = v_date) s),
    'requests', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.exchange, q.isin), '[]'::jsonb)
                   FROM (SELECT r.exchange, r.isin, r.status, r.requested_at, r.triggered_at, r.started_at,
                                r.finished_at, r.error
                           FROM public.tick_convert_requests r
                          WHERE r.date = v_date) q),
    'eta_s', jsonb_build_object('KRX', public.tick_eta_s('KRX'), 'NXT', public.tick_eta_s('NXT')));
END;
$$;

COMMENT ON FUNCTION public.tick_day_for_user(uuid, text) IS
  'Phase 37 D-08 · quick 261103-j4d · 261104-n9h — 틱 뷰어 하루 목록(jsonb 1회 · 날짜 목록 · 그날 격자(+ 팀 3칸 · 매집감지 누적 순매수 · open_rate = KRX 일봉 시가 % · 기준가 base_px 우선) · 요청 · eta_s). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) TO service_role;

COMMIT;
