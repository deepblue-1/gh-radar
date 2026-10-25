-- ============================================================
-- 매집감지 보고서 목록 RPC — 행마다 당일 축 4키 + 전날 pos_day 2키 · 봉투에 prev_date
--
-- 무엇: accum_report_for_user(uuid, text) 재정의 — 목록 rows 원소에 6키를 더한다(37열 + pnl + 6 = 44키).
--       ① 당일 축 4키 pos_day_buy_krw · pos_day_sell_krw · th_recent_pieces · th_recent_sec(20261025200000 이 더한 열 그대로 ·
--          그 열 추가 전 적재 행 null · 옛 서버 export 행 0).
--       ② 전날 2키 prev_pos_day_buy_krw · prev_pos_day_sell_krw = 그 날짜보다 앞선 **가장 최근 행 있는 날짜**(prev_date)의
--          같은 isin 행 pos_day_buy_krw · pos_day_sell_krw(없으면 null).
--       ③ 봉투 prev_date(없으면 null · 빈 이력도 null).
-- 왜:   quick-261026-01h(gh-trade Phase 39 매집감지 당일 축 · 인박스 261025-accum-day-axis · 스케치 018) — 보고서 목록 · KPI 가
--       당일 순매수를 주인공으로 보이고, 이월 행 상세가 「전날」 줄을 그리고, 작업대 「매집」 패널이 이월 행의 전 거래일 순매수를
--       기존 `GET /api/accum/report`(d 없음 = 최신) 하나로 읽는다(새 서버 라우트 · 새 RPC 없음).
-- 전날 규칙: 행 있는 날짜(v_dates) 중 그 날짜 바로 앞 — 거래일 달력과 대조하지 않는다. 그래서 적재 누락일이 있으면 그 앞날이
--       전날이 된다(한계 · 의도된 단순화). 조인은 PK (date, isin) 조회 하나라 payload 를 읽지 않는다(Pitfall 6).
-- 나머지(게이트 · dates · 정렬 · 권한)는 20261021140000 과 한 글자도 다르지 않다.
--
-- 되돌리기(수동): 20261021140000 의 accum_report_for_user 본문 재적용.
-- 원격 적용은 메인 세션(`supabase db push --linked --yes`) — 웹이 먼저 나가도 새 키가 없을 뿐 오늘 모양으로 안전하다.
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
  v_prev  text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- D-07 — 행이 있는 날짜만(PK 앞 열이라 인덱스로 끝난다)
  v_dates := ARRAY(SELECT DISTINCT a.date FROM public.limitup_accum_flow a ORDER BY a.date DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'prev_date', NULL, 'rows', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);
  -- 전날 = 행 있는 날짜 중 그 날짜 바로 앞(없으면 null · 거래일 달력과 대조하지 않는다)
  v_prev := (SELECT max(x) FROM unnest(v_dates) AS x WHERE x < v_date);

  -- 목록 rows — 37열 명시 서브쿼리 + pnl(payload 의 그 키만 · Pitfall 6) + 당일 축 4 + 전날 pos_day 2(PK 조인)
  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'prev_date', v_prev,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.state, s.pos_net_krw DESC NULLS LAST, s.isin), '[]'::jsonb)
               FROM (SELECT a.date, a.isin, a.short_code, a.name, a.market, a.base, a.upper, a.last_px, a.last_rate,
                            a.high_px, a.high_rate, a.state, a.end_reason, a.cycle, a.carry_days, a.since_date,
                            a.reg_time_ms, a.end_time_ms, a.our_excluded_qty, a.mcap_krw, a.th_net_krw, a.th_same,
                            a.th_mcap_krw, a.pos_buy_qty, a.pos_buy_krw, a.pos_sell_qty, a.pos_sell_krw, a.pos_net_krw,
                            a.pos_avg_px, a.pos_peak_net_krw, a.pos_reg_px, a.day_buy_krw, a.day_sell_krw, a.day_net_krw,
                            a.day_buy_qty, a.day_sell_qty, a.schema_version,
                            a.payload->'pnl' AS pnl,
                            a.pos_day_buy_krw, a.pos_day_sell_krw, a.th_recent_pieces, a.th_recent_sec,
                            p.pos_day_buy_krw AS prev_pos_day_buy_krw, p.pos_day_sell_krw AS prev_pos_day_sell_krw
                       FROM public.limitup_accum_flow a
                       LEFT JOIN public.limitup_accum_flow p ON p.date = v_prev AND p.isin = a.isin
                      WHERE a.date = v_date) s));
END;
$$;

COMMENT ON FUNCTION public.accum_report_for_user(uuid, text) IS
  'Phase 34 D-06/D-07 — 매집감지 보고서 하루 목록(jsonb 1회 · 평평한 열 + pnl + 당일 축 4 + 전날 pos_day 2 · prev_date · payload 제외). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
