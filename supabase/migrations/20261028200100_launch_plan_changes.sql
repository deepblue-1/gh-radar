-- ============================================================
-- Phase 35 Plan 12 — 발사 계획 어드민(범위 7) 변경 이력: launch_plan_changes 표 · 기록/읽기 RPC.
--
-- 무엇:
--   ① public.launch_plan_changes — 발사 계획 저장 시도 한 행(D-29 · 실패 포함 · purge 없음 D-05 결).
--   ② launch_plan_change_record(p jsonb) — 한 행을 넣고 그 행을 jsonb 로 돌려준다(키 = shared LAUNCH_PLAN_CHANGE_COLUMNS 12개).
--   ③ launch_plan_changes_for_admin(p_limit integer) — 패널 「마지막 변경」 · 「변경 이력」 읽기(jsonb 1값 · 왕복 1회) —
--      조합별 최근 N + 마지막 ok · 8조합 × 20 = 최대 160행 + 마지막 ok.
--
-- 왜: gh-trade 서버는 계획의 현재 값만 쥔다. 「경계가 언제부터 바뀌었나」 를 지도와 맞춰 읽으려면 누가 · 언제 ·
--   무엇을 → 무엇으로 바꿨는지(실패한 시도 포함)를 gh-radar DB 가 영구 보관해야 한다(D-29 · gh-trade 질문 2 답).
--
-- 결정(35-CONTEXT):
--   D-29 저장 시도마다 1행 — at · admin_email · gateway · fire(q16 | n0930) · market(K | Q) · before_us(모르면 null) ·
--        after_us · outcome(ok | failed | timeout | offline | skipped) · code · message · plan_rev.
--   D-30 쓰는 쪽 = server(요청자 이메일을 쥔다 · relay 도달 실패(offline) 시도도 1행을 남긴다) · relay 는 DB 무관.
--   gateway 는 CHECK · FK 없음(서버 키 개명 선례 20261007200000) · fire · market · outcome 만 CHECK
--   (원천이 우리 server zod 라 막을 값이 정해져 있다 — 투영 표 Pitfall 6 과 다르다).
--
-- 권한: 표는 RLS 켬 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role SELECT · INSERT 만
--   (이력은 고치지 않는다 — UPDATE · DELETE 없음). 플랫폼 기본 권한이 service_role 에 UPDATE/DELETE 까지 주므로
--   service_role 도 먼저 걷고 다시 준다. 함수는 SECURITY INVOKER + 권한 3줄 재진술
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 35-18(또는 먼저 도는 35-11) 메인 세션 `supabase db push`(D-35 · 35-10 매핑 20261028200000 뒤).
-- 되돌리기: DROP FUNCTION public.launch_plan_changes_for_admin(integer); DROP FUNCTION public.launch_plan_change_record(jsonb);
--   DROP TABLE public.launch_plan_changes;
-- ============================================================

BEGIN;

-- ── ① 이력 표 ─────────────────────────────────────────────────────
CREATE TABLE public.launch_plan_changes (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  admin_email  text        NOT NULL,
  gateway      text        NOT NULL,
  fire         text        NOT NULL CHECK (fire IN ('q16', 'n0930')),
  market       text        NOT NULL CHECK (market IN ('K', 'Q')),
  before_us    integer[]   NULL,
  after_us     integer[]   NOT NULL,
  outcome      text        NOT NULL CHECK (outcome IN ('ok', 'failed', 'timeout', 'offline', 'skipped')),
  code         integer     NULL,
  message      text        NULL,
  plan_rev     bigint      NULL
);

COMMENT ON TABLE public.launch_plan_changes IS
  'Phase 35 D-29 — 발사 계획 저장 시도 이력(실패 포함 · 영구 보관 · purge 없음). 쓰는 쪽 = server · service_role 전용(SELECT · INSERT)';
COMMENT ON COLUMN public.launch_plan_changes.at          IS '시도 시각(server 가 RPC 를 부른 시각)';
COMMENT ON COLUMN public.launch_plan_changes.admin_email IS '요청한 어드민 이메일(requireAdmin)';
COMMENT ON COLUMN public.launch_plan_changes.gateway     IS '서버 키 — KB120 · KYOBO119 (CHECK · FK 없음 — 키 개명 선례 20261007200000)';
COMMENT ON COLUMN public.launch_plan_changes.fire        IS '발사 기준 — q16(16:00 Q16) · n0930(09:00:30 N) · shared LaunchFire 그대로';
COMMENT ON COLUMN public.launch_plan_changes.market      IS '시장 — K 코스피 · Q 코스닥';
COMMENT ON COLUMN public.launch_plan_changes.before_us   IS '저장 직전 서버 조회값(µs) · 모르면 null(relay 도달 실패 등)';
COMMENT ON COLUMN public.launch_plan_changes.after_us    IS '보낸 값(µs)';
COMMENT ON COLUMN public.launch_plan_changes.outcome     IS 'AdminOutcome — ok · failed · timeout · offline · skipped';
COMMENT ON COLUMN public.launch_plan_changes.code        IS '서버 결과 코드(failed) · 없으면 null';
COMMENT ON COLUMN public.launch_plan_changes.message     IS '결과 문구(실패 사유) · 없으면 null';
COMMENT ON COLUMN public.launch_plan_changes.plan_rev    IS '저장 뒤 계획 리비전 · 모르면 null';

