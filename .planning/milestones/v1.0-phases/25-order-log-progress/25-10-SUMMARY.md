---
phase: 25-order-log-progress
plan: 10
subsystem: webapp · e2e
tags: [order-log, card-tabs, popout-window, next-app-router, generateMetadata, playwright, axe, tdd]
status: complete

requires:
  - phase: 25-07
    provides: "useOrderLogFeed · OrderLogFeedProvider/useOrderLogFeedContext · OrderLogList(variant) · OrderLogFilters · useOrderLogNameOf · parse/orderLogQueryString · ORDER_LOG_WINDOW_* · WB_PHONE_BAND_BELOW · withLocalRelay({ observer })"
  - phase: 25-08
    provides: "오늘 주문 행 펼침 · order-timeline 픽스처(ROW_12451 · TIMELINE_BY_ANCHOR)"
  - phase: 25-09
    provides: "UnfilledProgress 보조행 · pushQueueProgress"
provides:
  - "카드 탭 「주문로그」 — CardTab 'orderlog' · CardOrderLogInput · cardOpen · 가려짐 배지 · 「로그」 → 「전략로그」(값 log 유지)"
  - "OrderLogList card 변형 dense 줄(괄호 · 거래소 · 종목 없음 · #주문번호) · dense 빈 박스"
  - "OrderLogFeedProvider phoneBand prop · 컨텍스트 값 OrderLogFeedContextValue(= OrderLogFeed + phoneBand) · Provider 는 WorkbenchSurface 안"
  - "창 분리 라우트 /trading/order-log — 앱 셸 없음 · Suspense · generateMetadata 제목"
  - "OrderLogWindow — ‹ 날짜(요일) › 오늘 · 쿼리 화이트리스트 교정 + router.replace · 날짜마다 조회 1회 · 오늘만 핀"
  - "lib: shiftKstDate · kstWeekdayShort · WB_PHONE_BAND_BELOW 정의 이동(trading-layout.ts · 작업대는 재수출)"
  - "e2e: order-log.spec P25-7 · P25-8 · P25-9 · a11y.spec 「Phase 25 axe 매트릭스」 20 스캔"
affects: [25-11, 25-12]

actuals:
  tokens: 18700
  tasks: 3
  commits: 8
plan_head_before: 797c0f53e4331c64dddb78a43370c4c814c10aee

tech-stack:
  added: []
  patterns:
    - "URL 쿼리가 화면 상태인 창 — 첫 렌더 쿼리로 로컬 상태를 세우고, 이후엔 상태 → 정본 쿼리 문자열 → router.replace 한 방향만(URL 을 다시 읽지 않는다 · 히스토리 없음)"
    - "router.replace 를 쓰는 클라이언트 페이지의 문서 제목은 서버 generateMetadata 가 정본 — soft navigation 이 서버 메타데이터를 다시 적용해 document.title 을 덮는다"
    - "폰 밴드 같은 공용 판정은 무거운 모듈이 아닌 가벼운 lib 에 상수를 두고 무거운 쪽이 재수출 — 새 창 번들이 작업대 전체를 끌어오지 않게"

key-files:
  created:
    - webapp/src/app/trading/order-log/page.tsx
    - webapp/src/components/trading/order-log/order-log-window.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-window.test.tsx
  modified:
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/order-log/order-log-feed-context.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/lib/trading-layout.ts
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/e2e/specs/order-log.spec.ts
    - webapp/e2e/specs/a11y.spec.ts

