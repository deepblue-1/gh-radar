import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DailyOhlcvRow } from '@gh-radar/shared';

// ── lightweight-charts 전체 mock — chart 인스턴스 lifecycle 은 본 테스트 범위 밖 ──
//    (jsdom 환경에서는 Canvas 렌더링 자체가 불가능. Manual Verification 이 시각 검증
//    책임 — VALIDATION.md 참조).
vi.mock('lightweight-charts', () => {
  const series = {
    applyOptions: vi.fn(),
    setData: vi.fn(),
  };
  const priceScale = { applyOptions: vi.fn() };
  const chart = {
    addSeries: vi.fn(() => series),
    priceScale: vi.fn(() => priceScale),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      setVisibleLogicalRange: vi.fn(),
    })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  };
  const markersPlugin = { setMarkers: vi.fn(), detach: vi.fn() };
  return {
    createChart: vi.fn(() => chart),
    createSeriesMarkers: vi.fn(() => markersPlugin),
    CandlestickSeries: 'CandlestickSeries',
    HistogramSeries: 'HistogramSeries',
  };
});

// ── next-themes mock — useTheme 만 ──
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

// ── daily-ohlcv-api mock — fetchDailyOhlcv 만 mock, aggregate 등은 actual 통과 ──
const fetchDailyOhlcvMock = vi.fn();
vi.mock('@/lib/daily-ohlcv-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/daily-ohlcv-api')>();
  return {
    ...actual,
    fetchDailyOhlcv: (...args: unknown[]) => fetchDailyOhlcvMock(...args),
  };
});

import { StockDailyChartSection } from '../stock-daily-chart-section';

const SAMPLE_ROWS: DailyOhlcvRow[] = [
  {
    date: '2026-04-15',
    open: 70000,
    high: 71000,
    low: 69500,
    close: 70500,
    volume: 12345,
    changeAmount: 500,
    changeRate: 0.71,
  },
  {
    date: '2026-04-16',
    open: 70500,
    high: 72000,
    low: 70000,
    close: 71500,
    volume: 15000,
    changeAmount: 1000,
    changeRate: 1.42,
  },
];

