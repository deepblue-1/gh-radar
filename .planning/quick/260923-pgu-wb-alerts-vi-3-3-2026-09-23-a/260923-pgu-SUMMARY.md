---
phase: quick-260923-pgu
plan: 01
subsystem: webapp/trading-workbench
status: complete
tags: [trading, workbench, alerts, toast, relay-reducer, a11y]
requires:
  - quick-260923-onn (카드 안 탭 CardTabs)
  - quick-260923-p3k (withCardOpen 카드 순서 단일 경로)
provides:
  - 작업대 이벤트 알림 토스트(접수·체결·정정확인·취소확인·거부·VI 발동·돌파 76)
  - relay 리듀서 add-only 주문번호 색인 `orderIndex`
  - 카드 탭 요청 통로 `CardTabRequest` / `requestedTab`
  - 카드 알림 표시 `data-alert`(헤더 3회 펄스 → 빨간 점 · 링)
affects:
  - webapp/src/lib/use-relay-socket.ts (RelayConnectionState 에 orderIndex 추가)
  - webapp/src/lib/relay-provider.tsx (EMPTY_RELAY_VALUE)
tech-stack:
  added: []
  patterns:
    - WeakSet 객체 정체성으로 새 relay 프레임만 알림(이력 재생 없음)
    - rateCrossSnapSeq 변화 렌더 = 78 스냅샷 → 무알림(breakout-strip 과 같은 축)
    - 「기록 먼저, 재생 나중」 알림음(체결·VI 새 알림만)
    - 요청 객체 `{ tab, seq }` — seq 가 바뀔 때만 로컬 탭 state 를 이긴다
key-files:
  created:
    - webapp/src/lib/trading-alerts.ts
    - webapp/src/lib/use-trading-alerts.ts
    - webapp/src/lib/__tests__/trading-alerts.test.ts
    - webapp/src/lib/__tests__/use-trading-alerts.test.tsx
    - webapp/src/components/trading/workbench/alert-toasts.tsx
    - webapp/src/components/trading/__tests__/alert-toasts.test.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/styles/globals.css
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "결정 갱신: Phase 15 D-36 · Phase 18 D-27 「토스트 라이브러리 없음 — 인라인 role=status」 → 2026-09-23 목업 게이트에서 사용자가 ③A(토스트 + 카드 헤더 표시)로 의도적으로 뒤집음. 라이브러리는 여전히 0(자체 구현), 컨테이너 role=status · aria-live=polite 유지"
  - "주문번호 색인의 원천은 relay 리듀서가 받는 원시 acct 프레임의 unf 행(unfilledQty 0 포함) — mergeAccount 필터 전에 add-only 로 채움. 비우는 것은 reset 뿐(accountStates · orders 와 같은 규칙)"
  - "카드 알림 빨간 점은 종목명 <b> 가 아니라 헤더 토글 버튼(flex 행)의 ::after — 종목명이 truncate 라 긴 이름에서 점이 잘려 사라지기 때문"
  - "카드 표시 · 탭 요청 상태는 작업대 소유(alertedCardIds · tabRequest) — WorkbenchCard 에 섞지 않아 배치 저장에 들어가지 않음. 치운 카드 정리는 기존 cards 파생 효과에서 함께"
metrics:
  duration: "~15분"
  completed: 2026-09-23
  started: 2026-09-23T09:40:12Z
  finished: 2026-09-23T09:55:14Z
actuals:
  tokens: 25300
  tasks: 3
  commits: 3
plan_head_before: 6ae9f3ec6672a0891dd67d87332107d0b707bbff
---

# Quick 260923-pgu Plan 01: 작업대 이벤트 알림 (목업 ③A) Summary

접수·체결·정정확인·취소확인·거부·VI 발동·돌파(76)를 작업대 우하단(폰은 상단 전폭) 자체 구현 토스트로 띄운다. 같은 주문의 체결은 3초 창으로 한 토스트(「N건」)에 묶는다. 이벤트가 난 카드는 헤더가 3회 펄스한 뒤 빨간 점과 `--primary` 45% 링으로 남는다. 토스트를 누르면 그 카드가 펼쳐져(없으면 새로 붙어) 맞는 탭으로 간다. 종목·방향·이름 조인은 relay 리듀서의 add-only 주문번호 색인으로 한다.

## 결정 갱신 (D-36 · D-27 → ③A)

