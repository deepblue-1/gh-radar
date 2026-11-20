---
phase: 44-admin-settlement
plan: 02
subsystem: admin-settlement
tags: [shared, settlement, vitest, tdd]

requires:
  - phase: 44-01
    provides: shared settlement.ts 상수 · 타입 · ledgerFlows · poolAccountRows · poolOk · cumProfit · 검산 픽스처(시드 9건)
provides:
  - shared 정산 계산 — settledSum · openProfit · distributable · shareOf · settleShares · principalCaps · personSummary · hgOf · hgSum · nameVs · payAccount · withdrawAmount · settlePlan · personAllowedFor · sortLedgerRows
  - shared 예수금 반영 증감 — reflectEffect · appliedEffect · effectDiff · addEffects · pendAccKeys
  - shared 장중 판정 — isSettlementMarketHours(평일 KST 08:00 ~ 20:00)
affects: [44-05, 44-06, 44-07, 44-08, 44-09, 44-10, 44-11, 44-12]

actuals:
  tokens: 9084
  tasks: 2
  commits: 4
plan_head_before: c43a2618d7dae35f55d154601b71068444bda538
plan_head_after: e72f2a4ab38ccd4c3f618837d6625cb839a2d9cc

tech-stack:
  added: []
  patterns:
    - "정산 계산 입력은 SettlementCtx { accounts · ledger · settles } 하나 — GET 응답에서 바로 만들고 server · webapp 이 같은 함수를 부른다"
    - "예수금 증감은 SettlementEffect(계좌 → 원) · 0 인 계좌는 넣지 않는다 · 계좌 순서는 SETTLEMENT_ACC_KEYS"
    - "확정 가능 여부는 settlePlan 한 곳(unset → carry → none 순서)"

key-files:
  created:
    - packages/shared/src/__tests__/settlement-reflect.test.ts
  modified:
    - packages/shared/src/settlement.ts
    - packages/shared/src/__tests__/settlement.test.ts

key-decisions:
  - "몫은 Math.trunc(원 미만 0 쪽 버림) · 정산 수익 = 몫의 합 — 목업의 반올림 식은 옮기지 않았다(4 : 3 : 3 에서 합이 수익을 넘는다)"
  - "원금 손실 분담에서 guard(심쥬니) 원금이 음수로 내려가도 own = min(L, max(0, 원금)) — 손실이 음수가 되지 않게 방어"
  - "personAllowedFor 는 출자 · 원금 회수인데 사람이 null 이면 false · accKey 는 필수 인자"
  - "addEffects 도 합이 0 인 계좌를 뺀다(SettlementEffect 계약 하나로 — 목업 addMap 은 0 을 남겼다)"
  - "settlePlan 의 carry 는 플랜 글자 그대로 「기준 있는 묶음 · open ≤ 0」 — open 이 정확히 0 이면 carryKrw 0 인 carry 다(화면 문구 선택은 44-11 몫)"

patterns-established:
  - "정산 계산 함수는 목업 이름을 JSDoc 에 병기(목업 `person` · `caps` · `payAcc` …)"

requirements-completed: []

