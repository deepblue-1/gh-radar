import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementLedgerRow,
  type SettlementView,
} from '@gh-radar/shared';

import { ApiClientError } from '@/lib/api';

/**
 * Phase 44 — `/admin/settlement` 트레이서 화면 끝(44-01 T2).
 *
 * 잠그는 것(UI-SPEC E1 · E3 · ③ 문구 정본):
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 검산 | server 테스트 ② 와 같은 모양의 응답 | 「정산 전 수익」 계좌 표 · 묶음 값 · 부제 읽은 시각 |
 * | 불러오는 중 | 응답 대기 | `aria-busy="true"` · `aria-label="불러오는 중"` |
 * | 403 | FORBIDDEN | 「관리자만 사용할 수 있어요.」(role 없음) |
 * | 그 밖 실패 | 500 | `role="alert"` 「불러오지 못했어요」 → 「다시 시도」 → 성공 화면 |
 * | 미설정 | kyG unset | 그 줄 「미설정」 · 수익 「—」 · 현중 · 근형 묶음 값 「—」 |
 */

const fetchSettlementMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchSettlement: () => fetchSettlementMock(),
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

const M = '−';
const NOW = '2026-11-20T05:32:00.000Z'; // KST 14:32

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

function view(unset: SettlementAccKey[] = []): SettlementView {
  return {
    now: NOW,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => {
      const off = unset.includes(a.key);
      return {
        accKey: a.key,
        label: a.label,
        owner: a.owner,
        pool: a.pool,
        state: off ? ('unset' as const) : ('known' as const),
        budgetKrw: off ? null : DEP[a.key],
        readAt: off ? null : NOW,
        mismatch: false,
      };
    }),
    ledger: SEED,
    settles: [],
  };
}

const accRow = (acc: SettlementAccKey) =>
  document.querySelector<HTMLElement>(`[data-slot="settlement-acc-row"][data-acc="${acc}"]`)!;
const cellsOf = (acc: SettlementAccKey) => Array.from(accRow(acc).children).map((c) => c.textContent?.trim());
const poolValue = (pool: 'p1' | 'p2') =>
  document.querySelector<HTMLElement>(`[data-slot="settlement-pool"][data-pool="${pool}"] [data-slot="settlement-pool-value"]`)!;

beforeEach(() => {
  fetchSettlementMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettlementClient — 정산 전 수익(트레이서)', () => {
  it('검산 응답 → 계좌 표 · 묶음 값 · 부제', async () => {
    fetchSettlementMock.mockResolvedValue(view());
    render(<SettlementClient />);
    await waitFor(() => expect(document.querySelector('[data-slot="settlement-open-pools"]')).not.toBeNull());
    expect(screen.getByText('정산 전 수익')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: '정산' })).toBeTruthy();

    expect(cellsOf('kbG')).toEqual(['KB 정근형', '8억 4,500만', `${M}2억 2,000만`, '+10억 6,500만']);
    expect(cellsOf('kyH')).toEqual(['교보 김현중', '6억 8,400만', '7억', `${M}1,600만`]);
    expect(cellsOf('kyG')).toEqual(['교보 정근형', '2,000만', '2,000만', '0']);
    expect(cellsOf('kbH')).toEqual(['KB 김현중', '3억 7,200만', '4억', `${M}2,800만`]);
    expect(poolValue('p1').textContent).toBe('+10억 4,900만');
    expect(poolValue('p2').textContent).toBe(`${M}2,800만`);

    const card = document.querySelector<HTMLElement>('[data-slot="settlement-open-pools"]')!;
    expect(card.textContent).toContain(`수익 = 예수금 ${M} 넣은 돈 · 예수금 읽은 시각 오늘 14:32`);
    // 넣은 돈 풀이(D-24 · title)
    expect(accRow('kbG').children[2]!.getAttribute('title')).toBe(`들어온 돈 8억 ${M} 나간 돈 10억 2,000만`);
    expect(within(card).getByText('현중 · 근형')).toBeTruthy();
    expect(within(card).getByText('5 : 5')).toBeTruthy();
    expect(within(card).getByText('4 : 3 : 3')).toBeTruthy();
    expect(fetchSettlementMock).toHaveBeenCalledTimes(1);
  });

  it('불러오는 동안 aria-busy 스켈레톤', () => {
    fetchSettlementMock.mockReturnValue(new Promise(() => {}));
    render(<SettlementClient />);
    const busy = document.querySelector<HTMLElement>('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy!.getAttribute('aria-label')).toBe('불러오는 중');
  });

  it('403 → 「관리자만 사용할 수 있어요.」 · role 없음', async () => {
    fetchSettlementMock.mockRejectedValue(new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 }));
    render(<SettlementClient />);
    expect(await screen.findByText('관리자만 사용할 수 있어요.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('그 밖 실패 → 「불러오지 못했어요」(alert) → 「다시 시도」 → 성공 화면', async () => {
    fetchSettlementMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }))
      .mockResolvedValueOnce(view());
    render(<SettlementClient />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('불러오지 못했어요');
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('정산 전 수익')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fetchSettlementMock).toHaveBeenCalledTimes(2);
  });

  it('kyG 미설정 → 그 줄 「미설정」 · 수익 「—」 · 현중 · 근형 묶음 값 「—」 · 쥬니는 그대로', async () => {
    fetchSettlementMock.mockResolvedValue(view(['kyG']));
    render(<SettlementClient />);
    await screen.findByText('정산 전 수익');
    expect(cellsOf('kyG')).toEqual(['교보 정근형', '미설정', '2,000만', '—']);
    expect(poolValue('p1').textContent).toBe('—');
    expect(poolValue('p2').textContent).toBe(`${M}2,800만`);
  });
});
