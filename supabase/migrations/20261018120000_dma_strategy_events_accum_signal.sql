-- ============================================================
-- quick-261018-rfy — 전략 이벤트 kind 16 AccumSignal(매집감지) 시세 가시성 · 주문로그 제외 · 30일 purge · isin 별 최신 읽기 RPC
--
-- 무엇: gh-trade Phase 34 관찰자 저널이 kind 16 AccumSignal(팀 매집 누적 상태 전체)을 등록 종목만 · 키(isin)당 분당 ≤1행 ·
--       변화 시만 적재한다(인박스 docs/inbox/from-gh-trade/261018-accum-signal.md). 시세 이벤트라 계좌가 없다
--       (account_no '' · dma_user_id '' · order_no ''). 82/81 로는 오지 않는다. 세 서버(KB120 · KB121 · KYOBO119)가 각자 넣는다.
-- 왜:   조회 RPC dma_strategy_events_for_user 의 시세 kind 집합이 (1, 2, 10, 15) 라 16 은 주문 이벤트 규칙(가시 계좌
--       조인)으로 떨어지고, 계좌가 '' 라 아무에게도 보이지 않은 채 적재만 된다. 16 은 주문로그가 아니라 작업대 「매집」
--       패널이 쓰므로 주문로그 jsonb 래퍼에서는 늘 뺀다. 보관은 kind 15 와 같이 30일(gh-trade 합의).
-- 대상:
--   (가) dma_strategy_events_for_user(uuid, date) 재정의 — 20261006090000 본문 그대로 · kind 조건 두 곳만 16 추가.
--   (나) dma_strategy_events_for_user_json(uuid, date, boolean DEFAULT false) 재정의 — 본문 그대로 · WHERE 에
--        「kind <> 16」(p_include_limit_feature 와 무관 · 시그니처 불변).
--   (다) dma_strategy_events_purge_limit_feature(integer) 재정의 — kind IN (15, 16)(이름 · 시그니처 · 반환 · 워커 호출 불변)
--        + 부분 인덱스 idx_dma_strategy_events_accum_signal_day (trade_date) WHERE kind = 16.
--   (라) 신규 dma_accum_signals_for_user_json(uuid, date) → jsonb — 그날 kind 16 중 isin 별 1행:
--        다른 분(gw_time_ms / 60000)이면 늦은 분, 같은 분이면 dma_servers.is_quote_primary 게이트웨이 행, 그 서버 행이
--        없으면 다른 서버 행(「quote-primary 정본 + 폴백」 — gh-trade 합의). 그다음 gw_time_ms desc → gateway → seq desc.
--        가시성은 SETOF 함수 한 곳이 정본이다(별도 조인 없음). 원소는 SETOF 행 jsonb 그대로 · isin 오름차순 · 빈 날 '[]'.
-- 권한: 네 함수 모두 service_role 전용 — PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--       (메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 — 플랫폼 auto-grant 가 PUBLIC REVOKE 를 덮는다).
--       SECURITY INVOKER(호출자는 service_role).
--
-- 시세 kind 집합 {1, 2, 10, 15, 16} 은 packages/shared/src/strategy-event.ts isMarketStrategyEvent 와 같아야 한다 —
-- 하나만 바뀌면 wss 푸시(relay 가 shared 판정을 import)와 REST 백필이 갈린다.
--
-- 되돌리기(수동):
--   DROP FUNCTION public.dma_accum_signals_for_user_json(uuid, date);   -- server 를 이전 커밋으로 먼저
--   DROP INDEX IF EXISTS public.idx_dma_strategy_events_accum_signal_day;
--   20261006090000_dma_strategy_events_limit_feature.sql 의 세 함수 본문 재적용(집합 1·2·10·15 · 래퍼 15 만 · purge 15 만).
-- ============================================================

BEGIN;

-- (가) 시세 kind 집합에 16 추가 — 20261006090000 본문 그대로, kind 조건 두 곳과 그 주석만 교체.
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
       (e.kind NOT IN (1, 2, 10, 15, 16) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway
             AND v.account_no = e.account_no))
       OR
       -- 시세 이벤트(kind 1·2·10·15·16 — 상한가노출 · 상한가진입 · 버스트 상한가 · 상한가 특징 · 매집감지): 그 게이트웨이에 가시 계좌가 있는 사용자 전원.
       (e.kind IN (1, 2, 10, 15, 16) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway))
     )
   ORDER BY e.gw_time_ms, e.gateway, e.seq;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) TO service_role;

-- (나) 주문로그 jsonb 래퍼 — kind 15 는 p_include_limit_feature 일 때만, kind 16(매집감지)은 늘 뺀다(주문로그에 안 섞는다).
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
   WHERE (p_include_limit_feature OR (t.ev->>'kind')::int <> 15)
     AND (t.ev->>'kind')::int <> 16;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean) TO service_role;

-- (다) kind 15 · 16 보존 purge — KST 오늘 − p_keep_days 보다 이전 거래일의 kind 15(상한가 특징) · 16(매집감지 — 30일,
--      gh-trade 합의)만 지우고 지운 수를 돌려준다. 함수 이름은 그대로 둔다(워커 호출 불변).
CREATE OR REPLACE FUNCTION public.dma_strategy_events_purge_limit_feature(p_keep_days integer)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    DELETE FROM public.dma_strategy_events
     WHERE kind IN (15, 16)
       AND trade_date < (now() AT TIME ZONE 'Asia/Seoul')::date - p_keep_days
    RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_purge_limit_feature(integer) TO service_role;

-- purge · 하루치 조회용 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_accum_signal_day
  ON public.dma_strategy_events (trade_date) WHERE kind = 16;

-- (라) 작업대 「매집」 패널 복원 — 그날 kind 16 isin 별 1행(같은 분 quote-primary 우선 + 폴백). 가시성은 SETOF 함수 조인 그대로.
CREATE OR REPLACE FUNCTION public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(l.ev ORDER BY l.ev->>'isin'), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (t.ev->>'isin') t.ev
        FROM public.dma_strategy_events_for_user(p_user_id, p_trade_date) AS t(ev)
        LEFT JOIN public.dma_servers s
          ON s.key = t.ev->>'gateway'
       WHERE (t.ev->>'kind')::int = 16
       ORDER BY t.ev->>'isin',
                (t.ev->>'gw_time_ms')::bigint / 60000 DESC,
                s.is_quote_primary DESC NULLS LAST,
                (t.ev->>'gw_time_ms')::bigint DESC,
                t.ev->>'gateway',
                (t.ev->>'seq')::bigint DESC
    ) AS l;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;
