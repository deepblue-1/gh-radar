import { describe, expect, it } from 'vitest';
import { configure, render } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  poolAccountRows,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementLedgerRow,
  type SettlementSettleRow,
  type SettlementView,
} from '@gh-radar/shared';

import { AccountTable } from '../account-table';
import { OpenPoolsCard } from '../open-pools-card';

/**
 * Phase 44 — 「정산 전 수익」 카드 완성(44-06 T1 · UI-SPEC ③ · E3 · D-24 · D-25 · D-28 · D-04).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | ① 검산 | 시드 9건 · 예수금 4개 · 정산 없음 | 부제 · D-28 한 줄 · 넣은 돈 풀이 · l3 몫 줄 · 쥬니 손실 이월 줄 · 누적 줄 없음 |
 * | ② 정산 1건 | p1 정산 1억 | 묶음 값 = 누적 − 1억 · 「누적 수익 +10억 4,900만 · 이미 정산한 수익 1억」 |
 * | ③ 미설정 | kyG unset + p1 정산 1건 | 「미설정」 · 「—」 · 묶음 값 「—」 · 안내 + 링크 /admin/accounts · 누적 줄 없음 |
 * | ④ 못 읽음 | kyH · kyG stale(어제 19:58) | 한 줄 「교보 김현중 · 교보 정근형 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값이에요」 · 계산은 그 값 |
 * | ⑤ 서버 간 다름 | kbG mismatch | 「KB 정근형 — 서버마다 예수금이 달라 주문 서버 값으로 계산했어요」 |
 * | ⑥ 지난 정산 표 | AccountTable mode past · readLine | 「… 에 읽은 값으로 확정했어요」 · 「예수금 읽은 시각 11/19 14:32」 |
 */

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

const M = '−';
const NOW = '2026-11-20T05:32:00.000Z'; // KST 14:32
const YDAY_1958 = '2026-11-19T10:58:00.000Z'; // KST 어제 19:58
const PAST_1432 = '2026-11-19T05:32:00.000Z'; // KST 11/19 14:32

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

const SETTLE_P1: SettlementSettleRow = {
  id: 1,
  pool: 'p1',
  profitKrw: 100_000_000,
  shares: { H: 50_000_000, G: 50_000_000 },
  snapshot: { accounts: [], cumKrw: 100_000_000, prevKrw: 0 },
  readAt: PAST_1432,
  memo: '',
  createdBy: 'hyunjoong@example.com',
  createdAt: PAST_1432,
};

