---
phase: 10-theme-classification
plan: 07
type: execute
wave: 6
depends_on: [04, 05, 06]
files_modified:
  - webapp/src/app/themes/page.tsx
  - webapp/src/app/themes/[id]/page.tsx
  - webapp/src/components/theme/themes-client.tsx
  - webapp/src/components/theme/theme-rank-row.tsx
  - webapp/src/components/theme/theme-detail-client.tsx
  - webapp/src/components/theme/theme-edit-dialog.tsx
  - webapp/src/components/theme/theme-chips.tsx
  - webapp/src/components/theme/themes-empty.tsx
  - webapp/src/components/theme/themes-skeleton.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/theme/__tests__/themes-client.test.tsx
autonomous: true
requirements: [THEME-02, THEME-03]
must_haves:
  truths:
    - "/themes 가 내 테마(상단 고정) + 시스템 테마 랭킹(상위3평균 desc)을 표시한다"
    - "/themes/[id] 가 scanner row 를 재사용해 소속 종목을 표시하고 종목 클릭 시 /stocks/[code] 이동"
    - "/stocks/[code] 에 이 종목의 테마 칩(시스템+내 테마)이 표시되고 칩 클릭 시 /themes/[id]"
    - "로그인 유저가 모달로 테마 생성/편집/삭제 + 종목 add/remove + 시스템 테마 fork 가능"
    - "사이드바에 테마 nav 진입점이 추가된다"
  artifacts:
    - path: "webapp/src/components/theme/themes-client.tsx"
      provides: "변형 C 랭킹 + 내 테마 칩 + CRUD 진입 (UI-SPEC S1)"
    - path: "webapp/src/components/theme/theme-chips.tsx"
      provides: "종목 상세 테마 칩 (UI-SPEC S3, D-16)"
    - path: "webapp/src/components/theme/theme-edit-dialog.tsx"
      provides: "유저 테마 편집 모달 (UI-SPEC S4)"
  key_links:
    - from: "stock-detail-client.tsx"
      to: "theme-chips.tsx"
      via: "StockThemeChips stockCode 삽입 (최소 침습)"
      pattern: "ThemeChips"
    - from: "themes/[id]/page.tsx"
      to: "scanner-table.tsx"
      via: "ThemeStockMember → StockWithProximity 매핑 재사용"
      pattern: "scanner-table"
---

<objective>
테마 UI 를 UI-SPEC 변형 C(랭킹) 계약대로 구현한다: `/themes`(내 테마 상단 칩 + 시스템 테마 랭킹 리스트, 상위3평균 강도막대) + `/themes/[id]`(scanner row 재사용 종목 리스트) + `/stocks/[code]` 테마 칩 + 유저 테마 CRUD 모달(생성/편집/삭제/fork/종목 add·remove) + 사이드바 nav. 기존 scanner/watchlist 컴포넌트 재사용, globals.css 토큰만 사용(신규 토큰 금지).

Purpose: THEME-02(표시) + THEME-03(CRUD UI). UI-SPEC S1~S4 + 카피 계약 + mockups/themes-ui-mockup.html 시각 타깃. RESEARCH §Pattern 8 재사용 매핑. Plan 04(시스템 server) + Plan 05(유저 theme-api/훅) 소비.
Output: /themes·/themes/[id] 페이지 + 테마 컴포넌트 + 칩 + 모달 + 사이드바.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-UI-SPEC.md
@.planning/phases/10-theme-classification/10-RESEARCH.md

<interfaces>
재사용 컴포넌트 (신규 작성 금지):

