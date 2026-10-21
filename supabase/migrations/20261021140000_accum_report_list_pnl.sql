-- ============================================================
-- 매집감지 보고서 목록 RPC — 행마다 팀 당일 손익(payload.pnl) 동봉
--
-- 무엇: accum_report_for_user(uuid, text) 재정의 — 목록 rows 원소에 `pnl` 키 하나를 더한다(37열 + pnl = 38키).
--       값 = limitup_accum_flow.payload->'pnl' 그대로(teamflow 와 같은 13키 객체 · 팀 체결 0 · payload 없음 = null).
-- 왜:   2026-10-21 사용자 요청 — 목록에 「팀 당일 손익」 열(하루 순매수 다음). 지금까지는 상세(payload)에만 있었다.
--       payload 전체는 여전히 목록에 싣지 않는다(Pitfall 6) — pnl 은 작은 객체 하나라 행 크기 영향이 없다.
-- 나머지(게이트 · dates · 정렬 · 권한)는 20261020200100 과 같다.
--
-- 되돌리기(수동): 20261020200100 의 accum_report_for_user 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.accum_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
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

  -- 목록 rows — 37열 명시 서브쿼리 + pnl(payload 의 그 키만 · Pitfall 6)
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
                            a.day_buy_qty, a.day_sell_qty, a.schema_version,
                            a.payload->'pnl' AS pnl
                       FROM public.limitup_accum_flow a WHERE a.date = v_date) s));
END;
$$;

COMMENT ON FUNCTION public.accum_report_for_user(uuid, text) IS
  'Phase 34 D-06/D-07 — 매집감지 보고서 하루 목록(jsonb 1회 · 평평한 열 + pnl · payload 제외). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
