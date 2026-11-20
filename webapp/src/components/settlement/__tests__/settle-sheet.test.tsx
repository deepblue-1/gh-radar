import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementLedgerRow,
  type SettlementSettleBody,
  type SettlementSettleRow,
  type SettlementView,
} from '@gh-radar/shared';

/**
 * Phase 44 — 「정산하기」 시트(⑧ · 44-11 T1 · UI-SPEC ⑧ · E8 · D-09 · D-15 · D-16 · D-25 · D-27 · 규칙 3 · 4).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 처음 | 검산 응답 | 「현중 · 근형」 · 라벨 · 「+10억 4,900만」 원 · 표 3줄 · 「오늘 14:32」 · 나누기 5 : 5 두 줄 · 뺄 계좌 줄 · 상자 없음 · 확정 활성 |
 * | 바로 출금 | 김현중 → 정근형 | aria-pressed · 뺄 계좌 줄 · 상자 켜짐 · 미리 보기 한 줄 → 두 줄 |
 * | 쥬니 | 묶음 바꿈 | 선택 지움 · 「−2,800만」 · 이월 문단 · 확정 비활성 · 메모 없음 |
 * | 미설정 | kyG unset | 「—」 · 미설정 문단 · 비활성 |
 * | 나눌 수익 없음 | p1 정산이 다 가져감 · 쥬니 정확히 0 | 「나눌 수익이 없습니다.」 |
 * | 장중 | 평일 14:32 · 밤 20:40 | 「체결 중이라 값이 움직이고 있어요」 · 「체결과 겹치면 어긋날 수 있어요」 / 없음 |
 * | 확정 | H 바로 출금 | onConfirm({ p1, ["H"], "", true, null }) · 확정 중 비활성 · aria-busy · 실패 「정산을 확정하지 못했어요 · X」 |
 * | expectPrev | p1 정산 id 7 · p2 정산 id 12 | 7 |
 * | 다시 읽기 | 열린 채 view 바뀜 | 큰 숫자 · 읽은 시각 바뀜 · 바로 출금 선택 유지 |
 */

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

import { SettleSheet } from '../settle-sheet';

const M = '−';
const NOW = '2026-11-20T05:32:00.000Z'; // KST 11/20(금) 14:32
const LATER = '2026-11-20T05:40:00.000Z'; // KST 14:40
const NIGHT = '2026-11-20T11:40:00.000Z'; // KST 20:40
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

// 검산 시드 9건(open-pools-card.test 와 같다) — p1 정산 전 수익 +10억 4,900만 · p2 −2,800만.
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

const settleRow = (id: number, pool: 'p1' | 'p2', profitKrw: number): SettlementSettleRow => ({
  id,
  pool,
  profitKrw,
  shares: {},
  snapshot: { accounts: [], cumKrw: profitKrw, prevKrw: 0 },
  readAt: PAST_1432,
  memo: '',
  createdBy: 'hyunjoong@example.com',
  createdAt: PAST_1432,
});

type Over = Partial<Pick<SettlementAccountView, 'state' | 'budgetKrw' | 'readAt'>>;
function view(
  over: Partial<Record<SettlementAccKey, Over>> = {},
  settles: SettlementSettleRow[] = [],
  now: string = NOW,
): SettlementView {
  return {
    now,
    accounts: SETTLEMENT_ACCOUNTS.map((a) => {
      const o = over[a.key] ?? {};
      const state = o.state ?? 'known';
      return {
        accKey: a.key,
        label: a.label,
        owner: a.owner,
        pool: a.pool,
        state,
        budgetKrw: state === 'unset' ? null : (o.budgetKrw ?? DEP[a.key]),
        readAt: o.readAt !== undefined ? o.readAt : state === 'unset' ? null : NOW,
        mismatch: false,
      };
    }),
    ledger: SEED,
    settles,
  };
}

// ── DOM 도우미(실패해도 한 줄 메시지) ──
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const title = () => text(q('[data-slot="sheet-title"]'));
const poolPill = (name: string) =>
  qa<HTMLElement>('[role="radiogroup"][aria-label="정산 묶음"] [role="radio"]').find((b) => text(b) === name) ?? null;
