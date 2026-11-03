import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

import type { TickDayResponse, TickOpenGrid, TickOpenResponse } from '@gh-radar/shared';

/**
 * Phase 37 Plan 10 Task 1 — useTickGrid(서명 URL → fzstd 스트리밍 해제 → buildTickSession) · 페이지 `t` 의존성.
 *
 * 잠그는 것: 여러 청크 Response → ready(레코드 11,990) · 진행률 1 · 서명 URL 403 → open 재호출 1회 → 새 URL 로 ready ·
 * 재발급 뒤에도 실패 → error(더 두드리지 않음) · retry · 같은 키 동시 두 훅 → 격자 fetch 1회.
 * 페이지: ready 뒤 URL `t` 만 바뀌어 다시 그려져도 open · 격자 fetch 는 1회 그대로 · 커서(머리 시각) 그대로.
 */

const api = vi.hoisted(() => ({
  fetchTickDay: vi.fn(),
  fetchTickToday: vi.fn(),
  fetchTickOpen: vi.fn(),
  postTickConvert: vi.fn(),
  postTickCancel: vi.fn(),
  fetchTickOwn: vi.fn(),
}));
vi.mock('@/lib/ticks/tick-api', () => api);

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
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

import { TickViewerPage } from '@/components/ticks/tick-viewer-page';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, TICK_FIXTURE_RECORDS, tickGridZst } from '@/test-fixtures/tick-grid';

import { __resetTickGridCache, useTickGrid } from '../use-tick-grid';

const ZST = tickGridZst();
const urlOf = (v: number) => `https://storage.test/tick-grid/grid/${D}/KRX/${ISIN}.nightly.ticks.zst?token=t${v}`;

function grid(v = 1): TickOpenGrid {
  return {
    url: urlOf(v),
    expiresIn: 600,
    bytes: ZST.length,
    records: TICK_FIXTURE_RECORDS,
    a3_count: 3089,
    mode: 'nightly',
    sources: ['accum'],
    fmt: 'pcapns-rec+zstd/1',
    first_recv_ms: null,
    last_recv_ms: null,
    created_at: '2026-10-16T15:00:00Z',
  };
}

function openResp(v = 1): TickOpenResponse {
  return {
    access: true,
    date: D,
    exchange: 'KRX',
    isin: ISIN,
    stock: { code: '101360', name: '에코앤드림' },
    grid: grid(v),
    request: null,
    accum: null,
    eta_s: 240,
  };
}

/** 픽스처 zstd 바이트를 n 조각 스트림 Response 로. */
function zstResponse(pieces = 5): Response {
  const size = Math.ceil(ZST.length / pieces);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < ZST.length; i += size) c.enqueue(ZST.slice(i, i + size));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/zstd' } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  __resetTickGridCache();
  fetchMock.mockReset();
  for (const f of Object.values(api)) f.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTickGrid', () => {
  it('open null → idle · fetch 0', async () => {
    const { result } = renderHook(() => useTickGrid(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서명 URL → 여러 청크 → fzstd 해제 → 세션 ready · 진행률 1', async () => {
    fetchMock.mockImplementation(async () => zstResponse(7));
    const open = openResp();
    const t0 = performance.now();
    const { result } = renderHook(() => useTickGrid(open));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    console.info(`[use-tick-grid] 받기 + fzstd 해제 + 세션 ${(performance.now() - t0).toFixed(1)}ms (jsdom · ${ZST.length}B)`);
    expect(result.current.session?.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(result.current.progress).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(urlOf(1));
    expect(api.fetchTickOpen).not.toHaveBeenCalled();
  });

  it('서명 URL 403(만료) → open 1회 다시 → 새 URL 로 ready', async () => {
    api.fetchTickOpen.mockResolvedValue(openResp(2));
    fetchMock.mockImplementation(async (u: string) =>
      u.endsWith('t1') ? new Response('expired', { status: 403 }) : zstResponse(),
    );
    const { result } = renderHook(() => useTickGrid(openResp(1)));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    expect(api.fetchTickOpen).toHaveBeenCalledWith({ isin: ISIN, d: D, ex: 'KRX' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([urlOf(1), urlOf(2)]);
  });

  it('재발급 뒤에도 실패 → error(더 두드리지 않음) · retry → ready', async () => {
    api.fetchTickOpen.mockResolvedValue(openResp(2));
    fetchMock.mockResolvedValue(new Response('expired', { status: 403 }));
    const { result } = renderHook(() => useTickGrid(openResp(1)));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.session).toBeNull();

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => zstResponse());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx → 재발급 없이 error', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const { result } = renderHook(() => useTickGrid(openResp(1)));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(api.fetchTickOpen).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('같은 키 동시 두 훅 → 격자 fetch 1회 · 둘 다 같은 세션', async () => {
    fetchMock.mockImplementation(async () => zstResponse());
    const a = renderHook(() => useTickGrid(openResp(1)));
    const b = renderHook(() => useTickGrid(openResp(1)));
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.result.current.session).toBe(b.result.current.session);
  });
});

describe('TickViewerPage — URL t 의존성', () => {
  it('ready 뒤 t 만 바뀌어 다시 그려져도 open · 격자 fetch 1회 그대로 · 커서 그대로', async () => {
    const day: TickDayResponse = {
      access: true,
      dates: [D],
      date: D,
      rows: [],
      requests: [],
      eta_s: { KRX: 240, NXT: 120 },
    };
    api.fetchTickDay.mockResolvedValue(day);
    api.fetchTickOpen.mockResolvedValue(openResp(1));
    // 과거 격자 뷰어는 열 때 우리 체결 1회(Phase 38-08) — 빈 응답
    api.fetchTickOwn.mockResolvedValue({ access: true, date: D, exchange: 'KRX', isin: ISIN, servers: [], fills: [], events: [], orders: [] });
    fetchMock.mockImplementation(async () => zstResponse());
    searchParams = new URLSearchParams({ isin: ISIN, d: D, t: '13:30:00.000' });

    const view = render(<TickViewerPage />);
    const current = () => document.querySelector('[data-slot="tick-current"]')?.textContent ?? '';
    await waitFor(() => expect(current()).toMatch(/^13:30:/));
    const before = current();
    expect(screen.getByLabelText('호가 10단')).toBeTruthy();
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 커서가 replaceState 로 바꾼 t 가 useSearchParams 로 돌아온 상황(Next 15 동기화) — 다시 열지 않는다.
    searchParams = new URLSearchParams({ isin: ISIN, d: D, t: '13:45:00.000' });
    view.rerender(<TickViewerPage />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(current()).toBe(before);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // t 만 바뀌어도 우리 체결을 다시 부르지 않는다(열 때 1회 · 38-08)
    expect(api.fetchTickOwn).toHaveBeenCalledTimes(1);
  });
});
