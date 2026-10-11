---
phase: 28-limitup-feature-ingest
plan: 11
subsystem: ui
tags: [webapp, order-log, kind-15, limit-feature, relay-store, react, playwright]

requires:
  - phase: 28-02
    provides: "server GET /api/strategy-events?lf=1 (기본 조회는 kind 15 제외) · relay 가 kind 15 를 시세 집합으로 푸시"
  - phase: 28-05
    provides: "relay journal.events 로 kind 15 행이 브라우저까지 온다"
  - phase: 28-09
    provides: "조립기 case 15 · tone feature · lead · STRATEGY_LIMIT_FEATURE_ROWS / _BY_NAME / _GOLDEN"
provides:
  - "RelayData.limitFeatureEvents · limitFeatureEventsBatch · MAX_LIMIT_FEATURE_EVENTS 5000 — journal.events kind 15 별도 스토어"
  - "upsertStrategyEvents(prev, incoming, limit = MAX_STRATEGY_EVENTS) — 상한 인자 일반화"
  - "fetchStrategyEvents(date?, { limitFeature }) → ?lf=1 (순서 date → lf)"
  - "TradingPanelsPref.orderLogLimitFeature (세 주문로그 표면 공유 · 기본 꺼짐)"
  - "OrderLogFeed.showLimitFeature · setShowLimitFeature — 켜면 날짜별 lf=1 1회 · kind 15 만 보관 · 라이브와 합침 · latestPush 는 켜진 동안만"
  - "matchesSide('market') = isMarketStrategyEvent(row.kind) (Pitfall 4)"
  - "OrderLogLimitFeatureCheck — 세 표면 공통 체크 칩 · OrderLogFilters props showLimitFeature/onShowLimitFeatureChange"
  - "e2e P28-O1"
affects: [28-12, 28-13, 28-14, 28-15]

actuals:
  tokens: 20500
  tasks: 3
  commits: 3
plan_head_before: 0bf74445fc70d3264adc75c2b4f6f0b45369e75e

tech-stack:
  added: []
  patterns:
    - "보조 이벤트(kind 15)는 주문 이벤트와 다른 스토어 · 다른 상한 · 다른 조회(?lf=1) — 보기 체크가 켜질 때만 목록 · 배지 원천에 합친다"
    - "새 줄 판정(latestPush)은 목록별 기준선을 따로 두고 바뀐 목록만 훑는다 — 체크를 켜는 순간 이미 있던 줄은 새 줄이 아니다"

key-files:
  created: []
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/strategy-events-api.ts
    - webapp/src/lib/trading-layout.ts
    - webapp/src/lib/use-order-log-feed.ts
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/components/trading/order-log/order-log-filters.tsx
    - webapp/src/components/trading/order-log/order-log-panel.tsx
    - webapp/src/components/trading/order-log/order-log-window.tsx
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/card/card-log-popups.tsx
    - webapp/e2e/specs/order-log.spec.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/use-order-log-feed.test.tsx
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-panel.test.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx

key-decisions:
  - "체크 상태 기억은 pref orderLogLimitFeature 하나(UI-SPEC 제안 채택) — 공용 패널과 카드 팝업은 같은 피드라 즉시 같은 값, 창 분리는 마운트 때 같은 localStorage 를 읽는다"
  - "끄면 rows 에서만 뺀다 — 그 날짜 lf=1 캐시는 남겨 같은 날짜 재켜기는 다시 부르지 않는다. 대신 relay ready 전이 때 꺼져 있으면 캐시를 버리고(다음 켜기에 단절 구간까지 새로 받음), 켜져 있으면 kind 15 도 함께 재조회한다(WR-05 와 같은 규율)"
  - "lf=1 응답에서는 kind 15 만 보관한다 — 주문 행의 정본은 기본 복원 한 벌"
  - "켜짐일 때 피드 status 는 lf 조회 상태를 합친다(실패가 이기고, 캐시 전에는 로딩) — 로딩 줄은 기존대로 줄 0 일 때만 보인다"
  - "빈 문구 판정: 체크 켜짐도 '기본값이 아닌 필터' — filtered 에 showLimitFeature 를 더했다(UI-SPEC ②-1)"
  - "카드 팝업 세그먼트 줄에 after 슬롯을 두고 칩을 세그먼트 뒤 · 건수 앞에 넣었다. 줄은 flex-wrap(390 에서 건수가 다음 줄로)"
  - "390 공용 패널 필터줄은 칩 하나가 늘어 두 줄로 넘어간다(필요 432px · 가용 368px) — UI-SPEC ② E2 의 flex-wrap 허용대로 두고, P27-O1 의 390 「한 줄」 잣대를 select 칩 3개로 좁혔다"

