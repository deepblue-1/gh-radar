import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { NewsByStockResponse, StockFeedEntry, StockFeedItem, StockFeedKind } from '@gh-radar/shared';

/**
 * Phase 41 Plan 05 Task 1 — 작업대 뉴스·공시 폴링 · 공유 문맥 (D-04 · D-17 · 강조 규칙 ⑤).
 *
 * 잠그는 것:
 *  ① `fetchNewsByStock` 경로 = `/api/news/by-stock?codes=a,b&days=3&limit=20`(쉼표 그대로)
 *  ② 폴링 — 100코드씩 차례로 · 10초마다 · 코드 0개면 요청 0 · 형식 아닌 코드 제외 · 같은 집합 새 배열은 재요청 없음
 *  ③ 숨김이면 그 주기 건너뜀 · 다시 보이면 바로 1번 · 실패하면 마지막 entries 유지 · 코드 집합이 바뀌면 바로 1번(진행 중 abort)
 *  ④ 새 글 — 코드별 첫 응답은 기준선(새 글 아님) · 그 뒤 처음 보인 id 에 시각 기록 · 30초 뒤 거짓
 *  ⑤ 문맥 — 공급자 밖은 빈 값 · 강조할 글이 있을 때만 1초 타이머 하나
 */

const apiFetchMock = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

const fetchMock = vi.fn();
vi.mock('@/lib/news-by-stock-api', () => ({
  fetchNewsByStock: (...a: unknown[]) => fetchMock(...a),
}));

import {
  STOCK_FEED_CHUNK,
  STOCK_FEED_NEW_MS,
  STOCK_FEED_POLL_MS,
  feedBadgesOf,
  isFeedItemNew,
  useStockFeedPolling,
} from '../use-stock-feed';
import {
  StockFeedProvider,
  useStockFeedAvailable,
  useStockFeedEntries,
  useStockFeedEntry,
  useStockFeedIsNew,
} from '@/components/trading/feed/stock-feed-context';

const AT = '2026-11-12T09:00:00.000+09:00';

function item(id: string, kind: StockFeedKind = 'news'): StockFeedItem {
  return {
    id,
    kind,
    publishedAt: AT,
    title: `제목 ${id}`,
    source: kind === 'disclosure' ? '거래소 공시' : '연합뉴스',
    stockCodes: [],
    url: null,
    description: null,
    receivedAt: AT,
  };
}

function entry(code: string, items: StockFeedItem[]): StockFeedEntry {
  return { code, collectedAt: AT, count: items.length, truncated: false, items };
}

/** 종목코드 → 지금 서버가 줄 글. 테스트가 바꿔 가며 쓴다. */
let feed: Record<string, StockFeedItem[]> = {};

function respond(codes: readonly string[]): Promise<NewsByStockResponse> {
  return Promise.resolve({
    asOf: AT,
    feedAt: AT,
    stocks: codes.map((c) => entry(c, feed[c] ?? [])),
  });
}

const codesOf = (n: number) => Array.from({ length: n }, (_, i) => String(i).padStart(6, '0'));

/** 대기 중인 마이크로태스크 · 0ms 타이머를 비운다. */
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  feed = {};
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  fetchMock.mockReset();
  fetchMock.mockImplementation((codes: readonly string[]) => respond(codes));
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('fetchNewsByStock', () => {
  it('코드를 쉼표로 이어 /api/news/by-stock 을 부르고 shared 응답 타입을 돌려준다', async () => {
    const { fetchNewsByStock } = await vi.importActual<typeof import('@/lib/news-by-stock-api')>(
      '@/lib/news-by-stock-api',
    );
    apiFetchMock.mockResolvedValue({ asOf: AT, feedAt: null, stocks: [] });
    const signal = new AbortController().signal;
    await fetchNewsByStock(['005930', '0011T0'], { days: 3, limit: 20 }, signal);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/news/by-stock?codes=005930,0011T0&days=3&limit=20', {
      signal,
    });
  });
});

