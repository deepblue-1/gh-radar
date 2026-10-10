-- ============================================================
-- Phase 29 Plan 29 — G-1 계좌별 주문 서버 (DB 끝: 지정 저장 · 제약 · 해제 시 기본 복귀 · relay 조회 RPC · 의도 모양).
--
-- 결정 근거:
--   G-1   계좌마다 자기가 등록된 서버 중 하나를 주문 서버로 고른다(사용자 변경 요청 2026-10-10). D-10 「증권사당
--         주문 서버 1대 · 열린 세션 유지」 를 **대체**한다. 증권사 기본 주문 서버(dma_servers.is_order_server ·
--         uq_dma_servers_order · /admin/servers 라디오)는 그대로 두고, 계좌별 지정은 그 위의 덮어쓰기다.
--   안 A  저장 위치 = 등록 서버 행의 플래그 `dma_account_servers.is_order`(29-29 Task 1 사용자 선택 2026-10-10
--         `flag-on-registration`). 「그 계좌의 등록 서버 중 하나」 가 같은 행이라 구조로 보장되고, 부분 유니크로
--         계좌당 1개, CHECK 로 removing 행 지정을 막고, 등록 행이 지워지면(settle) 지정도 함께 사라진다.
--
-- G-1 운영 규칙(이 파일 뒤 G-1 플랜의 정본 — 판정은 relay 몫, 이 파일은 저장만 한다):
--   - 계좌 a(증권사 b)의 유효 주문 서버 = a 의 지정 서버(레지스트리에서 enabled 이고 증권사가 b 일 때) → 아니면 b 의
--     기본 주문 서버(dma_servers.is_order_server). 지정 서버가 꺼지면 기본값으로 가되 지정은 지우지 않는다(다시 켜면
--     돌아온다) — 그래서 꺼진 서버로의 지정도 받는다.
--   - 그 계좌의 주문 · 상따 · 자동매도 명령과 계좌 · 주문 · 상따 · 83 프레임은 유효 주문 서버 세션 하나에서만 오간다.
--   - 적용 시점 = 즉시 재접속(사용자 확정 2026-10-10) — 지정 · 증권사 기본값이 바뀌면 영향 사용자 세션을 새 서버로
--     곧바로 다시 세운다(29-36).
--   - gh-trade 와이어 변경 없음(계좌는 이미 서버별 users.toml 에 있다).
--
-- 보존 제약: additive 이고 **백필하지 않는다** — 적용 직후 모든 기존 등록 행의 is_order 는 false(= 지정 없음 =
--   증권사 기본 주문 서버). 교보119 · KB120 운영 동작은 Admin 이 계좌별 서버를 고르기 전까지 그대로다.
--
-- 오류 규약(20261006200200 과 같다 — `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`):
--   NO_DMA_USER                 DMA id 가 없다
--   NO_SUCH_ACCOUNT             그 유저에게 (증권사, 계좌번호) 계좌가 없다
--   ORDER_SERVER_NOT_REGISTERED 지정하려는 서버가 그 계좌의 active 등록 서버가 아니다(미등록 · removing ·
--                               다른 증권사 · 없는 서버 키 전부 이 코드)
--   안 A 제약 위반(직접 UPDATE)은 원래 코드 그대로 — CHECK 23514 · 부분 유니크 23505.
--
-- 해제 시 복귀: 지정 서버가 등록에서 빠지면 같은 트랜잭션에서 지정이 사라진다.
--   - dma_admin_put_account 에서 빠짐 → removing 으로 바꾸는 같은 UPDATE 가 is_order = false
--   - dma_admin_mark_account_removed → 같은 UPDATE 가 is_order = false
--   - dma_admin_settle_server 로 행 삭제 → 플래그가 행과 함께 사라진다(본문 무변경)
--   되살려도(put 으로 다시 active) 지정은 되살아나지 않는다 — 기본값.
--
-- 적용: 원격은 29-41 [BLOCKING] 체크포인트에서만. 원격 적용된 20261006200100 · 200200 · 200300 은 고치지 않고
--   여기서 CREATE OR REPLACE 로 4개 함수(put_account · mark_account_removed · dma_admin_intent · admin_users_raw)를
--   다시 정의한다(시그니처 무변경 · 권한 3줄 재선언).
-- 멱등: ADD COLUMN IF NOT EXISTS · 제약은 pg_constraint 확인 뒤 추가 · CREATE UNIQUE INDEX IF NOT EXISTS ·
--   CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다.
-- 되돌리기(수동 · 이 순서): ① dma_admin_set_account_order_server · dma_account_order_servers DROP FUNCTION →
--   ② 20261006200200 의 dma_admin_put_account · dma_admin_mark_account_removed · dma_admin_intent 블록과
--   20261006200300 의 admin_users_raw 블록을 다시 실행(옛 본문 복원) → ③ DROP INDEX uq_dma_account_servers_order →
--   ④ ALTER TABLE dma_account_servers DROP CONSTRAINT chk_dma_account_servers_order_active → ⑤ DROP COLUMN is_order.
--   (운영에서 Admin 이 고른 지정은 ⑤ 에서 사라진다 — 보존이 필요하면 먼저 dma_account_order_servers() 를 떠 둔다.)
-- ============================================================