patterns-established:
  - "보조 로그 줄은 '보기 체크' 로만 목록 · 배지에 들어온다 — 체크가 꺼져 있으면 스토어에 있어도 소비자에게 없다"

requirements-completed: [D-07, D-18]

coverage:
  - id: D1
    description: "relay journal.events 의 kind 15 가 strategyEvents(5000)를 밀어내지 않고 limitFeatureEvents(5000)로 간다 · batch 도 갈린다 · reset 이 비운다"
    requirement: D-18
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#journal.events kind 15 별도 스토어 (Phase 28 D-18 · Pitfall 3) > strategyEvents 4,999 행 + kind 15 1,000 행 → 주문 이벤트가 하나도 버려지지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#journal.events kind 15 별도 스토어 (Phase 28 D-18 · Pitfall 3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "fetchStrategyEvents lf 쿼리 · pref orderLogLimitFeature 파서 · 피드 체크(기본 꺼짐 · 켜면 lf=1 1회 · 합치기 · 캐시 · 실패/다시 시도 · 과거일 · latestPush 켜짐일 때만)"
    requirement: D-18
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-order-log-feed.test.tsx#useOrderLogFeed — 상한가 특징 체크 (D-18 · D-07)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-order-log-feed.test.tsx#fetchStrategyEvents — lf 쿼리 (D-18)"
        status: pass
    human_judgment: false
  - id: D3
    description: "matchesSide/matchesKind 시세 = kind — kind 15 는 전체 · 시세에만 있고 매수 · 매도 · 자동매도 · 그 밖 구분에는 없다"
    requirement: D-07
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts#Phase 28 kind 15 상한가 특징 — 시세 = kind (D-07 · Pitfall 4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "「상한가 특징」 체크 칩 — 세 표면 같은 컴포넌트 · 자리(구분 뒤 · N건 앞) · Accent 자리 1 · 빈 문구 판정 · 카드 팝업 칩/세그먼트/배지"
    requirement: D-07
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx#Phase 28 「상한가 특징」 체크 칩 (D-07 · UI-SPEC ②-1)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-panel.test.tsx#OrderLogPanel — 「상한가 특징」 체크 (Phase 28 D-07 · UI-SPEC ②-1)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#「상한가 특징」 체크 칩(28-11 · D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "브라우저 종단 — 관찰자 저널 kind 15 → relay → 기본 숨김 · 배지 미가산 → 칩 → lf=1 1회 · 골든 6줄 · lead --up · 시세 유지 · 선매수/매수 제외 · 새로고침 pref 유지"
    requirement: D-07
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts#P28-O1 상한가 특징 체크 — 기본 숨김 · 켜면 전체/시세에 분당 줄"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts (13 passed — P25 · P27 회귀 없음)"
        status: pass
    human_judgment: false
  - id: D6
    description: "켜진 주문로그에서 kind 15 줄이 주문 줄보다 한 단계 옅게 읽히는지 · 390 필터줄 두 줄 넘김이 거슬리지 않는지"
    verification:
      - kind: automated_ui
        ref: "playwright:p28-o1-limit-feature-on-1280.png · lq5-orderlog-390-light.png"
        status: pass
    human_judgment: true
    rationale: "색 대비 · 줄 넘김 체감은 시각 판단 — 스크린샷은 남겼고 판단은 UAT 에서 사람이 한다"

duration: 16min
completed: 2026-10-05
status: complete
---

# Phase 28 Plan 11: 주문로그 「상한가 특징」 체크 Summary

**kind 15 를 relay 별도 스토어(`limitFeatureEvents` · 5000)와 `?lf=1` 조회로 떼어 주문 이벤트가 밀리지 않게 하고, 세 주문로그 표면에 같은 「상한가 특징」 체크 칩을 달아 켤 때만 「전체」·「시세」 에 분당 줄이 섞이게 했다(배지도 켜짐일 때만 가산)**

## Performance

