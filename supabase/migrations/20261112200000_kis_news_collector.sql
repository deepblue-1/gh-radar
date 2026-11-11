-- ============================================================
-- Phase 41 Plan 02 — 한투 뉴스·공시 수집기 받침: 토큰 표 + 임대 · 대상 · 종목 정보 · 정리 · 공시 종류 · 운영 수치 RPC.
--
-- 무엇:
--   ① public.kis_access_tokens — 한투 접근 토큰 1행(token_type PK). 발급하면 알림톡이 가므로 수집기는 이 표의 토큰을
--      다시 쓰고 1분 1회 발급 규칙을 지킨다(41-13). 옛 kis_tokens(20260514120000 에서 DROP)와 이름을 일부러 다르게 둔다.
--   ② kis_news_lease_acquire / kis_news_lease_release — 수집기 실행 하나만 돌게 하는 임대(kis_news_state 1행).
--   ③ kis_news_targets_list — 종목별 수집 대상 목록(jsonb 배열 1값).
--   ④ kis_news_stock_meta — 종목 마스터 {코드: {n: 이름, g: 증권그룹}} (jsonb 객체 1값).
--   ⑤ kis_news_cleanup — 90일 보관 정리 + 하루 넘게 조회도 수집도 없는 등록 행 정리 + 그날(KST) 정리 표시.
--   ⑥ kis_disclosure_kinds — 최근 공시 제목을 회사명을 걷은 종류별로 묶은 표(D-10 사용자 확인용 · scripts/kis-news-report.sh kinds).
--   ⑦ kis_news_ops_stats — 운영 수치(SC-1 · SC-4 · scripts/kis-news-report.sh stats).
--
-- 결정(41-CONTEXT · 41-RESEARCH):
--   D-01 장중 내내 떠 있는 수집 = Cloud Run Job 장기 실행 + 5분 깨움. Scheduler 발화마다 새 실행이 생기므로 DB 임대 없이는
--        중복 수집 · 토큰 중복 발급(알림톡 폭탄)이 난다 → ② (TTL 90초 · 30초마다 연장 · 죽으면 다음 깨움이 넘겨받음).
--   D-02 빠른 창 `07:00` ~ `20:00` KST — ⑦ 의 지연 수치는 이 창(평일)에 작성된 글만으로 잰다(밤 글은 다음 느린 실행이
--        모으므로 지연이 원래 길다).
--   D-05 대상 = 최신 급등 상위(top_movers 순위 ≤ p_top) ∪ 관심종목 ∪ 최근 조회로 등록된 종목(최근 순 상한).
--   D-06 한 번도 모으지 않은 종목(last_collected_at NULL)이 맨 앞 → 새 등록 종목의 첫 수집이 빠르다.
--   D-10 공시 종류 목록은 사용자 확인용 — 경계가 애매한 종류는 임의로 빼지 않고 이 표로 묻는다.
--
-- 설계 메모:
--   - ③ ④ 는 jsonb 단일 값이라 PostgREST db-max-rows(1000) 에 잘리지 않고 왕복 1회다(종목 마스터 ≈ 4,000행).
--   - ③ 의 「최신 scan」 은 ranked_at 이 가장 늦은 행의 scan_id — intraday-sync 가 매 주기 표를 통째로 다시 쓰므로
--     보통 scan 은 하나지만, uuid 는 시간순이 아니라 scan_id 정렬로는 「최신」 을 고를 수 없다.
--   - ③ 의 등록 상한은 종목 마스터에 있는 코드만 센다 — 마스터 밖 코드(오타 · 상폐)가 상한 자리를 먹지 않게.
--   - ⑤ 의 등록 행 정리는 「조회도 수집도」 하루 넘게 없을 때만 — 급등 · 관심으로 계속 수집 중인 종목의 행을 지우면
--     응답 collectedAt 이 다음 수집 때까지 null(「수집 전」)로 잘못 보인다.
--   - api_usage service 키 `kis_news_title` · `kis_news_title_quota_strike` 는 CHECK 없는 자유 text 라 이 파일이
--     따로 만들지 않는다(news-sync apiUsage.ts 선례). ⑦ 이 읽기만 한다.
--
-- 권한: 표는 서비스롤 전용(RLS 활성 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT).
--   7개 함수 모두 SECURITY INVOKER · search_path 고정 · 함수 권한 3줄(플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을
--   덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 41-09 `supabase db push`(20261112100000_kis_news_feed.sql 다음).
-- 되돌리기(이 순서): DROP FUNCTION public.kis_news_ops_stats(integer); DROP FUNCTION public.kis_disclosure_kinds(integer);
--   DROP FUNCTION public.kis_news_cleanup(integer, integer); DROP FUNCTION public.kis_news_stock_meta();
--   DROP FUNCTION public.kis_news_targets_list(integer, integer, integer); DROP FUNCTION public.kis_news_lease_release(text);
--   DROP FUNCTION public.kis_news_lease_acquire(text, integer); DROP TABLE public.kis_access_tokens;
-- ============================================================

BEGIN;

-- ── ① 한투 접근 토큰 ──────────────────────────────────────────────
CREATE TABLE public.kis_access_tokens (
  token_type   text        PRIMARY KEY,                                    -- 'live'
  access_token text        NOT NULL,
  expires_at   timestamptz NOT NULL,                                       -- 응답 access_token_token_expired(KST)
  fetched_at   timestamptz NOT NULL DEFAULT now()                          -- 발급 시각(1분 1회 규칙 판정)
);

ALTER TABLE public.kis_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kis_access_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_access_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_access_tokens TO service_role;

-- ── ② 임대 ────────────────────────────────────────────────────────
-- 비어 있거나 · 만료됐거나 · 내 것이면 잡고(연장 포함) true, 남의 살아 있는 임대면 false.
CREATE OR REPLACE FUNCTION public.kis_news_lease_acquire(p_holder text, p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF p_holder IS NULL OR btrim(p_holder) = '' THEN
    RAISE EXCEPTION 'kis_news_lease_acquire: p_holder 가 비었다' USING ERRCODE = '22023';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'kis_news_lease_acquire: p_ttl_seconds 는 1 이상이어야 한다(받은 값 %)', p_ttl_seconds
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.kis_news_state
     SET lease_holder = p_holder,
         lease_until  = now() + make_interval(secs => p_ttl_seconds)
   WHERE id = 1
     AND (lease_holder IS NULL OR lease_until IS NULL OR lease_until < now() OR lease_holder = p_holder)
  RETURNING true INTO v_ok;

  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.kis_news_lease_acquire(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_lease_acquire(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_lease_acquire(text, integer) TO service_role;

COMMENT ON FUNCTION public.kis_news_lease_acquire(text, integer) IS
  'Phase 41 D-01 — 수집기 임대. 비었거나 만료됐거나 내 것이면 잡고(연장) true, 남의 살아 있는 임대면 false.';

-- 주인일 때만 푼다.
CREATE OR REPLACE FUNCTION public.kis_news_lease_release(p_holder text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  UPDATE public.kis_news_state
     SET lease_holder = NULL,
         lease_until  = NULL
   WHERE id = 1
     AND lease_holder = p_holder
  RETURNING true INTO v_ok;

  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.kis_news_lease_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_lease_release(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_lease_release(text) TO service_role;

COMMENT ON FUNCTION public.kis_news_lease_release(text) IS
  'Phase 41 D-01 — 수집기 임대 해제. 주인일 때만 lease_holder · lease_until 을 NULL 로 하고 true.';

-- ── ③ 대상 목록 ───────────────────────────────────────────────────
-- 반환: [{code, reasons: ['mover'|'watch'|'registered'…], rank, last_requested_at, last_collected_at}]
-- 정렬: 한 번도 모으지 않은 종목 → 오래 전에 모은 종목 · 같으면 최근 등록 · 급등 순위 · 코드.
CREATE OR REPLACE FUNCTION public.kis_news_targets_list(
  p_top            integer DEFAULT 100,
  p_idle_minutes   integer DEFAULT 10,
  p_registered_cap integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT tm.scan_id
      FROM public.top_movers tm
     WHERE tm.scan_id IS NOT NULL
     ORDER BY tm.ranked_at DESC
     LIMIT 1
  ),
  src AS (
    SELECT tm.code, 'mover'::text AS reason, 1 AS ord, tm.rank
      FROM public.top_movers tm
      JOIN latest l ON l.scan_id = tm.scan_id
     WHERE tm.rank IS NOT NULL AND tm.rank <= p_top
    UNION ALL
    SELECT DISTINCT w.stock_code, 'watch', 2, NULL::integer
      FROM public.watchlists w
    UNION ALL
    SELECT r.stock_code, 'registered', 3, NULL::integer
      FROM (
        SELECT t.stock_code
          FROM public.kis_news_targets t
          JOIN public.stocks s ON s.code = t.stock_code
         WHERE t.last_requested_at > now() - make_interval(mins => p_idle_minutes)
         ORDER BY t.last_requested_at DESC, t.stock_code
         LIMIT greatest(p_registered_cap, 0)
      ) r
  ),
  -- (code, reason) 은 src 안에서 이미 한 번씩이다(급등 code PK · 관심 DISTINCT · 등록 PK).
  agg AS (
    SELECT src.code,
           jsonb_agg(src.reason ORDER BY src.ord) AS reasons,
           min(src.rank) AS rank
      FROM src
      JOIN public.stocks s ON s.code = src.code
     GROUP BY src.code
  )
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'code',              a.code,
               'reasons',           a.reasons,
               'rank',              a.rank,
               'last_requested_at', t.last_requested_at,
               'last_collected_at', t.last_collected_at)
             ORDER BY t.last_collected_at ASC NULLS FIRST,
                      t.last_requested_at DESC NULLS LAST,
                      a.rank ASC NULLS LAST,
                      a.code),
           '[]'::jsonb)
    FROM agg a
    LEFT JOIN public.kis_news_targets t ON t.stock_code = a.code
$$;

REVOKE ALL ON FUNCTION public.kis_news_targets_list(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_targets_list(integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_targets_list(integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.kis_news_targets_list(integer, integer, integer) IS
  'Phase 41 D-05 · D-06 — 수집 대상 = 최신 급등(순위 ≤ p_top) ∪ 관심종목 ∪ 최근 p_idle_minutes 등록(최근 순 p_registered_cap). '
  '종목 마스터에 있는 코드만 · 한 번도 모으지 않은 종목이 앞.';

-- ── ④ 종목 정보 ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kis_news_stock_meta()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_object_agg(s.code, jsonb_build_object('n', s.name, 'g', s.security_group)), '{}'::jsonb)
    FROM public.stocks s
$$;

REVOKE ALL ON FUNCTION public.kis_news_stock_meta() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_stock_meta() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_stock_meta() TO service_role;

COMMENT ON FUNCTION public.kis_news_stock_meta() IS
  'Phase 41 — 종목 마스터 {code: {n: name, g: security_group}} 단일 jsonb(1000행 절단 없음 · 왕복 1회).';

-- ── ⑤ 정리 ────────────────────────────────────────────────────────
-- 반환: {"news_deleted": n, "targets_deleted": n}
CREATE OR REPLACE FUNCTION public.kis_news_cleanup(
  p_days             integer DEFAULT 90,
  p_target_idle_days integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_news    integer;
  v_targets integer;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_target_idle_days IS NULL OR p_target_idle_days < 1 THEN
    RAISE EXCEPTION 'kis_news_cleanup: p_days · p_target_idle_days 는 1 이상이어야 한다' USING ERRCODE = '22023';
  END IF;

  -- 연결(kis_news_stocks)은 FK ON DELETE CASCADE 로 같이 지워진다.
  DELETE FROM public.kis_news
   WHERE written_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_news = ROW_COUNT;

  -- 조회(등록)도 수집도 하루 넘게 없는 행만 — 계속 수집 중인 종목의 collectedAt 을 지우지 않는다.
  DELETE FROM public.kis_news_targets
   WHERE coalesce(greatest(last_requested_at, last_collected_at), 'epoch'::timestamptz)
         < now() - make_interval(days => p_target_idle_days);
  GET DIAGNOSTICS v_targets = ROW_COUNT;

  UPDATE public.kis_news_state
     SET cleanup_date = (now() AT TIME ZONE 'Asia/Seoul')::date
   WHERE id = 1;

  RETURN jsonb_build_object('news_deleted', v_news, 'targets_deleted', v_targets);
END;
$$;

REVOKE ALL ON FUNCTION public.kis_news_cleanup(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_cleanup(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_cleanup(integer, integer) TO service_role;

COMMENT ON FUNCTION public.kis_news_cleanup(integer, integer) IS
  'Phase 41 SC-1 — p_days 지난 글(연결 cascade) · p_target_idle_days 동안 조회도 수집도 없는 등록 행 삭제 + cleanup_date = KST 오늘.';

-- ── ⑥ 공시 종류 ───────────────────────────────────────────────────
-- 글마다 종류 이름 = 제목에서 (가) 앞의 「(정정)」 을 떼고(corrected) (나) 연결 종목 이름이 제목에 있으면 그 이름 뒤 문자열
-- (앞의 「(주)」 · 「주식회사」 · 공백 제거 — 이름이 여럿 맞으면 가장 긴 이름), 없으면 앞의 「(주)」 · 「주식회사」 와 첫 낱말을 걷은 문자열.
-- (provider_code, 종류 이름, 숨김 사유) 로 묶는다 — 숨김 사유는 연결 중 NULL 아닌 값 하나(없으면 NULL).
-- 반환: [{provider_code, kind_label, hidden_reason, count, corrected_count, example_title, latest_at}] 건수 내림차순.
CREATE OR REPLACE FUNCTION public.kis_disclosure_kinds(p_days integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    SELECT n.srno,
           n.provider_code,
           n.title,
           n.written_at,
           n.title ~ '^\s*[\(\[]정정[\)\]]' AS corrected,
           regexp_replace(n.title, '^\s*[\(\[]정정[\)\]]\s*', '') AS t,
           (SELECT max(ks.hidden_reason) FROM public.kis_news_stocks ks WHERE ks.srno = n.srno) AS hidden_reason
      FROM public.kis_news n
     WHERE n.kind = 'disclosure'
       AND n.written_at >= now() - make_interval(days => p_days)
  ),
  named AS (
    SELECT d.*,
           (SELECT s.name
              FROM public.kis_news_stocks ks
              JOIN public.stocks s ON s.code = ks.stock_code
             WHERE ks.srno = d.srno
               AND s.name <> ''
               AND strpos(d.t, s.name) > 0
             ORDER BY length(s.name) DESC, ks.stock_code
             LIMIT 1) AS nm
      FROM d
  ),
  labeled AS (
    SELECT named.*,
           coalesce(
             nullif(btrim(
               CASE
                 WHEN nm IS NOT NULL THEN
                   regexp_replace(substr(t, strpos(t, nm) + length(nm)), '^\s*((\(주\)|주식회사)\s*)*', '')
                 ELSE
                   regexp_replace(regexp_replace(t, '^\s*((\(주\)|주식회사)\s*)*', ''), '^\S+\s*', '')
               END), ''),
             t) AS kind_label
      FROM named
  ),
  grouped AS (
    SELECT provider_code,
           kind_label,
           hidden_reason,
           count(*)::integer                              AS cnt,
           count(*) FILTER (WHERE corrected)::integer     AS corrected_cnt,
           (array_agg(title ORDER BY written_at DESC, srno DESC))[1] AS example_title,
           max(written_at)                                AS latest_at
      FROM labeled
     GROUP BY provider_code, kind_label, hidden_reason
  )
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'provider_code',   g.provider_code,
               'kind_label',      g.kind_label,
               'hidden_reason',   g.hidden_reason,
               'count',           g.cnt,
               'corrected_count', g.corrected_cnt,
               'example_title',   g.example_title,
               'latest_at',       g.latest_at)
             ORDER BY g.cnt DESC, g.provider_code, g.kind_label, g.hidden_reason NULLS FIRST),
           '[]'::jsonb)
    FROM grouped g
$$;

REVOKE ALL ON FUNCTION public.kis_disclosure_kinds(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_disclosure_kinds(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_disclosure_kinds(integer) TO service_role;

COMMENT ON FUNCTION public.kis_disclosure_kinds(integer) IS
  'Phase 41 D-10 · SC-7 — 최근 p_days 공시를 회사명을 걷은 종류별로 묶은 건수 · 정정 수 · 숨김 사유 · 예시 제목(사용자 확인용).';

-- ── ⑦ 운영 수치 ───────────────────────────────────────────────────
-- 반환: {days, rows_total, by_kind: {news, disclosure}, by_via: {feed, stock}(글 수),
--        lag_seconds: {disclosure_p50, disclosure_p90, news_p50}(받은 시각 − 작성 시각 ≥ 0 · KST 평일 07:00 ~ 20:00 작성분),
--        feed_at, targets_active(최근 10분 등록 수), usage_today, strikes_today(api_usage KST 오늘)}
CREATE OR REPLACE FUNCTION public.kis_news_ops_stats(p_days integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH w AS (
    SELECT n.srno, n.kind, n.written_at, n.received_at
      FROM public.kis_news n
     WHERE n.written_at >= now() - make_interval(days => p_days)
  ),
  lag AS (
    SELECT w.kind, extract(epoch FROM (w.received_at - w.written_at))::double precision AS sec
      FROM w
     WHERE w.received_at >= w.written_at
       AND extract(isodow FROM (w.written_at AT TIME ZONE 'Asia/Seoul')) BETWEEN 1 AND 5
       AND (w.written_at AT TIME ZONE 'Asia/Seoul')::time >= time '07:00'
       AND (w.written_at AT TIME ZONE 'Asia/Seoul')::time <  time '20:00'
  ),
  today AS (
    SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d
  )
  SELECT jsonb_build_object(
    'days',       p_days,
    'rows_total', (SELECT count(*) FROM w),
    'by_kind',    jsonb_build_object(
                    'news',       (SELECT count(*) FROM w WHERE w.kind = 'news'),
                    'disclosure', (SELECT count(*) FROM w WHERE w.kind = 'disclosure')),
    'by_via',     jsonb_build_object(
                    'feed',  (SELECT count(DISTINCT ks.srno) FROM public.kis_news_stocks ks JOIN w ON w.srno = ks.srno
                               WHERE ks.via = 'feed'),
                    'stock', (SELECT count(DISTINCT ks.srno) FROM public.kis_news_stocks ks JOIN w ON w.srno = ks.srno
                               WHERE ks.via = 'stock')),
    'lag_seconds', jsonb_build_object(
                    'disclosure_p50', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sec)::numeric, 1)
                                         FROM lag WHERE kind = 'disclosure'),
                    'disclosure_p90', (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY sec)::numeric, 1)
                                         FROM lag WHERE kind = 'disclosure'),
                    'news_p50',       (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY sec)::numeric, 1)
                                         FROM lag WHERE kind = 'news')),
    'feed_at',        (SELECT st.feed_at FROM public.kis_news_state st WHERE st.id = 1),
    'targets_active', (SELECT count(*) FROM public.kis_news_targets t
                        WHERE t.last_requested_at > now() - interval '10 minutes'),
    'usage_today',    coalesce((SELECT u.count FROM public.api_usage u, today
                                 WHERE u.service = 'kis_news_title' AND u.usage_date = today.d), 0),
    'strikes_today',  coalesce((SELECT u.count FROM public.api_usage u, today
                                 WHERE u.service = 'kis_news_title_quota_strike' AND u.usage_date = today.d), 0)
  )
$$;

REVOKE ALL ON FUNCTION public.kis_news_ops_stats(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_ops_stats(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_ops_stats(integer) TO service_role;

COMMENT ON FUNCTION public.kis_news_ops_stats(integer) IS
  'Phase 41 SC-1 · SC-4 — 최근 p_days 글 수 · 종류별 · 경로별 · 수신 지연 p50/p90(KST 평일 07:00 ~ 20:00 작성분) · '
  'feed_at · 활성 등록 · 오늘 한투 호출 수 · 한도 의심 표시 수.';

COMMIT;
