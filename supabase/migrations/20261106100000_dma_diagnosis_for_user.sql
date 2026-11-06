-- ============================================================
-- Phase 39 Plan 03 — 매매진단 챗봇 「진단 조회」 RPC (SC-2 · SC-4 · SC-5 · D-11).
--
-- 무엇:
--   dma_diagnosis_for_user(p_user_id, p_trade_date, p_isin DEFAULT NULL) → jsonb — 그날 사용자 가시 계좌의
--   주문(orders) · 체결(fills) · 전략 이벤트(events — 예약 주문 kind 9 포함)를 RPC 한 번으로 묶어 돌려준다.
--   + 부분 인덱스 1(종목 지정 진단이 kind 4·5·7·8·9 까지 훑는 (trade_date, isin, exchange) 조회 — RESEARCH A6).
--
-- 응답 모양(39-05 diagnosis-order-log.ts 가 소비 — 바꾸면 그쪽 직렬화가 깨진다):
--   {access: false}                                  — 가시 계좌 0(DMA 매핑 없음 · NULL 사용자)
--   {access: true, date: 'YYYY-MM-DD', isin: <p_isin | null>, orders, fills, events}
--     orders = dma_account_orders(trade_date = p_trade_date ∧ order_no 있음 ∧ (p_isin NULL ∨ isin = p_isin))
--              {gateway, account_no, order_no, isin, stock_code, stock_name, exchange, board, side, order_type,
--               org_order_no, qty, price, filled_qty, status, result_code, message, origin, created_ms, updated_ms}
--              정렬 created_at, gateway, order_no
--     fills  = dma_journal_events 체결(notice_type 'E' ∧ exec_qty > 0)
--              {gateway, seq, gw_time_ms, account_no, order_no, isin, stock_code, exchange, side, exec_price, exec_qty}
--              정렬 gw_time, gateway, seq
--     events = dma_strategy_events — to_jsonb(e) - dma_user_id - applied_at || {stock_code, stock_name}
--              (주문로그 RPC 와 같은 꼴 — shared toStrategyEventRow 가 그대로 받는다) · 정렬 gw_time_ms, gateway, seq
--   *_ms = floor(epoch × 1000) — ms 절사(tick_own_for_user 와 같은 식).
--   dma_user_id · requester · applied_at 은 어느 배열에도 싣지 않는다(T-19-08 — 감사 칸 반환 금지).
--
-- 규칙:
--   게이트 = dma_visible_accounts(p_user_id) 가 1행 이상(tick_own_for_user 와 같은 판정).
--   계좌 범위 = 가시 계좌(gateway | account_no)의 행만. **어드민 우회 없음** — tick_own_for_user 의 「admin 이면 전 계좌」
--     분기를 옮기지 않는다(오케스트레이터 결정 3 · SC-2 「다른 사용자 계좌 조회 불가」). 어드민도 자기 가시 계좌만 본다.
--   켜진 서버(Phase 38 D-03) = 세 배열 모두 JOIN dma_servers s ON s.key = gateway AND s.enabled.
--     가시성 뷰 v2 는 CROSS JOIN dma_servers 로 꺼진 서버 키까지 곱하므로 가시성 조인만으로는 부족하다.
--   events kind:
--     - 15 · 16 · 17 · 18(상한가 특징 · 매집감지 · 발사 조각 · 머리)은 늘 뺀다 — 주문로그에 안 섞는 집합.
--     - 시세 kind 1 · 2 · 10(계좌 '')은 p_isin 을 줬을 때만 그 종목 맥락으로 넣는다 — 그 게이트웨이에 가시 계좌가 있는
--       사용자에게만(dma_strategy_events_for_user 의 시세 규칙과 같다). p_isin NULL(하루 전 종목)이면 뺀다.
--     - 나머지(주문 이벤트 — 예약 kind 9 포함)는 가시 계좌 키 일치. 계좌가 빈 kind 9 는 누구에게도 안 보인다(D-11).
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run 은 VPC all-traffic egress 라 Supabase 왕복 수가 지연을 지배한다 — 진단
--   전문가의 주문로그 도구 1회 = RPC 한 번. SETOF 는 PostgREST max_rows 에 조용히 잘리므로 jsonb 값 하나로 묶는다.
--   기존 dma_journal_orders_for_user 는 gateway 칸이 없어 켜진 서버 조인을 못 한다 — 그래서 새 RPC.
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 39-09 `supabase db push --linked --yes`(메인 세션). 부분 인덱스가 dma_strategy_events
--   쓰기 잠금을 잡으므로 20:00 KST 뒤.
-- 되돌리기:
--   DROP FUNCTION IF EXISTS public.dma_diagnosis_for_user(uuid, date, text);
--   DROP INDEX IF EXISTS public.idx_dma_strategy_events_isin_day_acct;
-- ============================================================

BEGIN;

