/**
 * 전문 목록 표시 항목 (Phase 37 D-00 ② · 스케치 020 A 행 그룹 + 뒤집힘 3 채택본).
 *
 * ① 항목 = 평평한 Int32 배열(`kind << 28 | idx` · RESEARCH Pattern 8). 모든 항목이 같은 높이라 창 가상화가 인덱스 산술이다.
 *   - ROW  — 전문 한 행(idx = rec). 전문은 **전부** 한 행씩(ATMParser 식) — 70조각 주문도 71행.
 *   - TAIL — 2조각 이상 주문의 꼬리 줄 「┗ n조각 k단 · 수량 · 금액 · 지속 · 모양」(idx = 주문 id).
 *            자리 = 묶음 끝(마지막 조각 · 닫는 B6 중 표시 순서상 뒤) 바로 다음.
 * ② 순서 = 모드의 순열(거래소순 기본 · 수신순 토글). 묶음은 세션이 판정 입력 순서로 이미 정했다 — 여기서는 다시 묶지 않는다.
 * ③ 행 서식은 스케치 020 Decision — A3 `16,400 +1,064 (1,745만) 매수 · 0/0` · B6 `매도1 16,400 ×283 (464만) 매수1 …`
 *   (금액 = 스케치 010 C 축약 · B6 총잔량은 행에서 뺀다 — 호가 바닥 줄이 보여 준다).
 */

import { TAG_CODE, bookAt, type BookLevel } from '@gh-radar/shared';

import { fmtAmountC, fmtQty, MINUS } from './tick-format';
import type { TickSession, ViewOrder } from './tick-session';
import type { TickOrderMode } from './use-tick-cursor';

export const MSG_ITEM = { ROW: 0, TAIL: 1, SLOT: 2 } as const;
export type MsgItemKind = (typeof MSG_ITEM)[keyof typeof MSG_ITEM];

const KIND_SHIFT = 28;
const IDX_MASK = (1 << KIND_SHIFT) - 1;

export function msgItem(kind: MsgItemKind, idx: number): number {
  return (kind << KIND_SHIFT) | idx;
}
export function itemKindOf(item: number): MsgItemKind {
  return (item >>> KIND_SHIFT) as MsgItemKind;
}
export function itemIdxOf(item: number): number {
  return item & IDX_MASK;
}

export interface MsgRowsModel {
  mode: TickOrderMode;
  items: Int32Array;
  /** rec → 항목 자리. */
  posOfRec: Int32Array;
  /** 주문 id → 꼬리 줄 항목 자리(꼬리 없으면 -1). */
  tailPosOfOrder: Int32Array;
  /** 역전 B6 행의 항목 자리(오름차순). */
  inversionPos: Int32Array;
  /** 항목 자리 pos 뒤 첫 역전 B6 행 자리 · 없으면 -1. */
  nextInversionFrom: (pos: number) => number;
}

/** 묶음 끝 rec — 조각 · 닫는 B6 중 표시 자리가 가장 뒤인 것. */
function groupEndRec(o: ViewOrder, posOf: Int32Array): number {
  let best = -1;
  let rec = -1;
  for (const r of o.recs) {
    if (posOf[r]! > best) {
      best = posOf[r]!;
      rec = r;
    }
  }
  if (o.closingB6Rec !== null && posOf[o.closingB6Rec]! > best) rec = o.closingB6Rec;
  return rec;
}

export function buildMsgRows(session: TickSession, mode: TickOrderMode): MsgRowsModel {
  const n = session.index.n;
  const order = mode === 'exchange' ? session.exOrder : session.recvOrder;
  const posOf = mode === 'exchange' ? session.exPos : session.recvPos;

  // 꼬리 — 2조각 이상만, 묶음 끝 rec 뒤
  const tailAfter = new Int32Array(n).fill(-1);
  let tails = 0;
  for (const o of session.orders) {
    if (o.pieces < 2) continue;
    tailAfter[groupEndRec(o, posOf)] = o.id;
    tails += 1;
  }

  const items = new Int32Array(n + tails);
  const posOfRec = new Int32Array(n);
  const tailPosOfOrder = new Int32Array(session.orders.length).fill(-1);
  let k = 0;
  for (let p = 0; p < n; p++) {
    const r = order[p]!;
    posOfRec[r] = k;
    items[k++] = msgItem(MSG_ITEM.ROW, r);
    const t = tailAfter[r]!;
    if (t >= 0) {
      tailPosOfOrder[t] = k;
      items[k++] = msgItem(MSG_ITEM.TAIL, t);
    }
  }

  const inv: number[] = [];
  for (const b6 of session.inversionOfB6.keys()) inv.push(posOfRec[b6]!);
  const inversionPos = Int32Array.from(inv).sort();

  return {
    mode,
    items,
    posOfRec,
    tailPosOfOrder,
    inversionPos,
    nextInversionFrom(pos: number): number {
      let lo = 0;
      let hi = inversionPos.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (inversionPos[mid]! <= pos) lo = mid + 1;
        else hi = mid;
      }
      return lo < inversionPos.length ? inversionPos[lo]! : -1;
    },
  };
}

// ── 서식 ─────────────────────────────────────────────────────────────

/** 지속 — 1ms 미만 µs 정수 · 1초 미만 ms 소수 한 자리 · 그 위 s 소수 한 자리. */
export function fmtDurNs(ns: bigint): string {
  const v = Number(ns < 0n ? -ns : ns);
  if (v < 1e6) return `${Math.round(v / 1e3)}µs`;
  if (v < 1e9) return `${(v / 1e6).toFixed(1)}ms`;
  return `${(v / 1e9).toFixed(1)}s`;
}

