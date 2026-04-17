---
plan: 08-04
phase: 08
type: execute
wave: 2
depends_on: [08-03]
requirements: [DISC-01]
files_modified:
  - webapp/src/lib/stock-api.ts
  - webapp/src/lib/format-discussion-date.ts
  - webapp/src/lib/__tests__/format-discussion-date.test.ts
  - webapp/src/components/stock/stock-discussion-section.tsx
  - webapp/src/components/stock/discussion-item.tsx
  - webapp/src/components/stock/discussion-refresh-button.tsx
  - webapp/src/components/stock/discussion-empty-state.tsx
  - webapp/src/components/stock/discussion-list-skeleton.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
autonomous: true
threat_refs: [T-01, T-02]

must_haves:
  truths:
    - "종목 상세 페이지 `space-y-6` 컨테이너의 2번째 자식으로 <StockDiscussionSection> 이 렌더된다 — 뉴스 섹션(1번째) 과 구조 유지"
    - "상세 Card 에 최근 24시간 상위 5건 표시 (제목 2줄 clamp + 본문 2줄 clamp preview + 작성자 + MM/DD HH:mm KST 시간)"
    - "토론 항목 제목 클릭 시 새 탭으로 열리고 target=_blank + rel=noopener noreferrer 속성을 가진다 (T-02)"
    - "새로고침 버튼이 아이콘 스핀 + 30초 쿨다운 카운트다운 (`{N}s`) 노출"
    - "서버 429 응답의 retry_after_seconds 가 클라이언트 카운트다운에 우선 사용된다"
    - "Stale 상태(D7) — 캐시 있음 + 새로고침 실패 → 'X분 전 데이터' Badge + 리스트 stale-but-visible"
    - "빈 상태 — MessageSquareOff/Inbox 아이콘 + '아직 토론 글이 없어요' heading + 'CTA 토론방 새로고침'"
    - "초기 로드 실패 — 에러 Card + 고정 copy '토론방을 불러올 수 없어요 / 잠시 후 다시 시도해주세요' (서버 원문 비노출 — D7)"
    - "stock-detail-client.tsx 의 기존 ComingSoonCard('종목토론방') 교체만 수행 — 뉴스 섹션 위치 + space-y-6 컨테이너 구조 유지 (D12)"
  artifacts:
    - path: "webapp/src/components/stock/stock-discussion-section.tsx"
      provides: "상세 페이지 종목토론방 Card (StockDetailClient 2번째 자식)"
      min_lines: 120
    - path: "webapp/src/components/stock/discussion-item.tsx"
      provides: "DiscussionItem — variant card/full"
      exports: ["DiscussionItem"]
    - path: "webapp/src/components/stock/discussion-refresh-button.tsx"
      provides: "쿨다운 카운트다운 버튼"
      exports: ["DiscussionRefreshButton"]
    - path: "webapp/src/components/stock/discussion-empty-state.tsx"
      provides: "빈 상태 CTA"
      exports: ["DiscussionEmptyState"]
    - path: "webapp/src/components/stock/discussion-list-skeleton.tsx"
      provides: "로딩 스켈레톤 (variant card/full)"
      exports: ["DiscussionListSkeleton"]
    - path: "webapp/src/lib/format-discussion-date.ts"
      provides: "KST 포맷 유틸 2종"
      exports: ["formatDiscussionCardDate", "formatDiscussionFullDate"]
  key_links:
    - from: "webapp/src/components/stock/stock-detail-client.tsx"
      to: "stock-discussion-section.tsx"
      via: "space-y-6 컨테이너 2번째 자식 (뉴스 아래)"
      pattern: "StockDiscussionSection"
    - from: "discussion-item.tsx"
      to: "네이버 원문 URL"
      via: 'target="_blank" rel="noopener noreferrer"'
      pattern: "noopener"
    - from: "stock-discussion-section.tsx"
      to: "ApiClientError.details.retry_after_seconds"
      via: "429 catch → cooldownUntil"
      pattern: "retry_after_seconds"
---

<objective>
종목 상세 페이지의 `<ComingSoonCard title="종목토론방" ...>` placeholder 를 실제 토론방 UI 로 교체한다. UI-SPEC §Component Inventory 의 신규 컴포넌트 5~6종(`StockDiscussionSection`, `DiscussionItem`, `DiscussionRefreshButton`, `DiscussionEmptyState`, `DiscussionListSkeleton`, 선택 `DiscussionStaleBadge`)과 `fetchStockDiscussions`/`refreshStockDiscussions` API 클라이언트, KST 날짜 포맷 유틸을 구현한다.

**Phase 7 복제 전략:** Phase 7 `stock-news-section.tsx` / `news-item.tsx` / `news-refresh-button.tsx` / `news-empty-state.tsx` / `news-list-skeleton.tsx` 를 70~80% 복제하고 아이콘(MessageSquare), copy("종목토론방"), scope(24h/5), 본문 preview 2줄 clamp, Stale 상태 오케스트레이션(D7)만 Phase 8 고유로 추가한다.

Purpose: DISC-01 (1) — 상세 페이지에서 토론방 목록 표시 + 섹션 전용 새로고침(D3). 서버 API (Plan 08-03) 의 직접 소비자.
Output: placeholder → 실제 UI 교체, 신규 컴포넌트 6종 + 유틸 + tests.
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
@.planning/phases/08-discussion-board/08-VALIDATION.md

