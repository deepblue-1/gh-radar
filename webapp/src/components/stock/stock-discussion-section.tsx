'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Discussion } from '@gh-radar/shared';
import { ApiClientError } from '@/lib/api';
import {
  fetchStockDiscussions,
  refreshStockDiscussions,
} from '@/lib/stock-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DiscussionItem } from './discussion-item';
import { DiscussionRefreshButton } from './discussion-refresh-button';
import { DiscussionEmptyState } from './discussion-empty-state';
import { DiscussionListSkeleton } from './discussion-list-skeleton';

/**
 * StockDiscussionSection — Phase 08 DISC-01 (1) — 종목 상세 페이지 "종목토론방" Card.
 *
 * 구성:
 *  - mount 시 `fetchStockDiscussions(code, { hours: 24, limit: 5 })`
 *  - 수동 새로고침 버튼 (`refreshStockDiscussions`) — 30s 로컬 쿨다운 + 서버 429 시 `retry_after_seconds` 우선
 *  - 상태: 초기 로딩 → Skeleton / 초기 에러 → 재시도 Card / 빈 배열 → DiscussionEmptyState / 정상 → 5건 리스트 + "전체 토론 보기 →"
 *  - **Stale 오케스트레이션 (D7)**: refresh 실패 (5xx) 시 기존 list 유지 + "X분 전 데이터" Badge 노출
 *
 * 쿨다운 카운트다운:
 *  - `cooldownUntil` (Date.now() 기준 timestamp) 가 현재보다 미래이면 `setInterval(1s)` 로 `nowMs` 를 갱신.
 *  - 완료 시 `clearInterval` 로 정리. unmount 시 cleanup 포함.
 *
 * 에러:
 *  - 초기 fetch 실패 → 에러 Card + 다시 시도 버튼 (서버 원문 비노출 — D7 고정 copy)
 *  - refresh 실패 (429 아님) → 인라인 배너 3초 후 자동 소거 + Stale Badge 갱신
 *  - refresh 429 → 쿨다운 타이머만 세팅, 배너 없음 (silent guard)
 */
const LOCAL_COOLDOWN_MS = 30_000;
const STALE_THRESHOLD_MIN = 10;
const CARD_FETCH_LIMIT = 5;
const CARD_FETCH_HOURS = 24;

export interface StockDiscussionSectionProps {
  stockCode: string;
}

function computeStaleMinutes(discussions: Discussion[]): number | null {
  if (discussions.length === 0) return null;
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

export function StockDiscussionSection({
  stockCode,
}: StockDiscussionSectionProps) {
  const [discussions, setDiscussions] = useState<Discussion[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const page = await fetchStockDiscussions(
        stockCode,
        { hours: CARD_FETCH_HOURS, limit: CARD_FETCH_LIMIT },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // 상세 Card 는 24h top 5 만 노출 — hasMore 무시.
      setDiscussions(page.items);
      setStaleMinutes(computeStaleMinutes(page.items));
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

  // Stale minutes 1분 단위 갱신
  useEffect(() => {
    if (!discussions || discussions.length === 0) return;
    const id = setInterval(() => {
      setStaleMinutes(computeStaleMinutes(discussions));
    }, 60_000);
    return () => clearInterval(id);
  }, [discussions]);

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000));

  const handleRefresh = useCallback(async () => {
    if (cooldownSeconds > 0 || isRefreshing) return;
    const controller = new AbortController();
    setIsRefreshing(true);
    try {
      const data = await refreshStockDiscussions(stockCode, controller.signal);
      setDiscussions(data);
      setStaleMinutes(null); // 방금 갱신됐으므로 stale 해제
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
        // 503/5xx/네트워크: inline alert + stale-but-visible (D7)
        setInlineError(
          '토론방을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.',
        );
        if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
        inlineTimerRef.current = setTimeout(() => setInlineError(null), 3000);
        if (discussions) setStaleMinutes(computeStaleMinutes(discussions));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [stockCode, cooldownSeconds, isRefreshing, discussions]);

  // inlineTimer cleanup on unmount
  useEffect(
    () => () => {
      if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
    },
    [],
  );

  // 초기 에러 (discussions 가 아직 없음) — 고정 copy (D7)
  if (!discussions && error) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        role="alert"
        data-testid="stock-discussion-section-error"
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

  // 초기 로딩 (discussions 없음)
  if (isLoading && !discussions) {
    return (
      <section
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        data-testid="stock-discussion-section-loading"
      >
        <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
          <MessageSquare className="size-5" aria-hidden /> 종목토론방
        </h2>
        <DiscussionListSkeleton variant="card" rows={5} />
      </section>
    );
  }

  // 빈 상태
  if (discussions && discussions.length === 0) {
    return (
      <DiscussionEmptyState
        onCta={() => void handleRefresh()}
        isRefreshing={isRefreshing}
        cooldownSeconds={cooldownSeconds}
      />
    );
  }

  // 정상 리스트
  const visible = (discussions ?? []).slice(0, CARD_FETCH_LIMIT);
  return (
    <section
      className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
      data-testid="stock-discussion-section"
    >
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="flex items-center gap-2 text-[length:var(--t-h3)] font-semibold text-[var(--fg)]">
            <MessageSquare className="size-5" aria-hidden /> 종목토론방
          </h2>
          {staleMinutes != null ? (
            <Badge
              variant="secondary"
              className="mono text-[length:var(--t-caption)] bg-[var(--muted)] text-[var(--muted-fg)]"
              role="status"
              aria-label={`${formatStaleLabel(staleMinutes)} — 수집된 데이터`}
              data-testid="discussion-stale-badge"
            >
              {formatStaleLabel(staleMinutes)}
            </Badge>
          ) : null}
        </div>
        <DiscussionRefreshButton
          onRefresh={() => void handleRefresh()}
          isRefreshing={isRefreshing}
          cooldownSeconds={cooldownSeconds}
        />
      </header>
      {inlineError && (
        <div
          role="alert"
          data-testid="stock-discussion-section-inline-error"
          className="mb-3 rounded-[var(--r-sm)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]"
        >
          {inlineError}
        </div>
      )}
      <ul className="divide-y divide-[var(--border-subtle)]">
        {visible.map((d) => (
          <DiscussionItem key={d.id} discussion={d} variant="card" />
        ))}
      </ul>
      <footer className="mt-3 border-t border-[var(--border)] pt-3 flex items-center justify-between">
        <Link
          href={`/stocks/${encodeURIComponent(stockCode)}/discussions`}
          className="text-[length:var(--t-sm)] text-[var(--primary)] hover:underline"
        >
          전체 토론 보기 →
        </Link>
        <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          최근 7일 전체
        </span>
      </footer>
    </section>
  );
}
