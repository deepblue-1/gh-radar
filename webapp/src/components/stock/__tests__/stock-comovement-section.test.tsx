import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CoMovementCandidate } from '@gh-radar/shared';

/**
 * Phase 11 Plan 05 — StockComovementSection 컴포넌트 단위 테스트 (COMV-01).
 *
 * fetchStockComovement 를 mock 하고 mount fetch 결과 렌더를 검증한다.
 * - Test 1: 후보 5개 → 초기 3행 + "동조 후보 2개 더 보기" → 클릭 시 전체 + "접기".
 * - Test 2: 후보 ≤3 → 더보기 버튼 없음.
 * - Test 3: 빈 응답 → "동조 데이터 부족" 빈 상태.
 * - Test 4: fetch reject → 섹션 미렌더 (null, error.message 노출 0).
 * - Test 5: coSurgeCount → "직접동반 N회", isTrailing → "후행형", sharedThemes → 테마명.
 * - Test 6: 동반율 = Math.round(confD0*100)%, liveChangeRate null → "—".
 * - Test 7: co-surge 전용(sharedThemes=[], coSurgeCount=9, confD0=0) → 동반율 "—", "0%" 미표시.
 *
 * 경로 주의: vitest include = src/**.test.{ts,tsx} 이므로 plan 의 webapp/tests/components/
 * 가 아니라 프로젝트 컨벤션(co-located __tests__)에 배치 (Rule 3 — 테스트 실행 보장).
 */

const fetchStockComovementMock = vi.fn();
vi.mock('@/lib/comovement-api', () => ({
  fetchStockComovement: (...args: unknown[]) => fetchStockComovementMock(...args),
}));

import { StockComovementSection } from '../stock-comovement-section';

function makeCandidate(over: Partial<CoMovementCandidate> = {}): CoMovementCandidate {
  return {
    code: '024060',
    name: '흥구석유',
    market: 'KOSPI',
    liveChangeRate: 2.3,
    confD0: 0.81,
    strength: 0.94,
    isTrailing: false,
    sharedThemes: [{ id: 't1', name: '정유·석유' }],
    coSurgeCount: null,
    sampleConfidence: 'high',
    ...over,
  };
}

beforeEach(() => {
  fetchStockComovementMock.mockReset();
});

describe('StockComovementSection', () => {
  it('Test 1: 후보 5개 → 초기 3행 + 더보기 버튼 → 클릭 시 전체 + 접기', async () => {
    const five = ['A', 'B', 'C', 'D', 'E'].map((n, i) =>
      makeCandidate({ code: `00000${i}`, name: n }),
    );
    fetchStockComovementMock.mockResolvedValue({ candidates: five });

    render(<StockComovementSection stockCode="004090" />);

    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    // 초기 3행만
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(screen.queryByText('E')).not.toBeInTheDocument();

    const moreBtn = screen.getByRole('button', { name: '동조 후보 2개 더 보기' });
    await userEvent.click(moreBtn);

    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접기' })).toBeInTheDocument();
  });

  it('Test 2: 후보 ≤3 → 더보기 버튼 없음', async () => {
    const three = ['A', 'B', 'C'].map((n, i) =>
      makeCandidate({ code: `00000${i}`, name: n }),
    );
    fetchStockComovementMock.mockResolvedValue({ candidates: three });

    render(<StockComovementSection stockCode="004090" />);

    await waitFor(() => expect(screen.getByText('C')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /더 보기|접기/ })).not.toBeInTheDocument();
  });

  it('Test 3: 빈 응답 → "동조 데이터 부족" 빈 상태', async () => {
    fetchStockComovementMock.mockResolvedValue({ candidates: [] });

    render(<StockComovementSection stockCode="005935" />);

    await waitFor(() => expect(screen.getByText('동조 데이터 부족')).toBeInTheDocument());
    expect(
      screen.getByText(/함께 움직인 패턴을 찾지 못했습니다/),
    ).toBeInTheDocument();
  });

  it('Test 4: fetch reject → 섹션 미렌더 (error.message 노출 0)', async () => {
    fetchStockComovementMock.mockRejectedValue(
      new Error('PostgREST internal: relation does not exist'),
    );

    const { container } = render(<StockComovementSection stockCode="004090" />);

    await waitFor(() =>
      expect(fetchStockComovementMock).toHaveBeenCalledTimes(1),
    );
    // 섹션 자체가 렌더되지 않음 (quiet fallback)
    await waitFor(() =>
      expect(screen.queryByLabelText('동조 후보')).not.toBeInTheDocument(),
    );
    // error.message 절대 미노출
    expect(container.textContent).not.toContain('PostgREST');
    expect(container.textContent).not.toContain('relation does not exist');
  });

  it('Test 5: coSurgeCount → 직접동반 칩, isTrailing → 후행형, sharedThemes → 테마명', async () => {
    fetchStockComovementMock.mockResolvedValue({
      candidates: [
        makeCandidate({
          name: '대성에너지',
          coSurgeCount: 6,
          isTrailing: true,
          sharedThemes: [{ id: 't1', name: '정유·석유' }],
        }),
      ],
    });

    render(<StockComovementSection stockCode="004090" />);

    await waitFor(() => expect(screen.getByText('대성에너지')).toBeInTheDocument());
    expect(screen.getByText('정유·석유')).toBeInTheDocument();
    expect(screen.getByText('직접동반 6회')).toBeInTheDocument();
    expect(screen.getByText('후행형')).toBeInTheDocument();
  });

  it('Test 6: 동반율 = round(confD0*100)%, liveChangeRate null → "—"', async () => {
    fetchStockComovementMock.mockResolvedValue({
      candidates: [
        makeCandidate({ confD0: 0.674, liveChangeRate: null }),
      ],
    });

    render(<StockComovementSection stockCode="004090" />);

    await waitFor(() => expect(screen.getByText('흥구석유')).toBeInTheDocument());
    // 0.674 → 67%
    expect(screen.getByText('67%')).toBeInTheDocument();
    // liveChangeRate null → em-dash
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('Test 8: 종목 변경(remount 없이 props 갱신) 시 state 리셋 — 에러 sticky·stale 후보 방지 (WR-04)', async () => {
    // 1번 종목: fetch 실패 → 섹션 숨김(hasError sticky 후보).
    fetchStockComovementMock.mockRejectedValueOnce(
      new Error('PostgREST internal: relation does not exist'),
    );
    const { rerender } = render(<StockComovementSection stockCode="004090" />);
    await waitFor(() => expect(fetchStockComovementMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByLabelText('동조 후보')).not.toBeInTheDocument(),
    );

    // 2번 종목으로 이동(remount 없이 stockCode prop 만 갱신) → 성공 응답.
    fetchStockComovementMock.mockResolvedValueOnce({
      candidates: [makeCandidate({ name: '대성에너지' })],
    });
    rerender(<StockComovementSection stockCode="017900" />);

    // hasError 가 리셋되어 섹션이 다시 보이고 새 후보가 렌더되어야 한다.
    await waitFor(() => expect(screen.getByText('대성에너지')).toBeInTheDocument());
    expect(screen.getByLabelText('동조 후보')).toBeInTheDocument();
  });

  it('Test 7: co-surge 전용(sharedThemes=[], coSurgeCount=9, confD0=0) → 동반율 "—", "0%" 미표시', async () => {
    fetchStockComovementMock.mockResolvedValue({
      candidates: [
        makeCandidate({
          name: '대성에너지',
          sharedThemes: [],
          coSurgeCount: 9,
          confD0: 0,
          liveChangeRate: 3.8,
        }),
      ],
    });

    const { container } = render(<StockComovementSection stockCode="004090" />);

    await waitFor(() => expect(screen.getByText('대성에너지')).toBeInTheDocument());
    // 직접동반 칩은 존재
    expect(screen.getByText('직접동반 9회')).toBeInTheDocument();
    // 동반율 영역은 "—" — "0%" 절대 미표시
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(container.textContent).not.toContain('0%');
  });
});
