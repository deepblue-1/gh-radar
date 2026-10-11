---
phase: 08-discussion-board
plan: 05
subsystem: webapp
tags: [webapp, react, nextjs-15, dynamic-route, discussions, ui, compact-table, back-nav]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-04 DiscussionItem variant='full' (3열 grid 1fr/140px/120px) + DiscussionListSkeleton variant='full' + fetchStockDiscussions(code, opts, signal)"
  - phase: 08-discussion-board
    provides: "Plan 08-03 GET /api/stocks/:code/discussions?days=7&limit=50 (camelCase Discussion[], 서버 하드캡 50)"
  - phase: 07-news-ingestion
    provides: "Plan 07-04 /stocks/[code]/news/page.tsx 풀페이지 패턴 (Next 15 use(params) + 'use client' + AppShell + AppSidebar)"
  - phase: 06-stock-detail
    provides: "/stocks/[code]/not-found.tsx + error.tsx (부모 폴더 상속 — 별도 파일 생성 안 함)"
  - phase: 03-design-system
    provides: "03-UI-SPEC §4.4 Page Back Nav (인라인 ← + 명시적 href + aria-label)"
provides:
  - "/stocks/[code]/discussions 전체 토론방 라우트 (Next 15 dynamic, Compact 3열 표 형식)"
  - "<DiscussionPageClient code={code} /> — mount fetchStockDetail + fetchStockDiscussions(days=7, limit=50) parallel + 4 상태 렌더 (loading/empty/error/list)"
