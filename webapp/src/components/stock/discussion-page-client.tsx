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
 *   2) fetchStockDiscussions(code, { days: 7, limit: PAGE_SIZE }) → 최근 7일 첫 페이지
 * - **무한 스크롤** (08-04+ 추가): IntersectionObserver 가 리스트 하단 sentinel 진입을 감지하면
 *   `before=<마지막 item postedAt>` 로 다음 페이지 fetch + 기존 list 에 append.
 *   응답이 PAGE_SIZE 미만이면 hasMore=false 로 종료.
 * - 상단 Back-Nav: h1 왼쪽 ← 링크 (UI-SPEC §4.4, aria-label="종목 상세로 돌아가기")
 * - 제목 텍스트: `{stock.name} — 최근 7일 토론`
 * - Compact 3열 grid (md+): `1fr 140px 120px`
 * - 새로고침 기능 없음 (UI-SPEC §Component Inventory)
 * - 404 → notFound() 호출
 * - 초기 로드 에러 → 고정 copy + 다시 시도 버튼
 * - pagination 에러 → 기존 list 유지 + sentinel 영역에 inline 에러 표시 (stale-but-visible)
 */
export interface DiscussionPageClientProps {
  code: string;
}

const PAGE_SIZE = 50;

export function DiscussionPageClient({ code }: DiscussionPageClientProps) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightCursorRef = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setHasMore(true);
    setPaginationError(null);
    inFlightCursorRef.current = undefined;
    try {
      const [stockData, discussionsData] = await Promise.all([
        fetchStockDetail(code, controller.signal),
        fetchStockDiscussions(
          code,
          { days: 7, limit: PAGE_SIZE },
          controller.signal,
        ),
      ]);
      if (controller.signal.aborted) return;
      setStock(stockData);
      setDiscussions(discussionsData);
      setError(null);
      // 첫 페이지가 PAGE_SIZE 미만 → 더 이상 없음
      if (discussionsData.length < PAGE_SIZE) setHasMore(false);
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

  const loadMore = useCallback(async () => {
    if (!discussions || discussions.length === 0) return;
    if (isFetchingMore || !hasMore) return;
    const last = discussions[discussions.length - 1];
    const cursor = last.postedAt;
    if (inFlightCursorRef.current === cursor) return; // 중복 발사 방지
    inFlightCursorRef.current = cursor;
    setIsFetchingMore(true);
    setPaginationError(null);
    const controller = new AbortController();
    try {
      const next = await fetchStockDiscussions(
        code,
        { days: 7, limit: PAGE_SIZE, before: cursor },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDiscussions((prev) => {
        if (!prev) return next;
        // postId 중복 제거 (cursor 경계에서 동일 timestamp post 가 두 페이지에 걸칠 가능성 안전망)
        const seen = new Set(prev.map((d) => d.postId));
        const dedup = next.filter((d) => !seen.has(d.postId));
        return [...prev, ...dedup];
      });
      if (next.length < PAGE_SIZE) setHasMore(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setPaginationError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!controller.signal.aborted) setIsFetchingMore(false);
    }
  }, [code, discussions, hasMore, isFetchingMore]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  // IntersectionObserver — sentinel 이 viewport 진입하면 loadMore
  useEffect(() => {
    if (!hasMore || !discussions || discussions.length === 0) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [discussions, hasMore, loadMore]);

  if (notFoundFlag) notFound();

  // 초기 로드 에러 + 데이터 없음 — D7 고정 copy
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

          {/* 무한 스크롤 sentinel + 상태 표시 */}
          <div
            ref={sentinelRef}
            data-testid="discussion-pagination-sentinel"
            className="mt-4 flex flex-col items-center gap-2 py-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]"
            aria-live="polite"
          >
            {isFetchingMore && (
              <span data-testid="discussion-pagination-loading">불러오는 중…</span>
            )}
            {paginationError && !isFetchingMore && (
              <div data-testid="discussion-pagination-error" className="flex items-center gap-2">
                <span className="text-[var(--destructive)]">추가 글을 불러오지 못했어요</span>
                <Button
                  variant="outline"
                  className="h-7 px-2 text-[length:var(--t-sm)]"
                  onClick={() => void loadMore()}
                >
                  다시 시도
                </Button>
              </div>
            )}
            {!hasMore && !isFetchingMore && !paginationError && (
              <span data-testid="discussion-pagination-end">최근 7일 토론을 모두 불러왔어요</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