webapp/src/components/scanner/scanner-table.tsx + scanner-card-list.tsx + scanner-skeleton.tsx + scanner-empty.tsx + scanner-error.tsx — props StockWithProximity[]. ThemeStockMember → StockWithProximity 매핑(watchlist-client rowToStock 패턴) 후 직접 사용.
webapp/src/components/watchlist/watchlist-client.tsx — 페이지 헤더 + lg Table/<lg Card 분기 + loading/error/empty 분기 톤(복제 기준).
webapp/src/hooks/use-themes-query.ts (Plan 05) — { systemThemes, myThemes, isLoading, isRefreshing, error, refresh }.
webapp/src/lib/theme-api.ts (Plan 05) — createUserTheme/updateUserTheme/deleteUserTheme/addThemeStock/removeThemeStock/forkSystemTheme/fetchSystemThemeDetail.
webapp/src/lib/auth-context.tsx — 세션 userId (로그인 분기).
webapp/src/components/stock/stock-detail-client.tsx — div.space-y-6 섹션 위에 칩 1줄 삽입(D-16, 최소 침습).
webapp/src/components/layout/app-sidebar.tsx — NAV 배열에 { href:'/themes', label:'테마', icon: <lucide> } 추가. active 패턴 동일.
webapp/src/components/ui/ — dialog, input, badge, button, card, command(종목 검색), skeleton, separator, tooltip.
Phase 6 종목 검색(command, ⌘K) — 모달 종목 추가 검색에 재사용.
Next15 dynamic route: 'use client' + React.use(params) (stock detail page 선례).

