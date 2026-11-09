-- ============================================================
-- quick-261109-dz1 — 매매 알림(앱 푸시) 계좌별 끄기: 끈 계좌 표 · RPC 2개 · 판정 RPC 기기 제외 조건.
--
-- 무엇:
--   - `dma_push_account_mutes`            — 사용자 × 계좌 「끈 계좌」 1행(행 있음 = 꺼짐). PK (user_id, account_no).
--   - RPC `dma_push_account_mutes_for_user` — 내 끈 계좌번호 배열(오름차순 · 없으면 []).
--   - RPC `dma_push_account_mute_set`       — 계좌 하나 끄기(false = 행 넣기) · 켜기(true = 행 지우기). 멱등.
--   - `dma_push_claim` CREATE OR REPLACE    — 받는 기기 고르기에 「그 사용자가 이 사건 계좌를 껐으면 제외」 조건 1개.
--
-- 왜(quick-261109-dz1 CONTEXT):
--   - D-01 의미 = 사용자 × 계좌 끄기. 끈 계좌는 그 사용자의 모든 기기(iOS · Android)에서 오지 않는다.
--     기기 스위치(dma_push_devices.enabled)와 별개이고 둘 다 켜져야 간다.
--   - D-02 기본 켜짐 — 「끈 계좌」 만 저장한다. 행이 없는 사용자 · 새 계좌는 지금처럼 다 받는다.
--   - D-03 계좌 키 = account_no(relay 정규화 문자열 그대로 · ≤ 12자) — p_recipients 키 · dma_push_log.account_no 와 같은 값.
--     여기서 정규화하지 않는다.
--   - D-04 다루는 행은 늘 p_user_id 행뿐 — 공유 계좌의 다른 사용자 수신에는 영향이 없다.
--   - D-05 판정은 DB 에서 — dma_push_claim 의 기기 SELECT 에 NOT EXISTS 1개. 끈 사용자만 남으면 기기 0 →
--     기존 「기기 0 이면 아무것도 쓰지 않는다」 분기(체인 · 로그 미기록 · 다시 켜면 다음 판정에서 받는다).
--     relay 코드 · 계약은 바뀌지 않는다(relay 배포 없음).
--   T-19-01 동형 잠금: RLS 활성 + 접근 규칙 0개 + PUBLIC/anon/authenticated 명시 REVOKE + service_role GRANT.
--   RPC 는 SECURITY INVOKER · service_role 전용 EXECUTE(메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」).
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 서비스롤(server · relay) 전용이다.
--   - 기기 × 계좌 조합 · 사건 종류별(접수만 끄기 등) 끄기.
--   - dma_push_claim 의 다른 줄 변경 — 본문은 20261107100100 그대로이고 끼운 조건 1개뿐이다.
--   - 원격 적용. 이 파일은 원격 미적용으로 커밋되고 메인 세션이 `supabase db push --linked --yes` 한다.
--
-- 되돌리기(수동 — 순서 중요):
--   1) 20261107100100_dma_push_claim.sql 의 함수 블록을 `CREATE OR REPLACE FUNCTION` 으로 다시 적용해
--      끈 계좌 조건을 걷어 낸다(표를 먼저 지우면 실행 중 dma_push_claim 이 깨진다).
--   2) DROP FUNCTION IF EXISTS public.dma_push_account_mute_set(uuid, text, boolean);
--      DROP FUNCTION IF EXISTS public.dma_push_account_mutes_for_user(uuid);
--   3) DROP TABLE IF EXISTS public.dma_push_account_mutes;
-- ============================================================

BEGIN;

-- ── ① 끈 계좌 (D-01 · D-02 · D-03 · D-09) ─────────────────────────
-- claim 의 NOT EXISTS (user_id, account_no) 조회가 PK 를 탄다 — 별도 인덱스 없음.
CREATE TABLE public.dma_push_account_mutes (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_no  text        NOT NULL CHECK (account_no <> '' AND length(account_no) <= 12),  -- dma_user_accounts 와 같은 상한
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_no)
);

COMMENT ON TABLE public.dma_push_account_mutes IS
  'quick-261109-dz1 D-01 · D-02 — 매매 알림 끈 계좌(사용자 × 계좌 · 행 있음 = 꺼짐). dma_push_claim 이 그 사용자 기기를 제외. 서비스롤 전용(RLS · 정책 0).';

-- ── 서비스롤 전용 잠금 (RLS 활성 + 접근 규칙 0개 = default deny) ───
ALTER TABLE public.dma_push_account_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_push_account_mutes FROM PUBLIC;
REVOKE ALL ON public.dma_push_account_mutes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_push_account_mutes TO service_role;

