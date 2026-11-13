/**
 * Phase 42 Plan 03 Task 2 — 일 이동평균용 앞 거래일 종가(`stock_daily_ohlcv` 브라우저 직접 읽기) + (코드, 날짜)마다 한 번 받는 훅.
 *
 * 깨지면: 일 이동평균이 그날(장중) 종가까지 「앞 거래일」 로 세거나, 칩을 켜고 끌 때마다 다시 받거나,
 *   종목 · 날짜를 바꿔도 앞 요청이 살아 남아 엉뚱한 종가로 선을 그린다.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── createClient mock — fetchPrevCloses 호출 체인 ──
//   supabase.from('stock_daily_ohlcv').select('date, close').eq('code', code).lt('date', iso)
//     .order('date', { ascending: false }).limit(n) [.abortSignal(signal)]  →  await → { data, error }
// limit() 은 호출마다 새 thenable 을 돌려준다(요청마다 신호 · 응답을 따로 잡는다).

interface Call {
  signal: AbortSignal | null;
  resolve: (v: { data: unknown; error: unknown }) => void;
}
let calls: Call[] = [];
/** true 면 응답을 테스트가 손으로 준다(`calls[k].resolve`) · false 면 `finalResolved` 로 바로 응답. */
let manual = false;
let finalResolved: { data: unknown; error: unknown } = { data: [], error: null };

function makeThenable() {
  const call: Call = { signal: null, resolve: () => {} };
  const p = manual
    ? new Promise<{ data: unknown; error: unknown }>((res) => {
        call.resolve = res;
      })
    : Promise.resolve(finalResolved);
  calls.push(call);
  const t = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
    abortSignal: (s: AbortSignal) => {
      call.signal = s;
      return t;
    },
  };
  return t;
}

const limitMock = vi.fn<(n: number) => ReturnType<typeof makeThenable>>(() => makeThenable());
const orderMock = vi.fn<(c: string, o: { ascending: boolean }) => { limit: typeof limitMock }>(() => ({
  limit: limitMock,
}));
const ltMock = vi.fn<(c: string, v: string) => { order: typeof orderMock }>(() => ({ order: orderMock }));
const eqMock = vi.fn<(c: string, v: string) => { lt: typeof ltMock }>(() => ({ lt: ltMock }));
const selectMock = vi.fn<(s: string) => { eq: typeof eqMock }>(() => ({ eq: eqMock }));
const fromMock = vi.fn<(t: string) => { select: typeof selectMock }>(() => ({ select: selectMock }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: fromMock }),
}));

import { PREV_CLOSES_N } from '../candle-ma';
import { PREV_CLOSE_MAX_GAP_WEEKDAYS, fetchPrevCloses } from '../daily-closes';
import { usePrevCloses } from '../use-prev-closes';