Phase 15 D-36 과 Phase 18 D-27 은 「토스트 라이브러리 없음 — 인라인 role=status」였다. 사용자가 2026-09-23 목업 게이트에서 **의도적으로 뒤집어** ③ 변형 A(토스트 + 카드 헤더 표시)를 채택했다.
- 라이브러리는 여전히 추가하지 않았다. `alert-toasts.tsx` 로 직접 구현했고 새 의존성은 0이다(`pnpm-lock.yaml` · `webapp/package.json` 변경 0).
- 컨테이너는 `role="status"` · `aria-live="polite"` 이고, 알림이 없어도 늘 서 있다(live 영역은 내용보다 먼저 있어야 낭독된다).
- 카드 안 `CardNotices` 6초 인라인 배너는 그대로다. 배너는 **카드 자기 상태**이고 토스트는 **이벤트**다.
- 위치 결정은 `trading-alerts.ts` ①, `alert-toasts.tsx` ①②, `trading-workbench.tsx` ⑩, `globals.css` §3.8 주석에 적었다. 토스트는 뷰포트 오버레이라서 여기서만 뷰포트 쿼리 `max-[699px]` 를 쓴다(D-28 카드 컨테이너 쿼리와 별개). 앱 셸이 아니라 `/trading` 작업대 루트 안에만 마운트된다.

## 작업 커밋

| Task | 이름 | 커밋 | 주요 파일 |
| ---- | ---- | ---- | --------- |
| 1 | 이벤트 모델 순수 lib + `useTradingAlerts` 훅 + relay 주문번호 색인 | d463001 | trading-alerts.ts · use-trading-alerts.ts · use-relay-socket.ts · relay-provider.tsx · 테스트 3벌 |
| 2 | 토스트 컴포넌트 · 카드 헤더 표시 CSS · 작업대 배선(클릭 이동 · 탭 요청) | 3efe2d2 | alert-toasts.tsx · globals.css §3.8 · card-tabs.tsx · strategy-card.tsx · trading-workbench.tsx |
| 3 | 작업대 통합 테스트 6건 + `cardForAlert` 판정 테스트 + e2e GC8 | 032a041 | trading-workbench.test.tsx · trading-workbench.spec.ts |

TDD: Task 1 에서는 `trading-alerts.test.ts` · `use-trading-alerts.test.tsx` 를 먼저 작성하고, 모듈이 없어 실패(RED — `Test Files 2 failed`)하는 것을 확인한 뒤 구현했다. Task 2 에서는 `alert-toasts.test.tsx`(모듈 없음)와 card-tabs 탭 요청 케이스(`1 failed | 11 passed`)의 RED 를 확인한 뒤 구현했다. RED 는 별도 커밋으로 남기지 않았고, 태스크당 1커밋이다.

## 게이트 결과 (원문)

| 명령 | 결과 |
| ---- | ---- |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0) |
| `pnpm --filter @gh-radar/webapp run test` | exit 0 — `Test Files 97 passed (97)` · `Tests 1634 passed \| 1 skipped (1635)` |
| `cd webapp && pnpm exec playwright test trading-workbench` | exit 0 — `39 passed (1.5m)` (setup 1 + spec 38, GC8 포함 · fail 0) |
| `git diff --quiet HEAD -- pnpm-lock.yaml webapp/package.json` | 변경 0 |
| Task 1·2·3 `<automated>` grep 게이트 | 전부 통과 |

vitest 로그에 찍힌 `at startTests …` 스택은 기존 테스트가 의도적으로 남기는 stderr 이다. 실패는 없고 exit 는 0이다.

## Deviations from Plan

### 오케스트레이터 승인 이탈

**1. [승인 이탈] 주문번호 색인의 원천을 relay 리듀서의 원시 `acct` 프레임으로 옮김**
- **문제:** `use-relay-socket.ts` `mergeAccount` 는 `unfilledQty === 0` 행을 저장하기 전에 버린다. 그래서 한 `acct` 델타 안에서 접수와 전량 체결이 함께 끝난 주문(상따 매수에 흔하다)은 `accountStates` 에 한 번도 남지 않는다. 플랜대로 훅에서 `accountStates` 를 색인하면 이런 주문은 늘 「주문 {No}」 폴백이 된다.
- **수정:** `RelayConnectionState`/`RelayData` 에 add-only `orderIndex: ReadonlyMap<orderNo, OrderIndexEntry>` 를 추가했다. 리듀서 `case "acct"` 가 `mergeAccount` 필터 **전에** `indexUnfilled(state.orderIndex, frame.a, frame.unf)` 로 채운다. 초기값과 `reset`(로그아웃 · 비활성화)에서만 비우므로 `accountStates` · `orders` 와 같은 규칙이다. 재접속 스냅샷은 추가만 한다. 훅 입력은 `accountStates` 대신 `orderIndex` 를 받는다. `indexUnfilled` 시그니처는 `(prev, accountNo, rows)` 로 바꿨다(한 프레임 = 한 계좌).
- **파일:** `use-relay-socket.ts` · `relay-provider.tsx`(`EMPTY_RELAY_VALUE.orderIndex` 고정 참조) · `relay-socket.test.ts`(⑮-e: 0 행 색인 · rm 이후 유지 · 새 행 없으면 참조 유지). 세 파일 모두 플랜의 files_modified 밖이다.
- **효과:** 플랜이 예고한 「한 델타 안 접수+전량 체결 = 「주문 No」 폴백」 한계가 **사라졌다**. 폴백은 이제 계좌 델타가 통보보다 1.5초 넘게 늦거나 relay 가 그 주문의 미체결 행을 한 번도 보내지 않은 경우에만 난다(`ALERT_HOLD_MS` 보류 후).
- **커밋:** d463001

