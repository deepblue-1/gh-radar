-- ============================================================
-- Phase 37 Plan 04 — 틱 전문 뷰어 격자 메타 · 열기 RPC (D-04 · D-08 · D-09).
--
-- 무엇:
--   ① 표 3 — tick_grids(종목 · 날짜 · 거래소 격자 메타) · tick_convert_requests(요청 변환 큐) · tick_convert_runs(실행 기록)
--   ② tick_grid_upsert(p_mode, p_rows)            → integer — 변환 Job 이 Storage 업로드 뒤 메타를 쓴다(모드 규칙 · 쓴 행 수)
--   ③ tick_day_for_user(p_user_id, p_date)         → jsonb   — 하루 목록 한 장(날짜 목록 · 그날 격자 · 그날 요청 · eta_s)
--   ④ tick_open_for_user(p_user_id, p_date, p_isin, p_ex) → jsonb — 한 종목 열기(격자 메타 · 요청 · 매집감지 누적 · 종목 · eta_s)
--   ⑤ 내부 함수 tick_eta_s(p_ex) · tick_trigger_blocked(p_date, p_ex) — 큐 마이그레이션(20261102200100)도 같은 함수를 쓴다
--   ⑥ 비공개 버킷 tick-grid(50MB · application/zstd · 정책 0 — 업로드 service role · 읽기 server 서명 URL)
--
-- 모드 규칙(D-04 — 밤 변환본이 정본):
--   nightly  = 언제나 덮는다(승격본 · 요청본 위에도)
--   request  = nightly 행은 덮지 않는다(없거나 request · promoted 면 덮는다)
--   promoted = 행이 없거나 기존이 promoted 일 때만 쓴다
--   객체 경로는 모드마다 다르다(grid/<D>/<EX>/<isin>.<mode>.ticks.zst) — 다른 모드 객체를 지우지 않으므로 덮이지 않은 쪽의
--   object_path 가 늘 살아 있는 파일을 가리킨다.
--
-- 트리거 판정 상수(tick_trigger_blocked · tick_open_for_user.request.stale):
--   2분  = Job 기동(Admin API jobs:run → 컨테이너 시작) · claim 까지의 여유. 그 안에 찍힌 triggered_at 은 「이미 깨웠다」.
--   25분 = 요청 실행 타임아웃 1200s(37-07 overrides `timeout`) + 여유 5분. 그보다 오래된 running 은 죽은 Job 으로 본다
--          (stale · 다음 요청이 failed JOB_TIMEOUT 으로 닫는다 — 20261102200100).
--
-- 왜 RPC 1회 · jsonb 스칼라: Cloud Run → Supabase 왕복 수가 지연을 지배한다(server 는 VPC all-traffic egress) —
--   한 요청 = RPC 한 번. SETOF 는 PostgREST max_rows 에 조용히 잘리므로 jsonb 값 하나로 묶는다.
--
-- 게이트 정본: `dma_visible_accounts(p_user_id)` 가 1행 이상 = 「DMA 매핑 사용자」(34 D-06 동형). 아니면 `{"access": false}` 만 —
--   server 가 403 DMA_UNMAPPED 로 바꾼다. 게이트는 함수 첫 줄(왕복 1회). p_user_id 는 server 가 requireAuth 로 확정한 값.
--
-- 응답 모양:
--   day  {access: false}
--        {access: true, dates, date, rows, requests, eta_s: {KRX, NXT}}
--          dates = tick_grids 행이 있는 날짜 내림차순 · date = p_date 또는 최신(이력 0 · p_date 없음 → null)
--          rows  = 그날 격자(+ stocks code · name) · high_rate DESC NULLS LAST, isin, exchange
--          requests = 그날 요청(requested_by 는 내보내지 않는다)
--   open {access: false}
--        {access: true, date, exchange, isin, grid|null, request|null(+stale), accum|null, stock|null, eta_s}
--
-- kind 16(dma_strategy_events)과 join 하지 않는다 — 매집감지 누적은 limitup_accum_flow 가 정본(34 D-22).
-- 권한: 표 3 = RLS 켜짐 · 정책 0 · PUBLIC · anon · authenticated 명시 REVOKE · service_role 만 CRUD.
--   함수 = SECURITY INVOKER(service_role 의 표 권한) + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT
--   (자동 메모리 feedback_supabase_rpc_revoke — FROM PUBLIC 단독은 auto-grant 에 덮인다).
-- 원격 적용: 커밋만 — 원격은 37-16 `supabase db push`(메인 세션).
-- 되돌리기:
--   DROP FUNCTION public.tick_open_for_user(uuid, text, text, text);
--   DROP FUNCTION public.tick_day_for_user(uuid, text);
--   DROP FUNCTION public.tick_grid_upsert(text, jsonb);
--   DROP FUNCTION public.tick_trigger_blocked(text, text);
--   DROP FUNCTION public.tick_eta_s(text);
--   DROP TABLE public.tick_convert_runs; DROP TABLE public.tick_convert_requests; DROP TABLE public.tick_grids;
--   (버킷 tick-grid 는 Storage 객체를 storage API 로 비운 뒤 대시보드에서 지운다.)
-- ============================================================

