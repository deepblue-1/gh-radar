-- ============================================================
-- Phase 44 — 어드민 정산 거래 쓰기 RPC 3: settlement_ledger_save · settlement_ledger_delete · settlement_set_pend.
--
-- 표 · admin_settlement_raw · settlement_ledger_json 은 20261120100000_settlement.sql(44-01)에 있다 — 여기서 다시 만들지 않는다.
-- 정산 확정 · 취소 RPC 는 다음 버전 파일 `_settlement_settle_rpc.sql` 이다.
--
-- 결정 근거(.planning/phases/44-admin-settlement/44-CONTEXT.md):
--   D-12  거래 날짜는 KST 오늘까지 — 미래 날짜는 FUTURE_DATE. 「오늘」 = (now() AT TIME ZONE 'Asia/Seoul')::date.
--   D-19  거래 고치기 · 지우기가 된다. 정산 확정 때 만든 「바로 출금」 줄(settle_id 있음)은 둘 다 SETTLE_LINKED —
--         정산 취소(settlement_settle_cancel)로만 사라진다.
--   D-20  새 줄은 created_by(적은 사람 이메일 · p_by) · created_at, 고친 줄은 edited_by · edited_at 을 남긴다.
--   D-21  행을 물리적으로 지우지 않는다 — 고치기 전 값은 settlement_ledger_history(action 'edit', before = 옛 행 전체 ·
--         to_jsonb 라 키는 snake_case 열 이름), 지운 줄은 deleted_at · deleted_by · deleted_reason = 'delete' + history 'delete'.
--   D-26  반영(예수금 더하고 빼기) 결과로 못 보낸 계좌별 증감 {deltaKrw, targetKrw, reason} 을 줄마다 pend 에 남긴다 —
--         지운 줄에도 기록한다(지우기 되돌림 반영의 남은 몫 추적).
--   D-29  출자 · 원금 회수의 사람이 그 계좌 묶음 비율에 없으면(심쥬니 J · 현중 · 근형 묶음 계좌 kbG · kyH · kyG)
--         PERSON_NOT_IN_POOL. 표 CHECK settlement_ledger_person_pool(23514)이 뒤를 받친다.
--
-- p_row 키(shared SettlementLedgerBody + pend): txDate('YYYY-MM-DD') · kind · who · fromAcc · toAcc · via · amountKrw ·
--   memo(없으면 '') · reflect(없으면 false) · pend(없거나 null 이면 {} · 객체가 아니면 22023).
-- 반환 ledger 항목은 settlement_ledger_json(17키 · shared SettlementLedgerRow · admin_settlement_raw 의 ledger 와 같은 한 벌).
--
-- 순서(Pattern 2): 서버는 저장(의도 pend = 전 증감) → relay 반영 → settlement_set_pend(남은 것만). 저장이 실패하면
--   relay 를 부르지 않는다. 그래서 저장 RPC 가 날짜 · 사람-묶음 · 정산 줄 규칙을 먼저 쥔다.
--
-- 오류 코드(RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>' — 20261106300000 과 같은 규약):
--   FUTURE_DATE         txDate > KST 오늘                                       (save)
--   PERSON_NOT_IN_POOL  출자 · 원금 회수 + J + kbG · kyH · kyG                    (save — 새로 · 고치기 둘 다)
--   NO_SUCH_ROW         없는 id · 지운 줄(save 고치기 · delete) / 없는 id(set_pend · 지운 줄은 받는다)
--   SETTLE_LINKED       settle_id 있는 줄(save 고치기 · delete)
--   인자 모양 위반 22023 · 종류별 모양 · 금액 · 메모 CHECK 위반 23514 · NOT NULL 23502 는 원래 코드 그대로.
--
-- 권한: 세 함수 SECURITY DEFINER · search_path 고정 · REVOKE PUBLIC · anon, authenticated 명시 · GRANT service_role.
--   화면은 Express(requireAdmin) 를 지나서만 부른다.
--
-- 멱등: CREATE OR REPLACE FUNCTION · 권한 줄 · COMMENT 는 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서): DROP FUNCTION public.settlement_set_pend(jsonb) → public.settlement_ledger_delete(bigint, text) →
--   public.settlement_ledger_save(bigint, jsonb, text). 표 · 이력은 건드리지 않는다.
--
-- 원격 적용: 커밋만 — 원격은 44-13 이 `supabase db push` 로 올린다.
-- 이 파일도 커밋 뒤 고치지 않는다 — 다른 세션의 db push 로 이미 원격에 적용됐을 수 있다. 고칠 것이 생기면 새 버전 파일
--   (CREATE OR REPLACE)을 더한다.
--
-- 하지 않는 것: 변경 이력을 보여 주는 RPC(이력은 DB 에만 · D-21) · 행 물리 DELETE · 수익 · 예수금 계산(shared · Express).
-- ============================================================

BEGIN;

