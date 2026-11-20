-- ============================================================
-- Phase 44 Plan 01 — 어드민 정산 DB 받침 pgTAP.
--
-- 대상: <VERSION>_settlement.sql(이 phase 첫 마이그레이션 · 44-01 T3) — 표 5(settlement_accounts · settlement_budget_reads ·
--       settlement_settles · settlement_ledger · settlement_ledger_history) + RPC admin_settlement_raw() ·
--       settlement_record_reads(jsonb) + 내부 함수 settlement_ledger_json(settlement_ledger).
--
-- 잠그는 것:
--   S. 모양 — 표 5 · 함수 3 · 거래 줄 종류별 모양 CHECK(출자 = who + to_acc / 수익 출금 · 원금 회수 = who + from_acc /
--      계좌 옮김 = who 없음 · from ≠ to · via) · 금액 0 이하 · 메모 101자 · 계좌 키 다섯째 값 · (D-07) 다섯째 종류 → 23514 ·
--      (D-29) 출자 · 원금 회수 + 심쥬니 + 현중 · 근형 묶음 계좌 → 23514 · 같은 조합의 kbH 는 통과
--   R. 조회 — 빈 표에서 다섯 키 모두 배열 · links 는 dma_user_id 오름차순 · servers 는 sort_order, server_key 순 + isOrder ·
--      계좌는 kbG · kyH · kyG · kbH 순 · 지운 줄은 ledger 에서 빠짐(id 오름차순) · 취소한 정산은 settles 에서 빠짐(id 내림차순)
--   K. 키 집합(shared `SettlementRaw` 와 글자 그대로) — 최상위 · accounts · links · servers · registry · reads · ledger(17) ·
--      settles(9) · settlement_ledger_json(17) 를 jsonb_object_keys 집합 단언으로 · 목록은 모든 항목의 키 수도 같다
--   W. 읽은 값 기록 — 두 번 부르면 계좌당 1행(upsert) · 마지막 값 · 시각 · 0 도 그대로 · 배열이 아니면 22023
--   P. 권한 — 표 5 RLS 켜짐 · anon · authenticated SELECT 불가 · service_role 가능 · 함수 3 anon · authenticated EXECUTE 불가 ·
--      service_role 가능 · RPC 2 SECURITY DEFINER · 함수 3 search_path 고정
--   (44-03 이 L · D · C · X 절을 이 파일에 이어 쓴다.)
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 계좌번호는 가짜 값(99xxx)이다 — 실제 번호를 쓰지 않는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(104);

-- S. 모양 ──────────────────────────────────────────────────────────
SELECT has_table('public', 'settlement_accounts', 'S1 표 settlement_accounts');
SELECT has_table('public', 'settlement_budget_reads', 'S2 표 settlement_budget_reads');
SELECT has_table('public', 'settlement_settles', 'S3 표 settlement_settles');
SELECT has_table('public', 'settlement_ledger', 'S4 표 settlement_ledger');
SELECT has_table('public', 'settlement_ledger_history', 'S5 표 settlement_ledger_history');
SELECT has_function('public', 'admin_settlement_raw', ARRAY[]::text[], 'S6 admin_settlement_raw()');
SELECT has_function('public', 'settlement_record_reads', ARRAY['jsonb'], 'S7 settlement_record_reads(jsonb)');
SELECT has_function('public', 'settlement_ledger_json', ARRAY['settlement_ledger'], 'S8 settlement_ledger_json(settlement_ledger)');
SELECT has_column('public', 'settlement_ledger', 'deleted_at', 'S9 지움 표시 열 deleted_at(D-21)');
SELECT has_column('public', 'settlement_settles', 'cancelled_at', 'S10 정산 취소 열 cancelled_at(D-21)');

-- 다른 테스트 · 시드가 남긴 행이 있어도 이 파일은 빈 표에서 시작한다(트랜잭션 끝 ROLLBACK).
DELETE FROM public.settlement_ledger_history;
DELETE FROM public.settlement_ledger;
DELETE FROM public.settlement_settles;
DELETE FROM public.settlement_budget_reads;
DELETE FROM public.settlement_accounts;

