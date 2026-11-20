-- ============================================================
-- Phase 44 — 어드민 정산(/admin/settlement) 표 5 · 조회 RPC 2 · 내부 함수 1.
--
-- 결정 근거(.planning/phases/44-admin-settlement/44-CONTEXT.md):
--   D-01  계좌 수익 = 예수금 − 넣은 돈. 넣은 돈 = 그 계좌로 들어온 돈(출자 · 옮겨 온 돈) − 나간 돈(수익 출금 · 원금 회수 ·
--         옮겨 간 돈). 계산은 shared(settlement.ts) 한 벌 — 이 파일은 거래 · 정산 · 마지막 읽은 예수금을 담기만 한다.
--   D-04  relay 로 읽은 예수금은 settlement_budget_reads 에 계좌당 1행(마지막 값 · 시각)으로 남긴다 — 못 읽을 때 그 값을 쓴다.
--         0 도 그대로 저장한다(「미설정」 을 기억).
--   D-05 · D-07  거래 종류는 withdraw_profit · withdraw_principal · contribute · move 네 가지뿐 — 손익 보정 · 공동 비용 칸 없음.
--   D-14  시드 9건은 별도 마이그레이션(`_settlement_seed.sql` · 44-04)이 넣는다 — 이 파일은 표만 만든다.
--   D-21  고치기 · 지우기 · 정산 취소 이력은 DB 에만 남긴다(settlement_ledger 의 지움 표시 열 · settlement_ledger_history ·
--         settlement_settles.cancelled_at). 화면은 지운 줄 · 취소한 정산을 보이지 않는다.
--   D-29  출자 · 원금 회수의 사람은 그 계좌 묶음의 비율에 있는 사람 — 심쥬니(J)는 현중 · 근형 묶음 계좌(kbG · kyH · kyG)에
--         출자 · 원금 회수할 수 없다(표 CHECK settlement_ledger_person_pool).
--
-- 권한: 새 표 RLS on · 정책 없음 · service_role 전용(REVOKE PUBLIC · anon, authenticated 명시 — auto-grant 함정).
--   RPC · 내부 함수도 REVOKE PUBLIC · anon, authenticated 명시 · GRANT service_role. 조회 RPC 2 는 SECURITY DEFINER ·
--   search_path 고정. 화면은 Express(`GET /api/admin/settlement` · requireAdmin) 를 지나서만 읽는다.
--
-- 오류 규약: 업무 오류는 `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`(20261106300000 과 같다 —
--   쓰기 RPC 는 44-03 이 더한다). 인자 모양 위반은 22023 · CHECK 위반은 23514 · FK 위반은 23503 그대로.
--
-- 멱등: CREATE TABLE/INDEX IF NOT EXISTS · CREATE OR REPLACE FUNCTION · 권한 줄은 재실행해도 같은 상태다.
--
-- 되돌리기(수동 · 이 순서): ① DROP FUNCTION admin_settlement_raw() · settlement_record_reads(jsonb) ·
--   settlement_ledger_json(settlement_ledger) → ② DROP TABLE settlement_ledger_history → ③ DROP TABLE settlement_ledger →
--   ④ DROP TABLE settlement_settles → ⑤ DROP TABLE settlement_budget_reads → ⑥ DROP TABLE settlement_accounts.
--
-- 원격 적용: 커밋만 — 원격은 44-13 이 `supabase db push` 로 올린다.
-- 이 파일은 커밋 뒤 고치지 않는다 — 다른 세션의 db push 로 이미 원격에 적용됐을 수 있다. 쓰기 RPC 는 44-03 이 새 버전 파일
--   (`_settlement_ledger_rpc` · `_settlement_settle_rpc`)로 더하고, 고칠 것이 생기면 새 버전 파일을 더한다.
--
-- 하지 않는 것: 접근 규칙(POLICY) · 시작값 · 경계 날짜 · 손익 보정 · 잔액 대조(D-02) · 체결 · 매매손익 데이터 읽기.
-- ============================================================

BEGIN;

