-- ============================================================
-- Phase 34 Plan 01 — 매집감지 보고서 조회 RPC 2개 (server GET /api/accum/report · GET /api/accum/report/:date/:isin).
--
-- 무엇:
--   accum_report_for_user(p_user_id, p_date)        → jsonb — 하루 목록 한 장(날짜 목록 · 그날 행 전부 · 평평한 열만)
--   accum_detail_for_user(p_user_id, p_date, p_isin) → jsonb — 한 종목 상세(평평한 열 + payload)
--
-- 왜 목록/상세 분리(D-06): payload 는 행당 최대 json ≈ 224KB(10/14 한선엔지니어링) — 하루 수십 행을 한 번에 실으면
--   목록 응답이 MB 단위가 된다. 목록은 평평한 열만, 상세는 행을 펼칠 때 한 종목씩(웹 지연 로드 · 세션 캐시).
-- 목록은 payload 를 읽지 않는다(Pitfall 6): `to_jsonb(t) - 'payload'` 는 행 전체(TOAST 된 payload 포함)를 jsonb 로 만든 뒤
--   지우므로 쓸데없이 풀어낸다 — 37열 명시 서브쿼리로 만든다.
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run → Supabase 왕복 수가 지연을 지배한다(server 는 VPC all-traffic egress) —
--   한 요청 = RPC 한 번. SETOF 는 PostgREST max_rows 에 조용히 잘리므로 jsonb 값 하나로 묶는다.
--
-- 게이트 정본: `dma_visible_accounts(p_user_id)` 가 1행 이상 = 「DMA 매핑 사용자」(상한가 · 팀 매집 보고서와 같은 판정).
--   아니면 `{"access": false}` 만 — server 가 403 DMA_UNMAPPED 로 바꾼다. 라우트는 인증(requireAuth)만 하고
--   DMA 매핑 미들웨어를 겹치지 않는다(게이트는 이 함수 안 · 왕복 1회). p_user_id 는 server 가 requireAuth 로 확정한 값 하나다.
--
-- 응답 모양(D-06 · D-07):
--   목록 {access: false}
--        {access: true, dates: [], date: null, rows: []}     — 적재 행 0
--        {access: true, dates, date, rows}                   — dates = limitup_accum_flow 행이 있는 날짜 내림차순
--          date = p_date 또는 최신. 행 없는 날짜를 p_date 로 주면 rows: [] (404 아님 — 200).
--          rows = 평평한 37열(snake_case · payload 키 없음) · state, pos_net_krw DESC NULLS LAST, isin.
--   상세 {access: false}
--        {access: true, row}                                 — row = 그 (date, isin) 행 to_jsonb(평평한 열 + payload) | null
--          (행 없으면 row: null — 200. p_date · p_isin 형식 검사는 server zod 가 먼저 한다.)
--
-- kind 16(dma_strategy_events)과 join 하지 않는다 — limitup_accum_flow 가 매집감지 이력 정본이다(D-22).
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 34-11 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.accum_report_for_user(uuid, text); DROP FUNCTION public.accum_detail_for_user(uuid, text, text);
-- ============================================================

BEGIN;

CREATE FUNCTION public.accum_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- D-07 — 행이 있는 날짜만(PK 앞 열이라 인덱스로 끝난다)
  v_dates := ARRAY(SELECT DISTINCT a.date FROM public.limitup_accum_flow a ORDER BY a.date DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'rows', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);

  -- 목록 rows — payload 제외(37열 명시 서브쿼리 · Pitfall 6)
  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.state, s.pos_net_krw DESC NULLS LAST, s.isin), '[]'::jsonb)
               FROM (SELECT a.date, a.isin, a.short_code, a.name, a.market, a.base, a.upper, a.last_px, a.last_rate,
                            a.high_px, a.high_rate, a.state, a.end_reason, a.cycle, a.carry_days, a.since_date,
                            a.reg_time_ms, a.end_time_ms, a.our_excluded_qty, a.mcap_krw, a.th_net_krw, a.th_same,
                            a.th_mcap_krw, a.pos_buy_qty, a.pos_buy_krw, a.pos_sell_qty, a.pos_sell_krw, a.pos_net_krw,
                            a.pos_avg_px, a.pos_peak_net_krw, a.pos_reg_px, a.day_buy_krw, a.day_sell_krw, a.day_net_krw,
                            a.day_buy_qty, a.day_sell_qty, a.schema_version
                       FROM public.limitup_accum_flow a WHERE a.date = v_date) s));
END;
$$;

COMMENT ON FUNCTION public.accum_report_for_user(uuid, text) IS
  'Phase 34 D-06/D-07 — 매집감지 보고서 하루 목록(jsonb 1회 · 평평한 열만 · payload 제외). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;

CREATE FUNCTION public.accum_detail_for_user(p_user_id uuid, p_date text, p_isin text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 게이트 — 목록 RPC 와 같은 판정
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- 한 종목 — 평평한 열 + payload(PK 조회 · 없으면 row: null)
  RETURN jsonb_build_object(
    'access', true,
    'row', (SELECT to_jsonb(a) FROM public.limitup_accum_flow a WHERE a.date = p_date AND a.isin = p_isin));
END;
$$;

COMMENT ON FUNCTION public.accum_detail_for_user(uuid, text, text) IS
  'Phase 34 D-06 — 매집감지 보고서 한 종목 상세(평평한 열 + payload · 없으면 row null). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.accum_detail_for_user(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_detail_for_user(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_detail_for_user(uuid, text, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
