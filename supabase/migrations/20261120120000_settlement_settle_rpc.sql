-- ============================================================
-- Phase 44 — 어드민 정산 확정 · 취소 RPC 2: settlement_settle_confirm · settlement_settle_cancel.
--
-- 표 · admin_settlement_raw · settlement_ledger_json 은 20261120100000_settlement.sql(44-01), 거래 쓰기 RPC 3 은
-- 20261120110000_settlement_ledger_rpc.sql(44-03 T1)에 있다 — 여기서 다시 만들지 않는다.
--
-- 결정 근거(.planning/phases/44-admin-settlement/44-CONTEXT.md · 44-RESEARCH.md):
--   D-16  정산 확정 = 그 순간의 정산 전 수익으로 몫을 고정하고 바로 출금 줄을 만든다. 수익 · 몫 · 바로 출금 금액 계산은
--         Express 가 shared(settlePlan)로 한다 — 이 RPC 는 넘겨받은 값을 정산 한 행(몫 · 그때 계좌 값 snapshot · 읽은 시각 ·
--         메모 · 적은 사람)과 바로 출금 줄들(withdraw_profit · KST 오늘 · settle_id)로 한 트랜잭션에 넣기만 한다.
--   Pitfall 5  동시 확정 · 동시 취소 — 묶음 단위 advisory xact lock(hashtext('settlement_settle:' || pool)) 안에서 그 묶음
--         최신(취소 안 된) 정산 id 를 p_expect_prev(브라우저가 본 값 · 없으면 NULL)와 대조한다. 다르면 STALE_SETTLE.
--         READ COMMITTED 라 잠금을 얻은 뒤의 SELECT 는 앞서 커밋된 확정을 본다.
--   D-17  정산 취소는 그 묶음의 가장 최근(취소 안 된) 정산만 — 아니면 NOT_LATEST. 취소하면 그때 만든 바로 출금 줄도 함께
--         사라진다(지움 표시). 지운 줄들의 취소 전 행(반영 여부 · pend 포함)을 돌려준다 — 서버의 예수금 되돌리기 계산용.
--   D-21  행을 물리적으로 지우지 않는다 — 취소한 정산은 cancelled_at · cancelled_by, 그 바로 출금 줄은
--         deleted_reason = 'settle_cancel' + settlement_ledger_history(action 'settle_cancel', before = 취소 전 행).
--
-- p_settle 키(shared SettlementSettleRow 의 값 쪽): profitKrw · shares({H|G|J: 원}) · snapshot({accounts, cumKrw, prevKrw}) ·
--   readAt · memo(없으면 ''). p_outs = [{who, fromAcc, amountKrw, reflect, pend}](pend 없으면 {} · 빈 배열이면 바로 출금 없음).
-- 반환: confirm → {settleId, rowIds: [바로 출금 줄 id — p_outs 순서]} · cancel → {rows: [취소 전 바로 출금 줄 17키 — id 순]}.
--
-- 오류 코드(RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'):
--   STALE_SETTLE  그 묶음 최신 정산 id IS DISTINCT FROM p_expect_prev                  (confirm)
--   NO_SUCH_ROW   없는 정산 · 이미 취소한 정산                                          (cancel)
--   NOT_LATEST    그 묶음의 가장 최근(취소 안 된) 정산이 아님                            (cancel)
--   인자 모양 위반 22023 · 수익 0 이하 · 메모 · 바로 출금 줄 모양 CHECK 위반 23514 · NOT NULL 23502 는 원래 코드 그대로.
--
-- 권한: 두 함수 SECURITY DEFINER · search_path 고정 · REVOKE PUBLIC · anon, authenticated 명시 · GRANT service_role.
--
-- 멱등: CREATE OR REPLACE FUNCTION · 권한 줄 · COMMENT 는 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서): DROP FUNCTION public.settlement_settle_cancel(bigint, text) →
--   public.settlement_settle_confirm(text, bigint, jsonb, jsonb, text). 표 · 이력은 건드리지 않는다.
--
-- 원격 적용: 커밋만 — 원격은 44-13 이 `supabase db push` 로 올린다.
-- 이 파일도 커밋 뒤 고치지 않는다 — 다른 세션의 db push 로 이미 원격에 적용됐을 수 있다. 고칠 것이 생기면 새 버전 파일
--   (CREATE OR REPLACE)을 더한다.
--
-- 하지 않는 것: 수익 · 몫 계산 · 예수금 읽기 · 반영(Express) · 정산 행 물리 DELETE · 변경 이력을 보여 주는 RPC.
-- ============================================================

BEGIN;

