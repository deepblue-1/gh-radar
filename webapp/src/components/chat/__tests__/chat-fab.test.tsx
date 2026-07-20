import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatFab } from '../chat-fab';

// useAuth / useChat 를 모듈 모킹 — 컴포넌트 자체 로직(로그인 게이트 + 종목 라벨)만 검증.
const mockUseAuth = vi.fn();
const mockUseChat = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../chat-provider', () => ({
  useChat: () => mockUseChat(),
}));

const openChat = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값: 로그인 + 종목 컨텍스트 없음. 각 테스트에서 override.
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  mockUseChat.mockReturnValue({ openChat, stockContext: null });
});

describe('ChatFab', () => {
  it('Test 1 — 비로그인 클릭 시 로그인 필요 상태 표시 + openChat 미호출 (D-01)', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: null });
    render(<ChatFab />);

    await user.click(screen.getByRole('button', { name: 'AI' }));

    // 로그인 유도 상태 박스(C11) 노출 — 체험 모드 없음
    await waitFor(() =>
      expect(screen.getByText('로그인이 필요해요')).toBeInTheDocument(),
    );
    // 챗 시트는 열리지 않는다
    expect(openChat).not.toHaveBeenCalled();
  });

  it('Test 2 — 로그인 클릭 시 openChat 호출(시트 open)', async () => {
    const user = userEvent.setup();
    render(<ChatFab />);

    await user.click(screen.getByRole('button', { name: 'AI' }));

    expect(openChat).toHaveBeenCalledTimes(1);
    // 로그인 필요 상태는 뜨지 않는다
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument();
  });

  it('Test 3 — 종목 컨텍스트: 라벨 반영 + 컨텍스트 전달', async () => {
    const user = userEvent.setup();
    const stockContext = { code: '005930', name: '삼성전자' };
    mockUseChat.mockReturnValue({ openChat, stockContext });
    render(<ChatFab />);

    const fab = screen.getByRole('button', {
      name: 'AI · 삼성전자 분석',
    });
    expect(fab).toBeInTheDocument();

    await user.click(fab);
    expect(openChat).toHaveBeenCalledWith(stockContext);
  });

  it('Test 4 — 종목 컨텍스트 없음: 기본 라벨 AI', () => {
    render(<ChatFab />);
    expect(
      screen.getByRole('button', { name: 'AI' }),
    ).toBeInTheDocument();
    // 종목 라벨 접미사는 없다
    expect(
      screen.queryByRole('button', { name: /분석$/ }),
    ).not.toBeInTheDocument();
  });
});
