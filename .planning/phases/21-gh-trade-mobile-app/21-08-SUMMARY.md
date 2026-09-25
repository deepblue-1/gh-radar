---
phase: 21-gh-trade-mobile-app
plan: 08
subsystem: webapp-search-page
tags: [nextjs, react, search, localStorage, sidebar, capacitor, playwright]
status: complete

requires:
  - phase: 21-04
    provides: "useNativeRefresh(fn) — 당겨서 새로고침 등록 훅"
  - phase: 21-05
    provides: "e2e 픽스처 installNativeApp · nativeMessages (앱 모드 route 캡처)"
  - phase: 21-06
    provides: "앱 본문 하단 108 · --native-tabbar-offset (새 페이지는 AppShell 을 쓰므로 자동 적용)"
  - phase: 21-10
    provides: "iOS TabRoutes — 「검색」 탭 경로 /search"
provides:
  - "webapp/src/lib/recent-search.ts — RECENT_SEARCH_KEY('gh-radar:recent-search') · RECENT_SEARCH_MAX(10) · RecentSearchItem · readRecentSearches · pushRecentSearch · removeRecentSearch · clearRecentSearches"
  - "SearchPageClient — /search B 탐색 허브(입력 · 타일 3 · 최근 검색 · 상승률 상위 5 · 입력 중 결과 카드)"
  - "/search 라우트(AppShell + AppSidebar) — 앱 「검색」 탭의 목적지"
  - "사이드바 NAV_SEARCH_PAGE — 홈 바로 아래 「검색」 링크"
  - "e2e/specs/search-page.spec.ts (MOBILE-01g)"
affects: [21-09, 21-11, 21-12, 21-16]

actuals:
  tokens: 13800
  tasks: 3
  commits: 7
plan_head_before: 4b96c0beba472f1e026d6ee40ab1a049a279d3f6

tech-stack:
  added: []
  patterns:
    - "허브형 페이지 데이터: 마운트 1회 Promise.allSettled + useNativeRefresh 등록, 칸별 Slot(loading/ok/error) — 한쪽 실패는 그 칸만, 재조회 실패는 이미 보인 값을 지우지 않음"
    - "디바운스 검색의 「없습니다」 번쩍임 방지 — 응답(성공·실패·비움)이 올 때의 검색어를 기록하고 현재 검색어와 다르면 「검색 중…」"
    - "본문면(--surface) 위에 바로 놓이는 컨트롤은 라이트 --card · 다크 --muted (라이트 --muted = --surface 라 사라짐)"

key-files:
  created:
    - webapp/src/lib/recent-search.ts
    - webapp/src/lib/__tests__/recent-search.test.ts
    - webapp/src/components/search/search-page-client.tsx
    - webapp/src/components/search/__tests__/search-page-client.test.tsx
    - webapp/src/app/search/page.tsx
    - webapp/e2e/specs/search-page.spec.ts
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "검색 데이터 경로는 ⌘K GlobalSearch 와 같은 useDebouncedSearch → searchStocks → /api/stocks/search 를 그대로 쓴다 — 새 조회 경로가 없으므로 서버 필터(ETP·스팩 등)가 두 표면에 대칭으로 적용된다(260908 회귀 교훈)"
  - "검색 입력 면은 라이트 --card · 다크 --muted. 스케치의 --raised 는 흰 바탕 기준이었고, 실제 앱 라이트 본문면(--surface #f2f4f6)이 --muted 와 같아 입력이 사라졌다"
  - "입력 포커스는 globals §8.5.5 입력 규약대로 data-focus-ring=seamless + 래퍼 테두리 한 겹(focus-within:border --ring)"
  - "Enter(키보드 「검색」 키)는 응답이 도착한 뒤 첫 결과로 이동 — 앱 키보드의 검색 키가 무동작이 되지 않게"
  - "최근 검색 행 클릭도 그 항목을 맨 앞으로 옮긴다(pushRecentSearch) — 결과 선택과 같은 「최신 앞」 규칙"
  - "타일 보조 문구 로딩 중은 「…」, 실패는 「—」. 미리보기 로딩은 44 행 스켈레톤 5개, 0건은 「지금 표시할 종목이 없어요」"

