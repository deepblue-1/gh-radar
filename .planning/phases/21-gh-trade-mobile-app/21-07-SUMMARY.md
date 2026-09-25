---
phase: 21-gh-trade-mobile-app
plan: 07
subsystem: webapp-native-refresh
tags: [capacitor, react, relay, websocket, pull-to-refresh, naver-quota]

requires:
  - phase: 21-04
    provides: "useNativeRefresh(fn) · NativeBridgeProvider refresh 레지스트리(등록 훅 전부 Promise.allSettled · 등록 0 이면 reload) · native-app-mode 테스트 헬퍼"
provides:
  - "RelayConnectionState.probeNow — 복귀 경로 onResume(true) 의 공개 계약(안정 참조) · EMPTY_RELAY_VALUE.probeNow = NOOP"
  - "당겨서 새로고침 등록 9곳 — 홈 · 상승률 상위 · 테마 · 관심종목 · 트레이딩(probeNow) · 마이(probeNow) · 종목상세 시세 · 뉴스 GET · 토론 GET"
  - "stock-native-refresh.test.tsx — D-18 POST refresh 0 단언(MOBILE-01l)"
affects: [21-08, 21-09, 21-11, 21-13, 21-16]

actuals:
  tokens: 8200
  tasks: 3
  commits: 5
plan_head_before: 22d92b3818626ace5185a9b25a29ebc522321802

tech-stack:
  added: []
  patterns:
    - "effect 지역 클로저를 공개 메서드로 노출: ref 에 클로저를 걸고 cleanup 첫 줄에서 NOOP 으로 되돌림 + useCallback(() => ref.current()) 안정 참조"
    - "앱 새로고침은 기존 재조회 함수를 한 줄 등록만 — 새 데이터 경로를 만들지 않는다"
    - "외부 수집을 일으키는 POST(뉴스·토론 refresh)는 등록 대상에서 제외, GET 캐시 조회만 등록"

key-files:
  created:
    - webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/home/home-client.tsx
    - webapp/src/components/scanner/scanner-client.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/watchlist/watchlist-client.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/components/stock/stock-news-section.tsx
    - webapp/src/components/stock/stock-discussion-section.tsx

key-decisions:
  - "probeNow 는 onResume(true) 를 그대로 재사용한다. 새 판정 로직이 없으므로 복귀 경로(R1~R11)와 당김 경로가 갈라지지 않는다. 탐침 settle 창(2초)도 똑같이 적용된다"
  - "트레이딩의 등록은 DMA 게이트 아래 WorkbenchSurface 에 둔다(relay 가 거기서 잡힌다). 게이트 화면에서는 등록이 없어 21-04 레지스트리 규칙대로 location.reload 다. 게이트 화면에는 편집 중 입력이 없어 무해하다"
  - "종목상세 테마칩·상한가·동조 섹션은 등록하지 않는다(플랜 범위: 시세·차트·통계 + 뉴스·토론 GET)"

patterns-established:
  - "RED 증거: vitest --reporter=tap-flat 출력에 TAP 줄 수로 센 # tests/# pass/# fail 요약을 덧붙여 check tdd-red-evidence 로 검증했다(vitest TAP 에는 node --test 요약 줄이 없다)"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜이 공유 — 형제 플랜 미완이라 표시하지 않음

coverage:
  - id: D1
    description: "probeNow — 소진·백오프 대기면 즉시 재연결(attempt 0) · 인증된 OPEN 5초 탐침(무프레임 재연결 / 새 프레임 유지) · 시도 중·언마운트 뒤 무동작 · 중복 탐침 없음 · 안정 참조 · Provider 밖 no-op"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts -t probeNow (P1·P1-a·P2·P2-a·P3·P3-a·P3-b·P4)"
        status: pass
      - kind: unit
        ref: "relay-socket.test.ts + relay-provider.test.tsx 전체 130"
        status: pass
    human_judgment: false
  - id: D2
    description: "목록 4화면·트레이딩·마이가 useNativeRefresh 로 자기 재조회를 등록한다"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "home·theme·watchlist·scanner·trading-workbench·me-client 테스트 10파일 202"
        status: pass
      - kind: other
        ref: "grep useNativeRefresh( 6파일 각 1줄 · useNativeRefresh(relay.probeNow) · useNativeRefresh(probeNow)"
        status: pass
    human_judgment: false
  - id: D3
    description: "종목상세 당김은 fetchStockDetail·fetchStockNews·fetchStockDiscussions(GET)만 부르고 refreshStockNews·refreshStockDiscussions(POST) 0 · 차트 refreshSignal true→false · 언마운트 섹션 무호출 · 수동 버튼 POST 경로 유지"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx (N1·N2·N2-a·N3·N4)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test (115 files · 2192 pass · 1 skip)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기기에서 네이티브 당김 제스처가 window.__ghTrade.refresh() 를 부르고 스피너가 1초 고정(D-17)인 종단 동작"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "네이티브 당김은 21-11(iOS)·21-13(Android)에서 만들어진다. 이 플랜은 웹 쪽 등록만 단위 테스트로 잠갔다"

