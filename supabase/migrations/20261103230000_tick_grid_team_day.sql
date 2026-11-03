-- ============================================================
-- quick 261103-j4d — 틱뷰어 목록 팀 당일순매수 · 누적순매수 · 당일손익 (결정 1 · 2 · 3 · 5).
--
-- 무엇:
--   ① tick_grids 에 팀 3칸 — team_fills · team_day_net_krw · team_day_pnl_krw(nullable) + CHECK tick_grids_team_chk
--   ② tick_grid_upsert(p_mode, p_rows)       교체 — 팀 3칸을 함께 쓴다(키 없는 옛 워커 행은 null · 모드 규칙 불변)
--   ③ tick_day_for_user(p_user_id, p_date)   교체 — rows 에 팀 3칸 + accum_pos_net_krw(limitup_accum_flow.pos_net_krw LEFT JOIN)
--   ④ tick_grid_team_pending(p_from, p_to)   새 — 팀 값 미계산(team_fills IS NULL) 격자 목록(backfill-team 모드 입력)
--   ⑤ tick_grid_team_set(p_rows)             새 — 미계산 행만 팀 3칸을 채운다(재실행 안전 · 반환 = 갱신 수)
--
-- 칸 의미(값 = 틱뷰어 상세 「팀 거래정보」 끝 틱 · 그 거래소 팀만 · shared teamDaySummaryOf 한 벌):
--   team_fills        null = 미계산(옛 행 · 계산 실패 — 백필 대상 표식) · 0 = 팀 체결 없음 · n > 0 = 끝 틱까지 팀 체결 수
--   team_day_net_krw  당일 팀 순매수 원(매수 − 매도) — team_fills > 0 일 때만 값
--   team_day_pnl_krw  당일 팀 손익 원(실현 + 미실현 = pnl.total_val) — team_fills > 0 일 때만 값
--   그래서 「0」 은 팀이 거래했고 값이 정확히 0 일 때만 나온다(팀 체결 없음 = team_fills 0 · 두 값 null → 화면 「—」).
-- 누적순매수(결정 2) 는 저장하지 않는다 — 목록 RPC 가 limitup_accum_flow(PK date, isin)를 LEFT JOIN(KRX · NXT 두 행 같은 값 ·
--   매집감지 미등록이면 null). tick_today_for_user 는 바꾸지 않는다(결정 3 — 웹이 키 없음을 「—」 로 다룬다).
--
-- 함수 최신 정의 = 20261102200000(tick_grid_upsert · tick_day_for_user 는 그 뒤 교체 없음) — 본문은 그 정의 그대로에 팀 칸만 더했다.
-- 권한: 함수 4개 PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT(auto-grant 가 REVOKE FROM PUBLIC 단독을 덮는다).
-- 원격 적용: 커밋만 — 원격은 메인 세션 `supabase db push --linked --yes`.
-- 되돌리기:
--   DROP FUNCTION public.tick_grid_team_set(jsonb);
--   DROP FUNCTION public.tick_grid_team_pending(text, text);
--   20261102200000 의 tick_grid_upsert · tick_day_for_user 정의를 CREATE OR REPLACE 로 다시 적용
--   ALTER TABLE public.tick_grids DROP CONSTRAINT tick_grids_team_chk,
--     DROP COLUMN team_fills, DROP COLUMN team_day_net_krw, DROP COLUMN team_day_pnl_krw;
-- ============================================================

BEGIN;

-- ── ① 표 칸 ───────────────────────────────────────────────────────
ALTER TABLE public.tick_grids
  ADD COLUMN team_fills       integer,
  ADD COLUMN team_day_net_krw bigint,
  ADD COLUMN team_day_pnl_krw bigint,
  ADD CONSTRAINT tick_grids_team_chk CHECK (
       (team_fills IS NULL AND team_day_net_krw IS NULL AND team_day_pnl_krw IS NULL)
    OR (team_fills = 0 AND team_day_net_krw IS NULL AND team_day_pnl_krw IS NULL)
    OR (team_fills > 0 AND team_day_net_krw IS NOT NULL AND team_day_pnl_krw IS NOT NULL));

COMMENT ON COLUMN public.tick_grids.team_fills IS
  '팀 체결 수(상세 「팀 거래정보」 끝 틱 kpi.k · 그 거래소 팀만) — null 미계산(백필 대상) · 0 팀 체결 없음';
COMMENT ON COLUMN public.tick_grids.team_day_net_krw IS
  '당일 팀 순매수 원(매수 − 매도 · 상세 끝 틱 dayNetVal) — team_fills > 0 일 때만 · 그 밖 null';
COMMENT ON COLUMN public.tick_grids.team_day_pnl_krw IS
  '당일 팀 손익 원(실현 + 미실현 = 상세 끝 틱 pnl.total_val) — team_fills > 0 일 때만 · 그 밖 null';

