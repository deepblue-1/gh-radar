import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Phase 21 Plan 07 Task 3 — 종목상세 당겨서 새로고침은 **GET 재조회만** (D-18 · MOBILE-01l).
 *
 * 깨지면 사용자가 겪는 일:
 *  ① 당김 한 번에 Naver 검색 API 호출·토론방 프록시 크롤링이 사용자 수만큼 늘어 일 예산(공식 API
 *     운영 기준 3)과 크롤링 5원칙 3(「사용자 클릭 시 on-demand fetch 금지」)을 깬다 — 외부 수집은
 *     서버 배치와 스로틀된 수동 버튼만 일으킨다.
 *  ② 당겨도 시세·차트·통계가 옛 값 그대로다(시세 재조회 → `refreshSignal` 로 차트까지 다시 읽힌다).
 *  ③ 떠난 섹션의 재조회가 계속 불려 쓸모없는 요청이 나간다.
 *
 * 앱 모드는 21-04 헬퍼(`native-app-mode.ts`)로 설치하고, 네이티브가 부르는 경로 그대로
 * `window.__ghTrade.refresh()` 를 호출한다. `@/lib/stock-api` 다섯 함수는 스파이다.
 */

let mockSearchParams = new URLSearchParams('tab=news');

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  usePathname: () => '/stocks/005930',
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/lib/stock-api', () => ({
  fetchStockDetail: vi.fn(),
  fetchStockNews: vi.fn(),
  refreshStockNews: vi.fn(),
  fetchStockDiscussions: vi.fn(),
  refreshStockDiscussions: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

// 차트는 lightweight-charts(jsdom 캔버스 미지원) — `refreshSignal` 값만 기록하는 스텁.
const chartSignals: boolean[] = [];
vi.mock('../stock-daily-chart-section', () => ({
  StockDailyChartSection: ({ refreshSignal }: { refreshSignal?: boolean }) => {
    chartSignals.push(Boolean(refreshSignal));
    return null;
  },
}));
// 시세·차트·통계 범위 밖 섹션 — 자기 fetch 를 가진다. 등록 대상이 아니므로 스텁.
vi.mock('@/components/theme/theme-chips', () => ({ StockThemeChips: () => null }));
vi.mock('../stock-limit-up-section', () => ({ StockLimitUpSection: () => null }));
vi.mock('../stock-comovement-section', () => ({ StockComovementSection: () => null }));
vi.mock('../stock-orderbook-section', () => ({ StockOrderbookSection: () => null }));

import {
  fetchStockDetail,
  fetchStockDiscussions,
  fetchStockNews,
  refreshStockDiscussions,
  refreshStockNews,
} from '@/lib/stock-api';
import { NativeBridgeProvider } from '@/lib/native/native-bridge-provider';
import {
  enterNativeApp,
  resetNativeMode,
  type NativeTestWindow,
} from '@/lib/native/__tests__/native-app-mode';
import { FIXTURE_SAMSUNG } from '@/__tests__/fixtures/stocks';
import { StockDetailClient } from '../stock-detail-client';
import { StockNewsSection } from '../stock-news-section';
import { StockDiscussionSection } from '../stock-discussion-section';

const mockFetchDetail = vi.mocked(fetchStockDetail);
const mockFetchNews = vi.mocked(fetchStockNews);
const mockRefreshNews = vi.mocked(refreshStockNews);
const mockFetchDisc = vi.mocked(fetchStockDiscussions);
const mockRefreshDisc = vi.mocked(refreshStockDiscussions);

/** 네이티브 당김이 부르는 경로 그대로 — Provider 가 설치한 전역을 기다렸다가 부른다. */
async function nativePull(): Promise<void> {
  const w = window as NativeTestWindow;
  await waitFor(() => expect(w.__ghTrade).toBeDefined());
  await act(async () => {
    await w.__ghTrade!.refresh();
  });
}

function Sections({ news = true, disc = true }: { news?: boolean; disc?: boolean }) {
  return (
    <NativeBridgeProvider>
      {news && <StockNewsSection stockCode="005930" />}
      {disc && <StockDiscussionSection stockCode="005930" />}
    </NativeBridgeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chartSignals.length = 0;
  mockSearchParams = new URLSearchParams('tab=news');
  mockFetchDetail.mockResolvedValue(FIXTURE_SAMSUNG);
  mockFetchNews.mockResolvedValue([]);
  mockRefreshNews.mockResolvedValue([]);
  mockFetchDisc.mockResolvedValue({ items: [], hasMore: false });
  mockRefreshDisc.mockResolvedValue([]);
  enterNativeApp('ios');
});

afterEach(() => {
  resetNativeMode();
});

