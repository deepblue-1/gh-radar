import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { a3TimeMs, type TickOpenResponse, type TickOwnEvent, type TickOwnFill, type TickOwnResponse } from '@gh-radar/shared';

import { buildOwnModel, type OwnModel } from '@/lib/ticks/own-model';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { SYNTH_DATE, SYNTH_ISIN, a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import { TickChart } from '../tick-chart';

/**
 * Phase 37 Plan 14 Task 2 — TickChart 팀 레이어 · 범례(D-09) · NXT 범례(Open Question 3) · 주문 원 클릭 · 클릭 점프 · 1분/10초.
 *
 * 깨지면: 매집감지 미등록 종목에서 회색 선 대신 빈 축이 남거나 · NXT 누적 선이 KRX 만인 것처럼 읽히거나 · 원을 눌러도 그 주문으로
 * 가지 않거나 · 차트를 눌러도 커서가 움직이지 않는다.
 */

const B = tickBoundsOf(SYNTH_DATE);

/** 팀 매수 SMP 3조각(984만) · 일반 1조각 · 팀 매도 0/0 단독(652만) — team-model.test 와 같은 하루. */
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

/** NXT 런 — 한 가격 2조각(팀 · 1,312만) + 닫는 B6. */
const nxt = synthSession(
  [
    [0, b6Msg({ seq: 200, ask1: [16400, 10], bid1: [16350, 10], nxt: true })],
    [1, a3Msg({ seq: 201, bs: '2', px: 16400, qty: 400, a1: 16400, b1: 16350, time: '130000001000', nxt: true })],
    [1.1, a3Msg({ seq: 202, bs: '2', px: 16400, qty: 400, a1: 16400, b1: 16350, time: '130000001100', nxt: true })],
    [1.5, b6Msg({ seq: 203, ask1: [16450, 10], bid1: [16400, 10], nxt: true })],
  ],
  'NXT',
);

const posNet = (): TickOpenResponse['accum'] => ({
  reg_time_ms: B.T0900,
  pos_net: { t_ms: [B.T0900 + 60_000, B.T0900 + 3_600_000], net_krw: [1_240_000_000, 1_300_000_000], cycle: [1, 1] },
});

const recOfSeq = (s: typeof krx, seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};

function renderChart(props: Partial<Parameters<typeof TickChart>[0]> = {}) {
  const onSeekMs = vi.fn();
  const onJumpRec = vi.fn();
  const r = render(
    <TickChart session={krx} cursorRec={recOfSeq(krx, 103)} onSeekMs={onSeekMs} onJumpRec={onJumpRec} {...props} />,
  );
  const q = (slot: string) => r.container.querySelectorAll(`[data-slot="${slot}"]`);
  return { ...r, q, onSeekMs, onJumpRec };
}

describe('TickChart — 누적 선 · 범례(D-09 · Open Question 3)', () => {
  it('accum 없음 → 보라 당일 선만 · 왼쪽 회색 축 없음 · 범례 「누적 자료 없음(매집감지 미등록)」', () => {
    const { q } = renderChart({ accum: null });
    expect(q('tick-day-path')).toHaveLength(1);
    expect(q('tick-cum-path')).toHaveLength(0);
    expect(q('tick-cum-axis')).toHaveLength(0);
    expect(q('tick-chart-legend')[0]?.textContent).toBe('누적 자료 없음(매집감지 미등록)');
  });

  it('pos_net 있음(KRX) → 회색 누적 계단 + 왼쪽 회색 축(0 포함) · 범례 「누적 = 매집감지 포지션(이월 포함)」', () => {
    const { q } = renderChart({ accum: posNet() });
    expect(q('tick-cum-path')).toHaveLength(1);
    const axis = q('tick-cum-axis')[0]!;
    expect(axis.textContent).toContain('13.0억');
    expect(axis.textContent).toContain('0');
    expect(q('tick-chart-legend')[0]?.textContent).toBe('누적 = 매집감지 포지션(이월 포함)');
  });

  it('NXT 화면 + pos_net → 범례 「매집감지 포지션(KRX+NXT 합산)」 · NXT 팀 원도 그린다(D-13)', () => {
    const { q } = renderChart({ session: nxt, cursorRec: 0, accum: posNet() });
    expect(q('tick-chart-legend')[0]?.textContent).toBe('누적 = 매집감지 포지션(KRX+NXT 합산)');
    expect(q('tick-cum-path')).toHaveLength(1);
    expect(nxt.team.teamOrders).toHaveLength(1);
    expect(q('tick-order-circle')).toHaveLength(1);
    expect(q('tick-day-path')).toHaveLength(1);
  });

  it('당일 화면 → pos_net 이 있어도 당일 선만 · 누적 범례 없음', () => {
    const { q } = renderChart({ accum: posNet(), isToday: true });
    expect(q('tick-cum-path')).toHaveLength(0);
    expect(q('tick-chart-legend')).toHaveLength(0);
  });
});

describe('TickChart — 툴팁(매집감지 차트와 같은 규칙 · 2026-11-03)', () => {
  const box = (svg: SVGSVGElement) => {
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: 287, width: 640, height: 287, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  };

  it('원 위 → 씨앗 + 가로 ± 5px 묶음 3줄(하루 전체 창 — 가까운 매수 · 매도가 한 묶음) · 고리 · 나가면 지운다', () => {
    const { q } = renderChart();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    box(svg);
    const buy = Array.from(q('tick-order-circle')).find((c) => c.getAttribute('data-side') === 'B')!;
    const cx = Number(buy.getAttribute('cx'));
    const cy = Number(buy.getAttribute('cy'));
    fireEvent.pointerMove(svg, { clientX: cx, clientY: cy, pointerType: 'mouse' });
    const tip = q('tick-chart-tip')[0]!;
    const lines = Array.from(tip.children).map((d) => d.textContent);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('팀 매수 600주 · 984만 @16,400 · 3조각 · 당일 순매수 +984만');
    expect(lines[1]).toBe('묶음 2건 13:00:00 · 팀 매수 1건 984만 · 팀 매도 1건 652만 · 가격 16,400 → 16,300 (−0.61%)');
    expect(lines[2]).toBe('큰 주문 매수 984만@16,400 · 매도 652만@16,300');
    expect(q('tick-order-seed')).toHaveLength(1);
    expect(q('tick-order-hover')).toHaveLength(1);
    fireEvent.pointerLeave(svg);
    expect(q('tick-chart-tip')).toHaveLength(0);
  });

  it('순매수 판 · 10분 판 → 그 시각 계단 · 그 칸', () => {
    const { q } = renderChart();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    box(svg);
    const buy = Array.from(q('tick-order-circle')).find((c) => c.getAttribute('data-side') === 'B')!;
    const cx = Number(buy.getAttribute('cx'));
    // 데스크톱 판: 순매수 [118, 168] · 10분 [175, 215]
    fireEvent.pointerMove(svg, { clientX: cx + 3, clientY: 140, pointerType: 'mouse' });
    expect(q('tick-chart-tip')[0]!.textContent).toMatch(/^13:00:00 · 당일 순매수 /);
    fireEvent.pointerMove(svg, { clientX: cx, clientY: 200, pointerType: 'mouse' });
    expect(q('tick-chart-tip')[0]!.textContent).toBe('13:00~13:10 · 팀 매수 984만 / 매도 652만 / 순 +332만');
  });

  it('누적 판 → 그 시각까지 거래량 · 거래대금 · 팀 비중(상장주식수 없으면 시총 대비 없음 · 금액 축)', () => {
    const { q } = renderChart();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    box(svg);
    expect(q('tick-turnover-area')).toHaveLength(1);
    expect(q('tick-team-share-path')).toHaveLength(1);
    expect(q('tick-turnover-axis')[0]!.textContent).toBe('1,718만0');
    expect(q('tick-share-axis')[0]!.textContent).toBe('100%0%');
    // 데스크톱 누적 판 [222, 272] · 오른쪽 끝(모든 체결 뒤)
    fireEvent.pointerMove(svg, { clientX: 580, clientY: 250, pointerType: 'mouse' });
    const lines = Array.from(q('tick-chart-tip')[0]!.children).map((d) => d.textContent);
    expect(lines).toEqual(['13:00:00까지 · 거래량 1,050주 · 거래대금 1,718만', '팀 1,636만 95.2% · 매수 984만 · 매도 652만']);
  });

  it('상장주식수 → 왼쪽 축 · 툴팁이 시총 대비 %', () => {
    const { q } = renderChart({ listingShares: 1_000_000 });
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    box(svg);
    const cap = krx.basePx! * 1_000_000;
    const pct = `${(Math.round((17_177_500 / cap) * 1000) / 10).toFixed(1)}%`;
    expect(q('tick-turnover-axis')[0]!.textContent).toBe(`${pct}0.0%`);
    fireEvent.pointerMove(svg, { clientX: 580, clientY: 250, pointerType: 'mouse' });
    expect(q('tick-chart-tip')[0]!.children[0]!.textContent).toBe(`13:00:00까지 · 거래량 1,050주 · 거래대금 1,718만(시총 대비 ${pct})`);
  });
});

describe('TickChart — 팀 레이어 · 클릭', () => {
  it('주문 원 = 팀 주문 ≥ 500만 2개(매수 · 매도) · 커서가 든 주문은 --fg 고리 · 10분 막대 · 평단 점점선', () => {
    const { q } = renderChart();
    const circles = Array.from(q('tick-order-circle'));
    expect(circles.map((c) => c.getAttribute('data-side')).sort()).toEqual(['B', 'S']);
    const buy = circles.find((c) => c.getAttribute('data-side') === 'B')!;
    expect(buy.getAttribute('stroke')).toBe('var(--fg)');
    expect(buy.querySelector('title')).toBeNull();
    expect(q('tick-bucket')).toHaveLength(1);
    expect(q('tick-team-avg-path')).toHaveLength(1);
    expect(q('tick-pre-shade')).toHaveLength(1);
    expect(q('tick-gap-band')).toHaveLength(1);
  });

  it('원 클릭 → 그 주문 마지막 조각 rec 으로 점프(onJumpRec) · 시각 점프는 하지 않는다', () => {
    const { q, onJumpRec, onSeekMs } = renderChart();
    const sell = Array.from(q('tick-order-circle')).find((c) => c.getAttribute('data-side') === 'S')!;
    fireEvent.click(sell);
    expect(onJumpRec).toHaveBeenCalledWith(recOfSeq(krx, 107));
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('빈 곳 클릭 → 그 x 의 시각(onSeekMs) · 끌기(4px 넘게 이동)는 클릭이 아니다', () => {
    const { q, onSeekMs } = renderChart();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: 287, width: 640, height: 287, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // L = 52 · 그림 끝 = 640 − 52 = 588 · 하루 전체 창 → 가운데 320 = 14:00
    fireEvent.click(svg, { clientX: 320, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
    expect(onSeekMs.mock.calls[0]![0]).toBeCloseTo(B.T0 + 6 * 3_600_000, -2);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 50 });
    fireEvent.click(svg, { clientX: 140, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('「10초」 · 「1분」 버튼 → 커서 중심 창 · + − 0 키', async () => {
    const { getByRole, q } = renderChart();
    const span = () => q('tick-chart-span')[0]!.textContent;
    expect(span()).toBe('하루 전체');
    fireEvent.click(getByRole('button', { name: '10초' }));
    await waitFor(() => expect(span()).toBe('10초'));
    fireEvent.click(getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    const wrap = q('tick-chart-wrap')[0]!;
    fireEvent.keyDown(wrap, { key: '0' });
    await waitFor(() => expect(span()).toBe('하루 전체'));
    // ← → 는 차트가 가로채지 않는다(커서 이동 키)
    expect(fireEvent.keyDown(wrap, { key: 'ArrowRight' })).toBe(true);
  });

  it('커서 선 · 시각 라벨 — 커서 rec 의 수신 시각', () => {
    const { q } = renderChart();
    expect(q('tick-chart-cursor')).toHaveLength(1);
    expect(q('tick-chart-cursor-label')[0]?.textContent).toBe('13:00:00');
  });
});

/**
 * Phase 38 Plan 07 — 차트 우리 점(D-08 · D-10).
 * 깨지면: ◆ 를 눌러도 그 체결 전문으로 가지 않거나 · ○ 가 되돌아가기 주문을 남기지 않거나 · 짝 없음 ◇ 가 시각 점프로
 * 새거나 · 추정 ◆ 가 채운 ◆ 로 보이거나 · own 이 없는데 우리 점이 생긴다.
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
/** krx 하루 — 우리 매도 체결 16,350 ×50(seq 105 짝 ◆) · 짝 없음 99,999 ×1(◇) · 호가 근거 seq 100(매도1 16,400 ×283 → ○ · 가격 판 범위 안). */
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

describe('TickChart — 우리 점 ◆ · ◇ · ○ (Phase 38-07)', () => {
  const renderOwn = (own: OwnModel | null = krxOwn) => {
    const onOwnJump = vi.fn();
    const onOwnFillLine = vi.fn();
    const r = renderChart({ own, onOwnJump, onOwnFillLine });
    return { ...r, onOwnJump, onOwnFillLine };
  };

  it('전제 — 체결 짝 seq 105 · 짝 없음 하나 · 근거 b6 seq 100', () => {
    expect(krxOwn.fills.map((f) => f.rec).sort()).toEqual([-1, recOfSeq(krx, 105)].sort());
    expect(krxOwn.orders.find((o) => o.orderNo === 'EV')!.evidenceRec).toBe(recOfSeq(krx, 100));
  });

  it('own 이 있으면 가격 판 클립 안에 ◆(채움 --mine) · ◇(빈 · 실선) · ○(빈 · --mine 테두리) · own 없으면 없음', () => {
    const { q } = renderOwn();
    const dia = Array.from(q('tick-own-mark'));
    expect(dia.map((d) => d.getAttribute('data-kind')).sort()).toEqual(['fill', 'nofill']);
    const fill = dia.find((d) => d.getAttribute('data-kind') === 'fill')!;
    expect(fill.getAttribute('fill')).toBe('var(--mine)');
    expect(fill.getAttribute('transform')).toMatch(/^rotate\(45 /);
    expect(fill.getAttribute('stroke-dasharray')).toBeNull();
    const nf = dia.find((d) => d.getAttribute('data-kind') === 'nofill')!;
    expect(nf.getAttribute('fill')).toBe('var(--card)');
    expect(nf.getAttribute('stroke-dasharray')).toBeNull();
    const ev = q('tick-own-ev-mark');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.getAttribute('stroke')).toBe('var(--mine)');
    expect(ev[0]!.closest('[data-slot="tick-price-layer"]')).not.toBeNull();
    expect(fill.closest('[data-slot="tick-price-layer"]')).not.toBeNull();
    // 팀 원 뒤(위)에 그린다
    const layer = q('tick-price-layer')[0]!;
    const kids = Array.from(layer.children);
    expect(kids.indexOf(fill)).toBeGreaterThan(kids.indexOf(q('tick-order-circle')[0]!));
    const none = renderChart({ own: null });
    expect(none.q('tick-own-mark')).toHaveLength(0);
    expect(none.q('tick-own-ev-mark')).toHaveLength(0);
  });

  it('추정 체결 → 빈 ◆ 점선(3 2)', () => {
    const est: OwnModel = { ...krxOwn, fills: krxOwn.fills.map((f) => (f.rec >= 0 ? { ...f, est: true } : f)) };
    const { q } = renderOwn(est);
    const d = Array.from(q('tick-own-mark')).find((k) => k.getAttribute('data-kind') === 'est')!;
    expect(d.getAttribute('fill')).toBe('var(--card)');
    expect(d.getAttribute('stroke-dasharray')).toBe('3 2');
  });

  it('◆ 클릭 → onOwnJump(그 A3 rec) · 팀 원 점프 · 시각 점프 없음', () => {
    const { q, onOwnJump, onJumpRec, onSeekMs } = renderOwn();
    fireEvent.click(Array.from(q('tick-own-mark')).find((d) => d.getAttribute('data-kind') === 'fill')!);
    expect(onOwnJump).toHaveBeenCalledTimes(1);
    expect(onOwnJump.mock.calls[0]).toEqual([recOfSeq(krx, 105)]);
    expect(onJumpRec).not.toHaveBeenCalled();
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('◇ 클릭 → onOwnFillLine(그 체결 id) · ○ 클릭 → onOwnJump(근거 rec, 주문 id)', () => {
    const { q, onOwnJump, onOwnFillLine, onSeekMs } = renderOwn();
    fireEvent.click(Array.from(q('tick-own-mark')).find((d) => d.getAttribute('data-kind') === 'nofill')!);
    const nofill = krxOwn.fills.find((f) => f.rec < 0)!;
    expect(onOwnFillLine).toHaveBeenCalledWith(nofill.id);
    fireEvent.click(q('tick-own-ev-mark')[0]!);
    const ev = krxOwn.orders.find((o) => o.orderNo === 'EV')!;
    expect(onOwnJump).toHaveBeenCalledWith(recOfSeq(krx, 100), ev.id);
    expect(onSeekMs).not.toHaveBeenCalled();
  });

  it('우리 점 둘레(반지름 + 3px) 빈 곳 클릭도 우리 점이 먼저 · 멀면 시각 점프 그대로', () => {
    const { q, onOwnJump, onSeekMs } = renderOwn();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: 287, width: 640, height: 287, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const ev = q('tick-own-ev-mark')[0]!;
    const cx = Number(ev.getAttribute('cx'));
    const cy = Number(ev.getAttribute('cy'));
    fireEvent.click(svg, { clientX: cx, clientY: cy + 6 });
    expect(onOwnJump).toHaveBeenCalledTimes(1);
    fireEvent.click(svg, { clientX: 100, clientY: 50 });
    expect(onSeekMs).toHaveBeenCalledTimes(1);
  });

  it('범례 — own 이 있으면 「◆ 우리 체결」 「○ 조건 근거」 두 칸(누적 범례 문구는 그대로) · own 없으면 없음', () => {
    const { q } = renderOwn();
    const lg = q('tick-chart-own-legend');
    expect(lg).toHaveLength(1);
    expect(Array.from(lg[0]!.children).map((c) => c.textContent)).toEqual(['우리 체결', '조건 근거']);
    expect(q('tick-chart-legend')[0]?.textContent).toBe('누적 자료 없음(매집감지 미등록)');
    expect(renderChart({ own: null }).q('tick-chart-own-legend')).toHaveLength(0);
  });

  it('마우스가 ◆ 위 → 팀 묶음 툴팁 줄 뒤에 우리 줄(판 안 점만 · 근거 ○ → ◆ 순) · 팀 줄은 그대로', () => {
    const { q } = renderOwn();
    const svg = q('tick-chart-svg')[0] as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: 287, width: 640, height: 287, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const buy = Array.from(q('tick-order-circle')).find((c) => c.getAttribute('data-side') === 'B')!;
    fireEvent.pointerMove(svg, {
      clientX: Number(buy.getAttribute('cx')),
      clientY: Number(buy.getAttribute('cy')),
      pointerType: 'mouse',
    });
    const lines = Array.from(q('tick-chart-tip')[0]!.children).map((d) => d.textContent);
    expect(lines.slice(0, 3)).toEqual([
      expect.stringContaining('팀 매수 600주 · 984만 @16,400 · 3조각 · 당일 순매수 +984만'),
      '묶음 2건 13:00:00 · 팀 매수 1건 984만 · 팀 매도 1건 652만 · 가격 16,400 → 16,300 (−0.61%)',
      '큰 주문 매수 984만@16,400 · 매도 652만@16,300',
    ]);
    expect(lines.slice(3)).toEqual(['조건 근거 호가 · 주문 #EV', '우리 체결 50주 · 계좌 ···3801 · 주문 #F1']);
  });
});
