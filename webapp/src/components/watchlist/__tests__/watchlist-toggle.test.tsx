import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 06.2 Plan 07 Task 2 — WatchlistToggle 단위 테스트.
 *
 * 테스트 대상 행동:
 * 1. initial pressed=false + 클릭 → pressed=true (optimistic). insert 호출.
 * 2. insert 실패 (P0001) → pressed=false (rollback) + inline 에러 "관심종목은 최대 50개까지 저장할 수 있습니다."
 * 3. insert 실패 (기타 에러) → rollback + "관심종목 변경에 실패했습니다."
 * 4. insert 23505 (unique_violation) → pressed=true 유지 (silent — 이미 있음).
 * 5. isAtLimit=true + pressed=false → disabled + title 툴팁 포함.
 * 6. pressed=true → aria-label "{name} 관심종목 해제"; pressed=false → "{name} 관심종목 추가".
 * 7. Ghost variant — className 에 `data-[state=on]:bg-transparent` 포함.
 *
 * Mock 전략:
 * - `@/lib/supabase/client` 의 createClient — insert/delete 체인을 테스트마다 제어.
 * - `@/lib/auth-context` 의 useAuth — user.id 고정.
 * - `@/hooks/use-watchlist-set` 의 useWatchlistSet — isAtLimit / optimistic API.
 */

// --- Mock state (테스트마다 재설정) --------------------------------------
let mockInsertResult: { error: { code?: string; message?: string } | null } = {
  error: null,
};
let mockDeleteResult: { error: { code?: string; message?: string } | null } = {
  error: null,
};
let mockInsertCalled: { user_id: string; stock_code: string } | null = null;
let mockDeleteEqArgs: { col: string; val: unknown }[] = [];
let mockIsAtLimit = false;

const mockOptimisticAdd = vi.fn();
const mockOptimisticRemove = vi.fn();
const mockRefresh = vi.fn(async () => {});
let mockSet = new Set<string>();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (_table: string) => ({
      insert: vi.fn(async (payload: { user_id: string; stock_code: string }) => {
        mockInsertCalled = payload;
        return mockInsertResult;
      }),
      delete: () => {
        mockDeleteEqArgs = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            mockDeleteEqArgs.push({ col, val });
            if (mockDeleteEqArgs.length >= 2) {
              return Promise.resolve(mockDeleteResult);
            }
            return chain;
          },
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    displayName: 'Test',
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-watchlist-set', () => ({
  useWatchlistSet: () => ({
    set: mockSet,
    count: mockSet.size,
    isAtLimit: mockIsAtLimit,
    optimisticAdd: mockOptimisticAdd,
    optimisticRemove: mockOptimisticRemove,
    refresh: mockRefresh,
  }),
}));

// 반드시 mock 선언 이후에 import — vitest hoisting 규칙 따라 안전
import { WatchlistToggle } from '../watchlist-toggle';

beforeEach(() => {
  mockInsertResult = { error: null };
  mockDeleteResult = { error: null };
  mockInsertCalled = null;
  mockDeleteEqArgs = [];
  mockIsAtLimit = false;
  mockSet = new Set<string>();
  mockOptimisticAdd.mockClear();
  mockOptimisticRemove.mockClear();
  mockRefresh.mockClear();
});

describe('WatchlistToggle', () => {
  it('1. initial pressed=false → click → pressed=true + insert 호출', async () => {
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);
    const btn = screen.getByRole('button', { name: /관심종목 추가/ });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockInsertCalled).toEqual({ user_id: 'u1', stock_code: '005930' });
    });
    expect(mockOptimisticAdd).toHaveBeenCalledWith('005930');
  });

  it('2. insert 실패(P0001) → rollback + "관심종목은 최대 50개까지 저장할 수 있습니다."', async () => {
    mockInsertResult = {
      error: { code: 'P0001', message: 'watchlist_limit_exceeded' },
    };
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);
    const btn = screen.getByRole('button', { name: /관심종목 추가/ });

    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(
        screen.getByText('관심종목은 최대 50개까지 저장할 수 있습니다.'),
      ).not.toBeNull();
    });
    // 롤백 반영 → pressed 다시 false
    expect(
      screen.getByRole('button', { name: /관심종목 추가/ }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(mockOptimisticRemove).toHaveBeenCalledWith('005930');
  });

  it('3. insert 실패(기타) → rollback + "관심종목 변경에 실패했습니다."', async () => {
    mockInsertResult = { error: { code: '42501', message: 'RLS denied' } };
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /관심종목 추가/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('관심종목 변경에 실패했습니다.')).not.toBeNull();
    });
    expect(mockOptimisticRemove).toHaveBeenCalledWith('005930');
  });

  it('4. insert 23505(unique_violation) → pressed=true 유지, 에러 없음', async () => {
    mockInsertResult = { error: { code: '23505', message: 'dup' } };
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /관심종목 추가/ }));
    });

    await waitFor(() => {
      // 에러 alert 노출되면 안 됨
      expect(screen.queryByRole('alert')).toBeNull();
    });
    // pressed 상태 유지 → aria-label 해제 로 전환
    expect(
      screen.getByRole('button', { name: /관심종목 해제/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(mockOptimisticRemove).not.toHaveBeenCalled();
  });

  it('5. isAtLimit=true + pressed=false → disabled + title 툴팁', () => {
    mockIsAtLimit = true;
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.getAttribute('title')).toContain(
      '관심종목은 최대 50개까지 저장할 수 있습니다',
    );
  });

  it('6. aria-label 은 상태별로 "추가" / "해제" 로 분기', async () => {
    // unset 초기
    const { rerender } = render(
      <WatchlistToggle stockCode="005930" stockName="삼성전자" />,
    );
    expect(
      screen.getByRole('button', { name: '삼성전자 관심종목 추가' }),
    ).not.toBeNull();

    // set 된 상태 — mockSet 에 포함시키고 재렌더
    mockSet = new Set(['005930']);
    rerender(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);
    expect(
      screen.getByRole('button', { name: '삼성전자 관심종목 해제' }),
    ).not.toBeNull();
  });

  it('7. Ghost variant — data-[state=on]:bg-transparent 포함', () => {
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('data-[state=on]:bg-transparent');
  });

  it('8. pressed=true → 클릭 → delete 호출 + 낙관 제거', async () => {
    mockSet = new Set(['005930']);
    render(<WatchlistToggle stockCode="005930" stockName="삼성전자" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /관심종목 해제/ }));
    });

    await waitFor(() => {
      expect(mockDeleteEqArgs).toEqual([
        { col: 'user_id', val: 'u1' },
        { col: 'stock_code', val: '005930' },
      ]);
    });
    expect(mockOptimisticRemove).toHaveBeenCalledWith('005930');
  });
});
