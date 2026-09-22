---
phase: 18-gh-trade-ui-nxt-vi
plan: 06
subsystem: ui
tags: [trading, workbench, card, container-query, react, tdd]
status: complete

requires:
  - phase: 18-02
    provides: "parseStrategyKey 의 lib/limit-chaser.ts 이동 · §2.2b lc/wb 소비처 문단"
  - phase: 17
    provides: "latchLedStateOf 규칙표 · LatchLed · 종가(kc) 하한 칸 대체 규율"
provides:
  - "QuoteGrid10 — 종목정보 10칸 단일 컴포넌트 (card/quote-grid-10.tsx)"
  - "CardHeader + EXCHANGE_LOCKED_TITLE — l1/l2 헤더 · 760 로컬 경계 · 거래소 잠김 3속성 · LED 3칩 (card/card-header.tsx)"
  - "StrategyCard(memo) · useStrategyCardState · StrategyCardState · LC_CONTAINER_CLASS (card/strategy-card.tsx)"
  - "ECHO_BANNER_MS · ACK_TIMEOUT_MS · strategyStatusOf · StrategyStatus 정의가 strategy-card.tsx 로 이동 (limit-chaser-client 는 re-export)"
affects: [18-10, 18-11, 18-12, 18-13]

actuals:
  tokens: 23760
  tasks: 3
  commits: 6
plan_head_before: 34e659b521fe2d9b380378a688e236e81021573c

tech-stack:
  added: []
  patterns:
    - "카드 상태는 훅(useStrategyCardState) 하나 — 카드와 옛 화면이 같은 훅을 쓰고, 에코 상관은 인스턴스별"
    - "본문 자리는 body 렌더 prop — 카드 상태를 카드 밖으로 끌어올리지 않고 본문에 건넨다"
    - "카드 콜백은 isin 을 실어 올린다 — 부모가 카드마다 클로저를 만들지 않아 memo 가 산다"
    - "컨테이너 선언의 출처는 LC_CONTAINER_CLASS 한 곳 — 문자열을 다른 파일에 다시 적지 않는다"
    - "토글 후 포커스는 요소 참조가 아니라 안정 id 로 되찾는다(스택 ↔ 격자 재마운트 대비)"

key-files:
  created:
    - webapp/src/components/trading/card/quote-grid-10.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/quote-grid-10.test.tsx
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  modified:
    - webapp/src/components/trading/limit-chaser-client.tsx

key-decisions:
  - "StrategyCard 의 거래소는 제어형(exchange + onExchangeChange(isin, ex)) — 18-11 작업대 카드 집합 {isin, exchange, open} 이 소유한다. routeKey→initialKey 문자열 대신 isin/exchange/accountNo prop"
  - "옛 /trading/limit-chaser 화면은 StrategyCard 를 통째로 렌더하지 않고 useStrategyCardState 훅 + LC_CONTAINER_CLASS 를 빌려 쓴다 — 검색 헤더·계좌 칩·상태줄이 새 카드 헤더와 달라, 통째 교체하면 1,908줄 옛 테스트와 e2e 가 18-12/13 전에 깨진다"
  - "이탈 경고(useLeaveWarning)는 카드에 넣지 않는다 — 카드 N개가 각자 window.confirm 을 띄우게 된다. 카드는 onDirtyCountChange(isin, n) 로 보고하고 합산 경고는 18-11 작업대 1곳"
  - "카드 헤더에 StrategyBadge 를 두지 않는다 — 목업 정본 헤더에 없고 무장은 LED, 거래소는 세그먼트가 말한다"
  - "거래소 세그먼트는 Radix ToggleGroup single — 항목이 role=radio + aria-checked(라디오형). aria-pressed 는 Radix 가 single 모드에서 강제로 지운다"
  - "카드 인라인 고지(에코 배너 · 미반영)는 카드 안 role=status 로 둔다 — 자기 상태만 그린다"

requirements-completed: []

coverage:
  - deliverable: "종목정보 10칸 추출 — 라벨·색·배치 불변, 정의 1벌"
    human_judgment: false
    verification:
      - kind: test
        ref: "quote-grid-10.test.tsx (9 cases)"
        status: pass
      - kind: command
        ref: "grep -c lc-quote-grid card/quote-grid-10.tsx → 2"
        status: pass
  - deliverable: "카드 헤더 — 잠김 3속성 · 전파 차단 · 스위치 부재 · ⓘ 비활성 · 760 로컬 경계"
    human_judgment: false
    verification:
      - kind: test
        ref: "card-header.test.tsx (14 cases)"
        status: pass
      - kind: command
        ref: "! grep -nE '\\b(sm|md|lg|xl):' card/card-header.tsx"
        status: pass
  - deliverable: "카드 간 에코·구독 격리 + @container/lc 선언 이동"
    human_judgment: false
    verification:
      - kind: test
        ref: "strategy-card.test.tsx (9 cases) — 에코 격리 케이스는 키 필터 한 줄을 지우면 실패함을 뮤테이션으로 확인"
        status: pass
      - kind: command
        ref: "@min-[Npx]/lc: 줄 수 — form 16 · ladder 5 불변, client 22 → 8 + quote-grid-10 14 (이동)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp test → 1153 passed (기준선 1121, 하한 1008)"
        status: pass
  - deliverable: "카드 폭 램프에서 실제 배치 전환 · 목업 대비 시각 대조"
    human_judgment: true
    verification:
      - kind: manual
        ref: "카드는 아직 어느 라우트에도 마운트되지 않음 — 18-11 작업대 조립 후 dev 화면 대조, 폭 램프는 18-13 Playwright"
        status: pending

