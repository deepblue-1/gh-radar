---
phase: 18-gh-trade-ui-nxt-vi
plan: 30
subsystem: webapp
tags: [webapp, trading-workbench, manual-order, gap-closure, tracer, tdd, GC-WR-03, WR-02]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-20 · 18-26 · 18-27)
    provides: "접기·펴기 재마운트 제거(18-20) · knowsRegistered(18-26) · handleConfirmed 취소 수량 재판정(18-27)"
provides:
  - "TradingWorkbench 결과 모름 잠금 집합(ReadonlySet<strategyKey>) + 안정 콜백 markResultUnknown — 게이트 분기 위, 페이지 수명"
  - "ManualOrderForm 선택 prop resultUnknownLocked · onResultUnknown(보낸 요청의 {accountNo, isin, exchange}) · export RESULT_UNKNOWN_LOCKED_TEXT · ResultUnknownKey"
  - "CardBody 선택 prop 두 개를 폼에 그대로 전달(호가 탭은 넘기지 않음)"
  - "closeAsk {id, reason: 'unknown' | 'registered'} · workbench-close-confirm[data-reason] · 결과 모름 ✕ 다이얼로그(등록 전략이면 문장 한 줄 추가)"
  - "e2e GC5 · 단위 describe 2개(GC-WR-03)"
affects: [18-32 (R3 최종 게이트 — TRADE-07 · TRADE-09)]

actuals:
  tokens: 11300
  tasks: 2
  commits: 2
plan_head_before: bb271724cb84969fe54556eb7f94fee54f308e62

tech-stack:
  added: []
  patterns:
    - "안전 잠금은 그것을 여는 표면(카드)보다 오래 사는 소유자(페이지)가 키별로 든다. 카드에는 불리언 + 안정 콜백만 내린다"
    - "잠금 키는 화면 상태(카드 키)가 아니라 보낸 요청의 키다 — 정정·취소는 원주문 행의 거래소"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx

key-decisions:
  - "결과 모름 잠금은 TradingWorkbench 가 계좌|ISIN|거래소 키로 들고 /trading 페이지를 떠날 때(언마운트)만 푼다 — ✕·접기·재추가·계좌 전환·DMA 게이트 전환으로는 풀리지 않고 해제 버튼·타이머·에코 해제도 없다 (GC-WR-03 · D-27)"
  - "잠긴 카드의 ✕ 는 결과 모름 확인 다이얼로그(data-reason=unknown)를 거친다. 등록 전략도 있으면 등록 전략 문장이 한 줄 더 붙는다 (R3 목업 ② · UI-SPEC E7 확장)"
  - "호가 탭 수동주문은 폼 로컬 잠금 규칙 그대로(종목 전환·언마운트에 해제) — 잠금을 relay 컨텍스트로 올리지 않았다"

patterns-established:
  - "다이얼로그 문구 갈래는 닫힘 애니메이션 동안 뒤집히지 않도록 마지막으로 연 값을 ref 로 붙든다"

requirements-completed: []

coverage:
  - id: D1
    description: "timeout → 잠긴 카드 ✕(결과 모름 확인) → 같은 종목 재추가 → 새 카드 수동주문 4버튼 잠김 + 잠금 문구 · 주문 요청 1건 · 감사 기록 1건 유지"
    requirement: TRADE-07
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC5 결과 모름 잠금은 카드를 닫았다 다시 열어도 풀리지 않는다 — ✕ 는 확인을 거친다 (GC-WR-03 · D-20)"
        status: pass
    human_judgment: false
  - id: D2
    description: "재추가 3경로(돌파 칩 · 종목 추가 · 미체결 선택) · 키 범위(NXT·다른 계좌 비잠금) · 접기/계좌 A→B→A/게이트 전환 뒤 유지 · 다이얼로그 갈래 · 송신 0"
    requirement: TRADE-09
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#TradingWorkbench — GC-WR-03 — 결과 모름 잠금은 작업대 키 상태다"
        status: pass
    human_judgment: false
  - id: D3
    description: "폼 제어형 잠금 — 4버튼·문구, 신규/정정/취소 timeout 키 콜백 1회, 접수·거부 무호출, 호가 탭 로컬 잠금·종목 전환 해제 불변"
    requirement: TRADE-07
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#ManualOrderForm — 제어형 결과 모름 잠금 (GC-WR-03)"
        status: pass
      - kind: e2e
        ref: "pnpm exec playwright test trading-workbench orderbook (45 passed)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-09-22
