-- ============================================================
-- Phase 33 Plan 01 — 팀 매집 보고서 조회 RPC (server GET /api/teamflow/report).
--
-- 무엇: teamflow_report_for_user(p_user_id, p_date) → jsonb — 하루 번들 한 장(날짜 목록 · 그날 행 전부 + payload).
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run → Supabase 왕복 수가 지연을 지배한다(server 는 VPC all-traffic egress) —
--   한 요청 = RPC 한 번(D-05). SETOF 는 PostgREST max_rows 에 조용히 잘리므로 jsonb 값 하나로 묶는다.
--
-- 게이트 정본: `dma_visible_accounts(p_user_id)` 가 1행 이상 = 「DMA 매핑 사용자」(상한가 보고서 20261006090400 과 같은 판정).
--   아니면 `{"access": false}` 만 — server 가 403 DMA_UNMAPPED 로 바꾼다. 라우트는 인증(requireAuth)만 하고
--   DMA 매핑 미들웨어를 겹치지 않는다(게이트는 이 함수 안 · 왕복 1회). p_user_id 는 server 가 requireAuth 로 확정한 값 하나다.
--
-- 응답 모양(D-05 · D-07):
--   {access: false}
--   {access: true, dates: [], date: null, rows: []}           — 적재 이력 0
--   {access: true, dates, date, rows}                         — dates = team_flow 행이 있는 날짜 내림차순
--     date = p_date 또는 최신. 행 없는 날짜(0행 commit · 주말 · 적재 전)를 p_date 로 주면 rows: [] (404 아님 — 200).
--     rows = to_jsonb(행) — 평평한 열(snake_case) + payload 중첩 객체 그대로 · team_net_val DESC NULLS LAST, isin.
--
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 33-08 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.teamflow_report_for_user(uuid, text);
-- ============================================================

BEGIN;

CREATE FUNCTION public.teamflow_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
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
  v_dates := ARRAY(SELECT DISTINCT t.date FROM public.limitup_team_flow t ORDER BY t.date DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'rows', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);

  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_net_val DESC NULLS LAST, t.isin), '[]'::jsonb)
               FROM public.limitup_team_flow t WHERE t.date = v_date));
END;
$$;

COMMENT ON FUNCTION public.teamflow_report_for_user(uuid, text) IS
  'Phase 33 D-05/D-07 — 팀 매집 보고서 하루 번들(jsonb 1회). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
