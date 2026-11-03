/**
 * 전문 목록 표시 항목 (Phase 37 D-00 ② · 스케치 020 A 행 그룹 + 뒤집힘 3 채택본).
 *
 * ① 항목 = 평평한 Int32 배열(`kind << 28 | idx` · RESEARCH Pattern 8). 모든 항목이 같은 높이라 창 가상화가 인덱스 산술이다.
 *   - ROW  — 전문 한 행(idx = rec). 전문은 **전부** 한 행씩(ATMParser 식) — 70조각 주문도 71행.
 *   - TAIL — 2조각 이상 주문의 꼬리 줄 「┗ n조각 k단 · 수량 · 금액 · 지속 · 모양」(idx = 주문 id).
 *            자리 = 묶음 끝(마지막 조각 · 닫는 B6 중 표시 순서상 뒤) 바로 다음.
 *   - SLOT — **수신순에서만** 먼저 온 닫는 B6 의 msg_seq 제자리(런 마지막 조각 바로 뒤) 점선 「⋯ 거래소순 자리」 줄
 *            (idx = 그 B6 rec · 클릭 = 그 B6 선택). 같은 자리에 꼬리가 있으면 점선 줄이 먼저다.
 *   - ORDER  — 우리 주문 시각 점선 「● 주문 …」 줄(Phase 38 D-05 · idx = 우리 주문 id).
 *   - NOFILL — 짝 A3 를 못 찾은 우리 체결 점선 「◆ 우리 체결 n주 · 짝 전문 없음」 줄(D-12 · idx = 우리 체결 id).
 *            두 줄 자리 = 수신순 슬롯 p(그 시각 이후 첫 전문 · 두 순열 공통)의 ROW **앞** · 같은 슬롯은 시각 오름차순 · 동률은
 *            주문 먼저. 그 자리가 2조각 이상 주문의 조각 사이면 그 묶음 꼬리 뒤로 민다(Pitfall 3 — 레일 · 꼬리가 끊기지 않게).
 *            own 이 없으면 항목 · 색인이 Phase 37 과 바이트 단위로 같다.
 * ② 순서 = 모드의 순열(거래소순 기본 · 수신순 토글). 묶음은 세션이 판정 입력 순서로 이미 정했다 — 여기서는 다시 묶지 않는다.
 * ③ 행 서식은 스케치 020 Decision — A3 `16,400 +1,064 (1,745만) 매수 · 0/0` · B6 `매도1 16,400 ×283 (464만) 매수1 …`
 *   (금액 = 스케치 010 C 축약 · B6 총잔량은 행에서 뺀다 — 호가 바닥 줄이 보여 준다).
 */

import {
  A0_LAYOUT,
  B9_LAYOUT,
  C3_LAYOUT,
  R8_LAYOUT,
  TAG_CODE,
  TEAM_MEMBER_LABEL,
  bookAt,
  decodeFields,
  parseStr,
  payloadOf,
  type BookLevel,
  type FieldValue,
} from '@gh-radar/shared';

import type { OwnModel } from './own-model';
import { fmtAmountC, fmtQty, MINUS } from './tick-format';
import type { TickSession, ViewOrder } from './tick-session';
import type { TickOrderMode } from './use-tick-cursor';

export const MSG_ITEM = { ROW: 0, TAIL: 1, SLOT: 2, ORDER: 3, NOFILL: 4 } as const;
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
  /** 먼저 온 B6 rec → 점선 「거래소순 자리」 항목 자리(수신순에서만). */
  slotPosOfB6: Map<number, number>;
  /** 역전 B6 행의 항목 자리(오름차순). */
  inversionPos: Int32Array;
  /** 항목 자리 pos 뒤 첫 역전 B6 행 자리 · 없으면 -1. */
  nextInversionFrom: (pos: number) => number;
  /** 우리 주문 id → 주문 줄 항목 자리(주문 시각 없음 · own 없음이면 -1 · own 없으면 길이 0). */
  ownPosOfOrder: Int32Array;
  /** 우리 체결 id → 짝 없음 · 대기 줄 항목 자리(짝 있으면 -1 · own 없으면 길이 0). */
  ownPosOfFill: Int32Array;
}

const EMPTY_I32 = new Int32Array(0);

