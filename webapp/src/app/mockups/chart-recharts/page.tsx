/**
 * Phase 09.2 RESEARCH — Mockup 1: recharts (raw).
 *
 * 라이브러리: recharts 3.8.1 단독 (shadcn Chart wrapper 미사용).
 *
 * 설계:
 * - recharts 에는 공식 Candlestick 컴포넌트가 없다 (recharts 3.x).
 * - Bar 의 `shape` prop 에 함수형 커스텀 SVG 를 주입하여 캔들 합성.
 *   recharts 3.x 부터 Customized 컴포넌트 없이도 Bar 가 임의 shape 렌더 가능.
 * - 캔들과 Volume bar 는 별도 차트 (위/아래 2 panel) 로 배치 — 단일 ComposedChart 의
 *   yAxis 다중화는 dual-axis 가독성이 나빠 mockup 단계에서 separate 채택.
 *   (75/25 비율 D-03 권장)
 * - 색상은 Phase 3 디자인 토큰 var(--up) / var(--down) 직접 주입 (raw 패턴 — 토큰 자동 매핑 없음).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchDailyOhlcv,
  type DailyOhlcvRow,
  type RangeKey,
} from '../shared/fetch-daily';

const CODE = '005930';
const RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y'];

// 한국식 색상 컨벤션 (D-02). CSS 변수 직접 참조.
const COLOR_UP = 'var(--up)';
const COLOR_DOWN = 'var(--down)';

interface CandleData extends DailyOhlcvRow {
  /** Bar 가 그리는 가격 범위 [low, high] — recharts 의 ranged Bar 패턴 */
  hl: [number, number];
  isUp: boolean;
}

/**
 * 커스텀 캔들 shape — recharts 가 Bar 마다 호출하는 함수형 shape prop.
 * payload 에 OHLC 가 포함되지 않으므로 props 의 x/y/width/height 와
 * 외부 closure 의 originalData 를 결합해 캔들을 그린다.
 *
 * 이 패턴의 함정 (Pitfall — RESEARCH §Common Pitfalls 에 기록):
 * - Bar 의 y/height 는 hl(=[low, high]) 만 반영. open/close 는 추가로 그려야 함.
 * - yAxis scale 함수에 직접 접근 불가 → 비율 계산으로 직접 픽셀 위치 산출.
 */
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

  // open/close 의 픽셀 y 위치 = y(=high 픽셀) + (high - value) / (high - low) * height
  const openY = y + ((high - open) / range) * height;
  const closeY = y + ((high - close) / range) * height;
  const bodyTop = Math.min(openY, closeY);
  const bodyBottom = Math.max(openY, closeY);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1); // doji 도 최소 1px

  const color = isUp ? COLOR_UP : COLOR_DOWN;
  const cx = x + width / 2;

  return (
    <g>
      {/* 위/아래 wick */}
      <line x1={cx} x2={cx} y1={y} y2={bodyTop} stroke={color} strokeWidth={1} />
      <line
        x1={cx}
        x2={cx}
        y1={bodyBottom}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      {/* body — 한국식: 양봉도 fill (속이 빈 음봉 컨벤션 미사용) */}
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

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CandleData }>;
}

function CandleTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--popover)] px-3 py-2 text-[length:var(--t-caption)] shadow-md">
      <div className="font-semibold text-[var(--fg)]">{d.date}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-[var(--muted-fg)]">시가</span>
        <span className="mono">{d.open.toLocaleString()}</span>
        <span className="text-[var(--muted-fg)]">고가</span>
        <span className="mono">{d.high.toLocaleString()}</span>
        <span className="text-[var(--muted-fg)]">저가</span>
        <span className="mono">{d.low.toLocaleString()}</span>
        <span className="text-[var(--muted-fg)]">종가</span>
        <span
          className="mono"
          style={{ color: d.isUp ? COLOR_UP : COLOR_DOWN }}
        >
          {d.close.toLocaleString()}
        </span>
        <span className="text-[var(--muted-fg)]">거래량</span>
        <span className="mono">{d.volume.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function MockupRechartsPage() {
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
      aria-label="Mockup 1 - recharts raw"
    >
      <header className="space-y-1">
        <h1 className="text-[length:var(--t-h2)] font-semibold">
          Mockup 1: recharts (raw)
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          종목 005930 (삼성전자) — recharts 3.8.1 + Bar shape prop 으로 캔들 합성
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
            {/* Candle panel — 약 75% */}
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={candles}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--muted-fg)', fontSize: 10 }}
                    stroke="var(--border)"
                    minTickGap={24}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: 'var(--muted-fg)', fontSize: 10 }}
                    stroke="var(--border)"
                    width={56}
                    tickFormatter={(v: number) => v.toLocaleString()}
                  />
                  <Tooltip
                    content={<CandleTooltip />}
                    cursor={{ fill: 'var(--muted)', fillOpacity: 0.3 }}
                  />
                  <Bar
                    dataKey="hl"
                    shape={(props: unknown) => (
                      <CandleShape {...(props as CandleShapeProps)} />
                    )}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Volume panel — 약 25% */}
            <div className="h-[80px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={candles}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    tick={false}
                    height={0}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted-fg)', fontSize: 9 }}
                    stroke="var(--border)"
                    width={56}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${v}`
                    }
                  />
                  <Bar dataKey="volume" isAnimationActive={false}>
                    {candles.map((c, i) => (
                      <Cell
                        key={i}
                        fill={c.isUp ? COLOR_UP : COLOR_DOWN}
                        opacity={0.6}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

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
