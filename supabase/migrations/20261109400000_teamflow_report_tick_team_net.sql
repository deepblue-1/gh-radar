-- ============================================================
-- quick 261109-kzk — 팀 매집 보고서 「팀 순매수」 = 틱뷰어 하루 팀 순매수(tick_grids KRX 행 team_day_net_krw).
--
-- 무엇: teamflow_report_for_user(p_user_id, p_date) 를 같은 시그니처 · 같은 응답 봉투로 재정의한다.
--   바뀌는 것은 rows 서브쿼리 하나 —
--   ① tick_grids (date, 'KRX', isin) 를 PK 로 LEFT JOIN 해 rows[] 원소에 tick_team_fills · tick_team_day_net_krw 를
--      싣는다(격자 없음 · 미계산이면 null). 키에 tick_ 접두사를 붙여 export 열(team_net_val 등)과 출처가 섞이지 않게 한다.
--   ② 정렬 = 유효값(아래 칸 규칙) DESC NULLS LAST, isin — 웹 sortRows(teamNetOf) 와 같은 순서.
--   게이트 · 날짜 규칙 · 빈 모양 · t20_ms(limitup_entries LEFT JOIN)는 20261102200200 그대로. team_net_val 열은 export 그대로.
--
-- 왜(2026-11-09 사용자 결정 · gh-trade 세션과 합의 — gh-trade export 정의는 그대로):
--   목록 값 export team_net_val(KRX G1 만 · 상한가 가격 체결 제외)이 틱뷰어 「당일순매수」(KRX G1+G4 · 상한가 가격 포함)와
--   달라 같은 종목이 두 화면에서 다른 숫자로 보였다(11/3 실측 래블업 12.01억 ↔ 12.88억 · 한싹 +0.42억 ↔ −3.90억 ·
--   한진 +1.40억 ↔ −0.01억 · 한울앤제주 −0.04억 ↔ −1.65억). 트레이더가 보는 「팀 순매수」 를 한 정의로 맞춘다.
--   웹이 tick_grids 를 따로 부르면 왕복이 하나 늘어난다(server 는 VPC all-traffic egress — 왕복 수가 지연을 지배) →
--   이 RPC 한 번 안에서 조인한다(왕복 1회 유지).
--
-- 칸 규칙(tick_grids 팀 칸 — 20261103230000 머리 · CHECK tick_grids_team_chk):
--   team_fills null  = 미계산(옛 격자 · 격자 없음 포함) → 웹은 export team_net_val 로 폴백(「*」 표식) · 정렬도 team_net_val
--   team_fills 0     = 팀 체결 없음 → 값 null · 웹 「—」 · 정렬 맨 뒤(틱뷰어 목록 규칙 — export 로 폴백하지 않는다)
--   team_fills > 0   = team_day_net_krw(틱뷰어 「당일순매수」 와 같은 값)
--
-- 속성 · 권한(20261102200200 그대로 재진술): STABLE · SECURITY INVOKER · search_path = public, pg_temp ·
--   REVOKE PUBLIC + anon, authenticated(자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은
--   auto-grant 에 덮인다) · GRANT service_role.
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`.
-- 되돌리기: 20261102200200_teamflow_report_t20.sql 의 함수 본문으로 다시 CREATE OR REPLACE(웹은 tick_ 키 없음을
--   export 폴백으로 다뤄 깨지지 않는다 — 전 행 「*」 표식).
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
  -- quick 261109-kzk — 행마다 그날 KRX 격자 팀 칸(PK (date, exchange, isin) 조인 · 없으면 null) · 유효값 정렬
  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(
                      to_jsonb(t) || jsonb_build_object(
                        't20_ms', e.t20_ms,
                        'tick_team_fills', g.team_fills,
                        'tick_team_day_net_krw', g.team_day_net_krw)
                      ORDER BY (CASE WHEN g.team_fills IS NULL THEN t.team_net_val
                                     WHEN g.team_fills > 0 THEN g.team_day_net_krw END) DESC NULLS LAST,
                               t.isin), '[]'::jsonb)
               FROM public.limitup_team_flow t
               LEFT JOIN public.limitup_entries e ON e.date = t.date AND e.isin = t.isin
               LEFT JOIN public.tick_grids g ON g.date = t.date AND g.exchange = 'KRX' AND g.isin = t.isin
              WHERE t.date = v_date));
END;
$$;

COMMENT ON FUNCTION public.teamflow_report_for_user(uuid, text) IS
  'Phase 33 D-05/D-07 · Phase 37 D-17(행 t20_ms) · quick 261109-kzk(행 tick_team_fills · tick_team_day_net_krw · 유효값 정렬) — 팀 매집 보고서 하루 번들(jsonb 1회). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 본문을 읽게 한다.
NOTIFY pgrst, 'reload schema';