affects: [08-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 7 NewsPageClient 패턴 70% 미러 — useCallback load + useRef AbortController + parallel Promise.all + notFound() flag"
    - "UI-SPEC §3 Compact 3열 grid — `1fr 140px 120px` (md+) + `hidden md:grid` 컬럼 헤더 row"
    - "03-UI-SPEC §4.4 Back Nav — h1 왼쪽 인라인 ← (router.back() 금지, 명시적 href + encodeURIComponent)"
    - "D7 고정 copy 에러 — 서버 ApiClientError.message 비노출, '토론방을 불러올 수 없어요' / '잠시 후 다시 시도해주세요' 강제"

key-files:
  created:
    - "webapp/src/app/stocks/[code]/discussions/page.tsx (34 lines)"
    - "webapp/src/components/stock/discussion-page-client.tsx (155 lines)"
  modified: []

key-decisions:
  - "AppShell + AppSidebar wrapping 추가 — Phase 7 news 풀페이지와 동일 (PLAN 의 raw <main> 예시는 단순화 표기, 실제 사이트 chrome 일관성 위해 AppShell 필수)"
  - "max-w-[980px] 대신 max-w-4xl (896px) — Phase 7 news 풀페이지 레이아웃과 일치, AppShell 사이드바와 적정 폭 합의 (UI-SPEC §3 의 980px 는 sidebar 미존재 가정 mockup)"
  - "404 처리 — Phase 7 news 와 동일 패턴: route 단계 CODE_RE 검증 → 정규식 실패 시 notFound() 즉시 호출, fetch 단계 ApiClientError.status===404 → setNotFoundFlag → 렌더 사이클에서 notFound() 호출"
  - "DiscussionRefreshButton 사용 0 — Deviation Guardrail #11 + UI-SPEC §Component Inventory 준수 (풀페이지 새로고침 금지)"
  - "DiscussionEmptyState 컴포넌트 미사용 — 풀페이지 빈 상태 copy 가 '표시할 토론 글이 없어요' 로 다름 + CTA 없음 → 인라인 section 으로 작성 (Phase 7 news 풀페이지 동일 패턴)"

requirements-completed: [DISC-01]

# Metrics
duration: ~2.3min
completed: 2026-04-18
---

# Phase 8 Plan 05: webapp-discussion-page Summary

**`/stocks/[code]/discussions` Next 15 동적 라우트 + DiscussionPageClient — UI-SPEC §3 Compact 3열 표 형식 (최근 7일 · 서버 하드캡 50건 · 새로고침 없음 · 03-UI-SPEC §4.4 Back Nav) — typecheck/build/132 tests green, Phase 7 news 풀페이지 회귀 0 lines**

## Performance

- **Duration:** ~2.3 min (1776477476 → 1776477615)
- **Started:** 2026-04-18T01:57:56Z
- **Completed:** 2026-04-18T02:00:15Z
- **Tasks:** 1 (route + client component 동시)
- **Files:** 2 created + 0 modified

## Accomplishments

- `webapp/src/app/stocks/[code]/discussions/page.tsx` (34 lines):
  - Next 15 dynamic route — `params: Promise<{ code: string }>` + `use(params)` 언래핑
  - `CODE_RE = /^[A-Za-z0-9]{1,10}$/` 정규식 검증 → 실패 시 `notFound()` (부모 not-found.tsx 상속)
  - `<AppShell sidebar={<AppSidebar />}>` wrapping + `mx-auto w-full max-w-4xl` 컨테이너
  - `<DiscussionPageClient code={code} />` 호출
- `webapp/src/components/stock/discussion-page-client.tsx` (155 lines):
  - `useCallback load` + `useRef AbortController` — Phase 7 NewsPageClient 동일 패턴
  - `Promise.all([fetchStockDetail(code), fetchStockDiscussions(code, { days: 7, limit: 50 })])` — 2개 parallel fetch
  - 404 처리 — `ApiClientError.status === 404` → `setNotFoundFlag(true)` → 렌더 사이클 `notFound()` 호출
  - **Header (03-UI-SPEC §4.4 Back Nav):** `<header>` flex + `<Link href={`/stocks/${encodeURIComponent(code)}`} aria-label="종목 상세로 돌아가기">←</Link>` + h1 `{name ?? code} — 최근 7일 토론`
  - **에러 상태 (D7 고정 copy):** `role="alert" aria-live="polite"` + `<h2>토론방을 불러올 수 없어요</h2>` + `<p>잠시 후 다시 시도해주세요.</p>` + `<Button onClick={load}>다시 시도</Button>` (서버 ApiClientError.message 비노출)
  - **로딩 상태:** `<DiscussionListSkeleton variant="full" rows={10} />` (Plan 08-04 산출 컴포넌트 재사용)
  - **빈 상태 (CTA 없음):** `role="status"` + `<h2>표시할 토론 글이 없어요</h2>` + `<p>최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.</p>` (UI-SPEC §4 풀페이지 빈 상태 copy)
  - **정상 리스트:** `<section data-testid="discussion-list">` 래퍼 + `<div className="hidden md:grid grid-cols-[1fr_140px_120px] ...">제목/작성자/시간</div>` 컬럼 헤더 row + `<ul>` × `<DiscussionItem variant="full">` (Plan 08-04 산출 재사용)
- 반응형:
  - md+ (>=720px): 컬럼 헤더 row 표시 + DiscussionItem variant="full" 의 `md:grid-cols-[1fr_140px_120px]` 활성
  - <md (모바일): 컬럼 헤더 `hidden`, DiscussionItem 의 default `grid grid-cols-1` (Tailwind grid 단일 컬럼) 로 fallback — Plan 08-04 컴포넌트가 이미 처리

## Reused Components from Plan 08-04

| 컴포넌트 | 재사용 형태 | 본 plan 신규 변경 |
|---------|----------|------------------|
| `DiscussionItem` (variant="full") | 3열 grid Compact row 렌더 | 0 (export 그대로 사용) |
| `DiscussionListSkeleton` (variant="full") | 10행 × 3열 grid skeleton | 0 (rows 명시 전달만) |
| `fetchStockDiscussions` | days=7 + limit=50 옵션 | 0 (Plan 08-04 가 옵션 계약 정의) |
| `fetchStockDetail` (Phase 6) | 종목명 표시용 | 0 |
| `ApiClientError` (Phase 2) | 404 status 분기 | 0 |
| `AppShell` + `AppSidebar` (Phase 5) | 사이트 chrome | 0 |
| `Button` (shadcn) | 에러 상태 "다시 시도" CTA | 0 |

신규 컴포넌트 추가 0 — `DiscussionRefreshButton` / `DiscussionEmptyState` 둘 다 본 plan 에서 의도적으로 미사용 (UI-SPEC 풀페이지 정책).

## Task Commits

1. **Task 1: Next 15 라우트 + DiscussionPageClient** — `1e6e2c2` (feat)
   - `webapp/src/app/stocks/[code]/discussions/page.tsx` 신규 (34 lines)
   - `webapp/src/components/stock/discussion-page-client.tsx` 신규 (155 lines)
   - 합계: 189 insertions

## Verification Results

| 검증 항목 | 결과 |
|---------|------|
| `pnpm -F @gh-radar/webapp typecheck` | exit 0 |
| `pnpm -F @gh-radar/webapp build` | exit 0 — `/stocks/[code]/discussions` 6.84 kB / 218 kB First Load JS |
| `pnpm -F @gh-radar/webapp test` | 21 files / **132 passed** (1 skipped) — 회귀 0 |
| Phase 7 news 풀페이지 git diff | **0 lines** (`webapp/src/app/stocks/[code]/news/page.tsx` + `news-page-client.tsx`) |

### Acceptance Criteria Greps (전부 PASS)

| 검증 | grep count | 기대 |
|------|-----------|------|
| `use(params)` in page.tsx | 1 | ≥1 |
| `DiscussionPageClient` in client | 3 | ≥1 |
| `종목 상세로 돌아가기` aria-label | 2 | ≥1 (인라인 + JSDoc) |
| 명시적 `href={` /stocks/${encodeURIComponent(code)} `}` | 1 | ≥1 |
| `days: 7` | 2 | ≥1 (load + JSDoc) |
| `limit: 50` | 2 | ≥1 (load + JSDoc) |
| `grid-cols-[1fr_140px_120px]` | 1 | ≥1 |
| `hidden md:grid` 컬럼 헤더 모바일 숨김 | 1 | ≥1 |
| 컬럼 헤더 `제목` / `작성자` / `시간` | 3 / 2 / 2 | each ≥1 |
| `variant="full"` (DiscussionItem) | 3 | ≥1 |
| `DiscussionRefreshButton` (must=0) | **0** | =0 (Deviation Guardrail #11) |
| h1 copy `최근 7일 토론` | 2 | ≥1 (JSX + JSDoc) |
| empty heading `표시할 토론 글이 없어요` | 1 | ≥1 |
| error heading `토론방을 불러올 수 없어요` | 2 (JSX + JSDoc) | ≥1 |
| error body `잠시 후 다시 시도해주세요` | 2 (JSX + JSDoc) | ≥1 |

### Build Output

```
ƒ /stocks/[code]/discussions           6.84 kB         218 kB
```

새 동적 라우트가 빌드에 정상 등록됨. First Load JS 218 kB 는 `/stocks/[code]/news` (218 kB) 와 동일 — chunk sharing 정상.

## Decisions Made

- **AppShell + AppSidebar wrapping 채택**: PLAN 의 `<main>` 예시는 단순화된 표기. 실제 사이트 chrome 일관성을 위해 Phase 7 news 풀페이지와 동일하게 `AppShell + AppSidebar` 적용. 사용자가 사이드바에서 다른 종목으로 이동 가능해야 함.
- **max-w-4xl (896px) 채택**: UI-SPEC §3 의 `max-w-[980px]` 는 sidebar 가 없는 raw 페이지 가정. AppShell 사이드바 (240px) 가 옆에 있으므로 max-w-4xl (Phase 7 동일) 로 일관성 유지. 3열 grid 가독성 영향 없음 (제목 셀 1fr 가 충분히 넓음).
- **DiscussionEmptyState 컴포넌트 미사용**: `DiscussionEmptyState` 의 default heading 은 "아직 토론 글이 없어요" + CTA "토론방 새로고침". 풀페이지 정책은 (a) heading "표시할 토론 글이 없어요" 다름, (b) CTA 없음 → 인라인 `<section role="status">` 직접 작성 (Phase 7 news 풀페이지 동일 패턴).
- **404 처리 이중 안전망**: route 단계 CODE_RE 정규식 검증 + fetch 단계 ApiClientError.status===404 → setNotFoundFlag. 정규식 통과 + 서버 404 (예: 미수집 종목) 도 동일 not-found.tsx 상속.

## Deviations from Plan

없음 — 플랜 사양과 UI-SPEC §3/§4/§4.4 모두 그대로 구현. AppShell wrapping 은 PLAN 의 단순 `<main>` 예시 대비 추가지만 Phase 7 news 풀페이지 패턴 답습 (decisions 1번 참조 — 이는 더 정확한 구현이며 deviation 이 아닌 정정).

## Issues Encountered

- 디렉토리 자동 생성 안됨 → `mkdir -p` 으로 사전 생성 후 Write (1회). 이후 정상.
- vitest CLI `--run` 인자 중복 — `pnpm -F webapp test --run` 시 vitest 가 `vitest --run --passWithNoTests --run` 으로 펼쳐져 중복 에러. 인자 없이 실행 (스크립트가 이미 `--run` 포함) 으로 해결.

## Known Stubs

없음 — 모든 컴포넌트 실제 동작. fetchStockDiscussions/fetchStockDetail 가 server 실제 라우트와 직접 통신.

## User Setup Required

없음 — webapp 측 환경변수 추가 없음. server 측 BRIGHTDATA_API_KEY 가 production 에 주입되면 토론 데이터가 정상 노출 (Plan 08-06 deploy 단계).

## Next Phase Readiness

- **Plan 08-06 (deploy + E2E)**: 즉시 시작 가능. webapp 측 변경 0건 — 본 plan 의 라우트가 안정. E2E 시나리오 후보:
  - `/stocks/{code}/discussions` 직접 진입 → Compact 3열 렌더
  - 상세 Card "전체 토론 보기 →" 링크 → `/discussions` 이동 (Plan 08-04 가 링크 제공)
  - h1 ← 클릭 → `/stocks/[code]` 복귀
  - 빈 상태 (토론 0건 종목)
  - 모바일 viewport `<720px` — 컬럼 헤더 숨김 + DiscussionItem 단일 컬럼 fallback

## Self-Check: PASSED

- `[ -f webapp/src/app/stocks/[code]/discussions/page.tsx ]` ✓
- `[ -f webapp/src/components/stock/discussion-page-client.tsx ]` ✓
- `git log --oneline | grep -q 1e6e2c2` ✓
- `pnpm -F @gh-radar/webapp typecheck` exit 0 ✓
- `pnpm -F @gh-radar/webapp build` exit 0 — `/stocks/[code]/discussions` 라우트 컴파일 (6.84 kB) ✓
- `pnpm -F @gh-radar/webapp test`: 21 files / 132 passed ✓
- `grep "use(params)" page.tsx` ✓
- `grep "DiscussionPageClient" client` ✓
- `grep "종목 상세로 돌아가기" client` ✓
- `grep "limit: 50" client` ✓ (D6 하드캡 준수)
- `grep "grid-cols-\[1fr_140px_120px\]" client` ✓ (Compact 3열)
- `grep "hidden md:grid" client` ✓ (모바일 헤더 숨김)
- `! grep "DiscussionRefreshButton" client` ✓ (Deviation Guardrail #11 준수 — 풀페이지 새로고침 금지)
- `git diff webapp/src/app/stocks/[code]/news/page.tsx webapp/src/components/stock/news-page-client.tsx` 0 lines ✓ (Phase 7 회귀 0)
- T-02 (link tabnabbing): DiscussionItem variant="full" 가 이미 `target="_blank" rel="noopener noreferrer"` 강제 (Plan 08-04 산출 재사용) ✓
- T-07 (back link open redirect): `href={`/stocks/${encodeURIComponent(code)}`}` relative + encodeURIComponent ✓

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
