-- ============================================================
-- Phase 43 코드 리뷰 수정(part A) — 공시 알림 장애 시작 시각을 워커 기준점으로 맞춘다(리뷰 IN-01).
--
-- 무엇:
--   dart_alert_outage 에 p_since(timestamptz, 기본 NULL)를 더한다. open 이 장애를 새로 열 때 outage_since 를
--   now() 대신 워커가 넘긴 기준점(감시 대상의 마지막 성공 조회 · 없으면 07:02)으로 적는다.
--   왜: 「⚠ 멈췄습니다 — HH:MM 부터」 는 워커 메모리 기준점으로, DB outage_since 는 연 순간(now())으로 적혀 두 값이
--   5분 넘게 갈렸다. 같은 실행이 닫으면 「다시 동작」 의 「HH:MM ~ HH:MM」 이 기준점부터, 다른 실행이 이어받아 닫으면
--   DB 시각부터 계산돼 같은 장애의 시작 시각이 글마다 달랐다. 이제 DB 가 같은 기준점을 갖는다.
--   p_since 는 [now() − 1일, now()] 로 잘라 맞춘다(미래 · 터무니없는 과거 방지). NULL 이면 예전처럼 now().
--   그 밖 동작(다시 연 open 은 처음 시각 · 처음 사유 유지 · notice · close · 55000 · 22023)은 그대로다.
--
-- 같은 이름의 3인자 함수를 지우고 4인자로 다시 만든다 — 둘이 같이 있으면 PostgREST 가 이름 붙은 인자 3개 호출을
--   어느 쪽으로 보낼지 정하지 못한다(PGRST203). 한 트랜잭션이라 사이에 함수가 없는 순간이 밖에 보이지 않는다.
--   이미 배포된 워커(p_since 없이 3인자로 부름)도 새 함수에 그대로 맞는다(p_since 기본 NULL → 예전 동작).
--   새 워커는 p_since 를 보내므로 **이 마이그레이션을 먼저 원격에 적용한 뒤** 워커를 배포한다.
--
-- 권한: 이전과 같다 — SECURITY INVOKER · search_path 고정 · PUBLIC · anon · authenticated REVOKE · service_role GRANT
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 되돌리기: DROP FUNCTION public.dart_alert_outage(text, text, text, timestamptz); 뒤
--   20261113200000_dart_alert.sql 의 ⑦ 정의(3인자)와 권한 3줄 · COMMENT 를 다시 실행.
-- ============================================================

BEGIN;

DROP FUNCTION public.dart_alert_outage(text, text, text);

CREATE OR REPLACE FUNCTION public.dart_alert_outage(
  p_holder text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_since  timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_st    public.dart_alert_state%ROWTYPE;
  v_since timestamptz;
BEGIN
  -- 상태 행을 잠그고 판정한다 — 판정 · 갱신 사이에 다른 호출이 끼지 못한다
  SELECT * INTO v_st FROM public.dart_alert_state
   WHERE id = 1 AND lease_holder = p_holder AND lease_until > now()
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dart_alert_outage: 임대 보유자가 아니다' USING ERRCODE = '55000';
  END IF;

  IF p_action = 'open' THEN
    IF v_st.outage_since IS NULL THEN
      -- 워커 기준점(리뷰 IN-01) — [now() − 1일, now()] 로 잘라 맞춤 · NULL 이면 now()
      v_since := least(now(), greatest(coalesce(p_since, now()), now() - interval '1 day'));
      UPDATE public.dart_alert_state
         SET outage_since  = v_since,
             outage_reason = left(p_reason, 300),
             outage_notice = 'pending'
       WHERE id = 1;
      RETURN jsonb_build_object('opened', true, 'since', v_since);
    ELSIF v_st.outage_notice = 'pending' THEN
      RETURN jsonb_build_object('opened', true, 'since', v_st.outage_since);
    END IF;
    RETURN jsonb_build_object('opened', false);

  ELSIF p_action = 'notice' THEN
    IF p_reason IS NULL OR p_reason NOT IN ('sent', 'failed') THEN
      RAISE EXCEPTION 'dart_alert_outage: notice 값은 sent 또는 failed 여야 한다' USING ERRCODE = '22023';
    END IF;
    IF v_st.outage_since IS NOT NULL AND v_st.outage_notice = 'pending' THEN
      UPDATE public.dart_alert_state SET outage_notice = p_reason WHERE id = 1;
      RETURN jsonb_build_object('noticed', true);
    END IF;
    RETURN jsonb_build_object('noticed', false);

  ELSIF p_action = 'close' THEN
    IF v_st.outage_since IS NULL THEN
      RETURN jsonb_build_object('closed', false);
    END IF;
    UPDATE public.dart_alert_state
       SET outage_since  = NULL,
           outage_reason = NULL,
           outage_notice = NULL
     WHERE id = 1;
    RETURN jsonb_build_object('closed', true,
                              'notify', v_st.outage_notice IS NOT DISTINCT FROM 'sent',
                              'since', v_st.outage_since);
  END IF;

  RAISE EXCEPTION 'dart_alert_outage: 모르는 action(open · notice · close 만)' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.dart_alert_outage(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dart_alert_outage(text, text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dart_alert_outage(text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.dart_alert_outage(text, text, text, timestamptz) IS
  'Phase 43 D-16 · D-17 — 장애 짝 상태. open(닫혀 있을 때만 · since = p_since(워커 기준점 · [now − 1일, now]) 또는 now · '
  'notice pending 이면 다음 보유자에게 한 번 더) · notice(sent/failed 한 번) · close(「멈췄습니다」 가 sent 였을 때만 notify). '
  '임대 보유자 아니면 55000.';

COMMIT;
