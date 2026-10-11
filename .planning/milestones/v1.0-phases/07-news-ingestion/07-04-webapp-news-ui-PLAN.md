---
plan: 07-04
phase: 07
type: execute
wave: 2
depends_on: [07-03]
requirements: [NEWS-01]
files_modified:
  - webapp/src/lib/api.ts
  - webapp/src/lib/stock-api.ts
  - webapp/src/lib/format-news-date.ts
  - webapp/src/lib/__tests__/format-news-date.test.ts
  - webapp/src/components/stock/stock-news-section.tsx
  - webapp/src/components/stock/news-item.tsx
  - webapp/src/components/stock/news-refresh-button.tsx
  - webapp/src/components/stock/news-empty-state.tsx
  - webapp/src/components/stock/news-list-skeleton.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/components/stock/stock-hero.tsx
autonomous: true
threat_refs: [T-02, T-03]

must_haves:
  truths:
    - "종목 상세 페이지에서 관련 뉴스 Card 가 전체 폭 세로 스택 첫 번째 위치로 렌더된다 (UI-SPEC §8)"
    - "뉴스 항목 제목 클릭 시 새 탭으로 열리고 target=_blank + rel=noopener noreferrer 속성을 가진다 (T-02)"
    - "상세 Card 에 5건 표시 + 하단 '전체 뉴스 보기 →' 링크 (/stocks/[code]/news)"
    - "새로고침 버튼이 아이콘 스핀 + 30초 쿨다운 카운트다운을 보여준다"
    - "서버 429 응답의 retry_after_seconds 가 클라이언트 카운트다운에 우선 사용된다"
    - "빈 상태/로딩/에러 UI 상태가 모두 렌더링된다"
    - "StockHero 종목명 왼쪽에 ← 링크 (href=/, aria-label='목록으로 돌아가기') 가 추가된다 (UI-SPEC R5)"
  artifacts:
    - path: "webapp/src/components/stock/stock-news-section.tsx"
      provides: "관련 뉴스 Card (StockDetailClient 에서 사용)"
      min_lines: 100
    - path: "webapp/src/components/stock/news-item.tsx"
      provides: "NewsItem — variant card/full"
      exports: ["NewsItem"]
    - path: "webapp/src/components/stock/news-refresh-button.tsx"
      provides: "쿨다운 카운트다운 버튼"
      exports: ["NewsRefreshButton"]
    - path: "webapp/src/lib/stock-api.ts"
      provides: "fetchStockNews / refreshStockNews"
      exports: ["fetchStockNews", "refreshStockNews"]
  key_links:
    - from: "webapp/src/components/stock/stock-detail-client.tsx"
      to: "stock-news-section.tsx"
      via: "render 내부 space-y-6 컨테이너"
      pattern: "StockNewsSection"
    - from: "news-item.tsx"
      to: "원문 뉴스"
      via: 'target="_blank" rel="noopener noreferrer"'
      pattern: "noopener"
    - from: "stock-api.ts refreshStockNews"
      to: "ApiClientError.details"
      via: "retry_after_seconds 보존"
      pattern: "retry_after_seconds"
---

<objective>
종목 상세 페이지의 placeholder 자리를 실제 뉴스 UI 로 교체한다. UI-SPEC §Component Inventory 의 5개 신규 컴포넌트(`StockNewsSection`, `NewsItem`, `NewsRefreshButton`, `NewsEmptyState`, `NewsListSkeleton`)와 `fetchStockNews`/`refreshStockNews` API 클라이언트, KST 날짜 포맷 유틸을 구현한다. StockHero 에 03-UI-SPEC §4.4 Back-Nav `←` 인라인 링크를 추가.

Purpose: NEWS-01(1)(2) — 상세 페이지에서 뉴스 목록/출처/날짜/원문 링크 표시 + 섹션 전용 새로고침 (D1). 서버 API(Plan 03) 의 직접 소비자.
Output: 기존 상세 페이지 `ComingSoonCard('관련 뉴스')` 가 실제 데이터로 교체. 신규 6개 컴포넌트 + 유틸 + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/07-news-ingestion/07-CONTEXT.md
@.planning/phases/07-news-ingestion/07-UI-SPEC.md
@.planning/phases/07-news-ingestion/07-VALIDATION.md

@webapp/src/lib/api.ts
@webapp/src/lib/stock-api.ts
@webapp/src/components/stock/stock-detail-client.tsx
@webapp/src/components/stock/stock-hero.tsx
@webapp/src/components/stock/coming-soon-card.tsx
@webapp/src/components/ui/card.tsx
@webapp/src/components/ui/button.tsx
@webapp/src/components/ui/skeleton.tsx
@packages/shared/src/news.ts

