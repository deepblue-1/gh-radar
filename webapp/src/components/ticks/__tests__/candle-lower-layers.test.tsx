import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { TickOpenResponse } from '@gh-radar/shared';

import type { View } from '@/lib/accum-chart';
import { CANDLE_CHART, candlePanelsOf, type CandleFrame } from '@/lib/ticks/candle-chart';
import {
  TICK_CHART,
  dayNetRangeOf,
  lastRecvMsOf,
  teamDayStairsOf,
  tickBoundsOf,
  turnoverPathsOf,
  turnoverSeriesOf,
  xOfTick,
  yOfNet,
} from '@/lib/ticks/tick-chart';
import type { TickSession } from '@/lib/ticks/tick-session';
import { SYNTH_DATE, a3Msg, b6Msg, synthSession } from '@/test-fixtures/tick-synth';

import { CandleLowerLayers } from '../candle-lower-layers';

/**
 * Phase 42 Plan 05 Task 2 — 봉 차트 아래 세 판 층(D-07 · D-19 · UI-SPEC S7).
 *
 * 깨지면: 봉 차트의 순매수 · 10분 · 누적 거래대금 판이 선 차트와 다른 값 · 다른 높이로 그려진다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const W = 640;
const L = 56;

/** 팀 매수 SMP 3조각(984만) · 일반 1조각 · 팀 매도 0/0 단독(652만) — tick-chart.test 와 같은 하루. */
const krx = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
  [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
  [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
  [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
  [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
  [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
]);

/** 팀 체결 없는 하루(일반 체결 하나). */
const none = synthSession([[1, a3Msg({ seq: 300, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000001000' })]]);

const posNet = (): TickOpenResponse['accum'] => ({
  reg_time_ms: B.T0900,
  pos_net: { t_ms: [B.T0900 + 60_000, B.T0900 + 3_600_000], net_krw: [1_240_000_000, 1_300_000_000], cycle: [1, 1] },
});

const DAY: View = { t0: B.T0, t1: B.T2000 };

function frameOf(session: TickSession, phone = false, view: View = DAY): CandleFrame {
  const P = candlePanelsOf(phone ? CANDLE_CHART.phone : CANDLE_CHART.desktop);
  const xr = W - TICK_CHART.R;
  return {
    W,
    P,
    L,
    xr,
    plotW: xr - L,
    phone,
    view,
    x: xOfTick(view, L, xr),
    bounds: B,
    endMs: lastRecvMsOf(session) ?? B.T2000,
  };
}

function renderLayers(
  opts: {
    session?: TickSession;
    accum?: TickOpenResponse['accum'];
    isToday?: boolean;
    listingShares?: number | null;
    phone?: boolean;
  } = {},
) {
  const session = opts.session ?? krx;
  const frame = frameOf(session, opts.phone ?? false);
  const r = render(
    <svg>
      <CandleLowerLayers
        frame={frame}
        session={session}
        accum={opts.accum}
        isToday={opts.isToday ?? false}
        listingShares={opts.listingShares ?? null}
        tv={turnoverPathsOf(turnoverSeriesOf(session), frame.view, frame.x, frame.P, frame.plotW, frame.endMs)}
        clipId="t"
      />
    </svg>,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  return { ...r, q, frame, session };
}

describe('CandleLowerLayers — 순매수 판(선 차트 같은 함수 · 새 판 y)', () => {
  it('팀 체결 있음 → 당일 · 매수 · 거울 매도 경로 · 0선이 CandlePanels 순매수 판(데스크톱 231 ~ 301) 안', () => {
    const { q, frame } = renderLayers();
    expect(q('candle-lower-layers')).toHaveLength(1);
    expect(frame.P.y2a).toBe(231);
    expect(frame.P.y2b).toBe(301);
    for (const slot of ['candle-day-path', 'candle-day-buy-path', 'candle-day-sell-path']) {
      expect(q(slot)).toHaveLength(1);
      expect(q(slot)[0]!.getAttribute('d')).not.toBe('');
    }
    const zero = q('candle-net-zero')[0]!;
    const zy = Number(zero.getAttribute('y1'));
    expect(zy).toBeGreaterThanOrEqual(frame.P.y2a);
    expect(zy).toBeLessThanOrEqual(frame.P.y2b);
    expect(zero.getAttribute('stroke-dasharray')).toBe('2 3');
  });

  it('당일 보라 경로 = teamDayStairsOf(team, x, yOfNet(dayNetRangeOf, CandlePanels)) 그대로 · 매수 → 보라 순(보라가 맨 위)', () => {
    const { q, frame } = renderLayers();
    const yN = yOfNet(dayNetRangeOf(krx.team), frame.P);
    const want = teamDayStairsOf(krx.team, frame.x, yN, B.T0, frame.endMs);
    const dayP = q('candle-day-path')[0]!;
    expect(dayP.getAttribute('d')).toBe(want);
    expect(dayP.getAttribute('stroke')).toBe('var(--team)');
    expect(dayP.getAttribute('stroke-width')).toBe('1.75');
    expect(Number(q('candle-net-zero')[0]!.getAttribute('y1'))).toBe(yN(0));
    const buyP = q('candle-day-buy-path')[0]!;
    expect(buyP.compareDocumentPosition(dayP) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('과거 날짜 + pos_net → 회색 누적 계단 · 왼쪽 회색 축(13.0억 · 0) · 누적이 매수 선보다 아래(DOM 앞)', () => {
    const { q } = renderLayers({ accum: posNet() });
    const cumP = q('candle-cum-path');
    expect(cumP).toHaveLength(1);
    expect(cumP[0]!.compareDocumentPosition(q('candle-day-buy-path')[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const axis = q('candle-cum-axis')[0]!;
    expect(axis.textContent).toContain('13.0억');
    expect(axis.textContent).toContain('0');
  });

  it('당일 화면(isToday) · accum null → 누적 계단 · 회색 축 없음(37 D-09)', () => {
    const today = renderLayers({ accum: posNet(), isToday: true });
    expect(today.q('candle-cum-path')).toHaveLength(0);
    expect(today.q('candle-cum-axis')).toHaveLength(0);
    const noAccum = renderLayers({ accum: null });
    expect(noAccum.q('candle-cum-path')).toHaveLength(0);
    expect(noAccum.q('candle-cum-axis')).toHaveLength(0);
    expect(noAccum.q('candle-day-path')).toHaveLength(1);
  });
});

describe('CandleLowerLayers — 10분 · 누적 거래대금 판', () => {
  it('10분 막대 ≥ 1 · 막대가 CandlePanels 10분 판 안 · 오른쪽 위 글자 = 하루 최대', () => {
    const { q, frame } = renderLayers();
    const bars = q('candle-bucket');
    expect(bars.length).toBeGreaterThanOrEqual(1);
    for (const rect of Array.from(bars[0]!.querySelectorAll('rect'))) {
      const y = Number(rect.getAttribute('y'));
      const h = Number(rect.getAttribute('height'));
      expect(y).toBeGreaterThanOrEqual(frame.P.y3a);
      expect(y + h).toBeCloseTo(frame.P.y3b, 6);
    }
    expect(q('candle-bucket-max')[0]!.textContent).toBe('984만');
  });

  it('누적 거래대금 영역 · 팀 비중 선 · 축 글자가 선 차트와 같다(상장주식수 없음 → 금액 축)', () => {
    const { q } = renderLayers();
    expect(q('candle-turnover-area')).toHaveLength(1);
    expect(q('candle-team-share-path')).toHaveLength(1);
    expect(q('candle-turnover-axis')[0]!.textContent).toBe('1,718만0');
    expect(q('candle-share-axis')[0]!.textContent).toBe('100%0%');
  });

  it('상장주식수 있음 → 누적 판 왼쪽 축이 시총 대비 %(선 차트와 같은 글자)', () => {
    const { q } = renderLayers({ listingShares: 1_000_000 });
    const cap = krx.basePx! * 1_000_000;
    const pct = `${(Math.round((17_177_500 / cap) * 1000) / 10).toFixed(1)}%`;
    expect(q('candle-turnover-axis')[0]!.textContent).toBe(`${pct}0.0%`);
  });
});

describe('CandleLowerLayers — 빈 상태 · 판 제목', () => {
  it('팀 체결 없음 → 순매수 · 10분 판 가운데 「팀 체결 없음」 두 개 · 0선 · 당일 선 · 막대 없음', () => {
    const { q, frame } = renderLayers({ session: none });
    const empty = q('candle-lower-empty');
    expect(empty).toHaveLength(1);
    const texts = Array.from(empty[0]!.querySelectorAll('text'));
    expect(texts.map((t) => t.textContent)).toEqual(['팀 체결 없음', '팀 체결 없음']);
    expect(Number(texts[0]!.getAttribute('y'))).toBe((frame.P.y2a + frame.P.y2b) / 2 + 4);
    expect(Number(texts[1]!.getAttribute('y'))).toBe((frame.P.y3a + frame.P.y3b) / 2 + 4);
    expect(q('candle-net-zero')).toHaveLength(0);
    expect(q('candle-day-path')).toHaveLength(0);
    expect(q('candle-day-buy-path')).toHaveLength(0);
    expect(q('candle-bucket')).toHaveLength(0);
    expect(q('candle-day-axis')).toHaveLength(0);
  });

  it('데스크톱 판 제목 = 선 차트 ②③④ 제목 글자 · 누적 · 시총 있으면 덧붙임 · 폰 → 없음', () => {
    const plain = renderLayers().q('candle-lower-title');
    expect(plain).toHaveLength(1);
    const titles = Array.from(plain[0]!.querySelectorAll(':scope > text')).map((t) => t.textContent);
    expect(titles).toEqual([
      '당일 팀 순매수 · 매수 · 매도(0선 아래) 누적 · 오른쪽 축',
      '10분 팀 매수 / 매도',
      '누적 거래대금 · 누적 팀 비중(오른쪽 축)',
    ]);
    const rich = renderLayers({ accum: posNet(), listingShares: 1_000_000 }).q('candle-lower-title')[0]!;
    expect(rich.textContent).toContain('· 누적(이월 포함 · 왼쪽 회색 축)');
    expect(rich.textContent).toContain('누적 거래대금(왼쪽 축 = 시총 대비)');
    expect(renderLayers({ phone: true }).q('candle-lower-title')).toHaveLength(0);
  });

  it('폰 치수 → 순매수 0선이 폰 순매수 판(50) 안', () => {
    const { q, frame } = renderLayers({ phone: true });
    expect(frame.P.y2b - frame.P.y2a).toBe(50);
    const zy = Number(q('candle-net-zero')[0]!.getAttribute('y1'));
    expect(zy).toBeGreaterThanOrEqual(frame.P.y2a);
    expect(zy).toBeLessThanOrEqual(frame.P.y2b);
  });
});
