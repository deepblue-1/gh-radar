---
phase: 10-theme-classification
plan: 07
subsystem: ui
tags: [next15, react, themes, scanner-reuse, shadcn, supabase-rls, command-search, dialog, popover, typescript]

# Dependency graph
requires:
  - phase: 10-theme-classification (Plan 04)
    provides: GET /api/themes(시스템 목록 top3 desc) + GET /api/themes/:id(상세 ThemeStockMember[]) — fetchSystemThemes/Detail 소비
  - phase: 10-theme-classification (Plan 05)
    provides: theme-api.ts(createUserTheme/updateUserTheme/deleteUserTheme/addThemeStock/removeThemeStock/forkSystemTheme/fetchMyThemes/isThemeStockLimitError) + useThemesQuery 훅
  - phase: 06.2-auth-watchlist
    provides: scanner-table/scanner-card-list/scanner-skeleton/empty/error(StockWithProximity props) + watchlist-client(헤더/상태 분기 톤) + WatchlistToggle + auth-context + GlobalSearch(command/useDebouncedSearch)
  - phase: 06-stock-detail
    provides: stock-detail-client.tsx(칩 삽입 위치) + 'use client'+use(params) dynamic route 선례
provides:
  - "/themes 페이지 — 변형 C 랭킹(시스템 top3 desc) + 내 테마 상단 칩 + 출처 푸터 + CRUD 모달 진입"
  - "/themes/[id] 페이지 — ThemeStockMember→StockWithProximity 매핑 후 scanner-table/card-list 재사용 + 유저/시스템 분기"
  - "StockThemeChips — 종목 상세 theme_stocks 역조회 칩(시스템+내 테마, overflow popover, D-16)"
  - "ThemeEditDialog — 유저 테마 생성/편집/삭제/fork + 종목 add·remove(command 검색) + P0001 50-limit 인라인 안내"
  - "ThemeRankRow/ThemeSourceBadges/ThemesEmpty/ThemesSkeleton — 변형 C 랭킹 행 + 토큰 출처 뱃지 + empty/loading"
  - "사이드바 테마 nav(/themes, Layers 아이콘)"
  - "theme-api.fetchMyThemeDetail — 유저 테마 상세(theme_stocks→stocks→stock_quotes nested embed, Supabase RLS owner-only)"
