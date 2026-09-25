-- ============================================================
-- Phase 19 Plan 01 — 계좌별 주문기록 저널 RPC (D-06, D-11, D-12).
--
-- 함수 7종 (전부 SECURITY INVOKER · SET search_path = public, pg_temp · service_role 전용 EXECUTE):
--   ⑤ dma_journal_status_rank(text) / dma_journal_next_status(text, text)
--        — 상태 단조 격자. relay `order/notice-status.ts` 의 STATUS_RANK·TERMINAL 과 같은 축이다
--          (accepted 1 < partially_filled 2 < 종결 3). 상태는 뒤로 가지 않는다(CONTEXT 「행 모델」).
--      dma_journal_origin(text) — origin 원문 → manual/limit_chaser/vi, 그 밖·빈 값 NULL (19-03).
--   ⑥ dma_journal_project(text, text, jsonb) — 이벤트 1건 → dma_account_orders 투영. 건드린 행 id 배열.
--        접수 A(19-01) · 체결 E · 취소 C · 정정 M · 거부 R · 로컬 거부(19-03) 전 갈래.
--   ⑦ dma_journal_apply(text, text, jsonb)   — relay 기록기의 유일한 쓰기 진입점.
--        advisory lock → 이벤트 적재(ON CONFLICT DO NOTHING) → 삽입된 경우에만 투영 → 커서 전진,
--        전부 **한 트랜잭션(한 RPC 호출)**. 반환 rows 는 relay 가 추가 조회 없이 푸시한다.
--   ⑧ dma_journal_sync_access(text, jsonb)   — 관찰자 로그인 응답의 매핑 스냅샷으로 원자 교체(D-06).
--   ⑨ dma_journal_orders_for_user(uuid, date) — server `GET /api/orders` 의 왕복 1회 조회.
--
-- 결정 근거:
--   D-12 / Pitfall 2 (재생 이중 적용): relay 가 적용 뒤 커서 저장 전에 죽으면 같은 체결(E)이 다시 온다.
--         `filled_qty += exec_qty` 는 멱등이 아니므로 「이벤트 PK 삽입 성공 = 1회 적용」 이 한
--         트랜잭션 안에서 성립해야 한다. 재생 멱등의 근거는 PK INSERT 성공 하나뿐이다.
--   T-19-05 (두 writer): `pg_advisory_xact_lock(hashtext('dma_journal:' || gateway))` 로 같은
--         게이트웨이의 적용·매핑 교체를 직렬화한다(오결선 relay 두 대가 동시에 붙어도 PK 게이트와 이중 방어).
--   T-19-15 (포이즌 이벤트): 투영은 이벤트별 EXCEPTION 서브블록이다. 실패한 이벤트는 원문 행에
--         `apply_error` 로 남고 같은 배치의 다음 이벤트·커서는 계속 진행한다 — 커서 영구 정지 방지.
--   D-06: 가시성은 `user_id → dma_credentials.dma_user_id → dma_account_access → 계좌` 조인 하나로만
--         정해진다. 매핑은 조회 시점에 조인되므로 매핑이 늦게 생겨도 그날 앞선 행이 보인다(D-11).
--   T-19-08 / D-08: `dma_user_id`(주문자)는 공개 컬럼 목록에서 뺀다 — ⑦ rows 와 ⑨ 가 같은 목록이다.
--   T-19-01 / Pitfall 10 (IDOR): ⑨ 가 authenticated 에 열리면 PostgREST 로 남의 `p_user_id` 를 넣어
--         조회한다. 함수 전부 PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
--         (자동 메모리 feedback_supabase_rpc_revoke — PUBLIC REVOKE 단독은 플랫폼 auto-grant 에 덮인다.)
--
-- 이벤트 JSON 키 계약 (relay 기록기 19-05 가 그대로 만든다 — 키 이름은 snake_case 23종):
--   seq · trade_date("YYYY-MM-DD") · gw_time_ms(epoch ms) · dma_user_id · account_no · isin · side ·
--   side_trusted · order_no · org_order_no · notice_type · request_kind · requester · origin ·
--   exchange · board · order_price · order_qty · exec_price · exec_qty · result_code · message · local_reject
--   필수 키는 seq · trade_date · gw_time_ms 셋이다. 이 셋이 없거나 형식이 틀리면 **배치 전체가 실패**한다
--   (계약 위반은 조용히 넘기지 않는다 — relay 는 커서를 올리지 않고 재시도·db_error 로 드러낸다).
--   나머지 키가 없으면 문자열 '' · 정수 0 · 불리언 false 로 적재한다.
--
-- 함정:
--   - 계좌번호를 재정규화하지 않는다(Pitfall 7). account_no 는 받은 문자열 그대로 적재·투영한다.
--   - 시각은 게이트웨이 gw_time_ms 가 정본이다(Pitfall 5). `now()` 는 applied_at·synced_at·커서에만.
--   - ⑥ 이 모르는 통보(알 수 없는 notice_type · request_kind · 빈 account_no · 주문번호 없는 A/E/C/M ·
--     exec_qty 0 이하 체결)는 RAISE EXCEPTION 으로 떨어져 ⑦ 의 포이즌 격리가 `apply_error` 에 사유를
--     남긴다 — 조용히 삼키지 않는다.
--   - 원주문이 저널에 없으면(전일·예약 — Assumption A4) 정정 이동 수량은 M 수량 폴백이고 원주문 행을
--     지어내지 않는다.
--
-- 하지 않는 것:
--   - SECURITY DEFINER. 호출자(service_role)는 RLS 를 우회하므로 INVOKER 로 충분하고, DEFINER 는
--     권한 경계를 흐린다.
--   - `dma_orders` 참조(D-05 동결).
-- ============================================================

