---
plan: 08-01
phase: 08
type: execute
wave: 0
depends_on: [08-00]
requirements: [DISC-01]
files_modified:
  - packages/shared/src/discussion.ts
  - packages/shared/src/discussion-sanitize.ts
  - packages/shared/src/__tests__/discussion-sanitize.test.ts
  - packages/shared/src/index.ts
  - packages/shared/package.json
  - server/tests/routes/discussions.test.ts
  - webapp/e2e/specs/discussions.spec.ts
  - webapp/e2e/fixtures/discussions.ts
  - webapp/e2e/fixtures/mock-api.ts
  - workers/discussion-sync/vitest.config.ts
  - workers/discussion-sync/package.json
  - workers/discussion-sync/tsconfig.json
  - workers/discussion-sync/Dockerfile
  - workers/discussion-sync/tests/helpers/supabase-mock.ts
  - pnpm-workspace.yaml
autonomous: true
threat_refs: [T-01, T-06, T-10]

must_haves:
  truths:
    - "packages/shared/src/discussion.ts 의 camelCase Discussion 타입이 export 된다 (id/stockCode/postId/title/body/author/postedAt/scrapedAt/url)"
    - "packages/shared/src/discussion-sanitize.ts 의 3개 함수 stripHtmlToPlaintext / extractNid / parseNaverBoardDate 가 export 된다"
    - "workers/discussion-sync/ 디렉터리가 Phase 7 news-sync 복제 기반으로 스캐폴드되어 pnpm workspace 인식 (@gh-radar/discussion-sync)"
    - "server/tests/routes/discussions.test.ts 가 it.todo 8개로 스텁된 상태로 존재 (캐시 hit/miss, 쿨다운 429, Zod clamp, 에러 envelope, 빈 상태, retry_after, upsert 결과, 필터)"
    - "webapp/e2e/fixtures/discussions.ts 가 camelCase sample + mockDiscussionsApi 로 존재"
    - "webapp/e2e/specs/discussions.spec.ts 가 test.skip 스텁 5~6개로 존재"
    - "packages/shared 에 sanitize-html 은 도입되지 않는다 (V-20 guardrail — sanitize-html 은 workers/discussion-sync + server 에만)"
  artifacts:
    - path: "packages/shared/src/discussion.ts"
      provides: "camelCase Discussion 타입 계약"
      exports: ["Discussion"]
    - path: "packages/shared/src/discussion-sanitize.ts"
      provides: "3개 순수 함수 — regex 기반(sanitize-html 없이 shared 에서 동작 가능)"
      exports: ["stripHtmlToPlaintext", "extractNid", "parseNaverBoardDate"]
    - path: "packages/shared/src/__tests__/discussion-sanitize.test.ts"
      provides: "V-04/V-05/V-06 unit test (Phase 8 범위) 구현"
      min_lines: 60
    - path: "workers/discussion-sync/Dockerfile"
      provides: "Cloud Run Job 이미지 빌드 (Phase 7 news-sync 복제)"
      contains: "COPY workers/discussion-sync"
    - path: "workers/discussion-sync/package.json"
      provides: "@gh-radar/discussion-sync workspace"
      contains: "@gh-radar/discussion-sync"
    - path: "webapp/e2e/fixtures/discussions.ts"
      provides: "camelCase discussion sample + mockDiscussionsApi"
      exports: ["DISCUSSION_ITEM_SAMPLE", "buildDiscussionList", "mockDiscussionsApi"]
  key_links:
    - from: "packages/shared/src/index.ts"
      to: "packages/shared/src/discussion.ts + discussion-sanitize.ts"
      via: "re-export"
      pattern: "from \"./discussion"
    - from: "webapp/e2e/fixtures/mock-api.ts"
      to: "discussions.ts"
      via: "re-export"
      pattern: "mockDiscussionsApi"
---

> **POC pivot:** 본 plan 은 `08-POC-PIVOT.md` 의 "Plan 08-01 델타" 섹션과 함께 읽어야 합니다. Plan 08-00 POC 결과로 (JSON API 채택, cheerio/iconv-lite 제거, parseNaverBoardDate 입력 포맷 변경 등) 확정된 사항이 그곳에 있으며, 본 plan 의 원 기술 제안과 충돌 시 PIVOT 문서가 우선합니다. 또한 `naver-board-types.ts` / `naver-board-fixtures.ts` 는 Plan 08-00 에서 이미 생성됨 — 본 plan 에서 재생성 금지 (skip).

<objective>
Wave 0 — Phase 8 후속 plan 들이 의존하는 공통 인프라를 확보한다:
(1) `packages/shared/src/discussion.ts` camelCase Discussion 타입 (per D9: `id, stockCode, postId, title, body, author, postedAt, scrapedAt, url`)
(2) `packages/shared/src/discussion-sanitize.ts` — 3개 순수 함수 `stripHtmlToPlaintext` (regex 기반) / `extractNid(url)` / `parseNaverBoardDate(raw)` + 완전한 unit test
(3) `workers/discussion-sync/` 디렉터리 — Phase 7 `workers/news-sync/` 1:1 복제 (package.json, tsconfig, Dockerfile, vitest.config) — 이름만 치환, fetcher 교체는 Plan 08-02 에서
(4) 후속 테스트 스텁 (server / webapp e2e / worker fixture)