affects: [10-08-deploy-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scanner-table/card-list 직접 재사용: ThemeStockMember → StockWithProximity 매핑(watchlist rowToStock 톤) 후 props 그대로 — /themes/[id] 종목 행(D-15)"
    - "유저 테마 상세 = Supabase nested embed(theme_stocks→stocks!inner→stock_quotes), 시스템 = Express fetchSystemThemeDetail, 404 폴백으로 단일 라우트가 양쪽 처리"
    - "출처 뱃지 도트를 globals.css 토큰 기반(naver=--flat/alpha=--down/ai=--accent+--primary)으로 — 목업의 인라인 oklch literal 대신(하드 룰 우선)"
    - "CRUD 모달은 fork 오픈 즉시 스냅샷 생성 → 새 id 확보 후 add/remove 즉시 반영, create 는 첫 종목 add/저장 시 lazy createUserTheme"
    - "theme_stocks 역조회 칩 = RLS read_theme_stocks(is_system OR owner)로 시스템+내 테마 단일 쿼리 + Array.isArray 방어(watchlist 선례)"

key-files:
  created:
    - webapp/src/app/themes/page.tsx
    - webapp/src/app/themes/[id]/page.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/theme/theme-rank-row.tsx
    - webapp/src/components/theme/theme-detail-client.tsx
    - webapp/src/components/theme/theme-edit-dialog.tsx
    - webapp/src/components/theme/theme-chips.tsx
    - webapp/src/components/theme/theme-source-badge.tsx
    - webapp/src/components/theme/themes-empty.tsx
    - webapp/src/components/theme/themes-skeleton.tsx
    - webapp/src/components/theme/__tests__/themes-client.test.tsx
  modified:
    - webapp/src/lib/theme-api.ts
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/components/layout/app-sidebar.tsx

key-decisions:
  - "출처 뱃지 도트를 globals.css 토큰만으로 매핑(naver=--flat / alphasquare=--down(블루, 목업 oklch 0.63 0.18 250 정확 일치) / ai=--accent 뱃지+--primary 도트, UI-SPEC Color 가 Accent 를 AI 출처 전용 예약) — 목업의 인라인 oklch(green/purple) literal 은 하드 룰(STATE decisions·MEMORY·본 plan 제약)에 따라 폐기. 세 출처 시각 구분 유지하며 신규 토큰/하드코딩 0"
  - "유저 테마 상세 fetcher(fetchMyThemeDetail) 를 theme-api 에 추가 — /api/themes/:id 가 is_system=true 만 노출(Plan 04 T-10-04-04)하므로 유저 테마 404. watchlist nested embed 톤(theme_stocks→stocks!inner→stock_quotes)으로 1쿼리 조인, RLS owner 자동 필터, active(effective_to IS NULL)만 클라이언트 필터(embed 필터 PostgREST 제약)"
  - "상세 fetch 는 시스템(fetchSystemThemeDetail) 우선 → ApiClientError 404 시 유저(fetchMyThemeDetail Supabase) 폴백 — id 가 시스템/유저인지 사전 불명이라 단일 진입으로 양쪽 처리. isSystem 플래그가 read-only vs 편집 분기 구동"
  - "ThemeEditDialog fork 는 오픈 즉시 forkSystemTheme 스냅샷 → 새 유저 테마 id 확보(이후 add/remove 즉시 DB 반영). create 는 lazy — 첫 종목 add 또는 저장 시 createUserTheme(빈 테마 남발 방지). P0001 은 isThemeStockLimitError 로 종목/테마 한도 분기 인라인 안내"
  - "theme-detail-client fetch 에러는 고정 한글 카피('테마를 불러오지 못했습니다')만 — 내부 PostgREST/RLS 메시지 미노출(T-10-07-04, 09.2 선례). console 분리 없이 state 유지 stale-but-visible"
  - "scanner-table+card-list 둘 다 렌더(반응형 duality lg/＜lg)라 테스트에서 종목명이 2회 노출 → getAllByText 사용. memberToStock 은 price/changeRate/tradeAmount 만 실값, 나머지 0/now 폴백(ThemeStockMember 최소 필드)"

patterns-established:
  - "테마 종목 행 = scanner 컴포넌트 재사용: ThemeStockMember → StockWithProximity 매핑 1함수 후 ScannerTable/ScannerCardList 직접 — 신규 종목 테이블 작성 0(D-15, RESEARCH Don't Hand-Roll)"
  - "출처 뱃지 = ThemeSourceBadges(sources[]) 공통 컴포넌트 — 랭킹 행·상세 헤더·칩이 동일 토큰 도트 규칙 공유. 'user' 출처는 미표시"
  - "유저 테마 모달 = ThemeEditDialog 단일 컴포넌트가 create/edit/fork 3모드 + 종목 add/remove + 삭제 확인 흡수 — /themes 상단 CTA + /themes/[id] [편집] 양쪽 재사용"
  - "theme_stocks 역조회 칩 = idx_theme_stocks_code + RLS 단일 쿼리(시스템+내 테마) + overflow popover(최대 6 + '+N') — 종목 상세 최소 침습 1줄 삽입(D-16)"

requirements-completed: [THEME-02, THEME-03]

# Metrics
duration: 13min
completed: 2026-06-09
---

# Phase 10 Plan 07: Themes UI Summary

**테마 UI 를 UI-SPEC 변형 C(랭킹) 계약대로 구현 — `/themes`(내 테마 상단 칩 + 시스템 랭킹 리스트, 상위3평균 강도막대) + `/themes/[id]`(scanner-table/card-list 재사용 종목 리스트, 유저/시스템 분기) + `/stocks/[code]` 테마 칩(theme_stocks 역조회, D-16) + 유저 테마 CRUD 모달(생성/편집/삭제/fork + 종목 add·remove, P0001 인라인 안내) + 사이드바 nav. 기존 scanner/watchlist/command 컴포넌트 재사용, globals.css 토큰만(신규 토큰/하드코딩 색상 0).**

## Performance

- **Duration:** 약 13분 (12:02 → 12:16 UTC, 3태스크)
- **Tasks:** 3 (Task 1 /themes 목록, Task 2 /themes/[id] 상세, Task 3 종목 칩 + nav)
- **Files:** 11 신규(페이지 2 + 테마 컴포넌트 8 + 테스트 1) + 3 수정(theme-api.ts, stock-detail-client.tsx, app-sidebar.tsx)
- **Tests:** 18 신규(themes-client.test.tsx) — 전체 webapp 206 passed / 1 skipped (테마 무관 discussion 3 실패는 사전 존재, deferred)
- **Build:** `pnpm -F webapp build` exit 0 — /themes(7.82 kB) + /themes/[id](5.2 kB) 컴파일

## Accomplishments

- **/themes 변형 C 랭킹(Task 1):** ThemesClient 가 useThemesQuery 구독 → 헤더(테마 h1 + '지금 뜨는 테마 랭킹 — 상위 3종목 평균 등락률' + 최근 갱신 16:00 KST) + 내 테마 상단 가로 스크롤 칩(primary tint border, [＋ 테마 만들기] CTA / empty) + 시스템 테마 랭킹(ThemeRankRow map, 서버 top3 desc 순서를 1,2,… 순위로). ThemeRankRow = ritem grid `34px 1.1fr 1fr auto`(순위 mono top3 빨강 + 테마명 + 출처 도트 + 종목수 + 강도막대 width=|avg|/maxAvg up/down 색 + 평균값 mono t-lg/800). 출처 푸터 카피 계약. loading=ThemesSkeleton(stagger), error=role=alert 카드.
- **유저 테마 CRUD 모달(Task 1):** ThemeEditDialog(shadcn Dialog) 가 생성/편집/삭제/fork + 종목 add(Phase 6 command/useDebouncedSearch 재사용)/remove(× 즉시) 흡수. 저장 로딩, P0001 50-limit(종목/테마) 을 isThemeStockLimitError 로 식별해 인라인 안내, 비로그인 시 로그인 유도. fork 는 오픈 즉시 스냅샷 → add/remove 즉시 반영, create 는 lazy(빈 테마 방지).
- **/themes/[id] scanner 재사용(Task 2):** ThemeDetailClient 가 시스템(fetchSystemThemeDetail) 우선 → 404 시 유저(fetchMyThemeDetail Supabase RLS) 폴백. 헤더(테마명 h1 + 출처 뱃지 + 종목수 + 상위3평균 + 뒤로가기, 유저 테마면 [편집]→ThemeEditDialog 재사용, 시스템 read-only). 본문 = ThemeStockMember[] → StockWithProximity 매핑 후 lg+ ScannerTable / ＜lg ScannerCardList **직접 재사용**(종목 클릭 → /stocks/[code] scanner Link 내장 + ⭐ WatchlistToggle). loading/empty/error = scanner-skeleton/카피/scanner-error 재사용.
- **theme-api.fetchMyThemeDetail(Task 2):** /api/themes/:id 가 유저 테마 404 라 유저 상세는 Supabase 직접. theme_stocks→stocks!inner(code/name/market)→stock_quotes(price/change_rate/trade_amount) nested embed(watchlist 톤) + active(effective_to IS NULL) 클라이언트 필터 + 시세 부재 0 폴백.
- **종목 상세 테마 칩(Task 3, D-16):** StockThemeChips 가 theme_stocks 역조회(eq stock_code + is effective_to null + themes!inner(id,name,is_system,owner_id)) — RLS read_theme_stocks 가 시스템+내 테마 한 번에 필터(단일 테이블 이점, T-10-07-02). 칩 = 시스템(flat 도트)/내 테마(accent border), 클릭 → /themes/[id]. 최대 6개 + '+N' popover overflow. PostgREST 1:1 object/1:N array 방어, 역조회 에러 조용히 폴백. stock-detail-client 의 div.space-y-6 위에 1줄 삽입(최소 침습).
- **사이드바 nav(Task 3):** app-sidebar NAV 에 { /themes, 테마, Layers } 추가(스캐너↔관심종목 사이). 기존 active aria-current 패턴 동일.

## Task Commits

각 태스크 원자적 커밋 (한글, Co-Authored-By 없음):

1. **Task 1: /themes 목록 — 변형 C 랭킹 + 내 테마 칩 + CRUD 모달** - `0745247` (feat)
2. **Task 2: /themes/[id] 상세 — scanner row 재사용 + 유저/시스템 분기** - `709f074` (feat)
3. **Task 3: 종목 상세 테마 칩(D-16) + 사이드바 테마 nav** - `5202b8d` (feat)

**Plan metadata:** (아래 final commit)

## Files Created/Modified

- `webapp/src/app/themes/page.tsx` - /themes 페이지(AppShell + AppSidebar + ThemesClient)
- `webapp/src/app/themes/[id]/page.tsx` - /themes/[id] 페이지('use client' + use(params))
- `webapp/src/components/theme/themes-client.tsx` - 변형 C 랭킹 + 내 테마 칩 + CRUD 진입 + 출처 푸터
- `webapp/src/components/theme/theme-rank-row.tsx` - ritem 랭킹 행(강도막대 + 순위 + 출처 + 평균값)
- `webapp/src/components/theme/theme-detail-client.tsx` - 상세(scanner 재사용 + 유저/시스템 분기 + fetch 폴백)
- `webapp/src/components/theme/theme-edit-dialog.tsx` - 유저 테마 CRUD/fork 모달(command 검색 + P0001 안내)
- `webapp/src/components/theme/theme-chips.tsx` - StockThemeChips 종목 상세 역조회 칩(overflow popover)
- `webapp/src/components/theme/theme-source-badge.tsx` - ThemeSourceBadges 토큰 도트 출처 뱃지(공통)
- `webapp/src/components/theme/themes-empty.tsx` - 내 테마 empty 카피 + 생성 CTA
- `webapp/src/components/theme/themes-skeleton.tsx` - 랭킹 행 skeleton(stagger)
- `webapp/src/components/theme/__tests__/themes-client.test.tsx` - 18 테스트(랭킹/매핑/칩/overflow/empty/에러)
- `webapp/src/lib/theme-api.ts` - fetchMyThemeDetail 추가(유저 테마 상세 nested embed)
- `webapp/src/components/stock/stock-detail-client.tsx` - <StockThemeChips> 1줄 삽입(D-16)
- `webapp/src/components/layout/app-sidebar.tsx` - NAV 에 테마 항목 추가(Layers)

## Decisions Made

- **출처 도트 토큰화 (하드 룰 > 목업 literal):** UI-SPEC 목업은 도트에 인라인 oklch(naver=green oklch(0.62 0.17 145) / ai=purple oklch(0.62 0.20 300))를 썼으나, 프로젝트 하드 룰(globals.css 토큰만, 신규 토큰/하드코딩 금지 — STATE decisions·MEMORY·본 plan 제약)이 목업 리터럴보다 우선. naver=--flat / alphasquare=--down(블루, 목업 oklch 0.63 0.18 250 정확 일치) / ai=--accent 뱃지 + --primary 도트(UI-SPEC Color 가 Accent 를 AI 출처 전용 예약)로 매핑 → 세 출처 시각 구분 유지하며 색 리터럴 0.
- **유저 테마 상세 fetcher 신설:** Plan 04 /api/themes/:id 는 is_system=true 만 노출(T-10-04-04 유저 테마 격리). 따라서 유저 테마 상세는 Supabase 직접 — fetchMyThemeDetail 추가(theme_stocks→stocks!inner→stock_quotes nested embed, watchlist 톤). PostgREST embed 에 effective_to 필터 불가라 active 는 클라이언트 필터, 시세 부재 종목 0 폴백.
- **상세 단일 진입 + 404 폴백:** id 가 시스템/유저인지 사전 불명 → fetchSystemThemeDetail 먼저, ApiClientError 404 시 fetchMyThemeDetail 폴백. 반환 theme.isSystem 이 read-only(시스템) vs [편집](유저) 분기 구동. 잘못된 id 는 양쪽 실패 → 고정 에러 카피.
- **fork 즉시 스냅샷 / create lazy:** ThemeEditDialog fork 모드는 오픈 즉시 forkSystemTheme → 새 id 확보(이후 add/remove 가 즉시 DB). create 모드는 첫 종목 add 또는 저장 시 createUserTheme(빈 테마 남발 방지). P0001 은 종목(LIMIT_MESSAGE)/테마(THEME_LIMIT_MESSAGE) 별 인라인.
- **scanner 재사용 매핑:** memberToStock 이 ThemeStockMember(code/name/market/price/changeRate/tradeAmount/source)를 StockWithProximity 로 — price/changeRate/tradeAmount 실값, 나머지(changeAmount/volume/open/high/low/marketCap/upper/lower/proximity) 0, updatedAt now 폴백. scanner-table/card-list props 변경 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] theme-api 에 fetchMyThemeDetail 추가 (유저 테마 상세 fetch 부재)**
- **Found during:** Task 2 (/themes/[id] 유저 테마 분기)
- **Issue:** PLAN body 는 "fetchSystemThemeDetail(id) (또는 유저 테마면 Supabase)" 라고만 명시 — Plan 05 theme-api 에 유저 테마 단건 상세 fetcher 가 없음(fetchMyThemes 는 목록만, count embed). /api/themes/:id 는 유저 테마 404(Plan 04 T-10-04-04)라 시스템 라우트로 못 가져옴. 유저 테마 상세를 못 가져오면 Task 2 의 유저 테마 분기를 완성 불가.
- **Fix:** theme-api.ts 에 fetchMyThemeDetail(supabase, id) 추가 — themes + theme_stocks→stocks!inner→stock_quotes nested embed(watchlist fetchWatchlist 톤), is_system=false + RLS owner 자동 필터, active(effective_to IS NULL) 클라이언트 필터, 시세 부재 0 폴백. 반환 타입은 fetchSystemThemeDetail 과 동일(ThemeWithStats & { stocks }).
- **Files modified:** webapp/src/lib/theme-api.ts
- **Verification:** typecheck exit 0(Omit<RawMyThemeRow,'theme_stocks'> 로 base 충돌 해소) + 상세 폴백 테스트(시스템 404 → fetchMyThemeDetail → [편집] 노출) green.
- **Committed in:** `709f074` (Task 2 commit)

