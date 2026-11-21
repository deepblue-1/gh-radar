import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react';
import {
  SETTLEMENT_ACCOUNTS,
  poolAccountRows,
  type SettlementAccKey,
  type SettlementCtx,
  type SettlementLedgerRow,
  type SettlementSettleRow,
  type SettlementView,
  type SettlementWriteResponse,
} from '@gh-radar/shared';

/**
 * Phase 44 — 활동 카드(⑥ · 44-09 T2 · UI-SPEC ⑥ · E6 · D-17 · D-19 ~ D-22 · D-26 · D-27).
 *
 * | 경우 | 입력 | 기대 |
 * |---|---|---|
 * | 기본 | 검산 응답 | 세그먼트 「계좌 거래」 · `aria-label="보기"` · 줄 9개 날짜 내림차순(같은 날 나중에 적은 줄 위) |
 * | 꼬리표 | 8/10 · 9/13 4억 | 「계좌 옮김」 · 「법인 용역 · 개인 이체 아님」(ok) / 「근형 → 현중」(warn) · 금액 무색 |
 * | 펼침 | 시드 줄 클릭 | `aria-expanded` · 「배포 때 미리 넣은 내역」 · 「그대로 둠」 · 단추 없음 |
 * | 미반영 | pend kyH failed / below_one | 「예수금 미반영」(err) · 사유별 문장 · 「다시 반영」 |
 * | 다시 반영 | 클릭 | retrySettlementLedger 1회 · aria-busy · 다시 불러오기 · 남으면 · 실패하면 오류 줄 |
 * | 바로 출금 줄 | settleId | 「11/19 정산」 꼬리표 · 펼침 안내 문장 |
 * | 정산 기록 | 0 건 / 2 건 | 빈 문구 / 최신 위 · 줄 글자 · 사람 줄 · 확정한 순간의 계좌 · 옛 정산 안내 |
 * | 이체 | 세그먼트 · ⑤ 링크 | hgOf 줄만 |
 */

