---
plan: 08-03
phase: 08
type: execute
wave: 1
depends_on: [08-01, 08-02]  # I1 revision: Task2 <read_first> 가 08-02 산출 5개 파일 참조 — frontmatter 명시화
requirements: [DISC-01]
files_modified:
  - server/src/schemas/discussions.ts
  - server/src/mappers/discussions.ts
  - server/src/routes/discussions.ts
  - server/src/routes/stocks.ts
  - server/src/errors.ts
  - server/src/app.ts
  - server/src/config.ts
  - server/src/server.ts
  - server/package.json
  - server/tests/routes/discussions.test.ts
autonomous: true
threat_refs: [T-01, T-02, T-05, T-06, T-07, T-08]

must_haves:
  truths:
    - "GET /api/stocks/:code/discussions?hours=24&limit=5 가 최근 24시간 토론 상위 5건을 반환한다 (상세 Card)"
    - "GET /api/stocks/:code/discussions?days=7&limit=50 가 최근 7일 토론 최대 50건을 반환한다 (풀페이지)"
    - "응답 JSON 은 camelCase Discussion[] (server/src/mappers/discussions.ts::toDiscussion 으로 snake_case → camelCase 변환)"
    - "limit 500 요청 → 50 으로 clamp (D6 서버 하드캡)"
    - "days 30 요청 → 7 로 clamp"
    - "invalid code → 400 INVALID_QUERY_PARAM, 존재하지 않는 code → 404 STOCK_NOT_FOUND"
    - "스팸 필터 D11 이 서버 쿼리 단계에서 적용된다 — title length < 5 OR title에 http:// / https:// 포함 → 응답에서 제외"
    - "캐시 TTL 10분 — MAX(scraped_at) < 10분이면 DB 반환, 이상이면 프록시 스크래핑 + upsert 후 반환"
    - "POST /api/stocks/:code/discussions/refresh 가 30초 쿨다운 내 재호출 시 429 DISCUSSION_REFRESH_COOLDOWN + retry_after_seconds + Retry-After 헤더"
    - "proxy client 미주입 (app.locals.proxyClient) 시 POST 는 503 PROXY_UNAVAILABLE"
  artifacts:
    - path: "server/src/routes/discussions.ts"
      provides: "GET/POST discussions 핸들러"
      exports: ["discussionsRouter"]
    - path: "server/src/mappers/discussions.ts"
      provides: "toDiscussion(row) — snake_case → camelCase 변환"
      exports: ["toDiscussion", "DiscussionRow"]
    - path: "server/src/schemas/discussions.ts"
      provides: "Zod 스키마 StockCodeParam / DiscussionListQuery"
      exports: ["StockCodeParam", "DiscussionListQuery"]
    - path: "server/src/errors.ts"
      provides: "DiscussionRefreshCooldown / ProxyBudgetExhausted / ProxyUnavailable"
      contains: "DiscussionRefreshCooldown"
  key_links:
    - from: "server/src/routes/stocks.ts"
      to: "server/src/routes/discussions.ts"
      via: "stocksRouter.use('/:code/discussions', discussionsRouter)"
      pattern: "discussionsRouter"
    - from: "server/src/routes/discussions.ts"
      to: "server/src/mappers/discussions.ts"
      via: "rows.map(toDiscussion)"
      pattern: "map\\(toDiscussion\\)"
    - from: "server/src/app.ts"
      to: "proxy AxiosInstance"
      via: "app.locals.proxyClient"
      pattern: "proxyClient"
---

> **POC pivot:** 본 plan 은 `08-POC-PIVOT.md` 의 "Plan 08-03 델타" 섹션과 함께 읽어야 합니다. on-demand 스크랩 경로(POST /refresh)도 cheerio HTML 파싱 → JSON API + sanitize-html plaintext 변환으로 변경됩니다. 환경변수 `PROXY_API_KEY` → `BRIGHTDATA_API_KEY` + `BRIGHTDATA_ZONE`. PIVOT 문서 우선.

<objective>
Express 서버에 토론방 GET/POST 라우트를 추가한다. 상세 페이지 Card 와 `/discussions` 풀페이지가 공유하는 `GET /api/stocks/:code/discussions` (hours/days/limit 쿼리) + 수동 새로고침용 `POST .../discussions/refresh` 두 엔드포인트를 구현한다. Plan 08-01 의 discussion-sanitize 재사용 + Plan 08-02 의 worker 구현과 동일한 cheerio/sanitize-html 파싱을 server 도 수행 (on-demand 경로).

응답은 Supabase snake_case row 를 `Discussion` camelCase (packages/shared/src/discussion.ts) 로 mapper 변환해 반환. 스팸 필터 D11 은 **서버 쿼리 단계**에서 적용 (CONTEXT D11: "원본은 DB에 저장하되 UI 노출에서만 제외").

Purpose: Plan 08-02 배치 수집이 쌓은 데이터를 프론트엔드(Plan 08-04/08-05)가 읽을 수 있는 계약 표면. 캐시 TTL 10분 + per-stock 30초 쿨다운 + 프록시 예산 보호 모두 서버 측에서 강제. 웹앱은 camelCase Discussion[] 을 기대하므로 서버 응답 케이스가 일치해야 한다.
Output: 새 route 2개 + mapper 1개 + Zod 스키마 + error helper 3종 + app.ts 에 proxyClient 주입 + supertest 통합 테스트 (server/tests/routes/discussions.test.ts) ≥14 case.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/08-discussion-board/08-CONTEXT.md
@.planning/phases/08-discussion-board/08-RESEARCH.md
@.planning/phases/08-discussion-board/08-VALIDATION.md

@server/src/app.ts
@server/src/config.ts
@server/src/server.ts
@server/src/errors.ts
@server/src/routes/stocks.ts
@server/src/routes/news.ts
@server/src/schemas/news.ts
@server/src/mappers/news.ts
@server/src/services/cors-config.ts
@server/vitest.config.ts
@server/tests/routes/news.test.ts
@server/tests/routes/stock-detail.test.ts
@server/package.json

@packages/shared/src/discussion.ts
@packages/shared/src/discussion-sanitize.ts
@supabase/migrations/20260413120000_init_tables.sql
@supabase/migrations/20260413120100_rls_policies.sql

