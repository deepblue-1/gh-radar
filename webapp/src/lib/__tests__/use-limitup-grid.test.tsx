import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/**
 * Phase 28 Plan 13 Task 1 — 격자 파일 로더 훅(behavior 10).
 *
 * 잠그는 것: enabled false → fetch 0 · true → grid-urls 날짜당 1회(같은 날짜 여러 카드여도) → 서명 URL fetch →
 * `DecompressionStream('gzip')` 해제 → ready · 같은 (날짜, isin) 재요청은 캐시 · 서명 URL 4xx(만료) → grid-urls 1회 재발급 후
 * 재시도 · 그래도 실패 → error · retry() 가 다시 시도. 입력 = 실 export 격자 `.json.gz` 바이트.
 */

const urlsMock = vi.fn();
vi.mock('@/lib/limitup-api', () => ({
  fetchLimitupGridUrls: (d: string) => urlsMock(d),
}));

import { MAX_GRID_DATES, __resetLimitupGridCache, useLimitupGrid } from '../use-limitup-grid';
import { AXION, DUKWOO, EXPORT_DATE as D, gridGzOf } from '@/test-fixtures/limitup-export';

const urlOf = (isin: string, v = 1) => `https://storage.test/limitup-grid/${D}/${isin}.json.gz?token=v${v}`;
const urlsResp = (v = 1) => ({ date: D, expiresIn: 600, urls: { [DUKWOO]: urlOf(DUKWOO, v), [AXION]: urlOf(AXION, v) } });

const fetchMock = vi.fn();
const gzResponse = (isin: string) =>
  new Response(new Uint8Array(gridGzOf(isin)), { status: 200, headers: { 'content-type': 'application/gzip' } });

beforeEach(() => {
  __resetLimitupGridCache();
  urlsMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLimitupGrid', () => {
  it('enabled false → 어떤 요청도 없다 · idle', async () => {
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
    expect(urlsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enabled true → grid-urls → 서명 URL → gzip 해제 → ready(격자 JSON)', async () => {
    urlsMock.mockResolvedValue(urlsResp());
    fetchMock.mockImplementation(async (u: string) => gzResponse(u.includes(DUKWOO) ? DUKWOO : AXION));
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.grid?.isin).toBe(DUKWOO);
    expect(result.current.grid?.coarse.sec.length).toBe(2340);
    expect(urlsMock).toHaveBeenCalledWith(D);
    expect(fetchMock).toHaveBeenCalledWith(urlOf(DUKWOO));
  });

  it('같은 날짜 카드 둘 → grid-urls 1회 · 격자는 isin 마다 · 같은 isin 다시 → 캐시(요청 0)', async () => {
    urlsMock.mockResolvedValue(urlsResp());
    fetchMock.mockImplementation(async (u: string) => gzResponse(u.includes(DUKWOO) ? DUKWOO : AXION));
    const a = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    const b = renderHook(() => useLimitupGrid({ date: D, isin: AXION, enabled: true }));
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(urlsMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const c = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    expect(c.result.current.status).toBe('ready');
    expect(c.result.current.grid?.isin).toBe(DUKWOO);
    expect(urlsMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('서명 URL 403(만료) → grid-urls 를 한 번 다시 받아 새 URL 로 재시도 → ready', async () => {
    urlsMock.mockResolvedValueOnce(urlsResp(1)).mockResolvedValueOnce(urlsResp(2));
    fetchMock.mockImplementation(async (u: string) =>
      u.endsWith('v1') ? new Response('expired', { status: 403 }) : gzResponse(DUKWOO),
    );
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(urlsMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([urlOf(DUKWOO, 1), urlOf(DUKWOO, 2)]);
  });

  it('재발급 뒤에도 실패 → error · retry() → 다시 시도해 ready', async () => {
    urlsMock.mockResolvedValue(urlsResp(1));
    fetchMock.mockResolvedValue(new Response('expired', { status: 403 }));
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(urlsMock).toHaveBeenCalledTimes(2); // 처음 + 재발급 1회 — 그 이상 두드리지 않는다
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.grid).toBeNull();

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => gzResponse(DUKWOO));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.grid?.isin).toBe(DUKWOO);
  });

  it('그 날짜 서명 URL 목록에 isin 이 없으면 error(격자 fetch 0)', async () => {
    urlsMock.mockResolvedValue({ date: D, expiresIn: 600, urls: {} });
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grid-urls 자체 실패 → error · 다음 시도는 날짜 캐시를 다시 받는다', async () => {
    urlsMock.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(urlsResp());
    fetchMock.mockImplementation(async () => gzResponse(DUKWOO));
    const { result } = renderHook(() => useLimitupGrid({ date: D, isin: DUKWOO, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(urlsMock).toHaveBeenCalledTimes(2);
  });

  it(`최근 ${MAX_GRID_DATES}개 날짜 격자만 남긴다 — 셋째 날짜를 열면 가장 오래 안 본 날짜 격자 · URL 목록을 버린다 (WR-A04)`, async () => {
    expect(MAX_GRID_DATES).toBe(2);
    urlsMock.mockImplementation(async (d: string) => ({ ...urlsResp(), date: d }));
    fetchMock.mockImplementation(async (u: string) => gzResponse(u.includes(DUKWOO) ? DUKWOO : AXION));
    const open = async (date: string) => {
      const h = renderHook(() => useLimitupGrid({ date, isin: DUKWOO, enabled: true }));
      await waitFor(() => expect(h.result.current.status).toBe('ready'));
      h.unmount();
    };
    await open(D);
    await open('20261001');
    await open(D); // D 를 다시 봄 — 캐시(요청 0) · 최근으로 올라간다
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await open('20260930'); // 셋째 날짜 — 가장 오래 안 본 20261001 을 버린다
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await open(D); // 남아 있다
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await open('20261001'); // 버려졌다 — grid-urls 부터 다시
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(urlsMock.mock.calls.map((c) => c[0])).toEqual([D, '20261001', '20260930', '20261001']);
  });
});
