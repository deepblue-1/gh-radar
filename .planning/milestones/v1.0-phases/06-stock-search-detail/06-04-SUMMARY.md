---
phase: 06-stock-search-detail
plan: 04
subsystem: webapp/stock-detail-view
tags: [stock-detail, hero, stats-grid, em-dash, skeleton, abort-controller, not-found, vitest]
requires:
  - 06-01 (vitest + RTL + user-event + jsdom polyfill)
  - 06-02 (fetchStockDetail, ApiClientError)
  - webapp/src/components/ui/{number,card,badge,skeleton,button}.tsx
  - "@gh-radar/shared Stock 타입"
provides:
  - "StockHero — 종목명·코드·마켓배지·현재가(Display 30/24 반응형)·등락액/등락률"
  - "StockStatsGrid — 8필드 Card grid + em-dash 정책 (value<=0 || !Number.isFinite)"
  - "ComingSoonCard — Phase 7/8 placeholder 공용 presentational"
  - "StockDetailClient — fetch + refresh + 404→notFound + 인라인 에러 오케스트레이션"
  - "StockDetailSkeleton — Hero+Stats 레이아웃 동일 유지"
affects:
  - Plan 05 (page.tsx) — StockDetailClient 를 dynamic route 에서 마운트
  - Plan 05 (not-found.tsx / error.tsx) — 404 분기 계약 확정
tech_stack_added: []
patterns:
  - "Number 전역 shadow 방지: import { Number as NumberDisplay } 별칭 (전역 Number.isFinite 보존)"
  - "em-dash 정책 per-cell flag: StatCell.nullAsEmDash — 거래량/거래대금은 false (0 정상값)"
  - "404 명시 분기 (notFound()) + 기타 에러 state 유지 (error.tsx 가 not-found 가로채지 않도록 — Pitfall 5)"
  - "changeRate 서버 정수% (2.09=2.09%) → /100 후 Number format=percent (소수 기대치) 매핑"
  - "AbortController unmount cleanup + signal.aborted 체크 + AbortError name 명시 skip (Plan 02 훅과 동일 패턴)"
  - "stale-but-visible: refresh 실패 시 기존 stock 유지 + '최근 갱신 실패' 문구 병기"
key_files_created:
  - webapp/src/components/stock/stock-hero.tsx
  - webapp/src/components/stock/stock-stats-grid.tsx
  - webapp/src/components/stock/coming-soon-card.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/components/stock/stock-detail-skeleton.tsx
  - webapp/src/components/stock/__tests__/stock-hero.test.tsx
  - webapp/src/components/stock/__tests__/stock-stats-grid.test.tsx
  - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
  - webapp/src/__tests__/fixtures/stocks.ts
key_files_modified: []
decisions:
  - "Number 컴포넌트를 NumberDisplay 별칭으로 import — 전역 JS Number 빌트인과의 name shadow 를 방지 (Number.isFinite TypeError 재발 방지)"
  - "updatedAtLabel 포맷은 `갱신 HH:MM:SS KST` 로 고정 (Phase 5 scanner-filters 의 ko-KR Asia/Seoul 패턴 상속)"
  - "인라인 에러 카드 패턴 채택 — 404 만 notFound() 로 error.tsx 분기, 나머지 에러는 state 로 유지하여 stale-but-visible 가능"
  - "테스트용 공용 fixture 를 src/__tests__/fixtures/stocks.ts 에 분리 — e2e/fixtures 와 값 동기 유지하되 src 바깥 경로 import 회피"
metrics:
  duration_minutes: 12
  commits: 2
  tasks_completed: 2
completed_date: 2026-04-15
---

# Phase 06 Plan 04: Stock Detail View & Orchestration Summary

**One-liner:** StockHero·StatsGrid·ComingSoonCard·StockDetailClient(+Skeleton) 5개 모듈로 SRCH-03 뷰 계층을 완결 — em-dash 정책(Pitfall 1) · 404 notFound 분기(Pitfall 5) · Number shadow 버그를 15 단위 테스트로 증명.

## Context

Phase 06 Wave 2 — Plan 05 page.tsx 가 dynamic route `/stocks/[code]` 에서 마운트할 뷰 컴포넌트와 fetch 오케스트레이션 클라이언트. Plan 02 에서 공급한 `fetchStockDetail` + `ApiClientError` 를 소비.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | StockHero + StockStatsGrid + ComingSoonCard + 8 tests | `2e58bd4` | stock-hero.tsx · stock-stats-grid.tsx · coming-soon-card.tsx · __tests__/stock-hero.test.tsx · __tests__/stock-stats-grid.test.tsx · __tests__/fixtures/stocks.ts |
| 2 | StockDetailClient + StockDetailSkeleton + 7 tests | `ec34f03` | stock-detail-client.tsx · stock-detail-skeleton.tsx · __tests__/stock-detail-client.test.tsx |

## Verification

