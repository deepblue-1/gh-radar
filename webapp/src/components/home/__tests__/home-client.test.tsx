/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { HomeSnapshotResponse } from '@gh-radar/shared';

const fetchHomeMock = vi.fn();
vi.mock('@/lib/home-api', () => ({
  fetchHome: (...a: unknown[]) => fetchHomeMock(...a),
}));

import { HomeClient } from '../home-client';

/**
 * quick-260913-g4c — 홈 자동 갱신은 최신 보기(selected === null)에서만.
 * 과거 슬롯 탐색 중에는 자동 요청 0건(화면 점프 방지), '오늘' 복귀 시 30초 폴링 재개.
 */

const DATE = '2026-09-14';
const SLOT_A = '2026-09-14T00:59:00.000Z'; // 09:59 KST
const SLOT_B = '2026-09-14T01:00:00.000Z'; // 10:00 KST (최신)

const RESPONSE: HomeSnapshotResponse = {
  snapshot: {
    tradeDate: DATE,
    capturedAt: SLOT_B,
    themeCount: 0,
    stockCount: 1,
    isCarried: false,
    payload: {
      threshold: 15,
      marketStatus: 'open',
      themes: [],
      singles: [{ code: '035720', name: '카카오', changeRate: 22.8, reason: null, news: [] }],
    },
  },
  index: [
    { tradeDate: DATE, capturedAt: SLOT_B, themeCount: 0, stockCount: 1, isCarried: false },
    { tradeDate: DATE, capturedAt: SLOT_A, themeCount: 0, stockCount: 1, isCarried: false },
  ],
};

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('HomeClient 자동 갱신 (최신 보기에서만)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-14T01:00:10Z')); // 월 10:00 KST
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    fetchHomeMock.mockReset();
    fetchHomeMock.mockResolvedValue(RESPONSE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('최신 보기 30s 폴링 → 과거 슬롯 선택 후 60s 추가 호출 0 → 오늘 복귀 후 다시 30s 폴링', async () => {
    render(<HomeClient />);
    const slider = await screen.findByRole('slider', { name: '시점 선택' });
    expect(fetchHomeMock).toHaveBeenCalledTimes(1);

    // 최신 보기 — 30s 후 1회 증가.
    await advance(30_000);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(2));

    // 과거 슬롯(09:59) 선택 → 500ms 디바운스 후 그 슬롯 조회 1회.
    fireEvent.change(slider, { target: { value: '0' } });
    await advance(500);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(3));
    expect(fetchHomeMock.mock.calls[2][0]).toEqual({ date: DATE, capturedAt: SLOT_A });

    // 탐색 중 — 60s 동안 자동 요청 0.
    await advance(60_000);
    expect(fetchHomeMock).toHaveBeenCalledTimes(3);

    // '오늘' → 무필터 즉시 조회 + 폴링 재개.
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(4));
    expect(fetchHomeMock.mock.calls[3][0]).toEqual({ date: undefined, capturedAt: undefined });
    await advance(30_000);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(5));
  });
});
