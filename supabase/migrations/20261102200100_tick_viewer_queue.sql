-- ============================================================
-- Phase 37 Plan 04 — 틱 전문 뷰어 요청 변환 큐 · Job RPC · 오늘 목록 · 접근 · 90일 purge (D-02 · D-03 · D-04 · D-08 · D-15).
--
-- 무엇(표 · tick_eta_s · tick_trigger_blocked 는 20261102200000):
--   웹용(server 가 p_user_id 로 부른다 · 첫 줄 게이트 dma_visible_accounts):
--     tick_request_convert_for_user(p_user_id, p_date, p_isin, p_ex, p_daily_cap) → jsonb — 요청 큐에 넣고 should_trigger 원자 판정
--     tick_cancel_convert_for_user(p_user_id, p_date, p_isin, p_ex)              → jsonb — 본인 pending 만 cancelled
--     tick_today_for_user(p_user_id)                                             → jsonb — 오늘 kind 16 등록 ∪ 고가 +15%
--     tick_access_for_user(p_user_id)                                            → jsonb — {access} (당일 바이트 경로 · server 60초 캐시)
--   Job/server 용(service_role · 게이트 없음):
--     tick_upload_retry_at(p_ts)                     — p_ts 뒤 첫 KST 23:30(NOT_UPLOADED 재요청 허용 시각)
--     tick_request_trigger_failed(p_date, p_ex, p_error) · tick_request_claim(p_date, p_ex) · tick_request_finish(p_date, p_ex, p_results)
--     tick_convert_run_record(p_run) · tick_convert_runs_since(p_since) · tick_convert_candidates(p_date) · tick_purge_old(p_keep_days)
--
-- should_trigger 원자 판정(D-03 · 호출량은 사용자 수와 독립 — CLAUDE.md · RESEARCH Pitfall 10):
--   같은 (날짜, 거래소) 호출을 pg_advisory_xact_lock 으로 직렬화한다. READ COMMITTED 라 뒤 호출의 다음 문장들이 앞 호출의 커밋을
--   본다 — 행 단위 UPDATE 조건만으로는 다른 isin 새 행이 「running 없음 · triggered 없음」 을 동시에 보고 둘 다 통과한다.
--   잠금 안에서 ① 죽은 running(started_at 25분 초과) 을 failed JOB_TIMEOUT 으로 닫고 ② 격자 · 업로드 전 · 상한을 보고
--   ③ INSERT … ON CONFLICT 로 (날짜, 거래소, isin) 한 행만 두고 ④ 그 (날짜, 거래소) 의 깨울 pending 전부에 triggered_at 을 찍는다.
--   ④ 가 1행 이상 = should_trigger true — 그 호출자만 Admin API jobs:run 을 부른다. 같은 (날짜, 거래소) 의 다른 isin 두 번째 호출은
--   tick_trigger_blocked 가 참이라 거짓 — 그 요청은 앞 Job 의 claim 에 실리거나, 앞 Job 이 끝난 뒤 open 의 stale 로 다시 트리거된다.
--   상수 근거(2분 · 25분)는 20261102200000 머리 주석.
--
-- 업로드 전 날짜(NOT_UPLOADED · D-01 이전 구간):
--   tick-archive 타이머 22:00 KST · 10/30 실측 업로드 KRX 22:00:22~22:59:48 · NXT 22:59:53~23:14:22 KST. Job 이 NOT_UPLOADED 로 끝낸
--   요청은 하루 상한에서 빠지고, finished_at 뒤 첫 23:30 KST 전까지 같은 키 재요청은 Job 을 깨우지 않고 {not_uploaded, retry_after} 만 준다.
--   23:00 이면 NXT 가 아직 올라오는 중이라 그 사이 재요청이 다시 NOT_UPLOADED 가 돼 하루를 더 막는다 — 그래서 23:30(nightly 첫 실행과 같은 시각).
--
-- 하루 상한(p_daily_cap · server TICK_REQUEST_DAILY_CAP 20): 전역(사용자별 아님) — 비용 가드라 사용자 수와 독립이어야 한다.
--   오늘(KST) triggered_at 이 찍힌 요청 수(끝난 NOT_UPLOADED 제외)가 상한 이상이고 이 키에 pending/running 이 없으면 capped.
--
-- purge(D-04 · 보존 90일): 표 셋에서 KST 오늘 − p_keep_days 이전 행을 지우고 지운 날짜 목록을 돌려준다. Storage 객체는 워커가
--   storage API 로 grid/<D>/ 를 지운다 — SQL 로 storage.objects 를 지우면 파일이 남는다(20261006090300 머리 주석 · limitup-sync purge 동형).
--
-- 권한: SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 37-16 `supabase db push`(메인 세션).
-- 되돌리기:
--   DROP FUNCTION public.tick_purge_old(integer); DROP FUNCTION public.tick_access_for_user(uuid);
--   DROP FUNCTION public.tick_today_for_user(uuid); DROP FUNCTION public.tick_convert_candidates(text);
--   DROP FUNCTION public.tick_convert_runs_since(text); DROP FUNCTION public.tick_convert_run_record(jsonb);
--   DROP FUNCTION public.tick_request_finish(text, text, jsonb); DROP FUNCTION public.tick_request_claim(text, text);
--   DROP FUNCTION public.tick_request_trigger_failed(text, text, text);
--   DROP FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text);
--   DROP FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer);
--   DROP FUNCTION public.tick_upload_retry_at(timestamptz);
-- ============================================================

