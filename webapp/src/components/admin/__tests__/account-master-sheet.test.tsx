import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminAccountMaster, AdminAccountView, AdminUsersOverview } from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * quick 261106-lwu — 계좌 등록 시트(목업 ②) · 수정/삭제 시트(목업 ③) (D-07 · D-08).
 *
 * 잠그는 것: 등록 — KB 일 때만 지점 · 트레이더 칸 · 교보로 바꾸면 사라짐 · 형식 미완이면 「등록」 비활성 · 목록 중복 / 서버
 * 409 ACCOUNT_EXISTS 는 계좌번호 칸 아래 한 줄 · 성공은 createAdminAccount 만 부른다(relay 경로 함수 0).
 * 수정 — 증권사 · 번호 읽기 전용 · 바뀐 값 있을 때만 「저장」 · saveAdminAccount 1회 → 쓰는 사용자 줄마다 결과 칩 · BUSY 줄 ·
 * 사용자 error 한 줄. 삭제 — 연결 있으면 잠김 + 문구 · window.confirm 미사용 · 0명이면 시트 안 확인 박스 → delete → onDeleted ·
 * 409 는 확인 박스 아래 한 줄.
 * quick 261106-ntl — 「예수금 · 수수료」 그룹(사용자·서버 팬아웃 · 칩 「<DMA id> · <서버>」 · 불일치 · 연결 0명 잠금) · KB 주문자 IP/MAC 칸
 * (정본 초깃값 · 불일치 맞추기 · 보내기 규칙 · 검증 · 변경 없음 · 교보 없음).
 */

