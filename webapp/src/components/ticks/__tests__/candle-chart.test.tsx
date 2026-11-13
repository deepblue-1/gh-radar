import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

import {
  a3TimeMs,
  type TickOpenResponse,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnResponse,
} from '@gh-radar/shared';

/** 일 이동평균 앞 거래일 종가(브라우저 Supabase) — 요청 횟수 · 인자만 본다(42-10). */
const prevApi = vi.hoisted(() => ({ fetchPrevCloses: vi.fn() }));
vi.mock('@/lib/ticks/daily-closes', () => prevApi);

import { CANDLE_CHART, autoUnitOf, candlePanelsOf, candleUnitLabelOf } from '@/lib/ticks/candle-chart';
import {
  TICK_CANDLE_MA_KEY,
  TICK_CANDLE_UNIT_KEY,
  readMaConfig,
  toggleMaLine,
  writeMaConfig,
} from '@/lib/ticks/candle-prefs';
import { buildOwnModel, type OwnModel } from '@/lib/ticks/own-model';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { TOUCH_HOLD_MS } from '@/lib/touch-inspect';
import { SYNTH_DATE, SYNTH_ISIN, a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import { CandleChart } from '../candle-chart';
import { TickTeamPanel } from '../tick-team-panel';

/**
 * Phase 42 Plan 09 — 봉 차트 조작 · 겹침(D-19 · SC-6 · SC-4).
 *
 * 깨지면: 봉 차트에서 확대 · 클릭 점프 · Shift+끌기 구간 합계가 선 차트와 다르게 동작한다.
 *
 * 하루는 선 차트 테스트(`tick-chart.test.tsx`)와 같다 — 팀 매수 SMP 3조각(984만) · 일반 1조각 · 팀 매도 단독(652만).
 * 체결은 13:00:00.000 ~ 13:00:00.005 라 1분봉 하나(시 16,400 · 종 16,300)다.
 */

const B = tickBoundsOf(SYNTH_DATE);
const PD = candlePanelsOf(CANDLE_CHART.desktop);

// 봉 단위 · 이동평균 기억(gh-radar:tick-candle-*)이 테스트 사이로 새지 않게(42-10)
beforeEach(() => {
  window.localStorage.clear();
  prevApi.fetchPrevCloses.mockReset();
});

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

const recOfSeq = (s: typeof krx, seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};

type Props = Parameters<typeof CandleChart>[0];

function renderChart(props: Partial<Props> = {}) {
  const onSeekMs = vi.fn();
  const onJumpRec = vi.fn();
  const r = render(
    <CandleChart session={krx} cursorRec={recOfSeq(krx, 103)} onSeekMs={onSeekMs} onJumpRec={onJumpRec} {...props} />,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  const svg = q('candle-chart-svg')[0] as SVGSVGElement;
  const h = Number(svg.getAttribute('height'));
  // svg 상자 = viewBox 1:1(폭 640 · 높이 = 판 높이) — client 좌표 = viewBox 좌표
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 640, bottom: h, width: 640, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { ...r, q, svg, onSeekMs, onJumpRec };
}

/** 하루 전체 창(08:00 ~ 20:00 · L 52 · 그림 끝 588)에서 13:00 의 x — 체결 봉 자리. */
const X1300 = 52 + (5 / 12) * (588 - 52);

/** 팀 원(side) 중심(viewBox = client). */
const circleOf = (q: (slot: string) => NodeListOf<Element>, side: 'B' | 'S') => {
  const el = Array.from(q('candle-order-circle')).find((c) => c.getAttribute('data-side') === side)!;
  return { el, cx: Number(el.getAttribute('cx')), cy: Number(el.getAttribute('cy')) };
};

describe('조작 — 클릭 · 확대 · 키 · 커서', () => {
  it('빈 곳 클릭 → 그 x 의 시각(onSeekMs) · 40px 끌고 클릭은 클릭이 아니다', () => {
    const { svg, onSeekMs } = renderChart();
    // L = 52 · 그림 끝 = 640 − 52 = 588 · 하루 전체 창 → 가운데 320 = 14:00
    fireEvent.click(svg, { clientX: 320, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
    expect(onSeekMs.mock.calls[0]![0]).toBeCloseTo(B.T0 + 6 * 3_600_000, -2);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 50 });
    fireEvent.click(svg, { clientX: 140, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('「10초」 · 「1분」 버튼 → 커서 중심 창 · 래퍼 「0」 키 = 하루 전체 · ← → 는 가로채지 않는다', async () => {
    const { getByRole, q } = renderChart();
    const span = () => q('candle-chart-span')[0]!.textContent;
    expect(span()).toBe('하루 전체');
    fireEvent.click(getByRole('button', { name: '10초' }));
    await waitFor(() => expect(span()).toBe('10초'));
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    const wrap = q('candle-chart-wrap')[0]!;
    fireEvent.keyDown(wrap, { key: '0' });
    await waitFor(() => expect(span()).toBe('하루 전체'));
    expect(fireEvent.keyDown(wrap, { key: 'ArrowRight' })).toBe(true);
    // 확대 버튼은 래퍼 밖(제목 줄 — Pitfall 12)
    expect(wrap.contains(getByRole('button', { name: '확대' }))).toBe(false);
    expect(getByRole('button', { name: '축소' })).toBeDefined();
    expect(getByRole('button', { name: '전체' })).toBeDefined();
  });

  it('「확대」 · 「축소」 버튼 → 창 폭이 반 · 두 배', async () => {
    const { getByRole, q } = renderChart();
    const span = () => q('candle-chart-span')[0]!.textContent;
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    fireEvent.click(getByRole('button', { name: '확대' }));
    await waitFor(() => expect(span()).toBe('30초'));
    fireEvent.click(getByRole('button', { name: '축소' }));
    await waitFor(() => expect(span()).toBe('1분'));
  });

  it('커서 선 · 아래 시각 라벨 — 커서 rec 의 수신 시각', () => {
    const { q } = renderChart();
    expect(q('candle-chart-cursor')).toHaveLength(1);
    expect(q('candle-chart-cursor-label')[0]?.textContent).toBe('13:00:00');
  });

  it('커서가 창 밖으로 나가면 창이 커서를 따라간다(창 폭 그대로)', async () => {
    const far = synthSession([
      [0, a3Msg({ seq: 1, bs: '2', px: 16400, qty: 100, time: '130000000000' })],
      [2 * 3_600_000, a3Msg({ seq: 2, bs: '2', px: 16450, qty: 100, time: '150000000000' })],
    ]);
    const onSeekMs = vi.fn();
    const onJumpRec = vi.fn();
    const r = render(<CandleChart session={far} cursorRec={0} onSeekMs={onSeekMs} onJumpRec={onJumpRec} />);
    const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
    fireEvent.click(r.getByRole('button', { name: '10초' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('10초'));
    expect(q('candle-chart-cursor')).toHaveLength(1);
    r.rerender(<CandleChart session={far} cursorRec={1} onSeekMs={onSeekMs} onJumpRec={onJumpRec} />);
    await waitFor(() => expect(q('candle-chart-cursor-label')[0]?.textContent).toBe('15:00:00'));
    await waitFor(() => expect(q('candle-chart-cursor')).toHaveLength(1));
    expect(q('candle-chart-span')[0]!.textContent).toBe('10초');
  });

  it('마우스 세로선 · 값 점 — 호버 동안만 · 가격 판 점 = 그 봉 종가 y', () => {
    const { q, svg } = renderChart();
    // 1px ≈ 80초 — 13:00 봉 칸(1분) 안쪽(≈ 13:00:24)
    const cx = X1300 + 0.3;
    expect(q('candle-chart-hover-line')).toHaveLength(0);
    // 순매수 판 높이(원 묶음 상자 없이) · 13:00 봉 x
    fireEvent.pointerMove(svg, { clientX: cx, clientY: (PD.y2a + PD.y2b) / 2, pointerType: 'mouse' });
    expect(q('candle-chart-hover-line')).toHaveLength(1);
    const dots = Array.from(q('candle-chart-hover-dot'));
    // 가격(종가) · 수익률 판 당일(42-10) · 매수 · 거울 매도 · 순 · 팀 비중
    expect(dots).toHaveLength(6);
    const px = dots.find((d) => d.getAttribute('fill') === 'var(--fg-2)')!;
    // 창 안 최저 = 종가 16,300 — 가격 축 최저 글자 y − 4 와 같다
    const axis = Array.from(q('candle-px-axis')[0]!.querySelectorAll('text'));
    expect(axis[1]!.textContent).toBe('16,300');
    expect(Number(px.getAttribute('cy'))).toBeCloseTo(Number(axis[1]!.getAttribute('y')) - 4, 6);
    expect(dots.map((d) => d.getAttribute('fill'))).toEqual(
      expect.arrayContaining(['var(--up)', 'var(--down)', 'var(--team)']),
    );
    fireEvent.pointerLeave(svg);
    expect(q('candle-chart-hover-line')).toHaveLength(0);
    expect(q('candle-chart-hover-dot')).toHaveLength(0);
  });
});

/**
 * 스케치 028 ③ — Shift+끌기 구간 합계(선 차트와 같은 결과 줄 `TickChartRange`).
 * 깨지면: 그냥 끌기가 구간을 만들어 창 이동이 막히거나, Shift+끌기 동안 창이 움직이거나, 구간을 지우는 클릭이 커서를 옮긴다.
 */
describe('조작 — Shift+끌기 구간 합계', () => {
  const setup = (props: Partial<Props> = {}) => {
    const r = renderChart(props);
    const cx = X1300;
    const drag = (x0: number, x1: number, shiftKey = true) => {
      fireEvent.pointerDown(r.svg, { shiftKey, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x0, clientY: 50 });
      fireEvent.pointerMove(r.svg, { shiftKey, pointerType: 'mouse', pointerId: 1, clientX: (x0 + x1) / 2, clientY: 50 });
      fireEvent.pointerMove(r.svg, { shiftKey, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
      fireEvent.pointerUp(r.svg, { shiftKey, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
      // 브라우저는 끌기 뒤에도 click 을 낸다 — 끌기 문턱이 걸러야 한다
      fireEvent.click(r.svg, { shiftKey, clientX: x1, clientY: 50 });
    };
    return { ...r, cx, drag };
  };

  it('Shift 누른 채 끌고 떼면 차트 아래 결과 줄 · 범위 띠 · 순 알약(수익률 판 위) · 시각 이동 없음', () => {
    const { q, cx, drag, onSeekMs } = setup();
    expect(q('tick-chart-range')).toHaveLength(0);
    drag(cx - 20, cx + 20);
    const rng = q('tick-chart-range')[0]!;
    expect(rng).toBeDefined();
    const txt = rng.textContent ?? '';
    expect(txt).toContain('팀 매수984만1건');
    expect(txt).toContain('팀 매도652만1건');
    expect(txt).toContain('팀 순매수+332만');
    expect(q('candle-range-band')).toHaveLength(1);
    const pill = q('candle-range-pill')[0]!;
    expect(pill.textContent).toBe('순 +332만');
    expect(Number(pill.querySelector('rect')!.getAttribute('y'))).toBeLessThan(PD.yRa);
    expect(onSeekMs).not.toHaveBeenCalled();
    const wrap = q('candle-chart-wrap')[0]!;
    expect(wrap.compareDocumentPosition(rng) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrap.contains(rng)).toBe(false);
  });

  it('그냥 끌기(Shift 없음)는 구간을 만들지 않는다', () => {
    const { q, cx, drag } = setup();
    drag(cx - 20, cx + 20, false);
    expect(q('tick-chart-range')).toHaveLength(0);
    expect(q('candle-range-band')).toHaveLength(0);
  });

  it('✕ · Esc · 빈 곳 클릭으로 지운다 — 지우는 클릭은 시각 이동이 아니고 그다음 클릭은 이동', () => {
    const { q, cx, drag, svg, getByRole, onSeekMs } = setup();
    drag(cx - 20, cx + 20);
    fireEvent.click(getByRole('button', { name: '✕ 지우기 (Esc)' }));
    expect(q('tick-chart-range')).toHaveLength(0);

    drag(cx - 20, cx + 20);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(q('tick-chart-range')).toHaveLength(0);

    drag(cx - 20, cx + 20);
    fireEvent.click(svg, { clientX: 400, clientY: 50 });
    expect(q('tick-chart-range')).toHaveLength(0);
    expect(onSeekMs).not.toHaveBeenCalled();
    fireEvent.click(svg, { clientX: 400, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('「1분」 창에서 Shift+끌기 — 창이 움직이지 않는다(커서 x 그대로)', async () => {
    const { q, getByRole, drag } = setup();
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('1분'));
    const x1 = q('candle-chart-cursor')[0]!.getAttribute('x1');
    drag(200, 400);
    await new Promise((r) => setTimeout(r, 50));
    expect(q('candle-chart-cursor')[0]!.getAttribute('x1')).toBe(x1);
    expect(q('tick-chart-range')).toHaveLength(1);
  });

  it('폰(height 303) — Shift+끌기는 구간을 만들지 않고 안내 줄도 없다 · 데스크톱은 안내 줄', () => {
    const desk = setup();
    expect(desk.q('candle-chart-hint')).toHaveLength(1);
    expect(desk.q('candle-chart-hint')[0]!.textContent).toContain('Shift+끌기 구간 합계');
    desk.unmount();
    const ph = setup({ height: 303 });
    expect(ph.q('candle-chart-svg')[0]!.getAttribute('height')).toBe('303');
    ph.drag(ph.cx - 20, ph.cx + 20);
    expect(ph.q('tick-chart-range')).toHaveLength(0);
    expect(ph.q('candle-chart-hint')).toHaveLength(0);
  });
});

/**
 * Phase 38 D-08 · D-10 · 42 SC-4 — 팀 원 · 우리 점이 봉과 같은 시간축 · 봉 영역 y 에 겹친다(가격 판 overlay 자리).
 * 깨지면: 봉 차트에서 팀 주문 원 · 우리 체결 ◆ · 근거 ○ 가 안 보이거나 봉과 다른 y 에 뜨거나, 원을 눌러도 그 주문으로 가지 않는다.
 */
const ownFill = (orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill => ({
  gateway: 'KB120',
  seq,
  gw_time_ms: gwMs,
  account_no: '1234563801',
  order_no: orderNo,
  side: 'B',
  exec_price: px,
  exec_qty: qty,
});
const ownEvent = (orderNo: string, gwMs: number, over: Partial<TickOwnEvent>): TickOwnEvent => ({
  gateway: 'KB120',
  seq: 1,
  gw_time_ms: gwMs,
  kind: 3,
  group: 1,
  account_no: '1234563801',
  order_no: orderNo,
  price: 16450,
  qty: 10,
  reason_code: '',
  cond_metric: 0,
  cond_threshold: 0,
  cond_actual: 0,
  ev_kind: 0,
  ev_price: 0,
  ev_qty_before: 0,
  ev_qty_after: 0,
  ev_trade_qty: 0,
  cum_volume: 0,
  ...over,
});
const synthAt = (ms: number) => Number(synthNs(ms) / 1_000_000n);
/** 선 차트 테스트와 같은 우리 하루 — 매도 체결 16,350 ×50(seq 105 짝 ◆) · 짝 없음(◇) · 호가 근거 seq 100(○ · 16,400). */
const krxOwn: OwnModel = buildOwnModel(krx, {
  access: true,
  date: SYNTH_DATE,
  exchange: 'KRX',
  isin: SYNTH_ISIN,
  servers: ['KB120'],
  events: [ownEvent('EV', synthAt(0.5), { ev_kind: 1, ev_price: 16400, ev_qty_after: 283 })],
  fills: [ownFill('F1', a3TimeMs(krx.index, krx.a3, 3) + 5, 16350, 50, 1), ownFill('N1', synthAt(3), 99_999, 1, 2)],
  orders: [],
} satisfies TickOwnResponse);

const renderOwn = (own: OwnModel | null = krxOwn) => {
  const onOwnJump = vi.fn();
  const onOwnFillLine = vi.fn();
  const r = renderChart({ own, onOwnJump, onOwnFillLine });
  return { ...r, onOwnJump, onOwnFillLine };
};

describe('겹침 — 팀 원 · 우리 점(가격 판 overlay)', () => {
  it('팀 주문 ≥ 500만 2개(매수 · 매도) · 봉 영역 y · 가격 판 overlay 안 · 커서가 든 주문은 --fg 고리', () => {
    const { q } = renderChart();
    const circles = Array.from(q('candle-order-circle'));
    expect(circles).toHaveLength(2);
    expect(circles.map((c) => c.getAttribute('data-side')).sort()).toEqual(['B', 'S']);
    for (const c of circles) {
      const cy = Number(c.getAttribute('cy'));
      expect(cy).toBeGreaterThanOrEqual(PD.y1a);
      expect(cy).toBeLessThanOrEqual(PD.yCb);
      expect(c.closest('[data-slot="candle-price-overlay"]')).not.toBeNull();
    }
    expect(circleOf(q, 'B').el.getAttribute('stroke')).toBe('var(--fg)');
    expect(circleOf(q, 'S').el.getAttribute('stroke')).toBe('var(--down)');
    // 선 차트 slot 은 쓰지 않는다
    expect(q('tick-order-circle')).toHaveLength(0);
  });

  it('원 위 마우스 → 원 옆 상자 = 묶음 표 · 고리 · 씨앗 · 떠나면 둘 다 없음', () => {
    const { q, svg } = renderChart();
    const { cx, cy } = circleOf(q, 'B');
    fireEvent.pointerMove(svg, { clientX: cx, clientY: cy, pointerType: 'mouse' });
    const tip = q('candle-chart-tip')[0]!;
    expect(tip).toBeDefined();
    const grp = tip.querySelector('[data-slot="tick-chart-group"]')!;
    expect(grp.textContent).toContain('팀 주문 묶음 2건');
    expect(grp.querySelectorAll('[data-slot="tick-chart-group-row"]')).toHaveLength(2);
    expect(q('candle-order-seed')).toHaveLength(1);
    expect(q('candle-order-hover')).toHaveLength(1);
    expect(q('candle-chart-own-line')).toHaveLength(0);
    fireEvent.pointerLeave(svg);
    expect(q('candle-chart-tip')).toHaveLength(0);
    expect(q('candle-order-seed')).toHaveLength(0);
    expect(q('candle-order-hover')).toHaveLength(0);
  });

  it('own 이 있으면 overlay 안에 ◆(채움 --mine) · ◇ · ○ · 팀 원 위에 · own 없으면 없음', () => {
    const { q } = renderOwn();
    const dia = Array.from(q('tick-own-mark'));
    expect(dia.map((d) => d.getAttribute('data-kind')).sort()).toEqual(['fill', 'nofill']);
    const fill = dia.find((d) => d.getAttribute('data-kind') === 'fill')!;
    expect(fill.getAttribute('fill')).toBe('var(--mine)');
    expect(fill.closest('[data-slot="candle-price-overlay"]')).not.toBeNull();
    const ev = q('candle-own-ev-mark');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.getAttribute('stroke')).toBe('var(--mine)');
    expect(ev[0]!.closest('[data-slot="candle-price-overlay"]')).not.toBeNull();
    const kids = Array.from(q('candle-price-overlay')[0]!.children);
    expect(kids.indexOf(fill)).toBeGreaterThan(kids.indexOf(q('candle-order-circle')[0]!));
    const none = renderChart({ own: null });
    expect(none.q('tick-own-mark')).toHaveLength(0);
    expect(none.q('candle-own-ev-mark')).toHaveLength(0);
  });

  it('마우스가 ◆ 위 → 팀 묶음 표 아래에 우리 줄(근거 ○ → ◆ 순)', () => {
    const { q, svg } = renderOwn();
    const { cx, cy } = circleOf(q, 'B');
    fireEvent.pointerMove(svg, { clientX: cx, clientY: cy, pointerType: 'mouse' });
    const grp = q('candle-chart-tip')[0]!.querySelector('[data-slot="tick-chart-group"]')!;
    expect(grp.textContent).toContain('팀 주문 묶음 2건');
    const own = Array.from(q('candle-chart-own-line'));
    expect(own.map((d) => d.textContent)).toEqual(['조건 근거 호가 · 주문 #EV', '우리 체결 50주 · 계좌 ···3801 · 주문 #F1']);
    expect(grp.compareDocumentPosition(own[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('겹침 — 원 · 우리 점 클릭', () => {
  it('원 클릭 → 그 주문 마지막 조각 rec(onJumpRec) · 시각 점프 없음', () => {
    const { q, onJumpRec, onSeekMs } = renderChart();
    fireEvent.click(circleOf(q, 'S').el);
    expect(onJumpRec).toHaveBeenCalledWith(recOfSeq(krx, 107));
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('◆ 클릭 → onOwnJump(그 A3 rec) · 팀 원 · 시각 점프 없음', () => {
    const { q, onOwnJump, onJumpRec, onSeekMs } = renderOwn();
    fireEvent.click(Array.from(q('tick-own-mark')).find((d) => d.getAttribute('data-kind') === 'fill')!);
    expect(onOwnJump).toHaveBeenCalledTimes(1);
    expect(onOwnJump.mock.calls[0]).toEqual([recOfSeq(krx, 105)]);
    expect(onJumpRec).not.toHaveBeenCalled();
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('◇ 클릭 → onOwnFillLine(체결 id) · ○ 클릭 → onOwnJump(근거 rec, 주문 id)', () => {
    const { q, onOwnJump, onOwnFillLine, onSeekMs } = renderOwn();
    fireEvent.click(Array.from(q('tick-own-mark')).find((d) => d.getAttribute('data-kind') === 'nofill')!);
    expect(onOwnFillLine).toHaveBeenCalledWith(krxOwn.fills.find((f) => f.rec < 0)!.id);
    fireEvent.click(q('candle-own-ev-mark')[0]!);
    expect(onOwnJump).toHaveBeenCalledWith(recOfSeq(krx, 100), krxOwn.orders.find((o) => o.orderNo === 'EV')!.id);
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('우리 점 둘레(반지름 + 3px) 빈 곳 클릭도 우리 점이 먼저(팀 원보다) · 멀면 시각 점프', () => {
    const { q, svg, onOwnJump, onJumpRec, onSeekMs } = renderOwn();
    const ev = q('candle-own-ev-mark')[0]!;
    fireEvent.click(svg, { clientX: Number(ev.getAttribute('cx')), clientY: Number(ev.getAttribute('cy')) + 6 });
    expect(onOwnJump).toHaveBeenCalledTimes(1);
    expect(onJumpRec).not.toHaveBeenCalled();
    fireEvent.click(svg, { clientX: 100, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });
});

describe('겹침 — 폰 길게 누르기', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('원 위 길게 누르기(TOUCH_HOLD_MS) → 터치 상자 · 떼도 시각 이동 없음 · 상자 사라짐', () => {
    const { q, svg, onSeekMs, onJumpRec } = renderChart({ height: 303 });
    const { cx, cy } = circleOf(q, 'B');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const init = { pointerId: 7, pointerType: 'touch', clientX: cx, clientY: cy };
    act(() => {
      fireEvent.pointerDown(svg, init);
    });
    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
    });
    expect(q('candle-chart-tip')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = q('candle-chart-tip')[0]!;
    expect(tip).toBeDefined();
    expect(tip.getAttribute('data-touch')).toBe('1');
    expect(tip.querySelector('[data-slot="tick-chart-group"]')).not.toBeNull();
    act(() => {
      fireEvent.pointerUp(svg, init);
      fireEvent.click(svg, { clientX: cx, clientY: cy });
    });
    expect(onSeekMs).not.toHaveBeenCalled();
    expect(onJumpRec).not.toHaveBeenCalled();
    expect(q('candle-chart-tip')).toHaveLength(0);
  });
});

/**
 * Phase 42 Plan 10 — 결선(가격 판): 봉 단위 기억 · 자동(D-09 · SC-2) · 이동평균 켜진 선(D-10 · SC-3) · 일별 종가 한 번(D-11 · Q2 · Q5 · E6).
 * 깨지면: 봉 단위 · 이동평균을 골라도 판이 그대로거나, 일 이동평균이 클릭마다 다시 받거나, 받는 중에 「모자라」 안내가 잘못 뜬다.
 */
const MIN_MS = 60_000;
/** 13:00 ~ 13:29 분마다 체결 하나(1분봉 30개) — 종가 16,300 ~ 16,400 지그재그. */
const maSess = synthSession(
  Array.from({ length: 30 }, (_, i): [number, Uint8Array] => [
    i * MIN_MS + 1_000,
    a3Msg({
      seq: 200 + i,
      bs: i % 2 === 0 ? '2' : '1',
      px: 16_300 + ((i * 37) % 11) * 10,
      qty: 10,
      time: `13${String(i).padStart(2, '0')}01000000`,
    }),
  ]),
);
const DAY20 = (on: boolean) => ({ v: 1 as const, lines: [{ base: 'day' as const, n: 20, kind: 'sma' as const, on, color: 1 }] });
const PREV_OK = Array.from({ length: 239 }, () => 16_350);

function renderMa(props: Partial<Props> = {}) {
  const r = render(
    <CandleChart session={maSess} cursorRec={maSess.index.n - 1} onSeekMs={vi.fn()} onJumpRec={vi.fn()} {...props} />,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  const maKeys = () => Array.from(q('candle-ma-line')).map((e) => e.getAttribute('data-ma-key'));
  const title = () => q('candle-price-title')[0]?.textContent ?? '';
  const captions = () => Array.from(q('candle-caption-item')).map((e) => e.textContent ?? '');
  return { ...r, q, maKeys, title, captions };
}

/** 끝을 밖에서 정하는 약속(받는 중 상태를 붙잡아 둔다). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('결선 · 가격 판 — 봉 단위 · 이동평균 · 일별 종가', () => {
  it('기억 없음 · 하루 전체 → 판 제목 · svg 이름 「10분봉(자동)」 · 「1분」 → 「1분봉(자동)」', async () => {
    const { q, getByRole, svg } = renderChart();
    // 그림 폭 536(640 − L 52 − R 52) · 12시간 — 칸 4px 이상인 가장 작은 단위
    expect(candleUnitLabelOf(autoUnitOf(B.T2000 - B.T0, 536), true)).toBe('10분봉(자동)');
    const title = () => q('candle-price-title')[0]?.textContent ?? '';
    expect(title().startsWith('10분봉(자동)')).toBe(true);
    expect(svg.getAttribute('aria-label')).toContain('봉 차트 — 10분봉(자동) · 보기 창 하루 전체');
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(title().startsWith('1분봉(자동)')).toBe(true));
    expect(svg.getAttribute('aria-label')).toContain('1분봉(자동) · 보기 창 1분');
  });

  it('저장 「15」 → 「15분봉」(자동 꼬리표 없음) · 창을 바꿔도 15분봉 그대로', async () => {
    window.localStorage.setItem(TICK_CANDLE_UNIT_KEY, '15');
    const { q, getByRole, svg } = renderChart();
    const title = () => q('candle-price-title')[0]?.textContent ?? '';
    expect(title().startsWith('15분봉 ·')).toBe(true);
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('1분'));
    expect(title().startsWith('15분봉 ·')).toBe(true);
    expect(svg.getAttribute('aria-label')).toContain('15분봉 · 보기 창 1분');
  });

  it('기본 구성 → 이동평균 선 2개(칩 순서) · 「단순 5」 끄기 → 1개 · 판 제목에서 빠짐 · 켜면 돌아온다', () => {
    window.localStorage.setItem(TICK_CANDLE_UNIT_KEY, '1');
    const { maKeys, title } = renderMa();
    expect(maKeys()).toEqual(['bar:sma:5', 'bar:sma:20']);
    expect(title()).toContain('이동평균 단순 5 · 단순 20');
    act(() => writeMaConfig(toggleMaLine(readMaConfig(), 'bar:sma:5')));
    expect(maKeys()).toEqual(['bar:sma:20']);
    expect(title()).not.toContain('단순 5');
    expect(title()).toContain('단순 20');
    expect(JSON.parse(window.localStorage.getItem(TICK_CANDLE_MA_KEY)!).lines[0]).toMatchObject({ n: 5, on: false });
    act(() => writeMaConfig(toggleMaLine(readMaConfig(), 'bar:sma:5')));
    expect(maKeys()).toEqual(['bar:sma:5', 'bar:sma:20']);
  });

  it('일 칩 하나(꺼짐) + 종목 코드 → 종가 239개를 한 번 · 받는 동안 일 선 · 안내 없음 · 받은 뒤 켜면 일 선', async () => {
    window.localStorage.setItem(TICK_CANDLE_UNIT_KEY, '1');
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, JSON.stringify(DAY20(false)));
    const d = deferred<number[]>();
    prevApi.fetchPrevCloses.mockReturnValue(d.promise);
    const { maKeys, captions } = renderMa({ stockCode: '005930' });
    expect(prevApi.fetchPrevCloses).toHaveBeenCalledTimes(1);
    expect(prevApi.fetchPrevCloses).toHaveBeenCalledWith('005930', SYNTH_DATE, 239, expect.any(AbortSignal));
    // 받는 중에 켬 — 선 없음 · 「모자라」 안내 없음(E6 loading)
    act(() => writeMaConfig(DAY20(true)));
    expect(maKeys()).toEqual([]);
    expect(captions().some((c) => c.startsWith('일 '))).toBe(false);
    await act(async () => {
      d.resolve(PREV_OK);
      await d.promise;
    });
    await waitFor(() => expect(maKeys()).toEqual(['day:sma:20']));
    expect(captions().some((c) => c.startsWith('일 '))).toBe(false);
    // 켜고 꺼도 다시 받지 않는다(Q2)
    act(() => writeMaConfig(DAY20(false)));
    act(() => writeMaConfig(DAY20(true)));
    expect(prevApi.fetchPrevCloses).toHaveBeenCalledTimes(1);
  });

  it('일별 종가 실패 → 일 선 없음 · 캡션 「일 이동평균 — 일별 종가를 불러오지 못했어요…」 · 봉은 그대로', async () => {
    window.localStorage.setItem(TICK_CANDLE_UNIT_KEY, '1');
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, JSON.stringify(DAY20(true)));
    prevApi.fetchPrevCloses.mockRejectedValue(new Error('boom'));
    const { maKeys, captions, q } = renderMa({ stockCode: '005930' });
    await waitFor(() =>
      expect(captions()).toContain('일 이동평균 — 일별 종가를 불러오지 못했어요(화면을 다시 열면 다시 불러와요)'),
    );
    expect(maKeys()).toEqual([]);
    // 봉은 그대로(하루 전체 · 1분 칸 < 3px 라 꼬리만)
    const wicks = (q('candle-wick-up')[0]!.getAttribute('d') ?? '') + (q('candle-wick-down')[0]!.getAttribute('d') ?? '');
    expect(wicks).not.toBe('');
  });

  it('종목 코드 없음 → 요청 0 · 캡션 「일 20 — 지난 거래일 종가가 모자라 그리지 않아요」', () => {
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, JSON.stringify(DAY20(true)));
    const { captions, maKeys } = renderMa({ stockCode: null });
    expect(prevApi.fetchPrevCloses).not.toHaveBeenCalled();
    expect(captions()).toContain('일 20 — 지난 거래일 종가가 모자라 그리지 않아요');
    expect(maKeys()).toEqual([]);
  });

  it('일 칩이 없으면 종목 코드가 있어도 요청 0', () => {
    renderMa({ stockCode: '005930' });
    expect(prevApi.fetchPrevCloses).not.toHaveBeenCalled();
  });
});

/**
 * Phase 42 Plan 10 — 결선(수익률 판 · 아래 세 판 · 값 띠 · 캡션 · D-12 ~ D-15 · D-17 · D-19 · D-20 · SC-4 · SC-5).
 * 깨지면: 봉 차트에 수익률 판 · 순매수 판이 비거나, 값 띠가 없거나, 누적 선 · 캡션이 당일 · 미등록에서도 뜨거나 과거에서 빠진다.
 */
/** 과거 하루 accum — pos_net 두 점 · 누적 평단 계단(09:01 · 13:00:00.003 — 둘째 계단은 체결 사이라 누적 수익률 점이 둘). */
const ACCUM_CUM: NonNullable<TickOpenResponse['accum']> = {
  reg_time_ms: B.T0900,
  pos_net: { t_ms: [B.T0900 + 60_000, B.T0900 + 3_600_000], net_krw: [1_240_000_000, 1_300_000_000], cycle: [1, 1] },
  avg_px: { t_ms: [B.T0900 + 60_000, synthAt(3)], px: [16_380, 16_390] },
};

describe('결선 · 수익률 · 띠 · 캡션', () => {
  it('팀 매수 있는 세션 → 수익률 판 당일 선 · 아래 판 순매수 계단 · 값 띠 4칸이 제목 줄 아래 · 차트 위', () => {
    const { q } = renderChart();
    expect(q('candle-ret-day')[0]?.getAttribute('d') ?? '').toMatch(/^M/);
    const lower = q('candle-lower-layers')[0]!;
    expect(lower.querySelector('[data-slot="candle-day-path"]')).not.toBeNull();
    const band = q('candle-chart-band')[0]!;
    expect(band.querySelectorAll('[data-slot="candle-band-cell"]')).toHaveLength(4);
    expect(band.getAttribute('data-live')).toBe('1');
    const wrap = q('candle-chart-wrap')[0]!;
    expect(band.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrap.contains(band)).toBe(false);
  });

  it('과거 + accum(pos_net · avg_px) → 누적 수익률 선 · 누적 평단 점선 · 띠 「누적 평단」 · 캡션 누적 문구', () => {
    const { q } = renderChart({ accum: ACCUM_CUM });
    expect(q('candle-ret-cum')[0]?.getAttribute('d') ?? '').toMatch(/^M/);
    expect(q('candle-cum-avg')).toHaveLength(1);
    expect(q('candle-chart-band')[0]!.textContent).toContain('누적 평단');
    const items = Array.from(q('candle-caption-item')).map((e) => e.textContent);
    expect(items).toContain('누적 = 매집감지 보고서 값 · 우리 체결 제외');
  });

  it('NXT 세션이면 캡션 누적 문구 끝에 「 · KRX+NXT 합산」', () => {
    const nxt = synthSession(
      [[1, a3Msg({ seq: 1, bs: '2', px: 16400, qty: 100, time: '130000001000', nxt: true })]],
      'NXT',
    );
    const r = render(
      <CandleChart session={nxt} cursorRec={0} accum={ACCUM_CUM} onSeekMs={vi.fn()} onJumpRec={vi.fn()} />,
    );
    const items = Array.from(r.container.querySelectorAll('[data-slot="candle-caption-item"]')).map((e) => e.textContent);
    expect(items).toContain('누적 = 매집감지 보고서 값 · 우리 체결 제외 · KRX+NXT 합산');
  });

  it('당일(isToday) → 누적 수익률 · 누적 평단 · 띠 누적 줄 · 캡션 누적 항목 없음 · accum null(과거) → 「누적 자료 없음(매집감지 미등록)」', () => {
    const today = renderChart({ accum: ACCUM_CUM, isToday: true });
    expect(today.q('candle-ret-cum')).toHaveLength(0);
    expect(today.q('candle-cum-avg')).toHaveLength(0);
    expect(today.q('candle-chart-band')[0]!.textContent).not.toContain('누적 평단');
    // 캡션에는 봉이 모자란 이동평균 안내(단순 5 · 단순 20 — 봉 하나)만 남는다
    expect(Array.from(today.q('candle-caption-item')).map((e) => e.textContent)).toEqual([
      '단순 5 — 이 봉 단위로는 봉이 모자라 그리지 않아요',
      '단순 20 — 이 봉 단위로는 봉이 모자라 그리지 않아요',
    ]);
    // 나머지(당일 수익률 · 아래 판)는 그대로
    expect(today.q('candle-ret-day')).toHaveLength(1);
    today.unmount();
    const none = renderChart({ accum: null });
    expect(none.q('candle-ret-cum')).toHaveLength(0);
    expect(Array.from(none.q('candle-caption-item')).map((e) => e.textContent)[0]).toBe('누적 자료 없음(매집감지 미등록)');
  });

  it('마우스를 수익률 판 위에 두면 값 점에 당일(--team) 점이 그 판 안에 · 띠는 그 시각 · 떠나면 현재 틱', () => {
    const { q, svg } = renderChart({ accum: ACCUM_CUM });
    const band = () => q('candle-chart-band')[0]!;
    fireEvent.pointerMove(svg, { clientX: X1300 + 0.3, clientY: (PD.yRa + PD.yRb) / 2, pointerType: 'mouse' });
    const dots = Array.from(q('candle-chart-hover-dot'));
    const inRet = (d: Element) => {
      const cy = Number(d.getAttribute('cy'));
      return cy >= PD.yRa && cy <= PD.yRb;
    };
    expect(dots.filter((d) => inRet(d) && d.getAttribute('fill') === 'var(--team)')).toHaveLength(1);
    expect(dots.filter((d) => inRet(d) && d.getAttribute('fill') === 'var(--muted-fg)')).toHaveLength(1);
    expect(band().getAttribute('data-live')).toBeNull();
    fireEvent.pointerLeave(svg);
    expect(band().getAttribute('data-live')).toBe('1');
    expect(q('candle-chart-hover-dot')).toHaveLength(0);
  });

  it('팀이 그날 체결했는데 창을 팀 첫 매수 전 구간(10초)으로 좁히면 수익률 판에 「팀 체결 없음」 을 쓰지 않는다 · 아래 판 계단은 그대로(WR-02)', async () => {
    // 13:00 일반 체결(호가 있음 · 팀 아님) → 15:00 팀 매수 — 커서는 13:00
    const late = synthSession([
      [0, a3Msg({ seq: 1, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000000000' })],
      [2 * 3_600_000, a3Msg({ seq: 2, bs: '2', px: 16400, qty: 1000, time: '150000000000' })],
    ]);
    expect(late.team.fills.length).toBeGreaterThan(0);
    const r = render(<CandleChart session={late} cursorRec={0} onSeekMs={vi.fn()} onJumpRec={vi.fn()} />);
    const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
    fireEvent.click(r.getByRole('button', { name: '10초' }));
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('10초'));
    expect(q('candle-ret-empty')).toHaveLength(0);
    expect(q('candle-ret-day-axis')).toHaveLength(0);
    expect(q('candle-ret-zero')).toHaveLength(1);
    expect(q('candle-lower-empty')).toHaveLength(0);
    expect(q('candle-day-path')).toHaveLength(1);
  });

  it('커서가 창 밖이면 당일 수익률 선이 창 밖 커서 점까지 잇지 않는다(보간 사선 없음 · IN-01) · 띠는 커서 값 그대로', async () => {
    // 13:00 팀 매수 → 15:00 일반 체결(커서) · 창 = 14:00 ~ 14:01(체결 없음 — 창 안 점은 13:00 열 샘플 하나뿐)
    const gap = synthSession([
      [0, a3Msg({ seq: 1, bs: '2', px: 16400, qty: 1000, time: '130000000000' })],
      [2 * 3_600_000, a3Msg({ seq: 2, bs: '1', px: 16000, qty: 50, a1: 16050, b1: 16000, time: '150000000000' })],
    ]);
    const H14 = B.T0900 + 5 * 3_600_000;
    const r = render(
      <CandleChart
        session={gap}
        cursorRec={1}
        initialView={{ t0: H14, t1: H14 + 60_000, preset: null }}
        onSeekMs={vi.fn()}
        onJumpRec={vi.fn()}
      />,
    );
    const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
    await waitFor(() => expect(q('candle-chart-span')[0]!.textContent).toBe('1분'));
    // 커서는 창 밖(커서 선 없음) — 창이 따라가지 않았다
    expect(q('candle-chart-cursor')).toHaveLength(0);
    // 창 안 점 하나 → 선 없음(커서 점과 잇는 사선 없음) · 눈금 글자는 창 안 점 값으로
    expect(q('candle-ret-day')).toHaveLength(0);
    expect(q('candle-ret-day-axis')).toHaveLength(1);
    // 값 띠(현재 틱)는 커서 rec 값 그대로 — 손실 쪽 수익률
    expect(q('candle-band-ret')[0]!.textContent).not.toBe('—');
  });

  it('팀 체결이 하루에 하나도 없으면 수익률 판 · 아래 판 모두 「팀 체결 없음」', () => {
    const none = synthSession([
      [0, a3Msg({ seq: 1, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000000000' })],
    ]);
    const r = render(<CandleChart session={none} cursorRec={0} onSeekMs={vi.fn()} onJumpRec={vi.fn()} />);
    expect(r.container.querySelectorAll('[data-slot="candle-ret-empty"]')).toHaveLength(1);
    expect(r.container.querySelectorAll('[data-slot="candle-lower-empty"]')).toHaveLength(1);
  });

  it('폰(303) + 우리 점 → 캡션 줄 첫 항목 「◆ 우리 체결」 · 데스크톱 순서 = 구간 합계 줄 → 캡션 → 안내 줄', () => {
    const ph = renderChart({ height: 303, own: krxOwn, accum: null });
    const cap = ph.q('candle-chart-caption')[0]!;
    expect(cap.firstElementChild!.getAttribute('data-slot')).toBe('candle-caption-own');
    expect(cap.firstElementChild!.textContent).toContain('우리 체결');
    expect(ph.q('candle-chart-hint')).toHaveLength(0);
    // 폰 제목 줄은 두 줄(D-21) — 우리 범례는 제목 줄에 없고 캡션 줄에만
    expect(ph.q('candle-chart-title')[0]!.getAttribute('data-dims')).toBe('phone');
    expect(ph.q('candle-chart-own-legend')).toHaveLength(0);
    ph.unmount();

    const desk = renderChart({ accum: null });
    // Shift+끌기로 구간 합계 줄을 만든다
    const drag = (x0: number, x1: number) => {
      fireEvent.pointerDown(desk.svg, { shiftKey: true, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x0, clientY: 50 });
      fireEvent.pointerMove(desk.svg, { shiftKey: true, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
      fireEvent.pointerUp(desk.svg, { shiftKey: true, button: 0, pointerType: 'mouse', pointerId: 1, clientX: x1, clientY: 50 });
    };
    drag(X1300 - 20, X1300 + 20);
    const rng = desk.q('tick-chart-range')[0]!;
    const capD = desk.q('candle-chart-caption')[0]!;
    const hint = desk.q('candle-chart-hint')[0]!;
    expect(rng.compareDocumentPosition(capD) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(capD.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 데스크톱 우리 범례는 캡션 줄에 없다(제목 줄 · 42-07)
    expect(capD.querySelector('[data-slot="candle-caption-own"]')).toBeNull();
  });
});

/**
 * Phase 42 SC-4 · D-14 · Q3 — 현재 틱(마우스 없음)일 때 봉 차트 값 띠 수익률 글자 = 팀 거래정보 패널 「평단 대비 수익률」 글자.
 * 깨지면: 같은 커서에서 띠와 패널이 다른 수익률을 보여 준다.
 */
describe('패널 — 띠 수익률 = 팀 거래정보 패널', () => {
  it.each([
    ['팀 매수 뒤(seq 105)', 105],
    ['팀 매도 뒤(seq 107)', 107],
    ['팀 첫 매수 전(seq 100) — 둘 다 「—」', 100],
  ])('%s', (_name, seq) => {
    const rec = recOfSeq(krx, seq);
    const panel = render(<TickTeamPanel session={krx} cursorRec={rec} />).container;
    const want = panel.querySelector('[data-slot="tick-team-ret"]')!.textContent;
    const chart = renderChart({ cursorRec: rec });
    const got = chart.q('candle-band-ret')[0]!.textContent;
    expect(got).toBe(want);
    if (seq === 100) expect(got).toBe('—');
    else expect(got).not.toBe('—');
  });
});