Purpose: Nyquist 의 "검증 선행" 원칙. 이 plan 이 없으면 후속 plan `<verify>` 가 MISSING 으로 떨어지거나 workspace 인식 실패. Plan 08-00 POC 에서 확정된 body fetch 옵션·selector 를 후속 plan 이 곧바로 소비 가능한 상태로 만든다.

Output: 14개 파일 (shared 타입/sanitize/test + worker 디렉터리 4개 + server 스텁 + webapp fixture/spec 3개).
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

@packages/shared/src/index.ts
@packages/shared/src/news.ts
@packages/shared/src/news-sanitize.ts
@packages/shared/src/__tests__/news-sanitize.test.ts
@packages/shared/package.json

@workers/news-sync/package.json
@workers/news-sync/tsconfig.json
@workers/news-sync/Dockerfile
@workers/news-sync/vitest.config.ts
@workers/news-sync/tests/helpers/supabase-mock.ts

@server/vitest.config.ts
@server/tests/routes/news.test.ts

@webapp/e2e/fixtures/news.ts
@webapp/e2e/fixtures/mock-api.ts
@webapp/e2e/specs/news.spec.ts

@pnpm-workspace.yaml

<interfaces>
## 기존 `packages/shared/src/index.ts` (read-only 기준 — 본 plan 이 한 줄 추가)

Phase 7 이후 현재 (Phase 8 01-01 전 상태):
```ts
export type { Stock, Market, SecurityType, StockMaster, StockQuote, StockWithQuote } from "./stock.js";
export type { NewsArticle } from "./news.js";
export { stripHtml, parsePubDate, extractSourcePrefix } from "./news-sanitize.js";
// ... 기타
```

본 plan 추가 2줄:
```ts
export type { Discussion } from "./discussion.js";
export { stripHtmlToPlaintext, extractNid, parseNaverBoardDate } from "./discussion-sanitize.js";
```

## 기존 Discussion DB 스키마 (supabase/migrations/20260413120000_init_tables.sql:58-71 + FK re-point)

```sql
CREATE TABLE discussions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code  text        NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  post_id     text        NOT NULL,
  title       text        NOT NULL,
  body        text,
  author      text,
  posted_at   timestamptz NOT NULL,
  scraped_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_code, post_id)
);
CREATE INDEX idx_discussions_stock_posted ON discussions (stock_code, posted_at DESC);
```
→ 본 plan 의 `Discussion` camelCase 타입은 snake_case row 를 **서버 mapper** (Plan 08-03) 가 변환한 후의 shape 이다.

## Phase 7 news-sync Dockerfile (복제 기준 — workers/news-sync/Dockerfile 전체를 1:1 복사 후 sed)

치환 대상 3곳:
- `workers/news-sync/package.json` → `workers/discussion-sync/package.json` (COPY path 2곳)
- `@gh-radar/news-sync` → `@gh-radar/discussion-sync` (pnpm filter 2곳)
- `COPY workers/news-sync/` → `COPY workers/discussion-sync/` (COPY 소스 2곳)

## Phase 7 news-sync tsconfig.json (복제 기준 — 1:1 복사, 수정 없음)