const profitLabel = () => text(q('[data-slot="settle-profit-label"]'));
const profitValue = () => q('[data-slot="settle-profit-value"]');
const profitUnit = () => text(q('[data-slot="settle-profit-unit"]'));
const accRows = () => qa('[data-slot="settle-sheet"] [data-slot="settlement-acc-row"]');
const readLine = () => text(q('[data-slot="settle-sheet"] [data-slot="settlement-acc-read"]'));
const market = () => q('[data-slot="settle-market"]');
const splitLabel = () => text(q('[data-slot="settle-split-label"]'));
// 줄 = 왼쪽(점 · 이름 · 비율) | 몫 | 알약 — 칸 사이는 flex 간격이라 textContent 에 공백이 없다.
const splitRows = () =>
  qa('[data-slot="settle-split-row"]').map((e) =>
    [text(e.children[0]), text(q('b', e)), text(q('[data-slot="settle-out"]', e))].join(' | '),
  );
const outBtn = (person: 'H' | 'G' | 'J') =>
  q<HTMLButtonElement>(`[data-slot="settle-split-row"][data-person="${person}"] [data-slot="settle-out"]`);
const outAccounts = () => q('[data-slot="settle-out-accounts"]');
const reflectBox = () => q('[data-slot="settle-sheet"] [data-slot="reflect-box"]');
const sw = () => q('[data-slot="settle-sheet"] [data-slot="reflect-box"] [role="switch"]');
const preview = () =>
  qa('[data-slot="settle-sheet"] [data-slot="reflect-line"]')
    .map((e) => text(e))
    .join(' / ');
const memoInput = () => q<HTMLInputElement>('[data-slot="settle-memo"]');
const blocked = () => q('[data-slot="settle-blocked"]');
const confirmBtn = () => q<HTMLButtonElement>('[data-slot="settle-sheet-confirm"]');
const cancelBtn = () => q<HTMLButtonElement>('[data-slot="settle-sheet-cancel"]');
const confirmError = () => q('[data-slot="settle-sheet-error"]');

function click(el: HTMLElement | null) {
  if (!el) throw new Error('element missing');
  fireEvent.click(el);
}

function open(v: SettlementView = view(), extra: { onConfirm?: (body: SettlementSettleBody) => Promise<void> } = {}) {
  const onConfirm = vi.fn<(body: SettlementSettleBody) => Promise<void>>(extra.onConfirm ?? (() => Promise.resolve()));
  const onClose = vi.fn();
  const utils = render(<SettleSheet open view={v} nowIso={v.now} onClose={onClose} onConfirm={onConfirm} />);
  return { ...utils, onConfirm, onClose };
}

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SettleSheet — 처음 열기(E8 populated)', () => {
  it('검산 응답 → 「현중 · 근형」 · 라벨 · 큰 숫자 · 계좌 표 · 읽은 시각 · 나누기 5 : 5 · 뺄 계좌 줄 · 상자 없음 · 확정 활성', () => {
    at(NIGHT);
    open();
    expect(title()).toBe('정산하기');
    expect(poolPill('현중 · 근형')?.getAttribute('aria-checked')).toBe('true');
    expect(poolPill('쥬니')?.getAttribute('aria-checked')).toBe('false');
    expect(profitLabel()).toBe('정산 전 수익 · 확정을 누른 순간의 예수금으로 정해요');
    expect(text(profitValue())).toBe('+10억 4,900만');
    expect(profitValue()?.className).toContain('text-[var(--up)]');
    expect(profitUnit()).toBe('원');
    expect(accRows().map((r) => r.getAttribute('data-acc'))).toEqual(['kbG', 'kyH', 'kyG']);
    expect(readLine()).toBe('예수금 읽은 시각 오늘 14:32');
    expect(splitLabel()).toBe('나누기 5 : 5 · 지금 뺄 사람만 「바로 출금」');
    expect(splitRows()).toEqual(['김현중 50% | +5억 2,450만 | 바로 출금', '정근형 50% | +5억 2,450만 | 바로 출금']);
    expect(qa('[data-slot="settle-split-row"] [data-slot="person-dot"]')).toHaveLength(2);
    expect(outBtn('H')?.getAttribute('aria-pressed')).toBe('false');
    expect(outAccounts()).toBeNull();
    expect(reflectBox()).toBeNull();
    expect(memoInput()?.maxLength).toBe(100);
    expect(blocked()).toBeNull();
    expect(text(cancelBtn())).toBe('취소');
    expect(text(confirmBtn())).toBe('정산 확정');
    expect(confirmBtn()?.disabled).toBe(false);
    // 기간 줄(「25년 말 ~ 11/19」)이 없다(D-27)
    expect(text(q('[data-slot="settle-sheet"]'))).not.toContain('25년 말');
  });
});

