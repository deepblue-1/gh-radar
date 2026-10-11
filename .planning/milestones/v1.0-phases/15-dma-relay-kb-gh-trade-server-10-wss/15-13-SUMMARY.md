---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 13
subsystem: webapp-orderbook
tags: [ui, orderbook, accessibility, realtime, roving-tabindex, css-breakpoints]

# Dependency graph
requires:
  - phase: 15-12
    provides: "useRelaySocket(quote/tape/isStale/status/reconnect) + RelayStatusBar + OrderbookSkeleton"
  - phase: 15-11
    provides: "종목상세 4탭 셸 — `호가주문` 탭 패널의 placeholder 자리(교체 대상)"
  - phase: 15-10
    provides: "GET /api/stocks/:code 의 `isin` + shared `StockDetailResponse` 타입"
  - phase: 15-01
    provides: "packages/shared RelayQuote / RelayTapeEntry 계약"
provides:
  - "OrderbookLadder — 호가 10단(중앙 가격 1열) · 단계 최대 정규화 잔량 바 · roving tabindex · 플래시 규율"
  - "TradeTape — 최신 상단 prepend · 스크롤 핀 · 링버퍼 200 · 배치 1회 플래시 · 매수/매도 추정"
  - "StockOrderbookSection — 헤더/상태 바/본문 4분기(게이트·스켈레톤·에러·그리드) + L1=B 2축 / M1 세로 순서"
  - "webapp fetchStockDetail 의 응답 계약이 StockDetailResponse (isin 이 웹앱까지 흐른다)"
  - "deriveTapeSides / formatTapeTime — 체결 구분 추정과 시각 절삭의 단일 정본(테스트로 고정)"
affects:
  - "15-18 주문 패널·계좌 패널 — 우측 컬럼 자리표시자 3개(orderbook-order-panel-slot / -holdings-slot / -unfilled-slot)를 교체한다"
  - "15-14 E2E — `stock-orderbook-section` testid 로 진입. e2e 픽스처 isin 채우기가 남아 있다"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "뷰포트 분기는 CSS 만 — `display: contents` 로 우측 컬럼을 풀어 좁은 폭 순서를 만든다(JS 측정 0)"
    - "플래시는 큐잉하지 않는다 — 진행 타이머를 끊고 최신 변경분만 남긴다(초당 10회 갱신에서 밀리지 않게)"
    - "폭 변화는 인라인 style 즉시 반영, 전환 효과는 background-color 에만"
    - "감속 선호는 `motion-safe:` 로 효과 자체를 걸어 끈다(끄는 게 아니라 안 켠다)"
    - "서버가 주지 않는 파생값(체결 구분)은 추정 규칙을 순수함수로 분리하고 화면에 추정임을 밝힌다"
    - "roving tabindex — 표 전체가 tab stop 1개, ↑/↓ 이동 + Enter/Space 실행"

key-files:
  created:
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/trade-tape.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder.test.tsx
    - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
  modified:
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/lib/stock-api.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/__tests__/fixtures/stocks.ts
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
    - webapp/e2e/specs/stock-detail-tabs.spec.ts
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

