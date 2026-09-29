-- ============================================================
-- Phase 25 Plan 03 — 전략 이벤트 조회 RPC 2종 (server 전용 · 요청 1 = RPC 1).
--
--   ① dma_strategy_events_for_user(p_user_id uuid, p_trade_date date) RETURNS SETOF jsonb
--      하루치 평면 목록 — 작업대 「주문로그」 탭 복원 · 창 분리 과거일 이동(GET /api/strategy-events).
--   ② dma_order_events_for_user(p_user_id uuid, p_order_id uuid, p_order_nos text[])
--        RETURNS TABLE (source text, gw_time_ms bigint, seq bigint, ev jsonb)
--      주문 1건(묶음) 이벤트 — 오늘 주문 행 펼침(GET /api/orders/:id/events). 통보 + 전략 UNION ALL.
--
-- 결정 근거:
--   - **가시성 = Phase 19 D-06 조인 동형.** user_id → dma_credentials.dma_user_id → dma_account_access →
--     (gateway, account_no). 기존 `dma_journal_orders_for_user` 와 같은 경로다 — 복원(이 RPC)과 푸시(relay
--     WsFanout.deliverStrategyEvents)가 같은 규칙으로 갈려야 새로고침 전후 목록이 같다.
--   - **시세 공개 판정은 kind 1·2 로만.** 시세 이벤트(LimitExposed · LimitEntered)는 계좌가 없고 그 게이트웨이
--     매핑 보유 사용자 전원에게 보인다. 빈 계좌번호로 판정하지 않는다 — 계좌가 빈 주문 이벤트(형식 이상)가
--     전원에게 새어 나가지 않게(T-25-14 · relay isMarketStrategyEvent 와 같은 규칙).
--   - **주문 이벤트 RPC 는 게이트웨이 · 거래일 · 계좌를 `p_order_id` 행에서 읽는다(T-25-13).** 클라는 행 id 와
--     묶음 주문번호 배열만 넘긴다 — 그 행이 요청 사용자에게 보이지 않으면 0행이고, 주문번호 배열에 남의 계좌
--     번호를 끼워도 행의 계좌 밖으로 나가지 않는다. 멀티 게이트웨이(KB · KYOBO) 조인도 행이 정한다.
--   - **통보는 주문번호 또는 원주문번호 일치**(취소 확인 · 정정 확인 줄이 원주문 펼침에 나온다) ·
--     `apply_error IS NULL` 만(투영이 거부한 포이즌 이벤트 제외 — RESEARCH Open Q3 권장).
--   - **정렬 = gw_time_ms → 같은 ms 는 통보 먼저 → seq**(D-01 · Pitfall 9). 통보는 timestamptz 라
--     `round(extract(epoch FROM gw_time) * 1000)::bigint` 로 전략과 같은 ms 정수로 맞춘다 — ISO 문자열 비교 금지.
--   - **공개 컬럼만**: 전략 = `to_jsonb(e) - 'dma_user_id' - 'applied_at' || stock_code`(25-01 dma_strategy_apply
--     rows 와 같은 45키), 통보 = `to_jsonb(j) - 'dma_user_id' - 'apply_error' - 'applied_at'`(T-19-08 · T-25-16).
--   - **왕복 1회.** server 는 Cloud Run VPC egress 라 Supabase 왕복 수가 지연을 지배한다 — 표면마다 RPC 하나.
--   - `p_order_nos` 가 NULL · 빈 배열이면 행 자신의 주문번호 하나로 대체한다(단건 펼침).
--   T-19-01 · T-25-12: 두 함수 모두 service_role 전용 — 시그니처 정확히 3줄씩(메모리 「RPC 는 REVOKE
--   anon/authenticated 명시」 — `REVOKE … FROM PUBLIC` 단독은 플랫폼 auto-grant 에 덮인다). p_user_id 는 server 가
--   requireAuth 로 확정한 값만 넘긴다(T-19-17).
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) — 테이블은 서비스롤 전용 그대로.
--   - 원격 적용 — 이 파일은 원격 미적용으로 커밋되고 25-11 에서 사용자가 `supabase db push` 한다.
-- ============================================================

