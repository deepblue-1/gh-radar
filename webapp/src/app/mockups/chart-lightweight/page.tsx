/**
 * Phase 09.2 RESEARCH — Mockup 3: lightweight-charts 5.x.
 *
 * 라이브러리: lightweight-charts 5.2.0 (TradingView).
 *
 * 핵심 차이 (vs Mockup 1/2):
 * - 명령형(imperative) Canvas API — React virtual DOM 외부에서 chart 인스턴스 직접 관리.
 *   `useEffect` 안에서 createChart → addSeries → setData, cleanup 에서 chart.remove().
 * - 캔들스틱 + 거래량 히스토그램이 네이티브 series type 으로 제공 (Bar shape 합성 불필요).
 * - 다중 pane (캔들 + 거래량) 을 동일 차트 인스턴스 내부에서 panes 옵션으로 분리 가능
 *   (5.x 신규 — Issue #1851 panes 기능). 본 mockup 은 호환성 우선으로 단일 pane +
 *   priceScaleId 분리 패턴 사용 (TradingView 공식 docs 의 volume 패턴).
 * - SSR 미지원 — `'use client'` + useEffect 가드 필수. window/document 의존.
 * - 색상 토큰: chart options 의 layout.background, textColor, grid.color 등을 명시 주입.
 *   CSS 변수를 직접 못 받으므로 getComputedStyle 로 변환하거나 raw oklch 값 직접 주입.
 *   ⇒ 다크모드 전환 시 chart.applyOptions() 재호출 필요 (자동 분기 X — useEffect 의존).
 *
 * v5 breaking change 주의:
 * - chart.addCandlestickSeries() (v4) → chart.addSeries(CandlestickSeries, opts) (v5)
 * - HistogramSeries 도 동일 패턴.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchDailyOhlcv,
  type DailyOhlcvRow,
  type RangeKey,
} from '../shared/fetch-daily';

const CODE = '005930';
const RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y'];

// 한국식 색상 컨벤션 (D-02). lightweight-charts 의 color parser 가 oklch() 미지원
// (Error: Failed to parse color: oklch(...) — RESEARCH Pitfall 9 추가 발견).
// globals.css 의 oklch 토큰을 sRGB hex 근사값으로 변환해 직접 주입.
const COLORS = {
  light: {
    up: '#ef4444', // ≈ oklch(0.66 0.20 22) — 한국식 빨강
    down: '#3b82f6', // ≈ oklch(0.63 0.18 250) — 한국식 파랑
    text: '#737373', // ≈ oklch(0.50 0 0)
    grid: '#e7e7e7', // ≈ oklch(0.92 0 0)
    bg: '#FFFFFF',
  },
  dark: {
    up: '#f87171', // ≈ oklch(0.72 0.19 22)
    down: '#60a5fa', // ≈ oklch(0.72 0.16 250)
    text: '#a3a3a3', // ≈ oklch(0.65 0 0)
    grid: '#2e2e2e', // ≈ oklch(0.24 0 0)
    bg: '#1c1c1c', // ≈ oklch(0.12 0 0)
  },
} as const;

function detectDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export default function MockupLightweightPage() {
  const [range, setRange] = useState<RangeKey>('1M');
  const [rows, setRows] = useState<DailyOhlcvRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // 1) 데이터 fetch
  useEffect(() => {
    setRows(null);
    setError(null);
    fetchDailyOhlcv(CODE, range)
      .then((r) => setRows(r))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [range]);

  // 2) chart 인스턴스 생성/정리 — mount/unmount 1회
  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;
    try {
      const isDark = detectDark();
      const palette = isDark ? COLORS.dark : COLORS.light;

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 340,
        autoSize: true,
        layout: {
          background: { color: palette.bg },
          textColor: palette.text,
          fontFamily:
            'Pretendard Variable, Pretendard, system-ui, sans-serif',
        },
        grid: {
          vertLines: { color: palette.grid, style: 1 },
          horzLines: { color: palette.grid, style: 1 },
        },
        rightPriceScale: { borderColor: palette.grid },
        timeScale: { borderColor: palette.grid, timeVisible: false },
        crosshair: { mode: 1 },
      });

      // v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴.
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: palette.up,
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart
        .priceScale('volume')
        .applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
      chart
        .priceScale('right')
        .applyOptions({ scaleMargins: { top: 0.05, bottom: 0.3 } });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;

      cleanup = () => {
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      };
    } catch (e) {
      const stack =
        e instanceof Error
          ? `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`
          : String(e);
      // 진단용 — Phase 09.2 RESEARCH 단계의 lightweight-charts root error 추적
      console.error('[mockup3] createChart failed:', e);
      setError(stack);
    }
    return cleanup;
  }, []);

  // 3) 데이터 갱신 — series.setData() 만 호출 (chart 재생성 X)
  useEffect(() => {
    if (!rows || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    const candleData: CandlestickData<Time>[] = rows.map((r) => ({
      time: r.date as Time, // 'YYYY-MM-DD' string 자동 인식
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
    const isDark = detectDark();
    const palette = isDark ? COLORS.dark : COLORS.light;
    const volumeData: HistogramData<Time>[] = rows.map((r) => ({
      time: r.date as Time,
      value: r.volume,
      color: r.close >= r.open ? palette.up : palette.down,
    }));
    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [rows]);

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 p-6"
      aria-label="Mockup 3 - lightweight-charts"
    >
      <header className="space-y-1">
        <h1 className="text-[length:var(--t-h2)] font-semibold">
          Mockup 3: lightweight-charts 5.x
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          종목 005930 (삼성전자) — TradingView lightweight-charts 5.2.0,
          CandlestickSeries + HistogramSeries 네이티브
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[length:var(--t-h3)] font-semibold">일봉 차트</h2>
          <div
            role="tablist"
            aria-label="기간 선택"
            className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[var(--border)] p-1"
          >
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
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

        {error && (
          <div className="text-[length:var(--t-sm)] text-[var(--destructive)]">
            데이터를 불러오지 못했습니다: {error}
          </div>
        )}

        {/*
          container 는 항상 visible — display:none 상태에서 createChart 호출 시
          container.clientWidth=0 으로 chart 내부에서 throw (RESEARCH Pitfall 8).
          Skeleton/Empty state 를 absolute overlay 로 위에 깔아 시각적 동일.
        */}
        <div className="relative h-[340px] w-full">
          {!rows && !error && <Skeleton className="absolute inset-0" />}
          {rows && rows.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-[length:var(--t-sm)] text-[var(--muted-fg)]">
              일봉 데이터가 아직 수집되지 않았습니다.
            </div>
          )}
          <div ref={containerRef} className="h-full w-full" />
        </div>

        {rows && rows.length > 0 && (
          <p className="sr-only">
            최근 {rows.length}영업일 종가 추이. 시작 종가{' '}
            {rows[0].close.toLocaleString()}원, 현재 종가{' '}
            {rows[rows.length - 1].close.toLocaleString()}원.
          </p>
        )}
      </Card>
    </div>
  );
}
