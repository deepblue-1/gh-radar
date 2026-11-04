import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TAG_CODE, bookAt } from '@gh-radar/shared';

import { fmtSignedAmountC } from '@/lib/ticks/tick-format';
import { buildTickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';

import { TickBook, bookSideDelta } from '../tick-book';

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

  it('가격 칸 = 기준가 대비 방향색 + 등락률(트레이딩 호가와 같은 ladderPctText) · 기준가 모르면 빈칸 · --fg', () => {
    const base = s.basePx!;
    expect(base).toBeGreaterThan(0);
    render(<TickBook session={s} rec={rec} unit="qty" onUnit={vi.fn()} />);
    for (const r of rows()) {
      const px = Number(r.dataset.px);
      if (!(px > 0)) continue;
      const pct = r.querySelector<HTMLElement>('[data-slot="tick-book-pct"]')!.textContent;
      expect(pct).toBe((((px - base) / base) * 100).toFixed(1));
      const tone = r.querySelector<HTMLElement>('[data-slot="tick-book-px"]')!.className;
      expect(tone).toContain(px > base ? 'var(--up)' : px < base ? 'var(--down)' : 'var(--flat)');
    }
  });

  it('기준가가 없으면 등락률 빈칸 · 가격 --fg', () => {
    render(<TickBook session={{ ...s, basePx: null }} rec={rec} unit="qty" onUnit={vi.fn()} />);
    const r = rows()[0]!;
    expect(r.querySelector('[data-slot="tick-book-pct"]')!.textContent).toBe('');
    expect(r.querySelector<HTMLElement>('[data-slot="tick-book-px"]')!.className).toContain('var(--fg)');
  });

  it('증감 열 — 같은 보드 직전 B6 대비 같은 가격 잔량 증감 · 0/모름은 빈칸 · 금액 = 증감 × 가격 · 머리 「증감」 2개', () => {
    // 직전 B6 가 있고 잔량이 바뀐 단이 있는 B6 를 고른다.
    const b6s = s.exOrder.filter((r) => s.index.tag[r] === TAG_CODE.B6 && s.index.ok[r] === 1 && s.duplicates[r] !== 1);
    let cur = -1;
    let prevRec = -1;
    for (let i = 1; i < b6s.length; i++) {
      const a = bookAt(s.buf, s.index, b6s[i - 1]!)!;
      const b = bookAt(s.buf, s.index, b6s[i]!)!;
      if (a.board === b.board && b.asks.some((l, k) => l.px === a.asks[k]!.px && l.qty !== a.asks[k]!.qty)) {
        cur = b6s[i]!;
        prevRec = b6s[i - 1]!;
        break;
      }
    }
    expect(cur).toBeGreaterThanOrEqual(0);
    const now = bookAt(s.buf, s.index, cur)!;
    const prev = bookAt(s.buf, s.index, prevRec)!;
    const want = bookSideDelta(now.asks, prev.asks, 'ask');
    expect(want.some((d) => d !== null && d !== 0)).toBe(true);

    const { unmount } = render(<TickBook session={s} rec={cur} unit="qty" onUnit={vi.fn()} />);
    expect(screen.getAllByRole('columnheader', { name: '증감' }).length).toBe(2);
    for (const r of rows().filter((x) => x.dataset.side === 'ask')) {
      const k = Number(r.dataset.step) - 1;
      const cell = r.querySelector<HTMLElement>('[data-slot="tick-book-delta"]')!;
      const d = want[k];
      if (d === null || d === 0) {
        expect(cell.textContent).toBe('');
      } else {
        expect(cell.textContent).toBe(`${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('ko-KR')}`);
        expect(cell.className).toContain(d > 0 ? 'var(--up)' : 'var(--down)');
      }
    }
    unmount();

    render(<TickBook session={s} rec={cur} unit="amount" onUnit={vi.fn()} />);
    const k = want.findIndex((d) => d !== null && d !== 0);
    const row = rows().find((x) => x.dataset.side === 'ask' && Number(x.dataset.step) === k + 1)!;
    const amt = want[k]! * now.asks[k]!.px;
    expect(row.querySelector('[data-slot="tick-book-delta"]')!.textContent).toBe(fmtSignedAmountC(amt));
  });

  it('bookSideDelta — 같은 가격끼리 · 직전 범위 안 새 가격은 0 에서 · 범위 밖 새 단은 null · 직전 없음 null', () => {
    const lv = (px: number, qty: number) => ({ px, qty, amount: px * qty });
    const full = (start: number, step: number) => Array.from({ length: 10 }, (_, i) => lv(start + i * step, 100));
    // 매도: 가격이 한 칸 내려와(9,990 새로 · 10,090 빠짐) 단 번호가 밀린 경우
    const prevAsk = full(10000, 10);
    const curAsk = [lv(9990, 50), ...full(10000, 10).slice(0, 9)];
    curAsk[1] = lv(10000, 130);
    expect(bookSideDelta(curAsk, prevAsk, 'ask')).toEqual([50, 30, 0, 0, 0, 0, 0, 0, 0, 0]);
    // 매도: 위로 새 단(직전 10단 밖) → null
    const upAsk = [...full(10010, 10)];
    expect(bookSideDelta(upAsk, prevAsk, 'ask').at(-1)).toBeNull();
    // 매수: 아래로 새 단 → null · 위쪽 새 가격(범위 안) → 0 에서
    const prevBid = full(9990, -10);
    const curBid = [lv(10000, 40), ...full(9990, -10).slice(0, 9)];
    expect(bookSideDelta(curBid, prevBid, 'bid')[0]).toBe(40);
    expect(bookSideDelta(full(9980, -10), prevBid, 'bid').at(-1)).toBeNull();
    // 직전 10단이 다 차지 않았으면 그 밖도 0 에서
    expect(bookSideDelta([lv(10000, 3), lv(20000, 7)], [lv(10000, 1), lv(0, 0)], 'ask')).toEqual([2, 7]);
    expect(bookSideDelta(curAsk, null, 'ask').every((d) => d === null)).toBe(true);
  });

  it('B6 가 아직 없으면 「호가 없음」', () => {
    render(<TickBook session={s} rec={-1} unit="qty" onUnit={vi.fn()} />);
    expect(screen.getByText('호가 없음')).toBeTruthy();
    expect(rows().length).toBe(0);
  });
});
