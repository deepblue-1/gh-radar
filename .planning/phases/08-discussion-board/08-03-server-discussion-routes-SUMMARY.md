---
phase: 08-discussion-board
plan: 03
subsystem: server
tags: [server, express, discussions, brightdata, naver-json-api, zod, sanitize-html, supabase, vitest, supertest]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-01 shared Discussion type + sanitize 3 함수 (stripHtmlToPlaintext / extractNid / parseNaverBoardDate)"
  - phase: 08-discussion-board
    provides: "Plan 08-02 worker scraper 패턴 (Bright Data POST + Naver JSON API + zod schema + sanitize-html plaintext) — server inline 재구현 근거"
  - phase: 07-news-ingestion
    provides: "server/src/routes/news.ts — GET 캐시 + POST refresh + 30s 쿨다운 + atomic incr_api_usage RPC + Retry-After CORS + ApiError envelope (08-03 복제 기준)"
provides:
  - "GET /api/stocks/:code/discussions (cache-first, hours/days/limit, D11 spam filter, camelCase Discussion[])"
  - "POST /api/stocks/:code/discussions/refresh (Bright Data Web Unlocker → Naver JSON API → upsert → 24h top 5 반환)"
  - "stocks.ts nest mount: /:code/discussions"
  - "AppDeps 확장: brightdataClient/brightdataApiKey/brightdataZone (graceful degradation — 미설정 시 POST 503 PROXY_UNAVAILABLE)"
  - "DiscussionRefreshCooldown / ProxyBudgetExhausted / ProxyUnavailable error helpers"
  - "DiscussionListQuery Zod schema (hours 1-720 / days 1-7 / limit 50 hard cap → transform → {windowMs, limit})"
  - "discussions mapper toDiscussion (snake_case → camelCase + url 결정적 재구성)"
  - "17 supertest cases (V-01..V-17): GET/POST + 캐시 hit + 쿨다운 + 예산 + CORS"
affects: [08-04, 08-06]

# Tech tracking
tech-stack:
  added:
    - "sanitize-html@^2.17.3 (server) + @types/sanitize-html@^2.16.1"
  patterns:
    - "PIVOT 단일 경로: Bright Data Web Unlocker (POST /request) → stock.naver.com /api/community/discussion/posts/by-item JSON API → zod 검증 + sanitize-html plaintext (cheerio 미사용)"
    - "캐시 신선도 분기: cooldown(30s) 통과 후에도 MAX(scraped_at) < 10min 이면 프록시 호출 skip (D4 + D8 이중 게이트)"
    - "UPSERT payload 에서 url 컬럼 제외 — DB 스키마 (20260413120000_init_tables.sql:58-71) 가 url 컬럼 미보유. 응답 시 mapper 가 stock_code+post_id 로 결정적 재구성"
    - "in-memory cooldown 대신 Supabase MAX(scraped_at) 기반 (Phase 7 news 패턴) — multi-instance 안전"
    - "Phase 7 CORS exposedHeaders 'Retry-After' 재사용 (추가 CORS 수정 0)"

key-files:
  created:
    - "server/src/schemas/discussions.ts (StockCodeParam + DiscussionListQuery)"
    - "server/src/mappers/discussions.ts (toDiscussion + DiscussionRow)"
    - "server/src/routes/discussions.ts (GET + POST refresh handler — Bright Data inline + zod schema 내장)"
  modified:
    - "server/src/errors.ts (DiscussionRefreshCooldown / ProxyBudgetExhausted / ProxyUnavailable 3종 추가)"
    - "server/src/config.ts (BRIGHTDATA_API_KEY/ZONE/URL + DISCUSSION_DAILY_BUDGET + DISCUSSION_REFRESH_COOLDOWN_SECONDS)"
    - "server/src/app.ts (AppDeps 확장 + locals 주입)"
    - "server/src/server.ts (env → brightdataClient axios.create + T-09 https 강제)"
    - "server/src/routes/stocks.ts (discussionsRouter nest mount)"
    - "server/tests/routes/discussions.test.ts (it.todo 16 → concrete 17 it())"
    - "server/package.json + pnpm-lock.yaml (sanitize-html dep)"