## pnpm-workspace.yaml (변경 없음 — `workers/*` glob 이 discussion-sync 자동 흡수)
```yaml
packages:
  - "packages/*"
  - "webapp"
  - "server"
  - "workers/*"
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: packages/shared — Discussion 타입 + discussion-sanitize 3개 함수 + unit test</name>
  <files>
    packages/shared/src/discussion.ts,
    packages/shared/src/discussion-sanitize.ts,
    packages/shared/src/__tests__/discussion-sanitize.test.ts,
    packages/shared/src/index.ts,
    packages/shared/package.json
  </files>
  <read_first>
    - packages/shared/src/index.ts (기존 export 패턴 - 전체 읽기, 추가 위치 식별)
    - packages/shared/src/news.ts (NewsArticle camelCase 타입 - Phase 7 수립)
    - packages/shared/src/news-sanitize.ts (Phase 7 `stripHtml` regex 기반 패턴 — 본 plan 의 `stripHtmlToPlaintext` 는 이와 **분리된 모듈**이며 네이버 토론방 body 는 더 광범위 HTML 대응 필요)
    - packages/shared/src/__tests__/news-sanitize.test.ts (test 패턴 참조)
    - packages/shared/package.json (현재 deps — sanitize-html 추가 금지 확인)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Code Examples" discussion-sanitize.ts 스니펫
    - .planning/phases/08-discussion-board/08-CONTEXT.md D9 (camelCase 필드), D10 (필드 매핑), D11 (스팸 필터)
    - .planning/phases/08-discussion-board/POC-RESULTS.md §3 (DOM selector 확정), §4 (body 수집 경로)
  </read_first>
  <behavior>
    `Discussion` 타입 (camelCase, D9 준수):
      - id: string
      - stockCode: string
      - postId: string
      - title: string
      - body: string | null    // plaintext (HTML stripped). POC §4 옵션 2 채택 시 string, 옵션 1 채택 시 주로 null
      - author: string | null   // 네이버 닉네임 그대로, 마스킹 없음 (CONTEXT D10)
      - postedAt: string        // ISO timestamptz (KST offset 포함 또는 Z)
      - scrapedAt: string       // ISO (TTL 계산용, D4)
      - url: string             // 네이버 고유 URL (nid 포함)

    `stripHtmlToPlaintext(html: string): string`:
      - 빈 입력 → ''
      - '<p>삼성</p>' → '삼성'
      - '<a href="http://spam">click</a>광고' → 'click광고' (태그 제거)
      - '<b>1</b>&lt;b&gt;2&lt;/b&gt;' → '1<b>2</b>' (escaped 엔티티 디코드 후)  ※ 주의: 기대값 정밀 정의 — HTML escape 엔티티 디코드 먼저, 실제 태그 strip 두번째 (또는 반대). 구현 단순성 위해 엔티티 디코드 후 태그 strip 1회 에러 허용.
      - '&amp;nbsp;' → ' ' (entity decode)
      - 한글 보존
      - 공백 수축: multiple whitespace → single space → trim
      - **regex 기반 구현** (packages/shared 에 sanitize-html 도입 금지 — V-20 guardrail 준수. sanitize-html 은 server + worker 에만 도입됨). Phase 7 `stripHtml` 과 독립 함수로 작성 (목적이 다름 — news 제목은 간단 HTML, discussion body 는 다양 HTML 이라 분리 유지).

    `extractNid(hrefOrUrl: string): string | null`:
      - `/item/board_read.naver?code=005930&nid=272617128` → '272617128'
      - `https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128&st=&sw=&page=1` → '272617128'
      - `/item/board_read.naver?nid=123&code=005930` → '123'
      - `invalid` → null
      - '' → null
      - fallback regex (RESEARCH Pitfall 4): `articleId=(\d+)` 도 매치 (호환성)
      - nid 자리수 sanity: 6~12 자리 숫자가 아니면 null (안전장치)

    `parseNaverBoardDate(raw: string): string | null`:
      - '2026.04.17 14:32' → '2026-04-17T14:32:00+09:00' (KST offset 명시)
      - '2026.04.17  14:32' (더블 스페이스) → '2026-04-17T14:32:00+09:00' (tolerant)
      - 'invalid' → null
      - '' → null
      - **date-fns-tz 금지** (V-20 guardrail — Phase 7 과 동일). 수동 regex + 문자열 조합만.
  </behavior>
  <action>
    **Step A — packages/shared/package.json 확인:**
    - `grep 'sanitize-html\|striptags\|dompurify' packages/shared/package.json` → 0 match 여야 함 (V-20 유지 — shared 에는 도입하지 않음).
    - 변경 없음. 단 Phase 7 복제로 script 섹션이 이미 vitest 지원 → 그대로 유지.

    **Step B — `packages/shared/src/discussion.ts` 신규:**
    ```ts
    /**
     * Phase 08 — 네이버 종목토론방 게시글 공용 타입 (camelCase).
     * server/src/mappers/discussions.ts::toDiscussion 의 출력 shape 이자
     * webapp/src/lib/stock-api.ts::fetchStockDiscussions 응답 계약.
     *
     * snake_case DB row 는 서버 mapper 에서 변환되어 이 shape 으로 프론트에 노출됨.
     * Phase 9 DISC-02(AI 요약) 가 확장할 여지: summaryId, sentiment (본 phase 범위 밖).
     */
    export type Discussion = {
      id: string;
      stockCode: string;
      postId: string;
      title: string;
      body: string | null;
      author: string | null;
      postedAt: string;
      scrapedAt: string;
      url: string;
    };
    ```

    **Step C — `packages/shared/src/discussion-sanitize.ts` 신규 (regex 기반, Phase 7 `news-sanitize.ts` 스타일 계승):**
    ```ts
    /**
     * Phase 08 — Naver 종목토론방 스크래핑 결과 sanitize 모듈.
     * server/worker 양쪽이 import. sanitize-html 의존성은 **server + worker 내부 구현**에서만
     * 도입하고, packages/shared 는 regex 기반 best-effort 를 제공하여 번들 크기 유지.
     * V-20 guardrail: sanitize-html / striptags / dompurify / date-fns-tz import 금지.
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
    const WHITESPACE_RE = /\s+/g;

    /** 전체 HTML 을 plaintext 로 변환. 엔티티 디코드 → 태그 제거 → 공백 정규화 → trim. */
    export function stripHtmlToPlaintext(input: string): string {
      if (!input) return '';
      // 1. Named entities
      let s = input;
      for (const [k, v] of Object.entries(NAMED_ENTITIES)) s = s.replaceAll(k, v);
      // 2. Numeric/hex entities
      s = s.replace(NUMERIC_ENTITY_RE, (_, n) => {
        try { return String.fromCodePoint(Number(n)); } catch { return ''; }
      });
      s = s.replace(HEX_ENTITY_RE, (_, h) => {
        try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
      });
      // 3. Tags 제거
      s = s.replace(HTML_TAG_RE, '');
      // 4. 공백 정규화
      s = s.replace(WHITESPACE_RE, ' ').trim();
      return s;
    }

    const NID_RE = /[?&]nid=(\d{6,12})(?:&|$)/;
    const ARTICLE_ID_RE = /[?&]articleId=(\d{6,12})(?:&|$)/;  // RESEARCH Pitfall 4 — fallback

    /** 네이버 게시글 URL 의 nid 쿼리 파라미터 추출. 6~12자리 숫자 아니면 null. */
    export function extractNid(hrefOrUrl: string): string | null {
      if (!hrefOrUrl) return null;
      const m = hrefOrUrl.match(NID_RE);
      if (m) return m[1];
      const m2 = hrefOrUrl.match(ARTICLE_ID_RE);
      if (m2) return m2[1];
      return null;
    }

    const NAVER_DATE_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/;
    const NAVER_DATE_TOLERANT_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/; // 추가 공백/suffix 허용

    /** '2026.04.17 14:32' (KST) → '2026-04-17T14:32:00+09:00' ISO string. 실패 시 null. */
    export function parseNaverBoardDate(raw: string): string | null {
      if (!raw) return null;
      const trimmed = raw.trim().replace(/\s+/g, ' ');
      const m = trimmed.match(NAVER_DATE_RE) ?? trimmed.match(NAVER_DATE_TOLERANT_RE);
      if (!m) return null;
      const [, y, mo, d, h, mi] = m;
      // 범위 sanity
      const Y = Number(y), M = Number(mo), D = Number(d), H = Number(h), Mi = Number(mi);
      if (M < 1 || M > 12 || D < 1 || D > 31 || H > 23 || Mi > 59) return null;
      return `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
    }
    ```

    **Step D — `packages/shared/src/__tests__/discussion-sanitize.test.ts` 신규:**
    ```ts
    import { describe, it, expect } from 'vitest';
    import { stripHtmlToPlaintext, extractNid, parseNaverBoardDate } from '../discussion-sanitize.js';

    describe('stripHtmlToPlaintext (Phase 8)', () => {
      it('returns empty for empty input', () => { expect(stripHtmlToPlaintext('')).toBe(''); });
      it('strips simple tag', () => { expect(stripHtmlToPlaintext('<p>삼성</p>')).toBe('삼성'); });
      it('strips anchor with href', () => { expect(stripHtmlToPlaintext('<a href="http://spam">click</a>광고')).toBe('click광고'); });
      it('decodes named entities', () => { expect(stripHtmlToPlaintext('&amp;&lt;&gt;&quot;&nbsp;end')).toBe('& < > " end'); });
      it('decodes numeric entity &#39;', () => { expect(stripHtmlToPlaintext('&#39;X&#39;')).toBe("'X'"); });
      it('decodes hex entity &#x2019;', () => { expect(stripHtmlToPlaintext('&#x2019;hi')).toBe('\u2019hi'); });
      it('preserves Korean text', () => { expect(stripHtmlToPlaintext('한글 보존')).toBe('한글 보존'); });
      it('collapses multiple whitespace', () => { expect(stripHtmlToPlaintext('a   b\n\nc')).toBe('a b c'); });
      it('strips nested tags', () => { expect(stripHtmlToPlaintext('<div><span>X<b>Y</b></span></div>')).toBe('XY'); });
      it('handles stray <', () => { expect(stripHtmlToPlaintext('2 < 3')).toBe('2 < 3'); });
    });

    describe('extractNid (Phase 8)', () => {
      it('extracts nid from relative href', () => {
        expect(extractNid('/item/board_read.naver?code=005930&nid=272617128')).toBe('272617128');
      });
      it('extracts nid from full URL', () => {
        expect(extractNid('https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128&st=&sw=&page=1')).toBe('272617128');
      });
      it('extracts nid when first param', () => {
        expect(extractNid('/item/board_read.naver?nid=123456&code=005930')).toBe('123456');
      });
      it('returns null when nid missing', () => {
        expect(extractNid('/item/board.naver?code=005930')).toBeNull();
      });
      it('returns null for empty', () => {
        expect(extractNid('')).toBeNull();
      });
      it('returns null for invalid string', () => {
        expect(extractNid('not-a-url')).toBeNull();
      });
      it('rejects nid < 6 digits', () => {
        expect(extractNid('?nid=123')).toBeNull();
      });
      it('rejects nid > 12 digits', () => {
        expect(extractNid('?nid=1234567890123')).toBeNull();
      });
      it('fallback articleId', () => {
        expect(extractNid('?articleId=9999999&code=005930')).toBe('9999999');
      });
    });

    describe('parseNaverBoardDate (Phase 8)', () => {
      it('parses YYYY.MM.DD HH:mm', () => {
        expect(parseNaverBoardDate('2026.04.17 14:32')).toBe('2026-04-17T14:32:00+09:00');
      });
      it('tolerates multiple spaces', () => {
        expect(parseNaverBoardDate('2026.04.17  14:32')).toBe('2026-04-17T14:32:00+09:00');
      });
      it('returns null for invalid', () => {
        expect(parseNaverBoardDate('invalid')).toBeNull();
      });
      it('returns null for empty', () => {
        expect(parseNaverBoardDate('')).toBeNull();
      });
      it('returns null for out-of-range month', () => {
        expect(parseNaverBoardDate('2026.13.01 00:00')).toBeNull();
      });
      it('returns null for out-of-range hour', () => {
        expect(parseNaverBoardDate('2026.04.17 25:00')).toBeNull();
      });
    });
    ```

    **Step E — `packages/shared/src/index.ts` 에 2 줄 추가 (기존 export 유지):**
    ```ts
    // 기존 export 들 위에 또는 아래에 추가 (위치는 기존 Phase 7 export 근처)
    export type { Discussion } from "./discussion.js";
    export { stripHtmlToPlaintext, extractNid, parseNaverBoardDate } from "./discussion-sanitize.js";
    ```

    **Step F — Run tests:**
    ```bash
    pnpm -F @gh-radar/shared test -- discussion-sanitize.test.ts --run
    pnpm -F @gh-radar/shared typecheck
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/shared test -- discussion-sanitize.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - V-04 (Phase 8): `pnpm -F @gh-radar/shared test -- discussion-sanitize.test.ts -t stripHtmlToPlaintext` 그린, ≥10 cases
    - V-05 (Phase 8): extractNid 테스트 ≥9 cases 그린 (nid / fallback articleId / 자리수 sanity 포함)
    - V-06 (Phase 8): parseNaverBoardDate 테스트 ≥6 cases 그린
    - `grep -q "Discussion" packages/shared/src/index.ts` → 1+ match (re-export)
    - `grep -q "stripHtmlToPlaintext" packages/shared/src/index.ts` → 1 match
    - `grep -q "extractNid" packages/shared/src/index.ts` → 1 match
    - `grep -q "parseNaverBoardDate" packages/shared/src/index.ts` → 1 match
    - V-20 guardrail (shared 범위): `grep -E "sanitize-html|striptags|dompurify|date-fns-tz" packages/shared/package.json` → 0 match
    - camelCase 계약: `grep -q "stockCode" packages/shared/src/discussion.ts` + `grep -q "postId" packages/shared/src/discussion.ts` + `grep -q "postedAt" packages/shared/src/discussion.ts` + `grep -q "scrapedAt" packages/shared/src/discussion.ts` 모두 1 match. snake_case `stock_code|post_id|posted_at|scraped_at` 는 0 match: `! grep -E "stock_code|post_id|posted_at|scraped_at" packages/shared/src/discussion.ts`
    - `pnpm -F @gh-radar/shared typecheck` exit 0
  </acceptance_criteria>
  <done>3개 함수 + Discussion 타입 + 25+ test case 그린 + shared index re-export 완료 + V-20 guardrail 유지</done>
</task>

<task type="auto">
  <name>Task 2: workers/discussion-sync 디렉터리 스캐폴드 (Phase 7 news-sync 1:1 복제 + rename)</name>
  <files>
    workers/discussion-sync/package.json,
    workers/discussion-sync/tsconfig.json,
    workers/discussion-sync/Dockerfile,
    workers/discussion-sync/vitest.config.ts,
    workers/discussion-sync/tests/helpers/supabase-mock.ts,
    pnpm-workspace.yaml
  </files>
  <read_first>
    - workers/news-sync/package.json (deps 원본 — Phase 7 복제 기준)
    - workers/news-sync/tsconfig.json (1:1 복사)
    - workers/news-sync/Dockerfile (치환 대상 확인 — grep 으로 news-sync 문자열 위치 찾기)
    - workers/news-sync/vitest.config.ts (1:1 복사)
    - workers/news-sync/tests/helpers/supabase-mock.ts (1:1 복사)
    - pnpm-workspace.yaml (workers/* glob 확인 — 변경 불필요)
    - .planning/phases/08-discussion-board/POC-RESULTS.md §1 (프록시 서비스 선정 — deps 결정 영향)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Standard Stack" (cheerio 1.2.0 + sanitize-html 2.17.2 권장)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Phase 7 복제 매핑 표"
  </read_first>
  <action>
    **Step A — 디렉터리 스캐폴드:**
    ```bash
    mkdir -p workers/discussion-sync/src workers/discussion-sync/tests/helpers
    ```

    **Step B — `workers/discussion-sync/package.json` 신규 (news-sync package.json 기반 + rename + 신규 deps `cheerio@^1.2.0` `sanitize-html@^2.17.2`):**
    ```json
    {
      "name": "@gh-radar/discussion-sync",
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
        "cheerio": "^1.2.0",
        "dotenv": "^16.4.0",
        "p-limit": "^7.0.0",
        "pino": "^9.0.0",
        "sanitize-html": "^2.17.2"
      },
      "devDependencies": {
        "tsx": "^4.0.0",
        "typescript": "^5.0.0",
        "vitest": "^3.0.0",
        "@types/node": "^22.0.0",
        "@types/sanitize-html": "^2.13.0"
      }
    }
    ```
    (POC §2 에서 `iconv-lite` 필요 판정되면 deps 에 `iconv-lite@^0.6.3` + devDeps `@types/node` 내 Buffer 지원 그대로 추가. 조건부.)

    **Step C — `workers/discussion-sync/tsconfig.json` — news-sync 것 1:1 복사.**

    **Step D — `workers/discussion-sync/Dockerfile` — news-sync 를 1:1 복사 후 sed 치환:**
    `sed -e 's/news-sync/discussion-sync/g' workers/news-sync/Dockerfile > workers/discussion-sync/Dockerfile`
    치환 검증: `! grep -q "news-sync" workers/discussion-sync/Dockerfile && grep -c "discussion-sync" workers/discussion-sync/Dockerfile` ≥5 (COPY 2개 + pnpm filter 3개)

    **Step E — `workers/discussion-sync/vitest.config.ts` — news-sync 것 1:1 복사 (include 패턴 동일):**
    ```ts
    import { defineConfig } from 'vitest/config';
    export default defineConfig({
      test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        environment: 'node',
      },
    });
    ```

    **Step F — `workers/discussion-sync/tests/helpers/supabase-mock.ts` — news-sync 것 1:1 복사 (createSupabaseMock + rpc spy 동일):**
    ```ts
    // Phase 08 — Supabase JS SDK 모킹 헬퍼. workers/discussion-sync 테스트 전용.
    // Phase 7 workers/news-sync/tests/helpers/supabase-mock.ts 와 1:1 동일 (쓰임새 동일).
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
          in: vi.fn().mockReturnThis(),
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

    **Step G — pnpm install 실행 (`@gh-radar/discussion-sync` 신규 workspace 인식 + cheerio/sanitize-html 설치):**
    ```bash
    pnpm install
    ```

    Note: pnpm 이 cheerio/sanitize-html 을 news-sync workspace 에 전파하면 V-20 guardrail 회귀 — `pnpm ls -r --depth=0 sanitize-html` 결과 확인하고 news-sync 에 나타나면 Task 재작업.
  </action>
  <verify>
    <automated>test -f workers/discussion-sync/package.json &amp;&amp; test -f workers/discussion-sync/Dockerfile &amp;&amp; test -f workers/discussion-sync/tsconfig.json &amp;&amp; test -f workers/discussion-sync/vitest.config.ts &amp;&amp; test -f workers/discussion-sync/tests/helpers/supabase-mock.ts &amp;&amp; grep -q "@gh-radar/discussion-sync" workers/discussion-sync/package.json &amp;&amp; grep -q "cheerio" workers/discussion-sync/package.json &amp;&amp; grep -q "sanitize-html" workers/discussion-sync/package.json &amp;&amp; ! grep -q "news-sync" workers/discussion-sync/Dockerfile &amp;&amp; grep -q "discussion-sync" workers/discussion-sync/Dockerfile</automated>
  </verify>
  <acceptance_criteria>
    - 5개 파일 모두 존재 (test -f)
    - `workers/discussion-sync/package.json` 에 `"name": "@gh-radar/discussion-sync"` + `cheerio@^1.2.0` + `sanitize-html@^2.17.2` + `@types/sanitize-html`
    - Dockerfile 에 `news-sync` 문자열 0 match (`! grep -q "news-sync" workers/discussion-sync/Dockerfile`), `discussion-sync` ≥5 match
    - pnpm workspace 인식: `pnpm ls -r --depth=-1 | grep @gh-radar/discussion-sync` → 1 match
    - **Phase 7 V-20 guardrail 유지**: `pnpm ls -r --depth=0 --filter @gh-radar/news-sync sanitize-html 2>&1 | grep -c "sanitize-html"` → 0 (news-sync workspace 에 sanitize-html 침투 없음)
    - V-20 guardrail (shared 범위): `grep -E "sanitize-html|striptags|dompurify" packages/shared/package.json` → 0 match
  </acceptance_criteria>
  <done>workers/discussion-sync/ 디렉터리 스캐폴드 + pnpm install 성공 + workspace 인식 + Phase 7 news-sync 회귀 없음</done>