**2. [Rule 1 - Bug] 테스트 종목명 단언을 getAllByText 로 (scanner 반응형 duality 중복 노출)**
- **Found during:** Task 2 (상세 매핑 테스트)
- **Issue:** ThemeDetailClient 가 ScannerTable(lg+) + ScannerCardList(＜lg) 둘 다 렌더(반응형 duality, scanner-client 동형)라 동일 종목명이 DOM 에 2회 → getByText 가 "multiple elements" 로 실패. 컴포넌트는 정상, 테스트 단언이 부정확.
- **Fix:** 상세 종목 단언을 getAllByText(...).length>0 로 변경(global-search 테스트 Test 1 의 getAllByLabelText 선례 동형). ApiClientError 생성도 옵션 객체 시그니처({code,message,status})로 교정.
- **Files modified:** webapp/src/components/theme/__tests__/themes-client.test.tsx
- **Verification:** 5 상세 테스트 green.
- **Committed in:** `709f074` (Task 2 commit)

**3. [Rule 1 - Bug] themes-client 테스트 sort 라벨 단언을 getAllByText 로 (카피 2곳 노출)**
- **Found during:** Task 1 (랭킹 렌더 테스트)
- **Issue:** '상위 3종목 평균 등락률' 카피가 헤더 sub + sort pill 2곳에 노출(UI-SPEC S1 디자인대로)인데 getByText 가 multiple 로 실패.
- **Fix:** getAllByText(/상위 3종목 평균 등락률/).length>0 로 변경. 카피 계약 자체는 유지.
- **Files modified:** webapp/src/components/theme/__tests__/themes-client.test.tsx
- **Verification:** 8 Task 1 테스트 green.
- **Committed in:** `0745247` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking 데이터 레이어 보강, 2 테스트 단언 버그). 프로덕션 UI 컴포넌트는 UI-SPEC 변형 C 계약 + 카피 그대로 — fetchMyThemeDetail 만 PLAN 이 암시한 "유저면 Supabase" 를 구체 함수로 구현.
**Impact on plan:** scope creep 없음. 모든 acceptance-criteria 충족(test green, build exit 0, 테마 만들기/상위3종목평균/Dialog/forkSystemTheme/use(params)/ScannerTable/ThemeChips/effective_to/`/themes` grep PASS).

