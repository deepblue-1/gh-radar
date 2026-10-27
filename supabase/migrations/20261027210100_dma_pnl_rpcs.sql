-- ============================================================
-- Phase 36 Plan 07 (D-17 ~ D-19) — 일자별 매매손익 집계 RPC.
--
-- 무엇을 만드는가:
--   ① dma_pnl_daily_build(p_from, p_to, p_mode, p_user_id, p_account_no) — 내부 조립 함수 한 벌. 원천 · 일자 · 종목 ·
--      묶음 조립 SQL 이 /me 와 어드민 사이에서 갈라지지 않게 여기 한 곳에만 둔다. p_mode:
--        'me'      = p_user_id 가 볼 수 있는 계좌(dma_visible_accounts — 기존 가시성 의미 그대로) 중 p_account_no 한 계좌 ·
--                    묶음 key = account_no · account_name = null · dma_user_ids = [](트레이더 응답 — T-19-08 · D-08 dma_user_id
--                    비노출). 매핑 없는 사용자 · 남의 계좌 · p_user_id NULL = groups [].
--   ② dma_pnl_daily_for_user(p_user_id, p_account_no, p_from, p_to) — /me 손익 탭(server GET /api/pnl).
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
-- 되돌리기(수동): DROP FUNCTION public.dma_pnl_daily_for_user(uuid, text, date, date);
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
  IF p_mode IS NULL OR p_mode NOT IN ('me') THEN
    RAISE EXCEPTION 'dma_pnl_daily_build: unknown mode %', p_mode USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH fills AS (
      SELECT j.account_no AS gkey,
             j.gateway, j.trade_date, j.account_no, j.dma_user_id, j.isin, j.side,
             j.exec_qty::bigint * j.exec_price AS amt,
             j.fee_krw, j.tax_krw, j.realized_pnl_krw
        FROM public.dma_journal_events j
       WHERE j.notice_type = 'E'
         AND j.trade_date BETWEEN p_from AND p_to
         AND j.account_no = p_account_no
         AND EXISTS (
               SELECT 1 FROM public.dma_visible_accounts(p_user_id) v
                WHERE v.gateway = j.gateway AND v.account_no = j.account_no)
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
                      '[]'::jsonb) AS dma_user_ids
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
                           'account_name', NULL,
                           'total', t.total,
                           'days', d.days)
                         ORDER BY t.gkey)
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

COMMIT;
