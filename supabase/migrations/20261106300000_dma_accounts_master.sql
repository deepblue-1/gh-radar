-- ============================================================
-- quick 261106-lwu — 계좌 마스터 dma_accounts · 멱등 백필 · 연결 행 → 마스터 자동 등록 트리거 · FK · 어드민 RPC 4종.
--
-- 결정 근거(.planning/quick/261106-lwu-admin-accounts/261106-lwu-CONTEXT.md):
--   D-03  계좌 마스터가 갖는 값 = 계좌 자체 정보만 — 증권사 · 계좌번호(키 · 등록 뒤 못 바꿈) · 계좌명 · (KB) 지점 5자 ·
--         트레이더 6자. 교보는 지점 · 트레이더 없음(dma_user_accounts 와 같은 CHECK 2개). 계좌번호 정규화는 shared
--         normalizeAccountNo 한 벌 — 이 파일은 정규화값을 받는다(Express 가 정규화해 넘긴다).
--   D-05  기존 계좌 백필 — dma_user_accounts 를 (broker, account_no) 로 묶어 한 번 옮긴다. 여러 사용자가 같은 계좌를
--         가지면 한 줄 · 값이 다르면 updated_at 최신 행 값(동률은 dma_user_id 순 첫 행). 연결 행 값은 건드리지 않는다
--         (건드리면 87 대비 「미반영」 칩이 갑자기 뜬다 — 다음 계좌 저장 · 연결 저장 때 수렴한다).
--   D-08  계좌 저장 = 마스터 + 같은 (broker, account_no) 의 모든 연결 행을 한 트랜잭션으로 갱신(dma_admin_update_account) →
--         Express 가 연결된 DMA 사용자마다 기존 relay PUT 경로로 반영. 삭제는 연결 0명일 때만(ACCOUNT_IN_USE).
--
-- 서버측 정합 규칙(CONTEXT):
--   - 연결 행(dma_user_accounts)의 name · branch_no · trader_id 열은 relay planner · 87 diff 가 읽으므로 남긴다(relay 무변경).
--     마스터가 정본이고, 같은 값이 두 곳에 있는 부채는 PLAN assumption_delta_decision 에 적었다.
--   - 웹 연결 경로의 게이트는 Express 409 ACCOUNT_NOT_REGISTERED 다. 아래 트리거는 Express 밖 writer(배포 창의 옛 server ·
--     adopt RPC · 테스트 픽스처)가 만든 연결도 목록에서 빠지지 않게 하는 그물이다.
--   - 새 표 RLS on · 정책 없음 · service_role 전용. RPC 는 REVOKE PUBLIC, anon, authenticated 명시(auto-grant 함정).
--
-- 오류 규약(20261006200200 과 같다 — `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`):
--   ACCOUNT_EXISTS   등록하려는 (broker, account_no) 가 이미 있다
--   NO_SUCH_ACCOUNT  수정 · 삭제하려는 계좌가 마스터에 없다
--   ACCOUNT_IN_USE   연결 행이 남아 있는 계좌를 지우려 했다(직접 DELETE 는 FK 23503)
--   CHECK 위반(KB 길이 · 교보 빈 값 · 계좌번호 길이)은 원래 코드 그대로 23514.
--
-- 멱등: CREATE TABLE/INDEX IF NOT EXISTS · 백필 ON CONFLICT DO NOTHING · CREATE OR REPLACE FUNCTION ·
--   DROP TRIGGER IF EXISTS 후 CREATE TRIGGER · FK 는 pg_constraint 확인 뒤 추가 · 권한 줄은 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서): ① RPC 4종 DROP FUNCTION → ② ALTER TABLE dma_user_accounts DROP CONSTRAINT
--   fk_dma_user_accounts_master → ③ DROP TRIGGER trg_dma_user_accounts_ensure_master · DROP FUNCTION
--   dma_user_accounts_ensure_master() → ④ DROP INDEX ix_dma_user_accounts_broker_account → ⑤ DROP TABLE dma_accounts.
--   (연결 행 값은 이 파일이 바꾸지 않았으므로 되돌릴 것이 없다 — 계좌 저장으로 바뀐 값은 그대로 남는다.)
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) — 어드민 전용(Express service_role 이 부른다).
--   - 연결 행 값 열 제거 · relay planner 의 마스터 조인 — relay 무변경 조건(정합 규칙).
--   - 계좌번호 변경 · 계좌별 IP/MAC · 예수금 마스터 이동(범위 밖).
-- ============================================================

BEGIN;

