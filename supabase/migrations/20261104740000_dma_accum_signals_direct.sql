-- ============================================================
-- 261104 핫픽스 — dma_accum_signals_for_user_json 이 50~92초 걸리던 것을 고친다(작업대 「매집」 줄 첫 채움 · GET /api/accum-signals).
--
-- 실측(2026-11-04 15:24~15:29 KST Cloud Run 요청 로그): /api/accum-signals 50.6 · 52.2 · 53.4 · 74.7 · 92.7초.
-- 원인: ev CTE 가 dma_strategy_events_for_user(p_user_id, p_trade_date) — 그날 **전 kind** 이벤트를 행마다 to_jsonb + stocks 조인 +
--   가시성 EXISTS(dma_visible_accounts 호출)로 다 펼친 뒤 kind 16 만 거른다. 장중 이벤트가 쌓일수록 느려진다.
--   (같은 원인으로 틱뷰어 오늘 목록도 60초 — 20261104730000 에서 그 RPC 만 먼저 고쳤다.)
-- 고침: ev CTE 만 교체 — 그날 kind 16 을 부분 인덱스(idx_dma_strategy_events_accum_signal_day)로 직접 읽고, 가시성은
--   dma_strategy_events_for_user 의 시세 kind 규칙(그 게이트웨이에 가시 계좌) 그대로 게이트웨이 집합 조인으로 옮긴다.
--   원소 jsonb 는 그 함수와 같은 모양(to_jsonb(e) − dma_user_id − applied_at ∥ stock_code). 자르기 · 최신 행 · 청산 행 고르기 ·
--   정렬은 20261024230000 본문 그대로.
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261024230000 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH vis AS (  -- 시세 kind 가시성 — 그 게이트웨이에 가시 계좌(dma_strategy_events_for_user 와 같은 규칙)
    SELECT DISTINCT v.gateway FROM public.dma_visible_accounts(p_user_id) v
  ),
  ev AS (        -- 그날 kind 16 만(부분 인덱스) · 원소 모양 = dma_strategy_events_for_user 행 jsonb
    SELECT to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code) AS ev,
           e.gateway,
           e.isin,
           e.gw_time_ms                 AS ms,
           e.seq,
           e.queue_case::int            AS queue_case,
           e.cancel_reason::int         AS cancel_reason
      FROM public.dma_strategy_events e
      JOIN vis ON vis.gateway = e.gateway
      LEFT JOIN public.stocks s ON s.isin = e.isin
     WHERE e.kind = 16
       AND e.trade_date = p_trade_date
  ),
  -- 게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 마지막 복원 행 기준 2분 창)의 시작 시각(20261018233000 ⑤).
  cut AS (
    SELECT r.gateway, min(r.ms) AS cut_ms
      FROM (
        SELECT e.gateway, e.ms, max(e.ms) OVER (PARTITION BY e.gateway) AS last_ms
          FROM ev e
         WHERE e.queue_case = 3
      ) r
     WHERE r.ms >= r.last_ms - 120000
     GROUP BY r.gateway
  ),
  -- 자르기 뒤 행만 — 최신 행 · 청산 행 고르기 모두 이 안에서 돈다.
  kept AS (
    SELECT e.*
      FROM ev e
      LEFT JOIN cut c
        ON c.gateway = e.gateway
     WHERE c.cut_ms IS NULL OR e.ms >= c.cut_ms
  ),
  ranked AS (
    SELECT k.*,
           row_number() OVER (PARTITION BY k.gateway, k.isin
                              ORDER BY k.ms DESC, k.seq DESC) AS rn_latest,
           row_number() OVER (PARTITION BY k.gateway, k.isin, (k.queue_case = 4 AND k.cancel_reason = 1)
                              ORDER BY k.ms DESC, k.seq DESC) AS rn_closed
      FROM kept k
  )
  -- 행마다 한 번만 평가하므로 최신 행이 곧 청산 행이어도 한 번만 실린다(UNION · 중복 제거 불필요).
  SELECT coalesce(jsonb_agg(r.ev ORDER BY r.gateway, r.isin, r.ms, r.seq), '[]'::jsonb)
    FROM ranked r
   WHERE r.rn_latest = 1
      OR (r.queue_case = 4 AND r.cancel_reason = 1 AND r.rn_closed = 1);
$$;

COMMENT ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) IS
  'kind 16 매집감지 읽기 — (gateway, isin) 별 최신 1행 + 그날 최신 청산 행 · 복원 묶음 자르기 · 가시 게이트웨이만. kind 16 부분 인덱스 직접 읽기(261104 핫픽스). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
