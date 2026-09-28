---
phase: 24-limitchaser-buy3
plan: 14
subsystem: ui
tags: [react, hooks, concurrency, limit-chaser, lc.set, vitest, gap-closure]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-12 lcLegacyBlockOf 전송 직전 가드(대기열에서 꺼낼 때 포함) · 24-10/24-13 commitGroupSwitch 사전 검증 · D-16 · 24-07 preBuyAutoChecksOf/preBuyAutoCheckLogLine"
provides:
  - "LcCompanions 타입 — 동반 필드 = 값 | (base) => Partial<LimitChaserFormValues> (판정 시점 계산)"
  - "훅 companionsAt(p, base) · baseNow() · reshow(p, next) — 확정 no-op · 대기 진입 · 같은 필드 재확정 · 꺼낼 때 no-op · 전송 조립 · failQueue 가 같은 계산"
  - "failQueue 가 sameAsServer 로 동반까지 비교(WR-04)"
  - "동반은 불리언만 낙관 표시 · 되돌림(booleanCompanions · IN-05)"
  - "폼 autoCheckRef(마지막 자동 체크 계산) · pendingAutoCheckRef = { gate, seqAtSend } — 24-17(D-35) 이 넓힐 자리"
affects: [24-17, limit-chaser-form, use-lc-field-commit, strategy-card]

actuals:
  tokens: 10172
  tasks: 2
  commits: 4
plan_head_before: e5f73d9e829f16093cc5e8439733f8ae6ac7d6e7

tech-stack:
  added: []
  patterns:
    - "지연 계산 동반(LcCompanions 함수) — 대기열 항목은 누른 순간 스냅샷이 아니라 꺼내는 순간 서버 동기값으로 다시 계산"
    - "reshow — 동반 계산 결과 키가 바뀌면 빠진 키 되돌림 + 새 키 되돌림 기준, 같은 필드 재확정과 꺼낼 때 재계산이 한 헬퍼"
    - "로그 = 실제 전송 판정 — 자동 체크 로그 줄은 성공 뒤 마지막 계산(autoCheckRef)으로 만든다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx

key-decisions:
  - "24-14: 동반 필드는 값 또는 (base) => 동반 함수(LcCompanions) — 대기 건은 꺼내는 순간의 서버 동기값으로 다시 계산한다(WR-03). 선매수 켜기의 자동 체크 · D-01 마스터 동반 모두 전송 시점 서버 값 기준. 사전 검증 · D-16 은 누르는 순간 판정(R7) 그대로"
  - "24-14: failQueue 의 「서버가 이미 그 값」 판정은 drain · 즉시 경로와 같은 sameAsServer(주 필드 + 지금 계산한 동반) — 주 필드만 같다고 성공으로 접지 않는다(WR-04)"
  - "24-14: 동반은 불리언만 낙관 표시 · 되돌림 — 매도 주문가격 · 비교가격 채움은 cfg 에만 싣고 에코 뒤 표시(IN-05 · 훅 ④ 불변식)"
  - "24-14: 자동 체크 로그는 성공 뒤 autoCheckRef(마지막 계산 = 실제 전송 판정)로 — pendingAutoCheckRef 는 { gate, seqAtSend } 만(24-17 이 추가매수로 넓힘)"

patterns-established:
  - "LcCompanions: 동반 필드를 판정 시점 함수로 넘겨 대기열 동시성을 해소한다 — 새 훅 · 새 전송 경로 없이"

requirements-completed: []

coverage:
  - id: D1
    description: "대기열 선매수 켜기가 꺼내는 순간 서버 값으로 동반을 다시 계산 — 사람이 방금 확정한 매도 주문가격(120,000)을 지키고, 0 이 된 매도 매수잔량에 매도 3체크를 싣지 않는다 · 로그는 실제 전송 판정"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-03 — 대기열 선매수 켜기의 동반 필드는 꺼내는 순간 다시 계산된다 (24-VERIFICATION 갭 3)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-03 — 함수 companions 는 꺼내는 순간의 서버 동기값으로 계산된다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-03 — 함수 companions 의 no-op 판정도 판정 시점 계산이다"
        status: pass
    human_judgment: false
  - id: D2
    description: "앞 건 실패로 대기 건을 접을 때 동반 마스터까지 비교 — 불일치면 실패 표시 + 서버 값(ON) 되돌림 · 재전송 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-04 — 앞 건 실패로 대기 건을 접을 때 주 필드만 같다고 성공으로 접지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-04 대조"
        status: pass
    human_judgment: false
  - id: D3
    description: "동반 값 필드(매도 가격 채움)는 에코 전 폼에 보이지 않고 cfg 에만 실린다 · 불리언만 낙관 표시 · 되돌림"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#IN-05 — 동반 값 필드(매도 주문가격)는 에코 전에 폼에 넣지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#IN-05 — 클릭 직후 매도 스위치는 낙관 ON 이지만 매도 주문가격 행 글자는 클릭 전 그대로"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-3|P24-4|P24-10\""
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-09-28
---

