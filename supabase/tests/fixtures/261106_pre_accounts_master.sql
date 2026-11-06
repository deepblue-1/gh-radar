-- ============================================================
-- quick 261106-lwu — 계좌 마스터 백필 전 픽스처. 마이그레이션 20261106300000 이전(--until 20261106200000) 모양의
-- 연결 행을 일회용 컨테이너에 만든다. 러너 `--with` 로만 쓴다(마이그레이션 재생 뒤 · 마스터 마이그레이션 전).
-- 테스트와 달리 COMMIT 한다 — 다음 `--with`(마스터 마이그레이션)가 이 행들 위에서 백필해야 하기 때문이다.
--   bash scripts/verify-dma-orders-price-check.sh --until 20261106200000 \
--     --with supabase/tests/fixtures/261106_pre_accounts_master.sql \
--     --with supabase/migrations/20261106300000_dma_accounts_master.sql \
--     --with supabase/migrations/20261106300000_dma_accounts_master.sql \
--     --test supabase/tests/dma_accounts_master.test.sql
--
-- 마스터 표(dma_accounts)를 참조하지 않는다 — 이 시점엔 없다. 서버는 시드(KB120 · KB121 · KYOBO119 · KYOBO127) 그대로.
-- 계좌 · id · 이메일은 전부 가짜 값이다.
--
-- 행(단언의 기준 — 바꾸면 dma_accounts_master.test.sql 의 기대값도 같이):
--   연결 행 4개 → 마스터 3행
--   A  KB    8800000001  lw1 「A옛」 00001/000001 (2026-11-01) · lw2 「A새」 00002/000002 (2026-11-03) → 마스터 = lw2 값
--   B  KB    8800000002  lw1 「B」   00003/000003
--   C  KYOBO 8800000003  lw3 「C」
--   등록 서버: lw1·A KB120 active · KB121 removing / lw2·A KB120 removing 만 / lw1·B KB120 active / lw3·C KYOBO119 active
--   app_users: lw1 ← a@ · b@(같은 DMA id 공유) / lw2 ← c@ / lw3 없음
-- ============================================================

BEGIN;

INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES
  ('lw1', 'enc-lw1'),
  ('lw2', 'enc-lw2'),
  ('lw3', 'enc-lw3');

INSERT INTO public.app_users (email, role, dma_user_id) VALUES
  ('lwu-b@example.invalid', 'trader', 'lw1'),
  ('lwu-a@example.invalid', 'trader', 'lw1'),
  ('lwu-c@example.invalid', 'trader', 'lw2');

INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority, updated_at) VALUES
  ('lw1', 'KB',    '8800000001', 'A옛', '00001', '000001', 1, '2026-11-01T00:00:00Z'),
  ('lw2', 'KB',    '8800000001', 'A새', '00002', '000002', 5, '2026-11-03T00:00:00Z'),
  ('lw1', 'KB',    '8800000002', 'B',   '00003', '000003', 2, '2026-11-02T00:00:00Z'),
  ('lw3', 'KYOBO', '8800000003', 'C',   '',      '',      0, '2026-11-02T00:00:00Z');

INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key, state) VALUES
  ('lw1', 'KB',    '8800000001', 'KB120',    'active'),
  ('lw1', 'KB',    '8800000001', 'KB121',    'removing'),
  ('lw2', 'KB',    '8800000001', 'KB120',    'removing'),
  ('lw1', 'KB',    '8800000002', 'KB120',    'active'),
  ('lw3', 'KYOBO', '8800000003', 'KYOBO119', 'active');

COMMIT;
