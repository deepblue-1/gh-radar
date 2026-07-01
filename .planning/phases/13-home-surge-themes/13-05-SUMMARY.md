---
phase: 13-home-surge-themes
plan: 05
subsystem: home-surge-themes
tags: [webapp, next-app-router, routing, sidebar-nav, e2e, playwright, regression]
requires:
  - "홈 컴포넌트 세트 (13-04, HomeClient + HomeSkeleton)"
  - "GET /api/home 읽기 라우트 { snapshot, index } (13-03)"
  - "@gh-radar/shared HomeSnapshotResponse 계약 (13-01)"
provides:
  - "홈을 앱 루트 `/` 에 마운트 (page.tsx = AppShell + Suspense(HomeSkeleton) + HomeClient, force-dynamic)"
  - "사이드바 NAV 재정렬 — 홈(1번째, / 활성) · 스캐너 · 테마 · 관심종목"
  - "webapp/e2e/fixtures/home.ts (mockHomeApi + HOME_POPULATED/HOME_EMPTY)"
  - "webapp/e2e/specs/home.spec.ts (홈 렌더/날짜·시점 네비/빈 상태 + /scanner 회귀)"
affects:
  - 13-06 (배포/릴리스 게이트) — 동일 home.spec 를 배포 프리뷰 대상 재실행
tech-stack:
  added: []
  patterns:
    - "루트 리다이렉트 → 페이지 마운트 스왑 (scanner/page.tsx 구조 mirror: force-dynamic + AppShell + Suspense skeleton)"
    - "결정론 /api/home E2E mock (themes.spec mockThemesApi 동형, 급등 날마다 변동 → populated/empty 명시 주입)"
    - "empty-tolerant E2E — populated/empty 응답 모드를 mock 으로 분기 주입해 라이브 데이터 부재로 하드 실패 안 함"
key-files:
  created:
    - webapp/e2e/fixtures/home.ts
    - webapp/e2e/specs/home.spec.ts
  modified:
    - webapp/src/app/page.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/lib/supabase/middleware.ts
  removed:
    - webapp/src/app/home-preview/page.tsx
decisions:
  - "page.tsx JSDoc 에서 'redirect' 리터럴 제거 — acceptance grep(redirect 무매치)을 주석까지 엄격 충족('/scanner 서버사이드 이동'으로 리워딩, 의미 동일)"
  - "/api/home E2E 는 결정론 mock — 급등은 날마다 변동하므로 실서버 대신 populated/empty 두 응답을 명시 주입(themes.spec 선례). 흐름·카피 계약 검증에 집중"
  - "empty-state 테스트는 별도 HOME_EMPTY 응답 주입으로 '오늘은 +20% 급등 종목이 없습니다' 결정론 검증 — OR-tolerant 대신 모드 분기(더 명확한 회귀 방지)"
metrics:
  duration: ~4min
  tasks: 2
  files: 6
  completed: 2026-07-02
---

# Phase 13 Plan 05: 홈 `/` 루트 승격 + 사이드바 재정렬 + E2E Summary

HOME-01 의 "홈 = 루트(`/`) 승격" 결정(D-07)을 확정: `page.tsx` 의 `redirect('/scanner')` 를 실제 홈 페이지(AppShell + Suspense(HomeSkeleton) + HomeClient, `force-dynamic`)로 교체하고, 사이드바 NAV 를 홈(1번째, `/` 활성) · 스캐너 · 테마 · 관심종목 순으로 재정렬했다. Plan 04 가 남긴 임시 스캐폴드 2개(`/home-preview` 프리뷰 라우트 + middleware 화이트리스트 항목)를 함께 제거했다. 루트가 서버 리다이렉트였던 점에서 회귀 위험(T-13-12)이 있어, `home.spec.ts` E2E 로 (1)`/` 홈 렌더 + 홈 nav active, (2)날짜/시점 네비, (3)급등 없는 날 빈 상태, (4)`/scanner` 직접 접근 회귀를 잠갔다. playwright 5/5 green(로컬 dev :3100 자동 부팅), webapp build exit 0.

## What Was Built

### Task 1 — 홈 `/` 마운트 + 사이드바 NAV 재정렬 + 임시 스캐폴드 제거 (commit `1734e1f`)
- **app/page.tsx**: `redirect('/scanner')` 제거 → `export const dynamic = 'force-dynamic'` + `AppShell sidebar={<AppSidebar />}` + `max-w-5xl` 컨테이너 + `Suspense fallback={<HomeSkeleton />}` 로 `<HomeClient />` 래핑. scanner/page.tsx 구조 1:1 mirror(Next 15 클라이언트 훅 Suspense 경계 제약 충족).
- **components/layout/app-sidebar.tsx**: `Home`(lucide) import 추가. NAV 첫 항목에 `{ href:"/", label:"홈", icon:Home }` prepend → 홈 · 스캐너 · 테마 · 관심종목. active-item 스타일 코드 무변경(600 weight 상속, UI-SPEC Typography). `pathname==="/"` 이 자연스럽게 홈 활성(`aria-current="page"`), `data-nav-item` 유지.
- **lib/supabase/middleware.ts**: `PUBLIC_EXACT` 에서 임시 `/home-preview` 항목 제거(`["/"]` 만 잔존). 홈이 이미 공개 루트라 정책 일관.
- **app/home-preview/page.tsx**: 임시 프리뷰 라우트 삭제(Plan 04 시각 검증 스캐폴드, 167줄 제거). `git rm` 으로 삭제 반영.

