---
phase: 18-gh-trade-ui-nxt-vi
plan: 31
subsystem: webapp
tags: [webapp, trading-workbench, shared-panels, sidebar, gap-closure, tracer, tdd, GC-IN-05, GC-IN-01, GC-IN-04]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-21 · 18-30)
    provides: "카드 id 정체성(18-21 WR-05) · 결과 모름 잠금 집합과 closeAsk 갈래(18-30)"
provides:
  - "export 순수 함수 fillAccountCards(cards, accountNo) → { next, dropped } — 키 충돌 시 사용자 카드의 펼침을 등록 카드가 잇는다"
  - "forgetCardState(ids) — removeCard 와 계좌 채움이 같은 정리 경로(카드 더티 키 · lastLogText)"
  - "SharedPanelsProps.dirtyBarCount(옛 불리언 prop 대체) · useDirtyBarReserve(count) 가 수 변화마다 재측정"
  - "export 순수 함수 holdingQuotePrice(quotes, isin) — KRX 우선 · NXT 폴백, 카드 집합을 읽지 않는다"
  - "lib/limit-chaser exchangeLabeledName(name, exchange) — 합친 로그 who · 사이드바 전략 이름 공용"
affects: [18-32 (R3 최종 게이트 — TRADE-09)]

actuals:
  tokens: 9700
  tasks: 3
  commits: 3
plan_head_before: ba2dd5f8e63cf96bfb3b4a760985d13d7561e750

tech-stack:
  added: []
  patterns:
    - "효과의 상태 변경은 순수 함수로 빼고, 업데이터(next)와 효과 본문(dropped 정리)이 같은 함수를 부른다"
    - "잔고처럼 거래소 축이 없는 값은 카드 배치가 아니라 고정 축(KRX 우선 · NXT 폴백)으로 평가한다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx

key-decisions:
  - "계좌가 늦게 와서 사용자 카드(X::KRX)가 같은 키의 등록 카드와 부딪치면 사용자 카드는 치우고, 사용자 카드가 펼쳐져 있었으면 등록 카드를 펼친다. 정리는 removeCard 와 같은 forgetCardState 로 한다 (GC-IN-05 · D-07)"
  - "잔고 평가 가격은 KRX 시세 우선, 없을 때만 NXT 시세다. 잔고 행(HoldingState · RelayHolding)에 거래소가 없으므로 카드 순서로 고르지 않는다 (GC-IN-04)"
  - "NXT 전략만 「{종목명} · NXT」 꼬리를 붙인다(합친 로그 who · 사이드바). KRX 는 기본 거래소라 이름만이고 기존 표면 문구가 그대로다 (GC-IN-04 · D-03)"

patterns-established:
  - "더티 바 비킴 재측정의 트리거는 떠 있는 바의 수다 — 불리언(떠 있는가)으로는 두 번째 바를 모른다"

requirements-completed: []

coverage:
  - id: D1
    description: "계좌 채움이 사용자 카드의 펼침을 등록 카드로 잇고, 치운 카드의 더티가 더티 바 수·이탈 경고에 남지 않는다"
    requirement: TRADE-09
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#fillAccountCards — 계좌 채움 (GC-IN-05 · D-07 · 순수 함수)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#TradingWorkbench — GC-IN-05 — 계좌가 늦게 와도 사용자가 연 카드의 맥락이 잇는다"
        status: pass
    human_judgment: false
  - id: D2
    description: "공용 패널이 더티 바 수가 바뀔 때마다 다시 재서 가장 높은 바 위에 선다"
    requirement: TRADE-09
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/shared-panels.test.tsx#⑨-b 더티 바 수가 늘면 다시 잰다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#TradingWorkbench — GC-IN-01 — 공용 패널에 더티 카드 수를 내린다 (R1 IN-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "잔고 평가 가격이 카드 순서와 무관(KRX 우선 · NXT 폴백)하고, 합친 로그 who 가 NXT 카드 줄을 「· NXT」 로 가른다"
    requirement: TRADE-09
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#TradingWorkbench — GC-IN-04 — 같은 종목 KRX·NXT 카드 둘의 평가 가격 · 로그 귀속"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#exchangeLabeledName — 거래소 꼬리 (GC-IN-04 · D-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "사이드바 NXT 전략 이름 꼬리(폴백 체인 뒤) · data-strategy-key · 링크 불변 · strategy-card 주석 분리"
    requirement: TRADE-09
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#GC-IN-04 · D-03 — NXT 전략 이름은 「{종목명} · NXT」"
        status: pass
      - kind: e2e
        ref: "pnpm exec playwright test sidebar-tree trading-workbench (40 passed)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-09-22