- `pnpm --filter @gh-radar/webapp test -- --run` → **81 passed (12 files)** — Phase 5/6 이전 회귀 0, 신규 15 pass (Hero 3 + Stats 5 + DetailClient 7).
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit` → **EXIT 0**.
- Acceptance criteria grep 전부 매치:
  - stock-hero: `md:text-[length:var(--t-h1)]` ✓
  - stock-stats-grid: `grid-cols-2 md:grid-cols-3` · `c.value <= 0` · `!Number.isFinite` ✓, 8 라벨 전부 ✓
  - stock-detail-client: `'use client'` · `fetchStockDetail` · `err.status === 404` · `notFound()` · `Asia/Seoul` · `관련 뉴스` · `Phase 7 로드맵에서 제공됩니다.` · `Phase 8 로드맵에서 제공됩니다.` · `새로고침` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Number` 컴포넌트 전역 shadow → `Number.isFinite` TypeError**

- **Found during:** Task 1 최초 테스트 실행 시 8 tests 전부 `TypeError: Number.isFinite is not a function` 로 실패.
- **Issue:** `import { Number } from '@/components/ui/number'` 가 파일 스코프에서 JS 빌트인 전역 `Number` 를 가려 `Number.isFinite(stock.price)` 호출이 React 컴포넌트 객체의 정적 메서드 조회로 해석됨 (존재하지 않음 → TypeError).
- **Fix:** 두 컴포넌트(stock-hero.tsx / stock-stats-grid.tsx)에서 import 를 `Number as NumberDisplay` 별칭으로 변경. 전역 `Number.isFinite` 보존 + JSX 에서는 `<NumberDisplay>` 로 렌더.
- **Why Rule 1:** PLAN 원본 코드 예시가 직접 `import { Number }` 를 지시했으나 실제로 동작 불가한 버그 — 코드의 "의도한 대로 동작" 기준을 충족하려면 shadow 해소가 필수.
- **Files modified:** `webapp/src/components/stock/stock-hero.tsx`, `webapp/src/components/stock/stock-stats-grid.tsx`.
- **Commit:** `2e58bd4` (Task 1 최종 커밋에 포함).

### Minor planner-spec 보완

**2. [Rule 2 - 누락된 안전장치] StockDetailClient catch 에서 AbortError 명시 skip**

- **Found during:** Task 2 구현 리뷰.
- **Issue:** PLAN 의 `action` 예시는 `controller.signal.aborted` 만 체크 — 하지만 브라우저 fetch 가 abort 시 `AbortError` 를 throw 하므로 Plan 02 debounce 훅과 동일한 race window 존재.
- **Fix:** catch 첫 줄에 `if (err instanceof Error && err.name === 'AbortError') return;` 추가.
- **Commit:** `ec34f03`.

## 인증 게이트

없음. 로컬 vitest 만 실행.

## Known Stubs

없음. ComingSoonCard 는 Phase 7/8 placeholder 이지만 page.tsx 에서 실제 카피 ("관련 뉴스" / "종목토론방") 를 주입하는 presentational 컴포넌트로서 의도된 설계 (CONTEXT D4).

## Threat Flags

없음. 신규 네트워크 경로 0 (Plan 02 `fetchStockDetail` 재사용). `code` 파라미터는 Plan 02 에서 `encodeURIComponent` 이미 적용되며 서버 regex 도 동일.

## Success Criteria 충족

- [x] StockHero·StockStatsGrid·ComingSoonCard·StockDetailClient·StockDetailSkeleton 5개 파일 commit
- [x] em-dash 정책으로 Pitfall 1 (mapper null→0) 방어 — 시가·고가·저가·시총·상한가·하한가 테스트 (Test 5)
- [x] 404 분기로 Pitfall 5 (error.tsx 가로챔) 방어 — notFound() 스파이 테스트 (Test 5 DetailClient)
- [x] Plan 05 page.tsx 가 `<StockDetailClient code={code} />` 로 마운트 가능 — 시그니처 고정 (`code: string` 단일 prop)
- [x] 15 단위 테스트 전부 pass, 이전 66 tests 회귀 0

## Self-Check: PASSED

- FOUND: webapp/src/components/stock/stock-hero.tsx
- FOUND: webapp/src/components/stock/stock-stats-grid.tsx
- FOUND: webapp/src/components/stock/coming-soon-card.tsx
- FOUND: webapp/src/components/stock/stock-detail-client.tsx
- FOUND: webapp/src/components/stock/stock-detail-skeleton.tsx
- FOUND: webapp/src/components/stock/__tests__/stock-hero.test.tsx
- FOUND: webapp/src/components/stock/__tests__/stock-stats-grid.test.tsx
- FOUND: webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
- FOUND: webapp/src/__tests__/fixtures/stocks.ts
- FOUND: 2e58bd4 (Task 1)
- FOUND: ec34f03 (Task 2)