-- 패널 키별 최근 행(launch_plan_changes_for_admin)
CREATE INDEX launch_plan_changes_key_at_idx ON public.launch_plan_changes (gateway, fire, market, at DESC);

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기 · 쓰기는 server 어드민 RPC 뿐(D-20 · D-29).
ALTER TABLE public.launch_plan_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_plan_changes FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_plan_changes FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.launch_plan_changes TO service_role;
-- identity 시퀀스 — 플랫폼 기본 권한이 anon · authenticated 에도 주므로 걷는다(identity 의 nextval 은 표 INSERT 권한으로 돈다).
REVOKE ALL ON SEQUENCE public.launch_plan_changes_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.launch_plan_changes_id_seq FROM anon, authenticated;

-- ── ② 기록 RPC ────────────────────────────────────────────────────
-- 입력 = 표 열 이름 그대로의 jsonb(id · at 은 무시 — DB 가 정한다). 필수 키 admin_email · gateway · fire · market ·
-- after_us · outcome 가 없거나 null 이면, 또는 after_us 가 배열이 아니면(before_us 는 배열 또는 null) 22023.
-- fire · market · outcome 어휘 위반은 CHECK(23514)로 그대로 올라간다 — 숨기지 않는다.
CREATE FUNCTION public.launch_plan_change_record(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing text[];
  v_before  integer[];
  v_after   integer[];
  r         public.launch_plan_changes;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'launch_plan_change_record: p 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  v_missing := array_remove(ARRAY[
    CASE WHEN COALESCE(jsonb_typeof(p -> 'admin_email'), 'null') = 'null' THEN 'admin_email' END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'gateway'),     'null') = 'null' THEN 'gateway'     END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'fire'),        'null') = 'null' THEN 'fire'        END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'market'),      'null') = 'null' THEN 'market'      END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'after_us'),    'null') = 'null' THEN 'after_us'    END,
    CASE WHEN COALESCE(jsonb_typeof(p -> 'outcome'),     'null') = 'null' THEN 'outcome'     END
  ], NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'launch_plan_change_record: 필수 키 누락 %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p -> 'after_us') <> 'array' THEN
    RAISE EXCEPTION 'launch_plan_change_record: after_us 는 배열이어야 한다' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_typeof(p -> 'before_us'), 'null') NOT IN ('null', 'array') THEN
    RAISE EXCEPTION 'launch_plan_change_record: before_us 는 배열 또는 null 이어야 한다' USING ERRCODE = '22023';
  END IF;

  v_after := ARRAY(
    SELECT e::integer FROM jsonb_array_elements_text(p -> 'after_us') WITH ORDINALITY AS t(e, o) ORDER BY o
  );
  IF jsonb_typeof(p -> 'before_us') = 'array' THEN
    v_before := ARRAY(
      SELECT e::integer FROM jsonb_array_elements_text(p -> 'before_us') WITH ORDINALITY AS t(e, o) ORDER BY o
    );
  END IF;

  INSERT INTO public.launch_plan_changes
         (admin_email, gateway, fire, market, before_us, after_us, outcome, code, message, plan_rev)
  VALUES (p ->> 'admin_email', p ->> 'gateway', p ->> 'fire', p ->> 'market', v_before, v_after, p ->> 'outcome',
          (p ->> 'code')::integer, p ->> 'message', (p ->> 'plan_rev')::bigint)
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

COMMENT ON FUNCTION public.launch_plan_change_record(jsonb) IS
  'Phase 35 D-29 — 발사 계획 저장 시도 1행 기록 · 넣은 행을 jsonb(LAUNCH_PLAN_CHANGE_COLUMNS 12키)로 반환. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_plan_change_record(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_plan_change_record(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_plan_change_record(jsonb) TO service_role;

-- ── ③ 읽기 RPC ────────────────────────────────────────────────────
-- 반환: { changes: [행 …] } — (gateway, fire, market) 마다 최근 p_limit 행 + 같은 키의 마지막 ok 1행
-- (최근 p_limit 이 전부 실패여도 패널 「마지막 변경」 이 보인다 · 이미 최근에 있으면 중복 없음) · at 내림차순(같은 at 은 id 내림차순).
-- 8조합(서버 2 × 발사 2 × 시장 2) × 20 = 최대 160행 + 키마다 마지막 ok 1행. p_limit NULL 또는 1~200 밖 → 22023.
CREATE FUNCTION public.launch_plan_changes_for_admin(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'launch_plan_changes_for_admin: p_limit 는 1~200 (got %)', p_limit USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH ranked AS (
      SELECT c.id,
             row_number() OVER (PARTITION BY gateway, fire, market ORDER BY at DESC, id DESC) AS rn
        FROM public.launch_plan_changes c
    ),
    recent AS (
      SELECT id FROM ranked WHERE rn <= p_limit
    ),
    last_ok AS (
      SELECT DISTINCT ON (gateway, fire, market) id
        FROM public.launch_plan_changes
       WHERE outcome = 'ok'
       ORDER BY gateway, fire, market, at DESC, id DESC
    ),
    picked AS (
      SELECT id FROM recent
      UNION
      SELECT id FROM last_ok
    )
    SELECT jsonb_build_object('changes', COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.at DESC, c.id DESC), '[]'::jsonb))
      FROM public.launch_plan_changes c
      JOIN picked USING (id)
  );
END;
$$;

COMMENT ON FUNCTION public.launch_plan_changes_for_admin(integer) IS
  'Phase 35 D-29 — 패널 「마지막 변경」 · 「변경 이력」 읽기({ changes } jsonb 1값). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_plan_changes_for_admin(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_plan_changes_for_admin(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_plan_changes_for_admin(integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
