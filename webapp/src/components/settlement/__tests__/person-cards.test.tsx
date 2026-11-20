import { describe, expect, it } from 'vitest';
import { configure, render } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementCtx,
  type SettlementLedgerRow,
  type SettlementPerson,
} from '@gh-radar/shared';

import { PersonCards } from '../person-cards';

/**
 * Phase 44 — 세 사람 카드(44-06 T2 · UI-SPEC ② · E2 · D-06 · D-08 · D-25 · 목업 `personCards`).
 *
 * 큰 숫자 「내 수익 몫 · 아직 계좌에 두고 있는 돈」 = shared `personSummary().totalKrw`(남겨 둔 돈 + 정산 전 몫 · 목업 `fm(x.total)`) ·
 * 「지금 몫 전체」 = `stakeKrw`(원금 + 남겨 둔 돈 + 정산 전 몫 − 손실). 검산 픽스처에서 지금 몫 전체 9억 2,450만 · 9억 2,450만 · 7,200만.
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 검산 | 시드 9건 · 예수금 4개 | 순서 김현중 · 정근형 · 심쥬니 · 큰 숫자 5억 2,450만 · 5억 2,450만 · 0 · kv 줄 · 보조 줄 · 심쥬니 손실 줄 |
 * | 손실 1억 넘음 | kbH 2억 5,000만 | 김현중 「쥬니 묶음 손실 1억 넘는 부분」 −2,500만 |
 * | 미설정 | kyG unset | 김현중 · 정근형 큰 숫자 · 내 몫 · 지금 몫 전체 「—」 · 보조 「현중 · 근형 —」 · 심쥬니 그대로 |
 * | 남겨 둔 돈 음수 | 김현중 수익 출금 1억 · 정산 없음 | 「정산한 몫보다 먼저 가져간 돈」 −1억 |
 */

configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

const M = '−';
const NOW = '2026-11-20T05:32:00.000Z';

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