key-decisions:
  - "잔량 바를 `<td>` 안 절대배치 레이어로 두고 폭만 인라인 style 로 즉시 바꾼다 — transition 을 걸면 100ms 갱신에서 항상 뒤처져 '벽'의 위치가 실제와 어긋난다"
  - "매도잔량 좌측 / 매수잔량 우측 정렬 — UI-SPEC §Typography 의 '숫자는 우측 정렬' 일반 규칙보다 채택 목업의 대칭 배치를 따랐다. 바가 중앙 가격 축을 향해 자라야 '어느 쪽 벽인지'를 한 번에 읽는다"
  - "체결 구분(매수/매도)을 최우선호가 → 틱 규칙 → zero-tick 상속으로 추정하고 **추정임을 화면에 밝혔다** — 게이트웨이 `TradeTapeEntry` 에 방향 플래그가 없다. 서버가 주지 않은 값을 확정 사실로 그리면 그게 곧 오주문 유발이다"
  - "우측 컬럼을 `display: contents` 로 감쌌다 — M1 은 체결 테이프가 주문과 잔고 **사이**에 오는데, 래퍼 div 를 두면 order 로 그 순서를 만들 수 없다. contents 는 좁은 폭에서 자식을 그리드 아이템으로 승격시킨다"
  - "`depth` 는 '좁은 폭 기본 단수' 로 해석하고 접힘을 CSS(`max-[899px]:hidden`)로 구현했다 — JS 뷰포트 측정 금지 규칙과 prop 시그니처를 동시에 지키는 유일한 해법"
  - "복구 불가 상태(`failed`/`manual_required`/`session_rejected`) + **호가가 없을 때만** 에러 카드로 본문을 대체한다 — 값이 있으면 stale 로 유지한다(빈 화면 복귀 금지)"
  - "`isin` 을 빈 문자열·undefined 까지 null 로 정규화 — 필드가 빠진 응답에서 `undefined !== null` 이라 게이트를 통과한 뒤 `enabled:false` 로 연결도 안 해 스켈레톤에 영구히 갇힌다"

patterns-established:
  - "고밀도 실시간 표면의 테스트는 '보기'가 아니라 '오주문으로 이어지는 규칙'을 잠근다 — 클릭이 무엇을 전달하는지, 색 없이 구분되는지, stale 에서 비워지는지"
  - "누적 vs 단계-최대 정규화처럼 뒤바뀌면 의미가 반대가 되는 계산은 반례(`not.toBe('100%')`)까지 단언한다"

requirements-completed: [RELAY-01]

# Metrics
duration: 42min
completed: 2026-09-06
tasks: 3
commits: 4
---

# Phase 15 Plan 13: 호가 사다리 · 체결 테이프 · 섹션 셸 Summary

**호가주문 탭의 시장 관찰 축을 완성했다 — 중앙 가격 1열 10단 사다리(단계 최대 정규화 잔량 바 · roving tabindex), 200ms 배치 프리펜드 체결 테이프(스크롤 핀 · 링버퍼 200), 그리고 이 둘과 상태 바를 담고 권한 없음 게이트로 본문을 갈아끼우는 섹션 셸. 15-11 이 남긴 placeholder 는 사라졌고 웹앱 테스트는 42 files / 336 passed 로 회귀 0.**

## Performance

- **Duration:** 약 42분
- **Tasks:** 3 (+ 테스트 커밋 1)
- **Files created:** 5 / **modified:** 7
- **Commits:** 4

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `webapp/src/components/orderbook/orderbook-ladder.tsx` | 호가 10단 — 매도 10→1 / 스프레드 / 매수 1→10 / 총잔량 `tfoot`. 가격 열 중앙 정렬 `<th scope="row">`, 좌우 잔량 열의 바가 가격 축을 향해 자란다 |
| `webapp/src/components/orderbook/trade-tape.tsx` | 체결 테이프 — 시각·체결가·수량·구분 4열, 최신 상단, 스크롤 핀, 링버퍼 200, 구분 추정 순수함수 2개 export |
| `webapp/src/components/stock/stock-orderbook-section.tsx` | 섹션 셸 — 헤더(실시간가 20px + 출처 라벨 + 기준/상한/하한/VI + 거래소 토글) · 전폭 상태 바 · 본문 4분기 · L1=B 그리드 |
| `orderbook-ladder.test.tsx` / `trade-tape.test.tsx` | 계약 테스트 17건 |
| `stock-detail-client.tsx` | `orderbook={<StockOrderbookPlaceholder />}` → `<StockOrderbookSection …/>` |
| `stock-api.ts` | `fetchStockDetail` 응답 계약을 `StockDetailResponse` 로 좁혀 `isin` 을 웹앱까지 흘림 |

## must_haves 이행