describe('바로 출금 · 뺄 계좌 · 반영 상자(D-09 · D-15 · 규칙 3)', () => {
  it('김현중 → 뺄 계좌 한 사람 · 상자 켜짐 · 미리 보기 한 줄 → 정근형도 → 두 사람 · 두 줄', () => {
    at(NIGHT);
    open();
    click(outBtn('H'));
    expect(outBtn('H')?.getAttribute('aria-pressed')).toBe('true');
    expect(text(outAccounts())).toBe('뺄 계좌 — 김현중 교보 김현중 · 금액은 만원 미만을 버리고 적어요');
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
    expect(preview()).toBe('교보 김현중 예수금 6억 8,400만 → 1억 5,950만');
    click(outBtn('G'));
    expect(text(outAccounts())).toBe('뺄 계좌 — 김현중 교보 김현중 · 정근형 KB 정근형 · 금액은 만원 미만을 버리고 적어요');
    expect(preview()).toBe('KB 정근형 예수금 8억 4,500만 → 3억 2,050만 / 교보 김현중 예수금 6억 8,400만 → 1억 5,950만');
    // 다시 끄면 그 사람만 빠진다
    click(outBtn('H'));
    expect(text(outAccounts())).toBe('뺄 계좌 — 정근형 KB 정근형 · 금액은 만원 미만을 버리고 적어요');
  });

  it('「쥬니」 로 바꾸면 바로 출금 선택이 지워진다 · 다시 「현중 · 근형」 → 꺼진 채', () => {
    at(NIGHT);
    open();
    click(outBtn('H'));
    click(poolPill('쥬니'));
    expect(poolPill('쥬니')?.getAttribute('aria-checked')).toBe('true');
    click(poolPill('현중 · 근형'));
    expect(outBtn('H')?.getAttribute('aria-pressed')).toBe('false');
    expect(outAccounts()).toBeNull();
    expect(reflectBox()).toBeNull();
  });
});

describe('확정할 수 없을 때(E8 empty · 규칙 4 · D-25)', () => {
  it('쥬니 손실 이월 → 「−2,800만」 · 이월 문단 · 확정 비활성 · 메모 · 나누기 없음', () => {
    at(NIGHT);
    open();
    click(poolPill('쥬니'));
    expect(text(profitValue())).toBe(`${M}2,800만`);
    expect(profitValue()?.className).toContain('text-[var(--down)]');
    expect(text(blocked())).toBe('원금 4억까지 2,800만 남았습니다. 회복한 뒤부터 4 : 3 : 3 로 나눕니다.');
    expect(text(q('b', blocked() ?? document.createElement('div')))).toBe('2,800만');
    expect(confirmBtn()?.disabled).toBe(true);
    expect(memoInput()).toBeNull();
    expect(q('[data-slot="settle-split"]')).toBeNull();
    expect(accRows().map((r) => r.getAttribute('data-acc'))).toEqual(['kbH']);
  });

  it('kyG 미설정 → 「—」 · 표 「미설정」 · 미설정 문단 · 비활성', () => {
    at(NIGHT);
    open(view({ kyG: { state: 'unset' } }));
    expect(text(profitValue())).toBe('—');
    expect(text(accRows()[2])).toContain('미설정');
    expect(text(blocked())).toBe('예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.');
    expect(confirmBtn()?.disabled).toBe(true);
    expect(memoInput()).toBeNull();
  });

  it('p1 정산 전 수익 ≤ 0 → 「나눌 수익이 없습니다.」 · 비활성', () => {
    at(NIGHT);
    open(view({}, [settleRow(3, 'p1', 1_049_000_000)]));
    expect(text(profitValue())).toBe('0');
    expect(text(blocked())).toBe('나눌 수익이 없습니다.');
    expect(confirmBtn()?.disabled).toBe(true);
  });

  it('쥬니 정산 전 수익이 정확히 0 → 「원금 … 0만 남았습니다」 대신 「나눌 수익이 없습니다.」', () => {
    at(NIGHT);
    open(view({ kbH: { budgetKrw: 400_000_000 } }));
    click(poolPill('쥬니'));
    expect(text(profitValue())).toBe('0');
    expect(text(blocked())).toBe('나눌 수익이 없습니다.');
    expect(confirmBtn()?.disabled).toBe(true);
  });
});

describe('장중 줄(D-13 · 평일 `08:00` ~ `20:00` KST)', () => {
  it('평일 14:32 → 「체결 중이라 값이 움직이고 있어요」 · 바로 출금을 고르면 상자에 「체결과 겹치면 어긋날 수 있어요」', () => {
    at(NOW);
    open();
    expect(text(market())).toBe('체결 중이라 값이 움직이고 있어요');
    click(outBtn('H'));
    expect(text(reflectBox())).toContain('체결과 겹치면 어긋날 수 있어요');
  });

  it('밤 20:40 → 장중 줄 없음', () => {
    at(NIGHT);
    open();
    expect(market()).toBeNull();
    click(outBtn('H'));
    expect(text(reflectBox())).not.toContain('체결과 겹치면');
  });
});