-- ── ① 계좌 대응 — 계좌 키 → 계좌 마스터의 (증권사, 계좌번호). 이름 · 명의 · 묶음은 shared 상수(R0). ──────────
CREATE TABLE IF NOT EXISTS public.settlement_accounts (
  acc_key     text        PRIMARY KEY CHECK (acc_key IN ('kbG','kyH','kyG','kbH')),
  broker      text        NOT NULL,
  account_no  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker, account_no),
  FOREIGN KEY (broker, account_no) REFERENCES public.dma_accounts (broker, account_no) ON DELETE RESTRICT
);

ALTER TABLE public.settlement_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settlement_accounts FROM PUBLIC;
REVOKE ALL ON public.settlement_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_accounts TO service_role;

-- ── ② 마지막으로 읽은 예수금(D-04) — 계좌당 1행 · 0 도 그대로. ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_budget_reads (
  acc_key     text        PRIMARY KEY CHECK (acc_key IN ('kbG','kyH','kyG','kbH')),
  budget_krw  bigint      NOT NULL CHECK (budget_krw >= 0),
  source      text        NOT NULL CHECK (source IN ('live','snapshot')),
  server_key  text,
  read_at     timestamptz NOT NULL
);

ALTER TABLE public.settlement_budget_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settlement_budget_reads FROM PUBLIC;
REVOKE ALL ON public.settlement_budget_reads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_budget_reads TO service_role;

-- ── ③ 정산 기록 — 몫 · 그때의 계좌 값(snapshot)을 저장한다(규칙이 바뀌어도 지난 정산 불변 · D-01 costly). ──────
-- snapshot = { accounts: [{accKey, budgetKrw, putKrw, inKrw, outKrw, profitKrw, stale, readAt}], cumKrw, prevKrw }.
CREATE TABLE IF NOT EXISTS public.settlement_settles (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool          text        NOT NULL CHECK (pool IN ('p1','p2')),
  profit_krw    bigint      NOT NULL CHECK (profit_krw > 0),
  shares        jsonb       NOT NULL,
  snapshot      jsonb       NOT NULL,
  read_at       timestamptz NOT NULL,
  memo          text        NOT NULL DEFAULT '' CHECK (length(memo) <= 100),
  created_by    text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  cancelled_by  text
);
CREATE INDEX IF NOT EXISTS ix_settlement_settles_pool_live
  ON public.settlement_settles (pool, id DESC) WHERE cancelled_at IS NULL;

ALTER TABLE public.settlement_settles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settlement_settles FROM PUBLIC;
REVOKE ALL ON public.settlement_settles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_settles TO service_role;

