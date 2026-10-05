-- ============================================================
-- Phase 28 Plan 03 — 상한가 특징 밤 적재 RPC 3개 (stage 비우기 · 날짜 원자 commit · skip 기록).
--
-- 표는 20261006090100_limitup_tables.sql. 호출자는 Cloud Run Job `workers/limitup-sync`(service_role) 하나다.
--
-- 흐름(워커 1 날짜): `limitup_stage_clear(date)` → `limitup_stage` 청크 insert(PostgREST, payload = export 행 원문)
--   → `limitup_commit_day(date, manifest_sha256, files_sig, schema_version, expected)` 1회.
--
-- 왜 함수 하나가 교체 전부를 하는가: **PostgREST 는 요청 간 트랜잭션을 못 잇는다** — 「그날 DELETE」 와
--   「INSERT」 를 여러 요청으로 나누면 보고서가 그날 행 일부만 본다. 이 함수가 날짜 원자 교체의 유일한 자리다.
--   함수 하나 = 한 트랜잭션이라 중간 예외면 DELETE 까지 전부 되돌아가 기존 행이 그대로 남는다.
--
-- commit 검사(D-17):
--   ⓐ 표별 stage 행 수 == `p_expected->>tbl`(키가 없으면 0) — 운반 · 청크 삽입 누락을 commit 전에 잡는다.
--   ⓑ stage payload 의 `date` 가 p_date 와 다른 행이 있으면 예외 — 다른 날짜 행이 이 날짜로 섞이지 않게.
--   ⓒ 그날 DELETE 후 INSERT(upsert 아님) — 재처리로 행이 줄어도 옛 행이 남지 않는다.
--   8표는 동적 SQL 없이 표마다 정적 문장으로 쓴다(`format('%I')` 도 없음 — 식별자 주입 여지 0).
--   `jsonb_populate_record(NULL::public.limitup_<표>, payload)` 는 키 이름 = 열 이름으로 채운다
--   (예약어 열 `"foreign"` · `"values"` 도 키 그대로 맞는다 · 모르는 키는 무시 · 없는 키는 NULL).
--
-- skip 기록(D-20 DB 절반): `limitup_record_skip` 이 날짜별 `skip_streak` 를 1 올려 돌려주고 성공 commit 이 0 으로
--   되돌린다. files_sig 는 건드리지 않는다(skip 만 있던 날짜 = 「적재 안 됨」). 판정 · 알림은 워커(28-16).
--
-- 권한: 세 함수 모두 SECURITY INVOKER(service_role 의 표 권한으로 돈다) + PUBLIC · anon · authenticated 명시 REVOKE
--   + service_role GRANT(자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 28-14 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.limitup_record_skip(text, text);
--   DROP FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb); DROP FUNCTION public.limitup_stage_clear(text);
-- ============================================================

BEGIN;