const createAdminAccountMock = vi.fn();
const saveAdminAccountMock = vi.fn();
const deleteAdminAccountMock = vi.fn();
const putDmaAccountMock = vi.fn();
const setAdminAccountBudgetMock = vi.fn();
const setAdminAccountFeeMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  createAdminAccount: (body: unknown) => createAdminAccountMock(body),
  saveAdminAccount: (...args: unknown[]) => saveAdminAccountMock(...args),
  deleteAdminAccount: (...args: unknown[]) => deleteAdminAccountMock(...args),
  putDmaAccount: (...args: unknown[]) => putDmaAccountMock(...args),
  removeDmaAccount: vi.fn(),
  setAdminAccountBudget: (...args: unknown[]) => setAdminAccountBudgetMock(...args),
  setAdminAccountFee: (...args: unknown[]) => setAdminAccountFeeMock(...args),
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
  setAdminAccountBudgetMock.mockReset();
  setAdminAccountFeeMock.mockReset();
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
  const renderEdit = (account: AdminAccountMaster = LINKED, overview: AdminUsersOverview | null = null) => {
    const onSaved = vi.fn();
    const onDeleted = vi.fn();
    const r = render(
      <AccountMasterSheet mode="edit" account={account} overview={overview} onSaved={onSaved} onDeleted={onDeleted} onClose={vi.fn()} />,
    );
    return { onSaved, onDeleted, ...r };
  };

  it('증권사 · 번호 읽기 전용 · 바뀐 값 있을 때만 「저장」 · 쓰는 사용자 3명 · 서버 키(removing 흐림)', () => {
    renderEdit();
    expect(document.querySelector('[data-slot="account-sheet-broker"]')).toHaveTextContent('KB');
    expect(document.querySelector('[data-slot="account-sheet-account-no"]')).toHaveTextContent('5120009880');
    expect(screen.queryByRole('textbox', { name: '계좌번호' })).toBeNull();
    expect(screen.getByText(T.readOnlyNote)).toBeInTheDocument();
    // KB · 연결 있음 → IP/MAC 까지 함께 반영된다는 문장(quick 261106-ntl N-02)
    expect(screen.getByText(T.fanoutNoteKb)).toBeInTheDocument();
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

// ─────────────────────────────────────────────────────────────────────────────
// quick 261106-ntl — 「예수금 · 수수료」 그룹(N-01) · KB 주문자 IP/MAC(N-02)
// ─────────────────────────────────────────────────────────────────────────────

const NO = LINKED.accountNo;
const EP_A = { orderIp: '010041001124', orderMac: '1CFD087D978E' };
const EP_UNSET = { orderIp: '', orderMac: '' };
const cost = (budgetKrw: number, feePpm = 100, sellTaxPpm = 2000) => ({ budgetKrw, feePpm, sellTaxPpm, budgetSource: 'live' as const });

/** 개요의 같은 계좌 뷰 — 계좌번호는 앞 0 붙은 표기(정규화 비교로 맞춘다). */
function view(servers: string[], over: Partial<AdminAccountView> = {}): AdminAccountView {
  return {
    broker: 'KB',
    accountNo: `00${NO}`,
    name: '주식',
    branchNo: '00123',
    traderId: 'T00001',
    priority: 0,
    servers: servers.map((serverKey) => ({ serverKey, tone: 'ok' as const, message: null, state: 'active' as const })),
    serverOnlyOn: [],
    orderServer: null,
    defaultOrderServer: 'KB120',
    ...over,
  };
}

function usersOverview(kim: Partial<AdminAccountView>, lee: Partial<AdminAccountView>): AdminUsersOverview {
  const u = (email: string, dmaUserId: string, accounts: AdminAccountView[]) => ({
    email,
    role: 'trader' as const,
    dmaUserId,
    signedUp: true,
    accountCount: accounts.length,
    servers: [],
    accounts,
  });
  return {
    users: [
      u('kim@example.invalid', 'kimtr', [view(['KB120', 'KB121'], kim)]),
      u('lee@example.invalid', 'leetr', [view(['KB120'], lee)]),
    ],
    pending: [],
    serverOnly: [],
    servers: [
      { key: 'KB120', broker: 'KB', enabled: true },
      { key: 'KB121', broker: 'KB', enabled: true },
      { key: 'KYOBO119', broker: 'KYOBO', enabled: true },
    ],
  };
}

/** kimtr KB120 = KB121 = 1천만 · 0.01% · 0.2% · IP/MAC A / leetr KB120 = 5백만 · IP/MAC 미설정. */
const OV_DIFF = usersOverview(
  { costs: { KB120: cost(10_000_000), KB121: cost(10_000_000) }, orderEndpoints: { KB120: EP_A, KB121: EP_A } },
  { costs: { KB120: cost(5_000_000) }, orderEndpoints: { KB120: EP_UNSET } },
);
/** 모두 같은 값 — 불일치 없음. */
const OV_SAME = usersOverview(
  { costs: { KB120: cost(10_000_000), KB121: cost(10_000_000) }, orderEndpoints: { KB120: EP_A, KB121: EP_A } },
  { costs: { KB120: cost(10_000_000) }, orderEndpoints: { KB120: EP_A } },
);

function renderSheet(account: AdminAccountMaster, overview: AdminUsersOverview | null) {
  const onSaved = vi.fn();
  render(<AccountMasterSheet mode="edit" account={account} overview={overview} onSaved={onSaved} onDeleted={vi.fn()} onClose={vi.fn()} />);
  return { onSaved };
}

const costsSection = () => document.querySelector<HTMLElement>('[data-slot="account-sheet-costs"]')!;
const budgetInput = (no = NO) => within(costsSection()).getByRole('textbox', { name: `KB ${no} 예수금(원)` }) as HTMLInputElement;
const feeInput = () => within(costsSection()).getByRole('textbox', { name: `KB ${NO} 수수료(%)` }) as HTMLInputElement;
const chipTexts = () =>
  Array.from(costsSection().querySelectorAll('[data-slot="admin-account-cost-chips"] [data-slot="reflect-chip"]')).map((c) => c.textContent);
const enter = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
const ipInput = () => screen.getByRole('textbox', { name: '주문자 IP' }) as HTMLInputElement;
const macInput = () => screen.getByRole('textbox', { name: 'MAC 주소' }) as HTMLInputElement;
const saveBtn = () => screen.getByRole('button', { name: '저장' });

describe('수정 시트 「예수금 · 수수료」 (quick 261106-ntl N-01)', () => {
  it('연결 계좌 → 제목 · 부제 · 예수금 「10,000,000」 · 쉬는 칩 「<DMA id> · <서버>」(removing 제외) · 불일치 줄(시트 꼬리)', () => {
    renderSheet(LINKED, OV_DIFF);
    expect(costsSection()).toHaveTextContent(T.costTitle);
    expect(costsSection()).toHaveTextContent(T.costSubtitle);
    expect(budgetInput()).toHaveValue('10,000,000');
    expect(feeInput()).toHaveValue('0.01');
    expect(chipTexts()).toEqual(['kimtr · KB120', 'kimtr · KB121', 'leetr · KB120']);
    const ms = Array.from(costsSection().querySelectorAll('[data-slot="admin-account-cost-mismatch"]')).map((m) => m.textContent);
    expect(ms).toEqual(['leetr · KB120 은 5,000,000원 — 저장하면 모두 같아져요']);
    // 「쓰는 사용자」 섹션 앞
    const users = document.querySelector<HTMLElement>('[data-slot="account-sheet-users"]')!;
    expect(costsSection().compareDocumentPosition(users) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('「15000000」 Enter → setAdminAccountBudget(KB, 계좌, 15000000) 1회 → 칩 「<DMA id> · <서버>」 · 미반영 줄 · onSaved', async () => {
    setAdminAccountBudgetMock.mockResolvedValue({
      ok: true,
      fanout: [
        { dmaUserId: 'kimtr', results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }], error: null },
        { dmaUserId: 'leetr', results: [{ server: 'KB120', outcome: 'offline' }], error: null },
      ],
    });
    const { onSaved } = renderSheet(LINKED, OV_DIFF);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '15000000' } });
    enter(budgetInput());
    expect(setAdminAccountBudgetMock).toHaveBeenCalledTimes(1);
    expect(setAdminAccountBudgetMock).toHaveBeenCalledWith('KB', NO, 15_000_000);
    await waitFor(() => expect(chipTexts()).toEqual(['kimtr · KB120', 'kimtr · KB121', 'leetr · KB120 · 서버 연결 안 됨']));
    const lines = Array.from(costsSection().querySelectorAll('[data-slot="admin-account-cost-line"]')).map((l) => l.textContent);
    expect(lines).toEqual(['leetr · KB120 미반영: 서버 연결 안 됨']);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(saveAdminAccountMock).not.toHaveBeenCalled();
  });

  it('수수료 「0.05」 Enter → setAdminAccountFee(KB, 계좌, 500, 2000) · 사용자 error(409) → 「leetr 실패: <message>」 role=alert', async () => {
    setAdminAccountFeeMock.mockResolvedValue({
      ok: true,
      fanout: [
        { dmaUserId: 'kimtr', results: [{ server: 'KB120', outcome: 'ok' }, { server: 'KB121', outcome: 'ok' }], error: null },
        { dmaUserId: 'leetr', results: [], error: { code: 'NO_SUCH_ACCOUNT', message: '그 사용자에게 없는 계좌예요' } },
      ],
    });
    renderSheet(LINKED, OV_DIFF);
    fireEvent.focus(feeInput());
    fireEvent.change(feeInput(), { target: { value: '0.05' } });
    enter(feeInput());
    expect(setAdminAccountFeeMock).toHaveBeenCalledWith('KB', NO, 500, 2000);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('leetr 실패: 그 사용자에게 없는 계좌예요'));
    expect(chipTexts()).toEqual(['kimtr · KB120', 'kimtr · KB121', 'leetr · 실패']);
  });

  it('같은 값 Enter + 불일치 없음 → 요청 0 · 「<라벨> · 변경 없음」 칩', () => {
    renderSheet(LINKED, OV_SAME);
    fireEvent.focus(budgetInput());
    fireEvent.change(budgetInput(), { target: { value: '10000000' } });
    enter(budgetInput());
    expect(setAdminAccountBudgetMock).not.toHaveBeenCalled();
    expect(chipTexts()).toEqual(['kimtr · KB120 · 변경 없음', 'kimtr · KB121 · 변경 없음', 'leetr · KB120 · 변경 없음']);
  });

  it('연결 0명(FREE) → 세 칸 disabled · 안내 · KB IP/MAC 칸도 disabled + 같은 안내 · 어떤 저장 API 도 0회', () => {
    renderSheet(FREE, OV_DIFF);
    const inputs = within(costsSection()).getAllByRole('textbox');
    expect(inputs).toHaveLength(3);
    for (const el of inputs) {
      expect(el).toBeDisabled();
      fireEvent.focus(el);
      fireEvent.change(el, { target: { value: '1' } });
      enter(el);
      fireEvent.blur(el);
    }
    expect(costsSection()).toHaveTextContent(T.notLinkedNote);
    expect(costsSection()).not.toHaveTextContent(T.costSubtitle);
    expect(ipInput()).toBeDisabled();
    expect(macInput()).toBeDisabled();
    expect(document.querySelector('[data-slot="account-sheet-ipmac"]')).toHaveTextContent(T.notLinkedNote);
    expect(saveBtn()).toBeDisabled();
    expect(setAdminAccountBudgetMock).not.toHaveBeenCalled();
    expect(setAdminAccountFeeMock).not.toHaveBeenCalled();
    expect(saveAdminAccountMock).not.toHaveBeenCalled();
  });

  it('removing 만 남은 계좌(active 자리 0)도 잠긴다', () => {
    renderSheet({ ...LINKED, users: [LINKED.users[2]!] }, OV_DIFF);
    expect(budgetInput()).toBeDisabled();
    expect(costsSection()).toHaveTextContent(T.notLinkedNote);
  });
});

