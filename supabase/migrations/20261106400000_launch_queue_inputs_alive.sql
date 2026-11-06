-- ============================================================
-- quick 261106-p8h — launch_queue_inputs 행마다 alive(우리 주문로그 상태).
--
-- 발사 대기열 16:00 Q16 「마감 때」 는 G4 B6 감소를 FIFO 재생으로 취소에 귀속하는 추정이다(남은 수량이 같은 주문
-- 여럿이면 가장 뒤). 우리 조각은 정답(dma_account_orders 주문 상태)이 있으므로 계산 입력에 싣는다 — tick-convert →
-- shared `queueLevelValuesOf` 가 true 면 그 주문을 취소 후보에서 빼고, false 면 마감 때 0(취소)으로 덮는다.
-- 실측 11/06 덕성우 교보 53200140: 주문로그 partially_filled 인데 4000 취소 7건이 뒤에서부터 0 으로 만들어 cancelled 로 냈다.
--
-- 바꾸는 것: launch_queue_inputs 의 jsonb_build_object 에 'alive' 키 하나(나머지는 20261104200000 정의 글자 그대로).
-- ============================================================

CREATE OR REPLACE FUNCTION public.launch_queue_inputs(p_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
BEGIN
  IF p_date IS NULL OR p_date !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'launch_queue_inputs: p_date 는 YYYYMMDD (받은 값 %)', p_date USING ERRCODE = '22023';
  END IF;
  v_day := to_date(p_date, 'YYYYMMDD');

  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                   'gateway', p.gateway,
                   'profile', p.profile,
                   'fire_exchange', p.fire_exchange,
                   'fire_base', to_char(p.fire_base, 'HH24:MI:SS'),
                   'market', p.market,
                   'wire', p.wire,
                   'side', p.side,
                   'isin', p.isin,
                   'price', p.price,
                   'qty', p.qty,
                   -- 우리 체결 [가격, 수량] — 저널 순서(gw_time, seq). order_no 없으면 [](계좌가 있으면 계좌도 맞춘다).
                   'fills', coalesce((
                     SELECT jsonb_agg(jsonb_build_array(j.exec_price, j.exec_qty) ORDER BY j.gw_time, j.seq)
                       FROM public.dma_journal_events j
                      WHERE nullif(p.order_no, '') IS NOT NULL
                        AND j.gateway = p.gateway
                        AND j.trade_date = p.trade_date
                        AND j.order_no = p.order_no
                        AND j.notice_type = 'E'
                        AND j.exec_qty > 0
                        AND (p.account IS NULL OR j.account_no = p.account)), '[]'::jsonb),
                   -- 우리 주문로그 상태(261106-p8h) — true = 취소 안 됨 · false = 취소 · 정정 · 거부 · null = 모름.
                   -- 조각 account 가 NULL 이면 등호가 거짓이라 null — fills 의 「account null 이면 계좌 무시」 와 다르다
                   -- (같은 주문번호가 다른 계좌에 있을 수 있어 모르는 쪽이 안전). uq_dma_account_orders_order_no 라 최대 1행.
                   'alive', (
                     SELECT CASE WHEN o.status IN ('accepted', 'partially_filled', 'filled') THEN true
                                 WHEN o.status IN ('cancelled', 'modified', 'rejected') THEN false END
                       FROM public.dma_account_orders o
                      WHERE nullif(p.order_no, '') IS NOT NULL
                        AND o.gateway = p.gateway
                        AND o.trade_date = p.trade_date
                        AND o.account_no = p.account
                        AND o.order_no = p.order_no))
                 ORDER BY p.fire_exchange, p.isin, p.fire_base, p.gateway, p.wire), '[]'::jsonb)
            FROM public.launch_pieces p
           WHERE p.trade_date = v_day
             AND p.result = '접수'
             AND coalesce(p.isin, '') <> ''
             AND p.side IN ('buy', 'sell')
             AND p.price IS NOT NULL
             AND p.qty IS NOT NULL
             AND p.profile IN ('Q16', 'N', 'A'));
END;
$$;

COMMENT ON FUNCTION public.launch_queue_inputs(text) IS
  'quick 261103-pei — 그날 대상 조각(접수 ∧ isin · side · price · qty ∧ profile Q16 · N · A) + 조각별 우리 체결 fills [[px, qty]](저널 E · gw_time, seq 순). 정렬 fire_exchange, isin, fire_base, gateway, wire. tick-convert 입력. service_role 전용 · alive = 우리 주문로그(dma_account_orders) 상태 true(accepted · partially_filled · filled) · false(cancelled · modified · rejected) · null(행 없음 · 조각 계좌 없음) — 261106-p8h';

REVOKE EXECUTE ON FUNCTION public.launch_queue_inputs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_queue_inputs(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_queue_inputs(text) TO service_role;
