---
phase: 06-stock-search-detail
plan: 03
subsystem: webapp/global-search
tags: [cmdk, command-dialog, shadcn, hotkey, debounce, vitest, rtl, a11y]
requires:
  - 06-01 (shadcn command 블록 + cmdk + vitest/RTL setup)
  - 06-02 (searchStocks · useDebouncedSearch · useCmdKShortcut)
  - webapp/src/components/layout/app-shell.tsx (nav prop)
  - webapp/src/components/ui/{command,badge}.tsx
provides:
  - "GlobalSearch — ⌘K CommandDialog + SearchTrigger 통합 컴포넌트 (SRCH-01/02)"
  - "SearchTrigger — 헤더 readonly input 트리거 (desktop lg+) + 모바일 아이콘 버튼"
  - "AppShell 기본 nav = <GlobalSearch /> 자동 마운트"
affects:
  - webapp/src/components/layout/app-header.tsx (disabled Input placeholder 제거)
  - webapp/src/components/layout/app-shell.tsx (GlobalSearch import + nav 기본값)
  - /scanner 및 향후 /stocks/:code 페이지 헤더 UX
tech_stack_added: []
patterns:
  - "CommandDialog 래퍼가 Command props(shouldFilter 등) 를 상속하지 않음 → 내부 <Command shouldFilter={false}> 로 직접 래핑해 cmdk 필터링 차단"
  - "CommandItem value={stock.code} — 서버 name.ilike OR code.ilike 결과 키 충돌 방지 (Pitfall 2)"
  - "router.push → setOpen(false) → setQuery('') 순서로 cleanup (Pitfall 5)"
  - "AppShell nav prop 3값 모드: undefined → 기본 <GlobalSearch /> · null → 비활성 · ReactNode → 그대로 주입"
key_files_created:
  - webapp/src/components/search/search-trigger.tsx
  - webapp/src/components/search/global-search.tsx
  - webapp/src/components/search/__tests__/global-search.test.tsx
key_files_modified:
  - webapp/src/components/layout/app-header.tsx
  - webapp/src/components/layout/app-shell.tsx
decisions:
  - "shadcn command.tsx 가 CommandLoading 을 export 하지 않음 → 플랜의 <CommandLoading> 을 <div class=text-muted-fg> 로 치환 (Rule 3 blocking, 카피 '검색 중…' 동일)"
  - "CommandDialog 는 shouldFilter prop 을 내부 Command 로 forward 하지 않음 → 내부 <Command shouldFilter={false}> 로 직접 래핑 (플랜 주의사항 그대로 채택)"
  - "AppShell 의 nav 기본값 판별은 `nav === undefined` — `null` 은 의도적 비활성으로 존중 (Phase 3 /design 카탈로그 같은 예외 경로 대비)"
  - "tests 파일 상단에 `/// <reference types=\"@testing-library/jest-dom\" />` 추가 — tsconfig include 밖의 tests/setup.ts 타입 확장 보완 (Rule 3 blocking, tsc 에러 해결)"
metrics:
  duration_minutes: 3
  commits: 3
  tasks_completed: 3
completed_date: 2026-04-15
---

# Phase 06 Plan 03: GlobalSearch ⌘K CommandDialog Summary

**One-liner:** ⌘K/헤더 클릭으로 열리는 전역 CommandDialog + SearchTrigger 를 구현하고 AppShell 기본 nav 로 자동 마운트하여 SRCH-01·SRCH-02 를 완결, 9개 integration test 로 open/close · 4-state 카피 · shouldFilter=false · router.push 동작을 결정론적으로 증명.

## Context

Phase 06 Wave 2 — Plan 02 (stock-api + 2 훅) 위에 UI 레이어를 얹는다. shadcn Command/Dialog 블록(Wave 0 산출물) 과 Plan 02 훅들을 조립해 SRCH-01 (이름/코드 검색) + SRCH-02 (자동완성 드롭다운) 을 한 번에 닫는다. 06-UI-SPEC §Copywriting Contract 의 한글 카피 6종을 정확 일치시킨다.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | SearchTrigger + app-header placeholder 제거 | `e360bd1` | search-trigger.tsx (신규), app-header.tsx (Input 블록 제거) |
| 2 | GlobalSearch CommandDialog + 9 integration tests | `e185306` | global-search.tsx, __tests__/global-search.test.tsx |
| 3 | AppShell nav 기본값 = <GlobalSearch /> | `83c2694` | app-shell.tsx (import + navContent 분기) |

## Verification

