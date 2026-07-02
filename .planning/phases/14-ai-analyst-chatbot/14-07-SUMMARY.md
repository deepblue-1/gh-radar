---
phase: 14-ai-analyst-chatbot
plan: 07
subsystem: ui
tags: [sse, chat, fetch-stream, supabase-auth, react-context, react-markdown, tdd]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 SSE 계약(ChatSSEEventMap/ChatSSEEventType) + ConversationRow/MessageRow 타입"
  - phase: 14-ai-analyst-chatbot
    provides: "14-03 서버 requireAuth(Bearer) + 대화 CRUD 라우트 형태(API shape 참고)"
provides:
  - "streamChat — raw fetch + response.body.getReader() + parseSSEStream 로 SSE 소비 + Authorization: Bearer 부착 (apiFetch 미사용)"
  - "parseSSEStream — somi-chat-core 포팅 SSE 파서(버퍼 flush + JSON 실패 무시), ChatSSEEventMap 타입"
  - "chat-api — listConversations/getConversation/deleteConversation (apiFetch + Bearer 주입 래퍼)"
  - "ChatProvider + useChat — open/stockContext 전역 상태 + setStockContext 발행 채널(D-03)"
  - "react-markdown@10 + remark-gfm@4 런타임 의존성(D-09 풀 마크다운)"
affects: [14-08, 14-09, 14-10]

# Tech tracking
tech-stack:
  added: [react-markdown@10, remark-gfm@4]
  patterns:
    - "SSE 소비는 raw fetch + getReader + parseSSEStream — apiFetch(8s 타임아웃 JSON 전용)는 스트림 절단으로 사용 금지"
    - "챗 인증 JSON 경로는 getSession→Authorization: Bearer 주입 래퍼(authFetch)로 apiFetch 재사용"
    - "전역 챗 상태 provider 는 open/stockContext 만 소유 — SSE 스트리밍은 시트 컴포넌트(P08) 책임"
    - "종목명 공급 채널: usePathname 은 code 만 주므로 setStockContext({code,name}) 로 name 발행(D-03)"

key-files:
  created:
    - webapp/src/lib/chat-sse.ts
    - webapp/src/lib/__tests__/chat-sse.test.ts
    - webapp/src/lib/chat-api.ts
    - webapp/src/components/chat/chat-provider.tsx
  modified:
    - webapp/package.json

key-decisions:
  - "parseSSEStream 은 somi-chat-core sse-parser.ts verbatim 포팅 — 검증된 버퍼 경계 flush + JSON 실패 무시(T-14-08)"
  - "streamChat 은 ChatStreamError(code: LOGIN_REQUIRED/SESSION_EXPIRED/CHAT_DISABLED/STREAM_ERROR)로 UI 분기 지원"
  - "chat-api 는 apiFetch 재사용 + authFetch 래퍼로 Bearer 주입 — SSE 아닌 JSON 경로라 타임아웃 무해"
  - "ChatProvider 는 상태(open/stockContext)만 — 스트리밍 로직 미포함, P08 시트가 chat-sse 소비"

patterns-established:
  - "ChatStreamError: code 기반 UI 분기(로그인 게이트/세션만료/비활성)"
  - "authFetch: getSession→Bearer 헤더 주입 후 apiFetch 위임 얇은 래퍼"
  - "chat-provider: auth-context 와 동형(React 19 <Context value> + useContext ?? EMPTY 폴백)"

requirements-completed: [CHAT-01]

# Metrics
duration: 5min
completed: 2026-07-02
---

# Phase 14 Plan 07: 프론트 챗 기반 계층 Summary

**raw fetch + getReader + parseSSEStream 로 SSE 를 소비하는 streamChat(Bearer 부착), 대화관리 JSON 래퍼(chat-api), open/종목컨텍스트 전역 provider(chat-provider) + react-markdown 설치 + SSE 파서 유닛테스트 7건**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T11:30:53Z
- **Completed:** 2026-07-02T11:36:07Z
- **Tasks:** 3 (Task 2 TDD)
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `chat-sse.ts` — `parseSSEStream`(somi-chat-core verbatim 포팅, 타입만 ChatSSEEventMap) + `streamChat`(getSession→`Authorization: Bearer`→raw fetch→`response.body.getReader()`→parseSSEStream). apiFetch 미사용(8s 타임아웃이 스트림 절단, RESEARCH Anti-Pattern). ChatStreamError 로 로그인/세션만료(401)/비활성(503) UI 분기.
- `chat-api.ts` — `listConversations(stockCode?)`/`getConversation(id)`/`deleteConversation(id)`. apiFetch 재사용 + `authFetch` 래퍼로 Supabase access_token 을 Bearer 주입(챗 라우트 requireAuth).
- `chat-provider.tsx` — `ChatProvider`/`useChat` 전역 상태(open/stockContext). `setStockContext` 채널로 종목상세가 `{code,name}` 발행(D-03) — usePathname 이 못 주는 종목명을 FAB 라벨에 공급.
- `react-markdown@10` + `remark-gfm@4` 설치(D-09 풀 마크다운). somi-chat 라이트 변환 폐기.
- SSE 파서 유닛테스트 7건 green(parseSSEStream 4 + streamChat 3). 전체 webapp 스위트 265 passed/1 skipped 무회귀.

## Task Commits

TDD 태스크(Task 2)는 RED(test) → GREEN(feat) 다중 커밋:

