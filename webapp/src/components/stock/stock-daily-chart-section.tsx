'use client';

/**
 * Phase 09.2 — 종목 상세 페이지 차트 섹션 (D-09 마운트 진입점).
 *
 * 책임:
 *   - fetchDailyOhlcv 라이프사이클 (mount + range 변경 + refreshSignal + 재시도)
 *   - AbortController 로 이전 fetch 취소 (D-14, Phase 6 패턴)
 *   - Skeleton / Empty / Error / 장중 라벨 / sr-only 분기
 *   - 카드 컨테이너 + 헤더 (타이틀 + timeframe 토글 + 기간 토글)
 *
 * 참고: chart 인스턴스 lifecycle 은 자식 StockDailyChart 가 책임 (책임 분리).
 *
 * 2026-05-16 사용자 요청 갱신:
 *   - 기본 range = 1Y (기존 1M)
 *   - range 토글 = 1Y / 2Y / 3Y / 5Y
 *   - timeframe 토글 = 일봉(D) / 주봉(W) / 월봉(M) — 클라이언트 aggregate 로 W/M 파생
 *   - 장중 라벨은 timeframe='D' + 마지막 일봉 row 가 today (KST) 일 때만 표시
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DAILY_OHLCV_RANGES,
  DAILY_OHLCV_TIMEFRAMES,
  TIMEFRAME_LABELS,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
  type DailyOhlcvTimeframe,
} from '@gh-radar/shared';
import {
  aggregateByTimeframe,
  fetchDailyOhlcv,
} from '@/lib/daily-ohlcv-api';
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
  const [range, setRange] = useState<DailyOhlcvRangeKey>('1Y');
  const [timeframe, setTimeframe] = useState<DailyOhlcvTimeframe>('D');
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

  /** timeframe 별 aggregate — 일봉(D) 은 raw, 주봉(W)/월봉(M) 은 클라이언트 변환. */
  const displayRows = useMemo<DailyOhlcvRow[] | null>(() => {
    if (!rows) return null;
    return aggregateByTimeframe(rows, timeframe);
  }, [rows, timeframe]);

  const isIntraday = useMemo(() => {
    // 장중 라벨은 일봉에서만 의미 — 주/월봉 bucket 의 anchor date 와 today 비교는 부정확
    if (timeframe !== 'D') return false;
    if (!rows || rows.length === 0) return false;
    return rows[rows.length - 1].date === todayKstIso();
  }, [rows, timeframe]);

  const summary = useMemo(() => {
    if (!displayRows || displayRows.length === 0) return null;
    const first = displayRows[0];
    const last = displayRows[displayRows.length - 1];
    const unit = TIMEFRAME_LABELS[timeframe];
    return `최근 ${displayRows.length}개 ${unit} 종가 추이. 시작 종가 ${first.close.toLocaleString()}원, 현재 종가 ${last.close.toLocaleString()}원.`;
  }, [displayRows, timeframe]);

  const isLoading = rows === null && error === null;
  const isEmpty = rows !== null && rows.length === 0;
  const title = `${TIMEFRAME_LABELS[timeframe]} 차트`;

  return (
    <Card
      className="space-y-4 p-5"
      aria-label="일봉 차트"
      data-testid="stock-daily-chart-section"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[length:var(--t-h3)] font-semibold">{title}</h2>
          {isIntraday && (
            <span
              className="rounded-[var(--r-sm)] bg-[var(--muted)] px-2 py-0.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
              data-testid="stock-daily-chart-intraday-badge"
            >
              장중
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="차트 단위 선택"
            className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[var(--border)] p-1"
          >
            {DAILY_OHLCV_TIMEFRAMES.map((tf) => {
              const active = tf === timeframe;
              return (
                <button
                  key={tf}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTimeframe(tf)}
                  data-testid={`stock-daily-chart-timeframe-${tf}`}
                  className={`rounded-[var(--r-sm)] px-3 py-1 text-[length:var(--t-caption)] transition-colors ${
                    active
                      ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                      : 'text-[var(--muted-fg)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              );
            })}
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

      {/*
        Pitfall 5: container 항상 visible — Skeleton/Empty 는 absolute overlay.
        2026-05-16 사용자 요청: 차트 영역 좌우 여백 제거. 카드 padding(p-5 = 1.25rem)
        만큼 음의 마진으로 화면 좌우까지 차트 확장. 헤더/요약은 padding 유지.
      */}
      <div className="relative -mx-5 h-[340px] bg-[var(--card)]">
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
        <StockDailyChart rows={displayRows ?? []} height={340} />
      </div>

      {summary && <p className="sr-only">{summary}</p>}
    </Card>
  );
}
