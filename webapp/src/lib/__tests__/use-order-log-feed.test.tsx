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
  // opts 가 없으면 인자 1개로 기록한다 — 기존 단언 `toHaveBeenCalledWith(undefined)` 가 그대로 읽힌다.
  fetchStrategyEvents: (date?: string, opts?: { limitFeature?: boolean }) =>
    opts === undefined ? fetchStrategyEventsMock(date) : fetchStrategyEventsMock(date, opts),
}));

const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({ authFetch: (path: string) => authFetchMock(path) }));

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { NEW_LINE_HIGHLIGHT_MS, useOrderLogFeed, useUnseenOrderLogCount } from '../use-order-log-feed';
import { readPanelsPref } from '../trading-layout';
import {
  FIXTURE_ACCOUNT_NO,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_LIMIT_FEATURE_BY_NAME,
} from '@/test-fixtures/strategy-day';

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
  window.localStorage.clear();
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

// ===========================================================================
// Phase 28 D-18 · D-07 — 「상한가 특징」 체크 (kind 15 별도 스토어 · ?lf=1 1회 · 합치기)
// ===========================================================================

const lf43 = STRATEGY_LIMIT_FEATURE_BY_NAME.lfLocked43!;
const lf103 = STRATEGY_LIMIT_FEATURE_BY_NAME.lfLocked103!;
const lfBroken = STRATEGY_LIMIT_FEATURE_BY_NAME.lfBroken!;
const PANELS_KEY = 'gh-radar:trading-panels';

/** kind 15 스토어에 푸시가 들어온 것처럼. */
function pushLf(rows: StrategyEventRow[]) {
  mockRelay = {
    ...mockRelay,
    limitFeatureEvents: [...mockRelay.limitFeatureEvents, ...rows],
    limitFeatureEventsBatch: { seq: mockRelay.limitFeatureEventsBatch.seq + 1, rows },
  };
}

/** `?lf=1` 응답은 주문 행 + kind 15(서버는 kind 15 를 더 싣는다) · 기본 응답은 주문 행만. */
function mockServer(orders: StrategyEventRow[], features: StrategyEventRow[]) {
  fetchStrategyEventsMock.mockImplementation((_date?: string, opts?: { limitFeature?: boolean }) =>
    Promise.resolve(opts?.limitFeature === true ? [...orders, ...features] : orders),
  );
}

const lfCalls = () => fetchStrategyEventsMock.mock.calls.filter((c) => c[1]?.limitFeature === true).length;

describe('fetchStrategyEvents — lf 쿼리 (D-18)', () => {
  it('() → /api/strategy-events · (undefined, lf) → ?lf=1 · (date, lf) → ?date=…&lf=1', async () => {
    const actual = await vi.importActual<typeof import('@/lib/strategy-events-api')>('@/lib/strategy-events-api');
    authFetchMock.mockResolvedValue([]);
    await actual.fetchStrategyEvents();
    await actual.fetchStrategyEvents(undefined, { limitFeature: true });
    await actual.fetchStrategyEvents('2026-10-02', { limitFeature: true });
    await actual.fetchStrategyEvents('2026-10-02');
    await actual.fetchStrategyEvents(undefined, { limitFeature: false });
    expect(authFetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/strategy-events',
      '/api/strategy-events?lf=1',
      '/api/strategy-events?date=2026-10-02&lf=1',
      '/api/strategy-events?date=2026-10-02',
      '/api/strategy-events',
    ]);
  });
});

describe('readPanelsPref — orderLogLimitFeature', () => {
  it('boolean 은 읽고 문자열 "true" 는 무시한다', () => {
    window.localStorage.setItem(PANELS_KEY, JSON.stringify({ orderLogLimitFeature: true }));
    expect(readPanelsPref().orderLogLimitFeature).toBe(true);
    window.localStorage.setItem(PANELS_KEY, JSON.stringify({ orderLogLimitFeature: 'true' }));
    expect(readPanelsPref().orderLogLimitFeature).toBeUndefined();
  });
});

