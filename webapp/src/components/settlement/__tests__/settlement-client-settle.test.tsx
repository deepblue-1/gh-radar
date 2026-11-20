import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, waitFor } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementLedgerRow,
  type SettlementSettleBody,
  type SettlementSettleRow,
  type SettlementView,
  type SettlementWriteResponse,
} from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 44 — 본문 연결: 머리 「정산하기」 · 열 때 다시 읽기 · 확정 뒤 흐름 · 정산 취소(44-11 T2 · UI-SPEC ① · ⑥ · ⑧ · ⑨ · D-16 · D-17 · D-23 · D-30).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 머리 | 첫 불러오기 전 · 뒤 | 「거래 기록」 · 「정산하기」 순서 · 둘 다 비활성 → 활성 |
 * | 열기 | 「정산하기」 | 시트 · 패널 열림 · fetchSettlement 한 번 더 · 새 값이 오면 큰 숫자 바뀜 · 실패하면 지금 값 그대로 |
 * | 확정 | 바로 출금 김현중 | confirmSettlement(body) · 닫힘 · 「정산 기록」 · 새 줄(id 12) 펼침 · 다시 불러옴 |
 * | 확정 실패 | 409 X | 시트 유지 · 「정산을 확정하지 못했어요 · X」 |
 * | 취소 | 가장 최근 정산 · 바로 출금 1건 반영 | 문단 · 상자 켜짐 · 미리 보기 · cancelSettlement(11, true) · 닫힘 · 다시 불러옴 |
 * | 취소 | 바로 출금 없음 | 상자 없음 · cancelSettlement(id, false) |
 * | D-30 | unreverted | 창 유지 · 문장 그대로(접두 없음) · 「정산 취소」 잠금 · 「닫기」 때 다시 불러옴 |
 * | D-30 | 409 REVERT_UNREADABLE | 창 유지 · 문장 그대로 · 「정산 취소」 활성 · 스위치 끔 → 줄 사라짐 → cancelSettlement(11, false) |
 * | 그 밖 | NOT_LATEST · X | 「정산을 취소하지 못했어요 · X」 · 창 유지 |
 * | 옛 정산 | 더 최근 정산이 있음 | 단추 없음 · 「더 최근 정산부터 차례로 취소할 수 있어요」 |
 */