BEGIN;

-- ── ① 표 ──────────────────────────────────────────────────────────
CREATE TABLE public.tick_grids (
  date          text             NOT NULL CHECK (date ~ '^\d{8}$'),
  exchange      text             NOT NULL CHECK (exchange IN ('KRX', 'NXT')),
  isin          text             NOT NULL CHECK (isin ~ '^[A-Z0-9]{12}$'),
  mode          text             NOT NULL CHECK (mode IN ('nightly', 'request', 'promoted')),
  sources       text[]           NOT NULL CHECK (sources <@ ARRAY['accum', 'up15', 'request', 'promoted']),
  object_path   text             NOT NULL,
  bytes         bigint           NOT NULL,
  records       integer          NOT NULL,
  a3_count      integer          NOT NULL,
  first_recv_ms bigint,
  last_recv_ms  bigint,
  base_px       integer,
  high_rate     double precision,
  last_rate     double precision,
  fmt           text             NOT NULL DEFAULT 'pcapns-rec+zstd/1',
  created_at    timestamptz      NOT NULL DEFAULT now(),
  updated_at    timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (date, exchange, isin)
);

COMMENT ON TABLE public.tick_grids IS
  'Phase 37 D-04 — 틱 격자 메타(종목 · 날짜 · 거래소 한 행 · 파일은 Storage tick-grid). service_role 전용 · 읽기는 tick_day_for_user · tick_open_for_user';
COMMENT ON COLUMN public.tick_grids.mode        IS '지금 object_path 를 쓴 모드 — nightly(정본) | request | promoted(당일 캐시 승격)';
COMMENT ON COLUMN public.tick_grids.sources     IS '진입 출처 칩 — accum(매집감지 등록) · up15(+15%) · request(요청 변환) · promoted(승격)';
COMMENT ON COLUMN public.tick_grids.object_path IS 'Storage tick-grid 객체 경로 grid/<D>/<EX>/<isin>.<mode>.ticks.zst';
COMMENT ON COLUMN public.tick_grids.records     IS '격자 레코드 수(pcap-ns 레코드)';
COMMENT ON COLUMN public.tick_grids.a3_count    IS 'A3(체결) 레코드 수';
COMMENT ON COLUMN public.tick_grids.high_rate   IS '그날 고가 등락률 %(30.0 = +30%)';
COMMENT ON COLUMN public.tick_grids.last_rate   IS '그날 마지막 체결 등락률 %';

CREATE TABLE public.tick_convert_requests (
  date         text        NOT NULL CHECK (date ~ '^\d{8}$'),
  exchange     text        NOT NULL CHECK (exchange IN ('KRX', 'NXT')),
  isin         text        NOT NULL CHECK (isin ~ '^[A-Z0-9]{12}$'),
  status       text        NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  triggered_at timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  PRIMARY KEY (date, exchange, isin)
);

CREATE INDEX idx_tick_convert_requests_day_status
  ON public.tick_convert_requests (date, exchange, status);

COMMENT ON TABLE public.tick_convert_requests IS
  'Phase 37 D-03 — 요청 변환 큐((날짜, 거래소, isin) 한 행 · (날짜, 거래소)당 Job 하나). service_role 전용';
COMMENT ON COLUMN public.tick_convert_requests.triggered_at IS 'Job 을 깨운 시각 — 2분 안이면 다시 깨우지 않는다(tick_trigger_blocked)';
COMMENT ON COLUMN public.tick_convert_requests.error        IS 'NO_RECORDS · NOT_UPLOADED · JOB_TIMEOUT · 업로드 실패 메시지 · 트리거 실패 메시지';

CREATE TABLE public.tick_convert_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date        text        NOT NULL CHECK (date ~ '^\d{8}$'),
  exchange    text        NOT NULL,
  mode        text        NOT NULL CHECK (mode IN ('nightly', 'request', 'promoted')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok          boolean,
  targets     integer,
  written     integer,
  bytes_read  bigint,
  duration_ms integer,
  error       text
);

CREATE INDEX idx_tick_convert_runs_day_mode
  ON public.tick_convert_runs (date, exchange, mode);