beforeEach(() => {
  fetchDailyOhlcvMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('StockDailyChartSection', () => {
  it('마운트 시 1Y 로 fetch + Skeleton 표시 → 데이터 도착 후 차트 컨테이너 노출', async () => {
    let resolveFetch!: (rows: DailyOhlcvRow[]) => void;
    fetchDailyOhlcvMock.mockReturnValueOnce(
      new Promise<DailyOhlcvRow[]>((res) => {
        resolveFetch = res;
      }),
    );
    render(<StockDailyChartSection code="005930" />);

    // fetch 호출 검증 — code, '1Y', AbortSignal (2026-05-16 기본 1Y 로 변경)
    expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(1);
    expect(fetchDailyOhlcvMock).toHaveBeenCalledWith(
      '005930',
      '1Y',
      expect.any(AbortSignal),
    );

    // Skeleton 분기
    expect(screen.getByLabelText('일봉 차트 로딩 중')).toBeInTheDocument();

    resolveFetch(SAMPLE_ROWS);
    await waitFor(() => {
      expect(
        screen.queryByLabelText('일봉 차트 로딩 중'),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByTestId('stock-daily-chart-canvas'),
    ).toBeInTheDocument();
  });

  it('빈 배열 응답 시 Empty state 표시', async () => {
    fetchDailyOhlcvMock.mockResolvedValueOnce([]);
    render(<StockDailyChartSection code="999999" />);
    await waitFor(() => {
      expect(
        screen.getByTestId('stock-daily-chart-empty'),
      ).toHaveTextContent('일봉 데이터가 아직 수집되지 않았습니다.');
    });
  });

  it('fetch 실패 시 generic 에러 카피 + 다시 시도 버튼 (T-09.2-07 — error.message 미노출)', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    fetchDailyOhlcvMock.mockRejectedValueOnce(new Error('PostgREST 500'));
    render(<StockDailyChartSection code="005930" />);
    await waitFor(() => {
      expect(
        screen.getByTestId('stock-daily-chart-error'),
      ).toHaveTextContent('일봉 데이터를 불러오지 못했습니다');
    });
    // 사용자 화면에는 'PostgREST 500' 누설 금지
    expect(
      screen.getByTestId('stock-daily-chart-error'),
    ).not.toHaveTextContent('PostgREST 500');
    // 디버그 정보는 console.error 로만
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: '다시 시도' }),
    ).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('range 토글 클릭 시 fetch 가 새 range 로 재호출 (1Y → 2Y)', async () => {
    fetchDailyOhlcvMock.mockResolvedValue(SAMPLE_ROWS);
    const user = userEvent.setup();
    render(<StockDailyChartSection code="005930" />);

    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('tab', { name: '2Y' }));

    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchDailyOhlcvMock).toHaveBeenLastCalledWith(
      '005930',
      '2Y',
      expect.any(AbortSignal),
    );
  });

  it('다시 시도 버튼 클릭 시 같은 range 로 재호출', async () => {
    fetchDailyOhlcvMock.mockRejectedValueOnce(new Error('네트워크'));
    fetchDailyOhlcvMock.mockResolvedValueOnce(SAMPLE_ROWS);
    const user = userEvent.setup();
    render(<StockDailyChartSection code="005930" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '다시 시도' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(2);
    });
  });

  it('aria-label="일봉 차트" 가 카드 컨테이너에 존재 (D-21)', async () => {
    fetchDailyOhlcvMock.mockResolvedValueOnce(SAMPLE_ROWS);
    render(<StockDailyChartSection code="005930" />);
    expect(screen.getByLabelText('일봉 차트')).toBeInTheDocument();
  });

  it('마지막 row 의 date 가 today (KST) + timeframe=D 이면 "장중" 배지 표시 (D-20)', async () => {
    // KST = UTC+9. 2026-05-15 KST = 2026-05-14T15:00:00Z 이후.
    // useFakeTimers + setSystemTime 으로 deterministic.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T06:00:00Z')); // 2026-05-15 15:00 KST
    try {
      const todayRow: DailyOhlcvRow = {
        date: '2026-05-15',
        open: 71500,
        high: 72500,
        low: 71000,
        close: 72000,
        volume: 20000,
        changeAmount: 500,
        changeRate: 0.69,
      };
      fetchDailyOhlcvMock.mockResolvedValueOnce([...SAMPLE_ROWS, todayRow]);
      render(<StockDailyChartSection code="005930" />);
      await waitFor(() => {
        expect(
          screen.getByTestId('stock-daily-chart-intraday-badge'),
        ).toHaveTextContent('장중');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshSignal 변경 시 동일 range 로 fetch 재호출 (D-19)', async () => {
    fetchDailyOhlcvMock.mockResolvedValue(SAMPLE_ROWS);
    const { rerender } = render(
      <StockDailyChartSection code="005930" refreshSignal={1} />,
    );
    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(1);
    });
    rerender(<StockDailyChartSection code="005930" refreshSignal={2} />);
    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchDailyOhlcvMock).toHaveBeenLastCalledWith(
      '005930',
      '1Y',
      expect.any(AbortSignal),
    );
  });

  it('timeframe 토글 클릭 시 카드 타이틀이 변경되고 fetch 는 재호출되지 않는다 (클라이언트 aggregate)', async () => {
    fetchDailyOhlcvMock.mockResolvedValue(SAMPLE_ROWS);
    const user = userEvent.setup();
    render(<StockDailyChartSection code="005930" />);

    await waitFor(() => {
      expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(1);
    });

    // 기본 = 일봉
    expect(screen.getByRole('heading')).toHaveTextContent('일봉 차트');

    await user.click(screen.getByRole('tab', { name: '주봉' }));
    expect(screen.getByRole('heading')).toHaveTextContent('주봉 차트');

    await user.click(screen.getByRole('tab', { name: '월봉' }));
    expect(screen.getByRole('heading')).toHaveTextContent('월봉 차트');

    // timeframe 변경은 fetch 재호출 안 함 (클라이언트 aggregate)
    expect(fetchDailyOhlcvMock).toHaveBeenCalledTimes(1);
  });

  it('timeframe=W/M 일 때는 마지막 row 가 today 라도 장중 배지 미표시', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-15T06:00:00Z'));
    try {
      const todayRow: DailyOhlcvRow = {
        date: '2026-05-15',
        open: 71500,
        high: 72500,
        low: 71000,
        close: 72000,
        volume: 20000,
        changeAmount: 500,
        changeRate: 0.69,
      };
      fetchDailyOhlcvMock.mockResolvedValue([...SAMPLE_ROWS, todayRow]);
      const user = userEvent.setup();
      render(<StockDailyChartSection code="005930" />);

      await waitFor(() => {
        expect(
          screen.getByTestId('stock-daily-chart-intraday-badge'),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('tab', { name: '주봉' }));

      await waitFor(() => {
        expect(
          screen.queryByTestId('stock-daily-chart-intraday-badge'),
        ).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
