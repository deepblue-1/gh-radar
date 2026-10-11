---
plan: 07-01
phase: 07
type: execute
wave: 0
depends_on: []
requirements: [NEWS-01]
files_modified:
  - supabase/migrations/20260417120000_api_usage.sql
  - supabase/migrations/20260417120100_news_created_at_idx.sql
  - packages/shared/src/news-sanitize.ts
  - packages/shared/src/__tests__/news-sanitize.test.ts
  - packages/shared/src/index.ts
  - packages/shared/package.json
  - server/tests/routes/news.test.ts
  - webapp/e2e/specs/news.spec.ts
  - webapp/e2e/fixtures/news.ts
  - webapp/e2e/fixtures/mock-api.ts
  - workers/news-sync/vitest.config.ts
  - workers/news-sync/tests/helpers/supabase-mock.ts
  - workers/news-sync/tests/helpers/naver-fixtures.ts
autonomous: false
threat_refs: [T-03, T-06, T-08, T-10]

must_haves:
  truths:
    - "api_usage 테이블이 Supabase 에 생성되고 service_role 만 INSERT/UPDATE 할 수 있다"
    - "incr_api_usage RPC 가 atomic 하게 count 를 증가시키고 잔여량(count)을 반환한다"
    - "news_articles 에 idx_news_created_at (created_at DESC) 인덱스가 존재한다"
    - "packages/shared/src/news-sanitize.ts 의 stripHtml/parsePubDate/extractSourcePrefix 3개 순수 함수가 export 된다"
    - "server/webapp/worker 모든 테스트 스펙 파일이 test.todo() 스텁으로 생성되어 Wave 1+ 에서 green 전환 가능하다"
  artifacts:
    - path: "supabase/migrations/20260417120000_api_usage.sql"
      provides: "api_usage 테이블 + RLS + incr_api_usage RPC"
      contains: "CREATE TABLE api_usage"
    - path: "supabase/migrations/20260417120100_news_created_at_idx.sql"
      provides: "idx_news_created_at 인덱스"
      contains: "CREATE INDEX"
    - path: "packages/shared/src/news-sanitize.ts"
      provides: "3개 순수 함수 export"
      exports: ["stripHtml", "parsePubDate", "extractSourcePrefix"]
    - path: "packages/shared/src/__tests__/news-sanitize.test.ts"
      provides: "V-04/V-05/V-06 unit test 구현"
      min_lines: 60
    - path: "webapp/e2e/specs/news.spec.ts"
      provides: "V-17/V-18/V-19/V-20 스켈레톤 스펙"
      min_lines: 40
  key_links:
    - from: "packages/shared/src/index.ts"
      to: "packages/shared/src/news-sanitize.ts"
      via: "re-export"
      pattern: "export .+news-sanitize"
    - from: "Supabase migrations"
      to: "api_usage table + RPC"
      via: "supabase db push"
      pattern: "supabase db push"
---

<objective>
Wave 0 — 모든 후속 plan 이 의존하는 공통 인프라를 먼저 확보한다:
(1) Supabase 마이그레이션 2개(`api_usage` 테이블·RPC + `idx_news_created_at`) 작성 및 [BLOCKING] `supabase db push` 적용,
(2) 공용 순수 함수 모듈 `packages/shared/src/news-sanitize.ts` 3개(stripHtml/parsePubDate/extractSourcePrefix) 구현 + unit test,
(3) Wave 1+ 테스트가 green 으로 전환될 수 있도록 server/webapp/worker 테스트 스펙 스켈레톤(`test.todo()`) 과 Playwright fixture/mock 인프라를 먼저 생성.

Purpose: Nyquist Dimension 8 (검증 선행). 이 plan 이 없으면 후속 plan 의 `<verify>` 명령이 MISSING 상태로 남는다.
Output: 마이그레이션 2건 + shared 함수 3종(+테스트) + 테스트 스텁 9개 파일. `supabase db push` 로 DB 반영.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-news-ingestion/07-CONTEXT.md
@.planning/phases/07-news-ingestion/07-RESEARCH.md
@.planning/phases/07-news-ingestion/07-UI-SPEC.md
@.planning/phases/07-news-ingestion/07-VALIDATION.md

@supabase/migrations/20260413120000_init_tables.sql
@supabase/migrations/20260413120100_rls_policies.sql
@supabase/migrations/20260416120000_watchlists.sql
@packages/shared/src/index.ts
@packages/shared/src/news.ts
@packages/shared/package.json
@server/vitest.config.ts
@server/tests/routes/stock-detail.test.ts

<interfaces>
기존 `packages/shared/src/index.ts` 의 export 패턴:
```ts
export type { Stock, Market, SecurityType, StockMaster, StockQuote, StockWithQuote } from "./stock.js";
export type { NewsArticle } from "./news.js";
```
→ 본 plan 은 `export { stripHtml, parsePubDate, extractSourcePrefix } from "./news-sanitize.js";` 한 줄 추가.

