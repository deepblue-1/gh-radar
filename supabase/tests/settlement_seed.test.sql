-- ============================================================
-- Phase 44 Plan 04 — 정산 시드(D-14) pgTAP.
--
-- 대상: 20261120130000_settlement_seed.sql — 함수 public.settlement_seed(p_accounts jsonb) RETURNS jsonb
--       (계좌 대응 4행 + 시드 9건 · 없는 계좌 SETTLEMENT_ACCOUNT_MISSING · 멱등) + 빈 계좌 마스터면 건너뛰는 호출(DO 블록).
--
-- 잠그는 것:
--   M8. 기본 재생(빈 dma_accounts)에서 시드 마이그레이션이 실패하지 않고 seeded 행 0 — 테스트 맨 처음, DELETE 전에 본다
--   M1. 계좌 마스터에 3계좌만 → 4계좌로 부르면 SETTLEMENT_ACCOUNT_MISSING:<빠진 키>(P0001) · 아무것도 들어가지 않음
--   M2. 4계좌 다 있음 → {accounts: 4, seeded: 9} · 계좌 대응 4행 · 9건(날짜 · 종류 · 사람 · 계좌 · 경로 · 금액 · 메모 · id 순서) ·
--       전부 reflect false · pend '{}' · seeded true · created_by NULL
--   M3. 같은 호출 두 번째 → {accounts: 0, seeded: 0} · 표 그대로 4행 · 9행
--   M4. 계좌 대응 없이('[]') → 거래 9건만 · settlement_accounts 0행 · 지운 시드 줄이 있어도 다시 넣지 않음
--   M5. 9건으로 계산한 넣은 돈(들어온 돈 − 나간 돈) = kbG −2.2억 · kyH 7억 · kyG 2,000만 · kbH 4억(shared 검산 픽스처와 같은 값)
--   M6. 계좌 키 4값 밖 · 증권사가 키와 안 맞음 · 배열 아님 · 항목 모양 · 같은 키 두 번 → 22023
--   M7. 권한 — anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY DEFINER · search_path 고정
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement_seed.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 계좌번호는 가짜 값(991xx)이다 — 실제 번호를 쓰지 않는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(27);

-- M8. 재생이 시드를 건너뛰었다는 증거 — 다른 무엇보다 먼저(DELETE 전에) 본다. ──────────────
SELECT has_function('public', 'settlement_seed', ARRAY['jsonb'], 'M8 함수 settlement_seed(jsonb) 있음');
SELECT is((SELECT count(*) FROM public.settlement_ledger WHERE seeded), 0::bigint,
          'M8 빈 계좌 마스터 재생 → 시드 마이그레이션이 건너뜀(seeded 행 0)');

-- 이 파일은 빈 표에서 시작한다(트랜잭션 끝 ROLLBACK).
DELETE FROM public.settlement_ledger_history;
DELETE FROM public.settlement_ledger;
DELETE FROM public.settlement_settles;
DELETE FROM public.settlement_budget_reads;
DELETE FROM public.settlement_accounts;

-- 가짜 계좌 4개 중 3개만 계좌 마스터에 — kbH(KB 99104)가 빠졌다.
INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id) VALUES
  ('KB',    '99101', '정근형KB',   '00001', '000001'),
  ('KYOBO', '99102', '김현중교보', '', ''),
  ('KYOBO', '99103', '정근형교보', '', '');

CREATE TEMP TABLE t44s_in ON COMMIT DROP AS
SELECT '[{"accKey": "kbG", "broker": "KB",    "accountNo": "99101"},
         {"accKey": "kyH", "broker": "KYOBO", "accountNo": "99102"},
         {"accKey": "kyG", "broker": "KYOBO", "accountNo": "99103"},
         {"accKey": "kbH", "broker": "KB",    "accountNo": "99104"}]'::jsonb AS a;

-- M1. 없는 계좌 → 멈춤 · 아무것도 들어가지 않음 ─────────────────────────
SELECT throws_ok($$SELECT public.settlement_seed((SELECT a FROM t44s_in))$$,
                 'P0001', 'SETTLEMENT_ACCOUNT_MISSING:kbH',
                 'M1 계좌 마스터에 없는 kbH → SETTLEMENT_ACCOUNT_MISSING:kbH');
SELECT is((SELECT count(*) FROM public.settlement_accounts), 0::bigint, 'M1 실패 뒤 계좌 대응 0행(앞 세 계좌도 안 들어감)');
SELECT is((SELECT count(*) FROM public.settlement_ledger), 0::bigint, 'M1 실패 뒤 거래 0행');

-- M2. 4계좌 다 있음 → 대응 4행 + 9건 ─────────────────────────────────
INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id) VALUES
  ('KB', '99104', '김현중KB', '00001', '000001');

SELECT is(public.settlement_seed((SELECT a FROM t44s_in)), '{"accounts": 4, "seeded": 9}'::jsonb,
          'M2 첫 호출 반환 {accounts: 4, seeded: 9}');
SELECT results_eq(
  $$SELECT acc_key, broker, account_no FROM public.settlement_accounts
     ORDER BY array_position(ARRAY['kbG','kyH','kyG','kbH'], acc_key)$$,
  $$VALUES ('kbG', 'KB', '99101'), ('kyH', 'KYOBO', '99102'), ('kyG', 'KYOBO', '99103'), ('kbH', 'KB', '99104')$$,
  'M2 계좌 대응 4행 = 받은 (증권사, 계좌번호) 그대로');
SELECT results_eq(
  $$SELECT to_char(tx_date, 'YYYY-MM-DD'), kind, who, from_acc, to_acc, via, amount_krw, memo
      FROM public.settlement_ledger ORDER BY id$$,
  $$VALUES ('2025-12-31', 'contribute', 'H'::text, NULL::text, 'kbG'::text, NULL::text, 400000000::bigint, ''),
           ('2025-12-31', 'contribute', 'G',       NULL,       'kbG',       NULL,       400000000,         ''),
           ('2026-08-10', 'move',       NULL,      'kbG',      'kyH',       'corp_service', 300000000,     ''),
           ('2026-09-10', 'contribute', 'J',       NULL,       'kbH',       NULL,       100000000,         ''),
           ('2026-09-10', 'move',       NULL,      'kbG',      'kbH',       'transfer', 100000000,         '쥬니 묶음 원금'),
           ('2026-09-13', 'move',       NULL,      'kbG',      'kbH',       'transfer', 100000000,         '쥬니 묶음 원금'),
           ('2026-09-13', 'move',       NULL,      'kbG',      'kyH',       'transfer', 400000000,         ''),
           ('2026-09-18', 'move',       NULL,      'kbG',      'kbH',       'transfer', 100000000,         '쥬니 묶음 원금'),
           ('2026-11-01', 'move',       NULL,      'kbG',      'kyG',       'transfer', 20000000,          '')$$,
  'M2 시드 9건 = 목업 LEDGER 원문(날짜 · 종류 · 사람 · 계좌 · 경로 · 원 단위 금액 · 메모 · id 순서)');
SELECT ok((SELECT count(*) = 9
                  AND bool_and(NOT reflect AND pend = '{}'::jsonb AND seeded AND created_by IS NULL
                               AND settle_id IS NULL AND deleted_at IS NULL AND edited_at IS NULL)
             FROM public.settlement_ledger),
          'M2 9건 모두 reflect false · pend {} · seeded true · created_by NULL(예수금 안 건드림)');

-- M3. 두 번째 호출 → 아무것도 더하지 않음 ─────────────────────────────
SELECT is(public.settlement_seed((SELECT a FROM t44s_in)), '{"accounts": 0, "seeded": 0}'::jsonb,
          'M3 두 번째 호출 반환 {accounts: 0, seeded: 0}');
SELECT is((SELECT count(*) FROM public.settlement_accounts), 4::bigint, 'M3 계좌 대응 그대로 4행');
SELECT is((SELECT count(*) FROM public.settlement_ledger), 9::bigint, 'M3 거래 그대로 9행');

