-- ============================================================
-- system_theme_list() — GET /api/themes 목록 집계를 DB 한 번으로 (perf).
--
-- 왜:
--   종전 server 는 themes 1회 + theme_stocks theme_id 청크(병렬) + stock_quotes code 청크(병렬)
--   = PostgREST 왕복 28회로 목록을 조립했다. Cloud Run 은 --vpc-egress=all-traffic 이라
--   왕복마다 NAT 경유 비용이 붙어 캐시 미스가 1.06~1.24초였다(같은 흐름을 로컬에서 돌리면 0.2초).
--   집계를 DB 로 옮겨 왕복 1회로 만든다.
--
-- 계약 (server/src/routes/themes.ts 종전 JS 집계와 동일):
--   - 대상: themes.is_system AND NOT hidden (tombstone 제외, 유저 테마 제외)
--   - stock_count: 활성 멤버(theme_stocks.effective_to IS NULL) 수 — 시세 유무 무관
--   - live_top3_avg: 활성 멤버 중 시세가 있고 등락률이 유한한(NaN 아님) 종목의 상위 3 평균.
--                    해당 종목이 없으면 null (server 가 목록 맨 뒤로 정렬)
--   - top3_avg_change_rate: themes 의 캐시 컬럼 그대로 (응답은 live_top3_avg 가 덮어쓴다)
--   - 정렬은 server 가 한다 (null 뒤로 — D-14)
--
-- 반환형이 jsonb 단일 값인 이유: 집합 반환 RPC 는 PostgREST max_rows(1000) 에 잘린다.
--
-- 보안 (MEMORY feedback_supabase_rpc_revoke):
--   SECURITY INVOKER — service_role 이 호출(RLS 우회). 플랫폼 auto-grant 를 덮어쓰도록
--   PUBLIC + anon, authenticated 모두 REVOKE 후 service_role 에만 GRANT.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.system_theme_list()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sys AS (
    SELECT id, name, description, is_system, owner_id, sources,
           top3_avg_change_rate, stats_updated_at, created_at, updated_at
    FROM themes
    WHERE is_system AND NOT hidden
  ),
  members AS (
    SELECT ts.theme_id, q.change_rate
    FROM theme_stocks ts
    JOIN sys ON sys.id = ts.theme_id
    LEFT JOIN stock_quotes q ON q.code = ts.stock_code
    WHERE ts.effective_to IS NULL
  ),
  counts AS (
    SELECT theme_id, count(*)::int AS stock_count
    FROM members
    GROUP BY theme_id
  ),
  ranked AS (
    SELECT theme_id, change_rate,
           row_number() OVER (PARTITION BY theme_id ORDER BY change_rate DESC) AS rn
    FROM members
    WHERE change_rate IS NOT NULL AND change_rate <> 'NaN'::numeric
  ),
  top3 AS (
    SELECT theme_id, avg(change_rate) AS live_top3_avg
    FROM ranked
    WHERE rn <= 3
    GROUP BY theme_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'is_system', s.is_system,
        'owner_id', s.owner_id,
        'sources', s.sources,
        'top3_avg_change_rate', s.top3_avg_change_rate,
        'stats_updated_at', s.stats_updated_at,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'stock_count', coalesce(c.stock_count, 0),
        'live_top3_avg', t.live_top3_avg
      )
    ),
    '[]'::jsonb
  )
  FROM sys s
  LEFT JOIN counts c ON c.theme_id = s.id
  LEFT JOIN top3 t ON t.theme_id = s.id;
$$;

REVOKE EXECUTE ON FUNCTION public.system_theme_list() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.system_theme_list() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_theme_list() TO service_role;

COMMIT;
