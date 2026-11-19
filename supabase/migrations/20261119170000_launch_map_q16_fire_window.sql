-- ============================================================
-- quick(fast) 261119 — 경계 지도 q16 이 장 시간이 밀린 날(수능일 17:00:00 발사)도 담는다.
--
-- 무엇: public.launch_map_for_admin(p_fire, p_days) 같은 시그니처 재정의 — 20261030210000 ① 본문 그대로에서
--   발사 기준시각 거르기만 「정확 일치」 → 「[v_from, v_until) 창」 으로 바꾼다.
--     q16   = KRX · 15:00:00 이상 18:00:00 미만 (평소 16:00:00 · 2026-11-19 수능일 17:00:00)
--     n0930 = NXT · 09:00:30 정확 일치 그대로 (창 [09:00:30, 09:00:30.000001))
--   반환 모양 · 거래일 자르기 · 머리 DISTINCT ON · 권한은 무변경.
--
-- 왜: 2026-11-19 수능일 장 1시간 순연으로 Q16 발사 fire_base 가 17:00:00 으로 적재됐다(조각 75 · 머리 6).
--   주문 내역 탭(shared isLaunchFireBaseOf · 커밋 19b65a59)은 같은 창으로 이미 보이고, 지도만 16:00:00 정확 일치라 빠졌다.
--   조각 rel(sent_rel_us)은 그날 발사 기준시각 기준이라 다른 날과 같은 축으로 비교된다.
--   화면 쪽 머리 판정 shared launchFireOf 도 같은 창이다(두 벌이 갈라지지 않게 창 값은 그 주석과 함께 고친다).
--
-- 인덱스: launch_pieces_fire_date_idx(fire_exchange, fire_base, trade_date DESC) — 범위 조건도 같은 인덱스를 탄다.
-- 원격 적용: `supabase db push --linked --yes` (읽기 함수만 바뀌어 장중 적용 무해).
-- 되돌리기: 20261030210000 ① 의 함수 본문 · COMMENT · 권한 3줄 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.launch_map_for_admin(p_fire text, p_days integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ex    text;
  v_from  time;
  v_until time;
  v_days date[];
BEGIN
  IF p_fire = 'q16' THEN
    -- 평소 16:00:00 · 장 시간이 밀린 날 17:00:00(2026-11-19 수능일) — 장 마감 뒤 오후 창.
    v_ex := 'KRX'; v_from := time '15:00:00'; v_until := time '18:00:00';
  ELSIF p_fire = 'n0930' THEN
    -- 09:00:30 정확 일치(time 정밀도 µs — 1µs 뒤 미만).
    v_ex := 'NXT'; v_from := time '09:00:30'; v_until := time '09:00:30.000001';
  ELSE
    RAISE EXCEPTION 'launch_map_for_admin: p_fire 는 q16 | n0930 (got %)', p_fire USING ERRCODE = '22023';
  END IF;
  IF p_days IS NOT NULL AND p_days < 1 THEN
    RAISE EXCEPTION 'launch_map_for_admin: p_days 는 1 이상 또는 null (got %)', p_days USING ERRCODE = '22023';
  END IF;

  -- 발사 기준별 거래일(launch_pieces_fire_date_idx) — LIMIT NULL = 전체
  v_days := ARRAY(SELECT d.trade_date
                    FROM (SELECT DISTINCT p.trade_date FROM public.launch_pieces p
                           WHERE p.fire_exchange = v_ex AND p.fire_base >= v_from AND p.fire_base < v_until) d
                   ORDER BY d.trade_date DESC
                   LIMIT p_days);

  RETURN jsonb_build_object(
    'days', (SELECT coalesce(jsonb_agg(to_char(d, 'YYYYMMDD') ORDER BY d DESC), '[]'::jsonb) FROM unnest(v_days) AS d),
    'heads', (SELECT coalesce(jsonb_agg(
                       to_jsonb(x) - 'created_at' - 'updated_at'
                       || jsonb_build_object('trade_date', to_char(x.trade_date, 'YYYYMMDD'),
                                             'fire_base', to_char(x.fire_base, 'HH24:MI:SS'))
                       ORDER BY x.gateway, x.market, x.profile), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (h.gateway, h.market, h.profile) h.*
                        FROM public.launch_heads h
                       WHERE h.fire_exchange = v_ex AND h.fire_base >= v_from AND h.fire_base < v_until
                       ORDER BY h.gateway, h.market, h.profile, h.trade_date DESC) x),
    'pieces', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                        'gateway', p.gateway,
                        'market', p.market,
                        'profile', p.profile,
                        'fire_exchange', p.fire_exchange,
                        'side', p.side,
                        'wire', p.wire,
                        'piece_idx', p.piece_idx,
                        'sent_rel_us', p.sent_rel_us,
                        'result', p.result,
                        'retry', p.retry,
                        'probe', p.probe,
                        'round', p.round,
                        'result_code', p.result_code)
                        ORDER BY p.trade_date, p.gateway, p.market, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                WHERE p.fire_exchange = v_ex AND p.fire_base >= v_from AND p.fire_base < v_until AND p.trade_date = ANY (v_days)));
END;
$$;

COMMENT ON FUNCTION public.launch_map_for_admin(text, integer) IS
  'Phase 35 D-15/D-16/D-17/D-20 — 발사 경계 지도(q16 = KRX 15:00 ~ 18:00 창(평소 16:00 · 수능일 17:00 · 261119) · n0930 = NXT 09:00:30 N+A · 발사 기준별 최근 p_days 거래일 · 최신 머리). service_role 전용 · quick-261030-dz7 조각에 probe · round · result_code(뒤탐침 판정 재료)';

REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 바뀐 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
