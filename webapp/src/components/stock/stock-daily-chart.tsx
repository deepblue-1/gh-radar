'use client';

/**
 * Phase 09.2 — lightweight-charts 5.2.0 React wrapper.
 *
 * 책임 분리:
 *   - 본 컴포넌트: chart 인스턴스 lifecycle + theme/rows 반응 + crosshair hover OHLC overlay
 *   - 부모 (StockDailyChartSection): fetch + 토글 + Skeleton/Empty/Error 분기
 *
 * Pitfall 정리 (RESEARCH §Pitfalls):
 *   - Pitfall 4: v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴
 *   - Pitfall 5: container 는 항상 visible. Skeleton/Empty 는 부모가 absolute overlay 로
 *   - Pitfall 6: theme 변경 시 chart.applyOptions + series.applyOptions 재호출 (next-themes useTheme)
 *   - Pitfall 8: 'use client' + 모든 lib 호출은 useEffect 안에서만 (SSR 가드)
 *   - Pitfall 9: 색상은 chart-colors.ts 의 sRGB 팔레트만 사용, CSS Color 4 함수형 직접 주입 금지
 */

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { DailyOhlcvRow } from '@gh-radar/shared';
import { getChartPalette, type ChartPalette } from '@/lib/chart-colors';

/**
 * KRX 가격제한폭 = ±30%. 실제 상한가 changeRate 는 호가단위 floor 로 29.82~29.999%.
 * 29.5 마진은 안전 (29.4% 로 상한 되는 케이스는 사실상 없음).
 */
const UPPER_LIMIT_THRESHOLD = 29.5;

export interface StockDailyChartProps {
  /** 시간 ASC 정렬된 rows. 빈 배열이면 차트 인스턴스만 생성하고 setData 안 함 */
  rows: DailyOhlcvRow[];
  /** Skeleton/Empty 오버레이 시에도 chart container 는 항상 visible (Pitfall 5) */
  height?: number;
}

