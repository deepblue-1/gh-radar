# Phase 06.2 Deferred Items

> 본 plan 범위 밖에서 발견된 기존(pre-existing) 이슈. 별도 plan 에서 처리 예정.

## 2026-04-16 — Plan 10 실행 중 발견

### D1. Unit test 19개 실패 — `useAuth must be used within <AuthProvider>`

**발견 시점:** Plan 10 Task 1 build/test 검증 중.

**검증 결과:**
- Plan 10 변경 전(Base b183cc6) 에서도 동일하게 19/117 실패 재현됨.
- 따라서 Plan 10 (mockup 삭제 + middleware matcher 정리) 과 **인과관계 없음**.

**영향 범위:**
- `src/components/search/__tests__/global-search.test.tsx` — 7 fail
- `src/components/stock/__tests__/stock-hero.test.tsx` — 2 fail
- `src/components/stock/__tests__/stock-stats-grid.test.tsx` — 3 fail
- `src/app/stocks/[code]/__tests__/*` — 2 fail (error + not-found)
- `src/components/stock/__tests__/stock-detail-client.test.tsx` — 5 fail

**근본 원인 (추정):**
Phase 06.2 Wave 4 (Plan 07) 에서 `WatchlistToggle` 을 `StockHero` / `Scanner` card/table 등에 통합하면서 `useAuth()` 호출이 추가됨. 그러나 기존 테스트 파일들은 `AuthProvider` wrapper 없이 컴포넌트를 직접 렌더함 → `useAuth` 가 throw.

**해결 방안 제안:**
- Option A: 각 테스트 파일에 `AuthProvider` mock wrapper 추가 (test-utils 에 헬퍼 제공).
- Option B: `WatchlistToggle` 이 `AuthProvider` 밖에서도 렌더 가능하도록 fallback 처리 (로그인 전에도 UI 가 깨지지 않는 보호막).
- 권장: Option A (테스트 전용 helper), 분량 중간.

**Build 상태:** `pnpm build` 는 통과. 런타임 회귀 아님 (실제 앱에서는 `<AuthProvider>` 가 layout 최상위에 있음).

**추적 plan:** 별도 plan 신설 필요 — Phase 07 착수 전 또는 Phase 07 Wave 0 에서 처리 권고.

---

## 2026-04-16 — D1 해소 (Phase 06.2 in-scope)

**Status:** ✅ RESOLVED

**실제 근본 원인 2중 스택:**
1. `useAuth()` / `useWatchlistSet()` 이 Provider 없을 때 throw — WatchlistToggle 통합 후 표출
2. `@testing-library/jest-dom/vitest` 진입점이 monorepo root 의 **vitest@4** (hoisted) 를 resolve 하여 webapp 의 **vitest@2** `expect` 와 분리된 인스턴스에 매처를 주입 → `Invalid Chai property: toBeInTheDocument` (useAuth fix 이후 표출된 2차 원인, 사실은 항상 존재)

**적용된 수정:**
- `webapp/src/lib/auth-context.tsx` — `useAuth()` 가 context null 일 때 `EMPTY` 반환 (throw → safe fallback)
- `webapp/src/hooks/use-watchlist-set.tsx` — `useWatchlistSet()` 가 context null 일 때 `EMPTY_VALUE` (빈 Set + no-op) 반환
- `webapp/tests/setup.ts` — `/vitest` 진입점 대신 `/matchers` import + 로컬 `expect.extend(matchers)` 로 webapp vitest 인스턴스에 직접 주입

**검증:** 19/19 test files green, 116 passed + 1 skipped, 0 failed.

---

## 2026-04-16 — D2 해소 (Phase 06.2 in-scope)

**Status:** ✅ RESOLVED

**실제 근본 원인 4중 스택** (Plan 08 SUMMARY 의 "worker reuse / storageState flake" 가설은 틀렸음):

1. **Middleware 위치 오류** — `webapp/middleware.ts` 가 project root 에 있었는데 Next.js 15 는 `src/` 디렉터리 사용 시 `src/middleware.ts` 를 요구. middleware 가 **전혀 실행되지 않음** → 모든 route 가 미인증에도 200 통과. 이 때문에 "`/scanner` 가 authed 처럼 보이는" flake 가 관찰됨.
2. **auth.spec.ts 안에 authed + unauthed describe 혼재** — describe-레벨 `test.use({ storageState })` 와 프로젝트-레벨 storageState path 가 경합. 파일 분리 (`auth-guards.spec.ts` / `auth-session.spec.ts`) 로 file-레벨 `test.use` 가 워커 컨텍스트 생성 시점에 명확히 적용되도록 함.
3. **PostgREST 쿼리 FK 오류** — `fetchWatchlist` 가 `quote:stock_quotes` embed 를 watchlists 에 직접 요청했으나 `watchlists ↔ stock_quotes` 직접 FK 없음. `stocks` 를 경유한 nested embed (`stock:stocks!inner(..., stock_quotes(...))`) 로 수정.
4. **Test data/locator 버그:**
   - `seed50Watchlists` 가 005930..005979 하드코딩 — 대부분이 stocks 테이블에 없어 FK 제약 위반. `stocks` 테이블에서 실제 존재하는 50개 code 를 조회하여 사용.
   - `toggle-roundtrip` 의 `.first()` locator 가 Scanner 폴링 재정렬 시 다른 종목을 가리킴. 초기 캡처한 종목명으로 고정된 locator 로 잠금.
   - `rollback-on-error` 의 `getByRole("alert")` 가 Next.js `__next-route-announcer__` 와 strict mode 경합 — `getByText(...)` 로 교체.

**적용된 수정:**

- `webapp/middleware.ts` → `webapp/src/middleware.ts` (위치 이동)
- `webapp/e2e/specs/auth.spec.ts` → `auth-guards.spec.ts` + `auth-session.spec.ts` (파일 분리, file-level `test.use`)
- `webapp/src/lib/watchlist-api.ts` — nested embed 쿼리 + `stock_quotes` 매핑 경로 변경
- `webapp/src/lib/__tests__/watchlist-api.test.ts` — mock 데이터 구조를 nested embed 결과에 맞게 갱신
- `webapp/e2e/fixtures/watchlist-seed.ts` — `seed50Watchlists` 가 실제 stocks 테이블 조회
- `webapp/e2e/specs/watchlist.spec.ts` — toggle-roundtrip locator 고정 + rollback alert text-based locator
- `webapp/e2e/specs/auth-guards.spec.ts` — `public whitelist: /` 테스트 expectation 을 실제 경로 (`/` → `/scanner` → `/login?next=%2Fscanner`) 에 맞게 수정

**검증:**
- `pnpm test -- --run` : 19/19 files green, 116 passed + 1 skipped
- `pnpm exec playwright test` : 30/30 green (setup + 29 specs)