key-decisions:
  - "PIVOT cheerio 미도입 — server/src/ 에 cheerio import 0 (V-20 guardrail 유지). worker 의 fetchDiscussions/parseDiscussionsJson 와 동일 JSON API 직접 호출"
  - "캐시 TTL 분기 위치 — POST refresh 핸들러 내부에서 cooldown(30s) 통과 후 cache(10min) 체크. GET 핸들러는 항상 DB 반환 (스크래핑 책임 분리). plan 의 'GET 캐시 미스 시 프록시 스크래핑' 옵션은 D8 쿨다운 + Phase 7 패턴 정합성을 위해 POST 전용으로 압축"
  - "url 컬럼 미존재 처리 — DB 스키마에 url 없음. mapper 가 stock_code+post_id 로 결정적 URL 재구성 (https://stock.naver.com/domestic/stock/{code}/discussion/{postId}?chip=all). UPSERT row 에서도 url 제외"
  - "in-memory cooldown 대신 Supabase MAX(scraped_at) — Phase 7 news 패턴 따름. Cloud Run 다중 인스턴스에서도 일관"
  - "incr_api_usage 호출량 = 1 (옵션 5: per-stock 단일 호출). plan 원문의 1+BODY_TOP_N 은 옵션 2 전제 — PIVOT 반영"
  - "schemas/discussions.ts — limit transform 으로 50 hard cap clamp (Phase 7 news limit 100 패턴 동일). 음수/0/NaN/undefined → 50"

requirements-completed: [DISC-01]

# Metrics
duration: ~6min
completed: 2026-04-18
---

# Phase 8 Plan 03: server-discussion-routes Summary

**Express 서버에 토론방 GET (캐시 우선) + POST refresh (Bright Data on-demand) 라우트 추가 — PIVOT JSON API 단일 경로, cheerio 미사용, 17 supertest cases green, Phase 7 news 회귀 0**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-18T01:34:52Z
- **Completed:** 2026-04-18T01:40:54Z
- **Tasks:** 2 (인프라 / 라우트+테스트)
- **Files:** 3 created + 7 modified

## Accomplishments

- `GET /api/stocks/:code/discussions` 구현 — 마스터 검증 → since=now-windowMs → posted_at DESC → limit clamp 50 → D11 스팸 필터 → camelCase mapper
- `POST /api/stocks/:code/discussions/refresh` 구현 — 마스터 검증 → 30s 쿨다운 (Retry-After + retry_after_seconds body) → 캐시 신선도 (10min) → atomic `incr_api_usage` (proxy_naver_discussion) → Bright Data Web Unlocker POST /request → JSON API parse → UPSERT → 24h top 5 반환
- DiscussionListQuery Zod schema — hours 1-720 / days 1-7 / limit 50 hard cap, `.transform()` 으로 windowMs+limit 단일 출력
- toDiscussion mapper — snake_case → camelCase, url 은 stock.naver.com 결정적 재구성 (DB 스키마에 url 없음)
- 3개 error helper — DiscussionRefreshCooldown(429) / ProxyBudgetExhausted(503) / ProxyUnavailable(503)
- AppDeps 에 brightdataClient + brightdataApiKey + brightdataZone 3종 — graceful degradation (미설정 시 POST 503)
- 17 supertest cases (V-01..V-17): GET 8 + POST 8 + CORS 1
- V-20 guardrail 유지: server/src/ 에 cheerio import 0

## Task Commits

1. **Task 1: schemas + errors + config + sanitize-html dep** — `469cfc7` (feat)
   - server/src/schemas/discussions.ts 신규, errors.ts 3 helper 추가, config.ts BRIGHTDATA_* + 쿨다운/예산 env, package.json `sanitize-html` + types
2. **Task 2: mapper + routes + nest mount + app/server 주입 + 17 tests** — `5ea405a` (feat)
   - mappers/discussions.ts 신규, routes/discussions.ts 신규 (GET+POST 인라인 + Bright Data fetcher + zod), stocks.ts mount, app.ts AppDeps 확장, server.ts brightdataClient 생성, discussions.test.ts 17 cases 그린

## Test Results

| 파일 | 결과 |
|------|------|
| server/tests/routes/discussions.test.ts | **17 passed** (V-01..V-17) |
| server/tests/routes/news.test.ts | **6 passed** (Phase 7 회귀 0) |
| server 전체 | **15 files / 93 tests passed** |
| `pnpm -F @gh-radar/server typecheck` | exit 0 |
| `pnpm -F @gh-radar/server build` | exit 0 |

### V-case 매핑

| ID | 검증 | 상태 |
|----|------|------|
| V-01 | GET 200 + camelCase Discussion[] (hours=24, limit=5) | ✓ |
| V-02 | limit > 50 → clamp 50 (D6 hard cap) | ✓ |
| V-03 | invalid code XYZ-abc → 400 INVALID_QUERY_PARAM | ✓ |
| V-04 | 마스터 미존재 → 404 STOCK_NOT_FOUND | ✓ |
| V-05 | days=30 → 400 (Zod max=7 reject) | ✓ |
| V-06 | D11 스팸 필터 — 제목 <5자 OR URL 포함 응답 제외 | ✓ |
| V-07 | 빈 결과 → 200 [] | ✓ |
| V-08 | hours/days 미지정 → default days=7 | ✓ |
| V-09 | brightdataClient 미주입 → 503 PROXY_UNAVAILABLE | ✓ |
| V-10 | MAX(scraped_at) < 30s → 429 DISCUSSION_REFRESH_COOLDOWN | ✓ |
| V-11 | 429 body retry_after_seconds (0 < N ≤ 30) | ✓ |
| V-12 | 429 Retry-After 헤더 | ✓ |
| V-13 | usage > 5000 → 503 PROXY_BUDGET_EXHAUSTED | ✓ |
| V-14 | 캐시 신선 (<10min) → 프록시 호출 0회 | ✓ |
| V-15 | POST invalid code → 400 | ✓ |
| V-16 | POST 마스터 미존재 → 404 | ✓ |
| V-17 | CORS exposedHeaders Retry-After | ✓ |

