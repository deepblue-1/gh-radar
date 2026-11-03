-- ============================================================
-- quick-261104-6lh — tick_own_for_user fills 에 journal_epoch 추가 (Phase 38 R2-IN-01 후속).
--
-- 무엇:
--   CREATE OR REPLACE tick_own_for_user(p_user_id, p_date, p_isin, p_ex) — fills 각 객체에 'journal_epoch' 한 키를 더한다.
--   fills = {gateway, seq, journal_epoch, gw_time_ms, account_no, order_no, side, exec_price, exec_qty}
--   journal_epoch 는 저널 행 값 그대로(dma_journal_events.journal_epoch · text NOT NULL).
--
-- 왜:
--   원천 PK 가 (gateway, journal_epoch, seq) 다. 장중에 저널이 초기화되면 같은 거래일에 seq 가 다시 쓰인다(R2-IN-01).
--   웹 체결 안정 키를 원천 PK 와 같은 gateway|journal_epoch|seq 로 두려면 epoch 가 응답에 있어야 한다.
--
-- 원본:
--   20261104100000_tick_own_for_user.sql 은 운영 적용본이라 고치지 않는다. 아래 함수 본문은 그 파일과 같고
--   fills 키 한 줄('journal_epoch', j.journal_epoch)만 다르다. 정렬(ORDER BY j.gw_time, j.gateway, j.seq)은 그대로다 —
--   남은 수량 차감 순서의 정본이다. 부분 인덱스 2개는 원본이 이미 만들었으므로 다시 만들지 않는다.
--   권한은 CREATE OR REPLACE 가 유지하지만 원본과 똑같이 다시 적는다(메모리 feedback_supabase_rpc_revoke).
--
-- 호환: 옛 server · 웹은 fills 배열 여부만 보고 그대로 넘기므로 늘어난 키를 무시한다.
-- 원격 적용: 커밋만 — 메인 세션이 `supabase db push` 한다.
-- 되돌리기: 20261104100000_tick_own_for_user.sql 의 함수 본문으로 CREATE OR REPLACE 를 다시 적용한다.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tick_own_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
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
                         'journal_epoch', j.journal_epoch,
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
  'Phase 38 D-01/D-03/D-14 — 틱 뷰어 우리 체결 · 주문 이벤트 · 보조 주문(jsonb 1회 · 가시 계좌 · 어드민 전 계좌 · 켜진 서버만). DMA 매핑 사용자만. service_role 전용. fills journal_epoch(quick-261104-6lh)';

REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
