-- ============================================================
-- Phase 29 Plan 09 Task 2 — 롤백: 게이트웨이 키 역개명 + 옛 가시성 뷰 + dma_credentials 기본값 'KB' (D-12 · ADMIN-01).
--   'KB120'    → 'KB'
--   'KYOBO119' → 'KYOBO'
--
-- **적용하지 않는 수동 SQL.** 마이그레이션이 아니다 — `supabase/migrations/` 로 옮기지 말 것.
-- 롤백 런북(29-25)에서 **옛 relay 이미지 재배포 전에** 실행한다(새 relay 정지 → 이 파일 → 옛 relay).
-- 옛 relay 는 `KB`/`KYOBO` 커서를 읽으므로, 이 역개명 없이 옛 relay 를 올리면 커서 없는 since 0 재생이 된다.
--
-- 새 키(KB121 · KYOBO127 …)로 쌓인 행은 남긴다 — 옛 relay 가 읽지 않고, 옛 뷰에서는 아무에게도 보이지 않는다.
-- KB120 과 KB 가 둘 다 있으면(새 relay 정지 전에 옛 relay 가 `KB` 커서를 다시 만든 경우) PK 가 겹쳐 트랜잭션 전체가
--   실패한다(부분 적용 없음) — 그때는 새 relay 가 남긴 KB120 커서 행과 옛 KB 행 중 어느 쪽을 살릴지 먼저 판단한다.
-- lock_timeout 5s: 잠금을 못 얻으면 실패한다 — relay 가 아직 쓰고 있다는 신호다.
--
-- 뷰는 20260929190000_dma_gateway_identities.sql ④ 본문 그대로(자격증명 신원 ∪ 다른 게이트웨이 연결 신원) +
-- 권한 3줄. dma_app_access_map() · dma_servers 등 29-01 additive 표는 그대로 둔다(옛 relay 무영향).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.dma_journal_cursor     SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_journal_cursor     SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_journal_events     SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_journal_events     SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_account_orders     SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_account_orders     SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_account_access     SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_account_access     SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_strategy_events    SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_strategy_events    SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_credentials        SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_credentials        SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

UPDATE public.dma_gateway_identities SET gateway = 'KB' WHERE gateway = 'KB120';
UPDATE public.dma_gateway_identities SET gateway = 'KYOBO' WHERE gateway = 'KYOBO119';

ALTER TABLE public.dma_credentials ALTER COLUMN gateway SET DEFAULT 'KB';

-- 옛 규칙 뷰 — 20260929190000 ④ 본문 그대로.
CREATE OR REPLACE VIEW public.dma_visibility_identities
WITH (security_invoker = true) AS
  SELECT c.user_id, c.gateway, c.dma_user_id
    FROM public.dma_credentials c
  UNION ALL
  SELECT l.user_id, l.gateway, l.dma_user_id
    FROM public.dma_gateway_identities l
    JOIN public.dma_credentials c
      ON c.user_id = l.user_id
   WHERE l.gateway <> c.gateway;

REVOKE ALL ON public.dma_visibility_identities FROM PUBLIC;
REVOKE ALL ON public.dma_visibility_identities FROM anon, authenticated;
GRANT SELECT ON public.dma_visibility_identities TO service_role;

COMMIT;
