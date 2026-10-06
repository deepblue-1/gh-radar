-- ============================================================
-- Phase 29 Plan 05 — DMA 의도 변경 RPC (Admin → DB 의도 표).
--
-- 결정 근거:
--   D-05  DB 가 의도, 서버 87 은 반영 상태(29-01 one-way 문 `db-intent`). 이 파일의 RPC 만이 의도 표
--         (dma_users · dma_user_accounts · dma_account_servers · app_users.dma_user_id)를 바꾼다. relay(29-11)가
--         RPC 뒤에 서버별 op 를 보내고, 반영 상태 · 개요 원자료는 20261006200300_dma_admin_reflect.sql.
--   D-15  필드별 즉시 저장 — 요청 하나가 RPC 하나(한 트랜잭션)다. 유저 단위 변경은 dma_users 행을 FOR UPDATE 로
--         잠가 같은 유저의 동시 변경을 줄 세운다(「마지막 계좌」 판정이 경합으로 0 계좌를 만들지 않게).
--   D-23 ⑤ 계좌 제거 · 등록 서버 해제는 행을 지우지 않고 state = 'removing' 으로 둔다. relay 가 op 4 성공(또는
--         code 8) · op 2 성공(또는 code 4)을 확인한 뒤 dma_admin_settle_server 로만 지운다 — 등록 서버 0 이 된
--         계좌는 그때 지운다. 87 에만 있는 계좌는 이 표에 없으므로 어떤 RPC 도 지울 대상이 아니다.
--
-- 오류 규약(Express · relay 가 분기한다): 업무 거부는 `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`.
--   NO_APP_USER            허용 표(app_users)에 그 이메일이 없다
--   DMA_USER_EXISTS        같은 DMA id 가 이미 있다
--   NO_DMA_USER            DMA id 가 없다
--   NO_SUCH_ACCOUNT        그 유저에게 (증권사, 계좌번호) 계좌가 없다
--   LAST_ACCOUNT           그 유저의 마지막 active 계좌 제거 — 유저 삭제로 유도한다(D-15)
--   SERVER_BROKER_MISMATCH 등록 서버의 증권사 ≠ 계좌 증권사(트리거 23514 의 업무 코드판 — 트리거는 그대로 최후 방어)
--   NO_SERVERS             등록 서버 목록이 비었다
--   SERVERS_REMAIN         유저 삭제 요청인데 아직 settle 되지 않은 서버 행이 있다
--   그 밖의 제약 위반(KB branch 5 · trader 6 · 계좌번호 ≤12 CHECK 23514, 없는 서버 키 FK 23503 등)은 원래 코드 그대로
--   올린다 — Express 가 앞단 zod 로 먼저 거른다.
--
-- 계좌번호: 호출자가 shared `normalizeAccountNo` 로 정규화해 넘긴다 — RPC 는 재정규화하지 않는다.
-- p_account jsonb 키(camelCase · shared AdminAccountInput): broker · accountNo · name · branchNo · traderId · priority.
--
-- 권한: 전부 service_role 전용(SECURITY DEFINER · 권한 3줄). 브라우저는 Express(29-10 · 29-13) → relay(29-11)를 거친다.
-- 적용: additive — 29-07 [BLOCKING] 체크포인트에서 원격 적용(29-01 두 파일 · 이 파일 · reflect 파일 4개).
-- 멱등: CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다.
-- 되돌리기(수동): 이 파일의 함수들을 DROP FUNCTION — 표는 29-01 소유라 건드리지 않는다.
-- ============================================================

BEGIN;