metrics:
  duration: "~15분"
  completed: 2026-09-22
---

# Phase 18 Plan 06: 전략 카드 골격 세 조각 Summary

카드 1장의 골격 세 조각을 만들었습니다. 종목정보 10칸(`QuoteGrid10`), 헤더(`CardHeader`), 그리고 둘을 담고 `@container/lc` 를 선언하는 카드 래퍼(`StrategyCard`)입니다. 카드의 상태는 `useStrategyCardState` 훅 하나에 있습니다. 여기에는 relay 구독, 자기 키 `find`, 전송과 에코의 상관, 로그, ServerMessage, LED 가 들어 있으며, 옛 상따 화면도 18-12 에서 사라질 때까지 같은 훅을 씁니다.

## 무엇을 만들었나

- **`card/quote-grid-10.tsx`**
  - 옛 화면의 `QuoteCell`·`priceText`·`priceTone` 과 `lc-quote-grid` 마크업을 그대로 옮겼습니다. 라벨 10개, 색 규칙, 700 밴드 `order` 번호는 그대로입니다.
  - 종가(`kc > 0`)가 하한 칸을 대신하는 규칙과 「스냅샷 폴백 금지 · 벽시계 금지」 ★ 주석 전문을 함께 옮겼습니다.
  - 가격 4값은 넘기지 않으면 `quote` 값을 씁니다. 옛 화면은 REST 폴백으로 결정한 값을 넘깁니다.
- **`card/card-header.tsx`**
  - 목업 `:1062-1070` 구조를 따릅니다. `l1` 에는 캐럿, 종목명(ellipsis + `title`), 코드, KRX|NXT 세그먼트, 현재가·등락률이 있고, `l2` 에는 LED 3칩, ⓘ, ✕ 가 있습니다.
  - 카드 폭 760 경계는 `@min-[760px]/lc:` 로 구현했고, 주석에 「§2.2b 밴드 표와 무관한 로컬 경계」라고 적었습니다.
  - 폰 밴드에서는 종목명/코드가 두 줄로 접힙니다.
  - 등록된 카드는 세그먼트가 `disabled`·`aria-disabled`·`title` 세 경로로 잠깁니다.
  - 헤더 전체가 클릭 영역입니다. 안쪽 컨트롤은 `stopPropagation` 으로 전파를 막고, 토글 뒤에는 안정 id 로 포커스를 되찾습니다.
- **`card/strategy-card.tsx`**
  - `article[data-slot=strategy-card]` 가 `LC_CONTAINER_CLASS`(`@container/lc`)를 선언합니다. 이 컴포넌트는 `memo` 로 감쌌습니다.
  - 카드 구성은 헤더 → 10칸 → 인라인 고지 → `body(card)` 렌더 prop 순서이고, 본문은 18-10 이 채웁니다.
  - `open=false` 이면 헤더만 남고 본문 영역은 `hidden` 빈 요소가 됩니다. 이 요소는 `aria-controls` 대상이라 남겨 둡니다.
  - 콜백은 모두 `isin` 을 실어 올립니다. 종목명과 코드는 문자열 prop 으로 받고, 라벨 Map 은 구독하지 않습니다.
- **`limit-chaser-client.tsx`** (옛 화면이며 18-12 에서 제거 예정)
  - 상태 몸통 약 400줄을 훅 호출 하나로 바꿨고, 10칸 정의와 `strategyStatusOf` 정의도 지웠습니다. 기존 소비처가 무수정으로 동작하도록 re-export 는 남겼습니다.
  - 컨테이너는 같은 상수를 빌려 페이지 루트에 답니다. 기존 1,908줄 테스트는 수정 없이 green 입니다.

## 검증

- `pnpm --filter @gh-radar/webapp test`: 82 files, **1153 passed**, 1 skipped (기준선 1121, 하한 1008)
- `pnpm --filter @gh-radar/webapp run typecheck`: exit 0
- `eslint src/components/trading/card/ limit-chaser-client.tsx`: 0 문제
- `@min-[Npx]/lc:` 줄 수: form 16 · ladder 5 는 불변입니다. client 의 22줄은 8줄 + quote-grid-10 14줄로 나뉘었습니다(이동이며 재작성 아님).
- 에코 격리 테스트는 뮤테이션으로 검증했습니다. `lastLimitChaserEcho.key !== key` 한 줄을 지우면 격리 케이스가 실패합니다.
- 컨테이너 쿼리의 실제 폭 전환은 jsdom 이 평가하지 않습니다. 테스트는 선언 위치와 클래스까지만 단언하고, 폭 램프는 18-13 Playwright 가 맡습니다.