BEGIN;

-- ── ① 하루치 평면 목록 ─────────────────────────────────────────
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
       -- 주문 이벤트: 계좌 조인(D-06). 계좌가 빈 주문 이벤트는 어느 access 행과도 맞지 않아 비공개다.
       (e.kind NOT IN (1, 2) AND EXISTS (
          SELECT 1
            FROM public.dma_account_access a
            JOIN public.dma_credentials c ON c.dma_user_id = a.dma_user_id
           WHERE c.user_id = p_user_id
             AND a.gateway = e.gateway
             AND a.account_no = e.account_no))
       OR
       -- 시세 이벤트(kind 1·2): 그 게이트웨이 매핑 보유 사용자 전원.
       (e.kind IN (1, 2) AND EXISTS (
          SELECT 1
            FROM public.dma_account_access a
            JOIN public.dma_credentials c ON c.dma_user_id = a.dma_user_id
           WHERE c.user_id = p_user_id
             AND a.gateway = e.gateway))
     )
   ORDER BY e.gw_time_ms, e.gateway, e.seq;
$$;

-- ── ② 주문 1건(묶음) 이벤트 — 통보 + 전략 ─────────────────────────
CREATE OR REPLACE FUNCTION public.dma_order_events_for_user(p_user_id uuid, p_order_id uuid, p_order_nos text[])
RETURNS TABLE (
  source     text,
  gw_time_ms bigint,
  seq        bigint,
  ev         jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH o AS (
    -- 요청 사용자에게 보이는 행만 — 게이트웨이 · 거래일 · 계좌의 유일한 출처(T-25-13).
    SELECT r.gateway, r.trade_date, r.account_no, r.order_no
      FROM public.dma_account_orders r
     WHERE r.id = p_order_id
       AND EXISTS (
         SELECT 1
           FROM public.dma_account_access a
           JOIN public.dma_credentials c ON c.dma_user_id = a.dma_user_id
          WHERE c.user_id = p_user_id
            AND a.gateway = r.gateway
            AND a.account_no = r.account_no)
     LIMIT 1
  ),
  k AS (
    SELECT o.gateway, o.trade_date, o.account_no,
           CASE WHEN p_order_nos IS NULL OR cardinality(p_order_nos) = 0
                THEN ARRAY[o.order_no]
                ELSE p_order_nos
           END AS nos
      FROM o
  ),
  u AS (
    SELECT 'journal'::text AS source,
           round(extract(epoch FROM j.gw_time) * 1000)::bigint AS gw_time_ms,
           j.seq,
           to_jsonb(j) - 'dma_user_id' - 'apply_error' - 'applied_at' AS ev
      FROM public.dma_journal_events j
      JOIN k ON j.gateway = k.gateway AND j.trade_date = k.trade_date AND j.account_no = k.account_no
     WHERE j.apply_error IS NULL
       AND (j.order_no = ANY (k.nos) OR (j.org_order_no <> '' AND j.org_order_no = ANY (k.nos)))
    UNION ALL
    SELECT 'strategy'::text,
           e.gw_time_ms,
           e.seq,
           to_jsonb(e) - 'dma_user_id' - 'applied_at'
             || jsonb_build_object('stock_code', s.code)
      FROM public.dma_strategy_events e
      JOIN k ON e.gateway = k.gateway AND e.trade_date = k.trade_date AND e.account_no = k.account_no
      LEFT JOIN public.stocks s ON s.isin = e.isin
     WHERE e.order_no <> '' AND e.order_no = ANY (k.nos)
  )
  SELECT u.source, u.gw_time_ms, u.seq, u.ev
    FROM u
   ORDER BY u.gw_time_ms, CASE u.source WHEN 'journal' THEN 0 ELSE 1 END, u.seq;
$$;

-- ── 권한: service_role 전용 (시그니처 정확히 — Pitfall 13) ──────────
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_order_events_for_user(uuid, uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_order_events_for_user(uuid, uuid, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_order_events_for_user(uuid, uuid, text[]) TO service_role;

COMMIT;