describe('useOrderLogFeed — 상한가 특징 체크 (D-18 · D-07)', () => {
  it('기본 꺼짐 — rows 에 kind 15 없음 · 조회는 lf 없이 1회 · 라이브 kind 15 는 latestPush 에도 없다', async () => {
    mockServer([exposed], [lf43]);
    mockRelay = { ...mockRelay, limitFeatureEvents: [lf103] };
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(result.current.showLimitFeature).toBe(false);
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith(undefined);
    expect(result.current.rows).toEqual([exposed]);

    pushLf([lfBroken]);
    rerender();
    expect(result.current.rows.some((r) => r.kind === 15)).toBe(false);
    expect(result.current.latestPush).toBeNull();
  });

  it('켬 → ?lf=1 1회 · rows = 복원 ∪ 조회 kind 15 ∪ 라이브 kind 15(오름차순) · pref true / 끔 → kind 15 사라짐 · pref false / 같은 날짜 재켜기는 캐시', async () => {
    mockServer([exposed, buy12451], [lf43, lf103]);
    mockRelay = { ...mockRelay, limitFeatureEvents: [lf103, lfBroken] }; // lf103 은 조회와 겹친다 — 키로 흡수
    const { result } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(lfCalls()).toBe(0);

    await act(async () => {
      result.current.setShowLimitFeature(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.showLimitFeature).toBe(true);
    expect(lfCalls()).toBe(1);
    expect(fetchStrategyEventsMock).toHaveBeenLastCalledWith(undefined, { limitFeature: true });
    expect(result.current.status).toBe('ready');
    expect(result.current.rows.map((r) => r.seq)).toEqual(
      [exposed, buy12451, lf43, lf103, lfBroken].sort((a, b) => a.gwTimeMs - b.gwTimeMs).map((r) => r.seq),
    );
    expect(result.current.rows.filter((r) => r.kind === 15)).toHaveLength(3);
    expect(readPanelsPref().orderLogLimitFeature).toBe(true);

    await act(async () => {
      result.current.setShowLimitFeature(false);
    });
    expect(result.current.rows.some((r) => r.kind === 15)).toBe(false);
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, buy12451.seq]);
    expect(readPanelsPref().orderLogLimitFeature).toBe(false);

    await act(async () => {
      result.current.setShowLimitFeature(true);
      await Promise.resolve();
    });
    expect(lfCalls()).toBe(1); // 캐시 — 다시 부르지 않는다
    expect(result.current.rows.filter((r) => r.kind === 15)).toHaveLength(3);
  });

  it('조회 응답에 섞인 kind 15 아닌 행은 보관하지 않는다(주문 행은 기본 복원 한 벌)', async () => {
    // lf=1 응답에만 있는 주문 행 — kind 15 만 보관하므로 rows 에 들어오지 않는다.
    fetchStrategyEventsMock.mockImplementation((_d?: string, opts?: { limitFeature?: boolean }) =>
      Promise.resolve(opts?.limitFeature === true ? [exposed, fill12451, lf43] : [exposed]),
    );
    window.localStorage.setItem(PANELS_KEY, JSON.stringify({ orderLogLimitFeature: true }));
    const { result } = renderHook(() => useOrderLogFeed());
    await flush();
    expect(result.current.rows.map((r) => r.seq).sort()).toEqual([exposed.seq, lf43.seq].sort());
  });

  it('초기값 = pref(켜짐) → 마운트에 기본 조회 1회 + lf=1 조회 1회', async () => {
    window.localStorage.setItem(PANELS_KEY, JSON.stringify({ orderLogLimitFeature: true }));
    mockServer([exposed], [lf43]);
    const { result } = renderHook(() => useOrderLogFeed());
    expect(result.current.showLimitFeature).toBe(true);
    expect(result.current.status).toBe('loading');
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);
    expect(lfCalls()).toBe(1);
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, lf43.seq]);
  });

  it('켜짐 동안만 kind 15 푸시가 latestPush(배지 · 새 줄 원천)에 실린다 · 켜기 전부터 있던 줄은 새 줄이 아니다', async () => {
    mockServer([], []);
    const { result, rerender } = renderHook(() => useOrderLogFeed());
    await flush();
    pushLf([lf43]); // 꺼짐 — 세지 않는다
    rerender();
    expect(result.current.latestPush).toBeNull();

    await act(async () => {
      result.current.setShowLimitFeature(true);
      await Promise.resolve();
    });
    expect(result.current.latestPush).toBeNull(); // 켜는 순간 이미 있던 lf43 은 새 줄이 아니다
    expect(result.current.newKeys.size).toBe(0);

    pushLf([lf103]);
    rerender();
    expect(result.current.latestPush?.rows).toEqual([lf103]);
    expect(result.current.newKeys.has(strategyEventKey(lf103))).toBe(true);
  });

  it('lf=1 조회 실패 → status error · retry() 가 lf=1 을 다시 부른다', async () => {
    fetchStrategyEventsMock.mockImplementation((_d?: string, opts?: { limitFeature?: boolean }) =>
      opts?.limitFeature === true ? Promise.reject(new Error('500')) : Promise.resolve([exposed]),
    );
    const { result } = renderHook(() => useOrderLogFeed());
    await flush();
    await act(async () => {
      result.current.setShowLimitFeature(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.rows).toEqual([exposed]);

    mockServer([exposed], [lf43]);
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lfCalls()).toBe(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, lf43.seq]);
  });

  it('과거일 — 켜면 (date, lf) 조회 · 복원 둘을 합친다 · 라이브 kind 15 무시', async () => {
    const past = { ...lf43, tradeDate: '2026-09-26' };
    mockServer([exposed], [past]);
    mockRelay = { ...mockRelay, limitFeatureEvents: [lf103] };
    window.localStorage.setItem(PANELS_KEY, JSON.stringify({ orderLogLimitFeature: true }));
    const { result } = renderHook(() => useOrderLogFeed({ date: '2026-09-26' }));
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith('2026-09-26', { limitFeature: true });
    expect(result.current.rows.map((r) => r.seq)).toEqual([exposed.seq, past.seq]);
  });
});