duration: 10min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 07: 페이지별 당겨서 새로고침 연결 Summary

**relay 재탐침 `probeNow()`(복귀 경로 `onResume(true)` 공개 · relay 무변경)와 9곳의 `useNativeRefresh` 등록. 종목상세는 GET 캐시 재조회만 등록하고 외부 수집 POST 는 0회로 잠갔다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-25T21:55Z (KST 2026-09-26 06:55)
- **Completed:** 2026-09-25T22:05Z (KST 2026-09-26 07:05)
- **Tasks:** 3 (Task 1·3 은 TDD RED → GREEN)
- **Files modified:** 13 (생성 1 · 수정 12)

## Accomplishments

- `RelayConnectionState.probeNow`
  - 연결 effect 가 `probeNowRef.current = () => onResume(true)` 를 걸고, cleanup 첫 줄에서 `NOOP_PROBE` 로 되돌린다.
  - 공개 값은 `useCallback(() => probeNowRef.current(), [])` 라서 참조가 바뀌지 않는다.
  - 동작: 소진·백오프 대기면 곧바로 재연결한다. 인증된 OPEN 이면 5초 탐침을 돌린다. 연결을 시도하는 중이거나 이미 탐침 중이면 아무것도 하지 않는다.
  - Provider 밖에서는 `EMPTY_RELAY_VALUE.probeNow = NOOP` 가 쓰인다.
- 등록한 곳
  - 홈 · 상승률 상위 · 테마 · 관심종목: 기존 `refresh`. 관심종목은 `useWatchlistQuery()` 구조분해에 `refresh` 를 추가했다.
  - 트레이딩(`WorkbenchSurface`) · 마이: `probeNow`. 편집 중인 수동주문 입력은 로컬 상태라 그대로 남는다.
- 종목상세
  - `StockDetailClient` 는 `useNativeRefresh(load)` 를 등록한다. 시세를 다시 읽는 동안 `isRefreshing` 이 차트 `refreshSignal` 로 전달된다.
  - 뉴스·토론 섹션은 마운트 GET `load` 만 등록한다. 머리 주석에 D-18 근거(공식 API 운영 기준 3 · 크롤링 5원칙 3)를 적었다.
- relay 패키지는 바뀌지 않았다(`git diff --quiet -- relay/` = 0, 플랜 구간 relay 커밋 0).

## Task Commits

1. **Task 1 RED:** `272e57f` (test): probeNow P1~P4, 8건. `check tdd-red-evidence` = RED_EVIDENCE_OK(8건 중 8건 실패, `probeNow is not a function`)
2. **Task 1 GREEN:** `ddea0f2` (feat): probeNow 계약과 Provider 폴백
3. **Task 2:** `833ecf1` (feat): 목록 4화면·트레이딩·마이 등록
4. **Task 3 RED:** `77df080` (test): stock-native-refresh N1~N4. RED_EVIDENCE_OK(4건 중 3건 실패. N4 는 기존 수동 버튼 회귀 가드라 통과가 맞다)
5. **Task 3 GREEN:** `b5443f9` (feat): 종목상세 3곳 등록과 테스트 N2 분할

**Plan metadata:** 별도 docs 커밋(SUMMARY · STATE · ROADMAP)

## Files Created/Modified

