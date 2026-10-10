-- ============================================================
-- Phase 29 Plan 27 — CR-01: 「+ 사용자」 가 기존 DMA 연결을 덮어쓰지 않는다.
--
-- 문제(29-REVIEW CR-01): `dma_admin_create_dma_user` 가 끝에서 `app_users.dma_user_id` 를 조건 없이 UPDATE 했다. 그래서
--   이미 DMA 가 연결된 웹 사용자의 이메일로 「+ 사용자」(Express `POST /api/admin/users` + dma)를 부르면 연결이 새 DMA id 로
--   조용히 바뀌고, 옛 DMA 유저는 어떤 웹 사용자에도 연결되지 않은 고아(Admin 의 「서버에만 있음」 행)로 남았다.
--   전용 라우트(`POST /users/:email/dma`)만 Express 에서 DMA_LINKED 로 막고 있었다 — 가드가 한 경로에만 있으면 다음 경로가 샌다.
--
-- 결정: **정본 가드 = DB.** Express(`POST /users`)는 쓰기 전에 거르는 앞단일 뿐이다. 이 파일은 같은 시그니처
--   `dma_admin_create_dma_user(text, text, text, jsonb, text[])` 를 CREATE OR REPLACE 해 처음 단계만 바꾼다:
--     ① 대상 app_users 행의 dma_user_id 를 FOR UPDATE 로 잠근 채 읽는다(같은 웹 사용자의 동시 생성을 줄 세운다)
--     ② 행이 없으면 NO_APP_USER → ③ 이미 연결돼 있으면 DMA_LINKED → 그다음 종전 DMA_USER_EXISTS · NO_SERVERS 순서
--     ④ 끝의 app_users UPDATE 에도 `dma_user_id IS NULL` 조건 — 0행이면 DMA_LINKED(이중 방어)
--   인자 목록 · 반환형은 그대로다(바뀌면 오버로드가 생겨 relay RPC 호출이 모호해진다).
--
-- 오류 규약(20261006200200 머리 규약에 추가): 업무 거부 = `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`.
--   DMA_LINKED             그 웹 사용자(app_users)에 이미 DMA 가 연결돼 있다 — 덮어쓰지 않는다(DMA user_id 는 웹유저당 1개)
--   relay 는 이 코드를 409 `{ error: { code: "DMA_LINKED" } }` 로 그대로 올린다(INTENT_ERROR_CODES).
--
-- 권한: 같은 시그니처로 권한 3줄을 다시 적는다(REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role).
-- 적용: 원격 적용은 29-41 [BLOCKING] 배포 창(메인 세션) — 이 파일을 만든 플랜(29-27)은 원격에 쓰지 않는다.
-- 멱등: CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다. 표 · 데이터 변경 없음.
-- 되돌리기(수동): 20261006200200_dma_admin_intent_rpcs.sql 의 `dma_admin_create_dma_user` 본문으로 다시 CREATE OR REPLACE.
-- ============================================================

BEGIN;

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
  v_linked  text;
BEGIN
  -- 대상 웹 사용자 행을 잠근 채 현재 연결을 읽는다 — 같은 이메일로 동시에 들어온 생성은 여기서 줄을 선다.
  SELECT a.dma_user_id INTO v_linked
    FROM public.app_users a
   WHERE a.email = v_email
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_APP_USER';
  END IF;
  IF v_linked IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DMA_LINKED';
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

  -- 이중 방어: 연결이 비어 있을 때만 채운다. 0행이면 위 잠금 뒤 누가 연결한 것 — 덮어쓰지 않고 거부(트랜잭션 전체 롤백).
  UPDATE public.app_users
     SET dma_user_id = p_dma_user_id, updated_at = now()
   WHERE email = v_email AND dma_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DMA_LINKED';
  END IF;

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

COMMIT;
