---
phase: 16-trading-limit-chaser-vi-my-page
plan: 13
subsystem: ui
tags: [react, nextjs, tailwind, vitest, rtl, playwright, a11y, relay-wss, pure-functions]

# Dependency graph
requires:
  - phase: 16-12
    provides: "`limit-chaser-form.tsx` · `dirty-action-bar.tsx` · `lib/limit-chaser.ts` 순수 함수 9종"
  - phase: 16-11
    provides: "라우트 셸 2개 · `strategy-badge.tsx` · `dma-gate.tsx` · 사이드바 3단 목록"
  - phase: 16-10
    provides: "`account-panel.tsx` 계좌 전용 모드 + `originTag` · `.rlist` 모바일 리플로우"
  - phase: 16-09
    provides: "전역 relay 컨텍스트 — `useRelayContext` · `useRelaySubscription` · `accountStates`"
  - phase: 15
    provides: "`orderbook-ladder.tsx` 사다리 · `trade-tape.tsx` 방향 판정 · `deriveTickSize`"
provides:
  - "`orderbook-ladder.tsx` `variant=\"chaser\"` — 마커 슬롯 · 등락률 열 · 데스크톱 최근 체결 10건 · 좁은 폭 2줄 행"
  - "`strategy-log.tsx` — 전이 문장 순수 함수 3종(`strategyLogLine`/`serverMessageLogLine`/`strategiesDisabledLogLine`) + 로그 카드"
  - "`limit-chaser-client.tsx` — A1~A14 조립 · 전송↔에코 상관 · 3초 무응답 · 이탈 경고"
  - "`lib/limit-chaser.ts` `isLimitChaserServerMessage` — 상따/VI 통지 몫 판정 **유일 지점**"
  - "`limit-chaser-form.tsx` `onSent`/`onServerEcho` — 상위가 「내 에코」와 「다른 단말」을 가르는 신호"
  - "`e2e/fixtures/relay.ts` `pushServerMessage(54)` — 조용한 거부 경로의 유일한 주입구"
  - "`trading-limit-chaser.spec.ts` 12케이스"