### 자동 수정 이탈

**2. [Rule 1 - 시각 결함] 빨간 점을 종목명 `::after` 에서 헤더 토글 버튼 `::after` 로 옮김**
- **Task 2 에서 발견.** 종목명 `<b data-part="name">` 은 `truncate`(overflow:hidden)다. 플랜의 `[data-part="name"]::after` 점은 긴 종목명에서 잘려 보이지 않는다.
- **수정:** `[data-slot="card-header-l1"] > button[aria-expanded]::after`(flex 행의 마지막 항목 · `flex:none`)에 점을 붙였다. `card-header.tsx` 는 바뀌지 않았다(게이트 `git diff --quiet … card-header.tsx` 통과). 실브라우저 스크린샷(데스크톱 1440 · 폰 390)에서 점·링·우하단/상단 전폭 토스트를 직접 확인했다.
- **커밋:** 3efe2d2

**3. [Rule 2 - 접근성] 토스트 본문을 `<button data-part="text">` 로 그림**
- 플랜은 div `onClick` 만 두었다. 그러면 키보드로 토스트를 열 수 없다. 본문 텍스트를 버튼으로 감쌌다. 클릭은 바깥 div 로 올라가 `onOpen` 이 한 번만 불린다. ✕ 는 `stopPropagation` 을 한다.
- **커밋:** 3efe2d2

**4. [계획 보완] 작업대 통합 케이스 1건 추가 · 치운 카드 정리 경로**
- 통합 테스트에 ⑥「색인에 없는 주문은 1.5초 뒤 「주문 {No}」, 클릭해도 카드 없음」과 `cardForAlert` 순수 판정 3건을 더했다.
- 알림 표시(`alertedCardIds`)와 탭 요청(`tabRequest`)의 치운 카드 정리는 플랜이 말한 `removeCard` 대신 기존 `cards` 파생 정리 효과에서 한다(R3-IN-03 규율 — 치운 id 를 계산하지 않는다).
- `alertFromOrder` 의 `exchange` 는 플랜대로 `msg.x` 다(통보 원문).

### 기타
- 커밋은 기존 quick 관례대로 `master` 에 직접 했다. push 는 하지 않았다.
- 알림 이력 저장 · Notification API · localStorage 는 쓰지 않았다(A안). 훅은 로그를 남기지 않는다.
- 알림음은 체결 · VI 의 **새** 알림만 낸다. 묶음 병합 조각은 다시 울리지 않는다. 돌파 알림음은 기존 breakout-strip 이 이미 내므로 여기서는 내지 않는다.

## e2e

GC8 을 추가했다(생략 없음). 로컬 relay + 스텁 게이트웨이로 `pushAccountState(unf 0000000777)` → 종목 추가란으로 카드를 세우고 접음 → `pushOrderResp(E · 100주)` 순서로 주입한다. 이어서 다음을 확인한다:
1. `[data-slot="alert-toast"][data-kind="fill"]` 이 보이고 「체결」「100/500주」가 있으며, 우하단 좌표이고, 카드 `data-alert="true"` 다.
2. 본문을 클릭하면 카드 `data-open="true"` 가 되고, 활성 탭이 「미체결」이며, `data-alert="false"` 이고, 토스트가 0개다.

## Known Stubs

없음. 「주문 {No}」는 색인 조인에 실패했을 때의 의도된 폴백이다(`trading-alerts.ts` ②).

## 재량 · 남는 한계

- 이미 표시 중인 카드에 이벤트가 또 오면 펄스는 다시 돌지 않고 점·링만 유지된다(CSS 애니메이션 특성 · §3.8 주석).
- 돌파 토스트는 `breakoutKey`(isin|exchange) 축의 76 신규 진입마다 뜬다. 스트립의 「오늘 울린 종목」·「지운 종목」 규칙은 토스트에 걸지 않았다. 이탈했다가 같은 날 다시 돌파하면 토스트가 다시 뜬다.
- 색인 키는 주문번호 하나다. `RelayOrderMsg` 에 계좌가 없어서, 두 계좌가 같은 주문번호를 가지면 먼저 본 계좌 쪽으로 조인된다.
- 진행 바는 호버 이탈 뒤에도 원래 TTL 속도로 흐르지만 실제 닫힘은 2.5초 뒤다(목업과 같은 동작).

## Self-Check: PASSED

- 생성 파일 6개 존재 확인: trading-alerts.ts · use-trading-alerts.ts · alert-toasts.tsx · 테스트 3벌
- 커밋 존재: d463001 · 3efe2d2 · 032a041 (`git rev-list --count 6ae9f3e..HEAD` = 3)
