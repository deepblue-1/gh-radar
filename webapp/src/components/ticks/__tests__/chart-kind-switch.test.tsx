import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { TickOpenResponse, TickOwnResponse } from '@gh-radar/shared';

/**
 * Phase 42 Plan 01 Task 1 — 트레이서: 누적 평단 한 줄이 「RPC 키 → shared 타입 → server 통과 → 봉 차트 가격 판」 까지 이어지고,
 * 차트 카드 제목 줄 「선 차트 | 봉 차트」 스위치로 두 차트를 오간다(D-02 · D-04 · D-05 · D-08 · D-15 · D-18).
 *
 * 깨지면: 틱뷰어에서 「봉 차트」 를 눌러도 봉이 안 나오거나, 누적 평단이 안 보인다(또는 당일 · 미등록인데 보인다).
 */

const api = vi.hoisted(() => ({
  fetchTickDay: vi.fn(),
  fetchTickToday: vi.fn(),
  fetchTickOpen: vi.fn(),
  postTickConvert: vi.fn(),
  postTickCancel: vi.fn(),
  fetchTickLive: vi.fn(),
  fetchTickOwn: vi.fn(),
}));
vi.mock('@/lib/ticks/tick-api', () => api);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/analytics/ticks',
}));
vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => null };
});
vi.mock('@/hooks/use-debounced-search', () => ({
  useDebouncedSearch: () => ({ results: [], loading: false, error: undefined, resultsQuery: '' }),
}));

import { TickViewer } from '@/components/ticks/tick-viewer';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { SYNTH_DATE, SYNTH_ISIN, a3Msg, synthSession } from '@/test-fixtures/tick-synth';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = tickBoundsOf(SYNTH_DATE).T0;
/** synthNs 기준(13:00) → 14:00 근처(하루 전체 창의 가운데 — 확대해도 창 안에 남는다). */
const AT_1400 = HOUR;

// 서로 다른 분 4개 · 오름(13:59 · 14:01) 과 내림(14:00) 봉이 섞인다
const SESSION = synthSession([
  [AT_1400 - MIN + 1_000, a3Msg({ seq: 1, bs: '2', px: 16_400, qty: 100, time: '135901000000' })],
  [AT_1400 - MIN + 20_000, a3Msg({ seq: 2, bs: '2', px: 16_500, qty: 100, time: '135920000000' })],
  [AT_1400 + 1_000, a3Msg({ seq: 3, bs: '1', px: 16_450, qty: 50, time: '140001000000' })],
  [AT_1400 + 30_000, a3Msg({ seq: 4, bs: '1', px: 16_300, qty: 70, time: '140030000000' })],
  [AT_1400 + MIN + 5_000, a3Msg({ seq: 5, bs: '2', px: 16_350, qty: 40, time: '140105000000' })],
  [AT_1400 + MIN + 40_000, a3Msg({ seq: 6, bs: '2', px: 16_420, qty: 60, time: '140140000000' })],
  [AT_1400 + 2 * MIN + 3_000, a3Msg({ seq: 7, bs: '2', px: 16_420, qty: 10, time: '140203000000' })],
]);

const AVG_PX = { t_ms: [T0 + 4.5 * HOUR, T0 + 5 * HOUR + 10 * MIN], px: [16_380, 16_410] };
const ACCUM: NonNullable<TickOpenResponse['accum']> = {
  reg_time_ms: T0 + 4.5 * HOUR,
  pos_net: [[T0 + 4.5 * HOUR, 1_000_000]],
  avg_px: AVG_PX,
};

const URL_STATE = { isin: SYNTH_ISIN, d: SYNTH_DATE, ex: 'KRX' as const };
const OWN_EMPTY: TickOwnResponse = {
  access: true,
  date: SYNTH_DATE,
  exchange: 'KRX',
  isin: SYNTH_ISIN,
  servers: [],
  fills: [],
  events: [],
  orders: [],
};

beforeEach(() => {
  api.fetchTickOwn.mockResolvedValue(OWN_EMPTY);
});

function viewer(accum: TickOpenResponse['accum'], isToday = false) {
  return (
    <TickViewer session={SESSION} urlState={URL_STATE} initialT={null} onTick={vi.fn()} accum={accum} isToday={isToday} />
  );
}