affects: [16-14, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "레이아웃 불변식은 **인라인 style 로 박고 computed 값으로 단언한다** — jsdom 은 폭을 계산하지 않아 클래스만이면 아무것도 못 잡는다"
    - "「보냈다」와 「반영됐다」의 상관은 **폼이 상위에 알려 준다**(`onSent`) — 그 신호가 없으면 내 수정마다 「다른 단말에서 변경됨」이 뜬다"
    - "브라우저 계층 결함은 브라우저에서만 드러난다 — E2E 가 FAB 겹침·로케일 시각 2건을 실측으로 잡았다"
    - "테스트가 첫 실행에 green 이면 변이를 주입해 실효성을 실측한다(이 plan 에서 45종 주입, 45종 전부 검출)"

key-files:
  created:
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
  modified:
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/dirty-action-bar.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/stock-api.ts
    - webapp/e2e/fixtures/relay.ts
    - .planning/phases/16-trading-limit-chaser-vi-my-page/deferred-items.md

key-decisions:
  - "마커 슬롯 폭·등락률 최소폭을 **인라인 style** 로 박았다. 이 두 값이 「틱마다 가격이 좌우로 밀린다」(T-16-05 · lessons.md 등재 함정)를 막는 유일한 장치인데, Tailwind 클래스로만 두면 jsdom 이 폭을 계산하지 않아 **규칙이 지워져도 테스트가 통과한다**. 인라인이면 `getComputedStyle` 이 값을 그대로 돌려주므로 규칙 자체를 단언할 수 있다."
  - "상한가 마커가 최근 체결 도트보다 **우선**한다. 상한가에 닿는 순간은 최근 체결가 == 상한가라, 우선순위가 뒤집히면 **이 화면이 존재하는 바로 그 순간에만** 「상」이 사라지고 도트가 뜬다. 첫 변이 배터리에서 이 케이스가 없어 미검출이 났고, 그래서 전용 케이스를 추가했다."
  - "「내가 보낸 에코」와 「다른 단말의 변경」을 가르기 위해 폼에 `onSent`/`onServerEcho` **선택 prop 2개**를 더했다. 없으면 내가 「수정」을 누를 때마다 「다른 단말에서 변경됐어요」가 뜬다. 덮인 더티 수는 **폼만이 알 수 있어**(상위는 폼 값을 갖고 있지 않다) 폼이 계산해 올려 준다 — 기준선은 새 서버값이 아니라 **덮이기 직전의 서버값**이다."
  - "무장 해제가 「발주」인지 「사용자 조작」인지를 **우리가 보낸 cfg** 로 가른다. 우리가 `buyEnabled:false` 를 보냈으면 사용자가 끈 것이고, 그 외(내가 켰는데 꺼져서 왔다 / 아예 안 보냈다)는 게이트가 발주로 소진된 것이다(Pitfall 10). 근거 없이 「발주됨」을 붙이면 사용자가 나가지도 않은 주문을 찾아 미체결을 뒤진다."
  - "3초 무응답은 **표시만** 한다. 자동 재전송 경로를 코드에 만들지 않았고, 「시간이 아무리 흘러도 전송은 1건」을 RTL 이 단언한다(T-16-10) — 재전송은 사용자가 누르지 않은 두 번째 등록이고 그게 곧 중복 발주다."
  - "삭제 반영을 **폼 remount** 로 한다(`key` 에 `resetSeq`). 값만 지우면 폼의 더티 기준선이 남아 「삭제됐는데 미반영 변경 3개」가 만들어진다."
  - "이탈 경고에 앱 다이얼로그를 만들지 않고 브라우저 `confirm` 을 썼다. UI-SPEC D6 이 앱 다이얼로그를 **4개로 못박았고**(VI 시작·중지·전체 비활성화·미체결 취소) 이탈 경고는 그 목록에 없다. `beforeunload`(새로고침)와 라우터 가드(링크 클릭)가 같은 문구를 쓴다."
  - "`AccountPanel` 을 **계좌 전용 모드**(`code` 미전달)로 붙였다. 종목 축 모드는 패널 자신의 계좌 `<select>` 를 그려서 상단 A1 카드의 셀렉터와 **두 벌**이 되고, 그 순간 「지금 어느 계좌인가」가 갈린다. UI-SPEC A12 는 탭을 적었지만 셀렉터 중복이 더 비싼 결함이라 상위 규율(16-10 인계)을 따랐다."
  - "상태줄을 `RelayStatusBar` 재사용 대신 목업 `.state` 한 줄로 새로 그렸다. 그 컴포넌트는 배지 + 본문 + 알림 누적 3단 패널이라 목업의 1행 상태줄과 형태가 다르고 전략 배지를 실을 자리가 없다. 대신 **연결 문구는 `RELAY_STATE_LABELS` 계약**을 그대로 쓴다(D-36) — 16-15 `me-client` 와 같은 판단이다."
  - "실시간 상한가가 처음 도착하면 **한 번만** 재시딩한다. 그렇지 않으면 폼의 가격 5칸은 REST 값, 위 칩은 실시간 값이라 **같은 화면이 상한가를 두 숫자로 말한다** — 그 상태로 스위치를 켜면 사용자가 본 적 없는 가격으로 등록된다."

patterns-established:
  - "레이아웃 불변식은 인라인 style + `getComputedStyle` 로 잠근다(클래스 문자열 단언은 CSS 가 안 먹어도 통과한다)"
  - "겹침 결함은 **좌표로** 단언한다 — 클릭 성공만으로는 회귀 원인이 「타이밍」으로 오독된다"
  - "시각 표시에 로케일 포맷터를 쓰지 않는다 — `ko-KR`/`hour12:false` 는 브라우저에 따라 한글 조사를 섞는다"
  - "`getByLabelText`/`getByLabel` 은 더티 접두(`● `)·헤더의 유사 라벨에 부서진다 — 폼 입력은 **id 로** 잡는다"

requirements-completed: [TRADE-01]

# Metrics
duration: 95min
completed: 2026-09-09
---

# Phase 16 Plan 13: 상따 전략 화면 조립 Summary

**이 phase 의 가장 큰 단일 표면을 조립하고, 「서버값이 이긴다 · 보냈다≠반영됐다 · 거부는 조용히 지나가지 않는다」 세 규율을 RTL 44 · E2E 12 케이스로 잠갔다 — 그 과정에서 브라우저에서만 드러나는 실측 결함 2건(1차 CTA 가 눌리지 않음 · 시각 포맷 붕괴)을 E2E 가 잡아 함께 고쳤다.**

## Performance

- **Duration:** 약 95분
- **Tasks:** 3
- **Commits:** 3 (+ 이 SUMMARY)

## Task Commits

1. **Task 1: 호가 상따 변형 + 전략 로그** — `c92e03b` (feat)
2. **Task 2: 화면 조립 · 전송↔에코 결선** — `60d66e8` (feat)
3. **Task 3: E2E 12케이스 + 실측 결함 2건 수정** — `eed0e6d` (test)

## What Was Built

### Task 1 — 호가 상따 변형 · 전략 로그

`orderbook-ladder.tsx` 에 `variant="chaser"` 를 더했다. **Phase 15 트리는 한 글자도 바뀌지 않았고**, 행 조립기(`buildLadderRows`)만 두 변형이 공유한다 — 순서·단계 번호가 갈리면 한 화면의 「매도 3호가」가 다른 화면의 다른 행이 되고 그 어긋남은 스크린샷으로만 발견된다.

| 요소 | 규율 |
|------|------|
| 마커 슬롯 16px | **모든 행에** 존재(빈 행 포함). 인라인 style 로 박아 계산값으로 단언 가능 |
| 「상」 vs 도트 | 상한가가 **이긴다** — 상한가 도달 순간(체결가 == 상한가)에 「상」이 사라지지 않는다 |
| 등락률 | 소수 1자리 · `%` 없음 · 양수 부호 없음 · min-width 40px · 10px(T3 예외 ⓑ) |
| 최근 체결 10건 | 매수 10단과 1:1. 방향은 **수량 색 + `title` + sr-only** 3중. 체결 없으면 셀 비움 |
| 가격 | **클릭 대상이 아니다** — 핸들러도 roving tabindex 도 없다(A11) |
| 좁은 폭 | 2줄 행 32px · 400px 독립 스크롤 · 현재가 중앙 초기 스크롤 1회 · 최근 체결 열 없음 |

`strategy-log.tsx` 는 문장을 **순수 함수**에서만 만든다. `strategyLogLine(prev, next, {hadOrder})` 이 전이 **12종 닫힌 집합**을 다루고, `serverMessageLogLine` 은 서버 원문을 **해석하지 않고 그대로** 싣는다(D-36).

`lib/limit-chaser.ts` 에 `isLimitChaserServerMessage` 를 더했다 — 상따/VI 통지 몫 판정의 **유일 지점**이다.

### Task 2 — 화면 조립

`limit-chaser-client.tsx` 가 A1~A14 를 조립한다. 16-11 자리표시는 걷혔고 라우트 2개는 **무변경**으로 그대로 소비한다.

- **A1** 인라인 검색(`searchStocks` 직접) · 거래소 세그먼트 · 계좌 `<select>`(번호 전체) · 가격 칩 4종. `isin` 없는 종목은 **고를 수 없다**(D-28).
- **A2** 상태줄 — `DMA {RELAY_STATE_LABELS}` · 매수/매도 · 잔량추적 기준선 · 미반영 · 거부(`role="alert"`) · `반영 HH:MM:SS`.
- **A3** 에코 배너 6초 + 로그 1줄 영구. **토스트 0건.**
- **본문 그리드** `<1024` 42%|1fr → `1024~1279` 1열 → `≥1280` 460|나머지(폼이 다시 250|250).
- **A12** `AccountPanel` 계좌 전용 모드 + `originTag="상따"`. **A13** 전략 로그.

**전송 ↔ 에코 상관**이 이 파일의 핵심이다. 폼이 `onSent` 로 알려 준 요청과 도착한 에코를 맞춰:
- 내 요청 → 배너 없음 + 전이 로그
- 보낸 적 없음 + 처음 보는 전략 아님 → **다른 단말 변경** 배너(덮은 더티 N개 문구 포함)
- 3초 무응답 → 「미반영」 표시. **재전송 경로는 코드에 없다.**

### Task 3 — E2E 12케이스

`mode:'serial'` + `withLocalRelay()` 1회 규약. 계획의 10케이스에 **대조군 2건**(7b VI 몫 미흡수 · 10 의 「더티 아닐 때는 안 물어본다」)을 더했다 — 대조군이 없으면 「항상 물어보는 화면」과 구분되지 않는다.

## Verification

```
pnpm --filter @gh-radar/webapp typecheck        exit 0
pnpm --filter @gh-radar/relay   typecheck        exit 0
pnpm --filter @gh-radar/webapp lint              신규 경고 0건 (기존 2건은 다른 파일)
pnpm --filter @gh-radar/webapp test              54 files · 561 passed · 1 skipped
  orderbook-ladder-chaser.test.tsx               12 passed
  strategy-log.test.tsx                          16 passed
  limit-chaser-client.test.tsx                   16 passed
e2e trading-limit-chaser.spec.ts                 12 passed
e2e orderbook.spec.ts (호가 변형 회귀)            11 passed
e2e sidebar-tree.spec.ts + me.spec.ts (인접)      15 passed
```

### 변이 주입 실측 (blindspot #5 — 첫 실행 green 이면 실효성을 의심한다)

**45종 주입 · 45종 전부 검출.** 처음엔 2종이 미검출이었고 그 둘이 이 plan 의 수확이다.

| 배터리 | 종수 | 미검출 → 해소 |
|--------|------|---------------|
| Task 1 (호가·로그·판정) | 19 | 「마커 우선순위 뒤집기」 미검출 → **상한가 == 최근 체결가** 케이스 추가 후 검출 |
| Task 2 (결선) | 19 | 「더티 기준선을 새 서버값으로」 미검출 → 배터리가 잘못된 테스트 파일을 겨눴다. 표적 교정 + 「수정하던 값 N개」 케이스 추가 후 검출 |
| Task 3 (E2E) | 7 | 「grid `min-w-0` 제거」 미검출 → **중복 출처가 3곳**(그리드 유틸 + 사다리 섹션 + 폼 루트)이라 하나만 지우면 계산값이 안 바뀐다. 셋을 함께 지우니 검출 — 단언이 「한 출처」가 아니라 **효과**를 재고 있다는 확인이다 |

특히 Task 1 변이 10 이 중요하다. 상한가와 최근 체결가가 **다른 값**인 픽스처만으로는 마커 우선순위가 검증되지 않는데, 정작 이 화면이 존재하는 이유인 「상한가에 닿는 순간」에는 그 둘이 **같은 값**이다. 우선순위가 뒤집히면 평소엔 멀쩡하다가 가장 중요한 1초에만 「상」이 사라진다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] AI 채팅 FAB 이 1차 CTA 를 덮어 「수정」이 눌리지 않았다**
- **Found during:** Task 3 (E2E 케이스 4)
- **Issue:** `chat-fab.tsx` 는 `fixed right-6 bottom-6 z-40`, `dirty-action-bar.tsx` 도 `fixed inset-x-0 bottom-0 z-40`. 같은 z-축·같은 구석이라 DOM 뒤인 FAB 이 포인터 이벤트를 가로챈다. **이 화면의 유일한 반영 경로가 통째로 죽어 있었다** — 값을 고쳐도 서버에 보낼 방법이 없다. VI 화면(16-14)도 같은 바를 쓰므로 같은 결함이었다.
- **Fix:** z-index 를 올려 FAB 을 덮는 대신(그러면 채팅 진입점이 조용히 사라진다) 바 오른쪽에 FAB 자리 128px 를 비웠다. FAB 폭은 라벨에 따라 변하므로 고정 여백은 **가정**이고, 그 가정이 깨지는 순간을 E2E 의 **좌표 단언**이 잡는다.
- **Files modified:** `dirty-action-bar.tsx`
- **Commit:** `eed0e6d`

