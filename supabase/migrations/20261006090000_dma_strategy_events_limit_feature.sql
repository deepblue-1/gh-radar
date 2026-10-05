-- ============================================================
-- Phase 28 Plan 02 — 전략 이벤트 kind 15 LimitFeature(상한가 특징) 시세 가시성 · jsonb 래퍼 · 30일 purge
--
-- 무엇: gh-trade Phase 27 관찰자 저널이 kind 15 LimitFeature 를 분당 · 키당 1행 적재한다. 시세 이벤트라 계좌가
--       없다(account_no '' · dma_user_id ''). 82/81 로는 오지 않고 85 실시간 + kind 15 저널로만 온다.
-- 왜:   (D-06) 조회 RPC dma_strategy_events_for_user 의 시세 kind 집합이 (1, 2, 10) 이라 15 는 주문 이벤트 규칙
--       (가시 계좌 조인)으로 떨어지고, 계좌가 '' 라 아무에게도 보이지 않은 채 적재만 된다.
--       (D-18) 15 를 그대로 열면 사용자당 하루 수천~1만 행이 SETOF 응답에 섞인다. PostgREST max_rows
--       (supabase/config.toml max_rows = 1000)는 SETOF RPC 응답에도 적용되고 정렬이 gw_time_ms 오름차순이라
--       **늦은 시각 행(주문 이벤트 포함)이 오류 없이 사라진다**(RESEARCH Pitfall 2 — 19-REVIEW WR-06 과 같은 결함).
--       → jsonb 스칼라 래퍼(20261004090000 선례)로 max_rows 를 벗어나고, kind 15 는 기본 응답에서 뺀다.
--       (D-08) kind 15 는 30일만 보존한다 — 적재 워커가 밤마다 purge RPC 를 부른다(pg_cron 사용 이력 0).
-- 대상:
--   (가) dma_strategy_events_for_user(uuid, date) 재정의 — 20261003120000 본문 그대로 · kind 조건 두 곳만 15 추가.
--   (나) 신규 dma_strategy_events_for_user_json(uuid, date, boolean DEFAULT false) → jsonb. SETOF 결과를 같은 정렬로
--        접기만 한다 — 가시성 정본은 여전히 SETOF 함수 한 곳.
--   (다) 신규 dma_strategy_events_purge_limit_feature(integer) → integer(지운 행 수). kind 15 만 지운다 — 주문
--        이벤트 · 시세 1/2/10 은 감사 기록이라 손대지 않는다.
--   (라) 부분 인덱스 idx_dma_strategy_events_limit_feature_day (trade_date) WHERE kind = 15 — purge 용.
--   기존 SETOF 함수는 지우지 않는다 — server 배포 전후 어느 쪽에서도 조회가 끊기지 않게(배포 순서: 이 마이그레이션
--   → server · 20261004090000 과 같은 근거). 이후 server 는 래퍼만 부른다.
-- 권한: 세 함수 모두 service_role 전용 — PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--       (메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 — 플랫폼 auto-grant 가 PUBLIC REVOKE 를 덮는다).
--       SECURITY INVOKER(호출자는 service_role).
--
-- 시세 kind 집합 {1, 2, 10, 15} 은 packages/shared/src/strategy-event.ts isMarketStrategyEvent 와 같아야 한다 —
-- 하나만 바뀌면 wss 푸시(relay 가 shared 판정을 import)와 REST 백필이 갈린다.
--
-- 되돌리기(수동):
--   DROP INDEX IF EXISTS public.idx_dma_strategy_events_limit_feature_day;
--   DROP FUNCTION public.dma_strategy_events_purge_limit_feature(integer);
--   DROP FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean);   -- server 를 이전 커밋으로 먼저
--   20261003120000_dma_strategy_events_burst_limit.sql 의 dma_strategy_events_for_user 본문 재적용(집합 1·2·10).
-- ============================================================

BEGIN;

-- (가) 시세 kind 집합에 15 추가 — 20261003120000 본문 그대로, kind 조건 두 곳과 그 주석만 교체.
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
       (e.kind NOT IN (1, 2, 10, 15) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway
             AND v.account_no = e.account_no))
       OR
       -- 시세 이벤트(kind 1·2·10·15 — 상한가노출 · 상한가진입 · 버스트 상한가 · 상한가 특징): 그 게이트웨이에 가시 계좌가 있는 사용자 전원.
       (e.kind IN (1, 2, 10, 15) AND EXISTS (
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

-- (나) jsonb 스칼라 래퍼 — max_rows 무관 · kind 15 기본 제외(D-18). 스칼라 SRF 의 별칭 모호성을 피하려고 AS t(ev) 열 별칭.
CREATE OR REPLACE FUNCTION public.dma_strategy_events_for_user_json(
  p_user_id uuid, p_trade_date date, p_include_limit_feature boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
           jsonb_agg(t.ev ORDER BY (t.ev->>'gw_time_ms')::bigint, t.ev->>'gateway', (t.ev->>'seq')::bigint),
           '[]'::jsonb)
    FROM public.dma_strategy_events_for_user(p_user_id, p_trade_date) AS t(ev)
   WHERE p_include_limit_feature OR (t.ev->>'kind')::int <> 15;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) TO service_role;

-- (다) kind 15 보존 purge(D-08) — KST 오늘 − p_keep_days 보다 이전 거래일의 kind 15 만 지우고 지운 수를 돌려준다.
CREATE OR REPLACE FUNCTION public.dma_strategy_events_purge_limit_feature(p_keep_days integer)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    DELETE FROM public.dma_strategy_events
     WHERE kind = 15
       AND trade_date < (now() AT TIME ZONE 'Asia/Seoul')::date - p_keep_days
    RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) TO service_role;

-- (라) purge 용 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_limit_feature_day
  ON public.dma_strategy_events (trade_date) WHERE kind = 15;

COMMIT;