key-decisions:
  - "카드 주문로그의 종목 칸(줄 title 의 F-A 평문)은 카드가 이미 가진 표시명(`stockName`)을 쓴다 — 카드는 useIsinLabels 를 구독하지 않는다(T-18-29 재렌더 예산). 그래서 CardOrderLogInput 에 stockName 을 더했다"
  - "카드 배지 가려짐 = 다른 탭 활성 ∨ 카드 탭 접힘 ∨ 카드 접힘(`cardOpen` false — 접힌 카드 본문은 hidden 으로 살아 있다)"
  - "OrderLogFeedProvider 를 TradingWorkbench(게이트 직후)에서 WorkbenchSurface 루트로 옮겼다 — 폰 밴드 state 가 그 안에 있다. 게이트 뒤 · 마운트 1회 조회는 그대로"
  - "창 분리 문서 제목의 정본은 page.tsx generateMetadata(창과 같은 parseOrderLogQuery 로 date 교정). 클라이언트 document.title 효과는 즉시 반영용으로 남겼다"
  - "WB_PHONE_BAND_BELOW 정의를 lib/trading-layout.ts 로 옮기고 trading-workbench 는 재수출 — 창 번들이 작업대 모듈을 끌어오지 않는다(값 · 이름 불변 · 새 경계 숫자 없음)"
  - "창 분리 URL 은 상대 `?date=` 가 아니라 절대 경로 `/trading/order-log?…`(쿼리 없으면 경로만)로 replace · `{ scroll: false }`"
  - "카드 dense 줄은 shared 조립기 조각(strategyEventParts)을 배치만 바꾼다 — 문장 생성 · 분리 · 재결합 없음, title 은 orderLogLineText 그대로(곧 올 D-09 두 줄 형식 변경이 shared 한 곳에서 끝나게)"

patterns-established:
  - "카드 탭 새 탭 추가 문법: CardTab 유니온 + 선택 prop(없으면 탭 없음) + CountBadge + 가려짐 visible 신호(탭 ∧ 펼침 ∧ 카드 펼침)"

requirements-completed: []

coverage:
  - id: D1
    description: "카드 탭 「주문로그」 — 탭 5개 순서 · 값 log 「전략로그」 · 요청 통로 orderlog · 범위(카드 계좌 주문 + 그 종목·거래소 시세) · 필터줄/핀 없음 · 빈/로딩/실패 · 가려짐 배지 3조건 · 고정 높이 본문"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#CardTabs — 주문로그 탭 (Phase 25) (10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "OrderLogList card dense 줄 — 괄호 · 거래소 · 종목 없음 · #주문번호/#— · 모르는 kind 원문 · 3px 8px · gap 0 · 1.6 · dense 빈 박스 · 자동 따라감"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx#OrderLogList — card dense (25-10) (6)"
        status: pass
    human_judgment: false
  - id: D3
    description: "창 분리 페이지 — 쿼리 교정 replace 1회 · ‹ 날짜(요일) › 오늘 · 날짜마다 조회 1회 · 과거일 푸시 무시 · 핀 없음 · 빈/실패 문구 · account 범위 · 루트 @container/wb · 창 분리 버튼 없음 · 날짜 헬퍼"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-window.test.tsx (8) · webapp/src/lib/__tests__/order-log-feed.test.ts#shiftKstDate · kstWeekdayShort (2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "브라우저 종단 — 카드 탭(P25-7) · 창 분리(P25-8 · 제목 · 앱 셸 부재 · 과거일 대조군 · 네이티브 셸 버튼 숨김) · 백스톱 E5/E6 overflow 실측(P25-9)"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts P25-1~P25-9 (10 passed = 9 + setup · 2회 연속)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 25 새 표면 axe — 공용 패널 주문로그 · 카드 주문로그 · 창 분리 · 오늘 주문 펼침 · 진행률 보조행 × 폭 344 · 1280 × 라이트 · 다크 = 20 스캔 critical/serious 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/a11y.spec.ts#Phase 25 axe 매트릭스 (a11y.spec 13 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실화면 모양(카드 dense 줄 · 창 머리줄 · 과거일 빈 박스 · 390 카드)은 스크린샷으로 확인했으나 사용자 눈 확인은 phase UAT 몫"
    verification: []
    human_judgment: true
    rationale: "목업 대조 · 시각 판단은 테스트가 단언하지 않는다 — 1280 카드 · 창 오늘/과거일 · 390 카드 스크린샷을 실행 중 확인만 했다"

duration: 26min
completed: 2026-09-29
---

# Phase 25 Plan 10: 카드 탭 「주문로그」 · 창 분리 페이지 · Phase 25 axe 매트릭스 Summary

**작업대 종목 카드에 「주문로그」 탭(그 종목 · 그 거래소 · 카드 계좌만 · dense 줄 · 가려짐 배지)이 서고 기존 「로그」 는 「전략로그」 로 이름만 바뀌었다. 앱 셸 없는 `/trading/order-log` 창이 ‹ 날짜 › 오늘로 과거 거래일을 달력 하루씩 넘기며 쿼리를 정본 URL 로 동기화한다. Phase 25 새 표면 다섯 개는 폭 두 개 × 테마 두 개 20 스캔에서 axe critical/serious 가 0 이다.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-29T12:39:32Z
- **Completed:** 2026-09-29T13:06:08Z
- **Tasks:** 3 (Task 1 · 2 = TDD RED → GREEN, Task 3 = auto) + refactor 1 · fix 1
- **Files:** 15 (신규 3 · 수정 12)

