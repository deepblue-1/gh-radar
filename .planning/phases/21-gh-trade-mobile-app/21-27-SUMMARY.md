---
phase: 21-gh-trade-mobile-app
plan: 27
subsystem: webapp
tags: [security, open-redirect, search, radix-popover, native-bridge, theme-color, next-themes, vitest, playwright]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-04 NativeBridgeProvider · NativeOverlayMarker 참조계수 · back() 합성 Escape / 21-08 recent-search · /search 허브 / 21-15 네이티브 로그인 location.replace(safeNext) / 21-18 기본 다크 #17171c"
provides:
  - "webapp/src/lib/safe-path.ts isSafeInternalPath — login · /auth/callback · 네이티브 navigate 공용 유일 정의"
  - "recent-search RECENT_CODE_RE — 읽기(sanitize)·쓰기(push) 코드 형식 필터"
  - "useDebouncedSearch 반환 resultsQuery — 결과가 속한 요청 검색어"
  - "PopoverContent 첫 자식 NativeOverlayMarker — 팝오버가 오버레이 계수·back() 대상"
  - "viewport.themeColor '#17171c' 단일값 + ThemeColorSync(MutationObserver 로 클라 내비 뒤에도 앱 테마 유지)"
affects: [21-28, 21-29, 21-30, 21-31, 21-35, 21-36]

actuals:
  tokens: 10300
  tasks: 3
  commits: 6
plan_head_before: e29badb05a00c36ba657031b17e7a361b071c544

tech-stack:
  added: []
  patterns:
    - "경로 가드는 lib/safe-path.ts 한 함수만 — 소비처마다 따로 정의하지 않는다"
    - "비동기 결과는 「도착 시점 입력」이 아니라 「요청 시점 키」(resultsQuery)로 판정"
    - "Radix Content 계열(Dialog·Sheet·NumberPadSheet·Popover)은 첫 자식 NativeOverlayMarker"
    - "App Router 가 교체하는 head 메타는 한 번 설정이 아니라 MutationObserver 로 재적용(값 같으면 쓰지 않아 되먹임 없음)"

key-files:
  created:
    - webapp/src/lib/safe-path.ts
    - webapp/src/lib/__tests__/safe-path.test.ts
  modified:
    - webapp/src/lib/native/native-bridge-provider.tsx
    - webapp/src/lib/native/native-overlay-marker.tsx
    - webapp/src/app/login/page.tsx
    - webapp/src/app/login/__tests__/page.test.tsx
    - webapp/src/app/auth/callback/route.ts
    - webapp/src/lib/recent-search.ts
    - webapp/src/lib/__tests__/recent-search.test.ts
    - webapp/src/hooks/use-debounced-search.ts
    - webapp/src/components/search/search-page-client.tsx
    - webapp/src/components/search/__tests__/search-page-client.test.tsx
    - webapp/src/components/ui/popover.tsx
    - webapp/src/lib/native/__tests__/native-overlay.test.tsx
    - webapp/src/app/layout.tsx
    - webapp/src/components/providers/theme-provider.tsx
    - webapp/e2e/specs/theme-default.spec.ts

key-decisions:
  - "WR-04: 오버레이 계수를 「back 대상」과 「탭바 숨김」 둘로 나누지 않는다 — 팝오버 열림 중 탭바 숨김은 D-12 ③ 오버레이 규칙과 같은 판정이고, 나누면 계수 두 벌이 갈라질 위험만 생긴다"
  - "IN-06: theme-color 는 한 번 설정으로 부족 — App Router 가 클라 내비(경로·쿼리 모두)마다 viewport 메타 요소를 새로 만들어 #17171c 로 되돌린다(Playwright 실측). ThemeColorSync 는 head MutationObserver 로 재적용한다"
  - "WR-05: /search Enter 는 typing && !showLoading && resultsQuery === trimmed 일 때만 이동(플랜 명시 조건 — showLoading 판정과 겹치지만 Enter 불변식을 드러내려 명시 유지)"