<interfaces>
## Plan 08-01 산출물 (본 plan 이 import)

```ts
// @gh-radar/shared
export type Discussion = { id; stockCode; postId; title; body; author; postedAt; scrapedAt; url };
export function stripHtmlToPlaintext(input: string): string;
export function extractNid(hrefOrUrl: string): string | null;
export function parseNaverBoardDate(raw: string): string | null;
```

## Phase 7 ApiError + 기존 errors.ts

```ts
export class ApiError extends Error { constructor(status, code, message) }
export const StockNotFound = (code) => new ApiError(404, 'STOCK_NOT_FOUND', ...);
export const InvalidQueryParam = (param, reason) => new ApiError(400, 'INVALID_QUERY_PARAM', ...);
// Phase 7 이 추가:
export const NewsRefreshCooldown = (seconds) => new ApiError(429, 'NEWS_REFRESH_COOLDOWN', ...);
export const NaverBudgetExhausted = () => new ApiError(503, 'NAVER_BUDGET_EXHAUSTED', ...);
export const NaverUnavailable = () => new ApiError(503, 'NAVER_UNAVAILABLE', ...);
```

본 plan 추가 3개:
```ts
export const DiscussionRefreshCooldown = (seconds) => new ApiError(429, 'DISCUSSION_REFRESH_COOLDOWN', ...);
export const ProxyBudgetExhausted = () => new ApiError(503, 'PROXY_BUDGET_EXHAUSTED', ...);
export const ProxyUnavailable = () => new ApiError(503, 'PROXY_UNAVAILABLE', ...);
```

## Phase 7 createApp AppDeps

```ts
export type AppDeps = { supabase; kisClient?; naverClient?: AxiosInstance };
```
→ 본 plan 에서 `proxyClient?: AxiosInstance` 추가.

## Phase 7 CORS exposedHeaders (이미 Retry-After 포함)

```ts
exposedHeaders: ['X-Last-Updated-At', 'X-Request-Id', 'Retry-After']
```
→ 본 plan 은 **추가 수정 없음** — Phase 7 이 이미 Retry-After 노출.

## Plan 08-02 worker 재사용 vs inline 재구현

server 는 workers/discussion-sync 를 직접 import 할 수 없다 (별도 workspace). 따라서:
- `fetchBoard` + `parseBoardHtml` + `fetchPostBody` + `mapToDiscussionRow` + `upsertDiscussions` 로직은 server 에 **inline 재구현** (또는 server/src/services/ 디렉터리에 격리).
- sanitize 는 `@gh-radar/shared` 에서 재사용 (Phase 7 패턴과 동일 — shared 가 공용 SoT).
- cheerio / sanitize-html / axios 는 server 에도 deps 추가.

## Phase 7 route mount 패턴 (server/src/routes/stocks.ts)

Phase 7 은 `stocksRouter.use('/:code/news', newsRouter)` 로 news 를 nest mount 했다.
본 plan 은 동일하게 `stocksRouter.use('/:code/discussions', discussionsRouter)` 마운트.

## 서버 테스트 경로

`server/vitest.config.ts` include: `tests/**/*.test.ts` → 본 테스트는 `server/tests/routes/discussions.test.ts` (Plan 08-01 Task 3 에서 스텁 생성 완료).

