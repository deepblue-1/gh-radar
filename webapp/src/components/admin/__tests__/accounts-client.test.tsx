import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminAccountMaster, AdminAccountsOverview, AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * quick 261106-lwu — `/admin/accounts` 목록 (D-06 · 목업 ①).
 *
 * 잠그는 것: 머리(「계좌」 · 부제 · 「+ 계좌」) · 행(배지 · 번호 · 이름/「이름 없음」 · KB 지점·트레이더 / 교보 「해당 없음」 ·
 * 쓰는 사용자 칩 / 점선 「연결 없음」) · 개수 + 증권사 세그먼트 거르기 · 하단 안내 · 로딩 · 403 · 오류 다시 시도 ·
 * 행 → 수정 시트 · 「+ 계좌」 → 등록 시트(한 번에 하나) · 쓰기 뒤 재조회로 시트 내용 갱신 · 삭제로 사라지면 시트 닫힘.
 * quick 261106-ntl — 사용자 개요(fetchAdminUsers)를 계좌 목록과 병렬로 읽고 실패는 null 로 접는다(시트 비용 칸 「확인 전」) · 재조회도 둘 다.
 */

const fetchAdminAccountsMock = vi.fn();
const fetchAdminUsersMock = vi.fn();
const createAdminAccountMock = vi.fn();
const saveAdminAccountMock = vi.fn();
const deleteAdminAccountMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchAdminAccounts: () => fetchAdminAccountsMock(),
  fetchAdminUsers: () => fetchAdminUsersMock(),
  setAdminAccountBudget: vi.fn(),
  setAdminAccountFee: vi.fn(),
  createAdminAccount: (body: unknown) => createAdminAccountMock(body),
  saveAdminAccount: (...args: unknown[]) => saveAdminAccountMock(...args),
  deleteAdminAccount: (...args: unknown[]) => deleteAdminAccountMock(...args),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { ADMIN_ACCOUNTS_TEXT, AccountsClient } from '../accounts-client';

function acct(over: Partial<AdminAccountMaster> & Pick<AdminAccountMaster, 'broker' | 'accountNo'>): AdminAccountMaster {
  return { name: '', branchNo: '', traderId: '', updatedAt: '2026-11-06T00:00:00Z', users: [], ...over };
}

const user = (dmaUserId: string) => ({
  dmaUserId,
  emails: [`${dmaUserId}@example.invalid`],
  priority: 0,
  servers: [{ serverKey: 'KB120', state: 'active' as const }],
});

function overview(): AdminAccountsOverview {
  return {
    accounts: [
      acct({ broker: 'KB', accountNo: '5120009880', name: '주식', branchNo: '00123', traderId: 'T00001', users: [user('kimtr'), user('leetr')] }),
      acct({ broker: 'KB', accountNo: '51200098801', name: '', branchNo: '00124', traderId: 'T00002' }),
      acct({ broker: 'KYOBO', accountNo: '777', name: '교보위탁', users: [user('parktr')] }),
    ],
  };
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="admin-account-row"]'));
const row = (key: string) => document.querySelector<HTMLElement>(`[data-slot="admin-account-row"][data-key="${key}"]`)!;
const sheet = () => document.querySelector<HTMLElement>('[data-slot="account-sheet"]');

/** 사용자 개요 — kimtr 의 KB 5120009880 뷰(KB120 예수금 1천만)만. */
function usersOverview(): AdminUsersOverview {
  return {
    users: [
      {
        email: 'kimtr@example.invalid',
        role: 'trader',
        dmaUserId: 'kimtr',
        signedUp: true,
        accountCount: 1,
        servers: [],
        accounts: [
          {
            broker: 'KB',
            accountNo: '5120009880',
            name: '주식',
            branchNo: '00123',
            traderId: 'T00001',
            priority: 0,
            servers: [{ serverKey: 'KB120', tone: 'ok', message: null, state: 'active' }],
            serverOnlyOn: [],
            orderServer: null,
            defaultOrderServer: 'KB120',
            costs: { KB120: { budgetKrw: 10_000_000, feePpm: 100, sellTaxPpm: 2000, budgetSource: 'live' } },
          },
        ],
      },
    ],
    pending: [],
    serverOnly: [],
    servers: [{ key: 'KB120', broker: 'KB', enabled: true }],
  };
}

