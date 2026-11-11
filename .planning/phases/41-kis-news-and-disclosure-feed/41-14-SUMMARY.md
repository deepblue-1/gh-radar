---
phase: 41-kis-news-and-disclosure-feed
plan: 14
subsystem: api
tags: [express, supabase-rpc, vitest, kis-news, naver-news]
status: complete

requires:
  - phase: 41-01
    provides: "RPC stock_feed_by_codes(p_codes, p_since, p_per_source, p_register, p_before) · shared mergeStockFeed · stockFeedPerSource · StockFeedItem"
provides:
  - "GET /api/stocks/:code/news 응답 = StockFeedItem[](한투 뉴스 · 공시 · 네이버 합친 목록 · before 커서 유지)"
  - "POST /api/stocks/:code/news/refresh 응답 = StockFeedItem[](7일 · 100건 합친 목록 — 새로고침 뒤에도 공시 유지)"
  - "server/src/routes/news.ts 내부 함수 loadMergedFeed(supabase, code, { days, limit, before })"
affects: [41-04, 41-09]

actuals:
  tokens: 6700
  tasks: 1
  commits: 2
plan_head_before: 4f55f5e1adcef51a9a58ec26b64944079fd3e2a3
plan_head_after: f9eb52ee9e14c1ef14699ea9e5f0c46a32f1edf1

tech-stack:
  added: []
  patterns:
    - "종목 상세 목록도 묶음 조회와 같은 RPC + mergeStockFeed — 합치기 규칙은 shared 한 곳(D-14)"

key-files:
  created: []
  modified:
    - server/src/routes/news.ts
    - server/tests/routes/news.test.ts

key-decisions:
  - "before 커서는 RPC p_before(출처별 거르기) + 합친 뒤 publishedAt < before 재확인 — 비교는 문자열이 아니라 Date.parse(요청 before 는 Z 표기, 응답은 +09:00)"
  - "RPC 결과에 요청 코드 항목이 없으면 빈 목록이 아니라 모양 위반으로 500(묶음 조회와 같은 규율)"
  - "모양 검사 isRpcResult 는 news.ts 에 같은 꼴로 따로 둔다 — news-by-stock.ts 는 같은 웨이브 41-03 이 바꾸는 파일이라 export 하러 건드리지 않았다"

patterns-established:
  - "종목 단위 조회는 p_register: false — 수집 대상 등록은 묶음 조회(by-stock)만(D-05)"

requirements-completed: [SC-2, SC-5]

duration: 12min
completed: 2026-11-12
---

# Phase 41 Plan 14: 종목 뉴스 조회 · 새로고침 응답을 합친 목록으로 Summary

**`GET /api/stocks/:code/news` 와 `POST …/refresh` 가 `news_articles` 직접 조회 대신 `stock_feed_by_codes`(등록 안 함) + shared `mergeStockFeed` 결과 `StockFeedItem[]` 를 돌려준다 — 새로고침은 여전히 네이버만 부르고, 새로고침 뒤에도 공시가 남는다.**

## Performance

- **Duration:** 약 12분
- **Completed:** 2026-11-12
- **Tasks:** 1(TDD — RED · GREEN 커밋 2개, REFACTOR 불필요)
- **Files modified:** 2

## Accomplishments

- **바뀐 응답 모양:** 두 엔드포인트 모두 `NewsArticle[]`(camelCase 매퍼) → `StockFeedItem[]`(`id` `kis:`/`naver:` · `kind` · `publishedAt +09:00` · `source` · `stockCodes` · `url`(공시 · 링크 없는 한투 뉴스는 `null`) · `description` · `receivedAt`). 웹 쪽 소비는 같은 웨이브 41-04.
- **RPC 인자:** `rpc("stock_feed_by_codes", { p_codes: [code], p_since: now - days, p_per_source: stockFeedPerSource(limit), p_register: false, p_before: before ?? null })`.
  - GET: `days` · `limit` 은 기존 `NewsListQuery` 잘라 맞춤(7일 · 100줄) 그대로, 합친 뒤 `publishedAt < before` 만 남기고 `slice(0, limit)`.
  - refresh: 쿨다운(30초) · 예산(`incr_api_usage`) · 네이버 fetch · `news_articles` upsert 는 그대로 — 마지막 「갱신된 목록」만 `loadMergedFeed(7일 · 100건)`.
