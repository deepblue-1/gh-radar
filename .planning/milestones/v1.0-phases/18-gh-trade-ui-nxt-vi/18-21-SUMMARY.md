---
phase: 18-gh-trade-ui-nxt-vi
plan: 21
subsystem: trading-workbench
status: complete
tags: [gap-closure, TRADE-09, webapp, card-grid, WR-05]
gap_closure: true
requires:
  - 18-20
provides:
  - "WorkbenchCard.id(`wb-card-{n}`) — 카드 정체성. 격자 key · 호스트 노드 · 토글 DOM id · 콜백 인자 · 더티/로그 합산이 전부 카드 id 축"
  - "CardGridItem.id · StrategyCardProps.cardId(콜백 첫 인자 · DOM id 접두) · CardHeaderProps.nameTitle(종목명 title 「{종목명} · 계좌 {계좌} · {거래소}」)"
  - "작업대 전략 키 규칙 — 등록 전략 유입은 현재 키 대조, 사이드바/`?focus=` 는 요청 키의 카드만 펼침, 거래소 토글·계좌 채움의 키 충돌 거부"
  - "trading-workbench.test.tsx describe 「WR-05 — 같은 종목의 두 번째 전략」 4케이스 + 「카드 키 규칙」 5케이스 · card-grid 같은 isin 두 장 케이스 · strategy-card cardId/title 케이스 · e2e GC3"
affects:
  - 18-REVIEW WR-05 종결 근거
  - 18-22 미체결 선택 규칙 — WR-05 가 재현·수정됐으므로 18-22 는 주 갈래(카드 id 기반)를 쓴다. 선택 전달 조건(작업대 renderCard 의 selectedUnfilled)은 이 플랜에서 바꾸지 않았다
  - e2e 헤더 토글 선택자 — `#strategy-card-{ISIN}-toggle` 은 더 이상 없다. `toggleOf(page, isin)`(헤더 aria-expanded 버튼) 을 쓴다
tech-stack:
  added: []
  patterns:
    - "카드 정체성(단조 증가 id) ↔ 현재 값(전략 키) 분리 — 키는 대조에만, 정체성에는 쓰지 않는다"
    - "id 는 업데이터 밖에서 발급해 업데이터에 넘긴다 — StrictMode·재처리 때 같은 카드가 다른 id 로 다시 마운트되지 않게"
    - "스크롤 대상은 서술자({key}|{isin}) 로 두고 레이아웃 효과가 이번 렌더의 카드 집합으로 푼다 — 업데이터가 고른 카드와 어긋나지 않는다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/card-grid.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/card-grid.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
key-decisions:
  - "WR-05 는 실재했다(수정 전 코드로 4/4 RED) — 카드 정체성을 ISIN 에서 작업대 발급 카드 id 로 옮겨 닫는다. 전략 키는 등록 전 카드가 거래소 토글로 바꿀 수 있어 정체성으로 쓰지 않는다(WR-02 재마운트 재발 방지)"
  - "두 카드가 같은 전략 키를 가질 수 없다 — 거래소 토글이 다른 카드 키와 겹치면 토글하지 않고 그 카드를 펼쳐 스크롤, 계좌 채움이 겹침을 만들면 빈 계좌 카드를 치운다(T-18-94)"
  - "사용자 트리거 추가(돌파 칩·종목 추가)는 종목 단위 유지 — 그 ISIN 의 첫 카드를 펼칠 뿐 새 카드를 만들지 않는다. 추가 카드는 서버 전략 유입(과 18-22 미체결 선택)만 만든다"
  - "합친 전략 로그의 중복 판정 축을 종목명(who) 에서 카드 id 로 옮겼다 — 같은 종목 카드 둘의 같은 문장이 서로를 지우지 않게. 규칙(같은 카드 직전 줄과 같은 문장은 건너뜀) 자체는 유지"
requirements-completed: [TRADE-09]
metrics:
  duration: "약 13분"
  completed: 2026-09-22
  tasks: 3
  files: 9
actuals:
  tokens: 16600
  tasks: 3
  commits: 3
plan_head_before: 2a8c3c6bc643a8f264c59a303e79dcd6704e318f
---

# Phase 18 Plan 21: 같은 종목 두 번째 전략 카드 (WR-05) Summary

