'use client';

/**
 * Phase 09.2 — 종목 상세 페이지 일봉 차트 섹션 (D-09 마운트 진입점).
 *
 * 책임:
 *   - fetchDailyOhlcv 라이프사이클 (mount + range 변경 + refreshSignal + 재시도)
 *   - AbortController 로 이전 fetch 취소 (D-14, Phase 6 패턴)
 *   - Skeleton (D-16) / Empty (D-17) / Error (D-18) / 장중 라벨 (D-20) / sr-only (D-21) 분기
 *   - 카드 컨테이너 + 헤더 (타이틀 + 기간 토글 4종) (D-10, D-05)
 *
 * 참고: chart 인스턴스 lifecycle 은 자식 StockDailyChart 가 책임 (책임 분리).
 *
 * T-09.2-07 mitigate (W4): 에러 UI 는 generic 카피만 노출하고 error.message 는
 *   사용자에게 직접 표시하지 않는다. PostgREST/RLS 내부 정보 누설 표면을 0 으로
 *   유지. 디버그용 stack 은 console.error 로만 기록 → DevTools 개발자만 접근.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DAILY_OHLCV_RANGES,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
} from '@gh-radar/shared';
import { fetchDailyOhlcv } from '@/lib/daily-ohlcv-api';
import { StockDailyChart } from './stock-daily-chart';
import { StockDailyChartSkeleton } from './stock-daily-chart-skeleton';

export interface StockDailyChartSectionProps {
  /** 종목 단축코드 (StockPage 가 정규식 검증 후 전달) */
  code: string;
  /**
   * D-19 — 부모 (StockDetailClient) 의 새로고침 버튼 클릭 시 값을 변경하면
   * 차트가 동일 range 로 refetch. number / Date.now() / counter 무엇이든
   * primitive 가 바뀌면 useEffect 의존성 발화. 미주입 시 차트는 mount + range
   * 변경에만 fetch (기존 동작 보존).
   */
  refreshSignal?: unknown;
}

/**
 * KST = UTC+9. ISO YYYY-MM-DD 만 사용.
 * `now` 인자는 테스트에서 결정론적 검증을 위해 주입 가능 (vi.setSystemTime 호환).
 */
function todayKstIso(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return kst.toISOString().slice(0, 10);
}

export function StockDailyChartSection({
  code,
  refreshSignal,
}: StockDailyChartSectionProps) {
  const [range, setRange] = useState<DailyOhlcvRangeKey>('1M');
  const [rows, setRows] = useState<DailyOhlcvRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (nextRange: DailyOhlcvRangeKey) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRows(null);
      setError(null);
      try {
        const data = await fetchDailyOhlcv(
          code,
          nextRange,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setRows(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        // T-09.2-07 mitigate (W4) — 사용자 노출은 generic, 디버그용 stack 은 console
        console.error('[StockDailyChartSection] fetch failed', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [code],
  );

  useEffect(() => {
    void load(range);
    return () => controllerRef.current?.abort();
  }, [load, range, refreshSignal]);

  const isIntraday = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows[rows.length - 1].date === todayKstIso();
  }, [rows]);

  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const first = rows[0];
    const last = rows[rows.length - 1];
    return `최근 ${rows.length}영업일 종가 추이. 시작 종가 ${first.close.toLocaleString()}원, 현재 종가 ${last.close.toLocaleString()}원.`;
  }, [rows]);

  const isLoading = rows === null && error === null;
  const isEmpty = rows !== null && rows.length === 0;

  return (
    <Card
      className="space-y-4 p-5"
      aria-label="일봉 차트"
      data-testid="stock-daily-chart-section"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[length:var(--t-h3)] font-semibold">
            일봉 차트
          </h2>
          {isIntraday && (
            <span
              className="rounded-[var(--r-sm)] bg-[var(--muted)] px-2 py-0.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
              data-testid="stock-daily-chart-intraday-badge"
            >
              장중
            </span>
          )}
        </div>
        <div
          role="tablist"
          aria-label="기간 선택"
          className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[var(--border)] p-1"
        >
          {DAILY_OHLCV_RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRange(r)}
                className={`rounded-[var(--r-sm)] px-3 py-1 text-[length:var(--t-caption)] transition-colors ${
                  active
                    ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'text-[var(--muted-fg)] hover:bg-[var(--muted)]'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="space-y-2"
          data-testid="stock-daily-chart-error"
        >
          {/* T-09.2-07 mitigate (W4) — error.message 미노출.
              PostgREST/RLS 내부 정보 누설 방지. 디버그는 console.error. */}
          <p className="text-[length:var(--t-sm)] text-[var(--destructive)]">
            일봉 데이터를 불러오지 못했습니다.
          </p>
          <Button
            onClick={() => void load(range)}
            variant="outline"
            size="sm"
          >
            다시 시도
          </Button>
        </div>
      )}

      {/* Pitfall 5: container 항상 visible — Skeleton/Empty 는 absolute overlay */}
      <div className="relative h-[340px] w-full">
        {isLoading && (
          <div className="absolute inset-0">
            <StockDailyChartSkeleton height={340} />
          </div>
        )}
        {isEmpty && (
          <div
            className="absolute inset-0 grid place-items-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
            data-testid="stock-daily-chart-empty"
          >
            일봉 데이터가 아직 수집되지 않았습니다.
          </div>
        )}
        <StockDailyChart rows={rows ?? []} height={340} />
      </div>

      {summary && <p className="sr-only">{summary}</p>}
    </Card>
  );
}
