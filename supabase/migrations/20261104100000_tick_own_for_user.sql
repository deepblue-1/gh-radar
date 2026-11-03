-- ============================================================
-- Phase 38 Plan 01 — 틱 뷰어 「우리 주문 · 체결」 조회 RPC (D-01 · D-03 · D-14).
--
-- 무엇:
--   tick_own_for_user(p_user_id, p_date, p_isin, p_ex) → jsonb — 한 종목 · 하루의 우리 체결 · 전략 주문 이벤트 · 보조 주문 행.
--   + 부분 인덱스 2(체결 E · 전략 kind 3·6 의 (trade_date, isin, exchange) 조회).
--
-- 응답 모양:
--   {access: false}                                              — 가시 계좌 0(DMA 매핑 없음) → server 403 DMA_UNMAPPED
--   {access: true, date, exchange, isin, servers, fills, events, orders}
--     servers = dma_servers.enabled 키 · sort_order, key 순(빈 배열 기본) — 게이트웨이 키 하드코딩 0(D-03)
--     fills   = dma_journal_events 체결(notice_type 'E' ∧ exec_qty > 0)
--               {gateway, seq, gw_time_ms, account_no, order_no, side, exec_price, exec_qty}
--               gw_time_ms = floor(epoch(gw_time) × 1000) — ms 절사(짝짓기 입력)
--               정렬 gw_time, gateway, seq — 남은 수량 차감 순서의 정본(RESEARCH Pitfall 2)
--     events  = dma_strategy_events 주문 이벤트(kind 3 · 6 ∧ order_no <> '')
--               {gateway, seq, gw_time_ms, kind, group, account_no, order_no, price, qty, reason_code, cond_metric,
--                cond_threshold, cond_actual, ev_kind, ev_price, ev_qty_before, ev_qty_after, ev_trade_qty, cum_volume}
--               정렬 gw_time_ms, gateway, seq
--     orders  = dma_account_orders 신규(N) · 주문번호 있음 · 체결 있음 — kind 3·6 이벤트가 없는 체결 주문의 주문 시각 보조
--               {gateway, account_no, order_no, side, price, qty, origin, created_ms}
--               created_ms = floor(epoch(created_at) × 1000) · 정렬 created_at, gateway, order_no
--   dma_user_id 는 어느 배열에도 싣지 않는다(T-19-08 — 감사 칸 반환 금지).
--
-- 규칙:
--   게이트(D-01) = dma_visible_accounts(p_user_id) 가 1행 이상(tick_open_for_user 와 같은 판정).
--   「우리」(D-01) = 가시 계좌(gateway | account_no)의 행. app_users.role = 'admin' 이면 전 계좌.
--     어드민 판정은 함수 안 dma_app_access_map() role 조회다 — 어드민 분기용 boolean 인자를 두지 않는다
--     (같은 원천 · 매 요청 판정 · 왕복 1회 유지 · 클라이언트 · 쿼리 문자열이 전 계좌를 켤 길이 0).
--   켜진 서버(D-03) = fills · events · orders 모두 JOIN dma_servers s ON s.key = gateway AND s.enabled.
--     가시성 뷰 v2 는 CROSS JOIN dma_servers 로 꺼진 서버 키까지 곱하므로 가시성 조인만으로는 부족하다(Pitfall 6).
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run → Supabase 왕복 수가 지연을 지배한다 — 한 요청 = RPC 한 번.
--   SETOF 는 PostgREST max_rows 에 조용히 잘리므로 jsonb 값 하나로 묶는다(37 tick_*_for_user 와 같다).
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 38-10 `supabase db push`(메인 세션).
-- 되돌리기:
--   DROP FUNCTION public.tick_own_for_user(uuid, text, text, text);
--   DROP INDEX public.idx_dma_journal_events_fill_isin_day;
--   DROP INDEX public.idx_dma_strategy_events_order_isin_day;
-- ============================================================

BEGIN;

CREATE FUNCTION public.tick_own_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day   date := to_date(p_date, 'YYYYMMDD');
  v_admin boolean;
  v_vis   text[];
