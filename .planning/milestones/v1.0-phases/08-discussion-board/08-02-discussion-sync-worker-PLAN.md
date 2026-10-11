---
plan: 08-02
phase: 08
type: execute
wave: 1
depends_on: [08-01]
requirements: [DISC-01]
files_modified:
  - workers/discussion-sync/src/config.ts
  - workers/discussion-sync/src/logger.ts
  - workers/discussion-sync/src/retry.ts
  - workers/discussion-sync/src/services/supabase.ts
  - workers/discussion-sync/src/proxy/client.ts
  - workers/discussion-sync/src/proxy/errors.ts
  - workers/discussion-sync/src/scraper/fetchBoard.ts
  - workers/discussion-sync/src/scraper/fetchPostBody.ts
  - workers/discussion-sync/src/scraper/parseBoardHtml.ts
  - workers/discussion-sync/src/pipeline/targets.ts
  - workers/discussion-sync/src/pipeline/map.ts
  - workers/discussion-sync/src/pipeline/upsert.ts
  - workers/discussion-sync/src/pipeline/collectDiscussions.ts
  - workers/discussion-sync/src/apiUsage.ts
  - workers/discussion-sync/src/retention.ts
  - workers/discussion-sync/src/index.ts
  - workers/discussion-sync/tests/proxy/client.test.ts
  - workers/discussion-sync/tests/scraper/parseBoardHtml.test.ts
  - workers/discussion-sync/tests/scraper/fetchBoard.test.ts
  - workers/discussion-sync/tests/pipeline/map.test.ts
  - workers/discussion-sync/tests/pipeline/upsert.test.ts
  - workers/discussion-sync/tests/pipeline/targets.test.ts
  - workers/discussion-sync/tests/apiUsage.test.ts
  - workers/discussion-sync/tests/retention.test.ts
  - workers/discussion-sync/tests/logger.test.ts
  - workers/discussion-sync/tests/pipeline.test.ts
autonomous: true
threat_refs: [T-01, T-03, T-04, T-05, T-07, T-08, T-10]

must_haves:
  truths:
    - "Cloud Run Job 으로 실행될 수 있는 discussion-sync worker 가 workers/discussion-sync/src/ 에 완성되어 있다"
    - "Worker 는 top_movers + watchlists 합집합(~200 종목) 을 대상으로 프록시 API 를 경유해 네이버 토론방 HTML 을 fetch 하고 cheerio 로 파싱한다"
    - "p-limit(8) 동시성 + per-stock try/catch 로 개별 종목 실패가 cycle 전체를 중단시키지 않는다 (failure isolation)"
    - "프록시 예산 (DISCUSSION_SYNC_DAILY_BUDGET) 을 atomic RPC incr_api_usage('proxy_naver_discussion', ...) 로 체크해 초과 전 abort 한다"
    - "discussions 테이블에 UPSERT ON CONFLICT(stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at 로 TTL 정확도 보장 (RESEARCH §UPSERT 전략 — DO UPDATE 채택)"
    - "POC §4 에서 채택된 body fetch 경로(권장: 옵션 2, 상위 5건 별도 fetch)가 구현되어 있다 — plaintext body 저장"
    - "90일 초과 행 DELETE retention 이 service_role 로 cycle 종료 시점에 실행된다"
    - "logger 가 proxyApiKey / SUPABASE_SERVICE_ROLE_KEY 를 redact 한다 (T-03)"
    - "스팸 필터 D11(제목 <5자 OR URL 포함)이 map 단계에서 적용된다 — 원본은 저장, UI 에서는 server 가 필터"
  artifacts:
    - path: "workers/discussion-sync/src/index.ts"
      provides: "CLI 엔트리 — cycle 전체 실행"
      min_lines: 60
    - path: "workers/discussion-sync/src/proxy/client.ts"
      provides: "axios 기반 프록시 클라이언트 + baseURL https 강제"
      contains: "startsWith('https://')"
    - path: "workers/discussion-sync/src/scraper/parseBoardHtml.ts"
      provides: "cheerio 기반 목록 페이지 파서 (POC §3 selector 1:1 반영)"
      contains: "table.type2"
    - path: "workers/discussion-sync/src/pipeline/upsert.ts"
      provides: "discussions UPSERT (DO UPDATE SET scraped_at)"
      contains: "onConflict"
    - path: "workers/discussion-sync/src/apiUsage.ts"
      provides: "proxy_naver_discussion 예산 카운터"
      exports: ["checkBudget", "incrementUsage"]
  key_links:
    - from: "workers/discussion-sync/src/proxy/client.ts"
      to: "GCP Secret Manager → PROXY_API_KEY"
      via: "process.env.PROXY_API_KEY"
      pattern: "PROXY_API_KEY"
    - from: "workers/discussion-sync/src/apiUsage.ts"
      to: "api_usage table (Supabase) — Phase 7 생성분"
      via: "incr_api_usage RPC (service='proxy_naver_discussion')"
      pattern: "proxy_naver_discussion"
    - from: "workers/discussion-sync/src/pipeline/targets.ts"
      to: "top_movers ∪ watchlists"
      via: "dedupe union — Phase 7 복제"
      pattern: "from\\('top_movers'\\)"
    - from: "workers/discussion-sync/src/pipeline/upsert.ts"
      to: "discussions 테이블"
      via: "UPSERT onConflict=stock_code,post_id, ignoreDuplicates=false"
      pattern: "onConflict.*post_id"
---

> **POC pivot:** 본 plan 은 `08-POC-PIVOT.md` 의 "Plan 08-02 델타" 섹션과 함께 읽어야 합니다. Plan 08-00 POC 결과로 fetcher 가 Naver HTML + cheerio + iframe body fetch 에서 → Bright Data 경유 stock.naver.com community **JSON API** 단일 호출로 전환되었습니다. 파일명 변경 (`fetchBoard.ts` → `fetchDiscussions.ts`, `parseBoardHtml.ts` → `parseDiscussionsJson.ts`, `fetchPostBody.ts` 삭제), deps 변경 (cheerio/iconv-lite 제거), 환경변수 변경 (`PROXY_API_KEY` → `BRIGHTDATA_API_KEY` + `BRIGHTDATA_ZONE`) — 모두 PIVOT 문서 우선.

<objective>
Plan 08-01 이 만든 스캐폴드 위에 Cloud Run Job 으로 실행되는 `workers/discussion-sync` 워커를 구현한다. Phase 7 news-sync 의 pipeline 구조를 90% 복제하되, fetcher 를 (Naver Search JSON API → 프록시 경유 HTML fetch + cheerio 파싱) 으로 교체하고, body fetch 경로(옵션 2 권장)와 스팸 필터 D11 을 추가한다. UPSERT 전략은 RESEARCH §UPSERT 전략에 따라 `DO UPDATE SET scraped_at = EXCLUDED.scraped_at` 채택.

Purpose: CONTEXT D1 의 1시간 배치 수집 경로. Scheduler 가 Plan 08-06 에서 `0 * * * *` (KST) 로 이 Job 을 트리거. 이 plan 이 완료되면 `discussions` 테이블에 실제 데이터가 주기적으로 쌓이기 시작한다.
Output: Cloud Run Job 으로 배포 가능한 image, 모든 unit/integration 테스트 그린 (≥25), 90일 retention 포함, 예산 카운터 atomic.
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
@.planning/phases/08-discussion-board/POC-RESULTS.md

@workers/news-sync/src/config.ts
@workers/news-sync/src/logger.ts
@workers/news-sync/src/retry.ts
@workers/news-sync/src/services/supabase.ts
@workers/news-sync/src/apiUsage.ts
@workers/news-sync/src/retention.ts
@workers/news-sync/src/index.ts
@workers/news-sync/src/pipeline/targets.ts
@workers/news-sync/src/pipeline/upsert.ts
@workers/news-sync/src/pipeline/map.ts
@workers/news-sync/src/naver/client.ts

@workers/discussion-sync/package.json
@workers/discussion-sync/tsconfig.json
@workers/discussion-sync/Dockerfile
@workers/discussion-sync/tests/helpers/supabase-mock.ts
@workers/discussion-sync/tests/helpers/naver-board-fixtures.ts

@packages/shared/src/discussion.ts
@packages/shared/src/discussion-sanitize.ts
@supabase/migrations/20260413120000_init_tables.sql
@supabase/migrations/20260413120100_rls_policies.sql
@supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql
@supabase/migrations/20260417120000_api_usage.sql

<interfaces>
## Plan 08-01 산출물 (본 plan 이 import)

```ts
// packages/shared/src/discussion-sanitize.ts
export function stripHtmlToPlaintext(input: string): string;
export function extractNid(hrefOrUrl: string): string | null;
export function parseNaverBoardDate(raw: string): string | null;
```
```ts
// packages/shared/src/discussion.ts
export type Discussion = { id; stockCode; postId; title; body; author; postedAt; scrapedAt; url };
```

