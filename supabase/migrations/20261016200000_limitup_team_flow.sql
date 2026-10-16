-- ============================================================
-- Phase 33 Plan 01 — 팀 매집(teamflow) 일일 export 를 상한가 적재 트랜잭션의 7번째 표로 싣는다.
--
-- 무엇:
--   ① public.limitup_team_flow — 종목 · 일 한 행(PK date, isin). 평평한 열 29개 + schema_version + payload jsonb.
--      열 순서 = gh-trade `teamflow.py export_row` 의 키 순서(인박스 docs/inbox/from-gh-trade/261016-teamflow-export.md 열 사전).
--   ② limitup_stage 의 tbl CHECK 에 'team_flow' 추가(9값).
--   ③ limitup_commit_day 본문 교체 — 8쌍 뒤 9번째 DELETE → INSERT 쌍(team_flow).
--   ④ limitup_purge_old 본문 교체 — 다른 90일 표와 같은 v_cutoff 로 team_flow 삭제.
--
-- 결정(33-CONTEXT):
--   D-01 표 하나(평평한 열 + payload jsonb) · 적재는 기존 limitup_commit_day 원자 교체에 7번째 표로 — 6표와 같은 날짜
--        트랜잭션이라 보고서가 그날 일부만 보는 틈이 없다.
--   D-02 team_flow 는 선택 파일 — 워커는 파일이 없으면 0행 stage 로 commit 한다(p_expected.team_flow = 0).
--        그날 team_flow 행 DELETE 는 키 유무와 무관하게 늘 한다(날짜 교체 규칙 — 옛 team_flow 가 새 6표와 어긋나게 남지 않게).
--   D-03 이미 적재된 날짜의 재적재 감지는 워커가 한다(limitup_loads.rows 의 team_flow 키 ≠ manifest rows → 재적재).
--        20261006120000 머리말의 「files_sig 를 손으로 NULL 로 돌려 재적재」 는 이 자동 감지로 대체된다.
--
-- 옛 워커 호환(배포 순서 무관):
--   - 시그니처 (text, text, text, integer, jsonb) · 반환 타입이 그대로라 CREATE OR REPLACE 로 본문만 바뀐다(권한 · 소유 보존).
--   - 옛 워커는 p_expected 에 team_flow 키를 안 넣고 stage team_flow 도 0행 → 대조 루프 `coalesce((p_expected->>v_t)::integer, 0)`
--     가 0 = 0 으로 통과한다.
--   - Pitfall 1: 옛 워커 호출이면 limitup_loads.rows 에 team_flow 키를 쓰지 않는다(`IF p_expected ? 'team_flow'`).
--     키가 없어야 새 워커가 다음 run 에 「team_flow 미적재」 로 보고 다시 채운다(키 = 0 으로 써 버리면 감지가 막힌다).
--   - Pitfall 2: CREATE OR REPLACE FUNCTION 은 명시하지 않은 함수 속성을 기본값으로 되돌린다 — 20261006090500 의
--     `SET statement_timeout = '120s'` 가 지워지므로 같은 트랜잭션에서 다시 적고, 끝에 PostgREST 스키마 캐시를 다시 읽힌다.
--   - Pitfall 3: stage CHECK 는 20261006090100 의 이름 없는 인라인 CHECK 라 PG 기본 이름 limitup_stage_tbl_check 다.
--     IF EXISTS 없이 정확한 이름으로 DROP — 이름이 다르면 이 마이그레이션이 멈춰야 한다(조용한 미적용 방지).
--
-- 단위(DB 는 export 원문 그대로 · 표시 변환은 웹 — D-04): *_ms epoch ms · 가격 · 금액 원 · 수량 주 ·
--   *_share 0~1(분모 0 이면 null) · *_rate %(30.0 = +30%). *_rate · *_share 는 double precision 이어야 한다 —
--   jsonb_populate_record 는 JSON 숫자 텍스트를 열 입력 함수에 넣으므로 29.8 이 bigint 열에 가면 그날 commit 이 통째로 실패한다.
--   status 에 CHECK 를 걸지 않는다 — gh-trade 가 값을 하나 늘리면 그날 commit 전체가 실패한다(다른 limitup 표도 CHECK 없음).
--
-- 권한: 표는 서비스롤 전용(RLS 활성 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT) —
--   읽기는 서버 RPC teamflow_report_for_user 뿐(D-06 · 20261016200100). 함수 권한 3줄은 프로젝트 관례대로 재진술
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 33-08 `supabase db push`.
-- 되돌리기: DROP TABLE public.limitup_team_flow; stage CHECK 를 8값으로 되돌린 뒤
--   20261006090200(limitup_commit_day) · 20261006090300(limitup_purge_old) 본문과 20261006090500(timeout) 을 다시 적용.
-- ============================================================

BEGIN;

-- ── ① 팀 매집 표 ─────────────────────────────────────────────────
CREATE TABLE public.limitup_team_flow (
  date                text    NOT NULL,
  isin                text    NOT NULL,
  short_code          text,
  name                text,
  market              text,
  base                bigint,
  upper               bigint,
  first_limit_ms      bigint,
  first_limit_auction boolean,
  last_ms             bigint,
  last_px             bigint,
  last_rate           double precision,
  status              text,
  volume              bigint,
  value               bigint,
  team_buy_val        bigint,
  team_sell_val       bigint,
  team_net_val        bigint,
  team_buy_share      double precision,
  below20_net_val     bigint,
  above20_net_val     bigint,
  limit_team_buy_val  bigint,
  limit_team_sell_val bigint,
  reach_team_share    double precision,
  reach_team_val      bigint,
  b9_lower            bigint,
  high_px             bigint,
  high_rate           double precision,
  high_ms             bigint,
  schema_version      integer,
  payload             jsonb,
  PRIMARY KEY (date, isin)
);