## Threat Surface

플랜 `<threat_model>` 의 T-10-07-01~04 만 도입(신규 surface 없음). 모두 설계대로 mitigate:
- **T-10-07-01 (XSS):** 스크랩 테마명/종목명은 JSX 자동 이스케이프로 렌더(dangerouslySetInnerHTML 0). 외부 입력은 Plan 03 zod 정규화 후 저장.
- **T-10-07-02 (Information Disclosure):** StockThemeChips 역조회가 user_id 필터 없이 호출 — RLS read_theme_stocks(is_system OR owner_id=auth.uid())가 DB 레벨 필터. fetchMyThemeDetail 도 is_system=false + RLS owner. 타 유저 테마 노출 0.
- **T-10-07-03 (Tampering):** 시스템 테마는 [편집] 버튼 미노출(UI) + theme-api 가 모든 유저 쓰기에 is_system=false 명시(DB RLS WITH CHECK) 이중. ThemeDetailClient 의 ThemeEditDialog 는 isUserTheme 일 때만 마운트.
- **T-10-07-04 (Information Disclosure):** ThemeDetailClient fetch 에러는 고정 한글 카피('테마를 불러오지 못했습니다')만 — 내부 PostgREST/RLS 메시지 미노출(09.2 선례). StockThemeChips 역조회 에러도 조용히 '분류된 테마 없음' 폴백(메시지 누출 0, 테스트 실증).

