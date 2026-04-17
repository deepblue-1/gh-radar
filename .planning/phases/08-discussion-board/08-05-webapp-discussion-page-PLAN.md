---
plan: 08-05
phase: 08
type: execute
wave: 2
depends_on: [08-04]
requirements: [DISC-01]
files_modified:
  - webapp/src/app/stocks/[code]/discussions/page.tsx
  - webapp/src/components/stock/discussion-page-client.tsx
autonomous: true
threat_refs: [T-02, T-07]

must_haves:
  truths:
    - "/stocks/[code]/discussions 라우트가 Next 15 use(params) 패턴으로 동작한다"
    - "페이지는 최근 7일 · 서버 하드캡 50건 Compact 표 형식 (3열 grid 1fr/140px/120px at md+)"
    - "md+ 에서 컬럼 헤더 '제목/작성자/시간' row (caption uppercase + border-b) 노출"
    - "모바일 <720px 에서 컬럼 헤더 display:none + grid-template-areas \"title time\" / \"preview author\" 재배치"
    - "h1 왼쪽 인라인 ← 링크가 /stocks/[code] 로 이동 (aria-label='종목 상세로 돌아가기', 03-UI-SPEC §4.4)"
    - "페이지에 새로고침 버튼 없음 (상세 페이지 전용, UI-SPEC §Component Inventory)"
    - "각 토론 항목 링크는 target=_blank + rel=noopener noreferrer (T-02)"
    - "빈 상태 → heading '표시할 토론 글이 없어요' + body '최근 7일 내 수집된 토론 글이 없습니다...'"
  artifacts:
    - path: "webapp/src/app/stocks/[code]/discussions/page.tsx"
      provides: "Next 15 dynamic route 엔트리"
      min_lines: 20
    - path: "webapp/src/components/stock/discussion-page-client.tsx"
      provides: "Compact 표 형식 페이지 클라이언트 (use(params) + fetch + 렌더)"
      min_lines: 120
  key_links:
    - from: "/stocks/[code]/discussions page.tsx"
      to: "discussion-page-client.tsx"
      via: "use(params) → 컴포넌트 props"
      pattern: "use\\(params\\)"
    - from: "discussion-page-client.tsx h1 ←"
      to: "/stocks/[code]"
      via: "Link href"
      pattern: "종목 상세로 돌아가기"
    - from: "discussion-page-client.tsx"
      to: "fetchStockDiscussions(code, { days: 7, limit: 50 })"
      via: "mount useEffect"
      pattern: "days: 7"
---

<objective>
`/stocks/[code]/discussions` 전체 페이지 라우트를 Compact 표 형식(UI-SPEC §3 확정)으로 구현한다. Next 15 `use(params)` 패턴 (Phase 6 `/stocks/[code]` 및 Phase 7 `/stocks/[code]/news` 선례 계승). 최근 7일 · 최대 50건 (서버 하드캡) · 페이지네이션 없음.

Purpose: DISC-01 (1) 의 전체 토론 보기 경로. Plan 08-04 상세 Card 의 "전체 토론 보기 →" 링크가 이 페이지로 이동. 상세 Card 의 몰입 읽기 스타일과 차별화 — 3열 grid 고밀도 스캔용.
Output: 새 Next 15 동적 라우트 1개 (page.tsx) + 클라이언트 컴포넌트 1개 (discussion-page-client.tsx).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/08-discussion-board/08-CONTEXT.md
@.planning/phases/08-discussion-board/08-UI-SPEC.md

@webapp/src/app/stocks/[code]/page.tsx
@webapp/src/app/stocks/[code]/news/page.tsx
@webapp/src/components/stock/news-page-client.tsx
@webapp/src/components/stock/discussion-item.tsx
@webapp/src/components/stock/discussion-list-skeleton.tsx
@webapp/src/components/stock/discussion-empty-state.tsx
@webapp/src/lib/stock-api.ts
@webapp/src/lib/format-discussion-date.ts

@packages/shared/src/discussion.ts

<interfaces>
## Plan 08-04 산출물 (본 plan 이 import)

- `DiscussionItem` with `variant="full"` — 3열 grid Compact row (제목+preview / 작성자 / 시간)
- `DiscussionListSkeleton variant="full"` — 10행 × 3열 grid 스켈레톤
- `fetchStockDiscussions(code, { days: 7, limit: 50 }, signal)` — API 2종

