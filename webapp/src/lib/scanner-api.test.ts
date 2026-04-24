import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchScannerStocks } from './scanner-api';
import { ApiClientError } from './api';
import type { ScannerState } from './scanner-query';

const STATE: ScannerState = { market: 'ALL' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchScannerStocks', () => {
  it('X-Last-Updated-At 헤더를 lastUpdatedAt 으로 반환', async () => {
    const iso = '2026-04-14T10:01:33.796Z';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Last-Updated-At': iso,
            },
          }),
      ),
    );
    const result = await fetchScannerStocks(
      STATE,
      new AbortController().signal,
    );
    expect(result.lastUpdatedAt).toBe(iso);
    expect(result.stocks).toEqual([]);
  });

  it('헤더 부재 시 lastUpdatedAt === null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const result = await fetchScannerStocks(
      STATE,
      new AbortController().signal,
    );
    expect(result.lastUpdatedAt).toBeNull();
  });

  it('4xx 응답 시 ApiClientError throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'INVALID_QUERY_PARAM', message: 'bad' },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );
    await expect(
      fetchScannerStocks(STATE, new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});
