-- ============================================================
-- stock_comovement_inputs(p_code) — GET /api/stocks/:code/co-movement 입력을 DB 한 번으로 (perf).
--
-- 왜:
--   종전 server 는 앵커 테마 → cosurge a/b → 테마 멤버(페이지) → 테마 메타 → 마스터 청크 →
--   시세 청크를 순차 await 로 8~10회 왕복했다. Cloud Run 은 --vpc-egress=all-traffic 이라
--   왕복마다 비용이 커 1.0~1.2초(첫 호출 2.1초)였다. system_theme_list()(20260913150000)와
--   같은 처방이다.
--
-- 계약: 점수 계산(computeComovement)은 server JS 에 그대로 두고, 그 입력만 한 번에 모아 준다.
--   - theme_ids: 앵커가 속한 theme_comovement 의 theme_id (중복 제거)
--   - members:   그 theme_id 들의 theme_comovement 전 행 (theme_id, stock_code 순)
--   - edges:     cosurge_edges 중 code_a = p_code 인 행, 이어서 code_b = p_code 인 행
--                (OR 대신 UNION ALL — 인덱스 2개를 각각 탄다)
--   - themes:    앵커 테마 중 hidden = false 인 id, name
--   - stocks:    후보(멤버 ∪ 이웃, 앵커 제외) 코드별 마스터 name·market 과 시세 change_rate
--                (마스터·시세가 없으면 null — server 가 폴백)
--
-- 반환형이 jsonb 단일 값인 이유: 메가 테마(반도체 등) 멤버가 max_rows(1000)를 넘어도 잘리지 않는다.
--
-- 보안 (MEMORY feedback_supabase_rpc_revoke): SECURITY INVOKER, service_role 전용 EXECUTE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.stock_comovement_inputs(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH anchor_themes AS (
    SELECT DISTINCT theme_id
    FROM theme_comovement
    WHERE stock_code = p_code
  ),
  members AS (
    SELECT tc.theme_id, tc.stock_code, tc.ignite_days, tc.member_count,
           tc.conf_d0, tc.conf_d1, tc.lift, tc.avg_ret
    FROM theme_comovement tc
    WHERE tc.theme_id IN (SELECT theme_id FROM anchor_themes)
  ),
  edges AS (
    SELECT 0 AS side, code_a, code_b, co_count, lift, avg_pair_ret,
           w_sum_a, ws_sum_a, w_sum_b, ws_sum_b, recent_pairs
    FROM cosurge_edges
    WHERE code_a = p_code
    UNION ALL
    SELECT 1 AS side, code_a, code_b, co_count, lift, avg_pair_ret,
           w_sum_a, ws_sum_a, w_sum_b, ws_sum_b, recent_pairs
    FROM cosurge_edges
    WHERE code_b = p_code
  ),
  candidates AS (
    SELECT stock_code AS code FROM members WHERE stock_code <> p_code
    UNION
    SELECT CASE WHEN code_a = p_code THEN code_b ELSE code_a END FROM edges
  )
  SELECT jsonb_build_object(
    'theme_ids',
      (SELECT coalesce(jsonb_agg(theme_id ORDER BY theme_id), '[]'::jsonb) FROM anchor_themes),
    'members',
      (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.theme_id, m.stock_code), '[]'::jsonb)
       FROM members m),
    'edges',
      (SELECT coalesce(
         jsonb_agg((to_jsonb(e) - 'side') ORDER BY e.side, e.code_a, e.code_b),
         '[]'::jsonb)
       FROM edges e),
    'themes',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name)), '[]'::jsonb)
       FROM themes t
       WHERE t.id IN (SELECT theme_id FROM anchor_themes) AND t.hidden = false),
    'stocks',
      (SELECT coalesce(
         jsonb_agg(jsonb_build_object(
           'code', c.code,
           'name', s.name,
           'market', s.market,
           'change_rate', q.change_rate
         )),
         '[]'::jsonb)
       FROM candidates c
       LEFT JOIN stocks s ON s.code = c.code
       LEFT JOIN stock_quotes q ON q.code = c.code)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_comovement_inputs(text) TO service_role;

COMMIT;