- **Duration:** 약 16분
- **Started:** 2026-10-05T10:26:57Z
- **Completed:** 2026-10-05T10:42:29Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- relay 리듀서가 `journal.events` 를 kind 로 가른다. kind 15 는 `limitFeatureEvents`(상한 `MAX_LIMIT_FEATURE_EVENTS` 5000)로 간다. 주문 쪽 `strategyEvents` · `strategyEventsBatch` 에는 kind 15 가 들어가지 않는다. 삽입이 없는 쪽은 참조를 바꾸지 않는다.
- `fetchStrategyEvents(date?, { limitFeature })` 가 `?lf=1` 을 붙인다(순서 date → lf). pref 에 `orderLogLimitFeature` 를 더했다.
- 피드 `showLimitFeature`: 켜면 그 날짜의 `?lf=1` 을 한 번 부르고 kind 15 만 보관한다. 오늘이면 라이브 `limitFeatureEvents` 와 합친다. 같은 날짜를 다시 켜면 캐시를 쓴다. 끄면 rows 에서 빠진다. 배지와 새 줄 강조의 원천인 `latestPush` 에는 켜진 동안 도착한 kind 15 만 들어간다.
- 카드 팝업 「시세」 세그먼트는 tone 이 아니라 kind 로 판정한다(Pitfall 4). 28-09 가 넘긴 갭을 닫았다.
- `OrderLogLimitFeatureCheck` 는 네이티브 체크박스를 감싼 칩이다. 기본 꺼짐, 켜짐이면 Accent 자리 1, 체크 색은 `--primary`, 화살표는 없다. 공용 패널 · 창 분리 · 카드 주문로그 팝업이 같은 컴포넌트를 쓴다.
- e2e P28-O1 이 실제 relay 경로로 위 동작 전부를 확인한다.

## Task Commits

1. **Task 1: 데이터 — kind 15 별도 스토어 · lf 조회 · pref · 피드 체크 · 시세 = kind** — `22bfd866` (feat)
2. **Task 2: UI — 「상한가 특징」 체크 칩 세 표면 · 빈 문구 · 카드 팝업 · 배지** — `4c865a34` (feat)
3. **Task 3: e2e P28-O1** — `9ecb3362` (test)

## 스토어 분리 테스트 이름

- `relay-socket.test.ts` › `journal.events kind 15 별도 스토어 (Phase 28 D-18 · Pitfall 3)`
  - `kind 15 두 행 + 주문 한 행 → strategyEvents 에 주문 행만 · limitFeatureEvents 에 kind 15 두 행 · 각 batch 도 갈린다`
  - `kind 15 만 온 프레임은 strategyEvents · strategyEventsBatch 참조를 바꾸지 않는다(반대도 같다)`
  - **`strategyEvents 4,999 행 + kind 15 1,000 행 → 주문 이벤트가 하나도 버려지지 않는다`**
  - `limitFeatureEvents 상한 5000 — 넘으면 오래된 것부터 버린다`
  - `로그아웃(reset) 뒤 limitFeatureEvents · batch 도 비워진다`

## e2e 결과

- `P28-O1 상한가 특징 체크 — 기본 숨김 · 켜면 전체/시세에 분당 줄` 통과(1280).
  - (a) 기본 꺼짐이면 kind 15 줄이 0개이고 lf=1 요청도 없다. kind 15 1행과 주문 1행을 라이브로 밀면 카드 배지는 「1」 이다(주문만 센다).
  - (b) 칩을 누르면 lf=1 요청이 정확히 1회 간다. kind 15 6줄(복원 5 + 라이브 1)이 골든 `STRATEGY_LIMIT_FEATURE_GOLDEN` 과 일치한다. 「잠김 43초」 lead 의 계산 색은 `--up` 과 같다. 켠 뒤 온 kind 15 푸시는 배지를 「2」 로 올리고, 이 푸시로 재조회는 일어나지 않는다.
  - (c) 구분 「시세」 에서는 kind 15 가 남고, 「선매수」 에서는 0개다. 카드 팝업도 같은 칩(켜짐)을 보여 주고, 「시세」 에서는 남고 「매수」 에서는 0개다.
  - (d) 새로고침 뒤에도 칩이 켜져 있다(pref). 이번 실행에서 lf=1 요청은 2회였다. 마운트 1회와, 마운트 때 relay 가 아직 ready 가 아니어서 생긴 첫 ready 1회(WR-05)다. 그래서 단언을 1~2 범위로 잡았다(P25-1 과 같은 잣대).
