import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { zstdCompressSync } from 'node:zlib';

import {
  iterRecords,
  type TickDayResponse,
  type TickLiveMeta,
  type TickOpenResponse,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnOrder,
  type TickOwnResponse,
  type TickTodayResponse,
} from '@gh-radar/shared';

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
  fetchTickOwn: vi.fn(),
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
import { TICK_TODAY_RECHECK_MS, TickViewerPage } from '@/components/ticks/tick-viewer-page';
import { buildMsgRows, ownLineRec } from '@/lib/ticks/msg-rows';
import { buildOwnModel } from '@/lib/ticks/own-model';
import { appendTickBytes, type TickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';
import { a3TimeMs, fmtTickTime } from '@gh-radar/shared';

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
/** 우리 체결 없음(Phase 38) — 뷰어가 열 때 부르는 `/api/ticks/own` 의 기본 응답. */
const OWN_EMPTY: TickOwnResponse = { access: true, date: D, exchange: 'KRX', isin: ISIN, servers: [], fills: [], events: [], orders: [] };

beforeEach(() => {
  api.fetchTickOwn.mockResolvedValue(OWN_EMPTY);
});

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

  it('과거 틱 → onAtEnd(false) · 새 틱이 없으면 배지 없음 · 증분이 와도 커서 제자리 · 「새 틱 n건」 클릭 = onGoEnd + 끝 틱', async () => {
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
    expect(screen.queryByRole('button', { name: /새 틱/ })).toBeNull();

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

  it('「최신 받기」 — 누르면 onRefresh · 받는 중이면 「받는 중」 비활성 · 실패면 「다시 받기」 · 콜백 없으면 버튼 없음', () => {
    const onRefresh = vi.fn();
    const live = { state: 'ready' as const, lastRecvNs: null, failing: false };
    const v = render(<TickHeader {...base} live={live} />);
    expect(screen.queryByRole('button', { name: '최신 받기' })).toBeNull();
    v.rerender(<TickHeader {...base} live={{ ...live, onRefresh, fetchedAt: Date.UTC(2026, 9, 16, 4, 50, 0) }} />);
    const btn = screen.getByRole('button', { name: '최신 받기' });
    expect(btn.getAttribute('title')).toBe('마지막으로 받은 시각 13:50:00');
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    v.rerender(<TickHeader {...base} live={{ ...live, onRefresh, refreshing: true }} />);
    expect((screen.getByRole('button', { name: '받는 중' }) as HTMLButtonElement).disabled).toBe(true);
    v.rerender(<TickHeader {...base} live={{ ...live, onRefresh, refreshFailed: true }} />);
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeTruthy();
  });

  it('incomplete(X-Tick-Complete false) → 「당일 자료 일부 빠짐」 배지(role=status) · 없으면 배지 없음(WR-63)', () => {
    const v = render(<TickHeader {...base} live={{ state: 'ready', lastRecvNs: null, failing: false, incomplete: true }} />);
    const gap = v.container.querySelector('[data-slot="tick-live-gap"]');
    expect(gap?.textContent).toBe('당일 자료 일부 빠짐');
    expect(gap?.getAttribute('role')).toBe('status');
    v.rerender(<TickHeader {...base} live={{ state: 'ready', lastRecvNs: null, failing: false }} />);
    expect(v.container.querySelector('[data-slot="tick-live-gap"]')).toBeNull();
  });

  it('하루치 다시 받는 중(409 · refetching) → 「다시 받는 중」 비활성 · 누를 수 없다(IN-64)', () => {
    const onRefresh = vi.fn();
    render(<TickHeader {...base} live={{ state: 'loading', lastRecvNs: null, failing: false, onRefresh, refetching: true }} />);
    const btn = screen.getByRole('button', { name: '다시 받는 중' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('우리 알약(38-08 · D-09 · UAT 근거 · 주문 포함) — 「◆ 우리 k/n · 주문 m」 · ‹ › · 끝이면 비활성 · 상태 없으면 알약 없음', () => {
    const next = vi.fn();
    const v = render(<TickHeader {...base} ownNav={{ k: 0, n: 5, orders: 4, prev: null, next }} />);
    const pill = document.querySelector('[data-slot="tick-own-nav"]')!;
    expect(pill.textContent).toContain('◆ 우리 0/5 · 주문 4');
    expect((screen.getByRole('button', { name: '이전 우리 근거 · 주문 · 체결' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '다음 우리 근거 · 주문 · 체결' }));
    expect(next).toHaveBeenCalledTimes(1);
    v.rerender(<TickHeader {...base} ownNav={{ k: 5, n: 5, orders: 4, prev: vi.fn(), next: null }} />);
    expect((screen.getByRole('button', { name: '다음 우리 근거 · 주문 · 체결' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '이전 우리 근거 · 주문 · 체결' }) as HTMLButtonElement).disabled).toBe(false);
    v.rerender(<TickHeader {...base} ownNav={null} />);
    expect(document.querySelector('[data-slot="tick-own-nav"]')).toBeNull();
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
    api.fetchTickOwn.mockResolvedValue(OWN_EMPTY);
    searchParams = new URLSearchParams({ isin: ISIN, d: D });
  });

  it('진입 화면을 20:00 넘겨 열어 두면 「오늘」 을 다시 정한다 — 오늘 목록 → 격자 최근 날짜(IN-60)', async () => {
    vi.setSystemTime(new Date('2026-10-16T10:59:30Z')); // 19:59:30 KST
    searchParams = new URLSearchParams();
    api.fetchTickToday.mockResolvedValue(today(true));
    render(<TickViewerPage />);
    await waitFor(() => expect(api.fetchTickToday).toHaveBeenCalled());
    expect(api.fetchTickDay).toHaveBeenLastCalledWith(D);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICK_TODAY_RECHECK_MS);
    });
    // 20:00:30 — 장 밖이라 d 없이 「격자가 있는 최근 날짜」 를 묻는다
    await waitFor(() => expect(api.fetchTickDay).toHaveBeenLastCalledWith(undefined));
  });

  it('오늘이라도 격자(요청 변환 · 승격본)로 열면 공급 배지 = 「과거 격자」(IN-61)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    api.fetchTickOpen.mockResolvedValue({
      ...open,
      grid: {
        url: 'https://storage.example/grid',
        expiresIn: 600,
        bytes: 10,
        records: 1,
        a3_count: 0,
        mode: 'request',
        sources: [],
        fmt: 'pcapns-rec+zstd/1',
        first_recv_ms: null,
        last_recv_ms: null,
        created_at: '2026-10-16T05:00:00Z',
      },
    } as TickOpenResponse);
    render(<TickViewerPage />);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tick-body"]')?.getAttribute('data-state')).toBe('loading'),
    );
    expect(document.querySelector('[data-slot="tick-supply"]')?.getAttribute('data-supply')).toBe('grid');
    expect(api.fetchTickToday).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
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
    // 자동 갱신 없음 — 「최신 받기」 를 눌러야 증분 1회(2026-11-03)
    const calls = api.fetchTickLive.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.fetchTickLive.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole('button', { name: '최신 받기' }));
    await waitFor(() => expect(api.fetchTickLive.mock.calls.length).toBe(calls + 1));
  });

  /**
   * Phase 38 Plan 08 Task 2 — 우리 체결 조회 호출 수(SC-4 당일 · CLAUDE.md 공식 API 기준 3): 「↻ 최신 받기」 1회 = live 1 + own 1 ·
   * 자동 타이머 0 · 받는 중 다시 누름 = 둘 다 0 · epoch 교체(뷰어 재마운트) = own 1.
   */
  const metaOf = (over: Partial<TickLiveMeta> = {}): TickLiveMeta => ({
    epoch: 'e',
    offsetEnd: 10,
    lastRecvNs: null,
    state: 'ready',
    queue: 0,
    complete: true,
    ...over,
  });
  const FULL = { status: 200, bytes: chunk(0, Number.MAX_SAFE_INTEGER), meta: metaOf() };
  const NONE = { status: 200, bytes: new Uint8Array(0), meta: metaOf() };
  const openLive = async () => {
    api.fetchTickToday.mockResolvedValue(today(true));
    render(<TickViewerPage />);
    await waitFor(() => expect(document.querySelector('[data-slot="tick-current"]')).not.toBeNull());
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(1));
  };

  it('우리 체결 — 열 때 own 1 · 30초 그대로 0 · 「최신 받기」 1회 = live 1 + own 1 · 받는 중 다시 누름 = 둘 다 0', async () => {
    api.fetchTickLive.mockResolvedValueOnce(FULL);
    api.fetchTickLive.mockResolvedValue(NONE);
    await openLive();
    expect(api.fetchTickOwn).toHaveBeenCalledWith({ isin: ISIN, d: D, ex: 'KRX' });
    const live0 = api.fetchTickLive.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.fetchTickLive.mock.calls.length).toBe(live0);
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '최신 받기' }));
    await waitFor(() => expect(api.fetchTickLive.mock.calls.length).toBe(live0 + 1));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));

    // 받는 중 — live 응답을 붙잡아 두고 다시 누른다
    let release!: (v: typeof NONE) => void;
    api.fetchTickLive.mockReturnValueOnce(new Promise((r) => (release = r)));
    await waitFor(() => expect(screen.getByRole('button', { name: '최신 받기' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '최신 받기' }));
    await waitFor(() => expect(api.fetchTickLive.mock.calls.length).toBe(live0 + 2));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(3));
    const busy = await screen.findByRole('button', { name: '받는 중' });
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(api.fetchTickLive.mock.calls.length).toBe(live0 + 2);
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(3);
    await act(async () => {
      release(NONE);
    });
    await screen.findByRole('button', { name: '최신 받기' });
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(3);
  });

  it('우리 체결 — 최신 받기가 409(새 epoch) → 하루치 다시 · 뷰어 재마운트 = own 1 더', async () => {
    api.fetchTickLive
      .mockResolvedValueOnce(FULL)
      .mockResolvedValueOnce({ status: 409, bytes: new Uint8Array(0), meta: metaOf({ epoch: 'e2', offsetEnd: 0 }) })
      .mockResolvedValueOnce({ ...FULL, meta: metaOf({ epoch: 'e2' }) });
    api.fetchTickLive.mockResolvedValue({ ...NONE, meta: metaOf({ epoch: 'e2' }) });
    await openLive();
    fireEvent.click(screen.getByRole('button', { name: '최신 받기' }));
    // 클릭 = own 1(refreshKey) · 하루치 다시 받은 뒤 재마운트 = own 1
    await waitFor(() => expect(api.fetchTickLive).toHaveBeenCalledWith({ isin: ISIN, ex: 'KRX', epoch: 'e2', offset: 0 }));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(3);
  });
});

