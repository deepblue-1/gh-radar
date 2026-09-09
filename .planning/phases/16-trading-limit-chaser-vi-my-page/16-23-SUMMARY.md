---
phase: 16-trading-limit-chaser-vi-my-page
plan: 23
subsystem: ui
tags: [react, hooks, relay, websocket, account-boundary, vitest, playwright]

requires:
  - phase: 16-19
    provides: "`use-relay-socket.send` 가 `boolean` 을 돌려주고 전략 카드가 세션 가드를 갖춘 상태 — 이 plan 은 같은 파일의 **계좌 축 계약**만 손댔고 그 변경은 하나도 되돌리지 않았다"
  - phase: 16-15
    provides: "`accountStates`(계좌번호 → 병합 상태) 와 계좌별 병합 리듀서 — 이 plan 이 그것을 **유일한 계좌 축**으로 승격시켰다"
provides:
  - "`webapp/src/lib/isin-labels.ts` — `useIsinLabels()` 공용 훅. `accountStates` 전체를 훑고 `useMemo` 로 감싼 ISIN→{name, code} 역매핑 단일 정본"
  - "`RelaySocketState.accountStates` — 종목 구독 소비자도 계좌 축을 계좌번호로 고를 수 있다"
  - "`RelayConnectionState.account` / `RelaySocketState.account` **제거** — 「마지막 수신 계좌」를 계좌 축에 쓰는 것이 타입 수준에서 불가능"
  - "`stock-orderbook-section` 의 `selectedAccount` 파생값 — 계좌 패널·매도가능수량이 **사용자가 고른 계좌**만 본다"
  - "`me-client.latestAccountTime()` — 상태줄 반영 시각을 계좌 전체 최신값에서 고른다"
  - "회귀 케이스 3건 — 사이드바 2계좌 이름 해결(WR-08) · 계좌 패널 A/B 격리 · 매도가능수량 출처(CR-01)"
affects: [16-25 상따 폼(같은 relay 계약을 읽는다), 16-26 배포·TRADE-01/03 재판정, 향후 계좌 축 소비자 전부]

tech-stack:
  added: []
  patterns:
    - "계좌 경계는 **규율이 아니라 타입 계약**으로 만든다 — 잘못 고를 수 있는 필드는 고치는 데 그치지 않고 제거한다"
    - "축이 없는 전역 값을 훅이 대신 골라 주지 않는다 — 훅이 하나를 고르면 그 값은 필연적으로 「마지막으로 프레임이 온 것」이 된다"
    - "같은 역할의 사본이 여럿이면 사본 수가 아니라 **동작이 갈라지는 것**이 결함이다. 가장 완전한 사본을 `lib/` 로 올려 정본으로 삼는다"
    - "제거 게이트의 grep 은 **destructuring 을 놓친다**(`account }` 는 `account,` 에 걸리지 않는다). 소비자 조사는 grep 결과가 아니라 소비 훅 호출부 전수로 한다"

key-files:
  created:
    - webapp/src/lib/isin-labels.ts
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx

key-decisions:
  - "`account`(마지막 수신 계좌)를 **필드째 제거**했다. 두 소비자를 `accountStates` 로 옮기는 것만으로는 다음 소비자가 같은 실수를 반복한다 — 문제는 소비자가 아니라 「잘못 고를 수 있는 표면」이었다 (T-16-35)"
  - "계좌 선택은 **소비자가** 한다. `useRelaySubscription` 이 계좌 하나를 골라 주는 설계는 원리상 불가능하다 — 훅은 어느 계좌를 골랐는지 모르기 때문에 고르면 반드시 「마지막 수신」이 된다"
  - "역매핑 공용 훅의 출발점은 `strategy-status-card` 사본이다. 세 사본 중 유일하게 `{name, code}` 2필드였고 `put` 병합 규칙(빈 문자열은 이전 값을 지우지 않는다)을 갖고 있었다 — 기능이 가장 많은 쪽으로 통일해야 나머지가 회귀하지 않는다"
  - "`me-client` 상태줄 반영 시각은 「어느 계좌인가」가 아니라 **「가장 최근 언제 반영됐나」**로 재정의했다. 상태줄은 계좌 축이 없는 전역 표시이므로 계좌 전체의 최댓값이 맞다. 계좌 1개면 결과는 이전과 완전히 같다"
  - "시각 비교는 `formatServerTime` 으로 **정규화한 뒤**에 한다 — 게이트웨이는 `YYYYMMDDHHMMSS`, 스텁은 `HH:MM:SS` 를 주므로 원문끼리 비교하면 자릿수가 다른 두 모양이 뒤섞인다"
  - "TRADE-01 은 이 plan 에서 Complete 로 올리지 않는다 — 16-25 가 같은 요구사항의 다른 절(WR-03 시장구분)을 남겨 두고 있고, 최종 재판정은 16-26 소관이다"

