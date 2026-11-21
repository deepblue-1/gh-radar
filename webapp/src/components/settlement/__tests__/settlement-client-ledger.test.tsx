import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, waitFor } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementLedgerBody,
  type SettlementLedgerRow,
  type SettlementView,
  type SettlementWriteResponse,
} from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 44 — 본문 연결: 머리 「거래 기록」 · 줄 「고치기」 · 「지우기」(44-10 T2 · UI-SPEC ① · ⑥ · ⑦ · ⑨ · D-19 · D-23 · D-30).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 머리 | 첫 불러오기 전 · 뒤 | 「거래 기록」 비활성 → 활성 · 누르면 시트 · 패널 열림 |
 * | 저장 | 새 거래 | POST 1회 · 시트 닫힘 · 다시 불러옴 · 「정산 기록」 → 「계좌 거래」 · pend 남아도 닫힘 |
 * | 고치기 | 줄 펼침 「고치기」 | 「거래 고치기」 · PUT(id) |
 * | 지우기 | reflect · pend {} | 확인 문단 · 상자 켜짐 · 미리 보기 두 줄 · DELETE(id, true) · 닫힘 · 다시 불러옴 |
 * | 지우기 | reflect false | 상자 없음 · DELETE(id, false) |
 * | 지우기(CR-01) | timeout pend · 지금 값 = 목표값 / ≠ | 상자 켜짐 · 되돌림 줄 · DELETE(id, true) / 상자 없음 · DELETE(id, false) |
 * | D-30 | unreverted | 창 유지 · 문장 그대로(접두 없음) · 확정 잠금 · 「닫기」 때 다시 불러옴 |
 * | D-30 | 409 REVERT_UNREADABLE | 창 유지 · 문장 그대로 · 확정 활성 · 스위치 끄면 줄 사라짐 → DELETE(id, false) |
 * | 그 밖 | SETTLE_LINKED | 「지우지 못했어요 · X」 |
 * | 바로 출금 줄 | settleId | 「고치기」 · 「지우기」 없음 · 안내 문장 |
 */

const fetchSettlementMock = vi.fn();
const saveMock = vi.fn<(body: SettlementLedgerBody, id?: number) => Promise<SettlementWriteResponse>>();
const deleteMock = vi.fn<(id: number, reflect: boolean) => Promise<SettlementWriteResponse>>();
const retryMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchSettlement: () => fetchSettlementMock(),
  saveSettlementLedger: (body: SettlementLedgerBody, id?: number) => saveMock(body, id),
  deleteSettlementLedger: (id: number, reflect: boolean) => deleteMock(id, reflect),
  retrySettlementLedger: (id: number) => retryMock(id),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

import { SettlementClient } from '../settlement-client';

const NOW = '2026-11-20T05:32:00.000Z'; // KST 11/20 14:32

type RowIn = Pick<SettlementLedgerRow, 'txDate' | 'kind' | 'amountKrw'> & Partial<SettlementLedgerRow>;
const ledgerRow = (id: number, r: RowIn): SettlementLedgerRow => ({
  id,
  who: null,
  fromAcc: null,
  toAcc: null,
  via: null,
  memo: '',
  settleId: null,
  reflect: false,
  pend: {},
  seeded: true,
  createdBy: null,
  createdAt: '2026-11-20T00:00:00.000Z',
  editedBy: null,
  editedAt: null,
  ...r,
});

