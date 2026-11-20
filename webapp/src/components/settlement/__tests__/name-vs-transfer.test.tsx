import { describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementCtx,
  type SettlementLedgerRow,
} from '@gh-radar/shared';

import { NameVsCard } from '../name-vs-card';
import { TransferCard } from '../transfer-card';

/**
 * Phase 44 — 「명의 대 몫」(④) · 「현중 ↔ 근형 계좌이체」(⑤)(44-09 T1 · UI-SPEC ④ · ⑤ · E4 · E5 · 규칙 5 · 6 · D-25).
 *
 * 검산 픽스처(person-cards 와 같음): 명의 합 김현중 10억 5,600만(교보 김현중 6억 8,400만 + KB 김현중 3억 7,200만) ·
 * 정근형 8억 6,500만(KB 정근형 8억 4,500만 + 교보 정근형 2,000만) · 정근형 지금 몫 전체 9억 2,450만 → x = 5,950만(김현중 → 정근형).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 검산 ④ | 시드 9건 · 예수금 4개 | 명의 줄 · 보조 줄 · 「김현중 → 정근형 5,950만원이면 맞음」 |
 * | x < 0 | kyG 2억 | 「정근형 명의 계좌에 김현중 몫이 들어 있습니다」 · 「정근형 → 김현중 3,050만원이면 맞음」 |
 * | x = 0 | kyH 5억 6,500만 | 「명의와 몫이 맞습니다」 |
 * | kyG 미설정 | unset | 정근형 합 「—」 · 「교보 정근형 미설정」 · 계산 불가 문장 |
 * | 검산 ⑤ | 시드 9건 | 1건 4억 · 4건 7억 · 「정근형이 3억 더 보냄」 · 법인 용역 1건 3억 |
 * | ⑤ 0 건 | 거래 없음 | 「0건」 · 「0」 · 차액 「0」 · 법인 용역 줄 없음 |
 */

configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

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

function ctx(
  o: { unset?: SettlementAccKey[]; dep?: Partial<Record<SettlementAccKey, number>>; ledger?: SettlementLedgerRow[] } = {},
): SettlementCtx {
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
    ledger: o.ledger ?? SEED,
    settles: [],
  };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const card = (slot: string) => document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
/** 줄(라벨|값) · 보조 줄(글자) 순서대로. */
const lines = (slot: string) =>
  Array.from(card(slot)?.querySelectorAll<HTMLElement>('[data-slot="settlement-tr2-row"], [data-slot="settlement-tr2-sub"]') ?? []).map(
    (row) =>
      Array.from(row.children)
        .map((c) => text(c))
        .join('|'),
  );
/** 카드 제목 「제목|부제」(두 글자 덩이 사이는 gap 이라 textContent 에 띄어쓰기가 없다). */
const heading = (c: HTMLElement | null) =>
  Array.from(c?.querySelector('h2')?.children ?? [])
    .map((s) => text(s))
    .join('|');
const zeroDir = () => text(card('settlement-name-zero')?.querySelector('[data-slot="settlement-name-zero-dir"]'));
const zeroAmt = () => text(card('settlement-name-zero')?.querySelector('[data-slot="settlement-name-zero-amt"]'));