| 계약 | 이행 |
|------|------|
| SC-7 / D-04 호가 10단(중앙 가격 1열) + 체결 테이프 + KRX/NXT 토글 | 사다리 20행 + 스프레드 + 총잔량, 테이프 4열, `aria-label="거래소 선택"` ToggleGroup. 테스트 ① 이 20행 + 단계 라벨을 단언 |
| SC-7 / D-02a ≥900px 2축 · <900px M1 세로 순서 | 그리드 `min-[900px]:grid-cols-[380px_220px_minmax(360px,1fr)] gap-px`, 우측 컬럼 `contents` + `order-2/4/5`. **JS 뷰포트 측정 0** |
| SC-7 / D-12 `dma_credentials` 미매핑 → 게이트 카드가 본문 대체, 섹션 숨김 금지 | `unauthorized`/`isin` 없음 → C13 카드. `grep -c 'return null'` = **0**. 단위 테스트 2e 가 섹션 존재 + 게이트 + **행동 버튼 0** 을 단언 |
| SC-7 가격 클릭이 주문 가격으로, 매수/매도 자동 전환 금지 | `onPriceClick(price)` 만 호출하고 `selectedPrice` 에 보관. 테스트 ② 가 "1회 호출 · 그 가격 하나" 를 단언 |
| SC-7 재접속 중 사다리·테이프 유지 + `opacity:.55` | `isStale` → `data-stale="true"` + `opacity-[.55]`, 값 그대로. 사다리 테스트 ⑤ · 테이프 테스트 ⑥ |

## acceptance_criteria 실측

| 검사 | 요구 | 실측 |
|------|------|------|
| `grep -c 'data-density="compact"' orderbook-ladder.tsx` | ≥1 | **4** |
| `grep -cE '\-\-primary' orderbook-ladder.tsx` | 0 | **0** |
| `grep -c 'sr-only' orderbook-ladder.tsx` | ≥1 | **2** |
| `grep -c 'scope="row"' orderbook-ladder.tsx` | ≥1 | **2** |
| `grep -c 'tabIndex' / 'ArrowDown\|ArrowUp'` | ≥1 / ≥2 | **1 / 2** |
| `grep -c '호가 정보가 없어요'` | ==1 | **1** |
| `grep -cE 'transition[^;]*width'` | 0 | **0** |
| `grep -c 'prefers-reduced-motion\|motion-reduce'` | ≥1 | **3** |
| `grep -c '새 체결' / '▲ 매수' / '▼ 매도' (trade-tape)` | ≥1 각 | **2 / 2 / 2** |
| `grep -c '아직 체결이 없어요'` | ==1 | **1** |
| `grep -c '200' / 'scrollTop' (trade-tape)` | ≥1 / ≥2 | **5 / 5** |
| `grep -c '실시간 호가·주문 권한이 없어요' (section)` | ==1 | **1** |
| `grep -c '이 종목의 차트·뉴스·종목토론방은…'` | ==1 | **1** |
| `grep -c 'return null' (section)` | 0 | **0** |
| `grep -c '380px 220px' (section)` | ≥1 | **1** |
| `grep -c '실시간(DMA)' (section)` | ≥1 | **2** |
| `grep -c '이 종목은 NXT 호가가 없어요'` | ==1 | **1** |
| `grep -c 'orderbook-account-column'` | ≥1 | **1** |
| `grep -c 'stock-orderbook-placeholder' (detail-client)` | 0 | **0** |
| `git diff --stat webapp/src/components/stock/stock-hero.tsx` | 출력 없음 | **없음** |
| `git diff --name-only webapp/package.json` | 출력 없음 | **없음 (신규 npm 의존성 0)** |

## 검증 결과

| 검증 | 결과 |
|------|------|
| `pnpm --filter webapp run typecheck` | exit 0 |
| `pnpm --filter webapp run build` | exit 0 (`/stocks/[code]` 21.5 kB → **30.5 kB**) |
| `pnpm --filter webapp test` | 42 files / **336 passed**, 1 skipped — 회귀 0 (15-12 기준 40/318) |
| `pnpm --filter webapp test orderbook-ladder trade-tape` | **17 passed** |
| `pnpm --filter webapp run lint` | 신규 파일 경고 0 (선재 `theme-detail-client.tsx` 미사용 import 경고 1건만 잔존) |