## Deviations from Plan

### 계획 문면과 다르게 한 것

**1. [Rule 1 - 계획 오기] 「종가」 치환 대상은 기준 칸이 아니라 하한 칸**
- **발견:** Task 1 `<behavior>` 는 「기준 칸이 `krx_close_price > 0` 일 때 「종가」가 된다」고 적었습니다.
- **사실:** 기존 코드와 Phase 17 D-11 개정(사용자 결정 2026-09-18 「종가가 있을땐 하한가 대신에 종가」)은 **하한** 칸을 대체합니다. 그대로 옮기라는 지시에 따라 기존 동작을 유지했고, 테스트도 하한 칸 치환을 단언합니다.
- **커밋:** 067b652

**2. [Rule 3 - 차단 회피] 옛 화면은 StrategyCard 통째 렌더가 아니라 같은 훅 + 컨테이너 상수로 재배선**
- **문제:** 옛 화면의 헤더(검색 트리거·계좌 칩·거래소 콤보)와 상태줄은 새 카드 헤더와 다른 UX 입니다. 통째로 교체하면 18-12/13 전에 옛 단위 테스트와 e2e 가 깨집니다.
- **조치:** 카드 몸통은 `useStrategyCardState` 로 한 벌만 두고 옛 화면이 그 훅을 호출합니다. `@container/lc` 문자열은 `strategy-card.tsx` 에만 있고, 옛 화면은 `LC_CONTAINER_CLASS` 를 import 합니다.
- **커밋:** 4358957

**3. [Rule 2] 거래소 세그먼트 접근성 속성이 `aria-pressed` 가 아니라 라디오형**
- Radix `ToggleGroup type="single"` 은 항목에 `role="radio"` + `aria-checked` 를 주고 `aria-pressed` 를 강제로 지웁니다. UI-SPEC 이 요구한 「라디오형 · ToggleGroup single」을 우선했고, ←/→ 로빙 포커스도 함께 따라옵니다.

**4. StrategyCard prop 형태**
- 계획의 `initialKey` 문자열 대신 `isin`·`accountNo`·`exchange`(제어형)를 받습니다. 18-11 이 카드 집합을 `{isin, exchange, open}` 으로 소유하므로 이쪽이 그 계약에 맞습니다.

**5. Task 3 TDD 순서**
- 구현이 기존 코드의 이동이라, 옛 1,908줄 테스트가 특성화 테스트 역할을 했습니다. 새 테스트 커밋(5008b62)을 구현 커밋(4358957)보다 먼저 두었지만, 엄밀한 RED 실행은 없었습니다. 대신 에코 격리 단언이 실제로 부하를 받는지 뮤테이션으로 확인했습니다.

## 다음 plan 이 알아야 할 것

- **18-10:** `StrategyCard` 의 `body={(card) => <CardBody … />}` 로 본문을 채우면 됩니다. `card` 에는 `server`·`quote`·`tape`·`isStale`·`answerSeq`·`resetSeq`·`liveSeed`·`badges`·`handleSent`·`handleServerEcho`·`setDirtyCount`·`log`·`lastError`·`appliedAt` 가 들어 있습니다. 폼 remount 키는 옛 화면과 같게 `${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}` 입니다.
- **18-11:**
  - 콜백 `onToggle`·`onClose`·`onExchangeChange`·`onInfo`·`onDirtyCountChange` 는 모두 `isin` 을 받습니다. 부모는 안정 콜백(`useCallback`)을 한 번 만들어 모든 카드에 넘기면 `memo` 가 삽니다.
  - `useLeaveWarning` 은 아직 `limit-chaser-client.tsx` 에 있으니 작업대로 옮기면 됩니다.
  - ✕ 를 눌렀을 때 등록 전략의 삭제 확인 다이얼로그와 거부 시 인라인 고지(E7 error)는 작업대의 `onClose` 가 맡을 몫입니다. 코드베이스에 「기존 삭제 확인 다이얼로그」는 없었습니다.
  - 헤더 토글 id 는 `strategy-card-{ISIN}-toggle` 이고, ✕ 이후 다음 카드 헤더로 포커스를 옮길 때 이 id 를 쓰면 됩니다.

## Known Stubs

없습니다. 본문 자리의 `body` 는 선택 prop 이고 18-10 이 채웁니다(계획된 슬롯).

## Threat Flags

없습니다. 새 네트워크 경로나 신뢰 경계는 없고, 기존 relay 구독·에코 경로를 카드 단위로 옮겼을 뿐입니다.

## Self-Check: PASSED

- 신설 6파일 존재 확인, 커밋 6건(9a1d316 · 067b652 · 1ec0609 · f7c3eb1 · 5008b62 · 4358957) git log 확인.
