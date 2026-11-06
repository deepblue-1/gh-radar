import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminAccountMaster } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * quick 261106-lwu — 계좌 등록 시트(목업 ②) · 수정/삭제 시트(목업 ③) (D-07 · D-08).
 *
 * 잠그는 것: 등록 — KB 일 때만 지점 · 트레이더 칸 · 교보로 바꾸면 사라짐 · 형식 미완이면 「등록」 비활성 · 목록 중복 / 서버
 * 409 ACCOUNT_EXISTS 는 계좌번호 칸 아래 한 줄 · 성공은 createAdminAccount 만 부른다(relay 경로 함수 0).
 * 수정 — 증권사 · 번호 읽기 전용 · 바뀐 값 있을 때만 「저장」 · saveAdminAccount 1회 → 쓰는 사용자 줄마다 결과 칩 · BUSY 줄 ·
 * 사용자 error 한 줄. 삭제 — 연결 있으면 잠김 + 문구 · window.confirm 미사용 · 0명이면 시트 안 확인 박스 → delete → onDeleted ·
 * 409 는 확인 박스 아래 한 줄.
 */

const createAdminAccountMock = vi.fn();
const saveAdminAccountMock = vi.fn();
const deleteAdminAccountMock = vi.fn();
const putDmaAccountMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  createAdminAccount: (body: unknown) => createAdminAccountMock(body),
  saveAdminAccount: (...args: unknown[]) => saveAdminAccountMock(...args),
  deleteAdminAccount: (...args: unknown[]) => deleteAdminAccountMock(...args),
  putDmaAccount: (...args: unknown[]) => putDmaAccountMock(...args),
  removeDmaAccount: vi.fn(),
  setAccountBudget: vi.fn(),
  setAccountFee: vi.fn(),
  setAccountOrderServer: vi.fn(),
}));

import { ACCOUNT_MASTER_SHEET_TEXT as T, AccountMasterSheet } from '../account-master-sheet';

const LINKED: AdminAccountMaster = {
  broker: 'KB',
  accountNo: '5120009880',
  name: '주식',
  branchNo: '00123',
  traderId: 'T00001',
  updatedAt: '2026-11-06T00:00:00Z',
  users: [
    { dmaUserId: 'kimtr', emails: ['kim@example.invalid'], priority: 0, servers: [{ serverKey: 'KB120', state: 'active' }, { serverKey: 'KB121', state: 'active' }] },
    { dmaUserId: 'leetr', emails: ['lee@example.invalid'], priority: 1, servers: [{ serverKey: 'KB120', state: 'active' }] },
    { dmaUserId: 'parktr', emails: [], priority: 2, servers: [{ serverKey: 'KB121', state: 'removing' }] },
  ],
};
const FREE: AdminAccountMaster = { ...LINKED, accountNo: '51200098801', name: '선물대체', users: [] };

const accountNoInput = () => screen.getByRole('textbox', { name: '계좌번호' });
const field = (slot: string) => document.querySelector<HTMLElement>(`[data-slot="account-sheet-field-${slot}"]`);

beforeEach(() => {
  createAdminAccountMock.mockReset();
  saveAdminAccountMock.mockReset();
  deleteAdminAccountMock.mockReset();
  putDmaAccountMock.mockReset();
});

