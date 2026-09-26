import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Phase 21 D-29 (G-21-R3-8) — DiscussionFullList.
 *
 * 옛 토론 전체 페이지 클라이언트(discussion-page-client)의 필터 토글 테스트(Phase 08.1 Plan 06)를 옮겼다. 필터가 URL(`?filter=`)에서
 * **로컬 상태**로 바뀌었으므로 라우터 목은 없다 — 목록이 종목상세 `?tab=news&view=discussions` 안 ·
 * 트레이딩 ⓘ 팝업 안에 살아서 URL 을 쓰면 탭/뷰 파라미터와 섞인다. 대신 URL 불변을 history 스파이와
 * 실제 `window.location` 으로 잠근다.
 *
 * - `@/lib/stock-api`: fetchStockDiscussions 만 vi.fn (종목 조회는 쓰는 쪽 몫 — 목록은 부르지 않는다)
 * - IntersectionObserver 는 setup.ts 에 없으므로 이 파일에서 개별 폴리필.
 */

vi.mock('@/lib/stock-api', () => ({
  fetchStockDiscussions: vi.fn(),
}));

import { DiscussionFullList } from '../discussion-full-list';
import { fetchStockDiscussions } from '@/lib/stock-api';

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

const START_URL = '/stocks/005930?tab=news&view=discussions';

beforeEach(() => {
  mockFetchDiscussions.mockReset();
  mockFetchDiscussions.mockResolvedValue({ items: [], hasMore: false });
  window.history.replaceState(null, '', START_URL);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('DiscussionFullList — 필터(로컬 · 분류 정지)', () => {
  it('분류 정지(CLASSIFY_PAUSED) 중: fetch filter: all + Switch OFF/disabled', async () => {
    render(<DiscussionFullList code="005930" />);

    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalled());
    const [code, opts] = mockFetchDiscussions.mock.calls[0]!;
    expect(code).toBe('005930');
    expect(opts).toMatchObject({ days: 7, limit: 50, filter: 'all' });

    const toggle = screen.getByRole('switch', { name: '의미있는 토론만 보기' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
  });

  it('토글을 눌러도 filter 변경 · 재조회 · URL 쓰기 없음', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const user = userEvent.setup();
    render(<DiscussionFullList code="005930" />);

    await waitFor(() => expect(mockFetchDiscussions).toHaveBeenCalledTimes(1));

    const toggle = screen.getByRole('switch', { name: '의미있는 토론만 보기' });
    await user.click(toggle);

    expect(mockFetchDiscussions).toHaveBeenCalledTimes(1);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(START_URL);
  });

  it('빈 결과 → 전체-수집 안내 카피(meaningful 전용 카피는 정지 중 노출 안 됨)', async () => {
    render(<DiscussionFullList code="005930" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          '최근 7일 내 수집된 토론 글이 없습니다. 종목 상세에서 새로고침을 실행해주세요.',
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        '의미있는 토론이 아직 없어요. 토글을 꺼서 전체 글을 볼 수 있어요.',
      ),
    ).not.toBeInTheDocument();
  });
});

describe('DiscussionFullList — 머리 줄 (D-29)', () => {
  it('onBack 이 있으면 「요약으로 돌아가기」 버튼이 onBack 을 부른다', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<DiscussionFullList code="005930" onBack={onBack} />);

    expect(screen.getByRole('heading', { level: 2, name: '최근 7일 토론' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '요약으로 돌아가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('onBack 이 없으면 제목만(← 버튼 없음)', () => {
    render(<DiscussionFullList code="005930" />);

    expect(screen.getByRole('heading', { level: 2, name: '최근 7일 토론' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '요약으로 돌아가기' })).toBeNull();
  });
});
