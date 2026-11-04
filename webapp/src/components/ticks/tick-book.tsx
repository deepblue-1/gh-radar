'use client';

import { useMemo, type ReactNode } from 'react';

import { bookAmountOf, bookAt, bookLagMs, TAG_CODE, type BookLevel } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { ladderPctText } from '@/components/orderbook/orderbook-ladder';
import { fmtAmountC, fmtQty, fmtSignedAmountC, MINUS } from '@/lib/ticks/tick-format';
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
 * ⑤ 가격 칸 = 가격 + 기준가(`session.basePx`) 대비 등락률 — 트레이딩 호가(orderbook-ladder)와 같은 모양이다(2026-11-04 사용자 요청):
 *   가격은 기준가 대비 방향색(`--up`/`--down`/`--flat`) · 등락률은 회색 10px · 소수 1자리 · 부호/`%` 없음(`ladderPctText` 공유 —
 *   계산식을 복제하지 않는다). 기준가를 모르면 가격은 `--fg` · 등락률은 빈칸(0.0 을 지어내지 않는다).
 * ⑥ 바깥 「증감」 열 = 같은 보드 **직전 B6** 대비 그 가격의 잔량 증감(2026-11-04 사용자 요청 · 목업 B · HTS 관례). 비교는 **같은 쪽 ·
 *   같은 가격**끼리다(단 번호끼리 비교하면 가격이 한 칸 밀릴 때 숫자가 무의미하다). 직전 10단에 없던 가격은 직전 10단 범위 안이면
 *   0 에서 왔다고 보고, 범위 밖(새로 들어온 먼 단)이면 모른다 → 빈칸. 0 · 직전 B6 없음도 빈칸. 「주 | 금액」을 따른다(금액 = 증감 주 × 가격).
 *   증가 `--up` · 감소 `--down`. 직전 B6 탐색은 거래소순으로 거슬러 같은 보드 · 정상 · 중복 아닌 첫 B6.
 * 색: 행 배경 없음(2026-11-03 사용자 요청 — 매도/매수 틴트 제거) · 바 `--down`/`--up` 16% · 잔량 숫자 `--fg`(orderbook-ladder 와 같다).
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

/** 등락률 칸 최소폭(px) — `-29.9` ~ `29.9` 을 오가도 가격이 흔들리지 않는다(orderbook-ladder PCT_MIN_WIDTH_PX 와 같은 뜻 · 10px 글자 기준). */
const PCT_MIN_WIDTH_PX = 30;