-- ── ① 정산 확정 — 묶음 잠금 → 기대값 대조 → 정산 1행 + 바로 출금 줄들(한 트랜잭션). ─────────────────
CREATE OR REPLACE FUNCTION public.settlement_settle_confirm(
  p_pool text, p_expect_prev bigint, p_settle jsonb, p_outs jsonb, p_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest bigint;
  v_sid    bigint;
  v_rid    bigint;
  v_ids    bigint[] := '{}';
  v_o      jsonb;
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_pool IS NULL OR p_pool NOT IN ('p1', 'p2') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_pool must be p1 or p2';
  END IF;
  IF p_settle IS NULL OR jsonb_typeof(p_settle) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_settle must be a jsonb object';
  END IF;
  IF p_outs IS NULL OR jsonb_typeof(p_outs) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_outs must be a jsonb array';
  END IF;

  -- Pitfall 5 — 같은 묶음 확정 · 취소를 줄 세운다(트랜잭션 끝에 풀림).
  PERFORM pg_advisory_xact_lock(hashtext('settlement_settle:' || p_pool));

  SELECT s.id INTO v_latest
    FROM public.settlement_settles s
   WHERE s.pool = p_pool AND s.cancelled_at IS NULL
   ORDER BY s.id DESC
   LIMIT 1;
  IF v_latest IS DISTINCT FROM p_expect_prev THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_SETTLE';
  END IF;

  INSERT INTO public.settlement_settles (pool, profit_krw, shares, snapshot, read_at, memo, created_by)
  VALUES (
    p_pool,
    (p_settle ->> 'profitKrw')::bigint,
    p_settle -> 'shares',
    p_settle -> 'snapshot',
    (p_settle ->> 'readAt')::timestamptz,
    coalesce(p_settle ->> 'memo', ''),
    p_by
  )
  RETURNING id INTO v_sid;

  FOR v_o IN SELECT e FROM jsonb_array_elements(p_outs) WITH ORDINALITY AS t(e, n) ORDER BY n LOOP
    IF jsonb_typeof(v_o) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_outs item must be an object';
    END IF;
    INSERT INTO public.settlement_ledger
      (tx_date, kind, who, from_acc, amount_krw, settle_id, reflect, pend, created_by)
    VALUES (
      v_today, 'withdraw_profit',
      v_o ->> 'who', v_o ->> 'fromAcc',
      (v_o ->> 'amountKrw')::bigint,
      v_sid,
      coalesce((v_o ->> 'reflect')::boolean, false),
      coalesce(nullif(v_o -> 'pend', 'null'::jsonb), '{}'::jsonb),
      p_by
    )
    RETURNING id INTO v_rid;
    v_ids := v_ids || v_rid;
  END LOOP;

  RETURN jsonb_build_object('settleId', v_sid, 'rowIds', to_jsonb(v_ids));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_settle_confirm(text, bigint, jsonb, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_settle_confirm(text, bigint, jsonb, jsonb, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_settle_confirm(text, bigint, jsonb, jsonb, text) TO service_role;
COMMENT ON FUNCTION public.settlement_settle_confirm(text, bigint, jsonb, jsonb, text) IS
  'Phase 44 D-16 · Pitfall 5 — 묶음 잠금 안에서 최신 정산 id 대조(STALE_SETTLE) 뒤 정산 1행 + 바로 출금 줄(withdraw_profit · KST 오늘 · settle_id) 한 트랜잭션. 반환 {settleId, rowIds}. service_role 전용.';

-- ── ② 정산 취소 — 최근 것만(NOT_LATEST) · 바로 출금 줄 함께 지움 표시 · 취소 전 줄 반환. ──────────────
CREATE OR REPLACE FUNCTION public.settlement_settle_cancel(p_id bigint, p_by text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pool   text;
  v_s      public.settlement_settles;
  v_latest bigint;
  v_rows   jsonb;
BEGIN
  SELECT s.pool INTO v_pool FROM public.settlement_settles s WHERE s.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ROW';
  END IF;

  -- 확정과 같은 묶음 잠금 — 취소 · 확정이 엇갈려 「최신」 판정이 흔들리지 않게.
  PERFORM pg_advisory_xact_lock(hashtext('settlement_settle:' || v_pool));

  SELECT * INTO v_s FROM public.settlement_settles WHERE id = p_id FOR UPDATE;
  IF v_s.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ROW';
  END IF;

  SELECT s.id INTO v_latest
    FROM public.settlement_settles s
   WHERE s.pool = v_pool AND s.cancelled_at IS NULL
   ORDER BY s.id DESC
   LIMIT 1;
  IF v_latest IS DISTINCT FROM p_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_LATEST';
  END IF;

  UPDATE public.settlement_settles
     SET cancelled_at = now(), cancelled_by = p_by
   WHERE id = p_id;

  -- 그 정산의 지우지 않은 바로 출금 줄 — 잠근 뒤 취소 전 값을 모으고, 이력을 남기고, 지움 표시한다.
  PERFORM 1 FROM public.settlement_ledger l
   WHERE l.settle_id = p_id AND l.deleted_at IS NULL
   ORDER BY l.id
   FOR UPDATE;

  SELECT coalesce(jsonb_agg(public.settlement_ledger_json(l) ORDER BY l.id), '[]'::jsonb) INTO v_rows
    FROM public.settlement_ledger l
   WHERE l.settle_id = p_id AND l.deleted_at IS NULL;

  INSERT INTO public.settlement_ledger_history (ledger_id, action, before, by)
  SELECT l.id, 'settle_cancel', to_jsonb(l), p_by
    FROM public.settlement_ledger l
   WHERE l.settle_id = p_id AND l.deleted_at IS NULL
   ORDER BY l.id;

  UPDATE public.settlement_ledger
     SET deleted_at = now(), deleted_by = p_by, deleted_reason = 'settle_cancel'
   WHERE settle_id = p_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_settle_cancel(bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_settle_cancel(bigint, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_settle_cancel(bigint, text) TO service_role;
COMMENT ON FUNCTION public.settlement_settle_cancel(bigint, text) IS
  'Phase 44 D-17 · D-21 — 그 묶음 최근 정산만 취소(NOT_LATEST · NO_SUCH_ROW) + 바로 출금 줄 settle_cancel 지움 표시 · history. 반환 {rows: 취소 전 17키}. service_role 전용.';

COMMIT;
