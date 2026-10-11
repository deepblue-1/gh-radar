---
plan: 07-03
phase: 07
type: execute
wave: 1
depends_on: [07-01]
requirements: [NEWS-01]
files_modified:
  - server/src/schemas/news.ts
  - server/src/mappers/news.ts
  - server/src/routes/news.ts
  - server/src/routes/stocks.ts
  - server/src/errors.ts
  - server/src/app.ts
  - server/src/config.ts
  - server/src/services/cors-config.ts
  - server/src/server.ts
  - server/package.json
  - server/tests/routes/news.test.ts
autonomous: true
threat_refs: [T-02, T-04, T-05, T-07]

must_haves:
  truths:
    - "GET /api/stocks/:code/news?days=7&limit=100 가 최근 7일 뉴스를 최대 100건 반환한다"
    - "응답 JSON 은 camelCase NewsArticle[] (서버 mapper 가 snake_case → camelCase 변환)"
    - "limit 200 요청 → 100 으로 clamp (V-13)"
    - "days 30 요청 → 7 로 clamp"
    - "invalid code('XYZ') → 400, 존재하지 않는 code → 404"
    - "POST /api/stocks/:code/news/refresh 가 30초 쿨다운 내 재호출 시 429 + retry_after_seconds 반환 (V-14)"
    - "429 응답에 Retry-After 헤더 동반"
    - "CORS exposedHeaders 에 Retry-After 가 포함되어 브라우저가 읽을 수 있다 (V-16)"
    - "Naver 호출은 app.locals.naverClient 를 통하며 설정 없을 시 503"
  artifacts:
    - path: "server/src/routes/news.ts"
      provides: "GET/POST news 핸들러"
      exports: ["newsRouter"]
    - path: "server/src/mappers/news.ts"
      provides: "toNewsArticle(row) — snake_case → camelCase 변환"
      exports: ["toNewsArticle", "NewsRow"]
    - path: "server/src/schemas/news.ts"
      provides: "Zod 스키마 StockCodeParam / NewsListQuery"
      exports: ["StockCodeParam", "NewsListQuery"]
    - path: "server/src/errors.ts"
      provides: "NewsRefreshCooldown / NaverBudgetExhausted 헬퍼"
      contains: "NewsRefreshCooldown"
  key_links:
    - from: "server/src/routes/stocks.ts"
      to: "server/src/routes/news.ts"
      via: "stocksRouter.use('/:code/news', newsRouter)"
      pattern: "news.+Router"
    - from: "server/src/routes/news.ts"
      to: "server/src/mappers/news.ts"
      via: "data.map(toNewsArticle)"
      pattern: "map\\(toNewsArticle\\)"
    - from: "server/src/app.ts"
      to: "naver AxiosInstance"
      via: "app.locals.naverClient"
      pattern: "naverClient"
    - from: "server/src/services/cors-config.ts"
      to: "browser fetch"
      via: "exposedHeaders Retry-After"
      pattern: "Retry-After"
---

<objective>
Express 서버에 뉴스 GET/POST 라우트를 추가한다. 상세 페이지 Card 와 `/news` 페이지가 공유하는 `/api/stocks/:code/news` GET, 수동 새로고침 용 `/api/stocks/:code/news/refresh` POST 두 엔드포인트를 구현한다. Plan 01 이 만든 `api_usage` RPC 와 `packages/shared` sanitize 모듈을 재사용한다.

응답은 Supabase snake_case row 를 `NewsArticle` (camelCase — `packages/shared/src/news.ts` 공용 타입) 로 변환해 반환한다. 이를 위해 `server/src/mappers/news.ts` 에 `toNewsArticle` 함수를 신설한다 (기존 `server/src/mappers/stock.ts::mergeMasterAndQuote` 와 동일 패턴).

