---
phase: quick-260923-p3k
plan: 01
subsystem: webapp/trading-workbench
tags: [trading, workbench, card-order, tdd]
status: complete
requires: [quick-260923-onn, quick-260923-lyt]
provides:
  - "withCardOpen(prev, id, open) — 카드 순서 규칙 단일 경로 (순수 함수 · export)"
  - "isinFocusCardOf(cards, isin) — 종목 단위 포커스 대상 선택 (업데이터·스크롤 공용)"
affects:
  - webapp/src/components/trading/workbench/trading-workbench.tsx
tech-stack:
  added: []
  patterns: ["상태 전이 시 배열 끝으로 이동 + 같은 상태면 참조 유지(베일아웃)"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "카드 순서: open 을 바꾸는 모든 경로가 withCardOpen 을 지나 바뀐 카드를 배열 맨 끝으로 옮긴다(접으면 스택 끝 · 펼치면 펼친 무리 끝). renderOrderOf · 저장 포맷은 불변"
  - "종목 단위 포커스(돌파 칩 · 종목 추가)는 isinFocusCardOf — 그 ISIN 의 펼친 카드 우선, 없으면 배열(=표시) 첫 카드. 업데이터와 스크롤 효과가 같은 함수를 쓴다"
metrics:
  duration: "약 25분"
  completed: 2026-09-23
actuals:
  tokens: 4900
  tasks: 2
  commits: 2
plan_head_before: 99da39d
---

# Quick 260923-p3k: 작업대 카드 순서 — 가장 최근에 상태가 바뀐 카드가 그 무리의 끝 Summary

`withCardOpen` 순수 함수 하나로 `open` 을 바꾸는 7개 지점을 모았다. 접은 카드는 접힘 스택 맨 끝으로, 펼친 카드는 펼친 카드들 맨 끝으로 간다. 같은 ISIN 카드가 둘일 때 스크롤이 엉뚱한 카드로 가던 결함은 `isinFocusCardOf` 로 막았다.

## 바뀐 지점 (trading-workbench.tsx)

| # | 지점 | 전 | 후 |
|---|------|----|----|
| 1 | `withFocusedCard` (기존 키 분기) | `prev.map` 으로 펼침 | `withCardOpen(prev, cur.id, true)` |
| 2 | `fillAccountCards` (펼침 승계) | `kept.map` 으로 펼침 | `kept` 를 돌며 `next = withCardOpen(next, c.id, true)` |
| 3 | `focusCard` | 첫 카드 `prev.map` 펼침 | `withCardOpen(prev, first.id, true)` (대상 = `isinFocusCardOf`) |
| 4 | `addCard` (기존 카드 분기) | `prev.map` 펼침 | `withCardOpen(prev, first.id, true)` (대상 = `isinFocusCardOf`) |
| 5 | `toggleCard` | `prev.map` 반전 | `withCardOpen(prev, id, !cur.open)` |
| 6 | `changeExchange` (clash 분기) | `prev.map` 펼침 | `withCardOpen(prev, clash.id, true)` |
| 7 | `selectUnfilled` (existing 분기) | `prev.map` 펼침 | `withCardOpen(prev, target.id, true)` |

- 머리 주석 ② 에 카드 순서 단락과 `isinFocusCardOf` 설명을 더했다.
- 새 카드 append · 등록 전략 자동 카드(`open:false` append) · `restoreSavedCards` · `removeCard` 는 손대지 않았다.
- `card-grid.tsx` · `renderOrderOf` · `trading-layout.ts` · `pnpm-lock.yaml` diff 0 (`git diff --quiet HEAD~2 HEAD -- …` 통과).
- 확인 수치: `withCardOpen(` 8회 · `open: !c.open` 0 · `{ ...x, open: true }` 0 · `{ ...c, open: true }` 0 · 테스트 파일 `withCardOpen` 7회.

## 새 테스트 케이스

**describe 「withCardOpen — 카드 순서 규칙 (quick-260923-p3k · 순수 함수)」**
- 대상이 이미 같은 상태면 같은 배열 참조를 돌려준다(베일아웃 · 순서 불변)
- 없는 id 면 같은 배열 참조를 돌려준다
- 접으면 그 카드가 배열 맨 끝 = 접힘 스택 맨 끝으로 간다 · 입력은 변하지 않는다
- 펼치면 그 카드가 배열 맨 끝 = 펼친 카드들 맨 끝으로 간다

**describe 「TradingWorkbench — 카드 순서: 가장 최근에 바뀐 카드가 무리의 끝 (quick-260923-p3k)」**
- 토글 — 접으면 접힘 스택 맨 끝, 펼치면 펼친 카드 맨 끝
- 돌파 칩 — 새 카드도, 접힌 카드를 다시 여는 「거래중」 칩도 펼친 카드 맨 끝 · 이미 펼친 카드는 순서 불변
- 카드가 둘인 ISIN — 펼친 카드가 끝으로 옮겨도 칩을 다시 누르면 둘째 카드를 열지 않고, 스크롤은 펼친 그 카드로 간다 *(플랜 밖 추가 · 아래 이탈 1)*

**describe 「TradingWorkbench — 미체결 행 선택 (D-21)」에 1건 추가**
- quick-260923-p3k — 접힌 정확 일치 카드를 행으로 펼치면 펼친 카드들의 맨 끝으로 온다

**e2e 케이스 6** — 펼침 2·접힘 1 직후 펼친 칸 순서 LONG → E2E, 끝에서 E2E 를 접어 스택 안 순서 LONG → E2E 를 확인한 뒤 다시 펼쳐 끝 상태 모양(펼침 2 · 접힘 1)을 이전과 같게 남긴다.

## 갱신한 기존 케이스

- **「TradingWorkbench — 카드 키 규칙 (WR-05 · D-07 · D-08 · T-18-94) > 카드가 둘인 ISIN 의 돌파 칩 · 종목 추가는 카드를 늘리지 않고 첫 카드를 펼친다」** — 마지막 단언을 `KRX true · NXT false` 에서 `KRX false · NXT true` 로 바꿨다. 시나리오는 이렇다: 칩으로 KRX 를 편다 → KRX 를 접는다 → 「추가」를 누른다. KRX 를 접으면 새 규칙에 따라 스택 끝으로 가서 스택이 [NXT, KRX] 가 된다. 펼친 카드가 없으니 「추가」는 배열(= 표시) 첫 카드인 NXT 를 편다. 옛 규칙에서는 배열이 생성 순서로 고정돼 KRX 가 늘 첫 카드였다.
- 「배치 기억」 L1 · 「fillAccountCards」 4건 · WR-05 · 「카드 추가」 3건 · card-grid 테스트는 **고치지 않았고** 그대로 초록이다.

## TDD

- RED: 테스트를 먼저 넣고 돌렸다. `Tests 7 failed | 81 passed (88)` — 순수 함수 4건(함수 없음), 작업대 순서 2건, 미체결 1건이 실패했다.
- GREEN: `withCardOpen` 을 넣고 7개 지점을 바꿨다. 이때 기존 「카드가 둘인 ISIN…」 1건이 깨졌다(아래 이탈 1). `isinFocusCardOf` 와 테스트 갱신 뒤 `2 passed · 108 passed (108)` (trading-workbench + card-grid).
- mutation 확인: `isinFocusCardOf` 를 옛 규칙(`cards.find(isin)`)으로 되돌리면 새 2카드 케이스만 실패했다(`1 failed | 88 passed (89)`). 확인 뒤 원복했다.

## 게이트 결과 (원문)

- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json` exit 0
- `pnpm --filter @gh-radar/webapp run test` → `Test Files  94 passed (94)` · `Tests  1569 passed | 1 skipped (1570)`
  - stderr 에 `at startTests (…@vitest/runner…)` 스택 줄이 찍히지만 실패가 아니다. 다른 테스트의 로그 출력이고 이번 변경과 무관하다.
- `cd webapp && pnpm exec playwright test trading-workbench` → `38 passed (3.1m)` · failed 0
- `pnpm-lock.yaml` 변경 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 같은 ISIN 카드 둘일 때 스크롤 대상 어긋남 · 칩 재클릭이 둘째 카드를 여는 문제**
- **발견:** Task 1 GREEN 단계. 기존 케이스 「카드가 둘인 ISIN 의 돌파 칩 · 종목 추가는 …첫 카드를 펼친다」가 실패하면서 드러났다.
- **문제:** `focusCard` · `addCard` 는 `prev.find(isin)` 로 「첫 카드」를 골라 편다. 편 카드는 `withCardOpen` 에 의해 배열 끝으로 옮겨진다. 그런데 스크롤 효과는 `{ isin }` 대상을 여전히 `cards.find(isin)` 으로 풀었다. 그래서 같은 ISIN 카드가 둘이면 (a) 스크롤이 방금 편 카드가 아니라 접힌 다른 카드로 갔고, 스크롤 효과 주석의 「업데이터가 고른 카드와 어긋나지 않는다」 불변식이 깨졌다. (b) 칩을 다시 누르면 이미 펼친 카드를 두고 둘째 카드까지 열렸다. 플랜의 「펼친 카드를 다시 포커스하면 참조 그대로」 진리에도 어긋난다.
- **수정:** 비export 순수 함수 `isinFocusCardOf(cards, isin)` 를 추가했다. 그 ISIN 의 펼친 카드가 있으면 그것을, 없으면 배열 첫 카드를 고른다. `focusCard` · `addCard` 업데이터와 스크롤 효과의 `{ isin }` 분기가 모두 이 함수를 쓴다. `withCardOpen` 규칙과 `renderOrderOf` 는 그대로다. 플랜의 「스크롤 대상은 여전히 `cards.find` 로 푼다」 문장만 이 함수로 바뀌었다.
- **잠금:** 새 케이스 「카드가 둘인 ISIN — …둘째 카드를 열지 않고, 스크롤은 펼친 그 카드로 간다」(`scrollIntoView` 대상 data-key 단언)를 추가하고 mutation 으로 확인했다. 기존 케이스 1건은 새 규칙으로 갱신했다(위 「갱신한 기존 케이스」).
- **파일:** trading-workbench.tsx · trading-workbench.test.tsx
- **커밋:** d50d180

### 기타

- 커밋은 `master` 에 직접 했다. 이 저장소 quick 워크플로는 격리 없이 순차로 돌고(`branching_strategy: none`), 앞선 onn 커밋도 같은 방식이다. 실행기의 보호 브랜치 가드는 적용하지 않았다. push 는 하지 않았다.
- 실행 도중 다른 세션의 `.planning/quick/260923-pgu-…/` 가 untracked 로 나타났다. 손대지 않았고 stage 하지 않았다.

## Known Stubs

없음.

## Threat Flags

없음 — 순수 클라이언트 상태 순서 변경이다. 서버 송신 0 · 저장 포맷 불변.

## 커밋

- `d50d180` feat(quick-260923-p3k): 작업대 카드 순서 — 접으면 접힘 스택 끝 · 펼치면 펼친 카드 끝 (withCardOpen 단일 경로)
- `bdfaacf` feat(quick-260923-p3k): e2e 케이스 6 — 방금 바뀐 카드가 무리의 끝 단언

## Self-Check: PASSED

- 수정 파일 3개 존재 · 커밋 `d50d180` · `bdfaacf` 가 `git log` 에 있음 · `git rev-list --count 99da39d..HEAD` = 2