## Accomplishments

- **카드 탭(D-06 · 결정 3-A · 4-B)** — 트리거 순서는 정보 → 미체결 → 잔고 → **주문로그** → **전략로그**다. 전략로그는 값 `log` 를 그대로 두고 `CountBadge` 도 유지했다. 요청 통로 · 접기 · `CARD_TABS_BODY_H` 는 바꾸지 않았다. 본문은 `OrderLogList variant="card"` 다. 범위는 카드 계좌 주문 이벤트와 시세 이벤트이고, 둘 다 그 종목 · 그 거래소만(`inScope`) 보인다. 필터줄 · 핀은 없고 자동 따라감만 있다. 배지는 가려진 동안(다른 탭 · 카드 탭 접힘 · 카드 접힘) 도착한 범위 안 푸시 수다. N>0 이면 트리거 이름이 「주문로그, 새 로그 N건」 이다.
- **dense 줄** — `09:45:02.861 #12451 선매수 주문 · 조건 … | 누적 861,800` · 시세 `09:42:13.215 상한가노출 매도잔량 185,400 | 누적 620,000` 형태다. `strategyEventParts` 조각을 배치만 바꿨고, 문장 생성 · 분리 · 재결합은 하지 않는다. `title` 은 F-A 와 같이 `orderLogLineText` 로 만든 줄 전체 평문이다.
- **피드 공유** — 카드마다 조회하지 않는다. `strategy-card` 가 `useOrderLogFeedContext()` 하나를 카드 isin · exchange · 표시명 · 작업대 폰 밴드와 묶어 넘긴다. Provider 밖에서 렌더되면 주문로그 탭 자체가 없다.
- **창 분리(D-07 · 결정 5-A)** — `page.tsx` 는 `<Suspense fallback={null}>` 과 `generateMetadata` 만 둔다. `OrderLogWindow` 루트는 `main[data-slot=order-log-window]` · `@container/wb` · `h-dvh` 다. 머리줄은 `h1` 「주문로그」 · ‹ 24px · mono 「YYYY-MM-DD (요일)」 · ›(오늘이면 disabled) · 「오늘」 알약(오늘이면 accent + `aria-current="date"` · 무동작)이고 조각은 전부 `flex-none` 이다. 그 아래 필터줄(창 분리 버튼 없음)과 F-A 목록(`flex-1 min-h-0` · `showPin={isToday}`)이 온다. 과거일 빈 박스 · 실패 문구는 UI-SPEC 원문 그대로다.
- **쿼리 동기(R13 · R15 · T-25-40)** — 형식 오류 · 미래 날짜 · 모르는 값은 마운트 때 정본 URL 로 한 번 `router.replace` 한다. 날짜 · 필터를 바꾸면 같은 정본 문자열로 `replace` 한다(`{ scroll: false }`). 날짜를 옮길 때마다 `GET /api/strategy-events` 가 1회 나간다.
- **axe 매트릭스** — 20 스캔 전부 0건이다. `DEFERRED_RULES` 는 바꾸지 않았다. `--faint` 대비는 기존 `color-contrast` 이연 규칙 그대로 다뤘다.

## e2e 결과

### order-log.spec.ts — 10 passed (9 + setup) × 2회

| 케이스 | 결과 |
|---|---|
| P25-1 ~ P25-6 (25-07 기존) | pass |
| P25-7 카드 탭 — 트리거 id 순서 info/unfilled/holdings/orderlog/log · log 라벨 「전략로그」 · data-surface card · 필터줄 0 · 줄 2(NXT 시세 · 다른 종목 제외) · dense 텍스트 · title F-A · 핀 0 · 푸시 1 → 3줄 + 맨 아래 | pass |
| P25-8 창 분리 — 1280 줄 2 · 제목 「주문로그 · 오늘」 · app-aside · app-menu-button · popout 0 · › disabled · 오늘 aria-current · ‹ → URL `date=어제` + 요청 `[…, ?date=어제]`(정확히 1회 추가) · 제목 「주문로그 · 어제」 · 과거일 빈 문구 · 푸시 뒤 1.5초 줄 0 · 핀 0 · 「오늘」 → 줄 3(푸시가 실제 도착한 대조군) · 네이티브 셸 /trading popout 숨김 | pass |
| P25-9 백스톱(390) | pass — 아래 수치 |