COMMENT ON TABLE public.tick_convert_runs IS
  'Phase 37 D-04 — 변환 Job 실행 기록(nightly 따라잡기 판정 · 알림 근거). service_role 전용';

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것(읽기는 서버 RPC 뿐).
ALTER TABLE public.tick_grids            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tick_convert_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tick_convert_runs     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tick_grids FROM PUBLIC;
REVOKE ALL ON TABLE public.tick_grids FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tick_grids TO service_role;

REVOKE ALL ON TABLE public.tick_convert_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.tick_convert_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tick_convert_requests TO service_role;

REVOKE ALL ON TABLE public.tick_convert_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.tick_convert_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tick_convert_runs TO service_role;

-- ── ⑤ 내부 함수 — eta · 트리거 차단 ─────────────────────────────────
CREATE FUNCTION public.tick_eta_s(p_ex text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT ceil(percentile_cont(0.5) WITHIN GROUP (ORDER BY x.s))::integer
       FROM (SELECT extract(epoch FROM r.finished_at - r.triggered_at) AS s
               FROM public.tick_convert_requests r
              WHERE r.exchange = p_ex AND r.status = 'done'
                AND r.triggered_at IS NOT NULL AND r.finished_at IS NOT NULL
              ORDER BY r.finished_at DESC
              LIMIT 20) x),
    CASE WHEN p_ex = 'NXT' THEN 90 ELSE 120 END);
$$;

COMMENT ON FUNCTION public.tick_eta_s(text) IS
  'Phase 37 D-03 — 그 거래소 최근 done 20건 (finished_at − triggered_at) 중앙값 초(올림) · 이력 0 = KRX 120 · NXT 90. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_eta_s(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_eta_s(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_eta_s(text) TO service_role;

CREATE FUNCTION public.tick_trigger_blocked(p_date text, p_ex text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tick_convert_requests r
                  WHERE r.date = p_date AND r.exchange = p_ex
                    AND r.status = 'running' AND r.started_at >= now() - interval '25 minutes')
      OR EXISTS (SELECT 1 FROM public.tick_convert_requests r
                  WHERE r.date = p_date AND r.exchange = p_ex
                    AND r.status IN ('pending', 'running') AND r.triggered_at >= now() - interval '2 minutes');
$$;

COMMENT ON FUNCTION public.tick_trigger_blocked(text, text) IS
  'Phase 37 D-03 — 같은 (날짜, 거래소)에 25분 안에 시작한 running 이 있거나 2분 안에 찍힌 triggered_at 이 있으면 참(Job 을 새로 깨우지 않는다). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_trigger_blocked(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_trigger_blocked(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_trigger_blocked(text, text) TO service_role;

-- ── ② 격자 메타 upsert(Job 용) ─────────────────────────────────────
CREATE FUNCTION public.tick_grid_upsert(p_mode text, p_rows jsonb)
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
          first_recv_ms, last_recv_ms, base_px, high_rate, last_rate, fmt, created_at, updated_at)
  SELECT r.date, r.exchange, r.isin, p_mode, coalesce(r.sources, '{}'::text[]), r.object_path, r.bytes, r.records, r.a3_count,
         r.first_recv_ms, r.last_recv_ms, r.base_px, r.high_rate, r.last_rate,
         coalesce(r.fmt, 'pcapns-rec+zstd/1'), now(), now()
    FROM jsonb_to_recordset(p_rows) AS r(
           date text, exchange text, isin text, sources text[], object_path text, bytes bigint, records integer,
           a3_count integer, first_recv_ms bigint, last_recv_ms bigint, base_px integer,
           high_rate double precision, last_rate double precision, fmt text)
  ON CONFLICT (date, exchange, isin) DO UPDATE
     SET mode          = EXCLUDED.mode,
         sources       = EXCLUDED.sources,
         object_path   = EXCLUDED.object_path,
         bytes         = EXCLUDED.bytes,
         records       = EXCLUDED.records,
         a3_count      = EXCLUDED.a3_count,
         first_recv_ms = EXCLUDED.first_recv_ms,
         last_recv_ms  = EXCLUDED.last_recv_ms,
         base_px       = EXCLUDED.base_px,
         high_rate     = EXCLUDED.high_rate,
         last_rate     = EXCLUDED.last_rate,
         fmt           = EXCLUDED.fmt,
         updated_at    = now()
   -- 모드 규칙(D-04): nightly 무조건 · request 는 nightly 위에 못 쓴다 · promoted 는 promoted 위에만
   WHERE p_mode = 'nightly'
      OR (p_mode = 'request'  AND g.mode <> 'nightly')
      OR (p_mode = 'promoted' AND g.mode = 'promoted');

  GET DIAGNOSTICS v_n = ROW_COUNT;  -- 쓰이지 않은(WHERE 거짓) 충돌 행은 세지 않는다
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_grid_upsert(text, jsonb) IS
  'Phase 37 D-04 — 격자 메타 upsert(nightly 무조건 · request 는 nightly 를 못 덮음 · promoted 는 promoted 위에만). 쓴 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) TO service_role;