const fetchSettlementMock = vi.fn();
const confirmMock = vi.fn<(body: SettlementSettleBody) => Promise<SettlementWriteResponse>>();
const cancelMock = vi.fn<(id: number, reflect: boolean) => Promise<SettlementWriteResponse>>();
vi.mock('@/lib/admin-api', () => ({
  fetchSettlement: () => fetchSettlementMock(),
  saveSettlementLedger: vi.fn(),
  deleteSettlementLedger: vi.fn(),
  retrySettlementLedger: vi.fn(),
  confirmSettlement: (body: SettlementSettleBody) => confirmMock(body),
  cancelSettlement: (id: number, reflect: boolean) => cancelMock(id, reflect),
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
const LATER = '2026-11-20T05:40:00.000Z'; // KST 14:40
const PAST_1432 = '2026-11-19T05:32:00.000Z'; // KST 11/19 14:32
const OLDER = '2026-10-31T05:32:00.000Z'; // KST 10/31 14:32

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

// 검산 시드 9건 — p1 정산 전 수익 +10억 4,900만.
const SEED: SettlementLedgerRow[] = [
  ledgerRow(1, { txDate: '2025-12-31', kind: 'contribute', who: 'H', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(2, { txDate: '2025-12-31', kind: 'contribute', who: 'G', toAcc: 'kbG', amountKrw: 400_000_000 }),
  ledgerRow(3, { txDate: '2026-08-10', kind: 'move', fromAcc: 'kbG', toAcc: 'kyH', via: 'corp_service', amountKrw: 300_000_000 }),
  ledgerRow(4, { txDate: '2026-09-10', kind: 'contribute', who: 'J', toAcc: 'kbH', amountKrw: 100_000_000 }),
  ledgerRow(5, { txDate: '2026-09-10', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(6, { txDate: '2026-09-13', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(7, { txDate: '2026-09-13', kind: 'move', fromAcc: 'kbG', toAcc: 'kyH', via: 'transfer', amountKrw: 400_000_000 }),
  ledgerRow(8, { txDate: '2026-09-18', kind: 'move', fromAcc: 'kbG', toAcc: 'kbH', via: 'transfer', amountKrw: 100_000_000 }),
  ledgerRow(9, { txDate: '2026-11-01', kind: 'move', fromAcc: 'kbG', toAcc: 'kyG', via: 'transfer', amountKrw: 20_000_000 }),
];

const DEP: Record<SettlementAccKey, number> = {
  kbG: 845_000_000,
  kyH: 684_000_000,
  kyG: 20_000_000,
  kbH: 372_000_000,
};

const settleRow = (id: number, pool: 'p1' | 'p2', profitKrw: number, at: string): SettlementSettleRow => ({
  id,
  pool,
  profitKrw,
  shares: pool === 'p1' ? { H: profitKrw / 2, G: profitKrw / 2 } : {},
  snapshot: { accounts: [], cumKrw: profitKrw, prevKrw: 0 },
  readAt: at,
  memo: '',
  createdBy: 'hyunjoong@example.com',
  createdAt: at,
});

function view(
  opts: {
    budgets?: Partial<Record<SettlementAccKey, number>>;
    ledger?: SettlementLedgerRow[];
    settles?: SettlementSettleRow[];
    now?: string;
  } = {},
): SettlementView {
  const now = opts.now ?? NOW;
  return {
    now,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => ({
      accKey: a.key,
      label: a.label,
      owner: a.owner,
      pool: a.pool,
      state: 'known' as const,
      budgetKrw: opts.budgets?.[a.key] ?? DEP[a.key],
      readAt: now,
      mismatch: false,
    })),
    ledger: opts.ledger ?? SEED,
    settles: opts.settles ?? [],
  };
}

// 11/19 p1 정산(id 11) — 김현중 「바로 출금」 5억 2,450만을 교보 김현중에서 뺐고 예수금에 반영함.
const S11 = settleRow(11, 'p1', 1_049_000_000, PAST_1432);
const S5 = settleRow(5, 'p1', 100_000_000, OLDER);
const OUT_ROW = ledgerRow(30, {
  txDate: '2026-11-19',
  kind: 'withdraw_profit',
  fromAcc: 'kyH',
  who: 'H',
  amountKrw: 524_500_000,
  settleId: 11,
  reflect: true,
  seeded: false,
  createdBy: 'hyunjoong@example.com',
});
const settledView = (outRow: SettlementLedgerRow | null = OUT_ROW) =>
  view({
    budgets: { kyH: 159_500_000 },
    ledger: outRow ? [...SEED, outRow] : SEED,
    settles: [S11, S5],
  });

const OK: SettlementWriteResponse = { ok: true, pend: {} };
const UNREVERTED_MSG = '교보 김현중 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요';
const UNREADABLE_MSG = '교보 김현중 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요';
const BELOW_ZERO_MSG = '교보 김현중 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요';

// ── DOM 도우미(실패해도 한 줄 메시지) ──
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));
const byText = <T extends HTMLElement = HTMLElement>(sel: string, label: string, root: ParentNode = document) =>
  qa<T>(sel, root).find((b) => text(b) === label) ?? null;

const ledgerHead = () => q<HTMLButtonElement>('[data-slot="settlement-ledger-create"]');
const settleHead = () => q<HTMLButtonElement>('[data-slot="settlement-settle-create"]');
const page = () => q('[data-slot="admin-settlement"]');
const sheetTitle = () => text(q('[data-slot="sheet-title"]'));
const sheet = () => q('[data-slot="settle-sheet"]');
const profitValue = () => text(q('[data-slot="settle-profit-value"]'));
const outBtn = (p: 'H' | 'G') =>
  q<HTMLButtonElement>(`[data-slot="settle-split-row"][data-person="${p}"] [data-slot="settle-out"]`);
const sheetConfirm = () => q<HTMLButtonElement>('[data-slot="settle-sheet-confirm"]');
const sheetError = () => q('[data-slot="settle-sheet-error"]');
const activity = () => q('[data-slot="settlement-activity"]');
const segment = (name: string) => byText<HTMLButtonElement>('[role="radio"]', name, activity() ?? document.createElement('div'));
const settleItem = (id: number) => q(`[data-slot="settlement-settle-item"][data-id="${id}"]`);
const settleRowBtn = (id: number) => q<HTMLButtonElement>('[data-slot="settlement-settle-row"]', settleItem(id) ?? document.createElement('div'));
const settleActions = (id: number) => q('[data-slot="settlement-settle-actions"]', settleItem(id) ?? document.createElement('div'));
const confirmBox = () => q('[data-slot="settle-confirm"]');
const confirmButton = (label: string) => byText<HTMLButtonElement>('button', label, confirmBox() ?? document.createElement('div'));
const confirmAlert = () => q('[role="alert"]', confirmBox() ?? document.createElement('div'));
const confirmSwitch = () => q('[data-slot="reflect-box"] [role="switch"]', confirmBox() ?? document.createElement('div'));
const confirmLines = () =>
  qa('[data-slot="reflect-line"]', confirmBox() ?? document.createElement('div'))
    .map((e) => text(e))
    .join(' / ');

function click(el: HTMLElement | null) {
  if (!el) throw new Error('element missing');
  fireEvent.click(el);
}

async function ready() {
  render(<SettlementClient />);
  await waitFor(() => expect(text(settleHead())).toBe('정산하기'));
  await waitFor(() => expect(settleHead()?.disabled).toBe(false));
}

/** 「정산 기록」 세그먼트에서 정산 줄을 펼치고 「정산 취소」 를 누른다. */
async function openCancel(id: number) {
  click(segment('정산 기록'));
  await waitFor(() => expect(settleItem(id)).not.toBeNull());
  click(settleRowBtn(id));
  click(byText<HTMLButtonElement>('button', '정산 취소', settleActions(id) ?? document.createElement('div')));
  await waitFor(() => expect(confirmBox()).not.toBeNull());
}

beforeEach(() => {
  fetchSettlementMock.mockReset();
  confirmMock.mockReset();
  cancelMock.mockReset();
  fetchSettlementMock.mockResolvedValue(view());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('머리 「정산하기」(UI E1)', () => {
  it('순서 「거래 기록」 · 「정산하기」 · 첫 불러오기 전 둘 다 비활성 → 뒤 활성', async () => {
    let resolve!: (v: SettlementView) => void;
    fetchSettlementMock.mockReturnValueOnce(new Promise<SettlementView>((r) => (resolve = r)));
    render(<SettlementClient />);
    // 한 줄 문자열로 비교 — 배열 비교의 여러 줄 diff 가 TAP 보고(RED 증거)를 깨뜨리지 않게.
    expect(
      qa('[data-slot="settlement-ledger-create"], [data-slot="settlement-settle-create"]')
        .map((b) => text(b))
        .join(' | '),
    ).toBe('거래 기록 | 정산하기');
    expect(ledgerHead()?.disabled).toBe(true);
    expect(settleHead()?.disabled).toBe(true);
    resolve(view());
    await waitFor(() => expect(settleHead()?.disabled).toBe(false));
    expect(ledgerHead()?.disabled).toBe(false);
  });
});

describe('시트 열기 · 열 때 다시 읽기(⑧ · D-16 · 사용자 확정 2026-11-20)', () => {
  it('「정산하기」 → 시트 · 패널 열림 · fetchSettlement 한 번 더 · 새 값이 오면 큰 숫자가 바뀐다', async () => {
    await ready();
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
    let resolve!: (v: SettlementView) => void;
    fetchSettlementMock.mockReturnValueOnce(new Promise<SettlementView>((r) => (resolve = r)));
    click(settleHead());
    expect(sheetTitle()).toBe('정산하기');
    expect(page()?.getAttribute('data-panel-open')).toBe('true');
    expect(fetchSettlementMock).toHaveBeenCalledTimes(2);
    // 열자마자 화면 값
    expect(profitValue()).toBe('+10억 4,900만');
    resolve(view({ budgets: { kyH: 700_000_000 }, now: LATER }));
    await waitFor(() => expect(profitValue()).toBe('+10억 6,500만'));
    expect(sheet()).not.toBeNull();
  });

  it('다시 읽기가 실패하면 지금 값 그대로 · 화면 오류 상자로 바뀌지 않는다', async () => {
    await ready();
    fetchSettlementMock.mockRejectedValueOnce(new ApiClientError({ code: 'UPSTREAM', status: 502, message: 'down' }));
    click(settleHead());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    expect(profitValue()).toBe('+10억 4,900만');
    expect(q('[data-slot="admin-settlement-error"]')).toBeNull();
    expect(sheetConfirm()?.disabled).toBe(false);
  });
});

describe('확정 → 「정산 기록」 + 새 줄 펼침(⑥ 흐름)', () => {
  it('바로 출금 김현중 → confirmSettlement(body) · 닫힘 · 「정산 기록」 · id 12 줄 aria-expanded · 다시 불러옴', async () => {
    confirmMock.mockResolvedValue({ ok: true, id: 12, pend: {} });
    await ready();
    click(settleHead());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    fetchSettlementMock.mockResolvedValue(
      view({
        budgets: { kyH: 159_500_000 },
        ledger: [...SEED, { ...OUT_ROW, settleId: 12 }],
        settles: [settleRow(12, 'p1', 1_049_000_000, NOW)],
      }),
    );
    click(outBtn('H'));
    click(sheetConfirm());
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock.mock.calls[0]![0]).toEqual({ pool: 'p1', outs: ['H'], memo: '', reflect: true, expectPrev: null });
    await waitFor(() => expect(sheet()).toBeNull());
    expect(page()?.getAttribute('data-panel-open') ?? 'none').toBe('none');
    expect(segment('정산 기록')?.getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(settleRowBtn(12)?.getAttribute('aria-expanded')).toBe('true'));
  });

  it('확정 실패(409 X) → 시트 유지 · 「정산을 확정하지 못했어요 · X」', async () => {
    confirmMock.mockRejectedValue(new ApiClientError({ code: 'STALE_PREV', status: 409, message: 'X' }));
    await ready();
    click(settleHead());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    click(sheetConfirm());
    await waitFor(() => expect(text(sheetError())).toBe('정산을 확정하지 못했어요 · X'));
    expect(sheet()).not.toBeNull();
    expect(fetchSettlementMock).toHaveBeenCalledTimes(2);
  });
});

describe('정산 취소 확인 창(⑨ · D-17 · D-23)', () => {
  it('가장 최근 정산 · 바로 출금 1건 반영 → 문단 · 상자 켜짐 · 미리 보기 · cancelSettlement(11, true) · 닫힘 · 다시 불러옴', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    cancelMock.mockResolvedValue(OK);
    await ready();
    await openCancel(11);
    expect(text(q('[data-slot="settle-confirm-body"]'))).toBe(
      '11/19 현중 · 근형 정산 +10억 4,900만 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요. 그날 「바로 출금」 1건도 함께 사라져요.',
    );
    expect(confirmSwitch()?.getAttribute('aria-checked')).toBe('true');
    expect(confirmLines()).toBe('교보 김현중 예수금 1억 5,950만 → 6억 8,400만');
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock.mock.calls[0]).toEqual([11, true]);
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });

  it('바로 출금 줄이 없으면 상자 없음 · cancelSettlement(11, false)', async () => {
    fetchSettlementMock.mockResolvedValue(settledView(null));
    cancelMock.mockResolvedValue(OK);
    await ready();
    await openCancel(11);
    expect(text(q('[data-slot="settle-confirm-body"]'))).toBe(
      '11/19 현중 · 근형 정산 +10억 4,900만 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요.',
    );
    expect(q('[data-slot="reflect-box"]', confirmBox()!)).toBeNull();
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock.mock.calls[0]).toEqual([11, false]);
    await waitFor(() => expect(confirmBox()).toBeNull());
  });

  it('바로 출금 줄이 반영 안 됨(reflect false) → 상자 없음 · 「1건」 문장 · cancelSettlement(11, false)', async () => {
    fetchSettlementMock.mockResolvedValue(settledView({ ...OUT_ROW, reflect: false }));
    cancelMock.mockResolvedValue(OK);
    await ready();
    await openCancel(11);
    expect(text(q('[data-slot="settle-confirm-body"]'))).toContain('그날 「바로 출금」 1건도 함께 사라져요.');
    expect(q('[data-slot="reflect-box"]', confirmBox()!)).toBeNull();
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock.mock.calls[0]).toEqual([11, false]);
  });

  it('그 밖의 거부(NOT_LATEST · X) → 「정산을 취소하지 못했어요 · X」 · 창 유지 · 「정산 취소」 활성', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    cancelMock.mockRejectedValue(new ApiClientError({ code: 'NOT_LATEST', status: 409, message: 'X' }));
    await ready();
    await openCancel(11);
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(text(confirmAlert())).toBe('정산을 취소하지 못했어요 · X'));
    expect(confirmBox()).not.toBeNull();
    expect(confirmButton('정산 취소')?.disabled).toBe(false);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
  });

  it('옛 정산 줄 → 「정산 취소」 없음 · 「더 최근 정산부터 차례로 취소할 수 있어요」', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    await ready();
    click(segment('정산 기록'));
    await waitFor(() => expect(settleItem(5)).not.toBeNull());
    click(settleRowBtn(5));
    expect(byText('button', '정산 취소', settleActions(5)!)).toBeNull();
    expect(text(settleActions(5))).toBe('더 최근 정산부터 차례로 취소할 수 있어요');
  });
});

