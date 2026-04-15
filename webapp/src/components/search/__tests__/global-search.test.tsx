/**
 * GlobalSearch integration tests (Phase 06-03).
 * - 9 tests per plan behavior contract.
 * - Mocks: next/navigation router · useDebouncedSearch · useCmdKShortcut
 * - Dialog portals to document.body → queries from `screen` root.
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Stock } from '@gh-radar/shared';

// ---------- Mocks ----------

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

const useDebouncedSearchMock = vi.fn();
vi.mock('@/hooks/use-debounced-search', () => ({
  useDebouncedSearch: (...args: unknown[]) => useDebouncedSearchMock(...args),
}));

const useCmdKShortcutMock = vi.fn();
vi.mock('@/hooks/use-cmdk-shortcut', () => ({
  useCmdKShortcut: (toggle: () => void) => useCmdKShortcutMock(toggle),
}));

// ---------- Import target after mocks ----------
import { GlobalSearch } from '../global-search';

const SAMSUNG: Stock = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  price: 70000,
  changeAmount: 500,
  changeRate: 0.72,
  volume: 12345678,
  tradeAmount: 864000000000,
  open: 69500,
  high: 70500,
  low: 69000,
  marketCap: 418000000000000,
  upperLimit: 91000,
  lowerLimit: 49000,
  updatedAt: '2026-04-15T05:00:00+09:00',
};

function setHookReturn(partial: Partial<{ results: Stock[]; loading: boolean; error: Error | undefined }>) {
  useDebouncedSearchMock.mockReturnValue({
    results: partial.results ?? [],
    loading: partial.loading ?? false,
    error: partial.error,
  });
}

beforeEach(() => {
  pushSpy.mockReset();
  useCmdKShortcutMock.mockReset();
  useDebouncedSearchMock.mockReset();
  setHookReturn({});
});

afterEach(() => {
  // RTL cleanup is registered globally in tests/setup.ts
});

describe('GlobalSearch', () => {
  it('Test 1: 초기 렌더 시 Dialog 가 닫혀 있다', () => {
    render(<GlobalSearch />);
    expect(screen.queryByRole('dialog')).toBeNull();
    // SearchTrigger 는 렌더되어야 함
    expect(screen.getAllByLabelText('종목 검색 열기').length).toBeGreaterThan(0);
  });

  it('Test 2: SearchTrigger 클릭 시 Dialog 가 열리고 useCmdKShortcut 이 toggle 을 등록한다', async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);
    expect(useCmdKShortcutMock).toHaveBeenCalledWith(expect.any(Function));

    // 트리거 중 첫 번째(데스크탑)를 클릭
    const triggers = screen.getAllByLabelText('종목 검색 열기');
    await user.click(triggers[0]!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('Test 3: query 입력 후 훅이 결과 반환 → 삼성전자 CommandItem 이 노출된다', async () => {
    const user = userEvent.setup();
    setHookReturn({ results: [SAMSUNG] });

    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    // 훅에 query 전달 확인 (input 입력 후)
    const input = within(dialog).getByPlaceholderText('종목명 또는 종목코드를 입력하세요');
    await user.type(input, '삼성');
    expect(useDebouncedSearchMock).toHaveBeenCalledWith('삼성', 300);

    expect(within(dialog).getByText('삼성전자')).toBeInTheDocument();
    expect(within(dialog).getByText('005930')).toBeInTheDocument();
    expect(within(dialog).getByText('KOSPI')).toBeInTheDocument();
  });

  it('Test 4: CommandItem 클릭 → router.push("/stocks/005930") + Dialog 닫힘', async () => {
    const user = userEvent.setup();
    setHookReturn({ results: [SAMSUNG] });

    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    const item = within(dialog).getByText('삼성전자');
    await user.click(item);

    expect(pushSpy).toHaveBeenCalledWith('/stocks/005930');
    // dialog 닫힘
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Test 5: query 비어있음 → 초기 카피 노출', async () => {
    const user = userEvent.setup();
    setHookReturn({});
    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText('검색어를 입력하면 결과가 표시됩니다'),
    ).toBeInTheDocument();
  });

  it('Test 6: loading=true → "검색 중…" 카피 노출', async () => {
    const user = userEvent.setup();
    setHookReturn({ loading: true });
    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    // query 입력해서 showInitial 을 false 로
    await user.type(
      within(dialog).getByPlaceholderText('종목명 또는 종목코드를 입력하세요'),
      'x',
    );
    expect(within(dialog).getByText('검색 중…')).toBeInTheDocument();
  });

  it('Test 7: query + results=[] + !loading → 빈 결과 카피', async () => {
    const user = userEvent.setup();
    setHookReturn({ results: [], loading: false });
    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    await user.type(
      within(dialog).getByPlaceholderText('종목명 또는 종목코드를 입력하세요'),
      'xyz',
    );
    expect(
      within(dialog).getByText('"xyz" 에 해당하는 종목이 없습니다'),
    ).toBeInTheDocument();
  });

  it('Test 8: error 상태 → 에러 카피 + destructive 색', async () => {
    const user = userEvent.setup();
    setHookReturn({ error: new Error('boom') });
    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    await user.type(
      within(dialog).getByPlaceholderText('종목명 또는 종목코드를 입력하세요'),
      '가',
    );

    const errEl = within(dialog).getByText(
      '검색에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(errEl).toBeInTheDocument();
    expect(errEl.className).toMatch(/text-\[var\(--destructive\)\]/);
  });

  it('Test 9: Command 에 shouldFilter={false} 가 적용되어 서버 결과가 필터링되지 않는다', async () => {
    const user = userEvent.setup();
    // query 가 '완전히다른문자열' 이어도 서버가 반환한 삼성전자가 노출되어야 함
    setHookReturn({ results: [SAMSUNG] });

    render(<GlobalSearch />);
    await user.click(screen.getAllByLabelText('종목 검색 열기')[0]!);
    const dialog = await screen.findByRole('dialog');

    // cmdk 가 클라이언트 필터링한다면 입력과 무관한 '삼성전자' 가 숨겨져야 하지만
    // shouldFilter={false} 이면 그대로 노출되어야 함
    await user.type(
      within(dialog).getByPlaceholderText('종목명 또는 종목코드를 입력하세요'),
      'zzzzzz',
    );
    // data-slot="command" 요소 확인 + value 속성 확인은 SSR 렌더 결과만으로 불가 →
    // 실제 동작(필터링되지 않음)으로 증명:
    expect(within(dialog).getByText('삼성전자')).toBeInTheDocument();
    // Item value 가 code 임을 확인: cmdk 는 `[cmdk-item][data-value]` 를 렌더
    const items = dialog.querySelectorAll('[cmdk-item]');
    expect(items.length).toBeGreaterThan(0);
    const values = Array.from(items).map((el) => el.getAttribute('data-value'));
    expect(values).toContain('005930');
  });
});

// SearchTrigger mock 안 함 — 실제 lucide-react Search 아이콘 렌더. fireEvent 로 모바일 버튼도 체크 가능.
void fireEvent;