beforeEach(() => {
  fetchAdminAccountsMock.mockReset();
  fetchAdminUsersMock.mockReset();
  fetchAdminUsersMock.mockResolvedValue(usersOverview());
  createAdminAccountMock.mockReset();
  saveAdminAccountMock.mockReset();
  deleteAdminAccountMock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('AccountsClient — 목록 (D-06)', () => {
  it('머리 · 행 모양 · 개수 · 하단 안내', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByRole('heading', { level: 1, name: ADMIN_ACCOUNTS_TEXT.title })).toBeInTheDocument();
    expect(screen.getByText(ADMIN_ACCOUNTS_TEXT.description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 계좌' })).toBeEnabled();
    expect(document.querySelector('[data-slot="admin-accounts-count"]')).toHaveTextContent('3');

    const kb = row('KB|5120009880');
    expect(kb).toHaveTextContent('KB');
    expect(kb).toHaveTextContent('5120009880');
    expect(kb).toHaveTextContent('주식');
    expect(within(kb).getByText('00123')).toBeInTheDocument();
    expect(within(kb).getByText('T00001')).toBeInTheDocument();
    expect(Array.from(kb.querySelectorAll('[data-slot="admin-account-user-chip"]')).map((c) => c.textContent)).toEqual([
      'kimtr',
      'leetr',
    ]);

    const noName = row('KB|51200098801');
    expect(noName).toHaveTextContent('이름 없음');
    expect(noName.querySelector('[data-slot="admin-account-no-users"]')).toHaveTextContent('연결 없음');

    const kyobo = row('KYOBO|777');
    expect(kyobo).toHaveTextContent('교보');
    expect(kyobo).toHaveTextContent(ADMIN_ACCOUNTS_TEXT.notApplicable);

    expect(screen.getByText(ADMIN_ACCOUNTS_TEXT.note)).toBeInTheDocument();
  });

  it('세그먼트 「전체 3 · KB 2 · 교보 1」 로 거른다', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    const seg = screen.getByRole('group', { name: ADMIN_ACCOUNTS_TEXT.filterLabel });
    expect(within(seg).getAllByRole('radio').map((b) => b.textContent)).toEqual(['전체 3', 'KB 2', '교보 1']);
    fireEvent.click(within(seg).getByRole('radio', { name: '교보 1' }));
    expect(rows().map((r) => r.dataset.key)).toEqual(['KYOBO|777']);
    fireEvent.click(within(seg).getByRole('radio', { name: 'KB 2' }));
    expect(rows().map((r) => r.dataset.key)).toEqual(['KB|5120009880', 'KB|51200098801']);
    fireEvent.click(within(seg).getByRole('radio', { name: '전체 3' }));
    expect(rows()).toHaveLength(3);
  });

  it('로딩 스켈레톤 → 403 은 한 줄 · 그 밖 오류는 다시 시도', async () => {
    let reject!: (e: unknown) => void;
    fetchAdminAccountsMock.mockReturnValueOnce(new Promise((_r, j) => (reject = j)));
    const a = render(<AccountsClient />);
    expect(document.querySelector('[data-slot="admin-accounts-loading"]')).not.toBeNull();
    reject(new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 }));
    await waitFor(() => expect(screen.getByText(ADMIN_ACCOUNTS_TEXT.forbidden)).toBeInTheDocument());
    a.unmount();

    fetchAdminAccountsMock.mockRejectedValueOnce(new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }));
    render(<AccountsClient />);
    await waitFor(() => expect(screen.getByText(ADMIN_ACCOUNTS_TEXT.loadFailed)).toBeInTheDocument());
    fetchAdminAccountsMock.mockResolvedValueOnce(overview());
    fireEvent.click(screen.getByRole('button', { name: ADMIN_ACCOUNTS_TEXT.retry }));
    await waitFor(() => expect(rows()).toHaveLength(3));
  });
});