patterns-established:
  - "같은 출처 경로 판정: import { isSafeInternalPath } from '@/lib/safe-path'"
  - "검색 결과 소유권: 훅이 결과와 함께 그 결과의 요청 키를 돌려준다"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "WR-01 — 로그인 next · /auth/callback next · 네이티브 navigate 가 isSafeInternalPath 한 함수를 쓰고 /%5Cevil.com · 탭·개행 · //evil.com 은 / 로 떨어진다"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/safe-path.test.ts#isSafeInternalPath (통과 4 · 거부 10)"
        status: pass
      - kind: unit
        ref: "webapp/src/app/login/__tests__/page.test.tsx#앱 + ?next=/%5Cevil.com(디코드 후 역슬래시) → location.replace(\"/\") (WR-01)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx#9. navigate 우회 거부"
        status: pass
    human_judgment: false
  - id: D2
    description: "IN-07 — 최근 검색 저장값의 code 가 /^[0-9A-Z]{6}$/ 이 아니면 읽기·쓰기 모두 버린다(005930 · 0000J0 통과)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/recent-search.test.ts#IN-07 (읽기 · push 2건)"
        status: pass
    human_judgment: false
  - id: D3
    description: "WR-05 — /search 에서 이전 검색어의 늦은 응답은 새 검색어 결과가 아니다(검색 중… · 결과 0 문구 없음 · Enter 이동·저장 없음)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/search/__tests__/search-page-client.test.tsx#늦은 응답(WR-05) 2건"
        status: pass
      - kind: unit
        ref: "webapp/src/components/search/__tests__/global-search.test.tsx (회귀)"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-04 — Popover 열림이 오버레이 계수에 잡히고 back() 이 팝오버를 닫는다 · 브라우저 송신 0"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-overlay.test.tsx#7 · 7b · 7c (Popover)"
        status: pass
    human_judgment: false
  - id: D5
    description: "WR-04 실기 — Android 에서 상승률 상위 필터 팝오버 열림 중 하드웨어/제스처 뒤로가기 = 팝오버만 닫힘"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "네이티브 뒤로가기 → evaluateJavaScript → back() 경로는 실기 WebView 에서만 전 구간이 돈다(21-36 UAT)"
  - id: D6
    description: "IN-06 — theme-color 메타가 앱 테마를 따른다(기본 #17171c, OS 라이트여도 · 라이트 저장값 #ffffff · 클라 내비 뒤에도 유지)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#theme-color 메타 = 앱 테마(IN-06) 3건"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 27: G-21-CR 웹 다섯 건 Summary

**로그인·콜백·네이티브 navigate 공용 `isSafeInternalPath`(lib/safe-path.ts)로 역슬래시 오픈 리다이렉트 차단, 최근 검색 6자리 코드 필터, 훅 `resultsQuery` 로 /search 늦은 응답 판정, PopoverContent 오버레이 마커, 앱 테마를 따르는 theme-color(MutationObserver 재적용)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-26T10:11:51Z
- **Completed:** 2026-09-26T10:19:48Z
- **Tasks:** 3
- **Files modified:** 17 (신규 2 · 수정 15)

## Accomplishments

- **WR-01 (T-21-61):** native-bridge-provider 의 로컬 `isSafeInternalPath` 를 `webapp/src/lib/safe-path.ts` 로 그대로 옮겨 export 했다. 로그인 `safeNext`, `/auth/callback` `safeNext`, 네이티브 `navigate` 가 이 함수를 import 한다. 로컬 정의는 0개다. `?next=/%5Cevil.com`(디코드 후 `/\evil.com`), 탭·개행 경로, `//evil.com` 은 `/` 로 떨어진다.
- **IN-07 (T-21-32):** `RECENT_CODE_RE = /^[0-9A-Z]{6}$/` 를 두었다. `sanitize` 는 형식이 아닌 code 를 버린다. `pushRecentSearch` 는 형식이 아니면 저장하지 않고 기존 목록을 돌려준다(throw 없음).
- **WR-05 (T-21-62):** `useDebouncedSearch` 가 `resultsQuery` 를 함께 돌려준다. 값은 요청 시점 trimmed 이며, 성공과 비중단 오류에서 설정하고 빈 입력이면 `''` 이다. `/search` 에서는 응답 도착 시점의 입력을 기록하던 `settledQuery`·`trimmedRef`·이펙트를 지웠다. 판정은 `pending = typing && trimmed !== resultsQuery` 이고, Enter 는 `resultsQuery === trimmed` 일 때만 이동한다. GlobalSearch 는 필드가 추가되기만 해서 무수정이다.
- **WR-04 (T-21-63):** `PopoverContent` 가 `children` 을 구조 분해한다. `PopoverPrimitive.Content` 첫 자식으로 `<NativeOverlayMarker />` 를 렌더하고 그 뒤에 `{children}` 을 둔다. 앱에서는 팝오버가 열리면 `overlay {open:true}` 가 가고, `back()` 은 합성 Escape 로 팝오버만 닫는다. 브라우저 송신은 0이다. 영향 표면은 scanner-filters, theme-chips, setting-group, user-section 이다.
- **IN-06 (T-21-64 accept):** `viewport.themeColor` 를 `'#17171c'` 단일값으로 바꿨다. 비공개 `ThemeColorSync` 가 `resolvedTheme` 에 맞춰 `meta[name="theme-color"]` 를 설정한다(dark `#17171c` · light `#ffffff`).