-- ── ④ 거래 기록 — 종류 네 가지(D-05 · D-07) · 종류별 모양 · 사람-묶음 규칙(D-29) · 지움 표시(D-21). ─────────
CREATE TABLE IF NOT EXISTS public.settlement_ledger (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tx_date         date        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('withdraw_profit','withdraw_principal','contribute','move')),
  who             text        CHECK (who IN ('H','G','J')),
  from_acc        text        CHECK (from_acc IN ('kbG','kyH','kyG','kbH')),
  to_acc          text        CHECK (to_acc IN ('kbG','kyH','kyG','kbH')),
  via             text        CHECK (via IN ('transfer','corp_service')),
  amount_krw      bigint      NOT NULL CHECK (amount_krw > 0),
  memo            text        NOT NULL DEFAULT '' CHECK (length(memo) <= 100),
  settle_id       bigint      REFERENCES public.settlement_settles (id),
  reflect         boolean     NOT NULL DEFAULT false,
  pend            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  seeded          boolean     NOT NULL DEFAULT false,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_by       text,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      text,
  deleted_reason  text        CHECK (deleted_reason IN ('delete','settle_cancel')),
  -- 종류별 모양: 출자 = 사람 + 받은 계좌 / 수익 출금 · 원금 회수 = 사람 + 뺀 계좌 / 계좌 옮김 = 두 계좌(서로 다름) + 경로.
  CONSTRAINT settlement_ledger_shape CHECK (
       (kind = 'contribute'
        AND who IS NOT NULL AND to_acc IS NOT NULL AND from_acc IS NULL AND via IS NULL)
    OR (kind IN ('withdraw_profit','withdraw_principal')
        AND who IS NOT NULL AND from_acc IS NOT NULL AND to_acc IS NULL AND via IS NULL)
    OR (kind = 'move'
        AND who IS NULL AND from_acc IS NOT NULL AND to_acc IS NOT NULL AND from_acc <> to_acc AND via IS NOT NULL)
  ),
  -- D-29: 출자 · 원금 회수의 사람은 그 계좌 묶음의 비율에 있는 사람 — 심쥬니는 현중 · 근형 묶음 계좌(kbG · kyH · kyG)에 없다.
  CONSTRAINT settlement_ledger_person_pool CHECK (
    NOT (kind IN ('contribute','withdraw_principal') AND who = 'J' AND coalesce(to_acc, from_acc) IN ('kbG','kyH','kyG'))
  )
);
CREATE INDEX IF NOT EXISTS ix_settlement_ledger_live
  ON public.settlement_ledger (tx_date DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_settlement_ledger_settle
  ON public.settlement_ledger (settle_id);

ALTER TABLE public.settlement_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settlement_ledger FROM PUBLIC;
REVOKE ALL ON public.settlement_ledger FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_ledger TO service_role;

-- ── ⑤ 거래 이력(D-21) — 고치기 · 지우기 · 정산 취소 전의 줄 값. ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_ledger_history (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_id  bigint      NOT NULL REFERENCES public.settlement_ledger (id),
  action     text        NOT NULL CHECK (action IN ('edit','delete','settle_cancel')),
  before     jsonb       NOT NULL,
  by         text,
  at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_ledger_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settlement_ledger_history FROM PUBLIC;
REVOKE ALL ON public.settlement_ledger_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_ledger_history TO service_role;

-- ── ⑥ 내부 함수 — 거래 줄 17키 조립 한 벌(조회 RPC 의 ledger · 44-03 쓰기 RPC 의 반환이 함께 쓴다). ─────────────
-- 키는 shared SettlementLedgerRow 와 글자 그대로(camelCase). txDate 는 'YYYY-MM-DD'.
CREATE OR REPLACE FUNCTION public.settlement_ledger_json(r public.settlement_ledger)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id',        r.id,
    'txDate',    to_char(r.tx_date, 'YYYY-MM-DD'),
    'kind',      r.kind,
    'who',       r.who,
    'fromAcc',   r.from_acc,
    'toAcc',     r.to_acc,
    'via',       r.via,
    'amountKrw', r.amount_krw,
    'memo',      r.memo,
    'settleId',  r.settle_id,
    'reflect',   r.reflect,
    'pend',      r.pend,
    'seeded',    r.seeded,
    'createdBy', r.created_by,
    'createdAt', r.created_at,
    'editedBy',  r.edited_by,
    'editedAt',  r.edited_at
  );
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_json(public.settlement_ledger) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_ledger_json(public.settlement_ledger) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_ledger_json(public.settlement_ledger) TO service_role;
COMMENT ON FUNCTION public.settlement_ledger_json(public.settlement_ledger) IS
  'Phase 44 — 정산 거래 줄 17키 jsonb(shared SettlementLedgerRow). 조회 · 쓰기 RPC 공용 한 벌.';

-- ── ⑦ RPC 조회 — GET /api/admin/settlement (DB 왕복 1). ─────────────────────────────────
-- 키는 shared SettlementRaw 그대로. accounts = 계좌 대응 ⨝ 계좌 마스터(kbG · kyH · kyG · kbH 순) · links 는 dma_user_id 오름차순
-- (「첫 known 사용자」 규칙 — admin_accounts_raw 와 같은 순서) · servers 는 sort_order, server_key 순 + isOrder ·
-- registry 는 dma_servers 전부(sort_order, key 순) · reads 는 acc_key 순 · ledger 는 지운 줄 제외 id 오름차순 ·
-- settles 는 취소 제외 id 내림차순. 모든 배열 coalesce '[]'.
CREATE OR REPLACE FUNCTION public.admin_settlement_raw()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'accounts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'accKey',    a.acc_key,
               'broker',    a.broker,
               'accountNo', a.account_no,
               'name',      m.name,
               'links', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'dmaUserId', l.dma_user_id,
                          'servers', coalesce((
                            SELECT jsonb_agg(jsonb_build_object(
                                     'serverKey', s.server_key,
                                     'state',     s.state,
                                     'isOrder',   s.is_order)
                                   ORDER BY coalesce(r.sort_order, 2147483647), s.server_key)
                              FROM public.dma_account_servers s
                              LEFT JOIN public.dma_servers r ON r.key = s.server_key
                             WHERE s.dma_user_id = l.dma_user_id AND s.broker = l.broker AND s.account_no = l.account_no
                          ), '[]'::jsonb)
                        ) ORDER BY l.dma_user_id)
                   FROM public.dma_user_accounts l
                  WHERE l.broker = a.broker AND l.account_no = a.account_no
               ), '[]'::jsonb)
             ) ORDER BY array_position(ARRAY['kbG','kyH','kyG','kbH'], a.acc_key))
        FROM public.settlement_accounts a
        JOIN public.dma_accounts m ON m.broker = a.broker AND m.account_no = a.account_no
    ), '[]'::jsonb),
    'registry', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'key',           r.key,
               'broker',        r.broker,
               'enabled',       r.enabled,
               'isOrderServer', r.is_order_server)
             ORDER BY r.sort_order, r.key)
        FROM public.dma_servers r
    ), '[]'::jsonb),
    'reads', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'accKey',    b.acc_key,
               'budgetKrw', b.budget_krw,
               'source',    b.source,
               'serverKey', b.server_key,
               'readAt',    b.read_at)
             ORDER BY b.acc_key)
        FROM public.settlement_budget_reads b
    ), '[]'::jsonb),
    'ledger', coalesce((
      SELECT jsonb_agg(public.settlement_ledger_json(l) ORDER BY l.id)
        FROM public.settlement_ledger l
       WHERE l.deleted_at IS NULL
    ), '[]'::jsonb),
    'settles', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id',        s.id,
               'pool',      s.pool,
               'profitKrw', s.profit_krw,
               'shares',    s.shares,
               'snapshot',  s.snapshot,
               'readAt',    s.read_at,
               'memo',      s.memo,
               'createdBy', s.created_by,
               'createdAt', s.created_at)
             ORDER BY s.id DESC)
        FROM public.settlement_settles s
       WHERE s.cancelled_at IS NULL
    ), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_settlement_raw() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_settlement_raw() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_settlement_raw() TO service_role;
