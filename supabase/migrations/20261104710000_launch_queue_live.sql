-- ============================================================
-- quick 261104-n7i — 발사 대기열 당일 계산(launch-live) 표식 허용 · 주문 내역 queue.live_as_of.
--
-- 무엇:
--   ① launch_queue_set(p_rows)            교체 — 20261104200000 본문 + 두 곳:
--        (a) WHERE 가드 세 번째 갈래 — object_path 가 'live:<as-of ISO UTC ms>' 이고 trade_date 가 KST 오늘이면 통과
--            (live 는 오늘 조각만 — 늦은 수동 실행이 지난 날짜를 못 건드린다)
--        (b) ON CONFLICT DO UPDATE ... WHERE — 격자 값(object_path null · 격자 경로 = nightly · backfill 정본)은 언제나 덮고,
--            live 는 기존 행도 live 이고 표식이 같거나 더 새 것일 때만 덮는다(고정 폭 ISO 라 문자열 비교 = 시각 비교).
--            기존 행이 격자 값(null 포함)이면 live 는 덮지 못한다(늦게 돈 live 가 nightly 값을 덮지 않음 — D-4).
--            건너뛴 행은 ROW_COUNT 에 안 잡힌다 — 반환값(쓴 행 수) 의미 그대로(워커가 보낸 − 쓴 = set_skipped 로 로그).
--   ② launch_orders_for_admin(p_date)     교체 — 20261104200000 본문 + 조각 queue 에 live 행일 때만 'live_as_of'(표식에서 'live:' 뺀 ISO).
--        격자 값 응답은 지금과 같다(키 없음).
--
-- 왜: 대기열 값은 밤 nightly 만 계산해 당일 조각이 전부 「—」 였다(원본 업로드가 밤). tick-convert launch-live 모드가 평일
--   16:01 · 16:03 · 16:10 · 09:01 · 09:03 KST 에 radar-gw tickgw 당일 바이트로 shared launchQueueOf 를 돌려 'live:<as-of>' 로 저장하고,
--   밤 nightly 가 그날 격자 정본으로 덮는다(launch_queue_pending 은 격자가 생기면 live 행을 경로 불일치 stale 로 다시 고른다 — 변경 없음).
--
-- 권한: 두 함수 SECURITY INVOKER + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT 재명시.
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`. tick-convert(launch-live Job) 배포보다 먼저
--   (반대면 live 행이 옛 가드에 버려져 set_skipped 로만 보인다 — 무해).
-- 되돌리기: 20261104200000_launch_piece_queue.sql 의 launch_queue_set · launch_orders_for_admin 본문(+ COMMENT · REVOKE/GRANT)을
--   CREATE OR REPLACE 로 다시 적용한다(이미 저장된 live 행은 nightly 가 덮거나 그대로 남아도 무해).
-- ============================================================

BEGIN;

-- ── ① 값 저장 — live 표식 허용 · 오늘만 · live 는 live 위에 단조 · 격자 우선 ─────────
CREATE OR REPLACE FUNCTION public.launch_queue_set(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'launch_queue_set: p_rows 는 jsonb 배열이어야 한다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_piece_queue AS q
         (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, object_path,
          kind, matched, rank, ahead_n, ahead_qty, ahead_amt, end_state, end_n, end_qty, end_amt,
          fill_qty, fill_px_min, fill_px_max, order_est, computed_at)
  SELECT p.trade_date, p.gateway, p.profile, p.fire_exchange, p.fire_base, p.market, p.wire, r.object_path,
         r.kind, r.matched, r.rank, r.ahead_n, r.ahead_qty, r.ahead_amt, r.end_state, r.end_n, r.end_qty, r.end_amt,
         r.fill_qty, r.fill_px_min, r.fill_px_max, coalesce(r.order_est, false), now()
    FROM jsonb_to_recordset(p_rows) AS r(
           trade_date text, gateway text, profile text, fire_exchange text, fire_base text, market text, wire integer,
           object_path text, kind text, matched boolean, rank integer, ahead_n integer, ahead_qty bigint, ahead_amt bigint,
           end_state text, end_n integer, end_qty bigint, end_amt bigint, fill_qty bigint, fill_px_min integer,
           fill_px_max integer, order_est boolean)
    -- 있는 조각만(없는 키는 버린다)
    JOIN public.launch_pieces p
      ON p.trade_date = to_date(r.trade_date, 'YYYYMMDD') AND p.gateway = r.gateway AND p.profile = r.profile
     AND p.fire_exchange = r.fire_exchange AND p.fire_base = r.fire_base::time AND p.market = r.market AND p.wire = r.wire
   -- 격자 가드 — null(너무 커서 안 올린 격자) 이거나 지금 그 격자 경로와 같을 때만(그 사이 격자가 바뀌었으면 안 쓴다)
   WHERE r.object_path IS NULL
      OR EXISTS (SELECT 1 FROM public.tick_grids g
                  WHERE g.date = r.trade_date AND g.exchange = r.fire_exchange AND g.isin = p.isin
                    AND g.object_path = r.object_path)
      -- quick 261104-n7i — 당일 live 표식('live:<as-of ISO>')은 KST 오늘 조각만
      OR (r.object_path LIKE 'live:%'
          AND to_date(r.trade_date, 'YYYYMMDD') = (now() AT TIME ZONE 'Asia/Seoul')::date)
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, fire_base, market, wire) DO UPDATE
     SET object_path = EXCLUDED.object_path,
         kind        = EXCLUDED.kind,
         matched     = EXCLUDED.matched,
         rank        = EXCLUDED.rank,
         ahead_n     = EXCLUDED.ahead_n,
         ahead_qty   = EXCLUDED.ahead_qty,
         ahead_amt   = EXCLUDED.ahead_amt,
         end_state   = EXCLUDED.end_state,
         end_n       = EXCLUDED.end_n,
         end_qty     = EXCLUDED.end_qty,
         end_amt     = EXCLUDED.end_amt,
         fill_qty    = EXCLUDED.fill_qty,
         fill_px_min = EXCLUDED.fill_px_min,
         fill_px_max = EXCLUDED.fill_px_max,
         order_est   = EXCLUDED.order_est,
         computed_at = now()
   -- quick 261104-n7i — 격자 값(null · 격자 경로)은 언제나 덮는다 · live 는 live 위에만 · 같거나 더 새 표식일 때만
   --   (q.object_path 가 null 이면 LIKE 가 거짓 → live 는 too-large 격자 값을 못 덮는다)
   WHERE EXCLUDED.object_path IS NULL
      OR EXCLUDED.object_path NOT LIKE 'live:%'
      OR (q.object_path LIKE 'live:%' AND EXCLUDED.object_path >= q.object_path);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.launch_queue_set(jsonb) IS
  'quick 261103-pei · 261104-n7i — 대기열 값 upsert(7키 · 있는 조각만 · object_path 가 null 이거나 지금 tick_grids 경로와 같거나 KST 오늘 조각의 live:<as-of ISO> 표식일 때만). 덮어쓰기: 격자 값(null · 격자 경로)은 언제나 · live 는 기존 live 위에 같거나 더 새 표식일 때만(격자 값을 못 덮음). 쓴 행 수(건너뛴 행 제외). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_queue_set(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_queue_set(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_queue_set(jsonb) TO service_role;

-- ── ② 주문 내역 — 조각 queue 에 live_as_of(live 행만) ─────────────────────
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
                WHERE p.trade_date = v_day));
END;
$$;

COMMENT ON FUNCTION public.launch_orders_for_admin(text) IS
  'Phase 35 D-12/D-13/D-20 — 발사 주문 내역 하루치(jsonb 1회 · 조각 + 머리 · D-02 어드민 전용 예외로 account · dma_user_id 포함 · filled_qty 는 주문 저널 dma_account_orders 값 우선 · quick 261103-pei 조각마다 queue = launch_piece_queue 값 14칸 또는 null · quick 261104-n7i live 표식 행이면 queue.live_as_of = 계산 기준 시각 ISO). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_orders_for_admin(text) TO service_role;

COMMIT;
