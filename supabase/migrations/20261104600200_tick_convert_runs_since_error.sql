-- ============================================================
-- Phase 37 code review R2-WR-03 — tick_convert_runs_since 가 실행 기록 error 도 돌려준다.
--
-- 왜: nightly 포기 규칙(WR-36)이 ok false 기록을 날짜별로 모두 셌다 — Supabase · GCS 일시 장애가 하룻밤 반(실행 3회)만 이어져도
--   catch-up 10일 안의 미완 날짜가 한꺼번에 영구 포기됐다. 워커는 이제 일시 장애로만 실패한 기록의 error 를 `TRANSIENT: …` 로,
--   날짜 시작 때 「시작」 기록(ok null · error `STARTED`)을 남긴다. 포기 판정(workers/tick-convert nightly failedNightlyRunsOf)은
--   error 를 봐야 「TRANSIENT 는 세지 않음 · 끝 기록 없는 STARTED 는 크래시로 셈」 을 가를 수 있다.
--
-- 무엇: 원소에 'error' 한 키를 더한다 — {date, exchange, mode, ok, finished_at, error}. 정렬 · 범위는 20261102200100 그대로.
--   표 · run_record 는 바뀌지 않는다(ok 는 원래 nullable · error text).
--
-- 호환: 옛 워커는 늘어난 키를 무시한다. 새 워커가 이 마이그레이션 전 RPC 를 만나면 error 가 없어 모든 ok false 를 결정적으로
--   센다(이전 동작 그대로) — 배포 순서 무관.
-- 원본: 20261102200100_tick_viewer_queue.sql 은 적용본이라 고치지 않는다.
-- 권한: CREATE OR REPLACE 가 유지하지만 원본과 똑같이 PUBLIC · anon · authenticated REVOKE + service_role GRANT 를 다시 적는다
--   (자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — `supabase db push` 는 메인 세션.
-- 되돌리기: 20261102200100 의 tick_convert_runs_since 본문으로 CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tick_convert_runs_since(p_since text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('date', r.date, 'exchange', r.exchange, 'mode', r.mode,
                                               'ok', r.ok, 'finished_at', r.finished_at, 'error', r.error)
                            ORDER BY r.date DESC, r.exchange, r.mode, r.finished_at), '[]'::jsonb)
    FROM public.tick_convert_runs r
   WHERE r.date >= p_since;
$$;

COMMENT ON FUNCTION public.tick_convert_runs_since(text) IS
  'Phase 37 D-04 · R2-WR-03 — date ≥ p_since 실행 기록 {date, exchange, mode, ok, finished_at, error} 배열(nightly 따라잡기 · '
  '포기 판정 — error TRANSIENT 는 세지 않고 끝 기록 없는 STARTED 는 크래시로 센다). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_convert_runs_since(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_convert_runs_since(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_convert_runs_since(text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 정의를 읽게 한다.
NOTIFY pgrst, 'reload schema';
