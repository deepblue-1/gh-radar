-- ============================================================
-- quick 261112-tlw — 러쉬주문 09:00:30 주문 내역에 개장차익 손익 — launch_orders_for_admin 응답에 fills 키.
--
-- 무엇:
--   launch_orders_for_admin(p_date)  교체 — 20261104710000 ② 본문 + 두 곳:
--     (a) 빈 표 조기 반환에 'fills', '[]'::jsonb
--     (b) 마지막 RETURN 에 'fills' = 그 날 dma_journal_events 의 origin 'OpenArb' · notice_type 'E'(체결) · exec_qty > 0 행
--         10키(gateway · account · dma_user_id · isin · stock_code · stock_name · side · exchange · price · qty)
--         ORDER BY gateway, gw_time, journal_epoch, seq(= 체결 순서 · 손익 재생 순서). stocks 는 LEFT JOIN(없으면 null).
--     dates · heads · pieces 식은 한 글자도 바꾸지 않는다.
--
-- 왜: 09:00:30 주문 내역에서 개장차익 매수 → 매도 결과(손익 · 못 판 잔여)를 gh-trade 를 열지 않고 확인한다.
--   손익 계산은 shared `launchOpenArbPnlOf`(packages/shared/src/launch.ts) 한 벌 — SQL 에 두 번째 구현을 두지 않는다.
--   개장차익이 낸 매도 중 일부는 발사 조각 표에 없어서(NXT 매수 → KRX 매도 · 되팔기) 조각 조인이 아니라 저널 체결 행을 그대로 싣는다.
--   인덱스 idx_dma_journal_events_fill_day (trade_date, account_no) WHERE notice_type = 'E' 가 이미 있다(20261028210000).
--
-- 권한: SECURITY INVOKER + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT 재명시.
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`. server(admin-launch.ts)는 RPC jsonb 를 그대로
--   통과시켜 코드 · 배포 변경이 없고, fills 는 선택 키라 배포 순서 무관(옛 응답엔 fills 가 없어 화면은 지금 그대로).
-- 되돌리기: 20261104710000_launch_queue_live.sql ② 의 launch_orders_for_admin 본문 + COMMENT + REVOKE/GRANT 를
--   CREATE OR REPLACE 로 다시 적용한다(화면은 fills 키가 없으면 손익 표 · 카드 줄 없이 그대로).
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
    RETURN jsonb_build_object('dates', '[]'::jsonb, 'date', NULL, 'heads', '[]'::jsonb, 'pieces', '[]'::jsonb,
                              'fills', '[]'::jsonb);
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
                                              'filled_qty', coalesce(o.filled_qty, p.filled_qty),
                                              -- quick 261103-pei — 대기열 값 14칸(키 · object_path · computed_at 뺌) · 없으면 null
                                              -- quick 261104-n7i — live 표식 행이면 + live_as_of(계산 기준 시각 ISO · nightly 가 덮으면 사라짐)
                                              'queue', CASE WHEN q.trade_date IS NULL THEN NULL
                                                            ELSE to_jsonb(q) - 'trade_date' - 'gateway' - 'profile'
                                                                 - 'fire_exchange' - 'fire_base' - 'market' - 'wire'
                                                                 - 'object_path' - 'computed_at'
                                                                 || CASE WHEN q.object_path LIKE 'live:%'
                                                                         THEN jsonb_build_object('live_as_of', substr(q.object_path, 6))
                                                                         ELSE '{}'::jsonb END END)
                        ORDER BY p.gateway, p.market, p.fire_base, p.fire_exchange, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                 LEFT JOIN public.stocks s ON s.isin = p.isin
                 LEFT JOIN public.dma_account_orders o
                        ON o.gateway = p.gateway AND o.trade_date = p.trade_date
                       AND o.account_no = p.account AND o.order_no = p.order_no
                 LEFT JOIN public.launch_piece_queue q
                        ON q.trade_date = p.trade_date AND q.gateway = p.gateway AND q.profile = p.profile
                       AND q.fire_exchange = p.fire_exchange AND q.fire_base = p.fire_base
                       AND q.market = p.market AND q.wire = p.wire
                WHERE p.trade_date = v_day),
    -- quick 261112-tlw — 그 날 개장차익(origin OpenArb) 체결 저널 행 10키 · 체결 순서(손익 재생 순서)
    --   계산은 shared launchOpenArbPnlOf 한 벌(여기서 합산하지 않는다)
    'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'gateway', e.gateway, 'account', e.account_no, 'dma_user_id', e.dma_user_id,
                         'isin', e.isin, 'stock_code', s.code, 'stock_name', s.name,
                         'side', e.side, 'exchange', e.exchange, 'price', e.exec_price, 'qty', e.exec_qty)
                       ORDER BY e.gateway, e.gw_time, e.journal_epoch, e.seq), '[]'::jsonb)
                FROM public.dma_journal_events e
                LEFT JOIN public.stocks s ON s.isin = e.isin
               WHERE e.trade_date = v_day AND e.origin = 'OpenArb' AND e.notice_type = 'E' AND e.exec_qty > 0));
END;
$$;

COMMENT ON FUNCTION public.launch_orders_for_admin(text) IS
  'Phase 35 D-12/D-13/D-20 — 발사 주문 내역 하루치(jsonb 1회 · 조각 + 머리 · D-02 어드민 전용 예외로 account · dma_user_id 포함 · filled_qty 는 주문 저널 dma_account_orders 값 우선 · quick 261103-pei 조각마다 queue = launch_piece_queue 값 14칸 또는 null · quick 261104-n7i live 표식 행이면 queue.live_as_of = 계산 기준 시각 ISO · quick 261112-tlw fills = 그 날 개장차익(origin OpenArb) 체결 저널 행 10키(체결 순서 · 손익 계산은 shared launchOpenArbPnlOf)). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_orders_for_admin(text) TO service_role;

COMMIT;
