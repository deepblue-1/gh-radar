---
phase: 36-account-budget
plan: 02
subsystem: relay
tags: [relay, admin, flatbuffers, op6, op7, account-budget, fee, fan-out]

requires:
  - phase: 36-01
    provides: "생성물 SYNC 7824e51b(AdminCommandReq budgetKrw/feePpm/sellTaxPpm · AdminAccount 3필드) · relay toNum 경계"
  - phase: 36-10
    provides: "shared interpretAdminResult op 6/7(code 0 만 ok) · AdminAccountBudgetBody · AdminAccountFeeBody"
provides:
  - "ADMIN_OP.SetAccountBudget(6) · ADMIN_OP.SetAccountFee(7) · AdminCommandInput.budgetKrw/feePpm/sellTaxPpm"
  - "buildAdminCommandReq op 6 budget_krw(ulong 가드) · op 7 fee_ppm · sell_tax_ppm(uint32 가드 · 범위 검사 없음)"
  - "parseAdminUsersSnapshot → AdminAccount.budgetKrw(toNum) · feePpm · sellTaxPpm 늘 싣기(구 서버 0)"
  - "AccountCostCommand · AdminDispatcher.setAccountCost(dma, { broker, accountNo }, cost, { adminEmail, deadlineAt? }) — 기록 없는 fan-out"
  - "#answerBy opts { record?: boolean; keysOf? } — op 6/7 은 record: false"
  - "PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/budget { budgetKrw }"
  - "PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/fee { feePpm, sellTaxPpm }"
  - "테스트 헬퍼: FakeAdminAccountInput budgetKrw/feePpm/sellTaxPpm · defaultAdminHandler op 6/7(state.costs · legacyCostOps) · AdminCommandRequest 3필드"
affects: [36-03, 36-04, 36-09]

actuals:
  tokens: 18416
  tasks: 2
  commits: 3
plan_head_before: 0a680b8b513b6cdaf618fbe7e835062cd3bcd0bf
plan_head_after: 3035c3d0d4fec43af7d009eb824ff6c21cda7605

tech-stack:
  added: []
  patterns:
    - "서버 계좌 단위 값(op 6/7)은 planner · op 5 재조회 없이 서버마다 44 1건 — user_id 빈 값 · account_no 만"
    - "반영 칩 원천(dma_admin_results) 밖의 fan-out 은 #answerBy record: false 로 마감 접기까지 기록하지 않는다"
    - "87 의 숫자 필드는 0 = 미설정도 키를 둔다(문자열 orderIp 의 빈 값 = 키 없음 규칙과 다름)"

key-files:
  created: []
  modified:
    - relay/src/admin/types.ts
    - relay/src/dma/envelope.ts
    - relay/src/admin/dispatcher.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/admin-conn.test.ts
    - relay/tests/admin-planner.test.ts
    - relay/tests/admin-snapshot-sink.test.ts
    - relay/tests/fake-gateway.test.ts
    - relay/tests/quote-switch.test.ts

key-decisions:
  - "의도에 없는 계좌는 409 NO_SUCH_ACCOUNT — 플랜 문구는 404 였지만 「기존 매핑을 탄다」 가 실제로는 409(DELETE 계좌 · order-server 와 같은 매핑). 기존 계약을 따랐다"
  - "op 6/7 대상 = 그 계좌(증권사 · 정규화 번호)의 active 행 서버만 — removing 서버 제외 · 전부 removing 이면 NO_SUCH_ACCOUNT"
  - "#answerBy 에 record 와 함께 keysOf 도 넣었다 — 줄(#serial)에서 아직 시작 못 하고 마감을 맞으면 그 계좌 서버만 접는다(기본은 종전 = 등록 서버 전부)"
  - "가짜 게이트웨이 op 6/7 은 user_id 를 읽지 않고 state.costs(계좌번호 키)에 쓰며 87 에 그 계좌 전 행으로 싣는다 — gh-trade 41 규칙 흉내 · legacyCostOps = 구 서버 BAD_OP"
  - "warn 로그는 offline · timeout · failed(code · message) 마다 1줄, 계좌는 maskAccountNo — skipped(꺼진 서버)는 의도된 경로라 로그 없음"