describe('D-30 — 취소 뒤 되돌리기만 실패(unreverted)', () => {
  it('창 유지 · 오류 줄 = 서버 문장 그대로 · 「정산 취소」 잠금 · 아직 다시 불러오지 않음 → 「닫기」 → 닫힘 · 다시 불러옴', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    cancelMock.mockResolvedValue({ ok: true, pend: {}, unreverted: ['kyH'], message: UNREVERTED_MSG });
    await ready();
    await openCancel(11);
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(text(confirmAlert())).toBe('교보 김현중 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요'));
    expect(confirmBox()).not.toBeNull();
    expect(confirmButton('정산 취소')?.disabled).toBe(true);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
    click(confirmButton('닫기'));
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });
});

describe('D-30 — 미리 막고 안내(409 REVERT_UNREADABLE)', () => {
  it('읽지 못함 → 창 유지 · 문장 그대로 · 「정산 취소」 활성 · 스위치 끔 → 줄 사라짐 → cancelSettlement(11, false) → 닫힘 · 다시 불러옴', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    cancelMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'REVERT_UNREADABLE', status: 409, message: UNREADABLE_MSG }))
      .mockResolvedValueOnce(OK);
    await ready();
    await openCancel(11);
    click(confirmButton('정산 취소'));
    await waitFor(() =>
      expect(text(confirmAlert())).toBe('교보 김현중 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요'),
    );
    expect(cancelMock.mock.calls[0]).toEqual([11, true]);
    expect(confirmButton('정산 취소')?.disabled).toBe(false);
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
    click(confirmSwitch());
    expect(confirmAlert()).toBeNull();
    click(confirmButton('정산 취소'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(2));
    expect(cancelMock.mock.calls[1]).toEqual([11, false]);
    await waitFor(() => expect(confirmBox()).toBeNull());
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });

  it('0 이하 → 같은 처리(문장 그대로 · 접두 없음 · 「정산 취소」 활성)', async () => {
    fetchSettlementMock.mockResolvedValue(settledView());
    cancelMock.mockRejectedValueOnce(new ApiClientError({ code: 'REVERT_UNREADABLE', status: 409, message: BELOW_ZERO_MSG }));
    await ready();
    await openCancel(11);
    click(confirmButton('정산 취소'));
    await waitFor(() =>
      expect(text(confirmAlert())).toBe('교보 김현중 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요'),
    );
    expect(confirmButton('정산 취소')?.disabled).toBe(false);
    expect(confirmBox()).not.toBeNull();
  });
});
