-- ============================================================
-- Phase 29 Plan 27 — 운영 점검: 고아 DMA 유저 (읽기 전용).
--
-- 목적: CR-01(29-REVIEW) 수정 전에는 「+ 사용자」(POST /api/admin/users + dma)가 이미 DMA 가 연결된 웹 사용자의 연결을
--   새 DMA id 로 조용히 덮어썼다. 그때 밀려난 옛 DMA 유저는 dma_users · dma_user_accounts · dma_account_servers 와 서버
--   users.toml 에 그대로 남고, 어떤 app_users.dma_user_id 에도 연결되지 않는다. 이 쿼리는 그런 행을 찾는다.
--
-- 실행 위치: 29-41 배포 창에서 **메인 세션**이 `supabase db query --linked` 또는 Supabase 대시보드 SQL 편집기로 돌린다.
--   executor(플랜 실행 에이전트)는 이 쿼리를 원격에 돌리지 않는다.
-- 읽기 전용: SELECT 하나뿐이다 — 아무 행도 쓰거나 지우지 않는다.
--
-- 해석:
--   0행        고아 없음 — 할 일 없음.
--   행이 있음  정리 여부는 사용자가 정한다(이 쿼리는 정리하지 않는다). 그 DMA id 는 Admin 개요에서 편집 · 삭제가 안 되는
--              「서버에만 있음」 행으로만 보인다. 열 의미:
--                dma_user_id        고아 DMA id
--                created_at         dma_users 생성 시각(덮어쓰기 이전 연결 시점의 단서)
--                intent_servers     DB 의도 등록 서버 — `서버키:상태`(active · removing), 키 순
--                reflected_servers  서버 87 이 마지막으로 보고한 그 DMA id 를 가진 서버 키(dma_server_user_accounts), 키 순
-- ============================================================

SELECT
  d.dma_user_id,
  d.created_at,
  coalesce(
    (SELECT array_agg(DISTINCT s.server_key || ':' || s.state ORDER BY s.server_key || ':' || s.state)
       FROM public.dma_account_servers s
      WHERE s.dma_user_id = d.dma_user_id),
    ARRAY[]::text[]
  ) AS intent_servers,
  coalesce(
    (SELECT array_agg(DISTINCT r.server_key ORDER BY r.server_key)
       FROM public.dma_server_user_accounts r
      WHERE r.dma_user_id = d.dma_user_id),
    ARRAY[]::text[]
  ) AS reflected_servers
FROM public.dma_users d
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_users a WHERE a.dma_user_id = d.dma_user_id
)
ORDER BY d.created_at, d.dma_user_id;
