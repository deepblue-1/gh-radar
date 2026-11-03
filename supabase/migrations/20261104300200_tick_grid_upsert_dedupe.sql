-- ============================================================
-- Phase 37 code review IN-06 — tick_grid_upsert 가 한 배치 안의 같은 (date, exchange, isin) 를 한 행으로 줄인다.
--
-- 문제(20261103230000 정의):
--   `INSERT … SELECT FROM jsonb_to_recordset … ON CONFLICT DO UPDATE` 는 입력에 같은 충돌 키가 두 번 있으면
--   「ON CONFLICT DO UPDATE command cannot affect row a second time」 으로 문장 전체를 롤백한다 — 키 하나 중복으로 그 배치의
--   격자 메타를 모두 잃는다. 지금 Job 은 키마다 한 행을 만들어 터지지 않지만 함수 쪽 방어가 없었다.
--
-- 무엇: 입력 배열을 원소 순서(WITH ORDINALITY)와 함께 펼치고 키마다 **마지막 원소**만 남긴다(DISTINCT ON … ORDER BY ord DESC).
--   같은 키가 두 번이면 뒤에 온 것이 그 배치의 최신 업로드다(객체 경로는 모드마다 같다). 반환 = 쓴 행 수(중복은 1로).
--   나머지(모드 규칙 · 팀 3칸 · 열 · 기본값)는 20261103230000 정의 그대로.
--
-- 권한: 시그니처가 같아 기존 GRANT 가 남지만 20261103230000 과 같게 PUBLIC · anon · authenticated REVOKE + service_role GRANT 를
--   다시 적는다(자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — `supabase db push` 는 메인 세션.
-- 되돌리기: 20261103230000 의 tick_grid_upsert 정의를 CREATE OR REPLACE 로 다시 적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tick_grid_upsert(p_mode text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('nightly', 'request', 'promoted') THEN
    RAISE EXCEPTION 'tick_grid_upsert: mode 는 nightly | request | promoted (받은 값 %)', p_mode;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'tick_grid_upsert: p_rows 는 jsonb 배열이어야 한다';
  END IF;

  INSERT INTO public.tick_grids AS g
         (date, exchange, isin, mode, sources, object_path, bytes, records, a3_count,
          first_recv_ms, last_recv_ms, base_px, high_rate, last_rate, fmt,
          team_fills, team_day_net_krw, team_day_pnl_krw, created_at, updated_at)
  SELECT DISTINCT ON (r.date, r.exchange, r.isin)
         r.date, r.exchange, r.isin, p_mode, coalesce(r.sources, '{}'::text[]), r.object_path, r.bytes, r.records, r.a3_count,
         r.first_recv_ms, r.last_recv_ms, r.base_px, r.high_rate, r.last_rate,
         coalesce(r.fmt, 'pcapns-rec+zstd/1'),
         r.team_fills, r.team_day_net_krw, r.team_day_pnl_krw, now(), now()
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(elem, ord)
   CROSS JOIN LATERAL jsonb_to_record(e.elem) AS r(
           date text, exchange text, isin text, sources text[], object_path text, bytes bigint, records integer,
           a3_count integer, first_recv_ms bigint, last_recv_ms bigint, base_px integer,
           high_rate double precision, last_rate double precision, fmt text,
           team_fills integer, team_day_net_krw bigint, team_day_pnl_krw bigint)
   -- 한 배치 안 같은 키는 마지막 원소 하나만(IN-06 — ON CONFLICT 가 같은 행을 두 번 건드리면 문장 전체가 롤백된다)
   ORDER BY r.date, r.exchange, r.isin, e.ord DESC
  ON CONFLICT (date, exchange, isin) DO UPDATE
     SET mode             = EXCLUDED.mode,
         sources          = EXCLUDED.sources,
         object_path      = EXCLUDED.object_path,
         bytes            = EXCLUDED.bytes,
         records          = EXCLUDED.records,
         a3_count         = EXCLUDED.a3_count,
         first_recv_ms    = EXCLUDED.first_recv_ms,
         last_recv_ms     = EXCLUDED.last_recv_ms,
         base_px          = EXCLUDED.base_px,
         high_rate        = EXCLUDED.high_rate,
         last_rate        = EXCLUDED.last_rate,
         fmt              = EXCLUDED.fmt,
         team_fills       = EXCLUDED.team_fills,
         team_day_net_krw = EXCLUDED.team_day_net_krw,
         team_day_pnl_krw = EXCLUDED.team_day_pnl_krw,
         updated_at       = now()
   -- 모드 규칙(D-04): nightly 무조건 · request 는 nightly 위에 못 쓴다 · promoted 는 promoted 위에만
   WHERE p_mode = 'nightly'
      OR (p_mode = 'request'  AND g.mode <> 'nightly')
      OR (p_mode = 'promoted' AND g.mode = 'promoted');

  GET DIAGNOSTICS v_n = ROW_COUNT;  -- 쓰이지 않은(WHERE 거짓) 충돌 행은 세지 않는다 · 배치 안 중복 키는 1행
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_grid_upsert(text, jsonb) IS
  'Phase 37 D-04 · quick 261103-j4d · IN-06 — 격자 메타 upsert(+ 팀 3칸 · nightly 무조건 · request 는 nightly 를 못 덮음 · '
  'promoted 는 promoted 위에만 · 배치 안 같은 키는 마지막 원소 하나). 쓴 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 정의를 읽게 한다.
NOTIFY pgrst, 'reload schema';