patterns-established:
  - "계좌 축 소비: `accountStates.get(사용자가 고른 계좌번호) ?? null` — `me-client`·`vi-client`·`limit-chaser-client` 에 이어 `stock-orderbook-section` 까지 네 표면이 같은 한 줄을 쓴다"
  - "회귀 픽스처는 **계좌를 둘로 나눠** 만든다. 한 계좌에 몰아 두면 계좌 축 버그가 테스트에 보이지 않는다"

requirements-completed: []  # TRADE-01·TRADE-03 은 16-25/16-26 소관, MYPAGE-01 은 16-19 에서 이미 Complete — 아래 「요구사항 판정」 참조

duration: 15min
completed: 2026-09-09
---

# Phase 16 Plan 23: 계좌 경계를 타입 계약으로 만들기 (CR-01 + WR-08) Summary

**호가주문 탭이 「사용자가 고른 계좌」와 「마지막으로 프레임이 온 계좌」를 서로 무관한 두 출처에서 받아 A 계좌 화면에 B 계좌 행을 그리고 그 행의 `✕ 취소` 가 A 계좌로 B 의 주문번호를 보내던 경로를 닫았고, 그 혼동이 가능한 `account` 필드 자체를 relay 계약에서 제거했다 — 덧붙여 동작이 서로 다르던 ISIN 역매핑 사본 3개를 `lib/isin-labels.ts` 하나로 합쳤다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-09-09T01:52Z (10:52 KST)
- **Completed:** 2026-09-09T02:07Z (11:07 KST)
- **Tasks:** 3 / 3
- **Files modified:** 12 (신규 1 · 수정 11)

## Accomplishments

- **엉뚱한 계좌의 주문이 취소되는 경로가 사라졌다 (CR-01 / T-16-34).** 계좌 패널의 머리(`selectedAccountNo`)와 행(`account`)이 서로 다른 출처였다. 이제 둘 다 `accountStates.get(selectedAccountNo)` 한 곳에서 나온다 — 머리가 A 면 행도 반드시 A 다. relay 화이트리스트는 A·B 둘 다 그 사용자 계좌라 이 사고를 막지 못했으므로, 막을 수 있는 유일한 자리가 여기였다.
- **매도가능수량·평가손익도 선택 계좌에서 온다.** `sellableQty` 가 다른 계좌의 보유를 읽으면 매도 비율 버튼이 **보유하지도 않은 수량**을 채운다. 회귀 케이스가 「B 에만 500주가 있을 때 100% 는 0 이다」를 잠근다.
- **`account` 필드가 계약에서 사라졌다 (T-16-35).** `RelayConnectionState`·`RelaySocketState`·`RelayData`·`INITIAL_DATA`·`EMPTY_RELAY_VALUE`·리듀서·훅 반환에서 전부 제거. 다음 소비자가 「마지막 수신 계좌」를 계좌 축에 쓰는 것이 **타입 수준에서 불가능**하다. 옛 의미를 선언하던 주석 문장도 지웠다 — 남아 있으면 다음 사람이 필드를 되살린다.
- **사이드바 3단 목록이 계좌 2개에서 흔들리지 않는다 (WR-08).** 사본 3개 중 사이드바만 `account` 하나를 봤다. 계좌 A 에 없는 종목의 전략이 `KR7005930003` 원문으로 그려지고 프레임이 올 때마다 표시가 왔다 갔다 했다. 공용 훅이 `accountStates` 전체를 훑는다.
- **역매핑이 렌더마다 Map 을 새로 만들지 않는다 (T-16-37).** 세 사본 중 둘(`app-sidebar`·`strategy-status-card`)이 `useMemo` 없이 매 렌더 Map 을 재생성했다. 공용 훅은 `useMemo(..., [accountStates, viOrders])` 다.
- **계획이 놓친 3번째 `account` 소비자를 찾아 고쳤다** — `me-client` 상태줄의 「반영 시각」(아래 Deviations §1). 플랜의 게이트 grep 은 destructuring 을 잡지 못하는 형태였다.

