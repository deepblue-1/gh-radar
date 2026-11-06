-- ============================================================
-- Phase 40 Plan 01 — 체결 앱 푸시 저장소 바닥: 기기 토큰 · 체인 상태 · 송신 로그 · 전달 결과 표 4개 + 기기 RPC.
--
-- 무엇:
--   - `dma_push_devices`     — 사용자 × 기기 1행(기기 키 = 웹 localStorage UUID · 40-10). 토큰은 전역 UNIQUE.
--   - `dma_push_chains`      — 체인(루트 주문 · 로컬 거부 · 자동매도 이벤트)마다 「보낸 최고 단계」 1행(D-07 · D-10).
--                              판정 RPC `dma_push_claim`(40-05 · 별도 마이그레이션)이 단조 upsert 한다.
--   - `dma_push_log`         — 사건(체인 × 단계) 1건 = 1행. UNIQUE 로 같은 단계 두 번 기록을 막는다.
--   - `dma_push_deliveries`  — 기기별 전달 결과 1건 = 1행(ok · failed · token_removed). 토큰 원문은 저장하지 않는다.
--   - RPC `dma_push_device_upsert` · `dma_push_devices_for_user` — server(40-07) 「이 기기 켜기」 · 기기 목록.
--
-- 왜(Phase 40 CONTEXT):
--   - D-07 「직전 상태는 DB 가 기억한다」 — relay 재기동 · WR-09 재전송(skipped 분기가 같은 행을 다시 돌려준다)에도
--     같은 단계를 두 번 보내지 않으려면 체인별 보낸 단계가 relay 메모리가 아니라 DB 에 있어야 한다(SC-2).
--   - D-12 기기 행 = (user_id, device_key) 하나. 「이 기기 켜기」 와 토큰 갱신은 같은 행 교체이고 그때 enabled = true.
--     표 기본값은 enabled = false(새 기기는 꺼진 채로 시작 — 켜는 행위는 upsert 만 한다).
--   - D-13 · SC-4 기기 목록 · 끄기 · 지우기는 p_user_id 의 행만 다룬다. 목록 원소에 토큰이 없다.
--   - D-15 · RESEARCH Pitfall 12 토큰 전역 UNIQUE — 같은 토큰을 다른 사용자가 등록하면 앞 사용자 행을 먼저 지운다
--     (로그아웃 DELETE 가 오프라인으로 실패해도 같은 폰의 다음 계정에 앞 사람 체결이 가지 않는다).
--   - D-15 · SC-3 송신 결과 `token_removed`(APNs 410 Unregistered/ExpiredToken · FCM 404 UNREGISTERED)는 그 기기 id ∧
--     보낸 토큰이 지금 행 토큰과 같을 때만 행을 지운다 — 그사이 토큰이 갱신된 행은 남는다.
--   T-19-01 동형 잠금: 네 표 모두 RLS 활성 + 접근 규칙 0개 + PUBLIC/anon/authenticated 명시 REVOKE + service_role GRANT.
--   새 RPC 는 SECURITY INVOKER · service_role 전용 EXECUTE(메모리 「Supabase RPC 는 REVOKE anon/authenticated 명시」 —
--   `REVOKE ... FROM PUBLIC` 단독은 플랫폼 auto-grant 에 덮인다).
--
-- 반환 원소 모양(shared `PushDevice` · 40-02 와 1:1 camelCase):
--   {deviceKey, platform, label, enabled, lastSeenAt, createdAt} — 시각은 UTC ISO 8601 문자열(`…Z`). token 키 없음.
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 서비스롤(relay · server) 전용이다 — 브라우저는 이 표에 직접 닿지 않는다.
--   - 보관 기간 정리(purge) 잡 — 주문 저널과 같이 감사 기록이고 하루 수십 건이라 지우지 않는 것이 기본값이다.
--   - 저널 적용 · 전략 적용 RPC 재정의(SC-3) — 이 파일은 새 표 · 새 함수만 만든다.
--   - 판정 RPC(`dma_push_claim`) — 40-05 가 더 큰 버전의 마이그레이션으로 얹는다.
--   - 원격 적용. 이 파일은 원격 미적용으로 커밋되고 40-12 에서 `supabase db push` 한다.
--
-- 되돌리기(수동):
--   DROP FUNCTION IF EXISTS public.dma_push_report(jsonb);
--   DROP FUNCTION IF EXISTS public.dma_push_device_delete(uuid, text);
--   DROP FUNCTION IF EXISTS public.dma_push_device_disable(uuid, text);
--   DROP FUNCTION IF EXISTS public.dma_push_devices_for_user(uuid);
--   DROP FUNCTION IF EXISTS public.dma_push_device_upsert(uuid, text, text, text, text);
--   DROP TABLE IF EXISTS public.dma_push_deliveries, public.dma_push_log, public.dma_push_chains, public.dma_push_devices;
-- ============================================================

