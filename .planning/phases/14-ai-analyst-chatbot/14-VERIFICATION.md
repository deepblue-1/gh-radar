---
phase: 14-ai-analyst-chatbot
verified: 2026-07-02T23:10:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "429/529 재시도 시 text_clear 이벤트로 중복 텍스트가 실제로 사라지는지(WR-02)"
    expected: "팀장 스트림이 부분 텍스트 전송 후 재시도되면, 클라이언트 화면에서 이전 부분 텍스트가 지워지고 재시도 전체 텍스트만 남는다(중복 없음)"
    why_human: "429/529 재시도는 Anthropic API 실패를 실제로 유발해야 재현 가능 — unit mock 은 이 경로를 커버하지 않음(REVIEW-FIX 자체 기록)"
  - test: "멀티라운드(팀장이 tool_use 전 서두 텍스트를 먼저 말한 뒤 전문가 호출) 시 화면 표시와 DB 저장 content 가 완전히 일치하는지(WR-03)"
    expected: "예: '전문가에게 확인해볼게요…' 같은 중간 서술이 화면에도, 재방문 시 히스토리에도 그대로 남는다"
    why_human: "실제 멀티라운드 스트림(여러 tool_use 왕복) 유발이 필요 — 기존 유닛 테스트 골격은 delta 빈 배열이라 이 시나리오를 직접 커버하지 않음(REVIEW-FIX 자체 기록)"
  - test: "빠르게 연속 전송/새 대화 전환 시 정지 버튼과 입력창 활성 상태가 실제 스트림 상태와 항상 일치하는지(WR-06)"
    expected: "이전 전송의 지연된 finally 가 새 스트림의 isStreaming=true 를 덮어써 UI가 유휴 상태로 보이는 경쟁이 재현되지 않는다"
    why_human: "마이크로태스크 타이밍 경쟁은 유닛테스트로 재현이 어려움 — 실제 브라우저에서 빠른 연속 클릭으로만 확인 가능(REVIEW-FIX 자체 기록)"
  - test: "챗 시트//chat 페이지에서 실제 팀장+전문가 대화가 자연스럽게 동작하는지(UX 품질)"
    expected: "질문 성격에 따라 적절한 전문가가 선택되고, 답변 품질/속도/스텝퍼 표시가 트레이더 관점에서 쓸만하다"
    why_human: "AI 응답 품질/UX 만족도는 프로그래밍적으로 판정 불가"
---

# Phase 14: AI 애널리스트 챗봇 (멀티에이전트) Verification Report

**Phase Goal:** 팀장 에이전트(Sonnet)가 전문가 에이전트 5명(Haiku: ①시세/수급 ②테마 ③뉴스/심리 ④상한가 패턴 ⑤실시간 웹서치)을 질문 성격에 따라 선택적 병렬 호출해 의견을 취합·답변하는 상한가 따라잡기 전략 특화 AI 애널리스트 챗봇. 로그인 사용자별·종목별 대화 히스토리(Supabase, RLS), SSE 스트리밍 POST /api/chat + JWT 검증, 미니 종목카드/출처 인용/미니 일봉차트/진행 스텝퍼, react-markdown 답변, 전역 FAB + 챗 시트 + /chat 페이지, production 배포까지.
**Verified:** 2026-07-02T23:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