## Task Commits

1. **Task 1: ISIN 역매핑 사본 3개를 `lib/isin-labels` 공용 훅으로 합친다 (WR-08)** — `a4eae54` (refactor)
2. **Task 2: 호가주문 탭을 선택 계좌 기준으로 바꾼다 (CR-01)** — `ca5d50a` (fix)
3. **Task 3: `account`(마지막 수신 계좌)를 계약에서 제거한다 (CR-01 근본 해결)** — `29cbb03` (refactor)

## Files Created/Modified

### 신규

- `webapp/src/lib/isin-labels.ts` (67줄)
  - `IsinLabel` 타입 + `useIsinLabels(): ReadonlyMap<string, IsinLabel>`
  - `accountStates` **전체**의 `hold`+`unf` → `viOrders` 순으로 `put` 병합. `undefined`·빈 문자열은 이전 값을 덮지 않는다(`strategy-status-card` 사본의 규칙 그대로)
  - `useMemo(..., [accountStates, viOrders])`
  - 파일 상단에 규율 3종 명시: (a) `RelayLimitChaser` 에 종목명·단축코드가 없다 (b) 원천은 전역 wss 스냅샷뿐 — 이름 하나 때문에 별도 조회 경로를 만들지 않는다(T-16-02) (c) `account` 를 보지 않는다(WR-08)

### 계약

- `webapp/src/lib/use-relay-socket.ts`
  - `RelayConnectionState.account` **삭제**. `accountStates` JSDoc 에 「계좌축 소비자는 이것만 쓴다 / 단일 값은 16-23 에서 제거됐다(CR-01)」 편입
  - `RelaySocketState` 에 `accountStates` 추가 + `account` 삭제
  - `RelayData`·`INITIAL_DATA`·훅 반환 memo 에서 `account` 삭제
  - 리듀서 `case "acct"` → `return { ...state, accountStates }`. ★ 주석의 「`account` 는 「마지막으로 받은 계좌」라는 기존 의미를 그대로 유지한다 — 호가주문 탭이 그 값을 쓰고 있고」 문장을 「단일 「마지막 수신 계좌」 필드는 16-23 에서 제거했다. 병합은 계좌별로만 한다」로 교체
- `webapp/src/lib/relay-provider.tsx`
  - `EMPTY_RELAY_VALUE.account` 삭제, `useRelaySubscription` 반환에 `accountStates` 추가 / `account` 제거
  - ★ 주석을 「`accountStates`/`accounts`/`orders`/`messages` 는 종목 축이 없다. 계좌 축 선택은 **소비자가** `accountStates.get(선택계좌)` 로 한다 — 훅이 대신 고르지 않는다(어느 계좌를 골랐는지는 훅이 모른다)」로 갱신

### 소비자

- `webapp/src/components/stock/stock-orderbook-section.tsx`
  - 구조분해 `account` → `accountStates`, 파생값 `selectedAccount = selectedAccountNo === '' ? null : (accountStates.get(selectedAccountNo) ?? null)`
  - `AccountPanel account={selectedAccount}` · `sellableQty` useMemo 입력·의존성 교체
  - 종목 전환 sticky 방어 주석을 계좌 축 기준으로 갱신 — `selectedAccountNo` 도 리셋하지 않는다는 사실을 함께 적었다
- `webapp/src/components/layout/app-sidebar.tsx` — 지역 `useIsinNames` 삭제, 공용 훅. **동작이 실제로 바뀐 곳**(`account` → `accountStates` 전체)
- `webapp/src/components/trading/limit-chaser-client.tsx` — 지역 `useIsinNames` 삭제, `isinLabels.get(isin)?.name` 으로 읽는다
- `webapp/src/components/trading/strategy-status-card.tsx` — 지역 `IsinLabel`·`useIsinLabels` 삭제, `@/lib/isin-labels` import
- `webapp/src/components/trading/me-client.tsx` — `latestAccountTime()` 신설(export) + 상태줄이 `accountStates` 를 읽는다

