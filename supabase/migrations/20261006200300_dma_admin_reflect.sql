-- ============================================================
-- Phase 29 Plan 05 — 서버별 87 반영 상태 · Admin 개요 원자료 RPC.
--
-- 결정 근거:
--   D-05  「DB = 의도 · 87 = 반영 상태」. 서버가 보낸 87(AdminUsersSnapshot = 그 서버 users.toml 전체)을 서버별로
--         통째 저장한다. 의도(20261006200200)와 이 표의 차이가 곧 Admin 화면의 반영 칩이다 — 판정은 shared
--         `deriveAdminUsersOverview`(29-04) 한 벌이고, 이 파일은 그 함수의 입력(`AdminUsersRaw`)을 한 번에 낸다.
--   적재 = 서버별 원자 교체(delete + insert) — dma_journal_sync_access 동형. 같은 서버의 적재는
--         `pg_advisory_xact_lock(hashtext('dma_admin_snapshot:' || server))` 로 줄 세운다.
--   users_rev 는 저장만 한다 — **신선도 비교에 쓰지 않는다**(gh-trade D-06: 서버 재기동 시 1 로 돌아간다).
--         최신 판정은 relay(29-14)의 세대 가드 몫이다.
--   D-23 ③ 교보 계좌의 branch/trader 는 빈 문자열 그대로 저장한다(「해당 없음」 표시는 화면 몫).
--   jsonb 키는 shared `AdminUsersRaw` 필드 이름(camelCase) 그대로 — relay · Express · webapp 이 함께 읽는 계약.
--   Cloud Run 왕복 1회(메모리 project_cloudrun_egress_roundtrip_cost) — 개요 원자료는 RPC 한 번에 모두 싣는다.
--
-- 계좌번호: 87 이 준 값을 그대로 저장한다(재정규화 없음) — 대조는 shared normalizeAccountNo 가 한다.
-- 권한: 새 표 전부 잠금 4줄(RLS · 정책 0 · REVOKE PUBLIC · REVOKE anon, authenticated) + 새 RPC 권한 3줄 — service_role 전용.
-- 적용: additive — 29-07 [BLOCKING] 체크포인트에서 원격 적용.
-- 멱등: CREATE TABLE IF NOT EXISTS · CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다.
-- 되돌리기(수동): 이 파일의 함수 DROP → dma_server_user_accounts · dma_server_snapshots 표 DROP.
-- ============================================================

BEGIN;

