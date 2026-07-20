import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConversationRow, MessageRow } from '@gh-radar/shared';

import { ChatSheet } from '../chat-sheet';

// 의존 계층(P07) 모듈 모킹 — 시트의 D-03 자동 이어가기/새 대화 배선만 검증.
const mockUseAuth = vi.fn();
const mockUseChat = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();
const streamChat = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('../chat-provider', () => ({
  useChat: () => mockUseChat(),
}));
vi.mock('@/lib/chat-api', () => ({
  listConversations: (...args: unknown[]) => listConversations(...args),
  getConversation: (...args: unknown[]) => getConversation(...args),
}));
vi.mock('@/lib/chat-sse', () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
  ChatStreamError: class extends Error {},
}));

const SAMSUNG = { code: '005930', name: '삼성전자' };

function makeConversation(id: string): ConversationRow {
  return {
    id,
    userId: 'u1',
    stockCode: '005930',
    title: '이전 대화',
    createdAt: '2026-07-02T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
  };
}

function makeMessage(id: string, role: 'user' | 'assistant', content: string): MessageRow {
  return {
    id,
    conversationId: 'c1',
    role,
    content,
    blocks: null,
    createdAt: '2026-07-02T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  mockUseChat.mockReturnValue({
    open: true,
    closeChat: vi.fn(),
    stockContext: null,
  });
});

describe('ChatSheet', () => {
  it('Test 1 — 종목 컨텍스트 open 시 최근 대화 자동 이어가기 (D-03)', async () => {
    mockUseChat.mockReturnValue({
      open: true,
      closeChat: vi.fn(),
      stockContext: SAMSUNG,
    });
    listConversations.mockResolvedValue([makeConversation('c1')]);
    getConversation.mockResolvedValue({
      conversation: makeConversation('c1'),
      messages: [
        makeMessage('m1', 'user', '이전 질문'),
        makeMessage('m2', 'assistant', '이전 답변입니다'),
      ],
    });

    render(<ChatSheet />);

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith('005930'),
    );
    await waitFor(() => expect(getConversation).toHaveBeenCalledWith('c1'));
    // 프리로드된 메시지가 thread 에 표시된다
    await waitFor(() =>
      expect(screen.getByText('이전 답변입니다')).toBeInTheDocument(),
    );
  });

  it('Test 2 — 종목 컨텍스트지만 대화 없음 → 빈 상태 (새 대화)', async () => {
    mockUseChat.mockReturnValue({
      open: true,
      closeChat: vi.fn(),
      stockContext: SAMSUNG,
    });
    listConversations.mockResolvedValue([]);

    render(<ChatSheet />);

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith('005930'),
    );
    // 대화가 없으면 getConversation 미호출 + 빈 상태(종목 컨텍스트 제목)
    expect(getConversation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText('삼성전자에 대해 무엇이든 물어보세요'),
      ).toBeInTheDocument(),
    );
  });

  it('Test 3 — ＋ 새 대화 클릭 시 메시지 초기화 (stockContext 유지)', async () => {
    mockUseChat.mockReturnValue({
      open: true,
      closeChat: vi.fn(),
      stockContext: SAMSUNG,
    });
    listConversations.mockResolvedValue([makeConversation('c1')]);
    getConversation.mockResolvedValue({
      conversation: makeConversation('c1'),
      messages: [makeMessage('m2', 'assistant', '이전 답변입니다')],
    });

    const user = userEvent.setup();
    render(<ChatSheet />);

    await waitFor(() =>
      expect(screen.getByText('이전 답변입니다')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '새 대화' }));

    // 메시지 초기화 → 이전 답변 사라지고 빈 상태(종목 컨텍스트 제목)
    await waitFor(() =>
      expect(screen.queryByText('이전 답변입니다')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('삼성전자에 대해 무엇이든 물어보세요'),
    ).toBeInTheDocument();
  });

  it('Test 4 — 일반(비종목) 컨텍스트 open → 자동 로드 안 함, 빈 상태', async () => {
    mockUseChat.mockReturnValue({
      open: true,
      closeChat: vi.fn(),
      stockContext: null,
    });

    render(<ChatSheet />);

    await waitFor(() =>
      expect(screen.getByText('무엇이든 물어보세요')).toBeInTheDocument(),
    );
    // 일반 챗은 자동 이어가기 없음(목록/이어가기는 /chat P10 담당, D-13)
    expect(listConversations).not.toHaveBeenCalled();
  });
});
