-- ============================================================
-- quick-261003-rc4 — 전략 이벤트 kind 10 BurstLimit(버스트 상한가) 시세 가시성
--
-- 무엇: gh-trade 3dabd6ff 가 StrategyEventKind 말미에 BurstLimit = 10 을 더했다. 상한가 매도잔량이 버스트
--       조각만으로 소진된 순간의 **시세 이벤트**다 — LimitExposed(1) · LimitEntered(2) 와 같은 부류로 계좌가
--       없다(account_no ''). 슬롯 재사용: cond_actual = 조각 수 · ev_trade_qty = 합계 수량 · ev_price = 상한가 ·
--       cum_volume = 누적.
-- 왜:   조회 RPC dma_strategy_events_for_user 가 시세 가시성을 kind (1, 2) 로 하드코딩하고 있다. 10 은 주문
--       이벤트 규칙(가시 계좌 조인)으로 떨어지고, 계좌가 '' 라 어느 가시 계좌와도 맞지 않아 아무에게도 보이지
--       않는다 — relay journal.events 푸시(shared isMarketStrategyEvent)와 REST 백필이 갈린다.
-- 대상: dma_strategy_events_for_user 1개만 재정의한다(20260929190000 ⑦-① 본문 그대로 · 두 kind 조건만 교체).
--       dma_order_events_for_user 는 kind 조건이 없어(주문번호 · 계좌 조인) 무변경.
-- 9:    kind 9 는 gh-radar 「상태전이」 예약 번호라 시세 집합에 넣지 않는다 — 계좌가 빈 9 는 계속 비공개다.
--
-- 시세 kind 집합 {1, 2, 10} 은 packages/shared/src/strategy-event.ts isMarketStrategyEvent 와 같아야 한다 —
-- 하나만 바뀌면 wss 푸시와 REST 백필이 갈린다.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_strategy_events_for_user(p_user_id uuid, p_trade_date date)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(e) - 'dma_user_id' - 'applied_at'
           || jsonb_build_object('stock_code', s.code)
    FROM public.dma_strategy_events e
    LEFT JOIN public.stocks s
      ON s.isin = e.isin
   WHERE e.trade_date = p_trade_date
     AND (
       -- 주문 이벤트: 가시 계좌(dma_visible_accounts — 게이트웨이 인지). 계좌가 빈 주문 이벤트는 어느 가시 계좌와도
       -- 맞지 않아 비공개다(예약 kind 9 포함).
       (e.kind NOT IN (1, 2, 10) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway
             AND v.account_no = e.account_no))
       OR
       -- 시세 이벤트(kind 1·2·10 — 상한가노출 · 상한가진입 · 버스트 상한가): 그 게이트웨이에 가시 계좌가 있는 사용자 전원.
       (e.kind IN (1, 2, 10) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway))
     )
   ORDER BY e.gw_time_ms, e.gateway, e.seq;
$$;

-- 권한 재명시: service_role 전용 (시그니처 정확히 — Pitfall 13 · 플랫폼 auto-grant 대비 anon/authenticated 명시 REVOKE)
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) TO service_role;

COMMIT;
