---
phase: 10-theme-classification
plan: 05
type: execute
wave: 4
depends_on: [02]
files_modified:
  - webapp/src/lib/theme-api.ts
  - webapp/src/hooks/use-themes-query.ts
  - webapp/src/lib/__tests__/theme-api.test.ts
autonomous: true
requirements: [THEME-03]
must_haves:
  truths:
    - "로그인 유저가 본인 테마를 생성/편집/삭제하고 종목을 add/remove 할 수 있다"
    - "유저는 본인 테마만 조회/편집 (RLS owner-only 가 자동 필터)"
    - "시스템 테마 fork = 그 시점 active 멤버십을 유저 테마로 스냅샷 복사 후 독립"
    - "use-themes-query 가 내 테마(Supabase) + 시스템 테마(Express)를 60s 폴링으로 합친다"
  artifacts:
    - path: "webapp/src/lib/theme-api.ts"
      provides: "유저 테마 CRUD + fork (Supabase 직접) + 시스템 테마 fetch (Express)"
      exports: ["createUserTheme", "updateUserTheme", "deleteUserTheme", "addThemeStock", "removeThemeStock", "forkSystemTheme", "fetchMyThemes", "fetchSystemThemes"]
    - path: "webapp/src/hooks/use-themes-query.ts"
      provides: "내 테마 + 시스템 테마 60s 폴링 훅"
      exports: ["useThemesQuery"]
  key_links:
    - from: "theme-api.ts forkSystemTheme"
      to: "theme_stocks (effective_to is null)"
      via: "INSERT-SELECT 스냅샷 복사 (단일 테이블 이점)"
      pattern: "effective_to"
    - from: "theme-api.ts 유저 CRUD"
      to: "Supabase RLS owner-only"
      via: "owner_id=auth.uid() 자동 필터 (watchlist 선례)"
      pattern: "is_system"
---

<objective>
유저 테마 CRUD 데이터 레이어를 watchlist 스택 복제로 구현한다: `theme-api.ts`(유저 테마 생성/편집/삭제 + 종목 add/remove + fork 스냅샷 + 시스템/내 테마 fetch) + `use-themes-query.ts`(내 테마 Supabase 직접 + 시스템 테마 Express, 60s 폴링). fork(D-05)는 단일 테이블 이점으로 INSERT-SELECT 스냅샷.

Purpose: THEME-03 의 데이터 레이어. RESEARCH §Pattern 7 watchlist-api 1:1 복제 매핑. 시스템 테마는 Express(service-role 집계), 유저 테마는 Supabase 직접(RLS owner-only) — 두 경로 분리(RESEARCH 데이터 흐름표). UI 컴포넌트는 Plan 07 이 소비.
Output: theme-api + use-themes-query + 단위 테스트.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md

<interfaces>
복제 기준 (watchlist 스택 1:1):

webapp/src/lib/watchlist-api.ts:
- import type { SupabaseClient } from '@supabase/supabase-js'
- fetchWatchlist(supabase): Promise<{data, error}>  ← RLS 자동 필터(user_id 명시 불필요)
- addWatchlistItem(supabase, userId, stockCode), removeWatchlistItem(supabase, userId, stockCode)
- PostgREST 1:1 object / 1:N array → Array.isArray 방어

webapp/src/hooks/use-watchlist-query.ts:
- POLL_INTERVAL_MS = 60_000, createClient() from '@/lib/supabase/client'
- visibility API(visible 일 때만 폴링) + stale-but-visible(에러 시 data 유지) + mountedRef
- MAX(quote.updatedAt) 클라이언트 계산

webapp/src/lib/api.ts: apiFetch(path) + ApiClientError + X-Request-Id (시스템 테마 Express fetch 용)
webapp/src/lib/auth-context.tsx: Google OAuth 세션 → userId

