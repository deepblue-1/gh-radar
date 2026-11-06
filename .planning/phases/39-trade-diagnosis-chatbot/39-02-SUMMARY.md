---
phase: 39-trade-diagnosis-chatbot
plan: 02
subsystem: shared
tags: [strategy-event, kind9, order-log, labels, webapp]

requires: []
provides:
  - "STRATEGY_EVENT_KIND.StateTransition = 9 · STRATEGY_EVENT_KIND_LABELS[9] = 「상태전이」"
  - "STATE_REASON_LABELS(1차 17 토큰) · STATE_SWITCH_BIT_LABELS(bit0~13) · POST_BUY_STAGE_LABELS · RISK_LATCH_LABELS"
  - "stateReasonLabel(token) · stateSwitchChanges(before, after)"
  - "strategyEventParts case 9 (로그 · 타임라인 공용) · StrategyEventParts.tone \"state\""
  - "strategyEventSide(*, 9) = null"
  - "웹 TONE_CLASS.state · BADGE_TONE.state (회색 · 새 토큰 0)"
affects: [39-05 진단 직렬화(orderLogLineText), 39-06 주문로그 칩 · 필터, 39-09 UAT]

actuals:
  tokens: 6960
  tasks: 2
  commits: 3
plan_head_before: 65764351cf344c56dc2f1d4264de5d196be4ed99
plan_head_after: 27c7f6e223641b973bac09e09555faa905dd90ea

tech-stack:
  added: []
  patterns:
    - "kind 9 낱말은 labels 한 곳(정본) · 문장 조립은 strategyEventParts 한 곳 — 웹 · 카드 · 진단이 같은 orderLogLineText 를 쓴다"
    - "사유 토큰 조회는 Object.hasOwn 정확 일치 — 모르는 토큰 · 프로토타입 키는 원문 그대로"

key-files:
  created: []
  modified:
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/card/card-log-popups.tsx

key-decisions:
  - "kind 9 tone 은 기존 unknown 재사용이 아니라 새 \"state\" — Record<tone> 타입이 웹 색 표 누락을 잡게 한다(색은 기존 --muted-fg · --muted)"
  - "strategyEventSide 는 STRATEGY_EVENT_KIND 를 import 하지 않고 숫자 9 + 주석 — labels 파일은 의존 0 인 표 정본"
  - "단계 문구 판정은 reasonCode 접두(AutoPostBuy* · AutoRisk*) + condThreshold ≠ condActual · 표 밖 값은 원문 숫자"
  - "본문 순서: 스위치 변화 → 단계 → message → (제출자) — 빈 조각은 joinDot 이 거른다"

patterns-established:
  - "kind 9 본문 조립: stateTransitionBody = joinDot([...stateSwitchChanges, stateStageText, message]) + (orderCondition)"

requirements-completed: [SC-4]

coverage:
  - id: D1
    description: "kind 9 RPC 원소 → toStrategyEventRow → orderLogLineText 가 「[상태전이] … 설정 재제출 · 선매수 켜짐(milles)」 문장이 되고 「· 9」 원문 숫자 행위가 없다"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#Phase 39 kind 9 상태전이 문장 (D-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "kind 9 는 group 과 무관하게 방향 null · tone state(회색) — 매수 색 · 방향 필터에 끼지 않는다"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-labels.test.ts#strategyEventSide(*, 9) = null — 상태전이는 방향이 없다(group 1~3 · 4 · 9 여도 · Pitfall 6)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "STATE_REASON_LABELS 는 1차 17 토큰만 · 2차 토큰 부재 · 모르는 토큰 원문 폴백 · 스위치 비트 변화 문구"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-labels.test.ts#Phase 39 kind 9 상태전이 사전 (D-09 · D-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "후매수 · 위험도 단계 전→후 문구(「후매수 단계 감시→보유중」 · 「위험도 래치 대기→무장」) · 타임라인 action = 사유 문구"
    requirement: "SC-4"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#AutoPostBuyFire · 단계 1→2 → 본문에 「후매수 단계 감시→보유중」(스위치 변화 뒤 · 제출자 앞)"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#timelineStrategyText(kind 9) — action 은 사유 문구 · text 에 스위치 변화 · 누적"
        status: pass
    human_judgment: false
  - id: D5
    description: "웹 주문로그 · 카드 팝업에서 kind 9 행의 회색 배지 · 줄이 실제 화면에서 자연스럽게 읽히는가"
    verification: []
    human_judgment: true
    rationale: "시각 확인은 39-09 UAT 몫(UI-SPEC 없음 · 기존 색 토큰만 사용) — 타입검사는 색 표 누락만 잡는다"

