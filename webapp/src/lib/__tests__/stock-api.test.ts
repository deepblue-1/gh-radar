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
import { searchStocks, fetchStockDetail } from '../stock-api';

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
