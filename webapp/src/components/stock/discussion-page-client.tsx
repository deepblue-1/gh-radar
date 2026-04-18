'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notFound } from 'next/navigation';
import type { Discussion, Stock } from '@gh-radar/shared';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail, fetchStockDiscussions } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { DiscussionItem } from './discussion-item';
import { DiscussionListSkeleton } from './discussion-list-skeleton';

/**
 * DiscussionPageClient — Phase 08 DISC-01 `/stocks/[code]/discussions` 전체 토론방 페이지.
 *
 * - mount 시 2개 parallel fetch:
 *   1) fetchStockDetail → stock.name (h1 표시)
 *   2) fetchStockDiscussions(code, { days: 7, limit: 50 }) → 최근 7일 · 서버 하드캡 50
 * - 상단 Back-Nav: h1 왼쪽 ← 링크 (03-UI-SPEC §4.4, aria-label="종목 상세로 돌아가기")
 *   - 명시적 `href="/stocks/[code]"` (router.back() 금지 — UI-SPEC Deviation Guardrail #11)
 * - 제목 텍스트: `{stock.name} — 최근 7일 토론` (상한 수치 미노출)
 * - Compact 3열 grid (md+): `1fr 140px 120px` — UI-SPEC §3 + Deviation Guardrail #8a 확정
 * - 컬럼 헤더 row: `제목 / 작성자 / 시간` caption uppercase, md+ 에서만 표시
 * - 모바일 <md(720px): 컬럼 헤더 숨김, DiscussionItem variant="full" 내부에서 grid-cols-1 로 fallback
 * - 새로고침 기능 없음 (UI-SPEC §Component Inventory + Deviation Guardrail — 풀페이지 새로고침 금지)
 * - 404 (fetch status=404) → notFound() 호출 (부모 not-found.tsx 상속)
 * - 초기 로드 에러 → 고정 copy "토론방을 불러올 수 없어요" + "잠시 후 다시 시도해주세요" (D7, 서버 원문 비노출)
 */
export interface DiscussionPageClientProps {
  code: string;
}

export function DiscussionPageClient({ code }: DiscussionPageClientProps) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
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
      const [stockData, discussionsData] = await Promise.all([
        fetchStockDetail(code, controller.signal),
        fetchStockDiscussions(code, { days: 7, limit: 50 }, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setStock(stockData);
      setDiscussions(discussionsData);
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

  // 초기 로드 에러 + 데이터 없음 — D7 고정 copy (서버 원문 비노출)
  if (error && !discussions) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        role="alert"
        aria-live="polite"
        data-testid="discussion-page-error"
      >
        <h2 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)]">
          토론방을 불러올 수 없어요
        </h2>
        <p className="mt-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          잠시 후 다시 시도해주세요.
        </p>
        <Button className="mt-3" onClick={() => void load()}>
          다시 시도
        </Button>
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
          {headingName} — 최근 7일 토론
        </h1>
      </header>

      {isLoading && !discussions ? (
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          data-testid="discussion-page-loading"
        >
          <DiscussionListSkeleton variant="full" rows={10} />
        </section>
      ) : discussions && discussions.length === 0 ? (
        <section
          role="status"
          data-testid="discussion-page-empty"
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
        >
          <h2 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
            표시할 토론 글이 없어요
          </h2>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.
          </p>
        </section>
      ) : (
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          data-testid="discussion-list"
        >
          {/* 컬럼 헤더 — md+ 에서만 (UI-SPEC §3 + Deviation Guardrail #8a) */}
          <div className="hidden md:grid grid-cols-[1fr_140px_120px] gap-3 px-2 pb-2 border-b border-[var(--border)] text-[length:var(--t-caption)] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
            <span>제목</span>
            <span>작성자</span>
            <span className="text-right">시간</span>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(discussions ?? []).map((d) => (
              <DiscussionItem key={d.id} discussion={d} variant="full" />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