## Phase 7 `/stocks/[code]/news/page.tsx` 구조 (복제 기준)

Phase 7 패턴 (Next 15 + 'use client' + React.use(params)):
```tsx
'use client';
import { use } from 'react';
export default function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <NewsPageClient code={code} />;
}
```

## UI-SPEC §3 Compact 표 형식 확정 사항

- `main` 컨테이너: `mx-auto max-w-[980px] p-6`
- 페이지 타이틀 row: `h1` + **왼쪽 인라인 ← 링크** (03-UI-SPEC §4.4 Back Nav — `router.back()` 금지, 명시적 href)
- 리스트 Card: 단일 Card padding `p-2 p-4` (수직 8px, 수평 16px)
- 컬럼 헤더 row (md+): grid `1fr 140px 120px` caption uppercase letter-spacing 0.04em border-b var(--border) `display:none` on mobile
- 각 행: DiscussionItem variant="full" (Plan 08-04)
- 모바일 <720px: grid-template-areas `"title time" "preview author"` 재배치

## Copy 계약 (UI-SPEC §Copywriting)

| 요소 | Copy |
|------|------|
| h1 | `{종목명} — 최근 7일 토론` |
| Back link aria-label | `종목 상세로 돌아가기` |
| 컬럼 헤더 | `제목` / `작성자` / `시간` |
| Empty heading | `표시할 토론 글이 없어요` |
| Empty body | `최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.` |
| 날짜 포맷 | `formatDiscussionFullDate` → `YYYY-MM-DD HH:mm` KST |

## 종목명 조회