/** 뒤집힘 ms — leadNs / 1e6 소수 한 자리(1ms 미만도 「0.4ms」). */
export function fmtLeadMs(leadNs: bigint): string {
  return `${(Number(leadNs) / 1e6).toFixed(1)}ms`;
}

export type MsgSide = 'buy' | 'sell' | 'auction';

export interface A3RowParts {
  px: number;
  /** 등락 방향(price_change_type) — 가격 색. */
  dir: 1 | 0 | -1;
  side: MsgSide;
  qty: number;
  amount: number;
  /** 매도1 · 매수1 호가가 모두 0(0/0). */
  zz: boolean;
  text: string;
}

const SIDE_LABEL: Record<MsgSide, string> = { buy: '매수', sell: '매도', auction: '단일가' };

export function sideOf(bs: string): MsgSide {
  return bs === '2' ? 'buy' : bs === '1' ? 'sell' : 'auction';
}

function dirOfPct(code: number): 1 | 0 | -1 {
  // '1' 상한 · '2' 상승 → +1 · '4' 하한 · '5' 하락 → -1 (route.ts signOf 와 같은 규칙)
  if (code === 49 || code === 50) return 1;
  if (code === 52 || code === 53) return -1;
  return 0;
}

/** A3 행 — `16,400 +1,064 (1,745만) 매수 · 0/0`(0/0 은 a1 = b1 = 0 일 때만 · 단일가면 「단일가」). rec 가 A3 ∧ ok 가 아니면 null. */
export function fmtA3Row(session: TickSession, rec: number): A3RowParts | null {
  const j = session.a3Of[rec] ?? -1;
  if (j < 0) return null;
  const { a3 } = session;
  const px = a3.px[j]!;
  const qty = a3.qty[j]!;
  const bsCode = a3.bs[j]!;
  const side = sideOf(bsCode === 32 ? '' : String.fromCharCode(bsCode));
  const zz = a3.a1[j] === 0 && a3.b1[j] === 0;
  const amount = px * qty;
  const sign = side === 'buy' ? '+' : side === 'sell' ? MINUS : '';
  const text = `${fmtQty(px)} ${sign}${fmtQty(qty)} (${fmtAmountC(amount)}) ${SIDE_LABEL[side]}${zz && side !== 'auction' ? ' · 0/0' : ''}`;
  return { px, dir: dirOfPct(a3.pct[j]!), side, qty, amount, zz, text };
}

export interface B6RowParts {
  ask: BookLevel;
  bid: BookLevel;
  text: string;
}

/** 세션별 B6 행 캐시 — 보이는 행만 풀고, 커서가 움직일 때 같은 행을 다시 풀지 않는다. */
const b6Cache = new WeakMap<TickSession, Map<number, B6RowParts | null>>();
const B6_CACHE_MAX = 4_000;

/** B6 행 — `매도1 16,400 ×283 (464만) 매수1 16,350 ×121 (198만)`. B6 ∧ ok 가 아니면 null. */
export function fmtB6Row(session: TickSession, rec: number): B6RowParts | null {
  let cache = b6Cache.get(session);
  if (!cache) {
    cache = new Map();
    b6Cache.set(session, cache);
  }
  const hit = cache.get(rec);
  if (hit !== undefined) return hit;
  let out: B6RowParts | null = null;
  if (session.index.tag[rec] === TAG_CODE.B6) {
    const book = bookAt(session.buf, session.index, rec);
    if (book) {
      const ask = book.asks[0]!;
      const bid = book.bids[0]!;
      const lv = (l: BookLevel) => `${fmtQty(l.px)} ×${fmtQty(l.qty)} (${fmtAmountC(l.amount)})`;
      out = { ask, bid, text: `매도1 ${lv(ask)} 매수1 ${lv(bid)}` };
    }
  }
  if (cache.size >= B6_CACHE_MAX) cache.clear();
  cache.set(rec, out);
  return out;
}

/** 모양 칩 — 「팀 SMP」 · 「팀 0/0」 · 「팀 C0」 · 「일반」 · 「단일가」 · NXT 「팀」/「일반」. */
export function orderShapeLabel(order: Pick<ViewOrder, 'kind'>): string {
  switch (order.kind) {
    case '자전거래방지':
      return '팀 SMP';
    case '0/0 단독':
      return '팀 0/0';
    case '0/0 스윕 끝':
      return '팀 C0';
    case '단일가':
      return '단일가';
    case 'NXT팀':
      return '팀';
    default:
      return '일반';
  }
}

/** 먼저 온 B6 행 꼬리말 — (37-13 Task 2 에서 채운다). */
export function inversionText(_mode: TickOrderMode, _leadNs: bigint): string {
  return '';
}

/** 꼬리 줄 뒤집힘 말 — (37-13 Task 2 에서 채운다). */
export function tailInversionText(_mode: TickOrderMode, _leadNs: bigint): string {
  return '';
}

/** 점선 「⋯ 거래소순 자리」 줄 — (37-13 Task 2 에서 채운다). */
export function slotText(_session: TickSession, _model: MsgRowsModel, _b6Rec: number): string {
  return '';
}

/** B9 · C3 · R8 · A0 · 기타 행 — (37-13 Task 2 에서 채운다). */
export function fmtOtherRow(_session: TickSession, _rec: number): string {
  return '';
}

/** 꼬리 줄 본문 — 「┗ n조각 k단 · 수량주 · 금액 · 지속」(모양 칩 · 뒤집힘 말은 따로 붙인다). */
export function tailText(order: ViewOrder): string {
  return `┗ ${order.pieces}조각 ${order.nPx}단 · ${fmtQty(order.qty)}주 · ${fmtAmountC(order.val)} · ${fmtDurNs(order.lastNs - order.firstNs)}`;
}
