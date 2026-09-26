---
phase: 21-gh-trade-mobile-app
plan: 31
subsystem: ui
tags: [nextjs, react, scroll-restoration, query-cache, stale-while-revalidate, playwright, vitest]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-27 /search useDebouncedSearch resultsQuery · 21-04 NativeBridgeProvider navigate()(재탭 = 맨 위) · 21-05 installNativeApp e2e 픽스처"
provides:
  - "webapp/src/lib/tab-scroll-memory.ts — TAB_ROOTS · useTabRootScrollMemory() · isTabRoot · clearTabScrollMemory"
  - "AppShell 첫머리 useTabRootScrollMemory() 호출 — 다섯 탭 루트 창 스크롤 기록·복원(비 루트 no-op)"
  - "lib/query-cache 재방문 시드 3곳 — search:hub · chat:conversations:{필터} · me:today-orders:{KST 날짜}"
affects: [21-36 UAT 3차 재검증(G-21-R3-11), 탭 루트 페이지, lib/query-cache 소비처]

actuals:
  tokens: 10700
  tasks: 2
  commits: 3
plan_head_before: b3013f77a18419d06afb809cb7965f70026e25b6

tech-stack:
  added: []
  patterns:
    - "탭 루트 스크롤 복원 = 모듈 Map + scroll 리스너(location.pathname === root 일 때만 기록) + rAF 복원(최대 30 프레임)"
    - "재방문 시드 = useState(() => readQueryCache(key)) 초기값 + 성공 시 writeQueryCache (use-themes-query 관례)"

key-files:
  created:
    - webapp/src/lib/tab-scroll-memory.ts
    - webapp/src/lib/__tests__/tab-scroll-memory.test.tsx
  modified:
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
    - webapp/e2e/specs/home.spec.ts
    - webapp/src/components/search/search-page-client.tsx
    - webapp/src/components/search/__tests__/search-page-client.test.tsx
    - webapp/src/components/chat/conversation-list.tsx
    - webapp/src/components/chat/__tests__/conversation-list.test.tsx
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx

key-decisions:
  - "D-32 스크롤 주체 = 창(window) — e2e 가 실제 픽셀로 잠갔다(훅을 끄면 「보던 위치로 돌아오지 않았다」 로 실패 확인)"
  - "검색 허브 캐시는 두 칸이 모두 성공할 때만 기록 — 부분 실패가 시드를 바꾸지 않는다"
  - "대화 삭제 시 전체 · 현재 필터 캐시에서도 제거 — 지운 대화가 재방문 시드로 되살아나지 않게"
  - "오늘 주문 캐시 키에 KST 날짜 — 자정 넘어 어제 목록을 오늘 것처럼 보이지 않는다(T-21-86)"

patterns-established:
  - "탭 루트 화면 상태: 재마운트 허용 + query-cache 시드 + 창 스크롤 복원(keep-alive 아님)"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "탭 루트(/ · /search · /trading · /chat · /me)마다 창 스크롤 위치 기록·복원 · 비 루트 no-op · 검색 파라미터 착지 제외 · 30 프레임 상한"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/tab-scroll-memory.test.tsx (8 cases)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/home.spec.ts#G-21-R3-11 탭 루트 스크롤 복원"
        status: pass
    human_judgment: false
  - id: D2
    description: "같은 탭 재탭 = 맨 위 유지(D-06a)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/home.spec.ts#G-21-R3-11 (마지막 단계 scrollY → 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "검색 허브 · 대화 목록 · 오늘 주문이 재마운트 첫 렌더부터 이전 내용으로 서고(스켈레톤·로딩 문구 없음) 뒤에서 교체된다"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "search-page-client.test.tsx · conversation-list.test.tsx · today-orders-card.test.tsx — D-32 재방문 시드 describe"
        status: pass
    human_judgment: false
  - id: D4
    description: "iOS/Android 실기 탭바로 다섯 탭을 오가며 위치·내용 유지 체감"
    verification: []
    human_judgment: true
    rationale: "실기 WebView 탭 전환 체감은 21-36 UAT 3차 재검증 소관 — 브라우저 e2e 는 navigate 경로까지만 잠근다"

