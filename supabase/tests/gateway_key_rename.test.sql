-- ============================================================
-- Phase 29 Plan 09 Task 1 — 게이트웨이 키 in-place 개명 트레이서 pgTAP (D-12 · ADMIN-01 · RESEARCH Pitfall 1).
--
-- 실행(순서 그대로 — 개명 직전 버전까지 재생 → 옛 키 픽스처 → 개명 마이그레이션 → 이 테스트):
--   bash scripts/verify-dma-orders-price-check.sh --until 20261006200300 \
--     --with supabase/tests/fixtures/29_pre_rename.sql \
--     --with supabase/migrations/20261007200000_gateway_key_rename.sql \
--     --test supabase/tests/gateway_key_rename.test.sql
-- (29-26 배포 뒤: 개명은 migrations 로 들어갔다 — 전 재생이면 픽스처가 개명 뒤에 들어가 의미가 없으므로 --until 로 끊는다.)
-- — 일회용 로컬 컨테이너에서만 돈다(공유 · 원격 DB 접촉 0). 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 잠그는 것:
--   - 7개 표 어디에도 'KB' · 'KYOBO' 가 남지 않는다 · 'KB120' · 'KYOBO119' 행 수 = 픽스처 행 수(행 손실 · 중복 0)
--   - 커서 epoch · last_seq · 전략 커서 열 보존 · dma_credentials.gateway 기본값 'KB120'
--   - 개명 뒤 dma_journal_apply('KB120', 같은 epoch, 다음 seq) 가 이어서 적용된다(재생 없음) ·
--     이미 적용된 seq 재적용은 skipped(중복 없음) · 'KB' 커서가 다시 생기지 않는다
--   - 옛 가시성 뷰(v2 전)도 개명된 자격증명 · 연결로 두 계좌를 그대로 본다(개명만 적용된 중간 상태 안전)
--
-- 단언 설명에는 (표 또는 seq, 게이트웨이, 기대) 튜플을 적는다. 기대 행 수 표는 픽스처 머리 주석이 정본이다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE FUNCTION pg_temp.ev29(p_seq bigint, p_hms text, p_over jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', '2026-10-06',
    'gw_time_ms', (extract(epoch FROM ('2026-10-06 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'd29kb', 'account_no', '2900000001', 'isin', 'KR7005930003', 'side', 'B', 'side_trusted', true,
    'order_no', '', 'org_order_no', '', 'notice_type', 'A', 'request_kind', 'New', 'requester', 'Manual',
    'origin', 'Manual', 'exchange', 'KRX', 'board', '', 'order_price', 1000, 'order_qty', 10,
    'exec_price', 0, 'exec_qty', 0, 'result_code', 0, 'message', '', 'local_reject', false
  ) || p_over
$$;

-- 표별 (KB120, KYOBO119, 옛 키) 행 수.
CREATE FUNCTION pg_temp.counts(p_table text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format(
    'SELECT row(count(*) FILTER (WHERE gateway = %L), count(*) FILTER (WHERE gateway = %L), '
    || 'count(*) FILTER (WHERE gateway IN (%L, %L)))::text FROM public.%I',
    'KB120', 'KYOBO119', 'KB', 'KYOBO', p_table) INTO r;
  RETURN r;
END;
$$;

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

SELECT plan(20);

-- ── 1. 7개 표 — (KB120, KYOBO119, 옛 키 잔존) = (픽스처 KB, 픽스처 KYOBO, 0) ─────────
SELECT is(pg_temp.counts('dma_journal_cursor'),     '(1,1,0)', '(dma_journal_cursor, KB120/KYOBO119/옛 키) = (1,1,0)');
SELECT is(pg_temp.counts('dma_journal_events'),     '(5,3,0)', '(dma_journal_events, KB120/KYOBO119/옛 키) = (5,3,0)');
SELECT is(pg_temp.counts('dma_account_orders'),     '(2,1,0)', '(dma_account_orders, KB120/KYOBO119/옛 키) = (2,1,0)');
SELECT is(pg_temp.counts('dma_account_access'),     '(1,1,0)', '(dma_account_access, KB120/KYOBO119/옛 키) = (1,1,0)');
SELECT is(pg_temp.counts('dma_strategy_events'),    '(2,0,0)', '(dma_strategy_events, KB120/KYOBO119/옛 키) = (2,0,0)');
SELECT is(pg_temp.counts('dma_credentials'),        '(1,0,0)', '(dma_credentials, KB120/KYOBO119/옛 키) = (1,0,0)');
SELECT is(pg_temp.counts('dma_gateway_identities'), '(0,1,0)', '(dma_gateway_identities, KB120/KYOBO119/옛 키) = (0,1,0)');

SELECT is(
  (SELECT count(*)::int FROM public.dma_account_access WHERE gateway = 'KB121'),
  1, '(dma_account_access, KB121 대조군 …0021) = 1 — 개명은 옛 키만 바꾼다'
);

-- ── 2. 커서 보존 — epoch · last_seq · 전략 커서 열 ──────────────────
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB120'),
  '(e29-kb,5,e29-kb-s,2)', '(커서, KB120) = (e29-kb, 5, e29-kb-s, 2) — 개명 전 KB 커서 그대로'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text
     FROM public.dma_journal_cursor WHERE gateway = 'KYOBO119'),
  '(e29-ky,3,,0)', '(커서, KYOBO119) = (e29-ky, 3, NULL, 0) — 개명 전 KYOBO 커서 그대로'
);

-- ── 3. 자격증명 기본값 ─────────────────────────────────────────
SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dma_credentials' AND column_name = 'gateway'),
  '''KB120''::text', '(dma_credentials.gateway 기본값) = ''KB120'''
);

-- ── 4. 개명 중간 상태 — 옛 가시성 뷰가 개명된 신원으로 두 계좌를 본다 ─────
SELECT is(
  (SELECT string_agg(gateway || ':' || account_no, ',' ORDER BY gateway)
     FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002901')),
  'KB120:2900000001,KYOBO119:2900000011',
  '(rename29-u1, KB120 …0001 · KYOBO119 …0011, 둘 다 보임) — 옛 뷰 + 개명된 자격증명 · 연결'
);

-- ── 5. 이어 적용 — dma_journal_apply('KB120', e29-kb, seq 6) ───────────
INSERT INTO t_apply SELECT 'next', public.dma_journal_apply('KB120', 'e29-kb', jsonb_build_array(
  pg_temp.ev29(6, '09:00:06', '{"order_no":"0000290002","notice_type":"E","exec_qty":7,"exec_price":1000}')));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, (r->>'last_seq')::bigint)::text FROM t_apply WHERE label = 'next'),
  '(1,0,6)', '(seq 6, KB120) (applied, skipped, last_seq) = (1, 0, 6) — 개명 뒤 같은 epoch 다음 seq 가 이어진다'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB120'),
  '(e29-kb,6,e29-kb-s,2)', '(seq 6, KB120) 커서 = (e29-kb, 6) · 전략 커서 열 불변'
);
SELECT is(
  (SELECT row(filled_qty, status)::text FROM public.dma_account_orders
    WHERE gateway = 'KB120' AND trade_date = '2026-10-06' AND account_no = '2900000001' AND order_no = '0000290002'),
  '(10,filled)', '(seq 6, KB120 …0001 주문 0000290002) (filled_qty, status) = (10, filled) — 개명 전 투영 행 위에 누적'
);