BEGIN;

-- ── ⑤ 상태 격자 헬퍼 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dma_journal_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_status
    WHEN 'accepted'         THEN 1
    WHEN 'partially_filled' THEN 2
    WHEN 'filled'           THEN 3
    WHEN 'cancelled'        THEN 3
    WHEN 'rejected'         THEN 3
    WHEN 'modified'         THEN 3
    ELSE 0
  END;
$$;

-- 현재 상태 p_cur 에 다음 상태 p_next 를 적용한 결과. 종결(filled·cancelled·rejected·modified)은
-- 다른 종결로도 바뀌지 않는다(relay replaceableStatusesOf 와 같은 규칙 — `cancelled → filled` 금지).
CREATE OR REPLACE FUNCTION public.dma_journal_next_status(p_cur text, p_next text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_cur IS NULL THEN p_next
    WHEN p_cur IN ('filled','cancelled','rejected','modified') THEN p_cur
    WHEN public.dma_journal_status_rank(p_cur) <= public.dma_journal_status_rank(p_next) THEN p_next
    ELSE p_cur
  END;
$$;

-- origin 원문 → 공개 3종. D-08 보충: 「수동」 과 「미상」 을 섞지 않는다 — 모르는 값·빈 값은 NULL(칩 생략).
-- 갈래마다 사상 CASE 를 복제하지 않도록 한 곳에 둔다(투영의 모든 갈래가 이것만 부른다).
CREATE OR REPLACE FUNCTION public.dma_journal_origin(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_raw
    WHEN 'Manual'      THEN 'manual'
    WHEN 'LimitChaser' THEN 'limit_chaser'
    WHEN 'VITrigger'   THEN 'vi'
    ELSE NULL
  END;
$$;

-- ── ⑥ 이벤트 1건 투영 ────────────────────────────────────────────
-- 「이 이벤트가 처음 적용될 때 무엇이 바뀌는가」 만 정의한다. 재생 안전성은 ⑦ 의 이벤트 PK 게이트가 쥔다.
-- 분기는 notice_type · request_kind 동등 비교뿐이다 — `message` 는 저장만 하고 읽어 분기하지 않는다(T-19-13).
--
-- 판정 순서가 곧 우선순위다(RESEARCH Pattern D 「투영 규칙」 표):
--   ① 로컬 거부 · 주문번호 없는 R · 원주문 번호를 자기 번호로 실어 온 정정/취소 거부
--        → 새 행 `reject_seq = seq`(서로 다른 거부가 한 행에 겹치지 않는다 — Pitfall 6 · D-02)
--   ② 알 수 없는 notice_type → RAISE(⑦ 포이즌 격리가 apply_error 에 남긴다 — 조용히 무시하지 않는다)
--   ③ 자기 행(주문번호 키) upsert — 갈래마다 세 값만 다르다:
--        v_next(격자에 넣을 다음 상태) · v_ins_qty/v_ins_price(행이 없을 때 넣을 값, 있으면 빈 칸만
--        COALESCE) · v_add_filled(체결 누적분, E 만 > 0). 그 뒤 체결 수량이 있고 qty 를 알면
--        `filled_qty + modified_qty >= qty` 로 filled/partially_filled 를 격자 재판정한다 — E 의 판정과
--        「체결이 먼저 온 행에 A 가 qty 를 채우는」 재판정이 같은 식 하나다.
--   ④ 원주문 행 — C 는 cancelled(격자: filled 는 안 덮는다), M 은 `modified_qty += 이동 수량` 후
--        합이 qty 이상이면 modified. R 은 원주문을 건드리지 않는다(거부 = 원주문 살아 있음).
-- 방향(D-08): 원주문 행이 있으면 그 side 가 정본, 없으면 side_trusted 일 때만 레코드 값, 아니면 NULL.
CREATE OR REPLACE FUNCTION public.dma_journal_project(p_gateway text, p_epoch text, p_ev jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seq          bigint      := (p_ev->>'seq')::bigint;
  v_trade_date   date        := (p_ev->>'trade_date')::date;
  v_gw_time      timestamptz := to_timestamp(((p_ev->>'gw_time_ms')::bigint) / 1000.0);
  v_account      text        := coalesce(p_ev->>'account_no', '');
  v_isin         text        := coalesce(p_ev->>'isin', '');
  v_notice       text        := coalesce(p_ev->>'notice_type', '');
  v_order_no     text        := NULLIF(coalesce(p_ev->>'order_no', ''), '');
  v_org_order_no text        := NULLIF(coalesce(p_ev->>'org_order_no', ''), '');
  v_local_reject boolean     := coalesce((p_ev->>'local_reject')::boolean, false);
  v_side_trusted boolean     := coalesce((p_ev->>'side_trusted')::boolean, false);
  v_side_raw     text        := coalesce(p_ev->>'side', '');
  v_request_kind text        := coalesce(p_ev->>'request_kind', '');
  v_order_qty    integer     := coalesce((p_ev->>'order_qty')::integer, 0);
  v_order_price  integer     := coalesce((p_ev->>'order_price')::integer, 0);
  v_exec_qty     integer     := coalesce((p_ev->>'exec_qty')::integer, 0);
  v_result_code  integer     := coalesce((p_ev->>'result_code')::integer, 0);
  v_message      text        := NULLIF(coalesce(p_ev->>'message', ''), '');
  v_requester    text        := NULLIF(coalesce(p_ev->>'requester', ''), '');
  v_board        text        := NULLIF(coalesce(p_ev->>'board', ''), '');
  v_dma_user     text        := NULLIF(coalesce(p_ev->>'dma_user_id', ''), '');
  v_origin       text        := public.dma_journal_origin(coalesce(p_ev->>'origin', ''));
  v_exchange     text;
  v_side         text;
  v_order_type   text;
  -- 원주문(org_order_no 행)
  v_orig         public.dma_account_orders%ROWTYPE;
  v_has_orig     boolean := false;
  v_self_is_orig boolean := false;   -- C 의 원주문이 자기 번호(= 거래소 자동취소)
  v_moved        integer;            -- M 이동 수량
  -- 자기 행 upsert 갈래 값
  v_next         text;
  v_ins_qty      integer;
  v_ins_price    integer;
  v_add_filled   integer := 0;
  -- 결과
  v_ids          uuid[] := '{}';
  v_id           uuid;
  v_row          public.dma_account_orders%ROWTYPE;
  v_final_qty    integer;
  v_filled       integer;
  v_target       text;
BEGIN
  IF v_account = '' THEN
    RAISE EXCEPTION 'dma_journal_project: account_no 없음 (seq=%)', v_seq;
  END IF;

  -- ── 값 사상 ──
  v_exchange := CASE WHEN coalesce(p_ev->>'exchange', '') = 'NXT' THEN 'NXT' ELSE 'KRX' END;
  v_side := CASE WHEN v_side_trusted AND v_side_raw IN ('B','S') THEN v_side_raw ELSE NULL END;
  v_order_type := CASE v_request_kind
    WHEN 'New'    THEN 'N'
    WHEN 'Modify' THEN 'M'
    WHEN 'Cancel' THEN 'C'
    WHEN ''       THEN 'N'
    ELSE NULL
  END;
  IF v_order_type IS NULL THEN
    RAISE EXCEPTION 'dma_journal_project: 알 수 없는 request_kind % (seq=%)', v_request_kind, v_seq;
  END IF;

  -- ── 원주문 행 ──
  -- 호출자(dma_journal_apply)가 advisory lock 으로 직렬화하므로 SELECT … FOR UPDATE 뒤 분기가 안전하다.
  IF v_org_order_no IS NOT NULL THEN
    SELECT * INTO v_orig
      FROM public.dma_account_orders
     WHERE gateway = p_gateway
       AND trade_date = v_trade_date
       AND account_no = v_account
       AND order_no = v_org_order_no
     FOR UPDATE;
    v_has_orig := FOUND;
  END IF;
  -- D-08: C/M/R 의 방향은 원주문 행이 정본이다(통보의 side 는 브로커 기본값일 수 있다 — side_trusted).
  IF v_has_orig THEN
    v_side := coalesce(v_orig.side, v_side);
  END IF;

  -- ── ① 거부 행 · reject_seq 키 ──
  -- 로컬 거부 · 주문번호 없는 R 은 주문번호로 식별할 수 없다. 정정/취소 거부가 원주문 번호를 자기 번호로
  -- 실어 오면 그 번호의 행은 **원주문**이므로 rejected 로 덮지 않고 거부를 따로 적는다(원주문 살아 있음).
  IF v_local_reject
     OR (v_notice = 'R' AND (
           v_order_no IS NULL
           OR (v_request_kind IN ('Cancel','Modify') AND v_order_no = v_org_order_no)))
  THEN
    INSERT INTO public.dma_account_orders (
      gateway, trade_date, account_no, order_no, journal_epoch, reject_seq, isin, exchange, board, side,
      order_type, org_order_no, qty, price, status, result_code, notice_type, message, origin,
      requester, request_kind, dma_user_id, first_seq, last_seq, created_at, updated_at
    ) VALUES (
      p_gateway, v_trade_date, v_account, NULL, p_epoch, v_seq, v_isin, v_exchange, v_board, v_side,
      v_order_type, v_org_order_no, NULLIF(v_order_qty, 0), v_order_price, 'rejected', v_result_code, v_notice, v_message, v_origin,
      v_requester, NULLIF(v_request_kind, ''), v_dma_user, v_seq, v_seq, v_gw_time, v_gw_time
    )
    ON CONFLICT (gateway, journal_epoch, reject_seq) WHERE reject_seq IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    RETURN CASE WHEN v_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_id] END;
  END IF;

  -- ── ② 통보 종류 · 키 검증 ──
  IF v_notice NOT IN ('A', 'E', 'C', 'M', 'R') THEN
    RAISE EXCEPTION 'dma_journal_project: 알 수 없는 notice_type % (seq=%)', v_notice, v_seq;
  END IF;
  IF v_order_no IS NULL THEN
    RAISE EXCEPTION 'dma_journal_project: 주문번호 없는 % 통보 (seq=%)', v_notice, v_seq;
  END IF;

  -- ── ③ 갈래 값 ──
  CASE v_notice
    WHEN 'A' THEN
      -- 접수: 주문수량·주문가가 이 주문의 정본이다.
      v_next      := 'accepted';
      v_ins_qty   := NULLIF(v_order_qty, 0);
      v_ins_price := v_order_price;

    WHEN 'E' THEN
      -- 체결: exec_qty 만 사실로 누적한다. 체결가(exec_price)는 행 price 를 바꾸지 않는다 — 주문가가
      -- 정본이다(51 의 useExecuted 혼용을 저널이 끊었다). qty 를 모르면(A 보다 먼저) NULL 로 두고
      -- 뒤의 A 가 채워 재판정한다.
      IF v_exec_qty <= 0 THEN
        RAISE EXCEPTION 'dma_journal_project: 체결 통보의 exec_qty 가 0 이하 % (seq=%)', v_exec_qty, v_seq;
      END IF;
      v_next       := 'partially_filled';
      v_ins_qty    := NULL;
      v_ins_price  := NULL;
      v_add_filled := v_exec_qty;

    WHEN 'C' THEN
      -- 취소확인: 원주문 번호 = COALESCE(org, 자기 번호). 비었거나 같으면 거래소 자동취소 — 그 행 하나가
      -- 원주문 자신이므로 수량·가격·order_type 을 취소 통보 값으로 채우지 않는다.
      v_next := 'cancelled';
      v_self_is_orig := v_org_order_no IS NULL OR v_org_order_no = v_order_no;
      IF v_self_is_orig THEN
        v_ins_qty   := NULL;
        v_ins_price := NULL;
      ELSE
        v_order_type := 'C';
        v_ins_qty    := NULLIF(v_order_qty, 0);
        v_ins_price  := v_order_price;
      END IF;

    WHEN 'M' THEN
      -- 정정확인: 이동 수량 = LEAST(M 수량, 원주문 잔량). 원주문을 모르거나 qty 를 모르면 M 수량 폴백
      -- (Assumption A4 — 전일·예약 원주문).
      IF v_org_order_no IS NULL OR v_org_order_no = v_order_no THEN
        RAISE EXCEPTION 'dma_journal_project: 정정확인에 별도 원주문번호가 없다 (seq=%)', v_seq;
      END IF;
      IF v_has_orig AND v_orig.qty IS NOT NULL THEN
        v_moved := LEAST(v_order_qty, GREATEST(v_orig.qty - v_orig.filled_qty - v_orig.modified_qty, 0));
      ELSE
        v_moved := v_order_qty;
      END IF;
      v_order_type := 'M';
      v_next       := 'accepted';
      v_ins_qty    := NULLIF(v_moved, 0);
      v_ins_price  := v_order_price;

    ELSE -- 'R' · 주문번호 있음(자기 번호 ≠ 원주문 번호)
      -- 거부는 자기 행만 rejected. request_kind 가 Cancel/Modify 여도 원주문은 건드리지 않는다.
      v_next      := 'rejected';
      v_ins_qty   := NULLIF(v_order_qty, 0);
      v_ins_price := v_order_price;
  END CASE;

  -- ── ③ 자기 행 · 주문번호 키 upsert ──
  SELECT * INTO v_row
    FROM public.dma_account_orders
   WHERE gateway = p_gateway
     AND trade_date = v_trade_date
     AND account_no = v_account
     AND order_no = v_order_no
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.dma_account_orders (
      gateway, trade_date, account_no, order_no, isin, exchange, board, side, order_type,
      org_order_no, qty, price, filled_qty, status, result_code, notice_type, message, origin,
      requester, request_kind, dma_user_id, first_seq, last_seq, created_at, updated_at
    ) VALUES (
      p_gateway, v_trade_date, v_account, v_order_no, v_isin, v_exchange, v_board, v_side, v_order_type,
      CASE WHEN v_self_is_orig THEN NULL ELSE v_org_order_no END, v_ins_qty, v_ins_price, v_add_filled, v_next,
      v_result_code, v_notice, v_message, v_origin,
      v_requester, NULLIF(v_request_kind, ''), v_dma_user, v_seq, v_seq, v_gw_time, v_gw_time
    )
    RETURNING id INTO v_id;
  ELSE
    -- 행이 이미 있다(같은 주문의 후속 통보 · 체결이 접수보다 먼저 온 경우 · 재접수 통보).
    -- 비어 있는 칸만 채우고, 체결 수량은 상태와 무관하게 사실로 누적하며, 상태는 격자로만 올린다.
    v_final_qty := coalesce(v_row.qty, v_ins_qty);
    v_filled    := v_row.filled_qty + v_add_filled;
    v_target    := public.dma_journal_next_status(v_row.status, v_next);
    IF v_filled > 0 AND v_final_qty IS NOT NULL THEN
      v_target := public.dma_journal_next_status(
        v_target,
        CASE WHEN v_filled + v_row.modified_qty >= v_final_qty THEN 'filled' ELSE 'partially_filled' END
      );
    END IF;

    UPDATE public.dma_account_orders o SET
      qty          = v_final_qty,
      price        = coalesce(o.price, v_ins_price),
      filled_qty   = o.filled_qty + v_add_filled,
      org_order_no = coalesce(o.org_order_no, CASE WHEN v_self_is_orig THEN NULL ELSE v_org_order_no END),
      origin       = coalesce(o.origin, v_origin),
      side         = coalesce(o.side, v_side),
      dma_user_id  = coalesce(o.dma_user_id, v_dma_user),
      board        = coalesce(o.board, v_board),
      requester    = coalesce(o.requester, v_requester),
      request_kind = coalesce(o.request_kind, NULLIF(v_request_kind, '')),
      status       = v_target,
      -- 마지막 통보 칸은 더 새 seq 일 때만 갱신한다(적용은 seq 오름차순이지만 방어적으로).
      notice_type  = CASE WHEN v_seq >= o.last_seq THEN v_notice      ELSE o.notice_type END,
      result_code  = CASE WHEN v_seq >= o.last_seq THEN v_result_code ELSE o.result_code END,
      message      = CASE WHEN v_seq >= o.last_seq THEN v_message     ELSE o.message     END,
      first_seq    = LEAST(o.first_seq, v_seq),
      last_seq     = GREATEST(o.last_seq, v_seq),
      created_at   = LEAST(o.created_at, v_gw_time),
      updated_at   = GREATEST(o.updated_at, v_gw_time)
    WHERE o.id = v_row.id;
    v_id := v_row.id;
  END IF;
  v_ids := ARRAY[v_id];

  -- ── ④ 원주문 행 ──
  IF v_notice = 'C' AND NOT v_self_is_orig AND v_has_orig THEN
    UPDATE public.dma_account_orders o SET
      status     = public.dma_journal_next_status(o.status, 'cancelled'),
      last_seq   = GREATEST(o.last_seq, v_seq),
      updated_at = GREATEST(o.updated_at, v_gw_time)
    WHERE o.id = v_orig.id;
    v_ids := v_ids || v_orig.id;
  ELSIF v_notice = 'M' AND v_has_orig AND v_orig.qty IS NOT NULL AND v_moved > 0 THEN
    UPDATE public.dma_account_orders o SET
      modified_qty = o.modified_qty + v_moved,
      status       = CASE WHEN o.filled_qty + o.modified_qty + v_moved >= o.qty
                          THEN public.dma_journal_next_status(o.status, 'modified')
                          ELSE o.status END,
      last_seq     = GREATEST(o.last_seq, v_seq),
      updated_at   = GREATEST(o.updated_at, v_gw_time)
    WHERE o.id = v_orig.id;
    v_ids := v_ids || v_orig.id;
  END IF;

  RETURN v_ids;
END;
$$;

-- ── ⑦ 배치 적용 (relay 기록기의 유일한 쓰기 진입점) ─────────────────
CREATE OR REPLACE FUNCTION public.dma_journal_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  ev        jsonb;
  v_seq     bigint;
  v_max     bigint;
  v_ids     uuid[] := '{}';
  v_applied integer := 0;
  v_skipped integer := 0;
  v_errors  jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_last    bigint;
  v_err     text;
BEGIN
  IF coalesce(p_gateway, '') = '' OR coalesce(p_epoch, '') = '' THEN
    RAISE EXCEPTION 'dma_journal_apply: gateway/journal_epoch 가 비어 있다';
  END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'dma_journal_apply: p_events 는 JSON 배열이어야 한다';
  END IF;

  -- 같은 게이트웨이의 적용·매핑 교체를 직렬화한다(T-19-05).
  PERFORM pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway));

  FOR ev IN
    SELECT value FROM jsonb_array_elements(p_events) ORDER BY (value->>'seq')::bigint
  LOOP
    v_seq := (ev->>'seq')::bigint;
    v_max := GREATEST(coalesce(v_max, 0), v_seq);

    -- 원문 적재. 필수 키(seq·trade_date·gw_time_ms) 형식 오류는 여기서 배치 전체를 실패시킨다(계약 위반).
    INSERT INTO public.dma_journal_events (
      gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin, side,
      side_trusted, order_no, org_order_no, notice_type, request_kind, requester, origin,
      exchange, board, order_price, order_qty, exec_price, exec_qty, result_code, message, local_reject
    ) VALUES (
      p_gateway, p_epoch, v_seq,
      (ev->>'trade_date')::date,
      to_timestamp(((ev->>'gw_time_ms')::bigint) / 1000.0),
      coalesce(ev->>'dma_user_id', ''),
      coalesce(ev->>'account_no', ''),
      coalesce(ev->>'isin', ''),
      coalesce(ev->>'side', ''),
      coalesce((ev->>'side_trusted')::boolean, false),
      coalesce(ev->>'order_no', ''),
      coalesce(ev->>'org_order_no', ''),
      coalesce(ev->>'notice_type', ''),
      coalesce(ev->>'request_kind', ''),
      coalesce(ev->>'requester', ''),
      coalesce(ev->>'origin', ''),
      coalesce(ev->>'exchange', ''),
      coalesce(ev->>'board', ''),
      coalesce((ev->>'order_price')::integer, 0),
      coalesce((ev->>'order_qty')::integer, 0),
      coalesce((ev->>'exec_price')::integer, 0),
      coalesce((ev->>'exec_qty')::integer, 0),
      coalesce((ev->>'result_code')::integer, 0),
      coalesce(ev->>'message', ''),
      coalesce((ev->>'local_reject')::boolean, false)
    )
    ON CONFLICT DO NOTHING;

    -- 이미 적용된 seq — 재생 멱등의 유일한 근거(D-12). 투영을 건너뛴다.
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- 포이즌 격리(T-19-15): 투영 실패는 이 이벤트의 서브트랜잭션만 되돌리고 사유를 남긴다.
    BEGIN
      v_ids := v_ids || public.dma_journal_project(p_gateway, p_epoch, ev);
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE public.dma_journal_events
         SET apply_error = v_err
       WHERE gateway = p_gateway AND journal_epoch = p_epoch AND seq = v_seq;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('seq', v_seq, 'error', v_err));
    END;
  END LOOP;

  -- 커서 전진 — 같은 트랜잭션. 같은 epoch 면 GREATEST, 다르면(resync) 교체. 빈 배열은 커서를 건드리지 않는다.
  IF v_max IS NOT NULL THEN
    INSERT INTO public.dma_journal_cursor AS cur (gateway, journal_epoch, last_seq, updated_at)
    VALUES (p_gateway, p_epoch, v_max, now())
    ON CONFLICT (gateway) DO UPDATE SET
      journal_epoch = EXCLUDED.journal_epoch,
      last_seq = CASE
        WHEN cur.journal_epoch = EXCLUDED.journal_epoch
          THEN GREATEST(cur.last_seq, EXCLUDED.last_seq)
        ELSE EXCLUDED.last_seq
      END,
      updated_at = now();
  END IF;

  SELECT c.last_seq INTO v_last
    FROM public.dma_journal_cursor c
   WHERE c.gateway = p_gateway AND c.journal_epoch = p_epoch;

  -- 건드린 행(중복 제거)을 공개 컬럼 목록으로 — ⑨ dma_journal_orders_for_user 의 반환 컬럼과 **같은 목록**
  -- 이어야 한다(pgTAP dma_journal_apply.test.sql 이 두 키 집합을 비교한다). dma_user_id 는 싣지 않는다(T-19-08).
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.last_seq DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT o.id, o.trade_date, o.account_no, o.isin, s.code AS stock_code, o.exchange, o.board,
             o.side, o.order_type, o.org_order_no, o.qty, o.price, o.order_no, o.filled_qty,
             o.modified_qty, o.status, o.result_code, o.notice_type, o.message, o.origin,
             o.requester, o.request_kind, o.last_seq, o.created_at, o.updated_at
        FROM public.dma_account_orders o
        LEFT JOIN public.stocks s ON s.isin = o.isin
       WHERE o.id = ANY (v_ids)
    ) r;

  RETURN jsonb_build_object(
    'applied',  v_applied,
    'skipped',  v_skipped,
    'errors',   v_errors,
    'last_seq', coalesce(v_last, 0),
    'rows',     v_rows
  );
