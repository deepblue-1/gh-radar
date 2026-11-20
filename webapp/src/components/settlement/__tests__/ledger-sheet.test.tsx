import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementLedgerBody,
  type SettlementLedgerRow,
} from '@gh-radar/shared';

/**
 * Phase 44 — 「거래 기록」 · 「거래 고치기」 시트(⑦ · 44-10 T1 · UI-SPEC ⑦ · E7 · D-05 · D-07 ~ D-13 · D-19 · D-23 · D-27 · D-29).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 처음 | 새로 열기 | 「거래 기록」 · 「수익 출금」 · 계좌 · 사람 안 고름 · 「저장」 비활성 · 날짜 오늘 · max 오늘 · 금액 placeholder 「0」 · 미리 보기 없음 · 스위치 켜짐 |
 * | 칸 순서 | 종류 넷 | 무슨 거래 → 계좌 · 사람 → 금액 → 날짜 → 메모(D-27) · 같은 이름 칸 이어받음 |
 * | 날짜 | 어제 → 오늘 | 스위치 꺼짐 「예수금은 그대로 둬요」 → 켜짐(D-11) |
 * | 금액 | 12345 · 8자리 | 「12,345」 · 무시 · 바디 123,450,000 원(D-09) |
 * | D-29 | 출자 + KB 정근형 | 「심쥬니」 aria-disabled · 클릭 무시 · 방향키 건너뜀 · 조합이 바뀌면 사람 비움 |
 * | 검증 | 빈 금액 · 같은 계좌 · 빈 날짜 · 미래 날짜 | 칸 aria-invalid + 오류 줄(alert) · onSave 0 · 그 칸을 고치면 사라짐 |
 * | 미리 보기 | 수익 출금 KB 정근형 1억 | 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」 |
 * | 고치기 | 옛 줄 1억 · reflect | 「거래 고치기」 · 값 채움 · 켜짐 · 5,000만 → 「… → 8억 9,500만」(D-23) |
 * | 저장 중 · 실패 | onSave 대기 · 거부 | 두 버튼 비활성 · aria-busy · readOnly / 「저장하지 못했어요 · X」 |
 */

// 실패 메시지에 DOM 덤프를 붙이지 않는다 — 한 줄 메시지라 TAP 보고(RED 증거)가 깨지지 않는다.
configure({
  getElementError: (message) => {
    const e = new Error(message ?? '');
    e.name = 'TestingLibraryElementError';
    return e;
  },
});

import { LEDGER_SHEET_TEXT, LedgerSheet, ledgerDraftToBody, type LedgerDraft } from '../ledger-sheet';

const NOW = '2026-11-20T05:32:00.000Z'; // KST 11/20 14:32
const TODAY = '2026-11-20';
const YESTERDAY = '2026-11-19';

const DEP: Record<SettlementAccKey, number> = {
  kbG: 845_000_000,
  kyH: 684_000_000,
  kyG: 20_000_000,
  kbH: 372_000_000,
};

const ACCOUNTS: SettlementAccountView[] = SETTLEMENT_ACCOUNTS.map((a) => ({
  accKey: a.key,
  label: a.label,
  owner: a.owner,
  pool: a.pool,
  state: 'known',
  budgetKrw: DEP[a.key],
  readAt: NOW,
  mismatch: false,
}));

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
  seeded: false,
  createdBy: 'hyunjoong@example.com',
  createdAt: NOW,
  editedBy: null,
  editedAt: null,
  ...r,
});

// ── DOM 도우미(실패해도 한 줄 메시지) ──
const group = (label: string) =>
  document.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${label}"]`);
