import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatFab } from '../chat-fab';

// useChatAccess / useChat 를 모듈 모킹 — 컴포넌트 자체 로직(경로 · 판정 게이트 + 종목 라벨)만 검증.
const mockUseChat = vi.fn();

// quick-261009-c43 D-03 — FAB 은 서버 판정 ok 일 때만 렌더된다. 반환 access 와 호출 인자 enabled 를 기록.
let mockAccess = 'ok';
const accessCalls: Array<boolean | undefined> = [];
vi.mock('@/hooks/use-chat-access', () => ({
  useChatAccess: (enabled?: boolean) => {
    accessCalls.push(enabled);
    return { access: enabled === false ? 'pending' : mockAccess, retry: vi.fn(), markUnmapped: vi.fn() };
  },
}));

// quick-260912-mvo Q-01 — FAB 은 종목상세 본문에서만 렌더된다.
// app-sidebar.test.tsx 의 선례를 그대로 따라 usePathname 을 let 변수로 스텁한다.
let mockPathname = '/stocks/005930';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('../chat-provider', () => ({
  useChat: () => mockUseChat(),
}));

const openChat = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값: 판정 ok + 종목 컨텍스트 없음 + 종목상세 본문 경로. 각 테스트에서 override.
  mockPathname = '/stocks/005930';
  mockAccess = 'ok';
  accessCalls.length = 0;
  mockUseChat.mockReturnValue({ openChat, stockContext: null });
});

describe('ChatFab', () => {
  // quick-261009-c43 D-03 — 판정 ok 가 아니면 FAB 이 DOM 에 없다(ChatSheet 를 여는 경로 없음).
  // 비로그인 로그인 다이얼로그는 없앴다 — 앱 전체가 로그인 벽 뒤라 비로그인은 종목상세에 닿지 못한다(chat.spec 260912-ok2).
  it.each(['pending', 'unmapped', 'unauthenticated', 'error'])(
    'Test 1 — 종목상세 + 판정 %s → 비렌더 (D-03)',
    (access) => {
      mockAccess = access;
      const { container } = render(<ChatFab />);
      expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
      expect(container).toBeEmptyDOMElement();
      expect(openChat).not.toHaveBeenCalled();
    },
  );

  it('Test 2 — 판정 ok 클릭 시 openChat 호출(시트 open) · 종목상세에서만 탐침 enabled', async () => {
    const user = userEvent.setup();
    render(<ChatFab />);

    await user.click(screen.getByRole('button', { name: 'AI' }));

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(accessCalls.every((e) => e === true)).toBe(true);
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
  it('Test 5 — 트레이딩 작업대(/trading)에서는 FAB 이 렌더되지 않는다 (Q-01)', () => {
    mockPathname = '/trading';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
    // 종목상세 밖에서는 탐침하지 않는다(전역 마운트 FAB — 매 페이지 탐침 금지).
    expect(accessCalls.length).toBeGreaterThan(0);
    expect(accessCalls.every((e) => e === false)).toBe(true);
  });

  it('Test 6 — 홈(/)에서는 FAB 이 렌더되지 않는다 (Q-01)', () => {
    mockPathname = '/';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
    // 종목상세 밖에서는 탐침하지 않는다(전역 마운트 FAB — 매 페이지 탐침 금지).
    expect(accessCalls.length).toBeGreaterThan(0);
    expect(accessCalls.every((e) => e === false)).toBe(true);
  });

  it('Test 7 — 종목상세 하위 라우트(/stocks/{code}/news)에서는 렌더되지 않는다 (Q-01 경계)', () => {
    mockPathname = '/stocks/005930/news';
    const { container } = render(<ChatFab />);

    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(container).toBeEmptyDOMElement();
    // 종목상세 밖에서는 탐침하지 않는다(전역 마운트 FAB — 매 페이지 탐침 금지).
    expect(accessCalls.length).toBeGreaterThan(0);
    expect(accessCalls.every((e) => e === false)).toBe(true);
  });
});

describe('ChatFab — 하단 고정 바용 실측 폭 변수 (18-10)', () => {
  it('종목상세에서 뜨면 `--chat-fab-w` 를 문서 루트에 싣고, 사라지면 지운다', () => {
    const { unmount } = render(<ChatFab />);
    // jsdom 은 레이아웃이 없어 폭이 0 이지만 **변수가 실린다는 계약**은 그대로 관측된다.
    expect(document.documentElement.style.getPropertyValue('--chat-fab-w')).toMatch(/^\d+px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue('--chat-fab-w')).toBe('');
  });

  it('FAB 이 뜨지 않는 경로에서는 변수를 싣지 않는다 — 바가 없는 FAB 자리를 비우지 않는다', () => {
    mockPathname = '/trading';
    render(<ChatFab />);
    expect(document.documentElement.style.getPropertyValue('--chat-fab-w')).toBe('');
  });
});
