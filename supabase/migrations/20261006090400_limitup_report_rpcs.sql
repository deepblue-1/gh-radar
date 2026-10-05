-- ============================================================
-- Phase 28 Plan 10 — 상한가 보고서 조회 RPC 2개 (server GET /api/limitup/report · /api/limitup/grid-urls).
--
-- 무엇:
--   ① limitup_report_for_user(p_user_id, p_date) → jsonb — 보고서 한 장(날짜 목록 · 그날 묶음 · 어제 결과 · 90일 지문).
--   ② limitup_grid_isins_for_user(p_user_id, p_date) → jsonb — 같은 게이트 뒤 그날 격자가 있는 isin 목록
--      (server 가 이 목록으로 Storage `limitup-grid` 서명 URL 을 한 번에 만든다).
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run → Supabase 왕복 수가 지연을 지배한다(server 는 VPC all-traffic egress) —
--   한 요청 = RPC 한 번. SETOF 는 PostgREST max_rows(1000) 에 조용히 잘리므로(Phase 28 RESEARCH Pitfall 2)
--   여러 표를 jsonb 값 하나로 묶어 돌려준다.
--
-- 게이트(D-10): `dma_visible_accounts(p_user_id)` 가 1행 이상 = 「DMA 매핑 사용자」(작업대 tradingVisible 과 같은 판정).
--   아니면 `{"access": false}` 만 — 다른 키를 싣지 않는다(server 가 403 DMA_UNMAPPED 로 바꾼다).
--   p_user_id 는 server 가 requireAuth 로 확정한 값 하나다(T-19-17). 두 함수 모두 service_role 전용.
--
-- 응답 모양 (①):
--   {access: false}
--   {access: true, dates: [], date: null, loaded: false}                         — 적재 이력 0
--   {access: true, dates, date, loaded: false}                                   — 적재 안 된 날짜(skip 만 · 형식 밖 포함)
--   {access: true, dates, date, loaded: true, day, prev, fingerprint}
--     dates       = 「적재된 날짜」(limitup_loads.files_sig IS NOT NULL) 내림차순
--     day         = {entries, locks, facts, summaries, marks, rows} — 행 키는 export 열 이름 그대로(snake_case)
--                   marks = jumps 의 burst_sell · cancel 을 종목마다 krw 큰 순 40개(하루 수천 행을 다 보내지 않는다)
--                   rows  = 적재 이력의 표별 행 수
--     prev        = {date, locks} 바로 이전 적재 날짜의 locks(어제 결과 · d1_*) — 없으면 null
--     fingerprint = member_daily 의 (D − 90일, D] 행을 창구마다 SUM · 이름 = 최신 non-null · n 내림차순 → member.
--                   평균(sum ÷ cnt) · 10건 게이트는 웹이 한다.
--
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 28-14 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.limitup_grid_isins_for_user(uuid, text);
--           DROP FUNCTION public.limitup_report_for_user(uuid, text);
-- ============================================================

BEGIN;