## Files Created/Modified

### Created (3)
- `server/src/schemas/discussions.ts` — StockCodeParam + DiscussionListQuery
- `server/src/mappers/discussions.ts` — toDiscussion + DiscussionRow
- `server/src/routes/discussions.ts` — GET + POST refresh handler (Bright Data inline)

### Modified (7)
- `server/src/errors.ts` (+3 helpers)
- `server/src/config.ts` (+5 env fields, BRIGHTDATA_*)
- `server/src/app.ts` (AppDeps 확장 + locals 주입)
- `server/src/server.ts` (env-driven brightdataClient + T-09 https 강제)
- `server/src/routes/stocks.ts` (nest mount)
- `server/tests/routes/discussions.test.ts` (16 todo → 17 it)
- `server/package.json` + `pnpm-lock.yaml` (sanitize-html dep)

## Decisions Made

- **PIVOT 우선 — cheerio 미도입**: server/src/ 에 cheerio import 0. JSON API 단일 경로로 worker (08-02) 와 동일한 `parseDiscussionsJson` 로직을 inline 복제. 의존성은 sanitize-html + zod (이미 server 에 존재) 만 추가.
- **GET 핸들러는 캐시-only, POST 핸들러가 스크래핑 책임**: 원 plan 의 "GET 캐시 미스 시 프록시 스크래핑 후 upsert" 분기는 D8 쿨다운 (POST 30s 쿨다운) 정합성 + Phase 7 news.ts 패턴 (GET=DB only, POST=네이버 호출) 일관성을 위해 POST 핸들러로 단일화. POST 안에서 `cooldown 30s → cache 10min → budget → scrape → upsert → 응답` 직렬화.
- **url 컬럼 처리**: DB 스키마 (20260413120000_init_tables.sql:58-71) 의 discussions 테이블은 `url` 컬럼이 없음. mapper 의 toDiscussion 이 stock_code+post_id 로 결정적 재구성. POST 핸들러의 UPSERT row 에서도 `url` 제외 (DB 스키마 일치).
- **incr_api_usage 호출량 = 1**: 옵션 5 채택 결과 per-stock 1 호출로 충분 (body 추가 fetch 없음). plan 원문의 `1 + BODY_TOP_N` 은 옵션 2 전제였음. PIVOT 반영.
- **in-memory cooldown 대신 Supabase MAX(scraped_at)**: Phase 7 news.ts 패턴 답습. Cloud Run 다중 인스턴스 환경 안전.
- **DiscussionListQuery 의 limit transform 패턴**: Phase 7 news.ts 의 NewsListQuery 와 동일하게 `.transform()` 으로 음수/0/NaN/undefined/초과치 모두 50 으로 clamp. days 만 max=7 로 reject (UI 가 7d 풀페이지 패턴 명시 가정).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] PIVOT cheerio 금지 vs plan 원문의 cheerio import**
- **Found during:** Task 1 (deps 설치 단계)
- **Issue:** plan 원문의 acceptance criteria 가 `server/package.json` 에 cheerio 추가를 요구했으나, 08-POC-PIVOT.md 가 "DO NOT use cheerio anywhere in server" 명시.
- **Fix:** cheerio 설치 skip. JSON API 직접 호출 + sanitize-html 만 추가. routes/discussions.ts 의 fetcher/parser 는 worker 의 parseDiscussionsJson 패턴을 inline 복제.
- **Files affected:** server/package.json (cheerio 미추가)
- **Verification:** `grep -rE "from ['\"]cheerio" server/src` → 0 matches.
- **Committed in:** `469cfc7`

