---
phase: 14-ai-analyst-chatbot
plan: 06
subsystem: api
tags: [sse, anthropic, chat, tool-use, multi-agent, orchestrator, express, jwt]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 shared ChatSSEEventMap/SPECIALIST_LABELS/MessageBlock + config 6키 + anthropic-mock 픽스처"
  - phase: 14-ai-analyst-chatbot
    provides: "14-03 requireAuth 미들웨어 + chat-history 6 CRUD + zod 스키마(ChatPostBody/ConversationListQuery)"
  - phase: 14-ai-analyst-chatbot
    provides: "14-05 chat-orchestrator SPECIALIST_TOOLS/runSpecialist/toolNameToSpecialistId/extractStockRefs"
provides:
  - "handleChatStream — 팀장(Sonnet) tool-use 루프: sanitize/prune/retry + 프롬프트 캐싱 + Promise.all 병렬 전문가 dispatch + SSE emit + 히스토리 복원/저장"
  - "chatRouter — POST /(SSE) + GET/DELETE /conversations 대화관리"
  - "app.ts app.use('/api/chat', chatRouter) 결선 — 서버 챗 기능 완성"
affects: [14-09, 14-10, 14-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "팀장 tool-use 루프 이식(ww-bot chat-service): sanitizeMessages/pruneHistory/isRetryableError/retry/cache_control 그대로 + 전문가 tool 치환"
    - "clientAbort(시트 닫힘)와 interrupt(새 요청) 분리 처리 — Claude 스트림은 interrupt 만으로 취소, 시트 닫혀도 완료 후 저장(D-06)"
    - "히스토리 영속화 경계: messages 는 텍스트 스냅샷만 복원(tool 원본 미저장, Pitfall 3) → sanitizeMessages 필수"
    - "SSE 라우트: requireAuth 는 writeHead 전 401(Pattern 3), X-Accel-Buffering:no + 15s keepalive(Cloud Run Pitfall 2) + done 보장"

key-files:
  created:
    - server/src/services/chat-service.ts
    - server/src/services/__tests__/chat-service.test.ts
    - server/src/routes/chat.ts
    - server/src/routes/__tests__/chat.route.test.ts
  modified:
    - server/src/app.ts
    - server/src/services/supabase.ts

key-decisions:
  - "effectiveSignal = AbortSignal.any([interruptController.signal]) — clientAbort 제외. 시트 닫힘은 SSE 전송만 멈추고 생성/저장 계속(D-06 '완료 후 저장')"
  - "세션 Map 은 히스토리 저장이 아닌 interrupt/busy 가드 전용 — 히스토리는 DB(loadConversation) 복원(ww-bot 인메모리와 의도적 차이)"
  - "end_turn 시 스트림 delta 가 비면 finalMessage text 블록 폴백(messageText) — 불필요한 recovery 콜 회피(Rule 2 robustness)"
  - "stock_card(D-07)/citation(D-08) 은 assistant blocks 로 저장 + SSE emit — content 텍스트와 분리(MessageBlock 계약)"
  - "라우트 :id 파라미터는 zod uuid 파싱(express5 string|string[] 정규화 + 형식 방어)"

patterns-established:
  - "handleChatStream(res, supabase, abortSignal, { userId, conversationId?, message, stockCode? }) — SSE 스트림 핸들러 시그니처"
  - "route-level chatRateLimit(20/60s) — /api(200/60s) 위에 챗 POST 추가 강화(T-14-04)"

requirements-completed: [CHAT-01]

# Metrics
duration: 9min
completed: 2026-07-02
---

# Phase 14 Plan 06: 챗 서비스 + SSE 라우트 + app 결선 Summary

**ww-bot 검증 팀장 tool-use 루프(sanitize/prune/retry/프롬프트 캐싱/interrupt)를 gh-radar 로 이식하고 "tool" 자리에 P05 의 5 전문가를 꽂아 SSE POST /api/chat + 대화관리(GET/DELETE) + app.ts 결선까지 완성한 서버 챗 기능**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-02T12:03:20Z
- **Completed:** 2026-07-02T12:12:20Z
- **Tasks:** 3 (Task 1 TDD)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `chat-service.ts` — 팀장(Sonnet) tool-use 루프. ww-bot `sanitizeMessages`/`pruneHistory`/`isRetryableError`/retry(MAX_RETRIES=2)/프롬프트 캐싱(`cache_control` system+tools 마지막 원소)을 그대로 이식하고, `SPECIALIST_TOOLS`/`runSpecialist`(P05)로 tool 치환. tool_use 시 `Promise.all` 병렬 전문가 dispatch + `agent_start`/`agent_end` SSE, `stock_card`(D-07)·`citation`(D-08) blocks 저장. 히스토리는 DB 텍스트 스냅샷 복원 후 sanitize, 완료 시 user/assistant 저장. interrupt/busy 가드(D-06) — 새 요청이 이전 Claude 스트림 abort, 시트 닫혀도 완료 후 저장.
- `routes/chat.ts` — `requireAuth` 후 SSE 스트림 POST(X-Accel-Buffering:no + 15s keepalive + close→abort + done 보장, CHAT_DISABLED 503 kill-switch) + `GET /conversations`(종목 필터 D-13) + `GET/DELETE /conversations/:id`(소유권 검증, 미소유 404 T-14-01) + 라우트 전용 rate-limit(20/60s).
- `app.ts` — `app.use("/api/chat", chatRouter)` 결선(/api/home 다음, helmet/cors/rate-limit 뒤).
- 유닛 8(chat-service) + 라우트 8(supertest) = 16 신규 테스트 green. 전체 서버 스위트 215/215(안정 실행), typecheck exit 0.

## Task Commits

1. **Task 1 (RED): chat-service 실패 테스트** - `825c0fa` (test)
2. **Task 1 (GREEN): chat-service 이식** - `9de84f7` (feat)
3. **Task 2: chat 라우트 + 대화관리 + supabase 주석** - `fb39392` (feat)
4. **Task 3: app.ts chatRouter 결선** - `349f75d` (feat)

_Task 1 은 TDD (test → feat). REFACTOR 불필요(구현 clean)._

## Files Created/Modified

- `server/src/services/chat-service.ts` (신규) - handleChatStream 팀장 루프 + sanitize/prune/retry + SSE emit + 히스토리 복원/저장 + interrupt
- `server/src/services/__tests__/chat-service.test.ts` (신규) - 8 케이스(순수함수 3 + handleChatStream 4 + interrupt 1)
- `server/src/routes/chat.ts` (신규) - chatRouter (SSE POST + GET/DELETE conversations)
- `server/src/routes/__tests__/chat.route.test.ts` (신규) - 8 케이스(401/400/503/200/목록/삭제/404)
- `server/src/app.ts` (수정) - chatRouter import + app.use("/api/chat")
- `server/src/services/supabase.ts` (수정) - auth.getUser 서비스롤 동작 주석 확인

## Decisions Made

- **clientAbort/interrupt 분리(D-06):** `effectiveSignal = AbortSignal.any([interruptController.signal])` — clientAbort(시트 닫힘)는 제외해 Claude 스트림은 오직 새 요청(interrupt)으로만 취소된다. 시트를 닫아도 finalMessage 까지 생성 후 히스토리를 저장해 사용자가 재방문 시 답변을 볼 수 있게 함. ww-bot 의 `AbortSignal.any([abortSignal, interrupt])`(둘 다 취소)와 의도적 차이 — gh-radar 는 영속화가 있으므로 완료-후-저장이 옳다.
- **세션 Map = interrupt 가드 전용:** ww-bot 은 인메모리 세션에 메시지 히스토리를 유지했으나, gh-radar 는 conversations/messages(DB)에서 복원한다. 세션 Map 은 busy/interruptController 만 추적(키 = conversationId ?? userId).
- **end_turn 텍스트 폴백(Rule 2):** 스트림 delta 가 비어도 `finalMessage` text 블록에서 `messageText()` 로 폴백 — 불필요한 recovery 콜/네트워크 왕복 회피. 실사용(정상 스트리밍)은 무영향.
- **:id uuid 파싱:** express 5 `req.params.id` 가 `string | string[]` 로 추론되어 typecheck 실패 → codebase 관례(StockCodeParam/LimitUpParams zod parse)를 따라 `ConversationIdParam = z.object({ id: z.string().uuid() })` 인라인 파싱(형식 방어 겸).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] end_turn 스트림 delta 공백 시 finalMessage 텍스트 폴백**
- **Found during:** Task 1 (Test 6 interrupt)
- **Issue:** ww-bot 원본은 end_turn 시 `finalText = textBuffer` 만 사용 → 스트림이 text_delta 없이 end_turn 하면 finalText 가 비어 recovery(추가 Claude 콜) 로 빠짐. 정상 스트리밍은 문제없지만 delta-less 종료는 불필요한 콜/비용.
- **Fix:** `finalText = textBuffer || messageText(finalMessage)` — finalMessage.content 의 text 블록 폴백 헬퍼 추가.
- **Files modified:** server/src/services/chat-service.ts
- **Verification:** chat-service Test 6 green (recovery 미진입 확인), 전체 8/8.
- **Committed in:** `9de84f7` (Task 1 GREEN)