---

# Phase 18 Plan 30: 결과 모름 잠금을 작업대 키 상태로 Summary

**「결과 모름」(timeout) 잠금을 카드 로컬 상태에서 `TradingWorkbench` 의 `계좌|ISIN|거래소` 키 집합으로 옮겼다. 잠긴 카드의 ✕ 는 결과 모름 확인 다이얼로그를 거친다. 종목 추가·돌파 칩·미체결 선택 어느 경로로 다시 열어도 새 카드의 수동주문 4버튼은 잠긴 채이고, 목업 3-b 문구가 보인다 (GC-WR-03).**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-22T10:05:17Z
- **Completed:** 2026-09-22T10:17:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `TradingWorkbench` 가 게이트 분기 위에서 `resultUnknownKeys` 와 안정 콜백 `markResultUnknown` 을 든다. 해제 규칙은 한 문장이다. 페이지를 떠날 때(언마운트)만 풀린다. 선언 자리 주석과 머리 주석 ⑧·⑨ 에 적었다.
- `ManualOrderForm` 에 `resultUnknownLocked` · `onResultUnknown` 을 선택 prop 으로 더했다. 잠금 판정은 `blocked || resultUnknownLocked` 이고, 버튼 비활성과 두 겹 중복 제출 가드가 모두 이 값을 본다. timeout 이면 **보낸 요청의** 키로 콜백을 부른다. 재추가된 카드처럼 폼에 결과 배너가 없으면 인라인 `role="status"` 로 `RESULT_UNKNOWN_LOCKED_TEXT` 를 보인다. 규율 ②-4 는 표면별로 다시 썼다. 작업대 카드의 잠금은 작업대 키가 들고, 호가 탭은 폼 로컬 잠금이다.
- `CardBody` 는 두 prop 을 폼에 그대로 넘긴다. 호가 탭(`stock-orderbook-section.tsx`)은 손대지 않았다.
- ✕ 다이얼로그를 `closeAsk {id, reason}` 두 갈래로 나눴다. 결과 모름 갈래의 문구는 R3 목업 ② 원문이다. 등록 전략도 있는 카드면 등록 전략 문장을 한 줄 더 붙인다(2-b). 기존 등록 전략 다이얼로그의 testid 와 문구는 그대로다.

## Task Commits

1. **Task 1: [tracer] 작업대 잠금 집합 → 카드 본문 → 폼 · 결과 모름 ✕ 다이얼로그 · e2e GC5** - `a76728f` (fix)
2. **Task 2: 잠금 경로 회귀 — 재추가 3경로 · 키 범위 · 다이얼로그 갈래 · 호가 탭 불변** - `93fec55` (test)

## RED 증거 (수정 전 코드)

- **e2e GC5 · 18-30 이전 소스(`bb27172`):** 먼저 `workbench-close-confirm` 이 없어 실패했다(`element(s) not found` — 미등록 카드가 확인 없이 닫힌다). 다이얼로그 단언만 임시로 건너뛴 탐침에서는 **재추가 카드 버튼이 활성이라 실패했다.** `expect(locator).toBeDisabled() failed … Received: enabled`, 대상은 새 카드 `manual-order-buttons` 의 첫 버튼 「매수」 였다. 탐침은 되돌렸고 커밋하지 않았다.
- **단위 · 같은 이전 소스:** 새 테스트 17건 중 15건이 실패했다. 작업대 10건은 `expected undefined to be false`(본문에 잠금 prop 없음) 등이다. 폼 5건은 `Received element is not disabled` · `expected "spy" to be called 1 times, but got 0 times` 이다. 나머지 2건(접수·거부 무호출 · 호가 탭 로컬 잠금 불변)은 불변식 단언이라 이전 코드에서도 green 인 것이 맞다.
- **GREEN:** Task 1 소스에서 새 단위 17건과 전체 vitest 1435건이 통과했다(1 skipped). e2e `trading-workbench` + `orderbook` 도 45건 모두 통과했다.

## Files Created/Modified