### Task 2 — 홈(`/`) E2E + /scanner 회귀 (commit `a3bafee`)
- **e2e/fixtures/home.ts**: `mockHomeApi(page, { response })` — `/api/home`(+쿼리) 을 결정론 fulfill(`no-store`). `HOME_POPULATED`(주도 테마 1[AI 반도체, SK하이닉스/삼성전자] + 개별 급등 1[카카오] + 슬롯 2개[14:30/15:30·마감] 인덱스) / `HOME_EMPTY`(snapshot=null, index=[]). themes.spec mockThemesApi 패턴 동형, `**` host-agnostic.
- **e2e/specs/home.spec.ts** (4 test, storageState 로그인 자동 주입 — 단 `/` 는 공개):
  (1) `/` 홈 렌더 — 타이틀 "오늘의 급등 테마" h1 + "주도 테마"/AI 반도체 + "개별 급등"/카카오 카드 + 사이드바 홈 nav `aria-current="page"`.
  (2) 날짜/시점 네비 — "이전 날짜"/"다음 날짜" 아이콘 버튼 + "오늘" reset + 시점 pill "15:30 · 마감".
  (3) 빈 상태 — `HOME_EMPTY` 주입 → "오늘은 +20% 급등 종목이 없습니다" + "스캐너로 이동" CTA(href=/scanner).
  (4) REGRESSION(T-13-12) — `/scanner` 직접 접근 시 스캐너 UI(종목 검색 열기 트리거) 렌더 + URL `/scanner` 유지(/ 가 더 이상 302 안 함).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 문서/grep 정합] page.tsx JSDoc 의 'redirect' 리터럴 제거**
- **Found during:** Task 1 (acceptance grep — `grep -q "redirect" page.tsx` 가 NO match 를 요구)
- **Issue:** 신규 JSDoc 이 "기존 `redirect('/scanner')` 를 대체"로 설명 → 주석의 `redirect` 리터럴이 grep 에 걸려 기준 위반(실제 import/호출은 이미 제거됨).
- **Fix:** 주석을 "기존 `/scanner` 서버사이드 이동을 대체"로 리워딩(`redirect` 토큰 제거). 의미 동일.
- **Files modified:** webapp/src/app/page.tsx
- **Commit:** `1734e1f`

그 외 없음 — plan 은 명세대로 실행됨(page/sidebar 스왑 + 임시 스캐폴드 제거 + E2E).

### 실행 노트 (deviation 아님)

- **Task 1 커밋 원자성 보정:** 첫 `git add` 에 삭제된 `home-preview/page.tsx` 경로를 함께 넘겨 `fatal: pathspec did not match`(삭제 파일은 add 불가)로 add 전체가 중단 → 이미 staged 였던 삭제분만 커밋됨. 나머지 3 파일을 stage 후 `--amend` 로 단일 원자 커밋(`1734e1f`, 4 files)에 합쳤다. 최종 상태 정상(중간 커밋 미잔존).
- **E2E env:** dev.sh 규약상 PORT=3100. auth setup 은 `webapp/.env.test.local`(SUPABASE_URL/ANON/SERVICE_ROLE_KEY + E2E_TEST_EMAIL/PASSWORD 전부 보유)에서 로드. playwright.config 가 webServer(:3100)를 reuseExistingServer 로 자동 부팅.

## Verification

- `pnpm --filter webapp build` → exit 0 (전 태스크). 라우트 트리에서 `/` = ƒ(Dynamic, force-dynamic 반영), `/home-preview` 제거 확인.
- `pnpm --filter @gh-radar/webapp exec playwright test home.spec.ts` → **5/5 green** (setup 1 + home 4), 7.2s.
- Task 1 acceptance grep 전량 PASS: page.tsx `redirect` 무매치 / `HomeClient` 매치 / `force-dynamic` 매치, sidebar `href: "/"` 매치 + 홈 첫 항목 + `Home` import, middleware `home-preview` 무매치.
- Task 2 acceptance grep 전량 PASS: home.spec 에 "오늘의 급등 테마" / "/scanner" / "이전 날짜"·"다음 날짜" / "aria-current" / "급등 종목이 없습니다" 매치.

## Threat Model Coverage

- **T-13-12 (root redirect regression) — mitigate**: home.spec REGRESSION 테스트가 `/scanner` 직접 접근 시 스캐너 UI 렌더 + URL 유지를 assert. `/` 홈 렌더 테스트가 루트가 홈을 서빙(리다이렉트 아님)함을 assert. 두 경로 회귀 잠금.

## Known Stubs

None — page/sidebar/middleware/E2E 모두 실 로직. HomeClient 는 라이브 `/api/home`(Plan 03) 을 소비하며, E2E 는 결정론 검증을 위해 `/api/home` 만 mock(프로덕션 코드에 mock/stub 잔존 없음). 임시 프리뷰 스캐폴드 2개는 본 plan 에서 제거 완료.

## Threat Flags

None — 신규 표면 0. 라우팅 스왑(공개 `/` 는 기존 middleware 화이트리스트에 이미 존재) + 사이드바 NAV 재정렬 + E2E 파일뿐. 신규 인증 경로/파일 접근/스키마 변경 없음. 오히려 임시 공개 라우트(`/home-preview`)를 화이트리스트에서 제거하여 공개 표면을 축소했다.

## Self-Check: PASSED

- FOUND: webapp/e2e/fixtures/home.ts
- FOUND: webapp/e2e/specs/home.spec.ts
- FOUND: webapp/src/app/page.tsx
- FOUND: webapp/src/components/layout/app-sidebar.tsx
- REMOVED: webapp/src/app/home-preview/page.tsx (임시 스캐폴드 제거 확인)
- FOUND commit: 1734e1f (Task 1)
- FOUND commit: a3bafee (Task 2)