RESEARCH §Pattern 7 forkSystemTheme 골격:
1. themes select(name, description).eq('id', sysId).eq('is_system', true).single()
2. themes insert({name, description, owner_id: userId, is_system: false}).select('id').single()  ← RLS WITH CHECK 통과
3. theme_stocks select('stock_code').eq('theme_id', sysId).is('effective_to', null)  ← active 만
4. theme_stocks insert(members.map → {theme_id: mineId, stock_code, source:'user'}))

packages/shared theme.ts (Plan 02): Theme, ThemeWithStats, ThemeStockMember, ThemeStockSource.
유저 테마 종목 50-limit = P0001 (Plan 02 trigger) → error.code === 'P0001' 분기(watchlist 선례).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: theme-api.ts (유저 CRUD + fork + 시스템/내 테마 fetch)</name>
  <files>webapp/src/lib/theme-api.ts, webapp/src/lib/__tests__/theme-api.test.ts</files>
  <read_first>
    - webapp/src/lib/watchlist-api.ts (CRUD + RLS 자동 필터 + Array.isArray 방어 — 1:1 복제)
    - webapp/src/lib/api.ts (apiFetch + ApiClientError — 시스템 테마 Express)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 7 (fork 골격), §Code Examples (nested embed)
    - webapp/src/lib/__tests__/ (기존 테스트 형태 + supabase mock)
  </read_first>
  <behavior>
    - createUserTheme(supabase, userId, name): insert is_system=false owner_id=userId
    - updateUserTheme / deleteUserTheme: 본인 테마만 (RLS)
    - addThemeStock / removeThemeStock(supabase, themeId, stockCode): theme_stocks source='user'
    - forkSystemTheme(supabase, userId, sysId): active 멤버십만 복사 → 새 유저 테마 id 반환
    - fetchMyThemes(supabase): 내 테마(owner) RLS 자동 필터
    - fetchSystemThemes(): Express /api/themes
    - 50-limit P0001 에러를 식별 가능한 형태로 surface
  </behavior>
  <action>
    webapp/src/lib/theme-api.ts 작성 (watchlist-api 패턴):
    - import SupabaseClient, apiFetch, ApiClientError, ThemeWithStats type
    - fetchSystemThemes(): apiFetch('/api/themes') → ThemeWithStats[] (Express service-role 경로)
    - fetchSystemThemeDetail(id): apiFetch('/api/themes/'+id)
    - fetchMyThemes(supabase): supabase.from('themes').select(... theme_stocks count).eq('is_system', false) — RLS 가 owner 자동 필터. 매핑 camelCase.
    - createUserTheme(supabase, userId, name): insert({name, owner_id: userId, is_system: false}).select('id').single()
    - updateUserTheme(supabase, themeId, patch), deleteUserTheme(supabase, themeId)
    - addThemeStock(supabase, themeId, stockCode): insert({theme_id, stock_code, source:'user'}) — P0001 시 식별 throw
    - removeThemeStock(supabase, themeId, stockCode): delete eq theme_id eq stock_code
    - forkSystemTheme(supabase, userId, sysId): RESEARCH §Pattern 7 골격 verbatim (active 멤버십만, source='user')
    - theme-api.test.ts: 각 함수 supabase mock + apiFetch mock 검증, fork active-only, P0001 분기.
  </action>
  <verify>
    <automated>pnpm -F webapp test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp test` exits 0 (theme-api.test.ts green)
    - `grep -q "forkSystemTheme" webapp/src/lib/theme-api.ts` exits 0
    - `grep -q "is_system" webapp/src/lib/theme-api.ts` exits 0 (유저 쓰기 is_system=false)
    - `grep -q "effective_to" webapp/src/lib/theme-api.ts` exits 0 (fork active-only)
    - theme-api.test.ts: fork 가 active 멤버십만 복사 + P0001 50-limit 분기 케이스 존재
  </acceptance_criteria>
  <done>theme-api 가 유저 CRUD + fork(스냅샷) + 시스템/내 테마 fetch 를 watchlist 패턴으로 구현, 테스트 green.</done>
</task>

<task type="auto">
  <name>Task 2: use-themes-query 훅 (내 테마 + 시스템 테마 60s 폴링)</name>
  <files>webapp/src/hooks/use-themes-query.ts, webapp/src/lib/__tests__/theme-api.test.ts</files>
  <read_first>
    - webapp/src/hooks/use-watchlist-query.ts (60s 폴링 + visibility + stale-but-visible + mountedRef — 복제 기준)
    - webapp/src/lib/theme-api.ts (Task 1 fetchMyThemes/fetchSystemThemes)
    - webapp/src/lib/auth-context.tsx (세션 userId)
  </read_first>
  <action>
    webapp/src/hooks/use-themes-query.ts — useThemesQuery() (use-watchlist-query 복제):
    - POLL_INTERVAL_MS = 60_000, createClient(), visibility API, stale-but-visible, mountedRef
    - load(): Promise.all([fetchSystemThemes(), 세션 있으면 fetchMyThemes(supabase)]) → { systemThemes, myThemes, isLoading, isRefreshing, error, refresh }
    - 비로그인 시 myThemes = [] (시스템만 표시). 에러 시 기존 data 유지.
    - 결과 타입: UseThemesQueryResult { systemThemes: ThemeWithStats[]; myThemes: ThemeWithStats[]; isLoading; isRefreshing; error; refresh }
    use-themes-query 의 데이터 합성/폴링 로직을 theme-api.test.ts 또는 별도 훅 테스트로 최소 검증(visible 폴링, 비로그인 myThemes 빈 배열).
  </action>
  <verify>
    <automated>pnpm -F webapp test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp test` exits 0
    - `pnpm -F webapp build` exits 0
    - `grep -q "useThemesQuery" webapp/src/hooks/use-themes-query.ts` exits 0
    - `grep -q "60_000" webapp/src/hooks/use-themes-query.ts` exits 0 (60s 폴링)
    - `grep -q "visibilityState" webapp/src/hooks/use-themes-query.ts` exits 0 (백그라운드 폴링 차단)
  </acceptance_criteria>
  <done>useThemesQuery 가 내 테마+시스템 테마를 60s visible 폴링으로 합치고 비로그인 안전, build+test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| webapp(authenticated) → Supabase themes/theme_stocks | 로그인 유저 본인 테마 CRUD — owner-only RLS 경계 |
