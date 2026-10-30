-- ============================================================
-- quick-261030-dz7 — 발사 경계 지도 조각에 probe · round · result_code(16:00 뒤탐침 판정 재료).
--
-- 무엇:
--   ① public.launch_map_for_admin(p_fire text, p_days integer DEFAULT NULL) 같은 시그니처 재정의 —
--      20261027200000 ⑥ 본문 그대로에서 조각 jsonb_build_object 에 'probe' · 'round' · 'result_code' 세 키만 더한다
--      (지도 열 11 → 14). 발사 기준 검사 · p_days 절단 · heads · ORDER BY 는 원문 그대로.
--   ② COMMENT ON COLUMN public.launch_pieces.round 갱신 — −1 = 앞쪽 탐침 · −2 = 16:00 뒤탐침 서술(열 · 제약 무변경).
--
-- 왜: gh-trade 는 10/31 부터 16:00 뒤쪽 탐침(뒤탐침) 3발을 kind 17 LaunchPiece 로 보낸다 — probe true · round −2 ·
--   wire = 그 시장 실조각 수 + i · piece_idx = i · side B · qty 1 · result 접수/101/기타/무응답 · result_code = rc 원문.
--   웹 경계 계산(shared launchGateSideOf)이 뒤탐침을 실조각과 갈라 읽으려면(기타 = 열림 · 단 E127 은 경계 밖)
--   지도 응답에 probe · round · result_code 가 있어야 한다.
--   요청 노트: gh-trade docs/inbox/from-gh-radar/261030-launch-tail-probe-kind17.md
--
-- 영향 없음(무변경):
--   - launch_pieces 표 — round · probe · result_code 열은 20261027200000 부터 있다.
--   - launch_project_event 투영(20261028200000) — 이미 probe ← has_remaining · round ← ev_price · result_code ← rc 를 푼다.
--   - launch_upsert_piece · launch_upsert_head(20261030200000) — 손대지 않는다.
--   - launch_orders_for_admin — to_jsonb 전체 열이라 세 칸을 이미 싣는다.
--   - server getLaunchMap — RPC jsonb 를 배열 검사 뒤 그대로 통과(응답 스키마 없음).
--
-- 권한: SECURITY INVOKER + 권한 3줄 재진술(CREATE OR REPLACE 는 권한을 유지하지만 플랫폼 auto-grant 관례상 명시 —
--   자동 메모리 feedback_supabase_rpc_revoke). 표 권한 · RLS 무변경.
-- 원격 적용: 커밋만 — 메인 세션이 `supabase db push --linked --yes`(읽기 함수 재정의뿐 — 장중 무해).
--   적용 전 옛 응답엔 세 칸이 없지만 웹은 없으면 실조각으로 읽는다(배포 순서 무관).
-- 되돌리기: 20261027200000 ⑥ 본문(CREATE → CREATE OR REPLACE)과 COMMENT ON FUNCTION 원문 재적용 ·
--   COMMENT ON COLUMN public.launch_pieces.round IS '회차 0 · 1 · 2'.
-- ============================================================

BEGIN;

-- ── ① 경계 지도 RPC(D-15 · D-16 · D-17 · D-20 · A4 · quick-261030-dz7) ──
-- 발사 기준(p_fire):
--   q16   = (KRX, 16:00:00)
--   n0930 = (NXT, 09:00:30) — profile 을 가로지른다(N 매수 + A 매도 · D-03 · D-17).
--   A 의 09:00:27 KRX 매수 다리는 어느 기준에도 걸리지 않는다(지도 없음 — 주문 내역에만).
--   그 밖 값 · p_days < 1 은 SQLSTATE 22023.
-- 응답 {days, heads, pieces}:
--   days   = 그 발사 기준에 조각이 있는 거래일 내림차순 YYYYMMDD · LIMIT p_days(null = 전체).
--            「최근 N일」 은 발사 기준별 거래일이다(A4 — N 은 개장차익 가동일만 있어 q16 날짜로 자르면 안 된다).
--   pieces = 그 날짜들의 그 발사 기준 조각 — 지도 열만(trade_date YYYYMMDD · gateway · market · profile · fire_exchange ·
--            side · wire · piece_idx · sent_rel_us · result · retry · probe · round · result_code) ·
--            trade_date, gateway, market, profile, wire 오름차순.
--   heads  = 서버 × 시장 × 프로파일별 그 발사 기준 최신 머리 1행(범위와 무관 — 다음 오프셋 선 · D-16 · D-17).
--            행 모양은 주문 내역 머리와 같다.
-- 경계 · 리본 계산은 웹(shared launchDaysOf) — SQL 에 두 번째 구현을 두지 않는다(왕복 1회는 같다).
-- 빈 경우 {days: [], heads: [], pieces: []}.
CREATE OR REPLACE FUNCTION public.launch_map_for_admin(p_fire text, p_days integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ex   text;
  v_base time;
  v_days date[];
BEGIN
  IF p_fire = 'q16' THEN
    v_ex := 'KRX'; v_base := time '16:00:00';
  ELSIF p_fire = 'n0930' THEN
    v_ex := 'NXT'; v_base := time '09:00:30';
  ELSE
    RAISE EXCEPTION 'launch_map_for_admin: p_fire 는 q16 | n0930 (got %)', p_fire USING ERRCODE = '22023';
  END IF;
  IF p_days IS NOT NULL AND p_days < 1 THEN
    RAISE EXCEPTION 'launch_map_for_admin: p_days 는 1 이상 또는 null (got %)', p_days USING ERRCODE = '22023';
  END IF;

  -- 발사 기준별 거래일(launch_pieces_fire_date_idx) — LIMIT NULL = 전체
  v_days := ARRAY(SELECT d.trade_date
                    FROM (SELECT DISTINCT p.trade_date FROM public.launch_pieces p
                           WHERE p.fire_exchange = v_ex AND p.fire_base = v_base) d
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
                       WHERE h.fire_exchange = v_ex AND h.fire_base = v_base
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
                WHERE p.fire_exchange = v_ex AND p.fire_base = v_base AND p.trade_date = ANY (v_days)));
END;
$$;

COMMENT ON FUNCTION public.launch_map_for_admin(text, integer) IS
  'Phase 35 D-15/D-16/D-17/D-20 — 발사 경계 지도(q16 = KRX 16:00 · n0930 = NXT 09:00:30 N+A · 발사 기준별 최근 p_days 거래일 · 최신 머리). service_role 전용 · quick-261030-dz7 조각에 probe · round · result_code(뒤탐침 판정 재료)';

REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) TO service_role;

-- ── ② round 열 서술 ─────────────────────────────────────────────
COMMENT ON COLUMN public.launch_pieces.round IS
  '회차 0 · 1 · 2 · −1 = 앞쪽 탐침 · −2 = 16:00 뒤탐침(gh-trade 261030 kind 17 · probe true 와 함께)';

COMMIT;

-- PostgREST 스키마 캐시가 바뀐 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