@webapp/src/lib/api.ts
@webapp/src/lib/stock-api.ts
@webapp/src/lib/format-news-date.ts
@webapp/src/components/stock/stock-detail-client.tsx
@webapp/src/components/stock/stock-news-section.tsx
@webapp/src/components/stock/news-item.tsx
@webapp/src/components/stock/news-refresh-button.tsx
@webapp/src/components/stock/news-empty-state.tsx
@webapp/src/components/stock/news-list-skeleton.tsx
@webapp/src/components/stock/coming-soon-card.tsx
@webapp/src/components/ui/card.tsx
@webapp/src/components/ui/button.tsx
@webapp/src/components/ui/skeleton.tsx
@webapp/src/components/ui/badge.tsx

@packages/shared/src/discussion.ts

<interfaces>
## Plan 08-03 서버 계약

```
GET /api/stocks/:code/discussions?hours=24&limit=5   → Discussion[] (상세 Card, camelCase)
GET /api/stocks/:code/discussions?days=7&limit=50    → Discussion[] (/discussions 풀페이지)
POST /api/stocks/:code/discussions/refresh           → Discussion[] (200, camelCase)
                                                     → 429 { error:{code:'DISCUSSION_REFRESH_COOLDOWN', message}, retry_after_seconds:N } + Retry-After header
                                                     → 503 PROXY_UNAVAILABLE / PROXY_BUDGET_EXHAUSTED
```

## `Discussion` 타입 (packages/shared/src/discussion.ts — Plan 08-01 산출)

```ts
export type Discussion = {
  id: string;
  stockCode: string;
  postId: string;
  title: string;
  body: string | null;       // plaintext — UI 에서 line-clamp-2
  author: string | null;     // 네이버 닉네임 — masking 없음
  postedAt: string;          // ISO (KST offset 또는 Z)
  scrapedAt: string;         // ISO — Stale 계산용
  url: string;               // 네이버 고유 URL (nid 포함)
};
```

## Phase 7 ApiClientError (이미 details 포함)

Phase 7 에서 `ApiClientError.details?: unknown` 필드 추가됨. 429 응답의 `retry_after_seconds` 가 `details.retry_after_seconds` 로 보존됨.
→ 본 plan 은 ApiClientError 확장 **불필요**. 그대로 사용.

## 기존 StockDetailClient 구조 (Phase 7 이후)