-- 거래 줄 모양 CHECK — 23514.
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'H', 'kyH', 'kbG', 1)$$, '23514', NULL,
                 'S11 출자에 from_acc → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'H', 1)$$, '23514', NULL,
                 'S12 출자에 to_acc 없음 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, to_acc, via, amount_krw)
                   VALUES ('2026-11-01', 'contribute', NULL, 'kbG', 'transfer', 1)$$, '23514', NULL,
                 'S13 출자에 who 없음 · via → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'withdraw_profit', 'G', 'kyH', 'kbG', 1)$$, '23514', NULL,
                 'S14 수익 출금에 to_acc → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, via, amount_krw)
                   VALUES ('2026-11-01', 'withdraw_principal', 'G', 'kyH', 'transfer', 1)$$, '23514', NULL,
                 'S15 원금 회수에 via → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, amount_krw)
                   VALUES ('2026-11-01', 'withdraw_profit', 'kyH', 1)$$, '23514', NULL,
                 'S16 수익 출금에 who 없음 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, to_acc, via, amount_krw)
                   VALUES ('2026-11-01', 'move', 'H', 'kbG', 'kyH', 'transfer', 1)$$, '23514', NULL,
                 'S17 계좌 옮김에 who → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, to_acc, via, amount_krw)
                   VALUES ('2026-11-01', 'move', 'kbG', 'kbG', 'transfer', 1)$$, '23514', NULL,
                 'S18 계좌 옮김 from = to → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'move', 'kbG', 'kyH', 1)$$, '23514', NULL,
                 'S19 계좌 옮김에 via 없음 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'H', 'kbG', 0)$$, '23514', NULL,
                 'S20 금액 0 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw, memo)
                   VALUES ('2026-11-01', 'contribute', 'H', 'kbG', 1, repeat('가', 101))$$, '23514', NULL,
                 'S21 메모 101자 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'H', 'kbX', 1)$$, '23514', NULL,
                 'S22 계좌 키 다섯째 값 → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'adjust', 'H', 'kbG', 1)$$, '23514', NULL,
                 'S23 (D-07) 다섯째 종류(손익 보정 · 공동 비용 같은 것) → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'J', 'kbG', 1)$$, '23514', NULL,
                 'S24 (D-29) 심쥬니 출자 → kbG → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                   VALUES ('2026-11-01', 'contribute', 'J', 'kyG', 1)$$, '23514', NULL,
                 'S25 (D-29) 심쥬니 출자 → kyG → 23514');
SELECT throws_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, amount_krw)
                   VALUES ('2026-11-01', 'withdraw_principal', 'J', 'kyH', 1)$$, '23514', NULL,
                 'S26 (D-29) 심쥬니 원금 회수 ← kyH → 23514');
SELECT lives_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw)
                  VALUES ('2026-09-10', 'contribute', 'J', 'kbH', 100000000)$$,
                'S27 (D-29) 심쥬니 출자 → kbH 통과');
SELECT lives_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, amount_krw)
                  VALUES ('2026-11-02', 'withdraw_principal', 'J', 'kbH', 10000)$$,
                'S28 (D-29) 심쥬니 원금 회수 ← kbH 통과');
SELECT lives_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, who, from_acc, amount_krw)
                  VALUES ('2026-11-02', 'withdraw_profit', 'J', 'kbG', 10000)$$,
                'S29 수익 출금은 D-29 대상 밖(심쥬니 · kbG 통과)');
SELECT lives_ok($$INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, to_acc, via, amount_krw)
                  VALUES ('2026-08-10', 'move', 'kbG', 'kyH', 'corp_service', 300000000)$$,
                'S30 계좌 옮김(법인 용역) 통과');
DELETE FROM public.settlement_ledger;