-- ── stage 비우기 — 지운 행 수 반환 ────────────────────────────────
CREATE FUNCTION public.limitup_stage_clear(p_date text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.limitup_stage WHERE date = p_date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── 날짜 원자 commit ────────────────────────────────────────────
CREATE FUNCTION public.limitup_commit_day(
  p_date            text,
  p_manifest_sha256 text,
  p_files_sig       text,
  p_schema_version  integer,
  p_expected        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tbls constant text[] := ARRAY['entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches',
                                  'grid_summary', 'member_daily'];
  v_t    text;
  v_n    integer;
  v_e    integer;
  v_bad  integer;
  v_rows jsonb := '{}'::jsonb;
BEGIN
  IF p_date IS NULL OR p_date !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'limitup_commit_day: bad date %', p_date;
  END IF;
  IF p_files_sig IS NULL OR p_files_sig = '' THEN
    RAISE EXCEPTION 'limitup_commit_day: % files_sig required', p_date;
  END IF;
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'object' THEN
    RAISE EXCEPTION 'limitup_commit_day: % expected must be an object', p_date;
  END IF;

  -- ⓐ ⓑ 표별 stage 행 수 · payload 날짜 대조 — 하나라도 틀리면 아무것도 바꾸지 않고 예외
  FOREACH v_t IN ARRAY v_tbls LOOP
    SELECT count(*), count(*) FILTER (WHERE s.payload->>'date' IS DISTINCT FROM p_date)
      INTO v_n, v_bad
      FROM public.limitup_stage s
     WHERE s.date = p_date AND s.tbl = v_t;
    v_e := coalesce((p_expected->>v_t)::integer, 0);
    IF v_n <> v_e THEN
      RAISE EXCEPTION 'limitup_commit_day: % % stage % expected %', p_date, v_t, v_n, v_e;
    END IF;
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'limitup_commit_day: % % payload date mismatch rows %', p_date, v_t, v_bad;
    END IF;
  END LOOP;

  -- ⓒ 표마다 그날 DELETE → INSERT (정적 문장 8쌍)
  DELETE FROM public.limitup_entries WHERE date = p_date;
  INSERT INTO public.limitup_entries
    SELECT (jsonb_populate_record(NULL::public.limitup_entries, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'entries' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('entries', v_n);

  DELETE FROM public.limitup_locks WHERE date = p_date;
  INSERT INTO public.limitup_locks
    SELECT (jsonb_populate_record(NULL::public.limitup_locks, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'locks' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('locks', v_n);

  DELETE FROM public.limitup_jumps WHERE date = p_date;
  INSERT INTO public.limitup_jumps
    SELECT (jsonb_populate_record(NULL::public.limitup_jumps, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'jumps' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('jumps', v_n);

  DELETE FROM public.limitup_member_alloc WHERE date = p_date;
  INSERT INTO public.limitup_member_alloc
    SELECT (jsonb_populate_record(NULL::public.limitup_member_alloc, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'member_alloc' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('member_alloc', v_n);

  DELETE FROM public.limitup_facts WHERE date = p_date;
  INSERT INTO public.limitup_facts
    SELECT (jsonb_populate_record(NULL::public.limitup_facts, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'facts' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('facts', v_n);

  DELETE FROM public.limitup_touches WHERE date = p_date;
  INSERT INTO public.limitup_touches
    SELECT (jsonb_populate_record(NULL::public.limitup_touches, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'touches' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('touches', v_n);

  DELETE FROM public.limitup_grid_summary WHERE date = p_date;
  INSERT INTO public.limitup_grid_summary
    SELECT (jsonb_populate_record(NULL::public.limitup_grid_summary, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'grid_summary' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('grid_summary', v_n);

  DELETE FROM public.limitup_member_daily WHERE date = p_date;
  INSERT INTO public.limitup_member_daily
    SELECT (jsonb_populate_record(NULL::public.limitup_member_daily, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'member_daily' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('member_daily', v_n);

  -- 적재 이력 — 성공 commit 은 연속 skip 을 0 으로 되돌린다
  INSERT INTO public.limitup_loads AS l
         (date, files_sig, manifest_sha256, schema_version, "rows", loaded_at, skip_streak, last_skip_reason)
  VALUES (p_date, p_files_sig, p_manifest_sha256, p_schema_version, v_rows, now(), 0, NULL)
  ON CONFLICT (date) DO UPDATE
     SET files_sig        = EXCLUDED.files_sig,
         manifest_sha256  = EXCLUDED.manifest_sha256,
         schema_version   = EXCLUDED.schema_version,
         "rows"           = EXCLUDED."rows",
         loaded_at        = EXCLUDED.loaded_at,
         skip_streak      = 0,
         last_skip_reason = NULL;

  DELETE FROM public.limitup_stage WHERE date = p_date;

  RETURN jsonb_build_object('date', p_date, 'rows', v_rows);
END;
$$;

-- ── skip 기록 — 새 연속 skip 수 반환 ─────────────────────────────
CREATE FUNCTION public.limitup_record_skip(p_date text, p_reason text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_streak integer;
BEGIN
  INSERT INTO public.limitup_loads AS l (date, skip_streak, last_skip_reason, last_skip_at)
  VALUES (p_date, 1, p_reason, now())
  ON CONFLICT (date) DO UPDATE
     SET skip_streak      = l.skip_streak + 1,
         last_skip_reason = EXCLUDED.last_skip_reason,
         last_skip_at     = EXCLUDED.last_skip_at
  RETURNING skip_streak INTO v_streak;
  RETURN v_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.limitup_stage_clear(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_stage_clear(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_stage_clear(text) TO service_role;

REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.limitup_record_skip(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_record_skip(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_record_skip(text, text) TO service_role;

COMMIT;