COMMENT ON TABLE public.limitup_team_flow IS
  'gh-trade 밤 export team_flow — 팀 매집 종목 · 일 한 행(Phase 33 D-01, service_role 전용 · 읽기는 teamflow_report_for_user)';
COMMENT ON COLUMN public.limitup_team_flow.first_limit_ms      IS '첫 상한가 체결 시각 epoch ms(미도달 null)';
COMMENT ON COLUMN public.limitup_team_flow.first_limit_auction IS '첫 상한가 체결이 단일가(VI)였나(상한가 체결이 없어도 false)';
COMMENT ON COLUMN public.limitup_team_flow.last_ms             IS '마지막 체결 시각 epoch ms';
COMMENT ON COLUMN public.limitup_team_flow.last_px             IS '마지막 체결가 원';
COMMENT ON COLUMN public.limitup_team_flow.last_rate           IS '마지막 체결 등락률 %(30.0 = +30%)';
COMMENT ON COLUMN public.limitup_team_flow.status              IS 'limit(마지막 체결가 == 상한가) | below — CHECK 없음';
COMMENT ON COLUMN public.limitup_team_flow.volume              IS '하루 거래량 주(상한가 가격 포함)';
COMMENT ON COLUMN public.limitup_team_flow.value               IS '하루 거래대금 원(상한가 가격 포함)';
COMMENT ON COLUMN public.limitup_team_flow.team_net_val        IS '팀 순매수 원 — 상한가 가격 체결 제외(payload.bands 「하루 합계」.net_val 과 같은 값)';
COMMENT ON COLUMN public.limitup_team_flow.team_buy_share      IS '팀 매수 ÷ 매수주도 체결(주 기준) 0~1 — 분모 0 이면 null';
COMMENT ON COLUMN public.limitup_team_flow.reach_team_share    IS '연속매매로 상한가에 닿은 순간 매수주도 중 팀 비중 0~1(null 가능)';
COMMENT ON COLUMN public.limitup_team_flow.high_rate           IS '고가 등락률 %';
COMMENT ON COLUMN public.limitup_team_flow.high_ms             IS '고가 시각 epoch ms';
COMMENT ON COLUMN public.limitup_team_flow.payload             IS 'bands · buckets · bucket_min · window · worst · reach · members · summary_lines — export 원문 그대로';

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기는 서버 RPC 뿐(D-06).
ALTER TABLE public.limitup_team_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_team_flow FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_team_flow FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_team_flow TO service_role;

-- ── ② stage CHECK 9값 — 정확한 이름으로 DROP(Pitfall 3) ────────────
ALTER TABLE public.limitup_stage DROP CONSTRAINT limitup_stage_tbl_check;
ALTER TABLE public.limitup_stage ADD CONSTRAINT limitup_stage_tbl_check
  CHECK (tbl IN ('entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches', 'grid_summary', 'member_daily', 'team_flow'));

-- ── ③ 날짜 원자 commit — 20261006090200 본문 + 9번째 쌍(team_flow) ────
CREATE OR REPLACE FUNCTION public.limitup_commit_day(
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
                                  'grid_summary', 'member_daily', 'team_flow'];
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
  --   (키가 없으면 0 — 옛 워커는 team_flow 키를 안 넣고 stage 도 0행이라 통과한다)
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

  -- ⓒ 표마다 그날 DELETE → INSERT (정적 문장 9쌍)
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

  -- 9번째 쌍 — DELETE 는 키와 무관하게 늘(D-02), 이력 키는 p_expected 에 있을 때만(Pitfall 1 · D-03)
  DELETE FROM public.limitup_team_flow WHERE date = p_date;
  INSERT INTO public.limitup_team_flow
    SELECT (jsonb_populate_record(NULL::public.limitup_team_flow, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'team_flow' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF p_expected ? 'team_flow' THEN
    v_rows := v_rows || jsonb_build_object('team_flow', v_n);
  END IF;

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

-- Pitfall 2 — CREATE OR REPLACE 가 지운 함수 속성 재진술(20261006090500)
ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';

REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) TO service_role;

-- ── ④ 보존 정리 — 20261006090300 본문 + team_flow(v_cutoff = LIMITUP_KEEP_DAYS) ──
CREATE OR REPLACE FUNCTION public.limitup_purge_old(p_keep_days integer, p_alloc_keep_days integer)
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
  DELETE FROM public.limitup_team_flow WHERE date < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_out := v_out || jsonb_build_object('team_flow', v_n);
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
  'limitup 보존 정리(D-16 · D-19 · Phase 33) — 표 5 · team_flow · 파생 2 · loads · stage 는 KST 오늘 − p_keep_days 이전, member_alloc 은 − p_alloc_keep_days 이전 삭제(service_role 전용)';

COMMIT;

-- PostgREST 스키마 캐시가 함수 속성(statement_timeout)을 다시 읽게 한다.
NOTIFY pgrst, 'reload schema';
