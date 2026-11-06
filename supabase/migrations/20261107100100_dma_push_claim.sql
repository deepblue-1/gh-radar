-- ============================================================
-- Phase 40 Plan 05 — 체결 푸시 판정 RPC `dma_push_claim`: 「이 적용 묶음에서 무엇을 누구 기기로 보낼지」 를 DB 왕복 1회로.
--
-- 무엇:
--   relay(40-06)가 저널 적용 · 전략 적용 직후 후보 id 를 넘기면, 이 함수가 한 트랜잭션에서
--   체인 루트 · 단계 · 구분 짝 · 당일 · 멱등(체인 단조 upsert) · 받는 기기를 정하고 송신 로그를 남긴 뒤
--   「보낼 것(sends)」 과 「짝을 기다릴 것(deferred)」 을 돌려준다. relay 는 sends[].facts 를 문안 함수
--   (40-02 `pushMessageOf`)에 넣어 송신만 한다.
--
-- 왜(Phase 40 CONTEXT):
--   - D-07 직전 상태는 DB 가 기억한다 — 재기동 · WR-09 재전송 · 두 기록기 순서 차이 모두에서 같은 판정이 나와야
--     한다(SC-2). 판정 재료(투영 상태 · 체결 E 행 · 전략 이벤트 · 체인 상태 · 기기)가 전부 DB 에 있으므로
--     RPC 1회로 묶는다(메모리 「Cloud Run 왕복 비용」 — relay 도 Supabase 왕복이 지연을 지배).
--   - SC-1 3조각 체결 → 첫 체결 1 + 전량 1(D-02 중간 체결 안 보냄) · D-09 한 묶음 접수→전량 = 전량 1.
--   - SC-3 저널 적용 RPC 는 재정의하지 않는다 — 판정은 이 별도 RPC 라 매초 적용 경로에 푸시 실패 표면이 0.
--   - SC-4 · T-19-14 돌려주는 facts · sends 원소에 계좌번호 키가 없다. 받는 기기는 relay 가 계산한
--     p_recipients[계좌] 사용자들의 켜진 기기뿐이다(D-06).
--
-- 계약(40-06 relay 가 소비 — 바꾸면 relay 가 깨진다):
--   dma_push_claim(p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[],
--                  p_allow_fallback boolean) RETURNS jsonb
--   - p_orders       후보 dma_account_orders.id 배열. 함수는 **지금 DB 행**을 읽는다(행 스냅샷 아님 — D-09 마지막 상태).
--   - p_strategy     [{"journal_epoch": text, "seq": number}] — kind 11 · kind 13 완료 후보.
--   - p_recipients   {"<account_no>": ["<user uuid>", …]} — 없는 계좌 = 받는 사람 0.
--   - p_platforms    송신기가 켜진 플랫폼({ios} · {android} · {ios,android}). 꺼진 플랫폼 기기는 고르지도 기록하지도 않는다.
--   - 반환 {"sends": [{"log_id", "stage", "chain_key", "facts", "devices": [{"device_id", "platform", "token"}]}],
--           "deferred": [uuid, …]}
--   - facts 키 = shared PushFacts(40-02) camelCase: stage · isin · stockName · stockCode · exchange · tradeDate ·
--     gwTimeMs · side · group · origin · qty · price · filledQty · lastFillPrice · avgFillPrice · cancelledQty ·
--     cancelReason · message · autosell.
--
-- 단계 규칙(RESEARCH Pattern 3 확정판 · 40-05-PLAN R1~R13):
--   R1  체인 루트 — 후보 행에서 order_type M/C 인 동안 같은 (gateway, trade_date, account_no) 의 org_order_no 행으로
--       거슬러 오른다(깊이 상한 20). 부모가 없으면(전일 원주문) 마지막 org_order_no 문자열이 키 · 루트 행 없음.
--       로컬 거부(order_no NULL) 키 = 'R:'||journal_epoch||':'||reject_seq. 정정/취소 요청 거부(M/C rejected) 후보는
--       판정 대상이 아니다(D-02).
--   R2  구성원 = 루트 + 루트에서 order_type M 으로 내려가는 행(재귀 · rejected 제외). C 행은 구성원이 아니라 취소 사건.
--   R3  rank — accepted 1 · first_fill 2 · filled / rejected / cancelled / suppressed / stale · 자동매도 3.
--   R4  거부 — 루트 N ∧ rejected → rejected(message = 루트 원문 · D-04).
--   R5  전량 — Σfilled ≥ 루트 qty(루트 qty 를 모르면 구성원 전부 filled). 평균 = 구성원 E 행 가중 평균.
--   R6  취소 — 살아 있는 구성원 0 ∧ 전량 아님 ∧ 취소된 구성원 있음. 수동(C 행 requester 'Manual' 또는 kind 7 사유 1)
--       = suppressed. 아니면 cancelled(사유 = 최신 kind 7 · 거래소 자기 취소이고 kind 7 없으면 5 「거래소 취소」).
--   R7  첫 체결 — Σfilled > 0. R8 접수 — 트리거가 루트 N 일 때만(정정 행 accepted 는 접수를 만들지 않는다 · D-10).
--   R9  루트 구분 group 9(자동매도 주문) → 단계가 무엇이든 suppressed(D-22).
--   R10 자동매도 사건 — kind 11 → autosell_start · kind 13(cond_actual 4 ∧ cond_threshold ≠ 4) → autosell_done.
--   R11 당일(KST) 밖 = stale. R12 구분 짝 = 루트 주문번호의 kind 3/6(거부는 8) 최신 1행 · 로컬 거부는 kind 8 (계좌 ·
--       isin · result_code · 3초 안). 짝이 없고 origin 이 manual/vi 가 아니면 p_allow_fallback = false 호출은 기록 없이
--       deferred(취소 사유 kind 7 이 없고 수동 · 거래소 자기 취소가 아닌 경우도 같다) · true 재호출은 null 로 보낸다.
--   R13 기록 — stale/suppressed 는 체인 + 로그만 · 보낼 단계는 기기 ≥ 1 일 때만 체인 단조 upsert → 로그 → sends.
--   한 호출 안 같은 체인은 한 번만 판정한다(D-09). 이미 그 단계 이상을 기록한 체인은 짝도 기다리지 않는다.
--
-- 하지 않는 것:
--   - 저널 적용 · 전략 적용 RPC 재정의(SC-3).
--   - 계좌번호 반환(SC-4) — 체인 키는 루트 주문번호 · 'R:'||epoch||':'||reject_seq · 'AS:'||epoch||':'||seq 뿐이다.
--   - 기기 캐시 — 기기 · 토글은 호출 시점에 읽는다(토글 끈 직후 · 새 등록 직후가 바로 반영).
--   - 원격 적용. 이 파일은 원격 미적용으로 커밋되고 40-12 에서 `supabase db push` 한다.
--
-- 되돌리기(수동):
--   DROP FUNCTION IF EXISTS public.dma_push_claim(text, uuid[], jsonb, jsonb, text[], boolean);
-- ============================================================

BEGIN;

CREATE FUNCTION public.dma_push_claim(p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[], p_allow_fallback boolean)
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
  'Phase 40 D-07 — 체결 푸시 판정 · 멱등 · 기록 · 기기 조회 1회. 반환 {sends, deferred} · facts 에 계좌 없음(SC-4). relay(40-06) 전용 · service_role.';

NOTIFY pgrst, 'reload schema';

COMMIT;