## Supabase 스키마 (변경 없음)

```sql
CREATE TABLE discussions (
  id uuid PK,
  stock_code text FK→stocks,
  post_id text NOT NULL,
  title text NOT NULL,
  body text,
  author text,
  posted_at timestamptz NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, post_id)
);
CREATE INDEX idx_discussions_stock_posted ON discussions (stock_code, posted_at DESC);

-- RLS (기존 applied)
CREATE POLICY anon_read_discussions ON discussions FOR SELECT TO anon USING (true);
-- INSERT/UPDATE/DELETE 정책 없음 → service_role 만 쓰기 (RLS bypass)

-- api_usage (Phase 7 applied)
-- incr_api_usage(p_service text, p_date date, p_amount int) RETURNS bigint;
-- 본 worker 는 p_service = 'proxy_naver_discussion' 로 호출
```

## 프록시 API 요청 계약 (POC §1 선정 서비스 기준)

**ScraperAPI (default — POC §1 에서 확정):**
```
GET https://api.scraperapi.com/?api_key={KEY}&url={ENCODED_TARGET}&country_code=kr
```
- target = `https://finance.naver.com/item/board.naver?code={CODE}` (목록) 또는 `https://finance.naver.com/item/board_read.naver?code={CODE}&nid={NID}` (상세, 옵션 2)
- response: HTML string (UTF-8 decoded by proxy — POC §2 에서 확인)

**Bright Data 선정 시:** Plan 08-00 POC 에서 변경된 endpoint/auth 을 POC-RESULTS.md 에 기록 → 본 plan 의 client.ts 가 그 endpoint 기준.

## 네이버 토론방 DOM (POC §3 확정)

- 목록 행: `table.type2 tbody tr`
- 제목 링크: `td.title > a` → href + text
- 날짜: `td:nth-child(1)` → `YYYY.MM.DD HH:mm`
- 작성자: `td:nth-child(3)`
- nid: href 의 `?nid=\d+` (packages/shared::extractNid)

