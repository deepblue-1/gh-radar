---
plan: 07-02
phase: 07
type: execute
wave: 1
depends_on: [07-01]
requirements: [NEWS-01]
files_modified:
  - workers/news-sync/package.json
  - workers/news-sync/tsconfig.json
  - workers/news-sync/Dockerfile
  - workers/news-sync/src/config.ts
  - workers/news-sync/src/logger.ts
  - workers/news-sync/src/retry.ts
  - workers/news-sync/src/services/supabase.ts
  - workers/news-sync/src/naver/client.ts
  - workers/news-sync/src/naver/searchNews.ts
  - workers/news-sync/src/naver/collectStockNews.ts
  - workers/news-sync/src/pipeline/lastSeen.ts
  - workers/news-sync/src/pipeline/targets.ts
  - workers/news-sync/src/pipeline/map.ts
  - workers/news-sync/src/pipeline/upsert.ts
  - workers/news-sync/src/apiUsage.ts
  - workers/news-sync/src/retention.ts
  - workers/news-sync/src/index.ts
  - workers/news-sync/tests/naver.test.ts
  - workers/news-sync/tests/searchNews.test.ts
  - workers/news-sync/tests/collectStockNews.test.ts
  - workers/news-sync/tests/apiUsage.test.ts
  - workers/news-sync/tests/map.test.ts
  - workers/news-sync/tests/upsert.test.ts
  - workers/news-sync/tests/pipeline.test.ts
  - workers/news-sync/tests/retention.test.ts
  - workers/news-sync/tests/logger.test.ts
  - pnpm-workspace.yaml
autonomous: true
threat_refs: [T-01, T-04, T-07, T-08, T-09]

must_haves:
  truths:
    - "Cloud Run Job 으로 실행될 수 있는 news-sync worker 가 workers/news-sync/ 디렉터리에 존재한다"
    - "Worker 는 top_movers + watchlists 합집합 ~200 종목을 대상으로 Naver Search API 를 호출한다"
    - "p-limit(8) 동시성 + per-stock try/catch 로 실패가 cycle 전체를 중단시키지 않는다"
    - "글로벌 Naver budget(25K/day) 를 atomic RPC 로 체크해 초과 전 abort 한다"
    - "news_articles 에 UPSERT ON CONFLICT(stock_code, url) DO NOTHING 으로 중복 skip 한다"
    - "90일 초과 행은 retention 단계에서 DELETE 된다"
    - "logger 가 NAVER_CLIENT_SECRET / SUPABASE_SERVICE_ROLE_KEY 를 redact 한다"
  artifacts:
    - path: "workers/news-sync/Dockerfile"
      provides: "Cloud Run Job 이미지 빌드"
      contains: "COPY workers/news-sync"
    - path: "workers/news-sync/src/index.ts"
      provides: "CLI 엔트리 — cycle 전체 실행"
      min_lines: 50
    - path: "workers/news-sync/src/naver/client.ts"
      provides: "axios + secret header 주입"
      contains: "X-Naver-Client-Secret"
    - path: "workers/news-sync/src/apiUsage.ts"
      provides: "budget 체크 + incr_api_usage RPC 래퍼"
      exports: ["checkBudget", "incrementUsage"]
    - path: "workers/news-sync/src/pipeline/upsert.ts"
      provides: "ON CONFLICT DO NOTHING"
      contains: "onConflict"
  key_links:
    - from: "workers/news-sync/src/naver/client.ts"
      to: "GCP Secret Manager"
      via: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env"
      pattern: "X-Naver-Client-Secret"
    - from: "workers/news-sync/src/apiUsage.ts"
      to: "api_usage table (Supabase)"
      via: "incr_api_usage RPC"
      pattern: "rpc\\('incr_api_usage'"
    - from: "workers/news-sync/src/pipeline/targets.ts"
      to: "top_movers + watchlists"
      via: "dedupe union"
      pattern: "from\\('top_movers'\\)"
---

<objective>
Plan 01 의 마이그레이션이 적용된 후, Naver Search API 를 주기적으로 호출하는 Cloud Run Job 워커(`workers/news-sync/`)를 구현한다. master-sync 의 디렉터리/Dockerfile 구조를 그대로 복제하고, fetcher 를 KRX → Naver 로 교체하며, sanitize/upsert/retention 파이프라인을 구현한다.

Purpose: 배치 수집 경로(D1/D2)의 서버 사이드 구현. news_articles 에 주기적으로 upsert 가 일어나야 상세 페이지가 실제 데이터를 가진다.
Output: Cloud Run Job 으로 배포 가능한 image, 모든 unit/integration 테스트 그린, 90일 retention 포함.
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

@workers/master-sync/package.json
@workers/master-sync/Dockerfile
@workers/master-sync/tsconfig.json
@workers/master-sync/src/index.ts
@workers/master-sync/src/config.ts
@workers/master-sync/src/logger.ts
@workers/master-sync/src/retry.ts
@workers/master-sync/src/services/supabase.ts
@packages/shared/src/news.ts
@packages/shared/src/news-sanitize.ts
@supabase/migrations/20260413120100_rls_policies.sql
@supabase/migrations/20260417120000_api_usage.sql

<interfaces>
Plan 01 이 export 하는 공통 모듈 (news-sync 가 import):
```ts
// packages/shared/src/news-sanitize.ts (Plan 01 에서 생성)
export function stripHtml(input: string): string;
export function parsePubDate(rfc822: string): string | null;
export function extractSourcePrefix(url: string): string | null;
```

Plan 01 이 만든 Supabase 객체 (news-sync 가 호출):
```sql
-- RPC signature
incr_api_usage(p_service text, p_date date, p_amount int) RETURNS bigint;
```

news_articles 스키마 (Phase 1 + 06.1 에서 확정 — 변경 없음):
```sql
news_articles(
  id uuid PK,
  stock_code text FK→stocks,
  title text,
  source text NULL,
  url text,
  published_at timestamptz,
  content_hash text,
  created_at timestamptz,
  UNIQUE(stock_code, url)
)
```

news_articles RLS (이미 적용됨 — `supabase/migrations/20260413120100_rls_policies.sql`):
```sql
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_news" ON news_articles FOR SELECT TO anon USING (true);
-- DELETE/INSERT/UPDATE 정책 없음 → anon/authenticated 는 전면 deny.
-- service_role 은 RLS bypass 라 retention DELETE 가 동작. worker 는 SUPABASE_SERVICE_ROLE_KEY 로 접근.
```
→ retention.ts 는 반드시 service_role 클라이언트를 통해야 하며, `workers/news-sync/src/services/supabase.ts` 는 `SUPABASE_SERVICE_ROLE_KEY` 를 주입해야 한다 (grep 검증 필수).