UI-SPEC S1 변형 C: ritem grid '34px 1.1fr 1fr auto'. 강도막대 width=|avg|/maxAvg, 색 avg>=0 빨강(--up)/<0 파랑(--down). 출처 도트 네이버=green/알파=blue/AI=purple. 숫자 .mono.
UI-SPEC 카피: '＋ 테마 만들기', '아직 내 테마가 없어요', '상위 3종목 평균 등락률', 출처 푸터 '출처: 네이버 금융 테마 · 알파스퀘어 · AI 보강(Claude) · 일 1회 16:00 KST 갱신', 삭제 확인 등.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: /themes 목록 (변형 C 랭킹 + 내 테마 + CRUD 모달)</name>
  <files>webapp/src/app/themes/page.tsx, webapp/src/components/theme/themes-client.tsx, webapp/src/components/theme/theme-rank-row.tsx, webapp/src/components/theme/theme-edit-dialog.tsx, webapp/src/components/theme/themes-empty.tsx, webapp/src/components/theme/themes-skeleton.tsx, webapp/src/components/theme/__tests__/themes-client.test.tsx</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-UI-SPEC.md §S1 (변형 C 랭킹), §S4 (CRUD 모달), §Copywriting
    - .planning/phases/10-theme-classification/mockups/themes-ui-mockup.html (시각 타깃)
    - webapp/src/components/watchlist/watchlist-client.tsx (헤더/상태 분기 톤), watchlist-empty.tsx (empty)
    - webapp/src/hooks/use-themes-query.ts + lib/theme-api.ts (Plan 05), webapp/src/components/ui/dialog.tsx, command.tsx
  </read_first>
  <action>
    1. app/themes/page.tsx — AppShell + AppSidebar + ThemesClient ('use client', watchlist/page 패턴).
    2. themes-client.tsx — useThemesQuery 구독. 헤더(테마 h1 + 최근 갱신 16:00 KST + sub '지금 뜨는 테마 랭킹'). 내 테마 섹션(상단 가로 스크롤 칩, border primary tint, [＋ 테마 만들기] CTA, 비었으면 themes-empty). 시스템 테마 랭킹 리스트(theme-rank-row map, top3avg desc). 출처 푸터(카피 계약). loading=themes-skeleton, error=role=alert 카드(카피).
    3. theme-rank-row.tsx — ritem grid '34px 1.1fr 1fr auto': 순위(.mono) + 테마명 + 출처 도트(네이버 green/알파 blue/AI purple) + 종목수 + 강도막대(width=|avg|/maxAvg, 색 up/down) + 평균값(.mono t-lg/800). 행 클릭 → /themes/[id](Link), 키보드 포커스.
    4. theme-edit-dialog.tsx — shadcn Dialog: 테마 이름 input + 종목 추가(command 검색 재사용 → addThemeStock) + 현재 종목 리스트(× removeThemeStock) + [취소][저장]. 생성(createUserTheme)/편집(updateUserTheme)/삭제(deleteUserTheme 확인 다이얼로그)/fork(forkSystemTheme) 진입. 저장 로딩, 50-limit P0001 에러 인라인 안내. 비로그인 시 로그인 유도.
    5. themes-empty.tsx ('아직 내 테마가 없어요' + 생성 CTA + 시스템 복사 힌트), themes-skeleton.tsx (scanner-skeleton stagger 패턴).
    6. themes-client.test.tsx — useThemesQuery mock 으로 내 테마 상단+시스템 랭킹 렌더 + top3 desc 정렬 + empty 상태 + 강도막대 색(양/음) 검증.
  </action>
  <verify>
    <automated>pnpm -F webapp test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp test` exits 0 (themes-client.test.tsx green)
    - `grep -q "테마 만들기" webapp/src/components/theme/themes-client.tsx` exits 0 (카피 계약)
    - `grep -rq "상위 3종목 평균 등락률" webapp/src/components/theme/` exits 0 (sort 라벨)
    - `grep -q "Dialog" webapp/src/components/theme/theme-edit-dialog.tsx` exits 0 (shadcn 모달)
    - `grep -q "forkSystemTheme" webapp/src/components/theme/theme-edit-dialog.tsx` exits 0 (fork 진입)
    - themes-client.test.tsx: 내 테마 상단 + 시스템 top3 desc + empty 케이스 존재
  </acceptance_criteria>
  <done>/themes 가 변형 C 랭킹 + 내 테마 칩 + CRUD/fork 모달 + empty/skeleton/error 를 카피 계약대로 렌더, test green.</done>
</task>

<task type="auto">
  <name>Task 2: /themes/[id] 상세 (scanner row 재사용)</name>
  <files>webapp/src/app/themes/[id]/page.tsx, webapp/src/components/theme/theme-detail-client.tsx, webapp/src/components/theme/__tests__/themes-client.test.tsx</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-UI-SPEC.md §S2
    - webapp/src/components/scanner/scanner-table.tsx + scanner-card-list.tsx (StockWithProximity props), scanner-empty/skeleton/error.tsx
    - webapp/src/components/watchlist/watchlist-client.tsx rowToStock (ThemeStockMember→StockWithProximity 매핑 톤)
    - webapp/src/app/stocks/[code]/page.tsx (Next15 use(params) 패턴), lib/theme-api.ts fetchSystemThemeDetail
  </read_first>
  <action>
    1. app/themes/[id]/page.tsx — 'use client' + React.use(params) → AppShell + ThemeDetailClient(id).
    2. theme-detail-client.tsx — fetchSystemThemeDetail(id) (또는 유저 테마면 Supabase). 헤더(테마명 h1 + 출처 뱃지 + 종목수 + 상위3평균 + 뒤로가기, 유저 테마면 [편집]/[종목 추가·제거] 노출 → theme-edit-dialog 재사용, 시스템은 read-only). 본문: ThemeStockMember[] → StockWithProximity 매핑 → lg+ scanner-table 재사용 / <lg scanner-card-list 재사용. 행 클릭 → /stocks/[code](scanner Link 내장). ⭐ WatchlistToggle. loading/empty/error = scanner-skeleton/empty/error 재사용. 종목별 출처 표기.
    3. themes-client.test.tsx 에 상세 매핑(ThemeStockMember→StockWithProximity) + 빈 상태 케이스 추가.
  </action>
  <verify>
    <automated>pnpm -F webapp test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp test` exits 0
    - `grep -q "use(params)" webapp/src/app/themes/[id]/page.tsx` exits 0 OR React.use(params) 사용
    - `grep -q "scanner-table" webapp/src/components/theme/theme-detail-client.tsx` exits 0 OR ScannerTable import
    - theme-detail-client 가 ThemeStockMember → StockWithProximity 매핑 후 scanner 컴포넌트 재사용
    - 시스템 테마는 편집 버튼 미노출, 유저 테마는 노출 분기 존재
  </acceptance_criteria>
  <done>/themes/[id] 가 scanner row 재사용 + 유저/시스템 분기 + 종목 클릭 이동, test green.</done>
</task>