현재 페이지는 종목 코드만 URL 로 받음. 종목명을 표시하려면:
- Option A: fetchStockDetail(code) 로 종목 마스터 조회 → name 확보 (추가 API 호출 1회)
- Option B: h1 에 code 만 표시 (UX 저하)
→ **Option A 채택** (Phase 7 news-page-client.tsx 동일 패턴). 종목 로드 실패 시 h1 은 code fallback.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Next 15 라우트 엔트리 page.tsx + DiscussionPageClient 컴포넌트</name>
  <files>
    webapp/src/app/stocks/[code]/discussions/page.tsx,
    webapp/src/components/stock/discussion-page-client.tsx
  </files>
  <read_first>
    - webapp/src/app/stocks/[code]/news/page.tsx (Phase 7 news 페이지 — page.tsx 구조 복제 기준)
    - webapp/src/app/stocks/[code]/page.tsx (stocks detail 페이지 — use(params) 패턴)
    - webapp/src/components/stock/news-page-client.tsx (Phase 7 풀페이지 클라이언트 — 전체 복제 기준)
    - webapp/src/components/stock/discussion-item.tsx (Plan 08-04 산출 — variant="full")
    - webapp/src/components/stock/discussion-list-skeleton.tsx (Plan 08-04 산출 — variant="full")
    - webapp/src/lib/stock-api.ts (fetchStockDiscussions + fetchStockDetail)
    - webapp/src/lib/format-discussion-date.ts (formatDiscussionFullDate)
    - webapp/src/components/ui/card.tsx
    - webapp/src/components/ui/button.tsx
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §3 (Compact 레이아웃) + §4 (빈 상태) + §Deviation Guardrails #8a
    - .planning/phases/03-design-system/03-UI-SPEC.md §4.4 (Page Back Nav)
  </read_first>
  <behavior>
    **page.tsx:**
    ```tsx
    'use client';
    import { use } from 'react';
    import { DiscussionPageClient } from '@/components/stock/discussion-page-client';

    export default function DiscussionsPage({ params }: { params: Promise<{ code: string }> }) {
      const { code } = use(params);
      return <DiscussionPageClient code={code} />;
    }
    ```

    **DiscussionPageClient** 책임:
    1. mount 시 병렬 fetch: `fetchStockDetail(code)` + `fetchStockDiscussions(code, { days: 7, limit: 50 })` — Promise.all
    2. 종목명 확보 → h1 `{name} — 최근 7일 토론` 렌더 (실패 시 code fallback)
    3. 종목 404 → Next `notFound()` 호출 (Phase 6 패턴)
    4. 토론 0건 → 빈 상태 Card (CTA 없음 — D6)
    5. 정상 → main > header(← + h1) → Card (컬럼 헤더 row + `<ul>` DiscussionItem variant="full" × N)
    6. 에러 → 에러 Card (고정 copy, 재시도 버튼)

    **레이아웃:**
    ```tsx
    <main className="mx-auto max-w-[980px] p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/stocks/${encodeURIComponent(code)}`} aria-label="종목 상세로 돌아가기"
              className="text-[length:var(--t-h3)] text-[var(--muted-fg)] hover:text-[var(--primary)] py-2 pr-1">
          ←
        </Link>
        <h1 className="text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
          {name ?? code} — 최근 7일 토론
        </h1>
      </div>

      <Card className="py-2 px-4">
        <div className="hidden md:grid grid-cols-[1fr_140px_120px] gap-3 py-2 border-b border-[var(--border)]
                        text-[length:var(--t-caption)] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
          <span>제목</span>
          <span>작성자</span>
          <span className="text-right">시간</span>
        </div>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {discussions.map((d) => <DiscussionItem key={d.id} discussion={d} variant="full" />)}
        </ul>
      </Card>
    </main>
    ```

    **반응형 — 모바일 <720px (UI-SPEC §3 + §Deviation Guardrail #8a):**
    - 컬럼 헤더 row: `hidden md:grid` (720px 이하 숨김)
    - DiscussionItem variant="full" 내부에서 `md:grid-cols-[1fr_140px_120px]` + `grid-cols-1` default (모바일은 단일 열)
    - 모바일 전용: Plan 08-04 의 DiscussionItem variant="full" 에 CSS `grid-template-areas` 재배치 추가 필요 여부 — Tailwind 기본 유틸 만으로 충분 (grid-cols-1 + gap-1 세로 스택). UI-SPEC §3 엄격 준수 필요 시 custom class 활용.

    **종목 404:**
    Phase 6 이 생성한 `webapp/src/app/stocks/[code]/not-found.tsx` 공통 상속. `/discussions` 에도 next.js 라우팅 규칙으로 자동 상속됨. 별도 파일 생성 불필요.

    **빈 상태 (토론 0건):**
    UI-SPEC §4 — 풀페이지 빈 상태는 CTA 없음 (새로고침 기능 없음).
  </behavior>
  <action>
    **Step 1 — `webapp/src/app/stocks/[code]/discussions/page.tsx` 신규:**
    ```tsx
    'use client';
    import { use } from 'react';
    import { DiscussionPageClient } from '@/components/stock/discussion-page-client';

    export default function DiscussionsPage({ params }: { params: Promise<{ code: string }> }) {
      const { code } = use(params);
      return <DiscussionPageClient code={code} />;
    }
    ```

    **Step 2 — `webapp/src/components/stock/discussion-page-client.tsx` 신규** (Phase 7 news-page-client.tsx 구조 복제 + Compact 표 형식 + copy 교체):
    ```tsx
    'use client';
    import { useEffect, useState } from 'react';
    import Link from 'next/link';
    import { notFound } from 'next/navigation';
    import type { Discussion } from '@gh-radar/shared';
    import { Card } from '@/components/ui/card';
    import { Button } from '@/components/ui/button';
    import { ApiClientError } from '@/lib/api';
    import { fetchStockDetail, fetchStockDiscussions } from '@/lib/stock-api';
    import { DiscussionItem } from './discussion-item';
    import { DiscussionListSkeleton } from './discussion-list-skeleton';

    export interface DiscussionPageClientProps {
      code: string;
    }

    export function DiscussionPageClient({ code }: DiscussionPageClientProps) {
      const [name, setName] = useState<string | null>(null);
      const [discussions, setDiscussions] = useState<Discussion[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<ApiClientError | null>(null);

      useEffect(() => {
        const ctl = new AbortController();
        setIsLoading(true);
        Promise.all([
          fetchStockDetail(code, ctl.signal).catch((err) => {
            if (err instanceof ApiClientError && err.status === 404) notFound();
            throw err;
          }),
          fetchStockDiscussions(code, { days: 7, limit: 50 }, ctl.signal),
        ])
          .then(([detail, list]) => {
            setName(detail.name ?? null);
            setDiscussions(list);
            setError(null);
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            if (err instanceof ApiClientError) setError(err);
          })
          .finally(() => setIsLoading(false));
        return () => ctl.abort();
      }, [code]);

      const retry = () => {
        setError(null);
        setIsLoading(true);
        // useEffect 재실행을 위해 code 재설정 방식 대신 직접 재fetch
        const ctl = new AbortController();
        Promise.all([
          fetchStockDetail(code, ctl.signal),
          fetchStockDiscussions(code, { days: 7, limit: 50 }, ctl.signal),
        ])
          .then(([detail, list]) => { setName(detail.name ?? null); setDiscussions(list); })
          .catch((err: unknown) => { if (err instanceof ApiClientError) setError(err); })
          .finally(() => setIsLoading(false));
      };

      return (
        <main className="mx-auto max-w-[980px] p-6 space-y-6">
          {/* 03-UI-SPEC §4.4 Page Back Nav — 타이틀 인라인 ← 링크 */}
          <div className="flex items-center gap-2">
            <Link
              href={`/stocks/${encodeURIComponent(code)}`}
              aria-label="종목 상세로 돌아가기"
              className="text-[length:var(--t-h3)] text-[var(--muted-fg)] hover:text-[var(--primary)] py-2 pr-1 focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
            >
              ←
            </Link>
            <h1 className="text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
              {(name ?? code)} — 최근 7일 토론
            </h1>
          </div>

          {/* 에러 상태 */}
          {error && discussions.length === 0 && !isLoading ? (
            <Card className="p-4" role="alert" aria-live="polite">
              <h2 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)] mb-2">
                토론방을 불러올 수 없어요
              </h2>
              <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)] mb-4">
                잠시 후 다시 시도해주세요.
              </p>
              <Button onClick={retry}>다시 시도</Button>
            </Card>
          ) : null}

          {/* 로딩 */}
          {isLoading ? (
            <Card className="py-2 px-4">
              <DiscussionListSkeleton variant="full" />
            </Card>
          ) : null}

          {/* 빈 상태 (로드 완료 + 에러 없음 + 0건) — CTA 없음 (D6) */}
          {!isLoading && !error && discussions.length === 0 ? (
            <Card className="p-6 text-center" role="status">
              <h2 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)] mb-2">
                표시할 토론 글이 없어요
              </h2>
              <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.
              </p>
            </Card>
          ) : null}

          {/* 정상 리스트 */}
          {!isLoading && !error && discussions.length > 0 ? (
            <Card className="py-2 px-4">
              {/* 컬럼 헤더 — md+ 에서만 */}
              <div className="hidden md:grid grid-cols-[1fr_140px_120px] gap-3 py-2 border-b border-[var(--border)] text-[length:var(--t-caption)] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
                <span>제목</span>
                <span>작성자</span>
                <span className="text-right">시간</span>
              </div>
              <ul className="divide-y divide-[var(--border-subtle)]">
                {discussions.map((d) => (
                  <DiscussionItem key={d.id} discussion={d} variant="full" />
                ))}
              </ul>
            </Card>
          ) : null}
        </main>
      );
    }
    ```
  </action>
  <verify>
    <automated>test -f webapp/src/app/stocks/[code]/discussions/page.tsx &amp;&amp; test -f webapp/src/components/stock/discussion-page-client.tsx &amp;&amp; grep -q "use(params)" webapp/src/app/stocks/[code]/discussions/page.tsx &amp;&amp; grep -q "DiscussionPageClient" webapp/src/components/stock/discussion-page-client.tsx &amp;&amp; grep -q "종목 상세로 돌아가기" webapp/src/components/stock/discussion-page-client.tsx &amp;&amp; grep -q "최근 7일 토론" webapp/src/components/stock/discussion-page-client.tsx &amp;&amp; pnpm -F @gh-radar/webapp typecheck &amp;&amp; pnpm -F @gh-radar/webapp build</automated>
  </verify>
  <acceptance_criteria>
    - 2개 파일 생성
    - `grep -q "use(params)" webapp/src/app/stocks/[code]/discussions/page.tsx` (Next 15 패턴)
    - `grep -q "DiscussionPageClient" webapp/src/components/stock/discussion-page-client.tsx` → 1+ (컴포넌트 export)
    - 03-UI-SPEC §4.4 Back Nav 준수: `grep -q "종목 상세로 돌아가기" webapp/src/components/stock/discussion-page-client.tsx` (aria-label)
    - `grep -q "href={\`/stocks/\${encodeURIComponent(code)}\`}" webapp/src/components/stock/discussion-page-client.tsx` (명시적 href, `router.back()` 금지 준수)
    - `grep -q "days: 7" webapp/src/components/stock/discussion-page-client.tsx` + `grep -q "limit: 50" webapp/src/components/stock/discussion-page-client.tsx` (D6 7일/50 하드캡)
    - Compact 표 형식 준수 (Deviation Guardrail #8a):
      - `grep -q "grid-cols-\[1fr_140px_120px\]" webapp/src/components/stock/discussion-page-client.tsx` (3열)
      - `grep -q "hidden md:grid" webapp/src/components/stock/discussion-page-client.tsx` (모바일 헤더 숨김)
      - `grep -q "제목" webapp/src/components/stock/discussion-page-client.tsx` + `grep -q "작성자" webapp/src/components/stock/discussion-page-client.tsx` + `grep -q "시간" webapp/src/components/stock/discussion-page-client.tsx` (컬럼 헤더 3종)
    - 새로고침 버튼 없음: `! grep -q "DiscussionRefreshButton" webapp/src/components/stock/discussion-page-client.tsx` (Deviation Guardrail — 풀페이지 새로고침 금지)
    - `grep -q "variant=\"full\"" webapp/src/components/stock/discussion-page-client.tsx` (DiscussionItem variant)
    - `pnpm -F @gh-radar/webapp typecheck` exit 0
    - `pnpm -F @gh-radar/webapp build` exit 0 — Next build 가 새 동적 라우트 컴파일
  </acceptance_criteria>
  <done>새 라우트 page.tsx + 클라이언트 컴포넌트 + typecheck + build 그린 + UI-SPEC §3/§4.4/§Deviation Guardrails 준수</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-05)

| Boundary | Description |
|----------|-------------|
| URL param `:code` → page | 외부 입력 — 이미 Phase 6 route 레벨 유효성 검증 있음 (not-found.tsx 상속) |
| 원문 URL 링크 | external nav — DiscussionItem 공용 컴포넌트가 `target=_blank + rel` 강제 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02 | Tampering (URL tabnabbing) | DiscussionItem (Plan 08-04 공용) | mitigate | Plan 08-04 의 `target="_blank" rel="noopener noreferrer"` 계승. 본 plan 은 별도 링크 생성 안 함. |
| T-07 | Tampering (Open redirect) | Back link href | mitigate | `href={`/stocks/${encodeURIComponent(code)}`}` — relative path + encodeURIComponent. `router.back()` 금지 (UI-SPEC Deviation Guardrail #11). |
</threat_model>

<verification>
- `test -f webapp/src/app/stocks/[code]/discussions/page.tsx`
- `test -f webapp/src/components/stock/discussion-page-client.tsx`
- `pnpm -F @gh-radar/webapp build` exit 0
- `grep -q "use(params)" webapp/src/app/stocks/[code]/discussions/page.tsx`
- `grep -q "limit: 50" webapp/src/components/stock/discussion-page-client.tsx` (D6 하드캡)
- `grep -q "grid-cols-\[1fr_140px_120px\]" webapp/src/components/stock/discussion-page-client.tsx` (Compact 3열)
- `! grep -q "DiscussionRefreshButton" webapp/src/components/stock/discussion-page-client.tsx` (풀페이지 새로고침 없음)
- Phase 7 news 풀페이지 회귀 없음: `git diff webapp/src/app/stocks/[code]/news/page.tsx webapp/src/components/stock/news-page-client.tsx` 0 lines
</verification>

<success_criteria>
- /stocks/[code]/discussions 라우트가 Next 15 use(params) 로 동작
- Compact 3열 표 (제목+preview / 작성자 / 시간) at md+, 모바일은 수직 재배치
- 03-UI-SPEC §4.4 Back Nav 준수 (인라인 ← 명시적 href)
- 서버 하드캡 50건 + 새로고침 없음 + 에러/로딩/빈 상태 모두 렌더
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-05-SUMMARY.md`:
- 신규 라우트 page.tsx + 클라이언트 컴포넌트 경로
- 반응형 breakpoint 동작 검증 (md+ 헤더 row / 모바일 재배치)
- 빈 상태 + 에러 상태 렌더 경로
- Phase 7 풀페이지 news 회귀 검증 결과
</output>