patterns-established:
  - "계좌 비용 라우트: deadlineOf → AccountParam → strict 바디 → audited(extra = broker · 마스킹 계좌 · 값) → dispatcher.setAccountCost → respond"

requirements-completed: []

coverage:
  - id: D1
    description: "44 op 6 budget_krw(ulong 가드 · 0 = 해제 · 그 밖 op 미송신) · op 7 fee/tax(uint32 가드 · 0~10000 밖 통과)"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#P36 admin op 6 SetAccountBudget (4) · P36 admin op 7 SetAccountFee (4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "87 AdminAccount budgetKrw(toNum) · feePpm · sellTaxPpm 늘 싣기 — 구 서버 0 · 0 · 0"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#P36 87 AdminAccount budget_krw · fee_ppm · sell_tax_ppm"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-conn.test.ts#P36 87 예수금 · 비용률 (실 TCP · op 6/7 뒤 87)"
        status: pass
    human_judgment: false
  - id: D3
    description: "setAccountCost — 서버별 결과(ok · failed 원문 · timeout · offline · skipped) 레지스트리 순 · removing 제외 · NO_SUCH_ACCOUNT · 기록 0 · 의도 쓰기 0 · 마감 접기 기록 0 · #serial 줄"
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#P36 setAccountCost op 6 · op 7 (①~⑨ + op 7 · 13 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PUT …/budget · PUT …/fee — 200 { results } · 바디 400(음수 · 소수 · 문자열 · 누락 · 추가 키 · 상한 초과) · 20000ppm 은 서버 code 1 · 409 NO_SUCH_ACCOUNT · 감사 마스킹"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#P36 계좌 예수금 · 비용률 (B1~B4 · F1~F3 · 8 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "87 비용 필드는 planner 계획 · snapshot sink p_users 에 들어가지 않는다(D-04)"
    verification:
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts#P36 (2) · relay/tests/admin-snapshot-sink.test.ts#P36 (1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "relay 전체 회귀 0"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 → 59 files · 1709 tests passed · typecheck · typecheck:tests exit 0"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 02: relay 어드민 op 6 · op 7 + 87 3필드 Summary

**어드민 내부 HTTP `PUT …/budget` · `PUT …/fee` 가 `setAccountCost` 로 그 계좌 active 등록 서버마다 44 op 6/op 7 을 1건씩 보내고 서버별 결과를 돌려준다. `dma_admin_results` 기록 · 의도 쓰기는 마감 접기까지 포함해 0건이다. 87 파서는 `budgetKrw` · `feePpm` · `sellTaxPpm` 을 늘 싣는다(구 서버는 0).**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-27T14:25:30Z
- **Completed:** 2026-10-27T14:35:49Z
- **Tasks:** 2 (Task 1 tracer · Task 2 TDD RED → GREEN)
- **Files modified:** 14

## Accomplishments
- **라우트 2개:** `PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/budget` `{ budgetKrw }`(0..MAX_SAFE_INTEGER 정수 · strict) · `PUT …/fee` `{ feePpm, sellTaxPpm }`(Uint32 두 값 · strict · 0~10000 범위 검사 없음). 둘 다 경로 계좌번호를 정규화하고, 감사 줄 extra 에 증권사 · 마스킹 계좌 · 값을 남긴다.
- **`setAccountCost` 시그니처:** `setAccountCost(dmaUserId: string, target: { broker: DmaBroker; accountNo: string }, cost: AccountCostCommand, opts: { adminEmail: string; deadlineAt?: number }): Promise<AdminServerResult[]>` · `AccountCostCommand = { op: 6; budgetKrw: number } | { op: 7; feePpm: number; sellTaxPpm: number }`. `#serial` 줄 안에서 의도를 읽고, `#fanOut` → `#applyCost` 를 거친다. `#recordFinal` · `#record` 는 호출하지 않는다.
- **`#answerBy` 기록 옵션 이름:** `opts.record`(`false` 면 접은 결과를 기록하지 않음) + `opts.keysOf`(줄에서 시작하기 전에 접을 서버 키를 고르는 규칙). 기본값은 종전 동작(기록함 · 등록 서버 전부)이고, 기존 reconcile · 비밀번호 · 삭제 호출부는 그대로다.
- `buildAdminCommandReq`: op 6 일 때만 `AdminCommandReq.addBudgetKrw`(ulong RangeError 가드), op 7 일 때만 `addFeePpm` · `addSellTaxPpm`(uint32 RangeError 가드)를 싣는다. 가드는 빌더를 만들기 전에 돈다.
- `parseAdminUsersSnapshot`: `budgetKrw: toNum(a.budgetKrw(), "admin_account.budget_krw")` · `feePpm` · `sellTaxPpm` 을 늘 싣는다. planner(`fieldsOf` · `withServerEndpoint`)와 snapshot sink(`toApplyUsers`)는 필드를 명시해 매핑하므로 이 값이 새지 않는다. 테스트로 잠갔다.

