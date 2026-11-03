-- ============================================================
-- Phase 37 code review WR-02 — 합쳐진 요청 변환(D-03)의 취소를 「내 몫 빼기」로 바꾼다.
--
-- 문제(20261102200100):
--   D-03 은 같은 (종목, 날짜) 동시 요청을 Job 하나로 합친다. 그런데 행은 (날짜, 거래소, isin) 하나뿐이고 requested_by 에는
--   첫 요청자만 남았다. 두 번째 사용자가 같은 키를 요청하면 ON CONFLICT 가 행을 그대로 둔다 → 첫 요청자가 취소하면 공유 요청
--   전체가 cancelled 가 되고, 두 번째 사용자의 폴링은 그것을 「변환에 실패했어요」 카드로 본다. 거꾸로 두 번째 사용자는 자기가
--   기다리는 요청을 취소할 수 없었다(requested_by ≠ 본인 → cancelled false).
--
-- 무엇(설계 — 요청자 집합):
--   ① tick_convert_requests.requesters uuid[] — 이 요청 회차(pending/running)를 기다리는 사용자 집합. requested_by 는 그 회차를
--      연 첫 요청자(기존 의미 그대로).
--   ② 요청: 새 행 · 끝난 행을 다시 올림 = {본인} 으로 새 회차. 이미 pending/running 인 행 = 본인을 집합에 더한다(합류 · Job 0 —
--      WR-01 의 상한 단락과 tick_trigger_blocked 가 새 Job 을 막는다).
--   ③ 취소: pending ∧ 본인 ∈ 집합일 때 본인만 뺀다. 집합이 비면(마지막 요청자)만 status = cancelled. 응답 `cancelled` =
--      「내 몫을 뺐다」 · 요청 자체가 취소됐는지는 `request.status`. running 은 여전히 취소하지 않는다(Job 은 끝까지 돈다).
--   ④ 취소도 요청과 같은 (날짜, 거래소) advisory 잠금을 잡는다 — 요청의 「ON CONFLICT 무변경 → 합류 UPDATE」 사이에 마지막
--      취소가 끼어 행이 cancelled 가 되면 합류가 빠지고 그 사용자 화면이 실패로 보이는 틈을 막는다.
--   requesters 는 응답에 내보내지 않는다(다른 사용자 uuid — day · open · request · cancel 응답은 열을 골라 만든다).
--
-- 남는 틈(webapp 후속 · 이 마이그레이션 밖): 이미 변환 중인 키를 연 사용자는 웹이 stale 일 때만 convert 를 불러서 집합에
--   들지 않는다(수동 대기자). 마지막 요청자가 취소하면 그 화면은 여전히 cancelled 를 받는다 — 웹이 활성 요청을 열 때 convert 를
--   한 번 불러 합류하거나(Job 0 · 상한 0), 폴링의 cancelled 를 「취소됨 · 다시 요청」 으로 구분해야 한다.
--
-- 권한: 시그니처가 같아 기존 GRANT 가 남지만 20261102200100 과 같게 PUBLIC · anon · authenticated REVOKE + service_role GRANT 를
--   다시 적는다(자동 메모리 feedback_supabase_rpc_revoke). 표 권한은 바뀌지 않는다(열 추가).
-- 원격 적용: 커밋만 — `supabase db push` 는 메인 세션.
-- 되돌리기: 20261104300000 의 tick_request_convert_for_user · 20261102200100 의 tick_cancel_convert_for_user 로
--   CREATE OR REPLACE 한 뒤 ALTER TABLE public.tick_convert_requests DROP COLUMN requesters;
-- ============================================================

BEGIN;

ALTER TABLE public.tick_convert_requests
  ADD COLUMN requesters uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tick_convert_requests.requesters IS
  '이 요청 회차(pending/running)를 기다리는 사용자 집합 — 취소는 본인만 빼고, 비면 cancelled(WR-02 · D-03 합치기). 응답에 내보내지 않는다';

-- 기존 행: 첫 요청자 한 명으로 채운다(옛 「본인 pending 만 취소」 와 같은 결과에서 시작).
UPDATE public.tick_convert_requests
   SET requesters = ARRAY[requested_by]
 WHERE requested_by IS NOT NULL;

