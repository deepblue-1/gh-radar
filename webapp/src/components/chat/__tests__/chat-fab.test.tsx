import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatFab } from '../chat-fab';

// useAuth / useChat 를 모듈 모킹 — 컴포넌트 자체 로직(로그인 게이트 + 종목 라벨)만 검증.
const mockUseAuth = vi.fn();
const mockUseChat = vi.fn();

// quick-260912-mvo Q-01 — FAB 은 종목상세 본문에서만 렌더된다.
// app-sidebar.test.tsx 의 선례를 그대로 따라 usePathname 을 let 변수로 스텁한다.
let mockPathname = '/stocks/005930';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../chat-provider', () => ({
  useChat: () => mockUseChat(),
}));

const openChat = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값: 로그인 + 종목 컨텍스트 없음 + 종목상세 본문 경로. 각 테스트에서 override.
  mockPathname = '/stocks/005930';
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

  // -------------------------------------------------------------------------
  // quick-260912-mvo Q-01 — 경로 게이트.
  // 비렌더는 라벨 부재 **와** 컨테이너가 통째로 비어 있음 둘 다로 잠근다 —
  // 라벨만 보면 다이얼로그 잔재 같은 잔여 DOM 을 놓친다.
  // -------------------------------------------------------------------------
  it('Test 5 — 상따(/trading/limit-chaser)에서는 FAB 이 렌더되지 않는다 (Q-01)', () => {
    mockPathname = '/trading/limit-chaser';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('Test 6 — 홈(/)에서는 FAB 이 렌더되지 않는다 (Q-01)', () => {
    mockPathname = '/';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('Test 7 — 종목상세 하위 라우트(/stocks/{code}/news)에서는 렌더되지 않는다 (Q-01 경계)', () => {
    mockPathname = '/stocks/005930/news';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
