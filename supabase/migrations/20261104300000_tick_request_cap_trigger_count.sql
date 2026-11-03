-- ============================================================
-- Phase 37 code review WR-01 — 요청 변환 하루 상한을 「행 수」가 아니라 「깨운 횟수」로 센다.
--
-- 문제(20261102200100 의 상한):
--   상한은 오늘(KST) triggered_at 이 찍힌 **행 수**였다. 그런데
--   - 끝난 요청(failed · cancelled · done)을 다시 pending 으로 올리는 ON CONFLICT 가 triggered_at 을 지우고 바로 다시 찍는다 —
--     같은 키는 몇 번을 다시 깨워도 상한에 1건이었다(결정된 실패 NO_RECORDS · TOO_LARGE 「다시 시도」 · 취소 → 재요청 반복).
--   - 2분이 지난 pending 의 triggered_at 을 덮어써서, claim 전에 죽는 Job 을 stale 재요청이 2분마다 깨워도 상한이 늘지 않았다.
--   - 「이 키에 pending/running 이 있으면 상한 무시」 단락이 stale pending 재트리거까지 상한 밖으로 뺐다.
--   그래서 상한은 서로 다른 키의 수만 묶고 Job 실행 횟수를 묶지 못했다(머리 주석의 「사용자 수와 독립인 비용 가드」 위반).
--
-- 무엇:
--   ① tick_convert_requests 에 trigger_day(KST 날짜) · trigger_count(그날 이 행을 깨운 횟수) — 행을 다시 pending 으로 올려도
--      지우지 않는다. (7) 의 triggered_at 찍기가 그날 횟수를 +1(날이 바뀌면 1 부터).
--   ② 상한 = 오늘 trigger_day 행들의 trigger_count 합(끝난 NOT_UPLOADED 행 제외 — 통독 없이 끝난 Job · 기존 규칙 그대로).
--      행 단위로 센다(같은 (날짜, 거래소) pending 여럿을 한 Job 이 처리해도 각각 1) — 옛 「요청 수」 의미를 지키는 보수적 셈.
--   ③ 상한 단락은 「이 호출이 Job 을 새로 깨울 수 없을 때」만 — 이 키가 running(25분 안 · 죽은 것은 (2) 가 먼저 닫는다)이거나
--      2분 안에 깨운 pending 일 때. 둘 다 tick_trigger_blocked 가 참이라 (7) 이 0행이다(합류만 · Job 0). stale pending 재트리거는
--      이제 상한을 거친다.
--   ④ tick_request_trigger_failed — Admin API jobs:run 실패(Job 0회)면 찍었던 오늘 횟수를 1 되돌린다.
--
-- 적용하지 않은 것(리뷰 (b) · 선택): NO_RECORDS · TOO_LARGE 결정된 실패의 재트리거 단락. 웹 「다시 시도」 흐름이 바뀌어야 해서
--   (should_trigger false 인데 「변환 중」 카드로 들어갔다가 폴링에서 다시 실패 카드) 이번엔 ①~③ 의 상한 소모로 비용만 묶는다.
--
-- 권한: 시그니처가 같아 기존 GRANT 가 남지만 20261102200100 과 같게 PUBLIC · anon · authenticated REVOKE + service_role GRANT 를
--   다시 적는다(자동 메모리 feedback_supabase_rpc_revoke). 표 권한은 바뀌지 않는다(열 추가).
-- 원격 적용: 커밋만 — `supabase db push` 는 메인 세션.
-- 되돌리기: 20261102200100 의 두 함수 정의로 CREATE OR REPLACE 한 뒤
--   ALTER TABLE public.tick_convert_requests DROP COLUMN trigger_count, DROP COLUMN trigger_day;
-- ============================================================

BEGIN;

ALTER TABLE public.tick_convert_requests
  ADD COLUMN trigger_day   date,
  ADD COLUMN trigger_count integer NOT NULL DEFAULT 0 CHECK (trigger_count >= 0);

COMMENT ON COLUMN public.tick_convert_requests.trigger_day   IS 'trigger_count 가 센 KST 날짜 — 하루 상한의 날짜 키(WR-01)';
COMMENT ON COLUMN public.tick_convert_requests.trigger_count IS 'trigger_day 에 이 행을 깨운 횟수 — 다시 pending 으로 올려도 지우지 않는다 · 하루 상한 = 오늘 합(WR-01)';

-- 이미 깨운 행은 그 날짜에 1회로 채운다(옛 셈과 같은 값에서 시작).
UPDATE public.tick_convert_requests
   SET trigger_day = (triggered_at AT TIME ZONE 'Asia/Seoul')::date, trigger_count = 1
 WHERE triggered_at IS NOT NULL;

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

  -- (1) 같은 (날짜, 거래소) 호출 직렬화 — 트랜잭션 끝에 풀린다
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
      -- (6) (날짜, 거래소, isin) 한 행 — 끝난 요청(failed · cancelled · 격자 없는 done)만 다시 pending 으로.
      --     trigger_day · trigger_count 는 건드리지 않는다(다시 올려도 그날 깨운 횟수는 남는다 — WR-01)
      INSERT INTO public.tick_convert_requests AS r (date, exchange, isin, status, requested_by, requested_at)
      VALUES (p_date, p_ex, p_isin, 'pending', p_user_id, now())
      ON CONFLICT (date, exchange, isin) DO UPDATE
         SET status = 'pending', requested_at = now(), error = NULL, finished_at = NULL, started_at = NULL,
             triggered_at = NULL, requested_by = EXCLUDED.requested_by
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
  'Phase 37 D-03 · WR-01 — 요청 변환 큐 진입 + should_trigger 원자 판정((날짜, 거래소) advisory 잠금 · JOB_TIMEOUT 회수 · grid_ready · '
  'NOT_UPLOADED · 전역 하루 상한 = 오늘 깨운 횟수 합(trigger_count · 다시 올려도 남음)). should_trigger true 를 받은 호출자만 Job 을 깨운다. '
  'DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) TO service_role;

-- ── ③ Job 깨우기 실패 되돌림 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_request_trigger_failed(p_date text, p_ex text, p_error text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_n     integer;
BEGIN
  -- Admin API jobs:run 실패 — 찍어 둔 triggered_at 을 되돌려 다음 요청(또는 stale)이 다시 깨울 수 있게.
  -- Job 이 돌지 않았으므로 (7) 이 더한 오늘 횟수도 1 되돌린다(WR-01 — 상한은 실제로 깨운 횟수).
  UPDATE public.tick_convert_requests
     SET triggered_at  = NULL,
         error         = p_error,
         trigger_count = CASE WHEN triggered_at IS NOT NULL AND trigger_day = v_today
                              THEN greatest(trigger_count - 1, 0) ELSE trigger_count END
   WHERE date = p_date AND exchange = p_ex AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_request_trigger_failed(text, text, text) IS
  'Phase 37 D-03 · WR-01 — Job 깨우기 실패 시 그 (날짜, 거래소) pending 의 triggered_at 을 NULL 로 되돌리고 error 기록 · 오늘 깨운 횟수 −1. '
  '바뀐 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 정의를 읽게 한다.
NOTIFY pgrst, 'reload schema';
