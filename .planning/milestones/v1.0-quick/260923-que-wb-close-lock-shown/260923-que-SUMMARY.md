---
phase: quick-260923-que
plan: 01
subsystem: webapp/trading-workbench
tags: [trading, workbench, order-lock, close-confirm]
status: complete
requirements: [QUE-A]
key-files:
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
decisions:
  - "✕ 「결과 모름」 판정은 다른 카드(id 다름)가 지금 보여주는 거래소 키를 제외한다 — 잠긴 주문이 시야에서 사라지지 않으므로 물을 것이 없다(사용자 결정 2026-09-23 「규칙을 넣어줘」)"
metrics:
  completed: 2026-09-23
actuals:
  tokens: 6000
  tasks: 1
  commits: 1
plan_head_before: ef33e75
---

# Quick 260923-que: ✕ 결과 모름 경고 — 다른 카드가 보여주는 거래소 키 제외 Summary

`lockedExchangesOf(locks, card, cards)` 가 같은 계좌·ISIN 의 잠긴 거래소 가운데 **다른 카드가 지금 그 키를 보여주는** 거래소를 빼도록 바꿨다. quick-260923-pgv 가 판정을 KRX·NXT 두 키로 넓히면서 생긴 과잉 경고 1건을 없앴다.

## 변경

- `trading-workbench.tsx`
  - `lockedExchangesOf` 에 세 번째 인자 `cards` 추가. 거래소마다 `key = strategyKey(isin, accountNo, ex)` 를 만들고 `locks.has(key) && !cards.some(o => o.id !== c.id && keyOf(o) === key)` 일 때만 포함한다.
  - 자기 현재 키는 제외 규칙에 걸리지 않는다. 카드 키가 유일하기 때문이다(T-18-94).
  - `closeCard` 가 `cardsRef.current` 를 넘긴다. 제외하고 남은 거래소가 0이면 기존 순서대로 `registered` 다이얼로그를 띄우고, 등록 전략도 없으면 즉시 제거한다.
  - 모듈 헤더 ⑧ 주석과 함수 주석에 규칙과 이유를 적었다.
  - `relay.orderLocks`(앱 수명)는 바꾸지 않았다. relay-provider·shared·relay 는 건드리지 않았다.
- `trading-workbench.test.tsx`
  - **⑦ 계약 갱신**: KRX·NXT·다른 계좌 카드 3장이 있고 NXT 키가 잠겼을 때 첫 카드(KRX, 등록 전략 있음)를 ✕ 하면, 이제 `unknown` 이 아니라 `data-reason="registered"` 다이얼로그가 뜨고 「잠긴 거래소: NXT」 문구는 없다. NXT 카드 ✕ 는 그대로 `unknown` 「NXT」다. 카드 3장 유지와 `lockPropsOf` 빈 배열 단언은 그대로 뒀다.
  - **⑦-g 신규 2건**: 미등록 KRX 카드는 종목 추가로, 같은 종목 NXT 카드는 NXT 미체결 행 클릭(WR-04)으로 만들고 NXT 키를 잠갔다.
    - (a)+(b): KRX 카드 ✕ 는 다이얼로그 없이 즉시 닫히고 카드 1장이 남는다(송신 0). 이어서 남은 NXT 카드 ✕ 는 자기 키이므로 `unknown` 「NXT」다.
    - (c) 반대 순서: NXT 카드를 먼저 닫으면(확인) 그 키를 보여주는 카드가 없어지므로, KRX 카드 ✕ 에 다시 「잠긴 거래소: NXT」 경고가 뜬다.
  - ⑦-b · ⑦-e · ⑦-f 는 고치지 않았고 초록이다.

## TDD

- RED: `pnpm --filter @gh-radar/webapp test src/components/trading/__tests__/trading-workbench.test.tsx` → `Tests  2 failed | 106 passed (108)`. 실패는 ⑦(`expected 'unknown' to be 'registered'`)과 ⑦-g (a)(다이얼로그가 null 이 아님)이다. ⑦-g (c) 반대 순서는 현행 동작과 같아 RED 단계에서도 초록이었다. 이것은 회귀 보호용 케이스다.
- GREEN: 같은 명령 → `Tests  108 passed (108)`.

## 게이트 (원문)

- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json`, exit 0
- `pnpm --filter @gh-radar/webapp run test` → `Test Files  98 passed (98)` · `Tests  1657 passed | 1 skipped (1658)`
- `cd webapp && pnpm exec playwright test trading-workbench` → `39 passed (1.7m)`. e2e spec 은 고치지 않았다.

## Deviations from Plan

- **보호 브랜치 커밋**: 실행기의 커밋 전 단언 기준으로 `master` 는 보호 브랜치(`git.base-branch --is-protected master` → true)다. 이 프로젝트 quick 흐름은 원래 master 에 순차 커밋하고(직전 pq2 커밋들도 master), 오케스트레이터도 루트 저장소 커밋을 지시했다. 그래서 멈추지 않고 로컬 master 에 커밋했다. push 는 하지 않았다.
- **동시 세션 커밋**: 작업 중에 다른 세션이 `ef33e75`(종목 차트 기본 기간 3Y→1Y)를 master 에 커밋했다. 이 커밋은 내 두 파일을 건드리지 않았다. 내 커밋 `7cff024` 는 그 위에 올라갔다. `plan_head_before` 는 ef33e75 다.
- 그 밖에는 플랜대로 실행했다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/trading-workbench.tsx (`quick-260923-que` 포함)
- FOUND: webapp/src/components/trading/__tests__/trading-workbench.test.tsx (`quick-260923-que` 포함)
- FOUND: 커밋 7cff024
