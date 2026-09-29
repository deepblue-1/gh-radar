import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { strategyEventKey, type StrategyEventRow } from '@gh-radar/shared';

/**
 * Phase 25-07 Task 1 — 주문로그 피드 훅 (D-07 · R10 · R2).
 *
 * 잠그는 것:
 *  - 오늘: 마운트 조회 1회 · 복원 성공 뒤 도착한 batch 행만 newKeys(3초 뒤 빠짐) · 조회 실패 = error + 푸시 행 유지
 *  - retry() = 조회 1회 · relay ready 전이 = 조회 1회(마운트 뒤 첫 ready 포함 — WR-05) · 마운트 때 ready 면 추가 조회 없음 · 폴링 없음
 *  - 과거일: 그 날짜로 조회 · 푸시 무시 · newKeys 비어 있음
 *  - useUnseenOrderLogCount: 가려진 동안 범위 안 batch 행 수 누적 · 보이면 0
 *
 * 시계는 픽스처 거래일(2026-09-29 KST)로 고정한다 — 훅의 「오늘」 이 shared `kstDateIso()` 라서.
 */

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;
let mockRelay: RelayShape;

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

const fetchStrategyEventsMock = vi.fn();
vi.mock('@/lib/strategy-events-api', () => ({
  fetchStrategyEvents: (date?: string) => fetchStrategyEventsMock(date),
}));

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { NEW_LINE_HIGHLIGHT_MS, useOrderLogFeed, useUnseenOrderLogCount } from '../use-order-log-feed';
import { FIXTURE_ACCOUNT_NO, STRATEGY_DAY_BY_NAME } from '@/test-fixtures/strategy-day';

const exposed = STRATEGY_DAY_BY_NAME.exposed!;
const buy12451 = STRATEGY_DAY_BY_NAME.buy12451!;
const entered1 = STRATEGY_DAY_BY_NAME.entered1!;
const queued12451 = STRATEGY_DAY_BY_NAME.queued12451!;
const fill12451 = STRATEGY_DAY_BY_NAME.fill12451!;

