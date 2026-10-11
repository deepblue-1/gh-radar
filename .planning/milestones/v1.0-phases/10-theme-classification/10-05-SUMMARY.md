---
phase: 10-theme-classification
plan: 05
subsystem: webapp
tags: [supabase, rls, react-hook, polling, fork, insert-select, theme, watchlist-clone, typescript]

# Dependency graph
requires:
  - phase: 10-theme-classification (Plan 02)
    provides: themes/theme_stocks 테이블(production live) + RLS owner-only 5정책 + 50-limit trigger 2종(P0001) + packages/shared Theme/ThemeWithStats/ThemeStockMember 타입
  - phase: 10-theme-classification (Plan 04)
    provides: GET /api/themes(시스템 테마 목록, top3 desc) + GET /api/themes/:id(상세 ThemeStockMember[]) — fetchSystemThemes/Detail 소비
  - phase: 06.2-auth-watchlist
    provides: watchlist-api.ts + use-watchlist-query.ts(1:1 복제 기준) + auth-context.tsx(세션) + supabase/client.ts(createBrowserClient)
provides:
  - webapp theme-api.ts (유저 테마 CRUD + fork INSERT-SELECT 스냅샷 + 시스템/내 테마 fetch)
  - createUserTheme/updateUserTheme/deleteUserTheme (is_system=false + owner_id 명시, RLS WITH CHECK)
  - addThemeStock/removeThemeStock (source='user', P0001 50-limit surface)
  - forkSystemTheme (active 멤버십 effective_to IS NULL 만 복사, source='user')
  - fetchMyThemes (Supabase 직접 + theme_stocks(count) embed, RLS owner 자동 필터)
  - fetchSystemThemes/fetchSystemThemeDetail (apiFetch /api/themes — Express service-role)
  - isThemeStockLimitError/THEME_STOCK_LIMIT_CODE (P0001 식별 헬퍼)
  - useThemesQuery 훅 (내 테마 + 시스템 테마 60s visible 폴링 + stale-but-visible + 비로그인 안전)
