-- ============================================================
-- Phase 40 코드 리뷰 수정(40-REVIEW) — 판정 RPC `dma_push_claim` 유실 경로 · 판정 순서 보강.
--
-- 무엇:
--   - WR-01 `dma_push_log.claim_id` 칸 + 판정 RPC 새 인자 `p_claim_id uuid DEFAULT NULL`(호출 멱등 키).
--           relay 는 한 묶음의 판정 시도(첫 호출 · 오류 재시도)마다 같은 uuid 를 넘긴다. 같은 키로 이미 기록됐는데
--           전달 기록(dma_push_deliveries)이 없는 sent 사건은 재시도 응답에 다시 실린다 — 첫 호출이 커밋된 뒤 응답만
--           끊겨도 그 묶음의 푸시가 사라지지 않는다.
--   - 받는 기기 조회를 내부 함수 `dma_push_claim_devices` 하나로 — 판정 경로와 재생 경로가 같은 조건을 쓴다
--     (켜짐 ∧ 송신 플랫폼 ∧ p_recipients[계좌] 사용자 ∧ 끈 계좌 아님).
--
-- 기준 본문: 20261109100000_dma_push_account_mutes.sql 의 dma_push_claim(끈 계좌 NOT EXISTS 포함)을 그대로 옮기고
-- 위 변경만 더했다.
--
-- 하위 호환(배포 순서 무관):
--   - 옛 relay(6 인자 이름 호출) → 새 함수: 새 인자는 기본값(NULL)이라 PostgREST 가 같은 함수로 찾고 동작은 이전과 같다.
--     옛 6 인자 함수를 지우는 이유 — 둘이 함께 있으면 6 인자 호출이 PGRST203(모호)로 깨진다.
--   - 새 relay → 옛 함수(이 파일 적용 전): PostgREST 가 PGRST202(함수 없음)를 주면 relay 가 새 인자를 빼고 한 번 더 부른다.
--   - 반환에 새 키를 더할 뿐 기존 키(sends · deferred) 모양은 그대로다.
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY) 추가 — 서비스롤 전용 그대로. 새 함수도 SECURITY INVOKER · service_role 전용 EXECUTE
--     (메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 — REVOKE FROM PUBLIC 단독은 auto-grant 에 덮인다).
--   - 저널 적용 · 전략 적용 RPC 재정의(SC-3).
--   - 원격 적용. 이 파일은 원격 미적용으로 커밋되고 메인 세션이 `supabase db push --linked --yes` 한다.
--
-- 되돌리기(수동 — 순서 중요):
--   1) DROP FUNCTION IF EXISTS public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean, uuid);
--   2) 20261109100000_dma_push_account_mutes.sql 의 함수 블록(6 인자 · REVOKE/GRANT/COMMENT 포함)을 다시 적용한다.
--   3) DROP FUNCTION IF EXISTS public.dma_push_claim_devices(text, jsonb, text[]);
--   4) DROP INDEX IF EXISTS public.idx_dma_push_log_claim; ALTER TABLE public.dma_push_log DROP COLUMN IF EXISTS claim_id;
-- ============================================================

BEGIN;

-- ── ① 호출 멱등 키 칸 (WR-01) ──────────────────────────────────────
-- 옛 행 · 옛 relay 호출은 NULL. 재생 조회는 (claim_id) 부분 인덱스를 탄다.
ALTER TABLE public.dma_push_log ADD COLUMN claim_id uuid;
CREATE INDEX idx_dma_push_log_claim
  ON public.dma_push_log (claim_id)
  WHERE claim_id IS NOT NULL;

COMMENT ON COLUMN public.dma_push_log.claim_id IS
  'WR-01 — 이 사건을 기록한 판정 호출의 멱등 키(relay 가 한 묶음의 시도마다 같은 uuid). 응답 유실 재시도가 이 값으로 sends 를 되찾는다. 옛 행 NULL.';