Purpose: 배치 수집(Plan 02) 이 DB 에 데이터를 채운 뒤 프론트엔드가 조회할 계약 표면. 쿨다운과 budget 보호를 서버 측에서 강제. 웹앱은 이미 camelCase `NewsArticle` 을 기대하므로(Plan 04) 서버 응답 케이스가 일치해야 한다.
Output: 새 route 2개 + mapper 1개 + Zod 스키마 + error helper + app.ts 에 naverClient 주입 + CORS exposedHeaders 갱신 + supertest 통합 테스트 (`server/tests/routes/news.test.ts`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/07-news-ingestion/07-CONTEXT.md
@.planning/phases/07-news-ingestion/07-RESEARCH.md
@.planning/phases/07-news-ingestion/07-VALIDATION.md

@server/src/app.ts
@server/src/config.ts
@server/src/server.ts
@server/src/errors.ts
@server/src/routes/stocks.ts
@server/src/schemas/search.ts
@server/src/services/cors-config.ts
@server/src/mappers/stock.ts
@server/vitest.config.ts
@server/tests/routes/stock-detail.test.ts
@packages/shared/src/news.ts

<interfaces>
기존 ApiError class (server/src/errors.ts):
```ts
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string);
}
export const StockNotFound = (code: string) => new ApiError(404, 'STOCK_NOT_FOUND', ...);
export const InvalidQueryParam = (param: string, reason: string) => new ApiError(400, 'INVALID_QUERY_PARAM', ...);
```

기존 createApp signature (server/src/app.ts):
```ts
export type AppDeps = { supabase: SupabaseClient; kisClient?: AxiosInstance; };
export function createApp(deps: AppDeps): Express;
```
→ 본 plan 에서 `naverClient?: AxiosInstance` 추가.

Plan 01 산출물 (이미 배포됨):
```sql
incr_api_usage(p_service text, p_date date, p_amount int) RETURNS bigint;
```

CORS exposedHeaders 기존: `['X-Last-Updated-At', 'X-Request-Id']` → 추가: `Retry-After`.

공용 NewsArticle 타입 (`packages/shared/src/news.ts` — camelCase):
```ts
export type NewsArticle = {
  id: string;
  stockCode: string;
  title: string;
  source: string | null;
  url: string;
  publishedAt: string;
  contentHash: string | null;
  summaryId: string | null;
  createdAt: string;
};
```

서버 테이블 row 는 snake_case — mapper 필요. 패턴 참고: `server/src/mappers/stock.ts::mergeMasterAndQuote` — DB snake_case → 공용 camelCase 변환을 다른 엔티티에서도 이미 수행 중.

서버 테스트 경로: `server/vitest.config.ts` 의 `include: ["tests/**/*.test.ts"]` → 뉴스 테스트는 반드시 `server/tests/routes/news.test.ts` 에 배치 (Plan 01 Task 3 에서 stub 생성 완료). `server/src/__tests__/` 는 vitest include 밖이라 사용 금지.

기존 supertest 테스트 패턴(`server/tests/routes/stock-detail.test.ts`): `createApp` 을 `../../src/app` 에서 import, `mockSupabase` fixture 사용.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Zod 스키마 + error helpers + CORS exposedHeaders 갱신</name>
  <files>
    server/src/schemas/news.ts,
    server/src/errors.ts,
    server/src/services/cors-config.ts
  </files>
  <read_first>
    - server/src/schemas/search.ts (Zod 패턴 — z.coerce / safeParse)
    - server/src/errors.ts (ApiError constructor + 기존 helpers 스타일)
    - server/src/services/cors-config.ts (exposedHeaders 배열 현재값)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §8.2 (Zod 스키마 명세)
  </read_first>
  <behavior>
    NewsListQuery:
      - days: coerce number, int, min 1, max 7, default 7
      - limit: coerce number, int, min 1, max 100, default 100
    StockCodeParam:
      - code: regex /^[A-Za-z0-9]{1,10}$/
    NewsRefreshCooldown(seconds): ApiError(429, 'NEWS_REFRESH_COOLDOWN', `잠시 후 다시 시도해주세요 (${seconds}s)`)
    NaverBudgetExhausted(): ApiError(503, 'NAVER_BUDGET_EXHAUSTED', '오늘 뉴스 새로고침 한도가 모두 소진되었습니다')
    NaverUnavailable(): ApiError(503, 'NAVER_UNAVAILABLE', 'naver client not configured')
    CORS exposedHeaders: 기존 ['X-Last-Updated-At', 'X-Request-Id'] + 'Retry-After' (총 3개)
  </behavior>
  <action>
    `server/src/schemas/news.ts`:
    ```ts
    import { z } from "zod";

    export const StockCodeParam = z.object({
      code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
    });
    export type StockCodeParamT = z.infer<typeof StockCodeParam>;

    export const NewsListQuery = z.object({
      days: z.coerce.number().int().min(1).max(7).default(7),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    });
    export type NewsListQueryT = z.infer<typeof NewsListQuery>;
    ```

    `server/src/errors.ts` — 파일 끝에 3개 헬퍼 추가 (기존 helpers 스타일 복붙):
    ```ts
    export const NewsRefreshCooldown = (seconds: number) =>
      new ApiError(
        429,
        "NEWS_REFRESH_COOLDOWN",
        `잠시 후 다시 시도해주세요 (${seconds}s)`,
      );
    export const NaverBudgetExhausted = () =>
      new ApiError(
        503,
        "NAVER_BUDGET_EXHAUSTED",
        "오늘 뉴스 새로고침 한도가 모두 소진되었습니다",
      );
    export const NaverUnavailable = () =>
      new ApiError(503, "NAVER_UNAVAILABLE", "naver client not configured");
    ```

    `server/src/services/cors-config.ts` — exposedHeaders 배열 한 줄 수정:
    - 기존: `exposedHeaders: ["X-Last-Updated-At", "X-Request-Id"],`
    - 변경: `exposedHeaders: ["X-Last-Updated-At", "X-Request-Id", "Retry-After"],`
  </action>
  <verify>
    <automated>grep -q "NewsListQuery" server/src/schemas/news.ts &amp;&amp; grep -q "StockCodeParam" server/src/schemas/news.ts &amp;&amp; grep -q "NewsRefreshCooldown" server/src/errors.ts &amp;&amp; grep -q "NaverBudgetExhausted" server/src/errors.ts &amp;&amp; grep -q "Retry-After" server/src/services/cors-config.ts &amp;&amp; pnpm -F @gh-radar/server typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `server/src/schemas/news.ts` exists with `NewsListQuery` + `StockCodeParam` exports
    - `NewsListQuery.days.max` = 7, `.limit.max` = 100 (코드에 `.max(7)` 과 `.max(100)` 각 1회)
    - `server/src/errors.ts` 에 `NewsRefreshCooldown`, `NaverBudgetExhausted`, `NaverUnavailable` 세 export
    - `grep -c "Retry-After" server/src/services/cors-config.ts` ≥ 1 (exposedHeaders 에 추가됨, V-16)
    - `pnpm -F @gh-radar/server typecheck` exit 0
  </acceptance_criteria>
  <done>3 파일 수정, typecheck 통과, grep 매치 확인</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: news mapper + news.ts 라우터 구현 (GET + POST) + stocks.ts 마운트 + app.ts naverClient 주입</name>
  <files>
    server/src/mappers/news.ts,
    server/src/routes/news.ts,
    server/src/routes/stocks.ts,
    server/src/app.ts,
    server/src/config.ts,
    server/src/server.ts,
    server/package.json
  </files>
  <read_first>
    - server/src/mappers/stock.ts (기존 mapper 패턴 — snake_case → camelCase 변환, 본 mapper 의 스타일 기준)
    - server/src/routes/stocks.ts (전체 — 마지막 `export const stocksRouter` 위치 확인, 마운트 지점 정확히 식별)
    - server/src/app.ts (createApp AppDeps + app.locals 주입 패턴)
    - server/src/config.ts (기존 env 스키마)
    - server/src/server.ts (Supabase/KIS client 생성 패턴 — Naver client 도 동일하게)
    - server/package.json (axios 포함 확인)
    - packages/shared/src/news.ts (NewsArticle camelCase 스키마 — mapper 의 목표 shape)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §8.3, §8.4 (GET/POST 핸들러 전체 스니펫)
    - packages/shared/src/news-sanitize.ts (Plan 01 산출물 — import 경로)
  </read_first>
  <behavior>
    mappers/news.ts:
      - `NewsRow` 타입: Supabase snake_case row shape (id, stock_code, title, source, url, published_at, content_hash, summary_id, created_at)
      - `toNewsArticle(row: NewsRow): NewsArticle` — snake_case → camelCase 1:1 변환
        - `stock_code → stockCode`
        - `published_at → publishedAt`
        - `created_at → createdAt`
        - `content_hash → contentHash`
        - `summary_id → summaryId`
        - `id / title / source / url` pass-through
      - content_hash / summary_id 가 undefined 면 null 로 normalize (NewsArticle 타입이 `string | null`)

    GET /api/stocks/:code/news:
      1. StockCodeParam.safeParse(req.params) 실패 → 400 INVALID_QUERY_PARAM
      2. NewsListQuery.safeParse(req.query) 실패 → 400
      3. stocks 마스터에 code 없으면 → 404 STOCK_NOT_FOUND
      4. since = now - days*86400 (default 7d)
      5. supabase.from('news_articles').select(...).eq('stock_code', code).gte('published_at', since).order('published_at', desc).limit(limit)
      6. `const out = (data ?? []).map(toNewsArticle);` — **mapper 필수 적용**
      7. 응답 body: `out` (NewsArticle[] camelCase)

    POST /api/stocks/:code/news/refresh:
      1. StockCodeParam 검증
      2. app.locals.naverClient 없으면 → 503 NAVER_UNAVAILABLE
      3. stocks 마스터 검증 (404)
      4. cooldown 체크: news_articles 최신 created_at < 30s → 429 + Retry-After 헤더 + body.retry_after_seconds
      5. budget 체크: supabase.rpc('incr_api_usage', {p_service:'naver_search_news', p_date: kstDate, p_amount:1}) → 24500 초과 시 → 503 NAVER_BUDGET_EXHAUSTED
      6. Naver search 호출 (Plan 02 pipeline 로직을 server 에 **inline 재구현** — worker 는 별도 워크스페이스이므로 server 는 import 불가. 단, sanitize 는 packages/shared 재사용)
      7. mapToNewsRow 로직 inline: stripHtml(title), url whitelist, parsePubDate, extractSourcePrefix, sha256 content_hash
      8. supabase.from('news_articles').upsert(rows, { onConflict: 'stock_code,url', ignoreDuplicates: true })
      9. 갱신된 목록 SELECT 후 `.map(toNewsArticle)` 적용해 반환

    app.ts 변경:
      - AppDeps 에 `naverClient?: AxiosInstance` 추가
      - app.locals.naverClient = deps.naverClient 주입
    server.ts 변경:
      - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET / NAVER_BASE_URL env 읽어서 axios.create({ headers: 'X-Naver-Client-Id', 'X-Naver-Client-Secret' })
      - createApp({ supabase, kisClient, naverClient })
    config.ts 변경:
      - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET / NAVER_BASE_URL / NAVER_DAILY_BUDGET 추가 (optional, 없으면 server 는 naverClient=undefined 로 시작 → refresh 만 503)

    server/package.json:
      - axios 이미 존재 확인
      - `@gh-radar/shared` workspace 의존성 이미 존재 확인
  </behavior>
  <action>
    먼저 `server/src/mappers/news.ts` 신규 작성 (stock mapper 스타일 참조):
    ```ts
    import type { NewsArticle } from "@gh-radar/shared";

    // Supabase news_articles row — snake_case.
    export type NewsRow = {
      id: string;
      stock_code: string;
      title: string;
      source: string | null;
      url: string;
      published_at: string;
      content_hash: string | null;
      summary_id: string | null;
      created_at: string;
    };

    /**
     * news_articles DB row → 공용 NewsArticle (camelCase) 변환.
     * 웹앱은 packages/shared 의 camelCase NewsArticle 을 기대하므로
     * 모든 news API 응답은 이 mapper 를 통과해야 한다.
     */
    export function toNewsArticle(row: NewsRow): NewsArticle {
      return {
        id: row.id,
        stockCode: row.stock_code,
        title: row.title,
        source: row.source,
        url: row.url,
        publishedAt: row.published_at,
        contentHash: row.content_hash ?? null,
        summaryId: row.summary_id ?? null,
        createdAt: row.created_at,
      };
    }
    ```

    기존 server/src/routes/stocks.ts 끝부분을 확인 (마운트 위치).

    새 파일 `server/src/routes/news.ts` (RESEARCH §8.3 + §8.4 기반, mapper 적용 포함):
    ```ts
    import { Router, type Router as RouterT } from "express";
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { AxiosInstance } from "axios";
    import { createHash } from "node:crypto";
    import { z } from "zod";
    import {
      stripHtml,
      parsePubDate,
      extractSourcePrefix,
    } from "@gh-radar/shared";
    import { StockCodeParam, NewsListQuery } from "../schemas/news.js";
    import {
      ApiError,
      StockNotFound,
      InvalidQueryParam,
      NewsRefreshCooldown,
      NaverBudgetExhausted,
      NaverUnavailable,
    } from "../errors.js";
    import { toNewsArticle, type NewsRow } from "../mappers/news.js";
    import { logger } from "../logger.js";

    const COOLDOWN_S = 30;
    const NAVER_DAILY_BUDGET = Number(process.env.NAVER_DAILY_BUDGET ?? "24500");
    const NEWS_SELECT =
      "id,stock_code,title,source,url,published_at,content_hash,summary_id,created_at";

    function kstDateString(now = new Date()): string {
      const t = new Date(now.getTime() + 9 * 3600_000);
      return t.toISOString().slice(0, 10);
    }

    function isAllowedUrl(url: string): boolean {
      try {
        const u = new URL(url);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    }

    interface NaverItem {
      title: string;
      originallink: string;
      link: string;
      description: string;
      pubDate: string;
    }

    function mapToNewsRow(code: string, item: NaverItem) {
      const rawUrl = item.originallink?.trim() || item.link?.trim();
      if (!rawUrl || !isAllowedUrl(rawUrl)) return null;
      const title = stripHtml(item.title);
      if (!title) return null;
      const publishedIso = parsePubDate(item.pubDate);
      if (!publishedIso) return null;
      const descStripped = stripHtml(item.description);
      const hash = createHash("sha256")
        .update(title + "\n" + descStripped)
        .digest("hex");
      return {
        stock_code: code,
        title,
        source: extractSourcePrefix(rawUrl),
        url: rawUrl,
        published_at: publishedIso,
        content_hash: hash,
      };
    }

    export const newsRouter: RouterT = Router({ mergeParams: true });

    // GET /api/stocks/:code/news
    newsRouter.get("/", async (req, res, next) => {
      try {
        const paramsParsed = StockCodeParam.safeParse(req.params);
        if (!paramsParsed.success) {
          throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
        }
        const { code } = paramsParsed.data;
        const queryParsed = NewsListQuery.safeParse(req.query);
        if (!queryParsed.success) {
          throw InvalidQueryParam(
            queryParsed.error.issues[0].path.join("."),
            queryParsed.error.issues[0].message,
          );
        }
        const { days, limit } = queryParsed.data;
        const supabase = req.app.locals.supabase as SupabaseClient;

        const { data: master, error: mErr } = await supabase
          .from("stocks")
          .select("code")
          .eq("code", code)
          .maybeSingle();
        if (mErr) throw mErr;
        if (!master) throw StockNotFound(code);

        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const { data, error } = await supabase
          .from("news_articles")
          .select(NEWS_SELECT)
          .eq("stock_code", code)
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        const out = ((data ?? []) as NewsRow[]).map(toNewsArticle);
        res.json(out);
      } catch (e) {
        if (e instanceof z.ZodError) return next(InvalidQueryParam("news", e.issues[0].message));
        next(e);
      }
    });

    // POST /api/stocks/:code/news/refresh
    newsRouter.post("/refresh", async (req, res, next) => {
      try {
        const paramsParsed = StockCodeParam.safeParse(req.params);
        if (!paramsParsed.success) {
          throw InvalidQueryParam("code", paramsParsed.error.issues[0].message);
        }
        const { code } = paramsParsed.data;
        const supabase = req.app.locals.supabase as SupabaseClient;
        const naver = req.app.locals.naverClient as AxiosInstance | undefined;
        if (!naver) throw NaverUnavailable();

        const { data: master, error: mErr } = await supabase
          .from("stocks")
          .select("code,name")
          .eq("code", code)
          .maybeSingle();
        if (mErr) throw mErr;
        if (!master) throw StockNotFound(code);

        // 쿨다운 체크
        const { data: latest, error: lErr } = await supabase
          .from("news_articles")
          .select("created_at")
          .eq("stock_code", code)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lErr) throw lErr;
        if (latest?.created_at) {
          const elapsed = (Date.now() - Date.parse(latest.created_at)) / 1000;
          if (elapsed < COOLDOWN_S) {
            const retry_after_seconds = Math.ceil(COOLDOWN_S - elapsed);
            res.setHeader("Retry-After", String(retry_after_seconds));
            res.status(429).json({
              error: {
                code: "NEWS_REFRESH_COOLDOWN",
                message: "잠시 후 다시 시도해주세요",
              },
              retry_after_seconds,
            });
            return;
          }
        }

        // Budget 체크
        const { data: usedCount, error: uErr } = await supabase.rpc(
          "incr_api_usage",
          {
            p_service: "naver_search_news",
            p_date: kstDateString(),
            p_amount: 1,
          },
        );
        if (uErr) throw uErr;
        if (Number(usedCount) > NAVER_DAILY_BUDGET) throw NaverBudgetExhausted();

        // Naver fetch
        const nvRes = await naver.get<{ items: NaverItem[] }>(
          "/v1/search/news.json",
          {
            params: {
              query: (master as { name: string }).name,
              display: 20,
              sort: "date",
              start: 1,
            },
          },
        );
        const items = nvRes.data.items ?? [];
        const rows = items
          .map((it) => mapToNewsRow(code, it))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (rows.length > 0) {
          const { error: upErr } = await supabase
            .from("news_articles")
            .upsert(rows, {
              onConflict: "stock_code,url",
              ignoreDuplicates: true,
            });
          if (upErr) throw upErr;
        }

        // 갱신된 목록 (기본 7d/100) — mapper 통과 필수
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data: list, error: listErr } = await supabase
          .from("news_articles")
          .select(NEWS_SELECT)
          .eq("stock_code", code)
          .gte("published_at", since)
          .order("published_at", { ascending: false })
          .limit(100);
        if (listErr) throw listErr;
        const out = ((list ?? []) as NewsRow[]).map(toNewsArticle);
        res.json(out);
      } catch (e: any) {
        if (e?.response?.status === 401) {
          logger.error(
            { code: req.params.code },
            "naver auth failed on refresh",
          );
          next(new ApiError(503, "NAVER_UNAVAILABLE", "naver auth failed"));
          return;
        }
        if (e?.response?.status === 429) {
          next(NaverBudgetExhausted());
          return;
        }
        next(e);
      }
    });
    ```

    `server/src/routes/stocks.ts` — 파일 맨 아래(또는 export 직전)에 다음 2줄 추가:
    ```ts
    import { newsRouter } from "./news.js";
    stocksRouter.use("/:code/news", newsRouter);
    ```
    (`Router({ mergeParams: true })` 로 news 라우터가 `:code` 를 받도록 설정된 것을 news.ts 에서 이미 처리.)

    `server/src/app.ts`:
    - `AppDeps` 에 `naverClient?: AxiosInstance;` 추가 (kisClient 와 동일 스타일)
    - `app.locals.naverClient = deps.naverClient;` 추가

    `server/src/server.ts` — createApp 호출 전에 naverClient 생성:
    ```ts
    import axios from "axios";
    // ...
    const naverClient = process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET
      ? axios.create({
          baseURL: process.env.NAVER_BASE_URL ?? "https://openapi.naver.com",
          timeout: 15000,
          headers: {
            "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
            "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
            Accept: "application/json",
          },
        })
      : undefined;
    const app = createApp({ supabase, kisClient, naverClient });
    ```

    `server/src/config.ts` — optional NAVER_* 필드 추가 (읽기만 필요).

    `server/package.json` — `@gh-radar/shared` workspace dep 이미 존재 확인.
  </action>
  <verify>
    <automated>test -f server/src/mappers/news.ts &amp;&amp; grep -q "toNewsArticle" server/src/mappers/news.ts &amp;&amp; grep -q "newsRouter" server/src/routes/news.ts &amp;&amp; grep -q "newsRouter" server/src/routes/stocks.ts &amp;&amp; grep -q "naverClient" server/src/app.ts &amp;&amp; grep -q "Retry-After" server/src/routes/news.ts &amp;&amp; grep -q "COOLDOWN_S = 30" server/src/routes/news.ts &amp;&amp; grep -q "incr_api_usage" server/src/routes/news.ts &amp;&amp; grep -q "mergeParams: true" server/src/routes/news.ts &amp;&amp; grep -q "onConflict.*stock_code.*url" server/src/routes/news.ts &amp;&amp; [ $(grep -c "map(toNewsArticle)" server/src/routes/news.ts) -ge 2 ] &amp;&amp; pnpm -F @gh-radar/server typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `server/src/mappers/news.ts` exists AND contains `toNewsArticle`: `grep -q "toNewsArticle" server/src/mappers/news.ts` + `grep -q "stockCode" server/src/mappers/news.ts` + `grep -q "publishedAt" server/src/mappers/news.ts` + `grep -q "createdAt" server/src/mappers/news.ts`
    - GET/POST 핸들러 모두 mapper 적용: `grep -n 'map(toNewsArticle)' server/src/routes/news.ts` → 2 matches (GET 1, POST refresh 1)
    - `server/src/routes/news.ts` 에 `Router({ mergeParams: true })` 존재
    - `stocksRouter.use("/:code/news", newsRouter)` 한 줄이 `server/src/routes/stocks.ts` 에 존재
    - GET 핸들러가 `NewsListQuery.safeParse(req.query)` 호출 (V-13 clamp)
    - POST 핸들러가 `res.setHeader("Retry-After", ...)` + status(429) + `retry_after_seconds` 포함 (V-14)
    - POST 핸들러가 `rpc("incr_api_usage", ...)` 호출 (V-02 server 경로 — budget guard)
    - POST 핸들러가 `onConflict: "stock_code,url", ignoreDuplicates: true` (V-10)
    - URL whitelist: `grep -q "isAllowedUrl\|protocol === .https" server/src/routes/news.ts` (T-02)
    - sanitize import: `grep -q "stripHtml" server/src/routes/news.ts` (Plan 01 재사용)
    - app.ts AppDeps 에 `naverClient?: AxiosInstance` 필드 추가
    - `pnpm -F @gh-radar/server typecheck` exit 0
    - `pnpm -F @gh-radar/server build` exit 0
  </acceptance_criteria>
  <done>mapper + news.ts 라우터 완성 + stocks.ts 마운트 + app/server 주입 + typecheck/build 통과</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: supertest 통합 테스트 — server/tests/routes/news.test.ts it.todo → concrete</name>
  <files>server/tests/routes/news.test.ts</files>
  <read_first>
    - server/tests/routes/news.test.ts (Plan 01 Task 3 산출 — it.todo 8개)
    - server/tests/routes/stock-detail.test.ts (supertest 패턴 — import 경로 `../../src/app`)
    - server/tests/fixtures/supabase-mock.ts (기존 supabase mock helper 가 있는지 확인. 없다면 이 테스트 내 inline mock 로 진행)
    - server/vitest.config.ts (include 패턴 재확인)
    - server/src/routes/news.ts (Task 2 산출물)
    - server/src/mappers/news.ts (Task 2 산출물 — 응답 필드명 camelCase 검증 근거)
    - server/src/app.ts (createApp deps)
    - server/src/services/cors-config.ts (exposedHeaders — Task 1 갱신분)
  </read_first>
  <behavior>
    Supabase / Naver client 를 mock 하고 createApp 을 호출해서 supertest 로 6+ 건 assertion:
    1. GET ?days=30&limit=500 → 200 + 응답 길이 ≤ 100 (V-13 clamp) + 각 항목이 camelCase 키(`stockCode`, `publishedAt`) 를 가짐
    2. GET /XYZ$/news → 400 + body.error.code === 'INVALID_QUERY_PARAM' (V-15)
    3. GET /000001/news (master 없음) → 404 + body.error.code === 'STOCK_NOT_FOUND'
    4. POST /refresh (naverClient 미주입) → 503 + body.error.code === 'NAVER_UNAVAILABLE'
    5. POST /refresh 최근 created_at 10s 전 mock → 429 + Retry-After 헤더 + body.retry_after_seconds 양수 (V-14)
    6. GET /005930/news 응답 헤더의 Access-Control-Expose-Headers 에 'Retry-After' 포함 (V-16) — 단일 assertion, fallback 없음
  </behavior>
  <action>
    Plan 01 의 스텁 파일 `server/tests/routes/news.test.ts` 를 전면 재작성 (import 경로는 `server/tests/routes/stock-detail.test.ts` 와 동일한 상대경로):

    사전 조건 확인: `grep -q "exposedHeaders.*Retry-After" server/src/services/cors-config.ts` 가 1 match 여야 V-16 단일 assertion 이 의미를 갖는다 (Task 1 에서 수행됨).

    ```ts
    import { describe, it, expect, vi } from "vitest";
    import request from "supertest";
    import { createApp } from "../../src/app";

    function makeSupabase(overrides: Record<string, unknown> = {}) {
      // 간단한 chainable mock — 쿼리 체인을 재현.
      return {
        from: vi.fn((table: string) => {
          const ctx: any = { table, _lastLimit: undefined };
          const chain: any = {
            select: vi.fn().mockReturnValue(chain),
            eq: vi.fn().mockReturnValue(chain),
            gte: vi.fn().mockReturnValue(chain),
            order: vi.fn().mockReturnValue(chain),
            limit: vi.fn((n: number) => {
              ctx._lastLimit = n;
              const dataset = (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
              return Promise.resolve({ data: dataset.slice(0, n), error: null });
            }),
            maybeSingle: vi.fn(() => {
              const key = `${table}.single`;
              const data = (overrides[key] as unknown) ?? null;
              return Promise.resolve({ data, error: null });
            }),
            upsert: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return chain;
        }),
        rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
      };
    }

    function makeNaver(items: unknown[] = []) {
      return {
        get: vi.fn().mockResolvedValue({ data: { items } }),
      } as any;
    }

    function snakeNewsRow(i: number) {
      return {
        id: String(i),
        stock_code: "005930",
        title: "t",
        source: "hankyung",
        url: "https://x/" + i,
        published_at: "2026-04-17T00:00:00Z",
        content_hash: null,
        summary_id: null,
        created_at: "2026-04-17T00:00:00Z",
      };
    }

    describe("GET /api/stocks/:code/news (V-13/V-15/mapper camelCase)", () => {
      it("clamps days > 7 and limit > 100 (200 + body length <= 100 + camelCase keys)", async () => {
        const supabase = makeSupabase({
          "stocks.single": { code: "005930" },
          "news_articles.list": Array.from({ length: 150 }).map((_, i) => snakeNewsRow(i)),
        });
        const app = createApp({ supabase: supabase as any });
        const res = await request(app).get("/api/stocks/005930/news?days=30&limit=500");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeLessThanOrEqual(100);
        // mapper 적용 검증 — 응답은 camelCase 여야 한다
        if (res.body.length > 0) {
          expect(res.body[0]).toHaveProperty("stockCode");
          expect(res.body[0]).toHaveProperty("publishedAt");
          expect(res.body[0]).toHaveProperty("createdAt");
          expect(res.body[0]).not.toHaveProperty("stock_code");
          expect(res.body[0]).not.toHaveProperty("published_at");
        }
      });

      it("returns 400 for invalid code XYZ$", async () => {
        const supabase = makeSupabase();
        const app = createApp({ supabase: supabase as any });
        const res = await request(app).get("/api/stocks/XYZ$/news");
        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
      });

      it("returns 404 when master code not found", async () => {
        const supabase = makeSupabase({ "stocks.single": null });
        const app = createApp({ supabase: supabase as any });
        const res = await request(app).get("/api/stocks/000001/news");
        expect(res.status).toBe(404);
        expect(res.body?.error?.code).toBe("STOCK_NOT_FOUND");
      });
    });

    describe("POST /api/stocks/:code/news/refresh (V-14)", () => {
      it("returns 503 NAVER_UNAVAILABLE when naverClient not injected", async () => {
        const supabase = makeSupabase({ "stocks.single": { code: "005930", name: "삼성전자" } });
        const app = createApp({ supabase: supabase as any });
        const res = await request(app).post("/api/stocks/005930/news/refresh");
        expect(res.status).toBe(503);
        expect(res.body?.error?.code).toBe("NAVER_UNAVAILABLE");
      });

      it("returns 429 + Retry-After + retry_after_seconds when recent news within 30s", async () => {
        const recent = new Date(Date.now() - 10_000).toISOString();  // 10s ago
        const supabase = makeSupabase({
          "stocks.single": { code: "005930", name: "삼성전자" },
          "news_articles.single": { created_at: recent },
        });
        const app = createApp({ supabase: supabase as any, naverClient: makeNaver([]) });
        const res = await request(app).post("/api/stocks/005930/news/refresh");
        expect(res.status).toBe(429);
        expect(res.headers["retry-after"]).toBeDefined();
        expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
        expect(res.body?.retry_after_seconds).toBeGreaterThan(0);
        expect(res.body?.retry_after_seconds).toBeLessThanOrEqual(30);
        expect(res.body?.error?.code).toBe("NEWS_REFRESH_COOLDOWN");
      });
    });

    describe("CORS exposedHeaders (V-16)", () => {
      it("GET /api/stocks/:code/news response exposes Retry-After header", async () => {
        // cors 미들웨어는 모든 응답에 Access-Control-Expose-Headers 를 포함.
        // 사전 조건: services/cors-config.ts 의 exposedHeaders 에 Retry-After 가 포함되어 있어야 함(Task 1).
        const supabase = makeSupabase({
          "stocks.single": { code: "005930" },
          "news_articles.list": [],
        });
        const app = createApp({ supabase: supabase as any });
        const res = await request(app)
          .get("/api/stocks/005930/news")
          .set("Origin", "http://localhost:3100");
        expect(res.headers["access-control-expose-headers"]).toMatch(/Retry-After/i);
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/server test -- news.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - `server/tests/routes/news.test.ts` 의 `it.todo` 0 match (모두 concrete 로 교체): `grep -c "it.todo" server/tests/routes/news.test.ts` === 0
    - 최소 6 passing tests (V-13 clamp + V-14 cooldown + V-15 400 + V-16 CORS + 404 + NAVER_UNAVAILABLE)
    - `pnpm -F @gh-radar/server test -- news.test.ts --run` exit 0
    - V-13 테스트가 camelCase 키 존재(`stockCode`, `publishedAt`, `createdAt`) + snake_case 키 부재 를 assertion — mapper 적용 증빙
    - V-16 테스트는 단일 assertion: `expect(res.headers['access-control-expose-headers']).toMatch(/Retry-After/i)` (fallback if/else 없음)
    - `pnpm -F @gh-radar/server test --run` 전체 그린 (기존 테스트 회귀 없음)
  </acceptance_criteria>
  <done>concrete 스펙 파일 완성 + 전체 서버 test suite 그린</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-03)

| Boundary | Description |
|----------|-------------|
| 브라우저 → Express | URL path `code`, query `days/limit` 가 untrusted |
| Express → Naver API | server 가 proxy 역할 — Naver 응답의 title/url 은 untrusted |
| Express → Supabase | service_role 쓰기 (app.locals.supabase) — RLS 우회 |
| DB row → 클라이언트 응답 | mapper 가 snake_case → camelCase 변환, 공용 타입 NewsArticle 계약 준수 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02 | Tampering / Spoofing (Open redirect / tabnabbing) | POST /refresh 가 DB 에 저장하는 url | mitigate | `isAllowedUrl` 로 http/https 만 통과, javascript:/data: 차단. sanitize 는 packages/shared 재사용 (Plan 01 검증). |
| T-04 | DoS | budget 소진 | mitigate | POST /refresh 에서 `rpc('incr_api_usage')` 호출 → NAVER_DAILY_BUDGET(=24500) 초과 시 503 `NAVER_BUDGET_EXHAUSTED`. |
| T-05 | DoS (한 IP 의 연타) | POST /refresh | mitigate | (1) per-stock 30s cooldown — `news_articles.MAX(created_at)` 기반 (2) 기존 `apiRateLimiter()` 200 req/min IP-based (app.ts 에 이미 존재). |
| T-07 | Tampering (log injection) | logger.error({ code }) 호출 | mitigate | Zod regex `/^[A-Za-z0-9]{1,10}$/` 통과한 값만 로그 — newline injection 불가. pino structured logging. |
</threat_model>

<verification>
- `grep -q "stocksRouter.use.*news.*Router" server/src/routes/stocks.ts` — 마운트 1 match
- `grep -q "mergeParams: true" server/src/routes/news.ts` — 1 match
- `grep -q "Retry-After" server/src/routes/news.ts` — ≥ 1 match (헤더 세팅)
- `grep -q "Retry-After" server/src/services/cors-config.ts` — 1 match (exposedHeaders)
- `grep -q "isAllowedUrl\|protocol === .https" server/src/routes/news.ts` — URL whitelist (T-02)
- `grep -c "map(toNewsArticle)" server/src/routes/news.ts` — ≥ 2 (GET + POST refresh 모두 mapper 경유)
- `grep -q "toNewsArticle" server/src/mappers/news.ts` — mapper 존재
- `pnpm -F @gh-radar/server test --run` → 전체 그린 (news.test.ts 신규 6+)
- `pnpm -F @gh-radar/server build` → exit 0
- 기존 stocks.test.ts / scanner.test.ts 등 회귀 없음
</verification>

<success_criteria>
- `GET /api/stocks/:code/news?days=7&limit=100` 엔드포인트 작동 (clamp 포함) — V-13
- 응답 JSON 이 camelCase NewsArticle[] (mapper 적용)
- `POST /api/stocks/:code/news/refresh` 쿨다운 + budget + naver fetch 엔드포인트 — V-14
- URL protocol whitelist + sanitize 재사용 — T-02 / V-04 기반
- CORS `Retry-After` exposed — V-16 (단일 assertion)
- Supertest 통합 테스트 최소 6건 그린 (`server/tests/routes/news.test.ts`), `it.todo` 0개
- 기존 server 테스트 회귀 없음
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-03-SUMMARY.md`:
- 추가된 라우트/ mapper 파일 목록
- news.test.ts 결과 (pass count)
- CORS 변경 사항
- server.ts 의 naverClient 주입 패턴 (ENV 미설정 시 graceful degradation — undefined)
- 발견한 이슈
</output>