```tsx
// webapp/src/components/stock/stock-detail-client.tsx (Phase 7 완료 상태)
<div className="space-y-6">
  <StockNewsSection stockCode={stock.code} />
  <ComingSoonCard title="종목토론방" body="Phase 8 로드맵에서 제공됩니다." />
</div>
```
→ 본 plan 이 2번째 자식만 `<StockDiscussionSection stockCode={stock.code} />` 로 교체.
**D12 guardrail:** `space-y-6` 컨테이너, 1번째 자식 (StockNewsSection), grid/2열 복원 **절대 금지**.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: API 클라이언트 확장 (fetchStockDiscussions/refreshStockDiscussions) + format-discussion-date 유틸 (TDD)</name>
  <files>
    webapp/src/lib/stock-api.ts,
    webapp/src/lib/format-discussion-date.ts,
    webapp/src/lib/__tests__/format-discussion-date.test.ts
  </files>
  <read_first>
    - webapp/src/lib/api.ts (ApiClientError — details 필드 이미 Phase 7 추가됨)
    - webapp/src/lib/stock-api.ts (fetchStockNews/refreshStockNews 패턴 — 동일 구조 복제)
    - webapp/src/lib/format-news-date.ts (Intl.DateTimeFormat KST 패턴)
    - webapp/src/lib/__tests__/format-news-date.test.ts (Phase 7 test 패턴)
    - packages/shared/src/discussion.ts (Discussion 타입)
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §Copywriting (날짜 포맷 2종)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D9 (쿼리 파라미터)
  </read_first>
  <behavior>
    stock-api.ts 추가 2개 함수:
      fetchStockDiscussions(code, opts: { hours?, days?, limit? }, signal: AbortSignal): Promise<Discussion[]>
        - hours 우선, 없으면 days, 둘 다 없으면 days=7 default (서버와 동일)
        - limit default 50 (서버 하드캡)
        - GET /api/stocks/{code}/discussions?hours=...&limit=...
        - 쿼리 파라미터 빌드 시 undefined 는 제외 (hours 만 전달 or days 만 전달)
      refreshStockDiscussions(code, signal: AbortSignal): Promise<Discussion[]>
        - POST /api/stocks/{code}/discussions/refresh
        - 429 → ApiClientError(status=429, details.retry_after_seconds=N) — apiFetch 가 이미 처리 (Phase 7)

    format-discussion-date.ts:
      formatDiscussionCardDate(iso): 'MM/DD HH:mm' KST — 상세 Card
      formatDiscussionFullDate(iso): 'YYYY-MM-DD HH:mm' KST — /discussions 풀페이지
      둘 다 Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... }) 사용
      date-fns-tz 도입 금지 (UI-SPEC Deviation Guardrails §2)
      잘못된 iso → '—' 반환

    **주의**: Phase 7 `format-news-date.ts` 와 이름만 다름. 공통 추상화 금지 (UI-SPEC §20 — 섹션 공통화 Deferred).
  </behavior>
  <action>
    **`webapp/src/lib/stock-api.ts`** 끝에 함수 2개 추가 (Phase 7 fetchStockNews 바로 아래):
    ```ts
    import type { Discussion } from '@gh-radar/shared';

    export interface FetchDiscussionsOpts {
      hours?: number;
      days?: number;
      limit?: number;
    }

    export function fetchStockDiscussions(
      code: string,
      opts: FetchDiscussionsOpts,
      signal: AbortSignal,
    ): Promise<Discussion[]> {
      const sp = new URLSearchParams();
      if (opts.hours != null) sp.set('hours', String(opts.hours));
      else if (opts.days != null) sp.set('days', String(opts.days));
      else sp.set('days', '7');
      sp.set('limit', String(opts.limit ?? 50));
      return apiFetch<Discussion[]>(
        `/api/stocks/${encodeURIComponent(code)}/discussions?${sp.toString()}`,
        { signal },
      );
    }

    export function refreshStockDiscussions(
      code: string,
      signal: AbortSignal,
    ): Promise<Discussion[]> {
      return apiFetch<Discussion[]>(
        `/api/stocks/${encodeURIComponent(code)}/discussions/refresh`,
        { method: 'POST', signal },
      );
    }
    ```

    **`webapp/src/lib/format-discussion-date.ts`** 신규 (format-news-date.ts 구조 복제):
    ```ts
    /**
     * Phase 08 — KST 기반 토론방 날짜 포맷. date-fns-tz 미사용 (UI-SPEC Guardrail §2).
     * Phase 7 format-news-date.ts 와 의도적으로 분리 (공통 추상화 Deferred).
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

    const FULL_FMT = new Intl.DateTimeFormat('ko-KR', {
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

    /** 상세 Card — 'MM/DD HH:mm' (KST). */
    export function formatDiscussionCardDate(iso: string | null | undefined): string {
      const d = parseSafe(iso);
      if (!d) return PLACEHOLDER;
      const parts = CARD_FMT.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});
      return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    }

    /** /discussions 풀페이지 — 'YYYY-MM-DD HH:mm' (KST). */
    export function formatDiscussionFullDate(iso: string | null | undefined): string {
      const d = parseSafe(iso);
      if (!d) return PLACEHOLDER;
      const parts = FULL_FMT.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
    ```

    **`webapp/src/lib/__tests__/format-discussion-date.test.ts`** 신규:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { formatDiscussionCardDate, formatDiscussionFullDate } from '../format-discussion-date';

    describe('formatDiscussionCardDate (MM/DD HH:mm KST)', () => {
      it('formats UTC to KST card style', () => {
        expect(formatDiscussionCardDate('2026-04-17T05:32:00.000Z')).toBe('04/17 14:32');
      });
      it('pads 2 digits', () => {
        expect(formatDiscussionCardDate('2026-01-05T00:00:00.000Z')).toBe('01/05 09:00');
      });
      it('returns em-dash on invalid input', () => {
        expect(formatDiscussionCardDate('invalid')).toBe('—');
      });
      it('handles null/undefined/empty', () => {
        expect(formatDiscussionCardDate('')).toBe('—');
        expect(formatDiscussionCardDate(null)).toBe('—');
        expect(formatDiscussionCardDate(undefined)).toBe('—');
      });
    });

    describe('formatDiscussionFullDate (YYYY-MM-DD HH:mm KST)', () => {
      it('formats UTC to KST full style', () => {
        expect(formatDiscussionFullDate('2026-04-17T05:32:00.000Z')).toBe('2026-04-17 14:32');
      });
      it('returns em-dash on invalid', () => {
        expect(formatDiscussionFullDate('not-a-date')).toBe('—');
      });
    });
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/webapp test -- format-discussion-date.test.ts --run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "fetchStockDiscussions" webapp/src/lib/stock-api.ts` + `grep -q "refreshStockDiscussions" webapp/src/lib/stock-api.ts` — 2개 export
    - `grep -q "Asia/Seoul" webapp/src/lib/format-discussion-date.ts` — KST timezone
    - V-20 guardrail: `grep -E "date-fns-tz" webapp/src/lib/format-discussion-date.ts` → 0 match
    - format-discussion-date.test.ts ≥6 case 그린
    - `pnpm -F @gh-radar/webapp typecheck` exit 0
  </acceptance_criteria>
  <done>API 확장 + 날짜 포맷 유틸 + 6+ test case 그린</done>
</task>

<task type="auto">
  <name>Task 2: UI 컴포넌트 5종 신규 (DiscussionItem / DiscussionRefreshButton / DiscussionEmptyState / DiscussionListSkeleton / StockDiscussionSection)</name>
  <files>
    webapp/src/components/stock/discussion-item.tsx,
    webapp/src/components/stock/discussion-refresh-button.tsx,
    webapp/src/components/stock/discussion-empty-state.tsx,
    webapp/src/components/stock/discussion-list-skeleton.tsx,
    webapp/src/components/stock/stock-discussion-section.tsx
  </files>
  <read_first>
    - webapp/src/components/stock/stock-news-section.tsx (Phase 7 — 복제 기준, 구조 70~80% 동일)
    - webapp/src/components/stock/news-item.tsx (variant card/full 패턴)
    - webapp/src/components/stock/news-refresh-button.tsx (쿨다운 카운트다운 구현)
    - webapp/src/components/stock/news-empty-state.tsx (role=status + CTA 패턴)
    - webapp/src/components/stock/news-list-skeleton.tsx (variant 분기)
    - webapp/src/components/ui/card.tsx
    - webapp/src/components/ui/button.tsx
    - webapp/src/components/ui/skeleton.tsx
    - webapp/src/components/ui/badge.tsx (신규 사용 — Stale Badge)
    - webapp/src/lib/api.ts (ApiClientError.details)
    - webapp/src/lib/stock-api.ts (Task 1 산출 — fetchStockDiscussions/refreshStockDiscussions)
    - webapp/src/lib/format-discussion-date.ts (Task 1 산출)
    - packages/shared/src/discussion.ts (Discussion 타입)
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §Component Inventory + §Visual Specifications §1~8 + §Copywriting Contract + §Deviation Guardrails
  </read_first>
  <behavior>
    **DiscussionItem** (`discussion-item.tsx`):
      - props: `{ discussion: Discussion; variant: 'card' | 'full' }`
      - 'card' variant: flex-col gap-1 py-3 min-h-14
        - `<a target="_blank" rel="noopener noreferrer" aria-label="{title} 원문 보기 (새 창)" className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]">` 제목
        - `<p>` body preview (null 체크, null 이면 생략) — line-clamp-2 --t-sm muted-fg
        - 메타 row: 작성자 (truncate max-w-[40%]) + `·` + `<time dateTime={postedAt}>MM/DD HH:mm</time>` mono
      - 'full' variant: Compact 3열 grid (제목+preview / 작성자 / 시간 — Plan 08-05 에서 상세 사용). 본 plan 은 card 만 사용하나 양쪽 export.
      - **번호 인덱스 금지** (UI-SPEC §9)

    **DiscussionRefreshButton** (`discussion-refresh-button.tsx`):
      - Phase 7 NewsRefreshButton 과 구조 동일 — aria-label copy 만 교체
      - props: `{ onRefresh: () => void; isRefreshing: boolean; cooldownSeconds: number }`
      - cooldownSeconds > 0 → disabled, 내부 `{N}s` mono text 표시
      - isRefreshing 시 RefreshCw animate-spin + aria-busy=true + disabled
      - aria-label: idle='토론방 새로고침' / refreshing='토론방 새로고침 중' / cooldown='{N}초 후 새로고침 가능'
      - size="sm" variant="outline" icon-only (32×32)

    **DiscussionEmptyState** (`discussion-empty-state.tsx`):
      - props: `{ onCtaClick: () => void; isRefreshing: boolean; cooldownSeconds: number }`
      - MessageSquareOff (또는 Inbox) lucide icon size-10 muted-fg
      - heading: '아직 토론 글이 없어요' (--t-base font-semibold --fg)
      - body: '새로고침으로 최신 글을 가져와보세요.' (--t-sm muted-fg)
      - CTA button: '토론방 새로고침' (variant=default), cooldown 중 disabled + `{N}초 후 재시도` copy
      - role='status'
      - `<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center">`

    **DiscussionListSkeleton** (`discussion-list-skeleton.tsx`):
      - props: `{ variant?: 'card' | 'full'; rows?: number }`
      - 'card' default 5행 × 4줄 (제목 h-4 w-full + preview h-3 w-11/12 + preview h-3 w-2/3 + 메타 h-3 w-32), py-3 border-b
      - 'full' default 10행 × 3열 grid (제목 셀: h-4 w-4/5 + h-3 w-3/5 / 작성자: h-3 w-24 / 시간: h-3 w-28 ml-auto), py-2 border-b
      - `skeleton-list` util 로 shimmer stagger

    **StockDiscussionSection** (`stock-discussion-section.tsx`):
      - props: `{ stockCode: string }`
      - state:
        - discussions: Discussion[]
        - isLoading: boolean (initial mount)
        - isRefreshing: boolean (POST in-flight)
        - error: ApiClientError | null (초기 로드 실패)
        - cooldownUntil: number (ms timestamp, 0=none)
        - cooldownSeconds: number (useState + setInterval 1s)
        - inlineRefreshError: string | null (3s 자동 소거)
        - staleMinutes: number | null (D7 — MAX(scrapedAt) 가 10분 초과 시 계산)
      - mount: useEffect 로 AbortController → fetchStockDiscussions(stockCode, { hours: 24, limit: 5 }, signal)
        - 성공 → discussions 설정 + staleMinutes 계산 (first row.scrapedAt 기준, 10분 초과시만 값)
        - 실패 → error 설정
      - refresh handler: AbortController → refreshStockDiscussions(stockCode, signal)
        - 성공 → discussions 교체, cooldownUntil = now + 30_000, staleMinutes = null (최신화됨)
        - 429 catch: err.details?.retry_after_seconds 있으면 그 값으로 cooldownUntil = now + N*1000
        - 503/5xx catch: inlineRefreshError 3s 자동 소거. 기존 discussions 유지 (stale-but-visible). staleMinutes 재계산.
      - cooldown countdown: setInterval(1000) — cooldownUntil > now 일 때만 동작, 0 도달 시 interval clear + cooldownUntil=0
      - staleMinutes countdown: mount 후 setInterval(60s) — scrapedAt 기준 분 단위로 Badge 업데이트
      - 렌더 분기:
        - isLoading → DiscussionListSkeleton variant="card"
        - error (discussions 빈) → 에러 Card + 재시도 (**고정 copy** '토론방을 불러올 수 없어요' + '잠시 후 다시 시도해주세요' — D7 서버 원문 비노출)
        - discussions 빈 + !isLoading → DiscussionEmptyState
        - 정상 → Card:
          - header: flex justify-between → left(MessageSquare icon + '종목토론방' h3 + staleMinutes Badge if any) + right(DiscussionRefreshButton)
          - inlineRefreshError 있으면 role='alert' bg-destructive/10 toast
          - ul divide-y divide-[var(--border-subtle)] → DiscussionItem variant="card" × min(5, discussions.length)
          - footer: 전체 토론 보기 → /stocks/{code}/discussions + '최근 7일 전체' caption

    **Stale Badge (inline — 별도 컴포넌트 분리 불필요):**
      - `staleMinutes >= 10 && staleMinutes < 60` → `<Badge variant="secondary" className="mono">X분 전 데이터</Badge>`
      - `staleMinutes >= 60` → `<Badge>X시간 전 데이터</Badge>` (Math.floor(staleMinutes / 60))
      - 쿨다운과 별개 — Stale 은 지속 노출, 쿨다운은 시간 감소
  </behavior>
  <action>
    **Step 1 — `webapp/src/components/stock/discussion-item.tsx`:**
    ```tsx
    'use client';
    import type { Discussion } from '@gh-radar/shared';
    import { formatDiscussionCardDate, formatDiscussionFullDate } from '@/lib/format-discussion-date';

    export interface DiscussionItemProps {
      discussion: Discussion;
      variant: 'card' | 'full';
    }

    export function DiscussionItem({ discussion, variant }: DiscussionItemProps) {
      const d = discussion;
      if (variant === 'card') {
        return (
          <li className="flex flex-col gap-1 py-3 min-h-14 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors" data-testid="discussion-item">
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${d.title} 원문 보기 (새 창)`}
              className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
            >
              {d.title}
            </a>
            {d.body ? (
              <p className="line-clamp-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                {d.body}
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {d.author ? (
                <span className="truncate max-w-[40%]">{d.author}</span>
              ) : null}
              {d.author ? <span aria-hidden>·</span> : null}
              <time className="mono" dateTime={d.postedAt}>{formatDiscussionCardDate(d.postedAt)}</time>
            </div>
          </li>
        );
      }
      // 'full' variant — Plan 08-05 가 주로 사용. 기본 구조만 준비.
      return (
        <li
          className="grid items-center gap-3 py-2 min-h-11 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors md:grid-cols-[1fr_140px_120px]"
          data-testid="discussion-item"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${d.title} 원문 보기 (새 창)`}
              className="line-clamp-1 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
            >
              {d.title}
            </a>
            {d.body ? (
              <p className="line-clamp-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {d.body}
              </p>
            ) : null}
          </div>
          <span className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {d.author ?? ''}
          </span>
          <time className="mono text-right text-[length:var(--t-caption)] text-[var(--muted-fg)]" dateTime={d.postedAt}>
            {formatDiscussionFullDate(d.postedAt)}
          </time>
        </li>
      );
    }
    ```

    **Step 2 — `webapp/src/components/stock/discussion-refresh-button.tsx`** (Phase 7 news-refresh-button.tsx 구조 1:1 복사 후 copy 교체):
    ```tsx
    'use client';
    import { RefreshCw } from 'lucide-react';
    import { Button } from '@/components/ui/button';

    export interface DiscussionRefreshButtonProps {
      onRefresh: () => void;
      isRefreshing: boolean;
      cooldownSeconds: number;
    }

    export function DiscussionRefreshButton({ onRefresh, isRefreshing, cooldownSeconds }: DiscussionRefreshButtonProps) {
      const onCooldown = cooldownSeconds > 0;
      const disabled = isRefreshing || onCooldown;
      const ariaLabel = isRefreshing
        ? '토론방 새로고침 중'
        : onCooldown
        ? `${cooldownSeconds}초 후 새로고침 가능`
        : '토론방 새로고침';

      return (
        <Button
          size="sm"
          variant="outline"
          className="size-8 p-0 relative"
          onClick={onRefresh}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-busy={isRefreshing || undefined}
          data-testid="discussion-refresh-button"
          data-remaining-seconds={onCooldown ? cooldownSeconds : undefined}
        >
          <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
          {onCooldown ? (
            <span className="absolute inset-0 flex items-center justify-center mono text-[10px] text-[var(--muted-fg)] bg-[var(--card)]">
              {cooldownSeconds}s
            </span>
          ) : null}
        </Button>
      );
    }
    ```

    **Step 3 — `webapp/src/components/stock/discussion-empty-state.tsx`** (Phase 7 news-empty-state.tsx 구조 복제):
    ```tsx
    'use client';
    import { MessageSquareOff, RefreshCw } from 'lucide-react';
    import { Button } from '@/components/ui/button';

    export interface DiscussionEmptyStateProps {
      onCtaClick: () => void;
      isRefreshing: boolean;
      cooldownSeconds: number;
    }

    export function DiscussionEmptyState({ onCtaClick, isRefreshing, cooldownSeconds }: DiscussionEmptyStateProps) {
      const onCooldown = cooldownSeconds > 0;
      const disabled = isRefreshing || onCooldown;
      const ctaLabel = onCooldown ? `${cooldownSeconds}초 후 재시도` : '토론방 새로고침';

      return (
        <div
          role="status"
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
        >
          <MessageSquareOff className="size-10 text-[var(--muted-fg)]" aria-hidden />
          <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
            아직 토론 글이 없어요
          </h3>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            새로고침으로 최신 글을 가져와보세요.
          </p>
          <Button onClick={onCtaClick} disabled={disabled} aria-busy={isRefreshing || undefined}>
            <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin mr-2' : 'mr-2'}`} aria-hidden />
            {ctaLabel}
          </Button>
        </div>
      );
    }
    ```

    **Step 4 — `webapp/src/components/stock/discussion-list-skeleton.tsx`:**
    ```tsx
    import { Skeleton } from '@/components/ui/skeleton';

    export interface DiscussionListSkeletonProps {
      variant?: 'card' | 'full';
      rows?: number;
    }

    export function DiscussionListSkeleton({ variant = 'card', rows }: DiscussionListSkeletonProps) {
      const n = rows ?? (variant === 'card' ? 5 : 10);

      if (variant === 'card') {
        return (
          <ul className="skeleton-list divide-y divide-[var(--border-subtle)]" aria-hidden>
            {Array.from({ length: n }).map((_, i) => (
              <li key={i} className="py-3 space-y-2 border-b border-[var(--border-subtle)] last:border-0">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-32" />
              </li>
            ))}
          </ul>
        );
      }
      // full
      return (
        <ul className="skeleton-list divide-y divide-[var(--border-subtle)]" aria-hidden>
          {Array.from({ length: n }).map((_, i) => (
            <li key={i} className="grid items-center gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0 md:grid-cols-[1fr_140px_120px]">
              <div className="space-y-1">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-28 ml-auto" />
            </li>
          ))}
        </ul>
      );
    }
    ```

    **Step 5 — `webapp/src/components/stock/stock-discussion-section.tsx`** (가장 복잡 — UI-SPEC §Visual Specifications §1, §7, §8, §9 참조. Phase 7 `stock-news-section.tsx` 70~80% 복제 + Stale 오케스트레이션 추가):
    ```tsx
    'use client';
    import { useEffect, useState, useRef, useCallback } from 'react';
    import Link from 'next/link';
    import { MessageSquare } from 'lucide-react';
    import type { Discussion } from '@gh-radar/shared';
    import { Card } from '@/components/ui/card';
    import { Badge } from '@/components/ui/badge';
    import { Button } from '@/components/ui/button';
    import { ApiClientError } from '@/lib/api';
    import { fetchStockDiscussions, refreshStockDiscussions } from '@/lib/stock-api';
    import { DiscussionItem } from './discussion-item';
    import { DiscussionRefreshButton } from './discussion-refresh-button';
    import { DiscussionEmptyState } from './discussion-empty-state';
    import { DiscussionListSkeleton } from './discussion-list-skeleton';

    const COOLDOWN_MS = 30_000;
    const STALE_THRESHOLD_MIN = 10;

    export interface StockDiscussionSectionProps {
      stockCode: string;
    }

    function computeStaleMinutes(discussions: Discussion[]): number | null {
      if (discussions.length === 0) return null;
      // 최신 scrapedAt (첫 행이면서 가장 큰 값)
      let maxScrapedMs = 0;
      for (const d of discussions) {
        const ms = new Date(d.scrapedAt).getTime();
        if (Number.isFinite(ms) && ms > maxScrapedMs) maxScrapedMs = ms;
      }
      if (maxScrapedMs === 0) return null;
      const diffMin = Math.floor((Date.now() - maxScrapedMs) / 60_000);
      return diffMin >= STALE_THRESHOLD_MIN ? diffMin : null;
    }

    function formatStaleLabel(minutes: number): string {
      if (minutes < 60) return `${minutes}분 전 데이터`;
      const hours = Math.floor(minutes / 60);
      return `${hours}시간 전 데이터`;
    }

    export function StockDiscussionSection({ stockCode }: StockDiscussionSectionProps) {
      const [discussions, setDiscussions] = useState<Discussion[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [isRefreshing, setIsRefreshing] = useState(false);
      const [error, setError] = useState<ApiClientError | null>(null);
      const [cooldownUntil, setCooldownUntil] = useState(0);
      const [cooldownSeconds, setCooldownSeconds] = useState(0);
      const [inlineError, setInlineError] = useState<string | null>(null);
      const [staleMinutes, setStaleMinutes] = useState<number | null>(null);
      const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      // 초기 fetch
      useEffect(() => {
        const ctl = new AbortController();
        setIsLoading(true);
        fetchStockDiscussions(stockCode, { hours: 24, limit: 5 }, ctl.signal)
          .then((list) => {
            setDiscussions(list);
            setStaleMinutes(computeStaleMinutes(list));
            setError(null);
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            if (err instanceof ApiClientError) setError(err);
          })
          .finally(() => setIsLoading(false));
        return () => ctl.abort();
      }, [stockCode]);

      // Cooldown countdown
      useEffect(() => {
        if (cooldownUntil <= Date.now()) { setCooldownSeconds(0); return; }
        const tick = () => {
          const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
          setCooldownSeconds(remaining);
          if (remaining === 0) { clearInterval(id); }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      }, [cooldownUntil]);

      // Stale minutes update (1min 간격)
      useEffect(() => {
        const id = setInterval(() => setStaleMinutes(computeStaleMinutes(discussions)), 60_000);
        return () => clearInterval(id);
      }, [discussions]);

      const handleRefresh = useCallback(() => {
        if (isRefreshing || cooldownSeconds > 0) return;
        const ctl = new AbortController();
        setIsRefreshing(true);
        refreshStockDiscussions(stockCode, ctl.signal)
          .then((list) => {
            setDiscussions(list);
            setStaleMinutes(null);
            setCooldownUntil(Date.now() + COOLDOWN_MS);
            setInlineError(null);
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            if (err instanceof ApiClientError) {
              if (err.status === 429) {
                const details = err.details as { retry_after_seconds?: number } | undefined;
                const sec = typeof details?.retry_after_seconds === 'number' ? details.retry_after_seconds : 30;
                setCooldownUntil(Date.now() + sec * 1000);
              } else {
                // 503/5xx: inline alert + stale-but-visible
                setInlineError('토론방을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.');
                if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
                inlineTimerRef.current = setTimeout(() => setInlineError(null), 3000);
                setStaleMinutes(computeStaleMinutes(discussions));
              }
            }
          })
          .finally(() => setIsRefreshing(false));
      }, [stockCode, isRefreshing, cooldownSeconds, discussions]);

      // 초기 로드 에러 + 캐시 없음 → 에러 Card
      if (error && discussions.length === 0 && !isLoading) {
        return (
          <Card className="p-4" role="alert" aria-live="polite">
            <h2 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)] mb-2">
              토론방을 불러올 수 없어요
            </h2>
            <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)] mb-4">
              잠시 후 다시 시도해주세요.
            </p>
            <Button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                const ctl = new AbortController();
                fetchStockDiscussions(stockCode, { hours: 24, limit: 5 }, ctl.signal)
                  .then((list) => { setDiscussions(list); setStaleMinutes(computeStaleMinutes(list)); })
                  .catch((e) => { if (e instanceof ApiClientError) setError(e); })
                  .finally(() => setIsLoading(false));
              }}
            >
              다시 시도
            </Button>
          </Card>
        );
      }

      // 로딩 스켈레톤
      if (isLoading) {
        return (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
                <MessageSquare className="size-5" aria-hidden />
                종목토론방
              </h2>
            </div>
            <DiscussionListSkeleton variant="card" />
          </Card>
        );
      }

      // 빈 상태
      if (discussions.length === 0) {
        return (
          <DiscussionEmptyState
            onCtaClick={handleRefresh}
            isRefreshing={isRefreshing}
            cooldownSeconds={cooldownSeconds}
          />
        );
      }

      // 정상 렌더
      return (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
                <MessageSquare className="size-5" aria-hidden />
                종목토론방
              </h2>
              {staleMinutes != null ? (
                <Badge
                  variant="secondary"
                  className="mono text-[length:var(--t-caption)] bg-[var(--muted)] text-[var(--muted-fg)]"
                  role="status"
                  aria-label={`${formatStaleLabel(staleMinutes)} — 수집된 데이터`}
                >
                  {formatStaleLabel(staleMinutes)}
                </Badge>
              ) : null}
            </div>
            <DiscussionRefreshButton
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              cooldownSeconds={cooldownSeconds}
            />
          </div>

          {inlineError ? (
            <div
              role="alert"
              className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]"
            >
              {inlineError}
            </div>
          ) : null}

          <ul className="divide-y divide-[var(--border-subtle)]">
            {discussions.slice(0, 5).map((d) => (
              <DiscussionItem key={d.id} discussion={d} variant="card" />
            ))}
          </ul>

          <div className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">
            <Link
              href={`/stocks/${encodeURIComponent(stockCode)}/discussions`}
              className="text-[length:var(--t-sm)] text-[var(--primary)] hover:underline py-2"
            >
              전체 토론 보기 →
            </Link>
            <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              최근 7일 전체
            </span>
          </div>
        </Card>
      );
    }
    ```
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/webapp typecheck &amp;&amp; pnpm -F @gh-radar/webapp build</automated>
  </verify>
  <acceptance_criteria>
    - 5개 파일 생성
    - `grep -q "MessageSquare" webapp/src/components/stock/stock-discussion-section.tsx` → 1+ match (UI-SPEC 아이콘)
    - `grep -q "noopener noreferrer" webapp/src/components/stock/discussion-item.tsx` → 1+ match (T-02)
    - `grep -q "line-clamp-2" webapp/src/components/stock/discussion-item.tsx` → 1+ match (D5 preview)
    - `grep -q "aria-label" webapp/src/components/stock/discussion-refresh-button.tsx` → 1+ match (새로고침 3 state)
    - `grep -q "retry_after_seconds" webapp/src/components/stock/stock-discussion-section.tsx` → 1 match (429 처리)
    - `grep -q "formatStaleLabel\|staleMinutes" webapp/src/components/stock/stock-discussion-section.tsx` → 1+ match (D7 Stale)
    - `grep -q "role=\"alert\"" webapp/src/components/stock/stock-discussion-section.tsx` → 1+ match (inline + 에러 Card)
    - **UI-SPEC Deviation Guardrail 재확인:**
      - `grep -q "grid-cols-\[1fr.*120px\|grid-cols-\[" webapp/src/components/stock/stock-discussion-section.tsx` → 0 match (2열 복원 금지, §4)
      - `grep -qE "뉴스|news" webapp/src/components/stock/stock-discussion-section.tsx` → 0 match (copy confusion 금지)
    - `pnpm -F @gh-radar/webapp build` exit 0
    - Phase 7 뉴스 섹션 회귀 없음: `webapp/src/components/stock/stock-news-section.tsx` 파일 미변경
  </acceptance_criteria>
  <done>5개 UI 컴포넌트 + Stale 오케스트레이션 + 429/inline error 처리 + typecheck + build 그린</done>
</task>

<task type="auto">
  <name>Task 3: stock-detail-client.tsx placeholder 교체 (D12 guardrail)</name>
  <files>
    webapp/src/components/stock/stock-detail-client.tsx
  </files>
  <read_first>
    - webapp/src/components/stock/stock-detail-client.tsx (전체 — 현재 Phase 7 완료 상태의 JSX 구조 파악 필수. `<div className="space-y-6">` 2번째 자식의 정확한 위치 찾기)
    - webapp/src/components/stock/stock-news-section.tsx (Phase 7 — 1번째 자식, 건드리지 않음)
    - webapp/src/components/stock/coming-soon-card.tsx (교체 대상 컴포넌트)
    - webapp/src/components/stock/stock-discussion-section.tsx (Task 2 산출)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D12 (순서 제약)
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §9 (레이아웃 변경 규칙) + §Deviation Guardrails #4
  </read_first>
  <action>
    **Step 1 — 현재 구조 확인:**
    `grep -n "ComingSoonCard\|StockNewsSection\|space-y-6" webapp/src/components/stock/stock-detail-client.tsx` 로 정확한 라인 찾기.

    **Step 2 — 최소 diff 교체:**
    - `import { StockDiscussionSection } from './stock-discussion-section';` 추가 (기존 import 블록 안)
    - `<ComingSoonCard title="종목토론방" body="..." />` 한 줄을 `<StockDiscussionSection stockCode={stock.code} />` 로 치환
    - **변경 금지 (D12):**
      - 1번째 자식 `<StockNewsSection stockCode={stock.code} />` — 유지
      - `<div className="space-y-6">` 컨테이너 유지 (grid 또는 2열 복원 절대 금지)
      - 토론방 섹션이 뉴스 섹션보다 위로 이동하지 않음
    - 만약 `ComingSoonCard` import 가 이제 어디서도 사용되지 않으면 import 제거 가능 (선택) — 단 다른 곳에서 여전히 사용 중이면 그대로 유지.

    **Step 3 — 검증:**
    ```bash
    grep -c "StockDiscussionSection" webapp/src/components/stock/stock-detail-client.tsx  # ≥2 (import + JSX)
    grep -c "StockNewsSection" webapp/src/components/stock/stock-detail-client.tsx  # ≥2 (Phase 7 유지)
    ! grep -q 'ComingSoonCard title="종목토론방"' webapp/src/components/stock/stock-detail-client.tsx  # placeholder 제거됨
    grep -q "space-y-6" webapp/src/components/stock/stock-detail-client.tsx  # D12: 컨테이너 유지
    ! grep -qE "md:grid-cols-2|grid-cols-\[1fr_1fr" webapp/src/components/stock/stock-detail-client.tsx  # 2열 복원 금지
    ```

    **Step 4 — 순서 확인:** grep -n 으로 StockNewsSection 라인 번호 < StockDiscussionSection 라인 번호 확인 (뉴스가 토론방보다 위에 있음).
  </action>
  <verify>
    <automated>grep -c "StockDiscussionSection" webapp/src/components/stock/stock-detail-client.tsx | xargs -I {} test {} -ge 2 &amp;&amp; grep -c "StockNewsSection" webapp/src/components/stock/stock-detail-client.tsx | xargs -I {} test {} -ge 2 &amp;&amp; ! grep -q 'ComingSoonCard title="종목토론방"' webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; grep -q "space-y-6" webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; ! grep -qE "md:grid-cols-2" webapp/src/components/stock/stock-detail-client.tsx &amp;&amp; pnpm -F @gh-radar/webapp build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "StockDiscussionSection" webapp/src/components/stock/stock-detail-client.tsx` ≥ 2 (import + JSX 사용)
    - `grep -c "StockNewsSection" webapp/src/components/stock/stock-detail-client.tsx` ≥ 2 (Phase 7 유지, 회귀 없음)
    - `! grep -q 'ComingSoonCard title="종목토론방"' webapp/src/components/stock/stock-detail-client.tsx` (placeholder 완전 제거)
    - `grep -q "space-y-6" webapp/src/components/stock/stock-detail-client.tsx` (D12 컨테이너 유지)
    - **D12 guardrail**: `! grep -qE "md:grid-cols-2|grid-cols-\[1fr_1fr" webapp/src/components/stock/stock-detail-client.tsx` (2열 복원 금지)
    - **순서 guardrail**: `awk '/StockNewsSection/{n=NR} /StockDiscussionSection/{d=NR} END{exit (n<d)?0:1}' webapp/src/components/stock/stock-detail-client.tsx` exit 0 (뉴스가 토론방보다 위)
    - `pnpm -F @gh-radar/webapp build` exit 0
  </acceptance_criteria>
  <done>stock-detail-client.tsx 의 2번째 자식만 교체 — Phase 7 뉴스 섹션 및 `space-y-6` 컨테이너 무변경 + webapp build 그린</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-04)