BEGIN;

-- ── ① 저장 · 제약 (안 A) ───────────────────────────────────────────
ALTER TABLE public.dma_account_servers
  ADD COLUMN IF NOT EXISTS is_order boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_dma_account_servers_order_active'
       AND conrelid = 'public.dma_account_servers'::regclass
  ) THEN
    ALTER TABLE public.dma_account_servers
      ADD CONSTRAINT chk_dma_account_servers_order_active CHECK (NOT is_order OR state = 'active');
  END IF;
END;
$$;

-- 계좌당 지정 서버 1개.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dma_account_servers_order
  ON public.dma_account_servers (dma_user_id, broker, account_no) WHERE is_order;

-- ── ② 지정 RPC (Admin 경로 29-37 이 Express → relay 로 부른다) ────────────
-- p_server_key NULL(또는 빈 키) = 지정 해제 → 증권사 기본 주문 서버. 반환 { "orderServer": <키 | null> }.
-- 같은 값 재지정은 같은 결과(행 변화 없음). 거부는 검증을 모두 마친 뒤에만 쓰므로 기존 지정을 바꾸지 않는다.
-- 꺼진 서버로의 지정도 받는다 — 유효 주문 서버 판정(enabled)은 relay 몫(위 운영 규칙).
CREATE OR REPLACE FUNCTION public.dma_admin_set_account_order_server(
  p_dma_user_id text, p_broker text, p_account_no text, p_server_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_server_key, '')), '');
