'use client';

import { useMemo, type ReactNode } from 'react';

import { bookAmountOf, bookAt, bookLagMs, TAG_CODE, type BookLevel } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { fmtAmountC, fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import { cn } from '@/lib/utils';

/**
 * 틱 뷰어 호가 10단 (Phase 37 D-00 ① · 스케치 019 D 「호가 10단」 · orderbook-ladder 색 규칙).
 *
 * ① 입력 = 선택 틱의 거래소순 자리 → 같은 보드 마지막 B6(`session.lastB6`) → `bookAt` 10단. 매도 10→1(위 · 높은 가격부터) ·
 *   매수 1→10. B6 가 아직 없으면 「호가 없음」.
 * ② 「주 | 금액」 — 금액 = 잔량 × 그 단 가격(스케치 010 C 축약 · 주수 병기 없음). 바 길이 · 바닥 줄도 보는 단위를 따른다:
 *   주 = B6 총잔량(total_ask_qty · total_bid_qty) · 금액 = 10단 금액 합. 바는 20단 최대값 대비(스케치 019).
 * ③ 선택 틱이 A3(체결)면 그 체결 가격 행에 점 + 테두리.
 * ④ 캡션 「호가 기준 seq N · Δms 전」 — Δ = 선택 틱 수신 − 그 B6 수신. 거래소순에서는 B6 가 더 늦게 왔을 수 있다(「뒤」).
 * 색: 매도 행 `--down-bg` 65% · 매수 행 `--up-bg` 65% · 바 `--down`/`--up` 16% · 숫자 `--fg`(orderbook-ladder 와 같다).
 */

export type TickBookUnit = 'qty' | 'amount';

export interface TickBookProps {
  session: TickSession;
  rec: number;
  unit: TickBookUnit;
  onUnit: (u: TickBookUnit) => void;
  className?: string;
}

const UNITS: readonly { id: TickBookUnit; label: string }[] = [
  { id: 'qty', label: '주' },
  { id: 'amount', label: '금액' },
];

/** 바 최소 폭(%) — 0 이 아닌 잔량이 보이지 않게 되는 것을 막는다(orderbook-ladder BAR_MIN_PCT 와 같은 뜻). */
const BAR_MIN_PCT = 2;

function lagText(ms: number): string {
  const a = Math.abs(ms);
  const v = a < 10 ? a.toFixed(1) : fmtQty(Math.round(a));
  return ms >= 0 ? `${v}ms 전` : `${v}ms 뒤`;
}

export function TickBook({ session, rec, unit, onUnit, className }: TickBookProps) {
  const b6 = rec >= 0 ? session.lastB6[session.exPos[rec]!]! : -1;
  const book = useMemo(() => bookAt(session.buf, session.index, b6), [session, b6]);
  const hitPx =
    rec >= 0 && session.index.tag[rec] === TAG_CODE.A3 && session.a3Of[rec]! >= 0
      ? session.a3.px[session.a3Of[rec]!]!
      : null;

  const amount = unit === 'amount';
  const val = (l: BookLevel) => (amount ? l.amount : l.qty);
  const fv = (v: number) => (amount ? fmtAmountC(v) : fmtQty(v));

  let body: ReactNode;
  if (book === null) {
    body = (
      <p data-slot="tick-book-empty" className="m-0 px-3 py-6 text-center text-[12px] text-[var(--muted-fg)]">
        호가 없음
      </p>
    );
  } else {
    const max = Math.max(0, ...book.asks.map(val), ...book.bids.map(val));
    const bar = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.max(BAR_MIN_PCT, (v / max) * 100));
    const sums = amount ? bookAmountOf(book) : { askSum: book.totalAsk, bidSum: book.totalBid };
    const rows: { side: 'ask' | 'bid'; step: number; l: BookLevel }[] = [];
    for (let i = 9; i >= 0; i--) rows.push({ side: 'ask', step: i + 1, l: book.asks[i]! });
    for (let i = 0; i < 10; i++) rows.push({ side: 'bid', step: i + 1, l: book.bids[i]! });
    body = (
      <table className="w-full table-fixed border-collapse text-[12px]">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[28%]" />
          <col className="w-[36%]" />
        </colgroup>
        <thead>
          <tr className="bg-[var(--muted)] text-[10.5px] font-semibold text-[var(--muted-fg)]">
            <th className="px-1.5 py-[5px] text-center font-semibold">{amount ? '매도금액' : '매도잔량'}</th>
            <th className="px-1.5 py-[5px] text-center font-semibold">호가</th>
            <th className="px-1.5 py-[5px] text-center font-semibold">{amount ? '매수금액' : '매수잔량'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ side, step, l }) => {
            const hit = hitPx !== null && l.px === hitPx && l.px > 0;
            const v = val(l);
            const qtyCell = (
              <td className={cn('relative h-[26px] px-1.5 whitespace-nowrap', side === 'ask' ? 'text-left' : 'text-right')}>
                <i
                  data-slot="tick-book-bar"
                  aria-hidden
                  style={{ width: `${bar(v).toFixed(1)}%` }}
                  className={cn(
                    'absolute inset-y-[3px] rounded-[5px]',
                    side === 'ask'
                      ? 'right-0 bg-[color-mix(in_oklab,var(--down)_16%,transparent)]'
                      : 'left-0 bg-[color-mix(in_oklab,var(--up)_16%,transparent)]',
                  )}
                />
                <span className="mono relative z-[1] text-[var(--fg)]">{v > 0 ? fv(v) : ''}</span>
              </td>
            );
            return (
              <tr
                key={`${side}${step}`}
                data-slot="tick-book-row"
                data-side={side}
                data-step={step}
                data-px={l.px}
                data-hit={hit ? '' : undefined}
                className={cn(
                  'border-t border-[var(--border-subtle)]',
                  side === 'ask'
                    ? 'bg-[color-mix(in_oklab,var(--down-bg)_65%,transparent)]'
                    : 'bg-[color-mix(in_oklab,var(--up-bg)_65%,transparent)]',
                )}
              >
                {side === 'ask' ? qtyCell : <td />}
                <td
                  className={cn(
                    'mono h-[26px] px-1.5 text-center font-semibold whitespace-nowrap text-[var(--fg)]',
                    hit && 'rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--fg)]',
                  )}
                >
                  {l.px > 0 ? fmtQty(l.px) : ''}
                  {hit && (
                    <i
                      data-slot="tick-book-hit"
                      aria-label="선택 체결 가격"
                      className="ml-[5px] inline-block size-1.5 rounded-full bg-[var(--fg)] align-[1px]"
                    />
                  )}
                </td>
                {side === 'bid' ? qtyCell : <td />}
              </tr>
            );
          })}
          <tr data-slot="tick-book-total" className="bg-[var(--muted)] text-center text-[11px] font-semibold">
            <td className="mono h-6 px-1.5 text-[var(--fg)]">{fv(sums.askSum)}</td>
            <td className="h-6 px-1.5 text-[var(--muted-fg)]">{amount ? '합산 금액' : '총잔량'}</td>
            <td className="mono h-6 px-1.5 text-[var(--fg)]">{fv(sums.bidSum)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <section
      data-slot="tick-book"
      aria-label="호가 10단"
      className={cn(CARD, 'flex min-h-0 min-w-0 flex-col overflow-hidden', className)}
    >
      <div className="flex flex-none items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-[9px]">
        <h2 className="m-0 text-[12.5px] font-bold text-[var(--fg)]">호가 10단</h2>
        <div role="group" aria-label="호가 단위" className="ml-auto inline-flex flex-none rounded-full bg-[var(--muted)] p-0.5">
          {UNITS.map((u) => (
            <button
              key={u.id}
              type="button"
              aria-pressed={u.id === unit}
              onClick={() => u.id !== unit && onUnit(u.id)}
              className={cn(
                'rounded-full px-[9px] py-[3px] text-[11px] font-semibold',
                u.id === unit ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
      {book !== null && (
        <p
          data-slot="tick-book-meta"
          className="mono m-0 flex-none truncate px-3 py-1 text-[11px] text-[var(--muted-fg)]"
        >
          호가 기준 seq {fmtQty(book.seq)} · {lagText(bookLagMs(session.index, rec, book))}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </section>
  );
}