BEGIN
  -- 게이트 — tick_open_for_user 와 같은 판정
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- D-01 — 어드민은 전 계좌. 판정 원천은 app_users.role(dma_app_access_map) — 인자로 받지 않는다.
  v_admin := EXISTS (SELECT 1 FROM public.dma_app_access_map() m
                      WHERE m.user_id = p_user_id AND m.role = 'admin');

  -- 가시 계좌 키 — 한 번만 계산해 세 배열이 같이 쓴다
  SELECT coalesce(array_agg(v.gateway || '|' || v.account_no), ARRAY[]::text[])
    INTO v_vis
    FROM public.dma_visible_accounts(p_user_id) v;

  RETURN jsonb_build_object(
    'access', true,
    'date', p_date,
    'exchange', p_ex,
    'isin', p_isin,
    'servers', (SELECT coalesce(jsonb_agg(s.key ORDER BY s.sort_order, s.key), '[]'::jsonb)
                  FROM public.dma_servers s
                 WHERE s.enabled),
    'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'gateway', j.gateway,
                         'seq', j.seq,
                         'gw_time_ms', floor(extract(epoch FROM j.gw_time) * 1000)::bigint,
                         'account_no', j.account_no,
                         'order_no', j.order_no,
                         'side', j.side,
                         'exec_price', j.exec_price,
                         'exec_qty', j.exec_qty)
                       ORDER BY j.gw_time, j.gateway, j.seq), '[]'::jsonb)
                FROM public.dma_journal_events j
                JOIN public.dma_servers s ON s.key = j.gateway AND s.enabled
               WHERE j.trade_date = v_day
                 AND j.isin = p_isin
                 AND j.exchange = p_ex
                 AND j.notice_type = 'E'
                 AND j.exec_qty > 0
                 AND (v_admin OR (j.gateway || '|' || j.account_no) = ANY (v_vis))),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'gateway', e.gateway,
                          'seq', e.seq,
                          'gw_time_ms', e.gw_time_ms,
                          'kind', e.kind,
                          'group', e."group",
                          'account_no', e.account_no,
                          'order_no', e.order_no,
                          'price', e.price,
                          'qty', e.qty,
                          'reason_code', e.reason_code,
                          'cond_metric', e.cond_metric,
                          'cond_threshold', e.cond_threshold,
                          'cond_actual', e.cond_actual,
                          'ev_kind', e.ev_kind,
                          'ev_price', e.ev_price,
                          'ev_qty_before', e.ev_qty_before,
                          'ev_qty_after', e.ev_qty_after,
                          'ev_trade_qty', e.ev_trade_qty,
                          'cum_volume', e.cum_volume)
                        ORDER BY e.gw_time_ms, e.gateway, e.seq), '[]'::jsonb)
                 FROM public.dma_strategy_events e
                 JOIN public.dma_servers s ON s.key = e.gateway AND s.enabled
                WHERE e.trade_date = v_day
                  AND e.isin = p_isin
                  AND e.exchange = p_ex
                  AND e.kind IN (3, 6)
                  AND e.order_no <> ''
                  AND (v_admin OR (e.gateway || '|' || e.account_no) = ANY (v_vis))),
    -- 보조 — kind 3·6 행이 없는 체결 주문(정정으로 바뀐 번호 등)의 주문 시각(RESEARCH Open Q2)
    'orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'gateway', o.gateway,
                          'account_no', o.account_no,
                          'order_no', o.order_no,
                          'side', o.side,
                          'price', o.price,
                          'qty', o.qty,
                          'origin', o.origin,
                          'created_ms', floor(extract(epoch FROM o.created_at) * 1000)::bigint)
                        ORDER BY o.created_at, o.gateway, o.order_no), '[]'::jsonb)
                 FROM public.dma_account_orders o
                 JOIN public.dma_servers s ON s.key = o.gateway AND s.enabled
                WHERE o.trade_date = v_day
                  AND o.isin = p_isin
                  AND o.exchange = p_ex
                  AND o.order_type = 'N'
                  AND o.order_no IS NOT NULL
                  AND o.filled_qty > 0
                  AND (v_admin OR (o.gateway || '|' || o.account_no) = ANY (v_vis))));
END;
$$;

COMMENT ON FUNCTION public.tick_own_for_user(uuid, text, text, text) IS
  'Phase 38 D-01/D-03/D-14 — 틱 뷰어 우리 체결 · 주문 이벤트 · 보조 주문(jsonb 1회 · 가시 계좌 · 어드민 전 계좌 · 켜진 서버만). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) TO service_role;

-- 한 종목 · 하루 조회용 부분 인덱스 — 기존 인덱스는 (trade_date, account_no) · (trade_date, gateway, account_no) 라
-- 종목 조건이 그날 전체를 훑는다(전략 이벤트는 kind 15 · 16 으로 하루 행이 많다).
CREATE INDEX IF NOT EXISTS idx_dma_journal_events_fill_isin_day
  ON public.dma_journal_events (trade_date, isin, exchange)
  WHERE notice_type = 'E';
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_order_isin_day
  ON public.dma_strategy_events (trade_date, isin, exchange)
  WHERE kind IN (3, 6);

NOTIFY pgrst, 'reload schema';

COMMIT;
