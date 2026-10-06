-- ============================================================
-- Phase 29 Plan 01 Task 3 — 서버 레지스트리 dma_servers · DMA 의도 표 · 접근 맵 RPC · 레지스트리 RPC.
--
-- 결정 근거:
--   D-05  DB 가 의도, 서버 87 은 반영 상태(2026-10-06 사용자 확인 — one-way 문 `db-intent`). 이 파일의 표가
--         DMA 유저 · 계좌 · 계좌별 등록 서버 · 서버 레지스트리의 정본이다. 반영 상태(87) 표 · 의도 변경 RPC 는 29-05.
--   D-09  서버 레지스트리 — 증권사당 주문 서버 1대 · 전체 시세 주 서버 1대 · 끈 서버는 주문/시세로 고를 수 없다.
--         불변식은 DB 가 쥔다(부분 유니크 2개 + CHECK 2개 + 레지스트리 RPC 4종이 한 트랜잭션으로 갈아 끼운다).
--   D-19  DMA 유저당 비밀번호 암호문 1개(dma_users.password_enc). **AAD = dma_user_id.** 암호화 · 복호는 relay 만
--         한다(Phase 15 D-19 `DMA_CRED_KEY` — 키는 DB 밖). 이 파일은 암호문 칸만 만든다.
--   D-23 ⑤ dma_account_servers.state — `active` = 그 서버에 있어야 한다, `removing` = op 4(계좌 제거)를 보내야 하는
--         DB 등록 서버. op 4 는 DB 등록 서버에만 보내고 성공 또는 code 8 뒤 행을 지운다. 87 에만 있는 계좌는
--         이 표에 없으므로 지울 대상이 아니다.
--
-- 적용: additive — 29-07 [BLOCKING] 체크포인트에서 원격 적용. 옛 relay 는 이 표를 읽지 않으므로 무영향.
--   기존 dma_credentials · dma_gateway_identities 는 건드리지 않는다(롤백 시 옛 relay 가 읽는다).
--
-- 시드 host 출처: infra/relay/startup.sh 의 nft 허용 규칙(KB 게이트웨이 120 · 121, 교보 SecuwaySSL 119 · 127)과
--   infra/relay/README.md §DMA 서버 추가 절차. 포트는 전부 9100. 시드 데이터가 실주소 리터럴의 유일한 자리다(D-27 —
--   테스트는 키만 단언한다).
--
-- 멱등: CREATE TABLE/INDEX IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · 시드 ON CONFLICT DO NOTHING ·
--   CREATE OR REPLACE FUNCTION · DROP TRIGGER IF EXISTS 후 CREATE TRIGGER · 권한 줄은 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서): 레지스트리 RPC 4종 · dma_app_access_map() 함수 제거 → dma_account_servers ·
--   dma_user_accounts 표 제거 → app_users.dma_user_id 열 제거 → dma_users · dma_servers 표 제거 → 트리거 함수 제거.
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) — 새 표는 전부 서비스롤 전용(relay · Express 가 service_role 로 부른다).
--   - app_users.dma_user_id UNIQUE — 한 DMA id 를 웹 사용자 여럿이 공유하는 실데이터가 있다(RESEARCH Pitfall 5).
--   - 계좌번호 정규화 — 저장값은 gh-trade NormalizeAccountNo 정규화값이고, 정규화는 relay/Express 가 shared
--     normalizeAccountNo(29-04)로 한 뒤 넘긴다.
-- ============================================================

BEGIN;

