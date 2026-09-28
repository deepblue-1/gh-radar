---
phase: 24-limitchaser-buy3
plan: 17
subsystem: ui
tags: [react, limit-chaser, lc.set, auto-check, vitest, playwright, gap-closure]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-14 꺼낼 때 계산하는 동반 함수 · autoCheckRef · pendingAutoCheckRef { gate, seqAtSend } · 24-15 lib/폼/e2e/UI-SPEC 최신판"
provides:
  - "lib AutoCheckGate = 'preBuyEnabled' | 'extraBuyEnabled' · groupAutoChecksOf(gate, values, upperLimit) · groupAutoCheckLogLine(result) · 타입 AutoCheckItem · AutoCheckReason · GroupAutoCheckResult(groupLabel)"
  - "폼 commitGroupSwitch — 사람의 추가매수 켬도 매도 · 취소 6체크를 같은 lc.set 에 동반(사전 검증 · D-16 뒤 · 꺼낼 때 계산)"
  - "e2e P24-12 — 추가매수 켜기 한 번 = 10 한 건 · 로그 「추가매수 자동 체크 — 켬: 」 · 「추가매수 체크 — 매수주문도 켬」"
  - "UI-SPEC 갭 클로징 부록 소절 「D-35 추가매수 켬 자동 체크(2026-09-28 · 24-17)」"
affects: [24-16, limit-chaser-form, strategy-log]

actuals:
  tokens: 9304
  tasks: 2
  commits: 3
plan_head_before: 1e9c593953291a603c4457bece1d54283dc342a6

tech-stack:
  added: []
  patterns:
    - "그룹 인자 한 벌 판정 — 같은 규칙을 그룹별로 복제하지 않고 gate 인자는 표시 이름(groupLabel)만 정한다"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md

key-decisions:
  - "24-17: D-35 — 사람이 추가매수를 켤 때도 선매수와 같은 규칙으로 매도 · 취소 6체크를 한 lc.set 에 싣는다. 판정은 lib groupAutoChecksOf(gate, …) 한 벌이고 gate 는 로그 첫머리 그룹 이름만 정한다(종전 선매수 전용 이름은 별칭 없이 대체). 후매수는 AutoCheckGate 타입에서 빠진다"
  - "24-17: 순서 = 사전 검증 줄 → D-16 → 자동 체크. 거부면 전송 · 자동 체크 · 자동 체크 로그 모두 0. 로그는 「{선매수|추가매수} 자동 체크 — …」 이고 선매수 문장은 한 글자도 바뀌지 않는다"

patterns-established:
  - "자동 체크 트리거 목록 확장은 폼의 autoGate 한 줄 + lib AutoCheckGate 타입 한 줄 — 판정 · 로그 · 대기열 경로는 공유"

requirements-completed: []

coverage:
  - id: D1
    description: "lib 자동 체크가 그룹 인자 한 벌 — 추가매수 판정 = 선매수 판정(8케이스) · groupLabel 만 다름 · 로그 첫머리만 그룹 이름 · 선매수 문장 불변"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#D-35 — groupAutoChecksOf · groupAutoCheckLogLine 은 그룹 인자 한 벌 (추가매수 켬 자동 체크)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#groupAutoChecksOf(preBuyEnabled) — 선매수 자동 체크 (24-07 D-06 · D-07 · D-20)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#groupAutoCheckLogLine — 자동 체크 로그 한 줄 문법 (UI-SPEC · D-06 — 6줄 폭증 금지)"
        status: pass
    human_judgment: false
  - id: D2
    description: "폼 — 추가매수 켬 한 번 = 한 제출(추가매수 · 마스터 · 6체크 · 상한가 채움) · 성공 뒤 로그 한 줄 · D-16/사전 검증 먼저 · 이미 켜진 체크 불변 · 다시 꺼도 유지 · 거부 되돌림 · 대기열 꺼낼 때 계산 · 후매수/에코 대상 아님"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#D-35 — 추가매수 켬도 선매수처럼 매도 · 취소 6체크를 같은 제출에 (2026-09-28 사용자 지시)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑲ 선매수 자동 체크 D-06 · D-07 · D-08"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-03 — 대기열 선매수 켜기의 동반 필드는 꺼내는 순간 다시 계산된다"
        status: pass
    human_judgment: false
  - id: D3
    description: "진짜 브라우저 → relay → 스텁 게이트웨이 경로에서 추가매수 켜기 한 번 = 10 한 건(6체크 · 마스터) → 에코 → 로그 두 줄"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-12|P24-3|P24-5\""
        status: pass
    human_judgment: false
  - id: D4
    description: "WinForms 와 같은 손동작 결과인지(사용자 체감) — 추가매수 켬 뒤 매도 · 취소 카드 상태가 기대와 같은가"
    human_judgment: true
    rationale: "두 클라 동형 여부는 실서버 · WinForms 대조가 필요 — 24-16 체크포인트에서 사용자 확인"