1. **Task 1: react-markdown + remark-gfm 설치** - `7d71703` (chore)
2. **Task 2: chat-sse + parseSSEStream 유닛테스트** - `707ad44` (test, RED) → `d4ed250` (feat, GREEN)
3. **Task 3: chat-api + chat-provider** - `b099a5e` (feat)

**Plan metadata:** (docs 커밋 — 후속)

## Files Created/Modified

- `webapp/src/lib/chat-sse.ts` (신규) - parseSSEStream 포팅 + streamChat(Bearer) + ChatStreamError
- `webapp/src/lib/__tests__/chat-sse.test.ts` (신규) - 7 테스트(파서 4 + streamChat 3), ReadableStream/getSession/fetch mock
- `webapp/src/lib/chat-api.ts` (신규) - list/get/deleteConversation + authFetch(Bearer 주입) 래퍼
- `webapp/src/components/chat/chat-provider.tsx` (신규) - ChatProvider/useChat(open/stockContext/setStockContext)
- `webapp/package.json` (수정) - react-markdown@10 + remark-gfm@4 dependencies

## Decisions Made

- **parseSSEStream verbatim 포팅:** somi-chat-core sse-parser.ts 를 로직 변경 없이 이식, 타입만 `ChatSSEEventType`/`ChatSSEEventMap`(P02)으로 교체. 버퍼 경계 flush + JSON 파싱 실패 무시(throw 안 함)로 파서 견고성 유지(T-14-08).
- **ChatStreamError code 분기:** streamChat 은 세션 없음(LOGIN_REQUIRED)/401(SESSION_EXPIRED)/503(CHAT_DISABLED)/기타(STREAM_ERROR)를 code 로 구분 — UI(P08)가 로그인 게이트/재로그인/비활성 안내를 분기.
- **chat-api 는 apiFetch 재사용:** 대화관리는 스트림이 아닌 JSON 응답이라 8s 타임아웃 무해. `authFetch` 얇은 래퍼로 getSession→Bearer 주입 후 apiFetch 위임(신규 fetch 클라 미작성).
- **provider 는 상태만:** ChatProvider 는 open/stockContext 만 소유하고 SSE 스트리밍 로직은 미포함 — P08 시트 컴포넌트가 chat-sse 로 직접 스트림 소비. auth-context 와 동형(React 19 `<Context value>` + useContext ?? EMPTY 폴백).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] chat-sse 주석의 "apiFetch" 리터럴이 acceptance grep(apiFetch==0)과 충돌**
- **Found during:** Task 2 (chat-sse GREEN 검증)
- **Issue:** 계획 action 은 "apiFetch 사용 금지 주석"을 요구했으나, acceptance_criteria 는 `grep "apiFetch" chat-sse.ts == 결과 없음`을 요구 — 주석에 리터럴 `apiFetch`를 쓰면 grep 게이트 실패.
- **Fix:** 금지 사유 주석은 유지하되 리터럴 식별자 대신 "lib/api.ts 의 JSON 전용 fetch 헬퍼"로 서술 표현 교체. 의도(스트림 절단 이유 문서화)와 grep 게이트(호출부에 apiFetch 미사용) 동시 충족.
- **Files modified:** webapp/src/lib/chat-sse.ts
- **Verification:** `grep -c apiFetch chat-sse.ts` == 0, 7 tests green, tsc exit 0
- **Committed in:** d4ed250 (Task 2 GREEN 커밋)

---

**Total deviations:** 1 auto-fixed (1 bug — 문서/게이트 충돌 조정)
**Impact on plan:** 계획 의도 100% 보존(금지 사유 여전히 문서화). 스코프 확장 없음.

## Issues Encountered

None. 전체 webapp vitest 스위트 265 passed/1 skipped(33 파일) 무회귀 — 콘솔에 보이는 fetch 실패 로그는 타 테스트(StockComovement/DailyChart 등)의 의도된 에러 경로 mock 로그이며 실패 아님.

## Known Stubs

None. 본 plan 은 기반 계층(SSE 소비/대화 API/전역 상태)만 제공 — UI 렌더링/데이터 배선은 P08~P10 이 담당(계획대로). chat-provider 는 상태 관리만이 설계 의도이며 스텁 아님.

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 Supabase 세션 + Cloud Run 서버 URL 재사용).

## Next Phase Readiness

- streamChat/parseSSEStream/chat-api/ChatProvider 준비 완료 → P08(FAB+시트, StockDetailClient 종목컨텍스트 배선)/P09(메시지 렌더)/P10(/chat 페이지)이 이 계층을 소비.
- **P08 배선 대기:** layout.tsx 에 ChatProvider 마운트 + 종목상세가 `setStockContext({code,name})` 발행/언마운트 해제(D-03).
- **서버 라우트 의존:** chat-api 는 P06 의 `/api/chat/conversations` GET/DELETE + streamChat 은 POST `/api/chat` SSE 라우트를 소비 — 병렬 wave 라 계약(P02/P03)만으로 구현, 통합 검증은 P08 이후.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 4개 created 파일 전부 디스크 존재(chat-sse.ts/.test.ts, chat-api.ts, chat-provider.tsx)
- FOUND: 4개 task 커밋(7d71703/707ad44/d4ed250/b099a5e) git log 존재
- 검증: chat-sse 7 tests green, 전체 webapp 265 passed/1 skipped, tsc exit 0, lint exit 0