- `webapp/src/lib/use-relay-socket.ts`: `probeNow` 인터페이스·JSDoc, `NOOP_PROBE`, `probeNowRef`, 반환 memo
- `webapp/src/lib/relay-provider.tsx`: `EMPTY_RELAY_VALUE.probeNow = NOOP`
- `webapp/src/lib/__tests__/relay-socket.test.ts`: 복귀 describe 끝에 P1~P4 추가
- `webapp/src/components/{home/home-client,scanner/scanner-client,theme/themes-client,watchlist/watchlist-client}.tsx`: D-04 등록
- `webapp/src/components/trading/{workbench/trading-workbench,me-client}.tsx`: D-16 등록
- `webapp/src/components/stock/{stock-detail-client,stock-news-section,stock-discussion-section}.tsx`: D-18 등록과 근거 주석
- `webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx`: D-18 테스트(신규)

## Decisions Made

프론트매터 key-decisions 를 보라. 핵심: probeNow 는 새 로직 없이 복귀 경로를 재사용한다. 종목상세는 GET 만 등록한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 설계] 차트 refreshSignal 관측 방식**
- **Found during:** Task 3 GREEN
- **Issue:** 플랜 behavior 는 뉴스토론 탭에서 `StockDetailClient` 를 렌더하는 한 케이스였다. 문제가 두 가지였다.
  - 차트 패널은 한 번 열기 전까지 마운트되지 않는다(탭 T8). 그래서 뉴스토론 탭에서는 차트 스텁이 렌더되지 않는다.
  - `act` 가 `setIsRefreshing(true→false)` 를 한 번에 합쳐서 「읽는 중」 렌더가 커밋되지 않는다.
- **Fix:** 케이스를 둘로 나눴다.
  - N2(차트 탭): 재조회 응답을 붙잡아 두고 `refreshSignal=true` 를 관측한 뒤 `false` 복귀를 확인한다.
  - N2-a(뉴스토론 탭): 시세와 두 섹션 GET 이 한 번의 당김에 함께 불리는지 확인한다.
- **Files modified:** stock-native-refresh.test.tsx
- **Committed in:** b5443f9

**2. [범위 보강] probeNow 추가 케이스**
- 플랜 P1~P3 에 세 케이스를 더했다.
  - P1-a: 백오프 대기 중 즉시 재연결
  - P3-b: 창 안 두 번째 호출이 창을 늘리지 않음 + 참조 안정
  - P4: Provider 밖 `useRelayContext().probeNow`
- P4 는 plan behavior 4번째 항목을 이 파일에 둔 것이다.
- **Committed in:** 272e57f

---

**Total deviations:** 2건(테스트 설계 1 · 테스트 보강 1)
**Impact on plan:** 제품 코드는 플랜 그대로다. 테스트만 관측 가능한 형태로 조정했고 범위는 넓히지 않았다.

## Issues Encountered

- **vitest TAP 에는 node --test 요약 줄이 없다.** `check tdd-red-evidence` 는 `# tests/# pass/# fail` 요약을 요구한다. 첫 판정이 `zero_tests_discovered` 로 나왔다. `--reporter=tap-flat` 출력에서 SKIP 이 아닌 `ok`/`not ok` 줄을 세어 요약을 덧붙인 기록으로 재판정했고, 두 RED 모두 `RED_EVIDENCE_OK` 였다.
- **lint 경고 2건은 기존 것이다.** `trading-workbench.tsx:811 dirtyCardCount` 미사용, `use-relay-socket.ts` cleanup 의 `wireSubsRef.current` 경고. 이 플랜과 무관해 손대지 않았다.

## Known Stubs

없음.

## TDD Gate Compliance

- Task 1: RED `272e57f` → GREEN `ddea0f2`
- Task 3: RED `77df080` → GREEN `b5443f9`
- REFACTOR 없음

## Self-Check: PASSED

- 파일: stock-native-refresh.test.tsx 와 수정 파일 12개가 모두 있다.
- 커밋: 272e57f · ddea0f2 · 833ecf1 · 77df080 · b5443f9 모두 `git log` 에 있다.
- 검증: probeNow 8/8 · relay 두 스위트 130/130 · 페이지 테스트 202/202 · stock 17/17 · 전체 2192 pass / 1 skip · typecheck green · relay 무변경.