## Task Commits

1. **Task 1: isSafeInternalPath 공유 모듈 (WR-01, tracer)** - `05671f9` (fix)
2. **Task 2: 최근 검색 코드 형식 · resultsQuery (IN-07 · WR-05)**
   - RED `f3215e2` (test) · GREEN `9b763d7` (fix)
3. **Task 3: Popover 마커 · theme-color (WR-04 · IN-06)**
   - RED `09de489` (test) · GREEN `abd2146` (fix)

**Plan metadata:** 이 SUMMARY 커밋(docs)

`actuals.commits: 6` 은 `git rev-list --count e29badb..HEAD` 로 잰 값이다. 여기에는 동시에 작업하던 다른 세션의 커밋 `99f6550 feat(trading): 카드 탭 — 선택된 탭을 다시 누르면 본문 접힘` 1건이 끼어 있다. 21-27 커밋은 5건이다.

## Files Created/Modified

- `webapp/src/lib/safe-path.ts` (신규): `isSafeInternalPath`. 같은 출처 절대 경로 판정의 유일한 정의다.
- `webapp/src/lib/__tests__/safe-path.test.ts` (신규): 통과 4건(`/` · `/me` · `/trading?focus=a%7Cb` · `/stocks/005930?tab=news&view=news`)과 거부 10건 표.
- `webapp/src/app/login/page.tsx` · `webapp/src/app/auth/callback/route.ts`: `safeNext = isSafeInternalPath(rawNext) ? rawNext : '/'`. OAuth `redirectTo` 조립은 그대로 두었다.
- `webapp/src/app/login/__tests__/page.test.tsx`: 「앱 + `?next=/%5Cevil.com` → `location.replace("/")`」 케이스 추가.
- `webapp/src/lib/native/native-bridge-provider.tsx`: 로컬 정의를 삭제하고 import 로 바꿨다. 머리 주석에 safe-path 와 Popover 를 반영했다.
- `webapp/src/lib/native/native-overlay-marker.tsx`: 머리 주석에 Popover 추가(주석만).
- `webapp/src/lib/recent-search.ts` · 테스트: `RECENT_CODE_RE` 로 읽기·쓰기를 거른다. `../me` · `x?y` 케이스를 추가했다.
- `webapp/src/hooks/use-debounced-search.ts`: 반환에 `resultsQuery` 를 더했다.
- `webapp/src/components/search/search-page-client.tsx` · 테스트: `resultsQuery` 로 판정한다. 늦은 응답 케이스 2건(빈 결과, 행 있는 결과)을 추가했다.
- `webapp/src/components/ui/popover.tsx`: Content 첫 자식이 `NativeOverlayMarker` 다.
- `webapp/src/lib/native/__tests__/native-overlay.test.tsx`: Popover 케이스 추가. 7은 열림/닫힘 1회씩, 7b는 back() 이 팝오버를 닫는지, 7c는 브라우저 송신 0을 본다.
- `webapp/src/app/layout.tsx`: `themeColor: '#17171c'` 로 바꾸고 주석을 IN-06 기준으로 고쳤다.
- `webapp/src/components/providers/theme-provider.tsx`: `ThemeColorSync` 와 `THEME_COLOR` 상수를 추가했다.
- `webapp/e2e/specs/theme-default.spec.ts`: 「theme-color 메타 = 앱 테마(IN-06)」 3건. 기본값은 OS 라이트와 OS 다크 에뮬레이트 모두에서 `#17171c` 다. 라이트 저장값은 `#ffffff` 이고, 쿼리만 바뀌는 클라 내비 뒤에도 유지된다.

## Decisions Made

