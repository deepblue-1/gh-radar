---
phase: 08-discussion-board
plan: 04
subsystem: webapp
tags: [webapp, react, nextjs-15, discussions, ui, kst, intl-datetimeformat, brightdata-consumer, sse-rest-mix, vitest]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-01 packages/shared Discussion 타입 (camelCase)"
  - phase: 08-discussion-board
    provides: "Plan 08-03 server routes — GET /api/stocks/:code/discussions + POST /discussions/refresh (camelCase envelope, 429 retry_after_seconds, 503 PROXY_*)"
  - phase: 07-news-ingestion
    provides: "Plan 07-04 stock-detail-client.tsx space-y-6 컨테이너 + StockNewsSection (Wave 2 merge)"
  - phase: 07-news-ingestion
    provides: "stock-news-section.tsx / news-item.tsx / news-refresh-button.tsx / news-empty-state.tsx / news-list-skeleton.tsx (70~80% 복제 기준)"
provides:
  - "fetchStockDiscussions(code, opts, signal): Promise<Discussion[]>"
  - "refreshStockDiscussions(code, signal): Promise<Discussion[]>"
  - "formatDiscussionCardDate / formatDiscussionFullDate (KST Intl.DateTimeFormat)"
  - "<StockDiscussionSection stockCode={code} /> (상세 페이지 2번째 자식 — Card + Stale Badge + 30s 쿨다운 + 429 retry_after_seconds + 5xx inline 3s soft alert)"
  - "DiscussionItem (variant card/full — T-02 noopener noreferrer + line-clamp-2 body preview)"
  - "DiscussionRefreshButton / DiscussionEmptyState / DiscussionListSkeleton (Phase 7 패턴 미러)"
affects: [08-05, 08-06]

# Tech tracking
tech-stack:
  added:
    - "lucide-react MessageSquare/MessageSquareOff 아이콘 신규 사용 (의존성 없음 — 기존 lucide-react 패키지 내)"
  patterns:
    - "Phase 7 stock-news-section.tsx 패턴 70~80% 미러 — fetch on mount + AbortController + 30s 로컬 쿨다운 + 429 retry_after_seconds 우선 + 5xx inline 3s 소거"
    - "Stale 오케스트레이션 (D7) — refresh 5xx 실패 시 기존 list 유지 + 'X분/시간 전 데이터' Badge + 1분 단위 setInterval 갱신"
    - "고정 copy 에러 메시지 — 서버 원문 비노출 (D7), '토론방을 불러올 수 없어요/잠시 후 다시 시도해주세요'"
    - "Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' }) 직접 사용 (date-fns-tz 미도입 — UI-SPEC Deviation Guardrail §2)"
    - "공통 추상화 회피 (UI-SPEC §20) — format-news-date 와 format-discussion-date 의도적 분리"

key-files:
  created:
    - "webapp/src/lib/format-discussion-date.ts"
    - "webapp/src/lib/__tests__/format-discussion-date.test.ts"
    - "webapp/src/components/stock/discussion-item.tsx"
    - "webapp/src/components/stock/discussion-refresh-button.tsx"
    - "webapp/src/components/stock/discussion-empty-state.tsx"
    - "webapp/src/components/stock/discussion-list-skeleton.tsx"
    - "webapp/src/components/stock/stock-discussion-section.tsx"
  modified:
    - "webapp/src/lib/stock-api.ts (+FetchDiscussionsOpts, +fetchStockDiscussions, +refreshStockDiscussions)"
    - "webapp/src/components/stock/stock-detail-client.tsx (-ComingSoonCard import + JSX, +StockDiscussionSection import + JSX)"
    - "webapp/src/components/stock/__tests__/stock-detail-client.test.tsx (Test 2 회귀 — ComingSoonCard 단언 → DiscussionEmptyState, vi.mock 에 fetchStockDiscussions/refreshStockDiscussions 빈 배열 stub 추가)"