affects: [10-07-themes-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "유저 테마 = Supabase 직접(RLS owner-only), 시스템 테마 = Express /api/themes(service-role) — 두 경로 분리(RESEARCH 데이터 흐름표)"
    - "fork = 단일 테이블 INSERT-SELECT 스냅샷: 시스템 메타 read → 유저 테마 insert(is_system=false) → active 멤버십(effective_to IS NULL)만 복사 (D-05)"
    - "P0001 trigger 에러를 plain object → code 보존 Error 로 정규화 후 isThemeStockLimitError 로 식별 (watchlist SQLSTATE 선례 확장)"
    - "useThemesQuery = useWatchlistQuery 복제 + Promise.all 두 소스 합성 + getSession 세션 게이트(비로그인 myThemes=[])"
    - "theme_stocks(count) PostgREST embed + Array.isArray 방어로 stockCount 추출 (유저 테마는 effective_to 항상 NULL → 전체 count=active count)"

key-files:
  created:
    - webapp/src/lib/theme-api.ts
    - webapp/src/lib/__tests__/theme-api.test.ts
    - webapp/src/hooks/use-themes-query.ts
    - webapp/src/hooks/__tests__/use-themes-query.test.ts
  modified: []

key-decisions:
  - "유저 테마 fetch/CRUD 는 모두 Supabase 직접 — Express 미경유. RLS read_own_themes(owner_id=auth.uid())가 DB 레벨 격리(T-10-05-01), 모든 쓰기에 is_system=false+owner_id 명시로 WITH CHECK 통과 + 시스템 위조 차단(T-10-05-02)"
  - "fork 는 active 멤버십(effective_to IS NULL)만 INSERT-SELECT 복사 — 과거 제외 이력 미복사(D-05 스냅샷, T-10-05-03). 빈 시스템 테마면 종목 insert 스킵, 시스템 아닌 id 면 throw(eq is_system=true)"
  - "fetchMyThemes 는 theme_stocks(count) left embed — 종목 0개 테마도 stockCount=0 포함. effective_to 필터는 embed count 에 적용 불가(PostgREST 제약)나 유저 테마는 제외 이력 없음(본인 add/remove)이라 전체 count=active count"
  - "P0001(user_theme_stock/count_limit_exceeded)을 isThemeStockLimitError 헬퍼로 식별 — addThemeStock/createUserTheme 가 식별 가능 Error throw(T-10-05-04). PostgREST plain-object 에러를 code 보존 Error 로 정규화(stack 확보)"
  - "useThemesQuery 의 myThemes 게이트 = supabase.auth.getSession() — auth-context useAuth 대신 직접 호출. 데이터 레이어 훅이 AuthProvider 트리 의존 없이 동작(테스트 단순 + 비로그인 안전)"
  - "TDD: theme-api.test.ts 16 케이스(RED 모듈 부재 실패 → GREEN). use-themes-query.test.ts 8 케이스. 두 산출물 동일 파일군이라 task 당 단일 feat 커밋(10-04 선례)"

patterns-established:
  - "유저 데이터 레이어 복제: watchlist-api → theme-api(+CRUD/fork), use-watchlist-query → use-themes-query(+두 소스 합성). RLS owner 자동 필터 + stale-but-visible + 60s visible 폴링 1:1 계승"
  - "fork INSERT-SELECT: 단일 themes 테이블이라 UNION 없이 시스템→유저 스냅샷 1함수(메타 read + theme insert + active 멤버십 복사). source='user' 통일"
  - "trigger 에러 식별 계약: THEME_STOCK_LIMIT_CODE('P0001') + isThemeStockLimitError(error) — UI(Plan 07)가 한도 안내 분기. PostgREST 에러 정규화(toThrowable)로 code 보존"

requirements-completed: [THEME-03]

# Metrics
duration: ~6min
completed: 2026-06-09
---

# Phase 10 Plan 05: User Theme CRUD Summary

**유저 테마 CRUD 데이터 레이어를 watchlist 스택 복제로 구현 — `theme-api.ts`(생성/편집/삭제 + 종목 add/remove + fork INSERT-SELECT 스냅샷 + 시스템/내 테마 fetch) + `useThemesQuery`(내 테마 Supabase 직접 + 시스템 테마 Express, 60s visible 폴링). 유저 테마는 RLS owner-only 가 자동 격리, fork 는 단일 테이블 이점으로 active 멤버십만 스냅샷 복사. 50-limit(P0001) 을 식별 가능하게 surface.**

## Performance

- **Duration:** 약 6분 (09:29 → 09:35 UTC, 2태스크)
- **Tasks:** 2 (Task 1 TDD theme-api, Task 2 useThemesQuery 훅)
- **Tests:** 24 신규 (theme-api 16 + use-themes-query 8) — 전체 webapp 188 passed / 1 skipped (테마 무관 discussion 3 실패는 사전 존재, 아래 Deferred)
- **Files:** 4 신규 (lib/theme-api.ts + 훅 + 각 테스트)

## Accomplishments

- **theme-api.ts 유저 CRUD (watchlist 복제):** `createUserTheme`(insert is_system=false+owner_id → 새 id), `updateUserTheme`(update patch.eq id), `deleteUserTheme`(delete.eq id) — 모두 RLS owner-only 가 본인 테마만 허용. `addThemeStock`/`removeThemeStock` 는 source='user' 로 theme_stocks insert/delete.
- **fork INSERT-SELECT 스냅샷 (D-05, RESEARCH §Pattern 7 verbatim):** `forkSystemTheme` 가 (1) 시스템 메타 read(eq is_system=true → 유저 테마 fork 차단), (2) 유저 테마 insert(is_system=false+owner_id), (3) active 멤버십(effective_to IS NULL)만 select, (4) source='user' 로 복사 insert. 빈 멤버십 → insert 스킵, 시스템 아니면 throw. 복사 후 독립(시스템 갱신 미전파).
- **시스템 ↔ 유저 경로 분리:** `fetchSystemThemes`/`fetchSystemThemeDetail` 는 `apiFetch('/api/themes')`(Express service-role, Plan 04). `fetchMyThemes` 는 Supabase 직접(`theme_stocks(count)` embed + RLS owner 자동 필터). 유저 쓰기는 절대 Express 미경유(service-role 라우트 노출 0).
- **50-limit 식별 계약 (T-10-05-04):** `THEME_STOCK_LIMIT_CODE='P0001'` + `isThemeStockLimitError(error)` — addThemeStock/createUserTheme 가 trigger(user_theme_stock/count_limit_exceeded) 에러를 식별 가능 Error 로 surface. UI(Plan 07)가 분기 안내. PostgREST plain-object 에러는 `toThrowable` 로 code 보존 Error 정규화.
- **useThemesQuery (useWatchlistQuery 복제 + 합성):** POLL_INTERVAL_MS=60_000 + visibility API(hidden 폴링 억제 + visible 복귀 즉시 refetch) + mountedRef(unmount setState 차단). `Promise.all([fetchSystemThemes(), 세션 있으면 fetchMyThemes()])` 병렬 합성. 비로그인 → myThemes=[]. stale-but-visible(에러 시 data 보존, 성공 시 error 클리어).
- **TDD 검증:** theme-api.test.ts 16 케이스(fork active-only + P0001 분기 + count 매핑 + 시스템 없으면 throw), use-themes-query.test.ts 8 케이스(비로그인 빈 배열 + 60s visible 폴링 + hidden 스킵 + stale). 모두 green.

## Task Commits

각 태스크 원자적 커밋 (한글, Co-Authored-By 없음):

1. **Task 1: theme-api 유저 CRUD + fork 스냅샷 + 시스템/내 테마 fetch** - `210e38c` (feat)
2. **Task 2: useThemesQuery — 내 테마 + 시스템 테마 60s 폴링 훅** - `0e74e16` (feat)

**Plan metadata:** (아래 final commit)

_Note: Task 1 은 tdd="true". RED(theme-api.test.ts 작성 → 모듈 부재로 import 실패 확인)→GREEN(theme-api.ts 구현 → 16 green)을 단일 feat 커밋으로 통합 — 테스트/구현 동일 파일군이라 분리 커밋 이점 없음(10-04 선례)._

## Decisions Made

- **유저 테마 전 경로 Supabase 직접 (Express 미경유):** fetch/CRUD/fork 모두 webapp → Supabase PostgREST. RLS read_own_themes(owner_id=auth.uid())가 DB 레벨 격리(T-10-05-01, watchlist 선례). 모든 쓰기에 is_system=false+owner_id 명시 → insert/update_own_themes WITH CHECK 통과 + 시스템 테마 위조 차단(T-10-05-02). service-role 라우트(Plan 04)는 is_system=true 만 노출 — 유저 테마 누출 0.
- **fork active 멤버십만 복사 (D-05 스냅샷):** `is('effective_to', null)` 로 그 시점 편입 종목만 복사 — 과거 제외 이력 미복사(T-10-05-03). 유저 theme_stocks 는 effective_from=now, source='user', effective_to=NULL 단순화(유저는 본인 add/remove 라 이력 추적 불필요). 시스템 메타 read 에 eq(is_system=true) → 유저 테마/잘못된 id fork 시도는 single() 부재로 throw.
- **fetchMyThemes theme_stocks(count) left embed:** inner 가 아닌 left embed 로 종목 0개 테마도 stockCount=0 포함. PostgREST embed count 에 effective_to 필터 적용 불가하나, 유저 테마는 제외 이력이 없으므로(D-05 단순화 — add/remove 만) 전체 count 가 곧 active count. is_system=false 명시로 시스템 테마 제외(단일 테이블 + idx_themes_owner 활용).
- **P0001 식별 헬퍼 + 에러 정규화:** trigger 가 던지는 PostgREST 에러는 plain object({code:'P0001', message:'user_theme_stock_limit_exceeded'})라 그대로 throw 하면 stack 없음 → `toThrowable` 로 code 보존 Error 로 감싸 throw. `isThemeStockLimitError`/`THEME_STOCK_LIMIT_CODE` 로 UI 가 종목수/테마수 한도(둘 다 P0001, message 로 세부 구분)를 분기.
- **useThemesQuery 세션 게이트 = getSession 직접 호출:** auth-context의 useAuth(AuthProvider 트리 의존) 대신 createClient().auth.getSession() 직접 호출. 데이터 레이어 훅이 Provider 없이 동작 — 테스트 단순(supabase mock 만) + 비로그인 안전(session null → fetchMyThemes 스킵).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] use-themes-query 테스트를 별도 훅 테스트 파일로 분리 (PLAN frontmatter 의 theme-api.test.ts 합치기 대신)**
- **Found during:** Task 2 (훅 테스트 작성 위치)
- **Issue:** PLAN frontmatter `files_modified` 가 Task 2 의 테스트도 `theme-api.test.ts` 로 명시하나, 훅 테스트는 renderHook/fakeTimers/visibility mock 으로 lib 테스트와 셋업이 완전히 다름. 합치면 mock 충돌(api mock vs supabase auth mock) + 테스트 응집도 저하.
- **Fix:** `webapp/src/hooks/__tests__/use-themes-query.test.ts` 신규 — 기존 `use-watchlist-query.test.ts` 와 동일 위치/패턴. PLAN body Task 2 action 도 "theme-api.test.ts 또는 별도 훅 테스트"로 별도 분리를 명시 허용.
- **Files modified:** (테스트 파일 위치만 — 신규 생성)
- **Verification:** vitest 가 24 테스트(lib 16 + 훅 8) 발견·실행 green. 두 파일 각각 격리된 mock 으로 충돌 0.
- **Committed in:** `0e74e16`

