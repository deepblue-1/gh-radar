---
phase: 39-trade-diagnosis-chatbot
plan: 07
subsystem: api
tags: [anthropic, sse, chatbot, diagnosis, tool-use, usage-log, zod]

requires:
  - phase: 39-04
    provides: "getMarketTicksText(input, MarketDeps, MarketMemo) → {text, records, truncated, source} · TICK_REQUEST_DAILY_CAP_DEFAULT"
  - phase: 39-05
    provides: "runSpecialist(name, input, supabase, ctx?) · SpecialistRunResult.display/usage · DiagnosisDeps · ModelUsage · DiagnosisToolState(marketMemo · marketRecords · truncated) · DIAGNOSIS_TOOL_CAPS.get_market_ticks=4"
provides:
  - "진단문 SSE 직접 전달(D-01) — display 를 \\n\\n…\\n\\n 로 감싸 text 이벤트로 흘리고 같은 문자열을 accumulatedText 에 더함(화면 · 저장 · 재시도 재전송 같은 글자)"
  - "DIAGNOSIS_RELAY_HEADER — 팀장 tool_result 머리(이미 표시됨 — 재서술 금지 · 꼬리말 한두 줄만)"
  - "HandleChatOptions.diagnosisDeps — 라우트가 app.locals tickgw · tickConvertTrigger · tickRequestDailyCap(기본 20)로 채움"
  - "LEAD_PROMPT [주문 진단] 절 · 6명 · 역할 고정 줄 「상한가 분석 · 주문 진단 애널리스트 팀장」"
  - "DIAGNOSIS_TOOLS 3번째 get_market_ticks(isin · exchange enum · date · from · to · 계좌 칸 0) · 질문당 4회 · state.marketRecords/truncated 누적"
  - "[chat] usage 의 models 맵 — 팀장(chatLeadModel) · 전문가 모델별 input/output/cacheRead/cacheCreation"
  - "server/scripts/diagnosis-live.ts — RUN_DIAGNOSIS_LIVE=1 opt-in 시험 문항 판정(LIVE-PASS ①② · LIVE-WAIT · LIVE-FAIL)"
affects: [39-09]

actuals:
  tokens: 11200
  tasks: 3
  commits: 5
plan_head_before: 6a6fcf9f4de40f5dfa5fdeb4847701988c85e8b4
plan_head_after: 12766930c9f6b1ca14a523b4d795d8a52be1e6b6

tech-stack:
  added: []
  patterns:
    - "전문가 원문을 화면에 그대로 보내야 하면 emit 과 accumulatedText 누적을 한 자리에서 — WR-03 재시도 재전송이 자동으로 같은 글자를 다시 민다"
    - "opt-in 실 API 스크립트는 맨 위 플래그 확인 뒤 무거운 모듈을 동적 import — 플래그 없이 돌리면 네트워크 0"

key-files:
  created:
    - server/scripts/diagnosis-live.ts
  modified:
    - server/src/services/chat-service.ts
    - server/src/routes/chat.ts
    - server/src/services/chat-prompts.ts
    - server/src/services/specialists/diagnosis/diagnosis-tools.ts
    - server/src/services/__tests__/chat-service.test.ts
    - server/src/routes/__tests__/chat.route.test.ts
    - server/src/services/specialists/__tests__/diagnosis-tools.test.ts

key-decisions:
  - "진단문은 agent_end 전에 흘린다 — SSE 순서 머리말 → agent_start → 진단문 → agent_end → 꼬리말(병렬이면 끝나는 순서)"
  - "tool_result 는 display 가 있을 때만 DIAGNOSIS_RELAY_HEADER + 원문(8,000자 절단은 tool_result 에만) · display 없는 결과(다른 전문가 · 진단 고정 문구)는 지금처럼 text 만"
  - "models 맵 값은 39-05 [chat] diagnosis usage 의 models 와 같은 4필드 꼴 · 팀장 키는 진단 없는 턴에도 늘 있다 · 기존 inputTokens/outputTokens 는 cache 미포함 그대로(로그 쿼리 호환)"
  - "get_market_ticks 의존성은 state.deps 에서만 — 없으면 dailyCap 기본 20 · tickgw/trigger undefined(시세 엔진이 「자료 없음」 사유를 만든다)"

patterns-established:
  - "팀장 루프 테스트는 messages 배열이 참조로 계속 밀리므로 mock.calls 의 마지막 원소 대신 tool_result user 메시지를 찾아 읽는다"

requirements-completed: [SC-1, SC-2, SC-3, SC-5]