-- ── ① 계좌 마스터 표 (D-03) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dma_accounts (
  broker      text        NOT NULL CHECK (broker IN ('KB','KYOBO')),
  account_no  text        NOT NULL CHECK (account_no <> '' AND length(account_no) <= 12),
  name        text        NOT NULL DEFAULT '',
  branch_no   text        NOT NULL DEFAULT '',
  trader_id   text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broker, account_no),
  CHECK (broker <> 'KB'    OR (length(branch_no) = 5 AND length(trader_id) = 6)),
  CHECK (broker <> 'KYOBO' OR (branch_no = '' AND trader_id = ''))
);

ALTER TABLE public.dma_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_accounts FROM PUBLIC;
REVOKE ALL ON public.dma_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_accounts TO service_role;

-- ── ② 멱등 백필 (D-05) — (broker, account_no) 당 updated_at 최신 행 ─────────
INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id, created_at, updated_at)
SELECT DISTINCT ON (a.broker, a.account_no)
       a.broker, a.account_no, a.name, a.branch_no, a.trader_id, a.updated_at, a.updated_at
  FROM public.dma_user_accounts a
 ORDER BY a.broker, a.account_no, a.updated_at DESC, a.dma_user_id
ON CONFLICT (broker, account_no) DO NOTHING;

-- ── ③ 연결 행 → 마스터 자동 등록 트리거(그물) ─────────────────────────
-- Express 밖 writer 가 마스터에 없는 계좌로 연결 행을 만들어도 마스터가 그 값으로 생긴다(있으면 그대로 — 값 정본은 마스터).
-- SECURITY DEFINER 아님 — 연결 행을 쓸 수 있는 역할(service_role · RPC 소유자)이 마스터도 쓸 수 있다.
CREATE OR REPLACE FUNCTION public.dma_user_accounts_ensure_master()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id)
  VALUES (NEW.broker, NEW.account_no, NEW.name, NEW.branch_no, NEW.trader_id)
  ON CONFLICT (broker, account_no) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_user_accounts_ensure_master() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_user_accounts_ensure_master() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_dma_user_accounts_ensure_master ON public.dma_user_accounts;
CREATE TRIGGER trg_dma_user_accounts_ensure_master
  BEFORE INSERT ON public.dma_user_accounts
  FOR EACH ROW EXECUTE FUNCTION public.dma_user_accounts_ensure_master();

-- ── ④ 「연결 행은 늘 마스터를 가진다」 — FK · 인덱스 ─────────────────────
CREATE INDEX IF NOT EXISTS ix_dma_user_accounts_broker_account
  ON public.dma_user_accounts (broker, account_no);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_dma_user_accounts_master'
       AND conrelid = 'public.dma_user_accounts'::regclass
  ) THEN
    ALTER TABLE public.dma_user_accounts
      ADD CONSTRAINT fk_dma_user_accounts_master
      FOREIGN KEY (broker, account_no) REFERENCES public.dma_accounts (broker, account_no) ON DELETE RESTRICT;
  END IF;
END;
$$;

-- ── ⑤ RPC (a) 목록 — GET /api/admin/accounts (D-06) ─────────────────────
-- 키는 shared AdminAccountsOverview 그대로(camelCase). 정렬: 계좌 broker, account_no · 사용자 dma_user_id ·
-- 이메일 email · 서버 dma_servers.sort_order, key. 모든 배열 coalesce '[]'.
CREATE OR REPLACE FUNCTION public.admin_accounts_raw()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('accounts', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'broker',    m.broker,
             'accountNo', m.account_no,
             'name',      m.name,
             'branchNo',  m.branch_no,
             'traderId',  m.trader_id,
             'updatedAt', m.updated_at,
             'users', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'dmaUserId', l.dma_user_id,
                        'emails', coalesce((
                          SELECT jsonb_agg(au.email ORDER BY au.email)
                            FROM public.app_users au
                           WHERE au.dma_user_id = l.dma_user_id
                        ), '[]'::jsonb),
                        'priority', l.priority,
                        'servers', coalesce((
                          SELECT jsonb_agg(jsonb_build_object('serverKey', s.server_key, 'state', s.state)
                                           ORDER BY coalesce(r.sort_order, 2147483647), s.server_key)
                            FROM public.dma_account_servers s
                            LEFT JOIN public.dma_servers r ON r.key = s.server_key
                           WHERE s.dma_user_id = l.dma_user_id AND s.broker = l.broker AND s.account_no = l.account_no
                        ), '[]'::jsonb)
                      ) ORDER BY l.dma_user_id)
                 FROM public.dma_user_accounts l
                WHERE l.broker = m.broker AND l.account_no = m.account_no
             ), '[]'::jsonb)
           ) ORDER BY m.broker, m.account_no)
      FROM public.dma_accounts m
  ), '[]'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.admin_accounts_raw() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_accounts_raw() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_accounts_raw() TO service_role;

