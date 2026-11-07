-- ============================================================
-- quick 261107-moq — 「서버에만 있음」 계좌 연결 · 서버에서 빼기 RPC pgTAP (D-02).
--
-- 잠그는 것:
--   - 트레이서(연결): KB120 의도 계좌가 있는 DMA 유저 + KB121 87 에만 있는 KB 계좌 → p_remove false →
--     {"servers":["KB121"]} · dma_user_accounts 에 87 이름 · 지점 · 트레이더 · priority · KB121 active · dma_accounts 마스터 행
--   - 같은 계좌가 KB120 · KB121 87 둘 다에 있고 값이 다름 → 서버 배열 sort_order 순 · 계좌 값은 KB120(첫 행) 값
--   - 빼기: p_remove true → 원천 서버마다 removing · 꺼진 서버(KYOBO127)는 원천에서 빠진다
--   - 정규화: 87 '00' 접두 · 입력 앞뒤 공백 + 0 접두 → 정규화 키 하나로 맞는다
--   - 거부(P0001): 같은 호출 두 번째 NOT_SERVER_ONLY · 꺼진 서버뿐 · 다른 증권사 · 이미 등록 행(removing 포함)뿐 ·
--     없는 DMA id NO_DMA_USER · 거부 뒤 의도 행 수 불변
--   - CHECK: KB 87 행의 branch 빈 값 → 23514(사전 필터 없음) · 계좌 행 안 생김
--   - 권한: anon · authenticated EXECUTE 없음 · service_role 있음
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_server_only_account.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다(KB121 enabled 변경 포함).
--
-- 단언 설명에는 (대상, 기대) 튜플을 적는다 — `not ok` 줄만 보고도 어느 경우인지 알 수 있어야 한다.
-- 픽스처:
--   so-a@example.invalid  가입 + 허용(trader) → DMA so1(KB 계좌 5100000001 · KB120)
--   87: KB120  so1 5100000001(의도) · 5300000003(값 「KB120값」)
--       KB121  so1 5300000001 · 5300000003(값 「KB121값」) · 005300000002 · 5300000005 · 5300000006 · 5300000009(branch 빈 값)
--       KYOBO119 so1 7300000002 · KYOBO127(꺼짐) so1 7300000001 · 7300000002
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(24);

-- ── 픽스처 ────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, created_at) VALUES
  ('00000000-0000-4000-8000-000000026101', 'so-a@example.invalid', '2026-11-07 09:00:00+09');
INSERT INTO public.app_users (email, role) VALUES ('so-a@example.invalid', 'trader');

-- 픽스처 호출은 DO 블록 안 PERFORM — TAP 출력에 반환값 줄이 섞이지 않게.
DO $fx$ BEGIN
PERFORM public.dma_admin_create_dma_user('so-a@example.invalid', 'so1', 'enc-so1',
  '{"broker":"KB","accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":0}'::jsonb,
  ARRAY['KB120']);

UPDATE public.dma_servers SET enabled = true WHERE key = 'KB121';

PERFORM public.dma_admin_apply_snapshot('KB120', 1, '[
  {"userId":"so1","accounts":[
    {"accountNo":"5100000001","name":"위탁","branchNo":"00001","traderId":"000001","priority":0},
    {"accountNo":"5300000003","name":"KB120값","branchNo":"00031","traderId":"000031","priority":1}]}
]'::jsonb);
PERFORM public.dma_admin_apply_snapshot('KB121', 1, '[
  {"userId":"so1","accounts":[
    {"accountNo":"5300000001","name":"하나","branchNo":"00011","traderId":"000011","priority":3},
    {"accountNo":"5300000003","name":"KB121값","branchNo":"00032","traderId":"000032","priority":9},
    {"accountNo":"005300000002","name":"영붙음","branchNo":"00012","traderId":"000012","priority":0},
    {"accountNo":"5300000005","name":"다섯","branchNo":"00015","traderId":"000015","priority":0},
    {"accountNo":"5300000006","name":"여섯","branchNo":"00016","traderId":"000016","priority":0},
    {"accountNo":"5300000009","name":"깨짐","branchNo":"","traderId":"000019","priority":0}]}
]'::jsonb);
PERFORM public.dma_admin_apply_snapshot('KYOBO119', 1, '[
  {"userId":"so1","accounts":[{"accountNo":"7300000002","name":"교보둘","branchNo":"","traderId":"","priority":2}]}
]'::jsonb);
PERFORM public.dma_admin_apply_snapshot('KYOBO127', 1, '[
  {"userId":"so1","accounts":[
    {"accountNo":"7300000001","name":"교보하나","branchNo":"","traderId":"","priority":0},
    {"accountNo":"7300000002","name":"교보둘127","branchNo":"","traderId":"","priority":5}]}
]'::jsonb);
END $fx$;

