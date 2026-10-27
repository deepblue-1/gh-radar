-- ============================================================
-- Phase 36 Plan 07 (D-17 ~ D-19) — 일자별 매매손익 집계 RPC.
--
-- 무엇을 만드는가:
--   ① dma_pnl_daily_build(p_from, p_to, p_mode, p_user_id, p_account_no) — 내부 조립 함수 한 벌. 원천 · 일자 · 종목 ·
--      묶음 조립 SQL 이 /me 와 어드민 사이에서 갈라지지 않게 여기 한 곳에만 둔다. p_mode:
--        'me'      = p_user_id 가 볼 수 있는 계좌(dma_visible_accounts — 기존 가시성 의미 그대로) 중 p_account_no 한 계좌 ·
--                    묶음 key = account_no · account_name = null · dma_user_ids = [](트레이더 응답 — T-19-08 · D-08 dma_user_id
--                    비노출). 매핑 없는 사용자 · 남의 계좌 · p_user_id NULL = groups [].
--        'user'    = 전 계정 · 묶음 key = dma_user_id. "" 체결은 「미상」 한 묶음 · 맨 뒤 · 나머지 key 오름차순.
--                    dma_user_ids = [key](미상은 []) · account_name = null.
--        'account' = 전 계좌 · 묶음 key = account_no(게이트웨이 무관 — KB120 · KB121 에 나뉜 같은 계좌는 한 묶음 · accounts 2개).
--                    KB 묶음 → 교보 묶음 → 같은 증권사 안 account_no 오름차순 · 미상 없음. account_name = dma_user_accounts.name
--                    (비면 null) · dma_user_ids = 그 계좌 체결의 빈 값 아닌 dma_user_id 들.
--   ② dma_pnl_daily_for_user(p_user_id, p_account_no, p_from, p_to) — /me 손익 탭(server GET /api/pnl).
--   ③ dma_pnl_daily_for_admin(p_from, p_to, p_group) — /admin/pnl(server GET /api/admin/pnl). p_group 'user' | 'account'
--      밖은 22023 예외('me' 포함 — 가시성 모드를 어드민 경로로 열지 않는다).
--
-- 반환 jsonb = shared `PnlReport`(packages/shared/src/pnl.ts) 키 그대로(다단어 snake_case):
--   { from, to, groups: [ { key, accounts: [{broker, gateway, account_no}], dma_user_ids, account_name,
--                           total: {pnl, fee, tax, buy, sell, fills},
--                           days: [ { date, pnl, fee, tax, buy, sell, fills,
--                                     stocks: [ { isin, code, name, pnl, buy, sell, fills } ] } ] } ] }
--
-- 집계 규칙(D-18):
--   - notice_type = 'E'(체결)만. 접수 · 취소 · 정정 · 거부 통보는 집계 밖.
--   - 매수/매도 금액 = exec_qty::bigint × exec_price 를 side B/S 로 나눈 합. int4 × int4 는 int4 라
--     1,000,000주 × 30,000원(300억)에서 overflow — 곱하기 전에 bigint 로 올린다(Pitfall 4).
--   - 실현손익 · 수수료 · 세금 = 36-05 의 4열(realized_pnl_krw · fee_krw · tax_krw) 합. 체결 건수 = E 행 수.
--   - apply_error 가 있는 행도 포함한다 — 체결 사실은 원문이 정본이고 apply_error 는 투영(dma_account_orders) 실패일 뿐(A6).
--   - 일자 = trade_date(KST) 최신순 · 체결 0 인 날은 행 없음.
--   - 종목 줄 = (일자, isin) 합 · 실현손익 큰 순 → 같으면 이름 → isin. 이름 = stocks 마스터 name → 없으면 code → 없으면 null.
--   - sum(bigint) 은 numeric → jsonb 숫자(정수). 금액은 전부 원.
--
-- 왜 RPC 1회인가(D-19): Cloud Run ↔ Supabase 왕복이 지연을 지배한다 — 묶음 × 일자 × 종목을 한 호출에 담는다.
-- 원천 스캔은 체결 부분 인덱스 idx_dma_journal_events_fill_day (trade_date, account_no) WHERE notice_type = 'E'(36-05).
--
-- 권한: 모든 함수 SECURITY INVOKER · search_path 고정 · service_role 전용(PUBLIC · anon · authenticated 명시 REVOKE —
-- 메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」). p_user_id 는 server 가 requireAuth 로 확정한 값만 넘긴다.
--
-- 되돌리기(수동): DROP FUNCTION public.dma_pnl_daily_for_admin(date, date, text);
--                 DROP FUNCTION public.dma_pnl_daily_for_user(uuid, text, date, date);
--                 DROP FUNCTION public.dma_pnl_daily_build(date, date, text, uuid, text);
-- ============================================================

