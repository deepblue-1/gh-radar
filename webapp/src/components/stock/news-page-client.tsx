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
 *   2) fetchStockNews(code, { days: 7, limit: 100 }) → 최근 7일 하드캡 100
 * - 상단 Back-Nav: h1 왼쪽 ← 링크 (UI-SPEC §4.4, aria-label="종목 상세로 돌아가기")
 * - 제목 텍스트: `{stock.name} — 최근 7일 뉴스` — 상한 수치(서버 하드캡) 미노출
 * - 번호 인덱스(1. 2.) 렌더 금지 — 자연 순서만
 * - 새로고침 기능 없음 (상세 페이지 전용 — UX 결정)
 * - 404 (fetch status=404) → notFound() 호출 (부모 not-found.tsx 상속)
 */
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
        </section>
      )}
    </div>
  );
}