---

**Total deviations:** 1 auto-fixed (Rule 3 — 테스트 파일 배치, 프로덕션 코드 무영향). theme-api/useThemesQuery 프로덕션 코드는 PLAN 명세 + RESEARCH §Pattern 7 그대로.
**Impact on plan:** scope creep 없음. 모든 acceptance-criteria 충족 (test green, build exit 0, forkSystemTheme/is_system/effective_to/useThemesQuery/60_000/visibilityState grep PASS, fork active-only + P0001 + 비로그인 케이스 존재).

## Threat Surface

플랜 `<threat_model>` 의 T-10-05-01~04 만 도입(신규 surface 없음). 모두 설계대로 mitigate:
- **T-10-05-01 (Information Disclosure):** fetchMyThemes 가 user_id 필터 없이 호출 — RLS read_own_themes(owner_id=auth.uid())가 DB 레벨 차단(watchlist 선례). 타인 테마 0 rows.
- **T-10-05-02 (Tampering):** 모든 유저 쓰기에 is_system=false + owner_id=userId → RLS WITH CHECK(insert/update_own_themes) 강제. fork 도 새 row 생성(원본 시스템 테마 불변).
- **T-10-05-03 (Tampering):** forkSystemTheme 가 effective_to IS NULL(active)만 복사 — D-05 스냅샷 의미. 과거 제외 종목 미복사(테스트 실증).
- **T-10-05-04 (DoS):** addThemeStock/createUserTheme 가 P0001(50-limit trigger) 에러를 isThemeStockLimitError 로 surface → UI(Plan 07) 안내. trigger 가 DB 레벨 cap(Plan 02).

