import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { candlesOf, type Candles } from '@/lib/ticks/candle-chart';
import type { CandleMaValue } from '@/lib/ticks/candle-ma';
import { candleBandAt, type CandleBand, type CandleBandSrc } from '@/lib/ticks/candle-readout';
import { teamKpiAt } from '@/lib/ticks/team-model';
import { msOfNs, priceSeriesOf, tickBoundsOf, turnoverSeriesOf } from '@/lib/ticks/tick-chart';
import type { TickBandSource } from '@/lib/ticks/tick-chart-tip';
import { SYNTH_DATE, a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { CANDLE_BAND_H, CandleChartBand } from '../candle-chart-band';
import { TickChartBand } from '../tick-chart-band';
import { TickTeamPanel } from '../tick-team-panel';

/**
 * Phase 42 Plan 06 Task 2 — 봉 차트 값 띠 A 4칸(D-20 · D-14 · SC-4 · UI-SPEC S8).
 *
 * 깨지면: 봉 차트 띠 수익률이 팀 패널과 다르게 보이거나, 마우스를 움직이면 띠 높이가 흔들린다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const MIN = 60_000;
const T1015 = B.T0 + 135 * MIN;

/** 합성 — 일반 1건(팀 첫 매수 전) · 팀 매수 3조각 · 일반 · 팀 매도 · 일반(candle-returns.test.ts 와 같은 하루). */
const s = synthSession([
  [-5, a3Msg({ seq: 99, bs: '1', px: 16350, qty: 10, a1: 16400, b1: 16350, time: '125959995000' })],
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
  [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
  [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
  [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
  [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
  [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
  [8, a3Msg({ seq: 109, bs: '2', px: 16350, qty: 5, a1: 16350, b1: 16300, time: '130000008000' })],
]);
const recOfSeq = (seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};
const msOfRec = (rec: number) => msOfNs(s.index.recvNs[rec]!);
const f = (a: number[]) => Float64Array.from(a);

const tickSrc = (): TickBandSource => ({
  team: s.team,
  cum: [],
  price: priceSeriesOf(s),
  turnover: turnoverSeriesOf(s),
  basePx: 16_000,
  mcap: null,
  T0: B.T0,
});

/** 5분봉 2개 — 10:15 · 10:25(10:20 빈 칸). */
const candles5: Candles = {
  unit: 5,
  n: 2,
  t0: f([T1015, T1015 + 10 * MIN]),
  o: f([13_100, 13_400]),
  h: f([13_500, 13_450]),
  l: f([13_000, 13_300]),
  c: f([13_450, 13_350]),
  amt: f([2_500_000, 800_000]),
};
const MA: CandleMaValue[] = [
  { key: 'bar:sma:5', name: '단순 5', color: 1, values: f([13_250, 13_300]) },
  { key: 'day:sma:120', name: '일 120', color: 3, values: f([Number.NaN, Number.NaN]) },
];

const src = (over: Partial<CandleBandSrc> = {}): CandleBandSrc => ({
  session: s,
  candles: candles5,
  ma: MA,
  cumAvg: [],
  tick: tickSrc(),
  ...over,
});

/** 10:16:52 — 5분봉 10:15 칸 안. */
const T_IN = T1015 + 112_000;
const bandIn = () => candleBandAt(src(), T_IN, -1);

const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel);
const cellOf = (c: HTMLElement, cell: string) => q(c, `[data-slot="candle-band-cell"][data-cell="${cell}"]`)!;

describe('CandleChartBand — 높이 고정(데스크톱 88 · 폰 137)', () => {
  it('데스크톱 — 루트 h-[88px] · 칸 비율 1.5fr 1.6fr 1fr 1.1fr · 4칸', () => {
    expect(CANDLE_BAND_H).toEqual({ desktop: 88, phone: 137 });
    const { container } = render(<CandleChartBand band={bandIn()} live phone={false} />);
    const root = q(container, '[data-slot="candle-chart-band"]')!;
    expect(root.className).toContain('h-[88px]');
    expect(root.className).toContain('grid-cols-[1.5fr_1.6fr_1fr_1.1fr]');
    expect(root.getAttribute('data-dims')).toBe('desktop');
    expect(container.querySelectorAll('[data-slot="candle-band-cell"]')).toHaveLength(4);
  });

  it('폰 — 루트 h-[137px] · 2 × 2(첫 행 84 · 둘째 행 52) · 둘째 행 위 경계', () => {
    const { container } = render(<CandleChartBand band={bandIn()} live phone />);
    const root = q(container, '[data-slot="candle-chart-band"]')!;
    expect(root.className).toContain('h-[137px]');
    expect(root.className).toContain('grid-cols-2');
    expect(root.className).toContain('grid-rows-[84px_52px]');
    expect(cellOf(container, 'slot').className).toContain('border-t');
    expect(cellOf(container, 'turnover').className).toContain('border-t');
    expect(cellOf(container, 'team').className).not.toContain('border-t');
  });

  it('마우스 시각이 바뀌어도(봉 있음 · 빈 분 · 커서 없음) 루트 클래스가 같다 — 높이가 흔들리지 않는다', () => {
    const a = render(<CandleChartBand band={bandIn()} live={false} phone={false} />).container;
    const b = render(<CandleChartBand band={candleBandAt(src(), T1015 + 7 * MIN, -1)} live={false} phone={false} />).container;
    const c = render(<CandleChartBand band={null} live phone={false} />).container;
    const cls = (x: HTMLElement) => q(x, '[data-slot="candle-chart-band"]')!.className;
    expect(cls(b)).toBe(cls(a));
    expect(cls(c)).toBe(cls(a));
  });
});

describe('CandleChartBand — 첫 칸 「봉」', () => {
  it('머리 「5분봉 10:15」 + 그 시각 · 현재 틱이면 머리 글자 --fg · 마우스면 아님 · 종가 · 등락률 · 거래대금 · 시 · 고 · 저', () => {
    const live = render(<CandleChartBand band={bandIn()} live phone={false} />).container;
    const cell = cellOf(live, 'candle');
    const head = q(cell, '[data-slot="candle-band-head"]')!;
    expect(head.textContent).toBe('5분봉 10:15');
    expect(head.className).toContain('text-[var(--fg)]');
    expect(cell.textContent).toContain('10:16:52');
    expect(cell.textContent).toContain('13,450');
    expect(cell.textContent).toContain('−15.94%'); // 기준가 16,000 대비 (13,450 − 16,000) ÷ 16,000
    expect(cell.textContent).toContain('거래대금');
    for (const k of ['시', '고', '저']) expect(cell.textContent).toContain(k);
    expect(cell.textContent).toContain('13,100');
    expect(cell.textContent).toContain('13,500');
    expect(cell.textContent).toContain('13,000');

    const hover = render(<CandleChartBand band={bandIn()} live={false} phone={false} />).container;
    expect(q(cellOf(hover, 'candle'), '[data-slot="candle-band-head"]')!.className).not.toContain('text-[var(--fg)]');
  });

  it('그 시각에 봉이 없으면(빈 분) 1줄 「—」 · 시 · 고 · 저 · 이동평균 줄 없음', () => {
    const { container } = render(
      <CandleChartBand band={candleBandAt(src(), T1015 + 7 * MIN, -1)} live={false} phone={false} />,
    );
    const cell = cellOf(container, 'candle');
    expect(cell.textContent).toContain('—');
    expect(cell.textContent).not.toContain('고');
    expect(q(cell, '[data-slot="candle-band-ma"]')).toBeNull();
  });

  it('이동평균 줄 — 데스크톱 색 줄 + 이름 + 값 · 값 없음 「—」 · 상자 h-8(32) · 켜진 선 0 = 줄 없음', () => {
    const { container } = render(<CandleChartBand band={bandIn()} live phone={false} />);
    const box = q(container, '[data-slot="candle-band-ma"]')!;
    expect(box.className).toContain('h-8');
    expect(box.className).toContain('overflow-hidden');
    expect(box.className).toContain('flex-wrap');
    const items = box.querySelectorAll<HTMLElement>('[data-slot="candle-band-ma-item"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe('단순 513,250');
    expect(items[1]!.textContent).toBe('일 120—');
    expect(items[0]!.querySelector('i')!.getAttribute('style')).toContain('var(--ma-1)');
    expect(items[1]!.querySelector('i')!.getAttribute('style')).toContain('var(--ma-3)');

    const none = render(<CandleChartBand band={candleBandAt(src({ ma: [] }), T_IN, -1)} live phone={false} />).container;
    expect(q(none, '[data-slot="candle-band-ma"]')).toBeNull();
  });

  it('이동평균 줄 — 폰은 색 줄 + 값(이름은 title · aria-label)', () => {
    const { container } = render(<CandleChartBand band={bandIn()} live phone />);
    const items = container.querySelectorAll<HTMLElement>('[data-slot="candle-band-ma-item"]');
    expect(items[0]!.textContent).toBe('13,250');
    expect(items[0]!.getAttribute('title')).toBe('단순 5');
    expect(items[0]!.getAttribute('aria-label')).toBe('단순 5 13,250');
    expect(items[1]!.textContent).toBe('—');
    expect(items[1]!.getAttribute('title')).toBe('일 120');
  });
});

describe('CandleChartBand — 둘째 칸 「당일 팀」 수익률 = 팀 거래정보 패널(SC-4)', () => {
  it('같은 세션 · 같은 커서 rec 에서 띠 candle-band-ret 글자 = 패널 tick-team-ret 글자 · 첫 매수 전이면 둘 다 「—」', () => {
    const c1 = candlesOf(s, 1);
    let nonDash = 0;
    for (const seq of [99, 101, 103, 104, 105, 107, 109]) {
      const rec = recOfSeq(seq);
      const band = candleBandAt(src({ candles: c1, ma: [] }), msOfRec(rec), rec);
      const panel = render(<TickTeamPanel session={s} cursorRec={rec} />).container;
      const strip = render(<CandleChartBand band={band} live phone={false} />).container;
      const want = q(panel, '[data-slot="tick-team-ret"]')!.textContent;
      const got = q(strip, '[data-slot="candle-band-ret"]')!.textContent;
      expect(got).toBe(want);
      if (seq === 99) expect(got).toBe('—');
      if (got !== '—') nonDash++;
      expect(teamKpiAt(s.team, s, rec).pnl?.ret ?? null).toBe(band.ret);
    }
    expect(nonDash).toBeGreaterThan(2);
  });

  it('누적(이월 포함) 줄은 tick.hasCum 일 때만 · 누적 평단 · 누적 수익률 줄은 hasCumAvg 일 때만 · 값 null 「—」', () => {
    const base = candleBandAt(src(), msOfRec(recOfSeq(107)), recOfSeq(107));
    const plain = cellOf(render(<CandleChartBand band={base} live phone={false} />).container, 'team');
    expect(plain.textContent).toContain('평단');
    expect(plain.textContent).toContain('수익률');
    expect(plain.textContent).not.toContain('누적');

    const withCum: CandleBand = {
      ...base,
      tick: { ...base.tick, hasCum: true, cum: 12_000_000 },
      hasCumAvg: true,
      cumAvg: 13_000,
      cumRet: 0.1,
    };
    const full = cellOf(render(<CandleChartBand band={withCum} live phone={false} />).container, 'team');
    expect(full.textContent).toContain('누적(이월 포함)');
    expect(full.textContent).toContain('누적 평단13,000');
    expect(full.textContent).toContain('누적 수익률+10.00%');

    const zero: CandleBand = { ...withCum, cumAvg: null, cumRet: null };
    const z = cellOf(render(<CandleChartBand band={zero} live phone={false} />).container, 'team');
    expect(z.textContent).toContain('누적 평단—');
    expect(z.textContent).toContain('누적 수익률—');
  });

  it('팀 체결이 하루에 없으면 1줄 「팀 체결 없음」', () => {
    const band = bandIn();
    const noTeam: CandleBand = { ...band, tick: { ...band.tick, hasTeam: false } };
    const cell = cellOf(render(<CandleChartBand band={noTeam} live phone={false} />).container, 'team');
    expect(cell.textContent).toContain('팀 체결 없음');
  });
});

describe('CandleChartBand — 셋째 「10분」 · 넷째 「누적」 칸 = 선 차트 띠 그대로', () => {
  it('같은 TickBand 로 그린 TickChartBand 의 셋째 · 넷째 칸과 마크업 · 클래스가 같다(데스크톱 · 폰 · 커서 없음)', () => {
    const band = candleBandAt(src(), msOfRec(recOfSeq(107)), recOfSeq(107));
    for (const phone of [false, true]) {
      for (const b of [band, null]) {
        const mine = render(<CandleChartBand band={b} live phone={phone} />).container;
        const line = render(<TickChartBand band={b === null ? null : b.tick} live phone={phone} />).container;
        for (const cell of ['slot', 'turnover']) {
          const a = cellOf(mine, cell);
          const z = q(line, `[data-slot="tick-band-cell"][data-cell="${cell}"]`)!;
          expect(a.innerHTML).toBe(z.innerHTML);
          expect(a.className).toBe(z.className);
        }
      }
    }
  });
});
