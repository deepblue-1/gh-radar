-- ============================================================
-- 발사 주문 내역 — 체결 수량을 주문 저널에서 채운다.
--
-- kind 17 filled_qty 는 gh-trade 가 0 고정(= 모름)으로 싣고 매핑이 null 로 푼다(20261028200000 센티널 · 정식 인계 노트
-- 261028-launch-plan-contract ⓑ 「gh-radar 가 order_no 로 주문 저널 체결과 join」). 그래서 「수량/체결」 의 체결이 늘 「—」 였다.
-- launch_orders_for_admin 의 조각 행 filled_qty 를 dma_account_orders 와 (gateway, trade_date, account_no, order_no) 로
-- LEFT JOIN 해 주문 저널 값으로 덮는다 — uq_dma_account_orders_order_no 가 같은 키라 조각당 많아야 1행.
-- 저널에 없는 주문(백필 · order_no/account null)은 조각 원값(대개 null → 「—」).
-- 재전송 조각의 order_no 는 마지막 번호(노트 질문 3)라 체결이 실린 번호와 같다.
--
-- 되돌리기: 20261027200000 ⑤ 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.launch_orders_for_admin(p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
  v_day   date;
BEGIN
  IF p_date IS NOT NULL AND p_date !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'launch_orders_for_admin: p_date 는 YYYYMMDD (got %)', p_date USING ERRCODE = '22023';
  END IF;

  v_dates := ARRAY(SELECT DISTINCT to_char(p.trade_date, 'YYYYMMDD') FROM public.launch_pieces p ORDER BY 1 DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('dates', '[]'::jsonb, 'date', NULL, 'heads', '[]'::jsonb, 'pieces', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);
  v_day  := to_date(v_date, 'YYYYMMDD');

  RETURN jsonb_build_object(
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'heads', (SELECT coalesce(jsonb_agg(
                       to_jsonb(h) - 'created_at' - 'updated_at'
                       || jsonb_build_object('trade_date', to_char(h.trade_date, 'YYYYMMDD'),
                                             'fire_base', to_char(h.fire_base, 'HH24:MI:SS'))
                       ORDER BY h.gateway, h.market, h.fire_base, h.profile), '[]'::jsonb)
                FROM public.launch_heads h WHERE h.trade_date = v_day),
    'pieces', (SELECT coalesce(jsonb_agg(
                        to_jsonb(p) - 'created_at' - 'updated_at'
                        || jsonb_build_object('trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                                              'fire_base', to_char(p.fire_base, 'HH24:MI:SS'),
                                              'stock_code', s.code,
                                              'stock_name', s.name,
                                              'filled_qty', coalesce(o.filled_qty, p.filled_qty))
                        ORDER BY p.gateway, p.market, p.fire_base, p.fire_exchange, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                 LEFT JOIN public.stocks s ON s.isin = p.isin
                 LEFT JOIN public.dma_account_orders o
                        ON o.gateway = p.gateway AND o.trade_date = p.trade_date
                       AND o.account_no = p.account AND o.order_no = p.order_no
                WHERE p.trade_date = v_day));
END;
$$;

COMMENT ON FUNCTION public.launch_orders_for_admin(text) IS
  'Phase 35 D-12/D-13/D-20 — 발사 주문 내역 하루치(jsonb 1회 · 조각 + 머리 · D-02 어드민 전용 예외로 account · dma_user_id 포함 · filled_qty 는 주문 저널 dma_account_orders 값 우선). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_orders_for_admin(text) TO service_role;

COMMIT;