/** 스토어에 푸시가 들어온 것처럼 — 누적 목록 + 마지막 삽입분 batch. */
function push(rows: StrategyEventRow[]) {
  const prev = mockRelay.strategyEvents;
  mockRelay = {
    ...mockRelay,
    strategyEvents: [...prev, ...rows],
    strategyEventsBatch: { seq: mockRelay.strategyEventsBatch.seq + 1, rows },
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
  fetchStrategyEventsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOrderLogFeed — 오늘', () => {
  it('마운트 조회 1회(날짜 인자 없음 — 서버가 KST 오늘) · 복원 rows 오름차순', async () => {
    fetchStrategyEventsMock.mockResolvedValue([exposed, buy12451]);
    const { result } = renderHook(() => useOrderLogFeed());
    expect(result.current.status).toBe('loading');
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith(undefined);
    expect(result.current.status).toBe('ready');
    expect(result.current.isToday).toBe(true);
    expect(result.current.date).toBe('2026-09-29');
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);
  });

  it('복원 성공 뒤 batch 행이 newKeys 에 들어가고 3,000ms 뒤 빠진다 · 복원 줄은 강조 없음', async () => {
    fetchStrategyEventsMock.mockResolvedValue([exposed]);
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    push([buy12451, entered1]);
    rerender();
    expect(result.current.rows).toHaveLength(3);
    expect([...result.current.newKeys].sort()).toEqual([strategyEventKey(buy12451), strategyEventKey(entered1)].sort());
    expect(result.current.newKeys.has(strategyEventKey(exposed))).toBe(false);
    expect(result.current.latestPush?.rows).toEqual([buy12451, entered1]);

    act(() => {
      vi.advanceTimersByTime(NEW_LINE_HIGHLIGHT_MS - 1);
    });
    expect(result.current.newKeys.size).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.newKeys.size).toBe(0);
    expect(NEW_LINE_HIGHLIGHT_MS).toBe(3000);
  });

  it('프레임 둘이 한 렌더로 합쳐져도 두 프레임 줄을 모두 강조한다(스토어 키 비교 — batch 는 마지막 것만 든다)', async () => {
    fetchStrategyEventsMock.mockResolvedValue([exposed]);
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    push([buy12451]);
    push([entered1]); // 렌더 없이 연속 — strategyEventsBatch.rows 는 entered1 뿐
    rerender();
    expect([...result.current.newKeys].sort()).toEqual([strategyEventKey(buy12451), strategyEventKey(entered1)].sort());
    expect(result.current.latestPush?.rows).toEqual([buy12451, entered1]);
  });

  it('조회 실패 → status error · 푸시 행은 rows 에 남는다 · retry() → 조회 1회', async () => {
    fetchStrategyEventsMock.mockRejectedValueOnce(new Error('500'));
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(result.current.status).toBe('error');
    push([buy12451]);
    rerender();
    expect(result.current.rows).toEqual([buy12451]);

    fetchStrategyEventsMock.mockResolvedValueOnce([exposed]);
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);
  });

  it('relay ready 전이 → 조회 1회 — 마운트 뒤 첫 ready 도 포함 · 재진입도 1회 · 폴링 없음 (WR-05)', async () => {
    mockRelay = { ...mockRelay, status: 'connecting' };
    fetchStrategyEventsMock.mockResolvedValue([]);
    const { rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);

    mockRelay = { ...mockRelay, status: 'ready' }; // 첫 ready — 복원 ~ 인증 사이 누락을 메운다
    rerender();
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);

    // ready 유지 중 리렌더는 전이가 아니다.
    rerender();
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);

    mockRelay = { ...mockRelay, status: 'reconnecting' };
    rerender();
    mockRelay = { ...mockRelay, status: 'ready' }; // 재진입
    rerender();
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(3);

    // 폴링 없음 — 시간이 흘러도 더 부르지 않는다.
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(3);
  });

  it('복원이 relay 인증보다 먼저 끝나 그 사이 적재된 이벤트는 첫 ready 재조회로 채워진다 — 누락 0 (WR-05)', async () => {
    mockRelay = { ...mockRelay, status: 'connecting' };
    // 마운트 조회: 그 시점 DB 에는 exposed 만 있다.
    fetchStrategyEventsMock.mockResolvedValueOnce([exposed]);
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq]);

    // 복원 응답 뒤 · 인증 전에 buy12451 이 적재됐다 — relay 는 재생하지 않으므로 푸시로는 오지 않는다.
    fetchStrategyEventsMock.mockResolvedValueOnce([exposed, buy12451]);
    mockRelay = { ...mockRelay, status: 'ready' };
    rerender();
    await flush();
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);
    expect(result.current.status).toBe('ready');
  });

  it('마운트 조회가 진행 중일 때 첫 ready 가 오면 새로 조회하고 옛 응답은 버린다 (WR-05)', async () => {
    mockRelay = { ...mockRelay, status: 'connecting' };
    let resolveFirst: (rows: StrategyEventRow[]) => void = () => {};
    fetchStrategyEventsMock.mockImplementationOnce(
      () => new Promise<StrategyEventRow[]>((resolve) => { resolveFirst = resolve; }),
    );
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);

    fetchStrategyEventsMock.mockResolvedValueOnce([exposed, buy12451]);
    mockRelay = { ...mockRelay, status: 'ready' };
    rerender();
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);

    // 늦게 도착한 마운트 응답(인증 전 DB 읽기)은 버린다.
    await act(async () => {
      resolveFirst([exposed]);
      await Promise.resolve();
    });
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);
  });

  it('마운트 때 이미 ready 면 마운트 조회 1회뿐 — 추가 조회 없음 (WR-05)', async () => {
    fetchStrategyEventsMock.mockResolvedValue([]);
    const { rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    rerender();
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
  });

  it('어제 거래일 푸시 행은 받지 않는다', async () => {
    fetchStrategyEventsMock.mockResolvedValue([]);
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    push([{ ...queued12451, seq: 900, tradeDate: '2026-09-28' }]);
    rerender();
    expect(result.current.rows).toEqual([]);
    expect(result.current.newKeys.size).toBe(0);
  });

  it('언마운트 시 새 줄 타이머를 정리한다', async () => {
    fetchStrategyEventsMock.mockResolvedValue([]);
    const { rerender, unmount } = renderHook(() => useOrderLogFeed());
    await flush();
    push([buy12451]);
    rerender();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useOrderLogFeed — 과거일', () => {
  it('그 날짜로 조회 · 푸시 무시 · newKeys 비어 있음', async () => {
    fetchStrategyEventsMock.mockResolvedValue([exposed]);
    const { result, rerender } = renderHook(() => useOrderLogFeed({ date: '2026-09-26' }));
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith('2026-09-26');
    expect(result.current.isToday).toBe(false);
    push([{ ...buy12451, tradeDate: '2026-09-26' }]);
    rerender();
    expect(result.current.rows).toEqual([exposed]);
    expect(result.current.newKeys.size).toBe(0);
    expect(result.current.latestPush).toBeNull();
  });
});

describe('useUnseenOrderLogCount — 새 로그 배지 (R2)', () => {
  it('가려진 동안 범위 안 batch 행 수 누적 · 범위 밖 제외 · 보이면 0', async () => {
    fetchStrategyEventsMock.mockResolvedValue([]);
    let visible = false;
    const { result, rerender } = renderHook(() => {
      const feed = useOrderLogFeed();
      return useUnseenOrderLogCount(feed, { accountNo: FIXTURE_ACCOUNT_NO }, visible);
    });
    await flush();
    expect(result.current).toBe(0);

    push([exposed, buy12451, { ...fill12451, accountNo: '9999999901' }]);
    rerender();
    expect(result.current).toBe(2);
    push([queued12451]);
    rerender();
    expect(result.current).toBe(3);

    visible = true;
    rerender();
    expect(result.current).toBe(0);
    push([entered1]); // 보이는 동안은 세지 않는다
    rerender();
    expect(result.current).toBe(0);

    visible = false;
    rerender();
    expect(result.current).toBe(0);
  });

  it('피드가 없으면(Provider 밖) 0', () => {
    const { result } = renderHook(() => useUnseenOrderLogCount(null, { accountNo: FIXTURE_ACCOUNT_NO }, false));
    expect(result.current).toBe(0);
  });
});
