-- ============================================================
-- quick-261125-c2i — 어드민 발사 경계 지도 08:30 G2(장개시전 시간외종가 예약 발사) 칸.
--
-- 무엇:
--   ① public.launch_plan_changes.fire CHECK 에 'g0830' 추가 — 08:30 계획 저장 시도도 이력 1행(D-29 규칙 그대로).
--   ② public.launch_map_for_admin(p_fire, p_days) 같은 시그니처 재정의 — 20261119170000 본문 그대로에서
--      p_fire = 'g0830' 분기만 더한다: KRX · 08:30:00 정확 일치(창 [08:30:00, 08:30:00.000001) · n0930 방식).
--      반환 모양 · 거래일 자르기 · 머리 DISTINCT ON · 권한은 무변경. q16 · n0930 거르기도 그대로라 G2 가 섞이지 않는다.
--
-- 왜: gh-trade 인박스 docs/inbox/from-gh-trade/261125-sigan-ttaeng-g2.md
--   ⓐ 44 op 8 profile "G2" · 길이 1 · −3000 ~ +20000µs · 기준 08:30:00.000000 · 그 시장 칸만 저장
--   ⓑ 94 entries 말미 G2/K · G2/Q 는 08:30 스위치 켠 서버만 · tail_probes 에 G2 없음
--   「gh-radar 처리」 ③ 어드민 08:30 칸 — 발사 시각을 서버 파일 수정 · 재기동 없이 화면에서 바꾸고 그날 결과를 지도에서 본다.
--   발사 저널 profile 4 → 'G2' 투영(fire_base 08:30:00)은 20261125090000 이 이미 넣었다.
--
-- 뒤탐침 이력(launch_tail_probe_changes.fire CHECK q16 | n0930 · 20261107200000)은 바꾸지 않는다 — G2 는 뒤탐침 대상 아님(ⓑ).
-- CHECK 이름: 20261028200100 의 이름 없는 인라인 CHECK → Postgres 자동 이름 launch_plan_changes_fire_check.
--   IF EXISTS 를 쓰지 않는다 — 이름이 다르면 재생이 바로 실패해 드러나야 한다.
--
-- 원격 적용: `supabase db push --linked --yes`(메인 세션 몫) — 읽기 함수 재정의 + CHECK 확장(기존 행은 모두 q16 | n0930 이라
--   검증 통과)이라 장중 적용 무해.
-- 되돌리기: 20261119170000 의 함수 본문 · COMMENT · 권한 3줄 재적용 +
--   ALTER TABLE public.launch_plan_changes DROP CONSTRAINT launch_plan_changes_fire_check,
--     ADD CONSTRAINT launch_plan_changes_fire_check CHECK (fire IN ('q16', 'n0930'));
--   (g0830 이력 행이 이미 있으면 먼저 지워야 한다.)
-- ============================================================

BEGIN;

-- ── ① 계획 이력 fire CHECK ─────────────────────────────────────────
ALTER TABLE public.launch_plan_changes DROP CONSTRAINT launch_plan_changes_fire_check;
ALTER TABLE public.launch_plan_changes
  ADD CONSTRAINT launch_plan_changes_fire_check CHECK (fire IN ('q16', 'n0930', 'g0830'));

COMMENT ON COLUMN public.launch_plan_changes.fire IS
  '발사 기준 — q16(16:00 Q16) · n0930(09:00:30 N) · g0830(08:30 G2 · quick-261125-c2i) · shared LaunchFire 그대로';

-- ── ② 경계 지도 g0830 분기 ────────────────────────────────────────
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
  ELSIF p_fire = 'g0830' THEN
    -- 08:30:00 G2(장개시전 시간외종가 예약 · 인박스 261125-sigan-ttaeng-g2) — 정확 일치.
    v_ex := 'KRX'; v_from := time '08:30:00'; v_until := time '08:30:00.000001';
  ELSE
    RAISE EXCEPTION 'launch_map_for_admin: p_fire 는 q16 | n0930 | g0830 (got %)', p_fire USING ERRCODE = '22023';
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
  'Phase 35 D-15/D-16/D-17/D-20 — 발사 경계 지도(q16 = KRX 15:00 ~ 18:00 창(평소 16:00 · 수능일 17:00 · 261119) · n0930 = NXT 09:00:30 N+A · g0830 = KRX 08:30:00 G2(인박스 261125-sigan-ttaeng-g2 · quick-261125-c2i) · 발사 기준별 최근 p_days 거래일 · 최신 머리). service_role 전용 · quick-261030-dz7 조각에 probe · round · result_code(뒤탐침 판정 재료)';

REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 바뀐 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
