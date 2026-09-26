'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Discussion } from '@gh-radar/shared';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';
import { fetchStockDiscussions } from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DiscussionItem } from './discussion-item';
import { DiscussionListSkeleton } from './discussion-list-skeleton';

/**
 * DiscussionFullList — 최근 7일 전체 토론 목록 (Phase 21 D-29 · G-21-R3-8).
 *
 * 옛 전체 페이지(`/stocks/[code]/discussions` · 옛 discussion-page-client.tsx)의 필터 줄 · 목록 · 무한 스크롤 ·
 * 상태를 그대로 옮겼다. 종목상세 「뉴스토론」 탭 안 전체목록과 트레이딩 ⓘ 팝업이 같이 쓴다.
 * 페이지 제목 · 종목명 조회 · notFound 는 옮기지 않았다(쓰는 쪽이 이미 종목을 안다).
 *
 * - 첫 페이지 `fetchStockDiscussions(code, { days: 7, limit: 50, filter })` — 50 = 서버 하드캡
 * - **무한 스크롤** (08-04+): 목록 끝 sentinel 이 보이면 `before=<마지막 postedAt>` 로 다음 페이지.
 *   종료는 서버 envelope `{ items, hasMore }` 의 hasMore 를 믿는다(D11 사후 스팸 필터로 items 가 깎인다).
 * - 상태: 로딩 스켈레톤 · 빈 목록 · 첫 로드 오류(D7 고정 카피 · 다시 시도) · 페이지네이션 오류
 *   — testid 는 옛 페이지와 같다(e2e 계약 유지).
 * - 머리 줄: `onBack` 이 있으면 「요약으로 돌아가기」 ← 버튼 + 제목, 없으면 제목만.
 *
 * 의미성 필터 (Phase 08.1 Plan 06) — **로컬 상태만**. 옛 페이지는 `?filter=` 를 URL 에 썼지만 이제
 * 목록이 종목상세 `?tab=news&view=discussions` 안 · 팝업 안에 산다 — URL 에 쓰면 탭/뷰 파라미터와
 * 섞이고 팝업이 뜬 `/trading` 을 재렌더한다(D-29). 분류가 정지(CLASSIFY_PAUSED) 중이라 토글은
 * disabled + 항상 OFF(`all`)다.
 *
 * 앱 당겨서 새로고침 (D-18): 배치가 채운 캐시 GET(`load`)만 다시 읽는다. POST 새로고침(토론방 원본
 * fetch)은 부르지 않는다 — 크롤링 5원칙 3(사용자 트리거 on-demand fetch 금지).
 */
export interface DiscussionFullListProps {
  code: string;
  /** 있으면 머리 줄에 ← 버튼을 그린다(요약으로 돌아가기). */
  onBack?: () => void;
}

const PAGE_SIZE = 50;

/**
 * 분류 기능 일괄 정지 플래그 — 튜닝 끝나면 false 로 (또는 상수 제거).
 * paused 일 때 토글이 disabled + 항상 OFF (filter='all').
 */
const CLASSIFY_PAUSED = true;

type DiscussionFilter = 'all' | 'meaningful';

const INITIAL_FILTER: DiscussionFilter = CLASSIFY_PAUSED ? 'all' : 'meaningful';

export function DiscussionFullList({ code, onBack }: DiscussionFullListProps) {
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [paginationError, setPaginationError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<DiscussionFilter>(INITIAL_FILTER);
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
      const page = await fetchStockDiscussions(
        code,
        { days: 7, limit: PAGE_SIZE, filter },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDiscussions(page.items);
      setError(null);
      // 서버 envelope 의 hasMore 신호 신뢰 (D11 사후 스팸 필터로 items.length < PAGE_SIZE 흔함)
      setHasMore(page.hasMore);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [code, filter]);

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
      const page = await fetchStockDiscussions(
        code,
        { days: 7, limit: PAGE_SIZE, before: cursor, filter },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDiscussions((prev) => {
        if (!prev) return page.items;
        // postId 중복 제거 (cursor 경계에서 동일 timestamp post 가 두 페이지에 걸칠 가능성 안전망)
        const seen = new Set(prev.map((d) => d.postId));
        const dedup = page.items.filter((d) => !seen.has(d.postId));
        return [...prev, ...dedup];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setPaginationError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!controller.signal.aborted) setIsFetchingMore(false);
    }
  }, [code, discussions, hasMore, isFetchingMore, filter]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);
  // D-18 — 당겨서 새로고침은 캐시 GET 만 다시 읽는다.
  useNativeRefresh(load);

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
      // Phase 08.2 — rootMargin 200px → 50px. 짧게 끊어 오는 페이지가 sentinel 권역에 곧장
      // 다시 들어와 "득득득" 반복 trigger 되던 현상 완화. 50px 은 prefetch 효과를 살짝 유지.
      { rootMargin: '50px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [discussions, hasMore, loadMore]);

  const onToggleFilter = useCallback((checked: boolean) => {
    if (CLASSIFY_PAUSED) return;
    setFilter(checked ? 'meaningful' : 'all');
    // list 초기화 — load 가 filter 를 deps 로 가지므로 useEffect 가 첫 페이지를 다시 읽는다.
    setDiscussions(null);
    setHasMore(true);
    setPaginationError(null);
    inFlightCursorRef.current = undefined;
  }, []);

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
        최근 7일 토론
      </h2>
    </header>
  );

  // 초기 로드 에러 + 데이터 없음 — D7 고정 copy
  if (error && !discussions) {
    return (
      <div className="space-y-4" data-testid="discussion-full-list">
        {head}
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          role="alert"
          aria-live="polite"
          data-testid="discussion-page-error"
        >
          <h3 className="text-[length:var(--t-h3)] font-semibold text-[var(--destructive)]">
            토론방을 불러올 수 없어요
          </h3>
          <p className="mt-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            잠시 후 다시 시도해주세요.
          </p>
          <Button className="mt-3" onClick={() => void load()}>
            다시 시도
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="discussion-full-list">
      {head}

      <div
        className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
        data-testid="discussion-filter-toggle"
      >
        <label
          htmlFor={`discussion-meaningful-toggle-${code}`}
          className="text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          의미있는 토론만 보기
        </label>
        <Switch
          id={`discussion-meaningful-toggle-${code}`}
          checked={filter === 'meaningful'}
          onCheckedChange={onToggleFilter}
          disabled={CLASSIFY_PAUSED}
          aria-label="의미있는 토론만 보기"
        />
      </div>

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
          <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
            표시할 토론 글이 없어요
          </h3>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            {filter === 'meaningful'
              ? '의미있는 토론이 아직 없어요. 토글을 꺼서 전체 글을 볼 수 있어요.'
              : '최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.'}
          </p>
        </section>
      ) : (
        <section
          className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
          data-testid="discussion-list"
        >
          <div className="hidden md:grid grid-cols-[1fr_140px_120px] gap-3 px-2 pb-2 border-b border-[var(--border-subtle)] text-[length:var(--t-caption)] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
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