coverage:
  - id: D1
    description: "정산 계산 — 검산 픽스처 전 항목(정산 전 수익 · 원금 · 사람 · 이체 · 명의 대 몫 · 뺄 계좌) · 4 : 3 : 3 끝전 · 손실 1억 넘음 · 미설정 · 정산 뒤 회귀"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/settlement.test.ts (57 tests — 44-01 23 + 이 플랜 34)"
        status: pass
    human_judgment: false
  - id: D2
    description: "정산 계획 settlePlan(unset · carry · none · 바로 출금 줄 · 만원 미만 버림 · 0원 줄 없음) · 사람-묶음 규칙(D-29) · 거래 줄 순서"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/settlement.test.ts#정산 계획 settlePlan (D-16 · D-17)"
        status: pass
    human_judgment: false
  - id: D3
    description: "예수금 반영 증감(reflectEffect · appliedEffect · effectDiff · addEffects · pendAccKeys) · 장중 판정(isSettlementMarketHours)"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/settlement-reflect.test.ts (18 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared build"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 02: 정산 계산 · 예수금 반영 증감 · 장중 판정 (shared) Summary

**목업의 계산 함수 11개(`share` · `settledSum` · `openProfit` · `dist` · `caps` · `person` · `hgOf` · `hgSum` · `nameVs` · `payAcc` · `outRows`)와 반영 증감 4개(`eff` · `applied` · `diff` · `addMap`)를 원 단위 shared 순수 함수로 옮기고(몫은 버림), 검산 숫자 — 지금 몫 전체 924,500,000 · 심쥬니 72,000,000 · 명의 대 몫 59,500,000 · 4 : 3 : 3 끝전 합 100,000,004 — 를 테스트 52건으로 잠갔다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-11-20T01:01:40Z
- **Completed:** 2026-11-20T01:07:05Z
- **Tasks:** 2 (CALC-OK · REFLECT-MATH-OK 도달)
- **Files modified:** 3 (새 파일 1 · 고친 파일 2)

## Accomplishments

- 정산 계산 한 벌 — 정산 전 수익 · 나눌 수익 · 몫(버림) · 원금 · 사람 요약 · 이체 · 명의 대 몫 · 뺄 계좌 · 바로 출금 금액 · 정산 계획 · 사람-묶음 규칙 · 거래 줄 순서.
- 예수금 반영 증감 — 거래 저장 · 고치기 · 지우기 · 정산 확정 · 취소가 쓰는 증감 계산(못 보낸 증감 빼기 · 0 인 계좌 제외).
- 장중 판정 — 평일 KST `08:00` 이상 `20:00` 미만(NXT 포함 · 기존 `08:00` ~ `15:30` 함수 미사용).

## Task Commits

1. **Task 1: 정산 계산** — RED `6989f5b3` (test) → GREEN `4bc23901` (feat)
2. **Task 2: 반영 증감 · 장중 판정** — RED `9066cefb` (test) → GREEN `e72f2a4a` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 더한 export (`packages/shared/src/settlement.ts`)

- 타입: `SettlementCtx` · `SettlementCaps` · `PersonSummary` · `HgSummary` · `NameVs` · `SettlePlanBlock` · `SettlePlan` · `SettlementEffect`
- 계산: `settledSum` · `openProfit` · `distributable` · `shareOf` · `settleShares` · `principalCaps` · `personSummary` · `hgOf` · `hgSum` · `nameVs` · `payAccount` · `withdrawAmount` · `settlePlan` · `personAllowedFor` · `sortLedgerRows`
- 반영 · 장중: `reflectEffect` · `appliedEffect` · `effectDiff` · `addEffects` · `pendAccKeys` · `isSettlementMarketHours`
- `index.ts` 는 이미 `export * from "./settlement"` — 손대지 않았다. 다른 shared 모듈과 이름 충돌 없음(grep 확인).

### 뒤 플랜이 쓸 시그니처

```ts
settlePlan(pool: SettlementPoolId, ctx: SettlementCtx, outs: readonly SettlementPerson[]): SettlePlan
// SettlePlan { can; block: "unset" | "carry" | "none" | null; openKrw: number | null; distKrw; carryKrw; shares; profitKrw;
//              outs: { who; fromAcc; amountKrw }[] }
appliedEffect(row | null): SettlementEffect   // 결과 키가 하나라도 있으면 「반영했던 것이 있다」(D-23)
effectDiff(cur, want): SettlementEffect       // 고치기 = effectDiff(appliedEffect(old), reflectEffect(new)) · 지우기 = effectDiff(appliedEffect(old), {})
```

## 픽스처 경우 수

| 파일 | 이 플랜이 더한 테스트 | 전체 |
|---|---|---|
| `settlement.test.ts` | 34 (정산 전 수익 3 · 몫 2 · 원금 3 · 사람 5 · 이체 2 · 명의 대 몫 2 · 뺄 계좌 3 · 정산 계획 8 · 정산 뒤 회귀 3 · D-29 2 · 순서 1) | 57 |
| `settlement-reflect.test.ts` | 18 (reflectEffect 4 · appliedEffect 4 · effectDiff 4 · addEffects · pendAccKeys 2 · 장중 4) | 18 |

## 목업과 달라진 점

- **몫 버림(R6):** 목업 반올림 → `Math.trunc`. 정산 수익 = 몫의 합이라 4 : 3 : 3 에서 1 ~ 2원은 정산 전 수익에 남는다(100,000,005 → 100,000,004).
- **원금 방어(R7):** 그 묶음 칸에 없는 사람(현중 · 근형 묶음 계좌의 심쥬니 출자 · 원금 회수)은 더하지 않는다 — 목업은 숫자 아님 값. 손실 분담의 guard 원금은 0 아래로 보지 않는다.
- **남겨 둔 돈:** 저장된 정산 `shares[p]` 를 더한다 — 목업은 지난 정산 몫을 지금 규칙으로 다시 계산했다(D-01 Reversibility).
- **0원 출금 줄 없음(R15):** 바로 출금 금액 = 몫의 만원 미만 버림 · 0 이면 줄을 만들지 않는다.
- **증감 계약:** `pend[acc]` 는 숫자가 아니라 `{ deltaKrw, targetKrw, reason }` — `appliedEffect` 는 `deltaKrw` 를 뺀다. `appliedEffect` · `effectDiff` · `addEffects` 모두 0 인 계좌를 결과에서 뺀다.

## Files Created/Modified

- `packages/shared/src/settlement.ts` — 정산 계산 · 반영 증감 · 장중 판정(+442줄)
- `packages/shared/src/__tests__/settlement.test.ts` — 검산 · 회귀 · 끝전 · 손실 · 미설정 · 계획 · D-29 · 순서(+34건)
- `packages/shared/src/__tests__/settlement-reflect.test.ts` — 반영 증감 · 고치기 차이 · 못 보낸 증감 · 장중 경계(18건 · 새 파일)

## Decisions Made

- 위 frontmatter `key-decisions` 5건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 방어] guard 원금이 음수일 때 손실 분담**
- **Found during:** Task 1
- **Issue:** 목업 식 `own = min(L, caps[guard])` 는 심쥬니가 원금보다 많이 회수하면 own 이 음수가 되어 손실이 음수(이익)로 나온다.
- **Fix:** `own = min(L, max(0, caps[guard]))`. 검산 · D-06 픽스처 값은 그대로.
- **Files modified:** packages/shared/src/settlement.ts
- **Committed in:** 4bc23901