**백스톱 실측(P25-9 · 뷰포트 390):**
- **E5 overflow 공용 패널 탭 줄**: 탭 4개 + 접기 버튼 top 차 **0.0px**(한 줄이다)
- **E5 overflow 카드 탭 줄**: 탭 5개 tablist `scrollWidth 328 = clientWidth 328`(가로 스크롤 없이 다 들어간다) · 카드 폭 **374 = 작업대 374** · 주문로그 탭을 연 뒤에도 374(폭을 밀지 않는다)
- **E6 overflow 카드 주문로그 본문**: card-tabs 높이 **108.5 → 108.5 → 108.5**(정보 탭 → 주문로그 12줄 → 새 줄 뒤 · 불변) · 스크롤러 clientHeight 72 · 목록 위아래 패딩 6 · 줄 높이 17.6 → 보이는 줄 **≈3.75** · 새 줄 도착 시 `scrollTop+clientHeight ≥ scrollHeight−24`(따라감)

### a11y.spec.ts — 13 passed (「Phase 25 axe 매트릭스」 포함 · skip 0)

- 조합: 표면 5 × 폭 2 × 테마 2 = **20 스캔** · critical/serious **0**
- 폭 실측: 344 → 작업대 본문 344 · 마이페이지 본문 344 · 창 344 / 1280(뷰포트) → 작업대 본문 992 · 마이페이지 900(max-width) · 창 1280

### 회귀