## 환경 변수 (deploy 에서 주입)

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...                # Secret Manager
PROXY_PROVIDER=scraperapi                    # 또는 brightdata
PROXY_BASE_URL=https://api.scraperapi.com    # POC §1 선정
PROXY_API_KEY=...                            # Secret Manager
DISCUSSION_SYNC_DAILY_BUDGET=5000            # 4,800 실사용 + 여유 200
DISCUSSION_SYNC_CONCURRENCY=8                # p-limit
DISCUSSION_SYNC_BODY_FETCH=true              # 옵션 2 채택 시
DISCUSSION_SYNC_BODY_TOP_N=5                 # 상위 5건 상세 fetch
LOG_LEVEL=info
APP_VERSION=${SHA}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 기반 레이어 — config / logger / retry / supabase / proxy client + 4 unit tests</name>
  <files>
    workers/discussion-sync/src/config.ts,
    workers/discussion-sync/src/logger.ts,
    workers/discussion-sync/src/retry.ts,
    workers/discussion-sync/src/services/supabase.ts,
    workers/discussion-sync/src/proxy/client.ts,
    workers/discussion-sync/src/proxy/errors.ts,
    workers/discussion-sync/tests/proxy/client.test.ts,
    workers/discussion-sync/tests/logger.test.ts
  </files>
  <read_first>
    - workers/news-sync/src/config.ts (env 스키마 패턴)
    - workers/news-sync/src/logger.ts (redact paths 패턴 — 치환 대상)
    - workers/news-sync/src/retry.ts (1:1 복제)
    - workers/news-sync/src/services/supabase.ts (service_role client 생성)
    - workers/news-sync/src/naver/client.ts (axios create 패턴 + baseURL https 검증)
    - workers/news-sync/src/naver/searchNews.ts (에러 클래스 패턴)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Code Examples" (프록시 client)
    - .planning/phases/08-discussion-board/POC-RESULTS.md §1 (프록시 endpoint 확정)
  </read_first>
  <behavior>
    config.ts:
      - `loadConfig()` 가 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROXY_PROVIDER, PROXY_BASE_URL, PROXY_API_KEY (필수) + DISCUSSION_SYNC_DAILY_BUDGET, DISCUSSION_SYNC_CONCURRENCY, DISCUSSION_SYNC_BODY_FETCH, DISCUSSION_SYNC_BODY_TOP_N, LOG_LEVEL, APP_VERSION (optional) 을 읽음
      - 필수 env 누락 시 throw
      - default: DISCUSSION_SYNC_DAILY_BUDGET=5000 / CONCURRENCY=8 / BODY_FETCH=true / BODY_TOP_N=5

    logger.ts:
      - pino with redact paths: 'cfg.proxyApiKey', 'cfg.supabaseServiceRoleKey', 'headers["X-Proxy-Auth"]', '*.PROXY_API_KEY', '*.SUPABASE_SERVICE_ROLE_KEY'
      - censor: '[Redacted]'
      - logger.info({ cfg: { proxyApiKey: 'PKEY123' } }) → output 에 'PKEY123' 없고 '[Redacted]' 존재

    retry.ts: news-sync 와 동일 1:1 복제 (exponential backoff + maxRetries 옵션).

    services/supabase.ts:
      - createSupabaseClient(url, serviceRoleKey) → `createClient(url, serviceRoleKey, { auth: { persistSession: false } })`
      - **retention DELETE 가 RLS bypass 하려면 service_role 필수** (anon 정책은 SELECT 만)

    proxy/errors.ts:
      - `class ProxyAuthError` (401, PROXY_API_KEY invalid)
      - `class ProxyBudgetExhaustedError` (프록시 서비스 월 credit 소진)
      - `class ProxyBadRequestError` (400/403)
      - `class ProxyBlockedError` (HTTP 200 이지만 response HTML 에 "차단" / "access denied" 키워드 — POC §5 관측)
      - `class NaverRateLimitError` (504 / upstream timeout — retryable)

    proxy/client.ts:
      - `createProxyClient(cfg)` → axios 인스턴스. baseURL https 강제 (T-09), timeout 30000ms (프록시 latency 고려), User-Agent 명시
      - `fetchNaverUrl(client, cfg, targetUrl)` → ScraperAPI 스타일: `GET /?api_key=&url=&country_code=kr` . Bright Data 선정 시 client.test.ts 의 기대값 수정. POC §1 결과에 따라 선택.
      - HTTP 401 → ProxyAuthError throw
      - HTTP 402 (quota) → ProxyBudgetExhaustedError throw
      - HTTP 429 / 504 / 네트워크 timeout → 1회 retry after 2s (RESEARCH Pitfall 5 — 보수적 재시도)
      - HTTP 400 / 403 → ProxyBadRequestError throw
      - 정상 200 HTML string 반환
      - **주의 (T-04 log injection):** response body 를 logger 에 절대 흘리지 않음. 에러 시 `error.message` + HTTP status code + byte length 만 로그.

    tests/proxy/client.test.ts:
      - `createProxyClient` 가 `startsWith('https://')` 체크로 http:// baseURL throw
      - axios mock 으로 401 → ProxyAuthError
      - 402 → ProxyBudgetExhaustedError
      - 400/403 → ProxyBadRequestError
      - 200 → string 반환
      - ScraperAPI 호출 포맷 검증: `params.api_key === cfg.proxyApiKey`, `params.url === target`, `params.country_code === 'kr'`

    tests/logger.test.ts:
      - logger.info({ cfg: { proxyApiKey: 'PKEY123' } }) → JSON.stringify 결과에 'PKEY123' 없음, '[Redacted]' 포함
      - logger.info({ cfg: { supabaseServiceRoleKey: 'SRKEY' } }) → 'SRKEY' 없음
  </behavior>
  <action>
    **`workers/discussion-sync/src/config.ts`:**
    ```ts
    import 'dotenv/config';

    export interface DiscussionSyncConfig {
      supabaseUrl: string;
      supabaseServiceRoleKey: string;
      proxyProvider: 'scraperapi' | 'brightdata' | 'oxylabs';
      proxyBaseUrl: string;
      proxyApiKey: string;
      discussionSyncDailyBudget: number;
      discussionSyncConcurrency: number;
      discussionSyncBodyFetch: boolean;
      discussionSyncBodyTopN: number;
      appVersion: string;
      logLevel: string;
    }

    function req(key: string): string {
      const v = process.env[key];
      if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
      return v;
    }

    export function loadConfig(): DiscussionSyncConfig {
      const provider = (process.env.PROXY_PROVIDER ?? 'scraperapi') as DiscussionSyncConfig['proxyProvider'];
      return {
        supabaseUrl: req('SUPABASE_URL'),
        supabaseServiceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
        proxyProvider: provider,
        proxyBaseUrl: req('PROXY_BASE_URL'),
        proxyApiKey: req('PROXY_API_KEY'),
        discussionSyncDailyBudget: Number(process.env.DISCUSSION_SYNC_DAILY_BUDGET ?? '5000'),
        discussionSyncConcurrency: Number(process.env.DISCUSSION_SYNC_CONCURRENCY ?? '8'),
        discussionSyncBodyFetch: (process.env.DISCUSSION_SYNC_BODY_FETCH ?? 'true') === 'true',
        discussionSyncBodyTopN: Number(process.env.DISCUSSION_SYNC_BODY_TOP_N ?? '5'),
        appVersion: process.env.APP_VERSION ?? 'dev',
        logLevel: process.env.LOG_LEVEL ?? 'info',
      };
    }
    ```

    **`workers/discussion-sync/src/logger.ts`:**
    ```ts
    import pino from 'pino';

    export function createLogger(level = 'info') {
      return pino({
        level,
        redact: {
          paths: [
            'cfg.proxyApiKey',
            'cfg.supabaseServiceRoleKey',
            'headers["X-Proxy-Auth"]',
            'headers.authorization',
            'params.api_key',
            '*.PROXY_API_KEY',
            '*.SUPABASE_SERVICE_ROLE_KEY',
          ],
          censor: '[Redacted]',
        },
      });
    }
    ```

    **`workers/discussion-sync/src/retry.ts`** — `workers/news-sync/src/retry.ts` 1:1 복사.

    **`workers/discussion-sync/src/services/supabase.ts`** — `workers/news-sync/src/services/supabase.ts` 1:1 복사 (service_role client 패턴 동일).

    **`workers/discussion-sync/src/proxy/errors.ts`:**
    ```ts
    export class ProxyAuthError extends Error { constructor() { super('proxy auth failed (401)'); this.name = 'ProxyAuthError'; } }
    export class ProxyBudgetExhaustedError extends Error { constructor() { super('proxy quota exhausted (402)'); this.name = 'ProxyBudgetExhaustedError'; } }
    export class ProxyBadRequestError extends Error { constructor(msg: string) { super(msg); this.name = 'ProxyBadRequestError'; } }
    export class ProxyBlockedError extends Error { constructor(msg = 'naver blocked') { super(msg); this.name = 'ProxyBlockedError'; } }
    export class NaverRateLimitError extends Error { constructor() { super('naver/upstream rate limited'); this.name = 'NaverRateLimitError'; } }
    ```

    **`workers/discussion-sync/src/proxy/client.ts` (ScraperAPI 기본, POC 에서 확정):**
    ```ts
    import axios, { type AxiosInstance } from 'axios';
    import type { DiscussionSyncConfig } from '../config.js';
    import { ProxyAuthError, ProxyBudgetExhaustedError, ProxyBadRequestError, NaverRateLimitError } from './errors.js';

    export function createProxyClient(cfg: DiscussionSyncConfig): AxiosInstance {
      if (!cfg.proxyBaseUrl.startsWith('https://')) {
        throw new Error(`PROXY_BASE_URL must be https (got: ${cfg.proxyBaseUrl})`);
      }
      return axios.create({
        baseURL: cfg.proxyBaseUrl,
        timeout: 30000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': `gh-radar-discussion-sync/${cfg.appVersion}`,
        },
      });
    }

    /**
     * 프록시 경유로 네이버 URL fetch. ScraperAPI 기본 — provider 별 분기.
     * @returns HTML string (UTF-8 decoded by proxy).
     */
    export async function fetchNaverUrl(
      client: AxiosInstance,
      cfg: DiscussionSyncConfig,
      targetUrl: string,
    ): Promise<string> {
      const doFetch = async (): Promise<string> => {
        if (cfg.proxyProvider === 'scraperapi') {
          const res = await client.get<string>('/', {
            params: {
              api_key: cfg.proxyApiKey,
              url: targetUrl,
              country_code: 'kr',
            },
            responseType: 'text',
          });
          return res.data;
        }
        // Bright Data / Oxylabs 분기 — POC §1 결과에 따라 구현 (placeholder)
        throw new Error(`unsupported proxy provider: ${cfg.proxyProvider}`);
      };

      try {
        return await doFetch();
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) throw new ProxyAuthError();
        if (status === 402) throw new ProxyBudgetExhaustedError();
        if (status === 400 || status === 403) throw new ProxyBadRequestError(`proxy bad request: ${status}`);
        if (status === 429 || status === 504 || status === undefined) {
          // 보수적 재시도 1회 (RESEARCH Pitfall 5)
          await new Promise((r) => setTimeout(r, 2000));
          try { return await doFetch(); }
          catch { throw new NaverRateLimitError(); }
        }
        throw err;
      }
    }
    ```

    **`workers/discussion-sync/tests/proxy/client.test.ts`:**
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import axios from 'axios';
    import { createProxyClient, fetchNaverUrl } from '../../src/proxy/client.js';
    import { ProxyAuthError, ProxyBudgetExhaustedError, ProxyBadRequestError, NaverRateLimitError } from '../../src/proxy/errors.js';
    import type { DiscussionSyncConfig } from '../../src/config.js';

    const BASE_CFG: DiscussionSyncConfig = {
      supabaseUrl: 'https://x.supabase.co',
      supabaseServiceRoleKey: 'sk',
      proxyProvider: 'scraperapi',
      proxyBaseUrl: 'https://api.scraperapi.com',
      proxyApiKey: 'PKEY',
      discussionSyncDailyBudget: 5000,
      discussionSyncConcurrency: 8,
      discussionSyncBodyFetch: true,
      discussionSyncBodyTopN: 5,
      appVersion: 'test',
      logLevel: 'info',
    };

    describe('createProxyClient', () => {
      it('throws when baseURL is not https', () => {
        expect(() => createProxyClient({ ...BASE_CFG, proxyBaseUrl: 'http://x' })).toThrow(/must be https/);
      });
      it('accepts https baseURL', () => {
        const c = createProxyClient(BASE_CFG);
        expect(c.defaults.baseURL).toBe('https://api.scraperapi.com');
        expect(c.defaults.timeout).toBe(30000);
      });
    });

    describe('fetchNaverUrl (ScraperAPI)', () => {
      it('sends api_key + url + country_code params', async () => {
        const get = vi.fn().mockResolvedValue({ data: '<html>ok</html>' });
        const client = { get } as any;
        const html = await fetchNaverUrl(client, BASE_CFG, 'https://finance.naver.com/item/board.naver?code=005930');
        expect(html).toBe('<html>ok</html>');
        expect(get).toHaveBeenCalledWith('/', expect.objectContaining({
          params: expect.objectContaining({
            api_key: 'PKEY',
            url: 'https://finance.naver.com/item/board.naver?code=005930',
            country_code: 'kr',
          }),
        }));
      });

      it('maps 401 → ProxyAuthError', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 401 } });
        const client = { get: vi.fn().mockRejectedValue(err) } as any;
        await expect(fetchNaverUrl(client, BASE_CFG, 'https://x')).rejects.toBeInstanceOf(ProxyAuthError);
      });

      it('maps 402 → ProxyBudgetExhaustedError', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 402 } });
        const client = { get: vi.fn().mockRejectedValue(err) } as any;
        await expect(fetchNaverUrl(client, BASE_CFG, 'https://x')).rejects.toBeInstanceOf(ProxyBudgetExhaustedError);
      });

      it('maps 400 → ProxyBadRequestError', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 400 } });
        const client = { get: vi.fn().mockRejectedValue(err) } as any;
        await expect(fetchNaverUrl(client, BASE_CFG, 'https://x')).rejects.toBeInstanceOf(ProxyBadRequestError);
      });

      it('retries 429 once then NaverRateLimitError', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 429 } });
        const get = vi.fn().mockRejectedValue(err);
        const client = { get } as any;
        await expect(fetchNaverUrl(client, BASE_CFG, 'https://x')).rejects.toBeInstanceOf(NaverRateLimitError);
        expect(get).toHaveBeenCalledTimes(2);
      });
    });
    ```

    **`workers/discussion-sync/tests/logger.test.ts`:**
    ```ts
    import { describe, it, expect } from 'vitest';
    import { createLogger } from '../src/logger.js';
    import { PassThrough } from 'node:stream';

    function captureOutput(fn: (logger: ReturnType<typeof createLogger>) => void): string {
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(c));
      const pino = require('pino') as typeof import('pino');
      const logger = pino({
        redact: {
          paths: [
            'cfg.proxyApiKey',
            'cfg.supabaseServiceRoleKey',
            '*.PROXY_API_KEY',
            '*.SUPABASE_SERVICE_ROLE_KEY',
          ],
          censor: '[Redacted]',
        },
      }, stream);
      fn(logger as any);
      return Buffer.concat(chunks).toString();
    }

    describe('logger redact', () => {
      it('redacts cfg.proxyApiKey', () => {
        const out = captureOutput((l) => l.info({ cfg: { proxyApiKey: 'PKEY123' } }, 'boot'));
        expect(out).not.toContain('PKEY123');
        expect(out).toContain('[Redacted]');
      });
      it('redacts supabase service role key', () => {
        const out = captureOutput((l) => l.info({ cfg: { supabaseServiceRoleKey: 'SRKEY' } }, 'boot'));
        expect(out).not.toContain('SRKEY');
      });
      it('redacts nested env PROXY_API_KEY', () => {
        const out = captureOutput((l) => l.info({ env: { PROXY_API_KEY: 'ENVKEY' } }, 'env'));
        expect(out).not.toContain('ENVKEY');
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/discussion-sync test --run -- client.test.ts logger.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 8개 파일 생성
    - `grep -q "startsWith('https://')" workers/discussion-sync/src/proxy/client.ts` (T-09 HTTPS 강제)
    - `grep -q "proxyApiKey" workers/discussion-sync/src/logger.ts` (T-03 redact)
    - `grep -q "SUPABASE_SERVICE_ROLE_KEY" workers/discussion-sync/src/services/supabase.ts` (retention 전제)
    - `grep -qE "proxyProvider.*'scraperapi'" workers/discussion-sync/src/proxy/client.ts` (provider 분기 엔트리)
    - `grep -q "country_code" workers/discussion-sync/src/proxy/client.ts` (한국 IP 요청)
    - client.test.ts + logger.test.ts 그린 (≥9 case + ≥3 case)
    - `pnpm -F @gh-radar/discussion-sync typecheck` exit 0
  </acceptance_criteria>
  <done>기반 레이어 6 src + 2 test 모두 그린 + typecheck 통과</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scraper + pipeline (fetchBoard/parseBoardHtml/fetchPostBody/map/upsert/targets/apiUsage/retention) + 6 unit tests</name>
  <files>
    workers/discussion-sync/src/scraper/fetchBoard.ts,
    workers/discussion-sync/src/scraper/fetchPostBody.ts,
    workers/discussion-sync/src/scraper/parseBoardHtml.ts,
    workers/discussion-sync/src/pipeline/targets.ts,
    workers/discussion-sync/src/pipeline/map.ts,
    workers/discussion-sync/src/pipeline/upsert.ts,
    workers/discussion-sync/src/pipeline/collectDiscussions.ts,
    workers/discussion-sync/src/apiUsage.ts,
    workers/discussion-sync/src/retention.ts,
    workers/discussion-sync/tests/scraper/parseBoardHtml.test.ts,
    workers/discussion-sync/tests/scraper/fetchBoard.test.ts,
    workers/discussion-sync/tests/pipeline/map.test.ts,
    workers/discussion-sync/tests/pipeline/upsert.test.ts,
    workers/discussion-sync/tests/pipeline/targets.test.ts,
    workers/discussion-sync/tests/apiUsage.test.ts,
    workers/discussion-sync/tests/retention.test.ts
  </files>
  <read_first>
    - workers/news-sync/src/pipeline/targets.ts (top_movers ∪ watchlists — 1:1 복제)
    - workers/news-sync/src/pipeline/map.ts (sanitize + URL whitelist 패턴)
    - workers/news-sync/src/pipeline/upsert.ts (Supabase upsert 패턴 — onConflict 옵션)
    - workers/news-sync/src/apiUsage.ts (kstDateString + incr_api_usage RPC — service 이름만 치환)
    - workers/news-sync/src/retention.ts (90일 DELETE 패턴)
    - workers/discussion-sync/src/config.ts (Task 1 산출물)
    - workers/discussion-sync/src/proxy/client.ts (Task 1 산출물 — fetchNaverUrl)
    - workers/discussion-sync/tests/helpers/supabase-mock.ts (Plan 08-01 산출물)
    - workers/discussion-sync/tests/helpers/naver-board-fixtures.ts (Plan 08-00 산출물 — 실제 HTML 캡처)
    - packages/shared/src/discussion-sanitize.ts (Plan 08-01 산출물 — stripHtmlToPlaintext / extractNid / parseNaverBoardDate)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Code Examples" parseBoardHtml 스니펫
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"UPSERT 전략 비교"
    - .planning/phases/08-discussion-board/POC-RESULTS.md §3 (확정 selector), §4 (body 경로)
  </read_first>
  <behavior>
    scraper/parseBoardHtml.ts:
      - `parseBoardHtml(html): RawDiscussionItem[]` — cheerio.load + `$('table.type2 tbody tr').each(...)`
      - 각 행에서: `td.title > a` href → extractNid(from @gh-radar/shared), text → title, `td:nth-child(1)` → postedRaw, `td:nth-child(3)` → author
      - `RawDiscussionItem = { postId, title, author, postedRaw, url }`
      - nid 없는 행 skip
      - title 빈 행 skip
      - url 조합: `https://finance.naver.com{href}` (href 가 `/` 로 시작하면 그대로, 아니면 `/item/${href}` 결합)
      - **POC-RESULTS.md §3 fallback selector 2~3종을 주석으로 언급** (DOM 변경 대비)

    scraper/fetchBoard.ts:
      - `fetchBoard(client, cfg, stockCode): Promise<string>` — target=`https://finance.naver.com/item/board.naver?code=${code}` → fetchNaverUrl 호출
      - ProxyBlockedError 감지: response HTML length < 1000 bytes 또는 "차단" 키워드 포함 → ProxyBlockedError throw

    scraper/fetchPostBody.ts (옵션 2 채택 시):
      - `fetchPostBody(client, cfg, stockCode, postId): Promise<string | null>` — target=`https://finance.naver.com/item/board_read.naver?code=${code}&nid=${nid}`
      - HTML fetch → cheerio.load → `#body` 또는 `td.view` (POC §4 확정 selector) → text 추출 → stripHtmlToPlaintext 적용
      - 실패 시 null 반환 (body preview 만 miss, 전체 item drop 안 함)

    pipeline/targets.ts: news-sync 버전 1:1 복제 — top_movers 최신 scan_id ∪ watchlists.stock_code, stocks 마스터 존재 검증.

    pipeline/map.ts:
      - `mapToDiscussionRow(stockCode, item, bodyPlaintext): DiscussionRow | null`
      - title: stripHtmlToPlaintext(item.title) — 빈 문자열이면 null 반환
      - **스팸 필터 D11**: title.length < 5 **OR** title.includes('http://') / title.includes('https://') → null 반환 (DB 에 저장은 하되 UI 미노출 — 단 여기서는 **저장 자체를 skip** 여부 재결정: CONTEXT D11 은 "원본은 DB에 저장하되 UI 노출에서만 제외" 라고 명시. 따라서 **map 에서는 skip 하지 않고**, 서버 쿼리 WHERE 절에서 필터. 본 task 는 map 단계 skip 금지. 서버 필터 책임은 Plan 08-03.)
      - body: bodyPlaintext (null 허용)
      - author: item.author.trim() — 빈 문자열이면 null
      - posted_at: parseNaverBoardDate(item.postedRaw) — null 이면 row 전체 null 반환 (timestamp 필수)
      - url: https:// 로 시작하는 네이버 host 만 허용 (allowedHosts: `finance.naver.com`, `m.finance.naver.com` — T-07 open redirect 방어)
      - return `{ stock_code, post_id, title, body, author, posted_at, url, scraped_at: new Date().toISOString() }`

    pipeline/upsert.ts:
      - `upsertDiscussions(supabase, rows): Promise<{ upserted: number }>`
      - `supabase.from('discussions').upsert(rows, { onConflict: 'stock_code,post_id', ignoreDuplicates: false }).select('id')`
      - **`ignoreDuplicates: false`** ← RESEARCH §UPSERT 전략 DO UPDATE SET scraped_at 채택. SDK 는 모든 컬럼 UPDATE 하지만 scraped_at + body 는 실제 변경 가능 (네이버 edit 가능) → no-op 또는 정상 update.
      - 빈 rows → 0 리턴

    pipeline/collectDiscussions.ts:
      - `collectDiscussions(client, cfg, stockCode, bodyFetch: boolean, topN: number, onRequest: () => Promise<boolean>): Promise<{ items: MappedRow[]; bodyFetched: number }>`
      - 1. onRequest() → false 면 return 빈 결과
      - 2. html = fetchBoard(client, cfg, stockCode) — 1 proxy request
      - 3. raws = parseBoardHtml(html) — 10~20 items
      - 4. 24시간 컷오프 필터: parseNaverBoardDate(r.postedRaw) >= 24h 이전 → filter 제외
      - 5. 최신순 정렬 (postedRaw desc)
      - 6. bodyFetch=true 이면 상위 topN 에 대해 onRequest() + fetchPostBody(... postId) → bodyText 주입
      - 7. mapToDiscussionRow 적용 → null 제외

    apiUsage.ts:
      - `incrementUsage` 는 `rpc('incr_api_usage', { p_service: 'proxy_naver_discussion', p_date, p_amount })` 호출 — Phase 7 api_usage 재사용
      - `checkBudget(supabase, dateKst)` 은 `.eq('service', 'proxy_naver_discussion')`
      - kstDateString 은 news-sync 와 동일

    retention.ts:
      - `runRetention(supabase, days = 90)` — `discussions` 테이블 DELETE WHERE scraped_at < now - days
      - **주의:** Phase 7 news-sync 는 `created_at` 기준이었으나 discussions 테이블은 `created_at` 컬럼 없음 (스키마 20260413120000 line 58-71 확인). `scraped_at` 기준으로 변경. 90일 = 반년 단타 트레이딩 관련성 고려 충분.

    테스트:
    - parseBoardHtml.test.ts: fixture(NAVER_BOARD_HTML_SAMPLE_ACTIVE) → ≥10 items 파싱. 빈 HTML → 0. `nid` 없는 행 skip. title 공백 행 skip.
    - fetchBoard.test.ts: fetchNaverUrl mock 성공/실패 → fetchBoard 가 HTML 반환 / ProxyBlockedError throw.
    - map.test.ts: 정상/URL whitelist/invalid date/스팸 필터 **미적용** 확인(D11 은 서버 책임) / body null 허용 / posted_at null → row null.
    - upsert.test.ts: onConflict='stock_code,post_id' + ignoreDuplicates=false 옵션 전달 검증.
    - targets.test.ts: top_movers + watchlists dedupe (Phase 7 news-sync 복사).
    - apiUsage.test.ts: service='proxy_naver_discussion' 으로 rpc 호출.
    - retention.test.ts: DELETE WHERE scraped_at < threshold, service_role 주석 확인.
  </behavior>
  <action>
    **`workers/discussion-sync/src/scraper/parseBoardHtml.ts`:**
    ```ts
    import * as cheerio from 'cheerio';
    import { extractNid } from '@gh-radar/shared';

    export interface RawDiscussionItem {
      postId: string;
      title: string;
      author: string;
      postedRaw: string;
      url: string;
    }

    // POC-RESULTS.md §3 확정 selector.
    // DOM 변경 대비 fallback: `.board-list tr` / `a[href*="board_read.naver"]`
    const BASE_URL = 'https://finance.naver.com';

    export function parseBoardHtml(html: string): RawDiscussionItem[] {
      const $ = cheerio.load(html);
      const items: RawDiscussionItem[] = [];

      $('table.type2 tbody tr').each((_, el) => {
        const $row = $(el);
        const $titleLink = $row.find('td.title > a');
        const href = $titleLink.attr('href');
        if (!href) return;

        const postId = extractNid(href);
        if (!postId) return;

        const title = $titleLink.text().trim();
        if (!title) return;

        const author = $row.find('td:nth-child(3)').text().trim();
        const postedRaw = $row.find('td:nth-child(1)').text().trim();

        // href 상대경로 정규화
        const url = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? href : `/item/${href}`}`;

        items.push({ postId, title, author, postedRaw, url });
      });

      return items;
    }
    ```

    **`workers/discussion-sync/src/scraper/fetchBoard.ts`:**
    ```ts
    import type { AxiosInstance } from 'axios';
    import type { DiscussionSyncConfig } from '../config.js';
    import { fetchNaverUrl } from '../proxy/client.js';
    import { ProxyBlockedError } from '../proxy/errors.js';

    const BOARD_URL = (code: string) => `https://finance.naver.com/item/board.naver?code=${encodeURIComponent(code)}`;

    export async function fetchBoard(
      client: AxiosInstance,
      cfg: DiscussionSyncConfig,
      stockCode: string,
    ): Promise<string> {
      const html = await fetchNaverUrl(client, cfg, BOARD_URL(stockCode));
      // 차단 감지 — 응답이 너무 짧거나 차단 키워드 포함
      if (html.length < 500) throw new ProxyBlockedError(`response too short (${html.length} bytes)`);
      if (/접근이 차단|access denied|blocked/i.test(html.slice(0, 2000))) {
        throw new ProxyBlockedError('block keyword detected');
      }
      return html;
    }
    ```

    **`workers/discussion-sync/src/scraper/fetchPostBody.ts`:**
    ```ts
    import * as cheerio from 'cheerio';
    import sanitizeHtml from 'sanitize-html';
    import type { AxiosInstance } from 'axios';
    import type { DiscussionSyncConfig } from '../config.js';
    import { fetchNaverUrl } from '../proxy/client.js';

    const POST_URL = (code: string, nid: string) =>
      `https://finance.naver.com/item/board_read.naver?code=${encodeURIComponent(code)}&nid=${encodeURIComponent(nid)}`;

    // 네이버 게시글 본문 selector — POC §4 확정 selector.
    // fallback 우선순위: #body → td.view → .view_se
    const BODY_SELECTORS = ['#body', 'td.view', '.view_se'];

    export async function fetchPostBody(
      client: AxiosInstance,
      cfg: DiscussionSyncConfig,
      stockCode: string,
      postId: string,
    ): Promise<string | null> {
      try {
        const html = await fetchNaverUrl(client, cfg, POST_URL(stockCode, postId));
        const $ = cheerio.load(html);
        let raw = '';
        for (const sel of BODY_SELECTORS) {
          const node = $(sel).first();
          if (node.length > 0) { raw = node.html() ?? ''; break; }
        }
        if (!raw) return null;
        // 1차: sanitize-html 로 plaintext 화 (태그 모두 제거)
        const plain = sanitizeHtml(raw, {
          allowedTags: [],
          allowedAttributes: {},
          disallowedTagsMode: 'discard',
          textFilter: (text) => text.replace(/\s+/g, ' ').trim(),
        }).trim();
        return plain || null;
      } catch {
        return null;
      }
    }
    ```

    **`workers/discussion-sync/src/pipeline/targets.ts`** — `workers/news-sync/src/pipeline/targets.ts` 1:1 복사 (`NewsTarget` → `DiscussionTarget` rename). 구조는 완전히 동일.

    **`workers/discussion-sync/src/pipeline/map.ts`:**
    ```ts
    import { stripHtmlToPlaintext, parseNaverBoardDate } from '@gh-radar/shared';
    import type { RawDiscussionItem } from '../scraper/parseBoardHtml.js';

    export interface DiscussionRow {
      stock_code: string;
      post_id: string;
      title: string;
      body: string | null;
      author: string | null;
      posted_at: string;
      url: string;
      scraped_at: string;
    }

    const ALLOWED_HOSTS = new Set(['finance.naver.com', 'm.finance.naver.com']);

    function isAllowedUrl(url: string): boolean {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
      } catch {
        return false;
      }
    }

    export function mapToDiscussionRow(
      stockCode: string,
      item: RawDiscussionItem,
      bodyPlaintext: string | null,
    ): DiscussionRow | null {
      const title = stripHtmlToPlaintext(item.title);
      if (!title) return null;

      const posted = parseNaverBoardDate(item.postedRaw);
      if (!posted) return null;

      if (!isAllowedUrl(item.url)) return null;

      const author = (item.author ?? '').trim() || null;
      const body = bodyPlaintext && bodyPlaintext.trim().length > 0 ? bodyPlaintext.trim() : null;

      return {
        stock_code: stockCode,
        post_id: item.postId,
        title,
        body,
        author,
        posted_at: posted,
        url: item.url,
        scraped_at: new Date().toISOString(),
      };
    }
    ```

    **`workers/discussion-sync/src/pipeline/upsert.ts`:**
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';
    import type { DiscussionRow } from './map.js';

    export async function upsertDiscussions(
      supabase: SupabaseClient,
      rows: DiscussionRow[],
    ): Promise<{ upserted: number }> {
      if (rows.length === 0) return { upserted: 0 };
      // RESEARCH §UPSERT 전략 — DO UPDATE SET scraped_at 채택 (ignoreDuplicates: false).
      // SDK 는 기본 모든 컬럼 update 이나 title/body/author/posted_at 은 동일 값으로 no-op.
      const { data, error } = await supabase
        .from('discussions')
        .upsert(rows, { onConflict: 'stock_code,post_id', ignoreDuplicates: false })
        .select('id');
      if (error) throw error;
      return { upserted: data?.length ?? 0 };
    }
    ```

    **`workers/discussion-sync/src/pipeline/collectDiscussions.ts`:**
    ```ts
    import type { AxiosInstance } from 'axios';
    import { parseNaverBoardDate } from '@gh-radar/shared';
    import type { DiscussionSyncConfig } from '../config.js';
    import { fetchBoard } from '../scraper/fetchBoard.js';
    import { fetchPostBody } from '../scraper/fetchPostBody.js';
    import { parseBoardHtml, type RawDiscussionItem } from '../scraper/parseBoardHtml.js';
    import { mapToDiscussionRow, type DiscussionRow } from './map.js';

    export interface CollectResult {
      rows: DiscussionRow[];
      bodyFetched: number;
      pages: number;  // 항상 1 (v1 — 페이지네이션 v2)
    }

    /**
     * 한 종목의 토론방 목록 + (옵션) 상위 N 건 본문 수집.
     * @param onRequest — 프록시 요청 직전 호출. false 면 해당 요청 skip (budget abort 시그널).
     */
    export async function collectDiscussions(
      client: AxiosInstance,
      cfg: DiscussionSyncConfig,
      stockCode: string,
      onRequest: () => Promise<boolean>,
    ): Promise<CollectResult> {
      // 1. 목록 페이지 fetch
      const ok = await onRequest();
      if (!ok) return { rows: [], bodyFetched: 0, pages: 0 };
      const html = await fetchBoard(client, cfg, stockCode);
      const rawItems = parseBoardHtml(html);

      // 2. 24시간 컷오프 필터 + 최신순 정렬
      const cutoffMs = Date.now() - 24 * 3600_000;
      const recentItems: Array<{ raw: RawDiscussionItem; postedMs: number }> = [];
      for (const r of rawItems) {
        const iso = parseNaverBoardDate(r.postedRaw);
        if (!iso) continue;
        const ms = new Date(iso).getTime();
        if (Number.isFinite(ms) && ms >= cutoffMs) recentItems.push({ raw: r, postedMs: ms });
      }
      recentItems.sort((a, b) => b.postedMs - a.postedMs);

      // 3. 본문 수집 (옵션 2 — 상위 N)
      const bodyMap = new Map<string, string | null>();
      let bodyFetched = 0;
      if (cfg.discussionSyncBodyFetch) {
        const topN = Math.min(cfg.discussionSyncBodyTopN, recentItems.length);
        for (let i = 0; i < topN; i++) {
          const ok2 = await onRequest();
          if (!ok2) break;
          const r = recentItems[i].raw;
          const body = await fetchPostBody(client, cfg, stockCode, r.postId);
          bodyMap.set(r.postId, body);
          if (body) bodyFetched++;
        }
      }

      // 4. map
      const rows: DiscussionRow[] = [];
      for (const { raw } of recentItems) {
        const row = mapToDiscussionRow(stockCode, raw, bodyMap.get(raw.postId) ?? null);
        if (row) rows.push(row);
      }

      return { rows, bodyFetched, pages: 1 };
    }
    ```

    **`workers/discussion-sync/src/apiUsage.ts`:**
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    const SERVICE = 'proxy_naver_discussion';

    export function kstDateString(now = new Date()): string {
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

    **`workers/discussion-sync/src/retention.ts`:**
    ```ts
    import type { SupabaseClient } from '@supabase/supabase-js';

    /**
     * discussions 테이블 retention — 90일 초과 행 DELETE.
     * NOTE: supabase 클라이언트는 반드시 service_role 키로 생성되어야 한다.
     * discussions RLS 는 anon SELECT 만 허용 → service_role 이 RLS bypass 해야 DELETE 가 실제 행을 삭제한다.
     * Phase 7 news-sync 는 created_at 기준이었으나 discussions 스키마는 created_at 없음 → scraped_at 기준.
     */
    export async function runRetention(supabase: SupabaseClient, days = 90): Promise<number> {
      const threshold = new Date(Date.now() - days * 86400_000).toISOString();
      const { count, error } = await supabase
        .from('discussions')
        .delete({ count: 'exact' })
        .lt('scraped_at', threshold);
      if (error) throw error;
      return count ?? 0;
    }
    ```

    **테스트 파일 (최소 1 case 씩, 구체 방법은 news-sync 테스트 참조):**

    `workers/discussion-sync/tests/scraper/parseBoardHtml.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { parseBoardHtml } from '../../src/scraper/parseBoardHtml.js';
    import { NAVER_BOARD_HTML_SAMPLE_ACTIVE, NAVER_BOARD_HTML_SAMPLE_QUIET } from '../helpers/naver-board-fixtures.js';

    describe('parseBoardHtml (POC §3 selector 실증)', () => {
      it('parses ≥10 items from active fixture', () => {
        const items = parseBoardHtml(NAVER_BOARD_HTML_SAMPLE_ACTIVE);
        expect(items.length).toBeGreaterThanOrEqual(10);
        for (const it of items) {
          expect(it.postId).toMatch(/^\d{6,12}$/);
          expect(it.title.length).toBeGreaterThan(0);
          expect(it.url).toMatch(/^https:\/\/finance\.naver\.com/);
        }
      });
      it('parses fewer items from quiet fixture', () => {
        const items = parseBoardHtml(NAVER_BOARD_HTML_SAMPLE_QUIET);
        expect(items.length).toBeGreaterThan(0);
      });
      it('returns empty on non-HTML input', () => {
        expect(parseBoardHtml('')).toEqual([]);
        expect(parseBoardHtml('<html></html>')).toEqual([]);
      });
      it('skips row without nid in href', () => {
        const html = '<table class="type2"><tbody><tr><td class="title"><a href="/item/board.naver?code=X">no-nid</a></td><td>a</td><td>x</td></tr></tbody></table>';
        expect(parseBoardHtml(html)).toEqual([]);
      });
    });
    ```

    `workers/discussion-sync/tests/scraper/fetchBoard.test.ts`:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import { fetchBoard } from '../../src/scraper/fetchBoard.js';
    import { ProxyBlockedError } from '../../src/proxy/errors.js';

    vi.mock('../../src/proxy/client.js', () => ({ fetchNaverUrl: vi.fn() }));
    import { fetchNaverUrl } from '../../src/proxy/client.js';

    const BASE_CFG = { proxyProvider: 'scraperapi', proxyBaseUrl: 'https://x', proxyApiKey: 'k' } as any;

    describe('fetchBoard', () => {
      it('returns HTML when long enough and no block keyword', async () => {
        (fetchNaverUrl as any).mockResolvedValue('<html>' + 'a'.repeat(1000) + '</html>');
        const out = await fetchBoard({} as any, BASE_CFG, '005930');
        expect(out.length).toBeGreaterThan(500);
      });
      it('throws ProxyBlockedError on short response', async () => {
        (fetchNaverUrl as any).mockResolvedValue('short');
        await expect(fetchBoard({} as any, BASE_CFG, '005930')).rejects.toBeInstanceOf(ProxyBlockedError);
      });
      it('throws ProxyBlockedError on block keyword', async () => {
        (fetchNaverUrl as any).mockResolvedValue('<html>' + '접근이 차단되었습니다'.padEnd(1000, 'x') + '</html>');
        await expect(fetchBoard({} as any, BASE_CFG, '005930')).rejects.toBeInstanceOf(ProxyBlockedError);
      });
    });
    ```

    `workers/discussion-sync/tests/pipeline/map.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { mapToDiscussionRow } from '../../src/pipeline/map.js';

    const OK = {
      postId: '272617128',
      title: '삼성전자 실적 기대감',
      author: 'abc****',
      postedRaw: '2026.04.17 14:32',
      url: 'https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128',
    };

    describe('mapToDiscussionRow', () => {
      it('maps valid item with body', () => {
        const row = mapToDiscussionRow('005930', OK, '본문 plaintext');
        expect(row).not.toBeNull();
        expect(row!.stock_code).toBe('005930');
        expect(row!.post_id).toBe('272617128');
        expect(row!.body).toBe('본문 plaintext');
        expect(row!.posted_at).toBe('2026-04-17T14:32:00+09:00');
        expect(row!.url).toMatch(/finance\.naver\.com/);
      });
      it('allows null body (옵션 1 또는 fetchPostBody 실패)', () => {
        const row = mapToDiscussionRow('005930', OK, null);
        expect(row!.body).toBeNull();
      });
      it('rejects non-naver URL (T-07 open redirect)', () => {
        expect(mapToDiscussionRow('005930', { ...OK, url: 'https://evil.com/?code=005930&nid=1' }, null)).toBeNull();
      });
      it('rejects javascript: protocol', () => {
        expect(mapToDiscussionRow('005930', { ...OK, url: 'javascript:alert(1)' }, null)).toBeNull();
      });
      it('rejects invalid posted_at', () => {
        expect(mapToDiscussionRow('005930', { ...OK, postedRaw: 'invalid' }, null)).toBeNull();
      });
      it('does NOT apply spam filter at map stage (D11 is server responsibility)', () => {
        const spam = { ...OK, title: 'ㅋㅋ' };  // <5자
        expect(mapToDiscussionRow('005930', spam, null)).not.toBeNull();  // 저장됨 (D11: 원본 저장, UI 필터)
        const urlSpam = { ...OK, title: '강추 http://bit.ly/xxx' };
        expect(mapToDiscussionRow('005930', urlSpam, null)).not.toBeNull();
      });
      it('handles empty author', () => {
        const row = mapToDiscussionRow('005930', { ...OK, author: '  ' }, null);
        expect(row!.author).toBeNull();
      });
    });
    ```

    `workers/discussion-sync/tests/pipeline/upsert.test.ts`:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import { upsertDiscussions } from '../../src/pipeline/upsert.js';

    describe('upsertDiscussions', () => {
      it('returns 0 for empty rows', async () => {
        const sb = { from: vi.fn() } as any;
        expect(await upsertDiscussions(sb, [])).toEqual({ upserted: 0 });
        expect(sb.from).not.toHaveBeenCalled();
      });
      it('calls upsert with onConflict=stock_code,post_id and ignoreDuplicates=false', async () => {
        const select = vi.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null });
        const upsert = vi.fn().mockReturnValue({ select });
        const sb = { from: vi.fn().mockReturnValue({ upsert }) } as any;
        await upsertDiscussions(sb, [{ stock_code: '005930', post_id: '1', title: 't', body: null, author: null, posted_at: '2026-04-17T00:00:00+09:00', url: 'https://finance.naver.com', scraped_at: '2026-04-17T00:00:00Z' }]);
        expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
          onConflict: 'stock_code,post_id',
          ignoreDuplicates: false,
        }));
      });
    });
    ```

    `workers/discussion-sync/tests/pipeline/targets.test.ts` — Phase 7 news-sync `targets.test.ts` 1:1 복제 (테이블명 동일).

    `workers/discussion-sync/tests/apiUsage.test.ts`:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import { kstDateString, checkBudget, incrementUsage } from '../src/apiUsage.js';

    describe('kstDateString', () => {
      it('converts UTC 15:00 to KST 00:00 next day', () => {
        expect(kstDateString(new Date('2026-04-16T15:00:00Z'))).toBe('2026-04-17');
      });
    });

    describe('incrementUsage uses proxy_naver_discussion service label', () => {
      it('calls rpc with correct params', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
        const sb = { rpc } as any;
        const count = await incrementUsage(sb, '2026-04-17', 2);
        expect(count).toBe(42);
        expect(rpc).toHaveBeenCalledWith('incr_api_usage', {
          p_service: 'proxy_naver_discussion',
          p_date: '2026-04-17',
          p_amount: 2,
        });
      });
    });

    describe('checkBudget', () => {
      it('returns 0 when no row', async () => {
        const sb = {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any;
        expect(await checkBudget(sb, '2026-04-17')).toBe(0);
      });
    });
    ```

    `workers/discussion-sync/tests/retention.test.ts`:
    ```ts
    import { describe, it, expect, vi } from 'vitest';
    import { runRetention } from '../src/retention.js';

    describe('runRetention', () => {
      it('deletes discussions WHERE scraped_at < threshold', async () => {
        const lt = vi.fn().mockResolvedValue({ count: 3, error: null });
        const del = vi.fn().mockReturnValue({ lt });
        const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as any;
        const deleted = await runRetention(sb, 90);
        expect(deleted).toBe(3);
        expect(sb.from).toHaveBeenCalledWith('discussions');
        expect(del).toHaveBeenCalledWith({ count: 'exact' });
        expect(lt).toHaveBeenCalledWith('scraped_at', expect.any(String));
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/discussion-sync test --run -- parseBoardHtml.test.ts fetchBoard.test.ts map.test.ts upsert.test.ts targets.test.ts apiUsage.test.ts retention.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 9 src 파일 + 7 test 파일 모두 생성
    - parseBoardHtml 가 실제 fixture(NAVER_BOARD_HTML_SAMPLE_ACTIVE)에서 ≥10 items 파싱
    - `grep -q "table.type2" workers/discussion-sync/src/scraper/parseBoardHtml.ts` (POC §3 selector)
    - `grep -q "extractNid" workers/discussion-sync/src/scraper/parseBoardHtml.ts` (shared import)
    - `grep -qE "onConflict.*'stock_code.*post_id'" workers/discussion-sync/src/pipeline/upsert.ts` → 1 match
    - `grep -q "ignoreDuplicates: false" workers/discussion-sync/src/pipeline/upsert.ts` → 1 match (DO UPDATE 채택)
    - `grep -q "proxy_naver_discussion" workers/discussion-sync/src/apiUsage.ts` → 1 match
    - `grep -q "ALLOWED_HOSTS" workers/discussion-sync/src/pipeline/map.ts` + `grep -q "finance.naver.com" workers/discussion-sync/src/pipeline/map.ts` (T-07 open redirect)
    - `grep -q "scraped_at" workers/discussion-sync/src/retention.ts` (created_at 아님)
    - `grep -q "service_role" workers/discussion-sync/src/retention.ts` (주석 또는 식별자)
    - `grep -q "24 \* 3600_000\|24.*3600" workers/discussion-sync/src/pipeline/collectDiscussions.ts` (24h 컷오프)
    - 전체 test 그린 (≥25 case)
    - **V-20 guardrail 유지**: `grep -r "sanitize-html\|cheerio" workers/news-sync/` → 0 match (Phase 7 에 침투 없음)
    - `pnpm -F @gh-radar/discussion-sync typecheck` exit 0
  </acceptance_criteria>
  <done>scraper + pipeline + apiUsage + retention 9 src + 7 test 모두 그린 + typecheck 통과</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: index.ts cycle entry (targets → collect → upsert → retention → log summary) + integration test</name>
  <files>
    workers/discussion-sync/src/index.ts,
    workers/discussion-sync/tests/pipeline.test.ts
  </files>
  <read_first>
    - workers/news-sync/src/index.ts (cycle 구조 — 복제 기준)
    - workers/discussion-sync/src/config.ts (Task 1 산출)
    - workers/discussion-sync/src/apiUsage.ts (Task 2 산출)
    - workers/discussion-sync/src/pipeline/collectDiscussions.ts (Task 2 산출)
    - workers/discussion-sync/src/retention.ts (Task 2 산출)
    - workers/discussion-sync/src/proxy/errors.ts (Task 1 산출 — abort 조건)
  </read_first>
  <action>
    **`workers/discussion-sync/src/index.ts`:**
    ```ts
    import pLimit from 'p-limit';
    import { loadConfig } from './config.js';
    import { createLogger } from './logger.js';
    import { createSupabaseClient } from './services/supabase.js';
    import { createProxyClient } from './proxy/client.js';
    import { ProxyAuthError, ProxyBudgetExhaustedError, ProxyBlockedError, NaverRateLimitError } from './proxy/errors.js';
    import { loadTargets } from './pipeline/targets.js';
    import { collectDiscussions } from './pipeline/collectDiscussions.js';
    import { upsertDiscussions } from './pipeline/upsert.js';
    import { checkBudget, incrementUsage, kstDateString } from './apiUsage.js';
    import { runRetention } from './retention.js';

    async function main(): Promise<void> {
      const cfg = loadConfig();
      const log = createLogger(cfg.logLevel);
      const supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
      const proxy = createProxyClient(cfg);

      const targets = await loadTargets(supabase);
      log.info({ count: targets.length }, 'discussion-sync targets loaded');

      const dateKst = kstDateString();
      const budgetBefore = await checkBudget(supabase, dateKst);

      // 예상 요청량: targets * (1 목록 + topN 본문) . budget 초과 예상 시 skip.
      const expectedPerStock = 1 + (cfg.discussionSyncBodyFetch ? cfg.discussionSyncBodyTopN : 0);
      const expectedTotal = targets.length * expectedPerStock;
      if (budgetBefore + expectedTotal > cfg.discussionSyncDailyBudget) {
        log.warn(
          { budgetBefore, expectedTotal, cap: cfg.discussionSyncDailyBudget },
          'budget would exceed — skipping cycle',
        );
        return;
      }

      let totalRequests = 0, totalUpserted = 0, bodyFetched = 0, errors = 0, skipped = 0;
      let stopAll = false;
      const limit = pLimit(cfg.discussionSyncConcurrency);

      await Promise.allSettled(
        targets.map((t) =>
          limit(async () => {
            if (stopAll) { skipped++; return; }
            try {
              const onRequest = async (): Promise<boolean> => {
                if (stopAll) return false;
                const used = await incrementUsage(supabase, dateKst, 1);
                totalRequests++;
                if (used > cfg.discussionSyncDailyBudget) {
                  log.warn({ used }, 'daily budget exceeded mid-cycle — stopAll');
                  stopAll = true;
                  return false;
                }
                return true;
              };

              const { rows, bodyFetched: bf } = await collectDiscussions(proxy, cfg, t.code, onRequest);
              bodyFetched += bf;
              const { upserted } = await upsertDiscussions(supabase, rows);
              totalUpserted += upserted;
            } catch (err: any) {
              if (err instanceof ProxyAuthError || err instanceof ProxyBudgetExhaustedError) {
                log.error({ err: err.message, code: t.code }, 'proxy abort signal');
                stopAll = true;
              } else if (err instanceof ProxyBlockedError) {
                log.warn({ code: t.code }, 'proxy blocked — per-stock skip');
                errors++;
              } else if (err instanceof NaverRateLimitError) {
                log.warn({ code: t.code }, 'naver rate limit after retry — per-stock skip');
                errors++;
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

      log.info({
        targets: targets.length,
        totalRequests,
        totalUpserted,
        bodyFetched,
        errors,
        skipped,
        retentionDeleted,
        budgetBefore,
        budgetAfter,
        stopAll,
      }, 'discussion-sync cycle complete');
    }

    main().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[discussion-sync] fatal', err);
      process.exit(1);
    });
    ```

    **`workers/discussion-sync/tests/pipeline.test.ts` (integration — 주요 흐름 smoke):**
    ```ts
    import { describe, it, expect } from 'vitest';
    import { mapToDiscussionRow } from '../src/pipeline/map.js';

    describe('Phase 8 pipeline integration smoke', () => {
      it('mapToDiscussionRow happy path', () => {
        const row = mapToDiscussionRow('005930', {
          postId: '272617128',
          title: '<b>삼성</b> 실적',
          author: 'abc****',
          postedRaw: '2026.04.17 14:32',
          url: 'https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128',
        }, '본문');
        expect(row).not.toBeNull();
        expect(row!.title).toBe('삼성 실적');  // <b> stripped
      });

      it.todo('budget exhausted mid-cycle → stopAll flag set, subsequent tasks skip');
      it.todo('per-stock ProxyBlockedError → other stocks still processed');
      it.todo('ProxyAuthError → stopAll, entire cycle aborts');
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/discussion-sync test --run &amp;&amp; pnpm -F @gh-radar/discussion-sync typecheck &amp;&amp; pnpm -F @gh-radar/discussion-sync build</automated>
  </verify>
  <acceptance_criteria>
    - `workers/discussion-sync/src/index.ts` 존재 + `main()` + p-limit + per-stock try/catch
    - `grep -q "collectDiscussions" workers/discussion-sync/src/index.ts` + `grep -q "upsertDiscussions" workers/discussion-sync/src/index.ts` + `grep -q "runRetention" workers/discussion-sync/src/index.ts` + `grep -q "incrementUsage" workers/discussion-sync/src/index.ts` 모두 1+ match
    - `grep -q "stopAll" workers/discussion-sync/src/index.ts` (abort flag)
    - `grep -q "ProxyAuthError\|ProxyBudgetExhaustedError" workers/discussion-sync/src/index.ts` (abort 조건)
    - `pnpm -F @gh-radar/discussion-sync test --run` 전체 그린 (≥25 tests total across 9 spec files from Task 1-3)
    - `pnpm -F @gh-radar/discussion-sync build` exit 0 (dist/index.js 생성)
    - V-20 guardrail 유지: `grep -rE "sanitize-html|cheerio" workers/news-sync/src/ packages/shared/src/` → 0 match
  </acceptance_criteria>
  <done>index.ts cycle + pipeline.test.ts 스모크 그린 + worker 전체 build 성공</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-02)

| Boundary | Description |
|----------|-------------|
| env / Secret Manager → worker process | PROXY_API_KEY / SUPABASE_SERVICE_ROLE_KEY 가 런타임에 주입됨 |
| 프록시 → 네이버 HTML | 외부 HTML 응답 — title/body/author untrusted |
| worker → Supabase | service_role 쓰기 — 최고 권한, retention DELETE 필요 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Tampering (Stored XSS) | pipeline/map.ts + scraper/fetchPostBody.ts | mitigate | shared stripHtmlToPlaintext (regex entity+tag strip) + fetchPostBody 가 sanitize-html 로 2차 태그 전부 제거 (`allowedTags: []`). React 기본 text escape 가 3차. map 단계에서 빈 title/body 탈락. |
| T-03 | Information Disclosure | pino logger | mitigate | redact paths 에 `cfg.proxyApiKey`, `cfg.supabaseServiceRoleKey`, `params.api_key`, `headers["X-Proxy-Auth"]`, `*.PROXY_API_KEY`, `*.SUPABASE_SERVICE_ROLE_KEY`. logger.test.ts 로 실제 output 에 키 미포함 검증. |
| T-04 | Tampering (log injection) | per-stock 에러 로그 | mitigate | response HTML body 를 logger 에 절대 흘리지 않음. 에러 시 `err.message` + HTTP status + byte length 만. 크롤링된 title/body 는 로그에 포함하지 않음. pino structured logging 이 개행 injection 방어. |
| T-05 | DoS (프록시 예산 소진) | incr_api_usage RPC | mitigate | atomic RPC + cycle 시작 시 pre-check + onRequest 콜백 매 요청 전 증가 + 초과 시 stopAll flag. 실사용 4,800/일 대비 `DISCUSSION_SYNC_DAILY_BUDGET=5000` 여유 마진. |
| T-07 | Tampering (Open redirect / 악성 URL 저장) | pipeline/map.ts isAllowedUrl | mitigate | `ALLOWED_HOSTS = { finance.naver.com, m.finance.naver.com }` 화이트리스트 + protocol https/http 만. javascript: / data: 차단. map.test.ts T-07 cases. |
| T-08 | Tampering (SQL injection) | discussions upsert | mitigate | Supabase JS SDK parametric — `.upsert(rows, { onConflict })` 만 사용. 문자열 concat 금지. |
| T-10 | Tampering (prototype pollution) | cheerio HTML 파싱 | accept | cheerio 자체 파싱 엔진 (JS eval 없음). sanitize-html `disallowedTagsMode: 'discard'` 기본값. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/discussion-sync test --run` — 9 spec 파일 모두 그린 (≥25 cases)
- `pnpm -F @gh-radar/discussion-sync typecheck` exit 0
- `pnpm -F @gh-radar/discussion-sync build` → `workers/discussion-sync/dist/index.js` 생성
- `grep -q "startsWith('https://')" workers/discussion-sync/src/proxy/client.ts` (T-09)
- `grep -qE "onConflict.*'stock_code.*post_id'" workers/discussion-sync/src/pipeline/upsert.ts` (D10 UPSERT)
- `grep -q "ignoreDuplicates: false" workers/discussion-sync/src/pipeline/upsert.ts` (DO UPDATE 채택)
- `grep -q "proxy_naver_discussion" workers/discussion-sync/src/apiUsage.ts` (service 라벨)
- `grep -q "proxyApiKey" workers/discussion-sync/src/logger.ts` (T-03 redact)
- `grep -q "SUPABASE_SERVICE_ROLE_KEY" workers/discussion-sync/src/services/supabase.ts` (retention 전제)
- `grep -q "ALLOWED_HOSTS" workers/discussion-sync/src/pipeline/map.ts` + `grep -q "finance.naver.com" workers/discussion-sync/src/pipeline/map.ts` (T-07)
- `grep -q "scraped_at" workers/discussion-sync/src/retention.ts` (created_at 이 아님 — discussions 스키마 기준)
- Phase 7 회귀: `grep -rE "sanitize-html|cheerio" workers/news-sync/src/ packages/shared/src/` → 0 match
</verification>

<success_criteria>
- `workers/discussion-sync/src/` 완성 (config/logger/retry/supabase/proxy/scraper/pipeline/apiUsage/retention/index)
- 모든 test 그린 ≥25 cases
- Dockerfile 기반 build 성공 — Plan 08-06 deploy 에서 이 이미지 사용
- 신규 deps: cheerio@^1.2.0, sanitize-html@^2.17.2 만 추가. Phase 7 news-sync / packages/shared 에 침투 없음.
- 예산 카운터 atomic (proxy_naver_discussion 라벨) + per-stock try/catch + retention 90일
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-02-SUMMARY.md`:
- workers/discussion-sync/ 파일 트리
- vitest 결과 (pass count, 스펙별 분리)
- Dockerfile 빌드 smoke (로컬 `docker build` 성공 여부)
- 신규 deps 설치 결과 + Phase 7 회귀 검증 결과
- 발견한 이슈 (iconv-lite 필요 여부, DOM selector 변경 감지 등)
</output>