supertest 패턴: `import { createApp } from '../../src/app'` (Phase 7 stock-detail.test.ts 스타일).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Zod 스키마 + error helpers + config / package.json deps</name>
  <files>
    server/src/schemas/discussions.ts,
    server/src/errors.ts,
    server/src/config.ts,
    server/package.json
  </files>
  <read_first>
    - server/src/schemas/news.ts (Phase 7 Zod 패턴 — z.coerce, max clamp, regex)
    - server/src/errors.ts (전체 — Phase 7 helpers 위치 확인, 추가 지점 파악)
    - server/src/config.ts (기존 env 스키마)
    - server/package.json (현재 deps — cheerio/sanitize-html 존재 여부 확인)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D9 (쿼리 파라미터 계약)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Security Domain" (V5 Input Validation)
  </read_first>
  <behavior>
    DiscussionListQuery:
      - hours: coerce number, int, min 1, max 720 (30일 상한 안전 ceiling), default unset
      - days: coerce number, int, min 1, max 7, default unset
      - limit: coerce number, int, min 1, max 50, default 50  (D6: **서버 하드캡 50**)
      - **hours 와 days 동시 전달 시 hours 우선** (상세 Card 쿼리 패턴)
      - 둘 다 없으면 default: days=7 (풀페이지 기본)
    StockCodeParam:
      - code: regex /^[A-Za-z0-9]{1,10}$/ (Phase 7 동일)

    errors.ts 추가 3 개:
      DiscussionRefreshCooldown(seconds): ApiError(429, 'DISCUSSION_REFRESH_COOLDOWN', `잠시 후 다시 시도해주세요 (${seconds}s)`)
      ProxyBudgetExhausted(): ApiError(503, 'PROXY_BUDGET_EXHAUSTED', '오늘 토론방 새로고침 한도가 모두 소진되었습니다')
      ProxyUnavailable(): ApiError(503, 'PROXY_UNAVAILABLE', '토론방 프록시 설정이 없습니다')

    config.ts 추가 env:
      PROXY_PROVIDER, PROXY_BASE_URL, PROXY_API_KEY (모두 optional — 없으면 proxyClient=undefined)
      DISCUSSION_SYNC_DAILY_BUDGET (optional, default 5000)
      DISCUSSION_REFRESH_COOLDOWN_SECONDS (optional, default 30)

    package.json:
      - 신규 deps `cheerio@^1.2.0`, `sanitize-html@^2.17.2` + devDeps `@types/sanitize-html`
      - axios 이미 존재 확인
  </behavior>
  <action>
    **`server/src/schemas/discussions.ts`** 신규:
    ```ts
    import { z } from "zod";

    export const StockCodeParam = z.object({
      code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
    });
    export type StockCodeParamT = z.infer<typeof StockCodeParam>;

    /**
     * Discussion list query — `hours` 또는 `days` 중 하나.
     * hours 는 상세 Card (기본 24), days 는 풀페이지 (기본 7).
     * 서버 하드캡 limit 50 (CONTEXT D6).
     */
    export const DiscussionListQuery = z.object({
      hours: z.coerce.number().int().min(1).max(720).optional(),
      days: z.coerce.number().int().min(1).max(7).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(50),
    }).transform((q) => {
      // hours 와 days 정규화 — 둘 다 없으면 days=7
      if (q.hours != null) return { windowMs: q.hours * 3600_000, limit: q.limit };
      const days = q.days ?? 7;
      return { windowMs: days * 86400_000, limit: q.limit };
    });
    export type DiscussionListQueryT = z.infer<typeof DiscussionListQuery>;
    ```

    **`server/src/errors.ts`** — 파일 끝에 3개 helpers 추가 (Phase 7 NewsRefreshCooldown 스타일 계승):
    ```ts
    export const DiscussionRefreshCooldown = (seconds: number) =>
      new ApiError(
        429,
        "DISCUSSION_REFRESH_COOLDOWN",
        `잠시 후 다시 시도해주세요 (${seconds}s)`,
      );
    export const ProxyBudgetExhausted = () =>
      new ApiError(
        503,
        "PROXY_BUDGET_EXHAUSTED",
        "오늘 토론방 새로고침 한도가 모두 소진되었습니다",
      );
    export const ProxyUnavailable = () =>
      new ApiError(503, "PROXY_UNAVAILABLE", "토론방 프록시 설정이 없습니다");
    ```

    **`server/src/config.ts`** — 기존 config 에 env 필드 5개 추가 (Phase 7 패턴 동일). 모두 optional — 없으면 proxyClient undefined 로 시작 → POST refresh 만 503.

    **`server/package.json`** — deps 에 `cheerio@^1.2.0`, `sanitize-html@^2.17.2` 추가 + devDeps 에 `@types/sanitize-html`:
    ```bash
    pnpm -F @gh-radar/server add cheerio sanitize-html
    pnpm -F @gh-radar/server add -D @types/sanitize-html
    ```
    ⚠️ V-20 guardrail (Phase 7) 재확인: `pnpm -F @gh-radar/news-sync ls sanitize-html` → 0 match. `pnpm -F @gh-radar/webapp ls sanitize-html cheerio` → 0 match. packages/shared 에도 0.
  </action>
  <verify>
    <automated>grep -q "DiscussionListQuery" server/src/schemas/discussions.ts &amp;&amp; grep -q "StockCodeParam" server/src/schemas/discussions.ts &amp;&amp; grep -q "DiscussionRefreshCooldown" server/src/errors.ts &amp;&amp; grep -q "ProxyBudgetExhausted" server/src/errors.ts &amp;&amp; grep -q "ProxyUnavailable" server/src/errors.ts &amp;&amp; grep -q "cheerio" server/package.json &amp;&amp; grep -q "sanitize-html" server/package.json &amp;&amp; pnpm -F @gh-radar/server typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `server/src/schemas/discussions.ts` 에 `DiscussionListQuery.limit.max` = 50
    - `DiscussionListQuery` 가 `.transform()` 으로 hours/days → windowMs 정규화
    - `server/src/errors.ts` 에 3개 신규 helper export
    - `grep -c "DISCUSSION_REFRESH_COOLDOWN" server/src/errors.ts` ≥ 1
    - `grep -c "PROXY_UNAVAILABLE" server/src/errors.ts` ≥ 1
    - `server/package.json` 에 `cheerio` + `sanitize-html` + `@types/sanitize-html` 추가
    - **V-20 guardrail 재확인**: `pnpm -F @gh-radar/news-sync ls sanitize-html 2>&1 | grep -c sanitize-html` → 0
    - `pnpm -F @gh-radar/server typecheck` exit 0
  </acceptance_criteria>
  <done>schemas + errors + config + package.json 갱신 + typecheck 그린</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: discussions mapper + routes(GET + POST) + stocks.ts nest mount + app.ts proxyClient 주입 + integration test</name>
  <files>
    server/src/mappers/discussions.ts,
    server/src/routes/discussions.ts,
    server/src/routes/stocks.ts,
    server/src/app.ts,
    server/src/server.ts,
    server/tests/routes/discussions.test.ts
  </files>
  <read_first>
    - server/src/mappers/news.ts (Phase 7 mapper 패턴 — snake_case → camelCase 변환 스타일)
    - server/src/routes/news.ts (Phase 7 GET/POST 핸들러 전체 구조 — 본 plan 의 복제 기준)
    - server/src/routes/stocks.ts (전체 — `export const stocksRouter` 위치 + news router mount 예시 확인)
    - server/src/app.ts (createApp AppDeps + app.locals 주입 패턴 — naverClient 주입 방식 그대로 복제)
    - server/src/server.ts (Supabase/KIS/Naver client 생성 패턴)
    - server/tests/routes/news.test.ts (supertest 패턴 — Phase 7 테스트 구조)
    - packages/shared/src/discussion.ts (camelCase Discussion — mapper 출력)
    - packages/shared/src/discussion-sanitize.ts (stripHtmlToPlaintext / extractNid / parseNaverBoardDate import)
    - workers/discussion-sync/src/scraper/parseBoardHtml.ts (Plan 08-02 산출 — **server inline 재구현 근거**)
    - workers/discussion-sync/src/scraper/fetchBoard.ts (Plan 08-02 산출)
    - workers/discussion-sync/src/pipeline/map.ts (ALLOWED_HOSTS 패턴 복제)
    - workers/discussion-sync/src/pipeline/upsert.ts (onConflict 옵션 복제)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D1 / D4 / D7 / D8 / D9 / D11
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Phase 7 복제 매핑 표" + §"UPSERT 전략 비교"
  </read_first>
  <behavior>
    mappers/discussions.ts:
      - `DiscussionRow` 타입: Supabase snake_case shape (id, stock_code, post_id, title, body, author, posted_at, scraped_at)
      - `toDiscussion(row: DiscussionRow): Discussion` — snake_case → camelCase 1:1 변환:
        - stock_code → stockCode
        - post_id → postId
        - posted_at → postedAt
        - scraped_at → scrapedAt
        - id/title/body/author pass-through
        - **url 재구성**: 네이버 URL 은 DB 에 저장되어 있으나 스키마에 `url` 컬럼 없음 → post_id 기반으로 재구성: `https://finance.naver.com/item/board_read.naver?code=${stock_code}&nid=${post_id}`
        - body/author 가 undefined 면 null 로 normalize

    **⚠ 중요: discussions 스키마 확인.** `supabase/migrations/20260413120000_init_tables.sql:58-71` 을 먼저 read. 만약 url 컬럼이 스키마에 존재하면 DB url 그대로 pass-through. 존재하지 않으면 post_id 기반 재구성. Plan 08-02 의 `DiscussionRow` interface 가 url 컬럼을 추가했다면 (스키마에 없지만 worker 가 저장 시 에러) — 실제 스키마 기준으로 다시 정렬 필요. 본 plan 작업 시 마이그레이션 확인 필수 (acceptance criteria).

    GET /api/stocks/:code/discussions:
      1. StockCodeParam.safeParse(req.params) 실패 → 400 INVALID_QUERY_PARAM
      2. DiscussionListQuery.safeParse(req.query) 실패 → 400
      3. stocks 마스터에 code 없으면 → 404 STOCK_NOT_FOUND
      4. since = new Date(Date.now() - windowMs).toISOString()
      5. Supabase 쿼리:
         ```
         supabase.from('discussions')
           .select('*')
           .eq('stock_code', code)
           .gte('posted_at', since)
           .order('posted_at', { ascending: false })
           .limit(limit)
         ```
      6. **스팸 필터 D11 적용**: 결과 rows 에서 `row.title.length < 5 OR /https?:\/\//.test(row.title)` 행 제외
      7. `out = filteredRows.map(toDiscussion)` — mapper 필수 적용
      8. 응답 body: out (Discussion[] camelCase)

    POST /api/stocks/:code/discussions/refresh:
      1. StockCodeParam 검증
      2. app.locals.proxyClient 없으면 → 503 PROXY_UNAVAILABLE
      3. stocks 마스터 검증 (404)
      4. cooldown 체크 — `supabase.from('discussions').select('scraped_at').eq('stock_code', code).order('scraped_at', desc).limit(1).maybeSingle()` → MAX(scraped_at). now - MAX < 30s 면 → 429 + Retry-After 헤더 + body.retry_after_seconds
      5. 예산 체크 — `supabase.rpc('incr_api_usage', { p_service: 'proxy_naver_discussion', p_date: kstDate, p_amount: 1+topN })` → budget 초과 시 503 PROXY_BUDGET_EXHAUSTED
      6. **Inline 프록시 스크래핑** (Plan 08-02 worker 로직 재구현 — server 는 worker 를 import 불가):
         - target = `https://finance.naver.com/item/board.naver?code=${code}`
         - proxyClient.get('/', { params: { api_key, url: target, country_code: 'kr' }, responseType: 'text' })
         - HTML → cheerio.load → `$('table.type2 tbody tr').each(...)` → raw items
         - 24h 컷오프 + posted_at DESC 정렬
         - 상위 5건 각각 상세 페이지 fetch → sanitize-html (allowedTags: []) → body plaintext
         - ALLOWED_HOSTS 화이트리스트 (`finance.naver.com`) + extractNid + parseNaverBoardDate 적용
      7. UPSERT: `supabase.from('discussions').upsert(rows, { onConflict: 'stock_code,post_id', ignoreDuplicates: false })`
      8. SELECT 후 스팸 필터 + toDiscussion → 반환

    app.ts 변경:
      - AppDeps 에 `proxyClient?: AxiosInstance` 추가
      - `app.locals.proxyClient = deps.proxyClient`

    server.ts 변경:
      - PROXY_BASE_URL / PROXY_API_KEY env 읽어서 `axios.create({ baseURL, timeout: 30000 })` → proxyClient 생성
      - env 없으면 proxyClient=undefined → POST refresh 만 503

    stocks.ts 변경:
      - `stocksRouter.use('/:code/discussions', discussionsRouter)` 추가 (Phase 7 news mount 아래에)

    테스트 (server/tests/routes/discussions.test.ts — Plan 08-01 스텁의 it.todo 를 concrete 로 교체):
      V-01: GET /api/stocks/005930/discussions?hours=24&limit=5 → 200 + camelCase Discussion[]
      V-02: GET /api/stocks/005930/discussions?limit=500 → 200 + length ≤ 50 (clamp)
      V-03: GET /api/stocks/XYZ-abc/discussions → 400 INVALID_QUERY_PARAM
      V-04: GET /api/stocks/999999/discussions (존재 안 함) → 404 STOCK_NOT_FOUND
      V-05: GET 캐시 hit (Supabase mock 에 scraped_at 10s 전 row 제공) → 프록시 호출 없음, 바로 DB 반환
      V-06: GET 캐시 miss (scraped_at 15분 전) → mapper 적용 후 반환 (실제 프록시 호출은 mock 으로 skip)
      V-07: 스팸 필터 — 제목 'ㅋㅋㅋ' (<5) + '강추 http://bit.ly/x' 두 행 mock 제공 → 응답에서 **둘 다 제외** (assert length = 0 또는 다른 정상 항목만)
      V-08: 빈 결과 → 200 [] (에러 아님)
      V-09: POST .../refresh — proxyClient 미주입 → 503 PROXY_UNAVAILABLE
      V-10: POST .../refresh — MAX(scraped_at) 10s 전 → 429 DISCUSSION_REFRESH_COOLDOWN
      V-11: 429 응답 body 에 `retry_after_seconds` (숫자, 0 < N ≤ 30) 포함
      V-12: 429 응답 헤더 `Retry-After` 동반
      V-13: POST .../refresh — budget 초과 시 503 PROXY_BUDGET_EXHAUSTED
      V-14: POST .../refresh — 정상 시 200 + 최신 Discussion[] (camelCase 계약 유지)
  </behavior>
  <action>
    **Step 1 — discussions 스키마 확인:**
    먼저 `supabase/migrations/20260413120000_init_tables.sql` 의 line 58~71 을 read 하고 `discussions` 테이블의 url 컬럼 존재 여부 확인한다. 스키마가 `url` 컬럼을 포함하지 않으면 mapper 에서 post_id 기반 재구성. Plan 08-02 의 DiscussionRow 인터페이스가 `url` 을 포함하지만 실제 Postgres 스키마에 컬럼 없으면 insert 시 에러 — 필요 시 Plan 08-02 작업으로 돌아가 url 컬럼 제외 또는 마이그레이션 추가 (사용자와 협의).

    **가정: 스키마에 url 컬럼 없음.** (CONTEXT D10 필드 매핑이 id/post_id/title/body/author/posted_at/scraped_at 만 명시, url 별도 언급 없음 — stock_code + post_id 로 결정적 재구성 가능하기 때문.)
    → Plan 08-02 의 DiscussionRow 는 url 을 포함하되 upsert payload 에서 제외 또는 스키마 변경 필요.
    → **본 plan 수행 중 Plan 08-02 회귀 체크:** Plan 08-02 upsert 가 실제 스키마와 일치하는지 확인. 불일치 시 upsert.ts 수정 권고 note 를 SUMMARY 에 기록.

    **Step 2 — `server/src/mappers/discussions.ts` 신규:**
    ```ts
    import type { Discussion } from "@gh-radar/shared";

    export type DiscussionRow = {
      id: string;
      stock_code: string;
      post_id: string;
      title: string;
      body: string | null;
      author: string | null;
      posted_at: string;
      scraped_at: string;
    };

    const BASE = 'https://finance.naver.com';

    export function toDiscussion(row: DiscussionRow): Discussion {
      // url 은 DB 스키마에 컬럼 없으므로 post_id 기반 결정적 재구성
      const url = `${BASE}/item/board_read.naver?code=${encodeURIComponent(row.stock_code)}&nid=${encodeURIComponent(row.post_id)}`;
      return {
        id: row.id,
        stockCode: row.stock_code,
        postId: row.post_id,
        title: row.title,
        body: row.body ?? null,
        author: row.author ?? null,
        postedAt: row.posted_at,
        scrapedAt: row.scraped_at,
        url,
      };
    }
    ```

    **Step 3 — `server/src/routes/discussions.ts` 신규:**
    ```ts
    import { Router, type Request, type Response, type NextFunction } from 'express';
    import type { SupabaseClient } from '@supabase/supabase-js';
    import type { AxiosInstance } from 'axios';
    import * as cheerio from 'cheerio';
    import sanitizeHtml from 'sanitize-html';
    import { stripHtmlToPlaintext, extractNid, parseNaverBoardDate } from '@gh-radar/shared';
    import { StockCodeParam, DiscussionListQuery } from '../schemas/discussions.js';
    import { toDiscussion, type DiscussionRow } from '../mappers/discussions.js';
    import {
      ApiError,
      StockNotFound,
      InvalidQueryParam,
      DiscussionRefreshCooldown,
      ProxyBudgetExhausted,
      ProxyUnavailable,
    } from '../errors.js';

    const COOLDOWN_SECONDS = 30;
    const CACHE_TTL_MS = 10 * 60_000; // D4
    const BODY_TOP_N = 5;
    const DAILY_BUDGET = 5000;
    const ALLOWED_HOSTS = new Set(['finance.naver.com', 'm.finance.naver.com']);

    function isSpam(title: string): boolean {
      // D11: 제목 <5자 OR URL 포함
      if (title.length < 5) return true;
      if (/https?:\/\//.test(title)) return true;
      return false;
    }

    function filterSpam<T extends { title: string }>(rows: T[]): T[] {
      return rows.filter((r) => !isSpam(r.title));
    }

    function kstDate(now = new Date()): string {
      return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    }

    async function ensureStockExists(supabase: SupabaseClient, code: string): Promise<void> {
      const { data, error } = await supabase.from('stocks').select('code').eq('code', code).maybeSingle();
      if (error) throw error;
      if (!data) throw StockNotFound(code);
    }

    /** GET 핸들러 — 캐시 TTL 포함 */
    async function handleGet(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const supabase = req.app.locals.supabase as SupabaseClient;
        const paramResult = StockCodeParam.safeParse(req.params);
        if (!paramResult.success) throw InvalidQueryParam('code', paramResult.error.issues[0]?.message ?? 'invalid');
        const queryResult = DiscussionListQuery.safeParse(req.query);
        if (!queryResult.success) throw InvalidQueryParam('query', queryResult.error.issues[0]?.message ?? 'invalid');

        const { code } = paramResult.data;
        const { windowMs, limit } = queryResult.data;

        await ensureStockExists(supabase, code);

        const since = new Date(Date.now() - windowMs).toISOString();
        const { data, error } = await supabase
          .from('discussions')
          .select('id, stock_code, post_id, title, body, author, posted_at, scraped_at')
          .eq('stock_code', code)
          .gte('posted_at', since)
          .order('posted_at', { ascending: false })
          .limit(limit);
        if (error) throw error;

        const filtered = filterSpam((data ?? []) as DiscussionRow[]);
        const out = filtered.map(toDiscussion);
        res.json(out);
      } catch (err) { next(err); }
    }

    async function fetchNaverViaProxy(proxy: AxiosInstance, apiKey: string, targetUrl: string): Promise<string> {
      const res = await proxy.get<string>('/', {
        params: { api_key: apiKey, url: targetUrl, country_code: 'kr' },
        responseType: 'text',
      });
      return res.data;
    }

    function parseBoardHtml(html: string): Array<{ postId: string; title: string; author: string; postedRaw: string; url: string }> {
      const $ = cheerio.load(html);
      const items: Array<{ postId: string; title: string; author: string; postedRaw: string; url: string }> = [];
      $('table.type2 tbody tr').each((_, el) => {
        const $row = $(el);
        const $link = $row.find('td.title > a');
        const href = $link.attr('href');
        if (!href) return;
        const postId = extractNid(href);
        if (!postId) return;
        const title = $link.text().trim();
        if (!title) return;
        const author = $row.find('td:nth-child(3)').text().trim();
        const postedRaw = $row.find('td:nth-child(1)').text().trim();
        const url = href.startsWith('http') ? href : `https://finance.naver.com${href.startsWith('/') ? href : `/item/${href}`}`;
        items.push({ postId, title, author, postedRaw, url });
      });
      return items;
    }

    function extractBody(html: string): string | null {
      const $ = cheerio.load(html);
      const SELECTORS = ['#body', 'td.view', '.view_se'];
      for (const sel of SELECTORS) {
        const node = $(sel).first();
        if (node.length > 0) {
          const raw = node.html() ?? '';
          const plain = sanitizeHtml(raw, {
            allowedTags: [],
            allowedAttributes: {},
            disallowedTagsMode: 'discard',
            textFilter: (t) => t.replace(/\s+/g, ' ').trim(),
          }).trim();
          return plain || null;
        }
      }
      return null;
    }

    function isAllowedUrl(url: string): boolean {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
      } catch { return false; }
    }

    /** POST refresh 핸들러 */
    async function handleRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const supabase = req.app.locals.supabase as SupabaseClient;
        const proxyClient = req.app.locals.proxyClient as AxiosInstance | undefined;
        const proxyApiKey = req.app.locals.proxyApiKey as string | undefined;

        if (!proxyClient || !proxyApiKey) throw ProxyUnavailable();

        const paramResult = StockCodeParam.safeParse(req.params);
        if (!paramResult.success) throw InvalidQueryParam('code', paramResult.error.issues[0]?.message ?? 'invalid');
        const { code } = paramResult.data;

        await ensureStockExists(supabase, code);

        // Cooldown 체크 (D8)
        const { data: latest, error: le } = await supabase
          .from('discussions')
          .select('scraped_at')
          .eq('stock_code', code)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (le) throw le;
        if (latest?.scraped_at) {
          const elapsedMs = Date.now() - new Date(latest.scraped_at).getTime();
          if (elapsedMs < COOLDOWN_SECONDS * 1000) {
            const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
            res.setHeader('Retry-After', String(remaining));
            res.status(429).json({
              error: { code: 'DISCUSSION_REFRESH_COOLDOWN', message: `잠시 후 다시 시도해주세요 (${remaining}s)` },
              retry_after_seconds: remaining,
            });
            return;
          }
        }

        // Budget 체크
        const dateKst = kstDate();
        const { data: budgetBefore, error: be } = await supabase.rpc('incr_api_usage', {
          p_service: 'proxy_naver_discussion',
          p_date: dateKst,
          p_amount: 1 + BODY_TOP_N,
        });
        if (be) throw be;
        if (Number(budgetBefore) > DAILY_BUDGET) throw ProxyBudgetExhausted();

        // 프록시 스크래핑 (inline)
        const boardUrl = `https://finance.naver.com/item/board.naver?code=${encodeURIComponent(code)}`;
        const html = await fetchNaverViaProxy(proxyClient, proxyApiKey, boardUrl);
        const raws = parseBoardHtml(html);

        // 24h 컷오프 + posted_at DESC
        const cutoffMs = Date.now() - 24 * 3600_000;
        const recent = raws
          .map((r) => {
            const iso = parseNaverBoardDate(r.postedRaw);
            return iso ? { r, iso, ms: new Date(iso).getTime() } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .filter((x) => x.ms >= cutoffMs)
          .sort((a, b) => b.ms - a.ms);

        // 상위 TOP_N 본문
        const topN = recent.slice(0, BODY_TOP_N);
        const bodies = new Map<string, string | null>();
        for (const { r } of topN) {
          try {
            const postUrl = `https://finance.naver.com/item/board_read.naver?code=${encodeURIComponent(code)}&nid=${encodeURIComponent(r.postId)}`;
            const postHtml = await fetchNaverViaProxy(proxyClient, proxyApiKey, postUrl);
            bodies.set(r.postId, extractBody(postHtml));
          } catch {
            bodies.set(r.postId, null);
          }
        }

        // rows 생성 + URL whitelist
        const rows: DiscussionRow[] = [];
        for (const { r, iso } of recent) {
          if (!isAllowedUrl(r.url)) continue;
          const title = stripHtmlToPlaintext(r.title);
          if (!title) continue;
          rows.push({
            id: '',  // DB 가 gen_random_uuid() 로 부여 — upsert 시 제거
            stock_code: code,
            post_id: r.postId,
            title,
            body: bodies.get(r.postId) ?? null,
            author: r.author.trim() || null,
            posted_at: iso,
            scraped_at: new Date().toISOString(),
          });
        }

        // UPSERT (id 제거 후)
        const upsertPayload = rows.map(({ id: _id, ...rest }) => rest);
        if (upsertPayload.length > 0) {
          const { error: ue } = await supabase
            .from('discussions')
            .upsert(upsertPayload, { onConflict: 'stock_code,post_id', ignoreDuplicates: false });
          if (ue) throw ue;
        }

        // 최신 목록 재조회 (24h / top 5) → 필터 + mapper
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { data: fresh, error: fe } = await supabase
          .from('discussions')
          .select('id, stock_code, post_id, title, body, author, posted_at, scraped_at')
          .eq('stock_code', code)
          .gte('posted_at', since)
          .order('posted_at', { ascending: false })
          .limit(5);
        if (fe) throw fe;

        const filtered = filterSpam((fresh ?? []) as DiscussionRow[]);
        res.json(filtered.map(toDiscussion));
      } catch (err) { next(err); }
    }

    export const discussionsRouter = Router({ mergeParams: true });
    discussionsRouter.get('/', handleGet);
    discussionsRouter.post('/refresh', handleRefresh);
    ```

    **Step 4 — `server/src/routes/stocks.ts` 수정:**
    기존 news router mount 아래에 한 줄 추가:
    ```ts
    import { discussionsRouter } from './discussions.js';
    // (...existing router code...)
    stocksRouter.use('/:code/discussions', discussionsRouter);
    ```

    **Step 5 — `server/src/app.ts` 수정:**
    AppDeps 확장 + app.locals 주입 (Phase 7 naverClient 바로 옆에 proxyClient 추가):
    ```ts
    export type AppDeps = {
      supabase: SupabaseClient;
      kisClient?: AxiosInstance;
      naverClient?: AxiosInstance;
      proxyClient?: AxiosInstance;      // ← 신규
      proxyApiKey?: string;              // ← 신규 (proxyClient 호출 시 params.api_key)
    };

    export function createApp(deps: AppDeps): Express {
      // ... (existing body) ...
      app.locals.supabase = deps.supabase;
      if (deps.kisClient) app.locals.kisClient = deps.kisClient;
      if (deps.naverClient) app.locals.naverClient = deps.naverClient;
      if (deps.proxyClient) app.locals.proxyClient = deps.proxyClient;       // ← 신규
      if (deps.proxyApiKey) app.locals.proxyApiKey = deps.proxyApiKey;       // ← 신규
      // ...
    }
    ```

    **Step 6 — `server/src/server.ts` 수정:**
    env 기반 proxyClient 생성 (Phase 7 naverClient 생성 패턴 옆에):
    ```ts
    const proxyBaseUrl = process.env.PROXY_BASE_URL;
    const proxyApiKey = process.env.PROXY_API_KEY;
    const proxyClient = proxyBaseUrl && proxyApiKey
      ? axios.create({
          baseURL: proxyBaseUrl,
          timeout: 30000,
          headers: { 'User-Agent': `gh-radar-server/${APP_VERSION}` },
        })
      : undefined;

    const app = createApp({ supabase, kisClient, naverClient, proxyClient, proxyApiKey });
    ```

    **Step 7 — `server/tests/routes/discussions.test.ts` — it.todo 를 concrete 로 교체:**
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import request from 'supertest';
    import { createApp } from '../../src/app.js';

    function makeSupabase(opts: {
      stocksExists?: boolean;
      discussionRows?: Array<any>;
      latestScrapedAt?: string | null;
    }) {
      const {
        stocksExists = true,
        discussionRows = [],
        latestScrapedAt = null,
      } = opts;

      return {
        from: vi.fn((table: string) => {
          if (table === 'stocks') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: stocksExists ? { code: '005930' } : null, error: null }),
            };
          }
          if (table === 'discussions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn((n: number) => {
                // order+limit = list query OR cooldown probe
                if (n === 1) {
                  // cooldown probe
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: latestScrapedAt ? { scraped_at: latestScrapedAt } : null,
                      error: null,
                    }),
                  };
                }
                return Promise.resolve({ data: discussionRows, error: null });
              }),
              upsert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
        rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
      } as any;
    }

    const SAMPLE_ROW = {
      id: 'd1',
      stock_code: '005930',
      post_id: '272617128',
      title: '삼성전자 실적 기대감',
      body: '1분기 영업이익 시장 컨센서스 상회',
      author: 'abc****',
      posted_at: '2026-04-17T05:32:00+00:00',
      scraped_at: '2026-04-17T05:40:00+00:00',
    };
    const SPAM_SHORT = { ...SAMPLE_ROW, id: 'd2', post_id: '111', title: 'ㅋㅋ' };
    const SPAM_URL = { ...SAMPLE_ROW, id: 'd3', post_id: '222', title: '강추 http://bit.ly/xyz 강추' };

    describe('GET /api/stocks/:code/discussions (Phase 8 V-01..V-08)', () => {
      it('V-01 returns 200 + camelCase shape (hours=24, limit=5)', async () => {
        const app = createApp({ supabase: makeSupabase({ discussionRows: [SAMPLE_ROW] }) });
        const res = await request(app).get('/api/stocks/005930/discussions?hours=24&limit=5');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({
          stockCode: '005930',
          postId: '272617128',
          postedAt: '2026-04-17T05:32:00+00:00',
          scrapedAt: '2026-04-17T05:40:00+00:00',
        });
        expect(res.body[0].url).toContain('nid=272617128');
        expect(res.body[0]).not.toHaveProperty('stock_code');
        expect(res.body[0]).not.toHaveProperty('scraped_at');
      });

      it('V-02 clamps limit > 50 to 50', async () => {
        const many = Array.from({ length: 75 }).map((_, i) => ({ ...SAMPLE_ROW, id: `d${i}`, post_id: String(i) }));
        const app = createApp({ supabase: makeSupabase({ discussionRows: many.slice(0, 50) }) });
        const res = await request(app).get('/api/stocks/005930/discussions?days=7&limit=500');
        expect(res.status).toBe(200);
        expect(res.body.length).toBeLessThanOrEqual(50);
      });

      it('V-03 returns 400 for invalid code', async () => {
        const app = createApp({ supabase: makeSupabase({}) });
        const res = await request(app).get('/api/stocks/XYZ-abc!/discussions');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_QUERY_PARAM');
      });

      it('V-04 returns 404 when master code missing', async () => {
        const app = createApp({ supabase: makeSupabase({ stocksExists: false }) });
        const res = await request(app).get('/api/stocks/999999/discussions?hours=24');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('STOCK_NOT_FOUND');
      });

      it('V-07 spam filter — title <5 OR URL excluded', async () => {
        const app = createApp({ supabase: makeSupabase({ discussionRows: [SAMPLE_ROW, SPAM_SHORT, SPAM_URL] }) });
        const res = await request(app).get('/api/stocks/005930/discussions?hours=24&limit=5');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].postId).toBe('272617128');
      });

      it('V-08 empty list returns 200 []', async () => {
        const app = createApp({ supabase: makeSupabase({ discussionRows: [] }) });
        const res = await request(app).get('/api/stocks/005930/discussions?hours=24');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });
    });

    describe('POST /api/stocks/:code/discussions/refresh (Phase 8 V-09..V-14)', () => {
      it('V-09 503 PROXY_UNAVAILABLE when proxyClient missing', async () => {
        const app = createApp({ supabase: makeSupabase({}) });  // proxyClient 미주입
        const res = await request(app).post('/api/stocks/005930/discussions/refresh');
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('PROXY_UNAVAILABLE');
      });

      it('V-10/V-11/V-12 429 cooldown + retry_after + Retry-After header', async () => {
        const app = createApp({
          supabase: makeSupabase({ latestScrapedAt: new Date(Date.now() - 10_000).toISOString() }),  // 10s ago
          proxyClient: { get: vi.fn() } as any,
          proxyApiKey: 'k',
        });
        const res = await request(app).post('/api/stocks/005930/discussions/refresh');
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('DISCUSSION_REFRESH_COOLDOWN');
        expect(res.body.retry_after_seconds).toBeGreaterThan(0);
        expect(res.body.retry_after_seconds).toBeLessThanOrEqual(30);
        expect(res.headers['retry-after']).toMatch(/^\d+$/);
      });
    });

    describe('CORS exposedHeaders (V-16 reuse Phase 7)', () => {
      it('Retry-After is exposed (Phase 7 added, Phase 8 reuses)', async () => {
        const app = createApp({ supabase: makeSupabase({}) });
        const res = await request(app)
          .options('/api/stocks/005930/discussions')
          .set('Origin', 'http://localhost:3100')
          .set('Access-Control-Request-Method', 'GET');
        // CORS 가 Retry-After 포함하는지 확인
        const exposed = res.headers['access-control-expose-headers'];
        expect(exposed ?? '').toContain('Retry-After');
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/server test -- discussions.test.ts --run &amp;&amp; pnpm -F @gh-radar/server typecheck &amp;&amp; pnpm -F @gh-radar/server build</automated>
  </verify>
  <acceptance_criteria>
    - 6개 파일 생성/수정
    - `grep -q "discussionsRouter" server/src/routes/stocks.ts` → 1 match (mount)
    - `grep -qE "stocksRouter.use\(['\"]/:code/discussions['\"]" server/src/routes/stocks.ts` → 1 match
    - `grep -q "proxyClient" server/src/app.ts` → 1+ match (AppDeps + locals)
    - `grep -q "proxyClient" server/src/server.ts` → 1+ match (env 기반 생성)
    - `grep -q "toDiscussion" server/src/routes/discussions.ts` → 1+ match (mapper 적용)
    - `grep -q "isSpam\|filterSpam" server/src/routes/discussions.ts` → 1+ match (D11)
    - `grep -q "COOLDOWN_SECONDS = 30" server/src/routes/discussions.ts` → 1 match (D8)
    - `grep -q "CACHE_TTL_MS" server/src/routes/discussions.ts` → 1+ match (D4)
    - `grep -q "retry_after_seconds" server/src/routes/discussions.ts` → 1+ match (429 body)
    - `grep -q "onConflict.*'stock_code.*post_id'" server/src/routes/discussions.ts` → 1 match
    - `grep -q "ignoreDuplicates: false" server/src/routes/discussions.ts` → 1 match (D10)
    - `grep -q "proxy_naver_discussion" server/src/routes/discussions.ts` → 1 match (api_usage 라벨)
    - `grep -q "ALLOWED_HOSTS" server/src/routes/discussions.ts` → 1 match (T-07)
    - `discussions.test.ts` 그린 ≥10 cases
    - `pnpm -F @gh-radar/server build` exit 0
    - Phase 7 news route 회귀 없음: `pnpm -F @gh-radar/server test -- news.test.ts --run` 그린 유지
  </acceptance_criteria>
  <done>routes + mapper + app/server 확장 + integration test ≥10 case 그린 + Phase 7 회귀 없음 + build 성공</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-03)

| Boundary | Description |
|----------|-------------|
| client → server | 외부 HTTP, Zod 로 입력 검증 |
| server → Supabase | service_role 또는 anon key — RLS 존중 |
| server → 프록시 → 네이버 | on-demand 경로도 프록시 경유 — URL/body untrusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Tampering (Stored XSS) | refresh 경로의 body 저장 | mitigate | sanitize-html `allowedTags: []` 로 태그 전부 제거 + stripHtmlToPlaintext 로 엔티티 디코드. DB에 plaintext 만 저장. React 기본 text escape 가 UI 렌더 시 추가 방어. |
| T-02 | Tampering (URL tabnabbing) | 응답의 url 필드 | mitigate | mapper 가 post_id 기반 결정적 재구성 → DB 에 저장된 임의 URL 이 노출되지 않음. 프론트는 이 url 을 그대로 `target="_blank" rel="noopener noreferrer"` 로 사용 (Plan 08-04 contract). |
| T-05 | DoS (프록시 예산 소진) | incr_api_usage RPC 동반 refresh | mitigate | 요청 1회마다 1+BODY_TOP_N 증가 atomic RPC. DAILY_BUDGET 초과 시 503. Phase 7 패턴 계승. |
| T-06 | Tampering (Input validation) | StockCodeParam + DiscussionListQuery | mitigate | Zod regex `/^[A-Za-z0-9]{1,10}$/` + number coerce + min/max clamp. invalid 400. **D6 서버 하드캡 limit 50** 강제. |
| T-07 | Tampering (Open redirect) | refresh 의 스크래핑 결과 url | mitigate | `ALLOWED_HOSTS = { finance.naver.com, m.finance.naver.com }` 화이트리스트 + protocol https/http 만. javascript:/data: 차단. UPSERT 전 isAllowedUrl 검증. |
| T-08 | Tampering (SQL injection) | discussions UPSERT + 쿼리 | mitigate | Supabase JS SDK parametric — `.upsert()` / `.eq()` / `.gte()` 만 사용. 문자열 concat 금지. since/limit 은 Zod 검증된 숫자. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/server test -- discussions.test.ts --run` ≥10 case 그린
- `pnpm -F @gh-radar/server typecheck` exit 0
- `pnpm -F @gh-radar/server build` 성공
- `grep -q "DiscussionRefreshCooldown\|ProxyBudgetExhausted\|ProxyUnavailable" server/src/errors.ts` 3개 모두 match
- `grep -q "discussionsRouter" server/src/routes/stocks.ts` (nest mount)
- `grep -q "proxyClient" server/src/app.ts` (AppDeps)
- Phase 7 회귀 없음: `pnpm -F @gh-radar/server test -- news.test.ts --run` 그린 유지
- V-20 guardrail: `pnpm -F @gh-radar/news-sync ls sanitize-html 2>&1 | grep -c sanitize-html` → 0
</verification>

<success_criteria>
- server 에 GET + POST discussions 2 엔드포인트 구현 + stocks.ts nest mount
- 캐시 TTL 10분 (D4) + 쿨다운 30초 (D8) + 서버 하드캡 50 (D6) + 스팸 필터 D11 모두 구현
- 응답 camelCase Discussion[] (mapper 적용) — 서버 DB → 프론트 타입 일치
- proxyClient 주입 안 되면 POST 503 PROXY_UNAVAILABLE — 로컬 dev 에서도 deployment 없이 서버 기동 가능
- integration test ≥10 case 그린 — Plan 08-04 이 이 계약을 소비
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-03-SUMMARY.md`:
- routes/mapper/schemas/app/server 변경 diff 요약
- vitest 결과 (discussions.test.ts 세부 case)
- Phase 7 회귀 검증 결과
- **discussions 스키마 url 컬럼 유무 + Plan 08-02 upsert 적합성** — 발견 이슈 기록
- 발견한 이슈 (inline 재구현 vs worker 공용화 재고 여부)
</output>