duration: 7min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 02: kind 9 「상태전이」 shared 라벨 · 문장 조립 Summary

**kind 9 행이 shared 한 곳에서 「[상태전이] 거래소 | 종목 | 설정 재제출 · 선매수 켜짐(milles)」 문장으로 조립되고, 방향 null · 회색 tone "state" 로 매수 색과 방향 필터에서 빠진다 — 사유 사전 17 토큰 · 스위치 비트 14개 · 후매수/위험도 단계 전→후 문구 포함**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-11-06T04:50:27Z
- **Completed:** 2026-11-06T04:56:51Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `STRATEGY_EVENT_KIND.StateTransition = 9` · 라벨 「상태전이」 — `isMarketStrategyEvent` 는 손대지 않아 kind 9 는 계좌 이벤트 그대로(D-11)
- 사유 사전 `STATE_REASON_LABELS`(1차 17 토큰 · 2차 Latch/Gate/Vi 없음) · `stateReasonLabel`(모르는 토큰 원문 · 빈 문자열 「상태전이」 · 프로토타입 키 안전)
- 스위치 비트셋 `STATE_SWITCH_BIT_LABELS`(bit0~13) · `stateSwitchChanges`(바뀐 비트만 「켜짐/꺼짐」 · bit 순서)
- `strategyEventParts` case 9 — 구분 「상태전이」 · tone `"state"` · 행위 = 사유 문구 · 본문 = 스위치 변화 → 단계 → message → (제출자). 로그 · 타임라인 공용
- `strategyEventSide(*, 9) = null` — group 1~3 으로 와도 매수 색 아님(Pitfall 6)
- 웹 `TONE_CLASS.state` · `BADGE_TONE.state` — 기존 회색 토큰만(새 토큰 0)

## Task Commits

1. **Task 1: kind 9 라벨 · 사유 사전 · case 9 · tone state · 웹 색 표 (tracer)** - `975c8ae1` (feat)
2. **Task 2: 방향 없음 · 단계 전후 문구 (TDD)**
   - RED - `91658ca3` (test)
   - GREEN - `27c7f6e2` (feat)
   - REFACTOR 없음

## TDD Gate Compliance (Task 2)

- **RED:** `strategyEventSide(*, 9) = null` · 단계 표 · 단계 문구 · group 무관 tone 테스트 5개가 실패. 대상 테스트(`strategyEventSide(*, 9) = null — …`)를 `vitest --reporter=tap-flat -t` 로 다시 돌려 `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK (target_test_failed)`. **의미 평가:** 대상 테스트가 실제로 실행되어 `expected 'buy' to be null` 단언에서 실패 — group 1~3 이 kind 보다 먼저 buy 를 돌려주는 바로 그 결함이 이유(로드 · 문법 실패 아님). 첫 시도는 pnpm 배너와 vitest TAP 의 여러 줄 YAML(다른 실패 테스트의 객체 diff) 때문에 `invalid_record` 였고, 대상만 거른 실행으로 다시 기록했다.
- **GREEN:** `strategyEventSide` 첫 줄 kind 9 분기 + 단계 표 · `stateStageText` — shared 전체 1149 pass.
- **REFACTOR:** 없음.

## Files Created/Modified
- `packages/shared/src/strategy-event.ts` - `StateTransition: 9` + JSDoc(칸 재해석)
- `packages/shared/src/strategy-event-labels.ts` - kind 9 라벨 · 사유 사전 · 스위치 비트 · 단계 표 · `stateReasonLabel` · `stateSwitchChanges` · `strategyEventSide` kind 9 null
- `packages/shared/src/strategy-event-text.ts` - tone `"state"` · case 9 · `stateTransitionBody` · `stateStageText`
- `packages/shared/src/__tests__/strategy-event-labels.test.ts` - kind 9 표 · 사전 · 비트 · 방향 · 단계 표 테스트, 기존 kind 라벨 기대값 갱신
- `packages/shared/src/__tests__/strategy-event-text.test.ts` - RPC 원소 → 매퍼 → 평문 · parts · 단계 문구 · 타임라인 테스트
- `webapp/src/components/trading/order-log/order-log-list.tsx` - `TONE_CLASS.state`
- `webapp/src/components/trading/card/card-log-popups.tsx` - `BADGE_TONE.state`