BEGIN;

-- ── ① 기기 토큰 (D-12 · D-13 · D-15) ──────────────────────────────
CREATE TABLE public.dma_push_devices (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key    text        NOT NULL
                CHECK (device_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),  -- 웹 localStorage UUID(40-10)
  platform      text        NOT NULL CHECK (platform IN ('ios', 'android')),
  token         text        NOT NULL CHECK (length(token) BETWEEN 16 AND 4096),  -- APNs hex 64 · FCM ~160
  label         text        NOT NULL DEFAULT '' CHECK (length(label) <= 80),   -- 「iPhone · Safari」 같은 표시 이름
  enabled       boolean     NOT NULL DEFAULT false,                            -- D-12 새 기기 기본 꺼짐
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),                            -- 마지막 「켜기」 · 토큰 갱신
  CONSTRAINT dma_push_devices_user_device_key UNIQUE (user_id, device_key),
  CONSTRAINT dma_push_devices_token_key UNIQUE (token)                         -- Pitfall 12 토큰 인계
);

-- 판정 RPC(40-05)의 「수신자의 켜진 기기」 조회.
CREATE INDEX idx_dma_push_devices_enabled_user
  ON public.dma_push_devices (user_id)
  WHERE enabled;

COMMENT ON TABLE public.dma_push_devices IS
  'Phase 40 D-12 — 체결 푸시 기기 토큰. (user_id, device_key) 1행 · token 전역 UNIQUE(D-15). 서비스롤 전용(RLS · 정책 0).';

-- ── ② 체인 상태 (D-07 · D-10) ─────────────────────────────────────
-- 체인 키 = 루트 주문번호 · 로컬 거부 'R:'||journal_epoch||':'||reject_seq · 자동매도 'AS:'||journal_epoch||':'||seq
-- (계산은 40-05 판정 RPC). rank: accepted 1 · first_fill 2 · 종결(filled · rejected · cancelled · suppressed) 3.
CREATE TABLE public.dma_push_chains (
  gateway     text        NOT NULL,
  trade_date  date        NOT NULL,
  account_no  text        NOT NULL,
  chain_key   text        NOT NULL,
  sent_rank   smallint    NOT NULL CHECK (sent_rank BETWEEN 1 AND 3),
  sent_stage  text        NOT NULL CHECK (sent_stage IN (
                'accepted', 'first_fill', 'filled', 'rejected', 'cancelled',
                'autosell_start', 'autosell_done', 'suppressed', 'stale')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway, trade_date, account_no, chain_key)
);

COMMENT ON TABLE public.dma_push_chains IS
  'Phase 40 D-07 — 체인별 보낸 최고 단계. 판정 RPC(dma_push_claim)가 sent_rank 단조 upsert. 서비스롤 전용.';

-- ── ③ 송신 로그 (사건 1건 = 1행) ──────────────────────────────────
CREATE TABLE public.dma_push_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway     text        NOT NULL,
  trade_date  date        NOT NULL,
  account_no  text        NOT NULL,
  chain_key   text        NOT NULL,
  stage       text        NOT NULL CHECK (stage IN (
                'accepted', 'first_fill', 'filled', 'rejected', 'cancelled',
                'autosell_start', 'autosell_done')),
  outcome     text        NOT NULL CHECK (outcome IN ('sent', 'stale', 'suppressed')),
  facts       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- 문장 조립 사실(종목 · 수량 · 가격 등) — 토큰 · 사용자 id 없음
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dma_push_log_chain_stage_key UNIQUE (gateway, trade_date, account_no, chain_key, stage)
);

COMMENT ON TABLE public.dma_push_log IS
  'Phase 40 D-07 — 푸시 사건(체인 × 단계) 1건 = 1행. UNIQUE 로 같은 단계 두 번 기록 차단. 서비스롤 전용.';