END;
$$;

-- ── ⑧ 매핑 스냅샷 원자 교체 ───────────────────────────────────────
-- p_rows = [{dma_user_id, account_no, name, priority}] (관찰자 로그인 응답 accounts 평탄화).
-- users.toml 은 핫리로드가 없어 관찰자 로그인 시점 스냅샷이 정본이다(D-06). 한 호출 = 게이트웨이 단위 교체.
CREATE OR REPLACE FUNCTION public.dma_journal_sync_access(p_gateway text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF coalesce(p_gateway, '') = '' THEN
    RAISE EXCEPTION 'dma_journal_sync_access: gateway 가 비어 있다';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'dma_journal_sync_access: p_rows 는 JSON 배열이어야 한다';
  END IF;
  -- 빈 dma_user_id·account_no 는 조용히 버리지 않고 교체 전체를 거부한다(기존 매핑 보존 — 트랜잭션 롤백).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
     WHERE coalesce(r->>'dma_user_id', '') = '' OR coalesce(r->>'account_no', '') = ''
  ) THEN
    RAISE EXCEPTION 'dma_journal_sync_access: dma_user_id/account_no 가 빈 행이 있다';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway));

  DELETE FROM public.dma_account_access WHERE gateway = p_gateway;

  -- users.toml 중복(같은 user·계좌 두 번)은 ON CONFLICT DO NOTHING 으로 흡수한다.
  INSERT INTO public.dma_account_access (gateway, dma_user_id, account_no, account_name, priority, synced_at)
  SELECT p_gateway,
         r->>'dma_user_id',
         r->>'account_no',
         coalesce(r->>'name', ''),
         coalesce((r->>'priority')::integer, 0),
         now()
    FROM jsonb_array_elements(p_rows) r
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── ⑨ 사용자별 오늘 주문 조회 (server GET /api/orders 왕복 1회) ─────────
-- 가시성 = user_id → dma_credentials.dma_user_id → dma_account_access → 계좌 (D-06).
-- dma_credentials.user_id 가 PK(사용자당 dma_user_id 1개)이고 access PK 가 (gateway, dma_user_id, account_no)
-- 라 한 주문 행이 두 번 나오지 않는다. dma_user_id 는 반환하지 않는다(T-19-08 · D-08).
-- p_user_id 는 server 가 requireAuth 로 확정한 값만 넘긴다 — 이 함수는 service_role 전용이다(T-19-01).
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
    JOIN public.dma_account_access a
      ON a.gateway = o.gateway AND a.account_no = o.account_no
    JOIN public.dma_credentials c
      ON c.dma_user_id = a.dma_user_id
    LEFT JOIN public.stocks s
      ON s.isin = o.isin
   WHERE c.user_id = p_user_id
     AND o.trade_date = p_trade_date
   ORDER BY o.created_at DESC, o.last_seq DESC;
$$;

-- ── 권한: 함수 7종 모두 service_role 전용 (시그니처 정확히 — Pitfall 10) ──
REVOKE EXECUTE ON FUNCTION public.dma_journal_status_rank(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_status_rank(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_status_rank(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_next_status(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_next_status(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_next_status(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_origin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_origin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_origin(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_project(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_project(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_project(text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_sync_access(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_sync_access(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_sync_access(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) TO service_role;

COMMIT;