describe('NameVsCard — 명의 대 몫(④ · 44-09 T1)', () => {
  it('검산 → 명의 합 · 계좌 보조 줄 · 몫 보조 줄 · 「김현중 → 정근형 5,950만원이면 맞음」', () => {
    render(<NameVsCard ctx={ctx()} />);
    // 한 줄 메시지로 비교 — 배열 diff 는 여러 줄이라 TAP 보고(RED 증거)를 깨뜨린다.
    expect(lines('settlement-name-vs').join(' / ')).toBe(
      [
        '김현중 명의 계좌|10억 5,600만',
        '교보 김현중 6억 8,400만 · KB 김현중 3억 7,200만',
        '그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만',
        '정근형 명의 계좌|8억 6,500만',
        'KB 정근형 8억 4,500만 · 교보 정근형 2,000만',
        '정근형 몫은 9억 2,450만',
      ].join(' / '),
    );
    const c = card('settlement-name-vs');
    expect(heading(c)).toBe('명의 대 몫|누구 이름 계좌에 누구 돈이 있나');
    expect(zeroDir()).toBe('김현중 명의 계좌에 정근형 몫이 들어 있습니다');
    expect(zeroAmt()).toBe('김현중 → 정근형 5,950만원이면 맞음');
    // 두 번째 사람 묶음 위 hairline
    const rows = c!.querySelectorAll<HTMLElement>('[data-slot="settlement-tr2-row"]');
    expect(rows[1]!.className).toContain('border-t');
    expect(rows[0]!.className).not.toContain('border-t');
    // 증여 판단 문구 없음(사실 관계만 · 규칙 6)
    expect(text(c)).not.toContain('증여');
  });

  it('x < 0(kyG 2억) → 「정근형 명의 계좌에 김현중 몫이 들어 있습니다」 · 「정근형 → 김현중 3,050만원이면 맞음」', () => {
    render(<NameVsCard ctx={ctx({ dep: { kyG: 200_000_000 } })} />);
    expect(zeroDir()).toBe('정근형 명의 계좌에 김현중 몫이 들어 있습니다');
    expect(zeroAmt()).toBe('정근형 → 김현중 3,050만원이면 맞음');
  });

  it('x = 0(kyH 5억 6,500만) → 「명의와 몫이 맞습니다」 · 방향 문장 없음', () => {
    render(<NameVsCard ctx={ctx({ dep: { kyH: 565_000_000 } })} />);
    expect(zeroAmt()).toBe('명의와 몫이 맞습니다');
    expect(card('settlement-name-zero')?.querySelector('[data-slot="settlement-name-zero-dir"]')).toBeNull();
  });

  it('kyG 미설정 → 정근형 합 「—」 · 「교보 정근형 미설정」 · 몫 「—」 · 계산 불가 문장', () => {
    render(<NameVsCard ctx={ctx({ unset: ['kyG'] })} />);
    expect(lines('settlement-name-vs').join(' / ')).toBe(
      [
        '김현중 명의 계좌|10억 5,600만',
        '교보 김현중 6억 8,400만 · KB 김현중 3억 7,200만',
        '그중 김현중 몫 — · 심쥬니 몫 7,200만',
        '정근형 명의 계좌|—',
        'KB 정근형 8억 4,500만 · 교보 정근형 미설정',
        '정근형 몫은 —',
      ].join(' / '),
    );
    expect(text(card('settlement-name-zero'))).toBe('예수금이 설정되지 않은 계좌가 있어 맞출 금액을 계산할 수 없어요');
    expect(card('settlement-name-zero')?.querySelector('[data-slot="settlement-name-zero-amt"]')).toBeNull();
  });
});

describe('TransferCard — 현중 ↔ 근형 계좌이체(⑤ · 44-09 T1)', () => {
  it('검산 → 1건 4억 · 4건 7억 · 「정근형이 3억 더 보냄」 · 법인 용역 1건 3억', () => {
    render(<TransferCard ledger={SEED} onShowTransfers={() => {}} />);
    expect(lines('settlement-transfer').join(' / ')).toBe(
      [
        '김현중 → 정근형 1건|4억',
        '정근형 → 김현중 4건|7억',
        '차액|정근형이 3억 더 보냄',
        '법인 용역으로 옮긴 돈 1건 · 개인 이체 아님|3억',
      ].join(' / '),
    );
    const c = card('settlement-transfer');
    expect(heading(c)).toBe('현중 ↔ 근형 계좌이체|실제로 오간 돈 · 소명용');
    // 「차액」 줄 위 hairline
    expect(c!.querySelectorAll<HTMLElement>('[data-slot="settlement-tr2-row"]')[2]!.className).toContain('border-t');
  });

  it('kyG 미설정이어도 같은 숫자(예수금과 무관 — 거래만 읽는다)', () => {
    render(<TransferCard ledger={ctx({ unset: ['kyG'] }).ledger} onShowTransfers={() => {}} />);
    expect(lines('settlement-transfer')[2]).toBe('차액|정근형이 3억 더 보냄');
  });

  it('거래 0 건 → 「0건」 · 「0」 · 차액 「0」 · 법인 용역 줄 없음', () => {
    render(<TransferCard ledger={[]} onShowTransfers={() => {}} />);
    expect(lines('settlement-transfer').join(' / ')).toBe(
      ['김현중 → 정근형 0건|0', '정근형 → 김현중 0건|0', '차액|0'].join(' / '),
    );
  });

  it('김현중이 더 보냄 → 「김현중이 … 더 보냄」', () => {
    render(
      <TransferCard
        ledger={[ledgerRow(1, { txDate: '2026-11-01', kind: 'move', fromAcc: 'kyH', toAcc: 'kbG', via: 'transfer', amountKrw: 50_000_000 })]}
        onShowTransfers={() => {}}
      />,
    );
    expect(lines('settlement-transfer')[2]).toBe('차액|김현중이 5,000만 더 보냄');
  });

  it('「이체 내역 보기」 클릭 → onShowTransfers 1회', () => {
    const onShow = vi.fn();
    render(<TransferCard ledger={SEED} onShowTransfers={onShow} />);
    // 먼저 한 줄 단언 — 역할 조회 실패 메시지는 여러 줄이라 TAP 보고를 깨뜨린다.
    expect(text(card('settlement-transfer')?.querySelector('button'))).toBe('이체 내역 보기');
    fireEvent.click(screen.getByRole('button', { name: '이체 내역 보기' }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});