-- R. 조회 ──────────────────────────────────────────────────────────
SELECT is((SELECT array_agg(k ORDER BY k)
             FROM unnest(ARRAY['accounts', 'reads', 'ledger', 'settles']) k
            WHERE jsonb_typeof(public.admin_settlement_raw() -> k) = 'array'
              AND jsonb_array_length(public.admin_settlement_raw() -> k) = 0),
          ARRAY['accounts', 'ledger', 'reads', 'settles'],
          'R1 빈 표 → accounts · reads · ledger · settles 는 빈 배열(coalesce)');
SELECT is(jsonb_typeof(public.admin_settlement_raw() -> 'registry'), 'array', 'R2 registry 는 배열');

-- 픽스처 — 서버 3 · DMA 사용자 2(zz1 을 먼저 넣는다 — 정렬은 넣은 순서가 아니라 id 순) · 계좌 4 · 연결 · 등록 서버.
INSERT INTO public.dma_servers (key, broker, host, port, enabled, is_order_server, is_quote_primary, sort_order) VALUES
  ('KB91',    'KB',    '10.0.0.91', 9100, true, false, false, -1),
  ('KB92',    'KB',    '10.0.0.92', 9100, true, false, false, -2),
  ('KYOBO91', 'KYOBO', '10.0.0.93', 9100, true, false, false, -3);
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('zz1', 'x'), ('aa1', 'x');
INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id) VALUES
  ('KB',    '99001', '정근형KB', '00001', '000001'),
  ('KB',    '99002', '김현중KB', '00001', '000001'),
  ('KYOBO', '99003', '김현중교보', '', ''),
  ('KYOBO', '99004', '정근형교보', '', '');
INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id) VALUES
  ('zz1', 'KB',    '99001', '', '00001', '000001'),
  ('aa1', 'KB',    '99001', '', '00001', '000001'),
  ('aa1', 'KYOBO', '99003', '', '', '');
INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key, state, is_order) VALUES
  ('aa1', 'KB',    '99001', 'KB91',    'active', true),
  ('aa1', 'KB',    '99001', 'KB92',    'active', false),
  ('zz1', 'KB',    '99001', 'KB91',    'removing', false),
  ('aa1', 'KYOBO', '99003', 'KYOBO91', 'active', false);
SELECT throws_ok($$INSERT INTO public.settlement_accounts (acc_key, broker, account_no) VALUES ('kbG', 'KB', '99009')$$,
                 '23503', NULL, 'R3 계좌 마스터에 없는 계좌번호 → FK 23503');
INSERT INTO public.settlement_accounts (acc_key, broker, account_no) VALUES
  ('kbH', 'KB',    '99002'),
  ('kyG', 'KYOBO', '99004'),
  ('kyH', 'KYOBO', '99003'),
  ('kbG', 'KB',    '99001');

SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.accounts[*].accKey'),
          '["kbG", "kyH", "kyG", "kbH"]'::jsonb, 'R4 계좌 순서 kbG · kyH · kyG · kbH');
SELECT is(public.admin_settlement_raw() -> 'accounts' -> 0 -> 'name', '"정근형KB"'::jsonb, 'R5 name 은 계좌 마스터 값');
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.accounts[0].links[*].dmaUserId'),
          '["aa1", "zz1"]'::jsonb, 'R6 links 는 dma_user_id 오름차순');
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.accounts[0].links[0].servers[*].serverKey'),
          '["KB92", "KB91"]'::jsonb, 'R7 servers 는 sort_order, server_key 순');
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.accounts[0].links[0].servers[*].isOrder'),
          '[false, true]'::jsonb, 'R8 servers 에 isOrder(dma_account_servers.is_order)');
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.accounts[0].links[1].servers[*].state'),
          '["removing"]'::jsonb, 'R9 removing 행도 싣는다(판정은 shared)');
SELECT is(public.admin_settlement_raw() -> 'accounts' -> 3 -> 'links',
          '[]'::jsonb, 'R10 연결 없는 계좌 links = []');
