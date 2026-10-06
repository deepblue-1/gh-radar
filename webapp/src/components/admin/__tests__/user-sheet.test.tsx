import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminUsersOverview, AdminUserView } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 29 (29-17) — 편집 시트 (D-14 · D-15 · 목업 A `editor()`).
 *
 * 잠그는 것: 행 → 시트(제목 이메일 · 역할 칩) · 「서버에만 있음」 행은 열리지 않음 · 역할 세그먼트 즉시 저장
 * (PATCH 1건 · 비행 중 마지막 값 1건만 대기 · 플래시 700ms · 재조회 1회) · SELF_LOCKOUT 되돌림 + 한 줄 ·
 * 하단 버튼 둘(「사용자 삭제」 · 「다시 반영」) · 「저장」 버튼 없음(D-15).
 */

const fetchAdminUsersMock = vi.fn();
const patchAdminRoleMock = vi.fn();
const putDmaAccountMock = vi.fn();
const removeDmaAccountMock = vi.fn();
const changeDmaPasswordMock = vi.fn();
const reconcileDmaUserMock = vi.fn();
const deleteAdminUserMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchAdminUsers: () => fetchAdminUsersMock(),
  upsertAdminUser: vi.fn(),
  patchAdminRole: (email: string, role: string) => patchAdminRoleMock(email, role),
  putDmaAccount: (dma: string, body: unknown) => putDmaAccountMock(dma, body),
  removeDmaAccount: (dma: string, broker: string, no: string) => removeDmaAccountMock(dma, broker, no),
  changeDmaPassword: (dma: string, pw: string) => changeDmaPasswordMock(dma, pw),
  reconcileDmaUser: (dma: string) => reconcileDmaUserMock(dma),
  deleteAdminUser: (email: string) => deleteAdminUserMock(email),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { UsersClient } from '../users-client';
import { UserSheet } from '../user-sheet';
import { ADMIN_FIELD_FLASH_MS } from '../use-field-save';