describe('수정 시트 KB 주문자 IP/MAC (quick 261106-ntl N-02)', () => {
  it('초깃값 = 정본 표시 표기 · leetr 미설정이면 불일치 줄 · 안 바꿔도 「저장」 활성 → orderEndpoint(칸 원문) 실어 저장', async () => {
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    renderSheet(LINKED, OV_DIFF);
    expect(ipInput()).toHaveValue('10.41.1.124');
    expect(macInput()).toHaveValue('1C:FD:08:7D:97:8E');
    expect(ipInput()).toHaveAttribute('inputmode', 'decimal');
    expect(macInput()).toHaveAttribute('autocapitalize', 'characters');
    const mm = Array.from(document.querySelectorAll('[data-slot="account-sheet-ipmac-mismatch"]')).map((m) => m.textContent);
    expect(mm).toEqual(['leetr · KB120 값이 달라요(미설정) — 저장하면 모두 같아져요']);
    expect(document.querySelector('[data-slot="account-sheet-ipmac-help"]')).toHaveTextContent('ipconfig /all');
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveAdminAccountMock).toHaveBeenCalledTimes(1));
    expect(saveAdminAccountMock).toHaveBeenCalledWith('KB', NO, {
      name: '주식',
      branchNo: '00123',
      traderId: 'T00001',
      orderEndpoint: { orderIp: '10.41.1.124', orderMac: '1C:FD:08:7D:97:8E' },
    });
  });

  it('불일치 없음 · IP 만 바꿔 저장 → orderEndpoint { trim 원문 } + 계좌 값 · 성공 뒤 「저장」 비활성', async () => {
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    const { onSaved } = renderSheet(LINKED, OV_SAME);
    expect(document.querySelectorAll('[data-slot="account-sheet-ipmac-mismatch"]')).toHaveLength(0);
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(ipInput(), { target: { value: ' 10.41.1.200 ' } });
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveAdminAccountMock).toHaveBeenCalledWith('KB', NO, {
      name: '주식',
      branchNo: '00123',
      traderId: 'T00001',
      orderEndpoint: { orderIp: '10.41.1.200', orderMac: '1C:FD:08:7D:97:8E' },
    });
    await waitFor(() => expect(saveBtn()).toBeDisabled());
  });

  it('계좌명만 바꾼 저장(불일치 없음) → 바디에 orderEndpoint 키 없음', async () => {
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    renderSheet(LINKED, OV_SAME);
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '주식 메인' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveAdminAccountMock).toHaveBeenCalledTimes(1));
    const body = saveAdminAccountMock.mock.calls[0]![2] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['branchNo', 'name', 'traderId']);
  });

  it('IP 만 적고 MAC 비움 → MAC 칸 aria-invalid · 짝 오류 줄(도움말 대신) · 「저장」 비활성', () => {
    renderSheet(LINKED, OV_SAME);
    fireEvent.change(macInput(), { target: { value: '' } });
    expect(macInput()).toHaveAttribute('aria-invalid', 'true');
    expect(ipInput()).not.toHaveAttribute('aria-invalid');
    expect(document.querySelector('[data-slot="account-sheet-ipmac-invalid"]')).toHaveTextContent('IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요');
    expect(document.querySelector('[data-slot="account-sheet-ipmac-help"]')).toBeNull();
    expect(saveBtn()).toBeDisabled();
  });

  it('같은 값을 다른 표기로 적고 저장(계좌 값 그대로 · 불일치 없음) → 요청 0 · 「변경 없음」 · 칸을 고치면 지움', () => {
    renderSheet(LINKED, OV_SAME);
    fireEvent.change(ipInput(), { target: { value: '010041001124' } });
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(saveAdminAccountMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="account-sheet-unchanged"]')).toHaveTextContent('변경 없음');
    fireEvent.change(ipInput(), { target: { value: '10.41.1.12' } });
    expect(document.querySelector('[data-slot="account-sheet-unchanged"]')).toBeNull();
  });

  it('개요 없음(확인 전) → 두 칸 빈 채 「저장」 비활성 · 계좌명 저장에 IP/MAC 안 실림', async () => {
    saveAdminAccountMock.mockResolvedValue({ ok: true, fanout: [] });
    renderSheet(LINKED, null);
    expect(ipInput()).toHaveValue('');
    expect(macInput()).toHaveValue('');
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '계좌명' }), { target: { value: '주식 메인' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveAdminAccountMock).toHaveBeenCalledTimes(1));
    expect(Object.keys(saveAdminAccountMock.mock.calls[0]![2] as object)).not.toContain('orderEndpoint');
  });

  it('교보 계좌 → IP/MAC 칸 없음 · 기존 안내 문장', () => {
    renderSheet({ ...LINKED, broker: 'KYOBO', accountNo: '777', branchNo: '', traderId: '' }, OV_DIFF);
    expect(screen.queryByRole('textbox', { name: '주문자 IP' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'MAC 주소' })).toBeNull();
    expect(screen.getByText(T.fanoutNote)).toBeInTheDocument();
  });
});