describe('종목상세 당겨서 새로고침 — GET 재조회만 (D-18)', () => {
  it('N1 뉴스·토론 섹션은 당김에 GET 을 한 번씩 더 부르고, POST refresh 는 0 이다', async () => {
    render(<Sections />);
    await waitFor(() => expect(mockFetchNews).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchDisc).toHaveBeenCalledTimes(1));

    await nativePull();

    expect(mockFetchNews).toHaveBeenCalledTimes(2);
    expect(mockFetchDisc).toHaveBeenCalledTimes(2);
    // 같은 GET 캐시 조회 — 마운트 때와 같은 인자(종목·창·건수)다.
    expect(mockFetchNews.mock.calls[1]!.slice(0, 2)).toEqual(mockFetchNews.mock.calls[0]!.slice(0, 2));
    expect(mockFetchDisc.mock.calls[1]!.slice(0, 2)).toEqual(mockFetchDisc.mock.calls[0]!.slice(0, 2));
    // 외부 수집(Naver 검색 API · 토론방 프록시)을 일으키는 POST 는 제스처로 열리지 않는다.
    expect(mockRefreshNews).toHaveBeenCalledTimes(0);
    expect(mockRefreshDisc).toHaveBeenCalledTimes(0);
  });

  it('N2 StockDetailClient(차트 탭) — 시세(fetchStockDetail)를 다시 읽고 차트에 refreshSignal 을 준다 · POST 0', async () => {
    // 기본 탭 = 차트. 뉴스토론 패널은 한 번 열기 전까지 마운트되지 않는다(탭 T8) — 섹션 쪽은 N1·N2-a.
    mockSearchParams = new URLSearchParams();
    render(
      <NativeBridgeProvider>
        <StockDetailClient code="005930" />
      </NativeBridgeProvider>,
    );
    await waitFor(() => expect(mockFetchDetail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('삼성전자')).toBeInTheDocument());
    const w = window as NativeTestWindow;
    await waitFor(() => expect(w.__ghTrade).toBeDefined());
    chartSignals.length = 0;

    // 재조회 응답을 붙잡아 「읽는 중」 렌더를 관측한다(act 가 중간 상태를 합쳐 버리지 않게).
    let resolveDetail: (v: typeof FIXTURE_SAMSUNG) => void = () => {};
    mockFetchDetail.mockImplementationOnce(
      () => new Promise((r) => { resolveDetail = r; }),
    );
    let pulled: Promise<void> = Promise.resolve();
    await act(async () => {
      pulled = w.__ghTrade!.refresh();
    });

    expect(mockFetchDetail).toHaveBeenCalledTimes(2);
    expect(mockFetchDetail.mock.calls[1]![0]).toBe('005930');
    // 시세 재조회 동안 차트가 `refreshSignal=true` 를 받는다 → 차트·통계까지 다시 읽힌다.
    expect(chartSignals).toContain(true);

    await act(async () => {
      resolveDetail(FIXTURE_SAMSUNG);
      await pulled;
    });
    expect(chartSignals.at(-1)).toBe(false);
    expect(mockRefreshNews).toHaveBeenCalledTimes(0);
    expect(mockRefreshDisc).toHaveBeenCalledTimes(0);
  });

  it('N2-a StockDetailClient(뉴스토론 탭) — 시세 + 두 섹션 GET 이 한 번의 당김에 함께 불린다 · POST 0', async () => {
    render(
      <NativeBridgeProvider>
        <StockDetailClient code="005930" />
      </NativeBridgeProvider>,
    );
    await waitFor(() => expect(mockFetchDetail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchNews).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchDisc).toHaveBeenCalledTimes(1));

    await nativePull();

    expect(mockFetchDetail).toHaveBeenCalledTimes(2);
    expect(mockFetchNews).toHaveBeenCalledTimes(2);
    expect(mockFetchDisc).toHaveBeenCalledTimes(2);
    expect(mockRefreshNews).toHaveBeenCalledTimes(0);
    expect(mockRefreshDisc).toHaveBeenCalledTimes(0);
  });

  it('N3 언마운트된 섹션은 당김에 불리지 않는다', async () => {
    const view = render(<Sections />);
    await waitFor(() => expect(mockFetchNews).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchDisc).toHaveBeenCalledTimes(1));

    view.rerender(<Sections news={false} />);
    await nativePull();

    expect(mockFetchNews).toHaveBeenCalledTimes(1);
    expect(mockFetchDisc).toHaveBeenCalledTimes(2);
  });

  it('N4 수동 새로고침 버튼 경로(POST)는 그대로 — 클릭 1회에 refreshStockNews 1회', async () => {
    const user = userEvent.setup();
    render(<Sections disc={false} />);
    const empty = await screen.findByTestId('news-empty-state');

    await user.click(within(empty).getByRole('button'));

    await waitFor(() => expect(mockRefreshNews).toHaveBeenCalledTimes(1));
    expect(mockRefreshDisc).toHaveBeenCalledTimes(0);
  });
});
