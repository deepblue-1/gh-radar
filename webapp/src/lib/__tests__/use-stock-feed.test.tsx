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
 *  ③ 숨김이면 그 주기 건너뜀 · 다시 보이면 바로 1번 · 실패하면 마지막 entries 유지 · 진행 중 회차는 끊지 않음(WR-60)
 *     · 코드 집합 변경은 새 코드가 있을 때만 모아서 1번 · 주기는 다시 잡지 않음(WR-61)
 *  ④ 새 글 — 코드별 첫 응답은 기준선(새 글 아님) · 그 뒤 처음 보인 id 에 시각 기록 · 30초 뒤 거짓
 *     · 수집 전(collectedAt null) 응답은 기준선 아님 · 작성 30분 넘은 옛 글은 처음 보여도 새 글 아님(CR-60)
 *  ⑤ 문맥 — 공급자 밖은 빈 값 · 강조할 글이 있을 때만 1초 타이머 하나
 */

const apiFetchMock = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

const fetchMock = vi.fn();
vi.mock('@/lib/news-by-stock-api', () => ({
  fetchNewsByStock: (...a: unknown[]) => fetchMock(...a),
}));

import {
  STOCK_FEED_CHANGE_DEBOUNCE_MS,
  STOCK_FEED_CHUNK,
  STOCK_FEED_FRESH_PUBLISHED_MS,
  STOCK_FEED_NEW_MS,
  STOCK_FEED_POLL_MS,
  feedBadgesOf,
  isFeedItemNew,
  isFreshlyPublished,
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
/** 테스트 시계 — 글 작성 시각(AT) 5분 뒤라 새 글 신선도(CR-60) 안이다. */
const NOW = Date.parse(AT) + 5 * 60_000;

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

function entry(code: string, items: StockFeedItem[], collectedAt: string | null = AT): StockFeedEntry {
  return { code, collectedAt, count: items.length, truncated: false, items };
}

/** 종목코드 → 지금 서버가 줄 글. 테스트가 바꿔 가며 쓴다. */
let feed: Record<string, StockFeedItem[]> = {};
/** 아직 수집 전(`collectedAt: null`)으로 답할 종목코드. */
let uncollected = new Set<string>();

function respond(codes: readonly string[]): Promise<NewsByStockResponse> {
  return Promise.resolve({
    asOf: AT,
    feedAt: AT,
    stocks: codes.map((c) => entry(c, feed[c] ?? [], uncollected.has(c) ? null : AT)),
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
  vi.setSystemTime(NOW);
  feed = {};
  uncollected = new Set();
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

  it('회차가 주기보다 길면 다음 주기는 건너뛰고 진행 중 요청을 끊지 않는다 — 늦은 응답도 반영된다(WR-60)', async () => {
    let firstSignal: AbortSignal | undefined;
    feed['005930'] = [item('kis:1')];
    fetchMock.mockImplementationOnce((codes: readonly string[], _o: unknown, signal: AbortSignal) => {
      firstSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve(respond(codes)), STOCK_FEED_POLL_MS * 1.5));
    });
    const { result } = renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    await tick(STOCK_FEED_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);
    await tick(STOCK_FEED_POLL_MS * 0.5);
    expect(result.current.entries.get('005930')?.items.map((i) => i.id)).toEqual(['kis:1']);
    await tick(STOCK_FEED_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('코드 집합이 바뀌어도 진행 중 요청을 끊지 않고, 끝난 뒤 바뀐 집합으로 1번 부른다(WR-61)', async () => {
    let firstSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((codes: readonly string[], _o: unknown, signal: AbortSignal) => {
      firstSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve(respond(codes)), 3_000));
    });
    const { rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['005930'] },
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ c: ['005930', '000660'] });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(3_000);
    expect(firstSignal?.aborted).toBe(false);
    // 직전 회차 시작(0초)에서 주기의 절반(5초)이 지나야 부른다.
    await tick(STOCK_FEED_POLL_MS / 2 - 3_000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...fetchMock.mock.calls[1]![0]].sort()).toEqual(['000660', '005930']);
  });

  it('잇단 코드 집합 변경은 모아서 1번만 부르고, 그 직후 주기 tick 은 건너뛴다(WR-61)', async () => {
    const { rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['000001'] },
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // 0초
    await tick(6_000);
    rerender({ c: ['000001', '000002'] });
    await tick(300);
    rerender({ c: ['000001', '000002', '000003'] });
    await tick(300);
    rerender({ c: ['000001', '000002', '000003', '000004'] });
    await tick(STOCK_FEED_CHANGE_DEBOUNCE_MS - 600 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(1); // 7.5초 — 모은 변경 1회차
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...fetchMock.mock.calls[1]![0]]).toEqual(['000001', '000002', '000003', '000004']);
    await tick(STOCK_FEED_POLL_MS - 7_500); // 10초 tick — 2.5초 전에 돌았으니 건너뜀
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(STOCK_FEED_POLL_MS); // 20초 tick — 주기 그대로(다시 잡지 않음)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('코드가 빠지기만 하면 부르지 않고, 빠진 코드의 entries 는 바로 지운다(WR-61 · IN-60)', async () => {
    const { result, rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['005930', '000660'] },
    });
    await flush();
    expect(result.current.entries.size).toBe(2);
    rerender({ c: ['005930'] });
    await flush();
    expect([...result.current.entries.keys()]).toEqual(['005930']);
    await tick(STOCK_FEED_CHANGE_DEBOUNCE_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('코드가 0개가 되면 entries · 기준선을 비운다 — 다시 들어온 첫 응답이 새 기준선이다(IN-60)', async () => {
    feed['005930'] = [item('kis:1')];
    const { result, rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: ['005930'] },
    });
    await flush();
    expect(result.current.entries.size).toBe(1);
    rerender({ c: [] });
    await flush();
    expect(result.current.entries.size).toBe(0);

    // 비어 있던 동안 나온 글 — 다시 들어온 첫 응답은 기준선이라 강조하지 않는다.
    feed['005930'] = [item('kis:2'), item('kis:1')];
    await tick(STOCK_FEED_POLL_MS);
    rerender({ c: ['005930'] });
    await tick(STOCK_FEED_POLL_MS / 2);
    expect(result.current.entries.get('005930')?.items).toHaveLength(2);
    expect(result.current.firstSeen.size).toBe(0);
  });

  it('코드 없이 시작했다가 처음 코드가 들어오면 기다리지 않고 바로 부른다', async () => {
    const { rerender } = renderHook(({ c }) => useStockFeedPolling(c), {
      initialProps: { c: [] as string[] },
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ c: ['005930'] });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('수집 전(collectedAt null) 응답은 기준선이 아니다 — 첫 수집이 메운 기존 글은 새 글이 아니다(CR-60)', async () => {
    uncollected.add('005930');
    const { result } = renderHook(() => useStockFeedPolling(['005930']));
    await flush();
    expect(result.current.entries.get('005930')?.collectedAt).toBeNull();

    // 첫 종목별 수집이 끝나 3건이 한꺼번에 들어온다 — 이 응답이 기준선이다.
    uncollected.delete('005930');
    feed['005930'] = [item('kis:3'), item('kis:2'), item('kis:1')];
    await tick(STOCK_FEED_POLL_MS);
    expect(result.current.entries.get('005930')?.items).toHaveLength(3);
    expect(result.current.firstSeen.size).toBe(0);

    // 그 뒤 새로 보인 글은 새 글이다.
    feed['005930'] = [item('kis:4'), item('kis:3'), item('kis:2'), item('kis:1')];
    await tick(STOCK_FEED_POLL_MS);
    expect([...result.current.firstSeen.keys()]).toEqual(['kis:4']);
  });

  it('처음 보여도 작성 시각이 신선도 밖인 옛 글(보충 수집이 늦게 메운 글)은 새 글이 아니다(CR-60)', async () => {
    feed['005930'] = [item('kis:1')];
    const { result } = renderHook(() => useStockFeedPolling(['005930']));
    await flush();

    const old = { ...item('kis:old'), publishedAt: new Date(NOW - STOCK_FEED_FRESH_PUBLISHED_MS - 1000).toISOString() };
    const edge = { ...item('kis:edge'), publishedAt: new Date(NOW - STOCK_FEED_FRESH_PUBLISHED_MS + 60_000).toISOString() };
    feed['005930'] = [item('kis:1'), edge, old];
    await tick(STOCK_FEED_POLL_MS);
    expect(result.current.firstSeen.has('kis:old')).toBe(false);
    expect(result.current.firstSeen.has('kis:edge')).toBe(true);
    expect(isFreshlyPublished('not-a-date', NOW)).toBe(false);
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
