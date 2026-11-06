---
phase: 39-trade-diagnosis-chatbot
plan: 06
subsystem: ui
tags: [webapp, order-log, kind9, chat, react-markdown, next-link]

requires:
  - phase: 39-02
    provides: "STRATEGY_EVENT_KIND.StateTransition · strategyEventParts case 9(tone state) · TONE_CLASS.state"
  - phase: 39-05
    provides: "SpecialistId diagnosis · SPECIALIST_LABELS.diagnosis 「주문 진단 전문가」"
provides:
  - "OrderLogKindFilter 'state' · 구분 칩 「상태전이」(「시세」 바로 앞) · URL kind=state"
  - "matchesKind — kind 9 는 state 칩에만 · 그룹 칩(선매수~VI · 자동매도)에서 group 무관 제외"
  - "카드 팝업 matchesSide 자동매도 · 매수 · 매도에서도 kind 9 제외(「전체」 에만)"
  - "AgentProgress STEP_ORDER 끝 diagnosis"
  - "MessageAssistant a 렌더러 — /analytics/ticks? 같은 탭(next/link) · 그 밖 내부 경로 글자 · 외부 새 탭"
affects: [39-09 웹 먼저 배포 · UAT]

actuals:
  tokens: 6535
  tasks: 2
  commits: 3
plan_head_before: 6a6fcf9f4de40f5dfa5fdeb4847701988c85e8b4
plan_head_after: 87e46d501cfbed2e8a351763ff2931be01b87ff0

tech-stack:
  added: []
  patterns:
    - "kind 축 칩(state · market)은 group 축 칩보다 먼저 판정하고, group 칩은 둘 다 아닐 때만 — 계약 밖 group 값이 칩을 오염시키지 않는다"
    - "답변 마크다운 링크는 허용 목록 하나(틱뷰어)만 내부 같은 탭 — 나머지 / 경로는 링크 해제"

key-files:
  created: []
  modified:
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
    - webapp/src/components/chat/agent-progress.tsx
    - webapp/src/components/chat/message-assistant.tsx
    - webapp/src/components/chat/__tests__/message-render.test.tsx

key-decisions:
  - "kind 9 판정은 shared 상수 STRATEGY_EVENT_KIND.StateTransition — 그룹 칩 분기에 !state 조건을 더해 group 1~3 · 9 로 와도 섞이지 않게 했다(Pitfall 6)"
  - "matchesSide 는 코드 변경 없음 — 「자동매도」 가 matchesKind('auto') 를 거치므로 그룹 칩 제외로 함께 막히고, 매수/매도는 tone state 라 원래 안 걸린다(테스트로만 잠금)"
  - "틱뷰어 판정은 TICKS_BASE 상수(`/analytics/ticks`) + `?` — 경로 문자열을 두 곳에 두지 않는다"
  - "`//host` 같은 프로토콜 상대 경로도 `/` 로 시작하므로 링크 해제 쪽에 들어간다(외부 새 탭으로 새지 않음)"

patterns-established:
  - "주문로그 kind 축 칩: matchesKind 앞쪽에서 kind 로 판정 → group 칩은 kind 축 칩에 해당하지 않는 행만"

requirements-completed: [SC-4]

coverage:
  - id: D1
    description: "구분 칩 「상태전이」 가 「시세」 바로 앞에 있고 고르면 kind 9 만 남는다 · URL kind=state 파싱 · 왕복"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts#Phase 39 kind 9 「상태전이」 칩 (D-10 · Pitfall 6)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx#Phase 39 「상태전이」 칩 (D-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "kind 9 는 선매수 · 줄매수 · 후매수 · 매도 · 자동매도 · 수동 · VI 칩과 팝업 매수/매도/자동매도에 섞이지 않는다(group 0~10 전부)"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts#kind 9 는 group 무관하게 그룹 칩(선매수 … VI)에 섞이지 않는다 · 시세 · 다른 kind 는 state 거짓"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts#kind 9 · group 9 → 「자동매도」 칩 · 팝업 자동매도 · 매수 · 매도 거짓 · 팝업 「전체」 만 참"
        status: pass
    human_judgment: false
  - id: D3
    description: "주문로그 목록에서 kind 9 줄이 kind 3 줄과 시간순으로 섞여 회색 「[상태전이]」 · 「선매수 켜짐」 · 「(milles)」 로 그려진다"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx#OrderLogList — Phase 39 kind 9 상태전이 줄 (D-10 · SC-4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "챗 진행 표시에 「주문 진단 전문가」 한 줄(다른 전문가 뒤)"
    verification:
      - kind: unit
        ref: "webapp/src/components/chat/__tests__/message-render.test.tsx#AgentProgress diagnosis active → 「주문 진단 전문가 분석 중…」 · 다른 전문가와 함께면 맨 끝"
        status: pass
    human_judgment: false
  - id: D5
    description: "진단문 /analytics/ticks? 링크는 같은 탭 · 그 밖 내부 경로는 글자 · 외부 https 는 새 탭 + noreferrer"
    verification:
      - kind: unit
        ref: "webapp/src/components/chat/__tests__/message-render.test.tsx#진단문 「틱 보기」 /analytics/ticks? 링크 → 같은 탭(target 없음) · href 그대로"
        status: pass
      - kind: unit
        ref: "webapp/src/components/chat/__tests__/message-render.test.tsx#그 밖 내부 경로는 링크 없이 글자만 · 외부 https 는 새 탭 + noreferrer(현행)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실제 화면에서 「상태전이」 회색 줄 · 칩 · 진행 표시 · 「틱 보기」 이동이 자연스러운가"
    verification: []
    human_judgment: true
    rationale: "UI-SPEC 없음 · 기존 토큰만 사용 — 시각 확인은 39-09 UAT 몫(이 플랜은 Playwright 금지)"