-- ── ① 서버 레지스트리 (D-09) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dma_servers (
  key              text        PRIMARY KEY CHECK (key ~ '^(KB|KYOBO)[0-9]{1,3}$'),
  broker           text        NOT NULL CHECK (broker IN ('KB','KYOBO')),
  host             text        NOT NULL CHECK (host <> ''),
  port             integer     NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  enabled          boolean     NOT NULL DEFAULT false,
  is_order_server  boolean     NOT NULL DEFAULT false,   -- 증권사 안에서 1대
  is_quote_primary boolean     NOT NULL DEFAULT false,   -- 전체 1대
  sort_order       integer     NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (left(key, length(broker)) = broker),
  CHECK (NOT is_order_server  OR enabled),
  CHECK (NOT is_quote_primary OR enabled)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dma_servers_order ON public.dma_servers (broker) WHERE is_order_server;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dma_servers_quote ON public.dma_servers ((true)) WHERE is_quote_primary;

ALTER TABLE public.dma_servers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_servers FROM PUBLIC;
REVOKE ALL ON public.dma_servers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_servers TO service_role;

-- 시드 — KB121 · KYOBO127 은 꺼 둔다(Claude's Discretion: 안전 기본값).
INSERT INTO public.dma_servers (key, broker, host, port, enabled, is_order_server, is_quote_primary, sort_order) VALUES
  ('KB120',    'KB',    '10.41.1.120',   9100, true,  true,  true,  10),
  ('KB121',    'KB',    '10.41.1.121',   9100, false, false, false, 20),
  ('KYOBO119', 'KYOBO', '10.16.207.119', 9100, true,  true,  false, 30),
  ('KYOBO127', 'KYOBO', '10.16.207.127', 9100, false, false, false, 40)
ON CONFLICT (key) DO NOTHING;

-- ── ② DMA 유저 (D-19 — 비밀번호 암호문 1개) ─────────────────────────
-- dma_user_id ≤ 8 바이트 = gh-trade kMaxUserIdLen(BAD_USER_ID). password_enc = base64(nonce‖tag‖ct) ·
-- AES-256-GCM · AAD = dma_user_id — relay 만 암 · 복호한다.
CREATE TABLE IF NOT EXISTS public.dma_users (
  dma_user_id     text        PRIMARY KEY CHECK (dma_user_id <> '' AND octet_length(dma_user_id) <= 8),
  password_enc    text        NOT NULL CHECK (password_enc <> ''),
  password_set_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dma_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_users FROM PUBLIC;
REVOKE ALL ON public.dma_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_users TO service_role;

-- ── ③ 웹 사용자 → DMA 유저 연결 (웹유저당 0~1 · 공유 가능 — UNIQUE 아님) ──
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS dma_user_id text REFERENCES public.dma_users(dma_user_id) ON DELETE SET NULL;

-- ── ④ 계좌 의도 (증권사, 계좌번호) ─────────────────────────────────
-- account_no 는 gh-trade NormalizeAccountNo 정규화값(≤12 = kMaxAccountNoLen). KB 는 branch_no 5자 · trader_id 6자,
-- 교보는 둘 다 빈 값(D-23 ③).
CREATE TABLE IF NOT EXISTS public.dma_user_accounts (
  dma_user_id text        NOT NULL REFERENCES public.dma_users(dma_user_id) ON DELETE CASCADE,
  broker      text        NOT NULL CHECK (broker IN ('KB','KYOBO')),
  account_no  text        NOT NULL CHECK (account_no <> '' AND length(account_no) <= 12),
  name        text        NOT NULL DEFAULT '',
  branch_no   text        NOT NULL DEFAULT '',
  trader_id   text        NOT NULL DEFAULT '',
  priority    integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dma_user_id, broker, account_no),
  CHECK (broker <> 'KB'    OR (length(branch_no) = 5 AND length(trader_id) = 6)),
  CHECK (broker <> 'KYOBO' OR (branch_no = '' AND trader_id = ''))
);

ALTER TABLE public.dma_user_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_user_accounts FROM PUBLIC;
REVOKE ALL ON public.dma_user_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_user_accounts TO service_role;

-- ── ⑤ 계좌별 등록 서버 의도 (D-23 ⑤) ───────────────────────────────
-- state: `active` = 그 서버에 있어야 한다 · `removing` = op 4 를 보내야 하는 DB 등록 서버(op 4 는 DB 등록 서버에만 ·
-- 성공 또는 code 8 뒤 행 삭제 · 87 에만 있는 계좌는 이 표에 없으므로 지울 대상이 아니다).
CREATE TABLE IF NOT EXISTS public.dma_account_servers (
  dma_user_id text        NOT NULL,
  broker      text        NOT NULL,
  account_no  text        NOT NULL,
  server_key  text        NOT NULL REFERENCES public.dma_servers(key) ON UPDATE CASCADE,
  state       text        NOT NULL DEFAULT 'active' CHECK (state IN ('active','removing')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dma_user_id, broker, account_no, server_key),
  FOREIGN KEY (dma_user_id, broker, account_no)
    REFERENCES public.dma_user_accounts (dma_user_id, broker, account_no) ON DELETE CASCADE
);

ALTER TABLE public.dma_account_servers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_account_servers FROM PUBLIC;
REVOKE ALL ON public.dma_account_servers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_account_servers TO service_role;

-- 등록 서버의 증권사 = 계좌 증권사. 서버가 없으면 여기서 막지 않고 FK(23503)에 맡긴다.
CREATE OR REPLACE FUNCTION public.dma_account_servers_broker_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_broker text;
BEGIN
  SELECT s.broker INTO v_broker FROM public.dma_servers s WHERE s.key = NEW.server_key;
  IF v_broker IS NOT NULL AND v_broker <> NEW.broker THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'server broker mismatch',
      DETAIL = format('server %s is %s, account is %s', NEW.server_key, v_broker, NEW.broker);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_account_servers_broker_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_account_servers_broker_guard() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_dma_account_servers_broker_guard ON public.dma_account_servers;
CREATE TRIGGER trg_dma_account_servers_broker_guard
  BEFORE INSERT OR UPDATE ON public.dma_account_servers
  FOR EACH ROW EXECUTE FUNCTION public.dma_account_servers_broker_guard();

-- ── ⑥ 접근 맵 (relay 60초 재적재 원천 — 29-06) ─────────────────────
-- 가입한 허용 사용자만(auth.users ⨝ app_users). 사전 등록만 된 이메일 · 미허용 가입자는 나오지 않는다.
CREATE OR REPLACE FUNCTION public.dma_app_access_map()
RETURNS TABLE (user_id uuid, email text, role text, dma_user_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, a.email, a.role, a.dma_user_id
    FROM auth.users u
    JOIN public.app_users a ON a.email = lower(btrim(u.email));
$$;
REVOKE EXECUTE ON FUNCTION public.dma_app_access_map() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_app_access_map() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_app_access_map() TO service_role;

-- ── ⑦ 레지스트리 RPC 4종 (Express 29-13 이 부른다) ──────────────────
-- 서버 추가 · 주소 변경. 신규는 enabled=false · 맨 뒤 정렬. 기존은 host/port 만 갱신하고 broker 변경은 거부한다.
CREATE OR REPLACE FUNCTION public.dma_admin_upsert_server(p_key text, p_broker text, p_host text, p_port integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_broker text;
BEGIN
  SELECT s.broker INTO v_broker FROM public.dma_servers s WHERE s.key = p_key FOR UPDATE;
  IF FOUND THEN
    IF v_broker IS DISTINCT FROM p_broker THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'broker change not allowed';
    END IF;
    UPDATE public.dma_servers
       SET host = p_host, port = coalesce(p_port, 9100), updated_at = now()
     WHERE key = p_key;
  ELSE
    INSERT INTO public.dma_servers (key, broker, host, port, enabled, sort_order, updated_at)
    VALUES (p_key, p_broker, p_host, coalesce(p_port, 9100), false,
            (SELECT coalesce(max(s.sort_order), 0) + 10 FROM public.dma_servers s), now());
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_upsert_server(text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_upsert_server(text, text, text, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_upsert_server(text, text, text, integer) TO service_role;

-- 켜기 · 끄기. 주문 서버 · 시세 주 서버는 끌 수 없다(먼저 다른 서버로 옮긴다).
CREATE OR REPLACE FUNCTION public.dma_admin_set_server_enabled(p_key text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.dma_servers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.dma_servers s WHERE s.key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'server not found';
  END IF;
  IF p_enabled IS NOT TRUE AND (v_row.is_order_server OR v_row.is_quote_primary) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'server in use';
  END IF;
  UPDATE public.dma_servers
     SET enabled = coalesce(p_enabled, false), updated_at = now()
   WHERE key = p_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_server_enabled(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_server_enabled(text, boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_set_server_enabled(text, boolean) TO service_role;

-- 증권사 주문 서버 교체 — 같은 증권사 기존 주문 서버 해제 → 대상 지정(한 트랜잭션 · 증권사 행 잠금).
CREATE OR REPLACE FUNCTION public.dma_admin_set_order_server(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.dma_servers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.dma_servers s WHERE s.key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'server not found';
  END IF;
  PERFORM 1 FROM public.dma_servers s WHERE s.broker = v_row.broker ORDER BY s.key FOR UPDATE;
  SELECT * INTO v_row FROM public.dma_servers s WHERE s.key = p_key;
  IF NOT v_row.enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'server disabled';
  END IF;
  UPDATE public.dma_servers
     SET is_order_server = false, updated_at = now()
   WHERE broker = v_row.broker AND is_order_server AND key <> p_key;
  UPDATE public.dma_servers
     SET is_order_server = true, updated_at = now()
   WHERE key = p_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_order_server(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_order_server(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_set_order_server(text) TO service_role;

-- 시세 주 서버 교체 — 전체 기존 해제 → 대상 지정(한 트랜잭션 · 전 행 잠금).
CREATE OR REPLACE FUNCTION public.dma_admin_set_quote_primary(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.dma_servers%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.dma_servers s ORDER BY s.key FOR UPDATE;
  SELECT * INTO v_row FROM public.dma_servers s WHERE s.key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'server not found';
  END IF;
  IF NOT v_row.enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'server disabled';
  END IF;
  UPDATE public.dma_servers
     SET is_quote_primary = false, updated_at = now()
   WHERE is_quote_primary AND key <> p_key;
  UPDATE public.dma_servers
     SET is_quote_primary = true, updated_at = now()
   WHERE key = p_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_quote_primary(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_set_quote_primary(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_set_quote_primary(text) TO service_role;

COMMIT;
