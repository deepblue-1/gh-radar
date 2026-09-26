import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import { notFound } from 'next/navigation';
import { StockDetailClient } from '../stock-detail-client';
import { FIXTURE_NULL_PRICE, FIXTURE_SAMSUNG } from '@/__tests__/fixtures/stocks';

// Phase 15 Plan 11: StockDetailTabs 가 `?tab=` 을 단일 진실로 읽으므로 useSearchParams 도
// stub 한다. 테스트가 이 변수를 바꿔서 활성 탭을 지정한다 (vi.mock 팩토리는 호이스팅되지만
// 화살표 함수 본문은 호출 시점에 평가되므로 `mock` 접두사 변수 참조가 허용된다).
let mockSearchParams = new URLSearchParams();
// Phase 21 D-31 — 옛 `?tab=orderbook` 딥링크가 매매 가능 종목에서 `router.replace('/trading?code=')` 를 부른다.
const { mockRouterReplace } = vi.hoisted(() => ({ mockRouterReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  // StockHero 가 ← 버튼용으로, 탭 셸이 옛 호가 딥링크용으로 useRouter 호출 — jsdom app router 미마운트 invariant 회피.
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: mockRouterReplace,
    refresh: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));
// Phase 07 Plan 04: StockDetailClient 가 내부에서 StockNewsSection 을 렌더하므로
// 같은 모듈의 fetchStockNews / refreshStockNews 도 함께 stub 해야 한다.
// Phase 08 Plan 04: StockDiscussionSection 도 mount 시 fetchStockDiscussions 호출 →
// 빈 배열 stub 으로 DiscussionEmptyState 까지 도달.
vi.mock('@/lib/stock-api', () => ({
  fetchStockDetail: vi.fn(),
  fetchStockNews: vi.fn().mockResolvedValue([]),
  refreshStockNews: vi.fn().mockResolvedValue([]),
  fetchStockDiscussions: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  refreshStockDiscussions: vi.fn().mockResolvedValue([]),
}));
// Phase 09.2 Plan 03 Task 1: StockDailyChartSection 은 lightweight-charts 를 사용 — jsdom 환경에서
// PriceAxisWidget.optimalWidth 의 ensureNotNull 이 raf 콜백 중 throw 한다 (Canvas 미지원).
// StockDetailClient 단위 테스트는 mount 사실만 확인하면 충분하므로 차트 섹션 자체를 stub.
// 차트 컴포넌트의 단위 검증은 별도 stock-daily-chart-section.test.tsx 에서 수행.
vi.mock('../stock-daily-chart-section', () => ({
  StockDailyChartSection: () => null,
}));
// jsdom 에는 Supabase 환경변수가 없어 실제 createClient 가 throw 하므로 세션 없는 클라이언트로 대체한다
// (인증 소비처 — 관심 토글 등. 옛 호가주문 탭 섹션은 Phase 21 D-31 로 사라졌다).
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

const mockFetch = vi.mocked(fetchStockDetail);
const mockNotFound = vi.mocked(notFound);

beforeEach(() => {
  vi.clearAllMocks();
  // 기본 진입 = 탭 미지정 → 기본 탭 `chart`
  mockSearchParams = new URLSearchParams();
});

describe('StockDetailClient', () => {
  it('Test 1 — mount 시 fetchStockDetail(code, signal) 1회 호출', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [code, signal] = mockFetch.mock.calls[0]!;
    expect(code).toBe('005930');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('Test 2 — fetch resolve 후 Hero(공통) + 뉴스토론 탭의 News/Discussion 섹션 렌더', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    const { rerender } = render(<StockDetailClient code="005930" />);

    // 히어로는 탭 밖 공통 영역 — 어느 탭에서도 보인다 (Phase 15 Plan 11, T1).
    await waitFor(() => {
      expect(screen.getByText('삼성전자')).toBeInTheDocument();
    });
    expect(screen.getByText('005930')).toBeInTheDocument();
    expect(screen.getByText('KOSPI')).toBeInTheDocument();

    // Phase 15 Plan 11: 뉴스·토론 섹션은 `뉴스토론` 탭 패널로 재배치됐다(T7 — 내용 무변경).
    // 탭 상태의 단일 진실이 `?tab=` 이므로 searchParams 를 바꾼 뒤 rerender 한다.
    mockSearchParams = new URLSearchParams('tab=news');
    rerender(<StockDetailClient code="005930" />);

    // Phase 07 Plan 04: 관련 뉴스 placeholder → StockNewsSection 으로 교체.
    // StockNewsSection 은 'use client' + 내부 fetchStockNews 호출 (테스트는 빈 배열 stub)
    // → 빈 상태 (NewsEmptyState) 또는 정상 리스트 중 최소 하나의 판별 문구 렌더.
    await waitFor(() =>
      expect(screen.getByText('아직 수집된 뉴스가 없어요')).toBeInTheDocument(),
    );
    // Phase 08 Plan 04: 종목토론방 자리는 ComingSoonCard → StockDiscussionSection 으로 교체.
    // 빈 배열 stub → DiscussionEmptyState 로 도달.
    await waitFor(() =>
      expect(screen.getByText('아직 토론 글이 없어요')).toBeInTheDocument(),
    );
  });

  it('Test 2b — 3탭(D-31)이 tablist 로 렌더되고 기본 활성 탭은 `차트` (T2/T3) — 호가주문 탭 없음', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(screen.getByText('삼성전자')).toBeInTheDocument(),
    );

    for (const label of ['차트', '종목정보', '뉴스토론']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: '호가주문' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '차트' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Test 2c — 알 수 없는 `?tab=` 값은 기본 탭 `차트` 로 폴백 (T-15-37)', async () => {
    mockSearchParams = new URLSearchParams('tab=zzz');
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(screen.getByText('삼성전자')).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: '차트' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Test 2d — 옛 딥링크 `?tab=orderbook` + 매매 가능 종목 → router.replace(/trading?code=) 1회 · 호가 섹션 없음 (D-31)', async () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledTimes(1));
    expect(mockRouterReplace).toHaveBeenCalledWith('/trading?code=005930');
    // 옮겨 가는 동안 렌더는 허용 목록 밖 → 차트.
    expect(screen.getByRole('tab', { name: '차트' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('stock-orderbook-section')).not.toBeInTheDocument();
  });

  it('Test 2e — 옛 딥링크 `?tab=orderbook` + 매매 불가 종목(isin 없음) → URL 만 ?tab=chart · 이동 없음 (D-31)', async () => {
    window.history.replaceState(null, '', '/stocks/999999?tab=orderbook');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    mockSearchParams = new URLSearchParams('tab=orderbook');
    mockFetch.mockResolvedValueOnce(FIXTURE_NULL_PRICE);
    render(<StockDetailClient code="999999" />);

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith(null, '', '?tab=chart'));
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?tab=chart');
    expect(screen.getByRole('tab', { name: '차트' })).toHaveAttribute('aria-selected', 'true');
    replaceSpy.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  it('Test 2f — 「트레이딩」 링크는 매매 가능 종목에만(폰 CTA + 넓은 폭 알약 · D-30 · T-21-93)', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    const view = render(<StockDetailClient code="005930" />);
    await waitFor(() => expect(screen.getByText('삼성전자')).toBeInTheDocument());
    const links = screen.getAllByRole('link', { name: '트레이딩' });
    expect(links.map((l) => l.getAttribute('data-slot')).sort()).toEqual([
      'detail-order-cta',
      'detail-trading-button',
    ]);
    for (const l of links) expect(l).toHaveAttribute('href', '/trading?code=005930');
    view.unmount();

    mockFetch.mockResolvedValueOnce(FIXTURE_NULL_PRICE);
    render(<StockDetailClient code="999999" />);
    await waitFor(() => expect(screen.getByText(FIXTURE_NULL_PRICE.name)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '트레이딩' })).not.toBeInTheDocument();
  });

  it('Test 3 — 초기 로딩 중에는 Skeleton 노출, Hero 없음', () => {
    // resolve 지연 — pending 상태 유지
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));
    render(<StockDetailClient code="005930" />);

    expect(screen.getByLabelText('종목 정보 로딩 중')).toBeInTheDocument();
    expect(screen.queryByText('삼성전자')).not.toBeInTheDocument();
  });

  it('Test 4 — refresh 버튼 클릭 시 재호출 + 기존 데이터 유지 + aria-busy', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() => expect(screen.getByText('삼성전자')).toBeInTheDocument());

    // 두 번째 호출은 지연 resolve 로 pending 상태 확인
    let resolveSecond: (v: typeof FIXTURE_SAMSUNG) => void = () => {};
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

    const refreshBtn = screen.getByRole('button', { name: '새로고침' });
    await user.click(refreshBtn);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // 기존 데이터 유지 확인
    expect(screen.getByText('삼성전자')).toBeInTheDocument();
    // aria-busy=true
    expect(refreshBtn).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveSecond(FIXTURE_SAMSUNG);
    });
    await waitFor(() => expect(refreshBtn).toHaveAttribute('aria-busy', 'false'));
  });

  it('Test 5 — 404 ApiClientError → notFound() 호출', async () => {
    mockFetch.mockRejectedValueOnce(
      new ApiClientError({
        code: 'NOT_FOUND',
        message: '종목을 찾을 수 없습니다',
        status: 404,
      }),
    );
    render(<StockDetailClient code="INVALID" />);

    await waitFor(() => expect(mockNotFound).toHaveBeenCalledTimes(1));
  });

  it('Test 6 — 500 ApiClientError → 인라인 에러 카드 + 재시도 버튼', async () => {
    mockFetch.mockRejectedValueOnce(
      new ApiClientError({
        code: 'INTERNAL',
        message: '서버 내부 오류',
        status: 500,
      }),
    );
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(
        screen.getByText('데이터를 불러오지 못했습니다'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('서버 내부 오류')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '다시 시도' }),
    ).toBeInTheDocument();
    // notFound() 는 호출되지 않아야 함
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('Test 7 — 갱신시각 "갱신 HH:MM:SS KST" 포맷 노출', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() => expect(screen.getByText('삼성전자')).toBeInTheDocument());

    // updatedAt 2026-04-15T05:30:00.000Z → Asia/Seoul = 14:30:00
    const label = screen.getByText(/^갱신 \d{2}:\d{2}:\d{2} KST$/);
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('갱신 14:30:00 KST');
  });

  /*
    260911-w5h — sticky 탭 바는 **본문 패딩을 가로지르도록** 만들어졌다(`-mx-*` + `px-*`).
    그 상쇄 값이 `AppShell main` 의 패딩(`p-2 lg:p-6`)과 **같은 브레이크포인트로 갈려야**
    한다. 한쪽만 고치면 모바일에서 바가 좌우로 16px 씩 삐져나간다 — 주석은 참인데 화면이
    깨지는, 이번 변경에서 가장 놓치기 쉬운 자리다.
  */
  it('Test 8 — sticky 탭 바 상쇄가 본문 여백(모바일 8px · ≥lg 24px)과 같은 축으로 갈린다', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    const list = await screen.findByRole('tablist', { name: '종목 정보 탭' });
    const bar = list.closest('.sticky')!;
    expect(bar.className).toContain('-mx-2');
    expect(bar.className).toContain('px-2');
    // 260924-vj1 — main 램프의 md 단계(16px)도 같은 축으로 상쇄한다.
    expect(bar.className).toContain('md:-mx-4');
    expect(bar.className).toContain('md:px-4');
    expect(bar.className).toContain('lg:-mx-6');
    expect(bar.className).toContain('lg:px-6');
    // 맨몸 24px 상쇄가 남아 있으면 모바일에서 그대로 걸린다.
    expect(bar.className).not.toMatch(/(^|\s)-mx-6(\s|$)/);
    expect(bar.className).not.toMatch(/(^|\s)px-6(\s|$)/);
  });
});