---

# Phase 18 Plan 31: 작업대 표시·상태 잔재 정리 Summary

**계좌가 늦게 도착하면 사용자가 연 카드의 펼침을 같은 키의 등록 카드가 이어받는다. 치운 카드의 정리는 `removeCard` 와 같은 경로로 한다. 공용 패널은 더티 바 수가 바뀔 때마다 비킴 높이를 다시 잰다. 잔고 평가 가격은 KRX 우선, NXT 폴백으로 카드 순서와 무관해졌다. NXT 전략은 합친 로그와 사이드바에서 「{종목명} · NXT」 로 표시된다 (GC-IN-05 · GC-IN-01 · GC-IN-04).**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-09-22T10:24:14Z
- **Completed:** 2026-09-22T10:31:02Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **계좌 채움 (GC-IN-05).** 효과 본문의 채움 규칙을 export 순수 함수 `fillAccountCards` 로 뺐다. 키가 부딪친 빈 계좌 카드는 `dropped` 로 치운다. 그 카드가 펼쳐져 있었으면 같은 키의 카드를 `open: true` 로 만들고, 접혀 있었으면 건드리지 않는다. 빈 계좌 카드가 없으면 같은 배열 참조를 돌려준다. `removeCard` 에서 정리 몫(더티 키 · `lastLogText`)을 `forgetCardState(ids)` 로 떼어 냈다. 호출은 두 곳이다. `removeCard` 가 `[id]` 로 부르고, 채움 효과가 `fillAccountCards(cardsRef.current, accountNo).dropped` 로 부른다. 업데이터는 `fillAccountCards(prev, accountNo).next` 만 쓰므로 순수하다.
- **더티 바 재측정 (GC-IN-01 · R1 IN-03).** `SharedPanelsProps` 의 옛 불리언 prop 을 `dirtyBarCount: number` 로 바꿨다. 옛 이름은 코드와 주석 어디에도 남지 않았다. `useDirtyBarReserve(count)` 의 레이아웃 효과는 `count` 에 의존한다. 그래서 수가 바뀔 때마다 바 목록을 다시 모아 재고 `ResizeObserver` 를 다시 건다. 작업대는 `cardDirty[id] > 0` 인 카드 수를 넘긴다. 파일 머리 ⑤ 와 훅 JSDoc 에 「effect 시점의 바만 관찰하면 새로 뜬 더 높은 바에 가린다」 를 적었다.
- **평가 가격 (GC-IN-04).** export 순수 함수 `holdingQuotePrice` 를 더했다. KRX 시세가 유한한 양수면 그 값을 쓰고, 아니면 같은 조건의 NXT 시세, 둘 다 없으면 `undefined` 다. `priceOf` 는 이 함수만 부르고 카드 집합을 읽지 않는다. JSDoc 에 근거를 적었다. 잔고 행(`HoldingState` · `RelayHolding`)에 거래소 축이 없다는 점, KRX 가 돌파 가격 축과 같다는 점, NXT 폴백을 두는 이유다.
- **거래소 꼬리 (GC-IN-04 · D-03).** `lib/limit-chaser.ts` 에 `exchangeLabeledName` 을 추가했다. 합친 로그 `who` 가 이 함수로 카드 이름을 감싼다. 카드 id 가 없을 때의 폴백 `id` 는 그대로다. 사이드바 `strategyDisplayName` 은 폴백 체인(전략 `name` → 계좌 역매핑 → `code` → ISIN) 뒤에 이 함수를 적용한다. `data-strategy-key`, 링크, LED 텍스트 대체는 손대지 않았다. `title` 은 이름과 같은 값을 받는다.
- **주석 (GC-IN-01).** `strategy-card.tsx` ⑤ 에서 「… 본문에 건넨다.」 뒤에 붙어 있던 「접힌 카드는 …」 을 JSDoc 새 줄로 분리했다. 동작 변경은 없다.

## Task Commits