-- ── ① 거래 저장 — p_id NULL 이면 새 줄, 아니면 고치기(history 'edit'). ─────────────────────────
CREATE OR REPLACE FUNCTION public.settlement_ledger_save(p_id bigint, p_row jsonb, p_by text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_kind text;
  v_who  text;
  v_pend jsonb;
  v_old  public.settlement_ledger;
  v_new  public.settlement_ledger;
BEGIN
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_row must be a jsonb object';
  END IF;

  v_date := (p_row ->> 'txDate')::date;
  v_kind := p_row ->> 'kind';
  v_who  := p_row ->> 'who';
  v_pend := coalesce(nullif(p_row -> 'pend', 'null'::jsonb), '{}'::jsonb);
  IF jsonb_typeof(v_pend) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_row.pend must be a jsonb object';
  END IF;

  -- ① D-12 미래 날짜 금지(KST).
  IF v_date > (now() AT TIME ZONE 'Asia/Seoul')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FUTURE_DATE';
  END IF;

  -- ② D-29 사람-묶음 — 출자는 받은 계좌, 원금 회수는 뺀 계좌의 묶음.
  IF v_kind IN ('contribute', 'withdraw_principal') AND v_who = 'J'
     AND (CASE v_kind WHEN 'contribute' THEN p_row ->> 'toAcc' ELSE p_row ->> 'fromAcc' END) IN ('kbG', 'kyH', 'kyG') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PERSON_NOT_IN_POOL';
  END IF;

  IF p_id IS NULL THEN
    -- ③ 새 줄(D-20 created_by).
    INSERT INTO public.settlement_ledger
      (tx_date, kind, who, from_acc, to_acc, via, amount_krw, memo, reflect, pend, created_by)
    VALUES (
      v_date, v_kind, v_who,
      p_row ->> 'fromAcc', p_row ->> 'toAcc', p_row ->> 'via',
      (p_row ->> 'amountKrw')::bigint,
      coalesce(p_row ->> 'memo', ''),
      coalesce((p_row ->> 'reflect')::boolean, false),
      v_pend,
      p_by
    )
    RETURNING * INTO v_new;
  ELSE
    -- ④ 고치기 — 지운 줄 · 정산 바로 출금 줄은 거부(D-19), 고치기 전 행 전체를 history 에(D-21).
    SELECT * INTO v_old FROM public.settlement_ledger WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ROW';
    END IF;
    IF v_old.settle_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SETTLE_LINKED';
    END IF;

    INSERT INTO public.settlement_ledger_history (ledger_id, action, before, by)
    VALUES (p_id, 'edit', to_jsonb(v_old), p_by);

    UPDATE public.settlement_ledger
       SET tx_date    = v_date,
           kind       = v_kind,
           who        = v_who,
           from_acc   = p_row ->> 'fromAcc',
           to_acc     = p_row ->> 'toAcc',
           via        = p_row ->> 'via',
           amount_krw = (p_row ->> 'amountKrw')::bigint,
           memo       = coalesce(p_row ->> 'memo', ''),
           reflect    = coalesce((p_row ->> 'reflect')::boolean, false),
           pend       = v_pend,
           edited_by  = p_by,
           edited_at  = now()
     WHERE id = p_id
    RETURNING * INTO v_new;
  END IF;

  -- ⑤ 모양 CHECK(23514)는 위 INSERT · UPDATE 가 원래 코드 그대로 올린다. ⑥ 17키 반환.
  RETURN public.settlement_ledger_json(v_new);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_save(bigint, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_save(bigint, jsonb, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_ledger_save(bigint, jsonb, text) TO service_role;
COMMENT ON FUNCTION public.settlement_ledger_save(bigint, jsonb, text) IS
  'Phase 44 — 정산 거래 새로 쓰기(p_id NULL) · 고치기(history edit). FUTURE_DATE · PERSON_NOT_IN_POOL · NO_SUCH_ROW · SETTLE_LINKED. 반환 settlement_ledger_json 17키. service_role 전용.';

-- ── ② 거래 지우기 — 지움 표시 + history 'delete'. 반환 = 지우기 전 행(반영 되돌리기 계산용). ───────────
CREATE OR REPLACE FUNCTION public.settlement_ledger_delete(p_id bigint, p_by text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old  public.settlement_ledger;
  v_json jsonb;
BEGIN
  SELECT * INTO v_old FROM public.settlement_ledger WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ROW';
  END IF;
  IF v_old.settle_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SETTLE_LINKED';
  END IF;

  v_json := public.settlement_ledger_json(v_old);

  INSERT INTO public.settlement_ledger_history (ledger_id, action, before, by)
  VALUES (p_id, 'delete', to_jsonb(v_old), p_by);

  UPDATE public.settlement_ledger
     SET deleted_at = now(), deleted_by = p_by, deleted_reason = 'delete'
   WHERE id = p_id;

  RETURN v_json;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_delete(bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_delete(bigint, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_ledger_delete(bigint, text) TO service_role;
COMMENT ON FUNCTION public.settlement_ledger_delete(bigint, text) IS
  'Phase 44 D-19 · D-21 — 정산 거래 지움 표시(물리 삭제 없음) + history delete. NO_SUCH_ROW · SETTLE_LINKED. 반환 = 지우기 전 17키. service_role 전용.';

-- ── ③ 반영 결과 기록(D-26) — [{id, pend}] 를 줄마다 덮어쓴다(지운 줄 포함). ────────────────────
-- 한 항목이라도 없는 id 면 NO_SUCH_ROW 로 호출 전체를 되돌린다. 빈 배열은 아무것도 하지 않는다.
CREATE OR REPLACE FUNCTION public.settlement_set_pend(p_pends jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_e jsonb;
BEGIN
  IF p_pends IS NULL OR jsonb_typeof(p_pends) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_pends must be a jsonb array';
  END IF;

  FOR v_e IN SELECT e FROM jsonb_array_elements(p_pends) AS e LOOP
    IF jsonb_typeof(v_e) <> 'object' OR jsonb_typeof(v_e -> 'pend') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_pends item must be {id, pend: object}';
    END IF;

    UPDATE public.settlement_ledger
       SET pend = v_e -> 'pend'
     WHERE id = (v_e ->> 'id')::bigint;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ROW';
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_set_pend(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_set_pend(jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_set_pend(jsonb) TO service_role;
COMMENT ON FUNCTION public.settlement_set_pend(jsonb) IS
  'Phase 44 D-26 — 정산 거래 줄마다 못 보낸 계좌별 증감 {deltaKrw, targetKrw, reason} 기록(지운 줄 포함). NO_SUCH_ROW · 22023. service_role 전용.';

COMMIT;
