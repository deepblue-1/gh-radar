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

/**
 * StockNewsSection — Phase 07 NEWS-01(1)(2) — 종목 상세 페이지 "관련 뉴스" Card.
 *
 * 구성:
 *  - mount 시 `fetchStockNews(code, { days: 7, limit: 5 })`
 *  - 수동 새로고침 버튼 (`refreshStockNews`) — 30s 로컬 쿨다운 + 서버 429 시 `retry_after_seconds` 우선 적용
 *  - 상태: 초기 로딩 → Skeleton / 초기 에러 → 재시도 Card / 빈 배열 → NewsEmptyState / 정상 → 5건 리스트 + "전체 뉴스 보기 →"
 *
 * 쿨다운 카운트다운:
 *  - `cooldownUntil` (Date.now() 기준 timestamp) 가 현재보다 미래이면 `setInterval(1s)` 로 `nowMs` 를 갱신.
 *  - 완료 시 `clearInterval` 로 정리. unmount 시 cleanup 포함.
 *
 * 에러:
 *  - 초기 fetch 실패 → 에러 Card + 다시 시도 버튼
 *  - refresh 실패 (429 아님) → 인라인 배너 3초 후 자동 소거
 *  - refresh 429 → 쿨다운 타이머만 세팅, 배너 없음
 */
const LOCAL_COOLDOWN_MS = 30_000;
const CARD_FETCH_LIMIT = 5;

export interface StockNewsSectionProps {
  stockCode: string;
}

export function StockNewsSection({ stockCode }: StockNewsSectionProps) {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [inlineError, setInlineError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const data = await fetchStockNews(
        stockCode,
        { days: 7, limit: CARD_FETCH_LIMIT },
        controller.signal,
      );
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

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  // 쿨다운 카운트다운 tick — cooldownUntil 이 미래일 때만 interval 동작.
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
      setCooldownUntil(Date.now() + LOCAL_COOLDOWN_MS);
      setNowMs(Date.now());
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        const detail = err.details as { retry_after_seconds?: number } | undefined;
        const seconds =
          typeof detail?.retry_after_seconds === 'number'
            ? detail.retry_after_seconds
            : 30;
        // 서버 값 우선 — 로컬 30s 가드를 덮어쓴다.
        setCooldownUntil(Date.now() + seconds * 1000);
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

  // inlineTimer cleanup on unmount
  useEffect(
    () => () => {
      if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
    },
    [],
  );

  // 초기 에러 (articles 가 아직 없음)
  if (!articles && error) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        role="alert"
        data-testid="stock-news-section-error"
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

  // 초기 로딩 (articles 없음)
  if (isLoading && !articles) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        data-testid="stock-news-section-loading"
      >
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
        onCta={() => void handleRefresh()}
        isRefreshing={isRefreshing}
        cooldownSeconds={cooldownSeconds}
      />
    );
  }

  // 정상 리스트
  const visible = (articles ?? []).slice(0, CARD_FETCH_LIMIT);
  return (
    <section
      className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
      data-testid="stock-news-section"
    >
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
          data-testid="stock-news-section-inline-error"
          className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]"
        >
          {inlineError}
        </div>
      )}
      <ul className="divide-y divide-[var(--border-subtle)]">
        {visible.map((article) => (
          <NewsItem key={article.id} article={article} variant="card" />
        ))}
      </ul>
      <footer className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">
        <Link
          href={`/stocks/${encodeURIComponent(stockCode)}/news`}
          className="text-[length:var(--t-sm)] text-[var(--primary)] hover:underline"
        >
          전체 뉴스 보기 →
        </Link>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          최근 7일 전체
        </span>
      </footer>
    </section>
  );
}