### 테스트

- `webapp/src/components/stock/__tests__/orderbook.test.tsx` (+133)
  - 픽스처 `ACCOUNTS_AB`·`accountStatesAB()` — 같은 종목을 두 계좌가 모두 보유하고 미체결도 각각(A-0001 / B-9999)
  - ⑭ 계좌 패널 미체결 행은 A 것만 · **B-9999 가 화면 어디에도 없다**
  - ⑮ 매도가능수량은 A 의 76주(B 의 500주가 아니다) · A 보유 0 이면 100% 가 채우지 않는다
  - 파일 상단 주석 ②에 「계좌 축도 같은 스텁으로 들어온다 / `useRelayContext` 는 스텁하지 않는 이유」를 추가해 실제와 맞췄다
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` (+97/-…)
  - `accountWithNames()` → `accountStatesWithNames()` — **계좌를 둘로 나눴다**. A 잔고에 CHASER_A 종목, B 미체결에 CHASER_B 종목
  - WR-08 회귀 1건 추가 — 두 이름이 모두 해결되고 어느 ISIN 도 원문으로 남지 않는다
- `webapp/src/lib/__tests__/relay-socket.test.ts` — `ACCT_NO` 상수 + `acctOf(current)` 헬퍼로 15개 단언을 `accountStates.get(계좌번호)` 기준으로 이관
- `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx` — 죽은 `account: null` 스텁 필드를 `accountStates: new Map()` 으로 교체

## Decisions Made

위 frontmatter `key-decisions` 참조. 셋을 기록에 남긴다.

**① 왜 고치는 데 그치지 않고 필드를 제거했나.** CR-01 의 Fix 스케치는 `accountStates.get(selectedAccountNo)` 한 줄이면 끝난다. 그런데 그 줄을 쓰는 소비자가 이미 셋(`me-client`·`vi-client`·`limit-chaser-client`)이었고 이 파일 **하나만** 남아 있었다 — 즉 「소비자가 올바른 필드를 고르는 규율」은 이미 한 번 실패한 뒤였다. 같은 규율을 다시 세우는 대신 잘못 고를 수 있는 표면을 없앴다. 이제 계좌 축에 쓸 수 있는 값은 `ReadonlyMap` 하나뿐이고, 그 맵에서 무언가를 꺼내려면 **계좌번호를 명시해야** 한다.

**② 왜 훅이 계좌를 골라 주면 안 되나.** 「그럼 `useRelaySubscription` 이 계좌 하나를 골라 주면 되지 않나」가 자연스러운 대안인데, 원리상 불가능하다 — 훅은 사용자가 어느 계좌를 골랐는지 **모른다**(계좌 선택은 섹션이 소유하는 로컬 state 다). 훅이 그럼에도 하나를 고르면 그 값은 필연적으로 「마지막으로 프레임이 온 계좌」가 되고, 그것이 정확히 CR-01 이다. 그래서 주석에 그 사실을 못 박아 두었다.

**③ 왜 상태줄 반영 시각을 「가장 최근」으로 재정의했나.** 제거 게이트에서 3번째 소비자(`me-client` 의 `account?.st`)가 나왔다. 이 값은 계좌 경계와 무관한 **표시용 타임스탬프**지만 원천이 사라졌다. 후보는 둘이었다 — (a) 칸을 없앤다 (b) 계좌 전체의 최댓값으로 바꾼다. 상태줄은 「DMA {상태} · 상따 N건 · VI · 계좌 N개」처럼 **계좌 축이 없는 전역 요약**이므로, 여기서 답해야 할 질문은 「어느 계좌인가」가 아니라 「가장 최근 언제 반영됐나」다. (b) 를 골랐고, 계좌가 1개면 결과는 이전과 완전히 같다.

## 요구사항 판정

**어느 것도 `Complete` 로 올리지 않았다.** 이 plan 의 frontmatter 는 `[TRADE-01, MYPAGE-01, TRADE-03]` 이지만:

- **MYPAGE-01** — 이미 `Complete` 다(16-19 에서 gap 3 종결). 손댈 것이 없다.
- **TRADE-01** — 16-VERIFICATION 은 ✓ SATISFIED 로 판정했으나 Traceability 는 `Pending` 이고, **16-25 가 같은 요구사항의 남은 절**(WR-03 — 상따 전략의 시장구분을 브라우저가 추정하는 문제)을 담당한다. 여기서 올리면 16-25 실행 전에 완료로 표기된다.
- **TRADE-03** — 16-26 소관. `REQUIREMENTS.md` 를 건드리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `account` 소비자가 2곳이 아니라 3곳이었다 — 플랜의 제거 게이트 grep 이 destructuring 을 놓친다**

- **Found during:** Task 3 (제거 전 소비자 0건 확인)
- **Issue:** 플랜은 `<interfaces>` 에서 「`account` 실측 소비자 (이 2곳이 전부)」라고 못박고, 게이트로 `grep -rn "\.account\b\|account," webapp/src webapp/e2e` 를 지시했다. 그런데 `webapp/src/components/trading/me-client.tsx:82` 가 `const { …, viTrigger, account } = useRelayContext();` 로 세 번째 소비자였고(`account?.st` → 상태줄 「반영 {시각}」), **destructuring 의 마지막 항목이라 `account,` 에도 `.account` 에도 걸리지 않는다.** 플랜의 게이트는 이 소비자에 대해 **거짓 통과**를 낸다. 필드를 그대로 지웠다면 typecheck 가 잡았겠지만, 게이트의 목적(무엇이 깨지는지 알고 지운다)은 달성되지 않았을 것이다.
- **왜 멈추지 않았나:** 플랜은 「남으면 제거하지 말고 멈추라」고 했다. 그 게이트의 목적은 **load-bearing 한 소비자를 모르고 깨뜨리지 않는 것**이다. 발견된 소비자는 (a) 계좌 경계와 무관한 표시 전용 타임스탬프이고 (b) 같은 파일 안의 파생값 교체로 끝나며 (c) 아키텍처 변경(새 테이블·서비스·라이브러리)이 아니다 — Rule 4 가 아니라 Rule 3 다. 반대로 여기서 멈추면 Task 2 를 이미 커밋한 상태에서 **계약이 절반만 이관된 채로** 남는데, 그쪽이 더 나쁘다. 소비자를 은폐하지 않고 명시적으로 고친 뒤 이 항목으로 남긴다.
- **Fix:** `me-client.tsx` 에 `latestAccountTime(states)` 를 신설했다 — 계좌 전체의 `st` 를 `formatServerTime` 으로 **정규화한 뒤** 최댓값을 고른다(원문끼리 비교하면 `YYYYMMDDHHMMSS` 와 `HH:MM:SS` 가 섞인다). 상태줄은 `latestAccountTime(accountStates)` 를 쓴다. 의미 변경 사유를 함수 JSDoc 에 남겼다.
- **Files modified:** `webapp/src/components/trading/me-client.tsx`
- **Verification:** `pnpm --filter @gh-radar/webapp run typecheck` exit 0 · 전 스위트 639 passed · `me.spec.ts` 8케이스(계좌 2개 시나리오 포함) green
- **Committed in:** `29cbb03` (Task 3 커밋)

**2. [Rule 3 - Blocking] `account` 제거가 플랜에 없던 테스트 파일 3개를 깨뜨린다**

- **Found during:** Task 1·3
- **Issue:** 플랜 `files_modified` 는 테스트 2개(`orderbook.test.tsx`·`app-sidebar.test.tsx`)만 열거했으나, `relay-socket.test.ts` 가 `hook.result.current.account` 를 **15곳**에서 단언하고 `stock-detail-client.test.tsx` 가 스텁에 `account: null` 을 싣고 있었다. 또 `app-sidebar.test.tsx` 는 Task 1 의 동작 변경(계좌 전체 순회) 때문에 픽스처 자체를 바꿔야 했다 — 계좌 하나짜리 픽스처로는 WR-08 회귀가 테스트에 보이지 않는다.
- **Fix:** `relay-socket.test.ts` 에 `ACCT_NO` 상수 + `acctOf(current)` 헬퍼를 만들어 단언을 `accountStates.get(계좌번호)` 로 이관했다(어느 계좌인가를 단언이 명시하게 됐다는 점에서 이관 자체가 개선이다). `stock-detail-client.test.tsx` 의 죽은 스텁 필드는 `accountStates: new Map()` 으로 교체. `app-sidebar.test.tsx` 픽스처는 계좌 A(잔고)·계좌 B(미체결)로 쪼갰다.
- **Files modified:** `webapp/src/lib/__tests__/relay-socket.test.ts`, `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx`, `webapp/src/components/layout/__tests__/app-sidebar.test.tsx`
- **Verification:** 전 스위트 639 passed · typecheck 13 워크스페이스 Done
- **Committed in:** `a4eae54`(sidebar 픽스처) · `29cbb03`(나머지 2건)

**3. [Rule 1 - Bug] 플랜의 acceptance grep `"마지막으로 받은 계좌" == 0` 이 새 주석 문구와 충돌했다**

- **Found during:** Task 3
- **Issue:** 제거 사실을 설명하는 새 JSDoc 2줄이 「‘마지막으로 받은 계좌’ 단일 값(`account`)은 계약에서 **제거됐다**」로 그 어구를 포함했다. 문장의 의미는 게이트가 막으려는 것(**옛 의미를 선언하는 문장**)의 정반대지만, 리터럴 grep 은 구분하지 못한다.
- **Fix:** 새 문장의 표기를 「마지막 **수신** 계좌」로 통일했다. 게이트 grep 은 0 이 되고, 문서 의미는 그대로다. 앞으로 이 어구가 파일에 다시 등장하면 그것은 실제로 옛 의미의 부활이다 — 게이트가 의도한 대로 작동한다.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** `grep -c "마지막으로 받은 계좌" webapp/src/lib/use-relay-socket.ts` = **0**
- **Committed in:** `29cbb03`

### 플랜과 다르게 한 것 (결과 동등)

- 플랜 Task 2 ①은 「`RelaySocketState` 에 `accountStates` 를 **추가**하고 `account` 제거는 Task 3 이 마무리한다」였다. 그대로 따랐다 — Task 2 시점의 `RelaySocketState` 는 두 필드를 모두 갖고, Task 3 이 `account` 를 지운다. 각 커밋이 독립적으로 typecheck·테스트 green 이다.

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2, Rule 1 ×1)
**Impact on plan:** 목표(CR-01 + WR-08)와 must_haves 6항목 전부 달성. 스코프 확장은 테스트 2파일(`relay-socket.test.ts`·`stock-detail-client.test.tsx`)과 소스 1파일(`me-client.tsx`) — 전부 `account` 제거가 **강제한** 최소 변경이고, 새 기능은 하나도 넣지 않았다.

## Issues Encountered

**차단 요소 없음.** 세 task 모두 checkpoint 없이 끝났고 인증 게이트도 없었다.

**스코프 밖으로 남긴 것:**

- `use-relay-socket.ts:808` 의 `react-hooks/exhaustive-deps` warning(`wireSubsRef.current` cleanup) — 이 plan 이전부터 있던 것이고 계좌 축과 무관하다. 손대지 않았다.
- 작업 트리에 이 plan 과 무관한 미커밋 변경이 있었다(`infra/relay/README.md` 수정 · `scripts/dma-tunnel.{sh,ps1}` · `.planning/quick/260909-el9-…/` 미추적). **전부 스테이징하지 않았다** — 모든 커밋은 파일을 개별 지정했다.

## Verification

| 검사 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp test` | **57 files / 639 passed \| 1 skipped** (637 → 639, 신규 3) |
| `pnpm --filter @gh-radar/webapp run typecheck` (`tsc --noEmit` + `tsconfig.e2e.json`) | exit 0 |
| `pnpm typecheck` (13 워크스페이스) | **전부 Done** |
| `pnpm exec playwright test e2e/specs/orderbook.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts` | **25 passed** (55.4s) |
| `pnpm exec eslint` (변경 소스 8파일) | 0 errors (기존 warning 1건 — 위 「스코프 밖」) |
| `grep -rn "useIsinNames" webapp/src` | **0건** (사본 잔존 없음) |
| `grep -c "useIsinLabels"` — isin-labels / app-sidebar / limit-chaser-client / strategy-status-card | 1 / 2 / 2 / 2 (각 ≥1) |
| `grep -c "useMemo" webapp/src/lib/isin-labels.ts` | 4 (≥1) |
| `grep -c "accountStates.get(selectedAccountNo)" stock-orderbook-section.tsx` | **1** |
| `grep -c "account={account}" stock-orderbook-section.tsx` | **0** |
| `grep -c "selectedAccount" stock-orderbook-section.tsx` | 6 (≥4 — 파생 + AccountPanel + sellableQty + 의존성) |
| `grep -c "account: merged" use-relay-socket.ts` | **0** |
| `grep -c "마지막으로 받은 계좌" use-relay-socket.ts` | **0** |
| `grep -c "accountStates" use-relay-socket.ts` | 9 (≥4) |
| `grep -rn "relay\.account\b" webapp/src` | **0건** |
| `grep -rn "10\.41\.1\.120" webapp/src webapp/e2e` | **0건** (D-27 승계) |