## Decisions Made
- tone 은 `"unknown"` 재사용 대신 새 `"state"` — `Record<StrategyEventParts['tone'], string>` 이 웹 색 표 누락을 타입 오류로 잡는다(색 값은 기존 회색과 같다).
- labels 파일은 의존이 없는 표 정본이라 `STRATEGY_EVENT_KIND` 를 import 하지 않고 숫자 9 + 주석으로 썼다(순환 위험 회피).
- 단계 문구는 사유 접두(`AutoPostBuy*` · `AutoRisk*`)와 전 ≠ 후일 때만 — 표 밖 값은 원문 숫자(D-10).
- 낱말은 RESEARCH §Pattern 9 초안 그대로 — gh-trade 구현 노트 회신 뒤 맞춘다(D-10). 39-01 노트(`39-KIND9-NOTE.md`)는 이 worktree 기준 아직 없어 RESEARCH 표를 정본으로 썼다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 strategyEventSide 전수 테스트가 kind 9 를 「예약 kind」 로 잠그고 있었다**
- **Found during:** Task 2 (GREEN 뒤 shared 전체 vitest)
- **Issue:** `strategy-event-labels.test.ts` 「strategyEventSide(group, kind) — 0~6 은 kind 무관 옛 규칙 …」 가 KINDS 에 9 를 넣어 group 1~3 → buy · group 7 kind 9 → null · group 9 → sell 을 단언 — 계획된 D-10 변경(kind 9 → null)과 충돌
- **Fix:** 루프 KINDS 에서 9 를 빼고(10 으로 대체) `strategyEventSide(g, 9)` 를 group 0~10 전부 null 로 따로 단언
- **Files modified:** packages/shared/src/__tests__/strategy-event-labels.test.ts
- **Verification:** shared 전체 44 파일 1149 pass
- **Committed in:** `27c7f6e2` (GREEN 커밋)

---

**Total deviations:** 1 auto-fixed (Rule 1 — 계획된 동작 변경에 따른 옛 단언 갱신)
**Impact on plan:** 범위 확장 없음. 옛 group 규칙(0~8 · 10)은 바이트 동일하게 그대로 잠겨 있다.

## Issues Encountered
- RED 증거 분류기가 첫 기록을 `invalid_record` 로 거부(pnpm 배너 · 여러 줄 YAML) — 위 TDD 절대로 대상 테스트만 거른 실행으로 다시 기록해 해결.

## 웹 영향 확인 (Task 2 ④)
- `webapp/src/lib/__tests__/order-log-feed.test.ts` + `src/components/trading/order-log` — 5 파일 88 pass(「예약 kind 9(계좌 '')는 시세가 아니다」 포함). `matchesSide` 는 tone 으로 거르므로 kind 9(tone state)는 「전체」 에만 보인다. 다만 kind 9 · group 9 행은 `matchesKind('auto')`(group 축)로 「자동매도」 칩에 들어간다 — 그룹 칩 · 필터 정리는 39-06 몫이라 고치지 않았다.

## Verification
- `pnpm --filter @gh-radar/shared build` 성공
- shared 전체 vitest: 44 파일 · 1149 pass · 2 skipped
- relay `typecheck` · `typecheck:tests` · webapp `typecheck` — 오류 0
- 수용 기준 grep: `StateTransition: 9` = 1 · `9: "상태전이"` = 1 · `LatchSellOn|GateConsumed|ViNoOrder`(labels) = 0 · 웹 두 파일 `state:` 각 1 · `strategyEventSide` 둘째 줄이 kind 9 분기 · `POST_BUY_STAGE_LABELS` · `RISK_LATCH_LABELS` 각 ≥1

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness
- 39-05 진단 직렬화는 `orderLogLineText` 를 그대로 쓰면 kind 9 가 「상태전이」 문장으로 나온다.
- 39-06 은 `OrderLogKindFilter` `'state'` 칩 · 그룹 칩에서 kind 9 제외(group 9 자동매도 칩 포함)를 다룬다.
- 낱말은 초안 — gh-trade 회신 노트가 오면 `STATE_REASON_LABELS` 값만 바꾸면 세 표면이 같이 바뀐다.

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*
