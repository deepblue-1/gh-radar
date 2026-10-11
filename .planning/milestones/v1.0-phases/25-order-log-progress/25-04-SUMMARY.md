---
phase: 25-order-log-progress
plan: 04
subsystem: shared
tags: [strategy-event, sentence-assembler, golden-test, fixtures, tdd]

requires:
  - phase: 25-01
    provides: "strategy-event 계약 · 표시명 표 6종 + REASON_CODE_OPERATORS · 조립기 kind 3 갈래 · 하루 흐름 픽스처(seq 1·2)"
provides:
  - "strategyEventParts 전 종류(1~8 + 모르는 값) · log/timeline 두 표면 — 본문 동일, 표면 차이는 행위 단어(R6)뿐"
  - "timelineStrategyText(ev) → { action, text } — 주문 줄(kind 3·6)만 그룹 접두(R9) · 누적 꼬리"
  - "기획서 하루 흐름 전량 픽스처(seq 1~14) · STRATEGY_BRANCH_ROWS 갈래 12개(seq 101~112)"
  - "STRATEGY_DAY_GOLDEN 26줄(하루 14 + 갈래 12) · 주문 이벤트 펼침 골든 22건"
  - "strategy-event-labels.test.ts — 표 6종 모든 키 · 연산자 표 20키 = LimitChaser.h 원문"
affects: [25-07, 25-08, 25-09, 25-10]

actuals:
  tokens: 12508
  tasks: 2
  commits: 4
plan_head_before: 2c6da25c2816f4dfa812a416e136eabf21af6a40

tech-stack:
  added: []
  patterns:
    - "조각 배열 → joinDot(빈 조각 거름 · 「 · 」) 한 헬퍼를 모든 본문 · 두 표면이 공유 — 표면별 문장 복제 없음(D-09)"
    - "골든 테스트는 이름 목록을 순회(it.each) — 한 줄 = 한 기대값, 골든 표 키 = 하루 + 갈래 이름 합(빠짐·남음 단언)"

key-files:
  created:
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
  modified:
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__fixtures__/strategy-day.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts

key-decisions:
  - "12453 후매수 조건 연산자는 서버 reason_code(PostBuy 반등 … 잔량>발동잔량)가 정본이라 「>」 — 기획서 · 채택 목업의 「≤」 는 형식 설명용이라 다르다(픽스처 골든 옆 주석)"
  - "모르는 kind 는 그룹을 알아도 tone unknown · 행위 = 원문 kind 숫자 · 본문 \"\" — 조립 규칙 표 「그 밖」 행 그대로(방향색도 지어내지 않는다)"
  - "펼침 그룹 접두는 orderGroupLabel(group) — group 0(None)은 접두 없음(로그 구분 칸만 원문 「0」)"
  - "시세 이벤트를 펼침에 그리면 행위 칸 = 구분 표시명(상한가진입 N차 등) · text = 본문 · 누적 — 주문 타임라인엔 원래 안 오지만 호출돼도 빈 행위가 되지 않게"
  - "남은 거래량 R 이 음수면 U+2212(formatQty) — 양수에 + 는 붙이지 않는다(부호는 오차만 — R8)"
  - "매도 방식은 order_condition 이 빈 값이면 생략, 표 밖 값은 원문 그대로(orderConditionLabel)"

patterns-established:
  - "표시명 표 전수 테스트 — 표 객체 toEqual 로 모든 키를 잠그고, 연산자 표는 헤더 원문 목록(20)과 조건식 없는 사유 목록(13)을 테스트 파일에 옮겨 적어 대조"

requirements-completed: []