**2. [Rule 1 - 버그] `toLocaleTimeString('ko-KR', {hour12:false})` 가 Chromium 에서 `0시 57분 16초`**
- **Found during:** Task 3 (E2E 케이스 4)
- **Issue:** UI-SPEC 은 `반영 HH:MM:SS` 와 로그 시각을 **`.mono` 고정폭**으로 못박았는데 한글 조사가 섞여 매 초 폭이 달라진다. Node/jsdom 에서는 `00:57:16` 이라 **단위 테스트로는 영원히 안 잡힌다.**
- **Fix:** 자리수를 직접 채우는 `clockNow()` 로 교체.
- **Files modified:** `limit-chaser-client.tsx`
- **Commit:** `eed0e6d`

**3. [Rule 1 - 버그] 폼과 칩이 상한가를 두 숫자로 말했다**
- **Found during:** Task 3 (E2E 케이스 2)
- **Issue:** 종목 선택 직후에는 REST 상세의 상한가만 있고 실시간 호가(`quote.ul`)는 구독 왕복 뒤에 온다. 폼은 마운트 1회 시딩이라 REST 값에 머무르고 칩은 실시간 값으로 바뀐다. 그 상태로 스위치를 켜면 **사용자가 본 적 없는 가격으로 등록된다.**
- **Fix:** 실시간 상한가 첫 도착 시 **한 번만** 재시딩(폼 remount). 서버 전략이 이미 있으면 올리지 않는다(그때는 시딩 자체가 없고 remount 는 편집을 지우는 일만 한다).
- **Files modified:** `limit-chaser-client.tsx`
- **Commit:** `eed0e6d`

