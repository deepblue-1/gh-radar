-- ============================================================
-- 261109 핫픽스 — 주문로그 하루치 조회(dma_strategy_events_for_user_json)가 장중 8~70초 걸리던 것을 고친다.
--
-- 증상: 앱에서 체결 알림을 탭하면 주문로그가 「오늘 주문로그를 불러오지 못했어요」 — 웹 apiFetch 상한 8초를 넘는다.
-- 실측(Cloud Run 요청 로그 GET /api/strategy-events): 11-09 12:07~12:18 KST 22.5 · 24.4 · 62.4 · 68.9 · 70.7초,
--   11-02 · 11-04 장중 15~91초. 주말(11-07)은 0.1~0.5초. PostgREST 직접 호출 8.5 · 15.1초(응답 877 · 969행).
-- 원인: 래퍼가 dma_strategy_events_for_user(p_user_id, p_trade_date) — 그날 **전 kind** 행을 to_jsonb + stocks 조인 +
--   행마다 가시성 EXISTS(dma_visible_accounts 호출)로 다 펼친 뒤 kind 15 · 16 을 거른다. 11-09 장중 그날 행은
--   kind 15 = 146,399 · kind 16 = 90,078 · 나머지 ≈ 2,000 — 버릴 23만 행을 다 만든다(20261104740000 매집 줄과 같은 원인).
-- 고침: 래퍼만 교체 — 원 테이블을 kind 를 먼저 걸러 직접 읽고, 가시성은 사용자 가시 계좌를 한 번만 구해 조인한다.
--   가시성 규칙 · 원소 모양(to_jsonb(e) − dma_user_id − applied_at ∥ stock_code) · 정렬(gw_time_ms, gateway, seq) ·
--   kind 15(p_include_limit_feature 일 때만) · kind 16(늘 뺌)은 20261018120000 본문 그대로.
--   - 주문 kind(1 · 2 · 10 · 15 · 16 이 아닌 것): 가시 (gateway, account_no) 와 맞는 행 — 계좌가 빈 행은 어느 것과도 안 맞아 비공개.
--   - 시세 kind 1 · 2 · 10 (· lf 일 때 15): 그 게이트웨이에 가시 계좌가 있으면.
-- SETOF 함수 dma_strategy_events_for_user 는 그대로 둔다(다른 호출자 없음 · 규칙 정본 주석 유지).
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261018120000 의 (나) 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_strategy_events_for_user_json(
  p_user_id uuid, p_trade_date date, p_include_limit_feature boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH vis AS (   -- 사용자 가시 계좌 — 한 번만
    SELECT v.gateway, v.account_no FROM public.dma_visible_accounts(p_user_id) v
  ),
  vgw AS (        -- 시세 kind 가시성 — 그 게이트웨이에 가시 계좌
    SELECT DISTINCT gateway FROM vis
  ),
  ev AS (
    -- 주문 이벤트 — 가시 계좌 조인(idx_dma_strategy_events_day = trade_date, gateway, account_no)
    SELECT e.*
      FROM public.dma_strategy_events e
      JOIN vis ON vis.gateway = e.gateway AND vis.account_no = e.account_no
     WHERE e.trade_date = p_trade_date
       AND e.kind NOT IN (1, 2, 10, 15, 16)
    UNION ALL
    -- 시세 이벤트 kind 1 · 2 · 10
    SELECT e.*
      FROM public.dma_strategy_events e
      JOIN vgw ON vgw.gateway = e.gateway
     WHERE e.trade_date = p_trade_date
       AND e.kind IN (1, 2, 10)
    UNION ALL
    -- 상한가 특징 kind 15 — 체크가 켜졌을 때만(부분 인덱스 idx_dma_strategy_events_limit_feature_day)
    SELECT e.*
      FROM public.dma_strategy_events e
      JOIN vgw ON vgw.gateway = e.gateway
     WHERE p_include_limit_feature
       AND e.kind = 15
       AND e.trade_date = p_trade_date
  )
  SELECT coalesce(
           jsonb_agg(to_jsonb(ev) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code)
                     ORDER BY ev.gw_time_ms, ev.gateway, ev.seq),
           '[]'::jsonb)
    FROM ev
    LEFT JOIN public.stocks s
      ON s.isin = ev.isin;
$$;

COMMENT ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) IS
  '주문로그 하루치 — 주문 kind 는 가시 계좌 · 시세 kind 1·2·10(·lf 일 때 15)은 가시 게이트웨이 · kind 16 제외. 원 테이블 직접 읽기(261109 핫픽스). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
