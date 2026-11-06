---
phase: 39-trade-diagnosis-chatbot
plan: 05
subsystem: api
tags: [anthropic, opus-5-5, tool-use, chatbot, diagnosis, supabase-rpc, zod]

requires:
  - phase: 39-02
    provides: "kind 9 「상태전이」 문장(orderLogLineText case 9 · STRATEGY_EVENT_KIND_LABELS[9])"
  - phase: 39-03
    provides: "dma_diagnosis_for_user(p_user_id, p_trade_date, p_isin) → {access, date, isin, orders, fills, events} jsonb 1회"
  - phase: 39-04
    provides: "MarketMemo 타입(DiagnosisToolState.marketMemo)"
provides:
  - "consultDiagnosisSpecialist — Opus 5.5 도구 루프(effort · append-only · 캐시 3곳 · 마무리 콜 · 강제 중단 · 하루 상한 · usage 로그)"
  - "DIAGNOSIS_TOOLS(get_order_log → search_stock 순서 고정) · dispatchDiagnosisTool · DIAGNOSIS_TOOL_CAPS(4/3/4) · DiagnosisToolState(계약 칸 전부)"
  - "getOrderLogText — RPC 1회 → 범례 + 주문/체결/전략 이벤트/상태전이 4절 · from/to · 400줄 요약/잘림 · 실행 단위 메모"
  - "config chatDiagnosisModel(claude-opus-5-5) · chatDiagnosisEffort(medium) · chatDiagnosisDeadlineMs(150000) · chatDiagnosisDailyCap(200) · chatDiagnosisUserDailyCap(20)"
  - "shared SpecialistId diagnosis · consult_diagnosis_specialist · 「주문 진단 전문가」 · SPECIALIST_TOOLS 6 · runSpecialist(name, input, supabase, ctx?)"
  - "DIAGNOSIS_SYSTEM_PROMPT 초안 · DIAGNOSIS_KNOWLEDGE_SOURCE(gh-trade 95705091)"
affects: [39-07, 39-08, 39-09]

actuals:
  tokens: 24455
  tasks: 3
  commits: 5
plan_head_before: 74be210ba33584b9104cb2ea036a62c9a9430fd6
plan_head_after: f589bb3e7746d86637af19f4dba08c7fb7391821

tech-stack:
  added: []
  patterns:
    - "도구 가진 전문가: 모든 종료 경로가 finish() 한 출구를 지나 [chat] diagnosis usage 1줄을 남긴다(무로그 fail-safe 금지)"
    - "증분 캐시 브레이크포인트는 최신 user 메시지 마지막 블록 하나만 — 앞 라운드 표시는 지운다(요청당 4개 상한)"
    - "마무리 콜은 같은 system · 같은 tools + tool_choice none — 실행 안 한 tool_use 마다 「상한 도달 — 실행 안 함」 결과를 채운다"

key-files:
  created:
    - server/src/services/specialists/diagnosis/diagnosis-specialist.ts
    - server/src/services/specialists/diagnosis/diagnosis-tools.ts
    - server/src/services/specialists/diagnosis/diagnosis-order-log.ts
    - server/src/services/specialists/diagnosis/diagnosis-knowledge.ts
    - server/src/services/specialists/__tests__/diagnosis.test.ts
    - server/src/services/specialists/__tests__/diagnosis-tools.test.ts
  modified:
    - server/src/config.ts
    - packages/shared/src/chat.ts
    - server/src/services/chat-orchestrator.ts
    - server/src/services/__tests__/chat-orchestrator.test.ts

key-decisions:
  - "강제 중단 타이머는 실행 단위 하나(절대 시각 = 시작 + 마감 + 30초)로 둔다 — 라운드마다 「남은 마감 + 30초」 로 거는 것과 같은 시각이고, setTimeout 이라 가짜 시계 테스트가 된다"
  - "라운드 상한 · 마감 · 누적 입력 가드에 걸린 라운드의 tool_use 는 실행하지 않고 「상한 도달 — 실행 안 함」 으로 채운다 · 도구 실행 중 마감을 넘기면 받은 결과는 싣고 지시 text 를 붙여 바로 마무리 콜"
  - "get_order_log to 를 초까지만 주면 그 초 끝(.999)까지 포함 — 「09:00:02 까지」 가 09:00:02.4 를 빼지 않게(39-04 시세 창은 .000 — 도구 설명에 명시)"
  - "isin 지정 400줄 초과는 절 순서가 아니라 시각순 앞 400줄 — 주문이 많은 날 이벤트 절이 통째로 빠지지 않게"
  - "orderLogMemo 는 계약대로 Map<string, string> — RPC jsonb 를 JSON 문자열로 둔다(오류는 메모하지 않음)"
  - "하루 상한 RPC 는 전역 · 사용자 둘 다 매번 증가(시도 횟수) · 오류 · 숫자 아님은 fail-closed"
  - "ANTHROPIC_API_KEY 없음도 warn + usage 로그 뒤 SPECIALIST_UNAVAILABLE(모든 끝 로그 원칙)"

