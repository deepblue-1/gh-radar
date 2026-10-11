---
phase: 25-order-log-progress
plan: 07
subsystem: webapp · e2e
tags: [order-log, shared-panels, react, hooks, sticky-scroll, playwright, relay-observer, tdd]
status: complete

requires:
  - phase: 25-01
    provides: "웹 스토어 strategyEvents(상한 5000) · OrderLogList F-A 한 줄 · shared strategy-event 계약 · 하루 흐름 픽스처"
  - phase: 25-03
    provides: "server GET /api/strategy-events (bare array · date 생략 = KST 오늘)"
  - phase: 25-04
    provides: "조립기 전 종류(strategyEventParts · orderLogLineText) · 하루 흐름 14줄 + 갈래 12줄 골든"
provides:
  - "lib: fetchStrategyEvents · order-log-feed 순수 함수(mergeStrategyEvents · inScope · matchesKind · applyOrderLogFilters · stockOptions · parse/orderLogQueryString · ORDER_LOG_WINDOW_*)"
  - "hooks: useStickToBottom(24px · 삽입 전 거리 판정) · useOrderLogFeed(date?)(복원 1회 + retry + ready 재진입 · 스토어 키 비교 newKeys 3초) · useUnseenOrderLogCount"
  - "컴포넌트: OrderLogList 확장(172px 스크롤러 · 실패/로딩/빈/필터0 · sticky 핀 · data-new · 폰 밴드 줄 펼침) · OrderLogFilters · OrderLogPanel · useOrderLogNameOf · OrderLogFeedProvider/useOrderLogFeedContext"
  - "공용 패널 「주문로그」 탭 — SHARED_PANEL_TABS 한 정본 · isSharedPanelTab · 「주문로그 (N)」 배지 · WB_PHONE_BAND_BELOW export"
  - "e2e: withLocalRelay({ observer }) 기본 off · LocalRelay.pushStrategyEvents · order-log.spec P25-1~P25-6"
affects: [25-10, 25-11, 25-12]

actuals:
  tokens: 38026
  tasks: 3
  commits: 6
plan_head_before: 150b648c31599b2d73d15eb361afefc5c4532cbf

tech-stack:
  added: []
  patterns:
    - "탭 값 한 정본 — `as const` 배열 → 유니온 타입 · 저장 가드 · 컴포넌트 로컬 타입이 전부 파생(새 탭이 복원에서 조용히 버려지는 Pitfall 12 차단)"
    - "새 푸시 줄 판정은 스토어 목록의 키 집합 스냅샷 비교 — 마지막 프레임만 드는 batch 는 렌더 합쳐짐에서 앞 프레임을 놓친다"
    - "맨 아래 고정은 스크롤 이벤트 시점 값이 아니라 직전 커밋 scrollHeight 기준 **삽입 전 거리** — 스크롤 이벤트(다음 프레임)보다 먼저 온 푸시에 끌려 내려가지 않는다"
    - "e2e 관찰자 옵션 — 관찰자 소켓이 스텁 첫 연결이 되므로 사용자 세션 주입은 LoginReq 를 보낸 소켓으로만 · 전략 seq 는 픽스처가 스펙 수명 동안 조밀하게 다시 매김"

key-files:
  created:
    - webapp/src/lib/strategy-events-api.ts
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/lib/use-stick-to-bottom.ts
    - webapp/src/lib/use-order-log-feed.ts
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/src/lib/__tests__/use-stick-to-bottom.test.tsx
    - webapp/src/lib/__tests__/use-order-log-feed.test.tsx
    - webapp/src/components/trading/order-log/order-log-filters.tsx
    - webapp/src/components/trading/order-log/order-log-panel.tsx
    - webapp/src/components/trading/order-log/order-log-feed-context.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-panel.test.tsx
    - webapp/e2e/specs/order-log.spec.ts
    - .planning/phases/25-order-log-progress/deferred-items.md
  modified:
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
    - webapp/src/lib/trading-layout.ts
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/e2e/fixtures/relay.ts