-- ── ① 요청 변환(웹) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_request_convert_for_user(
  p_user_id   uuid,
  p_date      text,
  p_isin      text,
  p_ex        text,
  p_daily_cap integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_row    public.tick_convert_requests%ROWTYPE;
  v_found  boolean;
  v_retry  timestamptz;
  v_used   integer;
  v_trig   integer;
  v_out    jsonb := jsonb_build_object('access', true, 'should_trigger', false, 'capped', false,
                                       'grid_ready', false, 'not_uploaded', false, 'retry_after', NULL);
BEGIN
  -- (0) 게이트
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- (1) 같은 (날짜, 거래소) 호출 직렬화 — 트랜잭션 끝에 풀린다(취소도 같은 잠금 — WR-02)
  PERFORM pg_advisory_xact_lock(hashtextextended('tick_convert:' || p_date || ':' || p_ex, 0));

  -- (2) 죽은 Job 의 running 회수(25분 = 요청 실행 타임아웃 1200s + 5분)
  UPDATE public.tick_convert_requests
     SET status = 'failed', error = 'JOB_TIMEOUT', finished_at = now()
   WHERE date = p_date AND exchange = p_ex AND status = 'running'
     AND started_at < now() - interval '25 minutes';

  SELECT * INTO v_row FROM public.tick_convert_requests
   WHERE date = p_date AND exchange = p_ex AND isin = p_isin;
  v_found := FOUND;

  IF EXISTS (SELECT 1 FROM public.tick_grids g WHERE g.date = p_date AND g.exchange = p_ex AND g.isin = p_isin) THEN
    -- (3) 격자가 이미 있다 — 바로 연다
    v_out := v_out || jsonb_build_object('grid_ready', true);

  ELSIF v_found AND v_row.status = 'failed' AND v_row.error = 'NOT_UPLOADED' AND v_row.finished_at IS NOT NULL
        AND now() < public.tick_upload_retry_at(v_row.finished_at) THEN
    -- (4) 업로드 전 날짜 — 다음 23:30 KST 까지 Job 을 깨우지 않는다(상한 · Job 소모 0)
    v_retry := public.tick_upload_retry_at(v_row.finished_at);
    v_out := v_out || jsonb_build_object('not_uploaded', true, 'retry_after', v_retry);

  ELSE
    -- (5) 하루 상한(전역 · 깨운 횟수 합) — 이 호출이 Job 을 새로 깨울 수 없을 때(이 키가 running 이거나 2분 안에 깨운 pending ·
    --     둘 다 tick_trigger_blocked 참이라 (7) 이 0행)만 상한을 건너뛴다. stale pending 재트리거는 상한을 거친다(WR-01).
    IF p_daily_cap IS NOT NULL
       AND NOT (v_found AND (v_row.status = 'running'
                             OR (v_row.status = 'pending' AND v_row.triggered_at >= now() - interval '2 minutes'))) THEN
      SELECT coalesce(sum(r.trigger_count), 0)::integer INTO v_used
        FROM public.tick_convert_requests r
       WHERE r.trigger_day = v_today
         AND NOT (r.status = 'failed' AND r.error IS NOT DISTINCT FROM 'NOT_UPLOADED');
      IF v_used >= p_daily_cap THEN
        v_out := v_out || jsonb_build_object('capped', true);
      END IF;
    END IF;

    IF NOT (v_out->>'capped')::boolean THEN
      -- (6) (날짜, 거래소, isin) 한 행 — 끝난 요청(failed · cancelled · 격자 없는 done)만 다시 pending 으로(새 회차 · 요청자 {본인}).
      --     trigger_day · trigger_count 는 건드리지 않는다(다시 올려도 그날 깨운 횟수는 남는다 — WR-01)
      INSERT INTO public.tick_convert_requests AS r (date, exchange, isin, status, requested_by, requested_at, requesters)
      VALUES (p_date, p_ex, p_isin, 'pending', p_user_id, now(), ARRAY[p_user_id])
      ON CONFLICT (date, exchange, isin) DO UPDATE
         SET status = 'pending', requested_at = now(), error = NULL, finished_at = NULL, started_at = NULL,
             triggered_at = NULL, requested_by = EXCLUDED.requested_by, requesters = EXCLUDED.requesters
       WHERE r.status IN ('failed', 'cancelled', 'done');

      -- (6b) 진행 중인 회차에 합류 — 본인을 요청자 집합에 더한다(WR-02 · 이미 있으면 그대로)
      UPDATE public.tick_convert_requests
         SET requesters = array_append(requesters, p_user_id)
       WHERE date = p_date AND exchange = p_ex AND isin = p_isin
         AND status IN ('pending', 'running') AND NOT (p_user_id = ANY (requesters));

      -- (7) 깨울 pending 전부에 triggered_at + 그날 횟수 +1 — tick_trigger_blocked 는 문장 스냅샷에서 평가되므로 같은 문장 안
      --     행들이 서로를 막지 않는다. SET 의 오른쪽은 옛 행 값을 본다(trigger_day 비교는 바꾸기 전 값).
      UPDATE public.tick_convert_requests
         SET triggered_at  = now(),
             trigger_count = CASE WHEN trigger_day = v_today THEN trigger_count + 1 ELSE 1 END,
             trigger_day   = v_today
       WHERE date = p_date AND exchange = p_ex AND status = 'pending'
         AND (triggered_at IS NULL OR triggered_at < now() - interval '2 minutes')
         AND NOT public.tick_trigger_blocked(p_date, p_ex);
      GET DIAGNOSTICS v_trig = ROW_COUNT;

      v_out := v_out || jsonb_build_object('should_trigger', v_trig > 0);
    END IF;
  END IF;

  RETURN v_out || jsonb_build_object(
    'eta_s', public.tick_eta_s(p_ex),
    'request', (SELECT jsonb_build_object(
                         'exchange', r.exchange, 'isin', r.isin, 'status', r.status,
                         'requested_at', r.requested_at, 'triggered_at', r.triggered_at,
                         'started_at', r.started_at, 'finished_at', r.finished_at, 'error', r.error)
                  FROM public.tick_convert_requests r
                 WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin));
END;
$$;

COMMENT ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) IS
  'Phase 37 D-03 · WR-01 · WR-02 — 요청 변환 큐 진입 + should_trigger 원자 판정((날짜, 거래소) advisory 잠금 · JOB_TIMEOUT 회수 · '
  'grid_ready · NOT_UPLOADED · 전역 하루 상한 = 오늘 깨운 횟수 합 · 진행 중 회차 합류 = 요청자 집합에 본인 추가). '
  'should_trigger true 를 받은 호출자만 Job 을 깨운다. DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) TO service_role;