key-decisions:
  - "MessageSquareOff 아이콘 채택 (Inbox 대안) — 토론방 의미 일관성 우선. UI-SPEC 은 둘 다 허용했으나 한 종류로 일관 사용"
  - "Stale 계산 — MAX(scrapedAt) 기준 (첫 행이 아니라 list 전체 max). UPSERT 가 scraped_at 을 갱신하므로 사실상 모든 행이 동일 시각이지만 안전을 위해 max 채택"
  - "Stale 임계값 10분 — D7 명세대로 (캐시 TTL 과 일치). 60분 초과 시 '시간' 단위 전환"
  - "format-discussion-date 와 format-news-date 의도적 중복 — UI-SPEC §20 (공통 추상화 Deferred). 작은 코드 중복 < 미래 변경 격리"
  - "쿨다운 카운트다운 — Phase 7 패턴 답습 (cooldownUntil + nowMs setInterval(1s)). 별도 cooldownSeconds state 두지 않고 useMemo 대신 직접 계산 (Math.ceil((cooldownUntil - nowMs) / 1000))"
  - "5xx 실패 시 stale-but-visible (D7) — 기존 discussions 유지 + inline error 3s + Stale Badge 즉시 갱신. Empty 로 떨어지지 않음"
  - "ComingSoonCard import 제거 — 다른 호출자 0건 확인 (info-stock-card.tsx 등에서 사용 안 함). Tree-shake 효과"

requirements-completed: [DISC-01]

# Metrics
duration: ~6.6min
completed: 2026-04-18
---

# Phase 8 Plan 04: webapp-discussion-section Summary

**stock-detail-client.tsx 의 ComingSoonCard placeholder 를 실제 종목토론방 Card 로 교체 — Phase 7 stock-news-section.tsx 패턴 미러 + Stale 오케스트레이션(D7) + 9 KST 포맷 tests + typecheck/build/132 tests green, Phase 7 회귀 0**

## Performance

- **Duration:** ~6.6 min (1776476854 → 1776477250)
- **Started:** 2026-04-18T01:47:34Z
- **Completed:** 2026-04-18T01:54:10Z
- **Tasks:** 3 (API 클라이언트+유틸 / 컴포넌트 5종 / mount 교체)
- **Files:** 7 created + 3 modified

## Accomplishments

