import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { PricePoint, View } from '@/lib/accum-chart';
import { CANDLE_CHART, candlePanelsOf, type CandleFrame } from '@/lib/ticks/candle-chart';
import {
  cumReturnPointsOf,
  dayReturnPointsOf,
  fmtReturnTick,
  returnScalesOf,
  type ReturnPoint,
} from '@/lib/ticks/candle-returns';
import { TICK_CHART, lastRecvMsOf, msOfNs, tickBoundsOf, xOfTick } from '@/lib/ticks/tick-chart';
import type { TickSession } from '@/lib/ticks/tick-session';
import { SYNTH_DATE, a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import { CandleReturnLayer } from '../candle-return-layer';

/**
 * Phase 42 Plan 05 Task 1 — 봉 차트 수익률 판 층(D-12 ~ D-15 · D-17 · UI-SPEC S6).
 *
 * 깨지면: 수익률 판의 보라 · 회색 선이 0% 를 서로 다른 높이에 두거나, 누적이 없는데 왼쪽 눈금이 남는다.
 */

const T13 = msOfNs(synthNs(0));
const W = 640;
const L = 56;

/** 팀 매수 SMP 3조각 · 일반 1조각 · 팀 매도 + 앞뒤 일반 체결(candle-returns.test 와 같은 하루). */
const teamDay = synthSession([
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

/** 팀 체결 없는 하루(일반 체결 하나). */
const noTeamDay = synthSession([
  [1, a3Msg({ seq: 300, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000001000' })],
]);

const VIEW: View = { t0: T13 - 10, t1: T13 + 10 };

function frameOf(session: TickSession, phone = false, view: View = VIEW): CandleFrame {
  const P = candlePanelsOf(phone ? CANDLE_CHART.phone : CANDLE_CHART.desktop);
  const xr = W - TICK_CHART.R;
  const bounds = tickBoundsOf(SYNTH_DATE);
  return {
    W,
    P,
    L,
    xr,
    plotW: xr - L,
    phone,
    view,
    x: xOfTick(view, L, xr),
    bounds,
    endMs: lastRecvMsOf(session) ?? bounds.T2000,
  };
}

/** 누적 평단 — 첫 점 16,000 → (T13 + 3ms) 등록 포지션 없음(px 0 · 끊김) → (T13 + 6ms) 16,200. */
const CUM_AVG_GAP: PricePoint[] = [
  [T13 - 100, 16000],
  [T13 + 3, 0],
  [T13 + 6, 16200],
];
const CUM_AVG: PricePoint[] = [[T13 - 100, 16000]];

function renderLayer(opts: { session?: TickSession; phone?: boolean; day?: ReturnPoint[]; cum?: ReturnPoint[] }) {
  const session = opts.session ?? teamDay;
  const frame = frameOf(session, opts.phone ?? false);
  const day = opts.day ?? dayReturnPointsOf(session, frame.view, frame.plotW, -1);
  const cum = opts.cum ?? [];
  const scales = returnScalesOf(day, cum, frame.P.yRa, frame.P.yRb);
  const r = render(
    <svg>
      <CandleReturnLayer
        frame={frame}
        day={day}
        noTeam={session.team.fills.length === 0}
        cum={cum}
        scales={scales}
        clipId="t"
      />
    </svg>,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  return { ...r, q, frame, scales, day, cum };
}

const cumOf = (avg: PricePoint[]) => {
  const f = frameOf(teamDay);
  return cumReturnPointsOf(teamDay, f.view, f.plotW, avg);
};

describe('CandleReturnLayer — 당일 · 누적 · 0% 한 줄(D-13 ~ D-15)', () => {
  it('당일 · 누적 둘 다 → 누적(회색 1.5)이 당일(보라 1.75)보다 DOM 앞 · 0% 선 y = scales.zeroY · "2 3"', () => {
    const { q, scales } = renderLayer({ cum: cumOf(CUM_AVG) });
    expect(q('candle-return-layer')).toHaveLength(1);
    const dayP = q('candle-ret-day')[0]!;
    const cumP = q('candle-ret-cum')[0]!;
    expect(dayP.getAttribute('d')).toMatch(/^M/);
    expect(cumP.getAttribute('d')).toMatch(/^M/);
    expect(dayP.getAttribute('stroke')).toBe('var(--team)');
    expect(dayP.getAttribute('stroke-width')).toBe('1.75');
    expect(cumP.getAttribute('stroke')).toBe('var(--muted-fg)');
    expect(cumP.getAttribute('stroke-width')).toBe('1.5');
    expect(cumP.compareDocumentPosition(dayP) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const zero = q('candle-ret-zero');
    expect(zero).toHaveLength(1);
    expect(Number(zero[0]!.getAttribute('y1'))).toBe(scales.zeroY);
    expect(Number(zero[0]!.getAttribute('y2'))).toBe(scales.zeroY);
    expect(zero[0]!.getAttribute('stroke')).toBe('var(--faint)');
    expect(zero[0]!.getAttribute('stroke-dasharray')).toBe('2 3');
    // 두 y 함수가 0% 를 같은 높이에 둔다
    expect(scales.yDay(0)).toBeCloseTo(scales.zeroY, 9);
    expect(scales.yCum!(0)).toBeCloseTo(scales.zeroY, 9);
  });

  it('누적 점에 null 이 끼면 누적 경로가 끊긴다(M 둘 이상)', () => {
    const cum = cumOf(CUM_AVG_GAP);
    expect(cum.some((p) => p.v === null)).toBe(true);
    const { q } = renderLayer({ cum });
    const d = q('candle-ret-cum')[0]!.getAttribute('d')!;
    expect(d.match(/M/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CandleReturnLayer — 눈금 글자(UI-SPEC S6)', () => {
  it('오른쪽 = fmtReturnTick(dayTop · dayBottom) · x = xr + 4 · y = yRa + 9 · yRb − 1 · 보라', () => {
    const { q, frame, scales } = renderLayer({});
    const axis = q('candle-ret-day-axis');
    expect(axis).toHaveLength(1);
    expect(axis[0]!.getAttribute('fill')).toBe('var(--team)');
    const texts = Array.from(axis[0]!.querySelectorAll('text'));
    expect(texts.map((t) => t.textContent)).toEqual([fmtReturnTick(scales.dayTop), fmtReturnTick(scales.dayBottom)]);
    for (const t of texts) expect(Number(t.getAttribute('x'))).toBe(frame.xr + 4);
    expect(Number(texts[0]!.getAttribute('y'))).toBe(frame.P.yRa + 9);
    expect(Number(texts[1]!.getAttribute('y'))).toBe(frame.P.yRb - 1);
  });

  it('누적 있음 → 왼쪽 = fmtReturnTick(cumTop · cumBottom) · x = L − 4 끝 정렬 · 회색', () => {
    const { q, frame, scales } = renderLayer({ cum: cumOf(CUM_AVG) });
    const axis = q('candle-ret-cum-axis');
    expect(axis).toHaveLength(1);
    expect(axis[0]!.getAttribute('fill')).toBe('var(--muted-fg)');
    const texts = Array.from(axis[0]!.querySelectorAll('text'));
    expect(texts.map((t) => t.textContent)).toEqual([fmtReturnTick(scales.cumTop!), fmtReturnTick(scales.cumBottom!)]);
    for (const t of texts) {
      expect(Number(t.getAttribute('x'))).toBe(frame.L - 4);
      expect(t.getAttribute('text-anchor')).toBe('end');
    }
    expect(Number(texts[0]!.getAttribute('y'))).toBe(frame.P.yRa + 9);
    expect(Number(texts[1]!.getAttribute('y'))).toBe(frame.P.yRb - 1);
  });

  it('누적 없음(키 없음) → 왼쪽 눈금 · 누적 선 없음 · 당일 선 · 오른쪽 눈금은 그대로', () => {
    const { q } = renderLayer({ cum: [] });
    expect(q('candle-ret-cum-axis')).toHaveLength(0);
    expect(q('candle-ret-cum')).toHaveLength(0);
    expect(q('candle-ret-day')).toHaveLength(1);
    expect(q('candle-ret-day-axis')).toHaveLength(1);
  });
});

describe('CandleReturnLayer — 판 제목(D-17 · 데스크톱만)', () => {
  it('데스크톱 + 누적 → 「팀 당일 수익률(오른쪽 눈금) · 누적 수익률(미실현 · 왼쪽 눈금)」 · y = 판 위 + 10', () => {
    const { q, frame } = renderLayer({ cum: cumOf(CUM_AVG) });
    const title = q('candle-ret-title');
    expect(title).toHaveLength(1);
    expect(title[0]!.textContent).toBe('팀 당일 수익률(오른쪽 눈금) · 누적 수익률(미실현 · 왼쪽 눈금)');
    expect(Number(title[0]!.getAttribute('y'))).toBe(frame.P.yRa + 10);
    expect(Number(title[0]!.getAttribute('x'))).toBe(frame.L + 4);
  });

  it('데스크톱 · 누적 없음 → 「팀 당일 수익률(오른쪽 눈금)」 · 폰 → 제목 없음', () => {
    expect(renderLayer({}).q('candle-ret-title')[0]!.textContent).toBe('팀 당일 수익률(오른쪽 눈금)');
    expect(renderLayer({ phone: true, cum: cumOf(CUM_AVG) }).q('candle-ret-title')).toHaveLength(0);
  });
});

describe('CandleReturnLayer — 빈 상태(UI E7 S6 · empty)', () => {
  it('팀 체결 없음 · 누적 [] → 「팀 체결 없음」 + 0% 선 · 당일 선 · 눈금 없음', () => {
    const { q, frame } = renderLayer({ session: noTeamDay });
    const empty = q('candle-ret-empty');
    expect(empty).toHaveLength(1);
    expect(empty[0]!.textContent).toBe('팀 체결 없음');
    expect(Number(empty[0]!.getAttribute('x'))).toBe((frame.L + frame.xr) / 2);
    expect(Number(empty[0]!.getAttribute('y'))).toBe((frame.P.yRa + frame.P.yRb) / 2 + 4);
    expect(q('candle-ret-zero')).toHaveLength(1);
    expect(q('candle-ret-day')).toHaveLength(0);
    expect(q('candle-ret-day-axis')).toHaveLength(0);
    expect(q('candle-ret-cum-axis')).toHaveLength(0);
  });

  it('팀이 그날 체결했는데 창 안이 팀 첫 매수 전(당일 값 전부 null) · 누적 [] → 「팀 체결 없음」 없이 빈 판(0% 선만 · WR-02)', () => {
    const day: ReturnPoint[] = [
      { t: T13 - 5, v: null, rec: 0 },
      { t: T13 - 1, v: null, rec: 1 },
    ];
    expect(teamDay.team.fills.length).toBeGreaterThan(0);
    const { q } = renderLayer({ day });
    expect(q('candle-ret-empty')).toHaveLength(0);
    expect(q('candle-ret-zero')).toHaveLength(1);
    expect(q('candle-ret-day')).toHaveLength(0);
    expect(q('candle-ret-day-axis')).toHaveLength(0);
  });

  it('당일 값이 없어도 누적이 있으면 「팀 체결 없음」 을 쓰지 않는다(누적 선 · 왼쪽 눈금은 그린다)', () => {
    const { q } = renderLayer({ session: noTeamDay, cum: cumOf(CUM_AVG) });
    expect(q('candle-ret-empty')).toHaveLength(0);
    expect(q('candle-ret-cum')).toHaveLength(1);
    expect(q('candle-ret-cum-axis')).toHaveLength(1);
    expect(q('candle-ret-day-axis')).toHaveLength(0);
  });
});