describe('TickViewer — 우리 체결 다시 받기 실패 표시(R2 WR-03)', () => {
  beforeEach(() => {
    api.fetchTickOwn.mockReset();
  });

  it('성공 → ownRefreshKey +1 실패 → 직전 우리 층(탭) 유지 + 「우리 체결을 받지 못했어요 · 직전 값」 · 다시 성공하면 사라짐', async () => {
    const OWN_A: TickOwnResponse = { ...OWN_EMPTY, servers: ['KB120'] };
    api.fetchTickOwn
      .mockResolvedValueOnce(OWN_A)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(OWN_A);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const live = { newCount: 0, onGoEnd: vi.fn(), onAtEnd: vi.fn() };
    const at = (k: number) => (
      <TickViewer session={S2} urlState={URL_STATE} initialT={null} isToday live={live} ownRefreshKey={k} />
    );
    const stale = () => document.querySelector('[data-slot="tick-own-stale"]');
    const v = render(at(0));
    await waitFor(() => expect(document.querySelector('[data-slot="tick-side-tabs"]')).not.toBeNull());
    expect(stale()).toBeNull();

    v.rerender(at(1));
    await waitFor(() => expect(stale()).not.toBeNull());
    expect(stale()!.textContent).toBe('우리 체결을 받지 못했어요 · 직전 값');
    expect(document.querySelector('[data-slot="tick-side-tabs"]')).not.toBeNull();

    v.rerender(at(2));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(stale()).toBeNull());
    warn.mockRestore();
  });

  it('처음 열기 실패 — 우리 층 없음(탭 · 표시 둘 다 없음 · 37 그대로)', async () => {
    api.fetchTickOwn.mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<TickViewer session={S2} urlState={URL_STATE} initialT={null} />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(document.querySelector('[data-slot="tick-side-tabs"]')).toBeNull();
    expect(document.querySelector('[data-slot="tick-own-stale"]')).toBeNull();
    warn.mockRestore();
  });
});