-- ── 내부 헬퍼: 등록 서버 목록 정리(NULL · 빈 값 제거 · 중복 제거 · 키 순) ─────────────
-- 빈 결과는 NULL 이 아니라 빈 배열이다.
CREATE OR REPLACE FUNCTION public.dma_admin__server_list(p_servers text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT btrim(k) ORDER BY btrim(k)), ARRAY[]::text[])
    FROM unnest(coalesce(p_servers, ARRAY[]::text[])) AS k
   WHERE k IS NOT NULL AND btrim(k) <> '';
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin__server_list(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin__server_list(text[]) FROM anon, authenticated;

-- ── 내부 헬퍼: 계좌의 등록 서버를 active 로(없으면 넣고, removing 이던 것은 되살린다) ─────
-- 증권사 불일치는 트리거(23514)보다 먼저 여기서 업무 코드 SERVER_BROKER_MISMATCH 로 거부한다.
-- 없는 서버 키는 FK(23503)에 맡긴다. SECURITY DEFINER 인 RPC 안에서만 불리므로 INVOKER 다.
CREATE OR REPLACE FUNCTION public.dma_admin__activate_servers(
  p_dma_user_id text, p_broker text, p_account_no text, p_servers text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bad text;
BEGIN
  SELECT s.key INTO v_bad
    FROM public.dma_servers s
   WHERE s.key = ANY (p_servers) AND s.broker <> p_broker
   ORDER BY s.key
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SERVER_BROKER_MISMATCH',
      DETAIL = format('server %s is not %s', v_bad, p_broker);
  END IF;

  INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key, state, updated_at)
  SELECT p_dma_user_id, p_broker, p_account_no, k, 'active', now()
    FROM unnest(p_servers) AS k
  ON CONFLICT (dma_user_id, broker, account_no, server_key)
    DO UPDATE SET state = 'active', updated_at = now()
    WHERE public.dma_account_servers.state <> 'active';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin__activate_servers(text, text, text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin__activate_servers(text, text, text, text[]) FROM anon, authenticated;

-- ── ① 유저 생성 (D-16 — 허용 유저 연결 + DMA 유저 + 첫 계좌 + 등록 서버 한 트랜잭션) ──────
-- 반환: { dmaUserId }. 서버별 op 1 은 relay 가 이 RPC 뒤에 보낸다.
CREATE OR REPLACE FUNCTION public.dma_admin_create_dma_user(
  p_email text, p_dma_user_id text, p_password_enc text, p_account jsonb, p_servers text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_servers text[] := public.dma_admin__server_list(p_servers);
  v_broker  text := p_account ->> 'broker';
  v_account text := p_account ->> 'accountNo';
BEGIN
  PERFORM 1 FROM public.app_users a WHERE a.email = v_email FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_APP_USER';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DMA_USER_EXISTS';
  END IF;
  IF cardinality(v_servers) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SERVERS';
  END IF;

  BEGIN
    INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES (p_dma_user_id, p_password_enc);
  EXCEPTION WHEN unique_violation THEN
    -- 위 존재 검사와 동시 생성 사이의 경합 — 같은 업무 코드로.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DMA_USER_EXISTS';
  END;

  UPDATE public.app_users
     SET dma_user_id = p_dma_user_id, updated_at = now()
   WHERE email = v_email;

  INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority)
  VALUES (
    p_dma_user_id, v_broker, v_account,
    coalesce(p_account ->> 'name', ''),
    coalesce(p_account ->> 'branchNo', ''),
    coalesce(p_account ->> 'traderId', ''),
    coalesce((p_account ->> 'priority')::integer, 0)
  );

  PERFORM public.dma_admin__activate_servers(p_dma_user_id, v_broker, v_account, v_servers);

  RETURN jsonb_build_object('dmaUserId', p_dma_user_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_create_dma_user(text, text, text, jsonb, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_create_dma_user(text, text, text, jsonb, text[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_create_dma_user(text, text, text, jsonb, text[]) TO service_role;

-- ── ② 비밀번호 교체 (D-08 · D-19 — 암호문 1개 · AAD = dma_user_id, 암호화는 relay) ──────
CREATE OR REPLACE FUNCTION public.dma_admin_set_password(p_dma_user_id text, p_password_enc text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.dma_users
     SET password_enc = p_password_enc, password_set_at = now()
   WHERE dma_user_id = p_dma_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_DMA_USER';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_password(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_password(text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_set_password(text, text) TO service_role;

-- ── ③ 계좌 추가 · 값 변경 · 등록 서버 교체 (D-15 필드별 즉시 저장) ─────────────────
-- 계좌 upsert → p_servers 의 서버는 active(removing 이던 것도 되살린다) → 목록에 없는 기존 active 행은 removing.
-- 반환 { activated: 지금 active 인 등록 서버(= 정리한 p_servers, 키 순), removing: 이 계좌의 removing 행 서버(키 순) }.
-- removing 행은 relay 가 op 4 성공(또는 code 8) 뒤 dma_admin_settle_server 로 지운다.
CREATE OR REPLACE FUNCTION public.dma_admin_put_account(p_dma_user_id text, p_account jsonb, p_servers text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_servers  text[] := public.dma_admin__server_list(p_servers);
  v_broker   text := p_account ->> 'broker';
  v_account  text := p_account ->> 'accountNo';
  v_removing text[];
BEGIN
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_DMA_USER';
  END IF;
  IF cardinality(v_servers) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SERVERS';
  END IF;

  INSERT INTO public.dma_user_accounts AS t
    (dma_user_id, broker, account_no, name, branch_no, trader_id, priority, updated_at)
  VALUES (
    p_dma_user_id, v_broker, v_account,
    coalesce(p_account ->> 'name', ''),
    coalesce(p_account ->> 'branchNo', ''),
    coalesce(p_account ->> 'traderId', ''),
    coalesce((p_account ->> 'priority')::integer, 0),
    now()
  )
  ON CONFLICT (dma_user_id, broker, account_no) DO UPDATE
    SET name = EXCLUDED.name, branch_no = EXCLUDED.branch_no, trader_id = EXCLUDED.trader_id,
        priority = EXCLUDED.priority, updated_at = now();

  PERFORM public.dma_admin__activate_servers(p_dma_user_id, v_broker, v_account, v_servers);

  UPDATE public.dma_account_servers
     SET state = 'removing', updated_at = now()
   WHERE dma_user_id = p_dma_user_id AND broker = v_broker AND account_no = v_account
     AND state = 'active' AND server_key <> ALL (v_servers);

  SELECT coalesce(array_agg(s.server_key ORDER BY s.server_key), ARRAY[]::text[]) INTO v_removing
    FROM public.dma_account_servers s
   WHERE s.dma_user_id = p_dma_user_id AND s.broker = v_broker AND s.account_no = v_account
     AND s.state = 'removing';

  RETURN jsonb_build_object('activated', to_jsonb(v_servers), 'removing', to_jsonb(v_removing));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_put_account(text, jsonb, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_put_account(text, jsonb, text[]) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_put_account(text, jsonb, text[]) TO service_role;

-- ── ④ 계좌 제거 (D-15 · D-23 ⑤ — 행은 지우지 않고 removing) ────────────────────
-- 그 유저의 다른 계좌에 active 등록 서버가 하나도 없으면 LAST_ACCOUNT(마지막 계좌 제거 = 유저 삭제로 유도).
-- 이미 전부 removing 인 계좌를 다시 제거하면 같은 상태 그대로(멱등).
CREATE OR REPLACE FUNCTION public.dma_admin_mark_account_removed(p_dma_user_id text, p_broker text, p_account_no text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public.dma_user_accounts a
     WHERE a.dma_user_id = p_dma_user_id AND a.broker = p_broker AND a.account_no = p_account_no
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ACCOUNT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dma_account_servers s
     WHERE s.dma_user_id = p_dma_user_id AND s.state = 'active'
       AND (s.broker, s.account_no) IS DISTINCT FROM (p_broker, p_account_no)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LAST_ACCOUNT';
  END IF;

  UPDATE public.dma_account_servers
     SET state = 'removing', updated_at = now()
   WHERE dma_user_id = p_dma_user_id AND broker = p_broker AND account_no = p_account_no
     AND state = 'active';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) TO service_role;

-- ── ⑤ 서버 반영 확인 뒤 정리 (relay 만 부른다 — D-23 ⑤) ──────────────────────
-- p_user_removed = true  : op 2 성공(또는 code 4) — 그 유저의 그 서버 행 전부 삭제.
-- p_user_removed = false : op 4 성공(또는 code 8) · 87 에 이미 없음 — p_removed_accounts 의 removing 행만 삭제
--                          (계좌번호만 — 증권사는 서버의 증권사다. active 행은 지우지 않는다).
-- 그 뒤 등록 서버가 0 이 된 그 유저의 계좌를 지운다. 반환 { deletedRows, deletedAccounts }(행 수).
-- 유저가 없으면 0 · 0(멱등 — 재시도해도 안전).
CREATE OR REPLACE FUNCTION public.dma_admin_settle_server(
  p_dma_user_id text, p_server_key text, p_removed_accounts text[], p_user_removed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows     integer;
  v_accounts integer;
BEGIN
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;

  IF coalesce(p_user_removed, false) THEN
    DELETE FROM public.dma_account_servers
     WHERE dma_user_id = p_dma_user_id AND server_key = p_server_key;
  ELSE
    DELETE FROM public.dma_account_servers
     WHERE dma_user_id = p_dma_user_id AND server_key = p_server_key AND state = 'removing'
       AND account_no = ANY (coalesce(p_removed_accounts, ARRAY[]::text[]));
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.dma_user_accounts a
   WHERE a.dma_user_id = p_dma_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.dma_account_servers s
        WHERE s.dma_user_id = a.dma_user_id AND s.broker = a.broker AND s.account_no = a.account_no
     );
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  RETURN jsonb_build_object('deletedRows', v_rows, 'deletedAccounts', v_accounts);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_settle_server(text, text, text[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_settle_server(text, text, text[], boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_settle_server(text, text, text[], boolean) TO service_role;

-- ── ⑥ DMA 유저 삭제 (D-15 — 전 서버 op 2 · settle 뒤에만) ─────────────────────
-- 아직 settle 되지 않은 서버 행이 있으면 SERVERS_REMAIN. 삭제하면 계좌(행 0 인 것)는 cascade,
-- app_users.dma_user_id 는 ON DELETE SET NULL(29-01) — 웹 사용자 행 · 역할은 남는다.
CREATE OR REPLACE FUNCTION public.dma_admin_delete_dma_user(p_dma_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_DMA_USER';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dma_account_servers s WHERE s.dma_user_id = p_dma_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SERVERS_REMAIN';
  END IF;
  DELETE FROM public.dma_users WHERE dma_user_id = p_dma_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_delete_dma_user(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_delete_dma_user(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_delete_dma_user(text) TO service_role;

-- ── ⑦ 의도 조회 (relay planner 입력 — shared AdminIntentRow 키) ──────────────────
-- (계좌 × 등록 서버) 행 배열 · priority → accountNo → serverKey 순. 유저가 없으면 빈 배열.
CREATE OR REPLACE FUNCTION public.dma_admin_intent(p_dma_user_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'dmaUserId', a.dma_user_id,
           'broker',    a.broker,
           'accountNo', a.account_no,
           'name',      a.name,
           'branchNo',  a.branch_no,
           'traderId',  a.trader_id,
           'priority',  a.priority,
           'serverKey', s.server_key,
           'state',     s.state
         ) ORDER BY a.priority, a.account_no, s.server_key), '[]'::jsonb)
    FROM public.dma_user_accounts a
    JOIN public.dma_account_servers s
      ON s.dma_user_id = a.dma_user_id AND s.broker = a.broker AND s.account_no = a.account_no
   WHERE a.dma_user_id = p_dma_user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_intent(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_intent(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_intent(text) TO service_role;

COMMIT;