const SERVERS: AdminUsersOverview['servers'] = [
  { key: 'KB120', broker: 'KB', enabled: true },
  { key: 'KB121', broker: 'KB', enabled: true },
  { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
  { key: 'KYOBO127', broker: 'KYOBO', enabled: true },
];

const KIM: AdminUserView = {
  email: 'kim.trader@example.invalid',
  role: 'trader',
  dmaUserId: 'kimtr',
  signedUp: true,
  accountCount: 2,
  servers: [
    { serverKey: 'KB120', tone: 'ok', message: null },
    { serverKey: 'KYOBO119', tone: 'ok', message: null },
  ],
  accounts: [
    {
      broker: 'KB',
      accountNo: '12345678901',
      name: '위탁',
      branchNo: '00123',
      traderId: '000789',
      priority: 1,
      servers: [{ serverKey: 'KB120', tone: 'ok', message: null, state: 'active' }],
      serverOnlyOn: [],
    },
    {
      broker: 'KYOBO',
      accountNo: '9876543201',
      name: '위탁',
      branchNo: '',
      traderId: '',
      priority: 2,
      servers: [{ serverKey: 'KYOBO119', tone: 'ok', message: null, state: 'active' }],
      serverOnlyOn: [],
    },
  ],
};

const OVERVIEW: AdminUsersOverview = {
  users: [KIM],
  pending: [],
  serverOnly: [{ dmaUserId: 'smok95', servers: ['KYOBO119'], accountCount: 1 }],
  servers: SERVERS,
};

const sheet = () => document.querySelector('[data-slot="admin-user-sheet"]') as HTMLElement | null;
const roleField = () => document.querySelector('[data-slot="admin-field-role"]') as HTMLElement;
const roleGroup = () => within(roleField()).getByRole('group', { name: '역할' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  for (const m of [
    fetchAdminUsersMock,
    patchAdminRoleMock,
    putDmaAccountMock,
    removeDmaAccountMock,
    changeDmaPasswordMock,
    reconcileDmaUserMock,
    deleteAdminUserMock,
  ]) {
    m.mockReset();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('UsersClient → UserSheet 열기', () => {
  it('행 클릭 → 시트(제목 이메일 · 역할 칩) · 「서버에만 있음」 행은 열리지 않는다', async () => {
    fetchAdminUsersMock.mockResolvedValue(OVERVIEW);
    render(<UsersClient />);
    const row = await screen.findByRole('button', { name: `${KIM.email} 편집` });

    fireEvent.click(document.querySelector('[data-server-only="true"]') as HTMLElement);
    expect(sheet()).toBeNull();

    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', { name: KIM.email });
    expect(sheet()).not.toBeNull();
    expect(within(dialog).getAllByText('trader').length).toBeGreaterThanOrEqual(1);
    expect(dialog.querySelector('[data-slot="admin-role-chip"]')).toHaveTextContent('trader');
    expect(row).toHaveAttribute('data-selected', 'true');

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(sheet()).toBeNull());
  });

  it('시트 쓰기 성공 → 목록 재조회 1회 → 시트는 재조회의 같은 사용자로 바뀐다', async () => {
    fetchAdminUsersMock.mockResolvedValueOnce(OVERVIEW);
    fetchAdminUsersMock.mockResolvedValueOnce({ ...OVERVIEW, users: [{ ...KIM, role: 'viewer' }] });
    patchAdminRoleMock.mockResolvedValue({ ok: true, relayNotified: true });
    render(<UsersClient />);
    fireEvent.click(await screen.findByRole('button', { name: `${KIM.email} 편집` }));
    await screen.findByRole('dialog', { name: KIM.email });

    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'viewer' }));
    await waitFor(() => expect(fetchAdminUsersMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="admin-user-row"][data-email="kim.trader@example.invalid"] [data-slot="admin-role-chip"]')).toHaveTextContent('viewer'),
    );
    expect(sheet()).not.toBeNull();
    expect(within(roleGroup()).getByRole('radio', { name: 'viewer' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('UserSheet — 역할 즉시 저장 (D-15)', () => {
  it('trader → viewer 클릭 → PATCH 1회 · 비행 중 막지 않음 · 플래시 700ms → idle · onChanged 1회', async () => {
    vi.useFakeTimers();
    const d = deferred<unknown>();
    patchAdminRoleMock.mockReturnValue(d.promise);
    const onChanged = vi.fn();
    render(<UserSheet user={KIM} servers={SERVERS} onChanged={onChanged} onClose={() => {}} />);

    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'viewer' }));
    expect(patchAdminRoleMock).toHaveBeenCalledTimes(1);
    expect(patchAdminRoleMock).toHaveBeenCalledWith(KIM.email, 'viewer');
    expect(roleField()).toHaveAttribute('data-state', 'saving');
    // 응답 전에도 세그먼트는 살아 있다
    for (const r of within(roleGroup()).getAllByRole('radio')) expect(r).not.toBeDisabled();
    expect(within(roleGroup()).getByRole('radio', { name: 'viewer' })).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      d.resolve({ ok: true, relayNotified: true });
    });
    expect(roleField()).toHaveAttribute('data-state', 'flash');
    expect(onChanged).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(ADMIN_FIELD_FLASH_MS - 1);
    });
    expect(roleField()).toHaveAttribute('data-state', 'flash');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(roleField()).toHaveAttribute('data-state', 'idle');
    expect(patchAdminRoleMock).toHaveBeenCalledTimes(1);
  });

  it('응답 전 viewer → trader → admin 연타 → 응답 뒤 admin 1회만 더(마지막 값) · onChanged 1회', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    patchAdminRoleMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onChanged = vi.fn();
    render(<UserSheet user={KIM} servers={SERVERS} onChanged={onChanged} onClose={() => {}} />);

    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'viewer' }));
    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'trader' }));
    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'admin' }));
    expect(patchAdminRoleMock).toHaveBeenCalledTimes(1);
    expect(within(roleGroup()).getByRole('radio', { name: 'admin' })).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      first.resolve({ ok: true, relayNotified: true });
    });
    expect(patchAdminRoleMock).toHaveBeenCalledTimes(2);
    expect(patchAdminRoleMock).toHaveBeenLastCalledWith(KIM.email, 'admin');
    expect(onChanged).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({ ok: true, relayNotified: true });
    });
    expect(patchAdminRoleMock).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="admin-user-sheet"]')?.closest('[role="dialog"]')?.querySelector('[data-slot="admin-role-chip"]')).toHaveTextContent('admin');
  });

  it('409 SELF_LOCKOUT → 세그먼트가 원래 값으로 · 한 줄 「본인 관리자 권한은 내릴 수 없어요」 · 재조회 없음', async () => {
    patchAdminRoleMock.mockRejectedValue(
      new ApiClientError({ code: 'SELF_LOCKOUT', message: '본인의 관리자 권한은 내리거나 지울 수 없어요.', status: 409 }),
    );
    const onChanged = vi.fn();
    const me: AdminUserView = { ...KIM, role: 'admin' };
    render(<UserSheet user={me} servers={SERVERS} onChanged={onChanged} onClose={() => {}} />);

    fireEvent.click(within(roleGroup()).getByRole('radio', { name: 'trader' }));
    const alert = await within(roleField()).findByRole('alert');
    expect(alert).toHaveTextContent('본인 관리자 권한은 내릴 수 없어요');
    expect(roleField()).toHaveAttribute('data-state', 'error');
    expect(within(roleGroup()).getByRole('radio', { name: 'admin' })).toHaveAttribute('aria-checked', 'true');
    expect(within(roleGroup()).getByRole('radio', { name: 'trader' })).toHaveAttribute('aria-checked', 'false');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('하단은 「사용자 삭제」 · 「다시 반영」 둘뿐 — 「저장」 버튼 없음 · 목업 문장', () => {
    render(<UserSheet user={KIM} servers={SERVERS} onChanged={() => {}} onClose={() => {}} />);
    const footer = document.querySelector('[data-slot="admin-sheet-footer"]') as HTMLElement;
    expect(within(footer).getAllByRole('button').map((b) => b.textContent)).toEqual(['사용자 삭제', '다시 반영']);
    const dialog = screen.getByRole('dialog', { name: KIM.email });
    expect(within(dialog).queryByRole('button', { name: /^저장/ })).toBeNull();
    expect(dialog).toHaveTextContent('viewer 로 내리면 열린 트레이딩 화면이 다음 요청부터 막히고 relay 연결이 끊긴다.');
    expect(dialog).toHaveTextContent('DMA 사용자 id (모든 서버 공통)');
    expect(dialog).toHaveTextContent('kimtr');
  });

  it('DMA 연결 없는 사용자 → 「DMA 연결 없음」', () => {
    const park: AdminUserView = { ...KIM, email: 'park@example.invalid', role: 'viewer', dmaUserId: null, accountCount: 0, servers: [], accounts: [] };
    render(<UserSheet user={park} servers={SERVERS} onChanged={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: park.email })).toHaveTextContent('DMA 연결 없음');
  });
});