duration: 10min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 06: 주문로그 「상태전이」 칩 · 챗 진단 진행 표시 · 틱 보기 같은 탭 Summary

**주문로그 탭에 「상태전이」 칩(kind 9 전용 · 「시세」 앞 · URL `kind=state`)을 더하고 kind 9 를 그룹 칩 · 팝업 방향 필터에서 group 무관하게 뺐다. 챗은 진행 표시 끝에 「주문 진단 전문가」 한 줄, 진단문의 `/analytics/ticks?` 링크만 `next/link` 같은 탭(그 밖 내부 경로는 글자 · 외부는 새 탭).**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-11-06T05:50:00Z
- **Completed:** 2026-11-06T05:59:46Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `OrderLogKindFilter` `'state'` · `ORDER_LOG_KIND_FILTERS` 의 `{ value: 'state', label: '상태전이' }`(「시세」 바로 앞) · `KINDS` 화이트리스트에 `'state'` — 창 분리 URL `kind=state` 가 교정 없이 열린다
- `matchesKind`: `state` = `row.kind === STRATEGY_EVENT_KIND.StateTransition` · 그룹 칩 분기는 시세도 kind 9 도 아닐 때만 — group 0~10 어느 값으로 와도 kind 9 가 선매수~VI · 자동매도 칩에 섞이지 않는다
- 39-02 가 남긴 후속(kind 9 · group 9 가 카드 팝업 「자동매도」 에 들어감)이 같은 수정으로 닫혔다 — `matchesSide('auto')` 가 `matchesKind('auto')` 를 거친다. 팝업 매수/매도는 tone `state` 라 원래 빠진다. 테스트로 잠금
- 목록 렌더: 피드(`mergeStrategyEvents`) 시간순으로 kind 9 줄이 kind 3 줄 앞에 · 구분 칸 「[상태전이]」 `--muted-fg`(방향 색 없음) · 본문 「선매수 켜짐(milles)」 — 39-02 의 `TONE_CLASS.state` · shared case 9 를 그대로 탄다(새 CSS · 새 토큰 0)
- `AgentProgress` `STEP_ORDER` 끝 `"diagnosis"` — 진단 중 「주문 진단 전문가 분석 중…」 한 줄
- `MessageAssistant` `a` 렌더러: 모듈 함수 `isTickViewerHref(href)`(= `TICKS_BASE + '?'` 접두) → `next/link` 같은 탭 · 그 밖 `/` 경로 → `<span>` 글자 · 나머지 → 현행 `target="_blank"` `rel="noreferrer"`

## Task Commits

1. **Task 1: kind 9 → 주문로그 피드 → 「상태전이」 칩 → 회색 줄 (tracer)** - `b82b789a` (feat)
   - Tracer 게이트: interactive · `end-of-phase` · `<automated>` 만 → verify 재실행 통과 · 확장 진행
2. **Task 2: 챗 진행 표시 · 틱 보기 링크 같은 탭 (TDD)**
   - RED - `666d6a90` (test)
   - GREEN - `87e46d50` (feat)
   - REFACTOR 없음

## TDD Gate Compliance (Task 2)

- **RED:** 새 테스트 3개 모두 실패(진행 표시에 「주문 진단 전문가」 없음 · 틱뷰어 링크 `target="_blank"` · `/admin/users` 가 링크로 렌더). 대상 테스트(`… > 진단문 「틱 보기」 /analytics/ticks? 링크 → 같은 탭(target 없음) · href 그대로`)를 `vitest --reporter=tap-flat -t analytics/ticks` 로 다시 돌려 `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK (target_test_failed)`. **의미 평가:** 대상 테스트가 실제로 실행되어 `expected '_blank' to be null` 단언에서 실패 — 현행 렌더러가 모든 링크를 새 탭으로 여는 바로 그 동작이 이유(로드 · 문법 · 픽스처 실패 아님). 첫 기록은 `not.toHaveAttribute` 의 여러 줄 오류 메시지가 TAP YAML 을 깨 `invalid_record` 였고, 같은 뜻의 한 줄 단언(`getAttribute('target')` → `toBeNull`)으로 바꿔 다시 기록했다.
- **GREEN:** `STEP_ORDER` diagnosis + `a` 렌더러 3갈래 — 챗 4 파일 35 pass.
- **REFACTOR:** 없음.

