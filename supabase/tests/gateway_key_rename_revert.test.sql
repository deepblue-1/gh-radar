-- ============================================================
-- Phase 29 Plan 09 Task 2 — 개명 ↔ 역개명 왕복 pgTAP (D-12 롤백 · ADMIN-01).
--
-- 실행(순서 그대로 — 개명 직전 버전까지 재생 → 옛 키 픽스처 → 개명 → 가시성 v2 → 롤백 역개명 → 이 테스트):
--   bash scripts/verify-dma-orders-price-check.sh --until 20261006200300 \
--     --with supabase/tests/fixtures/29_pre_rename.sql \
--     --with supabase/migrations/20261007200000_gateway_key_rename.sql \
--     --with supabase/migrations/20261007200100_dma_visibility_v2.sql \
--     --with supabase/rollback/29-gateway-key-rename-revert.sql \
--     --test supabase/tests/gateway_key_rename_revert.test.sql
-- (29-26 배포 뒤: 개명 · v2 는 migrations 에 있다 — --until 로 끊고 같은 파일을 --with 로 순서대로 건다.)
-- — 일회용 로컬 컨테이너에서만 돈다(공유 · 원격 DB 접촉 0). 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다.
--
-- 잠그는 것(왕복 = 픽스처 상태와 같다):
--   - 7개 표 (KB, KYOBO, KB120 + KYOBO119) 행 수 = (픽스처 KB, 픽스처 KYOBO, 0) · 새 키 KB121 대조군 행은 남는다
--   - 커서 epoch · last_seq · 전략 커서 열 · 투영 행 값이 개명 전과 같다 · dma_credentials.gateway 기본값 'KB'
--   - 뷰가 옛 의미(자격증명 신원 ∪ 다른 게이트웨이 연결 신원)로 돌아왔다 — 픽스처 사용자에게 KB · KYOBO 신원 각 1 ·
--     본문이 dma_credentials 를 읽고 접근 맵 함수는 읽지 않는다 · 권한 3줄
--   - 옛 relay 가 'KB' 커서에서 이어 받는다 — dma_journal_apply('KB', e29-kb, seq 6) applied 1
--
-- 단언 설명에는 (표 또는 seq, 게이트웨이, 기대) 튜플을 적는다. 기대 행 수 표는 픽스처 머리 주석이 정본이다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- 표별 (KB, KYOBO, 새 키 KB120/KYOBO119 잔존) 행 수.
CREATE FUNCTION pg_temp.counts(p_table text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format(
    'SELECT row(count(*) FILTER (WHERE gateway = %L), count(*) FILTER (WHERE gateway = %L), '
    || 'count(*) FILTER (WHERE gateway IN (%L, %L)))::text FROM public.%I',
    'KB', 'KYOBO', 'KB120', 'KYOBO119', p_table) INTO r;
  RETURN r;
END;
$$;

SELECT plan(21);

-- ── 1. 7개 표 — (KB, KYOBO, KB120/KYOBO119 잔존) = (픽스처 KB, 픽스처 KYOBO, 0) ─────────
SELECT is(pg_temp.counts('dma_journal_cursor'),     '(1,1,0)', '(dma_journal_cursor, KB/KYOBO/새 키) = (1,1,0)');
SELECT is(pg_temp.counts('dma_journal_events'),     '(5,3,0)', '(dma_journal_events, KB/KYOBO/새 키) = (5,3,0)');
SELECT is(pg_temp.counts('dma_account_orders'),     '(2,1,0)', '(dma_account_orders, KB/KYOBO/새 키) = (2,1,0)');
SELECT is(pg_temp.counts('dma_account_access'),     '(1,1,0)', '(dma_account_access, KB/KYOBO/새 키) = (1,1,0)');
SELECT is(pg_temp.counts('dma_strategy_events'),    '(2,0,0)', '(dma_strategy_events, KB/KYOBO/새 키) = (2,0,0)');
SELECT is(pg_temp.counts('dma_credentials'),        '(1,0,0)', '(dma_credentials, KB/KYOBO/새 키) = (1,0,0)');
SELECT is(pg_temp.counts('dma_gateway_identities'), '(0,1,0)', '(dma_gateway_identities, KB/KYOBO/새 키) = (0,1,0)');

SELECT is(
  (SELECT string_agg(gateway || ':' || dma_user_id || ':' || account_no, ',') FROM public.dma_account_access WHERE gateway = 'KB121'),
  'KB121:d29kb:2900000021', '(dma_account_access, KB121 대조군 …0021) 남는다 — 롤백은 새 키 행을 지우지도 바꾸지도 않는다'
);

-- ── 2. 값 보존 — 커서 · 투영 · 자격증명 ──────────────────────────
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB'),
  '(e29-kb,5,e29-kb-s,2)', '(커서, KB) = (e29-kb, 5, e29-kb-s, 2) — 왕복 뒤 개명 전과 같다'
);
SELECT is(
  (SELECT row(journal_epoch, last_seq, strategy_journal_epoch, strategy_last_seq)::text
     FROM public.dma_journal_cursor WHERE gateway = 'KYOBO'),
  '(e29-ky,3,,0)', '(커서, KYOBO) = (e29-ky, 3, NULL, 0) — 왕복 뒤 개명 전과 같다'
);
SELECT is(
  (SELECT string_agg(order_no || ':' || filled_qty || ':' || status || ':' || last_seq, ',' ORDER BY order_no)
     FROM public.dma_account_orders WHERE gateway = 'KB'),
  '0000290001:10:filled:3,0000290002:3:partially_filled:5',
  '(투영, KB) (주문, filled_qty, status, last_seq) — 왕복 뒤 개명 전과 같다'
);
SELECT is(
  (SELECT row(gateway, dma_user_id)::text FROM public.dma_credentials WHERE user_id = '00000000-0000-4000-8000-000000002901'),
  '(KB,d29kb)', '(자격증명, rename29-u1) = (KB, d29kb)'
);
SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dma_credentials' AND column_name = 'gateway'),
  '''KB''::text', '(dma_credentials.gateway 기본값) = ''KB'' — 되돌아왔다'
);

-- ── 3. 뷰 — 옛 의미로 복원 ─────────────────────────────────────
SELECT is(
  (SELECT string_agg(gateway || ':' || dma_user_id, ',' ORDER BY gateway)
     FROM public.dma_visibility_identities WHERE user_id = '00000000-0000-4000-8000-000000002901'),
  'KB:d29kb,KYOBO:d29ky', '(rename29-u1, 신원) = KB:d29kb · KYOBO:d29ky 각 1 — 자격증명 신원 + 연결 신원'
);
SELECT is(
  (SELECT string_agg(gateway || ':' || account_no, ',' ORDER BY gateway)
     FROM public.dma_visible_accounts('00000000-0000-4000-8000-000000002901')),
  'KB:2900000001,KYOBO:2900000011', '(rename29-u1, 가시 계좌) = KB …0001 · KYOBO …0011 — KB121 대조군 …0021 은 옛 뷰에서 안 보인다'
);
SELECT ok(
  pg_get_viewdef('public.dma_visibility_identities'::regclass) LIKE '%dma_credentials%'
  AND pg_get_viewdef('public.dma_visibility_identities'::regclass) NOT LIKE '%dma_app_access_map%',
  '(뷰 본문) dma_credentials 를 읽고 dma_app_access_map 을 읽지 않는다 — 20260929190000 본문'
);
SELECT is(
  (SELECT reloptions::text FROM pg_class WHERE oid = 'public.dma_visibility_identities'::regclass),
  '{security_invoker=true}', '(뷰 옵션) security_invoker = true 유지'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.dma_visibility_identities', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.dma_visibility_identities', 'SELECT'),
  '(뷰 권한, anon · authenticated) SELECT 없음'
);
SELECT ok(
  has_table_privilege('service_role', 'public.dma_visibility_identities', 'SELECT'),
  '(뷰 권한, service_role) SELECT 있음'
);

-- ── 4. 옛 relay 이어 받기 — 'KB' 커서에서 seq 6 ─────────────────────
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, (r->>'last_seq')::bigint)::text
     FROM (SELECT public.dma_journal_apply('KB', 'e29-kb', jsonb_build_array(jsonb_build_object(
       'seq', 6, 'trade_date', '2026-10-06',
       'gw_time_ms', (extract(epoch FROM '2026-10-06 09:00:06+09'::timestamptz) * 1000)::bigint,
       'dma_user_id', 'd29kb', 'account_no', '2900000001', 'isin', 'KR7005930003', 'side', 'B',
       'side_trusted', true, 'order_no', '0000290002', 'org_order_no', '', 'notice_type', 'E',
       'request_kind', 'New', 'requester', 'Manual', 'origin', 'Manual', 'exchange', 'KRX', 'board', '',
       'order_price', 1000, 'order_qty', 10, 'exec_price', 1000, 'exec_qty', 7, 'result_code', 0,
       'message', '', 'local_reject', false))) AS r) x),
  '(1,0,6)', '(seq 6, KB) (applied, skipped, last_seq) = (1, 0, 6) — 역개명 뒤 옛 키 커서에서 이어진다'
);
SELECT is(
  (SELECT string_agg(gateway, ',' ORDER BY gateway) FROM public.dma_journal_cursor),
  'KB,KYOBO', '(커서 키 집합) = KB, KYOBO — KB120 · KYOBO119 잔존 없음'
);

SELECT * FROM finish();

ROLLBACK;