coverage:
  - id: D1
    description: "D-01 한 경로 끝까지 — 팀장 머리말 → consult_diagnosis_specialist → 진단문 SSE 글자 그대로 → 꼬리말 → 저장 content = 화면 글자 · tool_result 머리 · 529 재시도 text_clear 뒤 재전송분에 진단문 · display 없는 결과는 흘리지 않음"
    requirement: "SC-3"
    verification:
      - kind: unit
        ref: "server/src/services/__tests__/chat-service.test.ts#handleChatStream (주문 진단 D-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SC-2 — runSpecialist 넷째 인자 정확히 {userId, signal, deps} · 라우트 app.locals → diagnosisDeps(미주입 시 상한 20) · 미들웨어 순서 chatRateLimit → requireAuth() → requireDmaMapped() 그대로"
    requirement: "SC-2"
    verification:
      - kind: unit
        ref: "server/src/services/__tests__/chat-service.test.ts#runSpecialist 넷째 인자 = { userId, signal, deps: opts.diagnosisDeps }"
        status: pass
      - kind: unit
        ref: "server/src/routes/__tests__/chat.route.test.ts#Phase 39: app.locals 의 tickgw · tickConvertTrigger · tickRequestDailyCap → diagnosisDeps"
        status: pass
    human_judgment: false
  - id: D3
    description: "get_market_ticks — 도구 순서 · required 5칸 · exchange enum · 계좌 칸 0 · 디스패치 인자 · 같은 marketMemo · 5번째 상한 문구 · 입력 오류 · deps 없음 기본값 · records/truncated 누적"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-tools.test.ts#get_market_ticks (39-07) — 시세 도구 배선"
        status: pass
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-tools.test.ts#계좌 범위(SC-2) — 도구 스키마 · RPC 인자"
        status: pass
    human_judgment: false
  - id: D4
    description: "SC-3 — [chat] usage 에 기존 키 + models(sonnet · opus 따로) · 진단 없는 턴은 팀장 키 하나"
    requirement: "SC-3"
    verification:
      - kind: unit
        ref: "server/src/services/__tests__/chat-service.test.ts#handleChatStream ([chat] usage models 맵 SC-3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "opt-in 시험 문항 스크립트 — 플래그 없으면 안내 후 exit 0(네트워크 0)"
    requirement: "SC-1"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/server exec tsx scripts/diagnosis-live.ts (플래그 없음 → 안내 줄 · exit 0)"
        status: pass
    human_judgment: false
  - id: D6
    description: "시험 문항 실 판정(LIVE-PASS ①②)과 팀장이 꼬리말만 붙이는지(프롬프트 준수)"
    requirement: "SC-1"
    verification: []
    human_judgment: true
    rationale: "실 Opus · 실 DB 호출이 필요하다 — executor 는 RUN_DIAGNOSIS_LIVE=1 실행 금지, 39-09 메인 세션이 돌린다. 팀장 꼬리말 준수도 실 Sonnet 으로만 본다."

duration: 9min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 07: 팀장 연결 Summary

**진단 전문가의 진단문을 서버가 SSE 로 글자 그대로 흘리고(화면 · 저장 · 재시도 재전송 일치) 팀장에겐 「이미 표시됨」 머리를 붙여 넘기며, 라우트 app.locals → diagnosisDeps → get_market_ticks(질문당 4회 · 계좌 칸 0)로 시세 엔진을 잇고, [chat] usage 에 모델별 토큰 맵과 opt-in 시험 문항 스크립트를 더했다**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-06T05:54:54Z
- **Completed:** 2026-11-06T06:03:25Z
- **Tasks:** 3 (tracer 1 · TDD 2)
- **Files modified:** 8

## Accomplishments

- 챗 질문 하나가 팀장 → `consult_diagnosis_specialist` → 진단문(시각 ms · 수량 · 조건 문구 그대로) → 꼬리말 → 저장까지 흐른다. SSE text 를 이어붙인 문자열이 저장 content 와 같고, 2라운드 529 재시도의 `text_clear` 뒤 재전송분에도 진단문이 그대로 있다.
- 계좌 범위는 `req.userId` 하나 — 라우트 → `handleChatStream` → `runSpecialist` ctx `{userId, signal, deps}` → 진단 도구 state. 팀장 · 전문가 · 시세 도구 입력 어디에도 계좌 칸이 없다.
- 진단 전문가가 `get_market_ticks(isin, exchange, date, from, to)` 로 39-04 시세 엔진을 직접 부른다. 의존성은 라우트가 `app.locals` 에서 넘긴 것만 쓰고, 결과 레코드 수 · 잘림이 `[chat] diagnosis usage` 로그에 실린다(39-05 의 스텁 해소).
- `[chat] usage` 로그에 `models` 맵 — `claude-sonnet-5`(팀장) · `claude-opus-5-5`(진단) 토큰이 따로 남는다.

## Task Commits

1. **Task 1: D-01 한 경로 끝까지(tracer)** — `c8df509c` (feat)
2. **Task 2: get_market_ticks 배선** — RED `636a7197` (test) → GREEN `763253dc` (feat)
3. **Task 3: usage models 맵 + opt-in 스크립트** — RED `32ed0154` (test) → GREEN `12766930` (feat)

Tracer 게이트: interactive · `end-of-phase` · `<automated>` 만 → verify 재실행 통과 후 확장.

## TDD Gate Compliance

