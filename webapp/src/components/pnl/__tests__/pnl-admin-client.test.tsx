import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PnlGroup, PnlReport } from '@gh-radar/shared';

import { PnlAdminClient } from '../pnl-admin-client';

/*
  Phase 36-08 Task 2 — /admin/pnl(UI-SPEC ⑤a · D-17 ①). 주소(?range · ?key)가 진실 원본 · router.replace ·
  잘못된 값은 그 키만 지운다 · 묶음은 계좌별 하나(증권사 배지 + 계좌번호) · 옛 ?group 은 지운다(2026-11-06 계정별 제거).
*/

let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn((href: string) => {
  const q = href.split('?')[1] ?? '';
  mockSearchParams = new URLSearchParams(q);
});
const mockFetchAdminPnl = vi.fn<(group: string, range: string) => Promise<PnlReport>>();

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/pnl',
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));
vi.mock('@/lib/pnl-api', () => ({
  fetchAdminPnl: (group: string, range: string) => mockFetchAdminPnl(group, range),
  fetchMyPnl: vi.fn(),
}));

const TOTAL = { pnl: 1_234_567, fee: 16_400, tax: 33_000, buy: 15_000_000, sell: 16_400_000, fills: 7 };
const DAY = { date: '2026-10-27', ...TOTAL, stocks: [] };

function group(over: Partial<PnlGroup>): PnlGroup {
  return { key: 'k', accounts: [], dma_user_ids: [], account_name: null, total: TOTAL, days: [DAY], ...over };
}

const ACCOUNT_REPORT: PnlReport = {
  from: '2026-09-28',
  to: '2026-10-27',
  groups: [
    group({
      key: '37728502101',
      accounts: [
        { broker: 'KB', gateway: 'KB120', account_no: '37728502101' },
        { broker: 'KB', gateway: 'KB121', account_no: '37728502101' },
      ],
      dma_user_ids: ['ezmesya', 'kim01'],
      account_name: '위탁',
    }),
    group({
      key: '10279758101',
      accounts: [{ broker: 'KYOBO', gateway: 'KYOBO119', account_no: '10279758101' }],
      dma_user_ids: ['ezmesya'],
    }),
  ],
};

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockReplace.mockClear();
  mockFetchAdminPnl.mockReset();
  mockFetchAdminPnl.mockResolvedValue(ACCOUNT_REPORT);
});

const heads = () => Array.from(document.querySelectorAll('[data-slot="pnl-group-head"]')) as HTMLElement[];
const chips = () => screen.getByRole('radiogroup', { name: '계좌' });

describe('PnlAdminClient — /admin/pnl', () => {
  it('① 기본 → fetchAdminPnl("account", "30") 1회 · h1 「매매손익」 · 묶음 세그먼트 없음 · 문서 제목', async () => {
    render(<PnlAdminClient />);
    expect(screen.getByRole('heading', { level: 1, name: '매매손익' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '묶음' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정별' })).toBeNull();
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(mockFetchAdminPnl).toHaveBeenCalledTimes(1);
    expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', '30');
    expect(document.title).toBe('매매손익 · Admin');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('② 펼침 기본 — 모든 일자 행 닫힘 · 클릭하면 그 행만 열림', async () => {
    const user = userEvent.setup();
    render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
    await user.click(document.querySelector('[data-slot="pnl-group"] button[aria-expanded]')!);
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
  });

  it('③ 옛 주소 ?group=user&key=ezmesya&range=90 → group · 계정 key 지움 · range 유지 / ?group=account&key=… → key 유지', async () => {
    mockSearchParams = new URLSearchParams('group=user&key=ezmesya&range=90');
    const view = render(<PnlAdminClient />);
    expect(mockReplace).toHaveBeenCalledWith('/admin/pnl?range=90');
    await waitFor(() => expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', '90'));
    expect(screen.getByRole('button', { name: '90일' })).toHaveAttribute('aria-pressed', 'true');
    view.unmount();

    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams('group=account&key=10279758101');
    render(<PnlAdminClient />);
    expect(mockReplace).toHaveBeenCalledWith('/admin/pnl?key=10279758101');
    await waitFor(() => expect(heads()).toHaveLength(1));
  });

  it('③b ?range=zz → range 만 지움 · 기간 「이달」 → 주소 ?range=month(다른 키 보존) · 재조회', async () => {
    mockSearchParams = new URLSearchParams('key=10279758101&range=zz');
    const user = userEvent.setup();
    const view = render(<PnlAdminClient />);
    expect(mockReplace).toHaveBeenCalledWith('/admin/pnl?key=10279758101');
    view.rerender(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '이달' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/pnl?key=10279758101&range=month');
    view.rerender(<PnlAdminClient />);
    await waitFor(() => expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', 'month'));
    expect(await screen.findAllByText('이달 실현손익')).toHaveLength(1);
  });

  it('④ 계좌 머리 — 배지 「KB」/「교보」 + 계좌번호 · 부제 「ezmesya · kim01 · 위탁」(계좌명 없으면 생략) · 「미상」 없음', async () => {
    render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    const badge = (h: HTMLElement) => h.querySelector('[data-slot="pnl-broker-badge"]') as HTMLElement;
    expect(heads().map((h) => badge(h).textContent)).toEqual(['KB', '교보']);
    expect(heads()[0]!.querySelector('[data-slot="pnl-group-title"]')).toHaveTextContent('37728502101');
    expect(heads()[0]!.querySelector('[data-slot="pnl-group-sub"]')).toHaveTextContent('ezmesya · kim01 · 위탁');
    expect(heads()[1]!.querySelector('[data-slot="pnl-group-sub"]')!.textContent).toBe('ezmesya');
    expect(screen.queryByText('미상')).toBeNull();
  });

  it('⑤ 조회 실패 → 오류 상자 · 「다시 시도」 → 같은 키로 재조회 · 기간 줄은 그대로', async () => {
    mockFetchAdminPnl.mockReset();
    mockFetchAdminPnl.mockRejectedValueOnce(new Error('500')).mockResolvedValue(ACCOUNT_REPORT);
    render(<PnlAdminClient />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('매매손익을 불러오지 못했어요');
    expect(screen.getByRole('group', { name: '기간' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(mockFetchAdminPnl).toHaveBeenCalledTimes(2);
  });

  it('⑥ 계좌 칩 「KB 위탁 37728502101」 · 「교보 10279758101」 · 칩 → ?key= 그 계좌만 · 「전체」 → key 지움 · 없는 key 는 「전체」', async () => {
    const user = userEvent.setup();
    const view = render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(within(chips()).getAllByRole('radio').map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      '전체',
      'KB 위탁 37728502101',
      '교보 10279758101',
    ]);
    expect(within(chips()).getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(chips()).getByRole('radio', { name: '교보 10279758101' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/pnl?key=10279758101');
    view.rerender(<PnlAdminClient />);
    expect(heads().map((h) => h.querySelector('[data-slot="pnl-group-title"]')!.textContent)).toEqual(['10279758101']);
    expect(within(chips()).getByRole('radio', { name: '교보 10279758101' })).toHaveAttribute('aria-checked', 'true');
    expect(mockFetchAdminPnl).toHaveBeenCalledTimes(1);

    await user.click(within(chips()).getByRole('radio', { name: '전체' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/pnl');

    mockSearchParams = new URLSearchParams('key=nobody');
    view.rerender(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(within(chips()).getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'true');
  });
});
