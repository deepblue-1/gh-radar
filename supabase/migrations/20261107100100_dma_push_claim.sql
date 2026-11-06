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
--   R1 체인 루트 · R2 구성원 · R3 rank(accepted 1 · first_fill 2 · 그 밖 3) · R5 전량 · R7 첫 체결 · R8 접수(트리거가
--   루트 N 일 때만 — 정정 행 accepted 는 접수를 만들지 않는다) · R11 당일(KST) 밖 = stale · R12 구분 짝(kind 3/6) ·
--   R13 기록(stale/suppressed 는 체인 + 로그만 · 보낼 단계는 기기 ≥ 1 일 때만 체인 단조 upsert → 로그 → sends).
--   한 호출 안 같은 체인은 한 번만 판정한다(D-09).
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

  c             record;                 -- 체인 1개(한 호출 안 같은 체인은 한 행)
  v_root        public.dma_account_orders%ROWTYPE;
  v_mem_nos     text[];
  v_sum_filled  integer;
  v_mem_cnt     integer;
  v_all_filled  boolean;
  v_e_qty       bigint;
  v_e_amt       numeric;
  v_last_px     integer;
  v_last_time   timestamptz;
  v_stage       text;
  v_outcome     text;
  v_have        smallint;
  v_group       smallint;
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
  FOR c IN
    SELECT o.trade_date, o.account_no,
           coalesce(o.order_no, 'R:' || o.journal_epoch || ':' || o.reject_seq) AS chain_key,
           o.id AS root_id,
           true AS root_triggered
      FROM public.dma_account_orders o
     WHERE o.id = ANY(coalesce(p_orders, '{}'::uuid[]))
       AND o.gateway = p_gateway
       AND o.order_type = 'N'
     ORDER BY o.trade_date, o.account_no, 3
  LOOP
    SELECT * INTO v_root FROM public.dma_account_orders WHERE id = c.root_id;

    -- R2 구성원 = 루트.
    v_mem_nos    := CASE WHEN v_root.order_no IS NULL THEN '{}'::text[] ELSE ARRAY[v_root.order_no] END;
    v_sum_filled := v_root.filled_qty;
    v_mem_cnt    := 1;
    v_all_filled := v_root.status = 'filled';

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

    -- 단계 — 위에서부터 첫 번째로 맞는 것(R5 → R7 → R8).
    v_stage := NULL;
    IF (v_root.qty IS NOT NULL AND v_sum_filled >= v_root.qty)
       OR (v_root.qty IS NULL AND v_mem_cnt > 0 AND v_all_filled) THEN
      v_stage := 'filled';
    ELSIF v_sum_filled > 0 THEN
      v_stage := 'first_fill';
    ELSIF c.root_triggered AND v_root.status <> 'rejected' THEN
      v_stage := 'accepted';
    END IF;
    CONTINUE WHEN v_stage IS NULL;

    -- R13 사전 확인 — 이미 그 단계 이상을 기록한 체인은 판정을 끝낸다(재생 · 중간 조각).
    v_have := NULL;
    SELECT ch.sent_rank INTO v_have
      FROM public.dma_push_chains ch
     WHERE ch.gateway = p_gateway AND ch.trade_date = c.trade_date
       AND ch.account_no = c.account_no AND ch.chain_key = c.chain_key;
    CONTINUE WHEN v_have IS NOT NULL
      AND v_have >= CASE v_stage WHEN 'accepted' THEN 1 WHEN 'first_fill' THEN 2 ELSE 3 END;

    -- R11 당일 밖 = stale.
    v_outcome := CASE WHEN c.trade_date <> v_today THEN 'stale' ELSE 'sent' END;

    -- R12 구분 짝 — 루트 주문번호의 kind 3/6 최신 1행.
    v_group := NULL;
    IF v_root.order_no IS NOT NULL THEN
      SELECT s."group" INTO v_group
        FROM public.dma_strategy_events s
       WHERE s.gateway = p_gateway AND s.trade_date = c.trade_date AND s.account_no = c.account_no
         AND s.order_no = v_root.order_no AND s.kind IN (3, 6) AND s."group" > 0
       ORDER BY s.gw_time_ms DESC, s.seq DESC
       LIMIT 1;
    END IF;

    v_time := CASE v_stage
      WHEN 'accepted' THEN v_root.created_at
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
        'qty',           v_root.qty,
        'price',         v_root.price,
        'filledQty',     v_sum_filled,
        'lastFillPrice', v_last_px,
        'avgFillPrice',  CASE WHEN v_e_qty > 0 THEN round(v_e_amt / v_e_qty)::bigint END,
        'cancelledQty',  NULL,
        'cancelReason',  NULL,
        'message',       NULL,
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
