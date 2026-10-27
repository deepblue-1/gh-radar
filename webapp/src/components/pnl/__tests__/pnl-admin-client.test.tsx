import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PnlGroup, PnlReport } from '@gh-radar/shared';

import { PnlAdminClient } from '../pnl-admin-client';

/*
  Phase 36-08 Task 2 — /admin/pnl(UI-SPEC ⑤a · D-17 ①). 주소(?group · ?range)가 진실 원본 · router.replace ·
  잘못된 값은 그 키만 지운다 · 묶음 머리(계정별 = dma_user_id · 미상 / 계좌별 = 증권사 배지 + 계좌번호).
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

const USER_REPORT: PnlReport = {
  from: '2026-09-28',
  to: '2026-10-27',
  groups: [
    group({
      key: 'ezmesya',
      accounts: [
        { broker: 'KB', gateway: 'KB120', account_no: '37728502101' },
        { broker: 'KYOBO', gateway: 'KYOBO119', account_no: '10279758101' },
      ],
      dma_user_ids: ['ezmesya'],
    }),
    group({ key: 'kim01', accounts: [{ broker: 'KB', gateway: 'KB121', account_no: '37728502102' }], dma_user_ids: ['kim01'] }),
    group({ key: '', accounts: [{ broker: 'KB', gateway: 'KB120', account_no: '50011122233' }] }),
  ],
};

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
  mockFetchAdminPnl.mockImplementation((g) => Promise.resolve(g === 'account' ? ACCOUNT_REPORT : USER_REPORT));
});

const heads = () => Array.from(document.querySelectorAll('[data-slot="pnl-group-head"]')) as HTMLElement[];
const seg = () => screen.getByRole('group', { name: '묶음' });

describe('PnlAdminClient — /admin/pnl', () => {
  it('① 기본 → fetchAdminPnl("user", "30") 1회 · h1 「매매손익」 · 「계정별」 선택 · 문서 제목', async () => {
    render(<PnlAdminClient />);
    expect(screen.getByRole('heading', { level: 1, name: '매매손익' })).toBeInTheDocument();
    expect(within(seg()).getByRole('button', { name: '계정별' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(seg()).getByRole('button', { name: '계좌별' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(heads()).toHaveLength(3));
    expect(mockFetchAdminPnl).toHaveBeenCalledTimes(1);
    expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('user', '30');
    expect(document.title).toBe('매매손익 · Admin');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('② 「계좌별」 클릭 → 주소 ?group=account(router.replace) · fetchAdminPnl("account", "30") · 펼침 기본(첫 묶음 첫 행)', async () => {
    const user = userEvent.setup();
    const view = render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(3));
    // 둘째 묶음 행을 열어 둔다 → 전환 뒤 기본으로 돌아와야 한다.
    const secondRow = document.querySelectorAll('[data-slot="pnl-group"]')[1]!.querySelector('button[aria-expanded]')!;
    await user.click(secondRow);
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(2);

    await user.click(within(seg()).getByRole('button', { name: '계좌별' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/pnl?group=account');
    view.rerender(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', '30');
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
  });

  it('③ ?group=x&range=90 → group 키만 지워 기본 user · range 90 유지 · ?range=zz → range 만 지움', async () => {
    mockSearchParams = new URLSearchParams('group=x&range=90');
    const view = render(<PnlAdminClient />);
    expect(mockReplace).toHaveBeenCalledWith('/admin/pnl?range=90');
    await waitFor(() => expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('user', '90'));
    expect(screen.getByRole('button', { name: '90일' })).toHaveAttribute('aria-pressed', 'true');
    view.unmount();

    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams('group=account&range=zz');
    render(<PnlAdminClient />);
    expect(mockReplace).toHaveBeenCalledWith('/admin/pnl?group=account');
    await waitFor(() => expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', '30'));
  });

  it('③b 기간 「이달」 → 주소 ?range=month(다른 키 보존) · 재조회', async () => {
    mockSearchParams = new URLSearchParams('group=account');
    const user = userEvent.setup();
    const view = render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: '이달' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/pnl?group=account&range=month');
    view.rerender(<PnlAdminClient />);
    await waitFor(() => expect(mockFetchAdminPnl).toHaveBeenLastCalledWith('account', 'month'));
    expect(await screen.findAllByText('이달 실현손익')).toHaveLength(2);
  });

  it('④ 계정별 머리 — 제목 dma_user_id(truncate · title) · 부제 「KB 37728502101 · 교보 10279758101」 · 「미상」 맨 뒤 · 부제 「dma_user_id 없는 체결 · 계좌 …」', async () => {
    render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(3));
    const title = (h: HTMLElement) => h.querySelector('[data-slot="pnl-group-title"]') as HTMLElement;
    const sub = (h: HTMLElement) => h.querySelector('[data-slot="pnl-group-sub"]') as HTMLElement;
    expect(heads().map((h) => title(h).textContent)).toEqual(['ezmesya', 'kim01', '미상']);
    expect(title(heads()[0]!)).toHaveAttribute('title', 'ezmesya');
    expect(title(heads()[0]!).className).toContain('truncate');
    expect(sub(heads()[0]!)).toHaveTextContent('KB 37728502101 · 교보 10279758101');
    expect(sub(heads()[0]!).className).toContain('break-keep');
    expect(sub(heads()[2]!)).toHaveTextContent('dma_user_id 없는 체결 · 계좌 50011122233');
  });

  it('⑤ 계좌별 머리 — 배지 「KB」/「교보」 + 계좌번호 · 부제 「ezmesya · kim01 · 위탁」(계좌명 없으면 생략)', async () => {
    mockSearchParams = new URLSearchParams('group=account');
    render(<PnlAdminClient />);
    await waitFor(() => expect(heads()).toHaveLength(2));
    const badge = (h: HTMLElement) => h.querySelector('[data-slot="pnl-broker-badge"]') as HTMLElement;
    expect(heads().map((h) => badge(h).textContent)).toEqual(['KB', '교보']);
    expect(heads()[0]!.querySelector('[data-slot="pnl-group-title"]')).toHaveTextContent('37728502101');
    expect(heads()[0]!.querySelector('[data-slot="pnl-group-sub"]')).toHaveTextContent('ezmesya · kim01 · 위탁');
    expect(heads()[1]!.querySelector('[data-slot="pnl-group-sub"]')!.textContent).toBe('ezmesya');
    expect(screen.queryByText('미상')).toBeNull();
  });

  it('⑥ 조회 실패 → 오류 상자 · 「다시 시도」 → 같은 키로 재조회 · 세그먼트 · 기간 줄은 그대로', async () => {
    mockFetchAdminPnl.mockReset();
    mockFetchAdminPnl.mockRejectedValueOnce(new Error('500')).mockResolvedValue(USER_REPORT);
    render(<PnlAdminClient />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('매매손익을 불러오지 못했어요');
    expect(seg()).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '기간' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(heads()).toHaveLength(3));
    expect(mockFetchAdminPnl).toHaveBeenCalledTimes(2);
  });
});