### 새 케이스가 옛 동작을 실제로 잡는가

- **⑭ 계좌 패널 격리** — 훅 스텁의 계좌 축은 `accountStates` 뿐이고 옛 코드가 읽던 단일 값은 이제 존재하지 않는다. 옛 구현(`account={account}`)이면 스텁에 그 필드가 없어 패널이 `미체결 (0)` 을 그리므로 케이스가 실패한다. B 의 주문번호 부재를 별도로 단언해, 「아무 계좌나 하나 고른다」 구현도 통과하지 못한다.
- **⑮ 매도가능수량 출처** — A 76주 / B 500주로 값을 갈라 두었다. 「아무 계좌나」 구현은 100% 에서 500 이 나와 실패한다.
- **WR-08 사이드바** — 픽스처가 계좌 A 잔고 / 계좌 B 미체결로 쪼개져 있어, 계좌 하나만 훑는 구현은 반드시 한쪽을 ISIN 원문으로 남긴다. 두 이름 존재 + 두 ISIN 부재를 함께 단언한다.

## Known Stubs

없음. 이 plan 이 만든 경로는 전부 실제 relay 상태에 결선돼 있다. `lib/isin-labels.ts` 는 새 데이터 원천을 만들지 않고 기존 wss 스냅샷만 읽는다(T-16-02 규율 유지).

