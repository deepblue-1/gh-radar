-- ============================================================
-- quick-260929-sas — 게이트웨이 인지 주문 가시성 (T-c8e-02 대체).
--
-- 무엇을 바꾸는가:
--   지금까지 gh-radar 사용자 ↔ 게이트웨이 계좌 가시성은 dma_credentials.dma_user_id 문자열 하나를 **모든
--   게이트웨이**의 dma_account_access 와 이어 정했다(게이트웨이 무관 문자열 조인). 교보 users.toml 에 KB 의
--   다른 사람과 같은 user_id 문자열이 들어오면 그 사람에게 교보 계좌 주문이 샌다. 이 파일은 가시성을
--   게이트웨이 인지로 바꾼다 — KB(주 게이트웨이)는 자격증명 신원으로, 추가 게이트웨이(KYOBO)는 **명시적
--   신원 연결**로만 보인다. 규칙은 뷰 dma_visibility_identities **한 곳**이고, 조회 RPC 3종이 전부
--   dma_visible_accounts(p_user_id) 하나를 거친다.
--
-- 결정 근거:
--   D-01  dma_credentials.gateway text NOT NULL DEFAULT 'KB' — 자격증명 자신의 게이트웨이. PK(user_id) 는
--         그대로이고 (gateway, dma_user_id) UNIQUE 는 만들지 않는다 — 한 dma_user_id 를 gh-radar 사용자 여럿이
--         공유하는 실데이터가 있다.
--   D-02  dma_gateway_identities(user_id → auth.users ON DELETE CASCADE, gateway, dma_user_id, created_at,
--         PK (user_id, gateway)) — 서비스롤 전용(RLS 활성 · 정책 0개 · anon/authenticated 명시 REVOKE —
--         메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 · dma_credentials 잠금 4줄과 같다).
--   D-03  신원 집합 = 자격증명 신원 UNION ALL 연결 신원. 모든 가시성 조인이 gateway + dma_user_id 둘 다로
--         잇는다. 규칙은 뷰 하나, 풀이는 SQL 헬퍼 dma_visible_accounts 하나.
--         뷰 정밀화 두 조건(의미 유지):
--           (a) 연결 신원은 **그 사용자에게 자격증명이 있을 때만** 센다 — D-12(자격증명 행 = allowlist)를 REST
--               에서도 지킨다. 자격증명을 지우면 연결 행이 남아도 아무것도 보이지 않는다.
--           (b) **연결 gateway 가 자격증명 gateway 와 다를 때만** 센다 — relay 주 게이트웨이 푸시는 자격증명
--               문자열로 라우팅하고(불변) 같은 게이트웨이 연결을 보지 않는다. REST 만 넓어져 푸시와 어긋나지 않게.
--   D-04  시드는 데이터 기반이다(저장소에 실 id 리터럴 0). 적용 시점 원격 데이터에서 KYOBO 매핑에 있는
--         dma_user_id 를 가진 자격증명 행마다 (user_id, 'KYOBO', dma_user_id) 연결을 넣어 오늘 승인된 KYOBO
--         가시성을 그대로 재현한다. 이후 새 KYOBO id 는 KB 자격증명 문자열과 같아도 명시 연결 전까지 아무에게도
--         안 보인다(infra/relay/README.md 「신원 연결 추가 · 제거」 절차).
--   D-05  relay 추가 게이트웨이 푸시(journal.rows · journal.events)도 같은 뷰를 읽는다(relay/src/journal/identities.ts).
--
-- 적용 순서: **이 파일은 20260929180200(Phase 25 조회 RPC) 뒤에 적용돼야 한다** — ⑦ 이 전략 조회 RPC 2종을 여기서
--   재정의한다. 20260929180200 의 두 함수 본문은 이력이며, 원격에서는 이 파일이 덮는다.
--
-- 멱등: ADD COLUMN IF NOT EXISTS · CREATE TABLE IF NOT EXISTS · 시드 ON CONFLICT DO NOTHING ·
--   CREATE OR REPLACE VIEW/FUNCTION · 권한 줄은 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서):
--   1. ⑨ dma_journal_orders_for_user 는 20260924200100 본문으로, dma_strategy_events_for_user ·
--      dma_order_events_for_user 는 20260929180200 본문으로 CREATE OR REPLACE (권한 3줄씩 재명시)
--   2. DROP FUNCTION public.dma_visible_accounts(uuid)
--   3. DROP VIEW public.dma_visibility_identities
--   4. DROP TABLE public.dma_gateway_identities
--   5. ALTER TABLE public.dma_credentials DROP COLUMN gateway
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) 추가 — 새 테이블 · 뷰 · 함수 모두 서비스롤 전용이다.
--   - (gateway, dma_user_id) UNIQUE — 공유 계정 실데이터가 있다.
--   - 실 id 리터럴 — 시드는 원격 데이터로만 정해진다.
--   - SECURITY DEFINER — 전부 INVOKER(호출자는 service_role).
-- ============================================================

BEGIN;

-- ── ① 자격증명 자신의 게이트웨이 (D-01) ─────────────────────────────
-- relay SessionManager 로그인은 여전히 DMA_BROKER 게이트웨이다 — 이 칸은 가시성 규칙용이다.
-- 기존 행은 전부 'KB' 가 된다.
ALTER TABLE public.dma_credentials
  ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'KB' CHECK (gateway <> '');

