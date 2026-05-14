-- ============================================================
-- Phase 09.1 Plan 01: kiwoom_tokens CREATE (D-26, D-27, D-28)
--
-- 결정 근거 (09.1-CONTEXT.md / 09.1-RESEARCH.md §5.2 Migration 2):
--   D-26: schema = (token_type PK, access_token, expires_at, fetched_at)
--         worker (Cloud Run Job) + server (Cloud Run service) 가 공유 row 사용
--   D-27: 24h TTL — 만료 5분 전 refresh. 동시 refresh race 는 idempotent
--         (UPSERT onConflict: token_type, 마지막 INSERT 가 승)
--   D-35 / MEMORY feedback_supabase_rpc_revoke:
--         REVOKE FROM PUBLIC + REVOKE FROM anon, authenticated 둘 다 명시 필수
--         (Supabase 플랫폼 auto-grant 가 PUBLIC 만 REVOKE 시 회귀 위험)
--   T-09.1-02: access_token 평문 저장 — RLS service_role only, 24h 짧은 lifetime,
--              만료 시 refresh 가능
--
-- Push 시점: Wave 4 cutover 의 첫 push (worker production live 직전).
-- ============================================================

BEGIN;

CREATE TABLE public.kiwoom_tokens (
  token_type   text PRIMARY KEY,                    -- "live" / "mock"
  access_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (worker + server 양쪽 SELECT/UPSERT)
ALTER TABLE public.kiwoom_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kiwoom_tokens FROM PUBLIC;
REVOKE ALL ON public.kiwoom_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiwoom_tokens TO service_role;

COMMIT;