describe('TickViewer — 고른 우리 줄 배선(WR-04 · R2 IN-03)', () => {
  // S2 끝에서 60번째 수신 레코드 시각 근처 — 끝 틱으로 열린 전문 목록 창 안
  const recvMsAt = (p: number) => Number(S2.index.recvNs[S2.recvOrder[p]!]! / 1_000_000n);
  const T = recvMsAt(S2.recvOrder.length - 60);
  const ev = (gateway: string, orderNo: string, gwMs: number): TickOwnEvent => ({
    gateway,
    seq: 1,
    gw_time_ms: gwMs,
    kind: 3,
    group: 7,
    account_no: '1234563801',
    order_no: orderNo,
    price: 1000,
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
  });
  const aux = (orderNo: string, createdMs: number): TickOwnOrder => ({
    gateway: 'KB120',
    account_no: '1234563801',
    order_no: orderNo,
    side: 'B',
    price: 1000,
    qty: 10,
    origin: 'manual',
    created_ms: createdMs,
  });
  const live = { newCount: 0, onGoEnd: vi.fn(), onAtEnd: vi.fn() };
  const at = (k: number) => <TickViewer session={S2} urlState={URL_STATE} initialT={null} isToday live={live} ownRefreshKey={k} />;
  const selectedLine = () => document.querySelector<HTMLElement>('[data-slot="tick-own-order"][aria-selected="true"]');
  /** 「우리 주문」 탭 표에서 그 주문(모델 id) 행 클릭 — 체결 없는 주문은 그 주문 줄 선택(onOwnOrder). */
  async function pickFromTable(id: number) {
    const tab = await waitFor(() => {
      const t = document.querySelector<HTMLElement>('[data-slot="tick-side-tab"][data-tab="own"]');
      expect(t).not.toBeNull();
      return t!;
    });
    fireEvent.click(tab);
    const row = await waitFor(() => {
      const r = document.querySelector<HTMLElement>(`[data-slot="tick-own-table-row"][data-order="${id}"]`);
      expect(r).not.toBeNull();
      return r!;
    });
    fireEvent.click(row);
  }

  beforeEach(() => {
    api.fetchTickOwn.mockReset();
  });

  it('줄 선택 → 다시 받아 id 가 밀린 own(다른 게이트웨이의 더 이른 주문) → 같은 주문 줄이 강조', async () => {
    api.fetchTickOwn
      .mockResolvedValueOnce({ ...OWN_EMPTY, servers: ['KB120', 'KYOBO119'], events: [ev('KB120', 'E1', T)] })
      .mockResolvedValueOnce({
        ...OWN_EMPTY,
        servers: ['KB120', 'KYOBO119'],
        events: [ev('KYOBO119', 'K0', T - 1), ev('KB120', 'E1', T)],
      });
    const v = render(at(0));
    await pickFromTable(0); // E1
    await waitFor(() => expect(selectedLine()?.textContent).toContain('#E1'));
    expect(selectedLine()!.getAttribute('data-own-id')).toBe('0');

    v.rerender(at(1));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));
    // E1 의 id 는 0 → 1 로 밀렸지만 강조는 여전히 E1(id 로 기억했다면 K0 를 가리킨다)
    await waitFor(() => expect(selectedLine()?.getAttribute('data-own-id')).toBe('1'));
    expect(selectedLine()!.textContent).toContain('#E1');
  });

  it('줄 선택 → 다시 받아 그 줄 자리(기준 rec)가 옮겨지면 선택을 푼다(커서는 옛 기준 rec)', async () => {
    // 처음: 짝 없는 체결 + 보조 주문 행(주문 시각 = created_ms T) · 다시: 같은 주문에 더 이른 이벤트가 붙어 줄이 앞으로 옮겨짐
    // 바로 앞의 다른 ms 수신 레코드 — 옮겨진 줄도 전문 목록 창(커서 ± overscan) 안에 그려진다
    let pe = S2.recvOrder.length - 61;
    while (recvMsAt(pe) >= T) pe -= 1;
    const tEarly = recvMsAt(pe);
    const nofill: TickOwnFill = {
      gateway: 'KB120',
      seq: 9,
      gw_time_ms: T,
      account_no: '1234563801',
      order_no: 'A1',
      side: 'B',
      exec_price: 99_999,
      exec_qty: 1,
    };
    const base = { ...OWN_EMPTY, servers: ['KB120'], fills: [nofill], orders: [aux('A1', T)] };
    api.fetchTickOwn.mockResolvedValueOnce(base).mockResolvedValueOnce({ ...base, events: [ev('KB120', 'A1', tEarly)] });
    const v = render(at(0));
    await pickFromTable(0); // A1
    await waitFor(() => expect(selectedLine()?.textContent).toContain('#A1'));

    const before = selectedLine()!.getAttribute('data-pos');

    v.rerender(at(1));
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(2));
    // 그 주문 줄은 새 자리에 그려져 있지만(같은 주문 · 다른 자리) 선택은 풀렸다
    await waitFor(() => {
      const line = document.querySelector<HTMLElement>('[data-slot="tick-own-order"]');
      expect(line?.textContent).toContain('#A1');
      expect(line!.getAttribute('data-pos')).not.toBe(before);
    });
    expect(selectedLine()).toBeNull();
  });

  it('(R1 IN-02) 짝 없음 줄 선택 → 「우리 주문」 표에서 그 줄의 기준 전문(A3)으로 가는 행 클릭 → 줄 선택이 풀린다', async () => {
    const fillOf = (orderNo: string, seq: number, gwMs: number, px: number, qty: number): TickOwnFill => ({
      gateway: 'KB120',
      seq,
      gw_time_ms: gwMs,
      account_no: '1234563801',
      order_no: orderNo,
      side: 'B',
      exec_price: px,
      exec_qty: qty,
    });
    // 짝 없는 체결 F1 의 기준 전문(줄 다음 전문 · 거래소순)이 A3 인 자리를 찾고, 그 A3 에 짝지어질 체결 O2 를 둔다
    let own: TickOwnResponse | null = null;
    let base = -1;
    for (let p = S2.recvOrder.length - 80; p < S2.recvOrder.length - 20 && own === null; p++) {
      const f1 = fillOf('F1', 1, recvMsAt(p), 99_999, 1);
      const rows = buildMsgRows(S2, 'exchange', buildOwnModel(S2, { ...OWN_EMPTY, servers: ['KB120'], fills: [f1] }));
      const b = ownLineRec(rows, rows.ownPosOfFill[0]!);
      const j = b >= 0 ? S2.a3Of[b]! : -1;
      if (j < 0) continue;
      const o2 = fillOf('O2', 2, Math.round(a3TimeMs(S2.index, S2.a3, j)), S2.a3.px[j]!, S2.a3.qty[j]!);
      const cand: TickOwnResponse = { ...OWN_EMPTY, servers: ['KB120'], fills: [f1, o2] };
      const m = buildOwnModel(S2, cand);
      if (m.fills.find((f) => f.orderNo === 'O2')!.rec !== b) continue;
      own = cand;
      base = b;
    }
    expect(own).not.toBeNull();
    const m = buildOwnModel(S2, own!);
    const idOf = (no: string) => m.orders.find((o) => o.orderNo === no)!.id;
    api.fetchTickOwn.mockResolvedValue(own!);
    render(<TickViewer session={S2} urlState={URL_STATE} initialT={null} />);
    const nofillSelected = () => document.querySelector<HTMLElement>('[data-slot="tick-own-nofill"][aria-selected="true"]');

    await pickFromTable(idOf('F1')); // 주문 줄 없음 · 짝 없음 → 그 줄 선택(기준 전문 = base)
    await waitFor(() => expect(nofillSelected()).not.toBeNull());
    expect(m.fills.find((f) => f.orderNo === 'O2')!.rec).toBe(base);

    fireEvent.click(document.querySelector<HTMLElement>(`[data-slot="tick-own-table-row"][data-order="${idOf('O2')}"]`)!);
    await waitFor(() => expect(nofillSelected()).toBeNull());
  });
});

describe('TickViewer — 과거 격자 우리 체결 조회(Phase 38-08)', () => {
  beforeEach(() => {
    api.fetchTickOwn.mockReset();
    api.fetchTickOwn.mockResolvedValue(OWN_EMPTY);
  });

  it('열 때 own 1 · 10분 지나도 그대로(자동 타이머 0) · 재렌더 0', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const v = render(<TickViewer session={S2} urlState={URL_STATE} initialT={null} />);
    await waitFor(() => expect(api.fetchTickOwn).toHaveBeenCalledTimes(1));
    expect(api.fetchTickOwn).toHaveBeenCalledWith(URL_STATE);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    v.rerender(<TickViewer session={S2} urlState={{ ...URL_STATE }} initialT={null} />);
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
  });
});