BEGIN;

-- ── 업로드 재시도 시각 ─────────────────────────────────────────────
CREATE FUNCTION public.tick_upload_retry_at(p_ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT (CASE WHEN x.l < date_trunc('day', x.l) + interval '23 hours 30 minutes'
               THEN date_trunc('day', x.l) + interval '23 hours 30 minutes'
               ELSE date_trunc('day', x.l) + interval '1 day 23 hours 30 minutes'
          END) AT TIME ZONE 'Asia/Seoul'
    FROM (SELECT p_ts AT TIME ZONE 'Asia/Seoul' AS l) x;
$$;

COMMENT ON FUNCTION public.tick_upload_retry_at(timestamptz) IS
  'Phase 37 D-03 — p_ts 뒤 첫 KST 23:30(tick-archive 22:00 업로드 · 10/30 실측 NXT 끝 23:14:22 + 여유). 경계 비용: 거래가 많은 날 업로드가 '
  '23:30 을 넘기면 23:30 직후 재요청은 다시 NOT_UPLOADED 로 다음 23:30 까지 막힌다(대상 종목은 01:30 nightly 가 메운다 · 비대상 종목만 하루 늦음). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_upload_retry_at(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_upload_retry_at(timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_upload_retry_at(timestamptz) TO service_role;

-- ── ① 요청 변환(웹) ───────────────────────────────────────────────
CREATE FUNCTION public.tick_request_convert_for_user(
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
    -- (5) 하루 상한(전역) — 이 키에 이미 pending/running 이 있으면 상한과 무관하게 진행(stale 재트리거 허용)
    IF p_daily_cap IS NOT NULL AND NOT (v_found AND v_row.status IN ('pending', 'running')) THEN
      SELECT count(*)::integer INTO v_used
        FROM public.tick_convert_requests r
       WHERE r.triggered_at IS NOT NULL
         AND (r.triggered_at AT TIME ZONE 'Asia/Seoul')::date = v_today
         AND NOT (r.status = 'failed' AND r.error IS NOT DISTINCT FROM 'NOT_UPLOADED');
      IF v_used >= p_daily_cap THEN
        v_out := v_out || jsonb_build_object('capped', true);
      END IF;
    END IF;

    IF NOT (v_out->>'capped')::boolean THEN
      -- (6) (날짜, 거래소, isin) 한 행 — 끝난 요청(failed · cancelled · 격자 없는 done)만 다시 pending 으로
      INSERT INTO public.tick_convert_requests AS r (date, exchange, isin, status, requested_by, requested_at)
      VALUES (p_date, p_ex, p_isin, 'pending', p_user_id, now())
      ON CONFLICT (date, exchange, isin) DO UPDATE
         SET status = 'pending', requested_at = now(), error = NULL, finished_at = NULL, started_at = NULL,
             triggered_at = NULL, requested_by = EXCLUDED.requested_by
       WHERE r.status IN ('failed', 'cancelled', 'done');

      -- (7) 깨울 pending 전부에 triggered_at — tick_trigger_blocked 는 문장 스냅샷에서 평가되므로 같은 문장 안 행들이 서로를 막지 않는다
      UPDATE public.tick_convert_requests
         SET triggered_at = now()
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
  'Phase 37 D-03 — 요청 변환 큐 진입 + should_trigger 원자 판정((날짜, 거래소) advisory 잠금 · JOB_TIMEOUT 회수 · grid_ready · '
  'NOT_UPLOADED · 전역 하루 상한). should_trigger true 를 받은 호출자만 Job 을 깨운다. DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_convert_for_user(uuid, text, text, text, integer) TO service_role;

-- ── ② 취소(웹) — 본인 pending 만 ──────────────────────────────────
CREATE FUNCTION public.tick_cancel_convert_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
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

  UPDATE public.tick_convert_requests
     SET status = 'cancelled', finished_at = now()
   WHERE date = p_date AND exchange = p_ex AND isin = p_isin
     AND status = 'pending' AND requested_by = p_user_id;
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
  'Phase 37 D-03 — 요청 변환 취소(status pending ∧ requested_by = 본인일 때만 cancelled). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_cancel_convert_for_user(uuid, text, text, text) TO service_role;

-- ── ③ Job/server 용 ───────────────────────────────────────────────
CREATE FUNCTION public.tick_request_trigger_failed(p_date text, p_ex text, p_error text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  -- Admin API jobs:run 실패 — 찍어 둔 triggered_at 을 되돌려 다음 요청(또는 stale)이 다시 깨울 수 있게
  UPDATE public.tick_convert_requests
     SET triggered_at = NULL, error = p_error
   WHERE date = p_date AND exchange = p_ex AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_request_trigger_failed(text, text, text) IS
  'Phase 37 D-03 — Job 깨우기 실패 시 그 (날짜, 거래소) pending 의 triggered_at 을 NULL 로 되돌리고 error 기록. 바뀐 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_trigger_failed(text, text, text) TO service_role;

CREATE FUNCTION public.tick_request_claim(p_date text, p_ex text)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    UPDATE public.tick_convert_requests
       SET status = 'running', started_at = now()
     WHERE date = p_date AND exchange = p_ex AND status = 'pending'
    RETURNING isin
  )
  SELECT coalesce(jsonb_agg(c.isin ORDER BY c.isin), '[]'::jsonb) FROM c;
$$;

COMMENT ON FUNCTION public.tick_request_claim(text, text) IS
  'Phase 37 D-03 — 요청 Job 시작: 그 (날짜, 거래소) pending 전부 → running(started_at) · isin 배열(없으면 []). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_claim(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_claim(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_claim(text, text) TO service_role;

CREATE FUNCTION public.tick_request_finish(p_date text, p_ex text, p_results jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  -- running 행만 — JOB_TIMEOUT 으로 회수돼 다시 pending 이 된 행을 늦게 끝난 Job 이 덮지 않는다
  UPDATE public.tick_convert_requests r
     SET status      = CASE WHEN x.ok THEN 'done' ELSE 'failed' END,
         error       = CASE WHEN x.ok THEN NULL ELSE coalesce(x.error, 'FAILED') END,
         finished_at = now()
    FROM jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) AS x(isin text, ok boolean, error text)
   WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = x.isin AND r.status = 'running';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_request_finish(text, text, jsonb) IS
  'Phase 37 D-03 — 요청 Job 끝: 원소 {isin, ok, error} → done | failed(NO_RECORDS · NOT_UPLOADED · 업로드 실패 메시지) · running 행만 · 바뀐 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_request_finish(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_request_finish(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_request_finish(text, text, jsonb) TO service_role;

CREATE FUNCTION public.tick_convert_run_record(p_run jsonb)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.tick_convert_runs
         (date, exchange, mode, started_at, finished_at, ok, targets, written, bytes_read, duration_ms, error)
  SELECT x.date, x.exchange, x.mode, coalesce(x.started_at, now()), coalesce(x.finished_at, now()), x.ok, x.targets,
         x.written, x.bytes_read, x.duration_ms, x.error
    FROM jsonb_to_record(p_run) AS x(
           date text, exchange text, mode text, started_at timestamptz, finished_at timestamptz, ok boolean,
           targets integer, written integer, bytes_read bigint, duration_ms integer, error text)
  RETURNING id;
$$;

COMMENT ON FUNCTION public.tick_convert_run_record(jsonb) IS
  'Phase 37 D-04 — 변환 Job 실행 기록 1행(started_at · finished_at 없으면 now()). 새 id. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_convert_run_record(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_convert_run_record(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_convert_run_record(jsonb) TO service_role;

CREATE FUNCTION public.tick_convert_runs_since(p_since text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('date', r.date, 'exchange', r.exchange, 'mode', r.mode,
                                               'ok', r.ok, 'finished_at', r.finished_at)
                            ORDER BY r.date DESC, r.exchange, r.mode, r.finished_at), '[]'::jsonb)
    FROM public.tick_convert_runs r
   WHERE r.date >= p_since;
$$;

COMMENT ON FUNCTION public.tick_convert_runs_since(text) IS
  'Phase 37 D-04 — date ≥ p_since 실행 기록 {date, exchange, mode, ok, finished_at} 배열(nightly 따라잡기 판정). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_convert_runs_since(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_convert_runs_since(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_convert_runs_since(text) TO service_role;

CREATE FUNCTION public.tick_convert_candidates(p_date text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'accum',  (SELECT coalesce(jsonb_agg(a.isin ORDER BY a.isin), '[]'::jsonb)
                 FROM public.limitup_accum_flow a WHERE a.date = p_date),
    'live16', (SELECT coalesce(jsonb_agg(e.isin ORDER BY e.isin), '[]'::jsonb)
                 FROM (SELECT DISTINCT s.isin FROM public.dma_strategy_events s
                        WHERE s.kind = 16 AND s.trade_date = to_date(p_date, 'YYYYMMDD') AND s.isin <> '') e));
$$;

COMMENT ON FUNCTION public.tick_convert_candidates(text) IS
  'Phase 37 D-02 — nightly 대상 후보 {accum: limitup_accum_flow 그 날짜 isin, live16: 그날 dma_strategy_events kind 16 isin}(15% 는 Job 이 pcap 에서 더한다). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_convert_candidates(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_convert_candidates(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_convert_candidates(text) TO service_role;

-- ── ④ 오늘 목록(웹) ──────────────────────────────────────────────
CREATE FUNCTION public.tick_today_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  RETURN jsonb_build_object(
    'access', true,
    'date', to_char(v_today, 'YYYYMMDD'),
    'rows', (
      WITH k AS (  -- (a) 오늘 매집감지 등록(kind 16 부분 인덱스 trade_date)
        SELECT DISTINCT e.isin FROM public.dma_strategy_events e
         WHERE e.kind = 16 AND e.trade_date = v_today AND e.isin <> ''
      ), u AS (    -- (b) 오늘 갱신 시세 중 고가 기준 +15% 이상 — 정수 경계 (high − base)·100 ≥ base·15
        SELECT s.isin FROM public.stock_quotes q JOIN public.stocks s ON s.code = q.code
         WHERE s.isin IS NOT NULL
           AND (q.updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
           AND q.high IS NOT NULL
           AND q.price - q.change_amount > 0
           AND (q.high - (q.price - q.change_amount)) * 100 >= (q.price - q.change_amount) * 15
      ), ids AS (
        SELECT isin FROM k UNION SELECT isin FROM u
      )
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.rate DESC NULLS LAST, t.isin), '[]'::jsonb)
        FROM (SELECT i.isin, st.code, st.name,
                     array_remove(ARRAY[CASE WHEN i.isin IN (SELECT isin FROM k) THEN 'accum' END,
                                        CASE WHEN i.isin IN (SELECT isin FROM u) THEN 'up15' END], NULL) AS sources,
                     q.change_rate::double precision AS rate,
                     CASE WHEN q.high IS NOT NULL AND q.price - q.change_amount > 0
                          THEN ((q.high - (q.price - q.change_amount)) * 100 / (q.price - q.change_amount))::double precision
                     END AS high_rate
                FROM ids i
                LEFT JOIN public.stocks st ON st.isin = i.isin
                LEFT JOIN public.stock_quotes q
                       ON q.code = st.code AND (q.updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today) t));
END;
$$;

COMMENT ON FUNCTION public.tick_today_for_user(uuid) IS
  'Phase 37 D-15 — 오늘(KST) 목록: kind 16 등록(accum) ∪ stock_quotes 오늘 갱신분 고가 +15% 이상(up15) · 정렬 rate DESC. DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_today_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_today_for_user(uuid) TO service_role;

-- ── ⑤ 접근 판정(당일 바이트 경로) ─────────────────────────────────
CREATE FUNCTION public.tick_access_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('access', EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)));
$$;