-- ── 트레이서: 연결 ───────────────────────────────────────────────────
SELECT is(
  public.dma_admin_adopt_server_only_account('so1', 'KB', '5300000001', false),
  '{"servers":["KB121"]}'::jsonb,
  '(link so1 KB 5300000001, {"servers":["KB121"]})'
);
SELECT is(
  (SELECT name || ':' || branch_no || ':' || trader_id || ':' || priority
     FROM public.dma_user_accounts WHERE dma_user_id = 'so1' AND broker = 'KB' AND account_no = '5300000001'),
  '하나:00011:000011:3', '(link 5300000001 계좌 행, 87 값 그대로)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state || ':' || is_order ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'so1' AND account_no = '5300000001'),
  ARRAY['KB121:active:false'], '(link 5300000001 등록 행, KB121 active · is_order false)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_accounts WHERE broker = 'KB' AND account_no = '5300000001'),
  1, '(link 5300000001, dma_accounts 마스터 행 생김)'
);

-- ── 두 서버 원천 — sort_order 순 · 첫 행 값 ─────────────────────────────
SELECT is(
  public.dma_admin_adopt_server_only_account('so1', 'KB', '5300000003', false),
  '{"servers":["KB120","KB121"]}'::jsonb,
  '(link 5300000003 · KB120 + KB121, sort_order 순 배열)'
);
SELECT is(
  (SELECT name || ':' || branch_no || ':' || priority
     FROM public.dma_user_accounts WHERE dma_user_id = 'so1' AND account_no = '5300000003'),
  'KB120값:00031:1', '(link 5300000003 계좌 값, KB120(첫 행) 값)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'so1' AND account_no = '5300000003'),
  ARRAY['KB120:active','KB121:active'], '(link 5300000003 등록 행, 두 서버 active)'
);

-- ── 빼기 — removing · 꺼진 서버 제외 ──────────────────────────────────
SELECT is(
  public.dma_admin_adopt_server_only_account('so1', 'KYOBO', '7300000002', true),
  '{"servers":["KYOBO119"]}'::jsonb,
  '(remove 7300000002 · KYOBO119 + KYOBO127(꺼짐), KYOBO119 만)'
);
SELECT is(
  (SELECT array_agg(server_key || ':' || state ORDER BY server_key)
     FROM public.dma_account_servers WHERE dma_user_id = 'so1' AND account_no = '7300000002'),
  ARRAY['KYOBO119:removing'], '(remove 7300000002 등록 행, KYOBO119 removing)'
);