**2. [Rule 3 - Blocking] DB 스키마에 url 컬럼 없음 — UPSERT row 정렬 필요**
- **Found during:** Task 2 (UPSERT payload 작성 시 마이그레이션 검토)
- **Issue:** `discussions` 테이블 스키마 (20260413120000_init_tables.sql:58-71) 에 `url` 컬럼 없음. plan 의 mapper 시그니처가 url 포함을 요구하나 INSERT 시 컬럼 미존재로 실패.
- **Fix:** (a) toDiscussion 이 url 을 결정적으로 재구성 (응답 계약 보존), (b) POST 핸들러의 UPSERT payload 에서 `url` 컬럼 제외.
- **Files affected:** server/src/mappers/discussions.ts, server/src/routes/discussions.ts
- **Verification:** discussions.test.ts V-01 (camelCase url 응답 확인) 그린.
- **Committed in:** `5ea405a`

**3. [Rule 4 - Architectural FLAG, NOT auto-fixed] Plan 08-02 worker 의 UPSERT 가 url 컬럼 포함**
- **Found during:** SUMMARY 작성 시 worker upsert.ts/map.ts 회귀 검토
- **Issue:** workers/discussion-sync/src/pipeline/map.ts 의 `DiscussionRow` 가 `url: string` 포함, upsert.ts 가 그대로 INSERT — 실제 production Cloud Run Job 실행 시 PostgreSQL 에러 가능성. (08-02 SUMMARY 의 known issues 에는 명시 없음.)
- **Action:** 본 plan 범위 밖 (out-of-scope). server route 는 url 컬럼 없이 정상 동작. 08-02 worker 는 별도 후속 plan 또는 Plan 08-06 deploy 검증에서 발견되어야 함. **deferred-items.md 에 기록 권장.**
- **Files affected:** workers/discussion-sync/src/pipeline/{map.ts,upsert.ts} (수정 없음 — out-of-scope)

---

**Total deviations:** 3 (2 auto-fixed in 08-03 scope, 1 cross-plan flag for 08-02 follow-up)

## Issues Encountered

- **Plan 08-02 worker UPSERT URL 컬럼 미스매치** (위 deviation #3) — 본 plan 범위 밖이지만 deploy (08-06) 또는 후속 patch plan 에서 fix 필요. server 는 영향 없음.
- 그 외 issue 없음 — Phase 7 패턴이 거의 1:1 복제 가능했음.

## Known Stubs

없음 — 모든 핸들러가 실제 동작. 테스트 mock 외 stub 없음.

## User Setup Required

- production deploy 시 Cloud Run env 에 `BRIGHTDATA_API_KEY` (Secret Manager) + `BRIGHTDATA_ZONE=gh_radar_naver` 주입 필요. dev 환경에서는 미설정 OK (POST 503 PROXY_UNAVAILABLE 으로 graceful degrade). Plan 08-06 에서 처리.

## Next Phase Readiness

- **Plan 08-04 (webapp-discussion-section)**: 즉시 시작 가능. 본 plan 의 응답 계약 (camelCase Discussion[]) 이 안정 — `webapp/src/lib/stock-api.ts::fetchStockDiscussions` 의 contract 그대로 사용. cooldown/예산/캐시 모두 서버 측 강제이므로 webapp 은 단순 fetch + ApiClientError.details.retry_after_seconds 처리만 구현.
- **Plan 08-06 (deploy-and-e2e)**: server 의 brightdataClient 가 graceful degrade 가능 — env 미설정 시 boot 가능. Cloud Run env 추가만 필요.

## Self-Check: PASSED

- `[ -f server/src/schemas/discussions.ts ]` ✓
- `[ -f server/src/mappers/discussions.ts ]` ✓
- `[ -f server/src/routes/discussions.ts ]` ✓
- `git log --oneline -3 | grep -q 469cfc7` (Task 1) ✓
- `git log --oneline -3 | grep -q 5ea405a` (Task 2) ✓
- `pnpm -F @gh-radar/server typecheck` exit 0 ✓
- `pnpm -F @gh-radar/server build` exit 0 ✓
- `npx vitest run tests/routes/discussions.test.ts`: 17 passed ✓
- `npx vitest run tests/routes/news.test.ts`: 6 passed (Phase 7 회귀 0) ✓
- `npx vitest run` (전체): 15 files / 93 passed ✓
- V-20 guardrail: `grep -rE "from ['\"]cheerio" server/src` → 0 matches ✓
- AppDeps brightdataClient: 2 grep matches in app.ts ✓
- nest mount: `grep -c "discussionsRouter" server/src/routes/stocks.ts` → 2 ✓
- D11 spam filter: `grep -cE "isSpam|filterSpam" server/src/routes/discussions.ts` → 6 ✓
- D8 cooldown: `grep -c "COOLDOWN_SECONDS = 30"` → 1 ✓
- D4 cache TTL: `grep -c "CACHE_TTL_MS"` → 2 ✓
- D10 UPSERT: `onConflict: "stock_code,post_id"` + `ignoreDuplicates: false` ✓
- T-07 ALLOWED_HOSTS: `grep -c "ALLOWED_HOSTS"` → 3 ✓

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