const pills = (label: string) => Array.from(group(label)?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
const pill = (label: string, name: string) => pills(label).find((b) => b.textContent === name) ?? null;
const checked = (label: string) =>
  pills(label)
    .filter((b) => b.getAttribute('aria-checked') === 'true')
    .map((b) => b.textContent)
    .join(',');
const fieldLabels = () =>
  Array.from(document.querySelectorAll('[data-slot="ledger-field-label"]'))
    .map((e) => e.textContent)
    .join('|');
const title = () => document.querySelector('[data-slot="sheet-title"]')?.textContent ?? '';
const amount = () => document.querySelector<HTMLInputElement>('[data-slot="ledger-amount"]');
const dateInput = () => document.querySelector<HTMLInputElement>('[data-slot="ledger-date"]');
const memoInput = () => document.querySelector<HTMLInputElement>('[data-slot="ledger-memo"]');
const saveBtn = () => document.querySelector<HTMLButtonElement>('[data-slot="ledger-save"]');
const cancelBtn = () => document.querySelector<HTMLButtonElement>('[data-slot="ledger-cancel"]');
const sw = () => document.querySelector<HTMLElement>('[data-slot="reflect-box"] [role="switch"]');
const reflectText = () => document.querySelector('[data-slot="reflect-box"]')?.textContent ?? '';
const preview = () =>
  Array.from(document.querySelectorAll('[data-slot="reflect-line"]'))
    .map((e) => e.textContent)
    .join(' / ');
const errorOf = (field: 'amount' | 'date') => document.querySelector<HTMLElement>(`[data-slot="ledger-error-${field}"]`);
const saveError = () => document.querySelector<HTMLElement>('[data-slot="ledger-save-error"]');

function click(el: HTMLElement | null) {
  if (!el) throw new Error('element missing');
  fireEvent.click(el);
}
function type(el: HTMLInputElement | null, value: string) {
  if (!el) throw new Error('input missing');
  fireEvent.change(el, { target: { value } });
}

function open(props: Partial<Parameters<typeof LedgerSheet>[0]> = {}) {
  const onSave = vi.fn<(body: SettlementLedgerBody) => Promise<void>>(() => Promise.resolve());
  const onClose = vi.fn();
  const utils = render(
    <LedgerSheet
      open
      mode="new"
      row={null}
      accounts={ACCOUNTS}
      nowIso={NOW}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { ...utils, onSave: (props.onSave as typeof onSave | undefined) ?? onSave, onClose };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LedgerSheet — 처음 열기(E7 empty)', () => {
  it('제목 「거래 기록」 · 「수익 출금」 · 계좌 · 사람 안 고름 · 「저장」 비활성 · 날짜 오늘 · 미리 보기 없음 · 스위치 켜짐', () => {
    open();
    expect(title()).toBe('거래 기록');
    expect(checked('무슨 거래')).toBe('수익 출금');
    expect(pills('무슨 거래').map((b) => b.textContent).join(',')).toBe('수익 출금,원금 회수,출자,계좌 옮김');
    expect(checked('뺀 계좌')).toBe('');
    expect(checked('받는 사람')).toBe('');
    expect(saveBtn()?.disabled).toBe(true);
    expect(dateInput()?.value).toBe(TODAY);
    expect(dateInput()?.getAttribute('max')).toBe(TODAY);
    expect(amount()?.value).toBe('');
    expect(amount()?.getAttribute('placeholder')).toBe('0');
    expect(amount()?.getAttribute('inputmode')).toBe('numeric');
    expect(memoInput()?.getAttribute('maxlength')).toBe('100');
    expect(preview()).toBe('');
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-slot="ledger-sheet"]')?.textContent).toContain('만원');
  });
});

describe('LedgerSheet — 칸 순서 · 종류별 칸(D-27 · D-05 · D-07)', () => {
  it('수익 출금 · 원금 회수 → 뺀 계좌 · 받는 사람 / 출자 → 넣은 사람 · 받은 계좌 / 계좌 옮김 → 보낸 · 받은 · 어떻게 옮겼나(계좌이체 미리 고름)', () => {
    open();
    expect(fieldLabels()).toBe('무슨 거래|뺀 계좌|받는 사람|금액|날짜|메모');
    click(pill('무슨 거래', '원금 회수'));
    expect(fieldLabels()).toBe('무슨 거래|뺀 계좌|받는 사람|금액|날짜|메모');
    click(pill('무슨 거래', '출자'));
    expect(fieldLabels()).toBe('무슨 거래|넣은 사람|받은 계좌|금액|날짜|메모');
    click(pill('무슨 거래', '계좌 옮김'));
    expect(fieldLabels()).toBe('무슨 거래|보낸 계좌|받은 계좌|어떻게 옮겼나|금액|날짜|메모');
    expect(checked('어떻게 옮겼나')).toBe('계좌이체');
    expect(pills('어떻게 옮겼나').map((b) => b.textContent).join(',')).toBe('계좌이체,법인 용역');
    expect(pills('보낸 계좌').map((b) => b.textContent).join(',')).toBe('KB 정근형,교보 김현중,교보 정근형,KB 김현중');
    // 손익을 손으로 더하는 칸 · 공동 비용 종류가 없다
    expect(document.querySelector('[data-slot="ledger-sheet"]')?.textContent).not.toContain('공동 비용');
  });

  it('종류를 바꿔도 같은 이름 칸 값 이어받음 — 뺀 = 보낸 계좌 · 받은 계좌 · 사람', () => {
    open();
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '김현중'));
    click(pill('무슨 거래', '계좌 옮김'));
    expect(checked('보낸 계좌')).toBe('KB 정근형');
    click(pill('받은 계좌', '교보 김현중'));
    click(pill('무슨 거래', '출자'));
    expect(checked('넣은 사람')).toBe('김현중');
    expect(checked('받은 계좌')).toBe('교보 김현중');
    click(pill('무슨 거래', '수익 출금'));
    expect(checked('뺀 계좌')).toBe('KB 정근형');
    expect(checked('받는 사람')).toBe('김현중');
  });
});