<task type="auto">
  <name>Task 3: 종목 상세 테마 칩 (D-16) + 사이드바 nav</name>
  <files>webapp/src/components/theme/theme-chips.tsx, webapp/src/components/stock/stock-detail-client.tsx, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/theme/__tests__/themes-client.test.tsx</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-UI-SPEC.md §S3 (칩 + overflow), §재사용 컴포넌트(app-sidebar nav)
    - webapp/src/components/stock/stock-detail-client.tsx (div.space-y-6 삽입 위치 — 최소 침습)
    - webapp/src/components/layout/app-sidebar.tsx (NAV 배열 + active 패턴)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Code Examples (theme_stocks 역조회 nested embed)
  </read_first>
  <action>
    1. theme-chips.tsx — StockThemeChips({ stockCode }): supabase theme_stocks 역조회(idx_theme_stocks_code) — eq stock_code + is effective_to null + themes!inner(id,name,is_system,owner_id). RLS 가 시스템+내 테마 한 번에 필터(단일 테이블 이점). 칩 = 테마명 + 출처 도트(시스템 source / 내 테마 accent border). 칩 클릭 → /themes/[id](Link). 최대 ~6개 + '+N' overflow(popover 전체). 분류 테마 없으면 섹션 숨김 or 옅은 '분류된 테마 없음'. PostgREST Array.isArray 방어.
    2. stock-detail-client.tsx — div.space-y-6 섹션 위에 <StockThemeChips stockCode={stock.code} /> 1줄 삽입(기존 구조 최소 침습, D-16).
    3. app-sidebar.tsx — NAV 배열에 { href: '/themes', label: '테마', icon: <lucide 아이콘 예: Layers 또는 Tag> } 추가(scanner/watchlist 사이 또는 뒤). active aria-current 패턴 동일.
    4. themes-client.test.tsx 에 칩 역조회 매핑(시스템+유저 분류) + overflow + 빈 분류 케이스 추가.
  </action>
  <verify>
    <automated>pnpm -F webapp test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp test` exits 0
    - `pnpm -F webapp build` exits 0
    - `grep -q "ThemeChips" webapp/src/components/stock/stock-detail-client.tsx` exits 0 (칩 삽입)
    - `grep -q "/themes" webapp/src/components/layout/app-sidebar.tsx` exits 0 (nav 추가)
    - `grep -q "effective_to" webapp/src/components/theme/theme-chips.tsx` exits 0 (active 역조회)
    - 칩 overflow(+N) + 빈 분류 케이스가 테스트에 존재
  </acceptance_criteria>
  <done>종목 상세 테마 칩(시스템+내 테마, overflow) + 사이드바 nav 추가, build+test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| webapp(client) → Supabase theme_stocks 역조회 | 칩 역조회 (RLS 가 시스템+내 테마 필터) |
| webapp(authenticated) → theme-api CRUD | 유저 테마 모달 편집 (Plan 05 경로) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-07-01 | XSS | 스크랩 테마명/종목명 렌더 | mitigate | React 자동 이스케이프(JSX). 외부 입력은 Plan 03 에서 zod 검증/정규화 후 저장 |
| T-10-07-02 | Information Disclosure | 칩 역조회가 타 유저 테마 노출 | mitigate | theme_stocks RLS read 정책(is_system OR owner_id=auth.uid())이 DB 레벨 필터(Plan 02) |
| T-10-07-03 | Tampering | 모달에서 시스템 테마 편집 시도 | mitigate | 시스템 테마는 편집 버튼 미노출(UI) + RLS WITH CHECK is_system=false(DB, Plan 02) 이중 |
| T-10-07-04 | Information Disclosure | fetch 에러 내부 메시지 노출 | mitigate | 고정 한글 카피('테마를 불러오지 못했습니다') + console.error 분리(09.2 선례) |
</threat_model>

<verification>
- `pnpm -F webapp test` green (themes-client + 상세 + 칩)
- `pnpm -F webapp build` exits 0
- 변형 C 랭킹 + scanner row 재사용 + 칩 + CRUD 모달 + nav 가 UI-SPEC 카피/구조대로
- (시각 최종 검증은 Plan 08 E2E + 사용자 mockup 대조)
</verification>

<success_criteria>
- SC#5 충족: /themes 목록(내 테마 상단 + 시스템, 상위3평균 정렬) + /themes/[id] 종목 리스트 + 출처 표기
- SC#6 충족(UI): 유저 테마 생성/편집/삭제 + 종목 add/remove + fork 모달
- D-13/14/15/16 충족: 내 테마 상단 / 상위3평균 강도막대 / scanner row 상세 / 종목 칩
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-07-SUMMARY.md`
</output>
