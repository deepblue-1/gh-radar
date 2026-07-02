---
phase: 14-ai-analyst-chatbot
plan: 03
subsystem: api
tags: [auth, jwt, supabase, zod, express-middleware, chat, conversations, idor, tdd]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-01 conversations/messages 테이블(production) + 14-02 shared 타입(ConversationRow/MessageRow/MessageBlock/ChatRole) + errors.ts ApiError"
provides:
  - "requireAuth() JWT 검증 미들웨어 — supabase.auth.getUser(jwt) → req.userId (gh-radar 서버 최초 인증, D-02)"
  - "chat-history 서비스 6 CRUD 함수 — 서비스롤 read/write, 모두 .eq(\"user_id\") 명시 소유권 필터"
  - "assertConversationOwner — 미소유/미존재 conversationId → 404(존재여부 누설 회피, T-14-01)"
  - "chat zod 스키마 — ChatPostBody(message ≤1,000자/uuid/6자리) + ConversationListQuery"
  - "Express Request.userId optional 타입 확장"
affects: [14-05, 14-06, 14-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "서버 경로 실제 방어선 = .eq(\"user_id\", req.userId) 명시 필터 (RLS 는 defense-in-depth)"
    - "JWT 검증은 SSE 헤더 쓰기 전 미들웨어 단계 완료, 401 은 일반 JSON (res.writeHead 이후 상태코드 변경 불가)"
    - "소유권 불일치 = 404 흡수 (존재 여부 누설 회피, IDOR)"
    - "제목 자동생성 = 첫 user 메시지 slice(0,30) (추가 LLM 콜 없음)"

key-files:
  created:
    - server/src/middleware/require-auth.ts
    - server/src/middleware/__tests__/require-auth.test.ts
    - server/src/schemas/chat.ts
    - server/src/services/chat-history.ts
    - server/src/services/__tests__/chat-history.test.ts
  modified:
    - server/src/types/express.d.ts

key-decisions:
  - "requireAuth 는 supabase.auth.getUser(jwt) 재사용 — jose/jsonwebtoken 신규 의존성 0 (서명·만료·revoke supabase-js 내장)"
  - "소유권 불일치도 404 CONVERSATION_NOT_FOUND 로 흡수 — 403 대신 존재 여부 누설 회피(T-14-01)"
  - "assertConversationOwner/list/delete DB error 는 500 DB_ERROR 로 래핑 — PostgREST 내부 정보 미노출"
  - "title = firstUserMessage.slice(0,30) — 추가 Claude 콜 없이 대화 제목 자동생성(RESEARCH Open Q3)"

patterns-established:
  - "requireAuth(): RequestHandler 팩토리 — 기존 rate-limit/request-id 미들웨어 팩토리 패턴 승계"
  - "chat-history: 서비스롤 SupabaseClient 인자 순수함수 모듈 + snake→camel 매퍼(mappers/home 스타일)"
  - "chat-history.test: in-memory thenable builder mock — insert/update/delete/select-order 체인 흉내"

requirements-completed: [CHAT-01]

# Metrics
duration: 5min
completed: 2026-07-02
---

# Phase 14 Plan 03: 서버 인증(requireAuth) + 대화 영속화 CRUD Summary

**gh-radar 서버 최초의 JWT 인증 미들웨어(supabase.auth.getUser)와 서비스롤 대화 히스토리 read/write 계층(6 CRUD, `.eq("user_id")` 명시 소유권 필터, IDOR 404 흡수) + zod 입력 검증을 TDD 로 구현**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T20:09:00Z (approx)
- **Completed:** 2026-07-02T20:14:00Z (approx)
- **Tasks:** 3 (Task 1 TDD, Task 2 auto, Task 3 TDD)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `requireAuth()` — `Authorization: Bearer` 토큰을 `supabase.auth.getUser(jwt)` 로 검증해 서명·만료·revoke 를 supabase-js 내장으로 처리, 성공 시 `req.userId` 설정. 무토큰/무효토큰은 401 UNAUTHENTICATED 일반 JSON(SSE 헤더 쓰기 전). gh-radar 서버 최초 인증(D-02, T-14-02).
- `chat-history` 6 CRUD 함수 — `assertConversationOwner`/`listConversations`/`createConversation`/`appendMessage`/`loadConversation`/`deleteConversation`. 모든 read/write 가 `.eq("user_id", userId)` 명시 소유권 필터. 타 사용자 conversationId 는 404 로 흡수(존재 여부 누설 회피, T-14-01).
- `chat` zod 스키마 — `ChatPostBody`(message 1~1,000자, conversationId uuid, stockCode 6자리) + `ConversationListQuery`. 프롬프트 인젝션 표면 축소(T-14-05a/V5).
- 유닛 테스트 10건 green(require-auth 4 + chat-history 6). 전체 서버 스위트 184/184 무회귀.

## Task Commits

TDD 태스크는 RED(test) → GREEN(feat) 다중 커밋:

1. **Task 1: requireAuth JWT 미들웨어** - `4ae1377` (test, RED) → `416c0ee` (feat, GREEN)
2. **Task 2: chat zod 스키마** - `9639361` (feat)
3. **Task 3: chat-history 서비스** - `8ec0f22` (test, RED) → `f6a87e9` (feat, GREEN)

**Plan metadata:** (docs 커밋 — 후속)

## Files Created/Modified

- `server/src/middleware/require-auth.ts` (신규) - requireAuth() JWT 검증 미들웨어(RESEARCH Pattern 3 verbatim)
- `server/src/middleware/__tests__/require-auth.test.ts` (신규) - 4 케이스(무헤더/Bearer부재/getUser error/유효토큰)
- `server/src/schemas/chat.ts` (신규) - ChatPostBody + ConversationListQuery zod 스키마
- `server/src/services/chat-history.ts` (신규) - 6 CRUD 함수 + snake→camel 매퍼 + ApiError 래핑
- `server/src/services/__tests__/chat-history.test.ts` (신규) - 6 케이스 + in-memory thenable builder supabase mock
- `server/src/types/express.d.ts` (수정) - Express Request.userId optional 추가

## Decisions Made

- **JWT 검증 = supabase.auth.getUser 재사용:** jose/jsonwebtoken 직접 도입 대신 supabase-js 내장 검증(서명키·만료·revoke) 사용 — 신규 의존성 0.
- **소유권 불일치 = 404 흡수:** 403 대신 `CONVERSATION_NOT_FOUND` 404 로 통일해 대화 존재 여부 자체를 누설하지 않음(T-14-01 IDOR).
- **DB error → 500 DB_ERROR 래핑:** PostgREST/RLS 원본 에러 메시지 미노출(09.2 error.message 미노출 선례 톤).
- **title 자동생성 = slice(0,30):** 별도 요약 LLM 콜 없이 첫 user 메시지 앞 30자로 대화 제목 생성.

## Deviations from Plan

None - plan executed exactly as written.

각 acceptance_criteria 를 grep/typecheck/test 로 검증:
- Task 1: `supabase.auth.getUser`/`UNAUTHENTICATED`/`401` 매칭 + require-auth 4 tests green + typecheck exit 0.
- Task 2: `max(1000)`/`uuid()`/2 export 매칭 + typecheck exit 0.
- Task 3: `export async function` 6개 + `.eq("user_id"` + `slice(0, 30)` + `CONVERSATION_NOT_FOUND` 매칭 + chat-history 6 tests green.

**참고(계획 대비 미세 조정, 스코프 무영향):** Task 3 behavior 는 assertConversationOwner 실패를 "403/404" 로 서술했으나, action 스펙(존재 여부 누설 회피)에 따라 미소유·미존재 모두 404 로 통일 구현. deleteConversation 소유권 검증 테스트를 6번째 케이스로 보강(계획 5 케이스 + 삭제 1).

## Issues Encountered

None. 전체 서버 vitest 스위트 184/184 green(25 파일) — 14-02 SUMMARY 가 언급한 키움 타이밍 flaky 테스트도 이번 실행에서 통과.

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 Supabase 서비스롤 + anthropic 키 재사용).

## Next Phase Readiness

- requireAuth + chat-history + zod 스키마 준비 완료 → P05(전문가 tool)/P06(SSE POST /api/chat 라우트) 이 이 인증·데이터 계층을 소비 가능.
- 서버는 service_role(RLS bypass)로 `WHERE user_id` 명시 필터 write 전담, RLS(14-01) 는 브라우저 직접 PostgREST 접근 IDOR 차단(defense-in-depth) — 이중 방어 완비.
- Ready for 14-04.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 5개 created 파일 전부 디스크 존재(require-auth.ts/.test.ts, chat.ts, chat-history.ts/.test.ts)
- FOUND: 5개 task 커밋(4ae1377/416c0ee/9639361/8ec0f22/f6a87e9) git log 존재
- 검증: require-auth 4 + chat-history 6 = 10 tests green, 전체 서버 184/184, tsc exit 0
