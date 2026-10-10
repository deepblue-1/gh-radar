-- ============================================================
-- Phase 29 Plan 09 — 옛 키(KB · KYOBO) 픽스처. 개명 전 운영 DB 의 모양을 일회용 컨테이너에 만든다.
--
-- 러너 `--with` 로만 쓴다(마이그레이션 재생 뒤 · 테스트 전). 테스트와 달리 COMMIT 한다 — 다음 `--with`
-- (배포 창 개명 SQL)가 이 행들 위에서 돌아야 하기 때문이다. 컨테이너는 러너가 지우므로 남지 않는다.
--   bash scripts/verify-dma-orders-price-check.sh --until 20261006200300 \
--     --with supabase/tests/fixtures/29_pre_rename.sql \
--     --with supabase/migrations/20261007200000_gateway_key_rename.sql \
--     --test supabase/tests/gateway_key_rename.test.sql
--
-- 계좌 · id · 주문번호는 전부 가짜 값이다. 이벤트 JSON 모양은 dma_journal_apply.test.sql 의 pg_temp.ev 와 같다
-- (relay 기록기 계약 23키). 저널 행 · 주문 투영 · 커서는 실제 경로(dma_journal_apply)로 만든다.
--
-- 행 수(단언의 기준 — 바꾸면 gateway_key_rename*.test.sql 의 기대값도 같이):
--   표                       KB   KYOBO
--   dma_journal_cursor        1    1      KB (e29-kb, 5 · 전략 e29-kb-s, 2) / KYOBO (e29-ky, 3 · 전략 NULL, 0)
--   dma_journal_events        5    3
--   dma_account_orders        2    1
--   dma_account_access        1    1
--   dma_strategy_events       2    0
--   dma_credentials           1    0      gateway 생략 → 기본값 'KB'
--   dma_gateway_identities    0    1      (KYOBO, d29ky)
-- 대조군: dma_account_access 에 새 키 KB121 행 1개(d29kb …0021) — 개명도 역개명도 건드리지 않아야 한다
--   (롤백은 새 키 행을 남긴다 · 개명은 옛 키만 바꾼다).
-- ============================================================

BEGIN;

-- 이벤트 1건 — 기본값(거래일 2026-10-06 · 매수 · New · 1000원 × 10주 · 접수 A) 위에 p_over 를 덮는다.
CREATE FUNCTION pg_temp.ev29(p_seq bigint, p_hms text, p_over jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', '2026-10-06',
    'gw_time_ms', (extract(epoch FROM ('2026-10-06 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'd29kb',
    'account_no', '2900000001',
    'isin', 'KR7005930003',
    'side', 'B',
    'side_trusted', true,
    'order_no', '',
    'org_order_no', '',
    'notice_type', 'A',
    'request_kind', 'New',
    'requester', 'Manual',
    'origin', 'Manual',
    'exchange', 'KRX',
    'board', '',
    'order_price', 1000,
    'order_qty', 10,
    'exec_price', 0,
    'exec_qty', 0,
    'result_code', 0,
    'message', '',
    'local_reject', false
  ) || p_over
$$;

-- ── 사용자 · 자격증명(gateway 생략 = 기본값 'KB') · KYOBO 신원 연결 ─────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000002901', 'rename29-u1@example.invalid');

INSERT INTO public.dma_credentials (user_id, dma_user_id, dma_password_enc) VALUES
  ('00000000-0000-4000-8000-000000002901', 'd29kb', 'test-enc-29');

INSERT INTO public.dma_gateway_identities (user_id, gateway, dma_user_id) VALUES
  ('00000000-0000-4000-8000-000000002901', 'KYOBO', 'd29ky');

-- ── 매핑 스냅샷 ─────────────────────────────────────────────────
INSERT INTO public.dma_account_access (gateway, dma_user_id, account_no, account_name, priority) VALUES
  ('KB',    'd29kb', '2900000001', '위탁', 1),
  ('KYOBO', 'd29ky', '2900000011', '위탁', 1),
  ('KB121', 'd29kb', '2900000021', '위탁', 2);   -- 대조군(새 키)

-- ── KB 저널 e29-kb seq 1~5 — 주문 2건(0000290001 전량 체결 · 0000290002 부분 체결) ──
SELECT public.dma_journal_apply('KB', 'e29-kb', jsonb_build_array(
  pg_temp.ev29(1, '09:00:01', '{"order_no":"0000290001","message":"접수"}'),
  pg_temp.ev29(2, '09:00:02', '{"order_no":"0000290001","notice_type":"E","exec_qty":4,"exec_price":1000}'),
  pg_temp.ev29(3, '09:00:03', '{"order_no":"0000290001","notice_type":"E","exec_qty":6,"exec_price":1000}'),
  pg_temp.ev29(4, '09:00:04', '{"order_no":"0000290002","message":"접수"}'),
  pg_temp.ev29(5, '09:00:05', '{"order_no":"0000290002","notice_type":"E","exec_qty":3,"exec_price":1000}')
));

-- ── KYOBO 저널 e29-ky seq 1~3 — 주문 1건(0000290101 부분 체결) ──
SELECT public.dma_journal_apply('KYOBO', 'e29-ky', jsonb_build_array(
  pg_temp.ev29(1, '09:10:01', '{"dma_user_id":"d29ky","account_no":"2900000011","order_no":"0000290101","message":"접수"}'),
  pg_temp.ev29(2, '09:10:02', '{"dma_user_id":"d29ky","account_no":"2900000011","order_no":"0000290101","notice_type":"E","exec_qty":2,"exec_price":1000}'),
  pg_temp.ev29(3, '09:10:03', '{"dma_user_id":"d29ky","account_no":"2900000011","order_no":"0000290101","notice_type":"E","exec_qty":3,"exec_price":1000}')
));

-- ── KB 전략 스트림 e29-kb-s seq 1~2 + 전략 커서 ───────────────────
INSERT INTO public.dma_strategy_events (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin,
                                        dma_user_id, account_no, order_no, price, qty)
VALUES
  ('KB', 'e29-kb-s', 1, '2026-10-06', 1791248401000, 2, 'KRX', 'KR7005930003', '', '', '', 1300, 0),
  ('KB', 'e29-kb-s', 2, '2026-10-06', 1791248402000, 3, 'KRX', 'KR7005930003', 'd29kb', '2900000001', '0000290001', 1000, 10);

UPDATE public.dma_journal_cursor
   SET strategy_journal_epoch = 'e29-kb-s', strategy_last_seq = 2
 WHERE gateway = 'KB';

COMMIT;