Naver Search News API (RESEARCH §1.1):
```
GET https://openapi.naver.com/v1/search/news.json?query=삼성전자&display=100&sort=date&start=1  # R7: display 100 + page loop (start=1→101→201...)
Headers: X-Naver-Client-Id, X-Naver-Client-Secret
Response: { items: [{ title, originallink, link, description, pubDate }] }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: workers/news-sync 디렉터리 + package.json + Dockerfile + tsconfig 스캐폴드 (master-sync 복제)</name>
  <files>
    workers/news-sync/package.json,
    workers/news-sync/tsconfig.json,
    workers/news-sync/Dockerfile,
    pnpm-workspace.yaml
  </files>
  <read_first>
    - workers/master-sync/package.json (deps 목록 원본)
    - workers/master-sync/tsconfig.json (1:1 복제)
    - workers/master-sync/Dockerfile (치환 대상 3곳 식별)
    - pnpm-workspace.yaml (workers/* glob 확인)
  </read_first>
  <action>
    master-sync 에서 파일을 1:1 복제 후 이름만 news-sync 로 치환. pnpm-workspace.yaml 은 `workers/*` glob 이 이미 news-sync 를 흡수하므로 변경 불필요(단순 확인).

    `workers/news-sync/package.json`:
    ```json
    {
      "name": "@gh-radar/news-sync",
      "version": "0.0.0",
      "private": true,
      "scripts": {
        "dev": "tsx -r dotenv/config src/index.ts",
        "build": "tsc",
        "typecheck": "tsc --noEmit",
        "test": "vitest run"
      },
      "dependencies": {
        "@gh-radar/shared": "workspace:*",
        "@supabase/supabase-js": "^2.49.0",
        "axios": "^1.7.0",
        "dotenv": "^16.4.0",
        "p-limit": "^7.0.0",
        "pino": "^9.0.0"
      },
      "devDependencies": {
        "tsx": "^4.0.0",
        "typescript": "^5.0.0",
        "vitest": "^3.0.0",
        "@types/node": "^22.0.0"
      }
    }
    ```

    `workers/news-sync/tsconfig.json` — master-sync 것 그대로 복사.

    `workers/news-sync/Dockerfile` — master-sync Dockerfile 1:1 복사 + sed 치환 `master-sync` → `news-sync` (3곳: COPY path 2곳 + pnpm filter 2곳, `@gh-radar/master-sync` → `@gh-radar/news-sync`):
    ```dockerfile
    # === Builder Stage ===
    FROM node:22-alpine AS builder
    RUN corepack enable && corepack prepare pnpm@10 --activate
    WORKDIR /app

    COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
    COPY packages/shared/package.json ./packages/shared/
    COPY workers/news-sync/package.json ./workers/news-sync/

    RUN pnpm install --frozen-lockfile

    COPY packages/shared/ ./packages/shared/
    COPY workers/news-sync/ ./workers/news-sync/

    RUN pnpm -F @gh-radar/shared build
    RUN pnpm -F @gh-radar/news-sync build

    RUN pnpm --filter=@gh-radar/news-sync --prod --legacy deploy /out
    RUN cp -r /app/workers/news-sync/dist /out/dist

    # === Production Image ===
    FROM node:22-alpine
    WORKDIR /app

    RUN addgroup -S app && adduser -S app -G app

    COPY --from=builder /out/dist ./dist
    COPY --from=builder /out/package.json ./
    COPY --from=builder /out/node_modules ./node_modules
    COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

    ARG GIT_SHA=dev
    ENV APP_VERSION=${GIT_SHA}

    USER app
    CMD ["node", "dist/index.js"]
    ```

    pnpm install 실행해서 lockfile 에 `@gh-radar/news-sync` + `p-limit@^7` 추가:
    ```bash
    pnpm install
    ```
  </action>
  <verify>
    <automated>test -f workers/news-sync/package.json &amp;&amp; test -f workers/news-sync/Dockerfile &amp;&amp; test -f workers/news-sync/tsconfig.json &amp;&amp; grep -q "@gh-radar/news-sync" workers/news-sync/package.json &amp;&amp; grep -q "p-limit" workers/news-sync/package.json &amp;&amp; grep -q "workers/news-sync" workers/news-sync/Dockerfile &amp;&amp; ! grep -q "master-sync" workers/news-sync/Dockerfile</automated>
  </verify>
  <acceptance_criteria>
    - `workers/news-sync/package.json` 에 `"name": "@gh-radar/news-sync"` 존재
    - deps 에 `p-limit@^7` 포함 (`grep "p-limit" workers/news-sync/package.json` → 1 match)
    - `sanitize-html`, `striptags`, `dompurify` 모두 미포함 (V-20 guardrail)
    - Dockerfile 에 `master-sync` 문자열 0 match, `news-sync` 다수 match
    - `pnpm install` 성공 (lockfile 업데이트)
    - `pnpm -F @gh-radar/news-sync typecheck` 아직 실패해도 OK (src 파일은 Task 2+ 에서 작성) — 단 pnpm 이 workspace 인식은 필수: `pnpm ls -r --depth=-1 | grep @gh-radar/news-sync` 1 match
  </acceptance_criteria>
  <done>디렉터리 스캐폴드 + pnpm install 완료, workspace 인식</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2a: Worker 기반 레이어 — config/logger/supabase client/Naver client/searchNews/apiUsage/retry + 4 unit tests</name>
  <files>
    workers/news-sync/src/config.ts,
    workers/news-sync/src/logger.ts,
    workers/news-sync/src/retry.ts,
    workers/news-sync/src/services/supabase.ts,
    workers/news-sync/src/naver/client.ts,
    workers/news-sync/src/naver/searchNews.ts,
    workers/news-sync/src/apiUsage.ts,
    workers/news-sync/tests/naver.test.ts,
    workers/news-sync/tests/searchNews.test.ts,
    workers/news-sync/tests/apiUsage.test.ts,
    workers/news-sync/tests/logger.test.ts
  </files>
  <read_first>
    - workers/master-sync/src/logger.ts (redact paths 패턴 — 치환 대상)
    - workers/master-sync/src/retry.ts (1:1 복사)
    - workers/master-sync/src/services/supabase.ts (service role client 생성)
    - workers/master-sync/src/config.ts (ENV 스키마 패턴)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §§1, 4, 6, 7
    - packages/shared/src/news-sanitize.ts (Plan 01 산출물 — Task 2b 에서 import, 본 task 는 Naver 호출 레이어만)
    - workers/news-sync/tests/helpers/supabase-mock.ts (Plan 01 Task 3 산출물)
    - workers/news-sync/tests/helpers/naver-fixtures.ts (Plan 01 Task 3 산출물)
  </read_first>
  <behavior>
    config.ts:
      - loadConfig() 가 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (필수) + NAVER_BASE_URL, NEWS_SYNC_DAILY_BUDGET, NEWS_SYNC_CONCURRENCY, LOG_LEVEL, APP_VERSION (optional) 을 읽음
      - 필수 env 누락 시 throw

    logger.ts:
      - pino with redact paths: 'cfg.naverClientSecret', 'cfg.supabaseServiceRoleKey', 'headers["X-Naver-Client-Secret"]', '*.NAVER_CLIENT_SECRET', '*.SUPABASE_SERVICE_ROLE_KEY'
      - logger.info({ cfg: { naverClientSecret: 'SECRET123' } }) → output 에 'SECRET123' 없고 '[Redacted]' 존재 (V-12)

    services/supabase.ts:
      - createSupabaseClient(url, serviceRoleKey) 가 `@supabase/supabase-js::createClient` 를 호출하여 service_role 키로 클라이언트 생성 (RLS bypass — retention DELETE 필수 조건)

    naver/client.ts:
      - axios.create 인스턴스가 `X-Naver-Client-Id` 와 `X-Naver-Client-Secret` 을 기본 헤더로 설정해야 함
      - baseURL 은 `https://` 강제 (T-09) — 아니면 throw
      - timeout 15000ms

    naver/searchNews.ts:
      - 단일 page 호출: GET /v1/search/news.json?query=${encodeURIComponent(name)}&display=100&sort=date&start=${start}
      - `searchNews(client, query, { start, display })` 시그니처 — page loop 는 collectStockNews 가 담당 (R7)
    naver/collectStockNews.ts (신규 — R7 페이지네이션):
      - start=1 → 101 → 201 … 루프, 종료조건: (1) page youngest ≤ cutoff (2) 빈 배열/짧은 page (3) start > 1000 (4) onPage(budget) false
      - 401 → throw `NaverAuthError` (retry 안 함)
      - 429 → throw `NaverBudgetExhaustedError` (즉시 abort)
      - 400/403 → throw `NaverBadRequestError` (per-stock skip)
      - 500 → 1회 retry after 1s
      - 정상 → Response.items 배열 반환

    apiUsage.ts:
      - `kstDateString()` — UTC 기준 now 를 KST 로 변환해 YYYY-MM-DD 반환
      - `checkBudget(supabase, dateKst)` → 오늘 사용량 반환. RLS bypass 위해 service_role client.
      - `incrementUsage(supabase, dateKst, amount)` → rpc('incr_api_usage') 호출, 새 count 반환
  </behavior>
  <action>
    `workers/news-sync/src/config.ts`:
    ```ts
    import 'dotenv/config';

    export interface NewsSyncConfig {
      supabaseUrl: string;
      supabaseServiceRoleKey: string;
      naverClientId: string;
      naverClientSecret: string;
      naverBaseUrl: string;
      naverDailyBudget: number;
      newsSyncConcurrency: number;
      appVersion: string;
      logLevel: string;
    }

    function req(key: string): string {
      const v = process.env[key];
      if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
      return v;
    }

    export function loadConfig(): NewsSyncConfig {
      return {
        supabaseUrl: req('SUPABASE_URL'),
        supabaseServiceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
        naverClientId: req('NAVER_CLIENT_ID'),
        naverClientSecret: req('NAVER_CLIENT_SECRET'),
        naverBaseUrl: process.env.NAVER_BASE_URL ?? 'https://openapi.naver.com',
        naverDailyBudget: Number(process.env.NEWS_SYNC_DAILY_BUDGET ?? '24500'),
        newsSyncConcurrency: Number(process.env.NEWS_SYNC_CONCURRENCY ?? '8'),
        appVersion: process.env.APP_VERSION ?? 'dev',
        logLevel: process.env.LOG_LEVEL ?? 'info',
      };
    }
    ```

    `workers/news-sync/src/logger.ts` (RESEARCH §F.1 redact paths — T-01/T-07 대응):
    ```ts
    import pino from 'pino';

    export function createLogger(level = 'info') {
      return pino({
        level,
        redact: {
          paths: [
            'cfg.naverClientSecret',
            'cfg.supabaseServiceRoleKey',
            'headers["X-Naver-Client-Secret"]',
            'headers.authorization',
            '*.NAVER_CLIENT_SECRET',
            '*.SUPABASE_SERVICE_ROLE_KEY',
          ],
          censor: '[Redacted]',
        },
      });
    }
    ```

    `workers/news-sync/src/retry.ts` — master-sync 의 retry.ts 1:1 복사.

    `workers/news-sync/src/services/supabase.ts` — master-sync 의 services/supabase.ts 1:1 복사 (service_role client 생성 — `SUPABASE_SERVICE_ROLE_KEY` 를 두 번째 인자로 받아 `createClient(url, serviceRoleKey, { auth: { persistSession: false } })` 형태. retention DELETE 가 RLS bypass 하려면 이 경로가 필수).

    `workers/news-sync/src/naver/client.ts`:
    ```ts
    import axios, { AxiosInstance } from 'axios';
    import type { NewsSyncConfig } from '../config.js';

    export function createNaverClient(cfg: NewsSyncConfig): AxiosInstance {
      if (!cfg.naverBaseUrl.startsWith('https://')) {
        throw new Error(`NAVER_BASE_URL must be https (got: ${cfg.naverBaseUrl})`);
      }
      return axios.create({
        baseURL: cfg.naverBaseUrl,
        timeout: 15000,
        headers: {
          'X-Naver-Client-Id': cfg.naverClientId,
          'X-Naver-Client-Secret': cfg.naverClientSecret,
          'Accept': 'application/json',
          'User-Agent': `gh-radar-news-sync/${cfg.appVersion}`,
        },
      });
    }
    ```

    `workers/news-sync/src/naver/searchNews.ts`:
    ```ts
    import type { AxiosInstance } from 'axios';

    export interface NaverNewsItem {
      title: string;
      originallink: string;
      link: string;
      description: string;
      pubDate: string;
    }

    export class NaverAuthError extends Error { constructor() { super('Naver auth failed'); this.name = 'NaverAuthError'; } }
    export class NaverBudgetExhaustedError extends Error { constructor() { super('Naver daily budget exhausted'); this.name = 'NaverBudgetExhaustedError'; } }
    export class NaverBadRequestError extends Error { constructor(msg: string) { super(msg); this.name = 'NaverBadRequestError'; } }

    export const NAVER_MAX_DISPLAY = 100;  // R7: Naver Search display 상한 (CONTEXT R7)
    export const NAVER_MAX_START = 1000;   // R7: start 파라미터 하드 상한 — 초과 시 400

    export async function searchNews(
      client: AxiosInstance,
      query: string,
      opts: { start?: number; display?: number } = {},
    ): Promise<NaverNewsItem[]> {
      const start = opts.start ?? 1;
      const display = opts.display ?? NAVER_MAX_DISPLAY;
      const params = { query, display, sort: 'date', start };
      try {
        const res = await client.get<{ items: NaverNewsItem[] }>('/v1/search/news.json', { params });
        return res.data.items ?? [];
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) throw new NaverAuthError();
        if (status === 429) throw new NaverBudgetExhaustedError();
        if (status === 400 || status === 403) throw new NaverBadRequestError(err?.response?.data?.errorMessage ?? 'bad request');
        // 5xx 또는 네트워크: 1회 retry
        if (status >= 500 || status === undefined) {
          await new Promise((r) => setTimeout(r, 1000));
          const res2 = await client.get<{ items: NaverNewsItem[] }>('/v1/search/news.json', { params });
          return res2.data.items ?? [];
        }
        throw err;
      }
    }
    ```

    `workers/news-sync/src/naver/collectStockNews.ts` (R7 페이지네이션 루프 — 증분 종료조건):
    ```ts
    import type { AxiosInstance } from 'axios';
    import { parsePubDate } from '@gh-radar/shared';
    import { NAVER_MAX_DISPLAY, NAVER_MAX_START, searchNews, type NaverNewsItem } from './searchNews.js';

    export interface CollectOpts {
      /** 이전 수집의 MAX(published_at) — 없으면 첫 수집 */
      lastSeenIso: string | null;
      /** 첫 수집 시 7일 컷오프 (ISO). 증분 수집 시엔 null 가능 */
      firstCutoffIso: string;
      /** page 하나 호출 직후 실행되는 콜백 — budget 감소/abort 판정. 반환값 false 시 루프 즉시 종료 */
      onPage: () => Promise<boolean>;
    }

    export interface CollectResult {
      items: NaverNewsItem[];
      pages: number;
      stoppedBy: 'cutoff' | 'empty' | 'api-limit' | 'budget';
    }

    /**
     * R7: display=100, start=1→101→201→... 페이지네이션 루프.
     * 종료 조건:
     *   (1) 증분: 페이지의 **youngest** pubDate 가 lastSeenIso 이하 → cutoff 도달
     *   (2) 첫 수집: 페이지의 youngest 가 firstCutoffIso(7일 전) 이전 → cutoff
     *   (3) API 상한: start > 1000 → api-limit
     *   (4) 응답 빈 배열 또는 page.length < NAVER_MAX_DISPLAY → empty (마지막 페이지)
     *   (5) onPage 가 false → budget (abort 시그널)
     */
    export async function collectStockNews(
      client: AxiosInstance,
      query: string,
      opts: CollectOpts,
    ): Promise<CollectResult> {
      const cutoffIso = opts.lastSeenIso ?? opts.firstCutoffIso;
      const items: NaverNewsItem[] = [];
      let pages = 0;
      let start = 1;
      let stoppedBy: CollectResult['stoppedBy'] = 'empty';

      while (start <= NAVER_MAX_START) {
        const page = await searchNews(client, query, { start, display: NAVER_MAX_DISPLAY });
        pages++;

        const shouldContinue = await opts.onPage();
        if (!shouldContinue) { stoppedBy = 'budget'; break; }

        if (page.length === 0) { stoppedBy = 'empty'; break; }

        let hitCutoff = false;
        for (const it of page) {
          const iso = parsePubDate(it.pubDate);
          if (!iso) continue;
          if (iso <= cutoffIso) { hitCutoff = true; continue; }
          items.push(it);
        }

        if (hitCutoff) { stoppedBy = 'cutoff'; break; }
        if (page.length < NAVER_MAX_DISPLAY) { stoppedBy = 'empty'; break; }

        start += NAVER_MAX_DISPLAY;
      }

      if (start > NAVER_MAX_START) stoppedBy = 'api-limit';
      return { items, pages, stoppedBy };
    }
    ```

    `workers/news-sync/src/apiUsage.ts`:
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    const SERVICE = 'naver_search_news';

    export function kstDateString(now = new Date()): string {
      // UTC + 9h → YYYY-MM-DD (KST 기준)
      const t = new Date(now.getTime() + 9 * 3600_000);
      return t.toISOString().slice(0, 10);
    }

    export async function checkBudget(supabase: SupabaseClient, dateKst: string): Promise<number> {
      const { data, error } = await supabase
        .from('api_usage')
        .select('count')
        .eq('service', SERVICE)
        .eq('usage_date', dateKst)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.count ?? 0);
    }

    export async function incrementUsage(
      supabase: SupabaseClient,
      dateKst: string,
      amount = 1,
    ): Promise<number> {
      const { data, error } = await supabase.rpc('incr_api_usage', {
        p_service: SERVICE,
        p_date: dateKst,
        p_amount: amount,
      });
      if (error) throw error;
      return Number(data);
    }
    ```

    Unit tests:

    `workers/news-sync/tests/naver.test.ts` (V-08 — client 헤더):
      - `createNaverClient(cfg)` 가 `X-Naver-Client-Id` / `X-Naver-Client-Secret` 을 defaults.headers 에 설정하는지 확인
      - `naverBaseUrl` 이 http:// 이면 throw (T-09)
      - 정상 케이스 baseURL / timeout 검증

    `workers/news-sync/tests/searchNews.test.ts`:
      - axios mock (vi.fn) 으로 401 → `NaverAuthError` throw
      - 429 → `NaverBudgetExhaustedError` throw
      - 400 → `NaverBadRequestError` throw
      - 200 → items 배열 반환
      - **R7 param 검증**: `searchNews(client, 'q', { start: 101, display: 100 })` 호출 시 axios.get 의 params 에 `{ query: 'q', display: 100, sort: 'date', start: 101 }` 전달 (V-21)
      - **기본값**: `searchNews(client, 'q')` → params 에 `display: 100, start: 1` (V-21)

    `workers/news-sync/tests/collectStockNews.test.ts` (R7 페이지네이션 — V-22, V-23):
      - **V-22 증분 종료조건**: mock 이 page1 = 100 items(전부 pubDate > lastSeen), page2 = 100 items(50 > lastSeen, 50 ≤ lastSeen) 반환 → `collectStockNews(client, 'q', { lastSeenIso: '2026-04-17T00:00:00Z', firstCutoffIso: ..., onPage: async () => true })` 가 150 items 반환 + `stoppedBy === 'cutoff'` + pages === 2
      - **V-23 첫 수집 7일 컷오프**: `lastSeenIso: null`, `firstCutoffIso: 7일 전 ISO`. page1 의 절반이 7일 초과 → 절반만 수집 + `stoppedBy === 'cutoff'`
      - **budget abort**: `onPage: async () => false` 시 1 page 호출 후 즉시 종료, `stoppedBy === 'budget'`
      - **API 하드 상한**: 10 페이지 연속 full 100-item 반환 (pubDate 모두 cutoff 위) → `start > 1000` 에서 종료, `stoppedBy === 'api-limit'`, pages === 10

    `workers/news-sync/tests/apiUsage.test.ts` (V-02, V-09):
      - `kstDateString(new Date('2026-04-16T15:00:00Z'))` === `'2026-04-17'` (UTC 15 → KST 00)
      - `incrementUsage` 가 rpc('incr_api_usage', { p_service, p_date, p_amount }) 호출 확인
      - `checkBudget` 이 row 없을 때 0 반환

    `workers/news-sync/tests/logger.test.ts` (V-12):
      - logger.info({ cfg: { naverClientSecret: 'SECRET123' } }) 을 stringify 한 output 에 'SECRET123' 없음, '[Redacted]' 포함
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/news-sync test --run</automated>
  </verify>
  <acceptance_criteria>
    - V-08: `X-Naver-Client-Secret` 헤더 전송 — `grep -q "X-Naver-Client-Secret" workers/news-sync/src/naver/client.ts` → 1 match, `naver.test.ts` 그린
    - V-09: budget 선제 체크 — `apiUsage.ts` 에 `checkBudget` export, `incrementUsage` 내부에 `rpc('incr_api_usage'` 호출
    - V-12: logger redact paths 에 `naverClientSecret` + `supabaseServiceRoleKey` 포함 — `grep -q "naverClientSecret" workers/news-sync/src/logger.ts` → 1 match, `logger.test.ts` 그린
    - service_role client 확증 (T-06 retention 전제): `grep -q 'SUPABASE_SERVICE_ROLE_KEY' workers/news-sync/src/services/supabase.ts` ≥ 1 match — service_role 이 RLS bypass 함을 코드 수준에서 확증
    - Naver client baseURL https:// 강제: `grep -q "startsWith('https://')" workers/news-sync/src/naver/client.ts` 또는 유사 정적 검증 match
    - **V-21 (R7 display=100 + start param)**: `grep -q "NAVER_MAX_DISPLAY = 100" workers/news-sync/src/naver/searchNews.ts` → 1 match, `grep -q "NAVER_MAX_START = 1000" workers/news-sync/src/naver/searchNews.ts` → 1 match, searchNews 시그니처가 `{ start?, display? }` 옵션 수용 — `grep -qE "searchNews\\(.*start.*display" workers/news-sync/src/naver/searchNews.ts` 또는 test 파일에서 동등 검증. `searchNews.test.ts` 그린.
    - **V-22/V-23 (R7 pagination + 종료조건)**: `grep -q "collectStockNews" workers/news-sync/src/naver/collectStockNews.ts` → 1 match, `grep -q "stoppedBy" workers/news-sync/src/naver/collectStockNews.ts` → 1 match, `collectStockNews.test.ts` 그린 (≥ 4 case: cutoff/first-cutoff/budget/api-limit)
    - display=20 잔존 금지: `grep -Ern "display\\s*[:=]\\s*20[^0-9]" workers/news-sync/src/` 결과 0 match (R7 이후 기본 100)
    - `pnpm -F @gh-radar/news-sync test --run` exit 0 with ≥ 16 passing tests (5 test 스펙 × ~3 case)
    - `pnpm -F @gh-radar/news-sync typecheck` exit 0
  </acceptance_criteria>
  <done>worker 기반 레이어 8개 src 파일(collectStockNews 추가) + 5 test 스펙 모두 그린 + typecheck 통과</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2b: Pipeline + retention + index.ts cycle entry — targets/map/upsert/retention/index + 4 unit/integration tests</name>
  <files>
    workers/news-sync/src/pipeline/targets.ts,
    workers/news-sync/src/pipeline/map.ts,
    workers/news-sync/src/pipeline/upsert.ts,
    workers/news-sync/src/retention.ts,
    workers/news-sync/src/index.ts,
    workers/news-sync/tests/map.test.ts,
    workers/news-sync/tests/upsert.test.ts,
    workers/news-sync/tests/retention.test.ts,
    workers/news-sync/tests/pipeline.test.ts
  </files>
  <read_first>
    - workers/news-sync/src/config.ts (Task 2a 산출물)
    - workers/news-sync/src/apiUsage.ts (Task 2a 산출물)
    - workers/news-sync/src/naver/searchNews.ts (Task 2a 산출물)
    - workers/news-sync/src/services/supabase.ts (Task 2a 산출물 — service_role client)
    - workers/news-sync/src/logger.ts (Task 2a 산출물)
    - workers/master-sync/src/index.ts (cycle entry 패턴)
    - packages/shared/src/news-sanitize.ts (Plan 01 산출물 — import 대상)
    - supabase/migrations/20260413120100_rls_policies.sql (retention DELETE 가 service_role RLS bypass 를 필요로 하는 근거 — anon 정책은 SELECT 뿐)
    - workers/news-sync/tests/helpers/supabase-mock.ts (Plan 01 Task 3 산출물)
    - workers/news-sync/tests/helpers/naver-fixtures.ts (Plan 01 Task 3 산출물)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §§3, 6, 7, §B.4
  </read_first>
  <behavior>
    pipeline/map.ts:
      - NaverItem → news_articles row 변환
      - title = stripHtml(item.title)
      - url = item.originallink || item.link
      - url protocol 이 http/https 아니면 null 반환 (T-02)
      - published_at = parsePubDate(item.pubDate); null 이면 null 반환
      - source = extractSourcePrefix(url)
      - content_hash = sha256(title + '\n' + stripHtml(description))

    pipeline/upsert.ts:
      - supabase.from('news_articles').upsert(rows, { onConflict: 'stock_code,url', ignoreDuplicates: true })
      - 반환: inserted count

    pipeline/targets.ts:
      - loadTargets(supabase): top_movers 의 최신 scan_id 의 stock_code ∪ watchlists.stock_code
      - stocks 마스터 존재하는 code 만 반환 (FK 위반 사전 차단)
      - 반환: { code: string; name: string }[] — name 은 stocks.name
      - dedupe: stock_code 중복 제거

    retention.ts:
      - DELETE FROM news_articles WHERE created_at < now() - INTERVAL '90 days'
      - service_role 클라이언트 필수 (anon/authenticated 에는 DELETE 정책 없음 → RLS bypass 가 없으면 0 row 삭제로 silent 실패)
      - 반환: deleted count

    index.ts cycle:
      1. loadConfig()
      2. logger / supabase (service_role) / naver client 생성
      3. targets = loadTargets(supabase)
      4. dateKst = kstDateString()
      5. usedNow = checkBudget(supabase, dateKst); if (usedNow + targets.length > cfg.naverDailyBudget) → log.warn + skip
      6. stopAll flag = false
      7. lastSeenMap = loadLastSeenMap(supabase, codes) — 종목별 MAX(published_at)
      8. firstCutoffIso = 7일 전 ISO (첫 수집 컷오프, R7)
      9. p-limit(cfg.newsSyncConcurrency) 로 targets 병렬 처리:
         - stopAll 이면 skip
         - **R7 pagination loop**: collectStockNews(client, name, { lastSeenIso: lastSeenMap.get(code) ?? null, firstCutoffIso, onPage })
           - onPage 콜백: incrementUsage(+1) → 초과 시 stopAll=true, return false
           - page loop 는 start=1→101→...→1000 또는 cutoff/empty 만나면 종료
         - stoppedBy === 'api-limit' 이면 warn 로그(소수 종목만 해당 — 2시간 내 1,000건 넘는 종목)
         - items.map(mapToNewsRow).filter(nonNull)
         - upsertNews(rows)
         - per-stock try/catch 로 401(NaverAuthError) 시 stopAll = true, 그 외 에러는 warn 로그 후 continue
      10. runRetention(supabase, 90)
      11. log.info summary: { pages, inserted, skipped, errors, budgetBefore, budgetAfter, retentionDeleted }
      12. exit 0
  </behavior>
  <action>
    `workers/news-sync/src/pipeline/map.ts`:
    ```ts
    import { createHash } from 'node:crypto';
    import { stripHtml, parsePubDate, extractSourcePrefix } from '@gh-radar/shared';
    import type { NaverNewsItem } from '../naver/searchNews.js';

    export interface NewsArticleRow {
      stock_code: string;
      title: string;
      source: string | null;
      url: string;
      published_at: string;
      content_hash: string;
    }

    function isAllowedUrl(url: string): boolean {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    }

    export function mapToNewsRow(stockCode: string, item: NaverNewsItem): NewsArticleRow | null {
      const rawUrl = item.originallink?.trim() || item.link?.trim();
      if (!rawUrl || !isAllowedUrl(rawUrl)) return null;  // T-02
      const title = stripHtml(item.title);
      if (!title) return null;
      const publishedIso = parsePubDate(item.pubDate);
      if (!publishedIso) return null;
      const descStripped = stripHtml(item.description);
      const contentHash = createHash('sha256').update(title + '\n' + descStripped).digest('hex');
      return {
        stock_code: stockCode,
        title,
        source: extractSourcePrefix(rawUrl),
        url: rawUrl,
        published_at: publishedIso,
        content_hash: contentHash,
      };
    }
    ```

    `workers/news-sync/src/pipeline/upsert.ts`:
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';
    import type { NewsArticleRow } from './map.js';

    export async function upsertNews(
      supabase: SupabaseClient,
      rows: NewsArticleRow[],
    ): Promise<{ inserted: number }> {
      if (rows.length === 0) return { inserted: 0 };
      const { data, error } = await supabase
        .from('news_articles')
        .upsert(rows, { onConflict: 'stock_code,url', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    }
    ```

    `workers/news-sync/src/pipeline/targets.ts`:
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    export interface NewsTarget { code: string; name: string; }

    export async function loadTargets(supabase: SupabaseClient): Promise<NewsTarget[]> {
      // 1. 최신 scan_id 의 top_movers
      const { data: latestScan, error: e1 } = await supabase
        .from('top_movers')
        .select('scan_id')
        .order('scan_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      let moverCodes: string[] = [];
      if (latestScan?.scan_id) {
        const { data: movers, error: e2 } = await supabase
          .from('top_movers')
          .select('stock_code')
          .eq('scan_id', latestScan.scan_id);
        if (e2) throw e2;
        moverCodes = (movers ?? []).map((r: any) => r.stock_code);
      }

      // 2. watchlists
      const { data: watch, error: e3 } = await supabase
        .from('watchlists')
        .select('stock_code');
      if (e3) throw e3;
      const watchCodes = (watch ?? []).map((r: any) => r.stock_code);

      // 3. dedupe union
      const codes = Array.from(new Set<string>([...moverCodes, ...watchCodes]));

      // 4. 마스터 존재 검증 + name 조회
      if (codes.length === 0) return [];
      const { data: masters, error: e4 } = await supabase
        .from('stocks')
        .select('code, name')
        .in('code', codes);
      if (e4) throw e4;
      return (masters ?? []).map((r: any) => ({ code: r.code, name: r.name }));
    }
    ```

    `workers/news-sync/src/pipeline/lastSeen.ts` (R7 — 종목별 MAX(published_at) 사전 로드):
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    /**
     * 종목코드 배열에 대해 `news_articles.MAX(published_at)` 을 맵으로 반환.
     * Map<stock_code, iso_string> — 미존재 종목은 Map 에 없음 (collectStockNews 가 null 로 폴백 → 7일 컷오프)
     */
    export async function loadLastSeenMap(
      supabase: SupabaseClient,
      codes: string[],
    ): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      if (codes.length === 0) return out;
      // Postgres 에서 per-group MAX 를 효율적으로 조회 — Supabase SQL RPC 또는 rpc 가 없으면 stock_code 별 order+limit
      // 실무 기준: codes ≤ ~200 이므로 in(codes) 로 모든 published_at 조회 후 JS 에서 reduce (INDEX idx_news_stock_published 사용)
      const { data, error } = await supabase
        .from('news_articles')
        .select('stock_code, published_at')
        .in('stock_code', codes)
        .order('published_at', { ascending: false });
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ stock_code: string; published_at: string }>) {
        if (!out.has(row.stock_code)) out.set(row.stock_code, row.published_at);
      }
      return out;
    }
    ```

    `workers/news-sync/src/retention.ts` — RESEARCH §7 코드 그대로 (service_role client 전제):
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    export async function runRetention(supabase: SupabaseClient, days = 90): Promise<number> {
      // NOTE: supabase 클라이언트는 반드시 service_role 키로 생성되어야 한다.
      // news_articles RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야 DELETE 가 실제 행을 삭제한다.
      const threshold = new Date(Date.now() - days * 86400_000).toISOString();
      const { count, error } = await supabase
        .from('news_articles')
        .delete({ count: 'exact' })
        .lt('created_at', threshold);
      if (error) throw error;
      return count ?? 0;
    }
    ```

    `workers/news-sync/src/index.ts`:
    ```ts
    import pLimit from 'p-limit';
    import { loadConfig } from './config.js';
    import { createLogger } from './logger.js';
    import { createSupabaseClient } from './services/supabase.js';
    import { createNaverClient } from './naver/client.js';
    import { NaverAuthError, NaverBudgetExhaustedError } from './naver/searchNews.js';
    import { collectStockNews } from './naver/collectStockNews.js';
    import { loadTargets } from './pipeline/targets.js';
    import { loadLastSeenMap } from './pipeline/lastSeen.js';
    import { mapToNewsRow } from './pipeline/map.js';
    import { upsertNews } from './pipeline/upsert.js';
    import { checkBudget, incrementUsage, kstDateString } from './apiUsage.js';
    import { runRetention } from './retention.js';

    async function main(): Promise<void> {
      const cfg = loadConfig();
      const log = createLogger(cfg.logLevel);
      const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
      const naver = createNaverClient(cfg);

      const targets = await loadTargets(supabase);
      log.info({ count: targets.length }, 'news-sync targets loaded');

      const dateKst = kstDateString();
      const budgetBefore = await checkBudget(supabase, dateKst);
      if (budgetBefore + targets.length > cfg.naverDailyBudget) {
        log.warn({ budgetBefore, targets: targets.length, budget: cfg.naverDailyBudget }, 'budget would exceed — skipping cycle');
        return;
      }

      // R7: 종목별 마지막 수집 MAX(published_at) 선로드 — 증분 종료조건 기준
      const lastSeenMap = await loadLastSeenMap(supabase, targets.map((t) => t.code));
      const firstCutoffIso = new Date(Date.now() - 7 * 86400_000).toISOString();

      let pages = 0, inserted = 0, skipped = 0, errors = 0;
      let stopAll = false;
      const limit = pLimit(cfg.newsSyncConcurrency);

      await Promise.allSettled(
        targets.map((t) =>
          limit(async () => {
            if (stopAll) { skipped++; return; }
            try {
              // R7: page 별 budget 증가 콜백 — 초과 시 false 반환 → collectStockNews 즉시 break
              const onPage = async (): Promise<boolean> => {
                const used = await incrementUsage(supabase, dateKst, 1);
                if (used > cfg.naverDailyBudget) { stopAll = true; return false; }
                return !stopAll;
              };

              const { items, pages: pagesForStock, stoppedBy } = await collectStockNews(naver, t.name, {
                lastSeenIso: lastSeenMap.get(t.code) ?? null,
                firstCutoffIso,
                onPage,
              });
              pages += pagesForStock;
              if (stoppedBy === 'api-limit') {
                log.warn({ code: t.code, pages: pagesForStock }, 'hit Naver start=1000 hard limit — some articles may be unreachable');
              }

              const rows = items.map((it) => mapToNewsRow(t.code, it)).filter((r): r is NonNullable<typeof r> => r !== null);
              const { inserted: ins } = await upsertNews(supabase, rows);
              inserted += ins;
            } catch (err: any) {
              if (err instanceof NaverAuthError || err instanceof NaverBudgetExhaustedError) {
                log.error({ err: err.message, code: t.code }, 'abort signal from Naver');
                stopAll = true;
              } else {
                log.warn({ err: err?.message, code: t.code }, 'per-stock fetch failed');
                errors++;
              }
            }
          }),
        ),
      );

      const retentionDeleted = await runRetention(supabase, 90);
      const budgetAfter = await checkBudget(supabase, dateKst);

      log.info({ pages, inserted, skipped, errors, retentionDeleted, budgetBefore, budgetAfter }, 'news-sync cycle complete');
    }

    main().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[news-sync] fatal', err);
      process.exit(1);
    });
    ```

    Unit + integration tests:

    `workers/news-sync/tests/map.test.ts` (V-04/V-07):
      - `<b>X</b>` title → 'X' 로 strip
      - originallink 없으면 link 폴백
      - javascript: URL → null 반환 (T-02)
      - pubDate invalid → null 반환
      - 동일 input → 동일 content_hash (결정성)

    `workers/news-sync/tests/upsert.test.ts` (V-10):
      - 빈 rows → { inserted: 0 }
      - supabase mock 에 onConflict: 'stock_code,url' 옵션이 전달되는지 확인
      - ignoreDuplicates: true 포함

    `workers/news-sync/tests/retention.test.ts` (V-11):
      - runRetention(supabase, 90) 이 `from('news_articles').delete({count:'exact'}).lt('created_at', <iso>)` 호출
      - 반환값이 mock 의 count 와 일치

    `workers/news-sync/tests/pipeline.test.ts` (integration):
      ```ts
      import { describe, it, expect } from 'vitest';
      import { mapToNewsRow } from '../src/pipeline/map.js';
      import { NAVER_NEWS_SAMPLE_OK, NAVER_NEWS_SAMPLE_EMPTY } from './helpers/naver-fixtures.js';

      describe('pipeline integration (V-09 budget / V-10 idempotent / failure isolation)', () => {
        it('mapToNewsRow converts Naver item to row with sanitized title', () => {
          const row = mapToNewsRow('005930', NAVER_NEWS_SAMPLE_OK.items[0] as any);
          expect(row).not.toBeNull();
          expect(row!.title).toBe('삼성전자, 1분기 영업익 6.6조원 기록');  // <b> stripped
          expect(row!.stock_code).toBe('005930');
          expect(row!.content_hash).toMatch(/^[a-f0-9]{64}$/);
          expect(row!.source).toBe('hankyung');
        });

        it('returns empty items array for empty response', () => {
          expect(NAVER_NEWS_SAMPLE_EMPTY.items).toHaveLength(0);
        });

        it.todo('budget exhausted → pipeline skips all fetches');
        it.todo('per-stock 500 error → other stocks still processed (failure isolation)');
        it.todo('401 from Naver → stopAll flag set, subsequent tasks skipped');
      });
      ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/news-sync test --run &amp;&amp; pnpm -F @gh-radar/news-sync typecheck &amp;&amp; pnpm -F @gh-radar/news-sync build</automated>
  </verify>
  <acceptance_criteria>
    - V-04: stripHtml 호출 — `grep -q "stripHtml" workers/news-sync/src/pipeline/map.ts` → 1 match
    - V-07: javascript: 프로토콜 reject — `map.test.ts` 그린 + `grep -q "javascript" workers/news-sync/tests/map.test.ts` ≥ 1 match
    - V-10: upsert `onConflict: 'stock_code,url'` + `ignoreDuplicates: true` — `grep -q "onConflict.*stock_code.*url" workers/news-sync/src/pipeline/upsert.ts` → 1 match
    - V-11: retention.test.ts 그린, `runRetention` export 존재, service_role 전제 주석 존재: `grep -q "service_role" workers/news-sync/src/retention.ts` → 1+ match
    - `grep -q "loadTargets" workers/news-sync/src/index.ts` → 1 match
    - `grep -q "pLimit" workers/news-sync/src/index.ts` → 1 match (concurrency enforced)
    - `grep -q "runRetention" workers/news-sync/src/index.ts` → 1 match
    - `grep -q "incrementUsage" workers/news-sync/src/index.ts` → 1 match (budget enforced)
    - `grep -q "stopAll" workers/news-sync/src/index.ts` → 1+ match (abort signal)
    - **R7 증분 수집 통합**: `grep -q "collectStockNews" workers/news-sync/src/index.ts` → 1+ match (페이지네이션 사용), `grep -q "loadLastSeenMap" workers/news-sync/src/index.ts` → 1+ match, `grep -q "firstCutoffIso" workers/news-sync/src/index.ts` → 1+ match (7일 컷오프 전달)
    - `workers/news-sync/src/pipeline/lastSeen.ts` 존재 + `loadLastSeenMap` export: `grep -q "export.*loadLastSeenMap" workers/news-sync/src/pipeline/lastSeen.ts` → 1 match
    - `grep -q "top_movers" workers/news-sync/src/pipeline/targets.ts` → 1 match
    - `grep -q "watchlists" workers/news-sync/src/pipeline/targets.ts` → 1 match
    - pipeline.test.ts 그린 (최소 2 concrete + 3 todo)
    - `pnpm -F @gh-radar/news-sync test --run` exit 0 with ≥ 20 total passing tests (2a 12 + 2b 8+)
    - `pnpm -F @gh-radar/news-sync build` exit 0 (dist/index.js 생성)
  </acceptance_criteria>
  <done>pipeline + retention + entry 작성 + 4 test 스펙 그린 + build 성공</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-02)

| Boundary | Description |
|----------|-------------|
| env / Secret Manager → worker process | NAVER_CLIENT_SECRET/SUPABASE_SERVICE_ROLE_KEY 가 런타임에 주입됨 |
| Naver API → worker | 외부 JSON 응답 — title/description HTML, URL 이 untrusted |
| worker → Supabase | service_role 쓰기 — 최고 권한 사용 시 RLS 우회 (retention DELETE 의 필요 조건) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Information Disclosure | Naver client secret 노출 | mitigate | Secret 은 `cfg.naverClientSecret` 필드로만 보관, logger redact paths 에 포함(`'cfg.naverClientSecret'`, `'headers["X-Naver-Client-Secret"]'`). `.env.example` 만 commit. |
| T-04 | DoS | Naver 25K/day budget | mitigate | `incr_api_usage` RPC atomic 증가 + 안전 마진 `NEWS_SYNC_DAILY_BUDGET=24500` + cycle 시작 시 pre-check + 초과 감지 시 stopAll flag. |
| T-07 | Tampering (log injection) | per-stock 에러 로그 | mitigate | pino structured logging — code 는 Zod-shaped `/^[A-Za-z0-9]{1,10}$/` (서버 route 에서 검증, 본 worker 는 master 로 로드한 값만 사용) → newline injection 불가. |
| T-08 | Tampering (SQL injection) | news_articles upsert | mitigate | Supabase JS SDK parametric — `.upsert(rows, { onConflict })` 만 사용, 문자열 concat 금지. |
| T-09 | Tampering (MITM) | Naver API 응답 | mitigate | `createNaverClient` 내부에 `if (!cfg.naverBaseUrl.startsWith('https://')) throw` — HTTP 금지. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/news-sync test --run` — 8 spec 파일 (naver/searchNews/apiUsage/logger/map/upsert/retention/pipeline) 모두 그린
- `pnpm -F @gh-radar/news-sync typecheck` → exit 0
- `pnpm -F @gh-radar/news-sync build` → `workers/news-sync/dist/index.js` 생성
- `grep -r "sanitize-html\|striptags\|dompurify\|date-fns-tz" workers/news-sync/` → 0 match (V-20 guardrail)
- `grep -q "X-Naver-Client-Secret" workers/news-sync/src/naver/client.ts` (V-08)
- `grep -q "onConflict.*stock_code.*url" workers/news-sync/src/pipeline/upsert.ts` (V-10)
- `grep -q "naverClientSecret" workers/news-sync/src/logger.ts` (V-12)
- `grep -q "incr_api_usage" workers/news-sync/src/apiUsage.ts` (V-02)
- `grep -q "SUPABASE_SERVICE_ROLE_KEY" workers/news-sync/src/services/supabase.ts` (retention RLS bypass 전제)
- `grep -q "service_role" workers/news-sync/src/retention.ts` (주석 또는 식별자)
- `grep -q "now() - interval" workers/news-sync/src/retention.ts || grep -q "86400" workers/news-sync/src/retention.ts` (V-11, retention threshold)
</verification>

<success_criteria>
- `workers/news-sync/` 전체 디렉터리 구조 완성 (RESEARCH §5.1 트리 일치)
- Dockerfile 로 Cloud Run Job 이미지 빌드 가능 (pnpm 10 + Node 22 alpine — 기존 패턴 일치)
- 모든 unit + integration test 그린 (≥ 20 tests across 8 spec files)
- `X-Naver-Client-Secret` 헤더 전송, logger redact, UPSERT ON CONFLICT DO NOTHING, retention DELETE 90d (service_role), budget atomic RPC 모두 구현
- 신규 의존성 `p-limit@^7` 외엔 추가 없음 (V-20 guardrail)
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-02-SUMMARY.md`:
- workers/news-sync/ 파일 트리 (src/, tests/)
- vitest 결과 (pass count, coverage 대략치) — Task 2a/2b 별 분리 기록
- p-limit 버전 lockfile 확인
- Dockerfile 빌드 smoke (로컬 `docker build` 성공 여부)
- 발견한 이슈 (Naver API latency, mock 한계 등)
</output>
