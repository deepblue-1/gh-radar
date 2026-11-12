-- ============================================================
-- Phase 43 Plan 01 — 공시 알림(공개매수 · 유상증자 · 합병 → 텔레그램 단체방) 받침: 표 2 + 임대 · 넣기 · 송신 차례 · 결과 기록 RPC.
--
-- 무엇:
--   ① public.dart_alerts — OpenDART 공시 한 건 = 한 행(PK 접수번호 rcept_no). 알림 문구에 필요한 목록 정보만
--      싣고(보고서명 · 회사명 · 종목코드 · 제출인 · 시장) 공시 본문은 싣지 않는다(D-06). 송신 상태 기계:
--        pending ─ 차례 ─► sending ─ 성공 ─► sent      (실패 → pending + 다음 시도 시각)
--        seed 모드 ─► seeded(보내지 않음)            지난 날짜 pending/sending ─► expired(43-02)
--   ② public.dart_alert_state — 1행(id = 1). 수집기 임대 · 감시 대상별 마지막 성공 시각(last_ok) · 장애 칸(43-02 가 쓴다).
--   ③ dart_alert_lease_acquire / dart_alert_lease_release — 수집기 실행 하나만 돌게 하는 임대(kis_news 꼴 + last_ok 병합 ·
--      fresh). 새로 잡으면(43-02) 오늘 sending → pending(reclaimed) · 지난 날 pending/sending → expired(expired).
--   ④ dart_alert_insert — 판정을 통과한 행을 한 번에 넣고 **새로 들어간 행만** 돌려준다(ON CONFLICT DO NOTHING).
--   ⑤ dart_alert_claim — 오늘 · pending · 다음 시도 시각이 된 행을 우선순위 순으로 sending 으로 바꿔 돌려준다.
--   ⑥ dart_alert_mark — 내가 잡은 sending 행에 송신 결과를 적는다.
--
-- 결정(43-CONTEXT · 43-RESEARCH):
--   D-01 공개매수(D004) 보고서는 이름으로 거르지 않는다 — 워커가 판정하고 이 표는 watch 이름만 싣는다(CHECK 없음:
--        감시 대상을 더해도 마이그레이션이 필요 없다).
--   D-02 묶지 않고 바로 보낸다 — 넣기 → 차례 → 기록을 같은 바퀴 안에서 부른다.
--   SC-2 한 번만 — rcept_no 가 PK 라 같은 접수번호는 한 행뿐이고, 넣기가 새 행만 돌려주므로 재조회 · 재시작에도
--        다시 보내지 않는다.
--   SC-5 이어서 보냄 — 실패는 pending 으로 되돌려 다음 시도 시각에 다시 차례가 온다(같은 날 안에서는 포기하지 않음).
--   SC-5 최소 1회 전달(43-02) — sending 으로 남은 행이 조용히 사라지는 길을 둘 다 닫는다:
--        (가) 실행이 죽음 → 새로 임대를 잡은 실행이 오늘 sending 을 pending 으로 되돌린다(last_error
--             'reclaimed_after_takeover' · 반환 reclaimed). 같은 보유자의 연장은 되돌리지 않는다.
--        (나) 같은 임대 안에서 mark 실패 · 던짐 · claim 응답 끊김 → 차례가 sending 으로 줄 때 송신 기한
--             next_attempt_at = now() + 90초를 찍고, 기한이 지난 내 sending 을 다음 차례에 다시 준다(last_error
--             'reclaimed_stale_claim' · 반환 stale true). 90초 근거: 한 차례 최대 5건 × (텔레그램 제한 시간 10초 —
--             43-01 createTelegramHttp + 송신 간격 1초) + RPC 왕복 < 90초 — 정상 송신 중인 행을 다시 집지 않는다.
--        대가: 텔레그램 200 뒤 sent 기록 전에 죽거나 mark 가 실패하면 같은 글이 두 번 갈 수 있다(드묾 · 유실보다 쌈 ·
--        RESEARCH Pattern 4). 수집기는 reclaimed > 0 이면 warn `possible duplicate after takeover`, stale 이면 warn
--        `possible duplicate after stale claim` 을 남긴다(43-05 · 43-06).
--   D-12 지난 날 닫기(43-02) — 새로 임대를 잡을 때 접수일(KST)이 오늘보다 앞인 pending · sending 은 보내지 않고 expired 로
--        닫는다. 며칠 죽었다 살아나도 옛 공시가 쏟아지지 않는다(sent · seeded 는 그대로).
--   임대 보유자 확인: 넣기 · 차례 · 기록은 dart_alert_state 의 lease_holder = p_holder AND lease_until > now() 가 아니면
--        ERRCODE 55000(object_not_in_prerequisite_state) — 워커 어댑터(43-02 src/db.ts)가 「임대 잃음」(LeaseLostError)으로 읽는다.
--   「오늘」 = (now() AT TIME ZONE 'Asia/Seoul')::date.
--
-- 보관 방침(리서치 미결 3): 정리(삭제) 작업 없이 보관한다. 알림 대상은 하루 수 건 · 1년 약 2,000 ~ 3,000행이라
--   용량 부담이 없고, D-09 후속(웹앱에 지난 공시 알림 표시)이 이 표를 그대로 쓸 수 있다. 지우는 RPC · 정리 Job 을
--   만들지 않는다. 싣는 칸은 목록 정보 · 송신 기록뿐이라 원본 DB 덤프가 아니다.
--
-- 권한: 두 표 모두 서비스롤 전용(RLS 활성 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT).
--   다섯 함수 모두 SECURITY INVOKER · search_path 고정 · 함수 권한 3줄(플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을
--   덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 43-08 `supabase db push`.
-- 되돌리기(이 순서): DROP FUNCTION public.dart_alert_mark(text, text, boolean, bigint, text, integer);
--   DROP FUNCTION public.dart_alert_claim(text, integer); DROP FUNCTION public.dart_alert_insert(text, jsonb, boolean);
--   DROP FUNCTION public.dart_alert_lease_release(text); DROP FUNCTION public.dart_alert_lease_acquire(text, integer, jsonb);
--   DROP TABLE public.dart_alert_state; DROP TABLE public.dart_alerts;
-- ============================================================

BEGIN;

-- ── ① 공시 알림 ───────────────────────────────────────────────────
CREATE TABLE public.dart_alerts (
  rcept_no            text        PRIMARY KEY CHECK (rcept_no ~ '^[0-9]{14}$'),     -- 접수번호
  watch               text        NOT NULL,                                          -- 감시 대상 id(tender_offer · rights_merger …)
  priority            smallint    NOT NULL DEFAULT 1,                                -- 송신 우선순위(작을수록 먼저 · 공개매수 0)
  rcept_dt            date        NOT NULL,                                          -- 접수일(KST)
  corp_cls            text        NOT NULL,                                          -- Y 유가 · K 코스닥
  corp_name           text        NOT NULL,
  stock_code          text        NOT NULL,
  report_nm           text        NOT NULL,                                          -- DART 표기 그대로
  flr_nm              text        NOT NULL,                                          -- 제출인
  late                boolean     NOT NULL DEFAULT false,                            -- 「(늦은 알림)」 판정(D-12)
  status              text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sending', 'sent', 'seeded', 'expired')),
  attempts            integer     NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_error          text        CHECK (length(last_error) <= 300),                 -- 실패 사유 한 줄(토큰 · URL 없음)
  claimed_by          text,                                                          -- 차례를 잡은 임대 보유자
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  telegram_message_id bigint
);

CREATE INDEX dart_alerts_day_status_next_idx ON public.dart_alerts (rcept_dt, status, next_attempt_at);

ALTER TABLE public.dart_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dart_alerts FROM PUBLIC;
REVOKE ALL ON TABLE public.dart_alerts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dart_alerts TO service_role;

COMMENT ON TABLE public.dart_alerts IS
  'Phase 43 — 공시 알림 한 건 = 한 행(PK 접수번호 · SC-2 한 번만). 목록 정보 · 송신 기록만. 정리 없이 보관(1년 약 2,000 ~ 3,000행).';

-- ── ② 상태 1행 ────────────────────────────────────────────────────
CREATE TABLE public.dart_alert_state (
  id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lease_holder  text,
  lease_until   timestamptz,
  last_ok       jsonb       NOT NULL DEFAULT '{}'::jsonb,                            -- {"tender_offer": "…Z", …}
  outage_since  timestamptz,                                                         -- NULL = 장애 아님(43-02)
  outage_reason text        CHECK (length(outage_reason) <= 300),
  outage_notice text        CHECK (outage_notice IN ('pending', 'sent', 'failed'))   -- 「멈췄습니다」 송신 상태(43-02)
);

INSERT INTO public.dart_alert_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dart_alert_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dart_alert_state FROM PUBLIC;
REVOKE ALL ON TABLE public.dart_alert_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dart_alert_state TO service_role;

COMMENT ON TABLE public.dart_alert_state IS
  'Phase 43 — 공시 알림 수집기 상태 1행: 임대 · 감시 대상별 마지막 성공 시각 · 장애 칸.';

-- ── ③ 임대 ────────────────────────────────────────────────────────
-- 비어 있거나 · 만료됐거나 · 내 것이면 잡고(연장 포함) held true, 남의 살아 있는 임대면 held false.
-- fresh = 잡았고 직전 보유자가 나와 다름(빈 임대 · 남의 만료 임대를 넘겨받음). 내 임대이고 p_last_ok 가 있으면 병합.
-- (43-02) fresh 일 때만: 오늘 sending → pending(reclaimed 수) · 지난 날 pending/sending → expired(expired 수).
CREATE OR REPLACE FUNCTION public.dart_alert_lease_acquire(p_holder text, p_ttl_seconds integer, p_last_ok jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev      text;
  v_held      boolean := false;
  v_fresh     boolean;
  v_reclaimed integer := 0;
  v_expired   integer := 0;
  v_today     date    := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_holder IS NULL OR btrim(p_holder) = '' THEN
    RAISE EXCEPTION 'dart_alert_lease_acquire: p_holder 가 비었다' USING ERRCODE = '22023';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'dart_alert_lease_acquire: p_ttl_seconds 는 1 이상이어야 한다(받은 값 %)', p_ttl_seconds
      USING ERRCODE = '22023';
  END IF;
  IF p_last_ok IS NOT NULL AND jsonb_typeof(p_last_ok) <> 'object' THEN
    RAISE EXCEPTION 'dart_alert_lease_acquire: p_last_ok 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  -- 직전 보유자를 행 잠금으로 읽는다 — 두 실행이 동시에 들어와도 판정 · 갱신 사이에 다른 실행이 끼지 못한다
  SELECT lease_holder INTO v_prev FROM public.dart_alert_state WHERE id = 1 FOR UPDATE;

  UPDATE public.dart_alert_state
     SET lease_holder = p_holder,
         lease_until  = now() + make_interval(secs => p_ttl_seconds),
         last_ok      = CASE WHEN p_last_ok IS NULL THEN last_ok ELSE last_ok || p_last_ok END
   WHERE id = 1
     AND (lease_holder IS NULL OR lease_until IS NULL OR lease_until < now() OR lease_holder = p_holder)
  RETURNING true INTO v_held;

  v_held  := coalesce(v_held, false);
  v_fresh := v_held AND v_prev IS DISTINCT FROM p_holder;

  -- (43-02) 새로 잡은 실행만 — 연장 · 거절은 아무 행도 바꾸지 않는다. 상태 행을 FOR UPDATE 로 쥐고 있으므로
  -- 넣기 · 차례 · 기록(FOR SHARE)이 되돌림 중간에 끼지 못한다.
  IF v_fresh THEN
    -- 유실 창 닫기(SC-5): 죽은(또는 임대를 놓친) 실행이 sending 으로 남긴 오늘 행을 다시 차례로 — 최소 1회
    UPDATE public.dart_alerts
       SET status          = 'pending',
           claimed_by      = NULL,
           last_error      = 'reclaimed_after_takeover',
           next_attempt_at = now()
     WHERE rcept_dt = v_today
       AND status = 'sending';
    GET DIAGNOSTICS v_reclaimed = ROW_COUNT;

    -- D-12 지난 날 닫기: 며칠 죽었다 살아나도 옛 공시를 쏟아내지 않는다(sent · seeded 는 그대로)
    UPDATE public.dart_alerts
       SET status = 'expired'
     WHERE rcept_dt < v_today
       AND status IN ('pending', 'sending');
    GET DIAGNOSTICS v_expired = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'held', v_held,
    'fresh', v_fresh,
    'reclaimed', v_reclaimed,
    'expired', v_expired);
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_lease_acquire(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_lease_acquire(text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_lease_acquire(text, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.dart_alert_lease_acquire(text, integer, jsonb) IS
  'Phase 43 — 수집기 임대. 비었거나 만료됐거나 내 것이면 잡고(연장 · p_last_ok 병합) {held, fresh, reclaimed, expired}. '
  '새로 잡으면 오늘 sending → pending(reclaimed_after_takeover) · 지난 날 pending/sending → expired.';

-- 주인일 때만 푼다(last_ok · 장애 칸은 그대로).
CREATE OR REPLACE FUNCTION public.dart_alert_lease_release(p_holder text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  UPDATE public.dart_alert_state
     SET lease_holder = NULL,
         lease_until  = NULL
   WHERE id = 1
     AND lease_holder = p_holder
  RETURNING true INTO v_ok;

  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_lease_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_lease_release(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_lease_release(text) TO service_role;

COMMENT ON FUNCTION public.dart_alert_lease_release(text) IS
  'Phase 43 — 수집기 임대 해제. 주인일 때만 lease_holder · lease_until 을 NULL 로 하고 true.';

-- ── ④ 넣기(한 번만) ───────────────────────────────────────────────
-- p_items: [{rcept_no, watch, priority, rcept_dt(YYYY-MM-DD), corp_cls, corp_name, stock_code, report_nm, flr_nm, late}]
-- 반환: 새로 들어간 행만 [{rcept_no, late}] (rcept_no 순 · 없으면 []). p_seed 면 seeded 로 넣어 보내지 않는다.
CREATE OR REPLACE FUNCTION public.dart_alert_insert(p_holder text, p_items jsonb, p_seed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM 1 FROM public.dart_alert_state
   WHERE id = 1 AND lease_holder = p_holder AND lease_until > now()
     FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dart_alert_insert: 임대 보유자가 아니다' USING ERRCODE = '55000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'dart_alert_insert: p_items 는 jsonb 배열이어야 한다' USING ERRCODE = '22023';
  END IF;

  WITH ins AS (
    INSERT INTO public.dart_alerts (rcept_no, watch, priority, rcept_dt, corp_cls, corp_name, stock_code,
                                    report_nm, flr_nm, late, status)
    SELECT e->>'rcept_no',
           e->>'watch',
           coalesce((e->>'priority')::smallint, 1),
           (e->>'rcept_dt')::date,
           e->>'corp_cls',
           e->>'corp_name',
           e->>'stock_code',
           e->>'report_nm',
           coalesce(e->>'flr_nm', ''),
           coalesce((e->>'late')::boolean, false),
           CASE WHEN coalesce(p_seed, false) THEN 'seeded' ELSE 'pending' END
      FROM jsonb_array_elements(p_items) AS e
    ON CONFLICT (rcept_no) DO NOTHING
    RETURNING rcept_no, late
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('rcept_no', rcept_no, 'late', late) ORDER BY rcept_no), '[]'::jsonb)
    INTO v_out
    FROM ins;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_insert(text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_insert(text, jsonb, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_insert(text, jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.dart_alert_insert(text, jsonb, boolean) IS
  'Phase 43 SC-2 — 공시 알림 넣기(ON CONFLICT DO NOTHING). 새로 들어간 행만 [{rcept_no, late}]. 임대 보유자 아니면 55000.';

-- ── ⑤ 송신 차례 ───────────────────────────────────────────────────
-- 오늘 · pending · next_attempt_at <= now() 를 priority → first_seen_at → rcept_no 순으로 p_limit 개 잡아
-- sending · claimed_by · attempts + 1 로 바꾸고 돌려준다.
-- (43-02 · 체커 W2) sending 동안 next_attempt_at 은 「송신 기한」 = 잡은 시각 + 90초. 내가 잡았는데 기한이 지나도록
-- 결과(dart_alert_mark)가 적히지 않은 오늘 sending 행(mark 실패 · 던짐 · claim 응답 끊김)도 같은 순서로 함께 다시 준다
-- — last_error 'reclaimed_stale_claim' · attempts + 1 · 반환 stale true(처음 주는 행은 false). 남이 잡은 sending 은
-- 고르지 않는다(인계 되돌림 몫).
CREATE OR REPLACE FUNCTION public.dart_alert_claim(p_holder text, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM 1 FROM public.dart_alert_state
   WHERE id = 1 AND lease_holder = p_holder AND lease_until > now()
     FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dart_alert_claim: 임대 보유자가 아니다' USING ERRCODE = '55000';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'dart_alert_claim: p_limit 은 1 이상이어야 한다(받은 값 %)', p_limit USING ERRCODE = '22023';
  END IF;

  WITH picked AS (
    SELECT d.rcept_no, (d.status = 'sending') AS was_sending
      FROM public.dart_alerts d
     WHERE d.rcept_dt = (now() AT TIME ZONE 'Asia/Seoul')::date
       AND d.next_attempt_at <= now()
       AND (d.status = 'pending' OR (d.status = 'sending' AND d.claimed_by = p_holder))
     ORDER BY d.priority, d.first_seen_at, d.rcept_no
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.dart_alerts a
       SET status          = 'sending',
           claimed_by      = p_holder,
           attempts        = a.attempts + 1,
           next_attempt_at = now() + interval '90 seconds',
           last_error      = CASE WHEN picked.was_sending THEN 'reclaimed_stale_claim' ELSE a.last_error END
      FROM picked
     WHERE a.rcept_no = picked.rcept_no
    RETURNING a.rcept_no, a.watch, a.priority, a.corp_cls, a.corp_name, a.stock_code, a.report_nm, a.flr_nm,
              a.late, a.attempts, a.first_seen_at, picked.was_sending AS stale
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'rcept_no', rcept_no,
           'watch', watch,
           'corp_cls', corp_cls,
           'corp_name', corp_name,
           'stock_code', stock_code,
           'report_nm', report_nm,
           'flr_nm', flr_nm,
           'late', late,
           'attempts', attempts,
           'first_seen_at', first_seen_at,
           'stale', stale) ORDER BY priority, first_seen_at, rcept_no), '[]'::jsonb)
    INTO v_out
    FROM upd;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_claim(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_claim(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_claim(text, integer) TO service_role;

COMMENT ON FUNCTION public.dart_alert_claim(text, integer) IS
  'Phase 43 SC-5 — 송신 차례. 오늘 pending 중 다음 시도 시각이 된 행과 내가 잡고 송신 기한(90초)이 지난 sending 행을 '
  '우선순위 순으로 sending(기한 now + 90초)으로 바꿔 돌려준다(다시 준 행 stale true). 임대 보유자 아니면 55000.';

-- ── ⑥ 결과 기록 ───────────────────────────────────────────────────
-- status = 'sending' AND claimed_by = p_holder 인 행만. 성공 → sent · sent_at · message id · last_error NULL.
-- 실패 → pending · last_error 300자 자름 · next_attempt_at = now + 재시도 초(1 ~ 3600 으로 잘라 맞춤) · claimed_by NULL.
CREATE OR REPLACE FUNCTION public.dart_alert_mark(
  p_holder      text,
  p_rcept_no    text,
  p_ok          boolean,
  p_message_id  bigint,
  p_error       text,
  p_retry_in_s  integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  PERFORM 1 FROM public.dart_alert_state
   WHERE id = 1 AND lease_holder = p_holder AND lease_until > now()
     FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dart_alert_mark: 임대 보유자가 아니다' USING ERRCODE = '55000';
  END IF;
  IF p_ok IS NULL THEN
    RAISE EXCEPTION 'dart_alert_mark: p_ok 가 비었다' USING ERRCODE = '22023';
  END IF;

  IF p_ok THEN
    UPDATE public.dart_alerts
       SET status              = 'sent',
           sent_at             = now(),
           telegram_message_id = p_message_id,
           last_error          = NULL
     WHERE rcept_no = p_rcept_no
       AND status = 'sending'
       AND claimed_by = p_holder
    RETURNING true INTO v_ok;
  ELSE
    UPDATE public.dart_alerts
       SET status          = 'pending',
           last_error      = left(p_error, 300),
           next_attempt_at = now() + make_interval(secs => least(3600, greatest(1, coalesce(p_retry_in_s, 1)))),
           claimed_by      = NULL
     WHERE rcept_no = p_rcept_no
       AND status = 'sending'
       AND claimed_by = p_holder
    RETURNING true INTO v_ok;
  END IF;

  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_mark(text, text, boolean, bigint, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_mark(text, text, boolean, bigint, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_mark(text, text, boolean, bigint, text, integer) TO service_role;

COMMENT ON FUNCTION public.dart_alert_mark(text, text, boolean, bigint, text, integer) IS
  'Phase 43 SC-5 — 송신 결과 기록. 내가 잡은 sending 행만(성공 sent · 실패 pending + 다음 시도 시각). 임대 보유자 아니면 55000.';

COMMIT;
