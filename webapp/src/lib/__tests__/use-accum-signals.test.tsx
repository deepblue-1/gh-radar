import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { StrategyEventRow } from '@gh-radar/shared';

/**
 * quick-261018-rfy D-02 — 작업대 「매집」 패널 복원 훅.
 *
 * 잠그는 것:
 *  - 마운트 → fetchAccumSignals 1회(날짜 인자 없음 — 서버가 KST 오늘)
 *  - relay status 가 ready 아닌 값 → ready 로 바뀌면 1회 더 · ready 유지 리렌더는 0회 · 폴링 없음
 *  - 복원 ∪ 라이브(accumSignalEvents · tradeDate 오늘만)를 합쳐 isin 별 최신만 AccumSignal 로 — 라이브의 늦은 행이 복원 행을 이긴다
 *  - 첫 요청이 끝나면(성공 · 실패) filled = true · 실패해도 라이브 행은 보인다
 *
 * 시계는 픽스처 거래일(2026-09-29 KST)로 고정한다 — 훅의 「오늘」 이 shared `kstDateIso()` 라서.
 */

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;
let mockRelay: RelayShape;

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

const fetchAccumSignalsMock = vi.fn();
vi.mock('@/lib/accum-signals-api', () => ({
  fetchAccumSignals: (date?: string) => fetchAccumSignalsMock(date),
}));

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { useAccumSignals } from '../use-accum-signals';
import { STRATEGY_DAY_BY_NAME, kstMs } from '@/test-fixtures/strategy-day';

const exposed = STRATEGY_DAY_BY_NAME.exposed!;