- `playwright test trading-workbench.spec.ts me.spec.ts unfilled-progress.spec.ts --grep-invert "5\. 격자|P20-3 최악값|종목 추가란 글꼴"` → **87 passed**
- 제외한 3건은 deferred-items.md 에 적힌 기존 실패다. `5. 격자` 가 같은 「삼성전자 넘침」 으로 실패했고 serial 이라 나머지 2건은 돌지 않았다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| vitest card-tabs · order-log(4 files) · strategy-card | 5 files · 77 passed |
| vitest order-log-window · order-log-feed | 2 files · 27 passed |
| vitest `src/components/trading src/lib` | 87 files · 2403 passed · 1 skipped |
| webapp 전체 `pnpm --filter @gh-radar/webapp run test` | 136 files · 3031 passed · 1 skipped(기존) |
| `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e) | exit 0 |
| `next lint --file`(변경 7 파일) | 경고 0(1건 수정 후) |
| acceptance grep — Task 1 | `"orderlog"` 5 · 전략로그 6 · `value="log"` 2 · `CARD_TABS_BODY_H` 원값 1 · strategy-card `useOrderLogFeedContext` 2 |
| acceptance grep — Task 2 | page AppShell 0 · `fallback={null}` 1 · window `@container/wb` 2 · `WB_PHONE_BAND_BELOW` 3 · 700 리터럴 0 · `aria-current="date"` 2 · `router.replace` 4 |
| acceptance grep — Task 3 | P25-7/8/9 6 · 「Phase 25 axe 매트릭스」 1 · `DEFERRED_RULES` 집합 줄 diff 0 |

## Task Commits

1. **Task 1: 카드 탭 「주문로그」 (TDD)**
   - RED `64129b00` (test) — card-tabs 17건 · list 5건 실패(탭 5개 · 전략로그 · dense 줄 · 빈 박스 등 목표 단언). 자동 따라감 1건은 기존 훅이라 이미 통과했고 회귀 잠금으로 둔다.
   - GREEN `b0ff9b8d` (feat) — 77 passed · typecheck 0
   - REFACTOR `28b37dcd` (refactor) — lint 경고(미사용 인자) · import 정리
2. **Task 2: 창 분리 페이지 (TDD)**
   - RED `bcbb8b33` (test) — 헬퍼 `is not a function` 2건 · 창 모듈 부재
   - GREEN `d751f42d` (feat) — 27 passed · typecheck 0
3. **실측 결함 수정** `3bf150ad` (fix) — 창 문서 제목을 generateMetadata 정본으로(e2e P25-8)
4. **Task 3: 브라우저 증거 · 접근성** `2be763c2` (test)

`commits: 8` 은 `rev-list 797c0f53..HEAD` 실측값이다. 이 중 `aeba8847` 은 동시 세션 quick-260929-sas 커밋이고, 25-10 커밋은 7건이다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|---|---|---|---|---|
| 1 | 64129b00 | b0ff9b8d | 28b37dcd | OK |
| 2 | bcbb8b33 | d751f42d | — | OK |

## Files Created/Modified

- `webapp/src/app/trading/order-log/page.tsx` — 창 분리 라우트(셸 없음 · Suspense · generateMetadata)
- `webapp/src/components/trading/order-log/order-log-window.tsx` — `OrderLogWindow`
- `webapp/src/components/trading/card/card-tabs.tsx` — `CardTab` orderlog · `CardOrderLogInput` · `cardOpen` · 머리 ⑧
- `webapp/src/components/trading/card/strategy-card.tsx` — 피드 컨텍스트 결선
- `webapp/src/components/trading/order-log/order-log-list.tsx` — card dense 변형 · 머리 ⑥ ⑦
- `webapp/src/components/trading/order-log/order-log-feed-context.tsx` — `phoneBand` · `OrderLogFeedContextValue`
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — Provider 위치 이동 · 상수 재수출
- `webapp/src/lib/order-log-feed.ts` — `shiftKstDate` · `kstWeekdayShort`
- `webapp/src/lib/trading-layout.ts` — `WB_PHONE_BAND_BELOW` 정의
- 테스트: card-tabs · order-log-list · order-log-window(신규) · order-log-feed · e2e order-log · a11y

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 날짜를 옮기면 창 문서 제목이 「GH Trade」 로 되돌아감**
- **Found during:** Task 3 (e2e P25-8 — `toHaveTitle` 실패, 실제 값 「GH Trade」)
- **Issue:** 날짜 · 필터를 바꿀 때마다 `router.replace`(soft navigation)가 서버 메타데이터(루트 layout `title: 'GH Trade'`)를 다시 적용해, 클라이언트 효과가 쓴 `document.title` 을 덮었다.
- **Fix:** `page.tsx` 에 `generateMetadata({ searchParams })` 를 두었다. 창과 같은 `parseOrderLogQuery` 로 date 를 교정해 「주문로그 · YYYY-MM-DD」 를 낸다. 클라이언트 효과는 즉시 반영용으로 남겼다.
- **Files modified:** webapp/src/app/trading/order-log/page.tsx
- **Verification:** P25-8 이 오늘 · 어제 제목을 둘 다 단언한다 — 2회 green
- **Commit:** 3bf150ad

**2. [Rule 3 - Blocking] 폰 밴드를 Provider 에 실을 수 없는 구조**
- **Found during:** Task 1
- **Issue:** 플랜은 `<OrderLogFeedProvider phoneBand={phoneBand}>` 이다. 그런데 Provider 는 `TradingWorkbench`(게이트 직후)에 있었고 phoneBand state 는 그 아래 `WorkbenchSurface` 에 있었다.
- **Fix:** Provider 를 `WorkbenchSurface` 루트 JSX 로 옮겼다(게이트 뒤 · 마운트 1회 조회 불변). 컨텍스트 값은 `useMemo({ ...feed, phoneBand })` 다. 공용 패널은 그대로 `OrderLogFeed` 로 읽는다.
- **Files modified:** trading-workbench.tsx · order-log-feed-context.tsx
- **Commit:** b0ff9b8d

**3. [Rule 2 - 성능] 창 분리 번들이 작업대 모듈 전체를 끌어오는 import 경로**
- **Found during:** Task 2
- **Issue:** `WB_PHONE_BAND_BELOW` 를 `trading-workbench.tsx`(수천 줄 · 의존 수십)에서 import 하면 새 창 청크에 작업대가 딸려 온다.
- **Fix:** 정의를 `lib/trading-layout.ts` 로 옮기고 `trading-workbench.tsx` 는 `export { WB_PHONE_BAND_BELOW }` 로 재수출한다(값 700 · 이름 불변 · 새 경계 숫자 없음 · §2.2b 표 무변경).
- **Commit:** d751f42d

### 해석 · 보강

- **[보강]** `CardOrderLogInput.stockName` 을 더했다. 줄 `title`(F-A 전체 평문)에 종목명이 필요한데, 카드는 `useIsinLabels` 를 구독하지 않는다(T-18-29).
- **[보강]** `CardTabsProps.cardOpen`(기본 true)을 더했다. 카드 접힘을 「가려짐」 으로 세라는 UI-SPEC ②-2 를 신호로 받는다.
- **[해석]** 창 `router.replace` 인자는 상대 `"?date=…"` 가 아니라 절대 경로 `/trading/order-log?…` 이고, 쿼리가 없으면 경로만 준다. 단위 테스트가 이 형태를 잠근다.
- **[해석]** P25-9 「보이는 줄」 은 (스크롤러 높이 − 목록 위아래 패딩 6px) ÷ 줄 높이로 쟀다 = 3.75. 패딩을 빼지 않으면 4.09 로 상한 4 를 넘는다. 카드 본문 72px ÷ dense 줄 17.6px 은 목업(`.cbody` 72px · `lines.dense` 1.6)과 같은 값이라, UI-SPEC 「≈3줄」 은 근사 표현이다.
- **[해석]** axe 「본문 344 · 1280」 에서 344 는 본문을 정확히 344 로 맞췄다(작업대 · 마이페이지 clientWidth · 창 뷰포트). 1280 은 뷰포트 1280 이다(실측 본문: 작업대 992 · 마이페이지 900 · 창 1280). 앱 셸 사이드바가 있어 뷰포트 1280 에서 작업대 본문 1280 은 불가능하다.
- **[의도된 파급]** 기존 card-tabs 단위 테스트의 「로그」 라벨 단언 12곳을 「전략로그」 로 갱신했다.

---

**Total deviations:** 3 auto-fixed (Rule 1 ×1 · Rule 2 ×1 · Rule 3 ×1) + 보강 2 · 해석 3. **Impact:** 스코프 변화 없음. shared 계약 · 스토어 · 서버 무변경이고, 기존 파일 변경은 카드 탭 라벨 · Provider 위치 · 상수 정의 위치뿐이다.

## Issues Encountered

- 첫 `a11y.spec -g "Phase 25 axe"` 실행 1회에서 beforeAll 의 relay 기동이 실패했다(afterAll `relay.stop` undefined). 그 직후 재실행과 전체 a11y.spec 실행은 모두 green 이었다. 테스트 코드가 아니라 로컬 relay 포트 기동 타이밍 문제로 보이고, 재현되지 않았다.
- trading-workbench e2e 기존 실패 3건은 그대로다(deferred-items.md · 이 플랜 무관).

## Known Stubs

없음.

## Threat Flags

없음. 새 표면은 계획된 창 분리 라우트(T-25-40 화이트리스트 교정 구현 · T-25-41 수용 · T-25-42 네이티브 셸 버튼 숨김 e2e 확인)뿐이다. 창은 기존 `GET /api/strategy-events` 를 그대로 소비하고, 인증은 middleware 기본 차단(비공개 경로)이 맡는다.

## User Setup Required

없음.

## Next Phase Readiness

- 25-11(원격 DB 적용)과 25-12(배포)가 남았다. 원격 DB 에 `dma_strategy_events_for_user` 가 들어가기 전에 webapp 을 push 하면 카드 · 창 모두 「오늘/이 날 주문로그를 불러오지 못했어요」 와 푸시 줄만 보인다. 배포 순서는 CONTEXT 고정(relay → webapp push)을 따른다.
- 곧 올 D-09 두 줄 형식 변경은 `packages/shared/src/strategy-event-text.ts` 한 곳에서 끝난다. 카드 dense · 창 F-A · 공용 패널이 모두 `strategyEventParts` · `orderLogLineText` 출력만 배치한다. 다만 카드 dense · F-A 의 조각 배치(한 줄 flex)는 두 줄 형식이 조각 구조를 바꾸면 목록 컴포넌트에서 같이 봐야 한다.

## Self-Check: PASSED

- FOUND: 신규 3 파일 · 수정 12 파일 (`[ -f ]` 확인)
- FOUND commits: 64129b00 · b0ff9b8d · 28b37dcd · bcbb8b33 · d751f42d · 3bf150ad · 2be763c2 (`git rev-list --count 797c0f53..HEAD` = 8, 동시 세션 1건 포함)