-- ── ② 받는 기기 (D-06 · quick-261109-dz1 D-05) ────────────────────
-- p_recipients[계좌] 의 uuid 모양 사용자 · 켜진 기기 · 송신 플랫폼 · 그 사용자가 그 계좌를 끄지 않았음.
-- 모양이 어긋난 값(배열 아님 · uuid 아님)은 받는 사람 0. 반환 [{device_id, platform, token}](created_at · id 순).
CREATE FUNCTION public.dma_push_claim_devices(p_account_no text, p_recipients jsonb, p_platforms text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('device_id', d.id, 'platform', d.platform, 'token', d.token)
                            ORDER BY d.created_at, d.id), '[]'::jsonb)
    FROM public.dma_push_devices d
   WHERE d.enabled
     AND d.platform = ANY(coalesce(p_platforms, '{}'::text[]))
     AND NOT EXISTS (SELECT 1 FROM public.dma_push_account_mutes m
                      WHERE m.user_id = d.user_id AND m.account_no = p_account_no)
     AND d.user_id = ANY(ARRAY(
           SELECT u::uuid
             FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(p_recipients -> p_account_no) = 'array'
                         THEN p_recipients -> p_account_no ELSE '[]'::jsonb END) AS r(u)
            WHERE u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_claim_devices(text, jsonb, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_claim_devices(text, jsonb, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_claim_devices(text, jsonb, text[]) TO service_role;

COMMENT ON FUNCTION public.dma_push_claim_devices(text, jsonb, text[]) IS
  'Phase 40 D-06 — dma_push_claim 내부: 그 계좌 받는 사람(p_recipients)의 켜진 기기(송신 플랫폼 · 끈 계좌 제외). service_role 전용.';

-- ── ③ 판정 RPC 교체 ─────────────────────────────────────────────
-- 시그니처가 바뀌므로 옛 6 인자 함수를 지운다(남기면 6 인자 이름 호출이 모호해진다). 한 트랜잭션이라 빈틈이 없다.
DROP FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean);

CREATE FUNCTION public.dma_push_claim(
  p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[], p_allow_fallback boolean,
  p_claim_id uuid DEFAULT NULL
)
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
  v_devices     jsonb;
  v_claimed     boolean;
  v_log_id      uuid;
  v_rep         record;                 -- WR-01 재생 후보(같은 p_claim_id 로 이미 기록된 sent 로그)
  v_replay      jsonb := '[]'::jsonb;
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
        INSERT INTO public.dma_push_log (gateway, trade_date, account_no, chain_key, stage, outcome, facts, claim_id)
        VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key',
                v_ev->>'stage', v_ev->>'outcome', v_ev->'facts', p_claim_id)
        ON CONFLICT ON CONSTRAINT dma_push_log_chain_stage_key DO NOTHING;
      END IF;
      CONTINUE;
    END IF;

    -- D-06 받는 사람 = p_recipients[계좌]의 켜진 기기(끈 계좌 사용자 제외 — quick-261109-dz1 D-05).
    v_devices := public.dma_push_claim_devices(v_ev->>'account_no', p_recipients, p_platforms);
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

    INSERT INTO public.dma_push_log (gateway, trade_date, account_no, chain_key, stage, outcome, facts, claim_id)
    VALUES (p_gateway, (v_ev->>'trade_date')::date, v_ev->>'account_no', v_ev->>'chain_key',
            v_ev->>'stage', 'sent', v_ev->'facts', p_claim_id)
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

  -- ── ③ WR-01 응답 유실 재시도 — 같은 p_claim_id 로 이미 기록됐지만 전달 기록이 없는 sent 사건을 다시 돌려준다 ──
  -- 첫 호출이 커밋된 뒤 응답만 끊기면(소켓 리셋 · 게이트웨이 504 · relay 시간 상한) 위 판정은 그 체인을 「이미 보냄」 으로
  -- 건너뛴다. relay 는 같은 묶음의 재시도에 같은 p_claim_id 를 넘기므로, 그 호출이 남긴 로그를 지금 기기로 재구성한다.
  -- 판정을 끝낸 **뒤** 읽는다 — 첫 호출이 아직 커밋 중이면 위 체인 upsert 가 그 커밋을 기다리고, 이 문장은 새 스냅샷
  -- (READ COMMITTED)으로 그 로그를 본다. 이번 호출이 방금 쓴 로그(v_sends)는 빼고, 이미 전달 기록이 있는 로그도 뺀다
  -- (relay 가 받아서 보낸 것). 재생 사건을 앞에 둔다 — 먼저 판정된 단계가 먼저 간다.
  IF p_claim_id IS NOT NULL THEN
    FOR v_rep IN
      SELECT l.id, l.account_no, l.stage, l.chain_key, l.facts
        FROM public.dma_push_log l
       WHERE l.claim_id = p_claim_id
         AND l.gateway = p_gateway
         AND l.outcome = 'sent'
         AND NOT EXISTS (SELECT 1 FROM public.dma_push_deliveries dv WHERE dv.log_id = l.id)
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_sends) AS s(e) WHERE s.e->>'log_id' = l.id::text)
       ORDER BY l.created_at, l.id
    LOOP
      v_devices := public.dma_push_claim_devices(v_rep.account_no, p_recipients, p_platforms);
      CONTINUE WHEN jsonb_array_length(v_devices) = 0;
      v_replay := v_replay || jsonb_build_array(jsonb_build_object(
        'log_id',    v_rep.id,
        'stage',     v_rep.stage,
        'chain_key', v_rep.chain_key,
        'facts',     v_rep.facts,
        'devices',   v_devices
      ));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('sends', v_replay || v_sends, 'deferred', v_deferred);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean, uuid) TO service_role;

COMMENT ON FUNCTION public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean, uuid) IS
  'Phase 40 D-07 — 체결 푸시 판정 · 멱등 · 기록 · 기기 조회 1회. 반환 {sends, deferred} · facts 에 계좌 없음(SC-4). relay(40-06) 전용 · service_role. · quick-261109-dz1 끈 계좌 사용자 기기 제외 · 40-REVIEW WR-01 p_claim_id 응답 유실 재시도 재생';

NOTIFY pgrst, 'reload schema';

COMMIT;
