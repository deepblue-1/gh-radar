import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import StockNotFound from '../not-found';

// AppShell 은 next-themes Provider · 사이드바 등 의존 → 단위 테스트에서 mock
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('StockNotFound (/stocks/[code]/not-found.tsx)', () => {
  it('제목/본문/CTA 카피 정확 노출', () => {
    render(<StockNotFound />);
    expect(
      screen.getByRole('heading', { name: '종목을 찾을 수 없습니다' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/영문\/숫자 1~10자, 예: 005930/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: '스캐너로 돌아가기' });
    expect(cta).toHaveAttribute('href', '/scanner');
  });
});
