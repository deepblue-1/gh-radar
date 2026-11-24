-- ============================================================
-- 회귀 수정 — 주문로그 하루치 조회(dma_strategy_events_for_user_json)에 발사 조각 · 머리(kind 17 · 18)가 섞여 나오던 것을 막는다.
--
-- 원인: 261109 핫픽스(20261109200000 · 22b1d41e)가 래퍼를 20261018120000 (나) 본문 기준으로 다시 쓰면서,
--   그 사이 20261027200100 ④ 가 더한 「kind 17 · 18 제외」(Phase 35 D-05 — 발사 원문은 어드민 전용 · 주문로그에 섞지 않는다)를 빠뜨렸다.
--   kind 17 은 account_no 를 싣기 때문에 주문 kind 갈래(가시 계좌 조인)를 그대로 통과한다 — 11-09 부터 트레이더 본인 계좌의
--   발사 조각이 주문로그 응답에 실렸다. pgTAP launch_project_mapping · launch_gate_apply 29번이 그 뒤로 실패 중이었다.
--   gh-trade Phase 49 08:30 G2 발사(profile 4)가 켜지면 같은 행이 더 는다.
-- 고침: 주문 kind 갈래의 제외 목록에 17 · 18 을 더한다 — 나머지(가시성 · 원소 모양 · 정렬 · kind 15 · 16 규칙 · 인덱스 경로)는
--   20261109200000 본문 그대로. 시세 갈래(1 · 2 · 10)와 kind 15 갈래는 원래 17 · 18 을 싣지 않는다.
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261109200000 본문 재적용.
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
    -- 주문 이벤트 — 가시 계좌 조인(idx_dma_strategy_events_day = trade_date, gateway, account_no).
    --   17 · 18 = 발사 조각 · 머리(Phase 35 D-05 — 어드민 전용 · 주문로그에 섞지 않는다).
    SELECT e.*
      FROM public.dma_strategy_events e
      JOIN vis ON vis.gateway = e.gateway AND vis.account_no = e.account_no
     WHERE e.trade_date = p_trade_date
       AND e.kind NOT IN (1, 2, 10, 15, 16, 17, 18)
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
  '주문로그 하루치 — 주문 kind 는 가시 계좌 · 시세 kind 1·2·10(·lf 일 때 15)은 가시 게이트웨이 · kind 16 · 17 · 18 제외. 원 테이블 직접 읽기(261109 핫픽스 · 261125 17·18 제외 복원). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