<interfaces>
Plan 03 서버 계약:
```
GET /api/stocks/:code/news?days=7&limit=5  → NewsArticle[] (상세 Card) — camelCase (server/src/mappers/news.ts::toNewsArticle 적용됨)
GET /api/stocks/:code/news?days=7&limit=100 → NewsArticle[] (/news 페이지) — camelCase
POST /api/stocks/:code/news/refresh        → NewsArticle[] (200) — camelCase
                                           → 429 { error:{code:'NEWS_REFRESH_COOLDOWN',message}, retry_after_seconds:N } + Retry-After 헤더
                                           → 503 NAVER_UNAVAILABLE / NAVER_BUDGET_EXHAUSTED
```

`NewsArticle` 타입 (packages/shared/src/news.ts — 기존, camelCase):
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

기존 ApiClientError:
```ts
class ApiClientError extends Error {
  code: string; status: number; requestId?: string;
}
```
→ 본 plan 에서 `details?: unknown` 필드 추가 (429 응답의 `retry_after_seconds` 보존).

기존 StockDetailClient 구조 (Phase 6 — 유지):
- 139-148 라인: `<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"> <ComingSoonCard title="관련 뉴스" ... /> <ComingSoonCard title="종목토론방" ... /> </div>`
→ 본 plan 에서 `<div className="space-y-6"> <StockNewsSection stockCode={stock.code} /> <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." /> </div>` 로 교체.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: API 클라이언트 확장 + format-news-date 유틸 (TDD)</name>
  <files>
    webapp/src/lib/api.ts,
    webapp/src/lib/stock-api.ts,
    webapp/src/lib/format-news-date.ts,
    webapp/src/lib/__tests__/format-news-date.test.ts
  </files>
  <read_first>
    - webapp/src/lib/api.ts (ApiClientError 클래스 전체 + apiFetch envelope 파싱 로직)
    - webapp/src/lib/stock-api.ts (fetchStockDetail 패턴 — 신규 fn 의 기준)
    - packages/shared/src/news.ts (NewsArticle 타입 — 서버 응답 필드명 확인)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Copywriting (날짜 포맷 2종)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §E.1, §E.5 (API wrapper + format util)
  </read_first>
  <behavior>
    ApiClientError:
      - 신규 optional `details?: unknown` 필드
      - constructor 파라미터에 details 추가 (기존 호출부 영향 없음)
      - apiFetch 의 에러 envelope 파싱 시 body 에 `retry_after_seconds` 가 있으면 `details: { retry_after_seconds: N }` 로 보존

    stock-api.ts 추가:
      fetchStockNews(code, opts:{days?,limit?}, signal): Promise&lt;NewsArticle[]&gt;
        - GET /api/stocks/{code}/news?days=...&limit=...
        - opts.days default 7, opts.limit default 100
      refreshStockNews(code, signal): Promise&lt;NewsArticle[]&gt;
        - POST /api/stocks/{code}/news/refresh
        - 429 → ApiClientError(status=429) with details.retry_after_seconds

    format-news-date.ts:
      formatNewsCardDate(iso): 'MM/DD HH:mm' KST — 상세 Card
      formatNewsFullDate(iso): 'YYYY-MM-DD HH:mm' KST — /news 페이지
      둘 다 내부적으로 Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... }) 사용
      date-fns-tz 도입 금지 (V-20 guardrail)
      잘못된 iso → '—' 반환

    format-news-date.test.ts:
      - formatNewsCardDate('2026-04-17T05:32:00.000Z') === '04/17 14:32' (UTC +9)
      - formatNewsFullDate('2026-04-17T05:32:00.000Z') === '2026-04-17 14:32'
      - formatNewsCardDate('invalid') === '—'
      - 빈 문자열 / null / undefined 처리
  </behavior>
  <action>
    `webapp/src/lib/api.ts` — `ApiClientError` 확장:
    - `ApiClientErrorOptions` 에 `details?: unknown;` 추가
    - `ApiClientError` 에 `readonly details?: unknown;` 필드 + constructor 에서 `this.details = opts.details;`
    - `apiFetch` 의 에러 envelope 파싱 블록(131-142 라인)을 다음과 같이 확장:
      ```ts
      if (!response.ok) {
        let code = `HTTP_${response.status}`;
        let message = response.statusText || '요청이 실패했습니다';
        let details: unknown = undefined;
        try {
          const body = (await response.json()) as (Partial<ApiErrorBody> & { retry_after_seconds?: number }) | undefined;
          if (body?.error?.code) code = body.error.code;
          if (body?.error?.message) message = body.error.message;
          if (typeof body?.retry_after_seconds === 'number') {
            details = { retry_after_seconds: body.retry_after_seconds };
          }
        } catch { /* envelope parsing failed — keep defaults */ }
        throw new ApiClientError({ code, message, status: response.status, requestId, details });
      }
      ```

    `webapp/src/lib/stock-api.ts` — 파일 끝에 함수 2개 추가:
    ```ts
    import type { NewsArticle } from '@gh-radar/shared';

    export interface FetchNewsOpts {
      days?: number;
      limit?: number;
    }

    export function fetchStockNews(
      code: string,
      opts: FetchNewsOpts,
      signal: AbortSignal,
    ): Promise<NewsArticle[]> {
      const params = new URLSearchParams({
        days: String(opts.days ?? 7),
        limit: String(opts.limit ?? 100),
      });
      return apiFetch<NewsArticle[]>(
        `/api/stocks/${encodeURIComponent(code)}/news?${params.toString()}`,
        { signal },
      );
    }

    export function refreshStockNews(
      code: string,
      signal: AbortSignal,
    ): Promise<NewsArticle[]> {
      return apiFetch<NewsArticle[]>(
        `/api/stocks/${encodeURIComponent(code)}/news/refresh`,
        { method: 'POST', signal },
      );
    }
    ```

    `webapp/src/lib/format-news-date.ts`:
    ```ts
    /**
     * Phase 07 — KST 기반 뉴스 날짜 포맷. date-fns-tz 미사용 (UI-SPEC Guardrail §2).
     */

    const PLACEHOLDER = '—';

    const CARD_FMT = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const FULL_DATE_FMT = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    function parseSafe(iso: string | null | undefined): Date | null {
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    /** 상세 Card 용 — 'MM/DD HH:mm' (KST). */
    export function formatNewsCardDate(iso: string | null | undefined): string {
      const d = parseSafe(iso);
      if (!d) return PLACEHOLDER;
      const parts = CARD_FMT.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});
      return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    }

    /** /news 페이지 용 — 'YYYY-MM-DD HH:mm' (KST). */
    export function formatNewsFullDate(iso: string | null | undefined): string {
      const d = parseSafe(iso);
      if (!d) return PLACEHOLDER;
      const parts = FULL_DATE_FMT.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
    ```

    `webapp/src/lib/__tests__/format-news-date.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { formatNewsCardDate, formatNewsFullDate } from '../format-news-date';

    describe('formatNewsCardDate (MM/DD HH:mm KST)', () => {
      it('formats UTC to KST card style', () => {
        // 2026-04-17T05:32:00Z → KST 14:32 on 04/17
        expect(formatNewsCardDate('2026-04-17T05:32:00.000Z')).toBe('04/17 14:32');
      });
      it('pads single-digit month/day with 2 digits', () => {
        expect(formatNewsCardDate('2026-01-05T00:00:00.000Z')).toBe('01/05 09:00');
      });
      it('returns em-dash on invalid input', () => {
        expect(formatNewsCardDate('invalid')).toBe('—');
      });
      it('returns em-dash on empty/null/undefined', () => {
        expect(formatNewsCardDate('')).toBe('—');
        expect(formatNewsCardDate(null)).toBe('—');
        expect(formatNewsCardDate(undefined)).toBe('—');
      });
    });

    describe('formatNewsFullDate (YYYY-MM-DD HH:mm KST)', () => {
      it('formats UTC to KST full style', () => {
        expect(formatNewsFullDate('2026-04-17T05:32:00.000Z')).toBe('2026-04-17 14:32');
      });
      it('returns em-dash on invalid input', () => {
        expect(formatNewsFullDate('not-a-date')).toBe('—');
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/webapp test -- format-news-date.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "details" webapp/src/lib/api.ts` — ApiClientError details 필드 추가
    - `grep -q "retry_after_seconds" webapp/src/lib/api.ts` — envelope 파싱 확장
    - `grep -q "fetchStockNews" webapp/src/lib/stock-api.ts` + `grep -q "refreshStockNews" webapp/src/lib/stock-api.ts` — 2개 export
    - `grep -q "Asia/Seoul" webapp/src/lib/format-news-date.ts` — KST timezone
    - `grep -q "date-fns-tz" webapp/src/lib/format-news-date.ts` → 0 match (guardrail V-20)
    - format-news-date.test.ts 최소 5 case 그린
    - `pnpm -F @gh-radar/webapp typecheck` exit 0
  </acceptance_criteria>
  <done>API 확장 + 날짜 포맷 유틸 + 테스트 그린</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: UI 컴포넌트 6종 (StockNewsSection / NewsItem / NewsRefreshButton / NewsEmptyState / NewsListSkeleton) + StockHero ← 링크</name>
  <files>
    webapp/src/components/stock/stock-news-section.tsx,
    webapp/src/components/stock/news-item.tsx,
    webapp/src/components/stock/news-refresh-button.tsx,
    webapp/src/components/stock/news-empty-state.tsx,
    webapp/src/components/stock/news-list-skeleton.tsx,
    webapp/src/components/stock/stock-hero.tsx
  </files>
  <read_first>
    - webapp/src/components/stock/coming-soon-card.tsx (유사 Card 컴포넌트)
    - webapp/src/components/stock/stock-hero.tsx (← 링크 추가할 위치 — 현재 JSX 구조 1회 전체 읽기 필수)
    - webapp/src/components/ui/card.tsx
    - webapp/src/components/ui/button.tsx
    - webapp/src/components/ui/skeleton.tsx
    - webapp/src/lib/api.ts (ApiClientError import)
    - server/src/mappers/news.ts (Plan 03 산출물 — 서버 응답의 camelCase 계약 확인, 클라이언트 컴포넌트가 기대하는 필드명 근거)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Component Inventory + §Visual Specifications §§1~7 + §Copywriting Contract + §Deviation Guardrails
  </read_first>
  <behavior>
    NewsItem:
      - props: { article: NewsArticle; variant: 'card' | 'full' }
      - 'card' variant: grid-cols [1fr_88px_78px] — 제목(line-clamp-2) + source(11px mono muted) + date(mono caption, formatNewsCardDate)
      - 'full' variant: grid-cols [1fr_120px_140px] — 제목(truncate) + source + formatNewsFullDate
      - 모바일 (sm:hidden 등) source 컬럼 숨김
      - &lt;a href={url} target="_blank" rel="noopener noreferrer" aria-label="{title} 원문 보기 (새 창)"&gt;
      - React text escape 로 XSS 방어 (dangerouslySetInnerHTML 절대 X)

    NewsRefreshButton:
      - props: { onRefresh: () =&gt; void; isRefreshing: boolean; cooldownSeconds: number }
      - cooldownSeconds > 0 → disabled, 버튼에 `${cooldownSeconds}s` 텍스트 표시
      - isRefreshing 시 RefreshCw animate-spin + aria-busy=true
      - aria-label: idle='뉴스 새로고침' | refreshing='뉴스 새로고침 중' | cooldown='{N}초 후 새로고침 가능'
      - size="sm" variant="outline" icon-only

    NewsListSkeleton:
      - props: { rows?: number } default 5
      - 각 행 py-3 border-b [var(--border-subtle)] + 제목 skeleton + 메타 skeleton

    NewsEmptyState:
      - Newspaper lucide 아이콘 + heading + body + CTA (onCtaClick, cooldownSeconds, isRefreshing 에 따라 disabled)
      - role="status"

    StockNewsSection:
      - props: { stockCode: string }
      - state: articles, isLoading, isRefreshing, error, cooldownUntil (number timestamp, 0 = none), inlineRefreshError (string|null)
      - mount: fetchStockNews(code, { days: 7, limit: 5 }, signal)
      - refresh handler: refreshStockNews 호출 → 성공 시 articles 교체 + cooldownUntil = Date.now() + 30_000
      - 429 catch: err.details?.retry_after_seconds 있으면 그 값으로 cooldownUntil = now + s*1000
      - 503/5xx catch: inlineRefreshError 3s 자동 소거
      - cooldown countdown: setInterval(1s) — cooldownUntil > now 일 때만 동작, 0 도달 시 interval clear
      - 빈 articles → NewsEmptyState 렌더
      - 초기 에러 → 에러 Card + 재시도 버튼
      - 성공 → Card with header(Newspaper 아이콘 + "관련 뉴스") + NewsRefreshButton + list(NewsItem card variant × min(articles.length, 5)) + footer(← 전체 뉴스 보기 링크 → /stocks/{code}/news)

    StockHero 수정 — 현재 헤더 flex wrapper 의 **맨 앞** 에 Back-Nav Link 를 삽입:
      구조 스케치 (action 블록에 구체 코드 포함):
      > 기존: `<div flex gap-3> <h1>{stock.name}</h1> <MarketBadge/> <WatchlistToggle/> </div>`
      > 수정: `<div flex gap-3 items-center> <Link href="/" aria-label="목록으로 돌아가기" className="text-muted hover:text-fg">←</Link> <h1/> <MarketBadge/> <WatchlistToggle/> </div>`
      - `<h1>` / `<MarketBadge>` / `<WatchlistToggle>` 등 기존 자식 순서·속성은 건드리지 않는다. 추가되는 건 Link 1개 + `items-center` 클래스 보정뿐.
  </behavior>
  <action>
    먼저 5개 컴포넌트 파일 생성. 각 파일은 UI-SPEC §Visual Specifications 에 명시된 코드 그대로 구현.

    `webapp/src/components/stock/news-item.tsx`:
    ```tsx
    import type { NewsArticle } from '@gh-radar/shared';
    import { formatNewsCardDate, formatNewsFullDate } from '@/lib/format-news-date';

    export interface NewsItemProps {
      article: NewsArticle;
      variant: 'card' | 'full';
    }

    export function NewsItem({ article, variant }: NewsItemProps) {
      const isFull = variant === 'full';
      const dateLabel = isFull
        ? formatNewsFullDate(article.publishedAt)
        : formatNewsCardDate(article.publishedAt);
      const source = article.source ?? '';

      return (
        <li
          data-testid="news-item"
          className={`grid items-center gap-3 py-3 min-h-11 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors ${isFull ? 'grid-cols-[1fr_120px_140px]' : 'grid-cols-[1fr_88px_78px]'}`}
        >
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${article.title} 원문 보기 (새 창)`}
            className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
          >
            {article.title}
          </a>
          <span className="mono text-[11px] text-[var(--muted-fg)] truncate text-right hidden sm:block">
            {source}
          </span>
          <time
            className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)] text-right"
            dateTime={article.publishedAt}
          >
            {dateLabel}
          </time>
        </li>
      );
    }
    ```

    `webapp/src/components/stock/news-refresh-button.tsx`:
    ```tsx
    import { RefreshCw } from 'lucide-react';
    import { Button } from '@/components/ui/button';

    export interface NewsRefreshButtonProps {
      onRefresh: () => void;
      isRefreshing: boolean;
      cooldownSeconds: number;
    }

    export function NewsRefreshButton({ onRefresh, isRefreshing, cooldownSeconds }: NewsRefreshButtonProps) {
      const isCooldown = cooldownSeconds > 0;
      const disabled = isRefreshing || isCooldown;
      const ariaLabel = isCooldown
        ? `${cooldownSeconds}초 후 새로고침 가능`
        : isRefreshing
          ? '뉴스 새로고침 중'
          : '뉴스 새로고침';

      return (
        <Button
          type="button"
          onClick={onRefresh}
          disabled={disabled}
          variant="outline"
          size="sm"
          className="size-8 p-0"
          aria-label={ariaLabel}
          aria-busy={isRefreshing}
          data-remaining-seconds={isCooldown ? cooldownSeconds : undefined}
          data-testid="news-refresh-button"
        >
          {isCooldown ? (
            <span className="mono text-[10px]">{cooldownSeconds}s</span>
          ) : (
            <RefreshCw
              className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          )}
        </Button>
      );
    }
    ```

    `webapp/src/components/stock/news-list-skeleton.tsx`:
    ```tsx
    export interface NewsListSkeletonProps {
      rows?: number;
    }

    export function NewsListSkeleton({ rows = 5 }: NewsListSkeletonProps) {
      return (
        <ul className="divide-y divide-[var(--border-subtle)]" data-testid="news-list-skeleton">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="py-3 space-y-2">
              <div data-slot="skeleton" className="skeleton-list bg-[var(--muted)] animate-pulse h-4 w-full rounded-sm" />
              <div data-slot="skeleton" className="skeleton-list bg-[var(--muted)] animate-pulse h-3 w-24 rounded-sm" />
            </li>
          ))}
        </ul>
      );
    }
    ```

    `webapp/src/components/stock/news-empty-state.tsx`:
    ```tsx
    import { Newspaper } from 'lucide-react';
    import { Button } from '@/components/ui/button';

    export interface NewsEmptyStateProps {
      heading?: string;
      body?: string;
      ctaLabel?: string;
      onCta?: () => void;
      isRefreshing?: boolean;
      cooldownSeconds?: number;
    }

    export function NewsEmptyState({
      heading = '아직 수집된 뉴스가 없어요',
      body = '새로고침으로 최신 뉴스를 가져와보세요.',
      ctaLabel = '뉴스 새로고침',
      onCta,
      isRefreshing = false,
      cooldownSeconds = 0,
    }: NewsEmptyStateProps) {
      const disabled = isRefreshing || cooldownSeconds > 0;
      return (
        <div
          role="status"
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
        >
          <Newspaper className="size-10 text-[var(--muted-fg)]" aria-hidden />
          <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">{heading}</h3>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">{body}</p>
          {onCta && (
            <Button onClick={onCta} disabled={disabled} variant="default">
              {cooldownSeconds > 0 ? `${cooldownSeconds}초 후 재시도` : ctaLabel}
            </Button>
          )}
        </div>
      );
    }
    ```

    `webapp/src/components/stock/stock-news-section.tsx`:
    ```tsx
    'use client';

    import Link from 'next/link';
    import { useCallback, useEffect, useRef, useState } from 'react';
    import { Newspaper } from 'lucide-react';
    import type { NewsArticle } from '@gh-radar/shared';
    import { ApiClientError } from '@/lib/api';
    import { fetchStockNews, refreshStockNews } from '@/lib/stock-api';
    import { Button } from '@/components/ui/button';
    import { NewsItem } from './news-item';
    import { NewsRefreshButton } from './news-refresh-button';
    import { NewsEmptyState } from './news-empty-state';
    import { NewsListSkeleton } from './news-list-skeleton';

    const COOLDOWN_MS = 30_000;

    export interface StockNewsSectionProps {
      stockCode: string;
    }

    export function StockNewsSection({ stockCode }: StockNewsSectionProps) {
      const [articles, setArticles] = useState<NewsArticle[] | null>(null);
      const [isLoading, setIsLoading] = useState(true);
      const [isRefreshing, setIsRefreshing] = useState(false);
      const [error, setError] = useState<Error | null>(null);
      const [cooldownUntil, setCooldownUntil] = useState(0);
      const [nowMs, setNowMs] = useState(Date.now());
      const [inlineError, setInlineError] = useState<string | null>(null);
      const controllerRef = useRef<AbortController | null>(null);
      const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      const load = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setIsLoading(true);
        try {
          const data = await fetchStockNews(stockCode, { days: 7, limit: 5 }, controller.signal);
          if (controller.signal.aborted) return;
          setArticles(data);
          setError(null);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!controller.signal.aborted) setIsLoading(false);
        }
      }, [stockCode]);

      useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);

      // Cooldown countdown tick
      useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
      }, [cooldownUntil]);

      const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000));

      const handleRefresh = useCallback(async () => {
        if (cooldownSeconds > 0 || isRefreshing) return;
        const controller = new AbortController();
        setIsRefreshing(true);
        try {
          const data = await refreshStockNews(stockCode, controller.signal);
          setArticles(data);
          setError(null);
          setCooldownUntil(Date.now() + COOLDOWN_MS);
          setNowMs(Date.now());
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 429) {
            const detail = err.details as { retry_after_seconds?: number } | undefined;
            const s = typeof detail?.retry_after_seconds === 'number' ? detail.retry_after_seconds : 30;
            setCooldownUntil(Date.now() + s * 1000);
            setNowMs(Date.now());
          } else {
            setInlineError('뉴스를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.');
            if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
            inlineTimerRef.current = setTimeout(() => setInlineError(null), 3000);
          }
        } finally {
          setIsRefreshing(false);
        }
      }, [stockCode, cooldownSeconds, isRefreshing]);

      useEffect(() => () => { if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current); }, []);

      // 초기 에러 (articles 없음) → 에러 카드
      if (!articles && error) {
        return (
          <section className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4" role="alert">
            <h2 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)]">
              뉴스를 불러오지 못했어요
            </h2>
            <p className="mt-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">{error.message}</p>
            <Button className="mt-3" onClick={() => void load()}>다시 시도</Button>
          </section>
        );
      }

      // 초기 로딩
      if (isLoading && !articles) {
        return (
          <section className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
              <Newspaper className="size-5" aria-hidden /> 관련 뉴스
            </h2>
            <NewsListSkeleton rows={5} />
          </section>
        );
      }

      // 빈 상태
      if (articles && articles.length === 0) {
        return (
          <NewsEmptyState
            onCta={handleRefresh}
            isRefreshing={isRefreshing}
            cooldownSeconds={cooldownSeconds}
          />
        );
      }

      // 정상 리스트
      const visible = (articles ?? []).slice(0, 5);
      return (
        <section className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4" data-testid="stock-news-section">
          <header className="flex items-center justify-between gap-3 mb-4">
            <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
              <Newspaper className="size-5" aria-hidden /> 관련 뉴스
            </h2>
            <NewsRefreshButton
              onRefresh={() => void handleRefresh()}
              isRefreshing={isRefreshing}
              cooldownSeconds={cooldownSeconds}
            />
          </header>
          {inlineError && (
            <div
              role="alert"
              className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]"
            >
              {inlineError}
            </div>
          )}
          <ul className="divide-y divide-[var(--border-subtle)]">
            {visible.map((a) => <NewsItem key={a.id} article={a} variant="card" />)}
          </ul>
          <footer className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">
            <Link
              href={`/stocks/${encodeURIComponent(stockCode)}/news`}
              className="text-[length:var(--t-sm)] text-[var(--primary)] hover:underline"
            >
              전체 뉴스 보기 →
            </Link>
            <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">최근 7일 전체</span>
          </footer>
        </section>
      );
    }
    ```

    `webapp/src/components/stock/stock-hero.tsx` — 구조 변경 스케치 (기존 JSX 를 그대로 읽은 뒤 header flex wrapper 맨 앞에 Link 삽입):

    > 기존: `<div flex gap-3> <h1>{stock.name}</h1> <MarketBadge/> <WatchlistToggle/> </div>`
    > 수정: `<div flex gap-3 items-center> <Link href="/" aria-label="목록으로 돌아가기" className="text-muted hover:text-fg">←</Link> <h1/> <MarketBadge/> <WatchlistToggle/> </div>`

    구체 diff 가이드 (Next.js `<Link>` import 추가 + flex 래퍼에 `items-center` 보정):
    ```tsx
    // import 추가:
    import Link from 'next/link';
    // ...
    // 기존 flex wrapper 내부 맨 앞에 추가:
    <Link
      href="/"
      aria-label="목록으로 돌아가기"
      className="inline-flex items-center text-[length:var(--t-h2)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
    >
      ←
    </Link>
    <h1 ...>{stock.name}</h1>
    ```
    (기존 h1 + badge wrapper 는 유지, Link 만 앞에 삽입. 래퍼 className 에 `items-center` 가 없다면 보정. 이외 자식 요소/속성/조건부 렌더는 변경 금지.)
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/webapp typecheck &amp;&amp; pnpm -F @gh-radar/webapp test --run</automated>
  </verify>
  <acceptance_criteria>
    - 5개 신규 컴포넌트 파일 생성: `test -f webapp/src/components/stock/stock-news-section.tsx` (+ news-item/news-refresh-button/news-empty-state/news-list-skeleton) 전부 existence
    - NewsItem에 `target="_blank"` + `rel="noopener noreferrer"` 존재: `grep -q "noopener noreferrer" webapp/src/components/stock/news-item.tsx`
    - NewsItem에 `dangerouslySetInnerHTML` 금지: `grep -q "dangerouslySetInnerHTML" webapp/src/components/stock/` → 0 match (T-03 방어)
    - NewsRefreshButton 에 `aria-label` 동적 3분기 존재: `grep -c "aria-label" webapp/src/components/stock/news-refresh-button.tsx` ≥ 1
    - StockNewsSection 에 `retry_after_seconds` 처리: `grep -q "retry_after_seconds" webapp/src/components/stock/stock-news-section.tsx`
    - StockHero 에 ← 링크 추가: `grep -q "목록으로 돌아가기" webapp/src/components/stock/stock-hero.tsx` + `grep -q 'href="/"' webapp/src/components/stock/stock-hero.tsx`
    - typecheck 통과 + 기존 webapp unit tests 회귀 없음
  </acceptance_criteria>
  <done>컴포넌트 6종 + StockHero 수정 + typecheck/test 통과</done>
</task>

<task type="auto">
  <name>Task 3: StockDetailClient 에서 placeholder 교체 (grid → space-y-6 + StockNewsSection)</name>
  <files>webapp/src/components/stock/stock-detail-client.tsx</files>
  <read_first>
    - webapp/src/components/stock/stock-detail-client.tsx (교체 대상 라인 139-148)
    - webapp/src/components/stock/stock-news-section.tsx (Task 2 산출물)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §8 (Before/After 다이어그램)
  </read_first>
  <action>
    `webapp/src/components/stock/stock-detail-client.tsx` 수정:
    1. import 추가: `import { StockNewsSection } from './stock-news-section';`
    2. 139-148 라인의 `<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"> <ComingSoonCard title="관련 뉴스" ... /> <ComingSoonCard title="종목토론방" ... /> </div>` 를
       `<div className="space-y-6"> <StockNewsSection stockCode={stock.code} /> <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." /> </div>` 로 교체

    변경 범위 최소화 — 다른 로직(AbortController, notFoundFlag, 재시도 버튼 등) 은 건드리지 않음.
  </action>
  <verify>
    <automated>grep -q "StockNewsSection" webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; grep -q "space-y-6" webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; ! grep -q 'ComingSoonCard[^"]*"관련 뉴스"' webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; pnpm -F @gh-radar/webapp typecheck &amp;&amp; pnpm -F @gh-radar/webapp build</automated>
  </verify>
  <acceptance_criteria>
    - `StockNewsSection` import 추가: `grep -c "StockNewsSection" webapp/src/components/stock/stock-detail-client.tsx` ≥ 2 (import + render)
    - 기존 관련 뉴스 ComingSoonCard 제거: `grep -q '관련 뉴스' webapp/src/components/stock/stock-detail-client.tsx` → 0 match
    - 종목토론방 ComingSoonCard 유지: `grep -q '종목토론방' webapp/src/components/stock/stock-detail-client.tsx` → 1 match
    - `grid md:grid-cols-2` 섹션 래퍼 사라짐: `grep -c 'md:grid-cols-2' webapp/src/components/stock/stock-detail-client.tsx` === 0 (해당 섹션에서)
    - `space-y-6` 컨테이너 적용 (최소 1 match)
    - `pnpm -F @gh-radar/webapp build` exit 0 — production build 성공
  </acceptance_criteria>
  <done>placeholder 교체 + build 성공</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-04)

