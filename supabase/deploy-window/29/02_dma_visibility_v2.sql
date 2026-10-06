-- ============================================================
-- Phase 29 Plan 09 Task 2 — 가시성 규칙 뷰 v2: 「허용 표 admin/trader + DMA 연결 × 레지스트리 전 서버 키」 (D-05 · ADMIN-03).
--
-- **배포 창 전용.** 01_gateway_key_rename.sql 바로 뒤에 적용한다(29-25 런북이 새 버전 번호로 `supabase/migrations/`
-- 에 옮겨 push). 개명 전에 적용해도 깨지지는 않지만, 옛 relay 가 `KB`/`KYOBO` 키로 쌓는 행은 레지스트리 키
-- (KB120 · KYOBO119 …)와 맞지 않아 아무에게도 보이지 않는다 — 그래서 개명과 같은 창에서만.
--
-- D-05 「(gateway, dma_user_id) 조인 의미 유지」: 뷰 이름 · 열 (user_id, gateway, dma_user_id) · 타입 · 순서가
--   20260929190000 과 같다 — `CREATE OR REPLACE VIEW` 가 그래서 통과하고, 이 뷰를 읽는 `dma_visible_accounts` ·
--   조회 RPC 3종(dma_journal_orders_for_user[_json] · dma_strategy_events_for_user[_json]) · server `dma-orders.ts` 는
--   무수정이다. 원천만 바뀐다: dma_credentials ∪ dma_gateway_identities → app_users(허용 표) × dma_servers(레지스트리).
--   한 DMA id 는 모든 서버에서 같은 id 다(D-04 · 261006 결정) — 그래서 레지스트리 전 서버 키와 곱한다.
--   꺼진 서버 키도 포함한다: 꺼진 서버의 과거 행이 사라지지 않게(가시성은 기록 조회이고 연결 상태와 무관).
-- D-21 viewer 제외: viewer 는 가시 계좌 0 → 상한가 보고서 · AI 애널리스트의 DMA_UNMAPPED 403 게이트 유지.
--   승인 대기(app_users 행 없음) · DMA 연결 없는 trader 도 0.
--
-- auth.users 는 SECURITY DEFINER 접근 맵 함수 `dma_app_access_map()`(29-01)이 읽는다 — 뷰는 security_invoker 라
--   호출자(service_role) 권한으로 돌고, service_role 은 auth.users 를 직접 읽을 필요가 없다.
--
-- 롤백 = `supabase/rollback/29-gateway-key-rename-revert.sql`(역개명과 함께 20260929190000 뷰 본문을 되살린다).
-- dma_credentials · dma_gateway_identities 표는 건드리지 않는다 — 롤백 경로의 옛 뷰가 다시 읽는다.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.dma_visibility_identities
WITH (security_invoker = true) AS
  SELECT m.user_id, s.key AS gateway, m.dma_user_id
    FROM public.dma_app_access_map() m
    CROSS JOIN public.dma_servers s
   WHERE m.role IN ('admin', 'trader')
     AND m.dma_user_id IS NOT NULL;

REVOKE ALL ON public.dma_visibility_identities FROM PUBLIC;
REVOKE ALL ON public.dma_visibility_identities FROM anon, authenticated;
GRANT SELECT ON public.dma_visibility_identities TO service_role;

COMMIT;
