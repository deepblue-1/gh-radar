-- ============================================================
-- Phase 37 Plan 11 — 팀 매집 보고서 행에 첫 20% 도달 시각 t20_ms (D-17 「틱 보기 ›」).
--
-- 무엇: teamflow_report_for_user(p_user_id, p_date) 를 같은 시그니처 · 같은 응답 모양으로 재정의한다.
--   바뀌는 것은 rows[] 원소 하나 — `to_jsonb(t) || {t20_ms}` 로 그날 limitup_entries (date, isin) 의
--   t20_ms 를 LEFT JOIN 해 싣는다(entries 행이 없으면 null). 정렬 · 게이트 · 날짜 규칙 · 빈 모양은 그대로.
--
-- 왜(D-17): 팀 매집 상세 「틱 보기 ›」 알약의 시각 규칙 = 상한가 도달(payload.reach.t_ms ?? first_limit_ms)
--   · 없으면 첫 20% 도달(t20_ms). team_flow 표에는 t20 이 없고 entries 에만 있다. 웹이 entries 를 따로
--   부르면 왕복이 하나 늘어난다(server 는 VPC all-traffic egress — 왕복 수가 지연을 지배). 그래서 이 RPC
--   한 번 안에서 조인한다(왕복 1회 유지 · Open Question 2).
--
-- 속성 · 권한(20261016200100 그대로 재진술): STABLE · SECURITY INVOKER · search_path = public, pg_temp ·
--   REVOKE PUBLIC + anon, authenticated(자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은
--   auto-grant 에 덮인다) · GRANT service_role.
-- 원격 적용: 커밋만 — 원격은 37-16 `supabase db push`.
-- 되돌리기: 20261016200100_teamflow_report_rpc.sql 의 함수 본문으로 다시 CREATE OR REPLACE(웹은 t20_ms 키가
--   없으면 다음 폴백 — 「t 없이」 뷰어 기본 08:00 첫 틱).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.teamflow_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
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

  -- Phase 37 D-17 — 행마다 그날 entries 의 t20_ms(PK (date, isin) 조인 · 없으면 null)
  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('t20_ms', e.t20_ms)
                                       ORDER BY t.team_net_val DESC NULLS LAST, t.isin), '[]'::jsonb)
               FROM public.limitup_team_flow t
               LEFT JOIN public.limitup_entries e ON e.date = t.date AND e.isin = t.isin
              WHERE t.date = v_date));
END;
$$;

COMMENT ON FUNCTION public.teamflow_report_for_user(uuid, text) IS
  'Phase 33 D-05/D-07 · Phase 37 D-17(행 t20_ms) — 팀 매집 보고서 하루 번들(jsonb 1회). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 본문을 읽게 한다.
NOTIFY pgrst, 'reload schema';