coverage:
  - id: D1
    description: "표시명 표 6종 전수(말미 추가 CondMetric 6·7 · CancelReason 7·8·9 포함) · 모르는 값 원문 숫자 · 연산자 표 20키 = LimitChaser.h 원문 · 정확 일치만"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-labels.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "시세 이벤트(상한가노출 · 시초 상한가 · 상한가진입 N차 · 3초 전 이탈) · 모르는 kind · group 0 주문 이벤트 조립"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#조립기 — 시세 이벤트 · 모르는 값 (Phase 25-04 Task 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "주문 이벤트 전 종류(대기 세 갈래 · 첫 체결 · 매도 주문 · 취소 · 거부) + 펼침 표면 — 하루 흐름 14줄 + 갈래 12줄 F-A 골든 · 주문 이벤트 22건 펼침 골든"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#골든 — 기획서 하루 흐름 + 갈래 전량 (Phase 25-04 Task 2 · D-09)"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#조립기 — 주문 이벤트 갈래 (Phase 25-04 Task 2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "shared 전체 · build · webapp typecheck · 픽스처 소비처(webapp order-log · relay-socket · relay 트레이서) 회귀 없음"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-push.test.ts (7 passed) · webapp order-log + relay-socket (112 passed)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 04: 문장 조립기 전 종류 · 펼침 표면 · 하루 흐름 골든 Summary

**shared 조립기 `strategyEventParts` 가 kind 1~8 과 모르는 값을 모두 조립하고, 같은 본문으로 주문로그 탭 F-A 한 줄과 오늘 주문 펼침(`timelineStrategyText`)을 만든다. 기획서 하루 흐름 14줄 + 갈래 12줄 = 26줄을 골든 문자열로 잠갔다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-29T10:23:13Z
- **Completed:** 2026-09-29T10:32:32Z
- **Tasks:** 2 (TDD — RED/GREEN 커밋 쌍 2개)
- **Files modified:** 4 (신규 1)

## Accomplishments

- **골든 26줄**: 하루 흐름 14(`exposed` … `reject` · seq 1~14 시각 순) + 갈래 12(`queuedPartial` … `riseRate` · seq 101~112). 주문 이벤트 22건은 펼침 `{ action, text }` 골든도 함께 있다. 하루 흐름 F-A 문자열 14줄 중 13줄은 채택 목업(`mockup-order-log-tab.html` :135-149)과 한 글자도 다르지 않다.
- **목업과 다른 곳 1군데 — 12453 연산자**: 목업 `조건 매수잔량≤100,000` → 골든 `조건 매수잔량>100,000`. 근거: 연산자는 `reason_code` 원문 정확 일치로만 고른다(D-36). 서버 원문은 `PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)` 이라 `>` 다. 기획서 예시는 「형식 설명용」 이다. 픽스처 골든 옆에 주석으로 남겼다.
- **연산자 표 키 20개**: LimitChaser.h `OrderReasonName` 반환 원문 32개 중 조건식이 있는 20개와 한 글자도 다르지 않다(node 대조 + 테스트 deep-equal). 나머지 12개(폐기 · FillHook · 인수 · 후속 · 포기 · 재진입 · 소진 · 마스터 해제)와 「미상」은 연산자가 null 이다.
- 대기 세 갈래(gh-trade 정정 2026-09-29): 일반 `300주 · 체결예상 930,000 (900,000 + 30,000)` · 일부 `200주 · 100주 즉시체결 · 체결예상 …` · 전량 행위 `즉시체결` + `300주 · 대기 없음`
- 첫 체결 행위: 탭은 `체결`, 펼침은 `첫 체결`(R6). 오차는 부호로만 적는다(+ / U+2212, 색 없음 — R8).
- 매도 주문: `매수1 {가격}·{잔량}주`(bid1_price>0 일 때만) · `{가격}×{수량}주 지정가` · 근거 `체결(… 매도체결 …)` / `체결통보(…)`
- 취소 사유 표시명에는 has_remaining 일 때만 `남은 거래량 R (E − C)` 가 붙는다. E 는 expected_cum 이 0 이면 C + R 로 계산한다.
- 거부 사유는 `message` 원문 그대로 붙인다. split/match/includes 는 0건이다(D-36 · T-25-18).
- 상승률 조건(cond_metric 7)은 bp 를 `3.00%` 로 바꿔 적는다.

## Task Commits

1. **Task 1: 표시명 표 전수 + 시세 이벤트 + 모르는 값**
   - RED `9975f2f2` (test): 5건 실패(exposed · exposedOpen · entered1 · enteredShort · unknownKind). `check tdd-red-evidence` 결과 RED_EVIDENCE_OK
   - GREEN `8fd36fd6` (feat): 25 passed
2. **Task 2: 주문 이벤트 전 종류 + 펼침 표면 + 하루 흐름 전량 골든**
   - RED `4ef8374b` (test): 49건 실패(대상: `queued12451 → 주문로그 탭 F-A 한 줄` assertion). RED_EVIDENCE_OK
   - GREEN `f44c4c55` (feat): 86 passed