**4. [Rule 1 - 잘못된 타입 선언] `searchStocks` 가 `Stock[]` 으로 좁게 선언돼 있었다**
- **Issue:** 서버는 검색과 상세가 같은 매퍼(`mergeMasterAndQuote`)를 쓰므로 검색 결과에도 `isin`·`upperLimitProximity` 가 **원래부터 실려 있었다.** 상따는 종목을 고르는 즉시 `isin` 이 필요한데(D-28) 타입이 좁으면 상세를 한 번 더 조회하거나 캐스팅해야 한다 — 둘 다 없는 계약을 지어내는 쪽이다.
- **Fix:** 반환 타입을 `StockDetailResponse[]` 로 정정(상위집합이라 기존 소비자 무변경).
- **Files modified:** `stock-api.ts`
- **Commit:** `60d66e8`

### 계획 대비 조정

**5. `RelayStatusBar` 재사용 대신 전용 상태줄** — 그 컴포넌트는 「배지 + 본문 + 알림 누적」 3단 패널이라 목업 `.state` 1행과 형태가 다르고 전략 배지를 실을 자리가 없다. 연결 문구만 `RELAY_STATE_LABELS` 계약을 그대로 쓴다(D-36 · 16-15 `me-client` 와 같은 판단).

**6. `AccountPanel` 을 계좌 전용 모드로** — UI-SPEC A12 는 「탭」을 적었지만, 종목 축 모드는 패널 자신의 계좌 `<select>` 를 그려 상단 A1 카드와 **셀렉터가 두 벌**이 된다. 「지금 어느 계좌인가」가 갈리는 쪽이 더 비싼 결함이라 16-10 인계 규율을 따랐다. E2E 가 `combobox` 총수 1 을 단언한다.