COMMENT ON FUNCTION public.admin_settlement_raw() IS
  'Phase 44 — 정산 화면 조회 한 벌(shared SettlementRaw: accounts · registry · reads · ledger · settles). service_role 전용.';

-- ── ⑧ RPC 읽은 예수금 기록(D-04) — [{accKey, budgetKrw, source, serverKey, readAt}] upsert. ─────────────
-- 같은 계좌가 배열에 두 번 있으면 뒤의 것을 쓴다(ON CONFLICT 가 한 문장에서 같은 행을 두 번 못 고친다).
CREATE OR REPLACE FUNCTION public.settlement_record_reads(p_reads jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_reads IS NULL OR jsonb_typeof(p_reads) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_reads must be a jsonb array';
  END IF;

  INSERT INTO public.settlement_budget_reads AS b (acc_key, budget_krw, source, server_key, read_at)
  SELECT DISTINCT ON (e.v ->> 'accKey')
         e.v ->> 'accKey',
         (e.v ->> 'budgetKrw')::bigint,
         e.v ->> 'source',
         e.v ->> 'serverKey',
         (e.v ->> 'readAt')::timestamptz
    FROM jsonb_array_elements(p_reads) WITH ORDINALITY AS e(v, n)
   ORDER BY e.v ->> 'accKey', e.n DESC
  ON CONFLICT (acc_key) DO UPDATE
     SET budget_krw = EXCLUDED.budget_krw,
         source     = EXCLUDED.source,
         server_key = EXCLUDED.server_key,
         read_at    = EXCLUDED.read_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settlement_record_reads(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settlement_record_reads(jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.settlement_record_reads(jsonb) TO service_role;
COMMENT ON FUNCTION public.settlement_record_reads(jsonb) IS
  'Phase 44 D-04 — relay 로 읽은 계좌 예수금을 계좌당 1행으로 남긴다(마지막 값 · 시각 · 0 포함). service_role 전용.';

COMMIT;