patterns-established:
  - "진단 도구 결과는 고정 순서 텍스트 + 첫 줄 범례 — JSON 금지(토큰)"
  - "도구 예외는 dispatchDiagnosisTool 에서 is_error 결과 + warn 로 바꾼다 — 한 도구가 루프 전체를 깨지 않는다"

requirements-completed: [SC-2, SC-3, SC-5]

coverage:
  - id: D1
    description: "한 경로 끝까지 — 질문 → Opus(effort medium · thinking/temperature/tool_choice 없음 · 캐시) → get_order_log → dma_diagnosis_for_user 1회(p_user_id = ctx.userId) → 4절 텍스트 → end_turn 진단문(text = display)"
    requirement: "SC-3"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis.test.ts#consultDiagnosisSpecialist — 한 경로 끝까지(Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "루프 가드 — 8라운드 · 마감 150초 · 누적 입력 60만 → tools/system 그대로 tool_choice none 마무리 콜 · 마감+30초 강제 중단 · refusal(대체 모델 없음) · 빈 답 · max_tokens → warn(stop_reason · usage) + 고정 문구"
    requirement: "SC-3"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis.test.ts#consultDiagnosisSpecialist — 루프 가드(Task 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "하루 상한(전역 200 · 사용자 20 · incr_api_usage) 초과 · 확인 실패 시 Opus 0회 · [chat] diagnosis capped/usage 로그(models · marketRecords · truncated)"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis.test.ts#consultDiagnosisSpecialist — 하루 상한 · usage 로그(Task 2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "팀장 도구 consult_diagnosis_specialist(question 만) 등록 · SPECIALIST_TOOLS 6 · ctx 없으면 고정 문구 · ctx 있으면 text · display · usage 그대로"
    requirement: "SC-3"
    verification:
      - kind: unit
        ref: "server/src/services/__tests__/chat-orchestrator.test.ts#주문 진단 전문가 등록(Phase 39 D-01 · D-02)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D5
    description: "계좌 범위(SC-2) — 도구 스키마에 계좌 · 사용자 · 서버 칸 0 · 덧붙인 account_no/user_id 가 RPC 인자에 닿지 않음(정확히 3키 · p_user_id = state.userId)"
    requirement: "SC-2"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-tools.test.ts#계좌 범위(SC-2) — 도구 스키마 · RPC 인자"
        status: pass
    human_judgment: false
  - id: D6
    description: "search_stock(ETP · 상폐 제외 · limit 10) · get_order_log 시간 필터 · 400줄 요약/잘림 · 실행 단위 메모 · 도구별 호출 상한"
    requirement: "SC-5"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-tools.test.ts (search_stock · get_order_log · 도구별 호출 상한)"
        status: pass
    human_judgment: false
  - id: D7
    description: "진단 지식 프롬프트 초안(역할 · 도구 규칙 · 출력 권고 · 금지 · 인젝션 방어) — 실제 답 품질은 39-08 본문 · 39-09 UAT 몫"
    verification: []
    human_judgment: true
    rationale: "프롬프트가 실제 Opus 답을 원하는 꼴로 이끄는지는 실 API(RUN_DIAGNOSIS_LIVE=1) · UAT 로만 판정된다 — executor 는 실 API 금지"

duration: 15min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 05: 진단 전문가 코어 Summary

**Opus 5.5 도구 루프(effort medium · append-only · tool_choice none 마무리 콜 · 마감 150초+30초 강제 중단 · 하루 상한 200/20) 위에 get_order_log(RPC 1회 → 4절 텍스트) · search_stock 을 얹고, 팀장 6번째 도구 consult_diagnosis_specialist(question 만)로 연결**

## Performance

- **Duration:** 15 min
- **Started:** 2026-11-06T05:32:46Z
- **Completed:** 2026-11-06T05:47:11Z
- **Tasks:** 3 (tracer 1 · TDD 2)
- **Files modified:** 10

## Accomplishments