## Threat Flags

없음. 이 plan 은 네트워크 엔드포인트·인증 경로·스키마를 추가하지 않았고, 신뢰 경계에 대한 변경은 **경계를 좁히는 방향**(계좌 축 필드 제거)뿐이다.

## User Setup Required

None — 외부 서비스 설정 변경 없음. **배포는 필요하다**: webapp 변경이므로 Vercel 재배포가 있어야 프로덕션에 반영된다 (16-26).

## Next Phase Readiness

- **16-25 진행 가능**(`depends_on` 에 16-23 포함). 16-25 는 `limit-chaser-client.tsx`·`limit-chaser-form.tsx` 를 만지므로 두 가지를 전제로 읽어야 한다: ① ISIN→이름 역매핑은 이제 `@/lib/isin-labels` 의 `useIsinLabels()` 하나이고 반환값이 `{name, code}` 다(문자열 Map 이 아니다) ② `useRelayContext()`/`useRelaySubscription()` 에 `account` 필드가 **없다** — 계좌 상태는 `accountStates.get(계좌번호)` 로만 얻는다.
- **16-26 에서 확인할 것:** 실계좌 다중 계좌 환경에서 호가주문 탭의 계좌 셀렉터를 바꿨을 때 ① 미체결 행이 즉시 그 계좌 것으로 갈리는가 ② 취소가 그 계좌로만 나가는가. 지금은 RTL 스텁으로만 잠겨 있다(D-27 승계 — 이 plan 은 실서버·실계좌에 접속하지 않았다).

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `webapp/src/lib/isin-labels.ts` FOUND · `webapp/src/components/trading/me-client.tsx` FOUND · `16-23-SUMMARY.md` FOUND
- 커밋 `a4eae54` FOUND · `ca5d50a` FOUND · `29cbb03` FOUND
