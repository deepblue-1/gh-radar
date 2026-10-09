import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { ApiClientError } from '@/lib/api';

/**
 * quick-261009-c43 D-02 — `/chat` 접근 판정 표시.
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 판정 전에 본문을 그리면          → 미매핑 사용자에게 대화 화면이 떴다가 게이트로 바뀐다(깜빡임)
 *  - 미매핑에 입력창이 남으면          → 보내 봐야 403 — 왜 안 되는지 모른다
 *  - 탐침 실패에 재시도가 없으면       → 일시 오류에 화면이 영영 빈다
 *  - 스트림 403 을 일반 오류로 접으면  → 세션 중 DMA 연결 해제가 「답변을 불러오지 못했어요」 로 보인다
 */

type Access = 'pending' | 'ok' | 'error' | 'unauthenticated' | 'unmapped';
const retry = vi.fn();
const markUnmapped = vi.fn();
let access: Access = 'ok';
vi.mock('@/hooks/use-chat-access', () => ({
  useChatAccess: () => ({ access, retry, markUnmapped }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/chat' }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1' }, isLoading: false }) }));
vi.mock('@/lib/relay-provider', () => ({ useRelayContext: () => ({ status: 'idle' }) }));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/layout/app-sidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/chat/conversation-list', () => ({
  ConversationList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect('c1')}>
      대화 c1
    </button>
  ),
}));

const streamChatMock = vi.fn();
vi.mock('@/lib/chat-sse', async (orig) => ({
  ...(await orig<typeof import('@/lib/chat-sse')>()),
  streamChat: (...args: unknown[]) => streamChatMock(...args),
}));

const getConversationMock = vi.fn();
vi.mock('@/lib/chat-api', () => ({
  getConversation: (id: string) => getConversationMock(id),
}));

import ChatPage from '../page';
import { ChatStreamError } from '@/lib/chat-sse';

beforeEach(() => {
  access = 'ok';
  retry.mockReset();
  markUnmapped.mockReset();
  streamChatMock.mockReset();
  getConversationMock.mockReset();
});

describe('/chat 접근 판정 (quick-261009-c43 D-02)', () => {
  it('"pending" → 입력창 없음 · 게이트 없음(본문 비움)', () => {
    access = 'pending';
    render(<ChatPage />);
    expect(screen.queryByLabelText('메시지 입력')).toBeNull();
    expect(screen.queryByText('DMA 계정이 연결되지 않았어요')).toBeNull();
    expect(screen.queryByText('로그인이 필요해요')).toBeNull();
  });

  it('"unmapped" → DmaGate 「AI 애널리스트는 …」 · 입력창 없음', () => {
    access = 'unmapped';
    render(<ChatPage />);
    expect(screen.getByText('DMA 계정이 연결되지 않았어요')).toBeInTheDocument();
    expect(
      screen.getByText(/AI 애널리스트는 증권사 계정이 연결된 사용자만 이용할 수 있어요\./),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('메시지 입력')).toBeNull();
    expect(screen.queryByText('대화 c1')).toBeNull();
  });

  it('"unauthenticated" → DmaGate 「로그인이 필요해요」', () => {
    access = 'unauthenticated';
    render(<ChatPage />);
    expect(screen.getByText('로그인이 필요해요')).toBeInTheDocument();
    expect(screen.queryByLabelText('메시지 입력')).toBeNull();
  });

  it('"error" → ChatErrorState 「다시 시도」 클릭 시 retry', async () => {
    access = 'error';
    render(<ChatPage />);
    expect(screen.queryByLabelText('메시지 입력')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('"ok" → 입력창 보임 · 스트림 403(DMA_UNMAPPED) 이면 markUnmapped', async () => {
    streamChatMock.mockRejectedValue(new ChatStreamError('DMA_UNMAPPED', 'DMA 계정이 연결되지 않았습니다.'));
    render(<ChatPage />);
    const input = screen.getByLabelText('메시지 입력');
    await userEvent.type(input, '삼성전자 어때{Enter}');
    await waitFor(() => expect(markUnmapped).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('답변을 불러오지 못했어요')).toBeNull();
  });

  it('"ok" → 대화 열기 403 이면 markUnmapped, 그 밖 오류는 종전처럼 오류 상자', async () => {
    getConversationMock.mockRejectedValueOnce(
      new ApiClientError({ code: 'DMA_UNMAPPED', message: 'x', status: 403 }),
    );
    render(<ChatPage />);
    await userEvent.click(screen.getByText('대화 c1'));
    await waitFor(() => expect(markUnmapped).toHaveBeenCalledTimes(1));

    getConversationMock.mockRejectedValueOnce(new ApiClientError({ code: 'X', message: 'x', status: 500 }));
    await userEvent.click(screen.getByText('대화 c1'));
    await waitFor(() => expect(screen.getByText('답변을 불러오지 못했어요')).toBeInTheDocument());
    expect(markUnmapped).toHaveBeenCalledTimes(1);
  });
});