## Issues Encountered

- **theme-api 인터페이스 확장 충돌(typecheck):** RawMyThemeDetailRow extends RawMyThemeRow 가 theme_stocks 컬럼을 다른 타입(joined vs count)으로 override → TS2430. Omit<RawMyThemeRow,'theme_stocks'> 로 base 의 theme_stocks 를 제거 후 joined 타입 재선언으로 해소. 스칼라 필드는 상속 유지.
- **scanner 반응형 duality 의 DOM 중복:** scanner-table + card-list 가 둘 다 마운트(CSS lg/＜lg 분기, jsdom 은 양쪽 렌더)라 종목명/카피가 2회 노출 → 테스트는 getAllByText 사용 필수. 컴포넌트 동작은 정상(브라우저는 한쪽만 표시).

## Known Stubs

None — 모든 데이터가 실제 소스에 연결됨. /themes·/themes/[id] 는 Plan 04 Express + Plan 05 Supabase 데이터 레이어 소비, 칩은 theme_stocks 역조회. 빈 배열(시스템 테마 시드 부재 — theme-sync 배포 Plan 08 전)은 정상 empty 상태로 처리(stub 아님).

## User Setup Required

None - 본 plan 은 webapp UI 만(페이지 + 컴포넌트 + 테스트). 데이터 레이어(Plan 04 /api/themes, Plan 05 theme-api/훅)는 기존 운영, themes/theme_stocks 테이블은 Plan 02 production live. 외부 서비스/시크릿 추가 불필요. 실 시스템 테마 데이터는 theme-sync 워커(Plan 03 코드) 첫 cycle(Plan 08 배포) 이 채움 — 배포 전에는 빈 랭킹 정상.