describe('등록 시트 (D-07)', () => {
  const renderCreate = (accounts: AdminAccountMaster[] = [LINKED]) => {
    const onCreated = vi.fn();
    render(<AccountMasterSheet mode="create" accounts={accounts} onCreated={onCreated} onClose={vi.fn()} />);
    return { onCreated };
  };

  it('KB 기본 · 지점 · 트레이더 칸 · 교보로 바꾸면 두 칸 사라짐 · 안내 문장', () => {
    renderCreate();
    expect(screen.getByRole('dialog', { name: T.createTitle })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'KB' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('textbox', { name: '지점' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '트레이더' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '계좌명' })).toHaveAttribute('placeholder', '예: 주식');
    expect(screen.getByRole('textbox', { name: '계좌명' })).toHaveAttribute('maxLength', '40');
    fireEvent.click(screen.getByRole('radio', { name: '교보' }));
    expect(screen.queryByRole('textbox', { name: '지점' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: '트레이더' })).toBeNull();
    expect(screen.getByText(T.createNote)).toBeInTheDocument();
  });

  it('형식 미완이면 「등록」 비활성 — KB 는 번호 · 지점 5 · 트레이더 6 모두', () => {
    renderCreate();
    const submit = screen.getByRole('button', { name: '등록' });
    expect(submit).toBeDisabled();
    fireEvent.change(accountNoInput(), { target: { value: '123' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '지점' }), { target: { value: '0012' } });
    expect(field('branch')).toHaveTextContent(T.branchInvalid);
    fireEvent.change(screen.getByRole('textbox', { name: '지점' }), { target: { value: '00125' } });
    fireEvent.change(screen.getByRole('textbox', { name: '트레이더' }), { target: { value: 'T00009' } });
    expect(submit).toBeEnabled();
    fireEvent.change(accountNoInput(), { target: { value: '1234567890123' } });
    expect(submit).toBeDisabled();
    expect(field('accountNo')).toHaveTextContent(T.accountNoInvalid);
  });

  it('목록에 이미 있는 (증권사, 정규화 번호) → 칸 아래 「이미 등록된 계좌예요」 · 「등록」 비활성', () => {
    renderCreate();
    fireEvent.change(accountNoInput(), { target: { value: ' 005120009880' } });
    expect(field('accountNo')).toHaveTextContent(T.duplicate);
    // 같은 번호라도 증권사가 다르면 중복 아님.
    fireEvent.click(screen.getByRole('radio', { name: '교보' }));
    expect(field('accountNo')).not.toHaveTextContent(T.duplicate);
    expect(screen.getByRole('button', { name: '등록' })).toBeEnabled();
  });

  it('성공 → createAdminAccount 1회(정규화 · 교보 빈 값) · onCreated · relay 경로 함수 0', async () => {
    createAdminAccountMock.mockResolvedValue({ ok: true });
    const { onCreated } = renderCreate();
    fireEvent.click(screen.getByRole('radio', { name: '교보' }));
    fireEvent.change(accountNoInput(), { target: { value: ' 00777' } });
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: ' 위탁 ' } });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createAdminAccountMock).toHaveBeenCalledWith({
      broker: 'KYOBO',
      accountNo: '777',
      name: '위탁',
      branchNo: '',
      traderId: '',
    });
    expect(putDmaAccountMock).not.toHaveBeenCalled();
    expect(saveAdminAccountMock).not.toHaveBeenCalled();
  });

  it('서버 409 ACCOUNT_EXISTS → 계좌번호 칸 아래 같은 한 줄 · onCreated 없음', async () => {
    createAdminAccountMock.mockRejectedValue(new ApiClientError({ code: 'ACCOUNT_EXISTS', message: '이미 등록된 계좌예요.', status: 409 }));
    const { onCreated } = renderCreate([]);
    fireEvent.click(screen.getByRole('radio', { name: '교보' }));
    fireEvent.change(accountNoInput(), { target: { value: '777' } });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(field('accountNo')).toHaveTextContent(T.duplicate));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
  });
});

