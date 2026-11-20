-- ============================================================
-- Phase 44 Plan 04 — 정산 시드(D-14): 계좌 대응 4행 + 배포 때 미리 넣는 이체 9건.
--
-- 무엇:
--   함수 public.settlement_seed(p_accounts jsonb) RETURNS jsonb {accounts, seeded}
--     ① 계좌 대응(kbG · kyH · kyG · kbH → 계좌 마스터의 (증권사, 계좌번호))을 settlement_accounts 에 넣는다
--        (ON CONFLICT (acc_key) DO NOTHING — 이미 있으면 그대로).
--     ② settlement_ledger 에 seeded 행이 하나도 없을 때만 목업 LEDGER 9건(sketch 033 a-real.html 229 ~ 239행 · 원 단위)을
--        그 순서대로 넣는다 — reflect false · pend {} · seeded true · created_by NULL(화면 「배포 때 미리 넣은 내역」).
--        예수금(매매 서버)은 건드리지 않는다 — relay 호출 0(D-14).
--   맨 아래 DO 블록이 사용자 확인값으로 이 함수를 한 번 부른다.
--
-- 왜 「함수 + 건너뛰는 호출」 인가:
--   pgTAP 러너(scripts/verify-dma-orders-price-check.sh)는 저장소 마이그레이션을 빈 로컬 DB 에 전부 재생한다.
--   「계좌가 없으면 RAISE」 를 그대로 마이그레이션에 두면 빈 DB 에서 모든 pgTAP 이 깨진다. 그래서 규칙(없는 계좌 RAISE ·
--   멱등)은 함수 본문이 쥐고, 호출부는 계좌 마스터(dma_accounts)가 빈 DB 에서만 RAISE NOTICE 로 건너뛴다. 운영 DB 는 계좌가
--   이미 등록돼 있어 빈 경우가 없다. 규칙 자체는 supabase/tests/settlement_seed.test.sql 이 함수를 직접 불러 잠근다.
--
-- 의도된 실패(Pitfall 7 — 계좌번호를 이름으로 추측하지 않는다):
--   운영 DB(dma_accounts 에 행이 있는 DB)에서 아래 네 계좌 중 하나라도 계좌 마스터에 없으면 시드가
--   `SETTLEMENT_ACCOUNT_MISSING:<accKey>`(P0001)로 실패해 `supabase db push` 가 여기서 멈춘다. 마이그레이션마다 자기 트랜잭션이라
--   앞 세 파일(_settlement · _settlement_ledger_rpc · _settlement_settle_rpc)은 적용된 채 남고 이 파일만 롤백된다.
--   처리: 계좌 메뉴에서 그 계좌를 등록한 뒤 다시 push(44-13 T2).
--
-- 계좌번호의 출처: 사용자가 어드민 계좌 메뉴(운영 /admin/accounts · 계좌 4개 · KB 2 · 교보 2)에서 확인해 준 값이다
--   (2026-11-20 · 44-04 T1 답 (가) — 「번호를 저장소의 배포 파일에 적어도 됨」). 메뉴에 보이는 그대로이며 이미 정규화돼 있다
--   (숫자만 · 12자 이하 · 넷 모두 다름). 옛 문서 · 목업 · 계좌 이름으로 추측한 값이 아니다.
--
-- 오류 규약: 업무 오류 `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`(20261106300000 과 같다).
--   인자 모양 위반(배열 아님 · 항목이 객체 아님 · 계좌 키 4값 밖 · 증권사가 키와 안 맞음 · 계좌번호 없음 · 같은 키 · 같은 계좌 두 번)
--   은 22023. 검사를 전부 마친 뒤에야 넣는다 — 실패하면 아무것도 들어가지 않는다.
--
-- 멱등: CREATE OR REPLACE FUNCTION · 계좌 대응 ON CONFLICT DO NOTHING · 시드는 seeded 행(지운 줄 포함)이 0 일 때만.
--   두 번 적용해도 4행 · 9건 그대로.
--
-- 되돌리기(수동): ① DELETE FROM settlement_ledger WHERE seeded(정산 · 이력이 붙은 줄은 먼저 정리) ·
--   필요하면 DELETE FROM settlement_accounts → ② DROP FUNCTION public.settlement_seed(jsonb).
--
-- 원격 적용: 커밋만 — 원격은 44-13 이 `supabase db push` 로 올린다. 버전은 이 phase 의 다른 세 마이그레이션보다 크다(시드는 늘 마지막).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.settlement_seed(p_accounts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acc       jsonb;
  v_key       text;
  v_broker    text;
  v_no        text;
  v_n         integer;
  v_accounts  integer := 0;
  v_seeded    integer := 0;
BEGIN
  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_accounts must be a jsonb array';
  END IF;

  -- ① 검사 먼저 — 하나라도 어긋나면 아무것도 넣지 않는다.
  FOR v_acc IN SELECT e.v FROM jsonb_array_elements(p_accounts) AS e(v) LOOP
    IF jsonb_typeof(v_acc) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_accounts item must be an object';
    END IF;
    v_key    := v_acc ->> 'accKey';
    v_broker := v_acc ->> 'broker';
    v_no     := v_acc ->> 'accountNo';
    IF v_key IS NULL OR v_key NOT IN ('kbG','kyH','kyG','kbH') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'accKey must be one of kbG, kyH, kyG, kbH';
    END IF;
    IF v_broker IS DISTINCT FROM (CASE WHEN v_key IN ('kbG','kbH') THEN 'KB' ELSE 'KYOBO' END) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'broker does not match accKey ' || v_key;
    END IF;
    IF v_no IS NULL OR v_no = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'accountNo is required for ' || v_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.dma_accounts m WHERE m.broker = v_broker AND m.account_no = v_no) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SETTLEMENT_ACCOUNT_MISSING:' || v_key;
    END IF;
  END LOOP;

  IF (SELECT count(*) <> count(DISTINCT e.v ->> 'accKey')
             OR count(*) <> count(DISTINCT (e.v ->> 'broker', e.v ->> 'accountNo'))
        FROM jsonb_array_elements(p_accounts) AS e(v)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_accounts has a duplicate accKey or account';
  END IF;

  -- ② 계좌 대응 — 이미 있는 키는 그대로.
  FOR v_acc IN SELECT e.v FROM jsonb_array_elements(p_accounts) AS e(v) LOOP
    INSERT INTO public.settlement_accounts (acc_key, broker, account_no)
    VALUES (v_acc ->> 'accKey', v_acc ->> 'broker', v_acc ->> 'accountNo')
    ON CONFLICT (acc_key) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_accounts := v_accounts + v_n;
  END LOOP;

  -- ③ 시드 9건 — seeded 행(지운 줄 포함)이 하나도 없을 때만. 같은 날은 id 순서가 화면 순서라 목업 순서 그대로 넣는다.
  IF NOT EXISTS (SELECT 1 FROM public.settlement_ledger WHERE seeded) THEN
    INSERT INTO public.settlement_ledger
      (tx_date, kind, who, from_acc, to_acc, via, amount_krw, memo, reflect, pend, seeded, created_by)
    SELECT s.tx_date, s.kind, s.who, s.from_acc, s.to_acc, s.via, s.amount_krw, s.memo, false, '{}'::jsonb, true, NULL
      FROM (VALUES
        (1, DATE '2025-12-31', 'contribute', 'H',  NULL,  'kbG', NULL,           400000000::bigint, ''),
        (2, DATE '2025-12-31', 'contribute', 'G',  NULL,  'kbG', NULL,           400000000::bigint, ''),
        (3, DATE '2026-08-10', 'move',       NULL, 'kbG', 'kyH', 'corp_service', 300000000::bigint, ''),
        (4, DATE '2026-09-10', 'contribute', 'J',  NULL,  'kbH', NULL,           100000000::bigint, ''),
        (5, DATE '2026-09-10', 'move',       NULL, 'kbG', 'kbH', 'transfer',     100000000::bigint, '쥬니 묶음 원금'),
        (6, DATE '2026-09-13', 'move',       NULL, 'kbG', 'kbH', 'transfer',     100000000::bigint, '쥬니 묶음 원금'),
        (7, DATE '2026-09-13', 'move',       NULL, 'kbG', 'kyH', 'transfer',     400000000::bigint, ''),
        (8, DATE '2026-09-18', 'move',       NULL, 'kbG', 'kbH', 'transfer',     100000000::bigint, '쥬니 묶음 원금'),
        (9, DATE '2026-11-01', 'move',       NULL, 'kbG', 'kyG', 'transfer',      20000000::bigint, '')
      ) AS s(ord, tx_date, kind, who, from_acc, to_acc, via, amount_krw, memo)
     ORDER BY s.ord;
    GET DIAGNOSTICS v_seeded = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('accounts', v_accounts, 'seeded', v_seeded);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_seed(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_seed(jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_seed(jsonb) TO service_role;
COMMENT ON FUNCTION public.settlement_seed(jsonb) IS
  'Phase 44 D-14 — 정산 계좌 대응([{accKey, broker, accountNo}]) + 시드 9건(seeded 행 0 일 때만). 없는 계좌 SETTLEMENT_ACCOUNT_MISSING:<accKey>. service_role 전용.';

-- 호출 — 계좌 마스터가 빈 DB(로컬 일회용 재생)에서는 건너뛴다. 운영에서는 계좌 대응 4행 + 9건(두 번째 적용부터 0 · 0).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_accounts) THEN
    RAISE NOTICE 'settlement_seed: 빈 계좌 마스터 — 정산 시드 건너뜀(로컬 재생)';
  ELSE
    PERFORM public.settlement_seed('[
      {"accKey": "kbG", "broker": "KB",    "accountNo": "37703857101"},
      {"accKey": "kyH", "broker": "KYOBO", "accountNo": "10279758101"},
      {"accKey": "kyG", "broker": "KYOBO", "accountNo": "10083243302"},
      {"accKey": "kbH", "broker": "KB",    "accountNo": "37728502101"}
    ]'::jsonb);
  END IF;
END
$$;

COMMIT;