| Boundary | Description |
|----------|-------------|
| server API → webapp client | camelCase Discussion[] (Phase 7 ApiClientError envelope) |
| webapp → 네이버 외부 URL (토론 항목 링크) | target=_blank + rel=noopener noreferrer 필수 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Tampering (XSS) | DiscussionItem body 텍스트 | mitigate | React 기본 text escape (JSX `{d.body}`) — server 저장 직전 sanitize-html 로 plaintext 화 + shared stripHtmlToPlaintext. `dangerouslySetInnerHTML` 절대 사용 금지. |
| T-02 | Tampering (URL tabnabbing) | DiscussionItem 원문 링크 | mitigate | `target="_blank" rel="noopener noreferrer"` 필수 — UI-SPEC Deviation Guardrail #6. acceptance criteria 로 grep 검증. `aria-label="{title} 원문 보기 (새 창)"` 로 새 창 명시 (WCAG G201). |
</threat_model>

<verification>
- `pnpm -F @gh-radar/webapp typecheck` exit 0
- `pnpm -F @gh-radar/webapp build` 성공
- `pnpm -F @gh-radar/webapp test -- format-discussion-date.test.ts --run` ≥6 case 그린
- `grep -q "fetchStockDiscussions\|refreshStockDiscussions" webapp/src/lib/stock-api.ts` — API 2종 추가
- `grep -q "noopener noreferrer" webapp/src/components/stock/discussion-item.tsx` — T-02
- `grep -q "staleMinutes\|formatStaleLabel" webapp/src/components/stock/stock-discussion-section.tsx` — D7 Stale
- `grep -c "StockDiscussionSection" webapp/src/components/stock/stock-detail-client.tsx` ≥ 2
- Phase 7 회귀 없음: `git diff webapp/src/components/stock/stock-news-section.tsx` 0 lines, `webapp/src/components/stock/news-*.tsx` 0 lines diff
- V-20 guardrail 유지: `grep "date-fns-tz" webapp/package.json` → 0 match
</verification>

<success_criteria>
- DISC-01 (1) — 상세 페이지 종목토론방 Card 에 최근 24시간 상위 5건 표시 (제목 + body preview + 작성자 + KST 시간 + 원문 링크)
- 새로고침 버튼 + 30초 쿨다운 (+ 429 retry_after 우선) + Stale Badge (D7) + inline error (3초 자동 소거)
- stock-detail-client.tsx 의 2번째 자식만 교체 — D12 guardrail 준수 (뉴스 섹션 + space-y-6 컨테이너 무변경)
- Phase 7 뉴스 회귀 0
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-04-SUMMARY.md`:
- 신규 컴포넌트 5종 + API 2종 + 날짜 유틸 2종 리스트
- stock-detail-client.tsx diff 요약 (교체 라인 번호 before/after)
- Phase 7 뉴스 컴포넌트 회귀 검증 결과 (git diff 0 lines)
- 발견한 이슈 (MessageSquareOff vs Inbox 아이콘 선택 근거, Stale 계산 edge case 등)
</output>