**2. [Rule 3 - Blocking] express 5 req.params 타입(string|string[]) → zod uuid 파싱**
- **Found during:** Task 2 (typecheck)
- **Issue:** `loadConversation(supabase, req.params.id, ...)` / `deleteConversation(...)` 가 `TS2345 string | string[] not assignable to string` 로 typecheck 실패(express 5 RouteParameters).
- **Fix:** `ConversationIdParam` zod 스키마로 `req.params` 를 파싱(codebase 관례 승계) — 타입 정규화 + uuid 형식 방어.
- **Files modified:** server/src/routes/chat.ts
- **Verification:** tsc exit 0, 라우트 8/8 green.
- **Committed in:** `fb39392` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 blocking)
**Impact on plan:** 둘 다 정확성/타입 안전성에 필요. 스코프 확장 없음 — 계획된 이식 범위 내.

**참고(태스크 커밋 구성):** 라우트 통합 테스트(chat.route.test.ts)는 createApp 에 chatRouter 가 mount 되어야 통과하므로, Task 2 커밋(라우트+테스트) 직전에 Task 3 의 app.ts 결선을 작업트리에 반영한 상태에서 검증했다. 커밋은 계획대로 Task 2(라우트+테스트+supabase) / Task 3(app.ts) 로 분리. 최종 상태는 전부 green.