BEGIN
  -- 같은 유저 변경을 줄 세운다(20261006200200 규율).
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_DMA_USER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dma_user_accounts a
     WHERE a.dma_user_id = p_dma_user_id AND a.broker = p_broker AND a.account_no = p_account_no
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ACCOUNT';
  END IF;
  -- 등록 행의 증권사 = 계좌 증권사(브로커 가드 트리거)이므로 다른 증권사 서버는 여기서 함께 걸린다.
  IF v_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dma_account_servers s
     WHERE s.dma_user_id = p_dma_user_id AND s.broker = p_broker AND s.account_no = p_account_no
       AND s.server_key = v_key AND s.state = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORDER_SERVER_NOT_REGISTERED',
      DETAIL = format('server %s is not an active registration of %s/%s', v_key, p_broker, p_account_no);
  END IF;

  -- 내리고 → 세운다(부분 유니크는 문장마다 확인되므로 순서가 필요하다).
  UPDATE public.dma_account_servers
     SET is_order = false, updated_at = now()
   WHERE dma_user_id = p_dma_user_id AND broker = p_broker AND account_no = p_account_no
     AND is_order AND server_key IS DISTINCT FROM v_key;
  IF v_key IS NOT NULL THEN
    UPDATE public.dma_account_servers
       SET is_order = true, updated_at = now()
     WHERE dma_user_id = p_dma_user_id AND broker = p_broker AND account_no = p_account_no
       AND server_key = v_key AND NOT is_order;
  END IF;

  RETURN jsonb_build_object('orderServer', v_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_account_order_server(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_account_order_server(text, text, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_set_account_order_server(text, text, text, text) TO service_role;

-- ── ③ relay 조회 RPC (29-33 적재기) — 지정된 계좌만 ─────────────────────
-- 지정 없는 계좌는 나오지 않는다(= 증권사 기본 주문 서버). 서버 enabled 여부는 거르지 않는다 — 판정은 relay.
CREATE OR REPLACE FUNCTION public.dma_account_order_servers()
RETURNS TABLE (dma_user_id text, broker text, account_no text, server_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.dma_user_id, s.broker, s.account_no, s.server_key
    FROM public.dma_account_servers s
   WHERE s.is_order
   ORDER BY s.dma_user_id, s.broker, s.account_no;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_account_order_servers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_account_order_servers() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_account_order_servers() TO service_role;

-- ── ④ 계좌 put — 20261006200200 본문 그대로 + removing 으로 바꿀 때 지정 해제 ──────────
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

  -- G-1: 빠지는 서버가 지정 서버면 같은 UPDATE 에서 지정도 내린다(CHECK — removing 행은 지정 불가).
  UPDATE public.dma_account_servers
     SET state = 'removing', is_order = false, updated_at = now()
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

-- ── ⑤ 계좌 제거 — 20261006200200 본문 그대로 + removing 으로 바꿀 때 지정 해제 ───────────
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

  -- G-1: 계좌 제거는 그 계좌의 지정도 내린다.
  UPDATE public.dma_account_servers
     SET state = 'removing', is_order = false, updated_at = now()
   WHERE dma_user_id = p_dma_user_id AND broker = p_broker AND account_no = p_account_no
     AND state = 'active';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_mark_account_removed(text, text, text) TO service_role;

-- ── ⑥ 의도 조회 — 20261006200200 본문 + 'isOrder' ─────────────────────────
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
           'state',     s.state,
           'isOrder',   s.is_order
         ) ORDER BY a.priority, a.account_no, s.server_key), '[]'::jsonb)
    FROM public.dma_user_accounts a
    JOIN public.dma_account_servers s
      ON s.dma_user_id = a.dma_user_id AND s.broker = a.broker AND s.account_no = a.account_no
   WHERE a.dma_user_id = p_dma_user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_intent(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_intent(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_intent(text) TO service_role;

-- ── ⑦ 사용자 개요 원자료 — 20261006200300 본문 + intent[].isOrder · servers[].isOrderServer ──────
-- servers[].isOrderServer = 증권사 기본 주문 서버(화면 「기본(KB120)」 표시 원천 — 29-37). 나머지 키 · 정렬 그대로.
CREATE OR REPLACE FUNCTION public.admin_users_raw()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'appUsers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'email',     a.email,
               'role',      a.role,
               'dmaUserId', a.dma_user_id,
               'signedUp',  EXISTS (SELECT 1 FROM auth.users u WHERE lower(btrim(u.email)) = a.email)
             ) ORDER BY a.email), '[]'::jsonb)
        FROM public.app_users a
    ),
    'pending', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'email',      p.email,
               'signedUpAt', p.signed_up_at
             ) ORDER BY p.signed_up_at DESC, p.email), '[]'::jsonb)
        FROM (
          SELECT lower(btrim(u.email)) AS email, min(u.created_at) AS signed_up_at
            FROM auth.users u
           WHERE u.email IS NOT NULL
             AND btrim(u.email) <> ''
             AND NOT EXISTS (SELECT 1 FROM public.app_users a WHERE a.email = lower(btrim(u.email)))
           GROUP BY lower(btrim(u.email))
        ) p
    ),
    'intent', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'dmaUserId', a.dma_user_id,
               'broker',    a.broker,
               'accountNo', a.account_no,
               'name',      a.name,
               'branchNo',  a.branch_no,
               'traderId',  a.trader_id,
               'priority',  a.priority,
               'serverKey', s.server_key,
               'state',     s.state,
               'isOrder',   s.is_order
             ) ORDER BY a.dma_user_id, a.priority, a.account_no, s.server_key), '[]'::jsonb)
        FROM public.dma_user_accounts a
        JOIN public.dma_account_servers s
          ON s.dma_user_id = a.dma_user_id AND s.broker = a.broker AND s.account_no = a.account_no
    ),
    'snapshots', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'serverKey',  n.server_key,
               'usersRev',   n.users_rev::text,
               'receivedAt', n.received_at
             ) ORDER BY n.server_key), '[]'::jsonb)
        FROM public.dma_server_snapshots n
    ),
    'snapshotAccounts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'serverKey', c.server_key,
               'dmaUserId', c.dma_user_id,
               'accountNo', c.account_no,
               'name',      c.name,
               'branchNo',  c.branch_no,
               'traderId',  c.trader_id,
               'priority',  c.priority
             ) ORDER BY c.server_key, c.dma_user_id, c.priority, c.account_no), '[]'::jsonb)
        FROM public.dma_server_user_accounts c
    ),
    'results', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'dmaUserId', r.dma_user_id,
               'serverKey', r.server_key,
               'outcome',   r.outcome,
               'code',      r.code,
               'message',   r.message,
               'at',        r.at
             ) ORDER BY r.dma_user_id, r.server_key), '[]'::jsonb)
        FROM public.dma_admin_results r
    ),
    'servers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'key',           s.key,
               'broker',        s.broker,
               'enabled',       s.enabled,
               'isOrderServer', s.is_order_server
             ) ORDER BY s.sort_order, s.key), '[]'::jsonb)
        FROM public.dma_servers s
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_users_raw() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_users_raw() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_users_raw() TO service_role;

COMMIT;