-- ── ② 격자 메타 upsert(Job 용) — 팀 3칸 추가 ─────────────────────────
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
  SELECT r.date, r.exchange, r.isin, p_mode, coalesce(r.sources, '{}'::text[]), r.object_path, r.bytes, r.records, r.a3_count,
         r.first_recv_ms, r.last_recv_ms, r.base_px, r.high_rate, r.last_rate,
         coalesce(r.fmt, 'pcapns-rec+zstd/1'),
         r.team_fills, r.team_day_net_krw, r.team_day_pnl_krw, now(), now()
    FROM jsonb_to_recordset(p_rows) AS r(
           date text, exchange text, isin text, sources text[], object_path text, bytes bigint, records integer,
           a3_count integer, first_recv_ms bigint, last_recv_ms bigint, base_px integer,
           high_rate double precision, last_rate double precision, fmt text,
           team_fills integer, team_day_net_krw bigint, team_day_pnl_krw bigint)
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

  GET DIAGNOSTICS v_n = ROW_COUNT;  -- 쓰이지 않은(WHERE 거짓) 충돌 행은 세지 않는다
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_grid_upsert(text, jsonb) IS
  'Phase 37 D-04 · quick 261103-j4d — 격자 메타 upsert(+ 팀 3칸 · nightly 무조건 · request 는 nightly 를 못 덮음 · promoted 는 promoted 위에만). 쓴 행 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_grid_upsert(text, jsonb) TO service_role;

-- ── ③ 하루 목록 — 팀 3칸 + 누적 순매수 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_day_for_user(p_user_id uuid, p_date text DEFAULT NULL)
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
                            g.a3_count, g.high_rate, g.last_rate, g.created_at,
                            g.team_fills, g.team_day_net_krw, g.team_day_pnl_krw,
                            a.pos_net_krw AS accum_pos_net_krw
                       FROM public.tick_grids g
                       LEFT JOIN public.stocks st ON st.isin = g.isin
                       -- 매집감지 누적(결정 2) — PK (date, isin) 라 행 중복 없음 · KRX · NXT 두 행이 같은 값
                       LEFT JOIN public.limitup_accum_flow a ON a.date = g.date AND a.isin = g.isin
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
  'Phase 37 D-08 · quick 261103-j4d — 틱 뷰어 하루 목록(jsonb 1회 · 날짜 목록 · 그날 격자(+ 팀 3칸 · 매집감지 누적 순매수) · 요청 · eta_s). DMA 매핑 사용자만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_day_for_user(uuid, text) TO service_role;

-- ── ④ 팀 값 미계산 격자(백필 입력) ─────────────────────────────────
CREATE FUNCTION public.tick_grid_team_pending(p_from text DEFAULT NULL, p_to text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_from IS NOT NULL AND p_from !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'tick_grid_team_pending: p_from 은 YYYYMMDD (받은 값 %)', p_from;
  END IF;
  IF p_to IS NOT NULL AND p_to !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'tick_grid_team_pending: p_to 는 YYYYMMDD (받은 값 %)', p_to;
  END IF;

  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'date', g.date, 'exchange', g.exchange, 'isin', g.isin,
                   'object_path', g.object_path, 'bytes', g.bytes)
                 ORDER BY g.date DESC, g.exchange, g.isin), '[]'::jsonb)
            FROM public.tick_grids g
           WHERE g.team_fills IS NULL
             AND (p_from IS NULL OR g.date >= p_from)
             AND (p_to IS NULL OR g.date <= p_to));
END;
$$;

COMMENT ON FUNCTION public.tick_grid_team_pending(text, text) IS
  'quick 261103-j4d — 팀 값 미계산(team_fills IS NULL) 격자 [{date, exchange, isin, object_path, bytes}] · date DESC. tick-convert backfill-team 입력. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_grid_team_pending(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_grid_team_pending(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_grid_team_pending(text, text) TO service_role;

-- ── ⑤ 팀 값 채우기(백필) ───────────────────────────────────────────
CREATE FUNCTION public.tick_grid_team_set(p_rows jsonb)
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
    RAISE EXCEPTION 'tick_grid_team_set: p_rows 는 jsonb 배열이어야 한다';
  END IF;

  -- 같은 객체(object_path)이고 아직 미계산인 행만 — 그 사이 다른 모드가 격자를 바꿨거나 이미 값이 있으면 건드리지 않는다.
  -- updated_at 은 격자 갱신 시각이라 그대로 둔다.
  UPDATE public.tick_grids g
     SET team_fills       = r.team_fills,
         team_day_net_krw = r.team_day_net_krw,
         team_day_pnl_krw = r.team_day_pnl_krw
    FROM jsonb_to_recordset(p_rows) AS r(
           date text, exchange text, isin text, object_path text,
           team_fills integer, team_day_net_krw bigint, team_day_pnl_krw bigint)
   WHERE g.date = r.date AND g.exchange = r.exchange AND g.isin = r.isin
     AND g.object_path = r.object_path
     AND g.team_fills IS NULL
     AND r.team_fills IS NOT NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.tick_grid_team_set(jsonb) IS
  'quick 261103-j4d — 팀 3칸 백필(같은 object_path ∧ team_fills IS NULL 행만 · 이미 값 있는 행은 안 덮음). 갱신 수. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.tick_grid_team_set(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_grid_team_set(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_grid_team_set(jsonb) TO service_role;

COMMIT;