- 마스터 없음 404 · 잘못된 code/before 400 · RPC 오류/모양 위반(배열 · stocks 없음 · 요청 코드 없음) 500.
- 쓰이지 않게 된 `NEWS_SELECT` · `toNewsArticle` import 제거(`server/src/mappers/news.ts` 파일은 계획대로 남김 — 현재 src 에서 쓰는 곳 없음).
- **테스트 수:** `server/tests/routes/news.test.ts` 16건(GET 11 · refresh 4 · CORS 1). 이전 9건 → 16건. 이름에 「새로고침 뒤에도 공시가 남는다」 케이스 포함.

## Task Commits

1. **Task 1 RED: 합친 목록 실패 테스트** — `d0893061` (test)
2. **Task 1 GREEN: loadMergedFeed 로 GET · refresh 응답 교체** — `f9eb52ee` (feat)

## TDD Gate Compliance

- **RED** (`d0893061`): `pnpm --filter @gh-radar/server exec vitest run tests/routes/news.test.ts --maxWorkers=2` → exit 1, 16건 중 10건 실패 · 6건 통과(400/404/before 400/503/429/CORS — 기존 동작). 실패 사유는 계획 동작 부재: `expected 200 to be 500`(모양 위반 4) · `expected [] to have a length of …`(합친 목록이 비어 있음 4) · `expected [] to deeply equal [...]`(공시 시간순 1) · cursor-a 의 `feedArgs` 가 RPC 호출 0건이라 `undefined[1]` TypeError 1(RPC 미호출이 원인 — 동작 부재). 문법 · 로드 · 픽스처 오류 아님(semanticAssessment: 의도한 RED). 플랜 frontmatter 가 `type: execute` 라 `gsd_run check tdd-red-evidence` 분류기는 돌리지 않았다.
- **GREEN** (`f9eb52ee`): 같은 명령 → 16/16 통과.
- **REFACTOR:** 변경 없음.

## Files Created/Modified

- `server/src/routes/news.ts` — `isRpcResult` · `loadMergedFeed` 추가, GET · refresh 응답 교체, 머리 주석(D-12 · D-14 · SC-5)
- `server/tests/routes/news.test.ts` — supabase 목을 rpc 이름 분기(`incr_api_usage` → 1 · `stock_feed_by_codes` → 목 결과)로, GET · refresh 케이스 재작성 · 추가

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공
- `pnpm --filter @gh-radar/server run typecheck` — 성공
- `pnpm --filter @gh-radar/server exec vitest run tests/routes/news.test.ts --maxWorkers=2` — 16 passed
- 수용 기준 grep: `stock_feed_by_codes` 4 · `p_register: false` 2 · `from("news_articles")` 2(쿨다운 · upsert) · `select(NEWS_SELECT)` 없음 · `FHKST01011800|KIS_APPKEY` 없음

## Decisions Made

frontmatter `key-decisions` 참고 — before 비교는 `Date.parse`, 요청 코드 누락은 500, 모양 검사는 파일 안에 복제(41-03 파일 비접촉).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- 워크트리에 `node_modules` 가 없어 `pnpm install --frozen-lockfile --prefer-offline` 로 준비(실행 환경 메모대로).

## Next Phase Readiness

- 41-04(웹)가 `fetchStockNews` · `refreshStockNews` 반환을 `StockFeedItem[]` 로 받으면 종목 상세 뉴스 탭 · 작업대/상따 「뉴스·토론」 탭이 합친 목록을 그린다. 웹 쪽 `before` 커서는 마지막 줄 `publishedAt`(`+09:00`)을 그대로 넘기면 된다(`NewsListQuery` 가 `offset: true` 로 받는다).
- 배포는 41-09(server 재배포 필요 — `git push` 만으로는 반영 안 됨).

## Self-Check: PASSED

- FOUND: server/src/routes/news.ts · server/tests/routes/news.test.ts · 이 SUMMARY
- FOUND: d0893061 · f9eb52ee (HEAD 조상)
