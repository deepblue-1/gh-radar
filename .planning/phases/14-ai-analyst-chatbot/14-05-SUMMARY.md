---
phase: 14-ai-analyst-chatbot
plan: 05
subsystem: api
tags: [anthropic, multi-agent, orchestrator, tool-use, chat, dispatch, tdd]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-02 shared SPECIALIST_TOOL_NAMES/SpecialistId + anthropic-mock 픽스처"
  - phase: 14-ai-analyst-chatbot
    provides: "14-04 전문가 5종 consult{Quote|Theme|News|Limitup|WebSearch}Specialist + chat-prompts"
provides:
  - "SPECIALIST_TOOLS — 팀장(Sonnet)에 노출할 5개 전문가 Anthropic.Tool[] (RESEARCH Pattern 2)"
  - "runSpecialist — tool_use.name → 전문가 dispatch → tool_result content 조립 (웹서치만 citations 분리)"
  - "runSpecialist code guard(D-08) — quote/limitup code 미지정 시 consult 미호출 + graceful skip"
  - "toolNameToSpecialistId (SSE agent_start 라벨용) + extractStockRefs (D-07 인라인 카드 트리거)"
affects: [14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "agent-as-tool dispatch: tool 이름 → SpecialistId 역매핑 switch → consult 전문가 1콜"
    - "tool 이름 = shared SPECIALIST_TOOL_NAMES 단일 진실 소스 참조 (리터럴 중복 금지)"
    - "graceful dispatch: 미지 tool/무데이터 code guard 는 throw 대신 안내 텍스트 (팀장 루프 무중단)"

key-files:
  created:
    - server/src/services/chat-orchestrator.ts
    - server/src/services/__tests__/chat-orchestrator.test.ts
  modified: []

key-decisions:
  - "SPECIALIST_TOOLS name 은 리터럴 대신 SPECIALIST_TOOL_NAMES 상수 참조 — shared 단일 진실 소스(플랜 action 지시), Test 1 이 런타임에 5종 일치 검증"
  - "code 는 input_schema required 에서 제외(question 만 required) — 팀장이 종목 없는 질문에서 스키마 위반 없이 자연 미호출, 실제 방어는 runSpecialist code guard"
  - "quote/limitup code guard 는 runSpecialist 진입부에서 강제(D-08) — consult 함수 자체도 code 없으면 SPECIALIST_UNAVAILABLE 반환하지만, orchestrator 레벨에서 조회 이전 차단해 무데이터 DB 호출 0"
  - "웹서치만 { text, citations } 반환 — text 는 팀장 tool_result content, citations 는 P06 이 SSE citation 이벤트로 별도 전파(D-08)"

patterns-established:
  - "runSpecialist(name, input, supabase) → { text, citations? }: 데이터 전문가는 { text }, 웹서치는 { text, citations }"
  - "extractStockRefs 정규식 /\\((\\d{6})\\)/g — 등장순서 유지 + dedupe (P06 이 stock_quotes 로 카드 데이터 조회)"

requirements-completed: [CHAT-01]

# Metrics
duration: 3min
completed: 2026-07-02
---

# Phase 14 Plan 05: 팀장 오케스트레이터 코어 (agent-as-tool dispatch) Summary

**팀장(Sonnet)에 노출할 5개 전문가 Anthropic.Tool[] 정의 + tool_use→전문가 dispatch(runSpecialist)를 code guard(D-08 환각방지)·웹서치 citations 분리·인라인 카드 유틸(D-07)과 함께 TDD 로 구현한 멀티에이전트 오케스트레이션 코어**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-02T11:40:38Z
- **Completed:** 2026-07-02T11:43:06Z
- **Tasks:** 1 (TDD)
- **Files modified:** 2 (2 created)

## Accomplishments

- `SPECIALIST_TOOLS: Anthropic.Tool[]` — 5개 전문가 tool. name 은 `SPECIALIST_TOOL_NAMES` 상수 참조(단일 진실 소스), input_schema `code`(optional)/`question`(required). quote/limitup description 에 code 미지정 시 미호출 지침(D-08), websearch 에 "비용 큼 — 꼭 필요할 때만"(D-12). 배열 그대로 export(P06 이 마지막 원소에 cache_control 부착).
- `runSpecialist(name, input, supabase)` — 이름 → SpecialistId 역매핑 switch dispatch. 데이터 전문가는 `{ text }`, 웹서치는 `{ text, citations }`. 미지 tool → 안내 텍스트(throw 안 함, T-14-04c).
- **code guard(D-08):** quote/limitup 에서 `input.code` 없으면 consult 함수 호출 이전에 graceful skip 텍스트("종목이 특정되지 않아…") 반환 — 무데이터 시세/상한가 DB 조회·환각 원천 차단. news/theme/websearch 는 미적용.
- `toolNameToSpecialistId`(SSE agent_start 라벨용, P06 재사용) + `extractStockRefs`(답변 텍스트 6자리 종목코드 추출, dedupe — D-07 인라인 카드 트리거).
- 유닛테스트 8건 green(요구 5 behavior + tool description guard + extractStockRefs 2). 전체 서버 스위트 199/199 무회귀(191→199).

## Task Commits

TDD 태스크 RED → GREEN:

1. **Task 1 (RED): 실패 테스트** - `7ebf0f2` (test)
2. **Task 1 (GREEN): 구현** - `8b9a19a` (feat)

REFACTOR 불필요(구현 clean, 추가 커밋 없음).

**Plan metadata:** (docs commit 별도)

## Files Created/Modified

- `server/src/services/chat-orchestrator.ts` (신규) - SPECIALIST_TOOLS, runSpecialist, toolNameToSpecialistId, extractStockRefs, SpecialistInput/SpecialistRunResult 타입
- `server/src/services/__tests__/chat-orchestrator.test.ts` (신규) - 8 케이스(tool 정의 2 + dispatch 4 + extractStockRefs 2), 전문가 5종 vi.mock 스텁

## Decisions Made

- **tool name = 상수 참조:** SPECIALIST_TOOLS 의 name 을 리터럴 대신 `SPECIALIST_TOOL_NAMES.{id}` 로 참조 — shared 단일 진실 소스(플랜 action 명시 "name 은 SPECIALIST_TOOL_NAMES 값 사용"). Test 1 이 런타임에 5종 이름 일치를 검증(grep 리터럴보다 강한 보증).
- **code 는 required 제외:** input_schema.required=["question"] 만. 팀장이 종목 없는 일반 질문에서 스키마 위반 에러 없이 자연 미호출하도록 두고, 실제 방어는 runSpecialist code guard 로 강제(D-08).
- **code guard 를 orchestrator 레벨에 배치:** consult 함수 자체도 code 없으면 SPECIALIST_UNAVAILABLE 을 반환하지만(P04), runSpecialist 진입부에서 조회 이전에 차단해 무데이터 DB round-trip 을 0 으로 만듦(비용/환각 이중 방어).
- **웹서치 citations 분리:** runSpecialist 반환의 `text` 는 팀장 tool_result content, `citations` 는 P06 이 SSE `citation` 이벤트 + messages.blocks(D-08)로 별도 전파.

## Deviations from Plan

None - plan executed exactly as written.

**참고(AC-vs-instruction 정합 조정, 스코프 무영향):** 플랜 acceptance_criteria 의 `grep -c "consult_" >= 5` 는 리터럴 tool 이름 문자열 5개를 가정했으나, 플랜 action 은 "name 은 SPECIALIST_TOOL_NAMES 값 사용"을 명시함. 후자를 따라 상수 참조로 구현(중복 제거·단일 진실 소스)했고, 그 결과 파일 내 "consult_" 리터럴은 1회(JSDoc 예시)뿐이다. 기능 의도(5 tool 각각 consult 전문가에 매핑)는 Test 1(길이 5 + 이름이 SPECIALIST_TOOL_NAMES 값과 정확 일치)이 런타임에 검증하므로 grep 프록시보다 강한 보증. 나머지 AC(`input_schema` 매칭, 3 export, `종목이 특정되지 않아` 매칭, 테스트 green)는 전부 충족.

각 acceptance_criteria 검증:
- `input_schema` grep 매칭 OK
- `SPECIALIST_TOOLS`/`runSpecialist`/`extractStockRefs` 3 export OK
- `종목이 특정되지 않아` (code guard, D-08) 매칭 OK
- `pnpm --filter server test chat-orchestrator` — 8 tests pass (요구 5 behavior 전부 포함)
- typecheck exit 0, 전체 서버 199/199

## Threat Flags

없음 — 이 plan 은 신규 네트워크 엔드포인트/인증 경로/스키마를 도입하지 않음. runSpecialist 는 P04 전문가(등록된 표면)를 dispatch 만 한다. threat_model T-14-03b(tool 인자 오염) mitigate 를 code guard(D-08 무데이터 조회 차단)로 구현, T-14-04c(미지 tool DoS) accept 를 안내 텍스트 반환(throw 없음)으로 충족.

## Issues Encountered

None. 전체 서버 vitest 199/199 green(27 파일). 로그의 web_search tool_result_error WARNING 은 P04 웹서치 graceful fallback 테스트의 정상 출력(회귀 아님).

## User Setup Required

None - 외부 서비스 신규 구성 없음(기존 anthropic 키 재사용).

## Next Phase Readiness

- SPECIALIST_TOOLS + runSpecialist 준비 완료 → P06 chat-service 팀장 루프가 `SPECIALIST_TOOLS` 를 팀장에 넘기고, tool_use 블록마다 `runSpecialist` 를 Promise.all 병렬 호출한다.
- `toolNameToSpecialistId` → SSE `agent_start` 라벨(SPECIALIST_LABELS), 웹서치 `citations` → SSE `citation` 이벤트, `extractStockRefs` → SSE `stock_card` 이벤트 배선이 P06 에서 조립될 준비 완료.
- Ready for 14-06.

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: 2개 created 파일 디스크 존재 (chat-orchestrator.ts + test)
- FOUND: 2개 task 커밋 (7ebf0f2 RED / 8b9a19a GREEN) git log 존재
- 검증: chat-orchestrator 유닛 8/8 green, 전체 서버 199/199, tsc exit 0