## 테스트 수

| 파일 | 이 플랜 추가 · 수정 |
|---|---|
| `src/dma/__tests__/envelope.test.ts` | +9 (op 6 4 · op 7 4 · 87 3필드 1) · 기존 87 기대값 2케이스에 0 · 0 · 0 |
| `tests/admin-dispatcher.test.ts` | +13 (P36 ①~⑨ · 정규화/멱등 · code 8 · removing 전부 · #serial · op 7) |
| `tests/admin-api.test.ts` | +8 (B1 2 · B2 · B3 · B4 · F1 · F2 · F3) |
| `tests/admin-conn.test.ts` | +1 (실 TCP 87 세 값) · A2 기대값에 0 · 0 · 0 |
| `tests/admin-planner.test.ts` | +2 (계획 불변 · op 3 에 비용 키 없음) |
| `tests/admin-snapshot-sink.test.ts` | +1 (p_users 무누출) |
| `tests/fake-gateway.test.ts` | 기대값 2곳 갱신(44 3필드 · 87 3필드) |
| relay 전체 | 59 파일 · 1709 tests passed |

## Task Commits

1. **Task 1 (tracer):** `746a0114` feat(36-02): relay op 6 예수금 — PUT budget → 기록 없는 fan-out → 44 (트레이서)
2. **Task 2 RED:** `9504a646` test(36-02): relay op 7 비용률 · 87 예수금·수수료·매도세 실패 테스트
3. **Task 2 GREEN:** `3035c3d0` feat(36-02): relay op 7 비용률 · 87 예수금·수수료·매도세 파싱

트레이서 게이트: auto · end-of-phase 와 automated-only `<verify>` 경로로, Task 1 verify 를 다시 돌려 통과(347 tests)를 확인한 뒤 Task 2 로 확장했다.

## TDD Gate Compliance (Task 2)

- RED `9504a646`: 11 실패(op 7 왕복 · 가드 3 · 87 3필드 1 · 기존 87 toEqual 2 · AdminConn 2 · PUT fee 3)와 typecheck:tests 실패(`AdminAccount.budgetKrw` 없음). dispatcher op 7 케이스는 Task 1 의 `AccountCostCommand` 가 이미 op 7 을 받아서 런타임으로는 통과했다. 이 케이스는 회귀 잠금 역할이다.
- GREEN `3035c3d0`: 6개 verify 파일 422 tests pass · relay 전체 1709 pass.
- REFACTOR 커밋 없음(정리할 것 없음).

## Decisions Made

- frontmatter `key-decisions` 참조. 그중 핵심은 **409 NO_SUCH_ACCOUNT**(아래 Deviation 1)와 **`keysOf` 추가**(아래 Deviation 3)다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 계약 정합] 의도에 없는 계좌의 HTTP 상태 404 → 409**
- **Found during:** Task 1
- **Issue:** 플랜 truth 는 「404 NO_SUCH_ACCOUNT」 라고 쓰면서 동시에 「admin-api 의 기존 404 매핑을 탄다」 라고 했다. 그런데 기존 `toRelayError` 는 IntentError 전부(INTERNAL 제외)를 **409** 로 매핑한다. DELETE 계좌 · order-server O4 도 409 `NO_SUCH_ACCOUNT` 를 단언한다.
- **Fix:** 기존 매핑을 따라 409 로 응답하게 했다. 라우트 머리 주석과 B3 테스트에 명시했다. 하류(36-03 Express · 웹)는 다른 계좌 라우트와 같은 코드 분기를 쓰면 된다.
- **Files modified:** relay/src/admin/admin-api.ts · relay/tests/admin-api.test.ts
- **Commit:** 746a0114