describe('AccountsClient — 시트 열기 · 재조회', () => {
  it('행 → 수정 시트 · 「+ 계좌」 → 등록 시트(수정 시트는 닫힘) · 한 번에 하나', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(row('KB|5120009880'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    expect(row('KB|5120009880')).toHaveAttribute('data-selected', 'true');
    // 폰(모달) 시트면 바깥이 aria-hidden 이라 역할 조회 대신 슬롯으로 누른다.
    fireEvent.click(document.querySelector<HTMLElement>('[data-slot="admin-accounts-create"]')!);
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'create'));
    expect(document.querySelectorAll('[data-slot="account-sheet"]')).toHaveLength(1);
  });

  it('등록 성공 → 시트 닫힘 · 재조회 1회', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    createAdminAccountMock.mockResolvedValue({ ok: true });
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: '+ 계좌' }));
    await waitFor(() => expect(sheet()).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: '교보' }));
    fireEvent.change(screen.getByRole('textbox', { name: '계좌번호' }), { target: { value: '888' } });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(createAdminAccountMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sheet()).toBeNull());
    expect(fetchAdminAccountsMock).toHaveBeenCalledTimes(2);
  });

  it('삭제 → 재조회에서 사라지면 시트가 닫힌다', async () => {
    const data = overview();
    fetchAdminAccountsMock.mockResolvedValueOnce(data);
    deleteAdminAccountMock.mockResolvedValue({ ok: true });
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(row('KB|51200098801'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    fetchAdminAccountsMock.mockResolvedValueOnce({ accounts: data.accounts.filter((a) => a.accountNo !== '51200098801') });
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const confirm = document.querySelector<HTMLElement>('[data-slot="account-sheet-confirm"]')!;
    fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleteAdminAccountMock).toHaveBeenCalledWith('KB', '51200098801'));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(sheet()).toBeNull();
  });

  it('저장 뒤 재조회 값이 시트에 반영된다(같은 키의 최신 행)', async () => {
    const data = overview();
    fetchAdminAccountsMock.mockResolvedValueOnce(data);
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(row('KYOBO|777'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    const next = structuredClone(data);
    next.accounts[2]!.name = '새이름';
    fetchAdminAccountsMock.mockResolvedValueOnce(next);
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '새이름' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(row('KYOBO|777')).toHaveTextContent('새이름'));
    // 재조회 값 = 입력값 → 「저장」 다시 비활성.
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });
});

describe('AccountsClient — 사용자 개요 병렬 로드 (quick 261106-ntl)', () => {
  const budget = () => screen.getByRole('textbox', { name: 'KB 5120009880 예수금(원)' }) as HTMLInputElement;
  const costChips = () =>
    Array.from(document.querySelectorAll('[data-slot="account-sheet-costs"] [data-slot="admin-account-cost-chips"] [data-slot="reflect-chip"]')).map(
      (c) => c.textContent,
    );

  it('마운트 시 fetchAdminAccounts 와 fetchAdminUsers 를 함께(앞 응답을 기다리지 않음)', () => {
    fetchAdminAccountsMock.mockReturnValue(new Promise(() => {}));
    fetchAdminUsersMock.mockReturnValue(new Promise(() => {}));
    render(<AccountsClient />);
    expect(fetchAdminAccountsMock).toHaveBeenCalledTimes(1);
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(1);
  });

  it('개요 성공 → 수정 시트 비용 칸 = 개요 값 · 칩 「<DMA id> · <서버>」(모르는 자리는 확인 전)', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(row('KB|5120009880'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    expect(budget()).toHaveValue('10,000,000');
    expect(costChips()).toEqual(['kimtr · KB120', 'leetr · KB120 · 확인 전']);
  });

  it('fetchAdminUsers 실패 → 목록은 그대로 · 시트 비용 칸 「—」 · 칩 「… · 확인 전」', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    fetchAdminUsersMock.mockReset();
    fetchAdminUsersMock.mockRejectedValue(new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }));
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByText(ADMIN_ACCOUNTS_TEXT.loadFailed)).toBeNull();
    fireEvent.click(row('KB|5120009880'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    expect(budget()).toHaveValue('');
    expect(budget()).toHaveAttribute('placeholder', '—');
    expect(costChips()).toEqual(['kimtr · KB120 · 확인 전', 'leetr · KB120 · 확인 전']);
  });

  it('저장 뒤 재조회는 둘 다', async () => {
    fetchAdminAccountsMock.mockResolvedValue(overview());
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    render(<AccountsClient />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(row('KYOBO|777'));
    await waitFor(() => expect(sheet()).toHaveAttribute('data-mode', 'edit'));
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '새이름' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(fetchAdminAccountsMock).toHaveBeenCalledTimes(2));
    expect(fetchAdminUsersMock).toHaveBeenCalledTimes(2);
  });
});