# Phase 24 Plan 14: 대기열 확정의 동반 필드 동시성 (WR-03 · WR-04 · IN-05) Summary

**대기열 선매수 켜기의 동반 필드를 `(base) => …` 함수(`LcCompanions`)로 넘긴다. 꺼내는 순간의 서버 동기값으로 다시 계산해 사람이 방금 확정한 매도 가격을 지키고, 0 이 된 잔량에는 무장 플래그를 싣지 않는다. `failQueue` 는 동반까지 비교하고, 동반 값 필드는 에코 전에 폼에 넣지 않는다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-28T04:55:18Z
- **Completed:** 2026-09-28T05:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- **WR-03:** 훅에 `LcCompanions`(값 | 함수), `companionsAt`, `baseNow`, `reshow` 를 넣었다. 동반은 판정 시점마다 다시 계산한다(확정 no-op · 대기 진입의 낙관 표시와 되돌림 기준 · 같은 필드 재확정 · 꺼낼 때 no-op · 전송 조립). in-flight 기록에는 실제로 실은 계산 결과(값)가 남는다.
- **폼:** 선매수 켜기 동반을 `(base) => …` 로 넘긴다. 자동 체크(D-06 · D-07 · D-20)와 D-01 마스터 동반 모두 전송 시점 서버 값으로 계산한다. 마지막 계산은 `autoCheckRef` 에 남고, 로그 줄은 성공 뒤 그 값으로 만든다. `pendingAutoCheckRef` 는 `{ gate, seqAtSend }` 만 쥔다.
- **WR-04:** `failQueue` 가 `sameAsServer(server, q.field, q.value, companionsAt(q, baseNow()))` 로 판정한다. 주 필드만 같다고 성공으로 접지 않으므로, 보내지 않은 동반 마스터 OFF 가 화면에 낙관 OFF 로 남지 않는다.
- **IN-05:** `booleanCompanions` 필터를 거쳐 `showToggle` 과 `reshow` 의 빠진 키 되돌림이 불리언만 적용한다. 훅 머리 ④ · ⑪ 문구도 이에 맞춰 고쳤다.

## Task Commits

1. **Task 1 (tracer) RED:** `4b6c312c` test(24-14): 대기열 선매수 켜기의 동반 필드가 꺼내는 순간 다시 계산되는지 (WR-03 RED)
2. **Task 1 GREEN:** `afb8a679` fix(24-14): 대기열 선매수 켜기의 동반 필드를 꺼내는 순간 다시 계산한다 (WR-03)
3. **Task 2 RED:** `e8951f11` test(24-14): 대기 건 폐기가 동반 필드까지 보는지 · 동반 값 필드 비낙관 (WR-04 · IN-05 RED)
4. **Task 2 GREEN:** `6b403f35` fix(24-14): 대기 건 폐기가 동반 필드까지 비교하고 동반 값 필드는 낙관 반영하지 않는다 (WR-04 · IN-05)

## TDD Gate Compliance

vitest 출력에는 node:test 식 `# tests/# pass` 요약 줄이 없다. 그래서 `tdd-red-evidence` 대신 대상 테스트 이름과 단언 실패로 RED 를 확인했다.

- **① RED (WR-03 · 폼):** 「매도 주문가격 120,000 확정(in-flight) → 선매수 켜기(대기)」에서 둘째 cfg 의 `sellOrderPrice` 는 기대값이 `120000`, 실제값이 `150800` 이었다(낡은 상한가 채움이 덮음). 「D-07 낡은 플래그」 케이스는 `expected … to have a length of 2 but got 1` 로 실패했다. 낡은 `sellEnabled: true` 때문에 무장 가드가 선매수 켜기까지 막아 전송이 0 이었다.
- **RED (WR-04 · 훅):** 「WR-04 — 앞 건 실패로 대기 건을 접을 때…」가 `failures.preBuyEnabled?.reason` 에서 `expected undefined to be 'rejected'` 로 실패했다. 주 필드만 보고 성공으로 접었기 때문이다. 이 테스트는 GREEN 전에 두 렌더 순서로 고쳤고(아래 편차 1), 고친 판에서도 `failQueue` 를 옛 줄로 임시로 되돌려 같은 단언이 실패함을 다시 확인했다.
- **RED (IN-05):** 훅 테스트는 `expected 150800 to be 130000` 으로 실패했다(동반 매도 가격이 낙관 반영됨). 폼 테스트는 `expected '150,800원' to be '0원'` 으로 실패했다.
- **GREEN:** 모든 대상 케이스가 통과한다. REFACTOR 커밋은 없다(GREEN 커밋 안에서 정리함).

## Verification

