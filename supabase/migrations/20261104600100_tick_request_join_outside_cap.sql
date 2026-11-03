-- ============================================================
-- Phase 37 code review R2-IN-06 — 진행 중 회차 합류(WR-02 (6b))를 하루 상한 판정 밖으로 옮긴다.
--
-- 문제(20261104300100 · 20261104600000):
--   (6b) 합류 UPDATE 가 `IF NOT capped` 안에 있었다. 이미 pending 인데 2분이 지난(stale · triggered_at NULL 포함 — R2-WR-02)
--   행에 다른 사용자가 오면 상한 검사를 거치고, 상한에 걸리면 capped 를 받고 요청자 집합에 들지 않는다. 그 뒤 원래 요청자가
--   취소하면 집합이 비어 cancelled — 이 사용자 화면은 cancelled 를 본다. 「합류는 Job 0 · 상한 0」(20261104300100 머리 주석 ②)과
--   어긋난다.
--
-- 무엇: 합류 UPDATE 를 (5) 상한 판정 앞 (5a) 로 옮겨 상한과 무관하게 늘 한다. 상한은 여전히 (6) 다시 올림 · (7) 재트리거만 막는다
--   (capped 면 둘 다 하지 않는다 — 응답 모양 · 429 경로 그대로). 그 밖은 20261104600000 과 같다.
--
-- 원본: 20261104300100 · 20261104600000 은 적용본(또는 같은 배치)이라 고치지 않는다.
-- 권한: CREATE OR REPLACE 가 유지하지만 원본과 똑같이 PUBLIC · anon · authenticated REVOKE + service_role GRANT 를 다시 적는다
--   (자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — `supabase db push` 는 메인 세션.
-- 되돌리기: 20261104600000_tick_request_cap_null_triggered.sql 의 함수 본문으로 CREATE OR REPLACE.
-- ============================================================

BEGIN;

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
    -- (5a) 진행 중인 회차에 합류 — 본인을 요청자 집합에 더한다(WR-02 · 이미 있으면 그대로). 합류는 Job 0 · 상한 0 이라
    --      상한 판정 **밖**에서 늘 한다(R2-IN-06 — stale pending 에 합류하려던 사용자가 capped 를 받고 집합에서 빠지면, 원래
    --      요청자가 취소할 때 그 화면이 cancelled 를 보던 틈). 끝난 행(failed · cancelled · done)은 status 조건에 걸려 그대로다.
    UPDATE public.tick_convert_requests
       SET requesters = array_append(requesters, p_user_id)
     WHERE date = p_date AND exchange = p_ex AND isin = p_isin
       AND status IN ('pending', 'running') AND NOT (p_user_id = ANY (requesters));

    -- (5) 하루 상한(전역 · 깨운 횟수 합) — 이 호출이 Job 을 새로 깨울 수 없을 때(이 키가 running 이거나 2분 안에 깨운 pending ·
    --     둘 다 tick_trigger_blocked 참이라 (7) 이 0행)만 상한을 건너뛴다. stale pending 재트리거는 상한을 거친다(WR-01).
    --     triggered_at IS NULL(한 번도 안 깨운 · 깨우기 실패로 되돌린 pending)은 가장 stale 한 경우다 — NULL 비교가 NULL 로 번져
    --     IF 가 상한을 통째로 건너뛰지 않게 coalesce(…, false) 로 「2분 안에 깨움 아님」 으로 접는다(R2-WR-02).
    IF p_daily_cap IS NOT NULL
       AND NOT (v_found AND (v_row.status = 'running'
                             OR (v_row.status = 'pending'
                                 AND coalesce(v_row.triggered_at >= now() - interval '2 minutes', false)))) THEN
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
  'Phase 37 D-03 · WR-01 · WR-02 · R2-WR-02 · R2-IN-06 — 요청 변환 큐 진입 + should_trigger 원자 판정((날짜, 거래소) advisory 잠금 · JOB_TIMEOUT 회수 · '
  'grid_ready · NOT_UPLOADED · 전역 하루 상한 = 오늘 깨운 횟수 합(triggered_at NULL pending 도 상한을 거친다) · '
  '진행 중 회차 합류 = 요청자 집합에 본인 추가 — 상한과 무관하게 늘 · 재트리거만 상한). '
  'should_trigger true 를 받은 호출자만 Job 을 깨운다. DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 정의를 읽게 한다.
NOTIFY pgrst, 'reload schema';
