-- ============================================================
-- Phase 14 Plan 01: conversations + messages
--   (AI 애널리스트 챗봇 — 로그인 사용자별·종목별 대화 영속화)
--   D-02(히스토리 서버 전담) + D-03(종목별 이어가기) 의 저장 계층.
--   RESEARCH §Pattern 4 확정 스키마를 watchlists RLS 패턴으로 mirror.
--
-- 데이터 흐름:
--   서버(service_role) 가 SSE /api/chat 루프에서 conversations/messages 를 write 전담.
--   service_role 은 RLS bypass → 서버가 `WHERE user_id` 명시 필터로 격리.
--   RLS 는 defense-in-depth 방어선 — 브라우저가 PostgREST 직접 접근 시 IDOR 차단.
--
-- 결정 근거 (14-CONTEXT.md / 14-RESEARCH.md §Pattern 4):
--   watchlists mirror (20260416120000_watchlists.sql):
--     - conversations 4정책 = authenticated role, auth.uid() = user_id (watchlists 동일)
--     - user_id FK 는 auth.users cascade-on-delete — 사용자 탈퇴 시 대화 자동 정리
--   conversations.stock_code = FK stocks(code), 삭제 시 SET NULL
--     - NULL = 일반 대화(/chat), 값 = 종목상세 컨텍스트(D-03). 종목 상장폐지 시 대화는 보존.
--   messages 4정책 = user_id 컬럼 없음 → conversation 소유권을 EXISTS 서브쿼리로 강제.
--   messages.blocks(jsonb) = 미니 종목카드/차트/citation 부가물(D-07/08/10).
--     tool_use/tool_result 원본은 저장 안 함 (RESEARCH Pitfall 3 — 텍스트 스냅샷만).
--
--   feedback_supabase_rls_authenticated: 신규 테이블 RLS role 명시.
--     conversations/messages 는 **비공개**(본인 것만) → authenticated role 만 명시
--     (비로그인 접근 불가가 의도). 공개 테이블만 anon + authenticated 둘 다 명시.
--     비로그인 role 은 정책 미부여 = default-deny (비공개 테이블 의도).
--   RPC 없음(plain table read/write) → REVOKE 불요 (home_theme_snapshots 선례).
--
--   threat register (14-01 threat_model):
--     T-14-01 (IDOR / 정보노출·변조): RLS authenticated role + auth.uid()=user_id
--       (conversations) / EXISTS 서브쿼리(messages) — 직접 PostgREST 접근 시 타인 대화 차단.
--     T-14-13 (권한상승 / default-deny 회피 실수): 모든 정책 authenticated role 명시.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- conversations: 로그인 사용자별 대화.
--   stock_code NULL=일반(/chat), 값=종목상세 컨텍스트(D-03).
-- ─────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code  text REFERENCES stocks(code) ON DELETE SET NULL,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_user_stock ON conversations (user_id, stock_code, updated_at DESC);

-- ─────────────────────────────────────────────────────────
-- messages: 대화 내 메시지.
--   content=렌더용 마크다운 텍스트, blocks=미니카드/차트/citation 부가물(D-07/08/10).
--   tool_use/tool_result 원본은 저장하지 않음 (RESEARCH Pitfall 3 — 텍스트 스냅샷만).
-- ─────────────────────────────────────────────────────────
CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  content         text NOT NULL,
  blocks          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- conversations: watchlists mirror — authenticated role, auth.uid() = user_id (비공개, 비로그인 접근 불가가 의도)
CREATE POLICY "auth_select_own_conversations" ON conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "auth_insert_own_conversations" ON conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth_update_own_conversations" ON conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth_delete_own_conversations" ON conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- messages: user_id 없음 → conversation 소유권을 EXISTS 서브쿼리로 (4정책 모두 동일 패턴)
CREATE POLICY "auth_select_own_messages" ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "auth_insert_own_messages" ON messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "auth_update_own_messages" ON messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "auth_delete_own_messages" ON messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

COMMIT;
