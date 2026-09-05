-- ============================================================
-- Phase 15 Plan 09 — RELAY-01: dma_credentials CREATE (D-18, D-12, D-19).
--
-- gh-radar 계정 ↔ DMA 게이트웨이 로그인(user_id + 비밀번호) 매핑. relay 가 wss 인증
-- 직후 이 테이블을 읽어 사용자 전용 DMA 세션을 연다. 등록 경로는 관리자 수기 스크립트
-- `scripts/dma-credentials.ts` 하나뿐이고, 웹앱에는 입력 UI 가 없다(D-18 — deferred).
--
-- 결정 근거:
--   D-12: **행의 존재 자체가 allowlist** 다. 행이 없는 로그인 사용자는 오류가 아니라
--         "권한 없음"(`unauthorized` 상태 프레임)이다. 그래서 조회는 maybeSingle 이고
--         relay 는 null 을 정상 흐름으로 다룬다.
--   D-18: 스키마 = (user_id PK → auth.users, dma_user_id, dma_password_enc,
--         created_at, updated_at). **RLS 활성 + 접근 규칙 0개** = default deny.
--   D-19: 복호 주체는 relay 뿐이다. Cloud Run server 는 AES 키를 갖지 않는다.
--   자동 메모리 feedback_supabase_rpc_revoke / PATTERNS S-3 / `kiwoom_tokens` 선례:
--         `REVOKE ... FROM PUBLIC` 만으로는 부족하다. Supabase 플랫폼 auto-grant 가
--         그 뒤에 anon/authenticated 를 되살리므로 **두 role 을 이름으로 명시 REVOKE**.
--   T-15-05 (Information Disclosure): 브라우저는 PostgREST 로 Supabase 에 직접 닿을 수
--         있다. 여기서 막지 못하면 자격증명이 그대로 노출된다. 방어는 3겹이다 —
--         ① RLS 활성 + 접근 규칙 0개 ② anon/authenticated 명시 REVOKE
--         ③ 비밀번호는 평문이 아니라 AES-256-GCM 암호문이고 키는 DB 밖에 있다.
--
-- 저장 포맷 (dma_password_enc):
--   base64( nonce(12B) || tag(16B) || ciphertext ), AES-256-GCM, **AAD = user_id**.
--   AAD 를 거는 이유는 행 이동 공격 방어다 — DB 를 쓸 수 있는 공격자가 A 사용자의
--   암호문을 B 행에 복사해도 tag 검증이 실패한다.
--   키는 Secret Manager `gh-radar-dma-cred-key` 에 있다. **DB 에 키를 두지 않는다.**
--   정본 구현: `relay/src/store/credentials.ts` (encrypt/decryptDmaPassword).
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 이 테이블은 relay(서비스롤)만 읽는다.
--     웹앱은 PostgREST 로 직접 접근하지 않는다 — 규칙을 하나라도 만드는 순간
--     브라우저에서 닿는 경로가 열린다.
--   - 평문 비밀번호 컬럼을 추가하지 말 것. 복호는 relay 메모리 안에서만 일어난다.
--   - updated_at 자동 갱신 트리거를 두지 않는다. 쓰기 주체가 등록 스크립트 하나뿐이고
--     그쪽이 명시적으로 값을 넣는다(트리거는 쓰기 주체가 늘어날 때 검토).
-- ============================================================

BEGIN;

CREATE TABLE public.dma_credentials (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dma_user_id      text NOT NULL,          -- DMA 게이트웨이 로그인 id (D-17 — WinForms 값과 달라야 한다)
  dma_password_enc text NOT NULL,          -- base64(nonce||tag||ciphertext), AES-256-GCM, AAD = user_id
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 서비스롤 전용: RLS 를 켜고 접근 규칙을 하나도 만들지 않는다 = 모든 클라이언트 role default deny (D-18).
ALTER TABLE public.dma_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.dma_credentials FROM PUBLIC;
REVOKE ALL ON public.dma_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_credentials TO service_role;

COMMIT;