-- ── 6. 재적용 — 이미 적용된 seq 3 은 skipped (중복 없음) ───────────────
INSERT INTO t_apply SELECT 'replay', public.dma_journal_apply('KB120', 'e29-kb', jsonb_build_array(
  pg_temp.ev29(3, '09:00:03', '{"order_no":"0000290001","notice_type":"E","exec_qty":6,"exec_price":1000}')));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, (r->>'last_seq')::bigint)::text FROM t_apply WHERE label = 'replay'),
  '(0,1,6)', '(seq 3 재적용, KB120) (applied, skipped, last_seq) = (0, 1, 6) — 개명 전 적용분을 다시 적용하지 않는다'
);
SELECT is(
  (SELECT row(filled_qty, status)::text FROM public.dma_account_orders
    WHERE gateway = 'KB120' AND trade_date = '2026-10-06' AND account_no = '2900000001' AND order_no = '0000290001'),
  '(10,filled)', '(seq 3 재적용, KB120 주문 0000290001) (filled_qty, status) = (10, filled) — 체결 누적 무증가'
);
SELECT is(pg_temp.counts('dma_journal_events'), '(6,3,0)', '(seq 6 뒤, dma_journal_events) = (6,3,0) — seq 6 하나만 늘었다');
SELECT is(pg_temp.counts('dma_account_orders'), '(2,1,0)', '(seq 6 뒤, dma_account_orders) = (2,1,0) — 투영 행 중복 0');

-- ── 7. 옛 키 커서가 다시 생기지 않는다 (Pitfall 1 경고 신호) ───────────
SELECT is(
  (SELECT string_agg(gateway, ',' ORDER BY gateway) FROM public.dma_journal_cursor),
  'KB120,KYOBO119', '(커서 키 집합) = KB120, KYOBO119 — KB · KYOBO 재생성 없음'
);

SELECT * FROM finish();

ROLLBACK;
