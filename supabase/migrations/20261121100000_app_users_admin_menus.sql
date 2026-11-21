-- ============================================================
-- quick 261121-n1b — trader 에게 어드민 메뉴(매매손익 · 정산)만 골라 연다: 저장 열 · 본인 메뉴 RPC · 사용자 개요 원자료 · millesjung 켜기.
--
-- 결정 근거:
--   - 사용자 결정(2026-11-21 · 스케치 034 A 채택): 정산 담당 trader(millesjung@gmail.com)가 관리자 계정을 빌리지 않고
--     매매손익 확인 · 정산 처리(보기 + 거래 저장 · 지우기 · 다시 반영 · 정산 확정 · 취소)를 한다. 사용자 · 계좌 · 서버 ·
--     러쉬 주문은 계속 admin 전용.
--   - 규칙(정본 한 줄): 메뉴는 **role = trader 일 때만** 효력 — admin 은 원래 전부, viewer 는 저장값이 있어도 없음.
--     역할이 바뀌어도 저장값은 그대로 둔다(효력만 없어짐). 판정은 server requireAdminOrMenu · webapp middleware ·
--     사이드바(my_admin_menus) 셋이 같은 규칙으로 한다.
--   - 저장 = app_users.admin_menus text[] (CHECK 로 'pnl' · 'settlement' 만). 별도 표를 두지 않는다 — 사용자당 많아야
--     2개이고 역할과 같은 행에서 함께 읽힌다(관문 조회 왕복 1회 그대로).
--
-- 적용: additive — 원격은 quick 261121-n1b 의 배포 체크포인트(메인 세션)에서만. **server 배포보다 먼저** 적용한다
--   (새 server 가 app_users.admin_menus 를 select 한다). 옛 server · relay 는 새 열을 읽지 않으므로 무영향
--   (relay 는 서비스롤 RPC dma_app_access_map() 의 명시 열로만 app_users 를 읽는다).
--   admin_users_raw() 는 20261010200100 의 ⑦ 본문을 그대로 CREATE OR REPLACE 하고 appUsers 에 'adminMenus' 한 키만 더한다
--   (시그니처 무변경 · 나머지 키 · 정렬 그대로 · 권한 3줄 재선언).
-- 멱등: ADD COLUMN IF NOT EXISTS · 제약은 pg_constraint 확인 뒤 추가 · CREATE OR REPLACE FUNCTION · 권한 줄 ·
--   millesjung UPDATE(같은 값) 모두 재실행해도 같은 상태다.
-- 되돌리기(수동 · 이 순서): ① DROP FUNCTION public.my_admin_menus() → ② 20261010200100 의 ⑦ admin_users_raw 블록을 다시
--   실행(옛 본문 복원) → ③ ALTER TABLE app_users DROP CONSTRAINT chk_app_users_admin_menus → ④ DROP COLUMN admin_menus.
--   (④ 에서 Admin 이 켠 메뉴가 사라진다 — 그 전에 server 를 옛 이미지로 되돌려야 pnl · 정산 요청이 500 이 되지 않는다.)
--
-- 하지 않는 것:
--   - my_app_access() 시그니처 · 본문 변경(relay · 기타 소비처) — 메뉴는 별도 RPC my_admin_menus() 로 본다.
--   - 접근 규칙(POLICY) — app_users 는 그대로 서비스롤 전용. 클라이언트는 본인 1행 RPC 로만 메뉴를 본다.
--   - 역할 변경 시 메뉴 지우기 — 효력은 역할이 정한다.
-- ============================================================

BEGIN;

-- ── ① 저장 열 · CHECK ──────────────────────────────────────────────
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS admin_menus text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_app_users_admin_menus'
       AND conrelid = 'public.app_users'::regclass
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT chk_app_users_admin_menus CHECK (admin_menus <@ ARRAY['pnl','settlement']::text[]);
  END IF;
END;
$$;

COMMENT ON COLUMN public.app_users.admin_menus IS
  'quick 261121-n1b — trader 에게 연 어드민 메뉴(pnl · settlement). role = trader 일 때만 효력 · admin 은 전부 · viewer 는 없음 · 역할 변경 시 값은 남김(효력만 없어짐).';

-- ── ② 본인 메뉴 RPC (webapp middleware · 사이드바) ─────────────────────
-- 본인 1행(JWT 이메일 기준)에서 role = trader 이면 admin_menus, 아니면 '{}'. 행이 없으면(승인 대기 · 이메일 없는 JWT) '{}'.
-- admin 이 '{}' 를 받는 것은 의도다 — admin 판정은 my_app_access() 가 하고, 이 RPC 는 trader 메뉴만 답한다.
CREATE OR REPLACE FUNCTION public.my_admin_menus()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT CASE WHEN a.role = 'trader' THEN a.admin_menus ELSE '{}'::text[] END
       FROM public.app_users a
      WHERE a.email = lower(auth.jwt() ->> 'email')),
    '{}'::text[]
  );
$$;
-- 플랫폼이 PUBLIC · anon 에 EXECUTE 를 auto-grant 한다 → 명시 REVOKE 후 authenticated 에만 GRANT.
REVOKE EXECUTE ON FUNCTION public.my_admin_menus() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_admin_menus() FROM anon;
GRANT  EXECUTE ON FUNCTION public.my_admin_menus() TO authenticated;

-- ── ③ 사용자 개요 원자료 — 20261010200100 ⑦ 본문 + appUsers[].adminMenus ─────────────
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
               'signedUp',  EXISTS (SELECT 1 FROM auth.users u WHERE lower(btrim(u.email)) = a.email),
               'adminMenus', to_jsonb(a.admin_menus)
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

-- ── ④ millesjung 두 메뉴 켜기(사용자 결정 2026-11-21) ────────────────────
-- 운영에서 millesjung@gmail.com 은 trader 행이 이미 있다. 로컬 재생에선 행이 없어 0행(정상) — 행을 만들지 않는다.
UPDATE public.app_users
   SET admin_menus = ARRAY['pnl','settlement']::text[], updated_at = now()
 WHERE email = 'millesjung@gmail.com';

COMMIT;