beforeEach(() => {
  calls = [];
  manual = false;
  finalResolved = { data: [], error: null };
  for (const m of [fromMock, selectMock, eqMock, ltMock, orderMock, limitMock]) m.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchPrevCloses', () => {
  it('앞 거래일만 · 내림차순 · limit 뒤 뒤집어 오름차순 · 종가 0 제외 · 문자열 → 수', async () => {
    finalResolved = {
      data: [
        { date: '2026-10-29', close: '120.00' },
        { date: '2026-10-28', close: 0 },
        { date: '2026-10-27', close: 118 },
      ],
      error: null,
    };
    const out = await fetchPrevCloses('005930', '20261030', 239);
    expect(fromMock).toHaveBeenCalledWith('stock_daily_ohlcv');
    expect(selectMock).toHaveBeenCalledWith('date, close');
    expect(eqMock).toHaveBeenCalledWith('code', '005930');
    expect(ltMock).toHaveBeenCalledWith('date', '2026-10-30');
    expect(orderMock).toHaveBeenCalledWith('date', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(239);
    expect(out).toEqual([118, 120]);
  });

  it('signal 을 주면 abortSignal(signal) 이 불리고 · 안 주면 안 불린다', async () => {
    const ac = new AbortController();
    await fetchPrevCloses('005930', '20261030', 10, ac.signal);
    expect(calls[0]!.signal).toBe(ac.signal);
    await fetchPrevCloses('005930', '20261030', 10);
    expect(calls[1]!.signal).toBeNull();
  });

  it('연속성 — 가장 가까운 행이 평일 PREV_CLOSE_MAX_GAP_WEEKDAYS 넘게 떨어지면 [] · 주말 · 긴 연휴 공백은 그대로(IN-04)', async () => {
    expect(PREV_CLOSE_MAX_GAP_WEEKDAYS).toBe(6);
    // 10-19(월) → 10-30(금): 사이 평일 8일 — 앞 거래일 행이 빠졌다(이틀 전 종가부터 쓰지 않는다)
    finalResolved = {
      data: [
        { date: '2026-10-19', close: 120 },
        { date: '2026-10-16', close: 118 },
      ],
      error: null,
    };
    await expect(fetchPrevCloses('005930', '20261030', 239)).resolves.toEqual([]);
    // 가장 가까운 행의 종가가 0 이면 그다음 유효 행 기준(10-29 종가 0 · 10-19 → 평일 8일)
    finalResolved = {
      data: [
        { date: '2026-10-29', close: 0 },
        { date: '2026-10-19', close: 120 },
      ],
      error: null,
    };
    await expect(fetchPrevCloses('005930', '20261030', 239)).resolves.toEqual([]);
    // 금 → 월(주말 공백 · 평일 0일)
    finalResolved = {
      data: [
        { date: '2026-10-30', close: 121 },
        { date: '2026-10-29', close: 120 },
      ],
      error: null,
    };
    await expect(fetchPrevCloses('005930', '20261102', 239)).resolves.toEqual([120, 121]);
    // 10-02(금) → 10-12(월): 사이 평일 5일(긴 연휴) — 정상 공백
    finalResolved = { data: [{ date: '2026-10-02', close: 119 }], error: null };
    await expect(fetchPrevCloses('005930', '20261012', 239)).resolves.toEqual([119]);
    // 평일 6일 공백까지 허용 · 7일이면 []
    finalResolved = { data: [{ date: '2026-10-01', close: 119 }], error: null };
    await expect(fetchPrevCloses('005930', '20261012', 239)).resolves.toEqual([119]);
    finalResolved = { data: [{ date: '2026-09-30', close: 119 }], error: null };
    await expect(fetchPrevCloses('005930', '20261012', 239)).resolves.toEqual([]);
  });

  it('오류 응답이면 throw · data null 이면 빈 배열', async () => {
    finalResolved = { data: null, error: { message: 'boom' } };
    await expect(fetchPrevCloses('005930', '20261030', 10)).rejects.toEqual({ message: 'boom' });
    finalResolved = { data: null, error: null };
    await expect(fetchPrevCloses('005930', '20261030', 10)).resolves.toEqual([]);
  });
});

describe('usePrevCloses', () => {
  const YMD = '20261030';

  it('코드가 없으면 요청 없이 nocode', async () => {
    const { result } = renderHook(() => usePrevCloses(null, YMD, true));
    expect(result.current).toBe('nocode');
    await act(async () => {});
    expect(fromMock).not.toHaveBeenCalled();
    const u = renderHook(() => usePrevCloses(undefined, YMD, true));
    expect(u.result.current).toBe('nocode');
  });

  it('enabled false 면 요청 없이 idle', async () => {
    const { result } = renderHook(() => usePrevCloses('005930', YMD, false));
    expect(result.current).toBe('idle');
    await act(async () => {});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('처음 loading → 배열 · PREV_CLOSES_N 개를 받는다 · 같은 (코드, 날짜)로 껐다 켜도 요청 1회', async () => {
    finalResolved = { data: [{ date: '2026-10-29', close: 120 }, { date: '2026-10-28', close: 110 }], error: null };
    const { result, rerender } = renderHook(({ en }) => usePrevCloses('005930', YMD, en), {
      initialProps: { en: true },
    });
    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toEqual([110, 120]));
    expect(limitMock).toHaveBeenCalledWith(PREV_CLOSES_N);
    expect(ltMock).toHaveBeenCalledWith('date', '2026-10-30');

    rerender({ en: false });
    expect(result.current).toEqual([110, 120]); // 받아 둔 값은 꺼져도 그대로
    rerender({ en: true });
    await act(async () => {});
    expect(result.current).toEqual([110, 120]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('실패 → error · 다시 시도하지 않는다(껐다 켜도)', async () => {
    finalResolved = { data: null, error: { message: 'boom' } };
    const { result, rerender } = renderHook(({ en }) => usePrevCloses('005930', YMD, en), {
      initialProps: { en: true },
    });
    await waitFor(() => expect(result.current).toBe('error'));
    rerender({ en: false });
    rerender({ en: true });
    await act(async () => {});
    expect(result.current).toBe('error');
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('코드가 바뀌면 앞 요청을 취소하고 새로 받는다 · 늦게 온 앞 응답은 버린다', async () => {
    manual = true;
    const { result, rerender } = renderHook(({ code }) => usePrevCloses(code, YMD, true), {
      initialProps: { code: '005930' },
    });
    await act(async () => {});
    expect(calls).toHaveLength(1);
    const first = calls[0]!;
    expect(first.signal?.aborted).toBe(false);

    rerender({ code: '000660' });
    await act(async () => {});
    expect(first.signal?.aborted).toBe(true);
    expect(calls).toHaveLength(2);
    expect(eqMock).toHaveBeenLastCalledWith('code', '000660');
    expect(result.current).toBe('loading');

    await act(async () => {
      first.resolve({ data: [{ date: '2026-10-29', close: 999 }], error: null });
    });
    expect(result.current).toBe('loading'); // 취소된 앞 응답은 반영하지 않는다
    await act(async () => {
      calls[1]!.resolve({ data: [{ date: '2026-10-29', close: 50 }], error: null });
    });
    expect(result.current).toEqual([50]);
  });

  it('날짜가 바뀌면 새로 받는다 · 언마운트 때 취소한다', async () => {
    manual = true;
    const { rerender, unmount } = renderHook(({ ymd }) => usePrevCloses('005930', ymd, true), {
      initialProps: { ymd: YMD },
    });
    await act(async () => {});
    rerender({ ymd: '20261029' });
    await act(async () => {});
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal?.aborted).toBe(true);
    expect(ltMock).toHaveBeenLastCalledWith('date', '2026-10-29');
    unmount();
    expect(calls[1]!.signal?.aborted).toBe(true);
  });
});
