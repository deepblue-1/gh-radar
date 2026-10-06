-- ============================================================
-- Phase 29 Plan 09 Task 1 — 게이트웨이 키 in-place 개명 (D-12 · ADMIN-01).
--   'KB'    → 'KB120'
--   'KYOBO' → 'KYOBO119'
--
-- **배포 창 전용 — 옛 relay 정지 뒤에만.** 옛 relay 가 돌고 있으면 개명 직후 기록기가 `KB` 커서를 다시 만들어
-- (`dma_journal_apply('KB', …)` upsert) `KB` 와 `KB120` 이력이 갈라진다(RESEARCH Pitfall 1). 그래서 이 파일은
-- `supabase/migrations/` 가 아니라 `supabase/deploy-window/29/` 에 있다 — 다른 세션의 `supabase db push` 가
-- 옛 relay 가 도는 중에 이 개명을 싣지 못한다. 29-25 런북이 배포 창(옛 relay 정지 → 이 파일 → 새 relay)에서
-- 새 버전 번호로 `supabase/migrations/` 에 옮겨 push 한다.
--
-- 롤백 = `supabase/rollback/29-gateway-key-rename-revert.sql`(수동 · 역개명 + 옛 가시성 뷰 + 기본값 'KB').
--
-- KYOBO 의 127 시절 epoch 행(09-29~10-06)도 119 epoch 행과 함께 전부 KYOBO119 로 묶인다(RESEARCH Pitfall 2).
-- KYOBO127 활성화 전 커서 시드 절차(79 epoch 확인 → 옛 epoch 와 같으면 dma_journal_cursor('KYOBO127', …) 시드)는
-- relay README(29-24)가 정본이다.
--
-- 대상 7개 표(전부 text 열 gateway) — 마이그레이션 함수 본문에는 'KB'/'KYOBO' 리터럴이 없다(시드 데이터뿐):
--   dma_journal_events(PK gateway, journal_epoch, seq) · dma_account_orders(유니크 2개에 gateway) ·
--   dma_account_access(PK gateway, dma_user_id, account_no) · dma_journal_cursor(PK gateway · 전략 커서 열 포함) ·
--   dma_strategy_events(PK gateway, journal_epoch, seq) · dma_credentials(gateway 기본값) ·
--   dma_gateway_identities(PK user_id, gateway)
--
-- 한 트랜잭션: 새 키 행이 이미 있어 PK · 유니크가 겹치면 트랜잭션 전체가 실패한다(부분 적용 없음).
-- lock_timeout 5s: 잠금을 못 얻으면 기다리지 않고 실패한다 — 옛 relay 가 아직 쓰고 있다는 신호다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ① 커서 먼저 — 저널 이어 받기의 기준(epoch · last_seq · 전략 커서 열은 그대로).
UPDATE public.dma_journal_cursor     SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_journal_cursor     SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

-- ② 저널 원문 · 투영 · 매핑 · 전략 이벤트.
UPDATE public.dma_journal_events     SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_journal_events     SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

UPDATE public.dma_account_orders     SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_account_orders     SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

UPDATE public.dma_account_access     SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_account_access     SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

UPDATE public.dma_strategy_events    SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_strategy_events    SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

-- ③ 가시성 신원 원천(옛 뷰 · 롤백 경로가 다시 읽는다).
UPDATE public.dma_credentials        SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_credentials        SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

UPDATE public.dma_gateway_identities SET gateway = 'KB120' WHERE gateway = 'KB';
UPDATE public.dma_gateway_identities SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';

ALTER TABLE public.dma_credentials ALTER COLUMN gateway SET DEFAULT 'KB120';

COMMIT;
