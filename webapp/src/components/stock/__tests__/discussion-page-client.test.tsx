import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_SAMSUNG } from '@/__tests__/fixtures/stocks';

/**
 * Phase 08.1 Plan 06 — DiscussionPageClient filter 토글 테스트.
 *
 * - `next/navigation`: useSearchParams / useRouter / notFound 를 vi.mock 으로 교체.
 *   - `mockSearchParams` 는 mutable URLSearchParams — 각 테스트가 beforeEach 에서 초기화.
 *   - `mockReplace` 는 router.replace spy.
 * - `@/lib/stock-api`: fetchStockDetail + fetchStockDiscussions 를 vi.fn 으로 교체.
 * - IntersectionObserver 는 setup.ts 에 없으므로 이 파일에서 개별 폴리필.
 */

// --- next/navigation mock (module-scope singletons) -------------------------
const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearchParams: URLSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: vi.fn(),
}));

// --- stock-api mock ---------------------------------------------------------
vi.mock('@/lib/stock-api', () => ({
  fetchStockDetail: vi.fn(),
  fetchStockDiscussions: vi.fn(),
}));

import { DiscussionPageClient } from '../discussion-page-client';
import { fetchStockDetail, fetchStockDiscussions } from '@/lib/stock-api';

const mockFetchDetail = vi.mocked(fetchStockDetail);
const mockFetchDiscussions = vi.mocked(fetchStockDiscussions);

// IntersectionObserver polyfill (jsdom 미구현)
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  // @ts-expect-error — jsdom polyfill
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockFetchDetail.mockReset();
  mockFetchDiscussions.mockReset();
  mockSearchParams = new URLSearchParams();

  // 기본: 종목 상세는 삼성전자 + 빈 리스트
  mockFetchDetail.mockResolvedValue(FIXTURE_SAMSUNG);
  mockFetchDiscussions.mockResolvedValue({ items: [], hasMore: false });
});

describe('DiscussionPageClient — Phase 08.1 filter toggle', () => {
  it('초기 URL 미지정(filter 없음) → Switch ON(meaningful) + fetch 에 filter: meaningful 전달', async () => {
    render(<DiscussionPageClient code="005930" />);

    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalled());
    const firstCallOpts = mockFetchDiscussions.mock.calls[0]?.[1];
    expect(firstCallOpts?.filter).toBe('meaningful');

    // Switch 상태 — aria-checked=true
    const toggle = screen.getByRole('switch', { name: '의미있는 토론만 보기' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('초기 URL ?filter=all → Switch OFF + fetch 에 filter: all 전달', async () => {
    mockSearchParams = new URLSearchParams('filter=all');

    render(<DiscussionPageClient code="005930" />);

    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalled());
    const firstCallOpts = mockFetchDiscussions.mock.calls[0]?.[1];
    expect(firstCallOpts?.filter).toBe('all');

    const toggle = screen.getByRole('switch', { name: '의미있는 토론만 보기' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('Switch 클릭(ON→OFF) → router.replace(?filter=all) + fetch 재호출 with filter: all', async () => {
    const user = userEvent.setup();
    render(<DiscussionPageClient code="005930" />);

    // 초기 load 완료 대기
    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalledTimes(1));
    expect(mockFetchDiscussions.mock.calls[0]?.[1]?.filter).toBe('meaningful');

    const toggle = screen.getByRole('switch', { name: '의미있는 토론만 보기' });
    await user.click(toggle);

    // router.replace 가 ?filter=all 호출
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [url] = mockReplace.mock.calls[0] ?? [];
    expect(url).toBe('?filter=all');

    // fetch 재호출 with filter=all (초기 1회 + 클릭 후 1회 = 최소 2회)
    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalledTimes(2));
    expect(mockFetchDiscussions.mock.calls[1]?.[1]?.filter).toBe('all');
  });

  it('filter=meaningful 로 빈 결과 → 토글 안내 카피 렌더', async () => {
    mockFetchDiscussions.mockResolvedValue({ items: [], hasMore: false });
    render(<DiscussionPageClient code="005930" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          '의미있는 토론이 아직 없어요. 토글을 꺼서 전체 글을 볼 수 있어요.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('filter=all 로 빈 결과 → 기존 수집 안내 카피 렌더', async () => {
    mockSearchParams = new URLSearchParams('filter=all');
    mockFetchDiscussions.mockResolvedValue({ items: [], hasMore: false });
    render(<DiscussionPageClient code="005930" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          '최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.',
        ),
      ).toBeInTheDocument(),
    );
  });
});
