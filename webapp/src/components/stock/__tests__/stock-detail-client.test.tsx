import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@/lib/api';
import { fetchStockDetail } from '@/lib/stock-api';
import { notFound } from 'next/navigation';
import { StockDetailClient } from '../stock-detail-client';
import { FIXTURE_SAMSUNG } from '@/__tests__/fixtures/stocks';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));
vi.mock('@/lib/stock-api', () => ({
  fetchStockDetail: vi.fn(),
}));

const mockFetch = vi.mocked(fetchStockDetail);
const mockNotFound = vi.mocked(notFound);

beforeEach(() => {
  vi.clearAllMocks();
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

  it('Test 2 — fetch resolve 후 Hero/Stats/ComingSoon 렌더', async () => {
    mockFetch.mockResolvedValueOnce(FIXTURE_SAMSUNG);
    render(<StockDetailClient code="005930" />);

    await waitFor(() => {
      expect(screen.getByText('삼성전자')).toBeInTheDocument();
    });
    expect(screen.getByText('005930')).toBeInTheDocument();
    expect(screen.getByText('KOSPI')).toBeInTheDocument();
    expect(screen.getByText('관련 뉴스')).toBeInTheDocument();
    expect(screen.getByText('종목토론방')).toBeInTheDocument();
    expect(
      screen.getByText('Phase 7 로드맵에서 제공됩니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Phase 8 로드맵에서 제공됩니다.'),
    ).toBeInTheDocument();
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