describe('「정산 확정」(D-16 · Pitfall 5)', () => {
  it('바로 출금 김현중 → onConfirm({ pool, outs, memo, reflect, expectPrev }) 1회 · 확정 중 두 버튼 비활성 · aria-busy', async () => {
    at(NIGHT);
    let resolve!: () => void;
    const { onConfirm } = open(view(), { onConfirm: () => new Promise<void>((r) => (resolve = r)) });
    click(outBtn('H'));
    click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]![0]).toEqual({ pool: 'p1', outs: ['H'], memo: '', reflect: true, expectPrev: null });
    await waitFor(() => expect(confirmBtn()?.disabled).toBe(true));
    expect(confirmBtn()?.getAttribute('aria-busy')).toBe('true');
    expect(cancelBtn()?.disabled).toBe(true);
    await act(async () => resolve());
    await waitFor(() => expect(confirmBtn()?.disabled).toBe(false));
  });

  it('바로 출금 없음 · 메모 → reflect false · memo 그대로', async () => {
    at(NIGHT);
    const { onConfirm } = open();
    fireEvent.change(memoInput()!, { target: { value: '11월 정산' } });
    click(confirmBtn());
    expect(onConfirm.mock.calls[0]![0]).toEqual({ pool: 'p1', outs: [], memo: '11월 정산', reflect: false, expectPrev: null });
    await waitFor(() => expect(confirmBtn()?.disabled).toBe(false));
  });

  it('스위치를 끄면 reflect false', async () => {
    at(NIGHT);
    const { onConfirm } = open();
    click(outBtn('G'));
    click(sw());
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
    click(confirmBtn());
    expect(onConfirm.mock.calls[0]![0]).toEqual({ pool: 'p1', outs: ['G'], memo: '', reflect: false, expectPrev: null });
    await waitFor(() => expect(confirmBtn()?.disabled).toBe(false));
  });

  it('실패(message X) → 시트 유지 · 「정산을 확정하지 못했어요 · X」(role alert)', async () => {
    at(NIGHT);
    open(view(), { onConfirm: () => Promise.reject(new Error('X')) });
    click(confirmBtn());
    await waitFor(() => expect(text(confirmError())).toBe('정산을 확정하지 못했어요 · X'));
    expect(confirmError()?.getAttribute('role')).toBe('alert');
    expect(confirmBtn()?.disabled).toBe(false);
  });

  it('p1 정산 id 7 · p2 정산 id 12 → p1 확정의 expectPrev 7', async () => {
    at(NIGHT);
    const { onConfirm } = open(view({}, [settleRow(12, 'p2', 10_000_000), settleRow(7, 'p1', 100_000_000)]));
    click(confirmBtn());
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ pool: 'p1', expectPrev: 7 });
    await waitFor(() => expect(confirmBtn()?.disabled).toBe(false));
  });
});

describe('열 때 다시 읽기(D-16 · 사용자 확정 2026-11-20)', () => {
  it('열린 채 view 가 새 값으로 바뀌면 큰 숫자 · 읽은 시각이 바뀌고 바로 출금 선택은 그대로', () => {
    at(NIGHT);
    const { rerender, onConfirm, onClose } = open();
    click(outBtn('H'));
    const next = view(
      { kbG: { readAt: LATER }, kyH: { budgetKrw: 700_000_000, readAt: LATER }, kyG: { readAt: LATER } },
      [],
      LATER,
    );
    rerender(<SettleSheet open view={next} nowIso={next.now} onClose={onClose} onConfirm={onConfirm} />);
    expect(text(profitValue())).toBe('+10억 6,500만');
    expect(readLine()).toBe('예수금 읽은 시각 오늘 14:40');
    expect(outBtn('H')?.getAttribute('aria-pressed')).toBe('true');
    expect(preview()).toBe('교보 김현중 예수금 7억 → 1억 6,750만');
  });

  it('닫았다 다시 열면 처음 값(현중 · 근형 · 선택 없음)', () => {
    at(NIGHT);
    const { rerender, onConfirm, onClose } = open();
    click(poolPill('쥬니'));
    rerender(<SettleSheet open={false} view={view()} nowIso={NOW} onClose={onClose} onConfirm={onConfirm} />);
    rerender(<SettleSheet open view={view()} nowIso={NOW} onClose={onClose} onConfirm={onConfirm} />);
    expect(poolPill('현중 · 근형')?.getAttribute('aria-checked')).toBe('true');
  });
});
