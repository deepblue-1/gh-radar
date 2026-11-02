import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { zstdCompressSync } from 'node:zlib';

import { iterRecords, type TickDayResponse, type TickOpenResponse, type TickTodayResponse } from '@gh-radar/shared';

/**
 * Phase 37 Plan 19 Task 2 — 당일 뷰어 결선(D-06 · D-18 · D-22).
 *
 * 잠그는 것: 끝 틱에서 열림 · 끝이면 증분 세션을 따라간다 · 과거 틱이면 「새 틱」 배지(클릭 = 끝으로 + onGoEnd) · 슬라이더 「끝으로」 ·
 * onAtEnd 보고 · 머리 「당일 자료 지연 · n초 전 마지막 수신」 · 연속 오류 줄 · 페이지 live=false → 「당일 자료 준비 중」(요청 0) ·
 * 받는 중 카드(대기 k건) 취소 → 목록 · 요청 멈춤.
 */

const api = vi.hoisted(() => ({
  fetchTickDay: vi.fn(),
  fetchTickToday: vi.fn(),
  fetchTickOpen: vi.fn(),
  postTickConvert: vi.fn(),
  postTickCancel: vi.fn(),
  fetchTickLive: vi.fn(),
}));
vi.mock('@/lib/ticks/tick-api', () => api);

const push = vi.hoisted(() => vi.fn());
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/analytics/ticks',
}));
vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => null };
});
vi.mock('@/hooks/use-debounced-search', () => ({
  useDebouncedSearch: () => ({ results: [], loading: false, error: undefined, resultsQuery: '' }),
}));

import { TickHeader, liveDelayTextOf } from '@/components/ticks/tick-header';
import { TickViewer } from '@/components/ticks/tick-viewer';
import { TickViewerPage } from '@/components/ticks/tick-viewer-page';
import { appendTickBytes, type TickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';
import { fmtTickTime } from '@gh-radar/shared';

const RAW = tickGridBytes();
function chunk(fromRec: number, toRec: number): Uint8Array {
  let i = 0;
  let a = RAW.length;
  let b = RAW.length;
  for (const r of iterRecords(RAW)) {
    if (i === fromRec) a = r.off - 16;
    if (i === toRec) {
      b = r.off - 16;
      break;
    }
    i += 1;
  }
  return new Uint8Array(zstdCompressSync(RAW.subarray(a, b)));
}
const KEY = { date: D, ex: 'KRX' as const, isin: ISIN };
const S1 = appendTickBytes(null, chunk(0, 6_000), KEY);
const S2 = appendTickBytes(S1, chunk(6_000, Number.MAX_SAFE_INTEGER), KEY);
const endTime = (s: TickSession) => fmtTickTime(s.index.recvNs[s.exOrder[s.exOrder.length - 1]!]!);

const URL_STATE = { isin: ISIN, d: D, ex: 'KRX' as const };

function viewer(session: TickSession, live: { newCount: number; onGoEnd: () => void; onAtEnd: (v: boolean) => void }, onTick = vi.fn()) {
  return <TickViewer session={session} urlState={URL_STATE} initialT={null} onTick={onTick} isToday live={live} />;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TickViewer — 당일(live)', () => {
  it('끝 틱에서 열림 · 끝이면 증분 세션을 따라간다 · onAtEnd(true)', async () => {
    const onTick = vi.fn();
    const onAtEnd = vi.fn();
    const live = { newCount: 0, onGoEnd: vi.fn(), onAtEnd };
    const v = render(viewer(S1, live, onTick));
    await waitFor(() => expect(onTick).toHaveBeenLastCalledWith(expect.objectContaining({ time: endTime(S1) })));
    expect(onAtEnd).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: /새 틱/ })).toBeNull();
    // 「끝으로」 버튼은 당일이면 보인다
    expect(screen.getByRole('button', { name: '끝으로' })).toBeTruthy();

    v.rerender(viewer(S2, live, onTick));
    await waitFor(() => expect(onTick).toHaveBeenLastCalledWith(expect.objectContaining({ time: endTime(S2) })));
    expect(onAtEnd).toHaveBeenLastCalledWith(true);
  });

  it('과거 틱 → onAtEnd(false) · 「새 틱 n건」 배지 · 증분이 와도 커서 제자리 · 배지 클릭 = onGoEnd + 끝 틱', async () => {
    const onTick = vi.fn();
    const onAtEnd = vi.fn();
    const onGoEnd = vi.fn();
    const v = render(viewer(S1, { newCount: 0, onGoEnd, onAtEnd }, onTick));
    await waitFor(() => expect(onAtEnd).toHaveBeenLastCalledWith(true));
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    });
    await waitFor(() => expect(onAtEnd).toHaveBeenLastCalledWith(false));
    const back = onTick.mock.lastCall![0].time as string;
    expect(screen.getByRole('button', { name: /새 틱/ })).toBeTruthy();

    v.rerender(viewer(S2, { newCount: 5_990, onGoEnd, onAtEnd }, onTick));
    const badge = await screen.findByRole('button', { name: /새 틱 5,990건/ });
    // 과거를 보고 있으면 커서는 따라가지 않는다
    expect(onTick.mock.lastCall![0].time).toBe(back);

    fireEvent.click(badge);
    expect(onGoEnd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onTick).toHaveBeenLastCalledWith(expect.objectContaining({ time: endTime(S2) })));
    await waitFor(() => expect(onAtEnd).toHaveBeenLastCalledWith(true));
  });

  it('슬라이더 「끝으로」 → onGoEnd + 끝 틱', async () => {
    const onTick = vi.fn();
    const onGoEnd = vi.fn();
    render(viewer(S2, { newCount: 0, onGoEnd, onAtEnd: vi.fn() }, onTick));
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    });
    await waitFor(() => expect(onTick.mock.lastCall![0].time).not.toBe(endTime(S2)));
    fireEvent.click(screen.getByRole('button', { name: '끝으로' }));
    expect(onGoEnd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onTick).toHaveBeenLastCalledWith(expect.objectContaining({ time: endTime(S2) })));
  });
});