## Files Created/Modified
- `webapp/src/lib/order-log-feed.ts` - `'state'` 유니온 · 칩 · `KINDS` · `matchesKind` kind 9 분기 · 머리 주석 「상태전이(kind 9 · Phase 39 D-10)」 · `matchesSide` 주석
- `webapp/src/lib/__tests__/order-log-feed.test.ts` - 칩 순서 · state/pre/market · group 0~10 그룹 칩 제외 · group 9 팝업 · 필터 시간순 · 쿼리 왕복 · 「예약」→「상태전이」 설명
- `webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx` - 구분 칩 옵션에 「상태전이」 · 선택 → `kind: 'state'` · data-on
- `webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx` - kind 3 + kind 9 시간순 · 회색 「[상태전이]」 · 「선매수 켜짐」 · 「(milles)」 · 골든 = `orderLogLineText`
- `webapp/src/components/chat/agent-progress.tsx` - `STEP_ORDER` 끝 `"diagnosis"` · 머리 주석 6명
- `webapp/src/components/chat/message-assistant.tsx` - `isTickViewerHref` · `next/link` · 내부 경로 링크 해제 · 머리 주석 D-04
- `webapp/src/components/chat/__tests__/message-render.test.tsx` - D-03 · D-04 테스트 3개

## Decisions Made
- kind 판정에 숫자 9 대신 shared 상수 `STRATEGY_EVENT_KIND.StateTransition` 을 썼다(웹은 labels 파일이 아니라 의존 걱정 없음).
- `matchesSide` 는 코드를 바꾸지 않았다 — 플랜 ①의 「코드 변경이 필요 없으면 테스트로만」 그대로. 주석에 이유를 남겼다.
- 틱뷰어 접두는 `TICKS_BASE` 상수를 import 해 만든다(경로 문자열 한 곳). 수용 기준의 리터럴 `/analytics/ticks?` 는 머리 주석 · 함수 주석에 있다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 증거 기록이 여러 줄 단언 메시지 때문에 거부됐다**
- **Found during:** Task 2 (RED)
- **Issue:** `expect(link).not.toHaveAttribute('target')` 의 실패 메시지가 줄바꿈을 포함해 vitest TAP YAML 이 깨졌고 분류기가 `invalid_record`(Malformed TAP)로 거부
- **Fix:** 같은 뜻의 한 줄 단언 `expect(link.getAttribute('target')).toBeNull()` 로 바꾸고 대상만 다시 실행
- **Files modified:** webapp/src/components/chat/__tests__/message-render.test.tsx
- **Verification:** `RED_EVIDENCE_OK (target_test_failed)` · GREEN 뒤 통과
- **Committed in:** `666d6a90` (RED 커밋)

---

**Total deviations:** 1 auto-fixed (Rule 3 — 증거 형식)
**Impact on plan:** 단언 의미 동일 · 범위 확장 없음.

## Issues Encountered
- Task 1 첫 실행에서 시간순 단언이 `indexOf(buy)` 객체 동일성에 기대 실패(픽스처의 `STRATEGY_DAY_BY_NAME` 과 `STRATEGY_DAY_ROWS` 원소가 같은 객체가 아님) — seq · kind 로 찾도록 고쳐 해결(커밋 전).

## 39-02 후속 확인
- 39-02 SUMMARY 가 적은 「kind 9 · group 9 행이 카드 팝업 「자동매도」 에 들어간다」 는 이 플랜 범위 안이었다 — `matchesKind` 의 그룹 칩 제외가 `matchesSide('auto')` 까지 덮는다. 테스트 「kind 9 · group 9 → 「자동매도」 칩 · 팝업 자동매도 · 매수 · 매도 거짓 · 팝업 「전체」 만 참」 으로 잠금. 남은 후속 없음.

## Verification
- `pnpm --filter @gh-radar/shared build` 성공 · `pnpm --filter @gh-radar/webapp run typecheck` 오류 0
- `vitest run src/lib/__tests__/order-log-feed.test.ts src/components/trading/order-log --maxWorkers=2` — 5 파일 96 pass
- `vitest run src/components/chat --maxWorkers=2` — 4 파일 35 pass
- 플랜 전체 재실행(위 두 묶음 합) — 9 파일 131 pass
- 수용 기준 grep: `value: 'state', label: '상태전이'` = 1 · `'state'`(order-log-feed.ts) = 5 · `"diagnosis"`(agent-progress) = 1 · `/analytics/ticks?`(message-assistant) = 2

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness
- D-10(웹 칩 · 회색 줄) · D-03(진행 표시) · D-04(링크) 웹 몫 완료 — 39-09 에서 gh-trade 서버보다 먼저 webapp 을 배포할 수 있다.
- 시각 확인(회색 줄 · 칩 폭 · 「틱 보기」 이동)은 39-09 UAT.

## Self-Check: PASSED
- 커밋 b82b789a · 666d6a90 · 87e46d50 모두 이 브랜치에 있음 · 수정 파일 7개 존재

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*