/** 우리 줄(주문 · 짝 없는 체결) 자리 — 슬롯 p 별로 (시각, 주문 먼저, id) 순. */
function ownLinesBySlot(own: OwnModel): Map<number, number[]> {
  const lines: { p: number; ms: number; rank: number; item: number }[] = [];
  for (const o of own.orders) {
    const p = own.slotOfOrder[o.id]!;
    if (p >= 0 && o.gwMs !== null) lines.push({ p, ms: o.gwMs, rank: 0, item: msgItem(MSG_ITEM.ORDER, o.id) });
  }
  for (const f of own.fills) {
    const p = own.slotOfFill[f.id]!;
    if (p >= 0) lines.push({ p, ms: f.gwMs, rank: 1, item: msgItem(MSG_ITEM.NOFILL, f.id) });
  }
  lines.sort((x, y) => x.p - y.p || x.ms - y.ms || x.rank - y.rank || x.item - y.item);
  const out = new Map<number, number[]>();
  for (const l of lines) {
    const list = out.get(l.p);
    if (list) list.push(l.item);
    else out.set(l.p, [l.item]);
  }
  return out;
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

export function buildMsgRows(session: TickSession, mode: TickOrderMode, own?: OwnModel | null): MsgRowsModel {
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

  // 점선 「거래소순 자리」 — 수신순에서만, 먼저 온 B6 마다 그 런 마지막 조각(seq) 바로 뒤
  const slotAfter = new Map<number, number[]>();
  let slots = 0;
  if (mode === 'recv') {
    for (const inv of session.inversions) {
      // 조각이 수신 순서를 지키면 마지막 조각(seq) = 가장 늦게 온 조각. 어긋나도 점선 줄이 그 B6 위로 가지 않게
      // 주문 조각 중 가장 늦게 수신된 것 뒤에 둔다.
      const oid = session.orderOfRec[inv.b6Rec]!;
      let anchor = inv.lastRec;
      if (oid >= 0) for (const r of session.orders[oid]!.recs) if (posOf[r]! > posOf[anchor]!) anchor = r;
      const list = slotAfter.get(anchor);
      if (list) list.push(inv.b6Rec);
      else slotAfter.set(anchor, [inv.b6Rec]);
      slots += 1;
    }
  }

  // 우리 줄 — 슬롯 p 의 ROW 앞(Phase 38). 묶음 한가운데면 그 주문 꼬리 뒤로 민다(Pitfall 3).
  const ownAt = own ? ownLinesBySlot(own) : null;
  let ownLines = 0;
  if (ownAt) for (const list of ownAt.values()) ownLines += list.length;
  const ownPosOfOrder = own ? new Int32Array(own.orders.length).fill(-1) : EMPTY_I32;
  const ownPosOfFill = own ? new Int32Array(own.fills.length).fill(-1) : EMPTY_I32;
  const ownAfterTail = new Map<number, number[]>();

  const items = new Int32Array(n + tails + slots + ownLines);
  const posOfRec = new Int32Array(n);
  const tailPosOfOrder = new Int32Array(session.orders.length).fill(-1);
  const slotPosOfB6 = new Map<number, number>();
  let k = 0;
  const putOwn = (list: readonly number[]): void => {
    for (const it of list) {
      if (itemKindOf(it) === MSG_ITEM.ORDER) ownPosOfOrder[itemIdxOf(it)] = k;
      else ownPosOfFill[itemIdxOf(it)] = k;
      items[k++] = it;
    }
  };
  for (let p = 0; p < n; p++) {
    const r = order[p]!;
    const ol = ownAt?.get(p);
    if (ol) {
      const oa = p > 0 ? session.orderOfRec[order[p - 1]!]! : -1;
      if (oa >= 0 && oa === session.orderOfRec[r]! && session.orders[oa]!.pieces >= 2) {
        const list = ownAfterTail.get(oa);
        if (list) list.push(...ol);
        else ownAfterTail.set(oa, ol.slice());
      } else {
        putOwn(ol);
      }
    }
    posOfRec[r] = k;
    items[k++] = msgItem(MSG_ITEM.ROW, r);
    const sl = slotAfter.get(r);
    if (sl) {
      for (const b6 of sl) {
        slotPosOfB6.set(b6, k);
        items[k++] = msgItem(MSG_ITEM.SLOT, b6);
      }
    }
    const t = tailAfter[r]!;
    if (t >= 0) {
      tailPosOfOrder[t] = k;
      items[k++] = msgItem(MSG_ITEM.TAIL, t);
      const pushed = ownAfterTail.get(t);
      if (pushed) {
        putOwn(pushed);
        ownAfterTail.delete(t);
      }
    }
  }
  // 끝(p = n) — 마지막 전문보다 늦은 우리 줄
  const atEnd = ownAt?.get(n);
  if (atEnd) putOwn(atEnd);
  // 방어 — 꼬리를 못 만난 민 줄(없어야 한다)은 끝에 둔다. 항목 수가 어긋나면 창 가상화가 깨진다.
  for (const list of ownAfterTail.values()) putOwn(list);

  const inv: number[] = [];
  for (const b6 of session.inversionOfB6.keys()) inv.push(posOfRec[b6]!);
  const inversionPos = Int32Array.from(inv).sort();

  return {
    mode,
    items,
    posOfRec,
    tailPosOfOrder,
    slotPosOfB6,
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
    ownPosOfOrder,
    ownPosOfFill,
  };
}

/** 둘째 레일 절반 선 비트 — 위 실선 · 위 점선 · 아래 실선 · 아래 점선. */
export const RAIL_HALF = { TOP: 1, TOP_DASH: 2, BOT: 4, BOT_DASH: 8 } as const;
/** 둘째 레일 마디 — 없음 · ● 주문 줄 · ◆ 우리 체결 A3 행 · ◇ 짝 없음/대기 줄. */
export const RAIL_NODE = { NONE: 0, ORDER: 1, FILL: 2, NOFILL: 3 } as const;

export interface OwnRail {
  /** 항목마다 `RAIL_HALF` 비트 합. */
  half: Uint8Array;
  /** 항목마다 `RAIL_NODE`. */
  node: Uint8Array;
}

/**
 * 둘째 레일(D-04 · 목업 B) — 우리 주문마다 [주문 줄 · 그 주문 체결 자리(A3 행 = posOfRec · 짝 없음 = ownPosOfFill)] 의
 * 최소~최대 항목 구간에 민트 세로선. 추정 체결이 하나라도 있으면 그 주문 구간은 점선 · 구간 길이 1 이면 마디만.
 * 겹침: 경계(항목 k 와 k+1 사이)마다 실선 · 점선 덮임 수를 차분 배열로 세고 실선이 하나라도 있으면 실선 — 옆 칸 추가 없음.
 * O(항목 + 체결). own 이 없으면 길이 0.
 */
export function ownRailOf(rows: MsgRowsModel, own: OwnModel | null): OwnRail {
  if (!own) return { half: new Uint8Array(0), node: new Uint8Array(0) };
  const len = rows.items.length;
  const half = new Uint8Array(len);
  const node = new Uint8Array(len);
  // 경계 k(항목 k ↔ k+1) 덮임 수 차분 — 길이 len(마지막 칸은 쓰지 않는다)
  const solid = new Int32Array(len + 1);
  const dashed = new Int32Array(len + 1);

  for (const o of own.orders) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let est = false;
    const op = rows.ownPosOfOrder[o.id] ?? -1;
    if (op >= 0) {
      lo = hi = op;
      node[op] = RAIL_NODE.ORDER;
    }
    for (const fid of o.fills) {
      const f = own.fills[fid]!;
      let p: number;
      if (f.state === 'matched') {
        p = rows.posOfRec[f.rec]!;
        node[p] = RAIL_NODE.FILL;
        if (f.est) est = true;
      } else {
        p = rows.ownPosOfFill[fid] ?? -1;
        if (p < 0) continue;
        node[p] = RAIL_NODE.NOFILL;
      }
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
    if (!(hi > lo)) continue;
    const d = est ? dashed : solid;
    d[lo]! += 1;
    d[hi]! -= 1;
  }

  let s = 0;
  let ds = 0;
  for (let k = 0; k < len; k++) {
    // 위 절반 = 경계 k−1 · 아래 절반 = 경계 k
    if (s > 0) half[k]! |= RAIL_HALF.TOP;
    else if (ds > 0) half[k]! |= RAIL_HALF.TOP_DASH;
    s += solid[k]!;
    ds += dashed[k]!;
    if (s > 0) half[k]! |= RAIL_HALF.BOT;
    else if (ds > 0) half[k]! |= RAIL_HALF.BOT_DASH;
  }
  return { half, node };
}

/** 우리 줄(주문 · 짝 없음) 자리 pos 의 기준 전문 — 그 줄 다음 첫 ROW 의 rec · 없으면 앞 ROW · 둘 다 없으면 -1. */
export function ownLineRec(rows: MsgRowsModel, pos: number): number {
  const { items } = rows;
  for (let k = pos + 1; k < items.length; k++) {
    if (itemKindOf(items[k]!) === MSG_ITEM.ROW) return itemIdxOf(items[k]!);
  }
  for (let k = pos - 1; k >= 0; k--) {
    if (itemKindOf(items[k]!) === MSG_ITEM.ROW) return itemIdxOf(items[k]!);
  }
  return -1;
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

/** 먼저 온 B6 행 꼬리말 — 수신순 「↕ 9.0ms 먼저 수신」 · 거래소순 「↕ 수신은 9.0ms 먼저」(스케치 020 뒤집힘 3). */
export function inversionText(mode: TickOrderMode, leadNs: bigint): string {
  const ms = fmtLeadMs(leadNs);
  return mode === 'recv' ? `↕ ${ms} 먼저 수신` : `↕ 수신은 ${ms} 먼저`;
}

/** 꼬리 줄 뒤집힘 말 — 「· 닫는 B6 ↕ 9.0ms 먼저」(수신순은 끝에 「수신」). */
export function tailInversionText(mode: TickOrderMode, leadNs: bigint): string {
  return `· 닫는 B6 ↕ ${fmtLeadMs(leadNs)} 먼저${mode === 'recv' ? ' 수신' : ''}`;
}

/** 점선 「⋯ 거래소순 자리 — 이 B6 는 9.0ms 먼저 수신돼 위 n행에 있음」(n = 점선 줄과 그 B6 행의 항목 거리). */
export function slotText(session: TickSession, model: MsgRowsModel, b6Rec: number): string {
  const inv = session.inversionOfB6.get(b6Rec);
  const at = model.slotPosOfB6.get(b6Rec);
  if (!inv || at === undefined) return '';
  return `⋯ 거래소순 자리 — 이 B6 는 ${fmtLeadMs(inv.leadNs)} 먼저 수신돼 위 ${at - model.posOfRec[b6Rec]!}행에 있음`;
}

function num(v: FieldValue | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return 0;
}

function str(v: FieldValue | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function signedQty(v: number): string {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : MINUS}${fmtQty(Math.abs(v))}`;
}

function memberLabel(code: string): string {
  if (code === '') return '—';
  return (TEAM_MEMBER_LABEL as Record<string, string>)[code] ?? code;
}

const VI_TYPE: Record<string, string> = { '1': '정적', '2': '동적', '3': '정적+동적', '4': '연장' };

/**
 * B9 · C3 · R8 · A0 · 기타 행 문구. A3 · B6(ok) 는 빈 문자열(각자 서식 함수).
 * - 기타(레이아웃 길이가 안 맞는 전문 · D-19) = 「기타 · <태그> · <정보구분> · <길이>B」.
 * - B9 = 「거래원 매수1 <창구> <수량> · 매도1 <창구> <수량>」(팀 창구는 이름) · C3 = 「프로그램 순매수 차익 ±q · 비차익 ±q」
 *   (위탁 + 자기 체결 수량) · R8 = 「VI 발동(정적|동적) 기준가 … · 발동가 …」 | 「VI 해제」 · A0 = 「종목 정보 <종목명>」.
 */
export function fmtOtherRow(session: TickSession, rec: number): string {
  const { index, buf } = session;
  const payload = payloadOf(buf, index, rec);
  if (index.ok[rec] !== 1) {
    return `기타 · ${parseStr(payload, 0, 2) || '?'} · ${parseStr(payload, 2, 3) || '—'} · ${fmtQty(payload.length)}B`;
  }
  const tag = index.tag[rec];
  const recv = index.recvNs[rec]!;
  if (tag === TAG_CODE.B9) {
    const r = decodeFields(B9_LAYOUT, payload, recv, index.label);
    return `거래원 매수1 ${memberLabel(str(r['lv1_buy_member']))} ${fmtQty(num(r['lv1_buy_qty']))} · 매도1 ${memberLabel(str(r['lv1_sell_member']))} ${fmtQty(num(r['lv1_sell_qty']))}`;
  }
  if (tag === TAG_CODE.C3) {
    const r = decodeFields(C3_LAYOUT, payload, recv, index.label);
    const q = (k: string) => num(r[`cons_${k}_exec_qty`]) + num(r[`prop_${k}_exec_qty`]);
    return `프로그램 순매수 차익 ${signedQty(q('buy_arb') - q('sell_arb'))} · 비차익 ${signedQty(q('buy_nonarb') - q('sell_nonarb'))}`;
  }
  if (tag === TAG_CODE.R8) {
    const r = decodeFields(R8_LAYOUT, payload, recv, index.label);
    if (str(r['vi_status']) !== '1') return 'VI 해제';
    const type = str(r['vi_type']);
    const base = type === '2' ? num(r['base_price_dvi']) : num(r['base_price_svi']);
    return `VI 발동(${VI_TYPE[type] ?? type}) 기준가 ${fmtQty(base)} · 발동가 ${fmtQty(num(r['trigger_price']))}`;
  }
  if (tag === TAG_CODE.A0) {
    const r = decodeFields(A0_LAYOUT, payload, recv, index.label);
    return `종목 정보 ${str(r['name'])}`;
  }
  return '';
}

/** 꼬리 줄 본문 — 「┗ n조각 k단 · 수량주 · 금액 · 지속」(모양 칩 · 뒤집힘 말은 따로 붙인다). */
export function tailText(order: ViewOrder): string {
  return `┗ ${order.pieces}조각 ${order.nPx}단 · ${fmtQty(order.qty)}주 · ${fmtAmountC(order.val)} · ${fmtDurNs(order.lastNs - order.firstNs)}`;
}