카드 정체성을 ISIN 에서 작업대가 발급하는 카드 id(`wb-card-{n}`)로 옮겼다. 이제 같은 종목에 등록 전략이 둘(KRX·NXT, 또는 계좌 A·B)이면 카드도 두 장이고, 각 카드의 스위치는 자기 전략 키만 켜고 끈다. 사이드바나 `?focus=` 로 들어오면 요청한 전략 키의 카드가 정확히 펼쳐진다.

## 확인 먼저: 수정 전 재현 판정 (Task 1)

수정 전 코드(HEAD `2a8c3c6`)에서 `trading-workbench.test.tsx` 의 「WR-05 — 같은 종목의 두 번째 전략」 describe 를 실제로 돌린 결과다. 단언은 DOM `data-key` · `data-open` 만 본다.

| # | 케이스 | 수정 전 | 관측 | 수정 후 |
|---|--------|---------|------|---------|
| 1 | 등록 `X:A:KRX` · `X:A:NXT` → 카드 2장, 각자 자기 키 | **RED** | 카드 1장(`X:A:KRX`)뿐. NXT 전략은 작업대에 없음 | GREEN |
| 2 | 등록 `X:A:KRX` · `X:B:KRX`(계좌 A·B) → 카드 2장 | **RED** | 카드 1장뿐. 계좌 B 전략이 보이지 않음 | GREEN |
| 3 | 사이드바 요청 `X:A:NXT` → NXT 카드만 펼침 · KRX 는 접힘 | **RED** | `X:A:KRX` 카드가 펼쳐짐(다른 키 카드) | GREEN |
| 4 | `?focus=X:A:NXT` 로 마운트 → 그 키의 카드만 펼침 | **RED** | `X:A:KRX` 카드가 펼쳐짐 | GREEN |

판정: **WR-05 실재.** 원인은 `trading-workbench.tsx` 등록 전략 유입 루프의 `if (next.some((x) => x.isin === c.isin)) continue;`(같은 ISIN 두 번째 전략이 버려짐)와 `withFocusedCard` 의 ISIN 대조(같은 ISIN 의 다른 키 카드를 펼침)다. 가동 중인 실전략이 작업대에 보이지 않아 끌 수단이 없어지는 경로였다(T-18-92). RED 커밋 `f51d934`.

## 수행 내용

### Task 2 — 카드 id 계약 (`876717a`)
- `CardGrid`: `CardGridItem.id` 를 key · 호스트 Map · 자리표 ref · 토글 id(`strategy-card-{id}-toggle`) · ✕ 뒤 포커스 순서에 쓴다. `c.isin` 참조 0건.
- `StrategyCard`: `cardId` prop 추가. `onToggle` · `onClose` · `onExchangeChange` · `onInfo` · `onDirtyCountChange` · `onLogChange` 의 첫 인자와 DOM id 접두가 `cardId` 에서 나온다. 구독과 에코 필터는 여전히 `isin` / 전략 키를 쓴다(③ · T-18-25 그대로).
- `CardHeader`: 선택 prop `nameTitle` 을 받아 종목명 `title` 을 「{종목명} · 계좌 {계좌} · {거래소}」 로 채운다(UI-SPEC Q-3). 화면에 보이는 요소는 추가하지 않았다.
- 테스트: 같은 isin 두 장(id 다름)이 서로 다른 호스트에 그려지고, 한 장을 접어도 다른 장의 상태·마운트가 그대로인 격자 케이스. `cardId` 콜백 인자 · DOM id 단언과 `title` 케이스 추가.

