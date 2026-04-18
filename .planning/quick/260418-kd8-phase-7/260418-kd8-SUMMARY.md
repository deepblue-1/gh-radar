---
phase: quick-260418-kd8
plan: 01
subsystem: webapp/news+server/news
tags: [phase-7, infinite-scroll, pagination, mirror-from-phase-8]
requires: ["packages/shared NewsArticle.publishedAt", "Supabase news_articles.published_at index"]
provides: ["GET /api/stocks/:code/news?before=<ISO>", "fetchStockNews({before})", "NewsPageClient infinite scroll"]
affects: ["/stocks/[code]/news 풀페이지", "server route news.ts"]
tech-stack:
  added: []
  patterns: ["keyset pagination (before=<lastPublishedAt>)", "IntersectionObserver rootMargin 200px", "id-based dedup"]
key-files:
  created: []
  modified:
    - server/src/schemas/news.ts
    - server/src/routes/news.ts
    - server/tests/routes/news.test.ts
    - webapp/src/lib/stock-api.ts
    - webapp/src/lib/__tests__/stock-api.test.ts
    - webapp/src/components/stock/news-page-client.tsx
decisions:
  - "Phase 8 토론방 패턴 1:1 미러 — 신규 디자인 결정 0"
  - "PAGE_SIZE 100 유지 (서버 hard cap, 토론방 50 과 다른 유일한 차이)"
  - "id 기준 dedup (NewsArticle 의 유일한 stable key)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-18T14:50:00Z"
---

# Quick Task 260418-kd8: Phase 7 뉴스 풀페이지 무한 스크롤 Summary

`/stocks/[code]/news` 풀페이지에 Phase 8 토론방의 IntersectionObserver + before cursor
무한 스크롤 패턴을 1:1 미러링하여 100건 hard cap 너머 글 탐색 가능.

## Commits

| Task | Commit | Message |
| --- | --- | --- |
| 1 | `ffd256e` | feat(server/news): /api/stocks/:code/news 에 before cursor 추가 |
| 2 | `45455d0` | feat(webapp/lib): fetchStockNews 에 before cursor 옵션 추가 |
| 3 | `fb2607c` | feat(webapp/news): NewsPageClient 무한 스크롤 적용 |

3 commits 모두 `git push origin master` 완료.

## Test Counts (회귀 0 + 신규 테스트)

| File | 기존 | 신규 | 합계 | 결과 |
| --- | --- | --- | --- | --- |
| `server/tests/routes/news.test.ts` | 6 | +3 (V-news-cursor-a/b/c) | 9 | PASS |
| `webapp/src/lib/__tests__/stock-api.test.ts` | 7 | +3 (fetchStockNews describe) | 10 | PASS |

(plan 의 "기존 14 → 17" 가정은 실제 server news.test.ts 의 기존 6 케이스와 다름 —
실제 카운트는 위 표 기준. 회귀 0 + 신규 3 추가는 동일하게 충족.)

## Build / Typecheck / Lint

| Check | Result |
| --- | --- |
| `cd server && pnpm tsc --noEmit` | 0 error |
| `cd server && pnpm vitest run tests/routes/news.test.ts` | 9/9 PASS |
| `cd webapp && pnpm tsc --noEmit` | 0 error |
| `cd webapp && pnpm lint` | No ESLint warnings or errors |
| `cd webapp && pnpm vitest run src/lib/__tests__/stock-api.test.ts` | 10/10 PASS |
| `cd webapp && pnpm build` | `/stocks/[code]/news` 7.11 kB / 218 kB First Load JS — green |

## 1:1 미러 차이 (도메인 치환만)

| Phase 8 토론방 | Phase 7 뉴스 (이번 작업) |
| --- | --- |
| `Discussion[]` / `discussions` | `NewsArticle[]` / `articles` |
| `fetchStockDiscussions` | `fetchStockNews` |
| `last.postedAt` (cursor) | `last.publishedAt` (cursor) |
| `postId` 기준 dedup | `id` 기준 dedup |
| **PAGE_SIZE = 50** | **PAGE_SIZE = 100** (서버 hard cap) |
| `discussion-pagination-*` testid | `news-pagination-*` testid |
| "최근 7일 토론을 모두 불러왔어요" | "최근 7일 뉴스를 모두 불러왔어요" |
| "추가 글을 불러오지 못했어요" | "추가 뉴스를 불러오지 못했어요" |
| `posted_at` (DB col) | `published_at` (DB col) |

구조/IntersectionObserver/state/lifecycle/error handling 은 100% 동일.
DiscussionListSkeleton 은 `variant="full"` props 가 있으나 NewsListSkeleton 은
`rows` props 만 있어 기존 `<NewsListSkeleton rows={10} />` 호출 시그니처 그대로 유지.

## Deviations from Plan

### Auto-fixed Issues

None. Plan 을 1:1 그대로 실행. 다만:

- Plan 의 "기존 14개 server tests" 카운트는 실제 6 케이스 (3 GET + 2 POST + 1 CORS).
  Plan 텍스트만 카운트가 다른 것이라 무관 — 회귀 0 + 신규 3 추가는 동일하게 충족.
- Plan 의 "기존 5개 webapp lib tests" 도 실제 7 케이스 (searchStocks 2 + fetchStockDetail 2 +
  fetchStockDiscussions 3). 동일하게 회귀 0 + 신규 3 추가.

## Self-Check

검증 항목:

- [x] server/src/schemas/news.ts NewsListQuery 에 `before` 필드 존재 (FOUND grep)
- [x] server/src/routes/news.ts GET 에 `.lt("published_at", before)` 적용 (FOUND grep)
- [x] server/tests/routes/news.test.ts V-news-cursor-a/b/c 3개 추가 — 9/9 PASS
- [x] webapp/src/lib/stock-api.ts FetchNewsOpts 에 `before?: string` 추가
- [x] webapp/src/lib/__tests__/stock-api.test.ts 신규 3 테스트 — 10/10 PASS
- [x] webapp/src/components/stock/news-page-client.tsx — PAGE_SIZE 100, hasMore/isFetchingMore/paginationError/sentinelRef/inFlightCursorRef 5개 state, IntersectionObserver rootMargin 200px, news-pagination-{sentinel,loading,error,end} 4개 testid 모두 FOUND grep
- [x] tsc / lint / build 모두 green
- [x] 3 atomic 한글 commits (Co-Authored-By 0건) — `ffd256e`, `45455d0`, `fb2607c` 모두 git log 에서 FOUND
- [x] 3 commits 모두 origin master 로 push 완료

## Self-Check: PASSED
