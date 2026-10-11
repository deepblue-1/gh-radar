# Quick 260926-o2u — 사이드바 종목검색 제거 · 목록 페이지 뒤로가기 · 페이지 레이아웃 토스 문법 통일

목업: `mockup.html` (이 디렉터리). 사용자 채택 2026-09-26: **본문 폭 C = 900px (검색 페이지 수준)**, 공통 문법은 목업 그대로.

## Locked decisions (재논의 금지)

### D1. 사이드바 「종목검색」 그룹 제거
- `webapp/src/components/layout/app-sidebar.tsx` 의 `NAV_SEARCH_GROUP`(상승률 상위 `/scanner` · 테마 `/themes` · 관심종목 `/watchlist`)과 `<GroupHeading label="종목검색" …>`, 하위 리스트를 모두 제거한다. 세 페이지는 `/search` 허브 타일로만 진입한다(앱 검색 탭과 같은 경험).
- 새 트리 순서: 홈 → 검색 → (트레이딩 그룹, 기존 조건 그대로) → AI 애널리스트.
- `/scanner`, `/themes`, `/themes/*`, `/watchlist` 에 있을 때 사이드바 「검색」 항목이 활성 표시된다(앱 탭바가 검색 탭을 켜는 것과 동일). 그 외 활성 규칙(`samePath`)은 그대로.
- 제거로 쓰이지 않게 되는 import·상수·주석은 정리한다. 드로어 자동 닫힘 로직(app-shell.tsx)은 건드리지 않는다.
- 테스트 갱신: `src/components/layout/__tests__/app-sidebar.test.tsx`, `e2e/specs/sidebar-tree.spec.ts`(TREE_LINKS 계약·종목검색 헤딩 드로어 케이스), `e2e/specs/auth-session.spec.ts` L36 부근(사이드바에 상승률 상위·관심종목이 보인다는 단언). `/search` 허브 타일(`search-page-client.tsx`)은 유지.

### D2. 공통 페이지 헤더 + 뒤로가기
- 공유 컴포넌트를 새로 만든다(예: `webapp/src/components/layout/page-header.tsx`): 제목 줄 = [뒤로가기 버튼(선택)] + `h1` + 오른쪽 보조 영역(선택, 갱신 시각·새로고침 등) / 아래 설명 문단(선택).
  - h1: `text-[22px] font-bold tracking-[-0.02em] text-[var(--fg)]` (검색 페이지 h1 과 동일 규격). 줄 최소 높이 44px.
  - 뒤로가기: lucide `ChevronLeft` 24px, 히트 영역 ≥ 36×40, 왼쪽으로 -8px 당겨 아이콘 광학 정렬, `aria-label="뒤로가기"`, focus-visible ring. 동작 = `window.history.length > 1 ? router.back() : router.push('/search')` (stock-hero.tsx 패턴, fallback 만 `/search`).
  - 설명: `text-[length:var(--t-sm)] text-[var(--muted-fg)]`.
- 뒤로가기 표시: 상승률 상위(`/scanner`) · 테마(`/themes`) · 관심종목(`/watchlist`). 홈 · My page · 검색은 탭 루트라 뒤로가기 없음(헤더 규격만 적용).
- 검색 페이지 h1 도 이 컴포넌트로 바꿔도 되고 그대로 둬도 된다(규격 동일해야 함).

### D3. 본문 폭 900 · 가운데 정렬 (트레이딩 제외)
- 대상: 홈 `/`, My page `/me`, 상승률 상위 `/scanner`, 테마 `/themes`, 관심종목 `/watchlist` (+ 이미 적용된 `/search`).
- 루트 래퍼 = 검색 페이지와 같은 `mx-auto flex w-full max-w-[900px] flex-col gap-4`. 가능하면 공유 상수/컴포넌트(예: `PageContainer` 또는 `PAGE_WRAP`)로 한 곳에 정의하고 검색 페이지도 그걸 쓰게 한다.
- `app-shell.tsx` 의 `<main>` 패딩·클래스는 **변경 금지**(Phase 21 플랜 21-33 이 이 셸에 keep-alive 층을 끼울 예정 — 셸 수정은 충돌). 폭 제한은 페이지/클라이언트 루트에서만.
- `/trading*`, 종목상세 `/stocks/*`, 뉴스·토론, `/themes/[id]`, `/chat` 은 이번 범위 밖(변경 금지).

### D4. 섹션·목록 문법
- 섹션 제목: `text-[15px] font-semibold text-[var(--muted-fg)]` (검색 페이지 `SECTION_TITLE`) + 개수는 알약 대신 `text-[13px] font-semibold text-[var(--faint)]` 평문 + 오른쪽 보조 액션(기존 「전체 복사」 버튼 등) 유지. 섹션 = 제목 행과 내용 사이 gap 8px.
- 적용: 홈 「주도 테마」「개별 급등」, 테마 페이지 소제목들.
- 테마 페이지 순위 목록: 행마다 카드(`ThemeRankRow` 의 border+bg+rounded) → **카드 한 장에 행을 묶고 행 사이 hairline**(`[&+&]:border-t [&+&]:border-[var(--border-subtle)]` 패턴, 검색 페이지 `ROW_DIVIDER` 참고). 컨테이너 = `rounded-[16px] bg-[var(--card)]` + overflow-hidden. 순위·막대·평균값 등 행 내용은 유지.
- 홈 카드(ThemeCard·SoloCard)는 내용이 풍부(뉴스·복사·바텀시트)하므로 **내부 구조와 1열 쌓기를 유지** — 섹션 헤더 문법과 폭만 적용. (목업의 2열 그리드는 채택 범위 아님.)
- 상승률 상위·관심종목의 표/모바일 카드 리스트 내부는 유지(래퍼·헤더만 교체). 단 헤더의 기존 설명 문구·갱신 시각 등 정보는 PageHeader 의 설명/오른쪽 영역으로 옮겨 보존한다.

### D5. 부수 버그 수정
- `--t-2xl` 은 globals.css 에 정의가 없어 `/scanner`·`/me` h1 이 16px 로 떨어져 있다. 두 페이지는 PageHeader 로 교체되며 해소. `error.tsx`·`not-found.tsx`·`surface-placeholder.tsx` 의 `--t-2xl` 사용은 이번 범위 밖이지만, 한 줄 치환(`text-[22px]`)으로 해결 가능하면 함께 고쳐도 된다 — globals.css 에 새 토큰 추가는 하지 않는다(21-36 이 globals.css 수정 예정 → 충돌 회피).

## 동시 작업 주의
- Phase 21 세션이 21-33(app/layout.tsx · app-shell.tsx 읽기 · app/page.tsx · search/page.tsx), 21-35(me/page.tsx), 21-36(globals.css · me-client.tsx) 초안 보유 — 아직 미실행. 파일 수정은 허용받음. **globals.css · app-shell.tsx · app/layout.tsx 는 수정하지 않는다.**
- 커밋 직전 `git status -sb` 재확인, 내 파일만 명시 add(`git add -A` 금지). master 는 origin 대비 docs 커밋 5개 ahead — push 는 사용자 확인 후.
- 2026-09-26 추가 결정: /me 는 900 폭 유지 + 미체결·잔고 표를 세로로 쌓는다(AccountPanel stack prop). 사용자 선택.
