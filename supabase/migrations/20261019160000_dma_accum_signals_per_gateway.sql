-- ============================================================
-- quick-261018-rfy 후속 2 — 매집감지(kind 16) 읽기 RPC: (gateway, isin) 별 최신 1행 — 서버 기준은 웹이 고른다
--
-- 무엇: dma_accum_signals_for_user_json(uuid, date) 재정의 — 게이트웨이를 가로질러 isin 별 1행을 고르던 것을
--       **(gateway, isin) 별 1행**으로 바꾼다. 복원 묶음 자르기(20261018233000 ⑤)는 그대로 게이트웨이별이다.
--       같은 분 quote-primary 우선 · 폴백(dma_servers 조인)은 뺀다 — 서버 사이 선택이 더는 없다.
-- 왜:   2026-10-19 장중 KB120 과 KYOBO119 의 등록 종목 집합이 다르다(KB 13 · 교보 16 · 공통 12 — 「우리 체결 제외」 가 서버마다
--       달라 임계 통과 시점이 갈린다). 합집합을 보이면 gh-trade 클라(접속한 서버 하나)와 목록이 다르다는 사용자 제보.
--       사용자 결정(2026-10-19): 웹은 **작업대에서 고른 계좌의 서버**(RelayAccount.serverKey) 기준으로 한 서버 목록만 보인다.
--       RPC 는 서버별 최신 행을 다 주고, 웹 훅(use-accum-signals.ts)이 게이트웨이로 거른다 — 계좌를 바꾸면 재조회 없이 목록이 바뀐다.
-- 정렬: gateway, isin 오름차순. 원소 = SETOF 행 jsonb 그대로. 빈 날 '[]'.
-- 같은 자르기 규칙을 웹 라이브 병합(accum-list.ts restoreCutByGateway)이 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
--
-- 되돌리기(수동): 20261018233000 본문 재적용.
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
           (t.ev->>'queue_case')::int       AS queue_case
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
  )
  SELECT coalesce(jsonb_agg(l.ev ORDER BY l.gateway, l.isin), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (e.gateway, e.isin) e.ev, e.gateway, e.isin
        FROM ev e
        LEFT JOIN cut c
          ON c.gateway = e.gateway
       WHERE c.cut_ms IS NULL OR e.ms >= c.cut_ms
       ORDER BY e.gateway, e.isin, e.ms DESC, (e.ev->>'seq')::bigint DESC
    ) AS l;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;
