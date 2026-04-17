---
plan: 07-05
phase: 07
type: execute
wave: 2
depends_on: [07-03, 07-04]
requirements: [NEWS-01]
files_modified:
  - webapp/src/app/stocks/[code]/news/page.tsx
  - webapp/src/components/stock/news-page-client.tsx
autonomous: true
threat_refs: [T-02, T-03]

must_haves:
  truths:
    - "/stocks/[code]/news 라우트가 존재하며 최근 7일 뉴스 최대 100건을 렌더한다"
    - "페이지 상단 h1 왼쪽에 ← 링크(href=/stocks/[code], aria-label='종목 상세로 돌아가기')가 있다 (R5 / UI-SPEC §4.4)"
    - "h1 텍스트는 '{종목명} — 최근 7일 뉴스' 형식 (상한 수치 노출 금지)"
    - "리스트에 번호 인덱스(1. 2. 3.) 없음"
    - "Next 15 params Promise + use() 패턴, 잘못된 code 는 notFound()"
    - "새로고침 기능 없음 (상세 페이지 전용 — 사용자 멘탈 모델 단순화)"
  artifacts:
    - path: "webapp/src/app/stocks/[code]/news/page.tsx"
      provides: "Next 15 route entry"
      min_lines: 25
    - path: "webapp/src/components/stock/news-page-client.tsx"
      provides: "NewsPageClient — 최근 7일 100건 렌더"
      exports: ["NewsPageClient"]
      min_lines: 100
  key_links:
    - from: "news/page.tsx"
      to: "NewsPageClient"
      via: "React component"
      pattern: "NewsPageClient"
    - from: "NewsPageClient"
      to: "fetchStockNews (days=7, limit=100)"
      via: "stock-api"
      pattern: "fetchStockNews"
    - from: "NewsPageClient h1"
      to: "/stocks/[code]"
      via: "Next Link"
      pattern: "종목 상세로 돌아가기"
---

<objective>
`/stocks/[code]/news` nested dynamic route 를 구현한다. 상세 Card 의 "전체 뉴스 보기 →" 링크 목적지. 최근 7일 내 뉴스 전체(서버 하드캡 100건) 를 테이블 형태로 렌더하고, 03-UI-SPEC §4.4 Back-Nav (← 인라인 링크) 규칙을 따른다.

Purpose: R2/R3 결정의 클라이언트 사이드 — `/news` 페이지 하드캡 100 + 종목명 h1 + ← 링크.
Output: 신규 2파일 (page.tsx, news-page-client.tsx). 새로고침 기능 없음.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-news-ingestion/07-CONTEXT.md
@.planning/phases/07-news-ingestion/07-UI-SPEC.md
@webapp/src/app/stocks/[code]/page.tsx
@webapp/src/app/stocks/[code]/not-found.tsx
@webapp/src/app/stocks/[code]/error.tsx
@webapp/src/components/stock/news-item.tsx
@webapp/src/components/stock/news-list-skeleton.tsx
@webapp/src/lib/stock-api.ts
@webapp/src/lib/api.ts

<interfaces>
기존 Next 15 nested route 패턴 (`webapp/src/app/stocks/[code]/page.tsx`):
```tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
const CODE_RE = /^[A-Za-z0-9]{1,10}$/;
export default function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  if (!CODE_RE.test(code)) notFound();
  return (<AppShell sidebar={<AppSidebar />}><StockDetailClient code={code} /></AppShell>);
}
```
→ 본 plan 에서 `stocks/[code]/news/page.tsx` 도 동일 패턴 채택.