## Next Phase Readiness

- **Plan 08 (deploy + E2E) 준비 완료:** /themes·/themes/[id] 페이지 + 칩 + nav 가 production 빌드 통과(build exit 0). Playwright E2E 가 /themes 랭킹 렌더 + 칩 클릭 이동 + 모달 CRUD 를 시각/기능 검증 가능. 시스템 테마 시드는 theme-sync 첫 cycle(THEME_SYNC_CLASSIFY_ENABLED=true + ANTHROPIC secret) 이후 채워짐.
- **시각 최종 검증:** UI-SPEC 변형 C 목업(themes-ui-mockup.html) 대조 + 사용자 시각 확인은 Plan 08 E2E + 수동 검토 책임(본 plan 은 구조/카피/토큰 계약 충족까지).
- **Concern:** 시스템 테마 시드 0 시 /themes 랭킹은 '표시할 시스템 테마가 아직 없습니다' empty(정상). 출처 도트는 토큰 기반(목업 green/purple literal 폐기) — 사용자 시각 검토 시 색 차이 인지 필요(하드 룰 우선 결정, 위 Decisions 기록). 비로그인 시 내 테마 섹션은 로그인 유도(myThemes=[] 안전).

## Self-Check: PASSED

- 11 신규 파일(themes/page.tsx, themes/[id]/page.tsx, themes-client/theme-rank-row/theme-detail-client/theme-edit-dialog/theme-chips/theme-source-badge/themes-empty/themes-skeleton.tsx + test) + 3 수정(theme-api.ts/stock-detail-client.tsx/app-sidebar.tsx) 전부 존재 확인
- 커밋 `0745247`(Task 1) / `709f074`(Task 2) / `5202b8d`(Task 3) git log 확인
- 18 신규 테스트 green + typecheck exit 0 + build exit 0(/themes + /themes/[id] 컴파일) + 전체 206 passed(사전 discussion 3 실패 외 신규 실패 0)
- grep: 테마 만들기/상위 3종목 평균 등락률/Dialog/forkSystemTheme(Task 1) + use(params)/ScannerTable/isUserTheme(Task 2) + ThemeChips/`/themes`/effective_to(Task 3) 전부 PASS
- 색 리터럴 감사: theme 파일군 + stock-detail-client + app-sidebar 코드에 하드코딩 hex/oklch 0(전부 var(--token))

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