## 위협 대응 (threat register)

| Threat | 대응 | 증명 |
|--------|------|------|
| T-15-14 가격 클릭 오주문 | 클릭·Enter 모두 `onPriceClick(price)` 만 호출. 제출·구분 전환 없음 | 사다리 테스트 ② |
| T-15-40 종목 전환 stale | `code`/`isin` 변경 시 거래소·`selectedPrice`·전환 표식 리셋. 사유를 코드 주석에 박제 | `useEffect([code, isin])` |
| T-15-21 권한 게이트 | `unauthorized` 또는 구독 키 없음 → 본문을 게이트로 교체, 구독·주문 진입점 미렌더 | 단위 테스트 2e |
| T-15-44 색 비의존 | `▲ 매수`/`▼ 매도` 병기 + 사다리 열 위치 + `sr-only` 단계 라벨 + 시맨틱 `<table>` | 사다리 ① · 테이프 ③ |
| T-15-45 렌더 성능 | 플래시 큐잉 금지(타이머 즉시 종료) · 바 폭 transition 0 · 테이프 배치 1회 · 링버퍼 200 · `motion-safe:` | `grep 'transition[^;]*width'` = 0, 테이프 ⑤ |
| T-15-43 이중 가격 오독 | 20px 실시간가 + `실시간(DMA) · 체결 HH:MM:SS` 상시 라벨. 히어로 무변경 | `git diff stock-hero.tsx` 0줄, 단위 2d |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `fetchStockDetail` 이 `isin` 을 타입에 담지 않아 섹션에 넘길 값이 없었다**
- **발견:** Task 3
- **문제:** plan 은 "`isin` 은 15-10 이 `/api/stocks/:code` 에 추가한 필드에서 온다"고 했으나, webapp 의 `fetchStockDetail` 은 여전히 `Promise<Stock>` 이었다. `Stock` 에는 `isin` 이 없어 컴파일 자체가 불가능했다.
- **조치:** 15-10 이 이 목적으로 export 해 둔 `StockDetailResponse`(= `Stock` + `upperLimitProximity` + `isin`)로 반환 타입을 좁히고, `StockDetailClient` 의 state 타입도 함께 좁혔다. 단위 픽스처(`webapp/src/__tests__/fixtures/stocks.ts`)에 두 필드를 채웠다(`FIXTURE_SAMSUNG.isin = 'KR7005930003'`, `FIXTURE_NULL_PRICE.isin = null`). `StockDetailResponse` 는 `Stock` 의 상위집합이라 `StockHero`·`StockStatsGrid` 등 기존 소비자는 무변경이다.
- **Files:** `webapp/src/lib/stock-api.ts`, `webapp/src/components/stock/stock-detail-client.tsx`, `webapp/src/__tests__/fixtures/stocks.ts`
- **Committed in:** `d245e1b`

**2. [Rule 1 - Bug] `useRelaySocket` 의 `open()` 예외가 unhandled rejection 이 되고 화면은 영구 로딩**
- **발견:** Task 3 검증 (전체 테스트 실행 중 unhandled rejection)
- **문제:** `void open()` 이 catch 없이 호출된다. `createClient()`(Supabase env 오설정)나 `auth.getSession()` 이 던지면 상태가 `connecting` 에 멈춘 채 사용자에게 아무 이유도 알리지 않고, Node/브라우저에는 unhandled rejection 이 남는다. 15-13 이 섹션을 실제 페이지에 마운트하면서 표면화됐다.
- **조치:** `openSafely()` 래퍼를 두고 rejection 을 `failed` + 메시지로 표면화(상태 바가 문구를 그린다). 두 호출 지점(최초·백오프 재시도) 모두 교체.
- **Files:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** 전체 테스트에서 unhandled rejection 0
- **Committed in:** `d245e1b`