## Issues Encountered

- **PostgREST 에러는 plain object (stack 없음):** Supabase JS 의 `{ data, error }` 에서 error 는 `{ code, message, details, hint }` plain object — `throw error` 하면 Error 인스턴스가 아니라 stack 미보존 + instanceof Error 실패. `toThrowable` 로 code 보존 Error 정규화(상위 catch/식별 헬퍼가 정상 동작). watchlist 는 `{data,error}` 를 호출자에 그대로 반환했으나(에러 처리 위임), theme-api 는 CRUD/fork 가 다단계라 throw 방식 채택(useThemesQuery 가 try/catch 합성).
- **theme_stocks(count) embed 에 effective_to 필터 불가:** PostgREST embed aggregate(count)에는 자식 필터를 걸 수 없음. 유저 테마는 제외 이력이 없는 설계(D-05 — 본인 add/remove)라 전체 count=active count 로 정확. 시스템 테마였다면 effective_to 가 채워져 부정확했겠으나, fetchMyThemes 는 is_system=false 만 조회하므로 무영향.

## Deferred Issues

`deferred-items.md` 에 기록 (테마 작업과 무관한 사전 실패 — SCOPE BOUNDARY 미수정):
- **discussion-page-client.test.tsx 3 실패 (Phase 08.1 filter toggle):** 테마 무관. theme-api/use-themes-query 테스트는 별도 green 검증(24/24). 본 plan 코드 무영향.
- **`pnpm -F webapp lint` 환경 실패:** eslint-config-next 가 eslint-plugin-import(pnpm 스토어 존재)를 resolve 못함(hoisting/peer 이슈). 내 코드 무관 — `pnpm -F webapp build`(tsc+next compile)는 exit 0 으로 타입/컴파일 검증 완료.