**7. 폼에 선택 prop 2개 추가**(`onSent`·`onServerEcho`) — 계획 files_modified 밖이다. 없으면 「내 에코」와 「다른 단말」을 구분할 수 없어 **내가 「수정」을 누를 때마다 「다른 단말에서 변경됐어요」** 가 뜬다. 둘 다 optional 이라 16-12 의 23케이스는 무변경으로 통과한다.

**8. E2E 픽스처에 `pushServerMessage(54)` 추가** — 계획 files_modified 밖이다. 서버는 거부를 응답 코드로 주지 않아 이 주입구 없이는 **조용한 거부 경로를 E2E 가 볼 수 없다**(T-16-07 이 요구한 케이스 7 이 성립하지 않는다). 순수 추가라 16-14 가 읽는 API 는 그대로다.

**9. `lib/limit-chaser.ts` 에 판정 함수 추가** — 계획이 「`lib/limit-chaser.ts` 또는 공용 유틸」로 명시한 자리다.

**10. E2E 케이스 10 → 12** — 계획 10케이스를 전부 덮고 대조군 2건(VI 몫 미흡수 · 더티 아닐 때 미경고)을 더했다.

**11. `useIsinNames()` 를 이 파일에 다시 썼다** — `app-sidebar.tsx`·`strategy-status-card.tsx` 에 같은 규약의 사설 훅이 이미 있다. 남의 plan 파일에서 export 를 뽑아내는 것보다 10줄 복사가 부작용이 작다고 판단했다(16-15 도 같은 선택을 했다). **세 번째 사본이므로 공용화 시점이 됐다** — 아래 Known Stubs 참조.