-- ── ① 서버별 87 수신 기록 ──────────────────────────────────────────
-- 여기 행이 없는 서버는 「아직 모름」(shared diffServerAccounts known:false).
CREATE TABLE IF NOT EXISTS public.dma_server_snapshots (
  server_key  text        PRIMARY KEY REFERENCES public.dma_servers(key) ON UPDATE CASCADE ON DELETE CASCADE,
  users_rev   bigint      NOT NULL,   -- 저장만 — 재기동 시 1 로 돌아가므로 비교 키로 쓰지 않는다
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dma_server_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_server_snapshots FROM PUBLIC;
REVOKE ALL ON public.dma_server_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_server_snapshots TO service_role;

-- ── ② 서버별 87 계좌 (반영 상태) ────────────────────────────────────
-- dma_user_id 는 dma_users 를 참조하지 않는다 — 87 에는 DB 의도에 없는 DMA id(「서버에만 있음」)도 있다.
CREATE TABLE IF NOT EXISTS public.dma_server_user_accounts (
  server_key  text    NOT NULL REFERENCES public.dma_servers(key) ON UPDATE CASCADE ON DELETE CASCADE,
  dma_user_id text    NOT NULL,
  account_no  text    NOT NULL,
  name        text    NOT NULL DEFAULT '',
  branch_no   text    NOT NULL DEFAULT '',
  trader_id   text    NOT NULL DEFAULT '',
  priority    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (server_key, dma_user_id, account_no)
);

ALTER TABLE public.dma_server_user_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_server_user_accounts FROM PUBLIC;
REVOKE ALL ON public.dma_server_user_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_server_user_accounts TO service_role;

-- ── ③ 87 적재 (relay 29-14 snapshot-sink 가 부른다) ─────────────────
-- p_users = [{ userId, accounts: [{ accountNo, name, branchNo, traderId, priority }] }] (87 그대로 · camelCase).
-- 그 서버 행을 통째 지우고 다시 넣는다 — 87 에서 사라진 유저 · 계좌는 이 표에서도 사라진다.
-- 빈 userId · accountNo 가 하나라도 있으면 교체 전체를 거부한다(기존 반영 상태 보존 — 트랜잭션 롤백).
-- 같은 (유저, 계좌)가 두 번 오면 첫 행만 남긴다(ON CONFLICT DO NOTHING). 반환 = 넣은 계좌 행 수.
CREATE OR REPLACE FUNCTION public.dma_admin_apply_snapshot(p_server text, p_users_rev bigint, p_users jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF coalesce(p_server, '') = '' THEN
    RAISE EXCEPTION 'dma_admin_apply_snapshot: server 가 비어 있다';
  END IF;
  IF p_users IS NULL OR jsonb_typeof(p_users) <> 'array' THEN
    RAISE EXCEPTION 'dma_admin_apply_snapshot: p_users 는 JSON 배열이어야 한다';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_users) u
      LEFT JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(u -> 'accounts') = 'array' THEN u -> 'accounts' ELSE '[]'::jsonb END
      ) a ON true
     WHERE coalesce(u ->> 'userId', '') = ''
        OR (a IS NOT NULL AND coalesce(a ->> 'accountNo', '') = '')
  ) THEN
    RAISE EXCEPTION 'dma_admin_apply_snapshot: userId/accountNo 가 빈 행이 있다';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dma_admin_snapshot:' || p_server));

  DELETE FROM public.dma_server_user_accounts WHERE server_key = p_server;

  INSERT INTO public.dma_server_user_accounts
    (server_key, dma_user_id, account_no, name, branch_no, trader_id, priority)
  SELECT p_server,
         u ->> 'userId',
         a ->> 'accountNo',
         coalesce(a ->> 'name', ''),
         coalesce(a ->> 'branchNo', ''),
         coalesce(a ->> 'traderId', ''),
         coalesce((a ->> 'priority')::integer, 0)
    FROM jsonb_array_elements(p_users) u
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(u -> 'accounts') = 'array' THEN u -> 'accounts' ELSE '[]'::jsonb END
    ) a
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.dma_server_snapshots (server_key, users_rev, received_at)
  VALUES (p_server, p_users_rev, now())
  ON CONFLICT (server_key) DO UPDATE SET users_rev = EXCLUDED.users_rev, received_at = EXCLUDED.received_at;

  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_apply_snapshot(text, bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_apply_snapshot(text, bigint, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_apply_snapshot(text, bigint, jsonb) TO service_role;

-- ── ④ 사용자 개요 원자료 (Express GET /api/admin/users — shared AdminUsersRaw 7키) ────
--   appUsers         허용 표 전부 { email, role, dmaUserId, signedUp } — signedUp = auth.users 에 같은 이메일 존재
--   pending          가입했지만 허용 표에 없는 이메일 { email, signedUpAt } — 가입 시각 내림차순(D-03 승인 대기)
--   intent           의도 (계좌 × 등록 서버) 행 — AdminIntentRow 키
--   snapshots        87 을 받은 서버 { serverKey, usersRev(text — ulong), receivedAt }
--   snapshotAccounts 서버별 87 계좌 — AdminSnapshotAccountRow 키
--   results          (DMA 유저, 서버) 최근 반영 결과 — AdminResultRow 키
--   servers          레지스트리 { key, broker, enabled } — sort_order 순
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
               'state',     s.state
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
    'results', '[]'::jsonb,
    'servers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'key',     s.key,
               'broker',  s.broker,
               'enabled', s.enabled
             ) ORDER BY s.sort_order, s.key), '[]'::jsonb)
        FROM public.dma_servers s
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_users_raw() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_users_raw() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_users_raw() TO service_role;

COMMIT;