- 질문 하나가 Opus → `get_order_log` → `dma_diagnosis_for_user`(p_user_id = ctx.userId · 인자 정확히 3개) → 진단문으로 끝까지 흐르고, 요청 모양(모델 · effort · thinking/temperature/tool_choice 없음 · 캐시 3곳 · thinking 블록 되싣기)이 테스트로 잠겼다.
- 어떤 끝(정상 · 라운드/마감/토큰 상한 · 강제 중단 · refusal · 빈 답 · max_tokens · 예외 · 하루 한도 · 사용량 확인 실패 · 키 없음)이든 `[chat] diagnosis usage` 1줄과 정해진 문구로 끝난다. refusal 에 대체 모델 없음.
- 도구 스키마 어디에도 계좌 · 사용자 · 서버 칸이 없고, 모델이 덧붙인 키는 zod `.strip()` 이 버린다(SC-2 테스트).
- 주문로그는 범례 + `[주문]` · `[체결]` · `[전략 이벤트]`(웹과 같은 `orderLogLineText` + `사유="…" 임계 실측 지표 누적 t`) · `[상태전이]`(0건이면 「상태전이 기록 없음(아직 미적재)」) — 계좌번호는 끝 4자리만.

## Task Commits

1. **Task 1: 한 경로 끝까지(tracer)** — `6ba15a6e` (feat)
2. **Task 2: 루프 가드 · 비용 상한 · usage 로그 + 팀장 도구 등록** — RED `685c3cfe` (test) → GREEN `2034b767` (feat)
3. **Task 3: search_stock · 시간 필터 · 400줄 · 메모 · 호출 상한 + 계좌 범위** — RED `3054bc3a` (test) → GREEN `f589bb3e` (feat)

Tracer 게이트: interactive · end-of-phase · `<automated>` 만 → verify 재실행 통과 후 확장.

## TDD Gate Compliance

- Task 2 RED: 15건 실패(SPECIALIST_TOOLS 길이 5 · tool_choice 없음 · 한도 문구 없음 등 계획 동작 단언), 기존 12건 통과 → GREEN 36/36.
- Task 3 RED: 첫 실행은 테스트 제목에서 미정의 상수(`DIAGNOSIS_TOOL_CAPS`)를 읽어 **수집 단계 오류(INVALID_RED)** — 제목을 리터럴로 바꾸고 상수는 단언으로 옮겨 재실행, 11건이 계획 동작 단언에서 실패(1건 = SC-2 인자 테스트는 Task 1 의 strip 으로 이미 통과 — 예상된 GREEN). GREEN 28/28.
- `tdd-red-evidence` 분류기는 돌리지 않았다(`workflow.tdd_mode` 미설정 · type: execute 플랜). 의미 판정은 위와 같다.

## Files Created/Modified

- `server/src/config.ts` — Phase 39 chat 5키 · `DiagnosisEffort` · `effortOr`
- `server/src/services/specialists/diagnosis/diagnosis-specialist.ts` — `consultDiagnosisSpecialist` · 가드 상수 · 고정 문구 5 · `DiagnosisContext` · `DiagnosisDeps` · `ModelUsage`
- `server/src/services/specialists/diagnosis/diagnosis-tools.ts` — `DIAGNOSIS_TOOLS` · `DIAGNOSIS_TOOL_CAPS` · `DiagnosisToolState` · `dispatchDiagnosisTool` · search_stock
- `server/src/services/specialists/diagnosis/diagnosis-order-log.ts` — `getOrderLogText` · `ORDER_LOG_MAX_LINES` · `STATE_TRANSITION_EMPTY_TEXT` · 요약/잘림
- `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts` — `DIAGNOSIS_SYSTEM_PROMPT` 초안 · `DIAGNOSIS_KNOWLEDGE_SOURCE`
- `packages/shared/src/chat.ts` — `SpecialistId` `"diagnosis"` · 도구 이름 · 라벨
- `server/src/services/chat-orchestrator.ts` — 6번째 도구 · `SpecialistContext` · `SpecialistRunResult.display/usage` · `runSpecialist(…, ctx?)`
- 테스트: `diagnosis.test.ts`(로컬 팩토리 `makeStreamSequence` · `makeToolUseMessage` · `makeEndTurnMessage` · `makeRefusalMessage` · `makeThinkingBlock`) · `diagnosis-tools.test.ts` · `chat-orchestrator.test.ts`(길이 6 · 진단 3건). 공유 `anthropic-mock.ts` 무변경.

## Decisions Made