**3. [Rule 2 - Missing Critical] 체결 구분(매수/매도)의 출처가 계약에 없다 — 추정 규칙 + 고지 추가**
- **발견:** Task 2
- **문제:** plan 과 UI-SPEC 은 테이프에 `▲ 매수`/`▼ 매도` 를 요구하지만, `RelayTapeEntry`(t/p/cs/c/q/cv)에는 방향 플래그가 없다(`cs` 는 **전일대비**구분이지 매수/매도가 아니다). 목업은 합성 데이터의 `r[3]` 를 썼다. 값을 지어내 확정 사실처럼 그리면 그 자체가 오주문 유발이다.
- **조치:** ① `deriveTapeSides()` 순수함수로 추정 규칙을 분리(최우선호가 비교 → 직전 체결가 틱 규칙 → zero-tick 은 직전 판정 상속). ② 근거 데이터를 얻도록 선택 prop `bestAsk`/`bestBid` 를 추가하고 섹션이 `quote.ap[0]`/`quote.bp[0]` 를 넘긴다. ③ 표 하단에 11px 마이크로 라벨 `구분은 최우선호가·직전 체결가 기준 추정이에요` 를 상시 노출.
- **왜 마이크로 라벨인가:** UI-SPEC §Typography 가 마이크로 라벨(11px)을 스케일 밖 예외로 이미 허용한다. 중립색이라 §Color 금지 목록에도 걸리지 않는다.
- **Files:** `webapp/src/components/orderbook/trade-tape.tsx`
- **Verification:** 테이프 테스트 ①②⑧
- **Committed in:** `a946599`

**4. [Rule 2 - Missing Critical] `isin` 정규화 — 필드가 빠진 응답에서 스켈레톤 영구 정지**
- **발견:** Task 3 (E2E 픽스처가 `isin` 을 주지 않는다는 사실을 확인하면서)
- **문제:** 게이트 조건을 `isin === null` 로만 쓰면 `undefined`(필드 부재)는 게이트를 통과하는데, 훅에는 `enabled: Boolean(undefined)` = false 로 들어가 연결도 하지 않는다. 결과는 `status: 'idle'` + `quote: null` → **스켈레톤에서 영원히 멈춤**.
- **조치:** `subscriptionIsin = isin != null && isin.length > 0 ? isin : null` 로 정규화하고 게이트·훅 입력 모두 이 값으로 통일. "구독 키가 없다" 는 사실 하나로 판정이 모인다.
- **Files:** `webapp/src/components/stock/stock-orderbook-section.tsx`
- **Committed in:** `d245e1b`

**5. [Rule 1 - Bug] placeholder 제거로 깨진 기존 테스트 갱신**
- `stock-detail-client.test.tsx` Test 2d 가 `stock-orderbook-placeholder` testid 를 단언했다. `stock-orderbook-section` 단언으로 교체하고, jsdom 에 Supabase env 가 없어 실제 `createClient()` 가 던지므로 **세션 없는 클라이언트로 mock** 해 결정론적으로 `unauthorized` 경로를 태웠다. 게이트 검증 케이스(2e)를 추가했다.
- `e2e/specs/stock-detail-tabs.spec.ts` 5번 케이스도 같은 이유로 `stock-orderbook-section` 단언으로 교체(E2E 실행은 15-14 소관이라 단언만 정합화).
- **Committed in:** `d245e1b`

### 계획 대비 확장한 인터페이스 (plan 시그니처 초과)

| 대상 | plan | 실제 | 이유 |
|------|------|------|------|
| `StockOrderbookSection` props | `{ code, isin, basePrice }` | `+ name, upperLimit, lowerLimit` | plan 의 `<action>` 이 헤더에 "종목명·코드 + 기준/상한/하한/VI" 를 요구하는데 3개 prop 으로는 종목명·상한·하한을 만들 수 없다. 전부 이미 fetch 한 `Stock` 에서 온다(신규 호출 0) |
| `TradeTape` props | `{ entries, isStale, basePrice }` | `+ bestAsk?, bestBid?` | 위 Deviation 3 — 구분 추정의 1차 근거. 선택 prop 이라 없어도 틱 규칙으로 동작한다 |

### 계획과 다르게 해석한 지점