patterns-established:
  - "RED 증거: 모듈 부재(로드 실패)는 INVALID_RED 라 이름만 맞춘 스텁을 두고 단언 실패로 RED 를 만든 뒤, tap-flat 출력 + 요약 줄로 check tdd-red-evidence 검증(대상 테스트 이름은 파일 경로 접두까지 포함)"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜이 공유 — 형제 플랜 미완이라 표시하지 않음

coverage:
  - id: D1
    description: "최근 검색 유틸 — 키 gh-radar:recent-search · 최대 10 · 최신 앞 · 코드 중복 없음 · 타입 필터(T-21-32) · 저장소 throw 무해"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/recent-search.test.ts (10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/search 허브 — 타일 3 href·실데이터 보조 문구 · 상승률 상위 5 + 더보기 · 최근 검색 표시/개별 삭제/지우기 · 입력 중 결과 카드·이동+저장 · 로딩/오류/빈 문구 · 실패 칸 격리 · 폴링 없음 · useNativeRefresh 재조회"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/search/__tests__/search-page-client.test.tsx (14)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/search-page.spec.ts (4 + setup)"
        status: pass
    human_judgment: false
  - id: D3
    description: "사이드바 홈 다음 「검색」 링크 · /search 활성 선택 토큰 · 종목검색 그룹 3항목 불변"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx (36)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts (8) · search-page.spec.ts 1280 케이스"
        status: pass
    human_judgment: false
  - id: D4
    description: "앱 모드 390 에서 같은 페이지 렌더 · route {path:/search} 송신"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/search-page.spec.ts 「앱 모드 390」"
        status: pass
    human_judgment: false
  - id: D5
    description: "시각 — 360/390(웹·앱)/1280 × 라이트/다크, 허브·입력 중 스크린샷 확인(줄바꿈·잘림·겹침 없음)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Playwright 스크린샷 16장(스크래치 · 커밋 안 함) — 입력 라이트 면 소실·이중 포커스 링 수정 후 재촬영"
        status: pass
    human_judgment: true
    rationale: "시각 채택 여부(스케치 005 B 대비 톤)는 사용자 판단 — 실기(iOS/Android 탭바 위) 확인은 21-16 게이트"

duration: 12min
completed: 2026-09-26
---

# Phase 21 Plan 08: `/search` 탐색 허브 Summary

**앱 「검색」 탭의 목적지 `/search` — 스케치 005 B 대로 입력 48 · 타일 3열(실데이터 「25%↑ N종목」·「오늘 N개」·「N종목」) · localStorage 최근 검색(최대 10) · 상승률 상위 5 미리보기, 입력 중에는 ⌘K 와 같은 검색 경로의 결과 카드만 보이고 선택 시 최근 검색 저장 후 `/stocks/{code}` 로 간다. 웹 사이드바 홈 아래 「검색」 링크 추가.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-25T22:46:53Z
- **Completed:** 2026-09-25T22:58:36Z (KST 2026-09-26 07:58)
- **Tasks:** 3
- **Files modified:** 9 (신규 6 · 수정 3)

## Accomplishments

- `recent-search.ts` — `gh-radar:recent-search` 키, 최대 10, 최신 앞·같은 코드 이동, 파싱 후 `code`/`name` 문자열 원소만 남김(T-21-32), 저장소가 throw 해도 메모리 결과 반환
- `SearchPageClient` — 허브(타일·최근·미리보기)와 결과 카드(52 행: 종목명 15/600 · 코드 12.5 mono · 시장 배지 11/700 · 현재가 14/600 + 등락률) 전환. 허브 데이터는 마운트 1회 `Promise.allSettled`(scanner rate_desc · 테마 목록) — 폴링 없음, 실패는 그 칸만 「—」/「상승률 상위를 불러오지 못했어요」, `useNativeRefresh(loadHub)`(D-04)
- `/search` 라우트 — `/watchlist` 와 같은 AppShell + AppSidebar 조립, middleware 기본 차단 규칙 적용(공개 경로 아님)
- 사이드바 `NAV_SEARCH_PAGE` — 홈 바로 아래, 활성 시 `--nav-on-bg`/`--nav-on-fg`, 「종목검색」 그룹 3항목 무변경
- e2e `search-page.spec.ts` — 허브 초기 · 검색→이동→최근 검색 저장·재방문·지우기 · 1280 사이드바 활성·본문 ≤ 900 · 앱 모드 390 route

## Task Commits

1. **Task 1 RED:** `ca4a245` (test) — 최근 검색 10건. `check tdd-red-evidence` = RED_EVIDENCE_OK(10건 중 6건 단언 실패)
2. **Task 1 GREEN:** `440adcf` (feat) — recent-search.ts
3. **Task 2 RED:** `1464e98` (test) — search-page-client 14건 · app-sidebar 2건. 둘 다 RED_EVIDENCE_OK(13/14 · 2/36 실패)
4. **Task 2 GREEN:** `dc00f85` (feat) — SearchPageClient · /search · 사이드바 링크
5. **Task 2 시각 수정:** `041fe09` (fix) — 라이트 입력 면 소실 · 이중 포커스 링
6. **Task 3:** `18b691b` (test) — search-page.spec.ts
7. **Task 3 파급:** `cc99367` (test) — sidebar-tree.spec.ts 링크 순서·개수 계약에 「검색」 반영

## Files Created/Modified

- `webapp/src/lib/recent-search.ts` — 최근 검색 localStorage 유틸
- `webapp/src/lib/__tests__/recent-search.test.ts` — 유틸 10건
- `webapp/src/components/search/search-page-client.tsx` — /search B 탐색 허브
- `webapp/src/components/search/__tests__/search-page-client.test.tsx` — 허브·입력 중 14건
- `webapp/src/app/search/page.tsx` — 라우트
- `webapp/src/components/layout/app-sidebar.tsx` — `NAV_SEARCH_PAGE` + 렌더 1줄 + 트리 주석
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` — 2건 추가
- `webapp/e2e/specs/search-page.spec.ts` — MOBILE-01g e2e
- `webapp/e2e/specs/sidebar-tree.spec.ts` — TREE_LINKS 에 「검색」

## Decisions Made

frontmatter `key-decisions` 참고. 핵심은 두 가지다. 검색 결과는 ⌘K 와 같은 `useDebouncedSearch` 경로만 쓴다(새 무필터 경로 없음). 입력 면은 라이트 `--card` · 다크 `--muted` 로 나눈다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 라이트 테마에서 검색 입력이 본문면에 묻힘**
- **Found during:** Task 3 스크린샷 검토(360 라이트)
- **Issue:** 플랜 값 `bg-[var(--muted)]` 는 스케치(흰 바탕) 기준이다. 실제 AppShell 라이트 본문면 `--surface` 가 `--muted` 와 같은 #f2f4f6 이라 입력 윤곽이 사라졌다
- **Fix:** `bg-[var(--card)] dark:bg-[var(--muted)]` — 다크는 스케치 그대로
- **Files modified:** webapp/src/components/search/search-page-client.tsx
- **Verification:** 16장 재촬영, 단위 23 · e2e 5 green
- **Commit:** 041fe09

**2. [Rule 1 - Bug] 입력 포커스 시 이중 링(전역 사각 링 + 래퍼 링)**
- **Found during:** Task 3 스크린샷 검토(입력 중)
- **Issue:** 전역 `*:focus-visible` 이중 링이 input 에 사각형으로 그려지고, 래퍼 `focus-within:ring` 과 겹쳐 두 겹이 됐다(globals §8.5.5 입력 규약 위반)
- **Fix:** input `data-focus-ring="seamless"` + 래퍼 `border-transparent focus-within:border-[var(--ring)]` 한 겹
- **Files modified:** webapp/src/components/search/search-page-client.tsx
- **Commit:** 041fe09

**3. [Rule 3 - Blocking] 사이드바 트리 e2e 계약이 새 링크로 깨짐**
- **Found during:** Task 3 후 관련 e2e 점검
- **Issue:** `sidebar-tree.spec.ts` 의 `TREE_LINKS`(순서·개수 계약)에 「검색」이 없어 케이스 1·4 가 깨진다(플랜 `files_modified` 밖이지만 사이드바 변경의 직접 결과)
- **Fix:** `'검색'` 을 홈 다음에 넣고 전략 삽입 위치를 `slice(0,6)`/`slice(6)` 로, 주석 「링크 7개」→「8개」
- **Verification:** sidebar-tree.spec 8/8 green
- **Commit:** cc99367

**4. [Rule 2 - Missing] 디바운스 틈 「없습니다」 번쩍임 방지 · Enter 동작**
- **Found during:** Task 2 구현
- **Issue:** `useDebouncedSearch` 는 입력 직후 300ms 동안 loading=false · results=[] 를 돌려준다. 그대로 쓰면 입력할 때마다 `"삼" 에 해당하는 종목이 없습니다` 가 번쩍인다. 또 앱 키보드의 「검색」 키가 아무 일도 하지 않는다
- **Fix:** 응답이 도착했을 때의 검색어를 기록해 두고, 현재 검색어와 다르면 「검색 중…」으로 표시한다. `<form role="search">` 에서 Enter 를 누르면 응답 뒤 첫 결과로 이동한다(단위 테스트 1건 추가)
- **Commit:** dc00f85

---

**Total deviations:** 4 auto-fixed (Rule 1 ×2 · Rule 2 ×1 · Rule 3 ×1). **Impact:** 전부 이 플랜이 만든 표면 안의 결함·파급이다. 범위 확장은 없다.

## Issues Encountered

- 모듈 부재 상태의 RED 는 `fixture_or_load_failure` 로 INVALID_RED 판정된다. 그래서 export 이름만 맞춘 스텁을 두고 단언 실패로 RED 를 만들었다(스텁은 커밋하지 않았고 GREEN 에서 교체했다). `check tdd-red-evidence` 의 대상 테스트 이름에는 파일 경로 접두까지 넣어야 한다.
- `trading-workbench.spec.ts` 의 기존 실패 3건(deferred-items.md)은 이번에 돌리지 않았다. 이 플랜과 무관하다.

## Verification

- 단위 전체 `pnpm --filter @gh-radar/webapp run test`: **117 파일 · 2218 passed · 1 skipped**
- typecheck: `error TS` 0 · eslint(변경 파일): exit 0
- e2e: `search-page.spec.ts` 5/5 · `sidebar-tree.spec.ts` 8/8 · 회귀 점검 `native-shell` · `home` · `a11y` · `search.spec.ts` 37/37
- 수락 기준 grep: placeholder 1 · `useNativeRefresh(loadHub)` 1 · `max-w-[900px]` 1 · 폴링 0 · `NAV_SEARCH_PAGE` 정의 1 · page.tsx 존재 · e2e `gh-radar:recent-search` 3 · `installNativeApp` 3 · `search.spec.ts` diff 0
- 데이터 경로: 검색은 기존 `searchStocks` 를 무수정으로 재사용했다(실 PostgREST 쪽 변경 없음). 허브는 기존 `/api/scanner`·`/api/themes` 만 읽는다

## Known Stubs

없음. 타일 로딩 중 「…」는 로딩 표시일 뿐이고, 마운트 후 실데이터로 바뀐다.

## TDD Gate Compliance

- Task 1: `test(21-08)` ca4a245 → `feat(21-08)` 440adcf. RED_EVIDENCE_OK
- Task 2: `test(21-08)` 1464e98 → `feat(21-08)` dc00f85. RED_EVIDENCE_OK ×2(search-page-client · app-sidebar)
- REFACTOR 커밋 없음(정리할 것 없음)

## Next Phase Readiness

앱 「검색」 탭(21-10 iOS · 21-12 Android)이 갈 곳이 생겼다. 다음은 21-11.

## Self-Check: PASSED