SELECT ok((SELECT (SELECT n FROM jsonb_array_elements(public.admin_settlement_raw() -> 'registry') WITH ORDINALITY AS e(v, n)
                    WHERE v ->> 'key' = 'KB92')
                < (SELECT n FROM jsonb_array_elements(public.admin_settlement_raw() -> 'registry') WITH ORDINALITY AS e(v, n)
                    WHERE v ->> 'key' = 'KB91')),
          'R11 registry 는 sort_order 순');

-- 거래 3줄 · 가운데 줄 지움 표시 → ledger 는 1 · 3 번째만 · id 오름차순.
INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw, seeded) VALUES
  ('2025-12-31', 'contribute', 'H', 'kbG', 400000000, true);
INSERT INTO public.settlement_ledger (tx_date, kind, who, to_acc, amount_krw) VALUES
  ('2025-12-31', 'contribute', 'G', 'kbG', 400000000);
INSERT INTO public.settlement_ledger (tx_date, kind, from_acc, to_acc, via, amount_krw, memo, created_by) VALUES
  ('2026-11-01', 'move', 'kbG', 'kyG', 'transfer', 20000000, '메모', 'admin@example.invalid');
UPDATE public.settlement_ledger SET deleted_at = now(), deleted_by = 'admin@example.invalid', deleted_reason = 'delete'
 WHERE id = (SELECT min(id) + 1 FROM public.settlement_ledger);
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.ledger[*].id'),
          (SELECT jsonb_agg(id ORDER BY id) FROM public.settlement_ledger WHERE deleted_at IS NULL),
          'R12 지운 줄은 빠지고 id 오름차순');
SELECT is(jsonb_array_length(public.admin_settlement_raw() -> 'ledger'), 2, 'R13 ledger 2줄');
SELECT is(public.admin_settlement_raw() -> 'ledger' -> 1 ->> 'txDate', '2026-11-01', 'R14 txDate 는 YYYY-MM-DD');
SELECT is(public.admin_settlement_raw() -> 'ledger' -> 1 -> 'amountKrw', '20000000'::jsonb, 'R15 amountKrw 는 숫자');
SELECT is(public.admin_settlement_raw() -> 'ledger' -> 0 -> 'pend', '{}'::jsonb, 'R16 pend 기본 {}');

-- 정산 3건 · 가운데 취소 → settles 는 3 · 1 번째 · id 내림차순.
INSERT INTO public.settlement_settles (pool, profit_krw, shares, snapshot, read_at, created_by) VALUES
  ('p1', 1000, '{"H": 500, "G": 500}', '{"accounts": [], "cumKrw": 1000, "prevKrw": 0}', now(), 'admin@example.invalid'),
  ('p1', 2000, '{"H": 1000, "G": 1000}', '{"accounts": [], "cumKrw": 3000, "prevKrw": 1000}', now(), 'admin@example.invalid'),
  ('p2', 3000, '{"J": 1200, "H": 900, "G": 900}', '{"accounts": [], "cumKrw": 3000, "prevKrw": 0}', now(), 'admin@example.invalid');
UPDATE public.settlement_settles SET cancelled_at = now(), cancelled_by = 'admin@example.invalid'
 WHERE id = (SELECT min(id) + 1 FROM public.settlement_settles);
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.settles[*].id'),
          (SELECT jsonb_agg(id ORDER BY id DESC) FROM public.settlement_settles WHERE cancelled_at IS NULL),
          'R17 취소한 정산은 빠지고 id 내림차순');
SELECT is(jsonb_array_length(public.admin_settlement_raw() -> 'settles'), 2, 'R18 settles 2건');
SELECT throws_ok($$INSERT INTO public.settlement_settles (pool, profit_krw, shares, snapshot, read_at, created_by)
                   VALUES ('p1', 0, '{}', '{}', now(), 'x')$$, '23514', NULL, 'R19 정산 수익 0 이하 → 23514');

-- W. 읽은 값 기록 ───────────────────────────────────────────────────
SELECT lives_ok($$SELECT public.settlement_record_reads(
                   '[{"accKey": "kyH", "budgetKrw": 680000000, "source": "live", "serverKey": "KYOBO91", "readAt": "2026-11-19T10:58:00Z"}]'::jsonb)$$,
                'W1 첫 기록');
SELECT lives_ok($$SELECT public.settlement_record_reads(
                   '[{"accKey": "kyH", "budgetKrw": 690000000, "source": "snapshot", "serverKey": null, "readAt": "2026-11-20T05:32:00Z"},
                     {"accKey": "kbG", "budgetKrw": 0, "source": "snapshot", "serverKey": "KB91", "readAt": "2026-11-20T05:32:00Z"}]'::jsonb)$$,
                'W2 두 번째 기록(덮어쓰기 + 새 계좌)');
SELECT is((SELECT count(*)::int FROM public.settlement_budget_reads WHERE acc_key = 'kyH'), 1, 'W3 계좌당 1행(upsert)');
SELECT is((SELECT (budget_krw, source, server_key, read_at)::text FROM public.settlement_budget_reads WHERE acc_key = 'kyH'),
          (690000000::bigint, 'snapshot'::text, NULL::text, '2026-11-20T05:32:00Z'::timestamptz)::text,
          'W4 마지막 값 · 출처 · 서버 · 시각');
SELECT is((SELECT budget_krw FROM public.settlement_budget_reads WHERE acc_key = 'kbG'), 0::bigint, 'W5 0 도 그대로 저장');
SELECT throws_ok($$SELECT public.settlement_record_reads('{"accKey": "kyH"}'::jsonb)$$, '22023', NULL,
                 'W6 배열이 아니면 22023');
SELECT is(jsonb_path_query_array(public.admin_settlement_raw(), '$.reads[*].accKey'),
          '["kbG", "kyH"]'::jsonb, 'W7 조회 reads 에 실린다');
SELECT is(public.admin_settlement_raw() -> 'reads' -> 1 -> 'serverKey', 'null'::jsonb, 'W8 serverKey null 그대로');

-- K. 키 집합(shared SettlementRaw 와 글자 그대로) ───────────────────
SELECT set_eq($$SELECT jsonb_object_keys(public.admin_settlement_raw())$$,
              ARRAY['accounts', 'registry', 'reads', 'ledger', 'settles'], 'K1 최상위 다섯 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') e$$,
              ARRAY['accKey', 'broker', 'accountNo', 'name', 'links'], 'K2 accounts 항목 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(l)
                  FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') a,
                       jsonb_array_elements(a -> 'links') l$$,
              ARRAY['dmaUserId', 'servers'], 'K3 links 항목 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(s)
                  FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') a,
                       jsonb_array_elements(a -> 'links') l,
                       jsonb_array_elements(l -> 'servers') s$$,
              ARRAY['serverKey', 'state', 'isOrder'], 'K4 servers 항목 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(public.admin_settlement_raw() -> 'registry') e$$,
              ARRAY['key', 'broker', 'enabled', 'isOrderServer'], 'K5 registry 항목 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(public.admin_settlement_raw() -> 'reads') e$$,
              ARRAY['accKey', 'budgetKrw', 'source', 'serverKey', 'readAt'], 'K6 reads 항목 키');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(public.admin_settlement_raw() -> 'ledger') e$$,
              ARRAY['id', 'txDate', 'kind', 'who', 'fromAcc', 'toAcc', 'via', 'amountKrw', 'memo', 'settleId', 'reflect',
                    'pend', 'seeded', 'createdBy', 'createdAt', 'editedBy', 'editedAt'], 'K7 ledger 항목 키(17)');
SELECT set_eq($$SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(public.admin_settlement_raw() -> 'settles') e$$,
              ARRAY['id', 'pool', 'profitKrw', 'shares', 'snapshot', 'readAt', 'memo', 'createdBy', 'createdAt'],
              'K8 settles 항목 키(9)');
SELECT set_eq($$SELECT jsonb_object_keys(public.settlement_ledger_json(l))
                  FROM public.settlement_ledger l WHERE l.id = (SELECT min(id) FROM public.settlement_ledger)$$,
              ARRAY['id', 'txDate', 'kind', 'who', 'fromAcc', 'toAcc', 'via', 'amountKrw', 'memo', 'settleId', 'reflect',
                    'pend', 'seeded', 'createdBy', 'createdAt', 'editedBy', 'editedAt'],
              'K9 settlement_ledger_json 키(17) — 조회 ledger 와 같은 한 벌');
-- 합집합만 보면 한 항목에서 빠진 키를 못 잡는다 — 모든 항목의 키 수가 같아야 한다.
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(e)) = 5)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') e), 'K10 accounts 모든 항목 5키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(l)) = 2)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') a, jsonb_array_elements(a -> 'links') l),
          'K11 links 모든 항목 2키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(s)) = 3)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'accounts') a, jsonb_array_elements(a -> 'links') l,
                  jsonb_array_elements(l -> 'servers') s), 'K12 servers 모든 항목 3키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(e)) = 4)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'registry') e), 'K13 registry 모든 항목 4키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(e)) = 5)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'reads') e), 'K14 reads 모든 항목 5키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(e)) = 17)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'ledger') e), 'K15 ledger 모든 항목 17키');
SELECT ok((SELECT bool_and((SELECT count(*) FROM jsonb_object_keys(e)) = 9)
             FROM jsonb_array_elements(public.admin_settlement_raw() -> 'settles') e), 'K16 settles 모든 항목 9키');

-- P. 권한 · 함수 속성 ───────────────────────────────────────────────
SELECT is(has_table_privilege(r.role, t.tbl, 'SELECT'), r.expect,
          format('P %s SELECT %s = %s', r.role, t.tbl, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 CROSS JOIN (VALUES ('public.settlement_accounts'), ('public.settlement_budget_reads'), ('public.settlement_settles'),
                    ('public.settlement_ledger'), ('public.settlement_ledger_history')) AS t(tbl)
 ORDER BY t.tbl, r.role;
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = t.tbl::regclass), format('P %s RLS 활성', t.tbl))
  FROM (VALUES ('public.settlement_accounts'), ('public.settlement_budget_reads'), ('public.settlement_settles'),
               ('public.settlement_ledger'), ('public.settlement_ledger_history')) AS t(tbl)
 ORDER BY t.tbl;
SELECT is(has_function_privilege(r.role, f.sig, 'EXECUTE'), r.expect,
          format('P %s EXECUTE %s = %s', r.role, f.sig, r.expect))
  FROM (VALUES ('anon', false), ('authenticated', false), ('service_role', true)) AS r(role, expect)
 CROSS JOIN (VALUES ('public.admin_settlement_raw()'), ('public.settlement_record_reads(jsonb)'),
                    ('public.settlement_ledger_json(public.settlement_ledger)')) AS f(sig)
 ORDER BY f.sig, r.role;
SELECT ok((SELECT bool_and(prosecdef) FROM pg_proc
            WHERE oid IN ('public.admin_settlement_raw()'::regprocedure, 'public.settlement_record_reads(jsonb)'::regprocedure)),
          'P 조회 RPC 2 SECURITY DEFINER');
SELECT ok((SELECT bool_and('search_path=public, pg_temp' = ANY (proconfig)) FROM pg_proc
            WHERE oid IN ('public.admin_settlement_raw()'::regprocedure, 'public.settlement_record_reads(jsonb)'::regprocedure,
                          'public.settlement_ledger_json(public.settlement_ledger)'::regprocedure)),
          'P 함수 3 search_path 고정');

SELECT * FROM finish();
ROLLBACK;