const fetchSettlementMock = vi.fn();
const retryMock = vi.fn();
vi.mock('@/lib/admin-api', () => ({
  fetchSettlement: () => fetchSettlementMock(),
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

import { ActivityCard, type ActivitySegment } from '../activity-card';
import { pendLines } from '../ledger-row';
import { SettlementClient } from '../settlement-client';

const NOW = '2026-11-20T05:32:00.000Z'; // KST 11/20 14:32
const AT_1119 = '2026-11-19T05:32:00.000Z'; // KST 11/19 14:32

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

const ACCOUNTS = SETTLEMENT_ACCOUNTS.map((a) => ({
  accKey: a.key,
  label: a.label,
  owner: a.owner,
  pool: a.pool,
  state: 'known' as const,
  budgetKrw: DEP[a.key],
  readAt: NOW,
  mismatch: false,
}));

function ctxOf(ledger: SettlementLedgerRow[] = SEED, settles: SettlementSettleRow[] = []): SettlementCtx {
  return { accounts: ACCOUNTS, ledger, settles };
}

function viewOf(ledger: SettlementLedgerRow[] = SEED, settles: SettlementSettleRow[] = []): SettlementView {
  return { now: NOW, ...ctxOf(ledger, settles) };
}

/** 정산 한 건 — 현중 · 근형 묶음 · 그때 계좌 = 검산 계좌 표. */
function settle(id: number, o: Partial<SettlementSettleRow> = {}): SettlementSettleRow {
  return {
    id,
    pool: 'p1',
    profitKrw: 1_049_000_000,
    shares: { H: 524_500_000, G: 524_500_000 },
    snapshot: { accounts: poolAccountRows('p1', ACCOUNTS, SEED), cumKrw: 1_049_000_000, prevKrw: 0 },
    readAt: AT_1119,
    memo: '',
    createdBy: 'hyunjoong@example.com',
    createdAt: AT_1119,
    ...o,
  };
}

/** 화면 안 상태를 쥔 감싸개 — settlement-client 와 같은 꼴. */
function Harness({
  ctx,
  initial = 'ledger',
  onEdit,
  onDelete,
  onCancelSettle,
}: {
  ctx: SettlementCtx;
  initial?: ActivitySegment;
  onEdit?: (row: SettlementLedgerRow) => void;
  onDelete?: (row: SettlementLedgerRow) => void;
  onCancelSettle?: (s: SettlementSettleRow) => void;
}) {
  const [segment, setSegment] = useState<ActivitySegment>(initial);
  const [openSettle, setOpenSettle] = useState<Set<number>>(new Set());
  const [openLedger, setOpenLedger] = useState<Set<number>>(new Set());
  const flip = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  return (
    <ActivityCard
      ctx={ctx}
      nowIso={NOW}
      segment={segment}
      onSegment={setSegment}
      openSettle={openSettle}
      openLedger={openLedger}
      onToggleSettle={(id) => setOpenSettle((s) => flip(s, id))}
      onToggleLedger={(id) => setOpenLedger((s) => flip(s, id))}
      ledgerHandlers={{ onEdit, onDelete, retryingId: null, retryErrors: {} }}
      onCancelSettle={onCancelSettle}
    />
  );
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const ledgerItem = (id: number) => q(`[data-slot="settlement-ledger-item"][data-id="${id}"]`);
const ledgerIds = () => qa('[data-slot="settlement-ledger-item"]').map((el) => el.getAttribute('data-id')).join(',');
const ledgerButton = (id: number) => q<HTMLButtonElement>('[data-slot="settlement-ledger-row"]', ledgerItem(id) ?? document.createElement('div'));
const tags = (id: number) => qa('[data-slot="settlement-ledger-tag"]', ledgerItem(id) ?? document.createElement('div'));
/** 펼침 메타 줄 「라벨|값」. */
const metas = (root: Element | null) =>
  qa('[data-slot="settlement-meta"]', root ?? document.createElement('div')).map((row) =>
    Array.from(row.children)
      .map((c) => text(c))
      .join('|'),
  );
const segRadio = (name: string) =>
  qa<HTMLButtonElement>('[role="radio"]').find((b) => text(b) === name) ?? null;

beforeEach(() => {
  fetchSettlementMock.mockReset();
  retryMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActivityCard — 세그먼트 · 계좌 거래 줄(44-09 T2)', () => {
  it('정산 화면 → 기본 세그먼트 「계좌 거래」 · 줄 9개 날짜 내림차순(같은 날 나중에 적은 줄 위)', async () => {
    fetchSettlementMock.mockResolvedValue(viewOf());
    render(<SettlementClient />);
    await waitFor(() => expect(q('[data-slot="settlement-activity"]')).not.toBeNull());
    expect(ledgerIds()).toBe('9,8,7,6,5,4,3,2,1');
    expect(qa('[data-slot="settlement-row-date"]').map((d) => text(d)).join(',')).toBe(
      '11/1,9/18,9/13,9/13,9/10,9/10,8/10,25년 말,25년 말',
    );
    expect(segRadio('계좌 거래')?.getAttribute('aria-checked')).toBe('true');
    expect(segRadio('정산 기록')?.getAttribute('aria-checked')).toBe('false');
    expect(segRadio('현중 ↔ 근형 이체')?.getAttribute('aria-checked')).toBe('false');
    expect(q('[data-slot="settlement-activity"] [role="group"]')?.getAttribute('aria-label')).toBe('보기');
    // 「변경 이력」 전환 없음(D-21)
    expect(text(q('[data-slot="settlement-activity"]'))).not.toContain('변경 이력');
    // ② ~ ⑥ 순서
    const order = qa('[data-slot="admin-settlement"] [data-slot^="settlement-"]')
      .map((el) => el.getAttribute('data-slot'))
      .filter((s) =>
        ['settlement-people', 'settlement-open-pools', 'settlement-name-vs', 'settlement-transfer', 'settlement-activity'].includes(s ?? ''),
      );
    expect(order.join(',')).toBe('settlement-people,settlement-open-pools,settlement-name-vs,settlement-transfer,settlement-activity');
  });

  it('꼬리표 — 8/10 「계좌 옮김」 · 「법인 용역 · 개인 이체 아님」(ok) / 9/13 4억 「근형 → 현중」(warn) · 금액 무색', () => {
    render(<Harness ctx={ctxOf()} />);
    expect(tags(3).map((t) => text(t)).join(',')).toBe('계좌 옮김,법인 용역 · 개인 이체 아님');
    expect(tags(3)[1]!.className).toContain('text-[var(--led-armed)]');
    expect(tags(7).map((t) => text(t)).join(',')).toBe('계좌 옮김,근형 → 현중');
    // 면은 공용 warn 틴트(--led-latent 18%) 그대로 · 글자만 정산 전용 진한 주황(quick 261121-gdx · 44-UI-REVIEW 2).
    expect(tags(7)[1]!.className).toContain('text-[var(--settle-warn-fg)]');
    expect(tags(7)[1]!.className).toContain('var(--led-latent)_18%');
    expect(tags(7)[1]!.className).not.toContain('text-[var(--led-latent)]');
    expect(tags(1).map((t) => text(t)).join(',')).toBe('출자,현중 → 근형');
    expect(tags(4).map((t) => text(t)).join(',')).toBe('출자');
    expect(text(q('[data-slot="settlement-ledger-flow"]', ledgerItem(7)!))).toBe('KB 정근형 → 교보 김현중');
    expect(text(q('[data-slot="settlement-ledger-flow"]', ledgerItem(1)!))).toBe('김현중 → KB 정근형');
    const amt = q('[data-slot="settlement-ledger-amt"]', ledgerItem(7)!)!;
    expect(text(amt)).toBe('4억');
    expect(amt.className).not.toContain('--up');
    expect(amt.className).not.toContain('--down');
  });

  it('시드 줄 클릭 → 펼침(aria-expanded) · 「배포 때 미리 넣은 내역」 · 「그대로 둠」 · 단추 없음', () => {
    render(<Harness ctx={ctxOf()} />);
    const btn = ledgerButton(7)!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const sub = q('[data-slot="settlement-ledger-sub"]', ledgerItem(7)!);
    expect(btn.getAttribute('aria-controls')).toBe(sub?.id);
    expect(metas(sub).join(' / ')).toBe('적은 사람|배포 때 미리 넣은 내역 / 예수금|그대로 둠');
    expect(qa('button', sub!).length).toBe(0);
    // 다른 줄도 함께 펼칠 수 있다
    fireEvent.click(ledgerButton(8)!);
    expect(ledgerButton(7)!.getAttribute('aria-expanded')).toBe('true');
    expect(ledgerButton(8)!.getAttribute('aria-expanded')).toBe('true');
    // 다시 누르면 닫힘
    fireEvent.click(ledgerButton(7)!);
    expect(q('[data-slot="settlement-ledger-sub"]', ledgerItem(7)!)).toBeNull();
  });

  it('적은 사람 · 고친 사람 · 반영함 · 고치기 · 지우기 단추(핸들러가 있을 때만)', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const row = ledgerRow(10, {
      txDate: '2026-11-19',
      kind: 'contribute',
      who: 'H',
      toAcc: 'kyH',
      amountKrw: 50_000_000,
      reflect: true,
      seeded: false,
      memo: '추가 출자',
      createdBy: 'hyunjoong@example.com',
      createdAt: AT_1119,
      editedBy: 'geunhyung@example.com',
      editedAt: '2026-11-20T01:00:00.000Z',
    });
    render(<Harness ctx={ctxOf([...SEED, row])} onEdit={onEdit} onDelete={onDelete} />);
    expect(text(q('[data-slot="settlement-ledger-memo"]', ledgerItem(10)!))).toBe('추가 출자');
    fireEvent.click(ledgerButton(10)!);
    const sub = q('[data-slot="settlement-ledger-sub"]', ledgerItem(10)!);
    expect(metas(sub).join(' / ')).toBe(
      '적은 사람|hyunjoong@example.com · 11/19 14:32 / 고친 사람|geunhyung@example.com · 11/20 10:00 / 예수금|반영함',
    );
    const buttons = qa<HTMLButtonElement>('button', sub!);
    expect(buttons.map((b) => text(b)).join(',')).toBe('고치기,지우기');
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it('바로 출금 줄(settleId) → 「11/19 정산」 꼬리표 · 펼침 안내 문장 · 단추 없음', () => {
    const out = ledgerRow(11, {
      txDate: '2026-11-19',
      kind: 'withdraw_profit',
      who: 'H',
      fromAcc: 'kyH',
      amountKrw: 524_500_000,
      settleId: 2,
      reflect: true,
      seeded: false,
      createdBy: 'hyunjoong@example.com',
      createdAt: AT_1119,
    });
    render(<Harness ctx={ctxOf([...SEED, out], [settle(2)])} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(tags(11).map((t) => text(t)).join(',')).toBe('수익 출금,11/19 정산');
    fireEvent.click(ledgerButton(11)!);
    const sub = q('[data-slot="settlement-ledger-sub"]', ledgerItem(11)!);
    expect(text(q('[data-slot="settlement-ledger-actions"]', sub!))).toBe(
      '11/19 정산 때 만든 줄이에요 — 그 정산을 취소하면 함께 사라져요',
    );
    expect(qa('button', sub!).length).toBe(0);
  });
});

describe('예수금 미반영 · 다시 반영(D-26)', () => {
  const pendRow = (pend: SettlementLedgerRow['pend']) =>
    ledgerRow(12, {
      txDate: '2026-11-19',
      kind: 'move',
      fromAcc: 'kbG',
      toAcc: 'kyH',
      via: 'transfer',
      amountKrw: 100_000_000,
      reflect: true,
      seeded: false,
      pend,
      createdBy: 'hyunjoong@example.com',
      createdAt: AT_1119,
    });

  it('pendLines — 사유별 문장(below_one 따로 · 계좌 순서)', () => {
    expect(
      pendLines({ kyH: { deltaKrw: 100_000_000, targetKrw: null, reason: 'failed' } }).join(' / '),
    ).toBe('교보 김현중 미반영 — 매매 서버에 보내지 못했어요');
    expect(
      pendLines({ kyH: { deltaKrw: 100_000_000, targetKrw: 0, reason: 'below_one' } }).join(' / '),
    ).toBe('교보 김현중 미반영 — 예수금이 0 이하가 되어 보내지 않았어요');
    expect(
      pendLines({
        kyG: { deltaKrw: 1, targetKrw: null, reason: 'timeout' },
        kbG: { deltaKrw: -1, targetKrw: null, reason: 'unreachable' },
        kyH: { deltaKrw: 1, targetKrw: 0, reason: 'below_one' },
      }).join(' / '),
    ).toBe('KB 정근형 · 교보 정근형 미반영 — 매매 서버에 보내지 못했어요 / 교보 김현중 미반영 — 예수금이 0 이하가 되어 보내지 않았어요');
  });

  it('pend kyH failed → 「예수금 미반영」(err) 꼬리표 · 펼침 문장 + 「다시 반영」', () => {
    render(<Harness ctx={ctxOf([...SEED, pendRow({ kyH: { deltaKrw: 100_000_000, targetKrw: null, reason: 'failed' } })])} />);
    const t = tags(12);
    expect(t.map((x) => text(x)).join(',')).toBe('계좌 옮김,근형 → 현중,예수금 미반영');
    expect(t[2]!.className).toContain('text-[var(--destructive)]');
    fireEvent.click(ledgerButton(12)!);
    const sub = q('[data-slot="settlement-ledger-sub"]', ledgerItem(12)!);
    expect(metas(sub).at(-1)).toBe('예수금|교보 김현중 미반영 — 매매 서버에 보내지 못했어요');
    // onRetry 가 없으면 링크도 없다(감싸개는 retry 핸들러를 주지 않는다)
    expect(qa('button', sub!).length).toBe(0);
  });

  it('pend below_one → 「… 미반영 — 예수금이 0 이하가 되어 보내지 않았어요」', () => {
    render(<Harness ctx={ctxOf([...SEED, pendRow({ kyH: { deltaKrw: 100_000_000, targetKrw: 0, reason: 'below_one' } })])} />);
    fireEvent.click(ledgerButton(12)!);
    expect(metas(q('[data-slot="settlement-ledger-sub"]', ledgerItem(12)!)).at(-1)).toBe(
      '예수금|교보 김현중 미반영 — 예수금이 0 이하가 되어 보내지 않았어요',
    );
  });

  async function openPendInClient(pend: SettlementLedgerRow['pend']) {
    fetchSettlementMock.mockResolvedValue(viewOf([...SEED, pendRow(pend)]));
    render(<SettlementClient />);
    await waitFor(() => expect(ledgerItem(12)).not.toBeNull());
    fireEvent.click(ledgerButton(12)!);
    const link = qa<HTMLButtonElement>('button', ledgerItem(12)!).find((b) => text(b) === '다시 반영') ?? null;
    expect(text(link)).toBe('다시 반영');
    return link!;
  }

  const FAILED = { kyH: { deltaKrw: 100_000_000, targetKrw: null, reason: 'failed' as const } };

  it('「다시 반영」 → retry 1회 · 보내는 동안 aria-busy · disabled · 다 보내면 다시 불러오기 · 오류 줄 없음', async () => {
    let resolve!: (r: SettlementWriteResponse) => void;
    retryMock.mockReturnValue(new Promise<SettlementWriteResponse>((r) => (resolve = r)));
    const link = await openPendInClient(FAILED);
    fireEvent.click(link);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledWith(12);
    await waitFor(() => expect(link.getAttribute('aria-busy')).toBe('true'));
    expect(link.disabled).toBe(true);
    await act(async () => {
      resolve({ ok: true, pend: {} });
    });
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    expect(q('[data-slot="settlement-retry-error"]')).toBeNull();
  });

  it('응답에 pend 가 남음 → 「다시 반영하지 못했어요 · <message>」 · 다시 불러오기', async () => {
    retryMock.mockResolvedValue({ ok: true, pend: FAILED, message: 'KYOBO119 응답 없음' });
    const link = await openPendInClient(FAILED);
    fireEvent.click(link);
    await waitFor(() =>
      expect(text(q('[data-slot="settlement-retry-error"]'))).toBe('다시 반영하지 못했어요 · KYOBO119 응답 없음'),
    );
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
    // 예수금 줄은 그대로 남는다
    expect(metas(q('[data-slot="settlement-ledger-sub"]', ledgerItem(12)!)).at(-1)).toBe(
      '예수금|교보 김현중 미반영 — 매매 서버에 보내지 못했어요 다시 반영',
    );
  });

  it('요청 실패(throw) → 「다시 반영하지 못했어요 · <message>」', async () => {
    retryMock.mockRejectedValue(new Error('시간 초과'));
    const link = await openPendInClient(FAILED);
    fireEvent.click(link);
    await waitFor(() => expect(text(q('[data-slot="settlement-retry-error"]'))).toBe('다시 반영하지 못했어요 · 시간 초과'));
    await waitFor(() => expect(fetchSettlementMock).toHaveBeenCalledTimes(2));
  });
});

describe('정산 기록 · 현중 ↔ 근형 이체 세그먼트', () => {
  it('정산 0 건 → 「아직 정산한 적이 없습니다」 · 거래 0 건 → 「거래가 없습니다」', () => {
    render(<Harness ctx={ctxOf([], [])} initial="settle" />);
    expect(text(q('[data-slot="settlement-activity-empty"]'))).toBe('아직 정산한 적이 없습니다');
    fireEvent.click(segRadio('계좌 거래')!);
    expect(text(q('[data-slot="settlement-activity-empty"]'))).toBe('거래가 없습니다');
    fireEvent.click(segRadio('현중 ↔ 근형 이체')!);
    expect(text(q('[data-slot="settlement-activity-empty"]'))).toBe('거래가 없습니다');
  });

  it('정산 2건(같은 묶음) → 최신 위 · 줄 글자 · 펼침 사람 줄 · 확정한 순간의 계좌 · 적은 사람 · 옛 정산 안내', () => {
    const out = ledgerRow(11, {
      txDate: '2026-11-19',
      kind: 'withdraw_profit',
      who: 'H',
      fromAcc: 'kyH',
      amountKrw: 524_500_000,
      settleId: 2,
      seeded: false,
    });
    const settles = [
      settle(2, { memo: '11월 정산', snapshot: { accounts: poolAccountRows('p1', ACCOUNTS, SEED), cumKrw: 1_149_000_000, prevKrw: 100_000_000 } }),
      settle(1, { profitKrw: 100_000_000, shares: { H: 50_000_000, G: 50_000_000 }, createdAt: '2026-11-10T05:00:00.000Z', readAt: '2026-11-10T05:00:00.000Z' }),
    ];
    render(<Harness ctx={ctxOf([...SEED, out], settles)} initial="settle" />);
    const items = qa('[data-slot="settlement-settle-item"]');
    expect(items.map((el) => el.getAttribute('data-id')).join(',')).toBe('2,1');
    const head = (i: number) =>
      Array.from(q('[data-slot="settlement-settle-row"]', items[i]!)!.children)
        .map((c) => text(c))
        .filter((s) => s !== '')
        .join('|');
    expect(head(0)).toBe('11/19|현중 · 근형|14:32 예수금으로 확정 · 11월 정산|+10억 4,900만');
    expect(head(1)).toBe('11/10|현중 · 근형|14:00 예수금으로 확정|+1억');

    fireEvent.click(q('[data-slot="settlement-settle-row"]', items[0]!)!);
    expect(q('[data-slot="settlement-settle-row"]', items[0]!)!.getAttribute('aria-expanded')).toBe('true');
    const persons = qa('[data-slot="settlement-settle-person"]', items[0]!).map((row) =>
      Array.from(row.children)
        .map((c) => text(c))
        .join('|'),
    );
    expect(persons.join(' / ')).toBe('김현중 50%|그날 출금 5억 2,450만 / 정근형 50%|계좌에 남겨 둠 5억 2,450만');
    expect(text(items[0]!)).toContain('확정한 순간의 계좌');
    expect(q('[data-slot="settlement-acc-table"]', items[0]!)).not.toBeNull();
    expect(text(q('[data-slot="settlement-acc-read"]', items[0]!))).toBe('예수금 읽은 시각 11/19 14:32');
    expect(text(q('[data-slot="settlement-acc-cum"]', items[0]!))).toBe('누적 수익 +11억 4,900만 · 이미 정산한 수익 1억');
    expect(metas(items[0]!).join(' / ')).toBe('적은 사람|hyunjoong@example.com · 11/19 14:32');
    // 가장 최근 정산 — 취소 핸들러(44-11)가 없으면 단추도 안내도 없다
    expect(text(q('[data-slot="settlement-settle-actions"]', items[0]!))).toBe('');

    fireEvent.click(q('[data-slot="settlement-settle-row"]', items[1]!)!);
    expect(text(q('[data-slot="settlement-settle-actions"]', items[1]!))).toBe('더 최근 정산부터 차례로 취소할 수 있어요');
    expect(q('[data-slot="settlement-acc-cum"]', items[1]!)).toBeNull();
  });

  it('취소 핸들러가 있으면 묶음별 가장 최근 정산에만 「정산 취소」', () => {
    const onCancel = vi.fn();
    const settles = [settle(3, { pool: 'p2', shares: { J: 0, H: 0, G: 0 }, profitKrw: 0 }), settle(2), settle(1)];
    render(<Harness ctx={ctxOf(SEED, settles)} initial="settle" onCancelSettle={onCancel} />);
    for (const id of [3, 2, 1]) fireEvent.click(q(`[data-slot="settlement-settle-item"][data-id="${id}"] [data-slot="settlement-settle-row"]`)!);
    const actions = (id: number) => q(`[data-slot="settlement-settle-item"][data-id="${id}"] [data-slot="settlement-settle-actions"]`);
    expect(text(actions(3))).toBe('정산 취소');
    expect(text(actions(2))).toBe('정산 취소');
    expect(text(actions(1))).toBe('더 최근 정산부터 차례로 취소할 수 있어요');
    fireEvent.click(q<HTMLButtonElement>('button', actions(2)!)!);
    expect(onCancel).toHaveBeenCalledWith(settles[1]);
  });

  it('「현중 ↔ 근형 이체」 → hgOf 줄만(법인 용역 포함)', () => {
    render(<Harness ctx={ctxOf()} />);
    fireEvent.click(segRadio('현중 ↔ 근형 이체')!);
    expect(ledgerIds()).toBe('8,7,6,5,3,1');
    expect(segRadio('현중 ↔ 근형 이체')?.getAttribute('aria-checked')).toBe('true');
  });

  it('⑤ 「이체 내역 보기」 → 활동 카드 세그먼트가 「현중 ↔ 근형 이체」 로', async () => {
    fetchSettlementMock.mockResolvedValue(viewOf());
    render(<SettlementClient />);
    await waitFor(() => expect(q('[data-slot="settlement-activity"]')).not.toBeNull());
    const link = qa<HTMLButtonElement>('[data-slot="settlement-transfer"] button').find((b) => text(b) === '이체 내역 보기');
    fireEvent.click(link!);
    expect(segRadio('현중 ↔ 근형 이체')?.getAttribute('aria-checked')).toBe('true');
    expect(ledgerIds()).toBe('8,7,6,5,3,1');
  });
});
