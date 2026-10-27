---
phase: 36-account-budget
plan: 01
subsystem: relay · shared · webapp
tags: [flatbuffers, relay, account-state, budget_krw, react, account-panel]

requires:
  - phase: gh-trade 41-01/41-03/41-04
    provides: "StockDMA.fbs SYNC 7824e51b — AccountState.budget_krw · AdminCommandReq/AdminAccount budget·fee·tax · JournalRecord 손익 4필드"
provides:
  - "D-16 생성물 4파일 + 인박스 261027-account-pnl 노트 경로 지정 커밋(aaf2d154)"
  - "relay typecheck:tests 복구 — frames.ts createAccountState 8인자 · createJournalRecord 28인자"
  - "relay parseAccountState 반환 budgetKrw(toNum 경유) · #mergeAccountState 델타 budgetKrw 마지막 값 덮기(D-14)"
  - "shared RelayAccountState.budgetKrw?: number"
  - "shared account-budget.ts — availableKrwOf · formatManwonFloor(36-10 이 같은 파일에 표기 · 파서 · lcBuyAmountSumKrw 추가)"
  - "계좌 패널 요약 줄 data-slot=account-budget-summary(기본 모드 잔고 섹션 첫 자식 · 임베드 holdings account 스코프)"
affects: [36-02, 36-05, 36-06, 36-08, 36-10]

actuals:
  tokens: 12502
  tasks: 1
  commits: 2
plan_head_before: 05602dab493c42b29296d593c403b1e0041eeec5
plan_head_after: 25cb834c6537b09edc17167101d96a4603a8c0f0

tech-stack:
  added: []
  patterns:
    - "예수금은 항목 병합과 달리 66/67 마지막 값으로 덮는다(0 = 해제도 정당값) — relay 는 명시 필드, 웹 mergeAccount 는 ...next"
    - "주문가능 계산 · 만원 내림 표기는 shared 한 벌(availableKrwOf · formatManwonFloor) — 표면에서 다시 셈하지 않는다"

key-files:
  created:
    - packages/shared/src/account-budget.ts
    - packages/shared/src/__tests__/account-budget.test.ts
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/admin-account.ts
    - relay/src/generated/stock-dma/admin-command-req.ts
    - relay/src/generated/stock-dma/journal-record.ts
    - docs/inbox/from-gh-trade/261027-account-pnl.md
    - relay/tests/helpers/frames.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/account-state.test.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx

key-decisions:
  - "/me 는 priceOf 를 넘기지 않는다 — /me 는 보유 · 미체결 종목 시세를 구독하지 않고, 인박스 규칙상 현재가가 없으면 시장가 매수 미체결은 0 으로 센다(D-11 재량). me-client.tsx 무변경"
  - "webapp mergeAccount 는 고치지 않았다 — 델타 반환이 ...next 라 budgetKrw 가 이미 마지막 값으로 덮인다(확인만). 같은 결과라는 설명은 relay #mergeAccountState 주석이 맡는다"
  - "요약 줄은 BudgetSummaryLine 한 부품을 기본 모드(잔고 섹션 첫 자식)와 임베드(budgetLine 노드 · scope account 일 때만)가 공유한다"

patterns-established:
  - "BudgetSummaryLine: account null → 줄 없음 · null(미설정) → 「— / 예수금 미설정」 · 음수 → 「0만」 --destructive + data-over"

requirements-completed: []

coverage:
  - id: D1
    description: "gh-trade 생성물 4파일 + 노트 261027-account-pnl 경로 지정 커밋(정확히 5경로)"
    verification:
      - kind: other
        ref: "git show --name-only --format= aaf2d154 | wc -l == 5"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay typecheck:tests 복구(frames.ts 인자 수)"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay run typecheck:tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "66/67 budget_krw 가 relay 캐시에 마지막 값으로 남는다(체결 델타 → 한도 전용 67 · 재전송 · 0 해제 · 구 서버 0)"
    verification:
      - kind: integration
        ref: "relay/tests/account-state.test.ts#Phase 36 D-14 예수금 마지막 값 (a)~(d)"
        status: pass
    human_judgment: false
  - id: D4
    description: "shared availableKrwOf · formatManwonFloor(WinForms 계산식 · 만원 내림 콤마)"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/account-budget.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "계좌 패널 「주문가능 / 예수금」 요약 줄 — 정상 · 초과 · 미설정 · null · 임베드 account/stock · 시장가 priceOf"
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#Phase 36 계좌 패널 요약 줄 (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "요약 줄 시각 품질(15/600 값 · 흐림 라벨 · flex-wrap 줄바꿈)이 목업과 같은가"
    verification: []
    human_judgment: true
    rationale: "글자 크기 · 색 · 줄바꿈의 시각 동형은 단위 테스트가 단언하지 않는다 — 36-09 UAT 에서 실제 화면 확인"

duration: 6min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 01: 예수금 트레이서 Summary

**gh-trade 생성물(SYNC 7824e51b) 커밋 뒤, 66/67 `budget_krw` 를 relay 파서 → hub 마지막 값 덮기 → shared `availableKrwOf` · `formatManwonFloor` → 계좌 패널 「주문가능 N만 / 예수금 M만」 줄까지 한 경로로 이었다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-10-27T14:08:52Z
- **Completed:** 2026-10-27T14:14:28Z
- **Tasks:** 1 (tracer)
- **Files modified:** 15 (생성물 · 노트 5 + 손편집 10)

