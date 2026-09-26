'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { NewsArticle } from '@gh-radar/shared';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';
import { fetchStockNews } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { NewsItem } from './news-item';
import { NewsListSkeleton } from './news-list-skeleton';

/**
 * NewsFullList — 최근 7일 전체 뉴스 목록 (Phase 21 D-29 · G-21-R3-8).
 *
 * 옛 전체 페이지(`/stocks/[code]/news` · NewsPageClient)의 **목록 부분**을 그대로 옮겼다.
 * 종목상세 「뉴스토론」 탭 안 전체목록(`StockNewsTabPanel`)과 트레이딩 ⓘ 팝업이 같이 쓴다.
 * 페이지 제목 · 종목명 조회 · notFound 는 옮기지 않았다(쓰는 쪽이 이미 종목을 안다).
 *
 * - 첫 페이지 `fetchStockNews(code, { days: 7, limit: 100 })` — 100 = 서버 하드캡
 * - **무한 스크롤** (260418-kd8): 목록 끝 sentinel 이 보이면 `before=<마지막 publishedAt>` 로 다음
 *   페이지를 붙인다. 응답이 PAGE_SIZE 미만이면 끝.
 * - 상태: 로딩 스켈레톤 · 빈 목록 · 첫 로드 오류(다시 시도) · 페이지네이션 오류(목록 유지 + 인라인)
 *   — testid 는 옛 페이지와 같다(e2e 계약 유지).
 * - 머리 줄: `onBack` 이 있으면 「요약으로 돌아가기」 ← 버튼 + 제목, 없으면 제목만.
 * - 번호 인덱스 렌더 금지 · 새로고침 버튼 없음(수동 새로고침은 요약 섹션 버튼 전용).
 *
 * 앱 당겨서 새로고침 (D-18): 서버 캐시 GET(`load`)만 다시 읽는다. POST 새로고침(서버가 Naver 검색
 * API 를 부른다)은 부르지 않는다 — 사용자 제스처가 외부 호출을 늘리면 「호출량은 사용자 수와 독립」
 * (CLAUDE.md 공식 API 운영 기준 3) 위반이다.
 */
export interface NewsFullListProps {
  code: string;
  /** 있으면 머리 줄에 ← 버튼을 그린다(요약으로 돌아가기). */
  onBack?: () => void;
}

const PAGE_SIZE = 100;

export function NewsFullList({ code, onBack }: NewsFullListProps) {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
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
      const newsData = await fetchStockNews(
        code,
        { days: 7, limit: PAGE_SIZE },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setArticles(newsData);
      setError(null);
      // 첫 페이지가 PAGE_SIZE 미만 → 더 이상 없음
      if (newsData.length < PAGE_SIZE) setHasMore(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
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
  // D-18 — 당겨서 새로고침은 서버 캐시 GET 만 다시 읽는다.
  useNativeRefresh(load);

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

  const head = (
    <header className="flex items-center gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="요약으로 돌아가기"
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--muted-fg)] hover:text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      )}
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--fg)]">
        최근 7일 뉴스
      </h2>
    </header>
  );

  if (error && !articles) {
    return (
      <div className="space-y-4" data-testid="news-full-list">
        {head}
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          role="alert"
          data-testid="news-page-error"
        >
          <h3 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)]">
            뉴스를 불러오지 못했어요
          </h3>
          <p className="mt-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            {error.message}
          </p>
          <Button className="mt-3" onClick={() => void load()}>
            다시 시도
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="news-full-list">
      {head}

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
          <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
            표시할 뉴스가 없어요
          </h3>
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
