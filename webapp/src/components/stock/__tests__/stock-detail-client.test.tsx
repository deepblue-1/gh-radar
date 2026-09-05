import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import { notFound } from 'next/navigation';
import { StockDetailClient } from '../stock-detail-client';
import { FIXTURE_SAMSUNG } from '@/__tests__/fixtures/stocks';

// Phase 15 Plan 11: StockDetailTabs 가 `?tab=` 을 단일 진실로 읽으므로 useSearchParams 도
// stub 한다. 테스트가 이 변수를 바꿔서 활성 탭을 지정한다 (vi.mock 팩토리는 호이스팅되지만
// 화살표 함수 본문은 호출 시점에 평가되므로 `mock` 접두사 변수 참조가 허용된다).
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  // StockHero 가 ← 버튼용으로 useRouter 호출 — jsdom app router 미마운트 invariant 회피.
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
// Phase 15 Plan 13: `호가주문` 탭이 StockOrderbookSection → useRelaySocket 을 마운트한다.
// jsdom 에는 Supabase 환경변수가 없어 실제 createClient 가 throw 하므로, 세션 없는
// 클라이언트로 대체해 **로그인 게이트(unauthorized)** 경로를 결정론적으로 태운다.
// (wss 훅 자체의 검증은 lib/__tests__/relay-socket.test.ts 소관.)
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

  it('Test 2b — 4탭이 tablist 로 렌더되고 기본 활성 탭은 `차트` (T2/T3)', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(screen.getByText('삼성전자')).toBeInTheDocument(),
    );

    for (const label of ['차트', '호가주문', '종목정보', '뉴스토론']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
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

  it('Test 2d — `?tab=orderbook` 진입 시 호가창 섹션이 마운트된다 (UI-SPEC C1)', async () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument(),
    );
    // 실시간 현재가와 스냅샷 히어로가 다를 수 있음을 설명하는 출처 라벨(D1).
    expect(screen.getByText(/실시간\(DMA\)/)).toBeInTheDocument();
  });

  it('Test 2e — 권한 없는 사용자에게도 섹션이 사라지지 않고 게이트 카드가 뜬다 (UI-SPEC C13)', async () => {
    mockSearchParams = new URLSearchParams('tab=orderbook');
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() =>
      expect(screen.getByTestId('orderbook-access-gate')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument();
    // 제목·보조 문구는 게이트 카드 안에서 찾는다 — 상태 바도 같은 제목 문구를 쓴다.
    const gate = within(screen.getByTestId('orderbook-access-gate'));
    expect(gate.getByText('실시간 호가·주문 권한이 없어요')).toBeInTheDocument();
    expect(
      gate.getByText('이 종목의 차트·뉴스·종목토론방은 그대로 이용할 수 있어요.'),
    ).toBeInTheDocument();
    // 셀프서비스 경로가 없으므로 게이트에 행동 버튼을 두지 않는다.
    expect(gate.queryByRole('button')).not.toBeInTheDocument();
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
});
