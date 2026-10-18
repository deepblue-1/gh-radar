-- ============================================================
-- quick-261018-rfy 후속 — 매집감지(kind 16) 읽기 RPC: 「복원 묶음 = 그 서버의 전체 목록」 규칙
--
-- 무엇: dma_accum_signals_for_user_json(uuid, date) 재정의 — 게이트웨이별로 **가장 최근 복원 묶음**(queue_case 3 ·
--       같은 재기동의 2분 창)의 시작 시각보다 오래된 kind 16 행은 버린 뒤 isin 별 1행을 고른다. 그 밖(같은 분
--       quote-primary 우선 · 폴백 · 정렬 · 권한)은 20261018120000 (라) 그대로.
-- 왜:   2026-10-18 밤 gh-trade 서버가 21:32 재기동 때 이월 백필 61건을 복원 행(queue_case 3)으로 냈고, 23:16 재기동 때는
--       규칙 변경으로 이월 파일을 21건짜리로 갈아끼워 사라진 46종목에 종료 행(queue_case 4)이 한 번도 나가지 않았다.
--       「isin 별 최신 행」 만 보면 그 46종목의 최신 행이 21:32 복원 행이라 작업대 「매집」 패널에 살아 있는 것으로 보였다
--       (사용자 제보 · gh-trade-a3 진단 · DB 대조 328행 — KB120 61 · KYOBO119 53 살아 있음, 실제 14).
--       서버가 재기동하며 내는 복원 행 묶음은 그 서버가 지금 들고 있는 포지션 **전체**이므로, 묶음 시작보다 오래된 행의
--       종목은 그 서버가 더는 들고 있지 않다. DB 행은 지우지 않는다(감사 기록 · 30일 purge).
-- 한계: 포지션 0건으로 재기동하면 복원 행이 없어 이 규칙이 못 잡는다 — 그 경우는 gh-trade 의 종료 행만이 신호다
--       (gh-trade 에 「이월 파일 교체 시 빠진 종목 종료 행」 제안함).
-- 같은 규칙을 웹 라이브 병합(webapp/src/lib/accum-list.ts restoreCutByGateway · latestAccumByIsin)도 쓴다 — 한쪽만 바꾸면
-- REST 복원과 라이브 목록이 갈린다.
--
-- 되돌리기(수동): 20261018120000 (라) 본문 재적용.
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
           (t.ev->>'gw_time_ms')::bigint    AS ms,
           (t.ev->>'queue_case')::int       AS queue_case
      FROM public.dma_strategy_events_for_user(p_user_id, p_trade_date) AS t(ev)
     WHERE (t.ev->>'kind')::int = 16
  ),
  -- 게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 마지막 복원 행 기준 2분 창)의 시작 시각.
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
  SELECT coalesce(jsonb_agg(l.ev ORDER BY l.ev->>'isin'), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (e.ev->>'isin') e.ev
        FROM ev e
        LEFT JOIN cut c
          ON c.gateway = e.gateway
        LEFT JOIN public.dma_servers s
          ON s.key = e.gateway
       WHERE c.cut_ms IS NULL OR e.ms >= c.cut_ms
       ORDER BY e.ev->>'isin',
                e.ms / 60000 DESC,
                s.is_quote_primary DESC NULLS LAST,
                e.ms DESC,
                e.gateway,
                (e.ev->>'seq')::bigint DESC
    ) AS l;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;