describe('수정 시트 (D-08)', () => {
  const renderEdit = (account: AdminAccountMaster = LINKED) => {
    const onSaved = vi.fn();
    const onDeleted = vi.fn();
    const r = render(<AccountMasterSheet mode="edit" account={account} onSaved={onSaved} onDeleted={onDeleted} onClose={vi.fn()} />);
    return { onSaved, onDeleted, ...r };
  };

  it('증권사 · 번호 읽기 전용 · 바뀐 값 있을 때만 「저장」 · 쓰는 사용자 3명 · 서버 키(removing 흐림)', () => {
    renderEdit();
    expect(document.querySelector('[data-slot="account-sheet-broker"]')).toHaveTextContent('KB');
    expect(document.querySelector('[data-slot="account-sheet-account-no"]')).toHaveTextContent('5120009880');
    expect(screen.queryByRole('textbox', { name: '계좌번호' })).toBeNull();
    expect(screen.getByText(T.readOnlyNote)).toBeInTheDocument();
    expect(screen.getByText(T.fanoutNote)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '주식 메인' } });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '주식' } });
    expect(save).toBeDisabled();

    const users = document.querySelectorAll<HTMLElement>('[data-slot="account-sheet-user"]');
    expect(Array.from(users).map((u) => u.dataset.dma)).toEqual(['kimtr', 'leetr', 'parktr']);
    expect(screen.getByText('3명 · 등록 서버')).toBeInTheDocument();
    const removing = users[2]!.querySelector('[data-slot="account-sheet-server"]')!;
    expect(removing).toHaveAttribute('data-state', 'removing');
  });

  it('저장 → saveAdminAccount 1회 → 사용자별 결과 칩 · BUSY 줄 · 사용자 error 한 줄 · onSaved', async () => {
    const { onSaved } = renderEdit({
      ...LINKED,
      users: [...LINKED.users.slice(0, 2), { dmaUserId: 'zzz', emails: [], priority: 3, servers: [{ serverKey: 'KB120', state: 'active' }] }],
    });
    saveAdminAccountMock.mockResolvedValueOnce({
      ok: true,
      fanout: [
        { dmaUserId: 'kimtr', results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }], error: null },
        { dmaUserId: 'leetr', results: [{ server: 'KB120', outcome: 'failed', code: 3, message: '주문 처리 중' }], error: null },
        { dmaUserId: 'zzz', results: [], error: { code: 'RELAY_FAILED', message: 'relay 처리에 실패했어요.' } },
      ],
    });
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '주식 메인' } });
    fireEvent.change(screen.getByRole('textbox', { name: '트레이더' }), { target: { value: 'T00009' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveAdminAccountMock).toHaveBeenCalledTimes(1);
    expect(saveAdminAccountMock).toHaveBeenCalledWith('KB', '5120009880', { name: '주식 메인', branchNo: '00123', traderId: 'T00009' });

    const userLine = (dma: string) => document.querySelector<HTMLElement>(`[data-slot="account-sheet-user"][data-dma="${dma}"]`)!;
    expect(Array.from(userLine('kimtr').querySelectorAll('[data-slot="reflect-chip"]')).map((c) => c.textContent)).toEqual(['KB120', 'KB121']);
    const lee = userLine('leetr');
    expect(lee.querySelector('[data-slot="reflect-chip"]')).toHaveAttribute('data-tone', 'err');
    expect(lee.querySelector('[data-slot="admin-busy-line"]')).toHaveTextContent('leetr · KB120 실패 · BUSY: 주문 처리 중');
    expect(userLine('zzz').querySelector('[data-slot="account-sheet-user-error"]')).toHaveTextContent(
      'zzz 반영 실패 · relay 처리에 실패했어요.',
    );
  });

  it('교보 수정 시트에는 지점 · 트레이더 칸이 없고 저장 바디는 빈 값', async () => {
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    renderEdit({ ...FREE, broker: 'KYOBO', accountNo: '777', branchNo: '', traderId: '' });
    expect(screen.queryByRole('textbox', { name: '지점' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '교' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveAdminAccountMock).toHaveBeenCalledWith('KYOBO', '777', { name: '교', branchNo: '', traderId: '' }));
  });

  it('쓰는 사용자 ≥ 1 → 삭제 버튼 잠김 + 안내 · window.confirm 안 씀', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderEdit();
    const del = within(document.querySelector<HTMLElement>('[data-slot="account-sheet-delete"]')!).getByRole('button', { name: '삭제' });
    expect(del).toBeDisabled();
    expect(screen.getByText(T.deleteLocked)).toBeInTheDocument();
    fireEvent.click(del);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deleteAdminAccountMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('쓰는 사용자 0명 → 「삭제」 → 시트 안 확인 박스(취소/삭제) → deleteAdminAccount → onDeleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    deleteAdminAccountMock.mockResolvedValue({ ok: true });
    const { onDeleted } = renderEdit(FREE);
    expect(screen.getByText('0명')).toBeInTheDocument();
    expect(screen.getByText(T.noUsers)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const box = document.querySelector<HTMLElement>('[data-slot="account-sheet-confirm"]')!;
    expect(box).toHaveTextContent('KB 51200098801 선물대체 계좌를 삭제할까요? 목록에서 사라지고 되돌릴 수 없어요.');
    // 취소 → 박스 닫힘
    fireEvent.click(within(box).getByRole('button', { name: '취소' }));
    expect(document.querySelector('[data-slot="account-sheet-confirm"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-slot="account-sheet-confirm"]')!).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteAdminAccountMock).toHaveBeenCalledWith('KB', '51200098801');
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('서버 409 ACCOUNT_IN_USE → 확인 박스 아래 message 한 줄 · onDeleted 없음', async () => {
    deleteAdminAccountMock.mockRejectedValue(new ApiClientError({ code: 'ACCOUNT_IN_USE', message: T.deleteLocked, status: 409 }));
    const { onDeleted } = renderEdit(FREE);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-slot="account-sheet-confirm"]')!).getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(document.querySelector('[data-slot="account-sheet-delete-error"]')).toHaveTextContent(T.deleteLocked),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
