import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { PricePoint } from '@/lib/accum-chart';
import type { CandleMaValue } from '@/lib/ticks/candle-ma';
import {
  CANDLE_CHART,
  candlePanelsOf,
  candleRangeOf,
  candleYOf,
  candlesOf,
  type CandleFrame,
} from '@/lib/ticks/candle-chart';
import { tickBoundsOf, xOfTick } from '@/lib/ticks/tick-chart';
import type { TeamModel } from '@/lib/ticks/team-model';
import { SYNTH_DATE, a3Msg, synthSession } from '@/test-fixtures/tick-synth';

import { CandlePriceLayer, type CandlePriceLayerProps } from '../candle-price-layer';

/**
 * Phase 42 Plan 04 Task 2 — 봉 차트 가격 판 그리기(거래대금 막대 · 이동평균 · 누적 · 당일 평단 · 가장자리 글자 · 판 제목 · 겹침 순서).
 *
 * 깨지면: 봉 위 이동평균 · 누적 평단 · 거래대금 막대가 사라지거나, 범위 밖 평단 때문에 봉이 납작해진다.
 */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const bounds = tickBoundsOf(SYNTH_DATE);
const { T0 } = bounds;
/** synthNs 는 13:00 KST 기준 ms. */
const at = (h: number, m: number, s = 0) => (h - 13) * HOUR + m * MIN + s * SEC;

/** 09:00 오름(15,000 → 15,100) · 09:01 내림(15,100 → 15,000) · 09:02 오름(15,000 → 15,050). */
const session = synthSession([
  [at(9, 0, 1), a3Msg({ seq: 1, bs: '2', px: 15_000, qty: 10 })],
  [at(9, 0, 30), a3Msg({ seq: 2, bs: '2', px: 15_100, qty: 20 })],
  [at(9, 1, 1), a3Msg({ seq: 3, bs: '1', px: 15_100, qty: 5 })],
  [at(9, 1, 40), a3Msg({ seq: 4, bs: '1', px: 15_000, qty: 7 })],
  [at(9, 2, 1), a3Msg({ seq: 5, bs: '2', px: 15_000, qty: 3 })],
  [at(9, 2, 50), a3Msg({ seq: 6, bs: '2', px: 15_050, qty: 4 })],
]);
const candles = candlesOf(session, 1);
const view = { t0: T0 + HOUR, t1: T0 + HOUR + 5 * MIN };

function frameOf(phone: boolean): CandleFrame {
  const P = candlePanelsOf(phone ? CANDLE_CHART.phone : CANDLE_CHART.desktop);
  const W = phone ? 380 : 900;
  const L = phone ? 44 : 60;
  const xr = W - 40;
  return { W, P, L, xr, plotW: xr - L, phone, view, x: xOfTick(view, L, xr), bounds, endMs: T0 + HOUR + 3 * MIN };
}

const range = candleRangeOf(candles, view);

const ma = (key: string, name: string, color: number, v: number[]): CandleMaValue => ({
  key,
  name,
  color,
  values: Float64Array.from(v),
});
const MA5 = ma('bar:sma:5', '단순 5', 1, [15_020, 15_040, 15_050]);
const MA20 = ma('bar:sma:20', '단순 20', 2, [15_010, 15_030, 15_060]);
const MA_NAN = ma('bar:ema:7', '지수 7', 3, [Number.NaN, Number.NaN, Number.NaN]);
const MA_ABOVE = ma('bar:sma:60', '단순 60', 4, [16_000, 16_000, 16_000]);

/** 범위 안 누적 평단 · 범위 아래 누적 평단(13,772). */
const CUM_IN: PricePoint[] = [[T0, 15_030]];
const CUM_BELOW: PricePoint[] = [[T0, 13_772]];

/** 팀 체결 하나(잔량 10 · 원가 150,200 → 평단 15,020). */
const team = {
  fills: [],
  fillMs: Float64Array.of(T0 + HOUR + 10 * SEC),
  prefix: { n: 1, hold: Float64Array.of(0, 10), cost: Float64Array.of(0, 150_200) },
} as unknown as TeamModel;