Plan 04 의 `fetchStockNews(code, opts, signal)` + `fetchStockDetail(code, signal)` 호출.
NewsItem variant='full' 재사용 (Plan 04 산출).
parent not-found.tsx / error.tsx 는 부모 상속 — 신규 생성 안 함.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: NewsPageClient 구현 (종목 정보 + 뉴스 리스트 + ← 링크)</name>
  <files>webapp/src/components/stock/news-page-client.tsx</files>
  <read_first>
    - webapp/src/components/stock/stock-news-section.tsx (Plan 04 산출 — state/fetch 패턴)
    - webapp/src/components/stock/news-item.tsx (variant='full' 사용)
    - webapp/src/components/stock/news-list-skeleton.tsx
    - webapp/src/lib/stock-api.ts (fetchStockNews, fetchStockDetail 시그니처)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Visual Specifications §3 (/stocks/[code]/news 전체 페이지 레이아웃)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Copywriting (페이지 카피)
  </read_first>
  <behavior>
    NewsPageClient:
      - props: { code: string }
      - 2개 parallel fetch on mount:
        1. fetchStockDetail(code, signal) → stock.name 획득 (h1 에 표시)
        2. fetchStockNews(code, { days: 7, limit: 100 }, signal) → articles
      - Loading: 스켈레톤 10행
      - 404 (either fetch 의 status === 404) → notFound() 호출
      - 기타 에러: 에러 Card + 다시 시도
      - 정상:
        - 상단 h1 (03-UI-SPEC §4.4 Back Nav):
          `<Link href="/stocks/{code}" aria-label="종목 상세로 돌아가기">←</Link>`
          `<h1>{stock.name} — 최근 7일 뉴스</h1>`
        - articles.length === 0 → 빈 상태 (heading="표시할 뉴스가 없어요", body="최근 7일 내 수집된 뉴스가 없습니다. 종목 상세에서 새로고침을 실행해주세요.") — CTA 없음
        - 리스트: `<ul>` 내부 `<NewsItem variant="full">` × N (최대 100)
        - 헤더 행: 제목 / 출처 / 날짜·시각 (3-column grid, 모바일 <720px 에서 출처 컬럼 숨김)
      - 새로고침 기능 없음
      - 번호 인덱스(1. 2. 3.) 절대 없음 — 자연 순서만 (Deviation Guardrail §13)
  </behavior>
  <action>
    `webapp/src/components/stock/news-page-client.tsx`:
    ```tsx
    'use client';

    import Link from 'next/link';
    import { useCallback, useEffect, useRef, useState } from 'react';
    import { notFound } from 'next/navigation';
    import type { NewsArticle, Stock } from '@gh-radar/shared';
    import { ApiClientError } from '@/lib/api';
    import { fetchStockDetail, fetchStockNews } from '@/lib/stock-api';
    import { Button } from '@/components/ui/button';
    import { NewsItem } from './news-item';
    import { NewsListSkeleton } from './news-list-skeleton';

    export interface NewsPageClientProps {
      code: string;
    }

    export function NewsPageClient({ code }: NewsPageClientProps) {
      const [stock, setStock] = useState<Stock | null>(null);
      const [articles, setArticles] = useState<NewsArticle[] | null>(null);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<Error | null>(null);
      const [notFoundFlag, setNotFoundFlag] = useState(false);
      const controllerRef = useRef<AbortController | null>(null);

      const load = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setIsLoading(true);
        try {
          const [stockData, newsData] = await Promise.all([
            fetchStockDetail(code, controller.signal),
            fetchStockNews(code, { days: 7, limit: 100 }, controller.signal),
          ]);
          if (controller.signal.aborted) return;
          setStock(stockData);
          setArticles(newsData);
          setError(null);
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          if (err instanceof ApiClientError && err.status === 404) {
            setNotFoundFlag(true);
            return;
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          if (!controller.signal.aborted) setIsLoading(false);
        }
      }, [code]);

      useEffect(() => {
        void load();
        return () => controllerRef.current?.abort();
      }, [load]);

      if (notFoundFlag) notFound();

      if (error && !articles) {
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

      const headingName = stock?.name ?? code;

      return (
        <div className="space-y-6">
          <header className="flex items-center gap-3">
            <Link
              href={`/stocks/${encodeURIComponent(code)}`}
              aria-label="종목 상세로 돌아가기"
              className="inline-flex items-center text-[length:var(--t-h3)] text-[var(--muted-fg)] hover:text-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm py-2 pr-1"
            >
              ←
            </Link>
            <h1 className="text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
              {headingName} — 최근 7일 뉴스
            </h1>
          </header>

          {isLoading && !articles ? (
            <section className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4">
              <NewsListSkeleton rows={10} />
            </section>
          ) : articles && articles.length === 0 ? (
            <section
              role="status"
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
            >
              <h2 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
                표시할 뉴스가 없어요
              </h2>
              <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                최근 7일 내 수집된 뉴스가 없습니다. 종목 상세에서 새로고침을 실행해주세요.
              </p>
            </section>
          ) : (
            <section className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4" data-testid="news-list">
              <div className="hidden sm:grid grid-cols-[1fr_120px_140px] gap-3 px-2 pb-2 text-[length:var(--t-caption)] text-[var(--muted-fg)] border-b border-[var(--border-subtle)]">
                <span>제목</span>
                <span className="text-right">출처</span>
                <span className="text-right">날짜·시각</span>
              </div>
              <ul className="divide-y divide-[var(--border-subtle)]">
                {(articles ?? []).map((a) => (
                  <NewsItem key={a.id} article={a} variant="full" />
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    }
    ```
  </action>
  <verify>
    <automated>test -f webapp/src/components/stock/news-page-client.tsx &amp;&amp; grep -q "fetchStockNews" webapp/src/components/stock/news-page-client.tsx &amp;&amp; grep -q "limit: 100" webapp/src/components/stock/news-page-client.tsx &amp;&amp; grep -q "종목 상세로 돌아가기" webapp/src/components/stock/news-page-client.tsx &amp;&amp; grep -q "최근 7일 뉴스" webapp/src/components/stock/news-page-client.tsx &amp;&amp; pnpm -F @gh-radar/webapp typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `NewsPageClient` export 존재
    - `fetchStockNews` 호출 시 `{ days: 7, limit: 100 }` 인자 (R2/R3)
    - ← 링크: `aria-label="종목 상세로 돌아가기"` + `href={/stocks/{code}}` (R5)
    - h1 텍스트: `{name} — 최근 7일 뉴스` (상한 수치 `100` 노출 금지): `grep -q "100" webapp/src/components/stock/news-page-client.tsx` 허용되나 heading 에 넣지 않음 — `! grep -E "h1.*100|100.*h1" webapp/src/components/stock/news-page-client.tsx`
    - 번호 인덱스 렌더 안 함: `grep -E "\{i\+1\}\." webapp/src/components/stock/news-page-client.tsx` → 0 match
    - 404 처리: `grep -q "notFound" webapp/src/components/stock/news-page-client.tsx`
    - typecheck exit 0
  </acceptance_criteria>
  <done>news-page-client.tsx 완성, typecheck 통과</done>
