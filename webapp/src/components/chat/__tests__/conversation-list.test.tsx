import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConversationRow } from '@gh-radar/shared';

import { clearQueryCache } from '@/lib/query-cache';

import { ConversationList } from '../conversation-list';
import { DeleteConversationDialog } from '../delete-conversation-dialog';

// 의존 계층(P07) chat-api 모킹 — 목록 조회/삭제 배선만 검증.
const listConversations = vi.fn();
const deleteConversation = vi.fn();

vi.mock('@/lib/chat-api', () => ({
  listConversations: (...args: unknown[]) => listConversations(...args),
  deleteConversation: (...args: unknown[]) => deleteConversation(...args),
}));

function makeConversation(
  id: string,
  over: Partial<ConversationRow> = {},
): ConversationRow {
  return {
    id,
    userId: 'u1',
    stockCode: null,
    title: `대화 ${id}`,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // D-32 재방문 시드는 모듈 수준 캐시다 — 테스트 사이에 새지 않게 비운다.
  clearQueryCache();
  listConversations.mockResolvedValue([]);
  deleteConversation.mockResolvedValue(undefined);
});

describe('ConversationList', () => {
  it('Test 1 — listConversations 결과를 updatedAt desc 로 렌더 + active 대화 aria-current', async () => {
    listConversations.mockResolvedValue([
      makeConversation('old', {
        title: '오래된 대화',
        updatedAt: '2026-07-01T00:00:00Z',
      }),
      makeConversation('new', {
        title: '최신 대화',
        updatedAt: '2026-07-02T00:00:00Z',
      }),
    ]);

    render(
      <ConversationList activeId="new" onSelect={vi.fn()} onNew={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.getByText('최신 대화')).toBeInTheDocument(),
    );

    // updatedAt desc — 최신 대화가 목록 첫 항목
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('최신 대화');
    expect(items[1]).toHaveTextContent('오래된 대화');

    // active 대화(new)에 aria-current="true"
    const activeButton = screen.getByRole('button', { name: /최신 대화/ });
    expect(activeButton).toHaveAttribute('aria-current', 'true');
    const inactiveButton = screen.getByRole('button', { name: /오래된 대화/ });
    expect(inactiveButton).not.toHaveAttribute('aria-current', 'true');
  });

  it('Test 2 — 종목 필터 select 변경 → listConversations(stockCode) 재조회', async () => {
    listConversations.mockResolvedValue([
      makeConversation('a', { stockCode: '005930', title: '삼성 대화' }),
    ]);

    const user = userEvent.setup();
    render(<ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);

    // 최초 로드는 전체(undefined)
    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(undefined),
    );

    // 종목 필터를 005930 으로 변경 → 해당 종목만 재조회
    await user.selectOptions(screen.getByRole('combobox'), '005930');
    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith('005930'),
    );
  });

  it('Test 3 — 🗑(대화 삭제) 클릭 → 삭제 확인 다이얼로그 open', async () => {
    listConversations.mockResolvedValue([
      makeConversation('a', { title: '삭제할 대화' }),
    ]);

    const user = userEvent.setup();
    render(<ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText('삭제할 대화')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '대화 삭제' }));

    await waitFor(() =>
      expect(screen.getByText('이 대화를 삭제할까요?')).toBeInTheDocument(),
    );
  });
});

describe('ConversationList — D-32 재방문 시드 (G-21-R3-11)', () => {
  const ROWS = [
    makeConversation('old', { title: '오래된 대화', updatedAt: '2026-07-01T00:00:00Z' }),
    makeConversation('new', {
      title: '최신 대화',
      stockCode: '005930',
      updatedAt: '2026-07-02T00:00:00Z',
    }),
  ];
  const titles = () =>
    within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent ?? '');

  it('재마운트 첫 렌더에 이전 목록(정렬 · 필터 옵션 포함)이 보이고, 요청 뒤 교체된다', async () => {
    listConversations.mockResolvedValue(ROWS);
    const first = render(
      <ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('최신 대화')).toBeInTheDocument());
    first.unmount();

    let resolve!: (rows: ConversationRow[]) => void;
    listConversations.mockReturnValue(new Promise<ConversationRow[]>((r) => (resolve = r)));
    render(<ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);

    // 첫 렌더 — 요청이 끝나기 전에 이미 정렬된 이전 목록이 서 있다.
    const before = titles();
    expect(before).toHaveLength(2);
    expect(before[0]).toContain('최신 대화');
    expect(screen.getByRole('option', { name: '005930' })).toBeInTheDocument();
    expect(listConversations).toHaveBeenCalledTimes(2);

    resolve([makeConversation('fresh', { title: '새로 받은 대화' })]);
    await waitFor(() => expect(screen.getByText('새로 받은 대화')).toBeInTheDocument());
    expect(screen.queryByText('최신 대화')).toBeNull();
  });

  it('필터를 바꾸면 그 키의 캐시가 있으면 먼저 보여 준다', async () => {
    listConversations.mockImplementation(async (code?: string) =>
      code === '005930' ? [ROWS[1]!] : ROWS,
    );
    const user = userEvent.setup();
    render(<ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);
    await waitFor(() => expect(titles()).toHaveLength(2));

    await user.selectOptions(screen.getByRole('combobox'), '005930');
    await waitFor(() => expect(titles()).toHaveLength(1));

    // 전체로 돌아갈 때 조회가 멈춰 있어도 전체 캐시가 바로 선다.
    listConversations.mockImplementation(() => new Promise(() => {}));
    await user.selectOptions(screen.getByRole('combobox'), 'all');
    expect(titles()).toHaveLength(2);
  });

  it('지운 대화는 재방문 시드로 되살아나지 않는다', async () => {
    listConversations.mockResolvedValue(ROWS);
    const user = userEvent.setup();
    const first = render(
      <ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />,
    );
    await waitFor(() => expect(titles()).toHaveLength(2));

    await user.click(screen.getAllByRole('button', { name: '대화 삭제' })[0]!);
    await user.click(await screen.findByRole('button', { name: '삭제' }));
    await waitFor(() => expect(titles()).toHaveLength(1));
    first.unmount();

    listConversations.mockReturnValue(new Promise(() => {}));
    render(<ConversationList activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(titles()).toHaveLength(1);
    expect(screen.queryByText('최신 대화')).toBeNull();
  });
});

describe('DeleteConversationDialog', () => {
  it('Test 4 — 취소 → 미삭제 / 삭제 → deleteConversation(id) + onDeleted 콜백', async () => {
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();

    const user = userEvent.setup();
    render(
      <DeleteConversationDialog
        conversation={makeConversation('c1', { title: '대화' })}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    );

    // 취소 → 닫힘 요청 + 삭제 미호출
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(deleteConversation).not.toHaveBeenCalled();

    // 삭제 → deleteConversation(id) + onDeleted(id)
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(deleteConversation).toHaveBeenCalledWith('c1'),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('c1'));
  });

  it('Test 5 — 삭제 실패 → 에러 피드백 표시 + onDeleted 미호출 (WR-05)', async () => {
    deleteConversation.mockRejectedValue(new Error('network'));
    const onDeleted = vi.fn();

    const user = userEvent.setup();
    render(
      <DeleteConversationDialog
        conversation={makeConversation('c1', { title: '대화' })}
        onOpenChange={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole('button', { name: '삭제' }));

    // 실패 피드백이 표시되고, 목록 갱신 콜백은 호출되지 않는다.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('삭제에 실패했어요'),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    // 버튼은 재시도 가능 상태로 복귀.
    expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
  });
});