/** kind 16 행 — fixture exposed(계좌 없음 · 2026-09-29) 위에 매집 칸만 덮는다. */
function ac(over: Partial<StrategyEventRow>): StrategyEventRow {
  return {
    ...exposed,
    kind: 16,
    qty: 1,
    expectedCum: 1,
    condThreshold: 100_000_000,
    message: '',
    ...over,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T10:00:00+09:00'));
  mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' };
  fetchAccumSignalsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAccumSignals', () => {
  it('마운트 조회 1회(날짜 인자 없음) · 복원 행 → AccumSignal · filled', async () => {
    fetchAccumSignalsMock.mockResolvedValue([
      ac({ isin: 'KR7000020008', seq: 1, gwTimeMs: kstMs('2026-09-29', '09:30:00.000') }),
      ac({ isin: 'KR7000040006', seq: 2, gwTimeMs: kstMs('2026-09-29', '09:31:00.000'), qty: 2 }),
    ]);
    const { result } = renderHook(() => useAccumSignals());
    expect(result.current.filled).toBe(false);
    await flush();
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(1);
    expect(fetchAccumSignalsMock).toHaveBeenCalledWith(undefined);
    expect(result.current.filled).toBe(true);
    expect(result.current.signals.map((s) => [s.isin, s.state]).sort()).toEqual([
      ['KR7000020008', 1],
      ['KR7000040006', 2],
    ]);
  });

  it('relay 가 ready 아닌 값 → ready 로 바뀌면 1회 더 · ready 유지 리렌더는 0회', async () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'connecting' };
    fetchAccumSignalsMock.mockResolvedValue([]);
    const { rerender } = renderHook(() => useAccumSignals());
    await flush();
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(1);
    mockRelay = { ...mockRelay, status: 'ready' };
    rerender();
    await flush();
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(2);
    rerender();
    await flush();
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(2);
    // 폴링 없음 — 시간이 흘러도 더 부르지 않는다.
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(2);
  });

  it('마운트 때 이미 ready 면 추가 조회 없음', async () => {
    fetchAccumSignalsMock.mockResolvedValue([]);
    const { rerender } = renderHook(() => useAccumSignals());
    await flush();
    rerender();
    await flush();
    expect(fetchAccumSignalsMock).toHaveBeenCalledTimes(1);
  });

  it('복원 ∪ 라이브 — 같은 isin 은 늦은 행(라이브)이 이긴다 · 다른 날 라이브 행은 버린다', async () => {
    fetchAccumSignalsMock.mockResolvedValue([
      ac({ isin: 'KR7000020008', seq: 1, gwTimeMs: kstMs('2026-09-29', '09:30:00.000'), condThreshold: 1e8 }),
    ]);
    const { result, rerender } = renderHook(() => useAccumSignals());
    await flush();
    expect(result.current.signals.map((s) => s.netKrw)).toEqual([1e8]);
    mockRelay = {
      ...mockRelay,
      accumSignalEvents: [
        ac({ isin: 'KR7000020008', seq: 5, gwTimeMs: kstMs('2026-09-29', '09:45:00.000'), condThreshold: 3e8, qty: 2 }),
        ac({ isin: 'KR7000040006', seq: 6, gwTimeMs: kstMs('2026-09-29', '09:46:00.000') }),
        ac({ isin: 'KR7000060004', seq: 7, tradeDate: '2026-09-28', gwTimeMs: kstMs('2026-09-28', '09:46:00.000') }),
      ],
    };
    rerender();
    const byIsin = new Map(result.current.signals.map((s) => [s.isin, s]));
    expect([...byIsin.keys()].sort()).toEqual(['KR7000020008', 'KR7000040006']);
    expect(byIsin.get('KR7000020008')?.netKrw).toBe(3e8);
    expect(byIsin.get('KR7000020008')?.state).toBe(2);
  });

  it('매도 경보 (quick-261019-j1w) — 라이브 에지 행 5 가 최신이면 켜지고 · 종료 행 4 가 오면 꺼진다', async () => {
    fetchAccumSignalsMock.mockResolvedValue([
      ac({ isin: 'KR7000020008', seq: 1, gwTimeMs: kstMs('2026-09-29', '09:30:00.000'), queueCase: 1, hasRemaining: false }),
    ]);
    const { result, rerender } = renderHook(() => useAccumSignals());
    await flush();
    expect(result.current.signals[0]?.sellWarn).toBe(false);
    const edge = ac({
      isin: 'KR7000020008',
      seq: 5,
      gwTimeMs: kstMs('2026-09-29', '09:31:00.000'),
      queueCase: 5,
      hasRemaining: true,
      condMetric: 1,
    });
    mockRelay = { ...mockRelay, accumSignalEvents: [edge] };
    rerender();
    expect(result.current.signals).toHaveLength(1);
    expect(result.current.signals[0]).toMatchObject({ sellWarn: true, sellWarns: 1, row: 5, state: 1 });
    mockRelay = {
      ...mockRelay,
      accumSignalEvents: [
        edge,
        ac({
          isin: 'KR7000020008',
          seq: 9,
          gwTimeMs: kstMs('2026-09-29', '09:40:00.000'),
          qty: 3,
          queueCase: 4,
          hasRemaining: false,
          condMetric: 1,
        }),
      ],
    };
    rerender();
    expect(result.current.signals[0]).toMatchObject({ sellWarn: false, state: 3, row: 4 });
  });

  it('조회 실패 → filled true · 라이브 행은 보인다', async () => {
    fetchAccumSignalsMock.mockRejectedValue(new Error('500'));
    mockRelay = {
      ...mockRelay,
      accumSignalEvents: [ac({ isin: 'KR7000020008', seq: 1, gwTimeMs: kstMs('2026-09-29', '09:30:00.000') })],
    };
    const { result } = renderHook(() => useAccumSignals());
    expect(result.current.signals).toHaveLength(1);
    await flush();
    expect(result.current.filled).toBe(true);
    expect(result.current.signals.map((s) => s.isin)).toEqual(['KR7000020008']);
  });

  it('state 범위 밖 · kind 16 아닌 행은 버린다', async () => {
    fetchAccumSignalsMock.mockResolvedValue([
      ac({ isin: 'KR7000020008', seq: 1, qty: 0 }),
      { ...exposed, seq: 2 },
    ]);
    const { result } = renderHook(() => useAccumSignals());
    await flush();
    expect(result.current.signals).toEqual([]);
  });
});
