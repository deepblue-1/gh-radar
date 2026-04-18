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

/**
 * NewsPageClient — Phase 07 NEWS-01 `/stocks/[code]/news` 전체 뉴스 페이지.
 *
 * - mount 시 2개 parallel fetch:
 *   1) fetchStockDetail → stock.name (h1 표시)
 *   2) fetchStockNews(code, { days: 7, limit: PAGE_SIZE }) → 최근 7일 첫 페이지
 * - **무한 스크롤** (260418-kd8 추가, Phase 8 토론방 1:1 미러):
 *   IntersectionObserver 가 리스트 하단 sentinel 진입을 감지하면
 *   `before=<마지막 article publishedAt>` 로 다음 페이지 fetch + 기존 list 에 append.
 *   응답이 PAGE_SIZE 미만이면 hasMore=false 로 종료.
 *   PAGE_SIZE = 100 (서버 hard cap, 토론방 50 과 다른 유일한 차이).
 * - 상단 Back-Nav: h1 왼쪽 ← 링크 (UI-SPEC §4.4, aria-label="종목 상세로 돌아가기")
 * - 제목 텍스트: `{stock.name} — 최근 7일 뉴스` — 상한 수치(서버 하드캡) 미노출
 * - 번호 인덱스(1. 2.) 렌더 금지 — 자연 순서만
 * - 새로고침 기능 없음 (상세 페이지 전용 — UX 결정)
 * - 404 (fetch status=404) → notFound() 호출 (부모 not-found.tsx 상속)
 * - pagination 에러 → 기존 list 유지 + sentinel 영역에 inline 에러 표시 (stale-but-visible)
 */
export interface NewsPageClientProps {
  code: string;
}

const PAGE_SIZE = 100;

export function NewsPageClient({ code }: NewsPageClientProps) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
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
      const [stockData, newsData] = await Promise.all([
        fetchStockDetail(code, controller.signal),
        fetchStockNews(code, { days: 7, limit: PAGE_SIZE }, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setStock(stockData);
      setArticles(newsData);
      setError(null);
      // 첫 페이지가 PAGE_SIZE 미만 → 더 이상 없음
      if (newsData.length < PAGE_SIZE) setHasMore(false);
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
    if (!articles || articles.length === 0) return;
    if (isFetchingMore || !hasMore) return;
    const last = articles[articles.length - 1];
    const cursor = last.publishedAt;
    if (inFlightCursorRef.current === cursor) return; // 중복 발사 방지
    inFlightCursorRef.current = cursor;
    setIsFetchingMore(true);
    setPaginationError(null);
    const controller = new AbortController();
    try {
      const next = await fetchStockNews(
        code,
        { days: 7, limit: PAGE_SIZE, before: cursor },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setArticles((prev) => {
        if (!prev) return next;
        // id 중복 제거 (cursor 경계에서 동일 publishedAt article 이 두 페이지에 걸칠 가능성 안전망)
        const seen = new Set(prev.map((a) => a.id));
        const dedup = next.filter((a) => !seen.has(a.id));
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
  }, [code, articles, hasMore, isFetchingMore]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  // IntersectionObserver — sentinel 이 viewport 진입하면 loadMore
  useEffect(() => {
    if (!hasMore || !articles || articles.length === 0) return;
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
  }, [articles, hasMore, loadMore]);

  if (notFoundFlag) notFound();

  if (error && !articles) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        role="alert"
        data-testid="news-page-error"
      >
        <h2 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)]">
          뉴스를 불러오지 못했어요
        </h2>
        <p className="mt-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          {error.message}
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
          {headingName} — 최근 7일 뉴스
        </h1>
      </header>

      {isLoading && !articles ? (
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          data-testid="news-page-loading"
        >
          <NewsListSkeleton rows={10} />
        </section>
      ) : articles && articles.length === 0 ? (
        <section
          role="status"
          data-testid="news-page-empty"
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
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          data-testid="news-list"
        >
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

          {/* 무한 스크롤 sentinel + 상태 표시 */}
          <div
            ref={sentinelRef}
            data-testid="news-pagination-sentinel"
            className="mt-4 flex flex-col items-center gap-2 py-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]"
            aria-live="polite"
          >
            {isFetchingMore && (
              <span data-testid="news-pagination-loading">불러오는 중…</span>
            )}
            {paginationError && !isFetchingMore && (
              <div data-testid="news-pagination-error" className="flex items-center gap-2">
                <span className="text-[var(--destructive)]">추가 뉴스를 불러오지 못했어요</span>
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
              <span data-testid="news-pagination-end">최근 7일 뉴스를 모두 불러왔어요</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