-- ── RPC: 내 끈 계좌 목록 (D-08) ─────────────────────────────────
CREATE FUNCTION public.dma_push_account_mutes_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(m.account_no ORDER BY m.account_no), '[]'::jsonb)
  FROM public.dma_push_account_mutes m
  WHERE m.user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_account_mutes_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_account_mutes_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_account_mutes_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.dma_push_account_mutes_for_user(uuid) IS
  'quick-261109-dz1 D-08 — 내 끈 계좌번호 배열(오름차순). 없으면 [].';

-- ── RPC: 계좌 하나 끄기 · 켜기 (D-01 · D-04 · D-08) ─────────────────
-- p_enabled = false → 끈 행 넣기 · true → 끈 행 지우기. 다루는 행은 늘 p_user_id 행뿐(D-04).
-- 반환 = 「상태가 바뀌었나」 — 같은 상태를 다시 요청하면 false(멱등 · 오류 아님).
CREATE FUNCTION public.dma_push_account_mute_set(p_user_id uuid, p_account_no text, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'dma_push_account_mute_set: p_user_id 가 비었다' USING ERRCODE = '22004';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'dma_push_account_mute_set: p_enabled 가 비었다' USING ERRCODE = '22004';
  END IF;
  IF p_account_no IS NULL OR p_account_no = '' OR length(p_account_no) > 12 THEN
    RAISE EXCEPTION 'dma_push_account_mute_set: p_account_no 는 1~12자여야 한다' USING ERRCODE = '22023';
  END IF;

  IF p_enabled THEN
    DELETE FROM public.dma_push_account_mutes
     WHERE user_id = p_user_id
       AND account_no = p_account_no;
    RETURN FOUND;
  END IF;

  INSERT INTO public.dma_push_account_mutes (user_id, account_no)
  VALUES (p_user_id, p_account_no)
  ON CONFLICT (user_id, account_no) DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_account_mute_set(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_account_mute_set(uuid, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_account_mute_set(uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.dma_push_account_mute_set(uuid, text, boolean) IS
  'quick-261109-dz1 D-01 · D-04 · D-08 — 그 사용자의 그 계좌 끄기(false = 행 넣기) · 켜기(true = 행 지우기). 상태가 바뀌었으면 true · 이미 그 상태면 false(멱등).';

-- ── 판정 RPC 교체 (D-05) ──────────────────────────────────────────
-- 20261107100100 의 함수 본문 그대로 + 받는 기기 SELECT 에 끈 계좌 조건 1개(NOT EXISTS). 다른 줄은 바꾸지 않는다.
CREATE OR REPLACE FUNCTION public.dma_push_claim(p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[], p_allow_fallback boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- D-11 「오늘」 은 KST 거래일 — 호출 한 번에 한 번만 계산한다.
  v_today       date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_events      jsonb := '[]'::jsonb;   -- 판정 결과 [{trade_date, account_no, chain_key, stage, outcome, facts}]
  v_deferred    jsonb := '[]'::jsonb;
  v_sends       jsonb := '[]'::jsonb;

  v_fallback    boolean := coalesce(p_allow_fallback, false);

  c             record;                 -- 체인 1개(한 호출 안 같은 체인은 한 행)
  v_root        public.dma_account_orders%ROWTYPE;   -- 루트 행 · 루트가 없으면 가장 이른 구성원(종목 · 방향 · 출처용)
  v_has_root    boolean;
  v_root_qty    integer;
  v_key_no      text;                   -- 구분 짝을 찾을 루트 주문번호(로컬 거부는 NULL)
  v_mem_ids     uuid[];
  v_mem_nos     text[];
  v_sum_filled  integer;
  v_mem_cnt     integer;
  v_live        integer;
  v_cancelled   integer;
  v_all_filled  boolean;
  v_c_cnt       integer;
  v_c_nos       text[];
  v_c_manual    boolean;
  v_c_time      timestamptz;
  v_e_qty       bigint;
  v_e_amt       numeric;
  v_last_px     integer;
  v_last_time   timestamptz;
  v_cancel_px   integer;
  v_cancel_time timestamptz;
  v_stage       text;
  v_outcome     text;
  v_have        smallint;
  v_group       smallint;
  v_reason      smallint;
  v_found7      boolean;
  v_manual      boolean;
  v_wait        boolean;
  v_time        timestamptz;
  v_stock_code  text;
  v_stock_name  text;

  v_sev         public.dma_strategy_events%ROWTYPE;   -- 자동매도 후보 1개
  v_prev_ms     bigint;
  v_s_qty       bigint;
  v_s_amt       numeric;
  v_s_pnl       numeric;
  v_s_cost      numeric;
  v_s_avg       numeric;
  v_s_pnl_pct   numeric;

  v_ev          jsonb;
  v_users       uuid[];
  v_devices     jsonb;
  v_claimed     boolean;
  v_log_id      uuid;
BEGIN
  -- ── ① 주문 체인 판정 ──────────────────────────────────────────
  -- R1 후보마다 루트를 찾고, 같은 체인의 후보 여러 개(원주문 + C 행 · 원주문 + 정정 행)는 한 행으로 모은다(D-09).
  FOR c IN
    WITH RECURSIVE trig AS (
      SELECT o.id
        FROM public.dma_account_orders o
       WHERE o.id = ANY(coalesce(p_orders, '{}'::uuid[]))
         AND o.gateway = p_gateway
         AND NOT (o.order_type IN ('M', 'C') AND o.status = 'rejected')   -- 정정/취소 요청 거부(D-02)
    ), up AS (
      SELECT t.id AS trig_id, o.id, o.order_no, o.org_order_no, o.order_type, o.trade_date, o.account_no, 0 AS depth
        FROM trig t JOIN public.dma_account_orders o ON o.id = t.id
      UNION ALL
      SELECT up.trig_id, p.id, p.order_no, p.org_order_no, p.order_type, p.trade_date, p.account_no, up.depth + 1
        FROM up
        JOIN public.dma_account_orders p
          ON p.gateway = p_gateway AND p.trade_date = up.trade_date AND p.account_no = up.account_no
         AND p.order_no = up.org_order_no
       WHERE up.order_type IN ('M', 'C') AND up.depth < 20
    ), tops AS (
      SELECT DISTINCT ON (u.trig_id) u.* FROM up u ORDER BY u.trig_id, u.depth DESC
    ), resolved AS (
      -- 가장 위 행이 아직 M/C 면 부모가 저널에 없다(전일 원주문) — 그 org_order_no 문자열이 키, 루트 행 없음.
      SELECT tp.trig_id, tp.trade_date, tp.account_no,
             CASE WHEN tp.order_type IN ('M', 'C') AND tp.org_order_no IS NOT NULL THEN NULL ELSE tp.id END AS root_id,
             CASE WHEN tp.order_type IN ('M', 'C') AND tp.org_order_no IS NOT NULL THEN tp.org_order_no
                  ELSE coalesce(r.order_no, 'R:' || r.journal_epoch || ':' || r.reject_seq) END AS chain_key
        FROM tops tp JOIN public.dma_account_orders r ON r.id = tp.id
    )
    SELECT rs.trade_date, rs.account_no, rs.chain_key,
           (array_agg(rs.root_id) FILTER (WHERE rs.root_id IS NOT NULL))[1] AS root_id,
           coalesce(bool_or(rs.trig_id = rs.root_id), false) AS root_triggered,
           array_agg(rs.trig_id ORDER BY rs.trig_id) AS trig_ids
      FROM resolved rs
     GROUP BY rs.trade_date, rs.account_no, rs.chain_key
     ORDER BY rs.trade_date, rs.account_no, rs.chain_key
  LOOP
    -- R2 구성원 = 루트(없으면 키를 org 로 가진 정정 행들) + 아래로 내려가는 정정 행(rejected 제외 · 깊이 20).
    WITH RECURSIVE mem AS (
      SELECT o.id, o.order_no, 0 AS depth
        FROM public.dma_account_orders o
       WHERE (c.root_id IS NOT NULL AND o.id = c.root_id)
          OR (c.root_id IS NULL AND o.gateway = p_gateway AND o.trade_date = c.trade_date
              AND o.account_no = c.account_no AND o.org_order_no = c.chain_key
              AND o.order_type = 'M' AND o.status <> 'rejected')
      UNION ALL
      SELECT ch.id, ch.order_no, mem.depth + 1
        FROM mem
        JOIN public.dma_account_orders ch
          ON ch.gateway = p_gateway AND ch.trade_date = c.trade_date AND ch.account_no = c.account_no
         AND ch.org_order_no = mem.order_no AND ch.order_type = 'M' AND ch.status <> 'rejected'
       WHERE mem.depth < 20
    )
    SELECT array_agg(o.id),
           coalesce(array_agg(o.order_no) FILTER (WHERE o.order_no IS NOT NULL), '{}'::text[]),
           coalesce(sum(o.filled_qty), 0), count(*),
           count(*) FILTER (WHERE o.status IN ('accepted', 'partially_filled')),
           count(*) FILTER (WHERE o.status = 'cancelled'),
           coalesce(bool_and(o.status = 'filled'), false)
      INTO v_mem_ids, v_mem_nos, v_sum_filled, v_mem_cnt, v_live, v_cancelled, v_all_filled
      FROM public.dma_account_orders o
     WHERE o.id IN (SELECT mem.id FROM mem);
    CONTINUE WHEN v_mem_cnt = 0;

    v_has_root := c.root_id IS NOT NULL;
    SELECT * INTO v_root
      FROM public.dma_account_orders o
     WHERE o.id = coalesce(c.root_id, (SELECT x.id FROM public.dma_account_orders x
                                        WHERE x.id = ANY(v_mem_ids) ORDER BY x.created_at, x.first_seq LIMIT 1));
    v_root_qty := CASE WHEN v_has_root THEN v_root.qty END;
    v_key_no   := CASE WHEN v_has_root THEN v_root.order_no ELSE c.chain_key END;

    -- 취소 사건(C 행) — 구성원 주문번호를 원주문으로 가진 확인 행(요청 거부 제외).
    SELECT count(*), coalesce(array_agg(x.order_no) FILTER (WHERE x.order_no IS NOT NULL), '{}'::text[]),
           coalesce(bool_or(x.requester = 'Manual'), false), max(x.updated_at)
      INTO v_c_cnt, v_c_nos, v_c_manual, v_c_time
      FROM public.dma_account_orders x
     WHERE x.gateway = p_gateway AND x.trade_date = c.trade_date AND x.account_no = c.account_no
       AND x.order_type = 'C' AND x.status <> 'rejected' AND x.org_order_no = ANY(v_mem_nos);

    -- 체결가 · 평균 · 시각은 E 행이 정본(Pitfall 2 — 투영 price 는 주문가).
    SELECT coalesce(sum(e.exec_qty), 0), sum(e.exec_qty::numeric * e.exec_price)
      INTO v_e_qty, v_e_amt
      FROM public.dma_journal_events e
     WHERE e.gateway = p_gateway AND e.trade_date = c.trade_date AND e.account_no = c.account_no
       AND e.notice_type = 'E' AND e.apply_error IS NULL AND e.order_no = ANY(v_mem_nos);
    v_last_px := NULL; v_last_time := NULL;
    SELECT e.exec_price, e.gw_time INTO v_last_px, v_last_time
      FROM public.dma_journal_events e
     WHERE e.gateway = p_gateway AND e.trade_date = c.trade_date AND e.account_no = c.account_no
       AND e.notice_type = 'E' AND e.apply_error IS NULL AND e.order_no = ANY(v_mem_nos)
     ORDER BY e.gw_time DESC, e.seq DESC
     LIMIT 1;

    -- 단계 — 위에서부터 첫 번째로 맞는 것(R4 → R5 → R6 → R7 → R8).
    v_stage := NULL;
    IF v_has_root AND v_root.order_type = 'N' AND v_root.status = 'rejected' THEN
      v_stage := 'rejected';
    ELSIF (v_root_qty IS NOT NULL AND v_sum_filled >= v_root_qty)
       OR (v_root_qty IS NULL AND v_all_filled) THEN
      v_stage := 'filled';
    ELSIF v_live = 0 AND v_cancelled > 0 THEN
      v_stage := 'cancelled';
    ELSIF v_sum_filled > 0 THEN
      v_stage := 'first_fill';
    ELSIF c.root_triggered AND v_root.order_type = 'N' AND v_root.status <> 'rejected' THEN
      v_stage := 'accepted';
    END IF;
    CONTINUE WHEN v_stage IS NULL;

    -- R13 사전 확인 — 이미 그 단계 이상을 기록한 체인은 판정을 끝낸다(재생 · 중간 조각 · 짝도 기다리지 않음).
    v_have := NULL;
    SELECT ch.sent_rank INTO v_have
      FROM public.dma_push_chains ch
     WHERE ch.gateway = p_gateway AND ch.trade_date = c.trade_date
       AND ch.account_no = c.account_no AND ch.chain_key = c.chain_key;
    CONTINUE WHEN v_have IS NOT NULL
      AND v_have >= CASE v_stage WHEN 'accepted' THEN 1 WHEN 'first_fill' THEN 2 ELSE 3 END;

    -- R11 당일 밖 = stale(짝 · 사유를 기다리지 않는다 — 보내지 않으므로).
    v_outcome := CASE WHEN c.trade_date <> v_today THEN 'stale' ELSE 'sent' END;
    v_wait    := false;
    v_manual  := false;
    v_reason  := NULL;
    v_group   := NULL;
    v_cancel_px := NULL; v_cancel_time := NULL;

    IF v_stage = 'cancelled' THEN
      -- 마지막 살아 있던 구성원(가장 늦게 취소된 구성원)의 가격 · 시각.
      SELECT o.price, o.updated_at INTO v_cancel_px, v_cancel_time
        FROM public.dma_account_orders o
       WHERE o.id = ANY(v_mem_ids) AND o.status = 'cancelled'
       ORDER BY o.updated_at DESC, o.last_seq DESC
       LIMIT 1;
      -- R6 취소 사유 — 구성원 · C 행 주문번호의 kind 7 최신 1행.
      SELECT s.cancel_reason INTO v_reason
        FROM public.dma_strategy_events s
       WHERE s.gateway = p_gateway AND s.trade_date = c.trade_date AND s.account_no = c.account_no
         AND s.kind = 7 AND s.order_no = ANY(v_mem_nos || v_c_nos)
       ORDER BY s.gw_time_ms DESC, s.seq DESC
       LIMIT 1;
      v_found7 := FOUND;
      v_manual := v_c_manual OR EXISTS (
        SELECT 1 FROM public.dma_strategy_events s
         WHERE s.gateway = p_gateway AND s.trade_date = c.trade_date AND s.account_no = c.account_no
           AND s.kind = 7 AND s.cancel_reason = 1 AND s.order_no = ANY(v_mem_nos || v_c_nos));
      IF v_manual THEN
        v_outcome := CASE WHEN v_outcome = 'stale' THEN 'stale' ELSE 'suppressed' END;
      ELSIF NOT v_found7 THEN
        IF v_c_cnt = 0 THEN
          v_reason := 5;                          -- 거래소 자기 취소(C 행 없이 구성원 자기 status cancelled)
        ELSIF v_outcome = 'sent' AND NOT v_fallback THEN
          v_wait := true;                         -- 서버 취소인데 사유(kind 7)가 아직 안 왔다
        END IF;
      END IF;
    END IF;

    -- R12 구분 짝(수동 취소 · stale 는 기다릴 이유가 없다).
    IF v_outcome = 'sent' THEN
      IF v_key_no IS NOT NULL THEN
        SELECT s."group" INTO v_group
          FROM public.dma_strategy_events s
         WHERE s.gateway = p_gateway AND s.trade_date = c.trade_date AND s.account_no = c.account_no
           AND s.order_no = v_key_no AND s."group" > 0
           AND s.kind = ANY(CASE WHEN v_stage = 'rejected' THEN '{3,6,8}'::smallint[] ELSE '{3,6}'::smallint[] END)
         ORDER BY s.gw_time_ms DESC, s.seq DESC
         LIMIT 1;
      ELSE
        -- 로컬 거부(주문번호 없음) — 같은 계좌 · 종목 · 결과 코드의 kind 8 중 3초 안 최신(RESEARCH A5).
        SELECT s."group" INTO v_group
          FROM public.dma_strategy_events s
         WHERE s.gateway = p_gateway AND s.trade_date = c.trade_date AND s.account_no = c.account_no
           AND s.kind = 8 AND s.isin = v_root.isin AND s.result_code = v_root.result_code AND s."group" > 0
           AND abs(s.gw_time_ms - (extract(epoch FROM v_root.created_at) * 1000)::bigint) <= 3000
         ORDER BY s.gw_time_ms DESC, s.seq DESC
         LIMIT 1;
      END IF;

      IF v_group = 9 THEN
        -- R9 자동매도 주문 자체는 어느 단계도 보내지 않는다(D-22 — kind 11 · 13 두 건만).
        v_outcome := 'suppressed';
        v_wait    := false;
      ELSIF v_group IS NULL AND v_root.origin IS DISTINCT FROM 'manual' AND v_root.origin IS DISTINCT FROM 'vi'
            AND NOT v_fallback THEN
        -- 상따 · 출처 미상(A6)은 kind 3/6 이 늦게 올 수 있다 — 한 번 기다린다(Pitfall 3).
        v_wait := true;
      END IF;
    END IF;

    IF v_wait THEN
      -- 대기 항목은 아무 표에도 쓰지 않는다 — relay 가 같은 id 를 p_allow_fallback = true 로 다시 부른다.
      v_deferred := v_deferred || to_jsonb(c.trig_ids);
      CONTINUE;
    END IF;

    v_time := CASE v_stage
      WHEN 'accepted'  THEN v_root.created_at
      WHEN 'rejected'  THEN v_root.updated_at
      WHEN 'cancelled' THEN greatest(v_c_time, v_cancel_time)
      ELSE coalesce(v_last_time, v_root.updated_at)
    END;

    v_stock_code := NULL; v_stock_name := NULL;
    SELECT s.code, s.name INTO v_stock_code, v_stock_name FROM public.stocks s WHERE s.isin = v_root.isin LIMIT 1;

    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'trade_date', c.trade_date,
      'account_no', c.account_no,
      'chain_key',  c.chain_key,
      'stage',      v_stage,
      'outcome',    v_outcome,
      'facts', jsonb_build_object(
        'stage',         v_stage,
        'isin',          v_root.isin,
        'stockName',     v_stock_name,
        'stockCode',     v_stock_code,
        'exchange',      v_root.exchange,
        'tradeDate',     to_char(c.trade_date, 'YYYY-MM-DD'),
        'gwTimeMs',      (extract(epoch FROM v_time) * 1000)::bigint,
        'side',          v_root.side,
        'group',         v_group,
        'origin',        v_root.origin,
        'qty',           v_root_qty,
        'price',         CASE WHEN v_stage = 'cancelled' THEN coalesce(v_cancel_px, v_root.price) ELSE v_root.price END,
        'filledQty',     v_sum_filled,
        'lastFillPrice', v_last_px,
        'avgFillPrice',  CASE WHEN v_e_qty > 0 THEN round(v_e_amt / v_e_qty)::bigint END,
        'cancelledQty',  CASE WHEN v_stage = 'cancelled' AND v_root_qty IS NOT NULL
                              THEN greatest(v_root_qty - v_sum_filled, 0) END,
        'cancelReason',  CASE WHEN v_stage = 'cancelled' THEN v_reason END,
        'message',       CASE WHEN v_stage = 'rejected' THEN v_root.message END,
        'autosell',      NULL
      )
    ));
  END LOOP;

  -- ── ①-b 자동매도 사건 판정 (R10 · D-05 · D-22 · D-23) ─────────────
  -- 후보 = p_strategy 의 (journal_epoch, seq). kind 11 발동 → 시작 · kind 13 (cond_actual 4 ∧ cond_threshold ≠ 4)
  -- = 완료(gh-trade 가 보유 0 ∧ 나간 매도 0 일 때만 낸다 · 4→4 재방송 제외). 그 밖 전략 행은 무시한다.
  -- 체인 키 = 'AS:'||journal_epoch||':'||seq — 하루 여러 번 발동(완료 → 재무장)해도 이벤트마다 1건.
  FOR v_sev IN
    SELECT DISTINCT ON (ev.journal_epoch, ev.seq) ev.*
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_strategy) = 'array' THEN p_strategy ELSE '[]'::jsonb END) AS j(e)
      JOIN public.dma_strategy_events ev
        ON ev.gateway = p_gateway
       AND ev.journal_epoch = CASE WHEN jsonb_typeof(j.e) = 'object' THEN j.e->>'journal_epoch' END
       AND ev.seq = CASE WHEN jsonb_typeof(j.e) = 'object' AND (j.e->>'seq') ~ '^[0-9]{1,18}$'
                         THEN (j.e->>'seq')::bigint END
     WHERE ev.account_no <> ''
       AND (ev.kind = 11 OR (ev.kind = 13 AND ev.cond_actual = 4 AND ev.cond_threshold <> 4))
     ORDER BY ev.journal_epoch, ev.seq
  LOOP
    v_stage := CASE WHEN v_sev.kind = 11 THEN 'autosell_start' ELSE 'autosell_done' END;
    v_key_no := 'AS:' || v_sev.journal_epoch || ':' || v_sev.seq;

    v_have := NULL;
    SELECT ch.sent_rank INTO v_have
      FROM public.dma_push_chains ch
     WHERE ch.gateway = p_gateway AND ch.trade_date = v_sev.trade_date
       AND ch.account_no = v_sev.account_no AND ch.chain_key = v_key_no;
    CONTINUE WHEN v_have IS NOT NULL;   -- 자동매도 사건은 rank 3 단발 — 기록이 있으면 끝

    v_outcome := CASE WHEN v_sev.trade_date <> v_today THEN 'stale' ELSE 'sent' END;

    v_s_avg := NULL; v_s_pnl_pct := NULL;
    IF v_sev.kind = 13 THEN
      -- 평균 · 손익 = 같은 계좌 · 종목 · 거래일에서 이 완료 직전 kind 11 이후 ~ 완료 시각까지의 매도 체결(E).
      -- 손익 % = Σrealized_pnl_krw ÷ Σ(exec_qty × avg_price) × 100 — 주문로그 손익과 같은 원천(36-05 4열).
      SELECT max(p.gw_time_ms) INTO v_prev_ms
        FROM public.dma_strategy_events p
       WHERE p.gateway = p_gateway AND p.trade_date = v_sev.trade_date AND p.account_no = v_sev.account_no
         AND p.isin = v_sev.isin AND p.kind = 11 AND p.gw_time_ms <= v_sev.gw_time_ms;
      SELECT sum(e.exec_qty), sum(e.exec_qty::numeric * e.exec_price),
             sum(e.realized_pnl_krw), sum(e.exec_qty::numeric * e.avg_price)
        INTO v_s_qty, v_s_amt, v_s_pnl, v_s_cost
        FROM public.dma_journal_events e
       WHERE e.gateway = p_gateway AND e.trade_date = v_sev.trade_date AND e.account_no = v_sev.account_no
         AND e.isin = v_sev.isin AND e.notice_type = 'E' AND e.side = 'S' AND e.apply_error IS NULL
         AND e.gw_time >= coalesce(to_timestamp(v_prev_ms / 1000.0), '-infinity'::timestamptz)
         AND e.gw_time <= to_timestamp(v_sev.gw_time_ms / 1000.0);
      IF v_s_qty > 0 THEN
        v_s_avg := round(v_s_amt / v_s_qty);
      END IF;
      IF v_s_cost > 0 THEN
        v_s_pnl_pct := round(v_s_pnl / v_s_cost * 100, 2);
      END IF;
    END IF;

    v_stock_code := NULL; v_stock_name := NULL;
    SELECT st.code, st.name INTO v_stock_code, v_stock_name FROM public.stocks st WHERE st.isin = v_sev.isin LIMIT 1;

    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'trade_date', v_sev.trade_date,
      'account_no', v_sev.account_no,
      'chain_key',  v_key_no,
      'stage',      v_stage,
      'outcome',    v_outcome,
      'facts', jsonb_build_object(
        'stage',         v_stage,
        'isin',          v_sev.isin,
        'stockName',     v_stock_name,
        'stockCode',     v_stock_code,
        'exchange',      CASE WHEN v_sev.exchange IN ('KRX', 'NXT') THEN v_sev.exchange ELSE '' END,
        'tradeDate',     to_char(v_sev.trade_date, 'YYYY-MM-DD'),
        'gwTimeMs',      v_sev.gw_time_ms,
        'side',          'S',
        'group',         NULLIF(v_sev."group", 0),
        'origin',        'limit_chaser',
        'qty',           NULL,
        'price',         NULL,
        'filledQty',     CASE WHEN v_sev.kind = 13 THEN v_sev.qty ELSE 0 END,
        'lastFillPrice', NULL,
        'avgFillPrice',  NULL,
        'cancelledQty',  NULL,
        'cancelReason',  NULL,
        'message',       NULL,
        'autosell', jsonb_build_object(
          'basis',        v_sev.queue_case,
          'basePrice',    CASE WHEN v_sev.kind = 11 THEN v_sev.bid1_price ELSE v_sev.price END,   -- kind 13 price = 기준 가격
          'triggerPrice', CASE WHEN v_sev.kind = 11 THEN v_sev.price ELSE 0 END,           -- 0 = 모름
          'soldQty',      CASE WHEN v_sev.kind = 13 THEN v_sev.qty ELSE 0 END,
          'avgSellPrice', v_s_avg,
          'pnlPct',       v_s_pnl_pct
        )
      )
    ));
  END LOOP;

  -- ── ② 기록 · 받는 기기 (R13) ───────────────────────────────────
  FOR v_ev IN SELECT e FROM jsonb_array_elements(v_events) AS t(e) LOOP
    v_claimed := NULL;
    v_log_id  := NULL;

    IF v_ev->>'outcome' <> 'sent' THEN
      -- stale · suppressed: 보내지 않지만 체인을 rank 3 로 막고(뒤 재생 차단) 로그에 남긴다.
      INSERT INTO public.dma_push_chains AS ch (gateway, trade_date, account_no, chain_key, sent_rank, sent_stage)
      VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key', 3, v_ev->>'outcome')
      ON CONFLICT (gateway, trade_date, account_no, chain_key) DO UPDATE
         SET sent_rank = EXCLUDED.sent_rank, sent_stage = EXCLUDED.sent_stage, updated_at = now()
       WHERE ch.sent_rank < EXCLUDED.sent_rank
      RETURNING true INTO v_claimed;
      IF v_claimed THEN
        INSERT INTO public.dma_push_log (gateway, trade_date, account_no, chain_key, stage, outcome, facts)
        VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key',
                v_ev->>'stage', v_ev->>'outcome', v_ev->'facts')
        ON CONFLICT ON CONSTRAINT dma_push_log_chain_stage_key DO NOTHING;
      END IF;
      CONTINUE;
    END IF;

    -- D-06 받는 사람 = p_recipients[계좌] · 모양이 어긋난 값은 받는 사람 0.
    v_users := ARRAY(
      SELECT u::uuid
        FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(p_recipients -> (v_ev->>'account_no')) = 'array'
                    THEN p_recipients -> (v_ev->>'account_no') ELSE '[]'::jsonb END) AS r(u)
       WHERE u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
    SELECT coalesce(jsonb_agg(jsonb_build_object('device_id', d.id, 'platform', d.platform, 'token', d.token)
                              ORDER BY d.created_at, d.id), '[]'::jsonb)
      INTO v_devices
      FROM public.dma_push_devices d
     WHERE d.enabled
       AND d.platform = ANY(coalesce(p_platforms, '{}'::text[]))
       -- quick-261109-dz1 D-05: 그 사용자가 이 사건 계좌를 껐으면 그 사용자 기기를 고르지 않는다.
       AND NOT EXISTS (SELECT 1 FROM public.dma_push_account_mutes m
                        WHERE m.user_id = d.user_id AND m.account_no = v_ev->>'account_no')
       AND d.user_id = ANY(v_users);
    -- 기기 0 이면 아무것도 쓰지 않는다 — 나중에 켠 기기가 다음 단계를 받는다.
    CONTINUE WHEN jsonb_array_length(v_devices) = 0;

    -- Pattern 2 멱등: 단조 upsert 가 행을 돌려줄 때만 송신 권리.
    INSERT INTO public.dma_push_chains AS ch (gateway, trade_date, account_no, chain_key, sent_rank, sent_stage)
    VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key',
            CASE v_ev->>'stage' WHEN 'accepted' THEN 1 WHEN 'first_fill' THEN 2 ELSE 3 END, v_ev->>'stage')
    ON CONFLICT (gateway, trade_date, account_no, chain_key) DO UPDATE
       SET sent_rank = EXCLUDED.sent_rank, sent_stage = EXCLUDED.sent_stage, updated_at = now()
     WHERE ch.sent_rank < EXCLUDED.sent_rank
    RETURNING true INTO v_claimed;
    CONTINUE WHEN v_claimed IS NOT TRUE;

    INSERT INTO public.dma_push_log (gateway, trade_date, account_no, chain_key, stage, outcome, facts)
    VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key',
            v_ev->>'stage', 'sent', v_ev->'facts')
    ON CONFLICT ON CONSTRAINT dma_push_log_chain_stage_key DO NOTHING
    RETURNING id INTO v_log_id;
    -- 같은 (체인, 단계) 로그가 이미 있으면(체인 행을 손으로 지운 경우 등) 두 번 보내지 않는다.
    CONTINUE WHEN v_log_id IS NULL;

    v_sends := v_sends || jsonb_build_array(jsonb_build_object(
      'log_id',    v_log_id,
      'stage',     v_ev->>'stage',
      'chain_key', v_ev->>'chain_key',
      'facts',     v_ev->'facts',
      'devices',   v_devices
    ));
  END LOOP;

  RETURN jsonb_build_object('sends', v_sends, 'deferred', v_deferred);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean) TO service_role;

COMMENT ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean) IS
  'Phase 40 D-07 — 체결 푸시 판정 · 멱등 · 기록 · 기기 조회 1회. 반환 {sends, deferred} · facts 에 계좌 없음(SC-4). relay(40-06) 전용 · service_role. · quick-261109-dz1 끈 계좌(dma_push_account_mutes) 사용자 기기 제외';

NOTIFY pgrst, 'reload schema';

COMMIT;