| webapp → Express /api/themes | 시스템 테마 읽기 (공개) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-05-01 | Information Disclosure | 유저 A 가 유저 B 테마 조회 | mitigate | fetchMyThemes 가 user_id 필터 없이 호출해도 RLS read_own_themes 가 DB 레벨 차단(watchlist 선례) |
| T-10-05-02 | Tampering | 유저가 시스템 테마 편집/위조 | mitigate | 모든 유저 쓰기에 is_system=false + owner_id=userId. RLS WITH CHECK 가 강제(Plan 02). fork 도 새 row 생성(원본 불변) |
| T-10-05-03 | Tampering | fork 시 과거 제외 종목까지 복사 | mitigate | forkSystemTheme 가 effective_to IS NULL(active)만 복사 — D-05 스냅샷 의미 |
| T-10-05-04 | DoS | 유저 테마 종목 무제한 | mitigate | addThemeStock 이 P0001(50-limit trigger) 에러를 surface → UI 가 안내(Plan 02 trigger + Plan 07 UI) |
</threat_model>

<verification>
- `pnpm -F webapp test` green (theme-api + use-themes-query)
- `pnpm -F webapp build` exits 0
- fork active-only + P0001 분기 + 60s visible 폴링 + 비로그인 안전 케이스 존재
</verification>

<success_criteria>
- SC#6 부분(데이터): 유저가 본인 테마 생성/편집/삭제 + 종목 add/remove + fork 스냅샷 (per-user owner-only RLS, 시스템과 분리)
- 시스템 테마(Express) + 유저 테마(Supabase RLS) 경로 분리 (RESEARCH 데이터 흐름)
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-05-SUMMARY.md`
</output>