- Task 1 verify: 훅 · 폼 · 카드 흐름 3파일 **314 passed**. shared build OK, webapp typecheck `error TS` 0.
- Task 2 verify: `vitest --run src/components/trading src/lib` **77 files · 2112 passed · 1 skipped**. shared build OK, typecheck 0.
- webapp 단위 전체(`pnpm --filter @gh-radar/webapp run test`): **125 files · 2722 passed · 1 skipped**.
- e2e `trading-workbench.spec.ts -g "P24-3|P24-4|P24-10"`: **4 passed**(setup 포함).
- Acceptance grep 기준을 모두 통과했다. `export type LcCompanions` 1 · `companionsAt(` 4 · `autoCheckRef` 5 · commitGroupSwitch `(base) =>` 1 · failQueue `sameAsServer(server, q.field, q.value` 1 / `server[q.field] === q.value` 0 · `=== 'boolean'` 1.

## Decisions Made

- `commitGroupSwitch` 켜는 방향에서 누르는 순간의 기준값 변수를 `base` 에서 `pressed` 로 바꿨다. 동반 함수 인자 `(base) =>` 와 이름이 겹치지 않게 하려는 것이고, 사전 검증 · D-16 은 여전히 `pressed` 로 판정한다(R7).
- 자동 체크 대기 표시는 선매수 켜기에서만 세운다(`autoChecks = gate === 'preBuyEnabled'`). 추가매수 · 후매수에는 로그 대기가 없다. 모양은 `{ gate, seqAtSend }` 로 일반화했고, 로그 이펙트의 실패 · 성공 · 서버 확인은 `pending.gate` 를 읽는다. 24-17 은 조건만 넓히면 된다.
- 끄는 방향(D-02 전반)의 값 동반 `{ buyEnabled: false }` 는 바꾸지 않았다. 사람이 누른 순간의 「마지막 그룹」 판단이 의도다.

## Deviations from Plan

### 테스트 모양 조정

**1. [Rule 1 - 테스트 순서] WR-04 훅 테스트의 에코와 답 신호를 두 렌더로 나눴다**
- **Found during:** Task 2 GREEN
- **Issue:** RED 커밋 판은 에코와 답 신호를 한 렌더(`update({ server, serverAnswerSeq: 1 })`)에 줬다. 이렇게 하면 같은 효과 실행의 ③ 「늦은 에코」 전이(주 필드만 비교 · 계획상 바꾸지 않는 규칙)가 방금 세운 대기 건 실패를 곧바로 성공으로 바꿔, 실패 표시 단언이 GREEN 에서도 실패했다. 폼 되돌림(마스터 ON)은 이미 된 상태였다.
- **Fix:** 훅 머리 ⑦ 의 카드 순서(에코 → 한 렌더 뒤 답 신호)대로 두 번의 `update` 로 흉내 냈다. 대조 케이스도 같은 모양으로 맞췄다. 늦은 에코 규칙은 계획대로 바꾸지 않았다.
- **Files modified:** webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
- **Commit:** 6b403f35

**Total deviations:** 1(테스트 모양). **Impact:** 제품 코드 범위는 계획과 같다.

## Issues Encountered / Notes

- **잔여(범위 밖 · 늦은 에코 규칙):** ③ 늦은 에코는 기록된 `rejected`/`timeout` 실패를 **주 필드 값만** 보고 성공으로 바꾼다. 그래서 WR-04 로 실패 표시된 대기 건(주 필드는 서버와 같고 동반 마스터는 다름)은 그 뒤 아무 에코든 오면 실패 표시만 걷힌다. 폼 값은 `failQueue` 가 이미 서버 값으로 되돌렸으므로 「보인 값 = 서버 값」은 유지된다. 계획이 「늦은 에코 규칙은 바꾸지 않는다」고 정했기 때문에 기록만 남긴다.
- 빠진 동반 키는 계획대로 `prevCompanions`(확정 직전 폼 값)로 되돌린다. 그사이 다른 단말이 그 불리언을 바꿨다면 다음 에코가 올 때까지 옛 값이 보일 수 있다. 이것은 훅의 기존 되돌림 의미(`revertToggle`)와 같은 성질이다.

## Known Stubs

없음.

## Next Phase Readiness

- 24-17(D-35 추가매수 켬 자동 체크)은 `commitGroupSwitch` 의 동반 함수 · `autoCheckRef` · `{ gate, seqAtSend }` 위에 올리면 된다. `autoChecks` 조건과 자동 체크 계산 함수를 그룹 인자로 넓히면 되고, 훅은 바꿀 필요가 없다.
- Ready for 24-15.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/use-lc-field-commit.ts · webapp/src/components/trading/limit-chaser-form.tsx · 두 테스트 파일
- FOUND commits: 4b6c312c · afb8a679 · e8951f11 · 6b403f35