- **`depth` prop 과 "CSS 로만 브레이크포인트" 의 충돌.** plan 은 `depth: 5 | 10` prop 을 주면서 동시에 "JS 뷰포트 측정 금지" 를 요구한다. `depth` 를 "좁은 폭 기본 단수" 로 해석하고, 사다리는 **항상 20행을 렌더**하되 6~10단에 `max-[899px]:hidden` 을 붙여 CSS 가 접게 했다. `10단 전체 보기` 버튼도 `max-[899px]:block` 이라 데스크톱에는 존재하지 않는다. 섹션은 `depth={5}` 를 넘긴다.
- **`10단 전체 보기` 는 단방향.** 펼친 뒤 되접는 버튼(`5단만 보기`)은 만들지 않았다 — UI-SPEC Copywriting 에 없는 문구를 새로 만들지 않기 위해서다.

**Total deviations:** 5 auto-fixed (Rule 1×2, Rule 2×2, Rule 3×1) + 인터페이스 확장 2건. 새 npm 의존성 0, 새 외부 표면 0.

## Known Stubs

| 위치 | 내용 | 해소 |
|------|------|------|
| `orderbook-order-panel-slot` | `주문 패널은 준비 중이에요` — 선택한 가격이 있으면 그 값을 함께 보여준다 | **15-18** |
| `orderbook-holdings-slot` | `잔고는 준비 중이에요` | **15-18** |
| `orderbook-unfilled-slot` | `미체결은 준비 중이에요` | **15-18** |

셋 다 의도된 stub 이다 — plan 이 "우측 컬럼에 자리만 잡는다(주문·계좌 축은 D-25 게이트 뒤 15-18)"고 명시했다. `selectedPrice` 는 이미 셸이 보관하고 있어 15-18 은 소비만 하면 된다.

## Threat Flags

없음. 이 plan 은 네트워크 엔드포인트·인증 경로·파일 접근·스키마를 새로 만들지 않았다. 유일한 새 데이터 흐름은 기존 wss 훅 상태 → DOM 렌더이며, `threat_model` 이 이미 다룬 범위다.

## Issues Encountered

- **워크트리에 `@gh-radar/shared` 빌드 산출물 부재.** 15-11/15-12 와 동일. `CI=true pnpm install` → `pnpm --filter @gh-radar/shared run build` 선행으로 해소(저장소 변경 없음).
- **상태 바와 게이트 카드가 같은 제목 문구를 쓴다.** `getByText('실시간 호가·주문 권한이 없어요')` 가 2건을 잡는다. 테스트를 게이트 카드 안으로 스코프해 우회했고, 문구 정본 통합은 UI-SPEC 갱신이 필요해 `deferred-items.md` 에 기록했다.

## Next Phase Readiness

- **15-18** (주문·계좌 패널): 우측 컬럼 자리표시자 3개를 교체하면 된다. `contents` 래퍼 덕에 `order-2/4/5` 클래스만 유지하면 M1 순서가 그대로 성립한다. 가격 클릭 값은 셸의 `selectedPrice` 에 이미 있고, **매수/매도 자동 전환 금지**(T-15-14)는 셸이 아니라 패널 쪽에서도 지켜야 한다.
- **15-14** (E2E + Vercel env): `stock-orderbook-section` testid 로 진입한다. e2e 픽스처에 `isin` 을 채워야 게이트가 아닌 연결 경로를 탈 수 있다(`deferred-items.md` 참조). `NEXT_PUBLIC_RELAY_WS_URL` 추가 시 paste 개행 검증은 15-12 메모대로.
- **거래소 토글 비활성 조건**은 `status !== 'ready'` 다. relay 가 `ready` 를 못 주면 사용자는 NXT 로 전환할 수 없다 — 15-14 E2E 가 이 경계를 확인하면 좋다.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*

## Self-Check: PASSED

- 생성 파일 6종 전부 디스크에 존재 (산출물 5 + SUMMARY)
- 커밋 4건 전부 `git log` 에 존재 — `3fd6238` · `a946599` · `d245e1b` · `8451c9a`
- 위 검증 표의 명령(typecheck / build / test / lint / grep)은 전부 실제 실행 결과다