COMMENT ON FUNCTION public.tick_access_for_user(uuid) IS
  'Phase 37 D-08 — 틱 뷰어 게이트 {access}(당일 바이트 경로 · server 사용자별 60초 캐시). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_access_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_access_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_access_for_user(uuid) TO service_role;

-- ── ⑥ 90일 purge ─────────────────────────────────────────────────
CREATE FUNCTION public.tick_purge_old(p_keep_days integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff text;
  v_g      integer;
  v_q      integer;
  v_r      integer;
  v_gd     text[];
  v_qd     text[];
  v_rd     text[];
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'tick_purge_old: p_keep_days 는 1 이상이어야 한다 (받은 값 %)', p_keep_days;
  END IF;

  v_cutoff := to_char((now() AT TIME ZONE 'Asia/Seoul')::date - p_keep_days, 'YYYYMMDD');

  WITH d AS (DELETE FROM public.tick_grids WHERE date < v_cutoff RETURNING date)
  SELECT count(*)::integer, coalesce(array_agg(DISTINCT d.date), '{}') INTO v_g, v_gd FROM d;
  WITH d AS (DELETE FROM public.tick_convert_requests WHERE date < v_cutoff RETURNING date)
  SELECT count(*)::integer, coalesce(array_agg(DISTINCT d.date), '{}') INTO v_q, v_qd FROM d;
  WITH d AS (DELETE FROM public.tick_convert_runs WHERE date < v_cutoff RETURNING date)
  SELECT count(*)::integer, coalesce(array_agg(DISTINCT d.date), '{}') INTO v_r, v_rd FROM d;

  -- dates = 지운 날짜 전부(격자 행이 없어도 실행 기록이 있던 날짜는 객체가 남았을 수 있다 — 워커가 grid/<D>/ 를 지운다)
  RETURN jsonb_build_object(
    'cutoff', v_cutoff, 'grids', v_g, 'requests', v_q, 'runs', v_r,
    'dates', (SELECT coalesce(jsonb_agg(x.d ORDER BY x.d), '[]'::jsonb)
                FROM (SELECT unnest(v_gd) AS d UNION SELECT unnest(v_qd) UNION SELECT unnest(v_rd)) x));
END;
$$;

COMMENT ON FUNCTION public.tick_purge_old(integer) IS
  'Phase 37 D-04 — 틱 표 셋 보존 정리(KST 오늘 − p_keep_days 이전 삭제 · {cutoff, grids, requests, runs, dates}). Storage 객체는 워커가 storage API 로 지운다. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_purge_old(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_purge_old(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_purge_old(integer) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