| Boundary | Description |
|----------|-------------|
| 서버 응답 → React 렌더 | title/source/url 이 Plan 03 server 에서 sanitize 되지만, 클라이언트 2차 방어 필요 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02 | Tampering / Spoofing (tabnabbing) | `NewsItem` 외부 링크 | mitigate | `<a target="_blank" rel="noopener noreferrer">` 강제. grep CI 가드로 `rel="noopener` 를 news-item.tsx 에서 필수. |
| T-03 | Tampering (Stored XSS) | 뉴스 title 렌더 | mitigate | React 기본 text escape 로만 렌더 (`{article.title}`), `dangerouslySetInnerHTML` 사용 금지. grep guard: `dangerouslySetInnerHTML` 0 match in components/stock/. sanitize 는 server 와 packages/shared 에서 1차 완료. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/webapp test --run` 그린 (format-news-date.test.ts 추가, 기존 회귀 없음)
- `pnpm -F @gh-radar/webapp typecheck` exit 0
- `pnpm -F @gh-radar/webapp build` exit 0 — Vercel 배포 준비
- `grep -rq "dangerouslySetInnerHTML" webapp/src/components/stock/` → 0 match (T-03 가드)
- `grep -q "noopener noreferrer" webapp/src/components/stock/news-item.tsx` (T-02)
- `grep -q "목록으로 돌아가기" webapp/src/components/stock/stock-hero.tsx` (UI-SPEC R5)
- `! grep -E "date-fns-tz|sanitize-html" webapp/package.json` (V-20 guardrail)
</verification>

<success_criteria>
- 6개 컴포넌트/유틸 파일 신규 생성 + StockHero/StockDetailClient 수정 반영
- 상세 페이지 빌드 후 StockNewsSection 이 placeholder 자리에 렌더 (build 성공으로 정적 검증)
- 모든 웹앱 단위 테스트 그린 + typecheck 통과
- ApiClientError.details 를 통해 429 의 retry_after_seconds 가 클라이언트 카운트다운에 사용됨
- 모든 뉴스 외부 링크에 noopener noreferrer + target=_blank 속성
- StockHero ← 링크 (03-UI-SPEC §4.4 Back Nav 규칙)
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-04-SUMMARY.md`:
- 6개 신규 파일 트리
- StockDetailClient diff 요약
- StockHero ← 링크 위치
- 쿨다운 카운트다운 구현 세부 (setInterval 정리)
- 발견한 이슈 (breakpoint, 접근성 등)
</output>