-- M4. 계좌 대응 없이 → 거래 9건만 ─────────────────────────────────────
DELETE FROM public.settlement_ledger;
DELETE FROM public.settlement_accounts;
SELECT is(public.settlement_seed('[]'::jsonb), '{"accounts": 0, "seeded": 9}'::jsonb,
          'M4 settlement_seed([]) 반환 {accounts: 0, seeded: 9}');
SELECT is((SELECT count(*) FROM public.settlement_accounts), 0::bigint, 'M4 계좌 대응 0행');
SELECT is((SELECT count(*) FROM public.settlement_ledger WHERE seeded), 9::bigint, 'M4 시드 거래 9행');

-- M5. 넣은 돈 검산(들어온 돈 − 나간 돈) ─────────────────────────────
SELECT results_eq(
  $$SELECT k.acc,
           (coalesce((SELECT sum(l.amount_krw) FROM public.settlement_ledger l WHERE l.seeded AND l.to_acc = k.acc), 0)
          - coalesce((SELECT sum(l.amount_krw) FROM public.settlement_ledger l WHERE l.seeded AND l.from_acc = k.acc), 0))::bigint
      FROM unnest(ARRAY['kbG','kyH','kyG','kbH']) WITH ORDINALITY AS k(acc, n)
     ORDER BY k.n$$,
  $$VALUES ('kbG', -220000000::bigint), ('kyH', 700000000), ('kyG', 20000000), ('kbH', 400000000)$$,
  'M5 넣은 돈 kbG −2.2억 · kyH 7억 · kyG 2,000만 · kbH 4억');

-- M4(이어서). 시드 줄 하나를 지워도(지움 표시) 시드를 다시 넣지 않는다 — seeded 행은 지운 줄까지 센다.
UPDATE public.settlement_ledger SET deleted_at = now(), deleted_by = 'admin@example.invalid', deleted_reason = 'delete'
 WHERE id = (SELECT min(id) FROM public.settlement_ledger);
SELECT is(public.settlement_seed('[]'::jsonb), '{"accounts": 0, "seeded": 0}'::jsonb,
          'M4 지운 시드 줄이 있어도 다시 넣지 않음 {accounts: 0, seeded: 0}');

-- M6. 인자 모양 위반 → 22023 ────────────────────────────────────────
SELECT throws_ok($$SELECT public.settlement_seed('[{"accKey": "kbX", "broker": "KB", "accountNo": "99101"}]'::jsonb)$$,
                 '22023', NULL, 'M6 계좌 키가 4값 밖 → 22023');
SELECT throws_ok($$SELECT public.settlement_seed('[{"accKey": "kbG", "broker": "KYOBO", "accountNo": "99102"}]'::jsonb)$$,
                 '22023', NULL, 'M6 kbG 에 KYOBO(증권사가 키와 안 맞음) → 22023');
SELECT throws_ok($$SELECT public.settlement_seed('{"accKey": "kbG", "broker": "KB", "accountNo": "99101"}'::jsonb)$$,
                 '22023', NULL, 'M6 배열 아님 → 22023');
SELECT throws_ok($$SELECT public.settlement_seed('[{"accKey": "kbG", "broker": "KB"}]'::jsonb)$$,
                 '22023', NULL, 'M6 계좌번호 없음 → 22023');
SELECT throws_ok($$SELECT public.settlement_seed('[{"accKey": "kbG", "broker": "KB", "accountNo": "99101"},
                                                   {"accKey": "kbG", "broker": "KB", "accountNo": "99104"}]'::jsonb)$$,
                 '22023', NULL, 'M6 같은 계좌 키 두 번 → 22023');

-- M7. 권한 · 함수 속성 ──────────────────────────────────────────────
SELECT is(has_function_privilege(r.role, 'public.settlement_seed(jsonb)', 'EXECUTE'), r.expect,
          format('M7 %s EXECUTE settlement_seed(jsonb) = %s', r.role, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 ORDER BY r.role;
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.settlement_seed(jsonb)'::regprocedure),
          'M7 settlement_seed SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc
            WHERE oid = 'public.settlement_seed(jsonb)'::regprocedure),
          'M7 settlement_seed search_path 고정');

SELECT * FROM finish();
ROLLBACK;
