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

/** 뷰어 렌더 횟수 — `useTickOwn` 은 TickViewer 만 렌더마다 한 번 부른다(42-08 「휠마다 뷰어가 다시 그려지지 않음」). */
const viewerRenders = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/ticks/use-tick-own', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ticks/use-tick-own')>();
  return {
    ...actual,
    useTickOwn: (...a: Parameters<typeof actual.useTickOwn>) => {
      viewerRenders.n++;
      return actual.useTickOwn(...a);
    },
  };
});

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
  // 차트 종류 기억(gh-radar:tick-chart-kind)이 테스트 사이로 새지 않게(42-08)
  window.localStorage.clear();
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

  it('키보드로 스위치를 누르면(초점이 스위치에 있음) 새 차트의 켜진 스위치 버튼으로 초점이 돌아온다 · 양방향(WR-03)', async () => {
    render(viewer(ACCUM));
    // 키보드 누름 = 초점이 그 버튼에 있는 채로 click(Enter · Space)
    const candleBtn = within(kindSwitch()).getByRole('button', { name: '봉 차트' });
    candleBtn.focus();
    fireEvent.click(candleBtn);
    expect(q('candle-chart')).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(kindSwitch()).getByRole('button', { name: '봉 차트' })));
    expect(document.activeElement).not.toBe(candleBtn);

    const lineBtn = within(kindSwitch()).getByRole('button', { name: '선 차트' });
    lineBtn.focus();
    fireEvent.click(lineBtn);
    expect(q('tick-chart')).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(kindSwitch()).getByRole('button', { name: '선 차트' })));
  });

  it('초점 없이 누르면(터치 · Safari 마우스) 초점을 옮기지 않는다', async () => {
    render(viewer(ACCUM));
    (document.activeElement as HTMLElement | null)?.blur();
    toCandle();
    expect(q('candle-chart')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect(document.activeElement).toBe(document.body);
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

/**
 * Phase 42 Plan 08 Task 2 — 차트 종류 기억(D-02) · 전환 때 보던 구간 유지(D-24, 선 차트 쪽).
 *
 * 깨지면: 봉 차트를 골라도 다음에 열면 선 차트로 돌아가거나, 선 ↔ 봉을 오가면 보던 구간을 잃거나, 휠 한 번마다 뷰어 전체가
 * 다시 그려진다.
 */
describe('기억 · 보던 구간(선 차트 쪽)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const span = () => q('tick-chart-span')?.textContent;
  const toLine = () => fireEvent.click(within(kindSwitch()).getByRole('button', { name: '선 차트' }));
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  it('기억 없음 → 선 차트 · 「봉 차트」 누름 → 저장소 candle · 뷰어를 다시 열면 봉 차트', () => {
    const v = render(viewer(ACCUM));
    expect(q('tick-chart')).not.toBeNull();
    toCandle();
    expect(window.localStorage.getItem('gh-radar:tick-chart-kind')).toBe('candle');
    v.unmount();

    render(viewer(ACCUM));
    expect(q('candle-chart')).not.toBeNull();
    expect(q('tick-chart')).toBeNull();
  });

  it('선 차트 「1분」 → 「봉 차트」 → 「선 차트」 로 돌아오면 다시 「1분」(전환 순간의 창)', async () => {
    render(viewer(ACCUM));
    fireEvent.click(within(q('tick-chart') as HTMLElement).getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    toCandle();
    expect(q('candle-chart')).not.toBeNull();
    toLine();
    expect(q('tick-chart')).not.toBeNull();
    await waitFor(() => expect(span()).toBe('1분'));
    await waitFor(() => expect((q('tick-chart-svg') as SVGSVGElement).style.visibility).not.toBe('hidden'));
  });

  it('종목 · 날짜 · 거래소가 바뀌어 뷰어가 다시 마운트되면 선 차트는 「하루 전체」(기억한 창 지움)', async () => {
    const r = render(<div key="a">{viewer(ACCUM)}</div>);
    fireEvent.click(within(q('tick-chart') as HTMLElement).getByRole('button', { name: '1분' }));
    await waitFor(() => expect(span()).toBe('1분'));
    toCandle();

    // 다른 key(= 다른 날짜의 session.key) — 차트 종류는 기억, 보던 창은 처음
    r.rerender(<div key="b">{viewer(ACCUM)}</div>);
    expect(q('candle-chart')).not.toBeNull();
    toLine();
    await wait(40);
    expect(span()).toBe('하루 전체');
  });

  it('확대 · 휠로 창이 바뀌어도 뷰어 렌더 횟수가 늘지 않는다(창은 렌더 없는 ref)', async () => {
    render(viewer(ACCUM));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalled());
    await wait(40);
    const before = viewerRenders.n;

    const wrap = q('tick-chart-wrap')!;
    fireEvent.keyDown(wrap, { key: '+' });
    await waitFor(() => expect(span()).not.toBe('하루 전체'));
    const svg = q('tick-chart-svg')!;
    fireEvent.wheel(svg, { deltaY: -120, clientX: 300 });
    fireEvent.keyDown(wrap, { key: '+' });
    await wait(40);
    expect(span()).not.toBe('하루 전체');
    expect(viewerRenders.n).toBe(before);
  });
});

/**
 * Phase 42 Plan 10 Task 3 — 봉 차트 제목 줄(D-05 · D-21) · 보기 창 양쪽 주고받기(D-24 · SC-1) · 세 기억(D-02).
 *
 * 깨지면: 봉 차트에 봉 단위 · 이동평균 조작부가 없거나, 봉 차트에서 보던 구간이 선 차트로 바꾸면 사라지거나(또는 그 반대),
 * 다시 열었을 때 고른 봉 단위 · 이동평균 구성이 처음으로 돌아간다.
 */
describe('D-24 양쪽 · 기억', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const lineSpan = () => q('tick-chart-span')?.textContent;
  const candleSpan = () => q('candle-chart-span')?.textContent;
  const candleBtn = (name: string) => within(q('candle-chart') as HTMLElement).getByRole('button', { name });
  const lineBtn = (name: string) => within(q('tick-chart') as HTMLElement).getByRole('button', { name });
  const toLine = () => fireEvent.click(within(kindSwitch()).getByRole('button', { name: '선 차트' }));
  const visible = (slot: string) => (q(slot) as SVGSVGElement | null)?.style.visibility !== 'hidden';

  it('봉 차트 제목 줄 = 「타임라인」 · 스위치 · 봉 단위 버튼 · 이동평균 칩 · 창 폭 · 확대 버튼 5개(데스크톱 한 줄)', () => {
    render(viewer(ACCUM));
    toCandle();
    const title = q('candle-chart-title') as HTMLElement;
    expect(title).not.toBeNull();
    expect(title.getAttribute('data-dims')).toBe('desktop');
    expect(title.contains(kindSwitch())).toBe(true);
    expect(title.querySelector('[data-slot="candle-unit-button"]')!.textContent).toBe('10분봉(자동)');
    expect(within(title).getByRole('group', { name: '이동평균' })).toBeDefined();
    for (const name of ['확대', '축소', '전체', '1분', '10초']) expect(within(title).getByRole('button', { name })).toBeDefined();
    // 제목 줄은 래퍼 밖(Pitfall 12)
    expect((q('candle-chart-wrap') as HTMLElement).contains(title)).toBe(false);
  });

  it('칩 「단순 5」 누름 → 판 제목에서 빠지고 저장소 그 선 on false(기억)', () => {
    render(viewer(ACCUM));
    toCandle();
    const ptitle = () => q('candle-price-title')?.textContent ?? '';
    expect(ptitle()).toContain('단순 5');
    fireEvent.click(within(q('candle-chart-title') as HTMLElement).getByRole('button', { name: '단순 5', pressed: true }));
    expect(ptitle()).not.toContain('단순 5');
    const saved = JSON.parse(window.localStorage.getItem('gh-radar:tick-candle-ma')!);
    expect(saved.lines[0]).toMatchObject({ n: 5, on: false });
  });

  it('선 「1분」 → 봉 차트 = 「1분」 · 「1분봉(자동)」 → 봉 「10초」 → 선 차트 = 「10초」', async () => {
    render(viewer(ACCUM));
    fireEvent.click(lineBtn('1분'));
    await waitFor(() => expect(lineSpan()).toBe('1분'));
    toCandle();
    await waitFor(() => expect(candleSpan()).toBe('1분'));
    await waitFor(() => expect(visible('candle-chart-svg')).toBe(true));
    expect(q('candle-unit-button')!.textContent).toBe('1분봉(자동)');
    fireEvent.click(candleBtn('10초'));
    await waitFor(() => expect(candleSpan()).toBe('10초'));
    toLine();
    await waitFor(() => expect(lineSpan()).toBe('10초'));
    await waitFor(() => expect(visible('tick-chart-svg')).toBe(true));
  });

  it('선 「전체」 상태로 바꾸면 봉 차트 「하루 전체」(이름으로 · 숨김 없음)', () => {
    render(viewer(ACCUM));
    fireEvent.click(lineBtn('전체'));
    toCandle();
    expect(candleSpan()).toBe('하루 전체');
    expect(visible('candle-chart-svg')).toBe(true);
  });

  it('봉 차트 Shift+끌기 구간이 있는 채로 선 차트로 바꿨다 돌아오면 구간 없음', () => {
    render(viewer(ACCUM));
    toCandle();
    const svg = q('candle-chart-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const ev = { shiftKey: true, button: 0, pointerType: 'mouse', pointerId: 1, clientY: 50 };
    fireEvent.pointerDown(svg, { ...ev, clientX: 280 });
    fireEvent.pointerMove(svg, { ...ev, clientX: 340 });
    fireEvent.pointerUp(svg, { ...ev, clientX: 340 });
    expect(q('tick-chart-range')).not.toBeNull();
    toLine();
    toCandle();
    expect(q('candle-chart')).not.toBeNull();
    expect(q('tick-chart-range')).toBeNull();
  });

  it('다시 열면(다른 key) 봉 차트 · 「30분봉」 · 이동평균 구성은 그대로 · 보던 창은 처음(하루 전체)', async () => {
    window.localStorage.setItem('gh-radar:tick-chart-kind', 'candle');
    window.localStorage.setItem('gh-radar:tick-candle-unit', '30');
    window.localStorage.setItem(
      'gh-radar:tick-candle-ma',
      JSON.stringify({ v: 1, lines: [{ base: 'bar', n: 7, kind: 'ema', on: true, color: 3 }] }),
    );
    const r = render(<div key="a">{viewer(ACCUM)}</div>);
    expect(q('candle-chart')).not.toBeNull();
    expect(q('candle-unit-button')!.textContent).toBe('30분봉');
    const chips = () => Array.from(document.querySelectorAll('[data-slot="candle-ma-chip"]')).map((c) => c.textContent);
    expect(chips().join('|')).toContain('지수 7');
    fireEvent.click(candleBtn('1분'));
    await waitFor(() => expect(candleSpan()).toBe('1분'));

    r.rerender(<div key="b">{viewer(ACCUM)}</div>);
    expect(q('candle-chart')).not.toBeNull();
    expect(q('candle-unit-button')!.textContent).toBe('30분봉');
    expect(chips().join('|')).toContain('지수 7');
    expect(candleSpan()).toBe('하루 전체');
  });
});