type Over = Partial<Pick<SettlementAccountView, 'state' | 'readAt' | 'mismatch'>>;
function view(over: Partial<Record<SettlementAccKey, Over>> = {}, settles: SettlementSettleRow[] = []): SettlementView {
  return {
    now: NOW,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => {
      const o = over[a.key] ?? {};
      const state = o.state ?? 'known';
      return {
        accKey: a.key,
        label: a.label,
        owner: a.owner,
        pool: a.pool,
        state,
        budgetKrw: state === 'unset' ? null : DEP[a.key],
        readAt: o.readAt !== undefined ? o.readAt : state === 'unset' ? null : NOW,
        mismatch: o.mismatch ?? false,
      };
    }),
    ledger: SEED,
    settles,
  };
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const pool = (p: 'p1' | 'p2') => `[data-slot="settlement-pool"][data-pool="${p}"]`;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('OpenPoolsCard — 정산 전 수익(44-06 T1)', () => {
  it('① 검산 응답 → 부제 · D-28 안내 · 넣은 돈 풀이 · l3 몫 줄 · 쥬니 손실 이월', () => {
    render(<OpenPoolsCard view={view()} />);
    const card = q('[data-slot="settlement-open-pools"]');
    expect(card).not.toBeNull();
    expect(text(card)).toContain(`수익 = 예수금 ${M} 넣은 돈 · 예수금 읽은 시각 오늘 14:32`);
    expect(text(q('[data-slot="settlement-budget-basis"]'))).toBe('예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)');
    const kbG = q('[data-slot="settlement-acc-row"][data-acc="kbG"]');
    expect(kbG!.children[2]!.getAttribute('title')).toBe(`들어온 돈 8억 ${M} 나간 돈 10억 2,000만`);
    expect(text(q(`${pool('p1')} [data-slot="settlement-pool-l3"]`))).toBe('김현중 +5억 2,450만 · 정근형 +5억 2,450만');
    expect(text(q(`${pool('p2')} [data-slot="settlement-pool-l3"]`))).toBe('원금 4억까지 2,800만 남음 — 회복한 뒤부터 나눕니다');
    // 사람 점(장식) — l3 몫 줄에 사람마다 하나
    expect(qa(`${pool('p1')} [data-slot="settlement-pool-l3"] [data-slot="person-dot"]`)).toHaveLength(2);
    expect(qa('[data-slot="settlement-acc-cum"]')).toHaveLength(0);
  });

  it('(IN-02) 쥬니를 정산한 적이 있으면 이월 기준은 「지난 정산 수준」 · 남은 금액이 만으로 0 이면 「나눌 수익이 없습니다」', () => {
    const settleP2: SettlementSettleRow = { ...SETTLE_P1, id: 2, pool: 'p2', profitKrw: 10_000_000, shares: { J: 4_000_000, H: 3_000_000, G: 3_000_000 } };
    const { unmount } = render(<OpenPoolsCard view={view({}, [settleP2])} />);
    expect(text(q(`${pool('p2')} [data-slot="settlement-pool-l3"]`))).toBe('지난 정산 수준까지 3,800만 남음 — 회복한 뒤부터 나눕니다');
    unmount();
    for (const kbH of [400_000_000, 399_995_000]) {
      const v = view();
      const accounts = v.accounts.map((a) => (a.accKey === 'kbH' ? { ...a, budgetKrw: kbH } : a));
      const { unmount: u } = render(<OpenPoolsCard view={{ ...v, accounts }} />);
      expect(text(q(`${pool('p2')} [data-slot="settlement-pool-l3"]`))).toBe('나눌 수익이 없습니다');
      u();
    }
  });

  it('② p1 정산 1억 → 묶음 값 = 누적 − 1억 · 누적 줄', () => {
    render(<OpenPoolsCard view={view({}, [SETTLE_P1])} />);
    expect(text(q(`${pool('p1')} [data-slot="settlement-pool-value"]`))).toBe('+9억 4,900만');
    expect(text(q(`${pool('p1')} [data-slot="settlement-acc-cum"]`))).toBe('누적 수익 +10억 4,900만 · 이미 정산한 수익 1억');
    expect(q(`${pool('p2')} [data-slot="settlement-acc-cum"]`)).toBeNull();
    // 몫은 정산 전 수익 기준
    expect(text(q(`${pool('p1')} [data-slot="settlement-pool-l3"]`))).toBe('김현중 +4억 7,450만 · 정근형 +4억 7,450만');
  });

  it('③ kyG 미설정 → 「미설정」 · 「—」 · 묶음 값 「—」 · 안내 + 계좌 메뉴 링크 · 정산 이력이 있어도 누적 줄 없음', () => {
    render(<OpenPoolsCard view={view({ kyG: { state: 'unset' } }, [SETTLE_P1])} />);
    const cells = Array.from(q('[data-slot="settlement-acc-row"][data-acc="kyG"]')!.children).map((c) => text(c));
    expect(cells).toEqual(['교보 정근형', '미설정', '2,000만', '—']);
    expect(text(q(`${pool('p1')} [data-slot="settlement-pool-value"]`))).toBe('—');
    const l3 = q(`${pool('p1')} [data-slot="settlement-pool-l3"]`);
    expect(text(l3)).toBe('예수금이 설정되지 않은 계좌가 있어요 계좌 메뉴에서 설정');
    const link = l3!.querySelector('a');
    expect(link!.getAttribute('href')).toBe('/admin/accounts');
    expect(text(link)).toBe('계좌 메뉴에서 설정');
    expect(q(`${pool('p1')} [data-slot="settlement-acc-cum"]`)).toBeNull();
  });

  it('④ kyH · kyG 못 읽음(어제 19:58) → 한 줄로 이어 붙임 · 계산은 마지막 값', () => {
    render(<OpenPoolsCard view={view({ kyH: { state: 'stale', readAt: YDAY_1958 }, kyG: { state: 'stale', readAt: YDAY_1958 } })} />);
    const lines = qa(`${pool('p1')} [data-slot="settlement-acc-stale"]`).map(text);
    expect(lines).toEqual(['교보 김현중 · 교보 정근형 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값이에요']);
    expect(text(q(`${pool('p1')} [data-slot="settlement-pool-value"]`))).toBe('+10억 4,900만');
    // 부제는 가장 최근 읽은 시각
    expect(text(q('[data-slot="settlement-open-pools"]'))).toContain('예수금 읽은 시각 오늘 14:32');
    expect(q(`${pool('p2')} [data-slot="settlement-acc-stale"]`)).toBeNull();
  });

  it('⑤ kbG 서버 간 다름 → 다름 줄(주문 서버 값으로 계산)', () => {
    render(<OpenPoolsCard view={view({ kbG: { mismatch: true } })} />);
    expect(text(q(`${pool('p1')} [data-slot="settlement-acc-mismatch"]`))).toBe(
      'KB 정근형 — 서버마다 예수금이 달라 주문 서버 값으로 계산했어요',
    );
    expect(q(`${pool('p2')} [data-slot="settlement-acc-mismatch"]`)).toBeNull();
  });

  it('⑥ AccountTable mode="past" → 「… 에 읽은 값으로 확정했어요」 · 읽은 시각 줄', () => {
    const v = view({ kyH: { state: 'stale', readAt: YDAY_1958 } });
    render(
      <AccountTable
        rows={poolAccountRows('p1', v.accounts, v.ledger)}
        cum={{ cumKrw: 1_049_000_000, prevKrw: 0 }}
        mode="past"
        readLine="예수금 읽은 시각 11/19 14:32"
        nowIso={NOW}
        compact
      />,
    );
    expect(text(q('[data-slot="settlement-acc-stale"]'))).toBe('교보 김현중 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값으로 확정했어요');
    expect(text(q('[data-slot="settlement-acc-read"]'))).toBe('예수금 읽은 시각 11/19 14:32');
    expect(text(q('[data-slot="settlement-acc-cum"]'))).toBe('누적 수익 +10억 4,900만 · 이미 정산한 수익 0');
    expect(qa('[data-slot="settlement-acc-row"]')).toHaveLength(3);
  });
});