</task>

<task type="auto">
  <name>Task 2: Next 15 route entry — stocks/[code]/news/page.tsx</name>
  <files>webapp/src/app/stocks/[code]/news/page.tsx</files>
  <read_first>
    - webapp/src/app/stocks/[code]/page.tsx (부모 라우트 패턴 — 1:1 템플릿)
    - webapp/src/app/stocks/[code]/not-found.tsx (부모 상속 확인)
    - webapp/src/components/stock/news-page-client.tsx (Task 1 산출물)
    - webapp/src/components/layout/app-shell.tsx, app-sidebar.tsx (import 경로)
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Visual Specifications §3 (레이아웃)
  </read_first>
  <action>
    `webapp/src/app/stocks/[code]/news/page.tsx`:
    ```tsx
    'use client';

    import { use } from 'react';
    import { notFound } from 'next/navigation';

    import { AppShell } from '@/components/layout/app-shell';
    import { AppSidebar } from '@/components/layout/app-sidebar';
    import { NewsPageClient } from '@/components/stock/news-page-client';

    const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

    export default function StockNewsPage({
      params,
    }: {
      params: Promise<{ code: string }>;
    }) {
      const { code } = use(params);
      if (!CODE_RE.test(code)) notFound();
      return (
        <AppShell sidebar={<AppSidebar />}>
          <div className="mx-auto w-full max-w-4xl">
            <NewsPageClient code={code} />
          </div>
        </AppShell>
      );
    }
    ```

    not-found.tsx / error.tsx 은 **신규 생성하지 않음** — 부모 `app/stocks/[code]/not-found.tsx` 가 자동 상속 (UI-SPEC §3 명시).
  </action>
  <verify>
    <automated>test -f webapp/src/app/stocks/[code]/news/page.tsx &amp;&amp; grep -q "NewsPageClient" webapp/src/app/stocks/[code]/news/page.tsx &amp;&amp; grep -q "use(params)" webapp/src/app/stocks/[code]/news/page.tsx &amp;&amp; grep -q "AppShell" webapp/src/app/stocks/[code]/news/page.tsx &amp;&amp; pnpm -F @gh-radar/webapp build</automated>
  </verify>
  <acceptance_criteria>
    - `webapp/src/app/stocks/[code]/news/page.tsx` exists
    - `'use client'` directive 존재 (부모와 일관 — ROADMAP STATE.md 결정)
    - `use(params)` + `Promise<{ code: string }>` 패턴 사용
    - `CODE_RE` regex + `notFound()` 가드
    - `<AppShell sidebar={<AppSidebar />}>` 래핑 + `max-w-4xl` 컨테이너
    - `pnpm -F @gh-radar/webapp build` exit 0 — Vercel 배포 가능 상태
    - 신규 not-found.tsx / error.tsx 생성하지 않음: `! test -f webapp/src/app/stocks/[code]/news/not-found.tsx`
  </acceptance_criteria>
  <done>page.tsx 완성 + build 성공</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-05)

