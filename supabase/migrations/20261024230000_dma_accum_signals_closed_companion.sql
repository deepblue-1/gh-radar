-- ============================================================
-- quick-261024-uov — 매집감지(kind 16) 읽기 RPC: (gateway, isin) 별 최신 1행 + 그날 최신 청산 행
--
-- 무엇: dma_accum_signals_for_user_json(uuid, date) 재정의 — (gateway, isin) 별 최신 1행에 더해, 같은 (gateway, isin) 의
--       그날 queue_case 4 · cancel_reason 1(청산) 행 중 최신 1행을 함께 싣는다(최신 행이 곧 그 청산 행이면 1행).
--       복원 묶음 자르기(20261018233000 ⑤)는 두 고르기 모두에 먼저 적용한다.
-- 왜:   gh-trade 가 end_reason 4 「매집 종료」 를 장중 청산 뒤 같은 사이클 두 번째 종료 행으로 낸다(인박스
--       261024-accum-hidden-carry10 「추가 — 매집 종료」 · 88 없음 → gh-trade 클라는 회색 「청산」 행을 자정까지 둔다).
--       웹은 「그날 청산 행이 있는 종목만」 매집 종료 뒤에도 회색으로 남기고, 그 행의 값 · 「갱신」 시각은 그 청산 행이다
--       (숨김 이월 뒤 바로 끝난 종목은 클라 목록에 없었다). 최신 1행만 주면 새로고침 뒤 end 4 가 end 1 을 가려 판정할 수 없다.
-- 정렬: gateway, isin, gw_time_ms, seq 오름차순. 원소 = SETOF 행 jsonb 그대로. 중복 없음. 빈 날 '[]'.
-- 같은 판정을 웹 라이브(accum-list.ts closedRowsOf · isListedAccum)가 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
-- 같은 자르기 규칙을 웹 라이브 병합(accum-list.ts restoreCutByGateway)이 쓴다.
--
-- 되돌리기(수동): 20261019160000 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH ev AS (
    SELECT t.ev,
           t.ev->>'gateway'                 AS gateway,
           t.ev->>'isin'                    AS isin,
           (t.ev->>'gw_time_ms')::bigint    AS ms,
           (t.ev->>'seq')::bigint           AS seq,
           (t.ev->>'queue_case')::int       AS queue_case,
           (t.ev->>'cancel_reason')::int    AS cancel_reason
      FROM public.dma_strategy_events_for_user(p_user_id, p_trade_date) AS t(ev)
     WHERE (t.ev->>'kind')::int = 16
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

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;