- Task 2 RED: 신규 6건이 계획 동작 단언에서 실패(도구 없음 → 「모르는 도구: get_market_ticks」 · 호출 0 · 누적 0), 기존 12건 통과 → GREEN 18/18.
- Task 3 RED: 신규 2건이 `models` 부재 단언에서 실패(`expected … to have property "models"`), 기존 14건 통과 → GREEN 16/16.
- `tdd-red-evidence` 분류기는 돌리지 않았다(`workflow.tdd_mode` 미설정 · type: execute 플랜). 의미 판정은 위와 같다 — 수집 · 문법 · 픽스처 오류 없음.

## Files Created/Modified

- `server/src/services/chat-service.ts` — `DIAGNOSIS_RELAY_HEADER` · `HandleChatOptions.diagnosisDeps` · 진단문 SSE 직접 전달 · runSpecialist ctx · `models` 합산(`tallyFor` · `addApiUsage`)
- `server/src/routes/chat.ts` — `diagnosisDeps`(app.locals · 기본 상한 `TICK_REQUEST_DAILY_CAP_DEFAULT`) · 미들웨어 순서 무변경
- `server/src/services/chat-prompts.ts` — `LEAD_PROMPT` 역할 확장 · 6명 · `[주문 진단]` 절 · 역할 고정 줄
- `server/src/services/specialists/diagnosis/diagnosis-tools.ts` — `get_market_ticks` 정의 · zod(`.strip()`) · 디스패치 · state 누적
- `server/scripts/diagnosis-live.ts` — opt-in 시험 문항 판정 스크립트
- 테스트: `chat-service.test.ts`(진단 5건 · models 2건) · `chat.route.test.ts`(의존성 2건) · `diagnosis-tools.test.ts`(시세 도구 6건)

## Decisions Made

frontmatter `key-decisions` 참고. 핵심: 진단문은 `agent_end` 전에 흘린다 · display 있을 때만 머리 + 원문 · models 맵은 39-05 와 같은 4필드 꼴(기존 키는 호환 유지).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 라이브 스크립트 키 없음 · 예외 경로**
- **Found during:** Task 3
- **Issue:** 계획은 USER_ID 없음(exit 64)만 정했다 — 키가 없으면 진단 전문가가 고정 문구로 끝나 「LIVE-FAIL 스윕호가변경 …」 으로 오판하고, 예외는 무로그로 죽는다.
- **Fix:** `ANTHROPIC_API_KEY` 없으면 「실행 보류」 exit 2(값 출력 없음) · 예외는 `LIVE-FAIL 예외: <message>` exit 1.
- **Files modified:** server/scripts/diagnosis-live.ts
- **Verification:** 별도 tsconfig 로 스크립트 단독 tsc 통과 · 플래그 없는 실행 exit 0
- **Committed in:** 12766930

---

**Total deviations:** 1 auto-fixed (missing critical 1)
**Impact on plan:** 판정 오진 방지. 범위 확장 없음.

## Issues Encountered

- 처음 쓴 진단 테스트 2건이 `streamMock.mock.calls[1][0].messages` 의 마지막 원소를 tool_result 로 가정했다 — 팀장 루프가 같은 배열에 assistant 를 더 밀어 실패. 테스트를 tool_result user 메시지를 찾아 읽게 고쳤다(구현 무변경).
- `server/scripts/` 는 server tsconfig(`src/**`) 밖이라 `typecheck` 가 스크립트를 보지 않는다 — scratchpad tsconfig(extends + typeRoots)로 단독 검사했다.

## Known Stubs

없음. 39-05 가 남긴 스텁 두 개(chat-service 가 ctx 없이 runSpecialist 호출 · marketRecords/truncated 늘 0)는 이 플랜에서 해소됐다.

## User Setup Required

None — 새 env 는 스크립트 전용(`RUN_DIAGNOSIS_LIVE` · `DIAGNOSIS_LIVE_USER_ID` · `DIAGNOSIS_LIVE_QUESTION`) · 서버 배포 env 무변경.

## Next Phase Readiness

- 39-09: `RUN_DIAGNOSIS_LIVE=1 DIAGNOSIS_LIVE_USER_ID=<uuid> pnpm --filter @gh-radar/server exec tsx -r dotenv/config scripts/diagnosis-live.ts` 로 시험 문항 실 판정(≈ $0.5) · `LIVE-WAIT` 이면 몇 분 뒤 다시. 운영 로그 `[chat] usage` 의 `models` 로 Sonnet · Opus 비용을 따로 본다.
- 검증: server tsc 통과 · vitest 7파일 111건 통과(chat-service · chat.route · chat-orchestrator · specialists 전체) · 스크립트 단독 tsc 통과 · 플래그 없는 스크립트 실행 안내 + exit 0.

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*

## Self-Check: PASSED

- 파일 6개 존재 확인(스크립트 1 · 수정 소스 4 · SUMMARY)
- 커밋 5개(c8df509c · 636a7197 · 763253dc · 32ed0154 · 12766930) HEAD 조상 · 작업 트리 깨끗
- 수락 기준 Task 1~3 grep 전부 통과 · 계획 검증(vitest 111건 · tsc · 스크립트 플래그 없음 exit 0) 통과