-- ── ① 보고서 한 장 ──────────────────────────────────────────────
CREATE FUNCTION public.limitup_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates  text[];
  v_date   text;
  v_prev   text;
  v_day    jsonb;
  v_prev_j jsonb;
  v_fp     jsonb;
  v_from   text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  v_dates := ARRAY(SELECT l.date FROM public.limitup_loads l WHERE l.files_sig IS NOT NULL ORDER BY l.date DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'loaded', false);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);
  IF v_date <> ALL (v_dates) THEN
    RETURN jsonb_build_object('access', true, 'dates', to_jsonb(v_dates), 'date', v_date, 'loaded', false);
  END IF;

  v_day := jsonb_build_object(
    'entries', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.isin), '[]'::jsonb)
                  FROM public.limitup_entries e WHERE e.date = v_date),
    'locks', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.isin, l.lock_id), '[]'::jsonb)
                FROM public.limitup_locks l WHERE l.date = v_date),
    'facts', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.isin, f.t_ms NULLS LAST, f.event_no, f.fact_no), '[]'::jsonb)
                FROM public.limitup_facts f WHERE f.date = v_date),
    'summaries', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.isin), '[]'::jsonb)
                    FROM public.limitup_grid_summary g WHERE g.date = v_date),
    'marks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'isin', m.isin, 'jump_no', m.jump_no, 't_ms', m.t_ms, 'kind', m.kind, 'qty', m.qty,
                       'krw', m.krw, 'q_before', m.q_before, 'q_after', m.q_after)
                     ORDER BY m.isin, m.rn), '[]'::jsonb)
                FROM (SELECT j.isin, j.jump_no, j.t_ms, j.kind, j.qty, j.krw, j.q_before, j.q_after,
                             row_number() OVER (PARTITION BY j.isin ORDER BY j.krw DESC NULLS LAST, j.jump_no) AS rn
                        FROM public.limitup_jumps j
                       WHERE j.date = v_date AND j.kind IN ('burst_sell', 'cancel')) m
               WHERE m.rn <= 40),
    'rows', (SELECT l."rows" FROM public.limitup_loads l WHERE l.date = v_date)
  );

  -- 어제 결과 — 바로 이전 적재 날짜의 locks
  v_prev := (SELECT max(l.date) FROM public.limitup_loads l WHERE l.files_sig IS NOT NULL AND l.date < v_date);
  IF v_prev IS NOT NULL THEN
    v_prev_j := jsonb_build_object(
      'date', v_prev,
      'locks', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.isin, l.lock_id), '[]'::jsonb)
                  FROM public.limitup_locks l WHERE l.date = v_prev));
  END IF;

  -- 지문 — (D − 90일, D] 창구별 합계
  v_from := to_char(to_date(v_date, 'YYYYMMDD') - 90, 'YYYYMMDD');
  v_fp := (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.n DESC, s.member), '[]'::jsonb)
             FROM (SELECT d.member,
                          (array_agg(d.name ORDER BY d.date DESC) FILTER (WHERE d.name IS NOT NULL))[1] AS name,
                          sum(d.n)            AS n,
                          sum(d.entry_sum)    AS entry_sum,
                          sum(d.entry_cnt)    AS entry_cnt,
                          sum(d.lock_buy_sum) AS lock_buy_sum,
                          sum(d.lock_buy_cnt) AS lock_buy_cnt,
                          sum(d.pre_sell_sum) AS pre_sell_sum,
                          sum(d.pre_sell_cnt) AS pre_sell_cnt,
                          sum(d.lead)         AS lead,
                          sum(d.n_broke)      AS n_broke,
                          sum(d.n_lock)       AS n_lock,
                          sum(d.n_held)       AS n_held
                     FROM public.limitup_member_daily d
                    WHERE d.date > v_from AND d.date <= v_date
                    GROUP BY d.member) s);

  RETURN jsonb_build_object(
    'access', true, 'dates', to_jsonb(v_dates), 'date', v_date, 'loaded', true,
    'day', v_day, 'prev', v_prev_j, 'fingerprint', v_fp);
END;
$$;

-- ── ② 격자 isin 목록 (서명 URL 원천) ──────────────────────────────
CREATE FUNCTION public.limitup_grid_isins_for_user(p_user_id uuid, p_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
  RETURN jsonb_build_object(
    'access', true,
    'date', p_date,
    'isins', (SELECT coalesce(jsonb_agg(g.isin ORDER BY g.isin), '[]'::jsonb)
                FROM public.limitup_grid_summary g WHERE g.date = p_date));
END;
$$;

COMMENT ON FUNCTION public.limitup_report_for_user(uuid, text) IS
  'Phase 28 D-10/D-11/D-17 — 상한가 보고서 한 장(jsonb 1회). DMA 매핑 사용자만. service_role 전용';
COMMENT ON FUNCTION public.limitup_grid_isins_for_user(uuid, text) IS
  'Phase 28 D-10 — 그날 격자 isin 목록(서명 URL 원천). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.limitup_grid_isins_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limitup_grid_isins_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_grid_isins_for_user(uuid, text) TO service_role;

COMMIT;