-- ── ② 취소(웹) — 내 몫 빼기 · 마지막 요청자일 때만 cancelled ─────────
CREATE OR REPLACE FUNCTION public.tick_cancel_convert_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  -- 요청(합류)과 같은 (날짜, 거래소) 잠금 — 합류와 마지막 취소가 엇갈리지 않게
  PERFORM pg_advisory_xact_lock(hashtextextended('tick_convert:' || p_date || ':' || p_ex, 0));

  -- SET 의 오른쪽은 옛 행 값 — 남는 집합이 비는지는 array_remove(옛 집합) 로 본다
  UPDATE public.tick_convert_requests
     SET requesters  = array_remove(requesters, p_user_id),
         status      = CASE WHEN cardinality(array_remove(requesters, p_user_id)) = 0 THEN 'cancelled' ELSE status END,
         finished_at = CASE WHEN cardinality(array_remove(requesters, p_user_id)) = 0 THEN now() ELSE finished_at END
   WHERE date = p_date AND exchange = p_ex AND isin = p_isin
     AND status = 'pending' AND p_user_id = ANY (requesters);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'access', true,
    'cancelled', v_n > 0,
    'request', (SELECT jsonb_build_object(
                         'exchange', r.exchange, 'isin', r.isin, 'status', r.status,
                         'requested_at', r.requested_at, 'triggered_at', r.triggered_at,
                         'started_at', r.started_at, 'finished_at', r.finished_at, 'error', r.error)
                  FROM public.tick_convert_requests r
                 WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin));
END;
$$;

COMMENT ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) IS
  'Phase 37 D-03 · WR-02 — 요청 변환 취소 = 내 몫 빼기(status pending ∧ 본인 ∈ requesters 일 때 본인만 뺀다 · 집합이 비면 cancelled). '
  'cancelled = 내 몫을 뺐다 · 요청 자체의 상태는 request.status. DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 정의를 읽게 한다.
NOTIFY pgrst, 'reload schema';
