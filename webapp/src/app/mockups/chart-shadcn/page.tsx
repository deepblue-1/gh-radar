/**
 * Phase 09.2 RESEARCH — Mockup 2: recharts + shadcn Chart wrapper.
 *
 * 라이브러리: recharts 3.8.1 + webapp/src/components/ui/chart.tsx (shadcn add chart)
 *
 * 핵심 차이 (vs Mockup 1):
 * - <ChartContainer config={...}> 가 ResponsiveContainer 를 자체 래핑하고 ChartStyle
 *   인젝트로 config 의 color 를 CSS variable (--color-{key}) 로 변환하여 자손 컴포넌트가
 *   `var(--color-up)` 처럼 참조 가능. 다크모드는 .dark 셀렉터 분기로 자동 처리.
 * - <ChartTooltip content={<ChartTooltipContent ... />} /> 가 Phase 3 토큰 (border, popover, muted-fg)
 *   을 자동 적용한 일관된 룩&필 제공.
 * - 캔들 합성은 Mockup 1 과 완전 동일한 패턴 (Bar shape prop). shadcn 은 캔들 전용
 *   primitive 를 제공하지 않음.
 *
 * 결론: shadcn wrapper 의 가치 = "툴팁 + 색상 토큰 매핑 자동화", 캔들 합성 비용은 동일.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchDailyOhlcv,
  type DailyOhlcvRow,
  type RangeKey,
} from '../shared/fetch-daily';

const CODE = '005930';
const RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y'];

/**
 * shadcn ChartConfig — color 키가 자손 SVG 에 `var(--color-up)` / `var(--color-down)` 으로 노출된다.
 * Phase 3 토큰 (var(--up)) 을 wrapper 가 알아서 다크/라이트 분기 + scope 한다.
 */
const chartConfig = {
  up: {
    label: '양봉',
    theme: { light: 'oklch(0.66 0.20 22)', dark: 'oklch(0.72 0.19 22)' },
  },
  down: {
    label: '음봉',
    theme: { light: 'oklch(0.63 0.18 250)', dark: 'oklch(0.72 0.16 250)' },
  },
} satisfies ChartConfig;

interface CandleData extends DailyOhlcvRow {
  hl: [number, number];
  isUp: boolean;
}

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleData;
}

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { open, high, low, close, isUp } = payload;
  const range = high - low;
  if (range === 0) return null;

  const openY = y + ((high - open) / range) * height;
  const closeY = y + ((high - close) / range) * height;
  const bodyTop = Math.min(openY, closeY);
  const bodyBottom = Math.max(openY, closeY);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

  // shadcn ChartContainer 가 주입한 CSS 변수 — config key 기반.
  const color = isUp ? 'var(--color-up)' : 'var(--color-down)';
  const cx = x + width / 2;

  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={bodyTop} stroke={color} strokeWidth={1} />
      <line
        x1={cx}
        x2={cx}
        y1={bodyBottom}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x}
        y={bodyTop}
        width={width}
        height={bodyHeight}
        fill={color}
        stroke={color}
      />
    </g>
  );
}

export default function MockupShadcnPage() {
  const [range, setRange] = useState<RangeKey>('1M');
  const [rows, setRows] = useState<DailyOhlcvRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    fetchDailyOhlcv(CODE, range)
      .then((r) => setRows(r))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [range]);

  const candles = useMemo<CandleData[]>(() => {
    if (!rows) return [];
    return rows.map((r) => ({
      ...r,
      hl: [r.low, r.high] as [number, number],
      isUp: r.close >= r.open,
    }));
  }, [rows]);

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 p-6"
      aria-label="Mockup 2 - recharts shadcn wrapper"
    >
      <header className="space-y-1">
        <h1 className="text-[length:var(--t-h2)] font-semibold">
          Mockup 2: recharts + shadcn Chart wrapper
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          종목 005930 (삼성전자) — recharts 3.8.1 + ChartContainer/ChartTooltip
          (Phase 3 토큰 자동 매핑, 다크모드 자동 분기)
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

        {!rows && !error && (
          <div className="space-y-2">
            <Skeleton className="h-[260px] w-full" />
            <Skeleton className="h-[80px] w-full" />
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="grid h-[340px] place-items-center text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            일봉 데이터가 아직 수집되지 않았습니다.
          </div>
        )}

        {rows && rows.length > 0 && (
          <div
            className="space-y-1"
            aria-label={`최근 ${range} 일봉 차트, ${rows.length}영업일`}
          >
            {/* Candle panel — ChartContainer 가 ResponsiveContainer + ChartStyle 자체 래핑 */}
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[260px] w-full"
            >
              <BarChart data={candles} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} minTickGap={24} />
                <YAxis
                  domain={['auto', 'auto']}
                  width={56}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', fillOpacity: 0.3 }}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(label) => String(label)}
                      formatter={(_value, _name, item) => {
                        // item.payload 가 CandleData
                        const d = item.payload as CandleData;
                        return (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[length:var(--t-caption)]">
                            <span className="text-[var(--muted-fg)]">시가</span>
                            <span className="mono">{d.open.toLocaleString()}</span>
                            <span className="text-[var(--muted-fg)]">고가</span>
                            <span className="mono">{d.high.toLocaleString()}</span>
                            <span className="text-[var(--muted-fg)]">저가</span>
                            <span className="mono">{d.low.toLocaleString()}</span>
                            <span className="text-[var(--muted-fg)]">종가</span>
                            <span
                              className="mono"
                              style={{
                                color: d.isUp ? 'var(--color-up)' : 'var(--color-down)',
                              }}
                            >
                              {d.close.toLocaleString()}
                            </span>
                            <span className="text-[var(--muted-fg)]">거래량</span>
                            <span className="mono">{d.volume.toLocaleString()}</span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="hl"
                  shape={(props: unknown) => (
                    <CandleShape {...(props as CandleShapeProps)} />
                  )}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>

            {/* Volume panel — 동일하게 ChartContainer 래핑하면 토큰 일관 적용 */}
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[80px] w-full"
            >
              <BarChart data={candles} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={false} height={0} />
                <YAxis
                  width={56}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${v}`
                  }
                />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {candles.map((c, i) => (
                    <Cell
                      key={i}
                      fill={c.isUp ? 'var(--color-up)' : 'var(--color-down)'}
                      opacity={0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            <p className="sr-only">
              최근 {rows.length}영업일 종가 추이. 시작 종가{' '}
              {rows[0].close.toLocaleString()}원, 현재 종가{' '}
              {rows[rows.length - 1].close.toLocaleString()}원.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
