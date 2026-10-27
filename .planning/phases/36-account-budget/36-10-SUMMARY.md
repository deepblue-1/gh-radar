---
phase: 36-account-budget
plan: 10
subsystem: shared
tags: [shared, admin, account-budget, pnl, ppm, contract]

requires:
  - phase: 36-01
    provides: "shared account-budget.ts(availableKrwOf · formatManwonFloor) · index.ts 의 export * from \"./account-budget\""
provides:
  - "interpretAdminResult(op: 1..7) — op 6/7 은 code 0 만 ok(D-06)"
  - "AdminAccountCost · AdminAccountCostRow · AdminAccountCostsRaw · AdminAccountBudgetBody · AdminAccountFeeBody"
  - "AdminAccountView.costs? · deriveAdminUsersOverview(raw, endpoints?, costs?) — 67 live 우선 · 87 폴백 · 칩/drift 무관(D-04 · D-05)"
  - "summarizeAccountCosts · AccountCostSummary · AccountBudgetMismatch · AccountFeeMismatch(D-03)"
  - "account-budget.ts: formatPnlManwon · pnlToneOf · formatManwon1 · pctToPpm · ppmToPct · parseCostPct · parseBudgetManwon · COST_PPM_MAX · BUDGET_MANWON_MAX · lcBuyAmountSumKrw"
  - "pnl.ts: PnlRange · PNL_RANGES · PnlGroupBy · PnlTotals · PnlStockRow · PnlDayRow · PnlAccountRef · PnlGroup · PnlReport · pnlRangeOf · formatPnlDay · formatPnlRangeCaption"
affects: [36-02, 36-03, 36-04, 36-06, 36-07, 36-08]

actuals:
  tokens: 12237
  tasks: 2
  commits: 4
plan_head_before: 38c1bfca19d5e348b6e51618b66a7fc5ab6e6212
plan_head_after: 06685cc8c2c817bcfdd92f65d96d1eb85c87f42c

tech-stack:
  added: []
  patterns:
    - "예수금 · 비용률은 서버의 계좌 값 — 색인 키에 dmaUserId 를 넣지 않고(서버 → 정규화 계좌번호 → 행들) 그 DMA 유저 행을 우선, 없으면 같은 계좌의 다른 유저 행(IP/MAC 색인과 다름)"
    - "카드 판정의 등록 서버 목록 계산은 registeredServersOf 한 벌 — summarizeOrderEndpoint · summarizeAccountCosts 가 각자 resolveEffectiveOrderServer 를 부른다(GC-06)"
    - "ppm → % 는 정수 자릿수 문자열 자르기(부동소수 오차 없음) · 손익은 절댓값 내림 후 부호(U+2212)"
    - "KST 날짜 문자열 산술은 Date.UTC 달력 산술 — 실행 TZ 무관"

key-files:
  created:
    - packages/shared/src/pnl.ts
    - packages/shared/src/__tests__/pnl.test.ts
  modified:
    - packages/shared/src/admin.ts
    - packages/shared/src/order-endpoint.ts
    - packages/shared/src/account-budget.ts
    - packages/shared/src/index.ts
    - packages/shared/src/__tests__/admin.test.ts
    - packages/shared/src/__tests__/admin-overview.test.ts
    - packages/shared/src/__tests__/order-endpoint.test.ts
    - packages/shared/src/__tests__/account-budget.test.ts

key-decisions:
  - "costs 색인은 IP/MAC 과 달리 다른 DMA 유저의 같은 계좌 행도 폴백으로 쓴다 — 예수금 · 비용률은 서버 계좌 단위 값(op 3 이 다른 유저 계좌 추가 시 값 복사)이고, plan behavior 「같은 서버 행이 여럿이면 그 DMA 유저 행 우선」 을 그대로 옮겼다"
  - "liveBudgetKrw 0 은 「해제」 정당값 — null 일 때만 87 로 내려간다(36-01 #mergeAccountState 규칙과 같음)"
  - "summarizeAccountCosts unknown 일 때 숫자 칸은 0 · source null — 화면은 state 로 「—」 를 그린다"
  - "registeredServersOf 를 꺼내 summarizeOrderEndpoint 를 그 위로 옮겼다(동작 동일 · 기존 67 케이스 회귀 0) — 출처 규칙이 두 함수에서 갈라지지 않게"

patterns-established:
  - "AdminAccountView 의 서버별 Record 필드(orderEndpoints · costs)는 키 = active 등록 서버 · null = 확인 전 · 87 전용 계좌 {} · 파생은 늘 채움"