frontmatter `key-decisions` 참고. 핵심: 강제 중단은 실행 단위 타이머 하나(라운드별 계산과 같은 절대 시각) · 상한 걸린 라운드의 도구는 실행 안 함 · 시각순 400줄 잘림 · to 초 단위는 그 초 끝까지.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 증분 캐시 브레이크포인트 누적 방지**
- **Found during:** Task 1
- **Issue:** 계획대로 매 라운드 마지막 user 메시지에 `cache_control` 만 붙이면 앞 라운드 표시가 남아 system · tools 포함 4라운드째에 브레이크포인트가 5개가 된다(API 상한 4 → 400).
- **Fix:** `moveCacheMarker` — 새 표시를 붙일 때 직전 표시를 지운다(표시는 내용이 아니라 prefix · thinking 블록은 그대로).
- **Files modified:** diagnosis-specialist.ts
- **Verification:** 8라운드 테스트 통과(호출 시점 params 깊은 복사로 단언)
- **Committed in:** 6ba15a6e

**2. [Rule 2 - Missing Critical] 도구 예외 격리**
- **Found during:** Task 2
- **Issue:** `supabase.rpc` 가 예외를 던지면(네트워크) `Promise.all` 이 진단 루프 전체를 깨 고정 문구로 끝난다.
- **Fix:** `dispatchDiagnosisTool` 이 예외를 `is_error` tool_result + `[chat] diagnosis tool failed` warn 으로 바꾼다.
- **Files modified:** diagnosis-tools.ts
- **Committed in:** 2034b767

**3. [Rule 2 - Missing Critical] 도구 실행 중 마감 초과**
- **Found during:** Task 2
- **Issue:** 계획은 응답 직후 마감만 본다 — 도구(시세 대기 최대 20초)가 마감을 넘기면 다음 일반 라운드가 하나 더 돈다.
- **Fix:** 도구 결과 뒤 마감을 다시 보고, 넘었으면 받은 결과에 지시 text 를 붙여 바로 마무리 콜.
- **Files modified:** diagnosis-specialist.ts
- **Committed in:** 2034b767

---

**Total deviations:** 3 auto-fixed (1 bug · 2 missing critical)
**Impact on plan:** 모두 정확성 · 비용 가드 보강. 범위 확장 없음.

## Issues Encountered

- Task 3 첫 RED 가 수집 단계 오류(제목에서 미정의 상수 참조)라 무효 — 제목을 리터럴로 고쳐 유효한 RED 로 다시 냈다.

## Known Stubs

| 파일 | 내용 | 이유 · 해소 플랜 |
|------|------|------------------|
| `server/src/services/chat-service.ts` (무변경) | 팀장 루프가 `runSpecialist(b.name, input, supabase)` 를 ctx 없이 불러 진단은 `DIAGNOSIS_CONTEXT_MISSING_TEXT` 로 끝난다 | 의도 — 라우트 `req.userId` · `diagnosisDeps` 배선과 진단문 화면 전달은 39-07 몫(이 플랜 files 밖) |
| `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts` | 지식 프롬프트 초안 — 판정표 · 해석 규칙 · 세션 코드 없음 | 의도 — 39-08 이 gh-trade 원천에서 채운다 |
| `DiagnosisToolState.marketRecords` · `truncated` | 시세 도구가 없어 늘 0 · false | 의도 — 39-07 이 `diagnosis-tools.ts` 의 get_market_ticks 디스패치에서 채운다(로그는 이미 state 에서 읽는다) |

WINDOWS.md 원장에는 올리지 않았다 — 셋 다 같은 phase 후속 플랜이 소유한 예정 작업이고, 공유 산출물은 오케스트레이터 몫이다.

## User Setup Required

None — 새 env 는 모두 코드 기본값(배포 스크립트 수정 불필요).

## Next Phase Readiness

- 39-07: `DiagnosisToolState` 칸이 계약대로 다 있다 — `diagnosis-tools.ts` 에 `get_market_ticks`(배열 끝 · CAPS 에 이미 4) 를 붙이고 `marketRecords` · `truncated` 를 채우면 usage 로그가 따라온다. `runSpecialist` 4번째 인자 · `SpecialistRunResult.display/usage` 준비됨.
- 39-08: `DIAGNOSIS_SYSTEM_PROMPT` · `DIAGNOSIS_KNOWLEDGE_SOURCE` 를 채운다(이 파일만).
- 검증: tsc(server · webapp) 통과 · vitest 7파일 96건 통과(specialists 전체 · chat-orchestrator · chat-service · chat.route). 쓰기 호출 0(`insert|update|upsert|delete` grep 0).

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*

## Self-Check: PASSED

- 만든 파일 6개 존재 확인(diagnosis/ 4 · __tests__ 2)
- 커밋 5개(6ba15a6e · 685c3cfe · 2034b767 · 3054bc3a · f589bb3e) HEAD 조상 · 작업 트리 깨끗
- 수락 기준 Task 1~3 grep 전부 통과 · 플랜 검증(쓰기 호출 0) 통과