function renderLayer(props: Partial<CandlePriceLayerProps> & { phone?: boolean } = {}) {
  const { phone = false, ...rest } = props;
  const frame = frameOf(phone);
  const y = candleYOf(range, frame.P);
  return render(
    <svg>
      <CandlePriceLayer frame={frame} candles={candles} range={range} y={y} cumAvg={CUM_IN} clipId="t" {...rest}>
        <circle data-slot="test-child" r={3} />
      </CandlePriceLayer>
    </svg>,
  );
}

const slots = (c: HTMLElement, s: string) => Array.from(c.querySelectorAll(`[data-slot="${s}"]`));

describe('CandlePriceLayer', () => {
  it('ma 없이 렌더 — 봉 · 누적 평단 · children · 축에 거래대금 막대(방향색 · .38)만 더해진다', () => {
    const { container } = renderLayer();
    for (const s of ['candle-wick-up', 'candle-body-up', 'candle-body-down', 'candle-cum-avg', 'candle-px-axis', 'test-child']) {
      expect(slots(container, s)).toHaveLength(1);
    }
    const up = slots(container, 'candle-amt-up')[0]!;
    const down = slots(container, 'candle-amt-down')[0]!;
    expect(up.getAttribute('fill')).toBe('var(--up)');
    expect(down.getAttribute('fill')).toBe('var(--down)');
    expect(up.getAttribute('fill-opacity')).toBe('0.38');
    expect(down.getAttribute('fill-opacity')).toBe('0.38');
    expect(up.getAttribute('d')).not.toBe('');
    expect(down.getAttribute('d')).not.toBe('');
    for (const s of ['candle-ma-line', 'candle-team-avg', 'candle-edge-label', 'candle-price-title']) {
      expect(slots(container, s)).toHaveLength(0);
    }
  });

  it('이동평균 둘 → 선 둘 · 색 var(--ma-1) · var(--ma-2) · 1.25 · round · DOM 순서 = 입력 순서 · 값이 전부 NaN 인 선은 경로 없음', () => {
    const { container } = renderLayer({ ma: [MA5, MA20, MA_NAN] });
    const lines = slots(container, 'candle-ma-line');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.getAttribute('stroke'))).toEqual(['var(--ma-1)', 'var(--ma-2)']);
    expect(lines.map((l) => l.getAttribute('data-ma-key'))).toEqual(['bar:sma:5', 'bar:sma:20']);
    for (const l of lines) {
      expect(l.getAttribute('stroke-width')).toBe('1.25');
      expect(l.getAttribute('stroke-linejoin')).toBe('round');
      expect(l.getAttribute('d')!.startsWith('M')).toBe(true);
    }
    // 봉 영역 클립 안
    expect(lines[0]!.closest('[clip-path="url(#t-candle)"]')).not.toBeNull();
  });

  it('누적 평단이 그림 범위 아래 → 선 없음 · 「누적 평단 13,772 ▾」 · 가격 범위는 그대로', () => {
    const { container } = renderLayer({ cumAvg: CUM_BELOW });
    expect(slots(container, 'candle-cum-avg')).toHaveLength(0);
    const labels = slots(container, 'candle-edge-label');
    expect(labels.map((l) => l.textContent)).toEqual(['누적 평단 13,772 ▾']);
    const l = labels[0]!;
    expect(l.getAttribute('text-anchor')).toBe('start');
    expect(l.getAttribute('fill')).toBe('var(--muted-fg)');
    expect(l.getAttribute('stroke')).toBe('var(--card)');
    expect(l.getAttribute('stroke-width')).toBe('3');
    expect(l.getAttribute('paint-order')).toBe('stroke');
    expect(l.getAttribute('font-size')).toBe('11');
    expect(range.lo).toBeGreaterThan(14_000);
  });

  it('이동평균 하나가 범위 위 → 그 선 없음 · 「단순 60 16,000 ▴」(그 색) · 나머지 선은 그린다', () => {
    const { container } = renderLayer({ ma: [MA5, MA_ABOVE] });
    const lines = slots(container, 'candle-ma-line');
    expect(lines.map((l) => l.getAttribute('data-ma-key'))).toEqual(['bar:sma:5']);
    const labels = slots(container, 'candle-edge-label');
    expect(labels.map((l) => l.textContent)).toEqual(['단순 60 16,000 ▴']);
    expect(labels[0]!.getAttribute('fill')).toBe('var(--ma-4)');
    expect(labels[0]!.getAttribute('text-anchor')).toBe('end');
  });

  it('team 을 주면 당일 평단 점점선(--up · 1.25 · 1 2) · 안 주면 없음', () => {
    const { container } = renderLayer({ team });
    const avg = slots(container, 'candle-team-avg');
    expect(avg).toHaveLength(1);
    expect(avg[0]!.getAttribute('stroke')).toBe('var(--up)');
    expect(avg[0]!.getAttribute('stroke-width')).toBe('1.25');
    expect(avg[0]!.getAttribute('stroke-dasharray')).toBe('1 2');
    expect(avg[0]!.getAttribute('d')!.startsWith('M')).toBe(true);
    expect(slots(renderLayer().container, 'candle-team-avg')).toHaveLength(0);
  });

  it('데스크톱 판 제목 — 단위 · 이동평균 이름(각 색) · 팀 평단 · 누적 평단(보고서) · 팀 주문 원 · ◆ 우리 체결', () => {
    const { container } = renderLayer({ unitLabel: '5분봉(자동)', ma: [MA5, MA20], ownInTitle: true, team });
    const title = slots(container, 'candle-price-title');
    expect(title).toHaveLength(1);
    expect(title[0]!.textContent).toBe(
      '5분봉(자동) · 이동평균 단순 5 · 단순 20 · 팀 평단 · 누적 평단(보고서) · 팀 주문 원 · ◆ 우리 체결',
    );
    const fills = Array.from(title[0]!.querySelectorAll('tspan')).map((t) => [t.textContent, t.getAttribute('fill')]);
    expect(fills).toEqual([
      ['단순 5', 'var(--ma-1)'],
      ['단순 20', 'var(--ma-2)'],
      ['팀 평단', 'var(--up)'],
      ['누적 평단(보고서)', 'var(--muted-fg)'],
      ['◆ 우리 체결', 'var(--mine-fg)'],
    ]);
    expect(title[0]!.getAttribute('font-weight')).toBe('600');
    expect(title[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('판 제목 — 이동평균 없음 · 누적 없음 · 우리 모델 없음이면 그 부분이 빠진다', () => {
    const { container } = renderLayer({ unitLabel: '15분봉', cumAvg: [] });
    expect(slots(container, 'candle-price-title')[0]!.textContent).toBe('15분봉 · 팀 평단 · 팀 주문 원');
  });

  it('폰 프레임 · 단위 글자 없음이면 판 제목 없음', () => {
    const phone = renderLayer({ phone: true, unitLabel: '5분봉(자동)', ma: [MA5] });
    expect(slots(phone.container, 'candle-price-title')).toHaveLength(0);
    expect(slots(phone.container, 'candle-ma-line')).toHaveLength(1);
    expect(slots(renderLayer({ ma: [MA5] }).container, 'candle-price-title')).toHaveLength(0);
  });

  it('겹침 순서 — 막대 → 꼬리 → 몸통 → 이동평균 → 누적 평단 → 당일 평단 → children → 가장자리 글자 → 판 제목', () => {
    const { container } = renderLayer({
      ma: [MA5, MA_ABOVE],
      team,
      unitLabel: '1분봉(자동)',
      ownInTitle: true,
    });
    const order = Array.from(container.querySelectorAll('[data-slot]')).map((e) => e.getAttribute('data-slot'));
    const want = [
      'candle-amt-up',
      'candle-amt-down',
      'candle-wick-up',
      'candle-wick-down',
      'candle-body-up',
      'candle-body-down',
      'candle-ma-line',
      'candle-cum-avg',
      'candle-team-avg',
      'candle-price-overlay',
      'candle-edge-label',
      'candle-price-title',
    ];
    const idx = want.map((s) => order.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('틱 선(가격 선)이 없다 — 어떤 data-slot 도 tick- 접두 · price-path 가 아니다', () => {
    const { container } = renderLayer({ ma: [MA5, MA20], team, unitLabel: '5분봉(자동)', ownInTitle: true });
    const names = Array.from(container.querySelectorAll('[data-slot]')).map((e) => e.getAttribute('data-slot')!);
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) {
      expect(n.startsWith('tick-')).toBe(false);
      expect(n.includes('price-path')).toBe(false);
    }
  });
});