### Task 3 — 작업대 키 규칙 (`a5f1aac`)
- 카드를 만드는 자리(`addCard` · 등록 전략 유입 · `withFocusedCard`)는 모두 `nextCardId()` 로 id 를 받는다. id 는 업데이터 밖에서 뽑는다.
- 등록 전략 유입은 **현재 키 대조**로 바꿨다. 등록 전 카드가 방금 스위치를 켜서 60 에코가 오면 같은 키이므로 새 카드를 만들지 않는다.
- `withFocusedCard` 는 현재 키가 요청 키인 카드를 펼치고, 그런 카드가 없으면 그 전략의 계좌·거래소로 카드를 붙인다.
- `addCard` · `focusCard` 는 종목 단위로 동작해 그 ISIN 의 **첫 카드**를 펼친다(D-07 · D-08). 「거래중」 표식(`cardIsins`)은 ISIN 그대로다.
- `changeExchange(id, ex)`: 바꾼 뒤의 키를 다른 카드가 이미 쓰고 있으면 거래소를 바꾸지 않고 그 카드를 펼쳐 스크롤한다. 두 카드가 같은 키를 가지면 한 서버 전략을 두 훅이 소유하게 되기 때문이다(주석에 명시).
- 토글 · 닫기 · 제거 · 종목정보 · 더티 합산 · 로그 합산 · 닫기 확인 다이얼로그를 전부 카드 id 로 옮겼다. 미체결 선택 전달 조건은 바꾸지 않았다(18-22 몫).
- 407-411 주석의 근거를 「재접속 스냅샷이 같은 문장을 다시 쓰는 경우의 방어」로 고쳤다(18-20 이후 카드는 재마운트되지 않는다).
- e2e: `toggle` 헬퍼는 이제 `toggleOf(page, isin)` 으로 헤더 안의 `aria-expanded` 버튼을 찾는다(케이스 6 · GC2). 신규 **GC3** — 같은 종목 KRX·NXT 에코 2건이 오면 카드 2장과 사이드바 항목 2개가 생기고, NXT 항목을 누르면 NXT 카드만 펼쳐지는지와 NXT 카드 헤더의 `title` 을 확인한다.

## 검증

- `vitest run`(webapp 전량): 92 files · **1368 passed** · 1 skipped
- `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig): 통과
- `test:e2e -- trading-workbench sidebar-tree`: **38 passed**. GC3 · 케이스 6(스택) · 10(사이드바) · 16(이탈 경고) · GC2 · sidebar-tree 전량 포함
- `eslint`(변경 파일): 경고 0
- 인수 기준 grep: `card-grid.tsx` 의 `c\.isin` 0건, `trading-workbench.tsx` 의 `x.isin === c.isin` 0건

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `strategy-card-flow.test.tsx` 에 `cardId` 추가**
- **Found during:** Task 2
- **Issue:** `StrategyCardProps.cardId` 가 필수가 되면서, 플랜 files 목록에 없던 이 테스트의 `<StrategyCard>` 가 typecheck 에서 깨진다.
- **Fix:** `cardId="wb-card-1"` 한 줄 추가
- **Commit:** `876717a`

**2. [Rule 1 - Bug] 합친 전략 로그 중복 판정 축을 카드 id 로**
- **Found during:** Task 3
- **Issue:** 기존 판정(`prev.find(p => p.who === who)` 의 직전 줄과 같은 문장이면 건너뜀)은 종목명 축이다. 같은 종목 카드가 둘이 되면 한 카드의 「전략이 등록됐어요 · …」 줄이 다른 카드의 같은 문장 때문에 버려진다.
- **Fix:** 카드 id → 직전 문장 Map(ref)으로 판정한다. 판정을 업데이터 밖으로 빼서 업데이터를 순수하게 했고, 카드를 제거할 때 Map 항목도 지운다. 규칙 자체는 유지했다.
- **Commit:** `a5f1aac`

**3. [Rule 2 - Critical] 계좌 채움 효과의 키 충돌 방어 (T-18-94)**
- **Found during:** Task 3
- **Issue:** 계좌가 도착하기 전에 만든 카드(`X::KRX`)가 있는 상태에서 같은 키의 등록 전략(`X:A:KRX`)이 먼저 들어오면, 계좌를 채울 때 두 카드가 같은 키가 된다.
- **Fix:** 채운 키가 이미 다른 카드의 키면 빈 계좌 카드를 채우지 않고 치운다.
- **Commit:** `a5f1aac`

## 관찰 (범위 밖 · 수정 안 함)

- 사이드바 전략 항목은 같은 종목 전략 둘을 같은 종목명으로 보여 준다(`app-sidebar.tsx` `StrategyItem` — LED 3점만 다름). 이 플랜이 손댄 표면이 아니어서 고치지 않았다. 구분이 필요하면 별도 결정이 필요하다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크·인증 경로 없음. T-18-92~95 는 위 구현으로 완화됐다.

## Self-Check: PASSED

- 파일: `trading-workbench.tsx` · `card-grid.tsx` · `strategy-card.tsx` · `card-header.tsx` · 테스트 4개 · e2e spec 모두 존재
- 커밋: `f51d934` · `876717a` · `a5f1aac` 이 `git log` 에 있음 (`git rev-list --count 2a8c3c6..HEAD` = 3)