1. **Task 1: [tracer] 계좌 채움 펼침 승계 · 같은 정리 경로 + 더티 바 수 재측정** - `d3da2d0` (fix)
2. **Task 2: 잔고 평가 가격 KRX 우선 · NXT 폴백 + 합친 로그 who 거래소 꼬리** - `69fdcad` (fix)
3. **Task 3: 사이드바 NXT 이름 꼬리 · strategy-card 주석 분리 · 표면 e2e** - `f67fc92` (fix)

각 태스크는 테스트를 먼저 쓰고 수정 전 소스에서 RED 를 확인했다. 그다음 구현했고, 테스트와 구현을 한 커밋에 담았다(18-30 과 같은 형식).

## RED 증거 (수정 전 코드)

- **작업대 채움 · 18-31 이전 소스(`ba2dd5f`):** 「계좌 없음 → 종목 추가(펼침) → 같은 키 등록 전략 유입 → 계좌 도착」 케이스에서 카드는 1장, 키는 `X:A:KRX` 였지만 **접혀 있었다.** `AssertionError: expected 'false' to be 'true'` (`data-open`). 같은 실행에서 `fillAccountCards` 단위 4건은 `TypeError: fillAccountCards is not a function` 으로 실패했다. `dirtyBarCount` 단언 2건은 `expected undefined to be 1` 과 `expected undefined to be +0` 로 실패했다. Task 1 새 테스트 7건이 모두 실패했다.
- **공용 패널 두 번째 바 · 같은 이전 소스:** ⑨-b 를 옛 prop(`dirtyBarVisible: true` 고정, 바 수만 증가)으로 바꾼 임시 사본으로 실행했다. 두 번째 바(140)를 붙이고 rerender 해도 **96px 에 고정됐다.** `AssertionError: expected '96px' to be '140px'`. 임시 사본은 지웠고 커밋하지 않았다.
- **평가 가격 · 이전 소스(`d3da2d0`):** 카드 순서 [NXT, KRX] 에서 공용 패널 `priceOf` 가 **110(NXT)** 을 돌려줬다. `AssertionError: expected 110 to be 100`. `holdingQuotePrice` 단위 4건은 `is not a function` 으로 실패했다.
- **로그 who · 같은 이전 소스:** `expected [ '삼성전자', '삼성전자' ] to deeply equal [ '삼성전자 · NXT', '삼성전자' ]`. `exchangeLabeledName` 단위 3건은 `is not a function` 으로 실패했다. Task 2 새 테스트는 9건 모두 실패했다.
- **사이드바 NXT 이름 · 이전 소스(`69fdcad`):** `AssertionError: expected '이수페타시스' to be '이수페타시스 · NXT'`. ISIN 폴백 케이스는 `Unable to find an accessible element with the role "link" and name /^KR7000004444 · NXT/` 로 실패했다.
- **GREEN:** 작업대와 공용 패널 82건, 작업대와 limit-chaser 105건, 사이드바와 strategy-card 38건이 통과했다. webapp 전체 vitest 는 **1454 passed · 1 skipped** 로, 기준선 1383 이상이고 18-30 의 1435 보다 19건 많다. `typecheck`(tsc + e2e tsconfig)는 에러 0 이다. e2e `sidebar-tree` + `trading-workbench` 는 **40 passed** 다.

## Files Created/Modified

- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `fillAccountCards` · `holdingQuotePrice`(export) · `forgetCardState` · 채움 효과 재배치(`removeCard` 아래) · `dirtyCardCount` → `dirtyBarCount` · `priceOf` 고정 축 · 로그 `who` 꼬리
- `webapp/src/components/trading/workbench/shared-panels.tsx` — `dirtyBarCount` prop · `useDirtyBarReserve(count)` · ⑤ 와 훅 JSDoc
- `webapp/src/lib/limit-chaser.ts` — `exchangeLabeledName`
- `webapp/src/components/layout/app-sidebar.tsx` — `strategyDisplayName` 꼬리
- `webapp/src/components/trading/card/strategy-card.tsx` — ⑤ 주석 줄 분리
- `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` — 공용 패널 prop 기록 스파이(실물을 렌더하고 마지막 prop 만 기록) · 채움 · 더티 수 · 평가 가격 · 로그 `who`
- `webapp/src/components/trading/__tests__/shared-panels.test.tsx` — prop 이름 교체 · ⑨-b
- `webapp/src/lib/__tests__/limit-chaser.test.ts` — `exchangeLabeledName` 3건
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` — NXT/KRX 이름 · ISIN/code 폴백 + NXT · N3a 단언 갱신

## Acceptance 확인

- `grep -n "fillAccountCards\|forgetCardState" trading-workbench.tsx` 에 선언 2개가 보인다. `forgetCardState` 호출은 `removeCard` 와 채움 효과 두 곳이다. PASS
- `grep -rn "dirtyBarVisible" webapp/src` 는 출력이 없다. PASS
- `priceOf` 정의 줄 앞뒤 5줄에 `cardsRef` 가 없다. PASS
- `grep -n "export function exchangeLabeledName" webapp/src/lib/limit-chaser.ts` 는 1줄이다. PASS
- `grep -n "exchangeLabeledName" app-sidebar.tsx` 는 3줄이다(import · 주석 · 호출). PASS
- `grep -n "건넨다. \*" strategy-card.tsx` 는 출력이 없다. PASS
- 기존 등록 전략 유입 · 카드 제거 · 이탈 경고 describe 는 무수정으로 green 이다. PASS
- e2e `sidebar-tree` · `trading-workbench` 는 green 이고 두 spec 은 무수정이다. 이름 텍스트로 NXT 전략 항목을 찾는 단언이 없고, GC3 는 `data-strategy-key` 로 찾는다. PASS

## Decisions Made

- 채움 효과의 선언 위치를 `removeCard` 아래로 옮겼다. `forgetCardState` 와 `cardsRef` 를 참조해야 하기 때문이다. 채움 효과는 `accountNo` 변화에만 반응하고, 첫 마운트에서는 `accountNo === ""` 라 아무 일도 하지 않는다. 따라서 등록 전략 유입 효과와의 순서에 기대는 부분이 없다.
- `fillAccountCards` 는 사용자 카드끼리의 충돌(빈 계좌 카드 두 장이 같은 키로 채워지는 경우)에도 같은 규칙을 쓴다. 앞 카드가 남고 뒤 카드의 펼침을 잇는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 기존 단언이 새 must-have 와 충돌] 사이드바 N3a 단언 갱신**
- **Found during:** Task 3
- **Issue:** `app-sidebar.test.tsx` ④ 의 N3a 단언 `expect(b.textContent).not.toContain("NXT")` 는 NXT 전략(CHASER_B)의 항목 텍스트에 「NXT」 가 없다고 못 박고 있었다. 이 플랜의 must-have(NXT 전략 이름에 「· NXT」 꼬리)와 정면으로 충돌한다.
- **Fix:** N3a 의 취지(별도 거래소 태그·상태 배지 없음)는 유지했다. 단언은 「이름 span 이 `이수페타시스 · NXT` 이고 항목 텍스트의 NXT 는 1회뿐」 으로 바꿨다. 배지 부재 단언은 그대로다.
- **Files modified:** webapp/src/components/layout/__tests__/app-sidebar.test.tsx
- **Commit:** f67fc92

**2. [실행 환경] master 직접 커밋**
- 이 저장소의 `git.base-branch --is-protected master` 는 `true` 를 돌려준다. 하지만 오케스트레이터가 메인 워킹 트리 master 에서 순차 실행하라고 명시했고(branching_strategy none, 18-xx 전례와 같다), 그 지시에 따라 커밋했다. push 는 하지 않았다.

**Total deviations:** 1 auto-fixed (Rule 1) + 실행 환경 메모 1. **Impact:** 표시 계약 안에서의 단언 갱신이고 동작 범위 밖 변경은 없다.

## Issues Encountered

None. 전체 vitest 출력에 스택 트레이스 몇 줄이 섞여 나온다. 기존 테스트의 의도된 stderr 이고, 실패 0 이다.

## Next Phase Readiness

- webapp 만 바뀌었다(relay 변경 0). R3 최종 게이트 18-32 로 넘어갈 준비가 됐다. TRADE-09 는 18-32 까지 Pending 이다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/trading-workbench.tsx · shared-panels.tsx · lib/limit-chaser.ts · layout/app-sidebar.tsx · card/strategy-card.tsx
- FOUND commits: d3da2d0 · 69fdcad · f67fc92 (`git rev-list --count ba2dd5f..HEAD` = 3)