describe('LedgerSheet — 날짜 · 스위치 기본값(D-11 · D-12)', () => {
  it('날짜를 어제로 → 꺼짐 「예수금은 그대로 둬요」 · 다시 오늘 → 켜짐', () => {
    open();
    type(dateInput(), YESTERDAY);
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
    expect(reflectText()).toContain('예수금은 그대로 둬요');
    type(dateInput(), TODAY);
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
  });

  it('스위치를 직접 끈 뒤에도 날짜를 바꾸면 날짜 규칙이 다시 적용된다', () => {
    open();
    click(sw());
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
    type(dateInput(), YESTERDAY);
    type(dateInput(), TODAY);
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('LedgerSheet — 금액(D-09)', () => {
  it('「12345」 → 「12,345」 · 8자리째 무시 · 저장 바디 amountKrw 123,450,000', async () => {
    const { onSave } = open();
    type(amount(), '12345');
    expect(amount()?.value).toBe('12,345');
    type(amount(), '1234567');
    expect(amount()?.value).toBe('1,234,567');
    type(amount(), '1,234,5678');
    expect(amount()?.value).toBe('1,234,567');
    type(amount(), '12,345');
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const body = onSave.mock.calls[0]![0];
    expect(body.amountKrw).toBe(123_450_000);
    expect(body).toEqual({
      txDate: TODAY,
      kind: 'withdraw_profit',
      who: 'G',
      fromAcc: 'kbG',
      toAcc: null,
      via: null,
      amountKrw: 123_450_000,
      memo: '',
      reflect: true,
    });
  });
});

describe('ledgerDraftToBody — 종류에 맞지 않는 칸은 null', () => {
  const draft = (d: Partial<LedgerDraft>): LedgerDraft => ({
    kind: 'withdraw_profit',
    fromAcc: 'kbG',
    toAcc: 'kyH',
    who: 'H',
    via: 'corp_service',
    amountManwon: '400',
    txDate: TODAY,
    memo: '메모',
    ...d,
  });

  it('계좌 옮김 → who null · via 유지 / 출자 → fromAcc · via null / 수익 출금 → toAcc · via null', () => {
    expect(JSON.stringify(ledgerDraftToBody(draft({ kind: 'move' }), false))).toBe(
      JSON.stringify({ txDate: TODAY, kind: 'move', who: null, fromAcc: 'kbG', toAcc: 'kyH', via: 'corp_service', amountKrw: 4_000_000, memo: '메모', reflect: false }),
    );
    expect(ledgerDraftToBody(draft({ kind: 'contribute' }), true)).toEqual({
      txDate: TODAY,
      kind: 'contribute',
      who: 'H',
      fromAcc: null,
      toAcc: 'kyH',
      via: null,
      amountKrw: 4_000_000,
      memo: '메모',
      reflect: true,
    });
    expect(ledgerDraftToBody(draft({ kind: 'withdraw_principal' }), true)).toEqual({
      txDate: TODAY,
      kind: 'withdraw_principal',
      who: 'H',
      fromAcc: 'kbG',
      toAcc: null,
      via: null,
      amountKrw: 4_000_000,
      memo: '메모',
      reflect: true,
    });
  });
});

describe('LedgerSheet — 사람-묶음 막기(D-29)', () => {
  it('출자 + KB 정근형 → 심쥬니 aria-disabled · 클릭 무시 / KB 김현중 → 고를 수 있음 / 교보 김현중 으로 바꾸면 사람이 비고 저장 비활성', () => {
    open();
    click(pill('무슨 거래', '출자'));
    click(pill('받은 계좌', 'KB 정근형'));
    expect(pill('넣은 사람', '심쥬니')?.getAttribute('aria-disabled') ?? 'none').toBe('true');
    click(pill('넣은 사람', '심쥬니'));
    expect(checked('넣은 사람')).toBe('');
    expect(saveBtn()?.disabled).toBe(true);

    click(pill('받은 계좌', 'KB 김현중'));
    expect(pill('넣은 사람', '심쥬니')?.getAttribute('aria-disabled') ?? 'none').toBe('none');
    click(pill('넣은 사람', '심쥬니'));
    expect(checked('넣은 사람')).toBe('심쥬니');
    expect(saveBtn()?.disabled).toBe(false);

    click(pill('받은 계좌', '교보 김현중'));
    expect(checked('넣은 사람')).toBe('');
    expect(saveBtn()?.disabled).toBe(true);
  });

  it('원금 회수 → 뺀 계좌 기준으로 막는다 · 수익 출금은 막지 않는다', () => {
    open();
    click(pill('뺀 계좌', '교보 정근형'));
    click(pill('받는 사람', '심쥬니'));
    expect(checked('받는 사람')).toBe('심쥬니');
    click(pill('무슨 거래', '원금 회수'));
    expect(checked('받는 사람')).toBe('');
    expect(pill('받는 사람', '심쥬니')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('방향키 이동은 막힌 심쥬니를 건너뛴다', () => {
    open();
    click(pill('무슨 거래', '출자'));
    click(pill('받은 계좌', 'KB 정근형'));
    click(pill('넣은 사람', '정근형'));
    const g = pill('넣은 사람', '정근형')!;
    g.focus();
    fireEvent.keyDown(g, { key: 'ArrowRight' });
    expect(checked('넣은 사람')).toBe('김현중');
    expect(document.activeElement?.textContent).toBe('김현중');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(checked('넣은 사람')).toBe('정근형');
  });
});

describe('LedgerSheet — 검증 오류 줄(E7 error)', () => {
  it('빈 금액 → 「금액을 넣어 주세요」(alert) · aria-invalid · onSave 0 · 금액을 고치면 사라짐', () => {
    const { onSave } = open();
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    expect(saveBtn()?.disabled).toBe(false);
    click(saveBtn());
    expect(errorOf('amount')?.textContent ?? '').toBe('금액을 넣어 주세요');
    expect(errorOf('amount')?.getAttribute('role')).toBe('alert');
    expect(amount()?.getAttribute('aria-invalid')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();
    type(amount(), '100');
    expect(errorOf('amount')).toBeNull();
    expect(amount()?.getAttribute('aria-invalid') ?? 'false').toBe('false');
  });

  it('금액 0 도 「금액을 넣어 주세요」', () => {
    const { onSave } = open();
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    type(amount(), '0');
    click(saveBtn());
    expect(errorOf('amount')?.textContent ?? '').toBe('금액을 넣어 주세요');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('계좌 옮김 보낸 = 받은 → 「보낸 계좌와 받은 계좌가 같아요」 · 받은 계좌를 바꾸면 사라짐', () => {
    const { onSave } = open();
    click(pill('무슨 거래', '계좌 옮김'));
    click(pill('보낸 계좌', 'KB 정근형'));
    click(pill('받은 계좌', 'KB 정근형'));
    type(amount(), '100');
    click(saveBtn());
    expect(errorOf('amount')?.textContent ?? '').toBe('보낸 계좌와 받은 계좌가 같아요');
    expect(amount()?.getAttribute('aria-invalid')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();
    click(pill('받은 계좌', '교보 김현중'));
    expect(errorOf('amount')).toBeNull();
  });

  it('날짜 빈 칸 → 「날짜를 골라 주세요」 · 미래 날짜 → 「미래 날짜는 적을 수 없어요」 · 날짜를 고치면 사라짐 · 금액 오류는 그대로', () => {
    const { onSave } = open();
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    type(dateInput(), '');
    click(saveBtn());
    expect(errorOf('date')?.textContent ?? '').toBe('날짜를 골라 주세요');
    expect(dateInput()?.getAttribute('aria-invalid')).toBe('true');
    expect(errorOf('amount')?.textContent ?? '').toBe('금액을 넣어 주세요');
    type(dateInput(), '2026-11-21');
    expect(errorOf('date')).toBeNull();
    expect(errorOf('amount')?.textContent ?? '').toBe('금액을 넣어 주세요');
    type(amount(), '100');
    click(saveBtn());
    expect(errorOf('date')?.textContent ?? '').toBe('미래 날짜는 적을 수 없어요');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('LedgerSheet — 미리 보기(D-10 · D-13)', () => {
  it('켜짐 · 수익 출금 KB 정근형 1억 → 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」', () => {
    open();
    type(amount(), '10000');
    expect(preview()).toBe('');
    click(pill('뺀 계좌', 'KB 정근형'));
    expect(preview()).toBe('');
    click(pill('받는 사람', '김현중'));
    expect(preview()).toBe('KB 정근형 예수금 8억 4,500만 → 7억 4,500만');
  });

  it('계좌 옮김 → 두 줄(보낸 − · 받은 +)', () => {
    open();
    click(pill('무슨 거래', '계좌 옮김'));
    click(pill('보낸 계좌', 'KB 정근형'));
    click(pill('받은 계좌', '교보 김현중'));
    type(amount(), '40000');
    expect(preview()).toBe('KB 정근형 예수금 8억 4,500만 → 4억 4,500만 / 교보 김현중 예수금 6억 8,400만 → 10억 8,400만');
  });
});

describe('LedgerSheet — 고치기(D-19 · D-23)', () => {
  const old = ledgerRow(31, {
    txDate: '2026-11-10',
    kind: 'withdraw_profit',
    fromAcc: 'kbG',
    who: 'G',
    amountKrw: 100_000_000,
    memo: '11월 출금',
    reflect: true,
  });

  it('옛 줄 reflect → 「거래 고치기」 · 값 채움 · 지난 날짜여도 켜짐 · 5,000만 → 옛 값 되돌림 + 새 값 한 벌', () => {
    open({ mode: 'edit', row: old });
    expect(title()).toBe('거래 고치기');
    expect(checked('무슨 거래')).toBe('수익 출금');
    expect(checked('뺀 계좌')).toBe('KB 정근형');
    expect(checked('받는 사람')).toBe('정근형');
    expect(amount()?.value).toBe('10,000');
    expect(dateInput()?.value).toBe('2026-11-10');
    expect(memoInput()?.value).toBe('11월 출금');
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
    expect(preview()).toBe('');
    type(amount(), '5000');
    expect(preview()).toBe('KB 정근형 예수금 8억 4,500만 → 8억 9,500만');
    // 반영했던 거래는 날짜를 바꿔도 켜짐(목업 · D-23)
    type(dateInput(), '2026-11-09');
    expect(sw()?.getAttribute('aria-checked')).toBe('true');
  });

  it('옛 줄 reflect false · 지난 날짜 → 꺼짐', () => {
    open({ mode: 'edit', row: { ...old, reflect: false } });
    expect(sw()?.getAttribute('aria-checked')).toBe('false');
  });

  it('고치기 저장 → 바디는 고친 값', async () => {
    const { onSave } = open({ mode: 'edit', row: old });
    type(amount(), '5000');
    click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toEqual({
      txDate: '2026-11-10',
      kind: 'withdraw_profit',
      who: 'G',
      fromAcc: 'kbG',
      toAcc: null,
      via: null,
      amountKrw: 50_000_000,
      memo: '11월 출금',
      reflect: true,
    });
  });
});

describe('LedgerSheet — 저장 중 · 실패(E7 loading · error)', () => {
  it('저장 중 → 두 버튼 비활성 · 「저장」 aria-busy · 입력 readOnly', async () => {
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    open({ onSave });
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    type(amount(), '100');
    click(saveBtn());
    expect(saveBtn()?.getAttribute('aria-busy')).toBe('true');
    expect(saveBtn()?.disabled).toBe(true);
    expect(cancelBtn()?.disabled).toBe(true);
    expect(amount()?.readOnly).toBe(true);
    expect(dateInput()?.readOnly).toBe(true);
    expect(memoInput()?.readOnly).toBe(true);
    await act(async () => resolve());
  });

  it('onSave 실패(message X) → 시트 유지 · 「저장하지 못했어요 · X」(alert)', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('X')));
    const { onClose } = open({ onSave });
    click(pill('뺀 계좌', 'KB 정근형'));
    click(pill('받는 사람', '정근형'));
    type(amount(), '100');
    click(saveBtn());
    await waitFor(() => expect(saveError()?.textContent ?? '').toBe('저장하지 못했어요 · X'));
    expect(saveError()?.getAttribute('role')).toBe('alert');
    expect(title()).toBe('거래 기록');
    expect(saveBtn()?.disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('「취소」 → onClose', () => {
    const { onClose } = open();
    click(cancelBtn());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('문구 정본 — LEDGER_SHEET_TEXT', () => {
    expect(LEDGER_SHEET_TEXT.titleNew).toBe('거래 기록');
    expect(LEDGER_SHEET_TEXT.titleEdit).toBe('거래 고치기');
    expect(LEDGER_SHEET_TEXT.saveFailed).toBe('저장하지 못했어요');
  });
});
