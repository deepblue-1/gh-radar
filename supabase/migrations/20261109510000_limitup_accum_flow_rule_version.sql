-- ============================================================
-- quick-261109-tn6 — `limitup_accum_flow` 에 판정 규칙판 열 rule_version 을 더하고, 목록 RPC 가 그 값을 싣는다.
--
-- 무엇: ① ADD COLUMN rule_version int.
--       ② accum_report_for_user(uuid, text) 재정의 — 목록 rows 원소에 rule_version 키 하나를 더한다(46 → 47키).
-- 왜:   인박스 docs/inbox/from-gh-trade/261109-accum-day-net.md(gh-trade Phase 48 하루 순매수 · 사이클 규칙) — 밤 export
--       `accum_flow.ndjson.gz` 평평한 열에 rule_version(pos_day_avg_px 뒤 · schema_version 앞)이 생겼다. 값 = 그 isin 그날 마지막
--       이벤트 행 message 의 `|rule=N`, 없으면 0(옛 규칙). schema_version 은 올리지 않았다. 보고서는 이 값으로 새 규칙 행
--       (종료 사유 4 즉시 종료 · 5 하루 판정 종료 · 판정 기준 사이클 누적 2억 · 하루 순매수 06:00 에만 0)과 옛 행을 가른다.
--
-- 적재 함수는 다시 정의하지 않는다: limitup_commit_day(20261020200000)의 accum_flow INSERT 는
--   `SELECT (jsonb_populate_record(NULL::public.limitup_accum_flow, s.payload)).*` — jsonb_populate_record 는 키 이름으로 대응하고,
--   ADD COLUMN 은 표와 레코드 양쪽 끝에 같은 순서로 붙으므로 export 의 열 위치(pos_day_avg_px 뒤 · schema_version 앞)와 무관하다.
--   키가 없거나 JSON null 인 payload(옛 export)는 NULL 이 된다(0 은 0). 선례 = 20261025200000 · 20261026120000.
-- 상세(accum_detail_for_user)는 `to_jsonb(a)` 라 새 키가 row 에 자동으로 실린다(43 → 44키) — 다시 정의하지 않는다.
-- 목록 함수 본문은 20261026120000 과 열 목록 한 줄 · 주석 한 줄만 다르다(게이트 · dates · 전날 · 정렬 · 봉투 그대로).
-- 권한: 표 단위 잠금(20261020200000)이 새 열에도 그대로다. 함수 권한은 CREATE OR REPLACE 뒤 재진술한다(auto-grant 방지).
--
-- 원격 적용 순서 주의: KYOBO119 분석기의 새 export(rule_version 열)가 실린 날짜가 이 마이그레이션 **전에** 적재되면
--   jsonb_populate_record 가 모르는 키를 버리고 files_sig 는 같아 다시 적재되지 않는다 — 그때는 그 날짜
--   limitup_loads.files_sig 를 비워 재적재를 유도한다. 이 커밋은 파일만 — db push 는 메인 세션이 한다.
--
-- 되돌리기(수동): 20261026120000 의 accum_report_for_user 본문 재적용 →
--   ALTER TABLE public.limitup_accum_flow DROP COLUMN rule_version;
-- ============================================================

BEGIN;

ALTER TABLE public.limitup_accum_flow ADD COLUMN rule_version int;

COMMENT ON COLUMN public.limitup_accum_flow.rule_version IS '서버 값 — 판정 규칙판: 그 isin 그날 마지막 이벤트 행 message 의 |rule=N · 0 = 옛 규칙(키 없음) · 2 = gh-trade Phase 48 하루 순매수 · 사이클 규칙 · 이 열 추가 전 적재 행 null';

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

  -- 목록 rows — 37열 명시 서브쿼리 + pnl(payload 의 그 키만 · Pitfall 6) + 당일 축 5 + rule_version + 전날 pos_day 3(PK 조인)
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
                            a.pos_day_buy_krw, a.pos_day_sell_krw, a.th_recent_pieces, a.th_recent_sec, a.pos_day_avg_px, a.rule_version,
                            p.pos_day_buy_krw AS prev_pos_day_buy_krw, p.pos_day_sell_krw AS prev_pos_day_sell_krw, p.pos_day_avg_px AS prev_pos_day_avg_px
                       FROM public.limitup_accum_flow a
                       LEFT JOIN public.limitup_accum_flow p ON p.date = v_prev AND p.isin = a.isin
                      WHERE a.date = v_date) s));
END;
$$;

COMMENT ON FUNCTION public.accum_report_for_user(uuid, text) IS
  'Phase 34 D-06/D-07 — 매집감지 보고서 하루 목록(jsonb 1회 · 평평한 열 + pnl + 당일 축 5 + rule_version + 전날 pos_day 3 · prev_date · payload 제외). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
