-- ============================================================
-- Phase 40 리뷰 수정(40-REVIEW WR-07 · IN-05) — 푸시 기기 RPC 보강.
--
-- 무엇:
--   - RPC `dma_push_device_handover(p_user_id, p_token, p_device_key)` (WR-07) — 앱이 로그인한 뒤 이 폰의 토큰 · 기기 키를
--     가진 「지금 (사용자, 기기 키)」 밖의 행을 지운다. 반환 = 지운 행 수.
--
-- 왜:
--   - WR-07: 로그아웃 정리(DELETE)는 3초 상한 · 실패해도 로그아웃을 이어 가고, 세션 만료로 /login 에 튕기는 길에서는
--     아예 불리지 않는다. 그러면 앞 사용자의 enabled 행이 남아 같은 폰의 다음 사용자에게 앞 사람 체결이 계속 간다
--     (D-15 위반). 토큰 인계(`dma_push_device_upsert` 앞 DELETE)는 다음 사용자가 알림을 켤 때만 돈다.
--     → 앱이 로그인 직후(권한 granted 일 때 묻지 않고 받은 토큰으로) 이 RPC 를 불러 서버 쪽에서 닫는다.
--   - 지우는 조건 = 토큰이 같거나(같은 폰의 APNs/FCM 등록) 기기 키가 같은(같은 WebView localStorage) 행 중
--     「지금 사용자 ∧ 지금 기기 키」 가 아닌 것. 기기 키가 NULL 이면(로그아웃 정리 실패로 웹이 키를 버렸다) 같은 토큰의
--     내 옛 행도 지운다 — 성공한 로그아웃 DELETE 와 같은 결과다.
--   - 토큰 · 기기 키를 아는 것 자체가 그 폰을 가졌다는 뜻이다(토큰은 OS 가 그 앱에만 준다 · 기기 키는 그 WebView 의
--     localStorage UUID). 남의 토큰을 모르면 남의 행에 닿지 않는다 — `dma_push_device_upsert` 토큰 인계와 같은 신뢰 경계.
--
-- 잠금: SECURITY INVOKER · service_role 전용 EXECUTE(PUBLIC · anon · authenticated 명시 REVOKE — 메모리 「Supabase RPC 는
--   REVOKE anon/authenticated 명시」). 표 잠금(RLS · 정책 0)은 20261107100000 그대로.
--
-- 하지 않는 것: 표 · 기존 RPC 재정의. 원격 적용(메인 세션이 `supabase db push --linked --yes`).
--
-- 되돌리기(수동):
--   DROP FUNCTION IF EXISTS public.dma_push_device_handover(uuid, text, text);
-- ============================================================

BEGIN;

-- ── RPC: 로그인 뒤 이 폰의 남의 행 정리 (WR-07 · D-15) ──────────────
CREATE FUNCTION public.dma_push_device_handover(
  p_user_id    uuid,
  p_token      text,
  p_device_key text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'dma_push_device_handover: p_user_id 가 비었다' USING ERRCODE = '22004';
  END IF;
  IF coalesce(p_token, '') = '' THEN
    RAISE EXCEPTION 'dma_push_device_handover: p_token 이 비었다' USING ERRCODE = '22004';
  END IF;

  DELETE FROM public.dma_push_devices
   WHERE (token = p_token OR (p_device_key IS NOT NULL AND device_key = p_device_key))
     AND NOT (user_id = p_user_id AND device_key IS NOT DISTINCT FROM p_device_key);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_device_handover(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_device_handover(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_device_handover(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.dma_push_device_handover(uuid, text, text) IS
  'Phase 40 WR-07 — 로그인 뒤 이 폰(토큰 또는 기기 키 일치)의 「지금 사용자 ∧ 지금 기기 키」 밖 행 삭제. p_device_key NULL 이면 같은 토큰의 내 옛 행도. 반환 = 지운 행 수.';

NOTIFY pgrst, 'reload schema';

COMMIT;
