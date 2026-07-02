"use client";

/**
 * Phase 14 Plan 09 — 미니 일봉차트 (C8, CHAT-01, D-10).
 *
 * 답변에 가격 흐름 설명이 필요할 때 삽입되는 120px 컴팩트 일봉차트. Phase 09.2 의
 * lightweight-charts 5.2.0 + `chart-colors.ts` 팔레트를 재사용한다(신규 차트 스택 도입 금지).
 * StockDailyChart(종목상세 풀차트)의 캔들 렌더 패턴을 mini 형태로 축약 — 볼륨/마커/hover
 * overlay 없이 최근 캔들만 표시.
 *
 * ## 데이터 흐름 (RESEARCH Pattern 6)
 * chart SSE 이벤트는 `code` 만 전달한다 — 시세 데이터는 웹앱이 Supabase 를 직접 조회
 * (fetchDailyOhlcv, 종목상세와 동일 경로 재사용). 팀장 답변이 대용량 OHLCV 를 실어나르지 않음.
 *
 * ## oklch 회피 (memory lesson feedback_lightweight_charts_oklch / Pitfall 9)
 * lightweight-charts color parser 는 globals.css 의 Phase 3 oklch 토큰을 거부한다. 색상은
 * 반드시 `chart-colors.ts`(getChartPalette)의 sRGB hex 팔레트를 주입한다. 국내식 봉색
 * (상승 빨강 `--up` / 하락 파랑 `--down`).
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  CandlestickSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { DailyOhlcvRow } from "@gh-radar/shared";

import { getChartPalette } from "@/lib/chart-colors";
import { fetchDailyOhlcv } from "@/lib/daily-ohlcv-api";

export interface MiniChartProps {
  code: string;
  /** 표시할 최근 캔들 수(기본 60 영업일). */
  maxBars?: number;
  height?: number;
}

function paletteKey(resolvedTheme: string | undefined): "light" | "dark" {
  return resolvedTheme === "light" ? "light" : "dark";
}

export function MiniChart({ code, maxBars = 60, height = 120 }: MiniChartProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [rows, setRows] = useState<DailyOhlcvRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // 1) code → Supabase 직접 조회(최근 1Y fetch 후 maxBars 로 slice).
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setFailed(false);
    void (async () => {
      try {
        const data = await fetchDailyOhlcv(code, "1Y", controller.signal);
        if (controller.signal.aborted) return;
        setRows(data.slice(-maxBars));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [code, maxBars]);

  // 2) chart 인스턴스 mount/unmount 1회 (Pitfall 8 — 모든 lib 호출은 effect 안에서).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = getChartPalette("dark");
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });
    // v5 breaking change — addSeries(SeriesDefinition, options) 통합 패턴 (Pitfall 4).
    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 3) rows/theme 변경 시 색상 재주입 + setData (Pitfall 6/9).
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const palette = getChartPalette(paletteKey(resolvedTheme));
    chart.applyOptions({
      layout: { background: { color: palette.bg }, textColor: palette.text },
    });
    series.applyOptions({
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    if (!rows || rows.length === 0) {
      series.setData([]);
      return;
    }
    const candles: CandlestickData<Time>[] = rows.map((r) => ({
      time: r.date as Time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
    series.setData(candles);
    chart.timeScale().fitContent();
  }, [rows, resolvedTheme]);

  return (
    <div
      className="my-[var(--s-1)] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]"
      style={{ height: `${height}px` }}
    >
      {failed ? (
        <div className="grid h-full place-items-center text-[length:11px] text-[var(--muted-fg)]">
          차트를 불러오지 못했어요
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
    </div>
  );
}