| Boundary | Description |
|----------|-------------|
| 서버 응답 → 전체 페이지 렌더 | 100건 × article 필드 전부 React text escape 로 렌더 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02 | Tampering (외부 링크) | NewsItem variant="full" | mitigate | Plan 04 의 NewsItem 재사용 — target=_blank rel=noopener noreferrer 이미 포함. |
| T-03 | Tampering (Stored XSS) | NewsPageClient 제목 렌더 | mitigate | `{stock.name}` / `{article.title}` 모두 JSX text escape. dangerouslySetInnerHTML 사용 금지. |
</threat_model>

<verification>
- `pnpm -F @gh-radar/webapp build` exit 0 (2 신규 파일 모두 컴파일)
- `pnpm -F @gh-radar/webapp typecheck` exit 0
- `grep -q "종목 상세로 돌아가기" webapp/src/components/stock/news-page-client.tsx` (R5 준수)
- `grep -q "limit: 100" webapp/src/components/stock/news-page-client.tsx` (R2 하드캡)
- 페이지 수동 테스트(Plan 06 E2E 가 자동화): 개발 서버에서 /stocks/005930/news 이동 가능, ← 링크 동작
</verification>

<success_criteria>
- `/stocks/[code]/news` 라우트 접근 가능 (빌드 통과)
- NewsPageClient 가 상세 + 뉴스 parallel fetch 후 렌더
- 최근 7일 · 하드캡 100건 · ← 인라인 back-nav · 번호 인덱스 없음 — 모든 UI-SPEC 결정 반영
- 새로고침 없음 (상세 페이지 전용)
- 404 notFound() 처리
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-05-SUMMARY.md`:
- 신규 2파일
- build 결과
- 수동 smoke (로컬 dev 서버에서 /stocks/005930/news 방문 OK)
- 발견한 이슈
</output>