-- ============================================================
-- quick 261107-moq — 「서버에만 있음」 계좌 하나를 Admin 확인 뒤 의도로 들인다(연결 · 서버에서 빼기 공용 RPC).
--
-- 배경: 11/5 교보 112 를 119 의 users.toml 복사로 다시 세팅해, DB 의도(dma_account_servers)에 없는 계좌가 87 에만
--       남았다(「서버에만 있음」). 연결 해제 op 는 DB 등록 서버에만 가므로 그 서버에는 닿지 않았고, 수동 SQL ·
--       relay 내부 DELETE 런북으로 정리했다. gh-trade-85 의견대로 D-23 ⑤(DB 에 없는 서버 계좌는 자동으로 안 건드림)는
--       유지하고, Admin 이 화면에서 **확인을 받아** 한 계좌씩 등록하게 한다.
--
-- 결정 근거:
--   D-02  「연결」과 「서버에서 빼기」는 이 RPC 하나다. 둘 다 87 원천 서버마다 등록 행을 만들고, 차이는 상태뿐 —
--         연결 = active(서버에 이미 같은 값이 있으니 op 없음) · 빼기 = removing(relay 기존 planner 가 op 4 / op 2 로
--         보내고 settle 이 행 · 연결을 지운다 — planner · dispatcher 무변경).
--   원천 = dma_server_user_accounts(87) 중 그 (유저, 계좌번호) · 서버 증권사 = p_broker · **enabled 서버만** ·
--         dma_account_servers 에 그 (유저, 증권사, 계좌, 서버) 행이 아직 없는 것. 0건이면 P0001 NOT_SERVER_ONLY
--         (이미 정리됐거나 오래된 화면 · 꺼진 서버뿐 · 다른 증권사 서버뿐 · 이미 등록된 서버뿐).
--   계좌번호: 입력과 87 원문을 shared normalizeAccountNo 와 같은 규칙(앞뒤 공백/탭 제거 → 앞자리 0 제거 → 전부 0 이면 "0")
--         으로 정규화해 맞춘다. 의도 표 키는 정규화값이다(87 표는 원문 그대로 — 이 파일은 87 표를 바꾸지 않는다).
--   계좌 값: 원천 중 서버 sort_order 첫 행의 name · branch_no · trader_id · priority 로 ON CONFLICT DO NOTHING.
--         CHECK(KB branch 5 · trader 6 · 교보 빈 값)는 미리 거르지 않는다 — 깨진 87 값은 23514 그대로 올라간다
--         (기존 dma_admin_adopt_server_accounts 의 사전 필터는 복제하지 않는다 — 한 계좌를 Admin 이 고른 것이니 조용히
--         넘기지 않고 거부를 보인다). 계좌 마스터(dma_accounts)는 기존 트리거가 채운다.
--   잠금: dma_admin_mark_account_removed 와 같은 dma_users 행 FOR UPDATE — 같은 유저의 의도 변경과 줄 세운다.
--         없으면 P0001 NO_DMA_USER.
--   기존 dma_admin_adopt_server_accounts(p_server)(서버 통째 입양 · 배포 창 런북)는 손대지 않는다.
--
-- 권한: 새 RPC 권한 3줄(REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role) — service_role(relay) 전용.
--       auto-grant 가 PUBLIC REVOKE 를 덮으므로 anon · authenticated 를 명시한다.
-- 적용: additive — 메인 세션이 원격 적용(DB → relay → server → webapp 순).
-- 멱등: CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다.
-- 되돌리기(수동): DROP FUNCTION public.dma_admin_adopt_server_only_account(text, text, text, boolean);
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_admin_adopt_server_only_account(
  p_dma_user_id text,
  p_broker      text,
  p_account_no  text,
  p_remove      boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acct    text;
  v_servers text[];
BEGIN
  -- (a) 유저 잠금 · 존재 확인
  PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_DMA_USER';
  END IF;

  -- (b) 입력 계좌번호 정규화 — shared normalizeAccountNo 와 같은 규칙. 이 값이 의도 표 키다.
  v_acct := ltrim(btrim(coalesce(p_account_no, ''), E' \t'), '0');
  IF v_acct = '' THEN
    v_acct := CASE WHEN btrim(coalesce(p_account_no, ''), E' \t') = '' THEN '' ELSE '0' END;
  END IF;

  -- (c) 원천 서버 — 87 에 있고 · 그 증권사 · enabled · 아직 등록 행이 없는 서버(sort_order 순)
  SELECT array_agg(s.key ORDER BY s.sort_order, s.key) INTO v_servers
    FROM public.dma_server_user_accounts c
    JOIN public.dma_servers s ON s.key = c.server_key
   WHERE c.dma_user_id = p_dma_user_id
     AND s.broker = p_broker
     AND s.enabled
     AND v_acct <> ''
     AND ltrim(btrim(c.account_no, E' \t'), '0') = ltrim(v_acct, '0')
     AND btrim(c.account_no, E' \t') <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.dma_account_servers x
        WHERE x.dma_user_id = p_dma_user_id AND x.broker = p_broker
          AND x.account_no = v_acct AND x.server_key = c.server_key
     );
  IF v_servers IS NULL OR cardinality(v_servers) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_SERVER_ONLY';
  END IF;

  -- (d) 계좌 — 원천 중 sort_order 첫 서버의 87 값. 이미 있으면 그대로(CHECK 위반은 23514 그대로 올라간다).
  INSERT INTO public.dma_user_accounts (dma_user_id, broker, account_no, name, branch_no, trader_id, priority)
  SELECT p_dma_user_id, p_broker, v_acct, c.name, c.branch_no, c.trader_id, c.priority
    FROM public.dma_server_user_accounts c
    JOIN public.dma_servers s ON s.key = c.server_key
   WHERE c.dma_user_id = p_dma_user_id
     AND c.server_key = ANY (v_servers)
     AND ltrim(btrim(c.account_no, E' \t'), '0') = ltrim(v_acct, '0')
     AND btrim(c.account_no, E' \t') <> ''
   ORDER BY s.sort_order, s.key, c.account_no
   LIMIT 1
  ON CONFLICT (dma_user_id, broker, account_no) DO NOTHING;

  -- (e) 원천 서버마다 등록 행 — 연결 = active · 빼기 = removing(is_order 는 기본 false)
  INSERT INTO public.dma_account_servers (dma_user_id, broker, account_no, server_key, state)
  SELECT p_dma_user_id, p_broker, v_acct, k,
         CASE WHEN p_remove IS TRUE THEN 'removing' ELSE 'active' END
    FROM unnest(v_servers) AS k;

  -- (f) 반환 — 원천 서버 키(sort_order 순)
  RETURN jsonb_build_object('servers', to_jsonb(v_servers));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dma_admin_adopt_server_only_account(text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_admin_adopt_server_only_account(text, text, text, boolean) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_admin_adopt_server_only_account(text, text, text, boolean) TO service_role;

COMMIT;
