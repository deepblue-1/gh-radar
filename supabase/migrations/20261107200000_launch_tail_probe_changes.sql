-- ============================================================
-- quick-261107-l7w — 발사 뒤탐침 설정(서버별 · 발사별 개수 · 간격) 변경 이력: launch_tail_probe_changes 표 · 기록/읽기 RPC.
--
-- 무엇:
--   ① public.launch_tail_probe_changes — 뒤탐침 저장 시도 한 행(실패 포함 · purge 없음 · 계획 이력 D-29 와 같은 규칙).
--   ② launch_tail_probe_change_record(p jsonb) — 한 행을 넣고 그 행을 jsonb 로 돌려준다
--      (키 = shared LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 13개).
--   ③ launch_tail_probe_changes_for_admin(p_limit integer) — 웹 「<서버> 뒤탐침」 줄의 「변경 이력」 읽기(jsonb 1값) —
--      (gateway, fire)별 최근 N + 마지막 ok · 6조합(서버 3 × 발사 2) × 20 = 최대 120행 + 마지막 ok.
--
-- 왜: 뒤탐침 개수 · 간격은 gh-trade 서버(log/launch_plan.toml)가 현재 값만 쥔다. 지도와 맞춰 「언제부터 바뀌었나」 를
--   읽으려면 누가 · 언제 · 무엇을 → 무엇으로 바꿨는지(실패 포함)를 gh-radar DB 가 보관해야 한다.
--   launch_plan_changes 는 market NOT NULL · offsets 배열이라 뒤탐침(시장 공통 · count/step 두 숫자)과 모양이 달라 별도 표.
--
-- 결정(261107-l7w-CONTEXT · gh-trade-70 합의):
--   단위 = (서버, profile) — fire q16(Q16) · n0930(N) · 시장 공통. 값 = count 0..10 · step_us 1..100.
--   **count/step 범위 CHECK 는 두지 않는다** — gh-trade 가 거부한(86 code 1) 범위 밖 시도도 이력에 남아야 한다.
--   gateway 는 CHECK · FK 없음(서버 키 개명 선례 20261007200000) · fire · outcome 만 CHECK.
--   쓰는 쪽 = server(요청자 이메일 · relay 도달 실패(offline) 시도도 1행) · relay 는 DB 무관.
--
-- 권한: 표는 RLS 켬 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role SELECT · INSERT 만
--   (이력은 고치지 않는다). 함수는 SECURITY INVOKER + 권한 3줄 재진술
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`.
-- 되돌리기:
--   DROP FUNCTION public.launch_tail_probe_changes_for_admin(integer);
--   DROP FUNCTION public.launch_tail_probe_change_record(jsonb);
--   DROP TABLE public.launch_tail_probe_changes;
-- ============================================================

BEGIN;

-- ── ① 이력 표 ─────────────────────────────────────────────────────
CREATE TABLE public.launch_tail_probe_changes (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  admin_email     text        NOT NULL,
  gateway         text        NOT NULL,
  fire            text        NOT NULL CHECK (fire IN ('q16', 'n0930')),
  before_count    integer     NULL,
  before_step_us  integer     NULL,
  after_count     integer     NOT NULL,
  after_step_us   integer     NOT NULL,
  outcome         text        NOT NULL CHECK (outcome IN ('ok', 'failed', 'timeout', 'offline', 'skipped')),
  code            integer     NULL,
  message         text        NULL,
  plan_rev        bigint      NULL
);

COMMENT ON TABLE public.launch_tail_probe_changes IS
  'quick-261107-l7w — 발사 뒤탐침 설정 저장 시도 이력(실패 포함 · 영구 보관 · purge 없음). 쓰는 쪽 = server · service_role 전용(SELECT · INSERT)';
COMMENT ON COLUMN public.launch_tail_probe_changes.at             IS '시도 시각(server 가 RPC 를 부른 시각)';
COMMENT ON COLUMN public.launch_tail_probe_changes.admin_email    IS '요청한 어드민 이메일(requireAdmin)';
COMMENT ON COLUMN public.launch_tail_probe_changes.gateway        IS '서버 키 — KB120 · KYOBO119 · KYOBO112 (CHECK · FK 없음 — 키 개명 선례 20261007200000)';
COMMENT ON COLUMN public.launch_tail_probe_changes.fire           IS '발사 기준 — q16(16:00 Q16) · n0930(09:00:30 N) · shared LaunchFire 그대로';
COMMENT ON COLUMN public.launch_tail_probe_changes.before_count   IS '저장 직전 서버 조회값(발 수) · 모르면 null(relay 도달 실패 · 구 서버 등)';
COMMENT ON COLUMN public.launch_tail_probe_changes.before_step_us IS '저장 직전 서버 조회값(간격 µs) · 모르면 null';
COMMENT ON COLUMN public.launch_tail_probe_changes.after_count    IS '보낸 발 수(범위 CHECK 없음 — 서버 거부 시도도 남긴다)';
COMMENT ON COLUMN public.launch_tail_probe_changes.after_step_us  IS '보낸 간격 µs(범위 CHECK 없음)';
COMMENT ON COLUMN public.launch_tail_probe_changes.outcome        IS 'AdminOutcome — ok · failed · timeout · offline · skipped';
COMMENT ON COLUMN public.launch_tail_probe_changes.code           IS '서버 결과 코드(failed) · 없으면 null';
COMMENT ON COLUMN public.launch_tail_probe_changes.message        IS '결과 문구(실패 사유) · 없으면 null';
COMMENT ON COLUMN public.launch_tail_probe_changes.plan_rev        IS '저장 뒤 계획 리비전(계획과 공유) · 모르면 null';

-- (gateway, fire) 키별 최근 행(launch_tail_probe_changes_for_admin)
CREATE INDEX launch_tail_probe_changes_key_at_idx ON public.launch_tail_probe_changes (gateway, fire, at DESC);

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기 · 쓰기는 server 어드민 RPC 뿐.
ALTER TABLE public.launch_tail_probe_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_tail_probe_changes FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_tail_probe_changes FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.launch_tail_probe_changes TO service_role;
-- identity 시퀀스 — 플랫폼 기본 권한이 anon · authenticated 에도 주므로 걷는다.
REVOKE ALL ON SEQUENCE public.launch_tail_probe_changes_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.launch_tail_probe_changes_id_seq FROM anon, authenticated;

-- ── ② 기록 RPC ────────────────────────────────────────────────────
-- 입력 = 표 열 이름 그대로의 jsonb(id · at 은 무시). 필수 키 admin_email · gateway · fire · after_count · after_step_us ·
-- outcome 가 없거나 null 이면 22023(누락 목록 문구). after_count · after_step_us 는 jsonb number 여야 하고,
-- before_count · before_step_us 는 number 또는 null(아니면 22023). fire · outcome 어휘 위반은 CHECK(23514) 그대로.
CREATE FUNCTION public.launch_tail_probe_change_record(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing text[];
  r         public.launch_tail_probe_changes;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: p 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  v_missing := array_remove(ARRAY[
    CASE WHEN COALESCE(jsonb_typeof(p -> 'admin_email'),   'null') = 'null' THEN 'admin_email'   END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'gateway'),       'null') = 'null' THEN 'gateway'       END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'fire'),          'null') = 'null' THEN 'fire'          END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'after_count'),   'null') = 'null' THEN 'after_count'   END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'after_step_us'), 'null') = 'null' THEN 'after_step_us' END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'outcome'),       'null') = 'null' THEN 'outcome'       END
  ], NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: 필수 키 누락 %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p -> 'after_count') <> 'number' OR jsonb_typeof(p -> 'after_step_us') <> 'number' THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: after_count · after_step_us 는 숫자여야 한다' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_typeof(p -> 'before_count'), 'null') NOT IN ('null', 'number')
     OR COALESCE(jsonb_typeof(p -> 'before_step_us'), 'null') NOT IN ('null', 'number') THEN
    RAISE EXCEPTION 'launch_tail_probe_change_record: before_count · before_step_us 는 숫자 또는 null 이어야 한다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_tail_probe_changes
         (admin_email, gateway, fire, before_count, before_step_us, after_count, after_step_us,
          outcome, code, message, plan_rev)
  VALUES (p ->> 'admin_email', p ->> 'gateway', p ->> 'fire',
          (p ->> 'before_count')::integer, (p ->> 'before_step_us')::integer,
          (p ->> 'after_count')::integer, (p ->> 'after_step_us')::integer,
          p ->> 'outcome', (p ->> 'code')::integer, p ->> 'message', (p ->> 'plan_rev')::bigint)
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

COMMENT ON FUNCTION public.launch_tail_probe_change_record(jsonb) IS
  'quick-261107-l7w — 발사 뒤탐침 저장 시도 1행 기록 · 넣은 행을 jsonb(LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 13키)로 반환. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_tail_probe_change_record(jsonb) TO service_role;

-- ── ③ 읽기 RPC ────────────────────────────────────────────────────
-- 반환: { tail_probe_changes: [행 …] } — (gateway, fire)마다 최근 p_limit 행 + 같은 키의 마지막 ok 1행(중복 없음) ·
-- at 내림차순(같은 at 은 id 내림차순). p_limit NULL 또는 1~200 밖 → 22023.
CREATE FUNCTION public.launch_tail_probe_changes_for_admin(p_limit integer DEFAULT 20)
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
             row_number() OVER (PARTITION BY gateway, fire ORDER BY at DESC, id DESC) AS rn
        FROM public.launch_tail_probe_changes c
    ),
    recent AS (
      SELECT id FROM ranked WHERE rn <= p_limit
    ),
    last_ok AS (
      SELECT DISTINCT ON (gateway, fire) id
        FROM public.launch_tail_probe_changes
       WHERE outcome = 'ok'
       ORDER BY gateway, fire, at DESC, id DESC
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
  'quick-261107-l7w — 「<서버> 뒤탐침」 줄 「변경 이력」 읽기({ tail_probe_changes } jsonb 1값). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_tail_probe_changes_for_admin(integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