describe('TickHeader — 당일 지연 · 연속 오류', () => {
  const base = {
    mode: 'loaded' as const,
    stock: { code: '101360', name: '에코앤드림' },
    date: D,
    ex: 'KRX' as const,
    supply: 'live' as const,
    prev: null,
    next: null,
    onDate: () => {},
    onEx: () => {},
    picker: null,
  };

  it('liveDelayTextOf — n초 전 · 수신 없음', () => {
    const now = 1_760_590_012_400;
    expect(liveDelayTextOf('1760590000000000000', now)).toBe('당일 자료 지연 · 12초 전 마지막 수신');
    expect(liveDelayTextOf(null, now)).toBe('당일 자료 지연 · 아직 수신 없음');
  });

  it('delayed · blocked 면 공급 배지 옆 지연 문구 · ready 면 없음 · 연속 오류 줄', () => {
    const v = render(<TickHeader {...base} live={{ state: 'delayed', lastRecvNs: '1760590000000000000', failing: false }} />);
    expect(screen.getByText(/^당일 자료 지연 · /)).toBeTruthy();
    expect(screen.queryByText('당일 자료를 받지 못하고 있어요')).toBeNull();
    v.rerender(<TickHeader {...base} live={{ state: 'blocked', lastRecvNs: null, failing: false }} />);
    expect(screen.getByText('당일 자료 지연 · 아직 수신 없음')).toBeTruthy();
    v.rerender(<TickHeader {...base} live={{ state: 'ready', lastRecvNs: null, failing: true }} />);
    expect(screen.queryByText(/^당일 자료 지연/)).toBeNull();
    expect(screen.getByText('당일 자료를 받지 못하고 있어요')).toBeTruthy();
  });
});

describe('TickViewerPage — 당일 결선 (D-22)', () => {
  const day: TickDayResponse = { access: true, dates: [D], date: D, rows: [], requests: [], eta_s: { KRX: 240, NXT: 120 } };
  const open: TickOpenResponse = {
    access: true,
    date: D,
    exchange: 'KRX',
    isin: ISIN,
    stock: { code: '101360', name: '에코앤드림' },
    grid: null,
    request: null,
    accum: null,
    eta_s: 240,
  };
  const today = (live: boolean): TickTodayResponse => ({ access: true, date: D, rows: [], live });

  beforeEach(() => {
    // 오늘 = 2026-10-16(금) 13:50 KST — 픽스처 날짜가 「오늘」 이 된다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-16T04:50:00Z'));
    for (const f of Object.values(api)) f.mockReset();
    push.mockReset();
    api.fetchTickDay.mockResolvedValue(day);
    api.fetchTickOpen.mockResolvedValue(open);
    searchParams = new URLSearchParams({ isin: ISIN, d: D });
  });

  it('today live=false → 「당일 자료 준비 중」 · /api/ticks/live 요청 0', async () => {
    api.fetchTickToday.mockResolvedValue(today(false));
    render(<TickViewerPage />);
    expect(await screen.findByText('당일 자료 준비 중')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.fetchTickLive).not.toHaveBeenCalled();
  });

  it('today live=true · queued → 「하루치 받는 중 · 대기 2건」 카드 → 취소 → 목록 · 더 요청하지 않음', async () => {
    api.fetchTickToday.mockResolvedValue(today(true));
    api.fetchTickLive.mockResolvedValue({
      status: 200,
      bytes: new Uint8Array(0),
      meta: { epoch: 'e', offsetEnd: 0, lastRecvNs: null, state: 'queued', queue: 2, complete: false },
    });
    render(<TickViewerPage />);
    expect(await screen.findByText(/하루치 받는 중/)).toBeTruthy();
    expect(await screen.findByText(/대기 2건/)).toBeTruthy();
    expect(api.fetchTickLive).toHaveBeenCalledWith({ isin: ISIN, ex: 'KRX', epoch: null, offset: 0 });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('isin='));
    const n = api.fetchTickLive.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.fetchTickLive.mock.calls.length).toBe(n);
  });

  it('today live=true · ready → 뷰어(끝 틱) · 공급 배지 「당일」', async () => {
    api.fetchTickToday.mockResolvedValue(today(true));
    api.fetchTickLive.mockResolvedValueOnce({
      status: 200,
      bytes: chunk(0, Number.MAX_SAFE_INTEGER),
      meta: { epoch: 'e', offsetEnd: 10, lastRecvNs: null, state: 'ready', queue: 0, complete: true },
    });
    api.fetchTickLive.mockResolvedValue({
      status: 200,
      bytes: new Uint8Array(0),
      meta: { epoch: 'e', offsetEnd: 10, lastRecvNs: null, state: 'ready', queue: 0, complete: true },
    });
    render(<TickViewerPage />);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tick-current"]')?.textContent ?? '').toMatch(
        new RegExp(`^${endTime(S2).replace(/\./g, '\\.')}`),
      ),
    );
    expect(document.querySelector('[data-slot="tick-supply"]')?.getAttribute('data-supply')).toBe('live');
  });
});