key-decisions:
  - "새 줄 강조 · 배지의 원천은 스토어 strategyEventsBatch 가 아니라 strategyEvents 키 집합 스냅샷 비교 — batch 는 마지막 프레임 삽입분만 들어 연속 푸시가 한 렌더로 합쳐지면 앞 프레임 줄을 놓친다(상한 5,000 · O(n))"
  - "useStickToBottom 의 따라감 판정 = 직전 커밋 scrollHeight 기준 삽입 전 거리 — 스크롤 이벤트 시점 값은 다음 프레임에 오므로 사용자가 막 올린 프레임에 온 푸시가 끌어내렸다(e2e P25-3 간헐 실패로 실측)"
  - "창 분리 상수(ORDER_LOG_WINDOW_PATH · NAME · FEATURES)는 order-log-feed.ts 에 둔다 — 25-10 창 분리 페이지와 공유"
  - "parseOrderLogQuery corrected = 받은 값 중 버리거나 바꾼 것이 있음(형식 오류 · 미래 날짜 · 모르는 값 · all 별칭). 값이 없는 것은 교정이 아니다"
  - "공용 패널 폰 밴드 탭 목록: 트리거 좌우 8px(@min-[700px]/wb 에서 기존 10px) · 접기 토글 6px · TabsList overflow-x-auto(카드 탭 규율) — 344 에서 「주문로그 (12)」 까지 겹침 0, 세 자리 배지는 가로 스크롤"
  - "필터 상태는 OrderLogPanel 로컬 — Radix TabsContent 가 비활성 탭을 언마운트하므로 탭을 바꾸면 필터가 전체로 돌아간다(UI-SPEC 미규정 · 스크롤 고정도 마운트 = 맨 아래로 규칙과 일치)"
  - "창 분리 버튼의 앱 셸 판정(isNativeApp)은 마운트 뒤 effect — SSR/하이드레이션 불일치 방지, 첫 페인트는 native:hidden CSS 가 가린다"

patterns-established:
  - "OrderLogFeedProvider — 작업대 1회 조회 피드를 공용 패널 · 카드 탭이 공유(25-10 카드 탭이 useOrderLogFeedContext 로 읽는다)"
  - "useOrderLogNameOf(rows) — 이름(relay → 마스터) → 코드 → ISIN 3단 폴백 훅(카드 탭 · 창 분리 재사용)"

requirements-completed: []