-- ── ④ 전달 결과 (기기별 1행 · 토큰 원문 저장 안 함) ────────────────
CREATE TABLE public.dma_push_deliveries (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id       uuid        NOT NULL REFERENCES public.dma_push_log(id) ON DELETE CASCADE,
  device_id    uuid        NOT NULL,                       -- FK 없음 — 기기 행은 지워질 수 있다(token_removed · 로그아웃)
  platform     text        NOT NULL CHECK (platform IN ('ios', 'android')),
  result       text        NOT NULL CHECK (result IN ('ok', 'failed', 'token_removed')),
  http_status  integer     NOT NULL DEFAULT 0,             -- 0 = 네트워크 오류 등 응답 없음
  reason       text        NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dma_push_deliveries_log
  ON public.dma_push_deliveries (log_id);

COMMENT ON TABLE public.dma_push_deliveries IS
  'Phase 40 D-15 — 기기별 푸시 전달 결과. 토큰 원문 칸 없음. 서비스롤 전용.';

-- ── 서비스롤 전용 잠금 (RLS 활성 + 접근 규칙 0개 = default deny) ───
ALTER TABLE public.dma_push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_push_devices FROM PUBLIC;
REVOKE ALL ON public.dma_push_devices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_push_devices TO service_role;

ALTER TABLE public.dma_push_chains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_push_chains FROM PUBLIC;
REVOKE ALL ON public.dma_push_chains FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_push_chains TO service_role;

ALTER TABLE public.dma_push_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_push_log FROM PUBLIC;
REVOKE ALL ON public.dma_push_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_push_log TO service_role;

ALTER TABLE public.dma_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_push_deliveries FROM PUBLIC;
REVOKE ALL ON public.dma_push_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_push_deliveries TO service_role;
REVOKE ALL ON SEQUENCE public.dma_push_deliveries_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.dma_push_deliveries_id_seq FROM anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.dma_push_deliveries_id_seq TO service_role;

-- ── RPC: 「이 기기 켜기」 · 토큰 갱신 (D-12 · D-15) ─────────────────
CREATE FUNCTION public.dma_push_device_upsert(
  p_user_id    uuid,
  p_device_key text,
  p_platform   text,
  p_token      text,
  p_label      text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.dma_push_devices;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'dma_push_device_upsert: p_user_id 가 비었다' USING ERRCODE = '22004';
  END IF;

  -- Pitfall 12 토큰 인계: 같은 토큰을 가진 「이 (사용자, 기기 키)」 밖의 행을 먼저 지운다 —
  -- 같은 폰 다른 계정 · 같은 사용자의 옛 기기 키(localStorage 초기화) 모두 여기서 정리된다.
  DELETE FROM public.dma_push_devices
   WHERE token = p_token
     AND NOT (user_id = p_user_id AND device_key = p_device_key);

  INSERT INTO public.dma_push_devices AS d
         (user_id, device_key, platform, token, label, enabled, last_seen_at, updated_at)
  VALUES (p_user_id, p_device_key, p_platform, p_token, left(coalesce(p_label, ''), 80), true, now(), now())
  ON CONFLICT ON CONSTRAINT dma_push_devices_user_device_key DO UPDATE
     SET platform     = EXCLUDED.platform,
         token        = EXCLUDED.token,
         label        = left(EXCLUDED.label, 80),
         enabled      = true,
         last_seen_at = now(),
         updated_at   = now()
  RETURNING d.* INTO r;

  RETURN jsonb_build_object(
    'deviceKey',  r.device_key,
    'platform',   r.platform,
    'label',      r.label,
    'enabled',    r.enabled,
    'lastSeenAt', to_char(r.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt',  to_char(r.created_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_device_upsert(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_device_upsert(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_device_upsert(uuid, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.dma_push_device_upsert(uuid, text, text, text, text) IS
  'Phase 40 D-12 · D-15 — 「이 기기 켜기」 · 토큰 갱신. 같은 토큰의 다른 행을 지우고 (user_id, device_key) 행을 enabled = true 로 upsert. 반환 = PushDevice(토큰 없음).';

-- ── RPC: 기기 목록 (D-13 · SC-4) ─────────────────────────────────
CREATE FUNCTION public.dma_push_devices_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'deviceKey',  d.device_key,
        'platform',   d.platform,
        'label',      d.label,
        'enabled',    d.enabled,
        'lastSeenAt', to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'createdAt',  to_char(d.created_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      ORDER BY d.last_seen_at DESC, d.created_at DESC, d.device_key
    ),
    '[]'::jsonb
  )
  FROM public.dma_push_devices d
  WHERE d.user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.dma_push_devices_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_push_devices_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_push_devices_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.dma_push_devices_for_user(uuid) IS
  'Phase 40 D-13 — 사용자 기기 목록(last_seen_at 내림차순). 원소 = PushDevice(토큰 없음). 없으면 [].';

NOTIFY pgrst, 'reload schema';

COMMIT;