const LEDGER: SettlementLedgerRow[] = [
  ledgerRow(1, { txDate: '2025-12-31', kind: 'contribute', who: 'H', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(2, { txDate: '2025-12-31', kind: 'contribute', who: 'G', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(5, { txDate: '2026-09-10', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  // 예수금에 반영했던 줄(reflect · pend {})
  ledgerRow(7, {
    txDate: '2026-09-13',
    kind: 'move',
    fromAcc: 'kbG',
    toAcc: 'kyH',
    via: 'transfer',
    amountKrw: 400_000_000,
    reflect: true,
    seeded: false,
    createdBy: 'hyunjoong@example.com',
    createdAt: '2026-09-13T05:00:00.000Z',
  }),
  // 정산 때 만든 「바로 출금」 줄
  ledgerRow(20, {
    txDate: '2026-11-19',
    kind: 'withdraw_profit',
    fromAcc: 'kyH',
    who: 'H',
    amountKrw: 50_000_000,
    settleId: 99,
    seeded: false,
    createdBy: 'hyunjoong@example.com',
  }),
];

const DEP: Record<SettlementAccKey, number> = {
  kbG: 845_000_000,
  kyH: 684_000_000,
  kyG: 20_000_000,
  kbH: 372_000_000,
};

function view(): SettlementView {
  return {
    now: NOW,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => ({
      accKey: a.key,
      label: a.label,
      owner: a.owner,
      pool: a.pool,
      state: 'known' as const,
      budgetKrw: DEP[a.key],
      readAt: NOW,
      mismatch: false,
    })),
    ledger: LEDGER,
    settles: [],
  };
}

const OK: SettlementWriteResponse = { ok: true, pend: {} };
const UNREVERTED_MSG = 'KB 정근형 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요';
const UNREADABLE_MSG = 'KB 정근형 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요';
const BELOW_ZERO_MSG = 'KB 정근형 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요';

// ── DOM 도우미(실패해도 한 줄 메시지) ──
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));
const byText = <T extends HTMLElement = HTMLElement>(sel: string, label: string, root: ParentNode = document) =>
  qa<T>(sel, root).find((b) => text(b) === label) ?? null;

const headButton = () => q<HTMLButtonElement>('[data-slot="settlement-ledger-create"]');
const page = () => q('[data-slot="admin-settlement"]');
const sheetTitle = () => text(q('[data-slot="sheet-title"]'));
const sheet = () => q('[data-slot="ledger-sheet"]');
const activity = () => q('[data-slot="settlement-activity"]');
const segment = (name: string) => byText<HTMLButtonElement>('[role="radio"]', name, activity() ?? document.createElement('div'));
const ledgerItem = (id: number) => q(`[data-slot="settlement-ledger-item"][data-id="${id}"]`);
const rowAction = (id: number, label: string) =>
  byText<HTMLButtonElement>('[data-slot="settlement-ledger-actions"] button', label, ledgerItem(id) ?? document.createElement('div'));
const confirmBox = () => q('[data-slot="settle-confirm"]');
const confirmButton = (label: string) => byText<HTMLButtonElement>('button', label, confirmBox() ?? document.createElement('div'));
const confirmAlert = () => q('[role="alert"]', confirmBox() ?? document.createElement('div'));
const confirmSwitch = () => q('[data-slot="reflect-box"] [role="switch"]', confirmBox() ?? document.createElement('div'));
const confirmLines = () =>
  qa('[data-slot="reflect-line"]', confirmBox() ?? document.createElement('div'))
    .map((e) => text(e))
    .join(' / ');
const sheetPill = (group: string, name: string) =>
  byText<HTMLElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`, name);

function click(el: HTMLElement | null) {
  if (!el) throw new Error('element missing');
  fireEvent.click(el);
}

async function ready() {
  render(<SettlementClient />);
  await waitFor(() => expect(text(headButton())).toBe('거래 기록'));
  await waitFor(() => expect(headButton()?.disabled).toBe(false));
}

async function expand(id: number) {
  await waitFor(() => expect(ledgerItem(id)).not.toBeNull());
  click(q('[data-slot="settlement-ledger-row"]', ledgerItem(id)!));
}

beforeEach(() => {
  // 거래 시트의 「오늘」 = 응답 now 와 브라우저 시계 중 늦은 날짜(WR-01) — 시계를 NOW 에 고정한다(Date 만).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  fetchSettlementMock.mockReset();
  saveMock.mockReset();
  deleteMock.mockReset();
  retryMock.mockReset();
  fetchSettlementMock.mockResolvedValue(view());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('머리 「거래 기록」 · 시트 열기(UI-SPEC ① · ⑦)', () => {
  it('첫 불러오기 전 비활성 → 불러온 뒤 활성 · 누르면 「거래 기록」 시트 · 패널 열림', async () => {
    let resolve!: (v: SettlementView) => void;
    fetchSettlementMock.mockReturnValueOnce(new Promise<SettlementView>((r) => (resolve = r)));
    render(<SettlementClient />);
    expect(text(headButton())).toBe('거래 기록');
    expect(headButton()?.disabled).toBe(true);
    resolve(view());
    await waitFor(() => expect(headButton()?.disabled).toBe(false));
    expect(page()?.getAttribute('data-panel-open') ?? 'none').toBe('none');
    click(headButton());
    expect(sheetTitle()).toBe('거래 기록');
    expect(page()?.getAttribute('data-panel-open')).toBe('true');
  });
});

describe('저장 → 닫힘 · 다시 불러오기 · 세그먼트 규칙(⑥ 흐름)', () => {
  it('새 거래 저장 → POST 1회 · 시트 닫힘 · 다시 불러옴 · 「정산 기록」 이었으면 「계좌 거래」 로 · pend 가 남아도 닫힘', async () => {
    saveMock.mockResolvedValue({
      ok: true,
      id: 50,
      pend: { kbG: { deltaKrw: -1_000_000, targetKrw: 844_000_000, reason: 'failed' } },
    });
    await ready();
    click(segment('정산 기록'));
    expect(segment('정산 기록')?.getAttribute('aria-checked')).toBe('true');
    click(headButton());
    click(sheetPill('뺀 계좌', 'KB 정근형'));
    click(sheetPill('받는 사람', '정근형'));
    fireEvent.change(q<HTMLInputElement>('[data-slot="ledger-amount"]')!, { target: { value: '100' } });
    click(q('[data-slot="ledger-save"]'));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]![1]).toBeUndefined();
    expect(saveMock.mock.calls[0]![0]).toEqual({
      txDate: '2026-11-20',
      kind: 'withdraw_profit',
      who: 'G',
      fromAcc: 'kbG',
      toAcc: null,
      via: null,
      amountKrw: 1_000_000,
      memo: '',
      reflect: true,
    });
    await waitFor(() => expect(sheet()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    expect(segment('계좌 거래')?.getAttribute('aria-checked')).toBe('true');
    expect(page()?.getAttribute('data-panel-open') ?? 'none').toBe('none');
  });

  it('저장 실패 → 시트 유지 · 「저장하지 못했어요 · <message>」 · 다시 불러오지 않음', async () => {
    saveMock.mockRejectedValue(
      new ApiClientError({ code: 'VALIDATION_FAILED', status: 400, message: '심쥬니는 현중 · 근형 묶음 계좌에 출자 · 원금 회수를 적을 수 없어요' }),
    );
    await ready();
    click(headButton());
    click(sheetPill('뺀 계좌', 'KB 정근형'));
    click(sheetPill('받는 사람', '정근형'));
    fireEvent.change(q<HTMLInputElement>('[data-slot="ledger-amount"]')!, { target: { value: '100' } });
    click(q('[data-slot="ledger-save"]'));
    await waitFor(() =>
      expect(text(q('[data-slot="ledger-save-error"]'))).toBe(
        '저장하지 못했어요 · 심쥬니는 현중 · 근형 묶음 계좌에 출자 · 원금 회수를 적을 수 없어요',
      ),
    );
    expect(sheet()).not.toBeNull();
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
  });
});

describe('(IN-05) 응답을 못 받은 저장(시간 초과 · 네트워크)', () => {
  it('시트 유지 · 「저장됐는지 확인하지 못했어요 — …」(접두 없음) · 목록을 다시 불러옴', async () => {
    saveMock.mockRejectedValue(new ApiClientError({ code: 'TIMEOUT', status: 0, message: '요청이 시간 초과되었습니다' }));
    await ready();
    click(headButton());
    click(sheetPill('뺀 계좌', 'KB 정근형'));
    click(sheetPill('받는 사람', '정근형'));
    fireEvent.change(q<HTMLInputElement>('[data-slot="ledger-amount"]')!, { target: { value: '100' } });
    click(q('[data-slot="ledger-save"]'));
    await waitFor(() =>
      expect(text(q('[data-slot="ledger-save-error"]'))).toBe(
        '저장됐는지 확인하지 못했어요 — 목록을 다시 불러왔어요. 같은 거래가 생겼는지 확인한 뒤 다시 저장해 주세요',
      ),
    );
    expect(sheet()).not.toBeNull();
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });
});

describe('줄 「고치기」(D-19)', () => {
  it('펼친 줄 「고치기」 → 「거래 고치기」 · 저장 → PUT(id 7)', async () => {
    saveMock.mockResolvedValue({ ok: true, id: 7, pend: {} });
    await ready();
    await expand(7);
    click(rowAction(7, '고치기'));
    expect(sheetTitle()).toBe('거래 고치기');
    expect(page()?.getAttribute('data-panel-open')).toBe('true');
    fireEvent.change(q<HTMLInputElement>('[data-slot="ledger-amount"]')!, { target: { value: '30000' } });
    click(q('[data-slot="ledger-save"]'));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]![1]).toBe(7);
    expect(saveMock.mock.calls[0]![0]).toEqual({
      txDate: '2026-09-13',
      kind: 'move',
      who: null,
      fromAcc: 'kbG',
      toAcc: 'kyH',
      via: 'transfer',
      amountKrw: 300_000_000,
      memo: '',
      reflect: true,
    });
    await waitFor(() => expect(sheet()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });
});

describe('줄 「지우기」 · 확인 창(⑨ · D-23)', () => {
  it('반영했던 줄 → 문단 · 상자 켜짐 · 미리 보기 두 줄 · 「지우기」 → DELETE(7, true) · 닫힘 · 다시 불러옴', async () => {
    deleteMock.mockResolvedValue(OK);
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    expect(text(q('[data-slot="settle-confirm-body"]'))).toBe(
      '9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 4억이 거래를 지워요. 넣은 돈 · 몫 계산에서 빠져요.',
    );
    expect(confirmSwitch()?.getAttribute('aria-checked')).toBe('true');
    expect(confirmLines()).toBe('KB 정근형 예수금 8억 4,500만 → 12억 4,500만 / 교보 김현중 예수금 6억 8,400만 → 2억 8,400만');
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0]).toEqual([7, true]);
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });

  it('반영 안 한 줄 → 상자 없음 · DELETE(5, false)', async () => {
    deleteMock.mockResolvedValue(OK);
    await ready();
    await expand(5);
    click(rowAction(5, '지우기'));
    expect(text(q('[data-slot="settle-confirm-body"]')).startsWith('9/10 · KB 정근형 → KB 김현중 · 계좌 옮김 1억')).toBe(true);
    expect(q('[data-slot="reflect-box"]', confirmBox()!)).toBeNull();
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0]).toEqual([5, false]);
    await waitFor(() => expect(confirmBox()).toBeNull());
  });

  it('(CR-01) 보냈는데 응답만 못 받은 줄 · 지금 값 = 목표값(들어감) → 상자 켜짐 · 되돌림 미리 보기 · DELETE(8, true)', async () => {
    deleteMock.mockResolvedValue(OK);
    const timeoutRow = ledgerRow(8, {
      txDate: '2026-11-19',
      kind: 'contribute',
      who: 'H',
      toAcc: 'kbG',
      amountKrw: 100_000_000,
      reflect: true,
      seeded: false,
      // 지금 kbG 845,000,000 = 목표값 — 실제로 들어간 반영.
      pend: { kbG: { deltaKrw: 100_000_000, targetKrw: 845_000_000, reason: 'timeout' } },
    });
    fetchSettlementMock.mockResolvedValue({ ...view(), ledger: [...LEDGER, timeoutRow] });
    await ready();
    await expand(8);
    click(rowAction(8, '지우기'));
    expect(confirmSwitch()?.getAttribute('aria-checked')).toBe('true');
    expect(confirmLines()).toBe('KB 정근형 예수금 8억 4,500만 → 7억 4,500만');
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0]).toEqual([8, true]);
  });

  it('(CR-01) 보냈는데 응답만 못 받은 줄 · 지금 값 ≠ 목표값(안 들어감) → 상자 없음 · DELETE(8, false)', async () => {
    deleteMock.mockResolvedValue(OK);
    const timeoutRow = ledgerRow(8, {
      txDate: '2026-11-19',
      kind: 'contribute',
      who: 'H',
      toAcc: 'kbG',
      amountKrw: 100_000_000,
      reflect: true,
      seeded: false,
      pend: { kbG: { deltaKrw: 100_000_000, targetKrw: 945_000_000, reason: 'timeout' } },
    });
    fetchSettlementMock.mockResolvedValue({ ...view(), ledger: [...LEDGER, timeoutRow] });
    await ready();
    await expand(8);
    click(rowAction(8, '지우기'));
    expect(q('[data-slot="reflect-box"]', confirmBox()!)).toBeNull();
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0]).toEqual([8, false]);
  });

  it('스위치를 끄고 지우면 DELETE(7, false)', async () => {
    deleteMock.mockResolvedValue(OK);
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    click(confirmSwitch());
    expect(confirmSwitch()?.getAttribute('aria-checked')).toBe('false');
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock.mock.calls[0]).toEqual([7, false]);
  });

  it('그 밖의 거부(SETTLE_LINKED · X) → 「지우지 못했어요 · X」 · 창 유지', async () => {
    deleteMock.mockRejectedValue(new ApiClientError({ code: 'SETTLE_LINKED', status: 409, message: 'X' }));
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    click(confirmButton('지우기'));
    await waitFor(() => expect(text(confirmAlert())).toBe('지우지 못했어요 · X'));
    expect(confirmBox()).not.toBeNull();
    expect(confirmButton('지우기')?.disabled).toBe(false);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
  });
});

describe('D-30 — 지운 뒤 되돌리기만 실패(unreverted)', () => {
  it('창 유지 · 오류 줄 = 서버 문장 그대로 · 「지우기」 잠금 · 아직 다시 불러오지 않음 → 「닫기」 → 닫힘 · 다시 불러옴', async () => {
    deleteMock.mockResolvedValue({ ok: true, pend: {}, unreverted: ['kbG'], message: UNREVERTED_MSG });
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    click(confirmButton('지우기'));
    await waitFor(() => expect(text(confirmAlert())).toBe('KB 정근형 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요'));
    expect(confirmBox()).not.toBeNull();
    expect(confirmButton('지우기')?.disabled).toBe(true);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
    click(confirmButton('닫기'));
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });
});

describe('D-30 — 미리 막고 안내(409 REVERT_UNREADABLE)', () => {
  it('읽지 못함 → 창 유지 · 문장 그대로 · 「지우기」 활성 · 스위치 끔 → 줄 사라짐 → DELETE(7, false) → 닫힘 · 다시 불러옴', async () => {
    deleteMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'REVERT_UNREADABLE', status: 409, message: UNREADABLE_MSG }))
      .mockResolvedValueOnce(OK);
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    click(confirmButton('지우기'));
    await waitFor(() =>
      expect(text(confirmAlert())).toBe('KB 정근형 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요'),
    );
    expect(deleteMock.mock.calls[0]).toEqual([7, true]);
    expect(confirmButton('지우기')?.disabled).toBe(false);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
    click(confirmSwitch());
    expect(confirmAlert()).toBeNull();
    click(confirmButton('지우기'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(2));
    expect(deleteMock.mock.calls[1]).toEqual([7, false]);
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });

  it('0 이하 → 같은 처리(문장 그대로 · 접두 없음 · 「지우기」 활성)', async () => {
    deleteMock.mockRejectedValueOnce(new ApiClientError({ code: 'REVERT_UNREADABLE', status: 409, message: BELOW_ZERO_MSG }));
    await ready();
    await expand(7);
    click(rowAction(7, '지우기'));
    click(confirmButton('지우기'));
    await waitFor(() =>
      expect(text(confirmAlert())).toBe('KB 정근형 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요'),
    );
    expect(confirmButton('지우기')?.disabled).toBe(false);
    expect(confirmBox()).not.toBeNull();
  });
});

describe('바로 출금 줄 — 「고치기」 · 「지우기」 없음', () => {
  it('settleId 줄 펼침 → 단추 없음 · 안내 문장', async () => {
    await ready();
    await expand(20);
    expect(rowAction(20, '고치기')).toBeNull();
    expect(rowAction(20, '지우기')).toBeNull();
    expect(text(q('[data-slot="settlement-ledger-actions"]', ledgerItem(20)!))).toContain('정산 때 만든 줄이에요');
    // 일반 줄은 단추가 있다
    await expand(7);
    expect(text(rowAction(7, '고치기'))).toBe('고치기');
  });
});