기존 `api_usage` 유사 패턴(watchlists RLS)의 참고:
```sql
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchlists_select_own ON watchlists FOR SELECT USING (auth.uid() = user_id);
```
→ api_usage 는 **정책 0개** (service_role 만 접근, anon/authenticated 는 자동 deny).

기존 `NewsArticle` 타입 (`packages/shared/src/news.ts` — camelCase, 서버 응답과 mapper 경유로 일치):
```ts
export type NewsArticle = {
  id: string;
  stockCode: string;     // ← camelCase (서버 snake_case stock_code 에서 mapper 로 변환)
  title: string;
  source: string | null;
  url: string;
  publishedAt: string;   // ← camelCase
  contentHash: string | null;
  summaryId: string | null;
  createdAt: string;     // ← camelCase
};
```
→ Playwright fixture 의 `NEWS_ITEM_SAMPLE` 은 이 camelCase 스키마와 **필드명이 정확히 일치해야** E2E 가 실제 클라이언트와 같은 contract 를 테스트할 수 있다 (Plan 07-03 이 `server/src/mappers/news.ts::toNewsArticle` 로 snake_case→camelCase 변환 확정).

서버 테스트 경로 컨벤션 (`server/vitest.config.ts` 의 `include: ["tests/**/*.test.ts"]`):
→ 서버 뉴스 테스트 파일은 **`server/tests/routes/news.test.ts`** 에 배치. `server/src/__tests__/` 는 vitest include glob 밖이라 절대 사용 금지.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: api_usage 마이그레이션 + news_articles 인덱스 마이그레이션 작성</name>
  <files>
    supabase/migrations/20260417120000_api_usage.sql,
    supabase/migrations/20260417120100_news_created_at_idx.sql
  </files>
  <read_first>
    - supabase/migrations/20260413120000_init_tables.sql (기존 테이블 컨벤션)
    - supabase/migrations/20260413120100_rls_policies.sql (RLS 패턴)
    - supabase/migrations/20260416120000_watchlists.sql (최근 마이그레이션 스타일 참고)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §4 (RPC 스펙)
  </read_first>
  <behavior>
    - stripHtml 은 아직 건드리지 않음. 이 task 는 SQL 만.
    - 마이그레이션 1 (`20260417120000_api_usage.sql`):
      - `CREATE TABLE api_usage(service text NOT NULL, usage_date date NOT NULL, count bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(service, usage_date));`
      - `ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;` — 정책 0개 추가 (기본 deny)
      - `CREATE OR REPLACE FUNCTION incr_api_usage(p_service text, p_date date, p_amount int) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE new_count bigint; BEGIN INSERT INTO api_usage(service, usage_date, count, updated_at) VALUES (p_service, p_date, p_amount, now()) ON CONFLICT (service, usage_date) DO UPDATE SET count = api_usage.count + p_amount, updated_at = now() RETURNING count INTO new_count; RETURN new_count; END; $$;`
      - `REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM PUBLIC;`
      - `GRANT EXECUTE ON FUNCTION incr_api_usage(text, date, int) TO service_role;`
    - 마이그레이션 2 (`20260417120100_news_created_at_idx.sql`):
      - `CREATE INDEX IF NOT EXISTS idx_news_created_at ON news_articles(created_at DESC);` — retention DELETE 및 cooldown MAX(created_at) 효율화
  </behavior>
  <action>
    RESEARCH §4 (Section "호출 카운터 저장소") 의 SQL 스니펫을 그대로 복사해서 두 파일을 작성한다.

    파일 1 — `supabase/migrations/20260417120000_api_usage.sql`:
    ```sql
    -- Phase 07 — Naver Search API 호출 카운터.
    -- service_role 만 접근 (RLS 활성 + 정책 0개 = 전체 deny except service_role).
    CREATE TABLE api_usage (
      service     text        NOT NULL,
      usage_date  date        NOT NULL,
      count       bigint      NOT NULL DEFAULT 0,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (service, usage_date)
    );

    ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
    -- 정책 미생성 — anon/authenticated 는 전면 deny, service_role 은 RLS bypass.

    -- Atomic increment + 누적 count 반환.
    CREATE OR REPLACE FUNCTION incr_api_usage(p_service text, p_date date, p_amount int)
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE new_count bigint;
    BEGIN
      INSERT INTO api_usage(service, usage_date, count, updated_at)
        VALUES (p_service, p_date, p_amount, now())
        ON CONFLICT (service, usage_date)
        DO UPDATE SET count = api_usage.count + p_amount, updated_at = now()
      RETURNING count INTO new_count;
      RETURN new_count;
    END;
    $$;

    REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION incr_api_usage(text, date, int) TO service_role;
    ```

    파일 2 — `supabase/migrations/20260417120100_news_created_at_idx.sql`:
    ```sql
    -- Phase 07 — news_articles 의 cooldown MAX(created_at) / retention 쿼리 효율화.
    CREATE INDEX IF NOT EXISTS idx_news_created_at
      ON news_articles (created_at DESC);
    ```
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260417120000_api_usage.sql &amp;&amp; test -f supabase/migrations/20260417120100_news_created_at_idx.sql &amp;&amp; grep -q "CREATE TABLE api_usage" supabase/migrations/20260417120000_api_usage.sql &amp;&amp; grep -q "incr_api_usage" supabase/migrations/20260417120000_api_usage.sql &amp;&amp; grep -q "SECURITY DEFINER" supabase/migrations/20260417120000_api_usage.sql &amp;&amp; grep -q "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260417120000_api_usage.sql &amp;&amp; grep -q "idx_news_created_at" supabase/migrations/20260417120100_news_created_at_idx.sql</automated>
  </verify>
  <acceptance_criteria>
    - V-01: `supabase/migrations/20260417120000_api_usage.sql` 에 `CREATE TABLE api_usage`, `ENABLE ROW LEVEL SECURITY`, SECURITY DEFINER RPC 가 모두 존재
    - V-02: `incr_api_usage(p_service text, p_date date, p_amount int)` 시그니처 정확, `ON CONFLICT (service, usage_date) DO UPDATE SET count = api_usage.count + p_amount` 포함
    - V-03: `supabase/migrations/20260417120100_news_created_at_idx.sql` 에 `CREATE INDEX IF NOT EXISTS idx_news_created_at ON news_articles (created_at DESC)` 존재
    - RPC 권한: `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` 두 줄 모두 존재
    - 정책 추가 없음: `grep "CREATE POLICY" supabase/migrations/20260417120000_api_usage.sql` → 0 match
  </acceptance_criteria>
  <done>두 마이그레이션 파일 생성, 위 grep/test 명령 모두 exit 0</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: packages/shared/src/news-sanitize.ts 3개 함수 + unit test 구현</name>
  <files>
    packages/shared/src/news-sanitize.ts,
    packages/shared/src/__tests__/news-sanitize.test.ts,
    packages/shared/src/index.ts
  </files>
  <read_first>
    - packages/shared/src/index.ts (기존 export 패턴)
    - packages/shared/src/news.ts (NewsArticle 타입 - 수정 금지, 참조만)
    - packages/shared/package.json (vitest 설정 확인)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §2/§3 (stripHtml / parsePubDate / extractSourcePrefix 스펙)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md Risks §6 (naver host special-case)
  </read_first>
  <behavior>
    stripHtml:
      - stripHtml('') === '' (빈 입력)
      - stripHtml('&lt;b&gt;삼성&lt;/b&gt;') === '삼성'
      - stripHtml('&lt;i&gt;&lt;b&gt;X&lt;/b&gt;&lt;/i&gt;') === 'X' (중첩)
      - stripHtml('&amp;quot;hi&amp;quot;') === '"hi"' (named entity)
      - stripHtml('&amp;#39;X&amp;#39;') === "'X'" (numeric entity)
      - stripHtml('&amp;#x2019;') === '\u2019' (hex entity)
      - stripHtml('&amp;amp; &amp;lt; &amp;gt; &amp;nbsp;') === '& < <space>' (&amp; / &lt; / &gt; / &nbsp;)
      - stripHtml('한글 테스트') === '한글 테스트' (한글 보존)

    parsePubDate:
      - parsePubDate('Fri, 17 Apr 2026 14:32:00 +0900') === '2026-04-17T05:32:00.000Z'
      - parsePubDate('invalid') === null (NaN → null)
      - parsePubDate('') === null
      - parsePubDate('Fri, 17 Apr 2026 14:32:00 GMT') 는 Date 로 파싱됨 → ISO 반환

    extractSourcePrefix:
      - extractSourcePrefix('https://www.hankyung.com/article/x') === 'hankyung'
      - extractSourcePrefix('https://news.mt.co.kr/article/x') === 'mt'
      - extractSourcePrefix('https://m.chosun.com/x') === 'chosun' (m. prefix strip)
      - extractSourcePrefix('https://n.news.naver.com/mnews/x') === 'naver' (special-case)
      - extractSourcePrefix('https://news.naver.com/x') === 'naver' (special-case)
      - extractSourcePrefix('https://biz.chosun.com/x') === 'chosun' (subdomain strip)
      - extractSourcePrefix('not-a-url') === null
      - extractSourcePrefix('') === null
      - extractSourcePrefix('ftp://evil.com') === null (http/https 만 허용)
  </behavior>
  <action>
    `packages/shared/src/news-sanitize.ts` 를 다음과 같이 작성 (RESEARCH §3 에서 정규식 + entity decode 패턴 가져옴):

    ```ts
    /**
     * Phase 07 — Naver Search API 응답 sanitize 모듈.
     * server + worker 양쪽이 import 해서 single source of truth 를 유지한다.
     * 신규 의존성(sanitize-html, striptags, dompurify) 도입 금지 (Phase 07 UI-SPEC guardrail §2).
     */

    const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
    const NAMED_ENTITIES: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': ' ',
    };
    const NUMERIC_ENTITY_RE = /&#(\d+);/g;
    const HEX_ENTITY_RE = /&#x([0-9a-f]+);/gi;

    /**
     * 정규식 기반 HTML 태그 제거 + 엔티티 디코드. 순수 함수.
     */
    export function stripHtml(input: string): string {
      if (!input) return '';
      let s = input.replace(HTML_TAG_RE, '');
      s = s.replace(NUMERIC_ENTITY_RE, (_, n) => {
        try { return String.fromCodePoint(Number(n)); } catch { return ''; }
      });
      s = s.replace(HEX_ENTITY_RE, (_, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
      });
      for (const [k, v] of Object.entries(NAMED_ENTITIES)) s = s.replaceAll(k, v);
      return s.trim();
    }

    /**
     * RFC 822 (e.g., 'Fri, 17 Apr 2026 14:32:00 +0900') → ISO-8601 UTC string 또는 null.
     * 잘못된 포맷 시 null 반환.
     */
    export function parsePubDate(rfc822: string): string | null {
      if (!rfc822) return null;
      const t = Date.parse(rfc822);
      if (Number.isNaN(t)) return null;
      return new Date(t).toISOString();
    }

    const NAVER_HOSTS = new Set(['news.naver.com', 'n.news.naver.com', 'm.news.naver.com']);
    const SUBDOMAIN_STRIP_RE = /^(www|m|mobile|biz|news|n)\./i;

    /**
     * URL host 에서 TLD 제거 후 첫 토큰을 짧은 도메인 prefix 로 반환.
     * naver 도메인은 항상 'naver' 로 special-case.
     * http/https 외 프로토콜은 null.
     */
    export function extractSourcePrefix(url: string): string | null {
      if (!url) return null;
      let parsed: URL;
      try { parsed = new URL(url); } catch { return null; }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      const host = parsed.host.toLowerCase();
      if (NAVER_HOSTS.has(host)) return 'naver';
      // subdomain 1단계 strip (www./m./news./biz./n. 등)
      const stripped = host.replace(SUBDOMAIN_STRIP_RE, '');
      // 첫 토큰만 (TLD 이전)
      const first = stripped.split('.')[0];
      return first && first.length > 0 ? first : null;
    }
    ```

    `packages/shared/src/__tests__/news-sanitize.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { stripHtml, parsePubDate, extractSourcePrefix } from '../news-sanitize.js';

    describe('stripHtml (V-04)', () => {
      it('returns empty for empty input', () => { expect(stripHtml('')).toBe(''); });
      it('strips <b> tag', () => { expect(stripHtml('<b>삼성</b>')).toBe('삼성'); });
      it('strips nested tags', () => { expect(stripHtml('<i><b>X</b></i>')).toBe('X'); });
      it('decodes &quot;', () => { expect(stripHtml('&quot;hi&quot;')).toBe('"hi"'); });
      it('decodes &#39;', () => { expect(stripHtml('&#39;X&#39;')).toBe("'X'"); });
      it('decodes hex &#x2019;', () => { expect(stripHtml('&#x2019;')).toBe('\u2019'); });
      it('decodes common named entities', () => { expect(stripHtml('&amp; &lt; &gt; &nbsp;')).toBe('& < >  '.trim()); });
      it('preserves Korean', () => { expect(stripHtml('한글 테스트')).toBe('한글 테스트'); });
    });

    describe('parsePubDate (V-05)', () => {
      it('parses RFC 822 +0900', () => {
        expect(parsePubDate('Fri, 17 Apr 2026 14:32:00 +0900')).toBe('2026-04-17T05:32:00.000Z');
      });
      it('returns null for invalid string', () => { expect(parsePubDate('invalid')).toBeNull(); });
      it('returns null for empty', () => { expect(parsePubDate('')).toBeNull(); });
    });

    describe('extractSourcePrefix (V-06)', () => {
      it('strips www', () => { expect(extractSourcePrefix('https://www.hankyung.com/x')).toBe('hankyung'); });
      it('handles news.mt.co.kr → mt', () => { expect(extractSourcePrefix('https://news.mt.co.kr/x')).toBe('mt'); });
      it('strips m. subdomain', () => { expect(extractSourcePrefix('https://m.chosun.com/x')).toBe('chosun'); });
      it('naver special-case (n.news.naver.com)', () => { expect(extractSourcePrefix('https://n.news.naver.com/x')).toBe('naver'); });
      it('naver special-case (news.naver.com)', () => { expect(extractSourcePrefix('https://news.naver.com/x')).toBe('naver'); });
      it('strips biz. subdomain', () => { expect(extractSourcePrefix('https://biz.chosun.com/x')).toBe('chosun'); });
      it('returns null for invalid URL', () => { expect(extractSourcePrefix('not-a-url')).toBeNull(); });
      it('returns null for empty', () => { expect(extractSourcePrefix('')).toBeNull(); });
      it('rejects non-http(s) protocols', () => { expect(extractSourcePrefix('ftp://evil.com')).toBeNull(); });
      it('rejects javascript: protocol (T-02 defense)', () => { expect(extractSourcePrefix('javascript:alert(1)')).toBeNull(); });
    });
    ```

    `packages/shared/src/index.ts` 끝에 한 줄 추가:
    ```ts
    export { stripHtml, parsePubDate, extractSourcePrefix } from "./news-sanitize.js";
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/shared test -- news-sanitize.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - V-04: `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -t stripHtml` 그린
    - V-05: `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -t parsePubDate` 그린
    - V-06: `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -t extractSourcePrefix` 그린
    - `grep -q "stripHtml" packages/shared/src/index.ts` → 1 match (re-export)
    - `grep -q "parsePubDate" packages/shared/src/index.ts` → 1 match
    - `grep -q "extractSourcePrefix" packages/shared/src/index.ts` → 1 match
    - `grep -E "sanitize-html|striptags|dompurify" packages/shared/package.json` → 0 match (guardrail)
  </acceptance_criteria>
  <done>pnpm -F @gh-radar/shared test 명령 exit 0 + 최소 21 test case 그린</done>
</task>

<task type="auto">
  <name>Task 3: 후속 plan 용 테스트 스텁/픽스처 스캐폴드 + workers/news-sync vitest 설정</name>
  <files>
    workers/news-sync/vitest.config.ts,
    workers/news-sync/tests/helpers/supabase-mock.ts,
    workers/news-sync/tests/helpers/naver-fixtures.ts,
    server/tests/routes/news.test.ts,
    webapp/e2e/specs/news.spec.ts,
    webapp/e2e/fixtures/news.ts,
    webapp/e2e/fixtures/mock-api.ts
  </files>
  <read_first>
    - workers/master-sync/vitest.config.ts (참고 템플릿)
    - workers/master-sync/tests/helpers/supabase-mock.ts (있다면)
    - server/vitest.config.ts (include 패턴 — `tests/**/*.test.ts` 이므로 서버 테스트는 server/tests/ 아래 배치)
    - server/tests/routes/stock-detail.test.ts (server 테스트 패턴 — import 경로 `../../src/app`)
    - webapp/e2e/fixtures/mock-api.ts (기존 패턴 — 본 task 에서 news 섹션 확장)
    - webapp/e2e/specs/stock-detail.spec.ts (Playwright 테스트 패턴)
    - webapp/e2e/auth.setup.ts (auth fixture)
    - packages/shared/src/news.ts (camelCase NewsArticle 스키마 — fixture 필드명 기준)
    - .planning/phases/07-news-ingestion/07-VALIDATION.md Wave 0 Requirements 섹션
  </read_first>
  <action>
    이 task 는 후속 plan 의 `<verify>` 명령이 MISSING 으로 떨어지지 않도록 **스텁** 만 생성한다. 실제 구현은 각 plan 이 채운다.

    파일 1 — `workers/news-sync/vitest.config.ts`:
    ```ts
    import { defineConfig } from 'vitest/config';
    export default defineConfig({
      test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        environment: 'node',
      },
    });
    ```

    파일 2 — `workers/news-sync/tests/helpers/supabase-mock.ts` (master-sync helpers 패턴 복사):
    ```ts
    // Phase 07 — Supabase JS SDK 모킹 헬퍼. workers/news-sync 테스트 전용.
    import { vi } from 'vitest';

    export function createSupabaseMock(tables: Record<string, unknown[]> = {}) {
      const store = { ...tables } as Record<string, unknown[]>;
      const fromSpy = vi.fn((table: string) => {
        const rows = store[table] ?? [];
        const chain = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn((row: unknown) => { (store[table] ??= []).push(row); return Promise.resolve({ data: null, error: null }); }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          delete: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({ count: 0, error: null }),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
        };
        return chain;
      });
      const rpcSpy = vi.fn().mockResolvedValue({ data: 1, error: null });
      return { from: fromSpy, rpc: rpcSpy, _store: store };
    }
    ```

    파일 3 — `workers/news-sync/tests/helpers/naver-fixtures.ts`:
    ```ts
    // Phase 07 — Naver Search API 응답 샘플. 실제 응답 필드 (CONTEXT D3 + RESEARCH §1.1) 와 일치.
    export const NAVER_NEWS_SAMPLE_OK = {
      lastBuildDate: 'Fri, 17 Apr 2026 14:32:00 +0900',
      total: 4823,
      start: 1,
      display: 20,
      items: [
        {
          title: '<b>삼성전자</b>, 1분기 영업익 6.6조원 기록',
          originallink: 'https://www.hankyung.com/article/202604170142',
          link: 'https://n.news.naver.com/mnews/article/015/0005012345',
          description: '<b>삼성전자</b>가 17일 발표한 1분기 잠정실적에 따르면...',
          pubDate: 'Fri, 17 Apr 2026 14:32:00 +0900',
        },
      ],
    };

    export const NAVER_NEWS_SAMPLE_EMPTY = { lastBuildDate: '', total: 0, start: 1, display: 20, items: [] };
    ```

    파일 4 — `server/tests/routes/news.test.ts` (vitest config `include: ["tests/**/*.test.ts"]` 에 맞춘 경로):
    ```ts
    import { describe, it } from 'vitest';

    describe('GET /api/stocks/:code/news (V-13/V-15)', () => {
      it.todo('clamps days > 7 to 7');
      it.todo('clamps limit > 100 to 100');
      it.todo('returns 400 for invalid code XYZ');
      it.todo('returns 404 when master code not found');
      it.todo('returns 200 with news items for valid code');
    });

    describe('POST /api/stocks/:code/news/refresh (V-14)', () => {
      it.todo('returns 429 + retry_after_seconds on cooldown');
      it.todo('sets Retry-After header on 429');
      it.todo('returns 503 on budget exhausted');
      it.todo('returns 200 with updated news on success');
    });

    describe('CORS exposedHeaders (V-16)', () => {
      it.todo('exposes Retry-After header via Access-Control-Expose-Headers');
    });
    ```

    파일 5 — `webapp/e2e/specs/news.spec.ts`:
    ```ts
    import { test, expect } from '@playwright/test';

    test.describe('News — detail list (V-17)', () => {
      test.skip('renders 5 news items + 더보기 link on /stocks/005930', async () => {});
      test.skip('items have target="_blank" rel="noopener noreferrer"', async () => {});
    });

    test.describe('News — full page (V-18)', () => {
      test.skip('renders up to 100 items on /stocks/005930/news', async () => {});
      test.skip('← back link navigates to /stocks/005930', async () => {});
    });

    test.describe('News — refresh cooldown (V-19)', () => {
      test.skip('second refresh within 30s → 429 + button disabled + countdown visible', async () => {});
    });

    test.describe('News — a11y (V-20)', () => {
      test.skip('axe scan has 0 serious/critical violations on news section', async () => {});
    });
    ```

    파일 6 — `webapp/e2e/fixtures/news.ts` (⚠️ camelCase 필드명 — `packages/shared/src/news.ts::NewsArticle` 스키마와 일치. Plan 07-03 서버가 `toNewsArticle` mapper 로 snake_case → camelCase 변환하므로 E2E fixture 는 최종 클라이언트 응답 형태를 흉내내야 한다):
    ```ts
    // Phase 07 — Playwright fixture: /api/stocks/:code/news* 라우트 mock.
    // 필드명 = NewsArticle (camelCase). 서버 mapper(server/src/mappers/news.ts) 출력과 동일.
    import type { Page } from '@playwright/test';

    export const NEWS_ITEM_SAMPLE = {
      id: 'a1b2',
      stockCode: '005930',
      title: '삼성전자, 1분기 영업익 6.6조원 기록',
      source: 'hankyung',
      url: 'https://www.hankyung.com/article/202604170142',
      publishedAt: '2026-04-17T05:32:00.000Z',
      createdAt: '2026-04-17T05:32:10.000Z',
    };

    export function buildNewsList(code: string, n: number) {
      return Array.from({ length: n }).map((_, i) => ({
        ...NEWS_ITEM_SAMPLE,
        id: `news-${code}-${i}`,
        stockCode: code,
        title: `${NEWS_ITEM_SAMPLE.title} #${i}`,
      }));
    }

    export async function mockNewsApi(page: Page, opts: {
      code: string;
      list?: unknown[];
      refreshResult?: 'ok' | 'cooldown' | 'error';
      refreshRetryAfter?: number;
    }) {
      const { code, list = [], refreshResult = 'ok', refreshRetryAfter = 25 } = opts;
      await page.route(`**/api/stocks/${code}/news?**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }));
      await page.route(`**/api/stocks/${code}/news`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }));
      await page.route(`**/api/stocks/${code}/news/refresh`, (route) => {
        if (refreshResult === 'cooldown') {
          return route.fulfill({ status: 429, headers: { 'Retry-After': String(refreshRetryAfter) }, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NEWS_REFRESH_COOLDOWN', message: '잠시 후 다시 시도해주세요' }, retry_after_seconds: refreshRetryAfter }) });
        }
        if (refreshResult === 'error') {
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NAVER_UNAVAILABLE', message: 'naver client not configured' } }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...(list as unknown[])]) });
      });
    }
    ```

    파일 7 — `webapp/e2e/fixtures/mock-api.ts` — 기존 파일에 news 섹션 import/re-export 만 추가:
    ```ts
    // (기존 코드 위에 import 추가)
    export { mockNewsApi, NEWS_ITEM_SAMPLE, buildNewsList } from './news';
    ```
    (기존 파일 읽고 끝에 한 줄만 추가)
  </action>
  <verify>
    <automated>test -f workers/news-sync/vitest.config.ts &amp;&amp; test -f workers/news-sync/tests/helpers/supabase-mock.ts &amp;&amp; test -f workers/news-sync/tests/helpers/naver-fixtures.ts &amp;&amp; test -f server/tests/routes/news.test.ts &amp;&amp; test -f webapp/e2e/specs/news.spec.ts &amp;&amp; test -f webapp/e2e/fixtures/news.ts &amp;&amp; grep -q "mockNewsApi" webapp/e2e/fixtures/mock-api.ts &amp;&amp; grep -q "it.todo" server/tests/routes/news.test.ts &amp;&amp; grep -q "stockCode" webapp/e2e/fixtures/news.ts &amp;&amp; grep -q "publishedAt" webapp/e2e/fixtures/news.ts</automated>
  </verify>
  <acceptance_criteria>
    - 7개 파일 모두 생성 (test 명령으로 확인)
    - `server/tests/routes/news.test.ts` 에 `it.todo` 최소 8개 존재: `grep -c "it.todo" server/tests/routes/news.test.ts` ≥ 8
    - `webapp/e2e/specs/news.spec.ts` 에 `test.skip` 최소 5개 존재: `grep -c "test.skip" webapp/e2e/specs/news.spec.ts` ≥ 5
    - `webapp/e2e/fixtures/mock-api.ts` 에 `mockNewsApi` re-export 추가 (기존 export 보존)
    - `workers/news-sync/tests/helpers/supabase-mock.ts` 에 `createSupabaseMock` export 존재
    - `webapp/e2e/fixtures/news.ts` 의 `NEWS_ITEM_SAMPLE` 이 camelCase 필드를 사용: `grep -q "stockCode" webapp/e2e/fixtures/news.ts` + `grep -q "publishedAt" webapp/e2e/fixtures/news.ts` + `grep -q "createdAt" webapp/e2e/fixtures/news.ts` (모두 1 match). snake_case `stock_code` / `published_at` / `created_at` 은 0 match: `! grep -E "stock_code|published_at|created_at" webapp/e2e/fixtures/news.ts`
  </acceptance_criteria>
  <done>모든 스텁 파일 생성, grep 검증 통과, 기존 server/webapp 테스트 회귀 없음 (`pnpm -F @gh-radar/server test --run` 및 `pnpm -F @gh-radar/webapp test --run` 그린)</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4 [BLOCKING]: supabase db push — 마이그레이션 적용</name>
  <files>supabase/ (remote DB state)</files>
  <what-built>
    Task 1 에서 생성한 2개 마이그레이션 파일을 Supabase linked project 에 적용한다.
    이 task 완료 전엔 후속 plan(02/03) 의 worker/server 가 `api_usage` 테이블과 `incr_api_usage` RPC 를 참조할 수 없다 — 빌드/타입체크는 통과하지만 런타임 에러.
    Phase 01 precedent: 기존 모든 Supabase 마이그레이션 적용에 `supabase db push` 사용.
  </what-built>
  <how-to-verify>
    사용자가 다음 단계를 직접 실행 (Supabase CLI 가 인터랙티브 확인을 요구할 수 있음):

    1. 터미널에서:
       ```bash
       supabase db push
       ```
       (프롬프트가 나오면 Y 확인 — dry-run 으로 변경 리스트를 먼저 확인하고 싶으면 `supabase db push --dry-run` 먼저)

    2. 적용 후 다음 SQL 로 검증:
       ```bash
       # Supabase Dashboard SQL Editor 또는 psql 로:
       SELECT tablename FROM pg_tables WHERE tablename = 'api_usage';     -- 1 row
       SELECT proname  FROM pg_proc  WHERE proname  = 'incr_api_usage';   -- 1 row
       SELECT indexname FROM pg_indexes WHERE indexname = 'idx_news_created_at';   -- 1 row
       SELECT relrowsecurity FROM pg_class WHERE relname = 'api_usage';  -- t
       ```

    3. 성공 후 "approved" 로 resume. 실패 시 에러 메시지 전체 공유.

    만약 Supabase CLI 가 아닌 Dashboard SQL Editor 수동 적용을 선호하면:
    - `supabase/migrations/20260417120000_api_usage.sql` 복붙 → Run
    - `supabase/migrations/20260417120100_news_created_at_idx.sql` 복붙 → Run
  </how-to-verify>
  <resume-signal>Type "approved" or paste error output</resume-signal>
  <action>
    사용자가 `supabase db push` (또는 Dashboard SQL Editor 수동 적용)을 실행해 Task 1 에서 생성한 2개 마이그레이션(`20260417120000_api_usage.sql`, `20260417120100_news_created_at_idx.sql`)을 Supabase linked project 에 적용. 적용 후 위 `how-to-verify` 의 4개 SQL 로 검증.
  </action>
  <verify>
    <automated>MISSING — 사용자가 실행한 `supabase db push` 완료 및 4개 SQL (SELECT tablename / SELECT proname / SELECT indexname / SELECT relrowsecurity) 모두 1 row 결과 확인 후 "approved" resume</automated>
  </verify>
  <done>supabase db push 성공 + 4개 SQL 검증 모두 통과 (api_usage 테이블 + incr_api_usage RPC + idx_news_created_at 인덱스 + RLS enabled)</done>
  <acceptance_criteria>
    - `SELECT tablename FROM pg_tables WHERE tablename = 'api_usage'` → 1 row
    - `SELECT proname FROM pg_proc WHERE proname = 'incr_api_usage'` → 1 row
    - `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_news_created_at'` → 1 row
    - `SELECT relrowsecurity FROM pg_class WHERE relname = 'api_usage'` → t (RLS enabled)
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-01)

| Boundary | Description |
|----------|-------------|
| migration → DB | 마이그레이션이 RLS/권한 정책을 올바르게 설정해야 함 (서비스 롤 분리) |
| shared module → consumers | 정규식 sanitize 가 stored-XSS 방어의 1차 layer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03 | Tampering (Stored XSS) | `packages/shared/src/news-sanitize.ts::stripHtml` | mitigate | HTML 태그 + entity 제거 — React 기본 text escape 와 함께 2중 방어. unit test 최소 8 case 로 `<b>`/nested/entity/한글 보존 검증 (V-04). |
| T-06 | Tampering (counter 위변조) | `api_usage` 테이블 | mitigate | RLS enable + 정책 0 = anon/authenticated 전면 deny, service_role 만 RLS bypass. RPC 는 SECURITY DEFINER + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`. |
| T-08 | Tampering (SQL injection) | `incr_api_usage` RPC | mitigate | `SET search_path = public` + 파라미터화(`p_service text, p_date date, p_amount int`) — 동적 SQL 사용 안 함. Supabase RPC 인터페이스 자체가 parametric. |
| T-10 | Repudiation (content_hash 충돌) | 추후 news-sync 가 작성하는 sha256 기반 content_hash | accept (deferred) | Plan 02 의 worker pipeline 에서 sha256 사용. 충돌 확률 무시(2^128). 본 plan 범위엔 hash 생성 코드 없음. |
</threat_model>

<verification>
- `test -f` × 4 마이그레이션/스텁 파일 존재
- `pnpm -F @gh-radar/shared test --run` → news-sanitize.test.ts 최소 21 case 그린 (V-04/V-05/V-06)
- `grep -q "stripHtml" packages/shared/src/index.ts` — 공용 export 경로 확인
- `supabase db push` 후 `SELECT tablename FROM pg_tables WHERE tablename='api_usage'` → 1 row
- `grep -E "sanitize-html|striptags|dompurify|date-fns-tz" packages/shared/package.json server/package.json webapp/package.json` → 0 match (신규 dep 금지 guardrail)
</verification>

<success_criteria>
- 2개 마이그레이션 파일 생성 + `supabase db push` 성공 → `api_usage` 테이블, `incr_api_usage` RPC, `idx_news_created_at` 인덱스 DB 반영
- `packages/shared/src/news-sanitize.ts` 3개 함수 export + vitest 그린 (V-04/V-05/V-06 PASS)
- 7개 테스트 스텁 파일(server/webapp/worker) 생성 — 후속 plan 의 `<verify>` 가 MISSING 에서 벗어남
- `pnpm -r typecheck` 그린 — 기존 워크스페이스 회귀 없음
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-01-SUMMARY.md`:
- 마이그레이션 2개 적용 결과 (psql 출력)
- news-sanitize.test.ts vitest 결과 (pass count)
- 생성한 스텁 파일 7개 리스트
- 발견한 이슈 / 후속 plan 에 영향 주는 결정
</output>