-- ── 정규화 ─────────────────────────────────────────────────────────
SELECT is(
  public.dma_admin_adopt_server_only_account('so1', 'KB', '5300000002', false),
  '{"servers":["KB121"]}'::jsonb,
  '(link 5300000002 · 87 원문 005300000002, KB121 로 맞음)'
);
SELECT is(
  (SELECT array_agg(account_no ORDER BY account_no) FROM public.dma_user_accounts
    WHERE dma_user_id = 'so1' AND account_no IN ('5300000002', '005300000002')),
  ARRAY['5300000002'], '(link 5300000002 계좌 키, 정규화값 하나)'
);
SELECT is(
  public.dma_admin_adopt_server_only_account('so1', 'KB', E' 005300000005\t', false),
  '{"servers":["KB121"]}'::jsonb,
  '(link 입력 「 005300000005\t」, KB121 로 맞음)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_account_servers
    WHERE dma_user_id = 'so1' AND account_no = '5300000005' AND server_key = 'KB121'),
  1, '(link 「 005300000005\t」 등록 행 키, 정규화값 5300000005)'
);

-- ── 거부 — 아무 행도 바뀌지 않는다 ──────────────────────────────────
CREATE TEMP TABLE t_cnt AS
  SELECT (SELECT count(*) FROM public.dma_user_accounts) AS accounts,
         (SELECT count(*) FROM public.dma_account_servers) AS servers,
         (SELECT string_agg(account_no || '@' || server_key || ':' || state, ',' ORDER BY account_no, server_key)
            FROM public.dma_account_servers) AS states;

SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('so1', 'KB', '5300000001', false)$$,
  'P0001', 'NOT_SERVER_ONLY', '(link 5300000001 두 번째, NOT_SERVER_ONLY)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('so1', 'KYOBO', '7300000001', false)$$,
  'P0001', 'NOT_SERVER_ONLY', '(link 7300000001 · 원천이 꺼진 KYOBO127 뿐, NOT_SERVER_ONLY)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('so1', 'KYOBO', '5300000006', false)$$,
  'P0001', 'NOT_SERVER_ONLY', '(link 5300000006 · p_broker KYOBO ≠ 원천 KB121, NOT_SERVER_ONLY)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('so1', 'KYOBO', '7300000002', false)$$,
  'P0001', 'NOT_SERVER_ONLY', '(link 7300000002 · KYOBO119 removing 행 이미 있음, NOT_SERVER_ONLY)'
);
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('nouser', 'KB', '5300000006', true)$$,
  'P0001', 'NO_DMA_USER', '(remove 없는 DMA id nouser, NO_DMA_USER)'
);
SELECT is(
  (SELECT row(
     (SELECT count(*) FROM public.dma_user_accounts),
     (SELECT count(*) FROM public.dma_account_servers),
     (SELECT string_agg(account_no || '@' || server_key || ':' || state, ',' ORDER BY account_no, server_key)
        FROM public.dma_account_servers))::text),
  (SELECT row(accounts, servers, states)::text FROM t_cnt),
  '(거부 5건 뒤, 의도 계좌 · 등록 행 수 · 상태 불변)'
);

-- ── CHECK — 사전 필터 없음 · 23514 그대로 ───────────────────────────────
SELECT throws_ok(
  $$SELECT public.dma_admin_adopt_server_only_account('so1', 'KB', '5300000009', false)$$,
  '23514', NULL, '(link 5300000009 · KB branch 빈 87 값, 23514)'
);
SELECT is(
  (SELECT count(*)::int FROM public.dma_user_accounts WHERE dma_user_id = 'so1' AND account_no = '5300000009')
  + (SELECT count(*)::int FROM public.dma_account_servers WHERE dma_user_id = 'so1' AND account_no = '5300000009'),
  0, '(link 5300000009 23514 뒤, 계좌 · 등록 행 없음)'
);

-- ── 권한: anon · authenticated · service_role = 3 ────────────────────────
SELECT is(
  has_function_privilege(r, 'public.dma_admin_adopt_server_only_account(text, text, text, boolean)', 'EXECUTE'),
  r = 'service_role',
  format('(%s, dma_admin_adopt_server_only_account EXECUTE %s)', r, CASE WHEN r = 'service_role' THEN '있음' ELSE '없음' END)
) FROM unnest(ARRAY['anon','authenticated','service_role']) AS r;

SELECT * FROM finish();
ROLLBACK;