-- ── ⑥ RPC (b) 등록 — POST /api/admin/accounts (D-07 · DB 마스터만) ──────────
-- p_account = { broker, accountNo(정규화값), name, branchNo, traderId }. 이미 있으면 ACCOUNT_EXISTS. CHECK 위반은 23514.
CREATE OR REPLACE FUNCTION public.dma_admin_create_account(p_account jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.dma_accounts (broker, account_no, name, branch_no, trader_id)
  VALUES (
    p_account ->> 'broker',
    p_account ->> 'accountNo',
    coalesce(p_account ->> 'name', ''),
    coalesce(p_account ->> 'branchNo', ''),
    coalesce(p_account ->> 'traderId', '')
  )
  ON CONFLICT (broker, account_no) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_EXISTS';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_create_account(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_create_account(jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_create_account(jsonb) TO service_role;

-- ── ⑦ RPC (c) 저장 — PUT /api/admin/accounts/:broker/:accountNo (D-08) ──────
-- 마스터 + 같은 (broker, account_no) 의 모든 연결 행을 한 트랜잭션으로. 반환 { links: [{ dmaUserId, priority, servers }] }
-- (dmaUserId 순 · servers = 그 링크의 active 등록 서버 키 — removing 만 남은 링크도 servers [] 로 포함). Express 가 이
-- 목록으로 relay 팬아웃을 한다(servers 가 빈 링크는 부르지 않는다 — relay 는 빈 servers 를 NO_SERVERS 로 거부한다).
-- 잠금: 마스터 FOR NO KEY UPDATE — 연결 행 INSERT 의 FK 확인(KEY SHARE)과 충돌하지 않는다.
CREATE OR REPLACE FUNCTION public.dma_admin_update_account(
  p_broker text, p_account_no text, p_name text, p_branch_no text, p_trader_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_links jsonb;
BEGIN
  PERFORM 1 FROM public.dma_accounts m
   WHERE m.broker = p_broker AND m.account_no = p_account_no
   FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ACCOUNT';
  END IF;

  UPDATE public.dma_accounts
     SET name = coalesce(p_name, ''), branch_no = coalesce(p_branch_no, ''),
         trader_id = coalesce(p_trader_id, ''), updated_at = now()
   WHERE broker = p_broker AND account_no = p_account_no;

  -- 정합 규칙 「마스터 수정 시 연결 행도 같이 갱신」 — relay planner 가 읽는 값 열.
  UPDATE public.dma_user_accounts
     SET name = coalesce(p_name, ''), branch_no = coalesce(p_branch_no, ''),
         trader_id = coalesce(p_trader_id, ''), updated_at = now()
   WHERE broker = p_broker AND account_no = p_account_no;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'dmaUserId', l.dma_user_id,
           'priority',  l.priority,
           'servers', coalesce((
             SELECT jsonb_agg(s.server_key ORDER BY coalesce(r.sort_order, 2147483647), s.server_key)
               FROM public.dma_account_servers s
               LEFT JOIN public.dma_servers r ON r.key = s.server_key
              WHERE s.dma_user_id = l.dma_user_id AND s.broker = l.broker AND s.account_no = l.account_no
                AND s.state = 'active'
           ), '[]'::jsonb)
         ) ORDER BY l.dma_user_id), '[]'::jsonb)
    INTO v_links
    FROM public.dma_user_accounts l
   WHERE l.broker = p_broker AND l.account_no = p_account_no;

  RETURN jsonb_build_object('links', v_links);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_update_account(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_update_account(text, text, text, text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_update_account(text, text, text, text, text) TO service_role;

-- ── ⑧ RPC (d) 삭제 — DELETE /api/admin/accounts/:broker/:accountNo (D-08 · 연결 0명만) ──
-- 마스터 FOR UPDATE — 동시에 들어오는 연결 INSERT 는 FK 확인에서 기다렸다가 삭제 뒤 23503 으로 실패한다.
CREATE OR REPLACE FUNCTION public.dma_admin_delete_account(p_broker text, p_account_no text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.dma_accounts m
   WHERE m.broker = p_broker AND m.account_no = p_account_no
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_SUCH_ACCOUNT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dma_user_accounts l
     WHERE l.broker = p_broker AND l.account_no = p_account_no
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_IN_USE';
  END IF;
  DELETE FROM public.dma_accounts WHERE broker = p_broker AND account_no = p_account_no;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_delete_account(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_delete_account(text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_delete_account(text, text) TO service_role;

COMMIT;
