'use client';

import { useMemo, type ReactNode } from 'react';

import { bookAmountOf, bookAt, bookLagMs, TAG_CODE, type BookLevel } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { ladderPctText } from '@/components/orderbook/orderbook-ladder';
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
 * ③ 선택 틱이 A3(체결)면 그 체결 가격 행에 점(가격 왼쪽 10px 슬롯 · 폭 고정 · 300px 칸에서 7자리 가격이 잘리지 않게 가격 열 40%) + 테두리.
 * ④ 캡션 「호가 기준 seq N · Δms 전」 — Δ = 선택 틱 수신 − 그 B6 수신. 거래소순에서는 B6 가 더 늦게 왔을 수 있다(「뒤」).
 * 모양(2026-11-03 사용자 요청 「트레이딩 카드 1단일 때 오더북처럼」) = 상따 카드 넓은 폭 3단 표(`orderbook-ladder` chaser
 *   3단 트리)와 같은 결 — 행 배경 틴트 없음 · 32px 행 · 잔량 바 `--ask-bar`/`--bid-bar`(가격 축을 향해 자람 · 둥근 6px) ·
 *   숫자 `--fg` · 가격 = 기준가 대비 방향색 + 등락률(10px · `ladderPctText`) · 매도1/매수1 경계 hairline.
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

  const base = session.basePx;
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
    const tone = (px: number) =>
      !(px > 0) || base === null || !(base > 0) || px === base
        ? 'text-[var(--flat)]'
        : px > base
          ? 'text-[var(--up)]'
          : 'text-[var(--down)]';
    body = (
      <table className="mono w-full table-fixed border-collapse text-[length:var(--t-caption)]">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[40%]" />
          <col className="w-[30%]" />
        </colgroup>
        <thead>
          <tr className="font-sans text-[10.5px] text-[var(--muted-fg)]">
            <th className="px-1.5 pt-1 pb-0.5 text-right font-medium">{amount ? '매도금액' : '매도잔량'}</th>
            <th className="px-1.5 pt-1 pb-0.5 text-center font-medium">호가</th>
            <th className="px-1.5 pt-1 pb-0.5 text-left font-medium">{amount ? '매수금액' : '매수잔량'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ side, step, l }) => {
            const hit = hitPx !== null && l.px === hitPx && l.px > 0;
            const v = val(l);
            const ask = side === 'ask';
            const qtyCell = (
              <td className="relative h-8 overflow-hidden px-1.5 py-0.5 align-middle whitespace-nowrap">
                <i
                  data-slot="tick-book-bar"
                  aria-hidden
                  style={{ width: `${bar(v).toFixed(1)}%` }}
                  className={cn(
                    'absolute top-1 bottom-1 rounded-[6px]',
                    ask ? 'right-0 bg-[var(--ask-bar)]' : 'left-0 bg-[var(--bid-bar)]',
                  )}
                />
                <span className={cn('relative z-[1] block truncate text-[var(--fg)]', ask ? 'text-right' : 'text-left')}>
                  {v > 0 ? fv(v) : ''}
                </span>
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
                className={cn(!ask && step === 1 && '[&>*]:border-t [&>*]:border-[var(--border-subtle)]')}
              >
                {ask ? qtyCell : <td className="h-8" />}
                <td className="h-8 overflow-hidden px-1 align-middle">
                  <div
                    className={cn(
                      'flex min-w-0 items-center gap-1 rounded-[4px]',
                      hit && 'outline outline-1 outline-[var(--fg)]',
                    )}
                  >
                    <span className="flex size-2.5 flex-none items-center justify-center">
                      {hit && (
                        <i
                          data-slot="tick-book-hit"
                          aria-label="선택 체결 가격"
                          className="block size-1.5 rounded-full bg-[var(--fg)]"
                        />
                      )}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate text-right font-medium', tone(l.px))}>
                      {l.px > 0 ? fmtQty(l.px) : '—'}
                    </span>
                    <span className="min-w-[32px] flex-none text-right text-[10px] text-[var(--muted-fg)]">
                      {ladderPctText(l.px, base ?? 0)}
                    </span>
                  </div>
                </td>
                {ask ? <td className="h-8" /> : qtyCell}
              </tr>
            );
          })}
          <tr data-slot="tick-book-total" className="text-[11px] font-semibold [&>*]:border-t [&>*]:border-[var(--border-subtle)]">
            <td className="h-7 px-1.5 text-right text-[var(--fg)]">{fv(sums.askSum)}</td>
            <td className="h-7 px-1.5 text-center font-sans font-medium text-[var(--muted-fg)]">
              {amount ? '합산 금액' : '총잔량'}
            </td>
            <td className="h-7 px-1.5 text-left text-[var(--fg)]">{fv(sums.bidSum)}</td>
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