## Issues Encountered

- **전체 서버 스위트 첫 실행에서 1건 실패 → 재실행 시 215/215 green.** 실패는 키움 rate-limit(429)/타이밍 의존 pre-existing flaky 테스트(14-02/14-03 SUMMARY 기록)로 본 plan 의 챗 변경과 무관. 챗 신규 테스트(chat-service 8 + chat.route 8)는 격리/전체 실행 모두 일관 green. SCOPE BOUNDARY — out of scope, 회귀 아님.

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 ANTHROPIC_API_KEY + Supabase 서비스롤 재사용). 운영 kill-switch `CHAT_DISABLED=true` env 로 챗 전체 즉시 비활성 가능.

## Next Phase Readiness

- 서버 챗 기능 완성 — POST /api/chat SSE(팀장 답변 + agent/stock_card/citation) + 대화관리 라이브. 웹앱(P07~P10)이 이 SSE 계약을 소비할 준비 완료.
- **P11 POC 게이트 대기(비차단):** Haiku web_search 실측 — 미지원 시 `CHAT_WEBSEARCH_MODEL=claude-sonnet-4-6` env 폴백(코드 무변경, 14-02 결정).
- Ready for 14-09.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 4개 created 파일 전부 디스크 존재 (chat-service.ts/.test.ts, chat.ts/.route.test.ts)
- FOUND: 4개 task 커밋 (825c0fa RED / 9de84f7 GREEN / fb39392 route / 349f75d app) git log 존재
- 검증: chat-service 8 + chat.route 8 = 16 신규 tests green, 전체 서버 215/215(안정), tsc exit 0