requirements-completed: []

coverage:
  - id: D1
    description: "interpretAdminResult op 6/7 — code 0 만 ok · 1/5/8/10/11 failed"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#interpretAdminResult (op 6/7 8케이스)"
        status: pass
    human_judgment: false
  - id: D2
    description: "deriveAdminUsersOverview costs 병합 — live 우선 · 87 폴백 · 서버/계좌 모름 null · DMA 유저 행 우선 · null=생략 · 87 전용 {} · 칩/drift 불변(D-04)"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts#P36 costs 병합 (D-05 · D-04) (7 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "summarizeAccountCosts — 출처 = 유효 주문 서버 · 예수금/비용률 불일치 따로 · 모르는 서버 제외 · 꺼진 지정 무시"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-endpoint.test.ts#summarizeAccountCosts (D-03) (6 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "표기 · 입력 · 상따 합 — formatPnlManwon(U+2212) · formatManwon1 · pct↔ppm · parseCostPct · parseBudgetManwon · lcBuyAmountSumKrw"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/account-budget.test.ts (57 tests — 36-01 11 포함)"
        status: pass
    human_judgment: false
  - id: D5
    description: "pnl 기간 · 일자 표기 — pnlRangeOf 7/30/90/이달(달 · 해 넘김) · 「10/27 (화)」 · 「9/28 ~ 10/27」"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/pnl.test.ts (12 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "계약 확장이 하류를 깨지 않는다 — relay · relay tests · server · webapp typecheck"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck · typecheck:tests · server typecheck · webapp typecheck (전부 exit 0)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 10: shared 계약 한 벌 Summary

**어드민 비용 계약(op 6/7 해석 · 서버별 `costs` · 67 live 우선 병합 · `summarizeAccountCosts`)과 표기 · 입력 · 매매손익 계약(% ↔ ppm · 입력 파서 · U+2212 손익 포맷 · 상따 매수 합 · `pnl.ts` 타입 · 기간 · 일자 표기)을 shared 한 벌로 놓았다 — 런타임 경로 변경 없음, 하류 typecheck 4종 무변경 통과.**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-10-27T14:17:07Z
- **Completed:** 2026-10-27T14:21:45Z
- **Tasks:** 2 (각 RED → GREEN)
- **Files modified:** 10

## Accomplishments
- `interpretAdminResult` op 유니온 1..7 — op 6 SetAccountBudget · op 7 SetAccountFee 는 code 0 만 반영됨(D-06). 런타임 본문은 그대로(op 4/8 · op 2/4 예외는 6/7 에 없다).
- `AdminAccountView.costs?` + `deriveAdminUsersOverview(raw, endpoints?, costs?)` — `indexAccountCosts`(서버 → 정규화 계좌번호 → 행들) · 그 DMA 유저 행 우선 · `liveBudgetKrw` non-null 이면 live, null 이면 87 snapshot. 칩 · drift 는 costs 유무와 같다(D-04 테스트로 잠금).
- `summarizeAccountCosts` — `summarizeOrderEndpoint` 동형. 등록 서버 목록 계산을 `registeredServersOf` 로 꺼내 두 함수가 공유하고, 각자 `resolveEffectiveOrderServer` 를 부른다.
- `account-budget.ts` 에 표기 · 파서 · `lcBuyAmountSumKrw` 추가(36-01 케이스 11개 회귀 0). 신규 `pnl.ts` + barrel `export * from "./pnl"`.

## 테스트 수 (파일별)

| 파일 | 전체 | 이 플랜 추가 |
|---|---|---|
| `admin.test.ts` | 65 | 8 (interpretAdminResult op 6/7) |
| `admin-overview.test.ts` | 36 | 7 (P36 costs 병합) + 기존 2케이스에 `costs` 기대값 추가 |
| `order-endpoint.test.ts` | 67 | 6 (summarizeAccountCosts) |
| `account-budget.test.ts` | 57 | 46 (표기 · ppm · 파서 · 상따 합) |
| `pnl.test.ts` (신규) | 12 | 12 |
| shared 전체 | 787 / 25 파일 | 전부 pass |

## 하류 typecheck

`pnpm --filter @gh-radar/shared build` 후 relay `typecheck` · relay `typecheck:tests` · server `typecheck` · webapp `typecheck`(+ e2e tsconfig) 전부 exit 0. 하류 파일 변경 없음.

## 36-01 대비 바뀐 export

- **admin.ts (변경):** `interpretAdminResult` 시그니처 op `1|2|3|4|5` → `1|2|3|4|5|6|7` · `deriveAdminUsersOverview` 3번째 선택 인자 `costs` · `AdminAccountView.costs?`
- **admin.ts (신규):** `AdminAccountCost` · `AdminAccountCostRow` · `AdminAccountCostsRaw` · `AdminAccountBudgetBody` · `AdminAccountFeeBody`
- **order-endpoint.ts (신규):** `summarizeAccountCosts` · `SummarizeAccountCostsInput` · `AccountCostSummary` · `AccountBudgetMismatch` · `AccountFeeMismatch`
- **account-budget.ts (신규):** `formatPnlManwon` · `pnlToneOf` · `formatManwon1` · `pctToPpm` · `ppmToPct` · `parseCostPct` · `parseBudgetManwon` · `COST_PPM_MAX` · `BUDGET_MANWON_MAX` · `lcBuyAmountSumKrw`
- **pnl.ts (신규 모듈):** `PnlRange` · `PNL_RANGES` · `PnlGroupBy` · `PnlTotals` · `PnlStockRow` · `PnlDayRow` · `PnlAccountRef` · `PnlGroup` · `PnlReport` · `pnlRangeOf` · `formatPnlDay` · `formatPnlRangeCaption`

## Task Commits

1. **Task 1 RED:** `d7ec24e5` test(36-10): shared 어드민 비용 계약 실패 테스트
2. **Task 1 GREEN:** `273f518b` feat(36-10): shared 어드민 비용 계약 — op 6/7 해석 · 서버별 비용 · summarizeAccountCosts
3. **Task 2 RED:** `a8ba47ae` test(36-10): shared 표기 · 입력 · 매매손익 계약 실패 테스트
4. **Task 2 GREEN:** `06685cc8` feat(36-10): shared 표기 · 입력 · 매매손익 계약 — ppm · 손익 포맷 · 상따 합 · 기간

## TDD 메모 (RED 근거)

- Task 1 RED: 14 실패 — `summarizeAccountCosts is not a function`(6) · `costs` 필드 없음(admin-overview 8, 기존 whole-object 2케이스 포함). `interpretAdminResult` op 6/7 8케이스는 런타임 본문이 이미 「0 만 ok · 그 밖 failed」 라 런타임으로는 통과했다 — 이 케이스의 RED 는 타입 수준(op 유니온 밖 → tsc 실패)이고, 런타임 테스트는 회귀 잠금 역할이다.
- Task 2 RED: account-budget 46 실패(`… is not a function`) · pnl.test.ts 는 모듈 부재로 로드 실패(신규 모듈의 정상 RED 형태).
- REFACTOR 커밋 없음 — GREEN 단계에서 `registeredServersOf` 추출을 함께 했고 기존 summarizeOrderEndpoint 케이스가 그대로 통과했다.

## Decisions Made

- costs 색인은 그 DMA 유저 행 우선 · 없으면 같은 계좌의 다른 유저 행 — 예수금 · 비용률은 서버 계좌 단위 값이다(IP/MAC 색인은 다른 유저 행을 쓰지 않는 것과 대비, 테스트에 명시).
- `liveBudgetKrw` 0 은 정당값(해제) — null 일 때만 87.
- `ppmToPct` 는 음수 입력에 「-」 접두(계약상 오지 않지만 조용히 틀린 값을 내지 않게).

## Deviations from Plan

None - plan executed exactly as written. (태스크마다 test → feat 2커밋으로 나눈 것은 tdd="true" RED/GREEN 기록용이며 커밋 제목의 feat 문구는 플랜 그대로.)

## Issues Encountered

None.

## Next Phase Readiness

- 36-02(relay 어드민 op 6/7 · account-costs) · 36-03(server/web 카드) · 36-04 · 36-06(상따 경고 `lcBuyAmountSumKrw`) · 36-07(pnl RPC 가 `PnlReport` 키 그대로) · 36-08(화면)이 이 한 벌을 import 할 수 있다.
- shared 를 고친 뒤 하류 verify 앞에 `pnpm --filter @gh-radar/shared build` 필수(dist 소비).

## Self-Check: PASSED

- FOUND: packages/shared/src/pnl.ts · packages/shared/src/__tests__/pnl.test.ts
- FOUND commits: d7ec24e5 · 273f518b · a8ba47ae · 06685cc8
