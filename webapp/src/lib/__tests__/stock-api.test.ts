import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  ApiClientError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

import { apiFetch } from '../api';
import { searchStocks, fetchStockDetail, fetchStockDiscussions, fetchStockNews } from '../stock-api';

const mockFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

describe('searchStocks', () => {
  beforeEach(() => mockFetch.mockReset().mockResolvedValue([]));

  it('한글 쿼리를 URLSearchParams 로 인코딩', async () => {
    const signal = new AbortController().signal;
    await searchStocks('삼성', signal);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/stocks\/search\?q=/),
      { signal },
    );
    const [path] = mockFetch.mock.calls[0]!;
    expect(path).toContain('q=' + encodeURIComponent('삼성'));
  });

  it('특수문자 & 를 인코딩', async () => {
    const signal = new AbortController().signal;
    await searchStocks('A&B', signal);
    expect(mockFetch.mock.calls[0]![0]).toContain('q=A%26B');
  });
});

describe('fetchStockDetail', () => {
  beforeEach(() => mockFetch.mockReset().mockResolvedValue({}));

  it('code 를 경로에 삽입', async () => {
    const signal = new AbortController().signal;
    await fetchStockDetail('005930', signal);
    expect(mockFetch).toHaveBeenCalledWith('/api/stocks/005930', { signal });
  });

  it('code 에 encodeURIComponent 적용', async () => {
    const signal = new AbortController().signal;
    await fetchStockDetail('abc/x', signal);
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/stocks/abc%2Fx');
  });
});

describe('fetchStockDiscussions (08-04+ infinite scroll cursor)', () => {
  beforeEach(() => mockFetch.mockReset().mockResolvedValue([]));

  it('hours/limit 만 전달 시 before 미포함', async () => {
    const signal = new AbortController().signal;
    await fetchStockDiscussions('005930', { hours: 24, limit: 5 }, signal);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('hours=24');
    expect(url).toContain('limit=5');
    expect(url).not.toContain('before=');
  });

  it('before 옵션 → URL 에 before=<encoded ISO> 포함', async () => {
    const signal = new AbortController().signal;
    const cursor = '2026-04-17T05:32:00.000Z';
    await fetchStockDiscussions(
      '005930',
      { days: 7, limit: 50, before: cursor },
      signal,
    );
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain(`before=${encodeURIComponent(cursor)}`);
    expect(url).toContain('days=7');
    expect(url).toContain('limit=50');
  });

  it('hours 와 days 동시 명시 시 hours 우선 (기존 동작)', async () => {
    const signal = new AbortController().signal;
    await fetchStockDiscussions(
      '005930',
      { hours: 12, days: 7, limit: 5 },
      signal,
    );
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('hours=12');
    expect(url).not.toContain('days=');
  });
});

describe('fetchStockNews (260418-kd8 infinite scroll cursor)', () => {
  beforeEach(() => mockFetch.mockReset().mockResolvedValue([]));

  it('days/limit 만 전달 시 before 미포함', async () => {
    const signal = new AbortController().signal;
    await fetchStockNews('005930', { days: 7, limit: 100 }, signal);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('days=7');
    expect(url).toContain('limit=100');
    expect(url).not.toContain('before=');
  });

  it('before 옵션 → URL 에 before=<encoded ISO> 포함', async () => {
    const signal = new AbortController().signal;
    const cursor = '2026-04-17T05:32:00.000Z';
    await fetchStockNews(
      '005930',
      { days: 7, limit: 100, before: cursor },
      signal,
    );
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain(`before=${encodeURIComponent(cursor)}`);
    expect(url).toContain('days=7');
    expect(url).toContain('limit=100');
  });

  it('opts 비어있을 때 days=7, limit=100 default 사용', async () => {
    const signal = new AbortController().signal;
    await fetchStockNews('005930', {}, signal);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('days=7');
    expect(url).toContain('limit=100');
  });
});
