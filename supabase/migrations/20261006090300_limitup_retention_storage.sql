-- ============================================================
-- Phase 28 Plan 06 — 상한가 특징 보존 정리 RPC + 격자 Storage 버킷.
--
-- (가) limitup_purge_old(p_keep_days integer, p_alloc_keep_days integer) → jsonb(표별 지운 행 수).
--   D-16 · D-19 보존: 표 5개(entries · locks · jumps · facts · touches) · 파생 2(grid_summary · member_daily) ·
--   적재 이력(loads) · stage 는 `date < KST 오늘 − p_keep_days`, `limitup_member_alloc` 만 `− p_alloc_keep_days`.
--   (창구 지문은 파생 member_daily 가 90일을 들고 있어 원표 배분은 30일이면 된다.)
--   호출자: 워커 `workers/limitup-sync` run 끝 1회(`limitup_purge_old(90, 30)`). 워커는 `date >= KST 오늘 − keep`
--   날짜만 적재하므로 경계가 같다 — 지운 날짜를 다음 run 이 다시 적재하지 않는다.
--   GCS 사본은 지우지 않는다(재적재 가능 — 보존 창을 늘리면 다시 채울 수 있다). Storage 격자 폴더는 워커가
--   storage API 로 지운다(storage.objects 를 SQL 로 지우면 실제 객체가 남는다 — Supabase 문서).
--
-- (나) Storage 버킷 `limitup-grid` — 비공개 · 10MB · application/gzip. 객체 `grid/<YYYYMMDD>/<isin>.json.gz`
--   (워커가 service role 로 upsert 업로드 · server 가 서명 URL 로만 내준다 — D-10 · D-14).
--   **정책을 만들지 않는다** — 정책 0개 = anon · authenticated 는 읽기 · 쓰기 불가, service role 만 RLS 를 우회한다.
--   가드 이유: 로컬 재생 이미지(scripts/verify-dma-orders-price-check.sh 의 일회용 Postgres)에는 `storage` 스키마가
--   없다. 원격 Supabase 에는 있으므로 `to_regclass('storage.buckets')` 가 참일 때만 삽입한다(28-14 push 가 만든다).
--
-- 권한: limitup_purge_old 는 service_role 전용 — PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — 플랫폼 auto-grant 가 PUBLIC REVOKE 를 덮는다). SECURITY INVOKER.
-- 원격 적용: 커밋만 — 원격은 28-14 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.limitup_purge_old(integer, integer);
--   버킷은 Storage 대시보드에서 비운 뒤 삭제(객체가 있으면 DELETE FROM storage.buckets 가 막힌다).
-- ============================================================

BEGIN;

CREATE FUNCTION public.limitup_purge_old(p_keep_days integer, p_alloc_keep_days integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_cutoff text;
  v_alloc  text;
  v_n      integer;
  v_out    jsonb := '{}'::jsonb;
BEGIN
  -- 0 · 음수 · NULL 은 오늘 이전 전부를 지운다 — 설정 실수로 보존 창이 사라지지 않게 거부.
  IF p_keep_days IS NULL OR p_keep_days < 1 OR p_alloc_keep_days IS NULL OR p_alloc_keep_days < 1 THEN
    RAISE EXCEPTION 'limitup_purge_old: keep days must be >= 1 (got %, %)', p_keep_days, p_alloc_keep_days;
  END IF;
  v_cutoff := to_char(v_today - p_keep_days, 'YYYYMMDD');
  v_alloc  := to_char(v_today - p_alloc_keep_days, 'YYYYMMDD');

  DELETE FROM public.limitup_entries WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('entries', v_n);
  DELETE FROM public.limitup_locks WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('locks', v_n);
  DELETE FROM public.limitup_jumps WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('jumps', v_n);
  DELETE FROM public.limitup_member_alloc WHERE date < v_alloc;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('member_alloc', v_n);
  DELETE FROM public.limitup_facts WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('facts', v_n);
  DELETE FROM public.limitup_touches WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('touches', v_n);
  DELETE FROM public.limitup_grid_summary WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('grid_summary', v_n);
  DELETE FROM public.limitup_member_daily WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('member_daily', v_n);
  DELETE FROM public.limitup_stage WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('stage', v_n);
  DELETE FROM public.limitup_loads WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('loads', v_n);

  RETURN jsonb_build_object('cutoff', v_cutoff, 'alloc_cutoff', v_alloc, 'deleted', v_out);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limitup_purge_old(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limitup_purge_old(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_purge_old(integer, integer) TO service_role;

COMMENT ON FUNCTION public.limitup_purge_old(integer, integer) IS
  'limitup 보존 정리(D-16 · D-19) — 표 5 · 파생 2 · loads · stage 는 KST 오늘 − p_keep_days 이전, member_alloc 은 − p_alloc_keep_days 이전 삭제(service_role 전용)';

-- 격자 버킷 — 로컬 재생 이미지에는 storage 스키마가 없어 가드 안에서만(원격에는 있다).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('limitup-grid', 'limitup-grid', false, 10485760, ARRAY['application/gzip'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;