duration: 8min
completed: 2026-09-28
---

# Phase 24 Plan 17: D-35 추가매수 켬 자동 체크 Summary

**사람이 추가매수를 켜면 선매수와 같은 규칙으로 매도 · 취소 6체크 + 마스터가 한 `lc.set` 에 실리고, 판정은 lib `groupAutoChecksOf(gate, …)` 한 벌 · 로그는 「{선매수|추가매수} 자동 체크 — …」 로 일반화됐다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-28T05:16:41Z
- **Completed:** 2026-09-28T05:25:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- lib 자동 체크 절 일반화: `AutoCheckGate` · `groupAutoChecksOf` · `groupAutoCheckLogLine` · 타입 `AutoCheckItem` · `AutoCheckReason` · `GroupAutoCheckResult`(`groupLabel`). 판정 규칙 · 사유 어휘는 그대로 두었고, 종전 선매수 전용 이름은 별칭 없이 대체했다(제품 · 테스트 잔존 0).
- 폼 `commitGroupSwitch` 켜는 방향: `autoGate` 가 선매수 · 추가매수면 동반 함수가 `groupAutoChecksOf` 를 부른다. 사전 검증 줄과 D-16 뒤에서 돌고, 꺼낼 때 계산(WR-03)과 `autoCheckRef` · `pendingAutoCheckRef { gate }` 를 그대로 쓴다. 후매수는 마스터 동반만 한다. 로그 이펙트는 기록된 gate 로 판정하고, 줄은 `groupAutoCheckLogLine(autoCheckRef.current)` 로 만든다.
- 단위 테스트: lib D-35 describe(판정 동치 8케이스 · 로그 문구 4) · 폼 D-35 describe 8케이스. ⑲ 의 「추가매수 · 후매수 켜기에는 자동 체크가 없다」 는 후매수 전용으로 좁혔다.
- e2e P24-12(고정 대기 없음 · 이벤트 기준 개수)와 UI-SPEC 부록 소절 「D-35 추가매수 켬 자동 체크」를 추가했다.

## Task Commits

1. **Task 1 RED: 폼 D-35 describe** - `80325ee4` (test)
2. **Task 1 GREEN: lib 일반화 · 폼 동반 · 로그 gate** - `be2b6396` (feat)
3. **Task 2: e2e P24-12 · UI-SPEC 부록** - `7d0176d0` (test)

## TDD Gate Compliance

- **RED (`80325ee4`):** `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx` → `Tests 5 failed | 184 passed (189)`. 실패한 5건은 모두 D-35 describe 안의 대상 테스트이고, 계획된 동작에 대한 assertion 에서 실패했다. 대표 사례는 「마스터 OFF 에서 추가매수 클릭 → … 6체크 …」 의 `AssertionError: expected { buyWatchPrice: 130000, …(42) } to match object { extraBuyEnabled: true, …(10) }` 이다(cfg 의 6체크가 false). 같은 식으로 이미 켜진 체크 · 거부 되돌림 · 대기열 케이스가 실패했다. 「다시 꺼도 유지」 의 RED 실패는 답 신호 장벽 흉내가 빠져 생긴 것이었다(아래 Deviations 1). 나머지 3건은 이미 성립하는 가드라 RED 에서도 통과했다(D-16 먼저 · 사전 검증 먼저 · 후매수/에코 대상 아님). `gsd-tools check tdd-red-evidence` 는 vitest 출력을 파싱하지 못해 `INVALID_RED(invalid_record)` 를 돌려줬다(프로젝트 규칙에 적힌 알려진 한계). 그래서 RED 는 대상 테스트 이름과 assertion 실패로 확인했다.
- **GREEN (`be2b6396`):** `vitest --run src/lib src/components/trading` → 77 files · 2147 passed | 1 skipped. typecheck 도 통과했다.
- **REFACTOR:** 없음(변경 불필요).

## Files Created/Modified