/** 기준가 대비 가격 방향색 — orderbook-ladder `priceTone` 과 같은 규칙. 기준가를 모르면 `--fg`. */
function priceTone(px: number, base: number | null): string {
  if (base === null || !(base > 0)) return 'text-[var(--fg)]';
  if (px === base) return 'text-[var(--flat)]';
  return px > base ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** 같은 보드의 직전 B6 rec — 거래소순 자리를 거슬러 같은 보드 · 정상 · 중복 아닌 첫 B6(없으면 -1). */
function prevB6Of(session: TickSession, b6: number): number {
  if (b6 < 0) return -1;
  const { index, exOrder, exPos, duplicates } = session;
  const board = index.board[b6]!;
  for (let p = exPos[b6]! - 1; p >= 0; p--) {
    const r = exOrder[p]!;
    if (index.tag[r] === TAG_CODE.B6 && index.board[r] === board && index.ok[r] === 1 && duplicates[r] !== 1) return r;
  }
  return -1;
}

/**
 * 한쪽 10단의 단별 잔량 증감(주) — 같은 가격끼리. null = 모름(직전 없음 · 가격 없음 · 직전 10단 범위 밖에서 새로 들어온 단).
 * 직전 10단이 다 차지 않았으면 그 밖은 잔량 0 이었다는 뜻이라 범위 제한이 없다.
 */
export function bookSideDelta(cur: readonly BookLevel[], prev: readonly BookLevel[] | null, side: 'ask' | 'bid'): (number | null)[] {
  if (prev === null) return cur.map(() => null);
  const valid = prev.filter((l) => l.px > 0);
  const qtyAt = new Map(valid.map((l) => [l.px, l.qty]));
  const full = valid.length === prev.length; // 빈 단(px 0)이 하나라도 있으면 그 쪽 잔량이 바닥난 것
  const edge = side === 'ask' ? Math.max(...valid.map((l) => l.px)) : Math.min(...valid.map((l) => l.px));
  return cur.map((l) => {
    if (!(l.px > 0)) return null;
    const known = qtyAt.has(l.px) || !full || (side === 'ask' ? l.px <= edge : l.px >= edge);
    return known ? l.qty - (qtyAt.get(l.px) ?? 0) : null;
  });
}

function signedQty(v: number): string {
  return v > 0 ? `+${fmtQty(v)}` : `${MINUS}${fmtQty(-v)}`;
}

function lagText(ms: number): string {
  const a = Math.abs(ms);
  const v = a < 10 ? a.toFixed(1) : fmtQty(Math.round(a));
  return ms >= 0 ? `${v}ms 전` : `${v}ms 뒤`;
}

export function TickBook({ session, rec, unit, onUnit, className }: TickBookProps) {
  const b6 = rec >= 0 ? session.lastB6[session.exPos[rec]!]! : -1;
  const book = useMemo(() => bookAt(session.buf, session.index, b6), [session, b6]);
  const delta = useMemo(() => {
    if (book === null) return null;
    const prev = bookAt(session.buf, session.index, prevB6Of(session, b6));
    return { ask: bookSideDelta(book.asks, prev?.asks ?? null, 'ask'), bid: bookSideDelta(book.bids, prev?.bids ?? null, 'bid') };
  }, [session, b6, book]);
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
    body = (
      <table className="w-full table-fixed border-collapse text-[12px]">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[20%]" />
          <col className="w-[30%]" />
          <col className="w-[20%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr className="bg-[var(--muted)] text-[10.5px] font-semibold text-[var(--muted-fg)]">
            <th className="px-1 py-[5px] text-center font-semibold">증감</th>
            <th className="px-1.5 py-[5px] text-center font-semibold">{amount ? '매도금액' : '매도잔량'}</th>
            <th className="px-1.5 py-[5px] text-center font-semibold">호가</th>
            <th className="px-1.5 py-[5px] text-center font-semibold">{amount ? '매수금액' : '매수잔량'}</th>
            <th className="px-1 py-[5px] text-center font-semibold">증감</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ side, step, l }) => {
            const hit = hitPx !== null && l.px === hitPx && l.px > 0;
            const v = val(l);
            const dq = delta![side][step - 1]!;
            const dv = dq === null || dq === 0 ? null : amount ? dq * l.px : dq;
            const deltaCell = (
              <td
                data-slot="tick-book-delta"
                data-delta={dq ?? undefined}
                className={cn(
                  'mono h-[26px] overflow-hidden px-1 text-[10px] whitespace-nowrap',
                  side === 'ask' ? 'text-left' : 'text-right',
                  dv !== null && (dv > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'),
                )}
              >
                {dv === null ? '' : amount ? fmtSignedAmountC(dv) : signedQty(dv)}
              </td>
            );
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
                className="border-t border-[var(--border-subtle)]"
              >
                {side === 'ask' ? deltaCell : <td />}
                {side === 'ask' ? qtyCell : <td />}
                <td
                  className={cn(
                    'h-[26px] px-1.5 whitespace-nowrap',
                    hit && 'rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--fg)]',
                  )}
                >
                  {/* [체결 점 슬롯 · 항상 폭 차지] [가격 · 오른쪽 정렬] [등락률 · 최소폭] — 행마다 가격 끝이 같은 세로줄에 선다. */}
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="flex w-1.5 flex-none justify-center">
                      {hit && (
                        <i
                          data-slot="tick-book-hit"
                          aria-label="선택 체결 가격"
                          className="block size-1.5 rounded-full bg-[var(--fg)]"
                        />
                      )}
                    </span>
                    <span
                      data-slot="tick-book-px"
                      className={cn('mono min-w-0 flex-1 truncate text-right font-semibold', l.px > 0 && priceTone(l.px, base))}
                    >
                      {l.px > 0 ? fmtQty(l.px) : ''}
                    </span>
                    <span
                      data-slot="tick-book-pct"
                      className="mono flex-none text-right text-[10px] text-[var(--muted-fg)]"
                      style={{ minWidth: PCT_MIN_WIDTH_PX }}
                    >
                      {base !== null ? ladderPctText(l.px, base) : ''}
                    </span>
                  </div>
                </td>
                {side === 'bid' ? qtyCell : <td />}
                {side === 'bid' ? deltaCell : <td />}
              </tr>
            );
          })}
          <tr data-slot="tick-book-total" className="bg-[var(--muted)] text-center text-[11px] font-semibold">
            <td />
            <td className="mono h-6 px-1.5 text-[var(--fg)]">{fv(sums.askSum)}</td>
            <td className="h-6 px-1.5 text-[var(--muted-fg)]">{amount ? '합산 금액' : '총잔량'}</td>
            <td className="mono h-6 px-1.5 text-[var(--fg)]">{fv(sums.bidSum)}</td>
            <td />
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