- `pnpm --filter @gh-radar/webapp test -- --run` → **66 passed (9 files)** — Plan 02 의 57개 + 본 plan 9개. 회귀 0.
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit` → **EXIT 0**.
- `pnpm --filter @gh-radar/webapp exec playwright test --list` → **1 smoke test** (변화 없음).
- Acceptance criteria 모두 충족:
  - SearchTrigger: `aria-label="종목 검색 열기"` · `⌘K` 키캡 · `종목명 또는 코드 검색` 카피 ✓
  - app-header: `placeholder="종목 검색 (Phase 6)"` 문자열 제거 + `{nav ?? null}` ✓
  - GlobalSearch: `'use client'` · `useDebouncedSearch(query, 300)` · `useCmdKShortcut(toggle)` · `shouldFilter={false}` · `value={s.code}` · ``router.push(`/stocks/${code}`)`` · 4상태 카피 정확 ✓
  - AppShell: `import { GlobalSearch }` + `<GlobalSearch />` 기본 nav ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `CommandLoading` 이 shadcn `command.tsx` 에서 export 되지 않음**
- **Found during:** Task 2 초안 작성 중 `import { CommandLoading } from '@/components/ui/command'` 가 런타임/타입 양쪽에서 실패.
- **Issue:** 플랜은 `CommandLoading` 을 전제로 하지만 Wave 0 에서 설치된 shadcn command.tsx 의 export 목록은 `Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator` 뿐 — `CommandLoading` 부재 (cmdk 원본에는 존재하지만 shadcn 래퍼가 누락).
- **Fix:** 로딩 상태를 `<div className="px-3 py-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">검색 중…</div>` 로 직접 렌더. UI-SPEC Copywriting Contract 의 `검색 중…` 정확 문자열 유지, Body 14 + muted 색 토큰 유지.
- **Why correct:** shadcn 블록 커스터마이징은 Phase 3 에서 확정된 가이드이며(06-01 SUMMARY 결정 참조), command.tsx 에 `CommandLoading` 을 추가하려면 cmdk `Command.Loading` 원본을 re-export 하는 5줄을 Phase 3 토큰 체계와 충돌 없이 주입해야 함 — 본 plan scope 외. 대신 기존 `CommandEmpty` 와 동일한 시각 위계(px-3 py-2 muted text)로 `<div>` 렌더하여 UX/접근성 동일.
- **Commit:** `e185306`.

**2. [Rule 3 — Blocking] `CommandDialog` 는 `shouldFilter` prop 을 내부 Command 에 전달하지 않음**
- **Found during:** Task 2 구현 중 shadcn command.tsx 재확인.
- **Issue:** `CommandDialog` 의 타입 시그니처는 `React.ComponentProps<typeof Dialog> & { title?, description?, ... }` — cmdk `Command` 의 `shouldFilter` prop 을 forward 하지 않음. 플랜에 그대로 적으면 cmdk 가 클라이언트 필터를 수행하여 서버 `name.ilike OR code.ilike` 결과를 다시 걸러내 빈 결과처럼 보이는 Pitfall 2 유입.
- **Fix:** 플랜 주의사항 그대로 채택 — `CommandDialog` 내부에 `<Command shouldFilter={false}>` 를 명시적으로 래핑하고 그 안에 CommandInput/List 배치. Test 9 (`cmdk-item data-value` 확인) 로 회귀 방지.
- **Commit:** `e185306`.

**3. [Rule 3 — Blocking] tsc 가 `toBeInTheDocument` 를 모름**
- **Found during:** Task 2 tsc 검증.
- **Issue:** `webapp/tests/setup.ts` (global setup) 에서 `import '@testing-library/jest-dom/vitest'` 로 확장 타입을 주입하지만, `tsconfig.json` `include` 는 `src/**/*` + `next-env.d.ts` 뿐이라 `tests/` 가 포함되지 않음 → tsc 는 jest-dom 모듈 확장을 보지 못함.
- **Fix:** 테스트 파일 최상단에 `/// <reference types="@testing-library/jest-dom" />` triple-slash 추가. 런타임은 setup.ts 가 계속 담당, 타입만 명시적 로드.
- **Why correct:** tsconfig include 에 `tests/**/*` 를 추가하면 build 범위가 확장되고 next.js 타입 범위에 영향. 파일 단위 참조가 더 국소적이고 Phase 5 scanner 테스트들은 jest-dom matcher 를 쓰지 않아 영향 없음.
- **Commit:** `e185306`.

### 기타 구현 정보

- `AppShell` nav 판별을 `nav === undefined` 로 구현 — `nav={null}` (의도적 비활성) 과 `nav 미지정` (기본 GlobalSearch) 을 분리하기 위함. 명시적 계약으로 jsdoc 에 주석화.
- SearchTrigger 모바일 아이콘 버튼은 `h-11 w-11` (44×44) 로 Phase 3 `[data-density="comfortable"]` 터치 타깃 규약 일치.

## 인증 게이트

없음. 로컬 vitest + tsc + playwright list 만 수행.

## Known Stubs

없음. 모든 상태(초기·로딩·에러·빈·결과) 가 실제 동작 경로로 연결됨.

## Threat Flags

없음. 조회 전용 UI — 신규 trust boundary 0, 네트워크 경로 변경 0, DOM 리스너는 `useCmdKShortcut` (Plan 02 기존 1개) 만 유지.

## Success Criteria 충족

- [x] SRCH-01 종목명/코드 검색 — CommandInput + useDebouncedSearch + 서버 endpoint 연결
- [x] SRCH-02 자동완성 드롭다운 — CommandList + 상태별 카피 4종 + cmdk 키보드 내비게이션 기본 제공
- [x] 헤더 placeholder (disabled Input) 완전 제거 → readonly SearchTrigger + ⌘K 키캡
- [x] cmdk `shouldFilter={false}` + `value={s.code}` 로 서버 결과 100% 표시
- [x] debounce 300ms + AbortController race 방지 (Plan 02 훅 재사용)
- [x] `router.push` 이후 setOpen(false) + setQuery('') cleanup

## Self-Check: PASSED

- FOUND: webapp/src/components/search/search-trigger.tsx
- FOUND: webapp/src/components/search/global-search.tsx
- FOUND: webapp/src/components/search/__tests__/global-search.test.tsx
- FOUND: e360bd1 (Task 1)
- FOUND: e185306 (Task 2)
- FOUND: 83c2694 (Task 3)
- CONFIRM: app-header.tsx 에 `placeholder="종목 검색 (Phase 6)"` 미존재
- CONFIRM: app-shell.tsx 에 `import { GlobalSearch }` + `<GlobalSearch />` 존재