- `fetchStockDiscussions(code, { hours?, days?, limit? }, signal)` — 서버 `DiscussionListQuery` 계약 (hours 우선 → days fallback → 서버 default days=7), limit clamp 50 (서버 측)
- `refreshStockDiscussions(code, signal)` — POST /discussions/refresh, 429 → ApiClientError.details.retry_after_seconds, 503 → PROXY_UNAVAILABLE/PROXY_BUDGET_EXHAUSTED
- `format-discussion-date.ts` — `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 기반 MM/DD HH:mm + YYYY-MM-DD HH:mm 포맷 2종, em-dash fallback
- `<DiscussionItem>` — variant card (세로 flex, 제목 2줄 clamp + body preview 2줄 clamp + 메타 inline) / variant full (3열 grid `1fr_140px_120px`, 1줄 clamp). 양쪽 모두 T-02 (target=_blank rel=noopener noreferrer + aria-label 새 창 명시)
- `<DiscussionRefreshButton>` — Phase 7 NewsRefreshButton 1:1 미러 (idle/refreshing/cooldown 3 states, aria-label 분기, `{N}s` mono inline)
- `<DiscussionEmptyState>` — MessageSquareOff size-10 + heading "아직 토론 글이 없어요" + body + CTA (cooldown 인지)
- `<DiscussionListSkeleton variant="card|full">` — card 5행 4줄 / full 10행 3열 grid, skeleton-list shimmer
- `<StockDiscussionSection>` — 핵심 오케스트레이터:
  - mount fetchStockDiscussions(hours=24, limit=5) + AbortController + cleanup
  - 30s 로컬 쿨다운 + setInterval(1s) tick + 429 retry_after_seconds 우선 적용
  - 5xx 실패 → inline error 3s 자동 소거 + Stale Badge 갱신 + 기존 list 유지 (D7)
  - Stale Badge — `staleMinutes >= 10` 시 "{N}분 전 데이터" / 60분 초과 시 "{N}시간 전 데이터", 1분 단위 갱신
  - 초기 에러 (캐시 없음) → 고정 copy "토론방을 불러올 수 없어요/잠시 후 다시 시도해주세요" + 다시 시도 버튼 (D7 서버 원문 비노출)
- stock-detail-client.tsx — `space-y-6` 컨테이너 2번째 자식만 교체 (D12 guardrail 준수). News(141) < Discussion(142) 순서 유지

## Task Commits

1. **Task 1: API 클라이언트 + KST 날짜 포맷 유틸 + tests (TDD)** — `ff52586` (feat)
   - webapp/src/lib/stock-api.ts +66 줄 (fetchStockDiscussions/refreshStockDiscussions/FetchDiscussionsOpts)
   - webapp/src/lib/format-discussion-date.ts 신규 (CARD_FMT + FULL_DATE_FMT + parseSafe + partsOf)
   - webapp/src/lib/__tests__/format-discussion-date.test.ts 신규 (9 tests: card 5 + full 4)
2. **Task 2: 컴포넌트 5종 신규** — `2634cbd` (feat)
   - discussion-item.tsx / discussion-refresh-button.tsx / discussion-empty-state.tsx / discussion-list-skeleton.tsx / stock-discussion-section.tsx 5 신규 파일 (567 insertions)
3. **Task 3: stock-detail-client.tsx mount 교체 + 테스트 회귀 수정** — `8d8f8b1` (feat)
   - stock-detail-client.tsx — ComingSoonCard 제거, StockDiscussionSection import + JSX 추가
   - stock-detail-client.test.tsx — Test 2 회귀 fix (DiscussionEmptyState 단언 + vi.mock 확장)

## Test Results

| 파일 | 결과 |
|------|------|
| webapp/src/lib/__tests__/format-discussion-date.test.ts | **9 passed** (card 5 + full 4) |
| webapp/src/lib/__tests__/format-news-date.test.ts | **7 passed** (Phase 7 회귀 0) |
| webapp/src/components/stock/__tests__/stock-detail-client.test.tsx | **7 passed** (Test 2 회귀 fix 후) |
| webapp 전체 vitest | **21 files / 132 tests passed** (1 skipped) |
| `pnpm -F @gh-radar/webapp typecheck` | exit 0 |
| `pnpm -F @gh-radar/webapp build` | exit 0 (`/stocks/[code]` 8.44 kB) |

## Files Created/Modified

### Created (7)
- `webapp/src/lib/format-discussion-date.ts` (61 lines)
- `webapp/src/lib/__tests__/format-discussion-date.test.ts` (55 lines)
- `webapp/src/components/stock/discussion-item.tsx` (96 lines)
- `webapp/src/components/stock/discussion-refresh-button.tsx` (60 lines)
- `webapp/src/components/stock/discussion-empty-state.tsx` (53 lines)
- `webapp/src/components/stock/discussion-list-skeleton.tsx` (84 lines)
- `webapp/src/components/stock/stock-discussion-section.tsx` (276 lines)

### Modified (3)
- `webapp/src/lib/stock-api.ts` (+58 lines: import Discussion, FetchDiscussionsOpts, fetchStockDiscussions, refreshStockDiscussions, JSDoc 갱신)
- `webapp/src/components/stock/stock-detail-client.tsx` (-5 / +2 lines: ComingSoonCard import + JSX 제거, StockDiscussionSection import + JSX 추가)
- `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx` (-7 / +9 lines: vi.mock 확장 + Test 2 단언 교체)

## stock-detail-client.tsx Diff 요약

**Before (Phase 7 완료 상태, 14-15 imports + 142-145 JSX):**
```tsx
import { ComingSoonCard } from './coming-soon-card';
import { StockNewsSection } from './stock-news-section';
...
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />
</div>
```

**After (현재):**
```tsx
import { StockNewsSection } from './stock-news-section';
import { StockDiscussionSection } from './stock-discussion-section';
...
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <StockDiscussionSection stockCode={stock.code} />
</div>
```

**Guardrail 검증:**
- StockDiscussionSection grep count = 2 (import + JSX) ✓
- StockNewsSection grep count = 2 (Phase 7 무회귀) ✓
- `ComingSoonCard title="종목토론방"` grep = 0 (placeholder 완전 제거) ✓
- space-y-6 컨테이너 1회 유지 ✓
- md:grid-cols-2 / grid-cols-[1fr_1fr] = 0 (D12 — 2열 복원 금지) ✓
- News(141) < Discussion(142) — 순서 정상 ✓
- Phase 7 stock-news-section.tsx git diff 0 lines ✓

## Decisions Made

- **MessageSquareOff vs Inbox 아이콘**: MessageSquareOff 채택. UI-SPEC §Component Inventory 가 둘 다 허용하나, "토론방" 의미와 직접적으로 일관되는 아이콘. Inbox 는 우편함 의미가 강해 토론 도메인과 겹치지 않음.
- **Stale 계산 max 사용**: list 전체의 MAX(scrapedAt) 사용. UPSERT 시 모든 행의 scraped_at 이 동일 시각으로 갱신되므로 사실상 첫 행과 동일하지만, 부분 fetch 시나리오 (각 행 scraped 시각이 다른 경우) 안전성 확보. 1분 단위 setInterval 갱신.
- **format-discussion-date 와 format-news-date 분리 유지**: UI-SPEC §20 명시 (공통 추상화 Deferred). 두 함수 본문이 90% 동일하지만 작은 중복 < 미래 변경(예: 토론은 초 단위까지 표시) 격리. Phase 8 완료 후 리팩터링 plan 에서 통합 검토.
- **쿨다운 패턴**: Phase 7 NewsRefreshButton 의 `cooldownUntil + nowMs setInterval(1s) → cooldownSeconds = Math.ceil((cooldownUntil - nowMs) / 1000)` 답습. 별도 useMemo 미사용.
- **5xx 처리 — Stale-but-visible (D7)**: refresh 실패 시 캐시 list 유지 + Stale Badge 즉시 갱신. 빈 화면으로 떨어지지 않음. 사용자 mental model 유지.
- **고정 copy (D7)**: 초기 로드 에러는 서버 원문 비노출, "토론방을 불러올 수 없어요" + "잠시 후 다시 시도해주세요" 고정. 프록시 차단/네트워크 사정은 사용자에게 위험 신호로 전달하지 않음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] stock-detail-client.test.tsx Test 2 회귀**
- **Found during:** Task 3 (mount 교체 후 typecheck 통과했으나 vitest 실행 시 발견)
- **Issue:** 기존 테스트가 `screen.getByText('종목토론방')` + `screen.getByText('Phase 8 로드맵에서 제공됩니다.')` 로 ComingSoonCard placeholder 의 노출을 명시적으로 단언하고 있음. 또한 StockDiscussionSection mount 시 `fetchStockDiscussions` 호출이 일어나는데 `vi.mock('@/lib/stock-api', ...)` 에서 stub 미선언 → undefined 함수 호출.
- **Fix:** (a) Test 2 단언을 DiscussionEmptyState 의 '아직 토론 글이 없어요' 로 교체, (b) `vi.mock` 의 factory 에 `fetchStockDiscussions: vi.fn().mockResolvedValue([])` + `refreshStockDiscussions: vi.fn().mockResolvedValue([])` 추가.
- **Files affected:** webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
- **Verification:** 21 test files / 132 tests passed.
- **Committed in:** `8d8f8b1`

---

**Total deviations:** 1 (auto-fixed in scope)

## Issues Encountered

- **Test 2 의 ComingSoonCard 단언이 기존에 의도적으로 작성된 placeholder 보호 단언이었음** — Phase 7 시점에는 "still ComingSoonCard" 임을 단언하는 의도. Phase 8 가 placeholder 를 교체하면서 이 단언이 자연스럽게 무효화됨. 위 deviation 1 에서 자동 fix.
- 그 외 issue 없음 — Phase 7 패턴이 거의 1:1 미러 가능했음. Stale 오케스트레이션만 신규 추가.

## Known Stubs

없음 — 모든 컴포넌트 실제 동작. fetchStockDiscussions/refreshStockDiscussions 가 server Plan 08-03 의 실제 라우트와 직접 통신.

**참고:** discussion-item.tsx 의 `variant="full"` 은 본 plan 에서 export 만 되고 실제 사용처는 Plan 08-05 (`/stocks/[code]/discussions` 페이지)에서 등장 예정. 이는 stub 이 아니라 의도된 사전 export.

## User Setup Required

없음 — webapp 측 환경변수 추가 없음. server (Plan 08-03) 의 BRIGHTDATA_API_KEY 가 production deploy 단계 (Plan 08-06)에서 주입되면 즉시 동작.

dev 환경에서 server BRIGHTDATA_API_KEY 미설정 시 POST /discussions/refresh 가 503 PROXY_UNAVAILABLE 응답 → webapp 의 inline error 토스트 ('토론방을 갱신하지 못했어요') 가 정상 노출되며 Stale Badge 도 동작 (graceful degradation).

## Next Phase Readiness

- **Plan 08-05 (`/stocks/[code]/discussions` 풀페이지)**: 즉시 시작 가능. DiscussionItem 의 `variant="full"` 이 이미 export, DiscussionListSkeleton 의 `variant="full"` 도 준비됨. Plan 08-05 는 page.tsx + DiscussionPageClient 만 추가하면 됨 (UI-SPEC 의 컬럼 헤더 row + back-nav 03-UI-SPEC §4.4 추가).
- **Plan 08-06 (deploy + E2E)**: webapp 측 변경 0건 — 본 plan 의 산출물이 stable. E2E fixture (webapp/e2e/fixtures/discussions.ts) 가 이미 Plan 08-01 에서 준비되어 있어 Playwright spec 작성만 남음.

## Self-Check: PASSED

- `[ -f webapp/src/lib/format-discussion-date.ts ]` ✓
- `[ -f webapp/src/lib/__tests__/format-discussion-date.test.ts ]` ✓
- `[ -f webapp/src/components/stock/discussion-item.tsx ]` ✓
- `[ -f webapp/src/components/stock/discussion-refresh-button.tsx ]` ✓
- `[ -f webapp/src/components/stock/discussion-empty-state.tsx ]` ✓
- `[ -f webapp/src/components/stock/discussion-list-skeleton.tsx ]` ✓
- `[ -f webapp/src/components/stock/stock-discussion-section.tsx ]` ✓
- `git log --oneline | grep -q ff52586` (Task 1) ✓
- `git log --oneline | grep -q 2634cbd` (Task 2) ✓
- `git log --oneline | grep -q 8d8f8b1` (Task 3) ✓
- `pnpm -F @gh-radar/webapp typecheck` exit 0 ✓
- `pnpm -F @gh-radar/webapp build` exit 0 ✓
- `pnpm -F @gh-radar/webapp test -- format-discussion-date --run`: 9 passed ✓
- vitest 전체: 21 files / 132 passed ✓
- T-02 grep "noopener noreferrer" in discussion-item.tsx → 3 matches (card a + full a + comment) ✓
- D5 grep "line-clamp-2" in discussion-item.tsx → 3 matches ✓
- D7 grep "staleMinutes|formatStaleLabel" in stock-discussion-section.tsx → 5 matches ✓
- D7 retry_after_seconds in stock-discussion-section.tsx → 4 matches ✓
- D12 grep "space-y-6" in stock-detail-client.tsx → 1 match (보존) ✓
- D12 grep "md:grid-cols-2" in stock-detail-client.tsx → 0 (2열 복원 금지) ✓
- 순서: News(141) < Discussion(142) ✓
- Phase 7 회귀 0: `git diff webapp/src/components/stock/stock-news-section.tsx` 0 lines ✓
- V-20 guardrail: `grep date-fns-tz webapp/src/lib/format-discussion-date.ts` → 0 ✓

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