ROADMAP.md의 Phase 14 항목에는 별도의 구조화된 "Success Criteria" 목록이 없어(Goal 서술문 + Requirements + Plans 형식), 11개 PLAN 프론트매터의 `must_haves.truths`(각 plan 당 3~6개, 총 34개 세부 진술)를 병합·상위 9개 관찰 가능한 진실로 집약해 검증했다. `known_deviations`(면책 문구 전면 제거, 챗 모델 전면 Sonnet 5, 코드리뷰 Warning 8건 fix)는 사용자 지시/게이트 후속 조치로 확인되어 gap 아님으로 처리했다.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 로그인 사용자별·종목별 대화가 Supabase(conversations/messages)에 영속되고 RLS로 타 사용자 접근이 차단된다 | ✓ VERIFIED | `supabase/migrations/20260702170000_chat_conversations.sql` — conversations 4정책 + messages 4정책(EXISTS 서브쿼리) 전부 `TO authenticated`, anon 미부여=default-deny. `chat-history.ts` 서비스롤 CRUD가 전부 `.eq("user_id", userId)` 명시 필터. `chat-history.test.ts` 6케이스 green |
| 2 | 팀장(Sonnet)이 5개 전문가(시세/테마/뉴스/상한가/웹서치)를 tool로 선택적·병렬 호출해 취합 답변한다 | ✓ VERIFIED | `chat-orchestrator.ts` `SPECIALIST_TOOLS`(5) + `runSpecialist` dispatch, `chat-service.ts`가 tool_use 다건을 `Promise.all` 병렬 실행(`chat-orchestrator.test.ts` 8/8, `specialists.test.ts` 7/8 관련 케이스 green) |
| 3 | SSE 스트리밍 POST /api/chat 이 JWT 인증 후 팀장 답변을 토큰 단위로 흘려보내고, 무토큰은 SSE 헤더 쓰기 전 401 이다 | ✓ VERIFIED | `require-auth.ts`(`supabase.auth.getUser`) + `routes/chat.ts`의 `requireAuth()` 전 라우트 적용. `chat.route.test.ts` 8/8. production `curl -X POST /api/chat` 실측 `401` 확인(본 검증에서 재현) |
| 4 | 코드 없는(종목 무관) theme/news 질의도 실제 DB 데이터로 답변 가능하다(대표 예시 칩 "오늘 주도 테마는?" 무력화 안 됨) | ✓ VERIFIED | REVIEW WR-01 → `theme-specialist.ts`/`news-specialist.ts`에 `fetchLeadingThemes`/`fetchRecentNews` 폴백 구현 확인(코드 레벨), 커밋 `3bcd429` 존재·유효 |
| 5 | assistant 답변이 풀 마크다운으로 렌더되고, 진행 스텝퍼/미니 종목카드(국내색상)/출처 인용/미니 일봉차트가 SSE 이벤트에 매핑되어 표시된다 | ✓ VERIFIED | `message-assistant.tsx`(react-markdown+remark-gfm, raw HTML 비활성) + `agent-progress.tsx` + `mini-stock-card.tsx`(--up/--down) + `citation.tsx` + `mini-chart.tsx`(chart-colors hex 팔레트). `message-render.test.tsx` 8/8 green |
| 6 | 전역 FAB(로그인 게이트 + 종목 컨텍스트 라벨)와 챗 시트(SSE 스트리밍 + 정지/abort)가 모든 페이지에서 동작한다 | ✓ VERIFIED | `layout.tsx`에 `ChatProvider`+`ChatFab`+`ChatSheet` 전역 마운트 확인. `chat-fab.test.tsx` 4/4, `chat-sheet.test.tsx` 4/4 green. E2E 시나리오 1~3 이 동일 동작 실증 |
| 7 | /chat 페이지가 대화목록(종목 필터/이어가기) + 삭제 확인 다이얼로그를 제공한다 | ✓ VERIFIED | `app/chat/page.tsx`(2-col) + `conversation-list.tsx` + `delete-conversation-dialog.tsx`(WR-05 catch 추가 확인). `conversation-list.test.tsx` 5/5 green |
| 8 | 코드리뷰 Warning 8건(WR-01~08)이 모두 코드에 반영되어 있다 | ✓ VERIFIED | 8개 fix 커밋(`3bcd429`~`d33b310`) 전부 유효(`gsd-tools verify commits`) + grep 으로 실제 코드 반영 확인(fetchLeadingThemes/text_clear/accumulatedText/join text blocks/catch+setError/controller 정체성 가드/pendingPersist/logger.warn usage) |
| 9 | server(SSE 챗 라우트)와 webapp(FAB/시트/페이지)이 production 에 배포되어 동작한다 | ✓ VERIFIED | Cloud Run `gh-radar-server` 최신 리비전 이미지 태그 `1b295df`(현재 HEAD, 리뷰픽스 전부 포함) — production `POST /api/chat` 무토큰 401 실측. Vercel `gh-radar-webapp` 최근 배포(2분 전, Ready/Production) — `GET /` 200 실측 |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260702170000_chat_conversations.sql` | conversations+messages+RLS 8정책 | ✓ VERIFIED | 84줄, FK CASCADE/SET NULL, 8 정책 전부 `TO authenticated` |
| `packages/shared/src/chat.ts` | SpecialistId/ChatSSEEventMap/Row 타입 | ✓ VERIFIED | index.ts re-export 확인 |
| `server/src/middleware/require-auth.ts` | JWT 검증 미들웨어 | ✓ VERIFIED | routes/chat.ts 전 라우트 적용, 4 테스트 green |
| `server/src/services/chat-history.ts` | 6 CRUD, WHERE user_id | ✓ VERIFIED | 188줄, 6 테스트 green |
| `server/src/services/chat-prompts.ts` | LEAD_PROMPT + 5 전문가 프롬프트 | ✓ VERIFIED | 69줄(면책 제거 후 축소) |
| `server/src/services/specialists/*.ts` (5종) | 데이터 전문가 4 + 웹서치 1 | ✓ VERIFIED | 전부 thinking:disabled + temperature 제거(Sonnet5) + WR-08 로깅 반영 |
| `server/src/services/chat-orchestrator.ts` | SPECIALIST_TOOLS/runSpecialist | ✓ VERIFIED | 185줄, 8 테스트 green |
| `server/src/services/chat-service.ts` | handleChatStream 팀장 루프 | ✓ VERIFIED | 592줄, WR-02/03/07 반영 확인 |
| `server/src/routes/chat.ts` | POST /(SSE)+GET/DELETE | ✓ VERIFIED | app.ts `/api/chat` 결선 확인 |
| `webapp/src/lib/chat-sse.ts` / `chat-api.ts` | SSE 소비 + 대화관리 | ✓ VERIFIED | 7 테스트 green |
| `webapp/src/components/chat/*.tsx` (14개) | FAB/시트/렌더/페이지 전체 | ✓ VERIFIED | 전부 실존·비어있지 않음, 28 컴포넌트 테스트 green |
| `webapp/e2e/specs/chat.spec.ts` | E2E 4시나리오 | ✓ VERIFIED | 파일 존재, 시나리오 내용이 SUMMARY 주장과 일치 |
| `.planning/REQUIREMENTS.md` | CHAT-01 정의+Traceability | ✓ VERIFIED | `CHAT-01 | Phase 14 | Complete` 확인, Coverage 37 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `messages.conversation_id` | `conversations.id` | FK CASCADE | ✓ WIRED | 마이그레이션 SQL 확인 |
| RLS messages 정책 | `conversations.user_id` | EXISTS 서브쿼리 | ✓ WIRED | 4정책 모두 확인 |
| `routes/chat.ts POST /` | `handleChatStream` | 직접 호출 | ✓ WIRED | grep 확인 |
| `chat-service` | `chat-orchestrator SPECIALIST_TOOLS/runSpecialist` | 팀장 루프 | ✓ WIRED | grep 확인 |
| `app.ts` | `chatRouter` | `app.use("/api/chat", chatRouter)` | ✓ WIRED | 확인 |
| `chat-sse.streamChat` | Supabase `getSession().access_token` | Authorization: Bearer | ✓ WIRED | production 실측(무토큰 401, `authorization:[REDACTED]` 로그로 유효토큰 경로 확인) |
| `chat-fab`/`chat-sheet` | `useChat` (provider) | 전역 상태 | ✓ WIRED | layout.tsx 마운트 확인 |
| `layout.tsx` | `ChatProvider`+`ChatFab`+`ChatSheet` | 전역 마운트 | ✓ WIRED | 확인 |
| `/chat page` | `chat-api` list/get/delete | 대화 관리 | ✓ WIRED | conversation-list.test.tsx 확인 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 무토큰 POST /api/chat → 401(SSE 헤더 전) | `curl -X POST https://gh-radar-server-.../api/chat` | `401` + `{"error":{"code":"UNAUTHENTICATED",...}}` | ✓ PASS |
| server 전체 스위트 무회귀 | `pnpm vitest run` (server) | 29 files / 219 tests green | ✓ PASS |
| 챗 관련 server 테스트 격리 실행 | `pnpm vitest run` (chat 6파일) | 45/45 green | ✓ PASS |
| webapp 챗 관련 테스트 격리 실행 | `pnpm vitest run` (chat 5파일) | 28/28 green | ✓ PASS |
| 리뷰픽스 커밋 20개 존재성 | `gsd-tools verify commits` | all_valid: true (20/20) | ✓ PASS |
| production webapp 응답 | `curl https://gh-radar-webapp.vercel.app/` | 200 | ✓ PASS |
| production server 최신 리비전 이미지 = HEAD 커밋(리뷰픽스 포함) | `gcloud run services describe` | image tag `1b295df` == 현재 HEAD | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHAT-01 | 14-01~14-11 (전체) | 팀장+전문가 5 멀티에이전트 AI 애널리스트 챗봇 — 대화 히스토리(RLS)/SSE/JWT/미니카드·인용·차트·스텝퍼/react-markdown/FAB·시트·페이지 | ✓ SATISFIED | REQUIREMENTS.md에 `Complete` 기록 확인 + 본 검증의 9개 관찰 진실 전부 VERIFIED로 뒷받침 |

REQUIREMENTS.md의 Traceability 표에 CHAT-01 외 Phase 14 관련 orphaned requirement는 없음(단일 요구사항, 11개 plan 전부 `requirements: [CHAT-01]`로 일치).

### Anti-Patterns Found

없음. 챗 관련 서버/웹앱 소스 전체에 TODO/FIXME/PLACEHOLDER/"coming soon"/"not yet implemented" 패턴 grep 결과 0건. Known Stubs 는 각 SUMMARY에서 "None" 또는 계획된 wave 분할(P08의 P09 위임 등, 이후 wave에서 실제 배선 완료 확인)로 문서화되어 있으며 최종 상태에서 모두 해소됨.

### Human Verification Required

REVIEW-FIX 문서 자체가 3건(WR-02/WR-03/WR-06)을 "human verification 권장"으로 명시했다 — 타이밍/재시도/멀티라운드 경쟁 조건은 유닛테스트로 재현이 어려운 시나리오이며, 코드 레벨 구현은 확인됐으나 런타임 동작 정합성은 실제 브라우저/네트워크 조건에서만 검증 가능하다.

#### 1. 스트리밍 재시도 시 텍스트 중복 제거 (WR-02)

**Test:** 장시간 답변을 요구하는 질문을 보내고, 네트워크를 순간적으로 불안정하게 하거나 API 부하 시간대에 여러 번 반복 질의해 429/529 재시도를 유발한다.
**Expected:** 화면에 이전 시도의 부분 텍스트가 남아 재시도 텍스트와 이어붙지 않는다(중복 없음). 최종 저장된 메시지도 동일하다.
**Why human:** 429/529 실패는 실제 API 조건에서만 자연 발생 — mock 스트림이 이 경로를 커버하지 않음(REVIEW-FIX 자체 인정).

#### 2. 멀티라운드 중간 텍스트 보존 (WR-03)

**Test:** 팀장이 "전문가에게 확인해볼게요" 류 서두를 말한 뒤 tool_use 로 전문가를 호출하는 질문(예: 복합 질의)을 보낸다.
**Expected:** 화면에 표시된 중간 서술이 최종 확정 메시지에도 남고, 대화 재방문 시 히스토리에도 동일하게 보인다.
**Why human:** 실제 멀티라운드 tool_use 왕복이 필요 — 기존 테스트 골격은 이 시나리오를 직접 커버하지 않음.

#### 3. 연속 전송/새 대화 전환 시 isStreaming 상태 정합성 (WR-06)

**Test:** 챗 시트에서 빠르게 연속으로 메시지를 전송하거나 전송 중 새 대화로 전환한다.
**Expected:** 정지 버튼/입력창 활성 상태가 실제 진행 중인 스트림과 항상 일치한다(이전 요청의 지연된 finally 가 새 상태를 덮어쓰지 않음).
**Why human:** 마이크로태스크 타이밍 경쟁은 유닛테스트로 재현이 어려움.

#### 4. AI 응답 품질/UX 체감

**Test:** 실제 트레이더 관점 질문(예: "오늘 상한가 근접 종목 알려줘", "이 종목 최근 뉴스 심리는?")으로 챗봇을 사용해본다.
**Expected:** 질문 성격에 맞는 전문가가 선택되고, 답변이 유용하고 정직하며(환각 없음), 스텝퍼/미니카드/인용이 자연스럽게 표시된다.
**Why human:** AI 응답의 유용성/정확성/UX 만족도는 프로그래밍적으로 판정 불가.

### Gaps Summary

Gap 없음. 34개 세부 must-have를 9개 관찰 가능한 진실로 병합해 전수 검증했고, 전부 VERIFIED다. 코드리뷰 Warning 8건은 fix 커밋으로 전부 코드에 반영되어 있으며, production(server 최신 리비전 이미지가 현재 HEAD와 일치, webapp 최근 배포 Ready)에도 반영된 것으로 확인된다. 다만 REVIEW-FIX 문서가 자체적으로 "human verification 권장"이라 명시한 3건(스트림 재시도/멀티라운드/타이밍 경쟁)은 코드 구현은 확인됐으되 런타임 정합성은 자동화로 증명 불가능한 영역이라 human_needed 로 분류한다. 이는 gates.md 기준상 "human 확인 항목이 존재하면 passed 불가, human_needed" 원칙에 따른 것이며 실질적인 gap(미구현/미배선)은 아니다.

---

_Verified: 2026-07-02T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