function ctx(o: { unset?: SettlementAccKey[]; dep?: Partial<Record<SettlementAccKey, number>>; extra?: SettlementLedgerRow[] } = {}): SettlementCtx {
  return {
    accounts: SETTLEMENT_ACCOUNTS.map((a) => {
      const off = o.unset?.includes(a.key) ?? false;
      return {
        accKey: a.key,
        label: a.label,
        owner: a.owner,
        pool: a.pool,
        state: off ? ('unset' as const) : ('known' as const),
        budgetKrw: off ? null : (o.dep?.[a.key] ?? DEP[a.key]),
        readAt: off ? null : NOW,
        mismatch: false,
      };
    }),
    ledger: [...SEED, ...(o.extra ?? [])],
    settles: [],
  };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const card = (p: SettlementPerson) =>
  document.querySelector<HTMLElement>(`[data-slot="settlement-person"][data-person="${p}"]`);
const big = (p: SettlementPerson) => text(card(p)?.querySelector('[data-slot="settlement-person-big"]'));
/** kv 줄(보조 줄 포함) — 「라벨|값」 또는 보조 줄 「|글자」. */
const kv = (p: SettlementPerson) =>
  Array.from(card(p)?.querySelectorAll<HTMLElement>('[data-slot="settlement-person-kv"]') ?? []).map((row) =>
    Array.from(row.children)
      .map((c) => text(c))
      .join('|'),
  );

describe('PersonCards — 세 사람 카드(44-06 T2)', () => {
  it('검산 응답 → 순서 · 큰 숫자(내 수익 몫) · kv 줄 · 보조 줄 · 심쥬니 손실 · 지금 몫 전체', () => {
    render(<PersonCards ctx={ctx()} />);
    const order = Array.from(document.querySelectorAll('[data-slot="settlement-person"]')).map((c) =>
      c.getAttribute('data-person'),
    );
    // 문자열로 비교 — 배열 diff 는 여러 줄이라 TAP 보고(RED 증거)를 깨뜨린다.
    expect(order.join(',')).toBe('H,G,J');
    expect(big('H')).toBe('5억 2,450만원');
    expect(big('G')).toBe('5억 2,450만원');
    expect(big('J')).toBe('0원');
    expect(text(card('H')?.querySelector('[data-slot="settlement-person-name"]'))).toBe('김현중');
    expect(text(card('H'))).toContain('내 수익 몫 아직 계좌에 두고 있는 돈');

    expect(kv('H')).toEqual([
      '정산한 수익 중 남겨 둔 돈|0',
      '정산 전 수익 중 내 몫|+5억 2,450만',
      '현중 · 근형 +5억 2,450만 · 쥬니 0',
      '넣어 둔 원금|4억',
      '현중 · 근형 2억 5,000만 · 쥬니 1억 5,000만',
      '지금 몫 전체|9억 2,450만',
    ]);
    expect(kv('G').at(-1)).toBe('지금 몫 전체|9억 2,450만');
    expect(kv('J')).toEqual([
      '정산한 수익 중 남겨 둔 돈|0',
      '정산 전 수익 중 내 몫|0',
      '쥬니 0',
      '넣어 둔 원금|1억',
      `쥬니 묶음 손실 원금보장 · 1억까지 혼자|${M}2,800만`,
      '지금 몫 전체|7,200만',
    ]);
    // 방향색 — 내 몫 + 는 --up · 손실은 --down · 0 은 색 없음
    const val = (p: SettlementPerson, i: number) =>
      card(p)!.querySelectorAll<HTMLElement>('[data-slot="settlement-person-kv"]')[i]!.lastElementChild!;
    expect(val('H', 1).className).toContain('text-[var(--up)]');
    expect(val('J', 4).className).toContain('text-[var(--down)]');
    expect(val('J', 1).className).not.toContain('text-[var(--up)]');
  });

  it('쥬니 묶음 손실 1억 넘음(kbH 2억 5,000만) → 김현중 「1억 넘는 부분」 −2,500만', () => {
    render(<PersonCards ctx={ctx({ dep: { kbH: 250_000_000 } })} />);
    expect(kv('H')).toContain(`쥬니 묶음 손실 1억 넘는 부분|${M}2,500만`);
    expect(kv('G')).toContain(`쥬니 묶음 손실 1억 넘는 부분|${M}2,500만`);
    expect(kv('J')).toContain(`쥬니 묶음 손실 원금보장 · 1억까지 혼자|${M}1억`);
  });

  it('kyG 미설정 → 김현중 · 정근형 큰 숫자 · 내 몫 · 지금 몫 전체 「—」 · 남겨 둔 돈 · 원금은 그대로 · 심쥬니 그대로', () => {
    render(<PersonCards ctx={ctx({ unset: ['kyG'] })} />);
    for (const p of ['H', 'G'] as const) {
      expect(big(p)).toBe('—원');
      const rows = kv(p);
      expect(rows).toContain('정산 전 수익 중 내 몫|—');
      expect(rows).toContain('지금 몫 전체|—');
      expect(rows).toContain('정산한 수익 중 남겨 둔 돈|0');
      expect(rows).toContain('넣어 둔 원금|4억');
      expect(rows.find((r) => r.startsWith('현중 · 근형 —'))).toBe('현중 · 근형 — · 쥬니 0');
    }
    expect(big('J')).toBe('0원');
    expect(kv('J').at(-1)).toBe('지금 몫 전체|7,200만');
  });

  it('수익 출금이 정산 몫보다 큼 → 라벨 「정산한 몫보다 먼저 가져간 돈」 · 값 −1억', () => {
    render(
      <PersonCards
        ctx={ctx({
          extra: [ledgerRow(10, { txDate: '2026-11-10', kind: 'withdraw_profit', who: 'H', fromAcc: 'kyH', amountKrw: 100_000_000, seeded: false })],
        })}
      />,
    );
    expect(kv('H')[0]).toBe(`정산한 몫보다 먼저 가져간 돈|${M}1억`);
    expect(kv('G')[0]).toBe('정산한 수익 중 남겨 둔 돈|0');
  });
});