duration: 9min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 31: 탭 루트 스크롤 복원 · 스켈레톤 없는 재방문 Summary

**AppShell 에서 부르는 `useTabRootScrollMemory`(루트별 `window.scrollY` 기록 → 재마운트 다음 프레임 복원)와, 기존 `lib/query-cache` 로 검색 허브 · AI 대화 목록 · 오늘 주문을 시드해 탭 재방문 때 스켈레톤 없이 이전 내용 → 조용한 갱신 (G-21-R3-11 · D-32)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-26T11:10:06Z
- **Completed:** 2026-09-26T11:19:15Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- 탭 루트를 떠났다 돌아오면 보던 창 스크롤 위치로 복원 — 네이티브 탭바 실제 경로(`__ghTrade.navigate`)로 e2e 증명
- 같은 탭 재탭 = 맨 위(D-06a)는 그대로 · 종목상세 등 비 루트 화면은 영향 없음 · `?code=` 같은 목적지 착지는 복원하지 않음
- 검색 허브 · 대화 목록 · 오늘 주문이 재방문 첫 렌더부터 이전 값으로 서고 요청 결과가 뒤에서 교체 — 새 라이브러리 · keep-alive 없음

## 훅 동작 (`webapp/src/lib/tab-scroll-memory.ts`)

| 단계 | 동작 |
|---|---|
| 마운트(탭 루트) | 저장값 `target` 을 먼저 읽는다 |
| 기록 | passive `scroll` 리스너 — `window.location.pathname === root` 일 때만 `scrollY` 저장(이동 중 URL 이 먼저 바뀐 뒤의 스크롤 · 클램프 무시) |
| 복원 | `target > 0` 이고 `location.search === ''` 일 때 rAF 로 `scrollTo(0, target)` — 문서가 짧으면 최대 30 프레임 대기 후 가능한 만큼 |
| 정리 | 리스너 · 대기 프레임 해제 |
| 비 루트 | 아무것도 하지 않음(리스너도 안 단다) |

## 캐시 키

| 표면 | 키 | 기록 조건 | 시드 대상 |
|---|---|---|---|
| 검색 허브 | `search:hub` | scanner · 테마 **둘 다** fulfilled | `scanner` · `themeCount` 슬롯 `{status:'ok'}` |
| AI 대화 목록 | `chat:conversations:{all\|종목코드}` | 조회 성공(정렬 결과) · 삭제 시 전체/현재 필터 캐시에서 제거 | `conversations` · (전체 키면) `stockOptions` · 필터 변경 시 해당 키 선표시 |
| 오늘 주문 | `me:today-orders:{KST 날짜}` | `fetchTodayOrders` 성공(실패 미기록) | `restored` |

공통: 5분 만료(`QUERY_CACHE_MAX_AGE_MS`) · 사용자 전환 시 AuthProvider `clearQueryCache`(T-21-85 · 기존 경로).

## Task Commits

1. **Task 1: 트레이서 — useTabRootScrollMemory · AppShell · 단위 · e2e** - `9d60fb01` (feat)
2. **Task 2 RED: 재방문 시드 실패 테스트** - `a9dfd965` (test)
3. **Task 2 GREEN: 검색 허브 · 대화 목록 · 오늘 주문 query-cache 시드** - `a385e5ae` (feat)

## 테스트 · e2e 결과

- `vitest tab-scroll-memory + app-shell-chrome + lib/native` — 8 files · 84 passed
- `vitest search-page-client + conversation-list + today-orders-card` — 3 files · 69 passed (신규 D-32 12건)
- 전체 webapp 단위 — 124 files · 2399 passed · 1 skipped
- Playwright `home.spec.ts -g "G-21-R3-11"` — passed · `home.spec.ts` 전체 13 passed · `search-page · chat · me · native-shell` 31 passed
- `typecheck`(tsc + e2e tsconfig) — exit 0
- **음성 대조:** AppShell 의 훅 호출을 주석 처리하면 e2e 가 「홈 복귀 뒤 창 스크롤이 보던 위치로 돌아오지 않았다」로 실패(창이 스크롤 주체라는 전제 확인) → 복구 후 통과