**2. [Rule 3 - Blocking] 테스트 헬퍼 · 스텁 확장(플랜 files 밖)**
- **Found during:** Task 1 · Task 2
- **Issue:** `defaultAdminHandler` 가 op 6/7 을 BAD_OP 로만 답해 ok 경로를 볼 수 없었다. `AdminCommandRequest` 는 44 의 budget/fee/tax 를 읽지 않았다. `AdminApiDeps.dispatcher` Pick 확장 때문에 `quote-switch.test.ts` 스텁의 타입이 깨졌다. 87 3필드를 늘 싣게 되자 `fake-gateway.test.ts` 의 toEqual 2곳도 달라졌다.
- **Fix:** `tests/helpers/fake-gateway.ts` 에 op 6/7 흉내(`state.costs` · `legacyCostOps` · 87 에 실음)와 44 3필드 읽기를 넣었다. `quote-switch.test.ts` 스텁에 `setAccountCost`, `fake-gateway.test.ts` 기대값에 3필드를 더했다. `admin-snapshot-sink.test.ts` 에는 무누출 가드 1케이스를 더했다(플랜 verify 대상 파일).
- **Commits:** 746a0114 · 9504a646 · 3035c3d0

**3. [Rule 2 - 정확성] `#answerBy` 에 `keysOf` 추가**
- **Found during:** Task 1
- **Issue:** `record` 만 더하면, op 6 이 같은 유저 줄(`#serial`)에서 기다리다 마감을 맞을 때 의도의 등록 서버 **전부**를 timeout 으로 접는다. 그러면 그 계좌에 등록되지 않은 서버까지 결과에 섞인다.
- **Fix:** `keysOf`(기본 = 종전)를 넣고, setAccountCost 는 그 계좌 active 행의 서버만 접게 했다. 「#serial 줄에서 마감을 맞으면 그 계좌 서버만 접는다」 테스트로 잠갔다.
- **Commit:** 746a0114

**Total deviations:** 3 auto-fixed (Rule 1 · Rule 2 · Rule 3). **Impact:** 범위 확장 없음. 404→409 는 하류가 알아야 할 계약 차이다(36-03 이 409 를 그대로 쓰면 된다).

## Issues Encountered

None.

## Next Phase Readiness

- 36-03(Express 프록시 · 웹 카드)이 relay `PUT …/budget` · `PUT …/fee` 와 409 `NO_SUCH_ACCOUNT` 를 그대로 프록시하면 된다.
- 36-04(개요 공급 · 되싣기)는 `AdminConn.currentSnapshot()` 계좌의 `budgetKrw` · `feePpm` · `sellTaxPpm`(늘 있음 · 구 서버 0)을 읽으면 된다. op 3 뒤 op 6 되싣기는 `setAccountCost` 를 재사용하거나 같은 `#applyCost` 경로를 쓰면 된다.
- 배포(36-09): 구 gh-trade 서버는 op 6/7 을 code 1 failed 로 돌려준다. 칩은 서버 message 원문을 표시한다.

## Self-Check: PASSED

- FOUND: relay/src/admin/dispatcher.ts(`setAccountCost(`) · relay/src/admin/admin-api.ts(`/accounts/:broker/:accountNo/budget` · `/fee"`) · relay/src/dma/envelope.ts(`AdminCommandReq.addBudgetKrw(` · `AdminCommandReq.addFeePpm(` · `toNum(a.budgetKrw(), "admin_account.budget_krw")`)
- FOUND commits: 746a0114 · 9504a646 · 3035c3d0