describe('useStockFeedPolling — 묶음 · 주기', () => {
  it('상수 — 10초 주기 · 30초 강조 · 100코드 묶음', () => {
    expect(STOCK_FEED_POLL_MS).toBe(10_000);
    expect(STOCK_FEED_NEW_MS).toBe(30_000);
    expect(STOCK_FEED_CHUNK).toBe(100);
  });

  it('코드 150개면 100 · 50 두 번으로 나눠 days=3 · limit=20 으로 부른다', async () => {
    renderHook(() => useStockFeedPolling(codesOf(150)));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toHaveLength(100);
    expect(fetchMock.mock.calls[1]![0]).toHaveLength(50);
    expect(fetchMock.mock.calls[0]![1]).toEqual({ days: 3, limit: 20 });
  });

  it('10초마다 다시 부른다', async () => {
    renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(STOCK_FEED_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(STOCK_FEED_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('코드가 0개면 요청하지 않는다 · 형식이 아닌 코드는 뺀다', async () => {
    renderHook(() => useStockFeedPolling([]));
    await tick(STOCK_FEED_POLL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();

    renderHook(() => useStockFeedPolling(['005930', 'bad', '', '0011T0']));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...fetchMock.mock.calls[0]![0]].sort()).toEqual(['0011T0', '005930']);
  });

  it('같은 코드 집합의 새 배열로 다시 그려도 요청이 늘지 않는다', async () => {
    const { rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['005930', '000660'] },
    });
    await flush();
    rerender({ c: ['000660', '005930'] });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('화면이 숨으면 그 주기를 건너뛰고, 다시 보이면 바로 1번 부른다', async () => {
    renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    setVisibility('hidden');
    await tick(STOCK_FEED_POLL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('요청이 실패하면 마지막 entries 를 그대로 둔다', async () => {
    feed['005930'] = [item('kis:1')];
    const { result } = renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    expect(result.current.entries.get('005930')?.items.map((i) => i.id)).toEqual(['kis:1']);
    fetchMock.mockRejectedValueOnce(new Error('503'));
    await tick(STOCK_FEED_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.entries.get('005930')?.items.map((i) => i.id)).toEqual(['kis:1']);
  });

  it('코드 집합이 바뀌면 진행 중 요청을 끊고 바로 1번 부른다', async () => {
    let firstSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_codes: readonly string[], _o: unknown, signal: AbortSignal) => {
      firstSignal = signal;
      return new Promise(() => {});
    });
    const { rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['005930'] },
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ c: ['005930', '000660'] });
    await flush();
    expect(firstSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...fetchMock.mock.calls[1]![0]].sort()).toEqual(['000660', '005930']);
  });
});

describe('useStockFeedPolling — 새 글', () => {
  it('첫 응답의 글은 새 글이 아니고, 다음 응답에 처음 보인 id 만 시각이 기록되며 30초 뒤 끝난다', async () => {
    feed['005930'] = [item('kis:1')];
    const { result } = renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    expect(result.current.firstSeen.size).toBe(0);

    feed['005930'] = [item('kis:2'), item('kis:1')];
    await tick(STOCK_FEED_POLL_MS);
    const seenAt = result.current.firstSeen.get('kis:2');
    expect(seenAt).toBe(Date.now());
    expect(result.current.firstSeen.has('kis:1')).toBe(false);
    expect(isFeedItemNew('kis:2', result.current.firstSeen, Date.now())).toBe(true);
    expect(isFeedItemNew('kis:1', result.current.firstSeen, Date.now())).toBe(false);
    expect(isFeedItemNew('kis:2', result.current.firstSeen, seenAt! + STOCK_FEED_NEW_MS)).toBe(false);
  });
});

describe('feedBadgesOf', () => {
  it('공시 · 뉴스 유무를 가르고, entry 가 없으면 둘 다 거짓', () => {
    expect(feedBadgesOf(undefined)).toEqual({ disclosure: false, news: false });
    expect(feedBadgesOf(entry('005930', []))).toEqual({ disclosure: false, news: false });
    expect(feedBadgesOf(entry('005930', [item('a', 'disclosure')]))).toEqual({ disclosure: true, news: false });
    expect(feedBadgesOf(entry('005930', [item('a', 'news'), item('b', 'disclosure')]))).toEqual({
      disclosure: true,
      news: true,
    });
  });
});

describe('StockFeedProvider · 문맥 훅', () => {
  it('공급자 밖에서는 오류 없이 빈 값 — entry 없음 · 새 글 아님 · 공급자 없음', () => {
    const { result } = renderHook(() => ({
      entry: useStockFeedEntry('005930'),
      entries: useStockFeedEntries(),
      isNew: useStockFeedIsNew(),
      available: useStockFeedAvailable(),
    }));
    expect(result.current.entry).toBeUndefined();
    expect(result.current.entries.size).toBe(0);
    expect(result.current.isNew('kis:1')).toBe(false);
    expect(result.current.available).toBe(false);
  });

  it('공급자 안에서는 응답 뒤 종목 entry 를 읽는다', async () => {
    feed['005930'] = [item('kis:1', 'disclosure')];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StockFeedProvider codes={['005930']}>{children}</StockFeedProvider>
    );
    const { result } = renderHook(
      () => ({ entry: useStockFeedEntry('005930'), available: useStockFeedAvailable() }),
      { wrapper },
    );
    expect(result.current.available).toBe(true);
    expect(result.current.entry).toBeUndefined();
    await flush();
    expect(result.current.entry?.items[0]?.id).toBe('kis:1');
  });

  it('강조할 글이 없으면 1초 타이머를 걸지 않고, 있으면 하나만 걸었다가 30초 뒤 멈춘다', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const oneSecond = () => setIntervalSpy.mock.calls.filter((c) => c[1] === 1000).length;

    feed['005930'] = [item('kis:1')];
    function Probe() {
      const isNew = useStockFeedIsNew();
      return <span data-testid="p">{`${isNew('kis:1')}:${isNew('kis:2')}`}</span>;
    }
    const { getByTestId } = render(
      <StockFeedProvider codes={['005930']}>
        <Probe />
      </StockFeedProvider>,
    );
    await flush();
    expect(oneSecond()).toBe(0);
    expect(getByTestId('p').textContent).toBe('false:false');

    feed['005930'] = [item('kis:2'), item('kis:1')];
    await tick(STOCK_FEED_POLL_MS);
    expect(getByTestId('p').textContent).toBe('false:true');
    expect(oneSecond()).toBe(1);

    const clearsBefore = clearIntervalSpy.mock.calls.length;
    await tick(STOCK_FEED_NEW_MS + 1000);
    expect(getByTestId('p').textContent).toBe('false:false');
    expect(oneSecond()).toBe(1);
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearsBefore);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