- `webapp/src/components/trading/workbench/trading-workbench.tsx` — 잠금 집합 · `markResultUnknown` · `WorkbenchSurfaceProps` · `closeAsk` 이유 갈래 · 결과 모름 다이얼로그 · `WorkbenchCardItem` 불리언/콜백 전달
- `webapp/src/components/trading/card/manual-order-form.tsx` — 제어형 잠금 prop · `RESULT_UNKNOWN_LOCKED_TEXT` · `ResultUnknownKey` · 규율 ②-4 갱신
- `webapp/src/components/trading/card/card-body.tsx` — 두 prop 전달
- `webapp/e2e/specs/trading-workbench.spec.ts` — GC5
- `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` — describe 「GC-WR-03 — 결과 모름 잠금은 작업대 키 상태다」(10건)
- `webapp/src/components/trading/__tests__/manual-order-form.test.tsx` — describe 「제어형 결과 모름 잠금 (GC-WR-03)」(7건)

## Decisions Made

- 잠금 키는 카드 키가 아니라 **요청의** 키다. 신규 주문은 카드 키와 같다. 정정·취소는 원주문 행의 ISIN·거래소다. 행 선택은 같은 거래소 카드에만 내려가므로 실제로는 카드 키와 같지만, 규칙은 요청 쪽에 둔다.
- 폼에 결과 배너(`unknown`)가 있으면 잠금 문구를 겹쳐 보이지 않는다. 원래 카드는 배너가 말하고(목업 3-a), 다시 연 카드는 잠금 문구가 말한다(3-b).
- 다이얼로그가 닫히는 애니메이션 동안 `closeAsk` 가 이미 null 이다. 그 사이 문구가 「등록된 전략…」 으로 뒤집히지 않게 마지막으로 연 이유와 등록 여부를 ref 로 붙든다.
- 작업대 prop 규율 테스트(카드 prop 허용 목록)는 바꾸지 않았다. 잠금은 `StrategyCard` prop 이 아니라 본문 렌더 함수 클로저로 `CardBody` 에 간다. 대신 「본문 콜백이 모든 카드에 같은 참조이고 잠금은 불리언」 이라는 케이스를 새로 넣었다.

## Deviations from Plan

없음. 두 태스크 모두 계획대로 실행했다. Task 2 테스트는 Task 1 규칙과 어긋나는 동작을 드러내지 않았고, 그래서 `trading-workbench.tsx` 를 추가로 고치지 않았다.

참고로 계획의 `<verify>` 명령 `pnpm --filter … run test:e2e -- trading-workbench -g "GC5"` 는 pnpm 이 `--` 를 playwright 에 그대로 넘긴다. 그러면 `-g` 가 필터로 먹지 않고 spec 전량이 돈다. vitest 쪽 `test -- …` 도 파일 필터가 먹지 않고 전체 92 파일이 돈다. 검증은 `pnpm exec playwright test trading-workbench -g GC5` 와 `trading-workbench orderbook` 으로 다시 돌렸다. 전체 vitest 실행은 필터 실행을 포함한다.

## TDD Gate Compliance

이 플랜의 Task 1 은 tracer(`type="tracer"`)이고 구현과 e2e 를 한 커밋(`a76728f`, fix)에 담았다. Task 2(`tdd="true"`)는 Task 1 이 이미 구현한 동작의 회귀 고정이다. 그래서 커밋 순서가 `fix` → `test` 이고, 「테스트 커밋이 구현 커밋보다 앞선다」 는 RED 게이트 형식은 맞지 않는다. 대신 RED 는 위 「RED 증거」 처럼 **이전 소스(`bb27172`)에 새 테스트를 돌려** 의도한 단언 실패로 확인했다(e2e 2단 · 단위 15/17).

## Issues Encountered

없음.

## User Setup Required

없음. 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 18-29(원격 DB 마이그레이션 · 사람 게이트)는 아직 대기 중이다. 이 플랜은 거기에 손대지 않았다.
- 18-32 R3 최종 게이트: TRADE-07 · TRADE-09 는 Pending 으로 남겨 두었다. UAT 에서 실기 timeout 뒤 ✕ → 재추가 흐름을 한 번 보면 된다.

---
*Phase: 18-gh-trade-ui-nxt-vi*
*Completed: 2026-09-22*

## Self-Check: PASSED

- 파일 6개 + SUMMARY 존재 확인 · 커밋 a76728f · 93fec55 존재 확인 · 스텁/TODO 없음
