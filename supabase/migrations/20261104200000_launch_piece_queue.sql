-- ============================================================
-- quick 261103-pei — 발사 조각 대기열 순번 · 앞 물량(16:00 Q16) · 체결 런 순번(09:00 N · A) 저장.
--
-- 무엇:
--   ① 표 launch_piece_queue                     새 — launch_pieces 7키 PK + FK(ON DELETE CASCADE) · 값 14칸 · object_path · computed_at
--   ② launch_queue_inputs(p_date)               새 — 그날 대상 조각 + 조각별 우리 체결(밤 변환 · backfill-launch 입력)
--   ③ launch_queue_set(p_rows)                  새 — 값 upsert(있는 조각만 · 격자 경로가 지금 격자와 같거나 null 일 때만)
--   ④ launch_queue_pending(p_from, p_to)        새 — 값이 없는(또는 다른 격자로 계산된) 대상 조각이 있는 격자 + 격자 없는 키 수
--   ⑤ tick_convert_candidates(p_date)           교체 — 20261102200100 본문 + 'launch'(그날 접수 조각 ISIN · nightly 대상)
--   ⑥ launch_orders_for_admin(p_date)           교체 — 20261030120000 본문 + 조각 jsonb 의 'queue'(값 14칸 · 없으면 null)
--
-- 왜: 어드민 「발사」 → 주문 내역 16:00 · 09:00:30 행에 「앞에서 몇 번째 · 앞에 몇 주(금액)」 를 보인다(D-1 · D-2). 계산은 밤 틱
--   변환 Job 이 격자 바이트로 shared `launchQueueOf` 한 벌을 돌려 여기 저장하고, 서버 · 웹은 읽기만 한다(D-3 · 브라우저 계산 금지).
--   launch_pieces 칸을 늘리지 않는다 — 조각 행은 저널 투영 정본(launch_reproject upsert)이고 대기열 값은 수명이 다르다
--   (격자에서 계산 · 격자 경로 표식 · 재계산).
--
-- 대상 조각(②④ 공통 · design_decisions 4): result '접수' ∧ isin · side(buy|sell) · price · qty 가 비지 않음 ∧ profile ∈ {Q16, N, A}.
--   거부 조각은 대기열에 들어가지 않으므로 값이 없다(웹 「—」).
--
-- 칸 의미(수량 = 주 · 금액 = 원 · TS LaunchPieceQueue 가 정본 JSDoc):
--   kind        queue(16:00 대기열 · 보드 G4) | run(09:00 체결 런 · 보드 G1)
--   matched     false = 격자에서 우리 조각 · 런을 못 찾음(값 전부 null)
--   rank        queue = 그 가격 단 증가 이벤트 번호 · run = 기준시각 뒤 같은 방향 런 순번(미체결 null)
--   ahead_*     접수 때 앞(queue = 직전 B6 그 가격 + 더 좋은 단 · run = 앞 런들의 한도 안 체결 · 미체결은 1초 창) — ahead_n 은 run 만
--   end_*       queue 만 — 마감 때 상태 open | cancelled | filled · open 이면 우리 앞 남은 건수 · 수량 · 금액(FIFO 재구성 추정)
--   fill_*      run 만 — 우리 체결 수량 합 · 체결가 최저 · 최고
--   order_est   게이트웨이 순서를 정하지 못해 LAUNCH_ORDER 로 가정(두 순서 모두 성립)
--   object_path 계산에 쓴 격자(tick_grids.object_path) · null = GRID_MAX_BYTES 초과로 올리지 않은 격자의 원시 바이트로 계산
--
-- 권한: 표 RLS ENABLE · 정책 0 · PUBLIC · anon · authenticated REVOKE ALL · service_role 만(launch_pieces 와 같은 꼴).
--   함수 5개 SECURITY INVOKER + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT(auto-grant 가 FROM PUBLIC 단독을 덮는다).
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`. tick-convert 재배포보다 먼저.
-- 되돌리기:
--   20261030120000 의 launch_orders_for_admin · 20261102200100 의 tick_convert_candidates 를 CREATE OR REPLACE 로 다시 적용
--   DROP FUNCTION public.launch_queue_pending(text, text);
--   DROP FUNCTION public.launch_queue_set(jsonb);
--   DROP FUNCTION public.launch_queue_inputs(text);
--   DROP TABLE public.launch_piece_queue;
-- ============================================================

BEGIN;

-- ── ① 표 ──────────────────────────────────────────────────────────
CREATE TABLE public.launch_piece_queue (
  trade_date    date        NOT NULL,
  gateway       text        NOT NULL,
  profile       text        NOT NULL,
  fire_exchange text        NOT NULL,
  fire_base     time        NOT NULL,
  market        text        NOT NULL,
  wire          integer     NOT NULL,
  object_path   text,
  kind          text        NOT NULL,
  matched       boolean     NOT NULL,
  rank          integer,
  ahead_n       integer,
  ahead_qty     bigint,
  ahead_amt     bigint,
  end_state     text,
  end_n         integer,
  end_qty       bigint,
  end_amt       bigint,
  fill_qty      bigint,
  fill_px_min   integer,
  fill_px_max   integer,
  order_est     boolean     NOT NULL DEFAULT false,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, gateway, profile, fire_exchange, fire_base, market, wire),
  FOREIGN KEY (trade_date, gateway, profile, fire_exchange, fire_base, market, wire)
    REFERENCES public.launch_pieces (trade_date, gateway, profile, fire_exchange, fire_base, market, wire) ON DELETE CASCADE,
  CONSTRAINT launch_piece_queue_kind_chk CHECK (kind IN ('queue', 'run')),
  CONSTRAINT launch_piece_queue_end_state_chk CHECK (end_state IS NULL OR end_state IN ('open', 'cancelled', 'filled')),
  CONSTRAINT launch_piece_queue_run_end_chk CHECK (
    kind = 'queue' OR (end_state IS NULL AND end_n IS NULL AND end_qty IS NULL AND end_amt IS NULL)),
  CONSTRAINT launch_piece_queue_queue_fill_chk CHECK (
    kind = 'run' OR (fill_qty IS NULL AND fill_px_min IS NULL AND fill_px_max IS NULL)),
  CONSTRAINT launch_piece_queue_rank_chk CHECK (rank IS NULL OR rank >= 1)
);

COMMENT ON TABLE public.launch_piece_queue IS
  'quick 261103-pei — 발사 조각 대기열 순번 · 앞 물량 · 체결 런 순번(밤 틱 변환이 격자로 계산 · shared launchQueueOf). service_role 전용 · 읽기는 launch_orders_for_admin';
COMMENT ON COLUMN public.launch_piece_queue.object_path IS '계산에 쓴 격자 tick_grids.object_path — null = GRID_MAX_BYTES 초과로 올리지 않은 격자의 원시 바이트로 계산';
COMMENT ON COLUMN public.launch_piece_queue.kind        IS 'queue = 16:00 Q16 매수 대기열(보드 G4) · run = 09:00 N/A 공격 주문 체결 런(보드 G1)';
COMMENT ON COLUMN public.launch_piece_queue.matched     IS 'false = 격자에서 우리 조각 · 런을 못 찾음 — 값 전부 null(웹 「—」)';
COMMENT ON COLUMN public.launch_piece_queue.rank        IS 'queue = 그 가격 단 증가 이벤트 번호(1부터) · run = 기준시각 뒤 같은 방향 런 순번(미체결 null)';
COMMENT ON COLUMN public.launch_piece_queue.ahead_n     IS 'run 만 — 우리 앞(미체결이면 기준시각 뒤 1초 창) 한도 안 체결이 있는 런 수';
COMMENT ON COLUMN public.launch_piece_queue.ahead_qty   IS '접수 때 앞 주 — queue = 직전 B6 그 가격 + 더 좋은 가격 단 잔량 · run = 앞 런의 한도 안 체결';
COMMENT ON COLUMN public.launch_piece_queue.ahead_amt   IS '접수 때 앞 원 — 단마다(체결마다) 수량 × 가격의 합';
COMMENT ON COLUMN public.launch_piece_queue.end_state   IS 'queue 만 — 마감 때 우리 조각 open | cancelled | filled(FIFO 재구성 추정)';
COMMENT ON COLUMN public.launch_piece_queue.end_n       IS 'queue open 만 — 마감 때 우리 앞 남은 주문 수(추정)';
COMMENT ON COLUMN public.launch_piece_queue.end_qty     IS 'queue open 만 — 마감 때 우리 앞 남은 주(추정)';
COMMENT ON COLUMN public.launch_piece_queue.end_amt     IS 'queue open 만 — 마감 때 우리 앞 남은 원(end_qty × 가격)';
COMMENT ON COLUMN public.launch_piece_queue.fill_qty    IS 'run 만 — 우리 체결 주 합(미체결 0)';
COMMENT ON COLUMN public.launch_piece_queue.fill_px_min IS 'run 만 — 우리 체결가 최저(미체결 null)';
COMMENT ON COLUMN public.launch_piece_queue.fill_px_max IS 'run 만 — 우리 체결가 최고(미체결 null)';
COMMENT ON COLUMN public.launch_piece_queue.order_est   IS '게이트웨이 순서를 정하지 못해 LAUNCH_ORDER(KB120 → KYOBO119)로 가정 — 웹은 첫 줄 끝 「(추정)」';
COMMENT ON COLUMN public.launch_piece_queue.computed_at IS '마지막 계산 시각';

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기는 서버 어드민 RPC 뿐.
ALTER TABLE public.launch_piece_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_piece_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_piece_queue FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.launch_piece_queue TO service_role;

-- ── ② 계산 입력 ───────────────────────────────────────────────────
CREATE FUNCTION public.launch_queue_inputs(p_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
BEGIN
  IF p_date IS NULL OR p_date !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'launch_queue_inputs: p_date 는 YYYYMMDD (받은 값 %)', p_date USING ERRCODE = '22023';
  END IF;
  v_day := to_date(p_date, 'YYYYMMDD');

  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                   'gateway', p.gateway,
                   'profile', p.profile,
                   'fire_exchange', p.fire_exchange,
                   'fire_base', to_char(p.fire_base, 'HH24:MI:SS'),
                   'market', p.market,
                   'wire', p.wire,
                   'side', p.side,
                   'isin', p.isin,
                   'price', p.price,
                   'qty', p.qty,
                   -- 우리 체결 [가격, 수량] — 저널 순서(gw_time, seq). order_no 없으면 [](계좌가 있으면 계좌도 맞춘다).
                   'fills', coalesce((
                     SELECT jsonb_agg(jsonb_build_array(j.exec_price, j.exec_qty) ORDER BY j.gw_time, j.seq)
                       FROM public.dma_journal_events j
                      WHERE nullif(p.order_no, '') IS NOT NULL
                        AND j.gateway = p.gateway
                        AND j.trade_date = p.trade_date
                        AND j.order_no = p.order_no
                        AND j.notice_type = 'E'
                        AND j.exec_qty > 0
                        AND (p.account IS NULL OR j.account_no = p.account)), '[]'::jsonb))
                 ORDER BY p.fire_exchange, p.isin, p.fire_base, p.gateway, p.wire), '[]'::jsonb)
            FROM public.launch_pieces p
           WHERE p.trade_date = v_day
             AND p.result = '접수'
             AND coalesce(p.isin, '') <> ''
             AND p.side IN ('buy', 'sell')
             AND p.price IS NOT NULL
             AND p.qty IS NOT NULL
             AND p.profile IN ('Q16', 'N', 'A'));
END;
$$;

COMMENT ON FUNCTION public.launch_queue_inputs(text) IS
  'quick 261103-pei — 그날 대상 조각(접수 ∧ isin · side · price · qty ∧ profile Q16 · N · A) + 조각별 우리 체결 fills [[px, qty]](저널 E · gw_time, seq 순). 정렬 fire_exchange, isin, fire_base, gateway, wire. tick-convert 입력. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_queue_inputs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_queue_inputs(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_queue_inputs(text) TO service_role;

-- ── ③ 값 저장 ─────────────────────────────────────────────────────
CREATE FUNCTION public.launch_queue_set(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'launch_queue_set: p_rows 는 jsonb 배열이어야 한다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_piece_queue AS q
         (trade_date, gateway, profile, fire_exchange, fire_base, market, wire, object_path,
          kind, matched, rank, ahead_n, ahead_qty, ahead_amt, end_state, end_n, end_qty, end_amt,
          fill_qty, fill_px_min, fill_px_max, order_est, computed_at)
  SELECT p.trade_date, p.gateway, p.profile, p.fire_exchange, p.fire_base, p.market, p.wire, r.object_path,
         r.kind, r.matched, r.rank, r.ahead_n, r.ahead_qty, r.ahead_amt, r.end_state, r.end_n, r.end_qty, r.end_amt,
         r.fill_qty, r.fill_px_min, r.fill_px_max, coalesce(r.order_est, false), now()
    FROM jsonb_to_recordset(p_rows) AS r(
           trade_date text, gateway text, profile text, fire_exchange text, fire_base text, market text, wire integer,
           object_path text, kind text, matched boolean, rank integer, ahead_n integer, ahead_qty bigint, ahead_amt bigint,
           end_state text, end_n integer, end_qty bigint, end_amt bigint, fill_qty bigint, fill_px_min integer,
           fill_px_max integer, order_est boolean)
    -- 있는 조각만(없는 키는 버린다)
    JOIN public.launch_pieces p
      ON p.trade_date = to_date(r.trade_date, 'YYYYMMDD') AND p.gateway = r.gateway AND p.profile = r.profile
     AND p.fire_exchange = r.fire_exchange AND p.fire_base = r.fire_base::time AND p.market = r.market AND p.wire = r.wire
   -- 격자 가드 — null(너무 커서 안 올린 격자) 이거나 지금 그 격자 경로와 같을 때만(그 사이 격자가 바뀌었으면 안 쓴다)
   WHERE r.object_path IS NULL
      OR EXISTS (SELECT 1 FROM public.tick_grids g
                  WHERE g.date = r.trade_date AND g.exchange = r.fire_exchange AND g.isin = p.isin
                    AND g.object_path = r.object_path)
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, fire_base, market, wire) DO UPDATE
     SET object_path = EXCLUDED.object_path,
         kind        = EXCLUDED.kind,
         matched     = EXCLUDED.matched,
         rank        = EXCLUDED.rank,
         ahead_n     = EXCLUDED.ahead_n,
         ahead_qty   = EXCLUDED.ahead_qty,
         ahead_amt   = EXCLUDED.ahead_amt,
         end_state   = EXCLUDED.end_state,
         end_n       = EXCLUDED.end_n,
         end_qty     = EXCLUDED.end_qty,
         end_amt     = EXCLUDED.end_amt,
         fill_qty    = EXCLUDED.fill_qty,
         fill_px_min = EXCLUDED.fill_px_min,
         fill_px_max = EXCLUDED.fill_px_max,
         order_est   = EXCLUDED.order_est,
         computed_at = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.launch_queue_set(jsonb) IS
  'quick 261103-pei — 대기열 값 upsert(7키 · 있는 조각만 · object_path 가 null 이거나 지금 tick_grids 경로와 같을 때만 · 다시 부르면 덮음). 쓴 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_queue_set(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_queue_set(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_queue_set(jsonb) TO service_role;

-- ── ④ 백필 대상 ───────────────────────────────────────────────────
CREATE FUNCTION public.launch_queue_pending(p_from text DEFAULT NULL, p_to text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_from IS NOT NULL AND p_from !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'launch_queue_pending: p_from 은 YYYYMMDD (받은 값 %)', p_from USING ERRCODE = '22023';
  END IF;
  IF p_to IS NOT NULL AND p_to !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'launch_queue_pending: p_to 는 YYYYMMDD (받은 값 %)', p_to USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH t AS (  -- 대상 조각(② 와 같은 조건) · 범위
      SELECT p.*, to_char(p.trade_date, 'YYYYMMDD') AS d
        FROM public.launch_pieces p
       WHERE p.result = '접수'
         AND coalesce(p.isin, '') <> ''
         AND p.side IN ('buy', 'sell')
         AND p.price IS NOT NULL
         AND p.qty IS NOT NULL
         AND p.profile IN ('Q16', 'N', 'A')
         AND (p_from IS NULL OR p.trade_date >= to_date(p_from, 'YYYYMMDD'))
         AND (p_to IS NULL OR p.trade_date <= to_date(p_to, 'YYYYMMDD'))),
    k AS (  -- 격자 키(날짜, 거래소, isin) — 그 격자 경로로 계산된 값이 없는 조각이 하나라도 있는가
      SELECT t.d, t.fire_exchange, t.isin,
             bool_or(q.trade_date IS NOT NULL) AS any_value,
             g.object_path, g.bytes,
             bool_or(g.object_path IS NOT NULL AND q.object_path IS DISTINCT FROM g.object_path) AS stale
        FROM t
        LEFT JOIN public.tick_grids g ON g.date = t.d AND g.exchange = t.fire_exchange AND g.isin = t.isin
        LEFT JOIN public.launch_piece_queue q
               ON q.trade_date = t.trade_date AND q.gateway = t.gateway AND q.profile = t.profile
              AND q.fire_exchange = t.fire_exchange AND q.fire_base = t.fire_base AND q.market = t.market AND q.wire = t.wire
       GROUP BY t.d, t.fire_exchange, t.isin, g.object_path, g.bytes)
    SELECT jsonb_build_object(
             'grids', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                         'date', k.d, 'exchange', k.fire_exchange, 'isin', k.isin,
                                         'object_path', k.object_path, 'bytes', k.bytes)
                                       ORDER BY k.d DESC, k.fire_exchange, k.isin)
                                  FROM k WHERE k.object_path IS NOT NULL AND k.stale), '[]'::jsonb),
             'no_grid', (SELECT count(*) FROM k WHERE k.object_path IS NULL AND NOT k.any_value)));
END;
$$;

COMMENT ON FUNCTION public.launch_queue_pending(text, text) IS
  'quick 261103-pei — {grids: [{date, exchange, isin, object_path, bytes}](대상 조각 중 그 격자 경로로 계산된 값이 없는 조각이 있는 격자 · date DESC), no_grid: 격자도 값도 없는 (날짜, 거래소, isin) 수}. tick-convert backfill-launch 입력. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_queue_pending(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_queue_pending(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_queue_pending(text, text) TO service_role;

-- ── ⑤ nightly 대상 후보 — + launch ────────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_convert_candidates(p_date text)
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
                        WHERE s.kind = 16 AND s.trade_date = to_date(p_date, 'YYYYMMDD') AND s.isin <> '') e),
    -- quick 261103-pei — 그날 접수 발사 조각 ISIN(발사 종목은 매집감지 · +15% 대상이 아닐 수 있다 · 출처 칩 없음)
    'launch', (SELECT coalesce(jsonb_agg(l.isin ORDER BY l.isin), '[]'::jsonb)
                 FROM (SELECT DISTINCT p.isin FROM public.launch_pieces p
                        WHERE p.trade_date = to_date(p_date, 'YYYYMMDD') AND p.result = '접수'
                          AND coalesce(p.isin, '') <> '') l));
$$;

COMMENT ON FUNCTION public.tick_convert_candidates(text) IS
  'Phase 37 D-02 · quick 261103-pei — nightly 대상 후보 {accum: limitup_accum_flow 그 날짜 isin, live16: 그날 dma_strategy_events kind 16 isin, launch: 그날 접수 발사 조각 isin}(15% 는 Job 이 pcap 에서 더한다). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_convert_candidates(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_convert_candidates(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_convert_candidates(text) TO service_role;

-- ── ⑥ 주문 내역 — 조각마다 queue ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.launch_orders_for_admin(p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
  v_day   date;
BEGIN
  IF p_date IS NOT NULL AND p_date !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'launch_orders_for_admin: p_date 는 YYYYMMDD (got %)', p_date USING ERRCODE = '22023';
  END IF;

  v_dates := ARRAY(SELECT DISTINCT to_char(p.trade_date, 'YYYYMMDD') FROM public.launch_pieces p ORDER BY 1 DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('dates', '[]'::jsonb, 'date', NULL, 'heads', '[]'::jsonb, 'pieces', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);
  v_day  := to_date(v_date, 'YYYYMMDD');

  RETURN jsonb_build_object(
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'heads', (SELECT coalesce(jsonb_agg(
                       to_jsonb(h) - 'created_at' - 'updated_at'
                       || jsonb_build_object('trade_date', to_char(h.trade_date, 'YYYYMMDD'),
                                             'fire_base', to_char(h.fire_base, 'HH24:MI:SS'))
                       ORDER BY h.gateway, h.market, h.fire_base, h.profile), '[]'::jsonb)
                FROM public.launch_heads h WHERE h.trade_date = v_day),
    'pieces', (SELECT coalesce(jsonb_agg(
                        to_jsonb(p) - 'created_at' - 'updated_at'
                        || jsonb_build_object('trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                                              'fire_base', to_char(p.fire_base, 'HH24:MI:SS'),
                                              'stock_code', s.code,
                                              'stock_name', s.name,
                                              'filled_qty', coalesce(o.filled_qty, p.filled_qty),
                                              -- quick 261103-pei — 대기열 값 14칸(키 · object_path · computed_at 뺌) · 없으면 null
                                              'queue', CASE WHEN q.trade_date IS NULL THEN NULL
                                                            ELSE to_jsonb(q) - 'trade_date' - 'gateway' - 'profile'
                                                                 - 'fire_exchange' - 'fire_base' - 'market' - 'wire'
                                                                 - 'object_path' - 'computed_at' END)
                        ORDER BY p.gateway, p.market, p.fire_base, p.fire_exchange, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                 LEFT JOIN public.stocks s ON s.isin = p.isin
                 LEFT JOIN public.dma_account_orders o
                        ON o.gateway = p.gateway AND o.trade_date = p.trade_date
                       AND o.account_no = p.account AND o.order_no = p.order_no
                 LEFT JOIN public.launch_piece_queue q
                        ON q.trade_date = p.trade_date AND q.gateway = p.gateway AND q.profile = p.profile
                       AND q.fire_exchange = p.fire_exchange AND q.fire_base = p.fire_base
                       AND q.market = p.market AND q.wire = p.wire
                WHERE p.trade_date = v_day));
END;
$$;

COMMENT ON FUNCTION public.launch_orders_for_admin(text) IS
  'Phase 35 D-12/D-13/D-20 — 발사 주문 내역 하루치(jsonb 1회 · 조각 + 머리 · D-02 어드민 전용 예외로 account · dma_user_id 포함 · filled_qty 는 주문 저널 dma_account_orders 값 우선 · quick 261103-pei 조각마다 queue = launch_piece_queue 값 14칸 또는 null). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_orders_for_admin(text) TO service_role;

COMMIT;