## User Setup Required

None - 본 plan 은 webapp 데이터 레이어(theme-api + 훅) + 단위 테스트만. themes/theme_stocks 테이블 + RLS 는 Plan 02 production live, /api/themes 는 Plan 04 운영. 외부 서비스/시크릿 추가 불필요. 실 유저 테마는 Plan 07 UI 가 이 레이어를 소비해 생성.

## Next Phase Readiness

- **Plan 07 (themes UI) 준비 완료:** theme-api 의 8 export(createUserTheme/updateUserTheme/deleteUserTheme/addThemeStock/removeThemeStock/forkSystemTheme/fetchMyThemes/fetchSystemThemes) + useThemesQuery 가 /themes 목록(내 테마 상단 + 시스템 하단, D-13) + 편집 UI(watchlist-client 패턴) 토대. isThemeStockLimitError 로 50-limit 안내 분기.
- **데이터 경로 확정:** 시스템 테마 = Express /api/themes(Plan 04), 유저 테마 = Supabase 직접(본 plan). useThemesQuery 가 두 경로를 60s 폴링으로 합성 — UI 는 systemThemes/myThemes 두 배열만 소비.
- **fork UX 토대:** forkSystemTheme(systemThemeId) → 새 유저 테마 id 반환 → UI 가 /themes/[id] 로 이동 가능. fetchSystemThemeDetail 로 fork 전 미리보기 가능.
- **Concern 없음:** 비로그인 시 myThemes=[] 안전 처리(UI 는 시스템만 + 로그인 CTA). 시스템 테마 시드 부재 시 systemThemes=[] (theme-sync 배포 후 채워짐 — Plan 08).

## Self-Check: PASSED

- `webapp/src/lib/theme-api.ts` / `webapp/src/lib/__tests__/theme-api.test.ts` / `webapp/src/hooks/use-themes-query.ts` / `webapp/src/hooks/__tests__/use-themes-query.test.ts` 전부 존재 확인
- 커밋 `210e38c`(Task 1) / `0e74e16`(Task 2) git log 확인
- 24/24 신규 테스트 green + typecheck exit 0 + build exit 0
- grep: forkSystemTheme/is_system/effective_to(theme-api) + useThemesQuery/60_000/visibilityState(훅) 전부 PASS

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