interface HoveredOhlc {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
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

const NUM = new Intl.NumberFormat('ko-KR');

/**
 * 2026-05-16 사용자 요청: 차트 위 날짜 라벨을 "2025.4.26" 형식으로 표시.
 * Time 입력은 lightweight-charts 의 BusinessDay({year,month,day}) 또는 ISO 'YYYY-MM-DD' 문자열.
 * 차트 옵션 (tickMarkFormatter / localization.timeFormatter) + overlay 양쪽이 동일 포맷.
 */
function formatChartDate(time: Time): string {
  let y: number;
  let m: number;
  let d: number;
  if (typeof time === 'string') {
    const [ys, ms, ds] = time.split('-');
    y = parseInt(ys, 10);
    m = parseInt(ms, 10);
    d = parseInt(ds, 10);
  } else if (typeof time === 'object' && time !== null && 'year' in time) {
    const t = time as { year: number; month: number; day: number };
    y = t.year;
    m = t.month;
    d = t.day;
  } else {
    // UTCTimestamp (seconds since epoch) — fallback
    const dt = new Date((time as number) * 1000);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return `${y}.${m}.${d}`;
}

function formatChartDateIso(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}.${parseInt(m, 10)}.${parseInt(d, 10)}`;
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
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  /**
   * 2026-05-16 사용자 요청: 마우스가 캔들 위에 있을 때 OHLC 를 차트 우상단에 표시.
   * crosshair 는 Normal mode (자유 이동) — 세로축 라벨은 마우스 y 위치의 가격.
   * 마우스가 chart 밖이거나 빈 영역이면 null → overlay 미표시.
   */
  const [hoveredOhlc, setHoveredOhlc] = useState<HoveredOhlc | null>(null);

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
      timeScale: {
        borderColor: palette.grid,
        timeVisible: false,
        // 2026-05-16 사용자 요청: 차트 하단 날짜 tick 라벨을 "yyyy.M.d" 형식으로.
        tickMarkFormatter: (time: Time) => formatChartDate(time),
      },
      localization: {
        // crosshair vertical line 의 날짜 라벨도 동일 포맷.
        timeFormatter: (time: Time) => formatChartDate(time),
      },
      // 2026-05-16 사용자 요청: crosshair Normal mode (mode=0) — 마우스 위치 그대로 따라가며
      // 세로축 라벨이 마우스 y 의 가격을 표시. mode=1(Magnet) 은 캔들 종가 snap.
      crosshair: { mode: 0 },
    });

    // v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴 (Pitfall 4)
    // 2026-05-16 사용자 요청: KRX 가격 = 정수 원 단위. 소숫점 제거 (precision: 0).
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

    // 2026-05-16 사용자 요청: 상한가 (changeRate ≥ 29.5%) 캔들 위에 "상" 마커.
    const markersPlugin = createSeriesMarkers<Time>(candleSeries, []);

    // 2026-05-16 사용자 요청: crosshair hover 시 해당 캔들의 OHLC 를 우상단 overlay 로 표시.
    // subscribeCrosshairMove 는 마우스가 차트 영역 위에 있을 때 fire. param.time === undefined
    // 이면 마우스가 빈 영역(데이터 밖) → overlay 숨김.
    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setHoveredOhlc(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as
        | CandlestickData<Time>
        | undefined;
      if (!data) {
        setHoveredOhlc(null);
        return;
      }
      setHoveredOhlc({
        date: String(param.time),
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      });
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersPluginRef.current = markersPlugin;

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
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

  // 3) rows 변경 시 candle + volume setData + markers
  useEffect(() => {
    const candle = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candle || !volume || !chart) return;
    if (rows.length === 0) {
      candle.setData([]);
      volume.setData([]);
      markersPluginRef.current?.setMarkers([]);
      setHoveredOhlc(null);
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

    // 2026-05-16: 상한가 캔들 마커. 사용자 요청으로 "상한" → "상" 라벨 단축.
    // - 일봉(D): changeRate ≥ 29.5% → 위쪽 화살표 + "상"
    // - 주봉/월봉(W/M): aggregateByTimeframe 가 changeRate=null 로 설정하므로 자연히 미표시
    const markers: SeriesMarker<Time>[] = rows
      .filter(
        (r) => r.changeRate !== null && r.changeRate >= UPPER_LIMIT_THRESHOLD,
      )
      .map((r) => ({
        time: r.date as Time,
        position: 'aboveBar',
        color: palette.up,
        shape: 'arrowUp',
        text: '상',
      }));
    markersPluginRef.current?.setMarkers(markers);

    // 2026-05-16 사용자 요청: 3Y 데이터를 fetch 하되 화면에는 최근 60개 영업일만 표시.
    // 사용자는 마우스 휠/드래그로 자유롭게 과거 영역 탐색 가능 (lightweight-charts 기본 동작).
    const last = rows.length - 1;
    const visibleCount = Math.min(60, rows.length);
    chart
      .timeScale()
      .setVisibleLogicalRange({ from: last - visibleCount + 1, to: last });
  }, [rows, resolvedTheme]);

  const palette = getChartPalette(resolvePaletteKey(resolvedTheme));
  const ohlcSwatchColor =
    hoveredOhlc && hoveredOhlc.close >= hoveredOhlc.open
      ? palette.up
      : palette.down;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        data-testid="stock-daily-chart-canvas"
        className="h-full w-full"
        style={{ height: `${height}px` }}
      />
      {hoveredOhlc && (
        <div
          data-testid="stock-daily-chart-ohlc-overlay"
          // 2026-05-16 사용자 요청: priceScale(우측) 에 가려지지 않도록 좌상단 배치.
          className="pointer-events-none absolute left-3 top-2 flex flex-col gap-0.5 rounded-[var(--r-sm)] bg-[var(--card)]/85 px-2 py-1 text-[length:var(--t-caption)] text-[var(--card-fg)] shadow-[0_1px_2px_rgba(0,0,0,0.08)] backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: ohlcSwatchColor }}
            />
            <span className="font-medium tabular-nums">
              {formatChartDateIso(hoveredOhlc.date)}
            </span>
          </div>
          <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
            <span className="text-[var(--muted-fg)]">시</span>
            <span>{NUM.format(hoveredOhlc.open)}</span>
            <span className="text-[var(--muted-fg)]">고</span>
            <span>{NUM.format(hoveredOhlc.high)}</span>
            <span className="text-[var(--muted-fg)]">저</span>
            <span>{NUM.format(hoveredOhlc.low)}</span>
            <span className="text-[var(--muted-fg)]">종</span>
            <span>{NUM.format(hoveredOhlc.close)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