BEGIN;

-- ── ① 내부 조립 함수 ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dma_pnl_daily_build(
  p_from date, p_to date, p_mode text, p_user_id uuid, p_account_no text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('me', 'user', 'account') THEN
    RAISE EXCEPTION 'dma_pnl_daily_build: unknown mode %', p_mode USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH fills AS (
      SELECT CASE p_mode WHEN 'user' THEN j.dma_user_id ELSE j.account_no END AS gkey,
             j.gateway, j.trade_date, j.account_no, j.dma_user_id, j.isin, j.side,
             j.exec_qty::bigint * j.exec_price AS amt,
             j.fee_krw, j.tax_krw, j.realized_pnl_krw
        FROM public.dma_journal_events j
       WHERE j.notice_type = 'E'
         AND j.trade_date BETWEEN p_from AND p_to
         -- 'me' 만 가시성 · 계좌 거름. 어드민 모드는 전 계정 · 전 계좌(service_role 경로 · requireAdmin 뒤).
         AND (p_mode <> 'me'
              OR (j.account_no = p_account_no
                  AND EXISTS (
                        SELECT 1 FROM public.dma_visible_accounts(p_user_id) v
                         WHERE v.gateway = j.gateway AND v.account_no = j.account_no)))
    ),
    per_stock AS (
      SELECT f.gkey, f.trade_date, f.isin,
             sum(f.realized_pnl_krw) AS pnl,
             sum(f.fee_krw) AS fee,
             sum(f.tax_krw) AS tax,
             coalesce(sum(f.amt) FILTER (WHERE f.side = 'B'), 0) AS buy,
             coalesce(sum(f.amt) FILTER (WHERE f.side = 'S'), 0) AS sell,
             count(*) AS fills
        FROM fills f
       GROUP BY f.gkey, f.trade_date, f.isin
    ),
    per_day AS (
      SELECT p.gkey, p.trade_date,
             jsonb_build_object(
               'date', p.trade_date,
               'pnl', sum(p.pnl), 'fee', sum(p.fee), 'tax', sum(p.tax),
               'buy', sum(p.buy), 'sell', sum(p.sell), 'fills', sum(p.fills),
               'stocks', jsonb_agg(
                 jsonb_build_object(
                   'isin', p.isin, 'code', s.code, 'name', coalesce(nullif(s.name, ''), s.code),
                   'pnl', p.pnl, 'buy', p.buy, 'sell', p.sell, 'fills', p.fills)
                 ORDER BY p.pnl DESC, coalesce(nullif(s.name, ''), s.code) NULLS LAST, p.isin)
             ) AS day
        FROM per_stock p
        LEFT JOIN public.stocks s ON s.isin = p.isin
       GROUP BY p.gkey, p.trade_date
    ),
    days AS (
      SELECT d.gkey, jsonb_agg(d.day ORDER BY d.trade_date DESC) AS days
        FROM per_day d
       GROUP BY d.gkey
    ),
    totals AS (
      SELECT f.gkey,
             jsonb_build_object(
               'pnl', sum(f.realized_pnl_krw), 'fee', sum(f.fee_krw), 'tax', sum(f.tax_krw),
               'buy', coalesce(sum(f.amt) FILTER (WHERE f.side = 'B'), 0),
               'sell', coalesce(sum(f.amt) FILTER (WHERE f.side = 'S'), 0),
               'fills', count(*)
             ) AS total,
             coalesce(jsonb_agg(DISTINCT f.dma_user_id ORDER BY f.dma_user_id) FILTER (WHERE f.dma_user_id <> ''),
                      '[]'::jsonb) AS dma_user_ids,
             -- 계좌별 정렬 키: KB 체결이 하나라도 있으면 KB(0) · 교보만이면 1.
             min(CASE WHEN f.gateway LIKE 'KYOBO%' THEN 1 ELSE 0 END) AS broker_rank
        FROM fills f
       GROUP BY f.gkey
    ),
    accts AS (
      SELECT a.gkey,
             jsonb_agg(jsonb_build_object('broker', a.broker, 'gateway', a.gateway, 'account_no', a.account_no)
                       ORDER BY a.broker, a.account_no, a.gateway) AS accounts
        FROM (SELECT DISTINCT f.gkey,
                     CASE WHEN f.gateway LIKE 'KYOBO%' THEN 'KYOBO' ELSE 'KB' END AS broker,
                     f.gateway, f.account_no
                FROM fills f) a
       GROUP BY a.gkey
    )
    SELECT jsonb_build_object(
             'from', p_from,
             'to', p_to,
             'groups', coalesce(
               (SELECT jsonb_agg(
                         jsonb_build_object(
                           'key', t.gkey,
                           'accounts', a.accounts,
                           -- 'me' 는 트레이더 응답이라 DMA 유저 id 를 싣지 않는다(T-19-08 · D-08 — 사용자 조회 RPC 는 dma_user_id 비노출).
                           'dma_user_ids', CASE WHEN p_mode = 'me' THEN '[]'::jsonb ELSE t.dma_user_ids END,
                           'account_name', CASE WHEN p_mode = 'account' THEN
                             (SELECT nullif(max(ua.name), '') FROM public.dma_user_accounts ua WHERE ua.account_no = t.gkey)
                           END,
                           'total', t.total,
                           'days', d.days)
                         ORDER BY CASE WHEN p_mode = 'user' AND t.gkey = '' THEN 1 ELSE 0 END,
                                  CASE WHEN p_mode = 'account' THEN t.broker_rank ELSE 0 END,
                                  t.gkey)
                  FROM totals t
                  JOIN accts a ON a.gkey = t.gkey
                  JOIN days d ON d.gkey = t.gkey),
               '[]'::jsonb))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_build(date, date, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_build(date, date, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_pnl_daily_build(date, date, text, uuid, text) TO service_role;

-- ── ② /me 손익 탭 (server GET /api/pnl · 왕복 1회) ─────────────────
-- 가시성 = dma_visible_accounts(p_user_id) — dma_journal_orders_for_user 와 같은 의미(규칙 뷰 · 게이트웨이 인지).
-- 원천 CTE 를 그대로 옮기면(p_mode 'me'): fills AS (SELECT … j.exec_qty::bigint * j.exec_price AS amt …
--   FROM dma_journal_events j JOIN dma_visible_accounts(p_user_id) v ON v.gateway = j.gateway AND v.account_no = j.account_no
--   WHERE j.notice_type = 'E' AND j.account_no = p_account_no AND j.trade_date BETWEEN p_from AND p_to) — 조립 함수는 같은
--   조인을 EXISTS 로 쓴다(헬퍼가 DISTINCT 라 의미 동일 · 한 체결이 두 번 세지지 않음).
CREATE OR REPLACE FUNCTION public.dma_pnl_daily_for_user(p_user_id uuid, p_account_no text, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.dma_pnl_daily_build(p_from, p_to, 'me', p_user_id, p_account_no);
$$;

REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_for_user(uuid, text, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_for_user(uuid, text, date, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_pnl_daily_for_user(uuid, text, date, date) TO service_role;

-- ── ③ /admin/pnl (server GET /api/admin/pnl · 왕복 1회) ──────────────
-- 전 계정 · 전 계좌. 경로 = requireAuth → requireAdmin → service_role RPC(T-19-01). 계정 · 계좌 노출은 어드민 전용.
CREATE OR REPLACE FUNCTION public.dma_pnl_daily_for_admin(p_from date, p_to date, p_group text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_group IS NULL OR p_group NOT IN ('user', 'account') THEN
    RAISE EXCEPTION 'p_group must be user or account' USING ERRCODE = '22023';
  END IF;
  RETURN public.dma_pnl_daily_build(p_from, p_to, p_group, NULL, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_for_admin(date, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_pnl_daily_for_admin(date, date, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_pnl_daily_for_admin(date, date, text) TO service_role;

COMMIT;