- **WR-04 계수는 하나로 유지한다.** 「back 대상」과 「탭바 숨김」 계수로 나누지 않는다. 팝오버가 열린 동안 탭바가 숨는 것은 D-12 ③ 오버레이 규칙과 같은 판정이다. 나누면 계수 두 벌이 갈라질 위험만 생긴다(플랜 기록 판단을 그대로 따랐다).
- **IN-06 은 한 번 설정으로 끝내지 않는다.** App Router 는 클라 내비마다 viewport 메타 요소를 새로 만들어 서버 기본값으로 되돌린다. 아래 편차 1 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ThemeColorSync 를 `resolvedTheme` 한 번 설정에서 head MutationObserver 재적용으로 바꿨다**
- **Found during:** Task 3 (IN-06 GREEN 후 실측)
- **Issue:** 플랜대로 「`resolvedTheme` 가 정해지면 content 설정」 만 하면 e2e 첫 로드는 통과한다. 그러나 라이트 저장 사용자로 Playwright 에서 `window.next.router.push` 로 이동해 보니, 경로 이동(`/search`→`/me`)과 쿼리만 바뀌는 이동(`/stocks/005930?tab=news`) 모두에서 메타 요소가 새 요소로 교체됐다. 값은 `#17171c` 로 돌아갔다. 라이트 사용자가 첫 이동 뒤부터 다크 브라우저 크롬을 보게 되는 결함이다. `usePathname` 의존성을 더해도 쿼리만 바뀌는 이동은 막지 못했다(실측).
- **Fix:** `document.head` 를 MutationObserver(childList · subtree · attributes[content])로 지켜보며 다시 맞춘다. 값이 이미 같으면 쓰지 않으므로 자기 쓰기로 되먹임이 돌지 않는다. `resolvedTheme` 가 바뀌거나 언마운트되면 disconnect 한다.
- **Files modified:** `webapp/src/components/providers/theme-provider.tsx`, `webapp/e2e/specs/theme-default.spec.ts`(클라 내비 유지 단언 추가)
- **Verification:** 임시 스펙으로 5개 이동을 이동당 250ms 간격 5회 샘플링했고 전부 `#ffffff` 였다. theme-default.spec 11/11 통과.
- **Committed in:** `abd2146`

**2. [Rule 2 - 문서 정합] native-bridge-provider · native-overlay-marker 머리 주석에 Popover 추가**
- **Found during:** Task 3
- **Issue:** 두 파일 주석이 마커 위치를 「Sheet·Dialog·NumberPadSheet」 로만 적고 있었다. 플랜의 「native-bridge-provider/marker 무수정」 은 동작 무수정이라는 뜻으로 읽었다.
- **Fix:** 주석 한 단어만 추가했다. 코드 변경은 0이다.
- **Committed in:** `abd2146`

---

**Total deviations:** 2 auto-fixed (1 bug · 1 문서 정합)
**Impact on plan:** 편차 1이 없으면 IN-06 은 첫 페인트에서만 닫히고 첫 이동에서 다시 열린다. 스코프 확장은 없다.

## Issues Encountered

- 다른 세션이 이 플랜 도중 `99f6550`(card-tabs)을 master 에 커밋했다. 그래서 측정 커밋 수에 1건이 섞였다(위 Task Commits 참조). 그 세션 파일은 건드리지 않았다.
- 전체 webapp vitest 는 123 파일, 2360 통과, 1 skipped, 실패 0 이다.

## Verification

- vitest(플랜 목록): safe-path 14 · login 11 · native-bridge-provider 17 · recent-search 12 · search-page-client 16 · global-search 9 · native-overlay 10 · setting-group 전부 통과. 추가로 `src/lib/native` · `src/components/ui` 72건과 전체 스위트 2360건도 통과했다.
- Playwright `e2e/specs/theme-default.spec.ts` 11 passed(IN-06 3건 포함). 적용 전 RED 는 메타 2개(미디어 분기)라서 실패했다.
- `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig) 오류 0.
- 수용 기준 grep 전부 통과. 로컬 정의 0 · `RECENT_CODE_RE.test` 2줄 · `trimmedRef` 0 · `prefers-color-scheme` 0 · `NativeOverlayMarker` 2 · `ThemeColorSync` 3.
- Task 1 트레이서 게이트: interactive, end-of-phase, automated-only 조건이다. verify 를 다시 돌려 통과했고 확장으로 진행했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 사람 확인 1건이 21-36 UAT 로 넘어간다. Android 에서 상승률 상위 필터 팝오버를 연 채 뒤로가기를 누르면 팝오버만 닫혀야 한다(coverage D5).
- push 는 하지 않았다(21-36 결정).

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED
