import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StockError from '../error';

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('StockError (/stocks/[code]/error.tsx)', () => {
  it('error.message + 재시도 버튼', async () => {
    const reset = vi.fn();
    const err = new Error('백엔드 서버 장애') as Error & { digest?: string };
    // console.error 는 useEffect 내부 호출 → 테스트 로그 정리 위해 spy
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StockError error={err} reset={reset} />);
    expect(
      screen.getByRole('heading', { name: '데이터를 불러오지 못했습니다' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/백엔드 서버 장애/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: '다시 시도' });
    await userEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