- `order-log.spec.ts` 전체 **13 passed**(P25-1~9 · P25-7b · P27-O1 · P28-O1).
- 스크린샷: `p28-o1-limit-feature-on-1280.png`(칩 켜짐 · kind 15 섞인 공용 패널).

## Files Created/Modified

- `webapp/src/lib/use-relay-socket.ts`: `MAX_LIMIT_FEATURE_EVENTS`, `limitFeatureEvents` · `limitFeatureEventsBatch` 를 더했다. 리듀서가 kind 로 가르고, `upsertStrategyEvents` 는 상한을 인자로 받는다.
- `webapp/src/lib/relay-provider.tsx`: `EMPTY_RELAY_VALUE` 에 두 필드를 더했다.
- `webapp/src/lib/strategy-events-api.ts`: `opts.limitFeature` → `?lf=1`, 머리 주석 ④.
- `webapp/src/lib/trading-layout.ts`: `orderLogLimitFeature` 와 그 파서 줄.
- `webapp/src/lib/use-order-log-feed.ts`: `showLimitFeature` · `setShowLimitFeature`, lf 조회 · 캐시 · 합치기, 목록별 새 줄 기준선, 머리 주석 ⑥.
- `webapp/src/lib/order-log-feed.ts`: `matchesSide('market')` 를 kind 판정으로 바꿨다.
- `webapp/src/components/trading/order-log/order-log-filters.tsx`: `OrderLogLimitFeatureCheck` 를 추가하고 「구분」 뒤에 놓았다.
- `webapp/src/components/trading/order-log/order-log-panel.tsx` · `order-log-window.tsx`: 피드에 연결했다. `filtered` 에 체크를 넣었고, resetKey 에도 체크를 넣었다.
- `webapp/src/components/trading/order-log/order-log-list.tsx`: `filteredEmpty` 주석만 바꿨다.
- `webapp/src/components/trading/card/card-log-popups.tsx`: `LogSegments` 에 `after` 슬롯을 두고 칩을 넣었다. 줄은 flex-wrap 이고 resetKey 에 체크를 넣었다.
- `webapp/e2e/specs/order-log.spec.ts`: 머리 ⑥ 과 P28-O1 을 더했고, P27-O1 의 390 잣대를 고쳤다.
- 테스트: `relay-socket` · `use-order-log-feed` · `order-log-feed` · `order-log-filters` · `order-log-panel` · `card-tabs`.

## Decisions Made