coverage:
  - id: D1
    description: "피드 순수 함수 — 복원+푸시 병합(오늘 경계 · 중복 1회) · 결정 1-A 범위 · 구분 6값 group 축 · 종목 옵션 가나다순 · 창 분리 쿼리 화이트리스트/왕복"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts (17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "스크롤 고정 훅 — 24px · 즉시 따라감 · pending 누적 · 감소 무시 · resetKey · 스크롤 이벤트 전 삽입 비추종"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-stick-to-bottom.test.tsx (7)"
        status: pass
    human_judgment: false
  - id: D3
    description: "피드 훅 — 마운트 1회 · ready 재진입 1회 · 폴링 없음 · 실패 시 푸시 유지 · newKeys 3초 · 연속 프레임 강조 · 과거일 푸시 무시 · 배지 카운트"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-order-log-feed.test.tsx (10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "목록 · 필터줄 · 패널 — 스크롤러 속성 · 상태 4종 · 핀 · data-new · 폰 밴드 펼침 · title 전체 평문 · 칩 data-on · 창 분리(window.open 정본 쿼리 · native 숨김) · 계좌 범위"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log (3 files · 25 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "공용 패널 탭 결선 — DOM 순서 unfilled→holdings→orderlog→log · sharedTab orderlog 저장→재마운트 복원 · 배지 (3) · 폰 접힘 = 가려짐 · 계좌 전환 재조회 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/shared-panels.test.tsx#SharedPanels — 주문로그 탭 (25-07)"
        status: pass
    human_judgment: false
  - id: D6
    description: "브라우저 종단 — 진짜 relay(관찰자) → 80 → 스텁 dma_strategy_apply → journal.events → F-A 줄 · 배지 · 스크롤 핀 · 구분 필터 · 폰/데스크톱 줄 모양 · 새로고침 복원"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts P25-1~P25-6 (6 passed + setup · 연속 3회 green)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실화면 모양(말줄임 · 색 · 다크 · 344 필터줄 줄바꿈 · 핀 위치)은 스크린샷으로 확인했지만 사용자 눈 확인은 phase UAT 몫"
    verification: []
    human_judgment: true
    rationale: "시각 판단(목업 대조)은 테스트가 단언하지 않는다 — 1280 라이트/다크 · 390 · 344 스크린샷을 실행 중 확인만 했다"

duration: 44min
completed: 2026-09-29
---

# Phase 25 Plan 07: 공용 패널 「주문로그」 탭 — 피드 · 필터 · 스크롤 고정 · 배지 · 관찰자 relay e2e Summary

**작업대 공용 패널에 「주문로그」 탭을 세웠다. 작업대 마운트 1회 하루치 복원과 `journal.events` 푸시를 합친 공용 피드를 상태줄 계좌 범위로 거르고, 구분/거래소/종목으로 필터한 F-A 목록을 172px 자체 스크롤러에 그린다. sticky 핀 · 새 로그 배지 · 폰 밴드 줄 펼침 · 창 분리 버튼이 있다. 진짜 relay(관찰자 켜짐) → 게이트웨이 80 → 스텁 적용 RPC → 브라우저 한 줄까지 Playwright 6건으로 증명했다.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-09-29T11:03:22Z
- **Completed:** 2026-09-29T11:47:39Z
- **Tasks:** 3 (Task 1 · 2 = TDD RED/GREEN, Task 3 = auto) + 견고성 fix 1
- **Files:** 21 (신규 14 · 수정 7)

## Accomplishments

- **피드(D-07)** — `useOrderLogFeed()` 는 날짜별 복원 1회 + `retry()` + relay ready **재진입** 1회만 조회한다. 폴링은 없다. 오늘은 `date` 를 싣지 않는다(서버 KST 정본). 과거일은 푸시를 무시한다. 새 줄은 스토어 키 집합 비교로 가려 3초 강조한다.
- **범위 · 필터(결정 1-A · D-08)** — 상태줄 계좌의 주문 이벤트 + 시세 이벤트 전부(시세 판정은 kind). 구분은 group 축 6값이다. 모르는 group 은 「전체」 에만 보인다. 계좌를 바꾸면 스토어에서 다시 거르고 재조회는 없다.
- **목록(UI-SPEC ②-0)** — `order-log-body` 가 스크롤 주인이다(tabIndex 0 · 「주문로그 목록」 · 라이브 영역 없음). 상태 순서는 실패 줄(맨 위 · role=status · 다시 시도) → 로딩(줄 0 일 때만) → 빈 박스/필터 0 → 목록 → sticky 핀(「새 로그 N · 맨 아래로 ↓」)이다. 푸시 줄은 `data-new` 8%, 폰 밴드는 줄 탭 펼침(`aria-expanded` · 6% · 필터 바꾸면 전부 접힘), 비폰은 `title` 에 줄 전체 평문이다.
- **필터줄(②-1)** — 네이티브 select 칩 3개(`aria-label` 이름)와 「전체」 아닌 칩 `data-on` · 「N건」 · 「창 분리 ↗」(`native:hidden` + 마운트 뒤 `isNativeApp()`)로 구성했다. 창 분리는 `window.open('/trading/order-log?{정본 쿼리}', 'gh-radar-order-log', 'width=960,height=720,noopener')` 이다.
- **탭 등록 파생 구조(Pitfall 12)** — `SHARED_PANEL_TABS = ["unfilled","holdings","orderlog","log"] as const` 한 줄에서 `SharedPanelTab`(타입) · `isSharedPanelTab`(가드 — `readPanelsPref` 와 `onValueChange` 가 사용) · `shared-panels.tsx` 의 `type SharedTab = SharedPanelTab` 이 파생된다. 수동 나열 가드 `p.sharedTab === "log"` 는 0건이다.
- **배지(R2)** — 「주문로그 (N)」 의 N 은 탭이 가려진 동안(다른 탭 활성 **또는** 폰 밴드 접힘) 도착한 범위 안 푸시 수다. 필터는 적용하지 않고, 보이면 0 이 된다. 트리거 이름은 「주문로그, 새 로그 N건」 이고 형제 「미체결 (N)」 과 같은 `mono` 괄호 모양이다.
- **e2e 픽스처 관찰자 옵션 — 기본 off 확인**: `withLocalRelay()`(인자 없음)는 `DMA_OBSERVER_SECRET: ''` → relay config `|| undefined` → 관찰자 disabled 다. 스텁 관찰자 라우트는 `observer: true` 일 때만 열리고, `gatewaySocket()` 도 옛 `waitForConnection` 경로 그대로다. trading-workbench 회귀 62건 green(아래 기존 실패 3건 제외)으로 기존 spec 무영향을 확인했다.

## Task Commits

1. **Task 1: 피드 · 필터 · 쿼리 · 스크롤 고정 (TDD)**
   - RED `c0ebb36f` (test) — 3 파일 모두 `Failed to resolve import`(구현 없음)
   - GREEN `8bc4b16d` (feat) — 32 passed
2. **Task 2: 목록 · 필터줄 · 패널 (TDD)**
   - RED `2d4d645c` (test) — 목록 9건 실패 + 필터줄/패널 import 실패
   - GREEN `6fbcea79` (feat) — 25 passed · typecheck 0
3. **견고성 fix** `f5a3d8b4` (fix) — 새 줄 판정을 스토어 키 비교로, 맨 아래 판정을 삽입 전 거리로 바꿨다(회귀 테스트 2건)
4. **Task 3: 탭 결선 · Provider · e2e** `66880e52` (feat)

## e2e 결과 (P25-1 ~ P25-6)

| 케이스 | 결과 |
|---|---|
| P25-1 복원(상한가노출) + 80 BuyOrder → F-A 두 줄 · data-kind/group · 푸시 줄만 data-new(3초 뒤 제거) · 복원 요청 1회 | pass |
| P25-2 미체결 탭 활성 중 푸시 3 → 「주문로그 (3)」(이름 「주문로그, 새 로그 3건」) · 열면 괄호 없음 | pass |
| P25-3 복원 12줄 · 위로 올린 뒤 푸시 3 → scrollTop 0 유지 + 핀 · 핀 클릭 → 맨 아래 · 핀 부재 | pass |
| P25-4 구분 「시세」 → kind 1·2 만 · label[data-on] 1 · 건수 일치 | pass |
| P25-5 1280 줄 버튼 0 · title = 줄 평문 / 390 줄 탭 → aria-expanded true · data-open · white-space normal | pass |
| P25-6 sharedTab orderlog → 새로고침 복원 | pass |

`pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/order-log.spec.ts` → **7 passed(6 + auth setup)**, 연속 3회 green(fix 뒤).

## 검증 결과

| 명령 | 결과 |
|---|---|
| vitest `order-log-feed` · `use-stick-to-bottom` · `use-order-log-feed` | 3 files · 34 passed |
| vitest `src/components/trading/order-log` | 3 files · 25 passed |
| vitest `shared-panels` + `trading-workbench` + `order-log` | 5 files · 182 passed |
| webapp 전체 `pnpm --filter @gh-radar/webapp run test` | 132 files · 2940 passed · 1 skipped(기존) |
| `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` (tsc + e2e tsconfig) | exit 0 |
| Playwright `order-log.spec.ts` | 6 passed (+ setup) × 3회 |
| Playwright `trading-workbench.spec.ts` | 62 passed · **기존 실패 3건**(기준선 파일로도 같은 실패 — deferred-items.md) |
| acceptance grep (Task 1 5항 · Task 2 6항 · Task 3 7항) | 전부 pass |

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|---|---|---|---|---|
| 1 | c0ebb36f | 8bc4b16d | — (fix f5a3d8b4 는 e2e 실측 결함 수정 · 회귀 테스트 동반) | OK |
| 2 | 2d4d645c | 6fbcea79 | — | OK |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 스크롤 이벤트보다 먼저 온 푸시가 사용자를 맨 아래로 끌어내림**
- **Found during:** Task 3 (e2e P25-3 간헐 실패 — 두 번째 실행에서 핀이 뜨지 않음)
- **Issue:** `useStickToBottom` 이 마지막 scroll 이벤트의 「맨 아래」 값으로 따라갈지를 정했다. scroll 이벤트는 다음 프레임에 비동기로 오므로, 사용자가 올린 그 프레임에 푸시가 먼저 커밋되면 「아직 맨 아래」 로 읽혀 끌려 내려갔다(실사용에서도 가능한 경주).
- **Fix:** 매 커밋 뒤 `scrollHeight` 를 기록하고, 줄 수 증가 시 **삽입 전 거리** = 지금 거리 − 늘어난 높이 로 판정한다.
- **Files modified:** webapp/src/lib/use-stick-to-bottom.ts · __tests__/use-stick-to-bottom.test.tsx(회귀 1건 — 옛 구현이면 실패)
- **Verification:** order-log e2e 연속 3회 green
- **Commit:** f5a3d8b4

**2. [Rule 1 - Bug] 연속 푸시 프레임이 한 렌더로 합쳐지면 앞 프레임 줄이 강조 · 배지에서 빠짐**
- **Found during:** Task 3 (배지 결선 설계 검토)
- **Issue:** 25-01 스토어 `strategyEventsBatch` 는 마지막 삽입 프레임 하나만 든다. 장중 시세 이벤트가 잦아 WS 메시지 둘이 한 렌더로 합쳐지면 앞 프레임 줄이 「새 줄」/배지에서 누락된다.
- **Fix:** `useOrderLogFeed` 가 `strategyEvents` 키 집합 스냅샷을 비교해 새로 나타난 그날 줄을 `latestPush` 로 만든다(마운트 시점 줄은 기준선). batch 는 더 이상 읽지 않는다(스토어 API 무변경).
- **Files modified:** webapp/src/lib/use-order-log-feed.ts · __tests__/use-order-log-feed.test.tsx(회귀 1건)
- **Commit:** f5a3d8b4

**3. [Rule 1 - 시각 결함] 폰 밴드 344 에서 탭 목록이 12px 넘쳐 「전략 로그」 가 접기 토글과 겹침(탭 4개 + 배지)**
- **Found during:** Task 3 (344 실측 — tablist scrollWidth 285 > clientWidth 273)
- **Fix:** 트리거 좌우 패딩 폰 밴드 8px(`@min-[700px]/wb:px-2.5` — 기존 경계 재사용 · 새 숫자 없음) · 접기 토글 6px · TabsList `overflow-x-auto`(카드 탭 규율). 라벨+배지를 한 인라인 span 으로 묶어 트리거 기본 gap(6px)이 끼지 않게 하고 「주문로그 (12)」 공백을 살렸다. 344 에서 두 자리 배지까지 275/277 → 겹침 0이고, 세 자리 배지는 가로 스크롤한다.
- **Files modified:** webapp/src/components/trading/workbench/shared-panels.tsx
- **Commit:** 66880e52

**4. [Rule 3 - Blocking] 관찰자가 켜지면 스텁 게이트웨이 첫 연결이 관찰자 소켓**
- **Found during:** Task 3 (픽스처 설계)
- **Issue:** `gateway.waitForConnection()` 은 `sockets[0]` 을 준다. 관찰자는 relay 부팅 직후 붙으므로 사용자 세션 주입(`pushAccountState` 등)이 관찰자 소켓으로 갈 수 있었다.
- **Fix:** observer 모드에서만 `LoginReq(1)` 를 보낸 소켓을 골라 주입한다(기본 off 경로는 옛 코드 그대로). 같은 이유로 전략 seq 는 픽스처가 스펙 수명 동안 조밀하게 다시 매긴다(relay 기록기 연속성 판정 — 호출자 seq 무시).
- **Files modified:** webapp/e2e/fixtures/relay.ts
- **Commit:** 66880e52

### 해석 · 보강

- **[해석]** 창 분리 상수 3개를 `order-log-feed.ts` 에 두었다(Artifacts 표에 위치 미지정 · 25-10 공유).
- **[보강]** `useOrderLogNameOf` 훅을 export 했다 — 이름 3단 폴백을 카드 탭 · 창 분리가 재사용한다.
- **[보강]** 공용 패널 단위 테스트에 「폰 밴드 접힘 = 가려짐」 케이스를 더했다(R2 의 두 번째 가려짐 조건).
- **[보강]** e2e 에서 픽스처 날짜를 실행일 KST 오늘로 옮긴다(시각 유지) — 피드가 오늘 푸시만 받기 때문. 복원 목도 같은 행을 쓴다.

---

**Total deviations:** 4 auto-fixed (Rule 1 ×3 · Rule 3 ×1) + 해석 1 + 보강 3. **Impact:** 스코프 변화 없음 — 스토어 · shared 계약 무변경. 기존 파일 변경은 공용 패널 탭 줄 패딩뿐이다.

## Issues Encountered

- **trading-workbench e2e 기존 실패 3건** — `5. 격자 …`(카드 머리 `<b>삼성전자</b>` 26px 넘침) · `P20-3 최악값 …`(같은 원인 24px) · `종목 추가 입력이 16px`. 25-07 이 바꾼 세 파일을 `git checkout -- <file>` 로 되돌린 기준선에서도 같은 값으로 실패해 무관함을 확인한 뒤 원복했다. `deferred-items.md` 에 기록했다.
- Playwright webServer `NextFontGoogleFontFileReplacer` 반복 1회 → `rm -rf webapp/.next` 뒤 정상(메모리 규칙 그대로 · 코드 문제 아님).

## Known Stubs

없음. 카드 dense 줄 · 창 분리 페이지는 25-10 범위다(`variant` 가 card/window 스크롤러 높이만 준비됐고 줄 문법은 F-A).

## Threat Flags

없음 — 새 네트워크 표면은 계획된 `GET /api/strategy-events` 소비(T-25-30) · 창 분리 쿼리(T-25-29 화이트리스트 파싱 구현)뿐이다. e2e 관찰자 비밀 · 계좌 · epoch 는 테스트 전용 가짜 값이고, 실서버 리터럴 grep 은 0 이다(T-25-32).

## User Setup Required

없음.

## Next Phase Readiness

- 25-10(카드 탭 · 창 분리)은 `useOrderLogFeedContext()` · `OrderLogList(variant "card" | "window")` · `useOrderLogNameOf` · `parseOrderLogQuery` · `orderLogQueryString` · `ORDER_LOG_WINDOW_*` · `WB_PHONE_BAND_BELOW` 를 그대로 쓰면 된다. 창 분리 페이지는 `OrderLogFeedProvider date={…}` 로 날짜별 피드를 얻는다.
- 원격 DB 에 `dma_strategy_events_for_user` 가 아직 없다(25-11). 배포 전 webapp 을 push 하면 탭은 「오늘 주문로그를 불러오지 못했어요」(실패 줄) + 푸시 줄만 보인다. 배포 순서는 CONTEXT 고정(relay → webapp push)을 따른다.

## Self-Check: PASSED

- FOUND: 신규 14 파일 · 수정 7 파일 (`[ -f ]` 확인)
- FOUND commits: c0ebb36f · 8bc4b16d · 2d4d645c · 6fbcea79 · f5a3d8b4 · 66880e52 (`git rev-list --count 150b648c..HEAD` = 6)