CREATE FUNCTION public.dma_diagnosis_for_user(p_user_id uuid, p_trade_date date, p_isin text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vis text[];
BEGIN
  -- 가시 계좌 키 — 게이트와 세 배열이 같이 쓴다(한 번만 계산).
  SELECT coalesce(array_agg(v.gateway || '|' || v.account_no), ARRAY[]::text[])
    INTO v_vis
    FROM public.dma_visible_accounts(p_user_id) v;

  -- 게이트 — tick_own_for_user 와 같은 판정(가시 계좌 0 → 접근 없음). 어드민 분기 없음.
  IF cardinality(v_vis) = 0 THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  RETURN jsonb_build_object(
    'access', true,
    'date', to_char(p_trade_date, 'YYYY-MM-DD'),
    'isin', p_isin,
    'orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'gateway', o.gateway,
                          'account_no', o.account_no,
                          'order_no', o.order_no,
                          'isin', o.isin,
                          'stock_code', st.code,
                          'stock_name', st.name,
                          'exchange', o.exchange,
                          'board', o.board,
                          'side', o.side,
                          'order_type', o.order_type,
                          'org_order_no', o.org_order_no,
                          'qty', o.qty,
                          'price', o.price,
                          'filled_qty', o.filled_qty,
                          'status', o.status,
                          'result_code', o.result_code,
                          'message', o.message,
                          'origin', o.origin,
                          'created_ms', floor(extract(epoch FROM o.created_at) * 1000)::bigint,
                          'updated_ms', floor(extract(epoch FROM o.updated_at) * 1000)::bigint)
                        ORDER BY o.created_at, o.gateway, o.order_no), '[]'::jsonb)
                 FROM public.dma_account_orders o
                 JOIN public.dma_servers s ON s.key = o.gateway AND s.enabled
                 LEFT JOIN public.stocks st ON st.isin = o.isin
                WHERE o.trade_date = p_trade_date
                  AND o.order_no IS NOT NULL
                  AND (p_isin IS NULL OR o.isin = p_isin)
                  AND (o.gateway || '|' || o.account_no) = ANY (v_vis)),
    'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'gateway', j.gateway,
                         'seq', j.seq,
                         'gw_time_ms', floor(extract(epoch FROM j.gw_time) * 1000)::bigint,
                         'account_no', j.account_no,
                         'order_no', j.order_no,
                         'isin', j.isin,
                         'stock_code', st.code,
                         'exchange', j.exchange,
                         'side', j.side,
                         'exec_price', j.exec_price,
                         'exec_qty', j.exec_qty)
                       ORDER BY j.gw_time, j.gateway, j.seq), '[]'::jsonb)
                FROM public.dma_journal_events j
                JOIN public.dma_servers s ON s.key = j.gateway AND s.enabled
                LEFT JOIN public.stocks st ON st.isin = j.isin
               WHERE j.trade_date = p_trade_date
                 AND j.notice_type = 'E'
                 AND j.exec_qty > 0
                 AND (p_isin IS NULL OR j.isin = p_isin)
                 AND (j.gateway || '|' || j.account_no) = ANY (v_vis)),
    'events', (SELECT coalesce(jsonb_agg(
                          to_jsonb(e) - 'dma_user_id' - 'applied_at'
                            || jsonb_build_object('stock_code', st.code, 'stock_name', st.name)
                        ORDER BY e.gw_time_ms, e.gateway, e.seq), '[]'::jsonb)
                 FROM public.dma_strategy_events e
                 JOIN public.dma_servers s ON s.key = e.gateway AND s.enabled
                 LEFT JOIN public.stocks st ON st.isin = e.isin
                WHERE e.trade_date = p_trade_date
                  AND (p_isin IS NULL OR e.isin = p_isin)
                  AND e.kind NOT IN (15, 16, 17, 18)
                  AND (
                    -- 주문 이벤트(예약 kind 9 포함) — 가시 계좌 키 일치. 계좌가 빈 행은 어느 키와도 맞지 않아 비공개.
                    (e.kind NOT IN (1, 2, 10) AND (e.gateway || '|' || e.account_no) = ANY (v_vis))
                    OR
                    -- 시세 이벤트 — 종목을 지정했을 때만 맥락으로 · 그 게이트웨이에 가시 계좌가 있을 때만.
                    (e.kind IN (1, 2, 10) AND p_isin IS NOT NULL
                       AND EXISTS (SELECT 1 FROM unnest(v_vis) k WHERE split_part(k, '|', 1) = e.gateway))
                  )));
END;
$$;

COMMENT ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) IS
  'Phase 39 SC-2/D-11 — 매매진단 주문 · 체결 · 전략 이벤트(kind 9 포함) jsonb 1회 · 가시 계좌만(어드민 우회 없음) · 켜진 서버만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_diagnosis_for_user(uuid, date, text) TO service_role;

-- 종목 지정 진단용 부분 인덱스 — 기존 idx_dma_strategy_events_order_isin_day 는 kind 3·6 만이라 kind 4·5·7·8·9 를
-- 그날 전체 스캔으로 훑는다. kind 15 · 16(하루 행이 가장 많은 시세 kind)은 이 RPC 가 읽지 않으므로 뺀다.
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_isin_day_acct
  ON public.dma_strategy_events (trade_date, isin, exchange)
  WHERE kind NOT IN (15, 16);

NOTIFY pgrst, 'reload schema';

COMMIT;