## Accomplishments

- D-16 생성물 4파일 + 노트 `261027-account-pnl.md` 를 정확히 그 5경로로 커밋(`aaf2d154`) — 261027-launch-* · 261027-openarb-* 는 들어가지 않았다.
- relay `typecheck:tests` 복구 — `buildAccountStateFrame` 이 `budgetKrw` 입력을 8번째 인자로, `buildJournalBatchFrame` 이 손익 4필드 자리에 `0n` ×4 를 싣는다.
- relay `parseAccountState` 가 `budgetKrw: toNum(st.budgetKrw(), "account_state.budget_krw")` 를 싣고, `#mergeAccountState` 델타 분기가 `budgetKrw: next.budgetKrw` 로 무조건 덮는다(0 = 해제 포함).
- shared `RelayAccountState.budgetKrw?` · `account-budget.ts`(`availableKrwOf` · `formatManwonFloor`) · index export.
- 계좌 패널 `BudgetSummaryLine` — 기본 모드는 `account-holdings` 섹션 첫 자식, 임베드는 `section="holdings"` ∧ `embedScope="account"` 일 때 표/빈 상태 위(`scope="stock"` 은 없음).

## Task Commits

1. **Task 1 (tracer) ① 생성물 커밋** - `aaf2d154` (chore)
2. **Task 1 (tracer) ②~⑨ 예수금 한 경로** - `25cb834c` (feat)

## Files Created/Modified

- `relay/src/generated/*` 4파일 · `docs/inbox/from-gh-trade/261027-account-pnl.md` — gh-trade 생성물 · 노트(손편집 없음)
- `relay/tests/helpers/frames.ts` — `FakeAccountStateInput.budgetKrw` · 저널 28인자
- `relay/src/dma/envelope.ts` — `parseAccountState` 반환 `budgetKrw`
- `relay/src/hub/subscription-hub.ts` — 델타 병합 `budgetKrw: next.budgetKrw` + D-14 주석
- `relay/tests/account-state.test.ts` — describe 「Phase 36 D-14 예수금 마지막 값」 (a)~(d)
- `packages/shared/src/relay.ts` — `RelayAccountState.budgetKrw?: number` + JSDoc
- `packages/shared/src/account-budget.ts` — `availableKrwOf` · `formatManwonFloor`(신규)
- `packages/shared/src/index.ts` — `./account-budget` export
- `packages/shared/src/__tests__/account-budget.test.ts` — 계산 · 표기 11건(신규)
- `webapp/src/components/orderbook/account-panel.tsx` — `BudgetSummaryLine` · 기본/임베드 배선
- `webapp/src/components/orderbook/__tests__/account-panel.test.tsx` — 요약 줄 7건

## Test Counts

- shared `account-budget.test.ts` 11 passed
- relay `account-state.test.ts` 18 passed(신규 4) · relay 전체 59 파일 1,674 passed
- webapp `account-panel.test.tsx` 85 passed(신규 7) · AccountPanel 소비 테스트(me-client · shared-panels · card-tabs · today-orders-card · relay-provider · orderbook/) 12 파일 411 passed
- 트레이서 `<verify>` 체인 exit 0 · TS2554 없음 → ⚡ Tracer verified end-to-end

## Decisions Made

- /me 는 `priceOf` 를 넘기지 않는다 — 보유 · 미체결 종목 시세를 구독하지 않는 표면이고, 인박스 규칙상 현재가가 없으면 0 이다(D-11 재량). me-client.tsx 는 바꾸지 않았다(잔고 탭 AccountPanel 이 기본 모드라 줄이 자동으로 선다 · D-10).
- webapp `mergeAccount` 는 델타 반환이 `...next` 라 확인만 하고 고치지 않았다.

## Deviations from Plan

### 실행 맥락 차이(코드 아님)

- 플랜 「실행 환경 메모」 는 STATE.md · ROADMAP.md 를 executor 가 건드리지 않는다고 적었지만, 이번 실행은 phase 전용 worktree(`gsd/phase-36-account-budget`)의 순차 executor 이고 orchestrator 가 STATE/ROADMAP 갱신을 지시했다 — orchestrator 지시를 따랐다(Phase 35 master 트리와 경합 없음).
- 테스트 `budgetAccount` 픽스처는 플랜 예시 수치(「1,234만 / 2,000만」)가 나오도록 보유 100주 × 76,600 으로 맞췄다.

그 밖에는 플랜대로 실행 — 자동 수정 없음.

## Issues Encountered

- 첫 생성물 커밋 시도가 zsh 단어 분리 미적용으로 pathspec 오류(아무것도 커밋되지 않음) → 배열로 바꿔 재실행.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 36-10(shared 나머지 계약) · 36-02(relay op 6/7) 가 이 경로 위에 설 수 있다. 저널 손익 4필드 입력 연결은 36-05 몫(frames 는 인자 수만 맞춤).

## Self-Check: PASSED

- FOUND packages/shared/src/account-budget.ts · packages/shared/src/__tests__/account-budget.test.ts
- FOUND aaf2d154 · 25cb834c (HEAD 조상)
- acceptance_criteria grep 6건 · 생성물 커밋 5경로 · verify 체인 exit 0

---
*Phase: 36-account-budget*
*Completed: 2026-10-27*