### 인증 게이트

없음.

## Known Stubs

없음. 이 plan 이 만든 표면은 전부 실제 데이터(전역 relay 스냅샷 · `searchStocks` REST)에 연결돼 있고, 하드코딩된 빈 배열·플레이스홀더 문구가 UI 로 흐르는 자리가 없다.

다만 **정리 대상 1건**을 남긴다:

| 항목 | 내용 |
|------|------|
| `useIsinNames` 3중복 | `app-sidebar.tsx` · `strategy-status-card.tsx` · `limit-chaser-client.tsx` 가 같은 역매핑 훅을 각자 갖고 있다. 셋 다 동작은 같지만 `strategy-status-card` 판만 `accountStates` 전량을 훑는다(나머지는 `account` 단건). **계좌가 2개 이상이면 사이드바·상따 제목이 이름 대신 ISIN 을 보여줄 수 있다.** 기능 결함은 아니지만(폴백이 계약이다) 세 벌이 갈린 상태라 공용 훅으로 모으는 것이 맞다 — 16-16/16-17 또는 quick 에서. |

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다. `searchStocks` 는 이미 있던 공개 검색 라우트이고, 전송은 전부 기존 `lc.set` wss 경로 안쪽이다.

계획 `<threat_model>` 대응 상태:

| Threat ID | Disposition | 결과 |
|-----------|-------------|------|
| T-16-07 (거부 표시) | mitigate | `ServerMessage(ERROR)` 가 상태줄(`role="alert"`) + 전략 로그 **양쪽**에 남는다. RTL ⑨ · E2E 7 이 두 곳을 각각 단언하고, 「로그에만 남기기」 변이를 검출했다. 3초 무응답은 표시만 하고 재전송하지 않는다 |
| T-16-10 (재시도 중복 발주) | mitigate | 자동 재전송 경로가 **코드에 없다**. RTL ⑧ 이 「30초가 흘러도 전송 1건」을 단언하고, 재전송 부활 변이를 검출했다 |
| T-16-02 (로그 내용) | accept | 브라우저 메모리 전용(상한 100건, 새로고침 시 소멸)이고 그 사실을 캡션이 고지한다. 서버 저장 경로 없음 |
| T-16-05 (마커/등락률 렌더) | mitigate | 슬롯 16px·등락률 40px 을 인라인 style 로 박고 **계산값으로** 단언했다. 고정폭 제거·빈 슬롯 미렌더·min-width 제거 3종 변이를 전부 검출 |

추가로 잡은 것: **Pitfall 9**(VI 몫 통지 흡수)를 판정 함수 1곳 + RTL ⑩ + E2E 7b(대조군 포함)로 잠갔다. 남의 거부를 내 거부로 그리면 사용자가 멀쩡한 상따 전략을 껐다 켜고, 그 재등록이 두 번째 발주다.

## Self-Check: PASSED

- `webapp/src/components/orderbook/orderbook-ladder.tsx` — FOUND (`variant="chaser"` · `recentTrades`)
- `webapp/src/components/trading/strategy-log.tsx` — FOUND (`data-slot="strategy-log"`)
- `webapp/src/components/trading/limit-chaser-client.tsx` — FOUND (`data-slot="limit-chaser-page"`)
- `webapp/e2e/specs/trading-limit-chaser.spec.ts` — FOUND
- `webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx` — FOUND
- `webapp/src/components/trading/__tests__/strategy-log.test.tsx` — FOUND
- `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` — FOUND
- 커밋 `c92e03b` / `60d66e8` / `eed0e6d` — FOUND
- `key_links` — `limit-chaser-client.tsx` → `useRelaySubscription` · `limitChasers` 소비 확인
- 16-14 소관 파일 7종(`vi-*` · `trading/vi/page.tsx` · `trading-vi.spec.ts`) — **미수정 확인**
- `STATE.md` / `ROADMAP.md` — **미수정 확인**