## TDD Gate Compliance (Task 2 · tdd="true")

| Gate | Commit | 증거 |
|---|---|---|
| RED | `a9dfd965` | 원본(HEAD) 세 소스로 실행 → 7 failed / 62 passed — 전부 신규 D-32 describe 의 단언 실패(`expected length 3 but got 0` · `Unable to find listitem` 등). 음성 케이스(부분 실패 · 5분 만료 · 날짜 변경)는 종전 동작 유지 단언이라 원본에서도 통과가 맞다 |
| GREEN | `a385e5ae` | 같은 명령 69 passed |
| REFACTOR | — | 변경 없음 |

Task 1 은 `type="tracer"` — 트레이서 게이트(interactive · end-of-phase · automated-only verify)에 따라 verify 재실행 통과 후 Task 2 로 확장.

## Decisions Made

- 스크롤 주체는 창이다(플래너 확인 그대로) — UAT root_cause 의 「main overflow-auto 가 스크롤 컨테이너」 가설은 e2e 로 기각됨.
- 캐시 쓰기 조건을 보수적으로(허브 = 둘 다 성공 · 주문 = 성공만) — 부분/실패 결과가 다음 재방문 시드를 오염시키지 않게.
- 대화 삭제 시 캐시에서도 제거 — 계획에 없던 보강(아래 Deviation 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] app-shell-chrome 테스트의 next/navigation 목에 usePathname 추가**
- **Found during:** Task 1
- **Issue:** AppShell 이 `usePathname` 을 읽게 되어, `useRouter` 만 목한 `app-shell-chrome.test.tsx` 가 깨질 상황(verify 명령에 포함된 파일)
- **Fix:** `usePathname: () => '/design'`(탭 루트 아님 → 훅 no-op) 추가
- **Files modified:** webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
- **Committed in:** 9d60fb01

**2. [Rule 2 - Correctness] 대화 삭제 시 query-cache 에서도 제거**
- **Found during:** Task 2
- **Issue:** 시드만 넣으면 지운 대화가 다음 재방문 첫 렌더에 잠깐 되살아난다
- **Fix:** `handleDeleted` 가 전체 · 현재 필터 키 캐시에서 그 id 를 뺀다 + 단위 테스트
- **Files modified:** webapp/src/components/chat/conversation-list.tsx (+ 테스트)
- **Committed in:** a385e5ae

**3. [Rule 3 - Blocking] e2e 홈 목 응답을 테마 6개로 늘림**
- **Found during:** Task 1 e2e
- **Issue:** `HOME_POPULATED` 는 390×844 에서 창이 143px 만 내려가 600 복원을 잴 수 없었다
- **Fix:** 스펙 안에서 테마를 6개로 복제한 응답을 주입(픽스처 파일은 불변) · 실제 스크롤 도달값을 복원 목표로 쓰고 ≥300 을 단언
- **Files modified:** webapp/e2e/specs/home.spec.ts
- **Committed in:** 9d60fb01

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 correctness)
**Impact on plan:** 모두 계획 범위 안 보강. 새 의존성 · 화면 보존 코드 없음.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-21-R3-11 은 D-32 축소 truth 대로 코드 · 자동 검증 완료. 실기 탭바 체감은 21-36 UAT.
- 트레이딩(`/trading`)은 RelayProvider 상태로 재마운트해도 내용이 남고 스크롤 복원만 더해진다 · 홈은 기존 `use-home-query` 캐시.
- push 금지(21-36) — 커밋만 했다.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: webapp/src/lib/tab-scroll-memory.ts · webapp/src/lib/__tests__/tab-scroll-memory.test.tsx
- FOUND commits: 9d60fb01 · a9dfd965 · a385e5ae