const q = (slot: string) => document.querySelector(`[data-slot="${slot}"]`);
const kindSwitch = () => screen.getByRole('group', { name: '차트 종류' });

function toCandle() {
  fireEvent.click(within(kindSwitch()).getByRole('button', { name: '봉 차트' }));
}

describe('차트 종류 스위치 — 선 차트 ↔ 봉 차트(트레이서)', () => {
  it('처음은 선 차트 · 「봉 차트」 누름 → 봉 차트만(420 · 봉 · 누적 평단) · 「선 차트」 누름 → 다시 선 차트', async () => {
    render(viewer(ACCUM));

    // 처음 = 선 차트(D-02) · 스위치는 선 차트 제목 줄에도 있다
    expect(q('tick-chart')).not.toBeNull();
    expect(q('candle-chart')).toBeNull();
    expect(within(kindSwitch()).getByRole('button', { name: '선 차트' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(kindSwitch()).getByRole('button', { name: '봉 차트' }).getAttribute('aria-pressed')).toBe('false');

    toCandle();

    // 두 차트는 번갈아 그린다 — 함께 마운트하지 않는다(D-04)
    expect(q('candle-chart')).not.toBeNull();
    expect(q('tick-chart')).toBeNull();
    expect(within(kindSwitch()).getByRole('button', { name: '봉 차트' }).getAttribute('aria-pressed')).toBe('true');
    const svg = q('candle-chart-svg')!;
    expect(svg.getAttribute('height')).toBe('420');
    // 틱 선 없음(D-08) · 기존 slot 을 쓰지 않는다
    expect(document.querySelector('[data-slot^="tick-chart"]')).toBeNull();

    // 스위치 = 봉 차트 제목 줄 「타임라인」 바로 다음
    const h2 = within(q('candle-chart') as HTMLElement).getByRole('heading', { name: '타임라인' });
    expect(h2.nextElementSibling).toBe(kindSwitch());

    // 하루 전체(1분 칸 < 3px)는 꼬리만 — 확대(+ 세 번 = 90분)하면 몸통이 생긴다
    const wicks = (q('candle-wick-up')!.getAttribute('d') ?? '') + (q('candle-wick-down')!.getAttribute('d') ?? '');
    expect(wicks).not.toBe('');
    const wrap = q('candle-chart-wrap')!;
    for (let k = 0; k < 3; k++) fireEvent.keyDown(wrap, { key: '+' });
    await waitFor(() => {
      const bodies = (q('candle-body-up')!.getAttribute('d') ?? '') + (q('candle-body-down')!.getAttribute('d') ?? '');
      expect(bodies).not.toBe('');
    });
    expect(q('candle-body-up')!.getAttribute('d')).not.toBe('');
    expect(q('candle-body-down')!.getAttribute('d')).not.toBe('');

    // 누적 평단 회색 긴 점선(과거 · avg_px 있음 — D-15 · D-18)
    const cum = q('candle-cum-avg');
    expect(cum).not.toBeNull();
    expect(cum!.getAttribute('d')).toMatch(/^M/);
    expect(cum!.getAttribute('stroke-dasharray')).toBe('5 3');

    fireEvent.click(within(kindSwitch()).getByRole('button', { name: '선 차트' }));
    expect(q('tick-chart')).not.toBeNull();
    expect(q('candle-chart')).toBeNull();
  });

  it('당일 화면이면 봉 차트에 누적 평단이 없다(D-09 · D-15)', () => {
    render(viewer(ACCUM, true));
    toCandle();
    expect(q('candle-chart')).not.toBeNull();
    expect(q('candle-cum-avg')).toBeNull();
  });

  it('accum.avg_px 가 없거나 null 이거나 accum 이 null 이면 누적 평단이 없다(옛 행 · 옛 RPC · 미등록)', () => {
    const noKey = { reg_time_ms: ACCUM.reg_time_ms, pos_net: ACCUM.pos_net };
    for (const accum of [noKey, { ...ACCUM, avg_px: null }, null]) {
      const v = render(viewer(accum));
      toCandle();
      expect(q('candle-chart')).not.toBeNull();
      expect(q('candle-cum-avg')).toBeNull();
      v.unmount();
    }
  });
});
