---
phase: 06-stock-search-detail
plan: 05
subsystem: webapp/stock-detail-route
tags: [next15, dynamic-route, params-promise, not-found, error-boundary, regex-validation]
requires:
  - 06-04 (StockDetailClient, <code: string> 단일 prop 시그니처)
  - webapp/src/components/layout/{app-shell,center-shell}.tsx
  - webapp/src/components/ui/button.tsx (asChild 지원)
provides:
  - "/stocks/[code] 동적 라우트 (Next 15 Promise params + React.use)"
  - "code regex ^[A-Za-z0-9]{1,10}$ 클라 1차 검증 → notFound()"
  - "not-found.tsx — UI-SPEC 404 카피 + /scanner 링크"
  - "error.tsx — error.message + reset() CTA"
affects:
  - Plan 06 (E2E) — /stocks/005930, /stocks/INVALID 시나리오 본 라우트에 의존
tech_stack_added: []
patterns:
  - "'use client' + React.use(params) — Next 15 Promise params (R4)"
  - "클라 regex 검증 실패 → 즉시 notFound() (서버 regex 와 동일 문법)"
  - "AppShell mock 패턴 재사용 (next-themes/사이드바 의존 차단)"
  - "console.error spy 로 error.tsx useEffect 로그 누수 차단"
key_files_created:
  - webapp/src/app/stocks/[code]/page.tsx
  - webapp/src/app/stocks/[code]/not-found.tsx
  - webapp/src/app/stocks/[code]/error.tsx
  - webapp/src/app/stocks/[code]/__tests__/not-found.test.tsx
  - webapp/src/app/stocks/[code]/__tests__/error.test.tsx
key_files_modified: []
decisions:
  - "CenterShell 이 이미 존재 → page.tsx 에서 대체 main 블록 없이 그대로 사용 (webapp/src/components/layout/center-shell.tsx 확인 완료)"
  - "Button asChild 이미 지원 (radix-ui Slot.Root) → not-found.tsx 에서 Link 래핑 그대로 채택"
  - "error.tsx 테스트에서 useEffect console.error 를 vi.spyOn 으로 suppress — 테스트 로그 클린업 (Plan 원본 스크립트에 없던 보완)"
metrics:
  duration_minutes: 2
  commits: 2
  tasks_completed: 2
completed_date: 2026-04-15
---

# Phase 06 Plan 05: /stocks/[code] Dynamic Route Summary

**One-liner:** `/stocks/[code]` 동적 라우트 + 전용 not-found/error boundary 3개 파일로 SRCH-03 배선 완결 — Next 15 Promise params(`React.use`) · 클라 regex 1차 검증 · UI-SPEC 카피 정확 일치를 2 단위 테스트로 증명, `next build` 로 라우트 등록 확인.

## Context

Phase 06 Wave 3 — Plan 04 가 공급한 `<StockDetailClient code={code} />` 를 Next.js 15 App Router 동적 세그먼트에 실제 마운트. Plan 06 E2E(playwright) 가 `/stocks/005930`·`/stocks/INVALID` 를 실행 대상으로 삼기 전 라우트 실체화가 필요했다.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | page.tsx + not-found.tsx + error.tsx 라우트 3종 작성 | `9297c06` | app/stocks/[code]/page.tsx · not-found.tsx · error.tsx |
| 2 | not-found / error 단위 테스트 2건 | `7db02c0` | __tests__/not-found.test.tsx · __tests__/error.test.tsx |

## Verification

- `pnpm --filter @gh-radar/webapp test -- --run` → **83 passed (14 files)** — Phase 6 이전 81 회귀 0 + 신규 2 pass.
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit` → **EXIT 0**.
- `pnpm --filter @gh-radar/webapp build` → **EXIT 0** — `ƒ /stocks/[code]  3.34 kB  143 kB` 로 라우트 등록 확인 (dynamic segment ƒ 마커).
- Acceptance criteria grep 전부 매치:
  - page.tsx: `'use client'` · `use(params)` · `CODE_RE` · `^[A-Za-z0-9]{1,10}$` · `notFound()` · `<StockDetailClient` ✓
  - not-found.tsx: `종목을 찾을 수 없습니다` · `영문/숫자 1~10자` · `스캐너로 돌아가기` · `href="/scanner"` ✓
  - error.tsx: `데이터를 불러오지 못했습니다` · `다시 시도` · `onClick={reset}` ✓

## Deviations from Plan

### Minor planner-spec 보완

**1. [Rule 2 - 테스트 로그 누수 차단] error.test.tsx 에서 console.error spy 추가**

- **Found during:** Task 2 구현 리뷰 — error.tsx 는 useEffect 내부에서 `console.error('[gh-radar] stock detail error:', error)` 를 호출. PLAN 원본 테스트 스크립트는 이를 suppress 하지 않아 CI 로그 오염 가능성.
- **Fix:** `vi.spyOn(console, 'error').mockImplementation(() => {})` 추가 + 테스트 끝에 `spy.mockRestore()`.
- **Files modified:** `webapp/src/app/stocks/[code]/__tests__/error.test.tsx`.
- **Commit:** `7db02c0`.

그 외 plan 정확 실행. CenterShell 존재 확인 완료(폴백 main 블록 불필요). Button asChild 지원 확인 완료.

## 인증 게이트

없음. 로컬 vitest + tsc + next build 만 실행.

## Known Stubs

없음. 라우트 3종은 모두 완결 UI — placeholder 또는 TODO 없음.

## Threat Flags

없음. 신규 네트워크 경로 0. `code` 는 클라 regex (`^[A-Za-z0-9]{1,10}$`) + 서버 regex 이중 검증으로 SSRF/path-injection 이미 차단.

## Success Criteria 충족

- [x] `/stocks/005930` 경로 빌드 타임 등록 확인 — `next build` 출력 `ƒ /stocks/[code]  3.34 kB`
- [x] `/stocks/!!!` (regex 실패) → page.tsx 가 즉시 notFound() 호출 브랜치
- [x] `/stocks/INVALID` (regex 통과, 서버 404) → Plan 04 DetailClient 가 `err.status===404` 에서 notFound() (Plan 04 Test 5 기증명)
- [x] UI-SPEC Copywriting 4 카피 문자열 정확 일치 (제목 2/본문 2/CTA 2)
- [x] 5 파일 commit, 83 tests pass

## Self-Check: PASSED

- FOUND: webapp/src/app/stocks/[code]/page.tsx
- FOUND: webapp/src/app/stocks/[code]/not-found.tsx
- FOUND: webapp/src/app/stocks/[code]/error.tsx
- FOUND: webapp/src/app/stocks/[code]/__tests__/not-found.test.tsx
- FOUND: webapp/src/app/stocks/[code]/__tests__/error.test.tsx
- FOUND: 9297c06 (Task 1)
- FOUND: 7db02c0 (Task 2)
