-- ============================================================
-- tick_open_for_user — accum 에 avg_px(매집감지 보고서 누적 평단 계단 · payload.avg_px 그대로)를 더한다 (Phase 42 D-18).
--
-- 나머지 계약(게이트 · grid · request · accum.reg_time_ms · pos_net · stock · eta_s)은 20261103210000 그대로.
-- server 는 accum 을 그대로 넘기므로(services/ticks.ts openTick) 재배포가 필요 없다.
-- 키가 없는 옛 행(2026-10-21 이전)은 avg_px 가 JSON null — 웹은 미등록과 같게 그린다.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tick_open_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  -- 게이트 — 하루 목록과 같은 판정
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  v_blocked := public.tick_trigger_blocked(p_date, p_ex);

  RETURN jsonb_build_object(
    'access', true,
    'date', p_date,
    'exchange', p_ex,
    'isin', p_isin,
    'grid', (SELECT to_jsonb(g) FROM public.tick_grids g
              WHERE g.date = p_date AND g.exchange = p_ex AND g.isin = p_isin),
    -- stale = 깨워야 하는데 아무도 안 깨운 pending · 죽은 Job 의 running(25분) — 웹은 stale 이면 convert 를 다시 부른다
    'request', (SELECT jsonb_build_object(
                         'exchange', r.exchange, 'isin', r.isin, 'status', r.status,
                         'requested_at', r.requested_at, 'triggered_at', r.triggered_at,
                         'started_at', r.started_at, 'finished_at', r.finished_at, 'error', r.error,
                         'stale', coalesce(
                           (r.status = 'pending'
                             AND (r.triggered_at IS NULL OR r.triggered_at < now() - interval '2 minutes')
                             AND NOT v_blocked)
                           OR (r.status = 'running' AND r.started_at < now() - interval '25 minutes'), false))
                  FROM public.tick_convert_requests r
                 WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin),
    -- D-09 — 매집감지 등록 종목이면 회색 누적 선 입력(없으면 null) + avg_px(Phase 42 D-18)
    'accum', (SELECT jsonb_build_object('reg_time_ms', a.reg_time_ms, 'pos_net', a.payload->'pos_net', 'avg_px', a.payload->'avg_px')
                FROM public.limitup_accum_flow a
               WHERE a.date = p_date AND a.isin = p_isin),
    -- listing_shares = 상장주식수(현재 값) — 웹이 기준가 × 이 값으로 시총을 잡아 거래대금 시총 대비를 보인다(스케치 022)
    'stock', (SELECT jsonb_build_object('code', st.code, 'name', st.name, 'listing_shares', st.listing_shares)
                FROM public.stocks st WHERE st.isin = p_isin),
    'eta_s', public.tick_eta_s(p_ex));
END;
$$;

COMMENT ON FUNCTION public.tick_open_for_user(uuid, text, text, text) IS
  'Phase 37 D-08/D-09 — 틱 뷰어 한 종목 열기(격자 메타 · 요청 + stale · 매집감지 누적 · 종목(+ 상장주식수) · eta_s). DMA 매핑 사용자만. service_role 전용 · accum.avg_px(Phase 42 D-18)';

REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) TO service_role;

COMMIT;
