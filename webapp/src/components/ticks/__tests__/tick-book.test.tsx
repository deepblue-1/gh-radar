import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TAG_CODE, bookAt } from '@gh-radar/shared';

import { buildTickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';

import { TickBook } from '../tick-book';

/**
 * Phase 37 Plan 10 Task 2 — 호가 10단: 매도 10→1 · 매수 1→10 순서 · 「주 | 금액」 전환 시 바 기준 · 바닥 줄 문구 ·
 * 선택 A3 가격 행 표식 · 「호가 기준 seq · Δms」 · 호가 없음.
 */

const s = buildTickSession(tickGridBytes(), { date: D, ex: 'KRX', isin: ISIN });

/** 체결가가 그 시점 10단 안에 있는 A3 rec 하나. */
function a3WithBook(): number {
  for (let j = 0; j < s.a3.n; j++) {
    const r = s.a3.rec[j]!;
    const b6 = s.lastB6[s.exPos[r]!]!;
    const book = bookAt(s.buf, s.index, b6);
    if (book === null) continue;
    const px = s.a3.px[j]!;
    if ([...book.asks, ...book.bids].some((l) => l.px === px)) return r;
  }
  throw new Error('체결가가 10단 안인 A3 없음');
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-slot="tick-book-row"]')];
const widthOf = (row: HTMLElement) => parseFloat(row.querySelector<HTMLElement>('[data-slot="tick-book-bar"]')!.style.width);

describe('TickBook', () => {
  const rec = a3WithBook();
  const book = bookAt(s.buf, s.index, s.lastB6[s.exPos[rec]!]!)!;

  it('20행 — 매도 10→1(높은 가격부터) · 매수 1→10', () => {
    render(<TickBook session={s} rec={rec} unit="qty" onUnit={vi.fn()} />);
    const r = rows();
    expect(r.length).toBe(20);
    expect(r.slice(0, 10).map((x) => x.dataset.step)).toEqual(['10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
    expect(r.slice(10).map((x) => x.dataset.step)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(r.slice(0, 10).every((x) => x.dataset.side === 'ask')).toBe(true);
    expect(Number(r[0]!.dataset.px)).toBe(book.asks[9]!.px);
    expect(Number(r[10]!.dataset.px)).toBe(book.bids[0]!.px);
  });

  it('선택 틱이 A3 면 그 가격 행 하나에 점 + 테두리', () => {
    render(<TickBook session={s} rec={rec} unit="qty" onUnit={vi.fn()} />);
    const hits = rows().filter((x) => x.dataset.hit !== undefined);
    expect(hits.length).toBe(1);
    expect(Number(hits[0]!.dataset.px)).toBe(s.a3.px[s.a3Of[rec]!]);
    expect(document.querySelectorAll('[data-slot="tick-book-hit"]').length).toBe(1);
  });

  it('B6 행을 고르면 체결 표식 없음 · 캡션 「호가 기준 seq N · Δms」', () => {
    const b6Rec = s.exOrder.find((r) => s.index.tag[r] === TAG_CODE.B6)!;
    render(<TickBook session={s} rec={b6Rec} unit="qty" onUnit={vi.fn()} />);
    expect(document.querySelectorAll('[data-slot="tick-book-hit"]').length).toBe(0);
    expect(document.querySelector('[data-slot="tick-book-meta"]')!.textContent).toMatch(/^호가 기준 seq [\d,]+ · 0\.0ms 전$/);
  });

  it('주 → 바 기준은 잔량 최대 · 바닥 줄 「총잔량」(B6 총잔량)', () => {
    render(<TickBook session={s} rec={rec} unit="qty" onUnit={vi.fn()} />);
    const qtys = [...book.asks, ...book.bids].map((l) => l.qty);
    const maxQty = Math.max(...qtys);
    const r = rows();
    const top = r.find((x) => {
      const side = x.dataset.side === 'ask' ? book.asks : book.bids;
      return side[Number(x.dataset.step) - 1]!.qty === maxQty;
    })!;
    expect(widthOf(top)).toBe(100);
    const total = document.querySelector('[data-slot="tick-book-total"]')!;
    expect(total.textContent).toContain('총잔량');
    expect(total.textContent).toContain(book.totalAsk.toLocaleString('ko-KR'));
    expect(screen.getByRole('columnheader', { name: '매도잔량' })).toBeTruthy();
  });

  it('금액 → 바 기준은 금액(잔량 × 가격) 최대 · 바닥 줄 「합산 금액」 · 머리 매도금액', () => {
    render(<TickBook session={s} rec={rec} unit="amount" onUnit={vi.fn()} />);
    const amounts = [...book.asks, ...book.bids].map((l) => l.amount);
    const maxAmt = Math.max(...amounts);
    const r = rows();
    const top = r.find((x) => {
      const side = x.dataset.side === 'ask' ? book.asks : book.bids;
      return side[Number(x.dataset.step) - 1]!.amount === maxAmt;
    })!;
    expect(widthOf(top)).toBe(100);
    expect(document.querySelector('[data-slot="tick-book-total"]')!.textContent).toContain('합산 금액');
    expect(screen.getByRole('columnheader', { name: '매도금액' })).toBeTruthy();
  });

  it('단위 토글 → onUnit', () => {
    const onUnit = vi.fn();
    render(<TickBook session={s} rec={rec} unit="qty" onUnit={onUnit} />);
    expect(screen.getByRole('button', { name: '주' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '금액' }));
    expect(onUnit).toHaveBeenCalledWith('amount');
  });

  it('B6 가 아직 없으면 「호가 없음」', () => {
    render(<TickBook session={s} rec={-1} unit="qty" onUnit={vi.fn()} />);
    expect(screen.getByText('호가 없음')).toBeTruthy();
    expect(rows().length).toBe(0);
  });
});
