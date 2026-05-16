'use client';

/**
 * Phase 09.2 — lightweight-charts 5.2.0 React wrapper.
 *
 * 책임 분리:
 *   - 본 컴포넌트: chart 인스턴스 lifecycle + theme/rows 반응만
 *   - 부모 (StockDailyChartSection): fetch + 토글 + Skeleton/Empty/Error 분기
 *
 * Pitfall 정리 (RESEARCH §Pitfalls):
 *   - Pitfall 4: v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴
 *   - Pitfall 5: container 는 항상 visible. Skeleton/Empty 는 부모가 absolute overlay 로
 *   - Pitfall 6: theme 변경 시 chart.applyOptions + series.applyOptions 재호출 (next-themes useTheme)
 *   - Pitfall 8: 'use client' + 모든 lib 호출은 useEffect 안에서만 (SSR 가드)
 *   - Pitfall 9: 색상은 chart-colors.ts 의 sRGB 팔레트만 사용, CSS Color 4 함수형 직접 주입 금지
 */

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import type { DailyOhlcvRow } from '@gh-radar/shared';
import { getChartPalette, type ChartPalette } from '@/lib/chart-colors';

export interface StockDailyChartProps {
  /** 시간 ASC 정렬된 rows. 빈 배열이면 차트 인스턴스만 생성하고 setData 안 함 */
  rows: DailyOhlcvRow[];
  /** Skeleton/Empty 오버레이 시에도 chart container 는 항상 visible (Pitfall 5) */
  height?: number;
}

function resolvePaletteKey(
  resolvedTheme: string | undefined,
): 'light' | 'dark' {
  return resolvedTheme === 'light' ? 'light' : 'dark';
}

function applyPaletteToChart(
  chart: IChartApi,
  candle: ISeriesApi<'Candlestick'>,
  volume: ISeriesApi<'Histogram'>,
  palette: ChartPalette,
): void {
  chart.applyOptions({
    layout: { background: { color: palette.bg }, textColor: palette.text },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid },
    },
    rightPriceScale: { borderColor: palette.grid },
    timeScale: { borderColor: palette.grid },
  });
  candle.applyOptions({
    upColor: palette.up,
    downColor: palette.down,
    borderUpColor: palette.up,
    borderDownColor: palette.down,
    wickUpColor: palette.up,
    wickDownColor: palette.down,
  });
  // Volume bar 색상은 setData 의 per-bar color 로 분기 (rows effect 가 처리)
  void volume;
}

export function StockDailyChart({
  rows,
  height = 340,
}: StockDailyChartProps) {
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // 1) chart 인스턴스 mount/unmount 1회. 초기 palette 는 dark default
  //    (theme effect 가 2번째 tick 에서 정확값으로 재주입)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = getChartPalette('dark');
    const chart = createChart(container, {
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

    // v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴 (Pitfall 4)
    // 사용자 요청 (2026-05-16): KRX 가격 = 정수 원 단위. 소숫점 제거 (precision: 0).
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
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

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 2) theme 변경 시 chart + series 색상 재주입 (Pitfall 6 fix)
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!chart || !candle || !volume) return;
    const palette = getChartPalette(resolvePaletteKey(resolvedTheme));
    applyPaletteToChart(chart, candle, volume, palette);

    // Volume bar 의 per-bar color 도 현재 rows 기준 재주입 (theme 변경만으로
    //   rows effect 가 안 돌므로 직접 호출).
    if (rows.length > 0) {
      const volumeData: HistogramData<Time>[] = rows.map((r) => ({
        time: r.date as Time,
        value: r.volume,
        color: r.close >= r.open ? palette.up : palette.down,
      }));
      volume.setData(volumeData);
    }
  }, [resolvedTheme, rows]);

  // 3) rows 변경 시 candle + volume setData
  useEffect(() => {
    const candle = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candle || !volume || !chart) return;
    if (rows.length === 0) {
      candle.setData([]);
      volume.setData([]);
      return;
    }
    const palette = getChartPalette(resolvePaletteKey(resolvedTheme));
    const candleData: CandlestickData<Time>[] = rows.map((r) => ({
      time: r.date as Time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
    const volumeData: HistogramData<Time>[] = rows.map((r) => ({
      time: r.date as Time,
      value: r.volume,
      color: r.close >= r.open ? palette.up : palette.down,
    }));
    candle.setData(candleData);
    volume.setData(volumeData);
    // 사용자 요청 (2026-05-16): 기본 1Y 데이터에서 최근 30개만 보이도록 scroll 위치 설정.
    // 사용자는 마우스 휠/드래그로 자유롭게 과거 영역 탐색 가능 (lightweight-charts 기본 동작).
    const last = rows.length - 1;
    const visibleCount = Math.min(30, rows.length);
    chart
      .timeScale()
      .setVisibleLogicalRange({ from: last - visibleCount + 1, to: last });
  }, [rows, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      data-testid="stock-daily-chart-canvas"
      className="h-full w-full"
      style={{ height: `${height}px` }}
    />
  );
}