-- ── ② 신원 연결 테이블 (D-02) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dma_gateway_identities (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway     text        NOT NULL CHECK (gateway <> ''),
  dma_user_id text        NOT NULL CHECK (dma_user_id <> ''),   -- 그 게이트웨이 users.toml user_id
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gateway)
);

-- 서비스롤 전용: RLS 활성 + 접근 규칙 0개 = 모든 클라이언트 role default deny.
ALTER TABLE public.dma_gateway_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_gateway_identities FROM PUBLIC;
REVOKE ALL ON public.dma_gateway_identities FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_gateway_identities TO service_role;

-- ── ③ 시드 — 오늘 승인된 KYOBO 가시성 재현 (D-04) ────────────────────
-- 적용 시점 원격 데이터로만 정해진다(로컬 재생에서는 0행). 이후 새 KYOBO id 는 README 절차로만 연결한다.
INSERT INTO public.dma_gateway_identities (user_id, gateway, dma_user_id)
SELECT DISTINCT c.user_id, 'KYOBO', c.dma_user_id
  FROM public.dma_credentials c
 WHERE EXISTS (
   SELECT 1
     FROM public.dma_account_access a
    WHERE a.gateway = 'KYOBO'
      AND a.dma_user_id = c.dma_user_id)
ON CONFLICT (user_id, gateway) DO NOTHING;

-- ── ④ 규칙 뷰 — 가시성 신원의 정본 (D-03) ──────────────────────────
-- 첫 갈래 = 자격증명 신원(전 행). 둘째 갈래 = 연결 신원 — 자격증명이 있는 사용자만(a) ·
-- 자격증명과 다른 게이트웨이만(b). PK(user_id, gateway) 와 (b) 덕에 사용자 · 게이트웨이당 신원은 1개다.
CREATE OR REPLACE VIEW public.dma_visibility_identities
WITH (security_invoker = true) AS
  SELECT c.user_id, c.gateway, c.dma_user_id
    FROM public.dma_credentials c
  UNION ALL
  SELECT l.user_id, l.gateway, l.dma_user_id
    FROM public.dma_gateway_identities l
    JOIN public.dma_credentials c
      ON c.user_id = l.user_id
   WHERE l.gateway <> c.gateway;

REVOKE ALL ON public.dma_visibility_identities FROM PUBLIC;
REVOKE ALL ON public.dma_visibility_identities FROM anon, authenticated;
GRANT SELECT ON public.dma_visibility_identities TO service_role;

-- ── ⑤ 헬퍼 — 사용자 → 가시 (gateway, account_no) ────────────────────
-- 조회 RPC 3종의 가시성 조인이 전부 이 함수 호출 하나다. DISTINCT 라 한 계좌가 두 번 나오지 않는다.
CREATE OR REPLACE FUNCTION public.dma_visible_accounts(p_user_id uuid)
RETURNS TABLE (gateway text, account_no text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT a.gateway, a.account_no
    FROM public.dma_account_access a
    JOIN public.dma_visibility_identities i
      ON i.gateway = a.gateway AND i.dma_user_id = a.dma_user_id
   WHERE i.user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) TO service_role;

-- ── ⑥ ⑨ 사용자별 오늘 주문 조회 재정의 (server GET /api/orders 왕복 1회) ──
-- 가시성 = dma_visible_accounts(p_user_id) (규칙 뷰 dma_visibility_identities — 게이트웨이 인지).
-- 헬퍼가 (gateway, account_no) DISTINCT 라 한 주문 행이 두 번 나오지 않는다. dma_user_id 는 반환하지 않는다
-- (T-19-08 · D-08). p_user_id 는 server 가 requireAuth 로 확정한 값만 넘긴다 — service_role 전용이다(T-19-01).
-- 시그니처 · 반환 25칸 · 정렬은 20260924200100 과 같다(server 무수정).
CREATE OR REPLACE FUNCTION public.dma_journal_orders_for_user(p_user_id uuid, p_trade_date date)
RETURNS TABLE (
  id            uuid,
  trade_date    date,
  account_no    text,
  isin          text,
  stock_code    text,
  exchange      text,
  board         text,
  side          text,
  order_type    text,
  org_order_no  text,
  qty           integer,
  price         integer,
  order_no      text,
  filled_qty    integer,
  modified_qty  integer,
  status        text,
  result_code   integer,
  notice_type   text,
  message       text,
  origin        text,
  requester     text,
  request_kind  text,
  last_seq      bigint,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.trade_date, o.account_no, o.isin, s.code AS stock_code, o.exchange, o.board,
         o.side, o.order_type, o.org_order_no, o.qty, o.price, o.order_no, o.filled_qty,
         o.modified_qty, o.status, o.result_code, o.notice_type, o.message, o.origin,
         o.requester, o.request_kind, o.last_seq, o.created_at, o.updated_at
    FROM public.dma_account_orders o
    JOIN public.dma_visible_accounts(p_user_id) v
      ON v.gateway = o.gateway AND v.account_no = o.account_no
    LEFT JOIN public.stocks s
      ON s.isin = o.isin
   WHERE o.trade_date = p_trade_date
   ORDER BY o.created_at DESC, o.last_seq DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) TO service_role;

COMMIT;