REFACTOR 커밋은 없다. GREEN 단계에서 `joinDot` · `conditionText` · `latencyText` · `evidenceText` 를 두 주문 본문이 공유하도록 이미 나눠 두었다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-event-text.test.ts` | 2 files · 86 passed |
| `pnpm --filter @gh-radar/shared exec vitest run` (전체) | 14 files · 237 passed |
| `pnpm --filter @gh-radar/shared build` | success |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 · error TS 0 |
| webapp `src/components/trading/order-log` + `relay-socket.test.ts` (픽스처 소비처) | 2 files · 112 passed |
| relay `tests/journal-push.test.ts` (트레이서 — 픽스처 동적 import) + `typecheck:tests` | 7 passed · exit 0 |
| acceptance grep (Task 1 6항 · Task 2 7항 · message 파싱 0) | 전부 pass |

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|---|---|---|---|---|
| 1 | 9975f2f2 | 8fd36fd6 | — (불필요) | OK |
| 2 | 4ef8374b | f44c4c55 | — (불필요) | OK |

라벨 테스트(`strategy-event-labels.test.ts`)는 25-01 이 표를 이미 완성해 두어 RED 단계부터 통과했다. 새 기능이 아니라 현재 표를 잠그는 특성화 테스트다. RED 판정 대상은 같은 커밋의 조립기 테스트다.

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### 해석 · 도구 적응

**1. [해석] 갈래 골든도 `STRATEGY_DAY_GOLDEN` 한 표에 넣음.** 플랜 Artifacts 의 「`STRATEGY_DAY_GOLDEN` 전량」 을 하루 + 갈래 이름 합으로 읽었다. 테스트가 골든 표 키 = 두 이름 목록의 합을 단언하므로 빠진 이름이나 남는 이름이 생기면 깨진다. `STRATEGY_DAY_ROWS` · `STRATEGY_DAY_DB_ROWS` 에는 여전히 하루 흐름만 있다. 소비처의 「하루」 의미는 바뀌지 않는다.

**2. [해석] 펼침 그룹 접두는 group 0 이면 생략.** 조립 규칙은 「kind 3·6 만 `{그룹 표시명} · `」 이고, group 0(None)은 표시명이 없어(`orderGroupLabel` null) 접두를 붙이지 않았다. 로그 구분 칸은 규칙대로 원문 `0` 이다.

**3. [도구] RED 증거 기록기 적응.** `check tdd-red-evidence` 는 node:test TAP 요약(`# tests/# pass/# fail`)을 읽는데, vitest `tap-flat` 은 이 요약을 내지 않는다. 실제 `ok`/`not ok` 줄 수로 요약 3줄을 계산해 붙인 뒤 판정했다. 실패 테스트 이름과 exit 코드는 원출력 그대로다.

**Total deviations:** 해석 2 · 도구 1. **Impact:** 스코프 변화 없음 · 계약(공개 export 목록) 변화 없음.

## Known Stubs

없음. 25-01 이 남긴 스텁(「kind 3 외 모르는 값 규칙 fallback」)은 이 플랜에서 풀렸다.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- 25-07(목록 결선) · 25-08/09(오늘 주문 펼침 타임라인) · 25-10(창 분리)은 `strategyEventParts` · `orderLogLineText` · `timelineStrategyText` 를 그대로 쓰면 된다. 웹 테스트와 e2e 목 응답은 `@/test-fixtures/strategy-day` 에서 하루 흐름 14줄과 갈래를 재사용한다.
- OrderLogList 는 kind 99 처럼 모르는 kind 에서 이제 `action` 에 원문 숫자를 받는다(이전에는 null). 기존 렌더 테스트는 회귀 없이 통과했다.

## Self-Check: PASSED

- FOUND: packages/shared/src/__tests__/strategy-event-labels.test.ts · strategy-event-text.ts · __fixtures__/strategy-day.ts · __tests__/strategy-event-text.test.ts
- FOUND commits: 9975f2f2 · 8fd36fd6 · 4ef8374b · f44c4c55 (git rev-list 2c6da25c..HEAD = 4)
