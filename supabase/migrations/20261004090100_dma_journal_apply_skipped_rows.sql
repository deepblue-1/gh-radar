-- ============================================================
-- 19-REVIEW WR-09 — 재시도된(이미 적용된) 배치도 그 이벤트가 가리키는 행을 돌려준다.
--
-- 무엇을 바꾸는가:
--   dma_journal_apply 가 DB 에서 커밋됐는데 HTTP 응답이 유실되면(소켓 리셋 · 게이트웨이 타임아웃 · Supabase 504)
--   relay 기록기는 실패로 보고 **같은 배치를 재시도**한다(Pitfall 2 — 의도된 동작). 두 번째 호출에서는 모든 이벤트가
--   PK 충돌로 skipped 가 되어 투영을 건너뛰므로 v_ids 가 비고 rows: [] 가 돌아온다 — 첫 호출이 바꾼 행이 **어떤
--   브라우저에도 푸시되지 않는다**. 그 주문에 후속 통보가 없으면(마지막 체결 · 취소 확인 같은 종결 통보) 「오늘 주문」
--   카드는 새로고침 · 재접속 전까지 옛 상태(예: 부분체결)에 머물고, journal.state 는 live 라 「기록 지연」 표식도 없다.
--   이 파일은 skipped 분기에서도 그 이벤트가 가리키는 행 id 를 모아 rows 에 싣는다.
--
-- 결정 근거:
--   - 본문은 20260924200100 ⑦ 의 dma_journal_apply 그대로이고 skipped 분기 한 곳만 바뀐다(이후 이 함수를 재정의한
--     마이그레이션은 없다 — 20260929190000 은 조회 RPC 만 바꿨다). 시그니처 · 반환 jsonb 모양 · 커서 규칙 · 포이즌 격리 ·
--     advisory lock 은 무변경이다. 「이벤트 PK 삽입 성공 = 1회 적용 · 커서는 이 트랜잭션 안에서만 전진」 불변식도 그대로다
--     — 추가된 것은 읽기(SELECT id) 뿐이다.
--   - 대상 행 = 투영(dma_journal_project)이 건드리는 키 그대로: 같은 (gateway, trade_date, account_no) 의 자기 주문번호 ·
--     원주문번호 행 + 같은 (gateway, journal_epoch, reject_seq) 의 거부 행. 이미 그 뒤 이벤트로 더 바뀐 행이면 그
--     최신 상태를 보낸다 — 웹앱 병합(mergeJournalRows)은 같은 id 면 lastSeq 가 큰 쪽이 이기므로 재전송이 멱등이다.
--   - 비용: 재생 중복은 보통 몇 건(재접속 겹침 · 응답 유실 재시도)이고, 키는 기존 유일 인덱스를 탄다. 반환 rows 는
--     v_ids 중복 제거 뒤 한 번 조인한다(기존 그대로).
--   - 권한 재명시: service_role 전용(PUBLIC · anon · authenticated 명시 REVOKE — 메모리 「Supabase RPC 는 REVOKE
--     anon/authenticated 명시」). SECURITY INVOKER 그대로.
--
-- 배포: relay 무수정(기록기는 rows 를 그대로 applied 로 넘긴다). DB 만 적용하면 된다.
-- 되돌리기(수동): 20260924200100 ⑦ 본문으로 CREATE OR REPLACE 후 권한 3줄 재명시.
-- ============================================================

BEGIN;

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
    -- 19-REVIEW WR-09: 건너뛴 이벤트가 가리키는 행도 반환 rows 에 싣는다. 커밋 뒤 응답이 유실돼 기록기가 같은
    -- 배치를 재시도하면 두 번째 호출은 전부 skipped 라 rows 가 비고, 첫 호출이 바꾼 행이 어떤 브라우저에도
    -- 푸시되지 않는다(종결 통보면 새로고침 전까지 옛 상태). 웹앱 병합은 lastSeq 비교라 같은 행 재전송은 멱등이다.
    -- 대상 = 투영이 건드리는 키 그대로: 자기 번호 · 원주문 번호 행(같은 거래일 · 계좌) + 이 seq 의 거부 행.
    -- 상태는 바꾸지 않는다(읽기만) — 「PK 삽입 성공 = 1회 적용」 불변식 무변경.
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      v_ids := v_ids || ARRAY(
        SELECT o.id
          FROM public.dma_account_orders o
         WHERE o.gateway = p_gateway
           AND (
             (o.trade_date = (ev->>'trade_date')::date
              AND o.account_no = coalesce(ev->>'account_no', '')
              AND o.order_no IN (NULLIF(coalesce(ev->>'order_no', ''), ''),
                                 NULLIF(coalesce(ev->>'org_order_no', ''), '')))
             OR (o.journal_epoch = p_epoch AND o.reject_seq = v_seq)
           )
      );
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


REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) TO service_role;

COMMIT;
