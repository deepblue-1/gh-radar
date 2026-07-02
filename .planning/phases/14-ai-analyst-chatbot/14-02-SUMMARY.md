---
phase: 14-ai-analyst-chatbot
plan: 02
subsystem: api
tags: [sse, anthropic, chat, config, shared-types, multi-agent]

requires:
  - phase: 14-ai-analyst-chatbot
    provides: 14-01 phase context/scaffold
provides:
  - "SSE 이벤트 계약(ChatSSEEventMap) + 전문가 ID(SpecialistId) + tool 이름·한글 라벨 상수 (shared)"
  - "conversations/messages row 타입(ConversationRow/MessageRow/MessageBlock/ChatRole) (shared)"
  - "챗 6 config 키(chatEnabled kill-switch·chatLeadModel·chatSpecialistModel·chatWebSearchModel·chatMaxToolRounds·chatMaxHistoryMessages)"
  - "Anthropic SDK mock 공용 픽스처 4팩토리 (stream/tool_use/end_turn/create)"
affects: [14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11]

tech-stack:
  added: []
  patterns:
    - "SSE 프로토콜 단일 진실 소스: ChatSSEEventMap (event 이름 → data payload 타입)"
    - "웹서치 모델 별도 config 키 분리 — Haiku web_search 미지원 시 코드 변경 없이 env 폴백"
    - "테스트 헬퍼는 __tests__/*.ts (비-.test.ts) — vitest include 패턴 밖, describe/it 없음"

key-files:
  created:
    - packages/shared/src/chat.ts
    - server/src/services/__tests__/anthropic-mock.ts
  modified:
    - packages/shared/src/index.ts
    - server/src/config.ts

key-decisions:
  - "chatLeadModel default=claude-sonnet-4-6, chatSpecialistModel/chatWebSearchModel default=claude-haiku-4-5 (CONTEXT 문자 그대로), 전부 env override"
  - "chatWebSearchModel 을 별도 키로 분리 — P11 POC 에서 Haiku web_search 미지원 확인 시 CHAT_WEBSEARCH_MODEL env 1줄 폴백 (RESEARCH A2)"
  - "anthropicApiKey 재사용 — 챗도 기존 키 사용, 신규 키 생성 없음"
  - "makeStreamMock 은 async generator + finalMessage() 로 SDK messages.stream() 구조적 흉내 — 네트워크 호출 0"

patterns-established:
  - "ChatSSEEventMap: SSE event 이름을 key, data JSON payload 타입을 value 로 매핑하는 단일 계약"
  - "config kill-switch: CHAT_DISABLED=true 로 챗 전체 즉시 차단 (ww-bot 패턴, DoS/비용 방어)"

requirements-completed: [CHAT-01]

duration: 4min
completed: 2026-07-02
---

# Phase 14 Plan 02: 챗봇 공유 계약·config·mock 픽스처 Summary

**SSE 이벤트 계약(ChatSSEEventMap)·전문가 ID·대화 row 타입을 shared 에 정의하고, 챗 모델/kill-switch/윈도잉 6 config 키 + Anthropic SDK mock 4팩토리를 추가한 인터페이스-우선 기반 작업**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-02T11:01:01Z
- **Completed:** 2026-07-02T11:05:30Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `packages/shared/src/chat.ts` 신설 — SSE 프로토콜 단일 진실 소스(ChatSSEEventMap 11 이벤트) + SpecialistId 5종 + tool 이름/한글 라벨 상수 + conversations/messages row 타입. index re-export.
- `server/src/config.ts` — 챗 6키(chatEnabled kill-switch, 팀장/전문가/웹서치 모델, tool-round 상한, history 윈도우). anthropicApiKey 재사용, env override 전부 가능.
- `server/src/services/__tests__/anthropic-mock.ts` — 다운스트림 서버 테스트(P05/P06)가 재사용할 순수 mock 픽스처 4팩토리. 실제 네트워크 호출 없음.

## Task Commits

1. **Task 1: shared 챗 공유 계약 + index re-export** - `fb18257` (feat)
2. **Task 2: server config 챗 6키 추가** - `f517d0c` (feat)
3. **Task 3: Anthropic SDK mock 공용 픽스처** - `9ff14fe` (test)

## Files Created/Modified

- `packages/shared/src/chat.ts` (신규) - SpecialistId, SPECIALIST_TOOL_NAMES, SPECIALIST_LABELS, ChatRole, MessageBlock, ConversationRow, MessageRow, ChatSSEEventMap, ChatSSEEventType
- `packages/shared/src/index.ts` (수정) - chat.ts 타입/상수 re-export (기존 패턴)
- `server/src/config.ts` (수정) - AppConfig + loadConfig 에 챗 6키 추가
- `server/src/services/__tests__/anthropic-mock.ts` (신규) - makeStreamMock / makeToolUseFinalMessage / makeEndTurnFinalMessage / makeCreateResponse

## Decisions Made

- **모델 default:** 팀장 Sonnet(claude-sonnet-4-6), 전문가·웹서치 Haiku(claude-haiku-4-5). CONTEXT 결정 문자 그대로 존중. 전부 env override.
- **웹서치 모델 별도 키 분리:** Haiku 가 web_search 미지원일 수 있어(RESEARCH A2/Pitfall 1) `chatWebSearchModel` 을 독립 키로 분리 — P11 POC 실패 시 `CHAT_WEBSEARCH_MODEL=claude-sonnet-4-6` env 1줄 폴백, 코드 변경 없음.
- **anthropicApiKey 재사용:** 챗도 기존 discussion-classify 와 동일 키. 신규 키 생성 안 함.
- **mock 픽스처는 비-.test.ts:** vitest include(`src/**/*.test.ts`) 밖에 위치해 테스트로 수집되지 않는 순수 헬퍼. `Anthropic.Message`/`Anthropic.ContentBlock`/`Anthropic.MessageStreamEvent` 정확 타입으로 tsc 통과.

## Deviations from Plan

None - plan executed exactly as written.

각 acceptance_criteria 를 grep/typecheck 로 검증 완료:
- Task 1: consult_websearch_specialist·실시간 검색 전문가·`from "./chat"` 매칭 + shared 빌드 통과.
- Task 2: 챗 키 grep 13(>=12)·CHAT_DISABLED·claude-sonnet-4-6 매칭 + server typecheck exit 0.
- Task 3: `make` 팩토리 4개·finalMessage·stop_reason 매칭, describe/it 0, server typecheck exit 0.

## Issues Encountered

- **server 전체 vitest 첫 실행에서 1건 실패 → 재실행 시 174/174 green.** 실패는 키움 rate-limit(429)/타이밍 의존 pre-existing flaky 테스트로, 본 plan 의 순수 타입/config 추가와 무관(런타임 경로 미변경). 재실행에서 전부 통과 확인. 본 plan 변경으로 유입된 회귀 아님 (SCOPE BOUNDARY — out of scope, deferred).

## Next Phase Readiness

- SSE 계약·전문가 ID·config·mock 픽스처가 준비되어 P03~P06(서버) + P07~P10(웹앱) 병렬 구현의 인터페이스 기반 완비.
- **P11 POC 게이트 대기 항목:** Haiku web_search 실측 — 미지원 시 `CHAT_WEBSEARCH_MODEL` env 폴백(코드 무변경).

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

모든 created 파일 디스크 존재 확인, 3 task 커밋(fb18257/f517d0c/9ff14fe) git log 존재 확인.