- pref 기억을 채택했다(UI-SPEC 제안). 세 표면이 같은 값을 쓴다.
- 끄면 화면에서만 빼고 lf 캐시는 둔다. relay 가 다시 연결될 때 체크가 꺼져 있으면 캐시를 버린다. 켜져 있으면 kind 15 도 다시 조회한다.
- lf=1 응답에서는 kind 15 만 보관한다.
- 켜짐일 때 피드 status 에 lf 조회 상태를 합친다.
- 390 필터줄이 두 줄로 넘어가는 것은 UI-SPEC 이 허용한 그대로 둔다(아래 편차 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `card-tabs.test.tsx` 의 `OrderLogFeed` 리터럴에 새 필드 추가**
- **Found during:** Task 1
- **Issue:** `OrderLogFeed` 에 필수 필드가 생겨 typecheck 가 실패했다. 이 파일은 플랜 files 목록에 없다.
- **Fix:** 리터럴에 `showLimitFeature: false` 와 `setShowLimitFeature: vi.fn()` 을 넣었다. Task 2 에서는 같은 파일에 카드 팝업 칩 테스트 2건을 더했다. 플랜 ⑤ 가 「기존 카드 팝업 테스트 파일이 있으면 거기」 라고 했기 때문이다.
- **Committed in:** `22bfd866`, `4c865a34`

**2. [Rule 1 - 회귀] P27-O1 의 390 「칩 줄 한 줄」 단언이 새 칩 때문에 깨짐**
- **Found during:** Task 2 뒤 e2e 확인
- **Issue:** 390 공용 패널 필터줄에서 가용 폭은 368px 인데, 칩 셋 · 체크 · N건 · 창 분리를 한 줄에 놓으려면 약 432px 가 필요하다. 그래서 두 줄로 넘어간다(측정: 체크 칩까지 1줄, N건 · 창 분리가 2줄). UI-SPEC ② E2 는 「필터줄 `flex-wrap` 으로 줄 넘김」 을 허용한다.
- **Fix:** P27-O1 의 390 잣대를 그 원래 뜻대로 좁혔다. 「자동매도」 값이 select 칩 셋을 깨지 않는지만 본다. 가로 넘침 0 단언은 그대로 둔다. 1280 은 계속 전체가 한 줄이다. 카드 팝업 세그먼트 줄도 같은 이유로 `flex-wrap` 을 줬다(390 에서 건수가 다음 줄로 내려간다 · P27-O1 넘침 0 통과).
- **Files modified:** `webapp/e2e/specs/order-log.spec.ts`, `webapp/src/components/trading/card/card-log-popups.tsx`
- **Committed in:** `4c865a34`, `9ecb3362`

**3. [Rule 2 - Verification] 빈 문구 판정 테스트를 `order-log-panel.test.tsx` 에 둠**
- **Found during:** Task 2
- **Issue:** 플랜은 `order-log-list.test.tsx` 에 빈 문구 테스트 둘을 두라고 했다. 그런데 판정 로직은 호출부(패널 · 창)의 `filtered` 에 있고, 리스트는 prop 을 받아 그리기만 한다. 리스트의 두 문구는 기존 테스트가 이미 잠그고 있다.
- **Fix:** 판정이 실제로 일어나는 패널 테스트에 3건을 두었다(꺼짐 기본 0줄 → 기본 문구 · 켜짐 + 필터 0 → 「조건에 맞는 로그가 없어요」 · 칩 토글).
- **Committed in:** `4c865a34`

---

**Total deviations:** 3건 자동 처리(Rule 3 1 · Rule 1 1 · Rule 2 1). **Impact:** 테스트 위치와 기존 e2e 잣대를 맞춘 것이다. 범위는 늘지 않았다.

## TDD 메모

- Task 1: `order-log-feed` 의 시세 = kind 단언은 RED(1 failed)를 확인한 뒤 GREEN 이 됐다. 피드 · api · pref 테스트도 RED(9 failed)를 확인한 뒤 GREEN 이 됐다. relay 스토어 분리 테스트는 리듀서를 먼저 고친 뒤에 썼기 때문에 RED 를 따로 보지 못했다. 다만 「4,999 + 1,000」 단언은 옛 코드라면 999건을 버리므로 회귀를 잡는 단언이다.
- Task 2: 컴포넌트를 먼저 쓰고 테스트를 붙였다(RED 미확인).
- 커밋은 플랜 Output 대로 태스크당 1개다(28-01~10 선례).

## Verification

- webapp typecheck(tsc + e2e tsconfig) OK
- webapp 단위 테스트 전체 **3393 passed / 1 skipped**(142 files)
- `order-log.spec.ts` 전체 **13 passed**
- 수용 기준 grep 전부 1 이상(Task 1: 1·2·4·1·3 / Task 2: 1·1·2·3·3·1 / Task 3: 3·3·9)
- 스키마 푸시 없음(서버 `?lf=1` 은 28-02 · 원격 적용은 28-14)

## Issues Encountered

- 새로고침 직후 lf=1 요청이 2회였다(마운트 + 첫 ready). 기본 조회와 같은 WR-05 규율이라 의도된 동작이다.
- e2e 에서 라이브로 받은 행 일부는 종목명 칸에 ISIN 이 보인다(`wire()` 가 `stockCode` 를 지운다). P25 줄에도 있던 기존 폴백이고 이 플랜과는 관계없다.

## Known Stubs

없음.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 28-02 의 「relay 재배포 전에 kind 15 가 5000행 `strategyEvents` 에 들어가면 안 된다」 는 조건을 웹 쪽에서 충족했다. 이제 relay 를 배포하면(28-14) kind 15 가 웹 기본 목록을 밀어내지 않는다.
- 배포 순서(relay 먼저 → push)는 28-14/15 메인 세션 몫이다.

## Self-Check: PASSED

- 수정 파일 18개 존재 · 커밋 22bfd866 · 4c865a34 · 9ecb3362 존재 확인