**2. [작은 판단] 플랜 이름 밖의 타입 export `SettlementCaps`**
- `principalCaps` 반환 타입에 이름을 붙였다(뒤 플랜이 원금 표를 그릴 때 쓴다). 추가 export 하나 · 다른 이름 불변.
- **Committed in:** 4bc23901

**3. [환경] `timeout` 명령 없음(macOS)**
- 루프 테스트 상한은 vitest 기본 테스트 시간 제한(5초)으로 대신했다. 새 테스트에 반복문은 픽스처 2회 루프뿐이다.

---

**Total deviations:** 3 (방어 1 · 작은 판단 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 파일은 플랜의 files_modified 3개뿐.

## TDD Gate Compliance

- Task 1: `test(44-02)` 6989f5b3 → `feat(44-02)` 4bc23901 — RED 증거 `RED_EVIDENCE_OK`(tap-flat · 57건 중 새 34건 실패 · 기존 23건 통과). 대상 「사람 (R8 · D-06) > 검산 — 김현중 · 정근형 지금 몫 전체 924,500,000」 이 `TypeError: personSummary is not a function` 으로 실패. 의미 판정: 대상이 실제로 실행되어 플랜이 정한 「함수 없음 실패」 로 떨어졌고 로드 · 문법 · 픽스처 오류는 없다.
- Task 2: `test(44-02)` 9066cefb → `feat(44-02)` e72f2a4a — RED 증거 `RED_EVIDENCE_OK`(18건 전부 실패). 대상 「appliedEffect > 계좌 옮김에서 받은 계좌만 못 보냄 …」 이 `appliedEffect is not a function` 으로 실패. 의미 판정 같음.
- REFACTOR 커밋 없음(GREEN 안에서 정리 끝).

## Issues Encountered

- 없음.

## Known Stubs

- 없음(순수 함수 · 화면 연결은 44-06 이후).

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- server 확정(44-05 · 44-08)은 `settlePlan` 의 `can` · `block` · `outs` 로 409 판정과 바로 출금 줄을 만들고, 반영은 `reflectEffect` · `appliedEffect` · `effectDiff` · `addEffects` 로 계좌별 증감을 얻는다.
- webapp(44-06 ~ 44-11)은 같은 함수로 카드 · 사람 표 · 명의 대 몫 · 정산 시트 · 미리 보기를 그린다. 장중 줄은 `isSettlementMarketHours`.
- 확인 필요: p2 정산 전 수익이 정확히 0 이면 `block: "carry"` · `carryKrw: 0` 이다 — 44-11 이 이때 「나눌 수익이 없습니다」 로 보일지 정해야 한다.

## Verification

- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts --maxWorkers=2` 57 통과 · typecheck · build → CALC-OK
- `… settlement-reflect.test.ts settlement.test.ts` 75 통과 · typecheck · build → REFLECT-MATH-OK
- shared 전체 `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2` — 52 파일 · 1458 통과 · 2 skipped · 실패 0
- 인수 기준: T1 export 9 · Math.round 0 · 100_000_004 2 · 924_500_000 4 · 59_500_000 4 / T2 export 6 · marketHours import 0 · 1200 1 · 480 1 · `2026-11-19T23:30:00Z` 1

## Self-Check: PASSED

- 파일 3개 있음 · 커밋 4개(`6989f5b3` · `4bc23901` · `9066cefb` · `e72f2a4a`) 이 브랜치에 있음 · `pnpm-lock.yaml` 변경 없음 · STATE.md · ROADMAP.md 손대지 않음.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