</task>

<task type="auto">
  <name>Task 3: server/webapp 테스트 스텁 생성 (server test + e2e spec + e2e fixture)</name>
  <files>
    server/tests/routes/discussions.test.ts,
    webapp/e2e/specs/discussions.spec.ts,
    webapp/e2e/fixtures/discussions.ts,
    webapp/e2e/fixtures/mock-api.ts
  </files>
  <read_first>
    - server/vitest.config.ts (include: tests/**/*.test.ts — path 확정)
    - server/tests/routes/news.test.ts (Phase 7 it.todo 스텁 스타일)
    - webapp/e2e/specs/news.spec.ts (Phase 7 test.skip 스탹 + auth fixture)
    - webapp/e2e/fixtures/news.ts (camelCase fixture 패턴)
    - webapp/e2e/fixtures/mock-api.ts (re-export 패턴 — 현재 줄 수 확인)
    - packages/shared/src/discussion.ts (Task 1 산출물 — camelCase 필드 확정)
    - .planning/phases/08-discussion-board/08-VALIDATION.md Per-Task Verification Map (위쪽 섹션)
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §Copywriting Contract (fixture 의 자연어 샘플 참조)
  </read_first>
  <action>
    **파일 1 — `server/tests/routes/discussions.test.ts`** (Phase 7 news.test.ts 스텁 스타일 계승):
    ```ts
    import { describe, it } from 'vitest';

    describe('GET /api/stocks/:code/discussions (Phase 8)', () => {
      it.todo('returns 200 with camelCase Discussion[] for valid code (hours=24, limit=5)');
      it.todo('clamps limit > 50 to 50 (server hard cap)');
      it.todo('returns 400 INVALID_QUERY_PARAM for invalid code XYZ-abc');
      it.todo('returns 404 STOCK_NOT_FOUND when master code missing');
      it.todo('cache hit: scrapedAt < 10min → returns DB rows without proxy call');
      it.todo('cache miss: scrapedAt >= 10min → triggers proxy scrape + upsert then returns');
      it.todo('applies spam filter (D11): title length < 5 OR URL in title → excluded from response');
      it.todo('returns [] when empty (not an error)');
    });

    describe('POST /api/stocks/:code/discussions/refresh (Phase 8)', () => {
      it.todo('returns 429 DISCUSSION_REFRESH_COOLDOWN when MAX(scraped_at) < 30s');
      it.todo('429 response body includes details.retry_after_seconds');
      it.todo('429 response has Retry-After header');
      it.todo('returns 503 PROXY_UNAVAILABLE when proxyClient not configured');
      it.todo('returns 503 PROXY_BUDGET_EXHAUSTED when api_usage count >= daily cap');
      it.todo('on success: proxy scrape → upsert (DO UPDATE SET scraped_at) → returns latest N');
    });

    describe('CORS exposedHeaders (Phase 8 reuses Phase 7 setup)', () => {
      it.todo('Retry-After is already exposed via Access-Control-Expose-Headers (Phase 7 added)');
    });
    ```

    **파일 2 — `webapp/e2e/specs/discussions.spec.ts`**:
    ```ts
    import { test } from '@playwright/test';

    test.describe('Discussion — detail Card (Phase 8)', () => {
      test.skip('renders 5 discussion items + 더보기 link on /stocks/005930', async () => {});
      test.skip('items have target="_blank" rel="noopener noreferrer"', async () => {});
      test.skip('each item shows title + body preview + author + time (MM/DD HH:mm KST)', async () => {});
    });

    test.describe('Discussion — full page (Phase 8)', () => {
      test.skip('renders up to 50 items on /stocks/005930/discussions (Compact 3-col grid)', async () => {});
      test.skip('column headers 제목/작성자/시간 render at md+ (≥720px)', async () => {});
      test.skip('column headers hidden on mobile (<720px) — grid-template-areas switched', async () => {});
      test.skip('← back link navigates to /stocks/005930', async () => {});
      test.skip('refresh button NOT present on full page (detail-only)', async () => {});
    });

    test.describe('Discussion — refresh cooldown (Phase 8)', () => {
      test.skip('second refresh within 30s → 429 + button disabled + data-remaining-seconds attribute', async () => {});
    });

    test.describe('Discussion — stale state (Phase 8 D7)', () => {
      test.skip('stale data present + refresh fails → "X분 전 데이터" Badge + list still visible', async () => {});
    });

    test.describe('Discussion — empty state (Phase 8)', () => {
      test.skip('empty → heading "아직 토론 글이 없어요" + CTA "토론방 새로고침"', async () => {});
    });

    test.describe('Discussion — a11y (Phase 8 axe)', () => {
      test.skip('axe scan has 0 serious/critical violations on discussion section + full page', async () => {});
    });
    ```

    **파일 3 — `webapp/e2e/fixtures/discussions.ts`** (camelCase, Discussion 타입 기반):
    ```ts
    // Phase 08 — Playwright fixture: /api/stocks/:code/discussions* 라우트 mock.
    // 필드명 = Discussion (camelCase). server/src/mappers/discussions.ts::toDiscussion 출력과 일치.
    import type { Page } from '@playwright/test';

    export const DISCUSSION_ITEM_SAMPLE = {
      id: 'd1e2f3a4',
      stockCode: '005930',
      postId: '272617128',
      title: '삼성전자 실적 기대감',
      body: '1분기 영업이익 시장 컨센서스 상회. 외인 순매수 유입.',
      author: 'abc****',
      postedAt: '2026-04-17T05:32:00+00:00',
      scrapedAt: '2026-04-17T05:40:00+00:00',
      url: 'https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128',
    };

    export function buildDiscussionList(code: string, n: number) {
      return Array.from({ length: n }).map((_, i) => ({
        ...DISCUSSION_ITEM_SAMPLE,
        id: `disc-${code}-${i}`,
        stockCode: code,
        postId: String(100000000 + i),
        title: `${DISCUSSION_ITEM_SAMPLE.title} #${i}`,
        url: `https://finance.naver.com/item/board_read.naver?code=${code}&nid=${100000000 + i}`,
      }));
    }

    export async function mockDiscussionsApi(page: Page, opts: {
      code: string;
      list?: unknown[];
      refreshResult?: 'ok' | 'cooldown' | 'error' | 'stale';
      refreshRetryAfter?: number;
    }) {
      const { code, list = [], refreshResult = 'ok', refreshRetryAfter = 25 } = opts;

      // GET — 쿼리 string 있음/없음 양쪽 커버
      await page.route(`**/api/stocks/${code}/discussions?**`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }),
      );
      await page.route(`**/api/stocks/${code}/discussions`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }),
      );

      // POST refresh
      await page.route(`**/api/stocks/${code}/discussions/refresh`, (route) => {
        if (refreshResult === 'cooldown') {
          return route.fulfill({
            status: 429,
            headers: { 'Retry-After': String(refreshRetryAfter) },
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'DISCUSSION_REFRESH_COOLDOWN', message: '잠시 후 다시 시도해주세요' },
              retry_after_seconds: refreshRetryAfter,
            }),
          });
        }
        if (refreshResult === 'error') {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'PROXY_UNAVAILABLE', message: 'proxy client not configured' } }),
          });
        }
        if (refreshResult === 'stale') {
          // stale: 500 으로 실패하되 기존 list 유지 (D7)
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'PROXY_UNAVAILABLE', message: 'upstream failure' } }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...(list as unknown[])]) });
      });
    }
    ```

    **파일 4 — `webapp/e2e/fixtures/mock-api.ts`** — 기존 파일에 한 줄 re-export 추가:
    기존 파일 전체를 먼저 Read 한 후, 파일 끝에 다음 한 줄을 **추가**한다. 기존 export 를 건드리지 않는다:
    ```ts
    export { mockDiscussionsApi, DISCUSSION_ITEM_SAMPLE, buildDiscussionList } from './discussions';
    ```
    (Phase 7 의 `mockNewsApi` re-export 는 그대로 유지.)
  </action>
  <verify>
    <automated>test -f server/tests/routes/discussions.test.ts &amp;&amp; test -f webapp/e2e/specs/discussions.spec.ts &amp;&amp; test -f webapp/e2e/fixtures/discussions.ts &amp;&amp; grep -q "mockDiscussionsApi" webapp/e2e/fixtures/mock-api.ts &amp;&amp; grep -q "mockNewsApi" webapp/e2e/fixtures/mock-api.ts &amp;&amp; grep -c "it.todo" server/tests/routes/discussions.test.ts | xargs -I {} test {} -ge 8 &amp;&amp; grep -c "test.skip" webapp/e2e/specs/discussions.spec.ts | xargs -I {} test {} -ge 5 &amp;&amp; grep -q "stockCode" webapp/e2e/fixtures/discussions.ts &amp;&amp; grep -q "postId" webapp/e2e/fixtures/discussions.ts &amp;&amp; grep -q "scrapedAt" webapp/e2e/fixtures/discussions.ts</automated>
  </verify>
  <acceptance_criteria>
    - 3개 신규 파일 + mock-api.ts 수정 확인
    - `server/tests/routes/discussions.test.ts` 에 `it.todo` ≥8 (`grep -c "it.todo"` ≥8)
    - `webapp/e2e/specs/discussions.spec.ts` 에 `test.skip` ≥5 (`grep -c "test.skip"` ≥5)
    - `webapp/e2e/fixtures/discussions.ts` camelCase: `stockCode` + `postId` + `scrapedAt` 모두 1+ match. snake_case 0 match: `! grep -E "stock_code|post_id|scraped_at" webapp/e2e/fixtures/discussions.ts`
    - `webapp/e2e/fixtures/mock-api.ts` 에 Phase 7 `mockNewsApi` re-export 유지 + Phase 8 `mockDiscussionsApi` re-export 추가 (둘 다 1+ match)
    - 기존 Phase 7 E2E 회귀 없음: `pnpm -F @gh-radar/webapp typecheck` exit 0
  </acceptance_criteria>
  <done>4개 파일 생성/수정 + grep 검증 통과 + webapp typecheck 그린</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-01)

| Boundary | Description |
|----------|-------------|
| packages/shared → consumers (server/worker/webapp) | sanitize 순수 함수가 stored-XSS 방어의 1차 layer (Phase 8 body 는 완전한 sanitize 를 server/worker 측에서 sanitize-html 로 추가 수행) |
| shared 타입 계약 → 모든 consumer | camelCase 통일, snake_case 누수 방지 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Tampering (Stored XSS) | `packages/shared/src/discussion-sanitize.ts::stripHtmlToPlaintext` | mitigate | regex 기반 best-effort (entity decode + tag strip + whitespace normalize). 완전한 sanitize 는 server/worker 가 sanitize-html 로 2차 처리. React 기본 text escape 가 3차. unit test 최소 10 case 로 nested/entity/한글 보존 검증. |
| T-06 | Tampering (Input validation) | `parseNaverBoardDate` range check | mitigate | 월/일/시/분 range sanity 를 regex 후 추가 검증 — 잘못된 값 null 반환. unit test 로 out-of-range 커버. |
| T-10 | Tampering (prototype pollution) | naver-board-fixtures.ts embed HTML | accept | fixture 는 vitest runner 에서만 import, React 렌더 경로 없음. cheerio 가 JS eval 없는 파싱 엔진. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/shared test -- discussion-sanitize.test.ts --run` — Phase 8 25+ case 그린
- `pnpm -F @gh-radar/shared typecheck` exit 0
- `pnpm -F @gh-radar/webapp typecheck` exit 0 (기존 Phase 7 회귀 없음)
- `test -f workers/discussion-sync/package.json && grep -q "@gh-radar/discussion-sync"`
- `! grep -q "news-sync" workers/discussion-sync/Dockerfile` (치환 완전성)
- `pnpm ls -r --depth=-1 | grep @gh-radar/discussion-sync` → 1 match (workspace 인식)
- V-20 guardrail 유지: `grep -E "sanitize-html|striptags|dompurify|date-fns-tz" packages/shared/package.json` → 0
- Phase 7 guardrail 회귀 없음: `pnpm ls --filter @gh-radar/news-sync sanitize-html 2>&1 | grep -c sanitize-html` → 0
</verification>

<success_criteria>
- `packages/shared` 에 Discussion 타입 + 3개 sanitize 함수 export + 25+ test case 그린
- `workers/discussion-sync/` 디렉터리 스캐폴드 완료 + pnpm workspace 인식 + cheerio/sanitize-html deps 추가 + Phase 7 news-sync 에 deps 침투 없음
- server / webapp 테스트 스텁 생성 — Plan 08-03/08-04/08-06 의 `<verify>` MISSING 해소
- Phase 7 회귀 0 (사전 test 실행 green 유지)
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-01-SUMMARY.md`:
- Discussion 타입 camelCase 9 필드 export 확인
- discussion-sanitize 3 함수 + test case count
- workers/discussion-sync 디렉터리 트리 + Dockerfile sed 치환 결과
- Phase 7 news-sync 회귀 검증 결과
- 발견한 이슈 (iconv-lite 필요 여부, lockfile 충돌 등)
</output>
