-- ============================================================
-- quick-261125-lju — 발사 탐침 이력(launch_tail_probe_changes)에 시장 · 정각 기준 µs 목록 칸을 더하고 두 RPC 를 목록 모드로 바꾼다.
--
-- 무엇:
--   ① public.launch_tail_probe_changes 에 market(K|Q) · before_offsets_us · after_offsets_us(integer[]) 추가 ·
--      after_count · after_step_us NOT NULL 해제 · 모드 CHECK(목록 모드 또는 옛 개수 · 간격 모드 — 둘 중 하나).
--   ② launch_tail_probe_change_record(p jsonb) 교체 — after_offsets_us 키가 있으면 목록 모드(market 필수), 아니면 옛 모드
--      (기존 검사 그대로). 반환 jsonb 키 = shared LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 16개.
--   ③ launch_tail_probe_changes_for_admin(p_limit integer) 교체 — 묶음 키를 (gateway, fire, market) 로
--      (옛 행은 market NULL 끼리 한 묶음). 나머지 모양은 그대로.
--
-- 왜: gh-trade 탐침 최종 계약(reference/gh-trade-replies.md · 2026-11-25) — 탐침 값이 (서버, 프로파일)별 개수 · 간격에서
--   (서버, 프로파일, 시장)별 **정각 기준 부호 있는 µs 목록**(0 ~ 10발 · 빈 목록 = 꺼짐)으로 바뀐다. 웹 저장은 시장별 목록 1건
--   (교보 N 공통은 K 로 1건). 옛 개수 · 간격 행은 지우지 않고 같은 표에 남긴다(「언제부터 바뀌었나」 를 잃지 않게).
--
-- 결정(quick-261125-lju PLAN):
--   - 범위 · 개수 · 순서 CHECK 는 여전히 두지 않는다 — gh-trade 가 거부한(86 code 1) 시도도 이력에 남아야 한다.
--   - market CHECK 는 K | Q 만(NULL = 옛 행). 새 표 · 새 RPC 는 만들지 않는다(같은 이름을 CREATE OR REPLACE).
--   - 기존 행 · 칸은 그대로(전부 옛 모드 — after_count · after_step_us 가 있어 모드 CHECK 를 통과한다).
--
-- 권한: 표 권한은 바뀌지 않는다(RLS · service_role SELECT · INSERT 만). 두 함수는 교체 뒤 권한 3줄 재진술
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`(gh-trade 생성물 도착 뒤 배포 순서 DB → relay → server → webapp).
-- 되돌리기(목록 모드 행이 있으면 먼저 지워야 NOT NULL 복원이 된다):
--   20261107200000 의 두 함수 본문을 CREATE OR REPLACE 로 다시 싣고 권한 3줄 재진술 ·
--   ALTER TABLE public.launch_tail_probe_changes DROP CONSTRAINT launch_tail_probe_changes_mode_chk,
--     DROP COLUMN after_offsets_us, DROP COLUMN before_offsets_us, DROP COLUMN market,
--     ALTER COLUMN after_count SET NOT NULL, ALTER COLUMN after_step_us SET NOT NULL;
-- ============================================================

BEGIN;

-- ── ① 표 칸 ───────────────────────────────────────────────────────
ALTER TABLE public.launch_tail_probe_changes
  ADD COLUMN market            text      NULL CHECK (market IN ('K', 'Q')),
  ADD COLUMN before_offsets_us integer[] NULL,
  ADD COLUMN after_offsets_us  integer[] NULL,
  ALTER COLUMN after_count   DROP NOT NULL,
  ALTER COLUMN after_step_us DROP NOT NULL;

ALTER TABLE public.launch_tail_probe_changes
  ADD CONSTRAINT launch_tail_probe_changes_mode_chk CHECK (
    (after_offsets_us IS NOT NULL AND market IS NOT NULL)
    OR (after_offsets_us IS NULL AND after_count IS NOT NULL AND after_step_us IS NOT NULL)
  );

COMMENT ON COLUMN public.launch_tail_probe_changes.market            IS 'quick-261125-lju — 목록 행의 시장 K | Q(교보 N 공통은 K) · 옛 개수 · 간격 행 NULL';
COMMENT ON COLUMN public.launch_tail_probe_changes.before_offsets_us IS 'quick-261125-lju — 목록 행: 저장 직전 그 (profile, market) 정각 기준 µs 목록 · 모르면 NULL';
COMMENT ON COLUMN public.launch_tail_probe_changes.after_offsets_us  IS 'quick-261125-lju — 목록 행: 보낸 정각 기준 µs 목록(빈 배열 = 꺼짐 · 범위 · 개수 · 순서 CHECK 없음) · 옛 행 NULL';
COMMENT ON COLUMN public.launch_tail_probe_changes.after_count       IS '옛 행: 보낸 발 수(범위 CHECK 없음) · 목록 행 NULL';
COMMENT ON COLUMN public.launch_tail_probe_changes.after_step_us     IS '옛 행: 보낸 간격 µs(범위 CHECK 없음) · 목록 행 NULL';

-- ── ② 기록 RPC ────────────────────────────────────────────────────
-- 입력 = 표 열 이름 그대로의 jsonb(id · at 은 무시). 공통 필수 admin_email · gateway · fire · outcome.
-- 목록 모드(after_offsets_us 가 null 아님): after_offsets_us 는 원소가 전부 number 인 jsonb 배열(빈 배열 = 꺼짐) · market 필수 ·
--   before_offsets_us 는 null 또는 number 배열. 아니면 22023.
-- 옛 모드: after_count · after_step_us number 필수 · before_count · before_step_us 는 number 또는 null(기존 검사 그대로).
-- 두 모드 다 아니면 22023(누락 목록 문구). fire · outcome · market 어휘 위반은 CHECK(23514) 그대로.
CREATE OR REPLACE FUNCTION public.launch_tail_probe_change_record(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing text[];
  v_list    boolean;
  v_before  integer[];
  v_after   integer[];
  r         public.launch_tail_probe_changes;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: p 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  v_list := COALESCE(jsonb_typeof(p -> 'after_offsets_us'), 'null') <> 'null';

  v_missing := array_remove(ARRAY[
    CASE WHEN COALESCE(jsonb_typeof(p -> 'admin_email'), 'null') = 'null' THEN 'admin_email' END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'gateway'),     'null') = 'null' THEN 'gateway'     END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'fire'),        'null') = 'null' THEN 'fire'        END,
    CASE WHEN v_list AND COALESCE(jsonb_typeof(p -> 'market'), 'null') = 'null' THEN 'market' END,
    CASE WHEN NOT v_list AND COALESCE(jsonb_typeof(p -> 'after_count'),   'null') = 'null' THEN 'after_count'   END,
    CASE WHEN NOT v_list AND COALESCE(jsonb_typeof(p -> 'after_step_us'), 'null') = 'null' THEN 'after_step_us' END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'outcome'),     'null') = 'null' THEN 'outcome'     END
  ], NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: 필수 키 누락 %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  IF v_list THEN
    IF jsonb_typeof(p -> 'after_offsets_us') <> 'array'
       OR NOT COALESCE((SELECT bool_and(jsonb_typeof(e) = 'number')
                          FROM jsonb_array_elements(p -> 'after_offsets_us') AS t(e)), true) THEN
      RAISE EXCEPTION 'launch_tail_probe_change_record: after_offsets_us 는 숫자 배열이어야 한다' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(jsonb_typeof(p -> 'before_offsets_us'), 'null') NOT IN ('null', 'array')
       OR (jsonb_typeof(p -> 'before_offsets_us') = 'array'
           AND NOT COALESCE((SELECT bool_and(jsonb_typeof(e) = 'number')
                               FROM jsonb_array_elements(p -> 'before_offsets_us') AS t(e)), true)) THEN
      RAISE EXCEPTION 'launch_tail_probe_change_record: before_offsets_us 는 숫자 배열 또는 null 이어야 한다' USING ERRCODE = '22023';
    END IF;
    v_after := ARRAY(SELECT e::integer FROM jsonb_array_elements_text(p -> 'after_offsets_us') WITH ORDINALITY AS t(e, o) ORDER BY o);
    IF jsonb_typeof(p -> 'before_offsets_us') = 'array' THEN
      v_before := ARRAY(SELECT e::integer FROM jsonb_array_elements_text(p -> 'before_offsets_us') WITH ORDINALITY AS t(e, o) ORDER BY o);
    END IF;
  ELSE
    IF jsonb_typeof(p -> 'after_count') <> 'number' OR jsonb_typeof(p -> 'after_step_us') <> 'number' THEN
      RAISE EXCEPTION 'launch_tail_probe_change_record: after_count · after_step_us 는 숫자여야 한다' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE(jsonb_typeof(p -> 'before_count'), 'null') NOT IN ('null', 'number')
     OR COALESCE(jsonb_typeof(p -> 'before_step_us'), 'null') NOT IN ('null', 'number') THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: before_count · before_step_us 는 숫자 또는 null 이어야 한다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_tail_probe_changes
         (admin_email, gateway, fire, market, before_count, before_step_us, after_count, after_step_us,
          before_offsets_us, after_offsets_us, outcome, code, message, plan_rev)
  VALUES (p ->> 'admin_email', p ->> 'gateway', p ->> 'fire',
          CASE WHEN v_list THEN p ->> 'market' END,
          (p ->> 'before_count')::integer, (p ->> 'before_step_us')::integer,
          CASE WHEN v_list THEN NULL ELSE (p ->> 'after_count')::integer END,
          CASE WHEN v_list THEN NULL ELSE (p ->> 'after_step_us')::integer END,
          v_before, v_after,
          p ->> 'outcome', (p ->> 'code')::integer, p ->> 'message', (p ->> 'plan_rev')::bigint)
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

COMMENT ON FUNCTION public.launch_tail_probe_change_record(jsonb) IS
  'quick-261107-l7w · quick-261125-lju — 발사 탐침 저장 시도 1행 기록(목록 모드 · 옛 개수 · 간격 모드) · 넣은 행을 jsonb(LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 16키)로 반환. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) TO service_role;

-- ── ③ 읽기 RPC ────────────────────────────────────────────────────
-- 반환: { tail_probe_changes: [행 …] } — (gateway, fire, market)마다 최근 p_limit 행 + 같은 키의 마지막 ok 1행(중복 없음) ·
-- 옛 행(market NULL)은 NULL 끼리 한 묶음 · at 내림차순(같은 at 은 id 내림차순). p_limit NULL 또는 1~200 밖 → 22023.
CREATE OR REPLACE FUNCTION public.launch_tail_probe_changes_for_admin(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'launch_tail_probe_changes_for_admin: p_limit 는 1~200 (got %)', p_limit USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH ranked AS (
      SELECT c.id,
             row_number() OVER (PARTITION BY gateway, fire, market ORDER BY at DESC, id DESC) AS rn
        FROM public.launch_tail_probe_changes c
    ),
    recent AS (
      SELECT id FROM ranked WHERE rn <= p_limit
    ),
    last_ok AS (
      SELECT DISTINCT ON (gateway, fire, market) id
        FROM public.launch_tail_probe_changes
       WHERE outcome = 'ok'
       ORDER BY gateway, fire, market, at DESC, id DESC
    ),
    picked AS (
      SELECT id FROM recent
      UNION
      SELECT id FROM last_ok
    )
    SELECT jsonb_build_object(
             'tail_probe_changes',
             COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.at DESC, c.id DESC), '[]'::jsonb)
           )
      FROM public.launch_tail_probe_changes c
      JOIN picked USING (id)
  );
END;
$$;

COMMENT ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) IS
  'quick-261107-l7w · quick-261125-lju — 패널 「탐침 변경 이력」 읽기({ tail_probe_changes } jsonb 1값 · (gateway, fire, market)별). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