-- ── ③ 하루 목록 ───────────────────────────────────────────────────
CREATE FUNCTION public.tick_day_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  v_dates := ARRAY(SELECT DISTINCT g.date FROM public.tick_grids g ORDER BY g.date DESC);
  v_date  := coalesce(p_date, v_dates[1]);  -- 이력 0 · p_date 없음 → null

  RETURN jsonb_build_object(
    'access', true,
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.high_rate DESC NULLS LAST, s.isin, s.exchange), '[]'::jsonb)
               FROM (SELECT g.date, g.exchange, g.isin, st.code, st.name, g.mode, g.sources, g.bytes, g.records,
                            g.a3_count, g.high_rate, g.last_rate, g.created_at
                       FROM public.tick_grids g
                       LEFT JOIN public.stocks st ON st.isin = g.isin
                      WHERE g.date = v_date) s),
    'requests', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.exchange, q.isin), '[]'::jsonb)
                   FROM (SELECT r.exchange, r.isin, r.status, r.requested_at, r.triggered_at, r.started_at,
                                r.finished_at, r.error
                           FROM public.tick_convert_requests r
                          WHERE r.date = v_date) q),
    'eta_s', jsonb_build_object('KRX', public.tick_eta_s('KRX'), 'NXT', public.tick_eta_s('NXT')));
END;
$$;

COMMENT ON FUNCTION public.tick_day_for_user(uuid, text) IS
  'Phase 37 D-08 — 틱 뷰어 하루 목록(jsonb 1회 · 날짜 목록 · 그날 격자 · 요청 · eta_s). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) TO service_role;

-- ── ④ 한 종목 열기 ────────────────────────────────────────────────
CREATE FUNCTION public.tick_open_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  -- 게이트 — 하루 목록과 같은 판정
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;

  v_blocked := public.tick_trigger_blocked(p_date, p_ex);

  RETURN jsonb_build_object(
    'access', true,
    'date', p_date,
    'exchange', p_ex,
    'isin', p_isin,
    'grid', (SELECT to_jsonb(g) FROM public.tick_grids g
              WHERE g.date = p_date AND g.exchange = p_ex AND g.isin = p_isin),
    -- stale = 깨워야 하는데 아무도 안 깨운 pending · 죽은 Job 의 running(25분) — 웹은 stale 이면 convert 를 다시 부른다
    'request', (SELECT jsonb_build_object(
                         'exchange', r.exchange, 'isin', r.isin, 'status', r.status,
                         'requested_at', r.requested_at, 'triggered_at', r.triggered_at,
                         'started_at', r.started_at, 'finished_at', r.finished_at, 'error', r.error,
                         'stale', coalesce(
                           (r.status = 'pending'
                             AND (r.triggered_at IS NULL OR r.triggered_at < now() - interval '2 minutes')
                             AND NOT v_blocked)
                           OR (r.status = 'running' AND r.started_at < now() - interval '25 minutes'), false))
                  FROM public.tick_convert_requests r
                 WHERE r.date = p_date AND r.exchange = p_ex AND r.isin = p_isin),
    -- D-09 — 매집감지 등록 종목이면 회색 누적 선 입력(없으면 null)
    'accum', (SELECT jsonb_build_object('reg_time_ms', a.reg_time_ms, 'pos_net', a.payload->'pos_net')
                FROM public.limitup_accum_flow a
               WHERE a.date = p_date AND a.isin = p_isin),
    'stock', (SELECT jsonb_build_object('code', st.code, 'name', st.name)
                FROM public.stocks st WHERE st.isin = p_isin),
    'eta_s', public.tick_eta_s(p_ex));
END;
$$;

COMMENT ON FUNCTION public.tick_open_for_user(uuid, text, text, text) IS
  'Phase 37 D-08/D-09 — 틱 뷰어 한 종목 열기(격자 메타 · 요청 + stale · 매집감지 누적 · 종목 · eta_s). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) TO service_role;

-- ── ⑥ 격자 버킷 — 로컬 재생 이미지에는 storage 스키마가 없어 가드 안에서만(원격에는 있다) ──
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('tick-grid', 'tick-grid', false, 52428800, ARRAY['application/zstd'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- PostgREST 스키마 캐시가 새 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