- `webapp/src/lib/limit-chaser.ts` - 자동 체크 절을 그룹 인자 한 벌로 바꿨다(groupLabel 표 · JSDoc 트리거 D-35).
- `webapp/src/lib/__tests__/limit-chaser.test.ts` - 종전 이름을 새 이름으로 옮기고 D-35 describe 를 더했다.
- `webapp/src/components/trading/limit-chaser-form.tsx` - autoGate(선매수 · 추가매수) · groupAutoChecksOf · groupAutoCheckLogLine · 주석 D-35.
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` - D-35 describe 8건을 더하고 ⑲ 마지막 케이스를 후매수로 좁혔다.
- `webapp/e2e/specs/trading-workbench.spec.ts` - P24-12 추가.
- `.planning/phases/24-limitchaser-buy3/24-UI-SPEC.md` - 갭 클로징 부록 소절 「D-35 추가매수 켬 자동 체크」 추가.

## Decisions Made

- 판정은 lib 한 벌이고 `gate` 는 `groupLabel` 만 정한다. 선매수 · 추가매수가 판정을 복제하지 않는다(plan prohibition).
- 후매수를 `AutoCheckGate` 타입에서 뺐다. 폼에서 후매수가 자동 체크에 닿는 경로가 타입상 없다.
- 로그 이펙트는 24-14 에서 이미 `pending.gate` 로 일반화돼 있었다. 그래서 바꾼 것은 로그 함수 호출과 `pendingAutoCheckRef` 의 gate 타입(`AutoCheckGate`)뿐이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug(테스트)] 「다시 꺼도 유지」 케이스의 둘째 클릭이 대기열에 서 있었음**
- **Found during:** Task 1 GREEN
- **Issue:** 성공 에코(답 신호 1)를 받은 뒤에도 훅의 직렬화 장벽(`popAfterSeqRef` — 성공 뒤 다음 답 신호 대기) 때문에 끄기 클릭이 `queued` 가 된다. 그래서 테스트가 `sentConfigs()` 2건을 바로 기대하면 1건만 보인다. 기존 훅 동작이고, WR-03 describe 가 같은 이유로 답 신호를 두 번 준다.
- **Fix:** 끄기 클릭 뒤 `serverAnswerSeq: 2` 를 한 번 더 주는 rerender 를 넣어 장벽을 흉내 냈다(제품 코드는 바꾸지 않음).
- **Files modified:** webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
- **Commit:** be2b6396

---

**Total deviations:** 1 auto-fixed(테스트 하네스 흉내 보강). **Impact:** 제품 동작 영향 없음. 이 케이스는 이제 「끄는 cfg 에 6체크 true 유지」 를 실제로 단언한다.

## Issues Encountered

None.

## Verification

- 단위(lib · 폼 · 카드 흐름): `vitest --run src/lib src/components/trading` → 2147 passed | 1 skipped.
- 전체: relay 28 files · 651 passed. webapp 125 files · 2757 passed | 1 skipped.
- build 체인(shared build · relay typecheck · typecheck:tests · webapp typecheck + e2e tsconfig) 종료 코드 0.
- e2e: `playwright test e2e/specs/trading-workbench.spec.ts -g "P24-12|P24-3|P24-5"` → 4 passed(setup 포함).
- Acceptance: groupAutoChecksOf/groupAutoCheckLogLine/AutoCheckGate export 각 1 · 종전 이름 잔존 0 · commitGroupSwitch 안 `groupAutoChecksOf(` 1 · `groupAutoCheckLogLine(autoCheckRef.current)` 1 · 폼 describe 1 · `P24-12 D-35` 1 · P24-12 `waitForTimeout` 0 · UI-SPEC 소절 1.

## Next Phase Readiness

- 남은 플랜은 24-16(체크포인트)이다. D-35 는 웹 클라 전용이라 relay 재배포는 필요 없다. 배포는 webapp push 한 번이고, 메인 세션이 맡는다.
- 24-16 체크포인트 확인 항목: 추가매수 켬 결과(매도 · 취소 카드 상태 · 로그 한 줄)가 WinForms 와 같은 손동작 결과인지 사용자가 확인한다(coverage D4).

## Self-Check: PASSED

- FOUND: webapp/src/lib/limit-chaser.ts · webapp/src/components/trading/limit-chaser-form.tsx · webapp/e2e/specs/trading-workbench.spec.ts · .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
- FOUND commits: 80325ee4 · be2b6396 · 7d0176d0
