/**
 * Phase 37 Plan 13 — 합성 틱 전문(테스트 입력). 레이아웃 필드 오프셋(shared layouts.ts)대로 ASCII 고정폭을 채워
 * `encodeRecord` 로 감싼 뒤 `buildTickSession` 에 넣는다. 매직 오프셋 없음 — 필드 이름으로 찾는다.
 */

import {
  A0_LAYOUT,
  A3_LAYOUT,
  B6_LAYOUT,
  B9_LAYOUT,
  C3_LAYOUT,
  R8_LAYOUT,
  concatBytes,
  dayStartNs,
  encodeRecord,
  type Layout,
  type TickExchange,
} from '@gh-radar/shared';

import { buildTickSession, type TickSession } from '@/lib/ticks/tick-session';

export const SYNTH_DATE = '20261016';
export const SYNTH_ISIN = 'KR7101360006';

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

function field(layout: Layout, name: string): { offset: number; length: number } {
  const f = layout.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${layout.table}.${name} 없음`);
  return f;
}

function setStr(b: Uint8Array, layout: Layout, name: string, v: string): void {
  const f = field(layout, name);
  put(b, f.offset, v.padEnd(f.length, ' ').slice(0, f.length));
}

function setNum(b: Uint8Array, layout: Layout, name: string, v: number): void {
  const f = field(layout, name);
  put(b, f.offset, String(Math.trunc(Math.abs(v))).padStart(f.length, '0'));
}

function setPrice(b: Uint8Array, layout: Layout, name: string, v: number): void {
  const f = field(layout, name);
  put(b, f.offset, (v < 0 ? '-0' : '00') + String(Math.abs(v)).padStart(9, '0'));
}

function base(layout: Layout, info: string): Uint8Array {
  const b = new Uint8Array(layout.size).fill(48); // '0'
  put(b, 0, layout.tag);
  put(b, 2, info);
  return b;
}

function quote(layout: Layout, seq: number, board: string, nxt: boolean): Uint8Array {
  const b = base(layout, nxt ? '51S' : '01S');
  setNum(b, layout, 'msg_seq', seq);
  setStr(b, layout, 'board_id', board);
  setStr(b, layout, 'isin', SYNTH_ISIN);
  return b;
}

export interface A3Spec {
  seq: number;
  board?: string;
  /** '1' 매도 · '2' 매수 · 그 밖 단일가. */
  bs?: string;
  px: number;
  qty: number;
  a1?: number;
  b1?: number;
  /** price_change_type — '2' 상승 기본. */
  pct?: string;
  chg?: number;
  /** HHMMSSuuuuuu. */
  time?: string;
  cumValue?: number;
  cumVolume?: number;
  nxt?: boolean;
}

export function a3Msg(s: A3Spec): Uint8Array {
  const L = A3_LAYOUT;
  const b = quote(L, s.seq, s.board ?? 'G1', s.nxt ?? false);
  setStr(b, L, 'final_bs_code', s.bs ?? '2');
  setPrice(b, L, 'trade_price', s.px);
  setNum(b, L, 'trade_qty', s.qty);
  setPrice(b, L, 'ask1_px', s.a1 ?? 0);
  setPrice(b, L, 'bid1_px', s.b1 ?? 0);
  setStr(b, L, 'price_change_type', s.pct ?? '2');
  setPrice(b, L, 'price_change', s.chg ?? 0);
  setStr(b, L, 'trade_time', s.time ?? '130000000000');
  setNum(b, L, 'cum_value', s.cumValue ?? 0);
  setNum(b, L, 'cum_volume', s.cumVolume ?? 0);
  return b;
}

export interface B6Spec {
  seq: number;
  board?: string;
  ask1: [number, number];
  bid1: [number, number];
  nxt?: boolean;
  /** [매도 총잔량, 매수 총잔량] — 생략하면 0. */
  total?: [number, number];
  /** 2단부터의 [가격, 잔량] — 생략하면 0. */
  asks?: [number, number][];
  bids?: [number, number][];
}

export function b6Msg(s: B6Spec): Uint8Array {
  const L = B6_LAYOUT;
  const b = quote(L, s.seq, s.board ?? 'G1', s.nxt ?? false);
  setPrice(b, L, 'ask1_px', s.ask1[0]);
  setNum(b, L, 'ask1_qty', s.ask1[1]);
  setPrice(b, L, 'bid1_px', s.bid1[0]);
  setNum(b, L, 'bid1_qty', s.bid1[1]);
  (s.asks ?? []).forEach(([px, qty], i) => {
    setPrice(b, L, `ask${i + 2}_px`, px);
    setNum(b, L, `ask${i + 2}_qty`, qty);
  });
  (s.bids ?? []).forEach(([px, qty], i) => {
    setPrice(b, L, `bid${i + 2}_px`, px);
    setNum(b, L, `bid${i + 2}_qty`, qty);
  });
  if (s.total) {
    setNum(b, L, 'total_ask_qty', s.total[0]);
    setNum(b, L, 'total_bid_qty', s.total[1]);
  }
  return b;
}

export interface R8Spec {
  seq: number;
  board?: string;
  /** '1' 발동 · '2' 해제. */
  status: string;
  /** '1' 정적 · '2' 동적 · '3' 정적+동적. */
  type?: string;
  basePx?: number;
  triggerPx?: number;
}

export function r8Msg(s: R8Spec): Uint8Array {
  const L = R8_LAYOUT;
  const b = quote(L, s.seq, s.board ?? 'G1', false);
  setStr(b, L, 'vi_status', s.status);
  setStr(b, L, 'vi_type', s.type ?? '1');
  setPrice(b, L, 'base_price_svi', s.basePx ?? 0);
  setPrice(b, L, 'base_price_dvi', s.basePx ?? 0);
  setPrice(b, L, 'trigger_price', s.triggerPx ?? 0);
  setStr(b, L, 'vi_end_time', '');
  return b;
}

function info(layout: Layout): Uint8Array {
  const b = base(layout, '01S');
  setStr(b, layout, 'isin', SYNTH_ISIN);
  return b;
}

/** B9 — 단계마다 [창구, 수량, 금액(선택 · 37-14)]. 금액을 빼면 0. */
export function b9Msg(s: {
  sell: [string, number, number?][];
  buy: [string, number, number?][];
}): Uint8Array {
  const L = B9_LAYOUT;
  const b = info(L);
  for (let i = 1; i <= 5; i++) {
    const sl = s.sell[i - 1];
    const by = s.buy[i - 1];
    setStr(b, L, `lv${i}_sell_member`, sl?.[0] ?? '');
    setNum(b, L, `lv${i}_sell_qty`, sl?.[1] ?? 0);
    setNum(b, L, `lv${i}_sell_value`, sl?.[2] ?? 0);
    setStr(b, L, `lv${i}_buy_member`, by?.[0] ?? '');
    setNum(b, L, `lv${i}_buy_qty`, by?.[1] ?? 0);
    setNum(b, L, `lv${i}_buy_value`, by?.[2] ?? 0);
  }
  return b;
}

/** C3 — 차익 · 비차익 매수/매도 체결 수량(위탁 + 자기) 값만 채운다. */
export function c3Msg(s: { buyArb?: number; sellArb?: number; buyNonArb?: number; sellNonArb?: number }): Uint8Array {
  const L = C3_LAYOUT;
  const b = info(L);
  setNum(b, L, 'cons_buy_arb_exec_qty', s.buyArb ?? 0);
  setNum(b, L, 'cons_sell_arb_exec_qty', s.sellArb ?? 0);
  setNum(b, L, 'cons_buy_nonarb_exec_qty', s.buyNonArb ?? 0);
  setNum(b, L, 'cons_sell_nonarb_exec_qty', s.sellNonArb ?? 0);
  return b;
}

export function a0Msg(s: { name: string; seq?: number }): Uint8Array {
  const L = A0_LAYOUT;
  const b = base(L, '01S');
  setNum(b, L, 'msg_seq', s.seq ?? 1);
  setStr(b, L, 'isin', SYNTH_ISIN);
  setStr(b, L, 'name', s.name);
  return b;
}

/** 레이아웃 길이가 안 맞는 전문(→ 「기타」 행). */
export function rawMsg(tag: string, len: number, info = '01S'): Uint8Array {
  const b = new Uint8Array(len).fill(48);
  put(b, 0, tag);
  put(b, 2, info);
  return b;
}

/** 그날 13:00 KST + ms(소수 가능) → epoch ns. */
export function synthNs(ms: number): bigint {
  return dayStartNs(SYNTH_DATE, '1300') + BigInt(Math.round(ms * 1e6));
}

/**
 * 뒤집힘 · 기타 행 합성 하루(rec = 목록 순서 = 수신순).
 *  0 B6 100 · 1 B6 104(닫는 B6 — 9.0ms 먼저 수신) · 2~4 A3 101~103(팀 SMP 3조각 · 마지막 10.0ms) ·
 *  5 A3 105(1조각 매도) · 6 B6 106 · 7 B9 · 8 C3 · 9 R8 107 발동 · 10 R8 108 해제 · 11 A0 · 12 길이 틀린 A3(기타) ·
 *  13 B6 106 다시(중복).
 */
export function inversionSession(): TickSession {
  return synthSession([
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [1.05, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [10, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001264' })],
    [11, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000011000' })],
    [11.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [12, b9Msg({ sell: [['00003', 1200]], buy: [['00001', 3400]] })],
    [13, c3Msg({ buyArb: 1000, sellArb: 400, buyNonArb: 200, sellNonArb: 700 })],
    [14, r8Msg({ seq: 107, status: '1', type: '1', basePx: 16400, triggerPx: 18040 })],
    [15, r8Msg({ seq: 108, status: '2', type: '1', basePx: 16400 })],
    [16, a0Msg({ name: 'ECOANDDREAM' })],
    [17, rawMsg('A3', 150)],
    [18, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
  ]);
}

/** (수신 ms, 전문) 목록 → 세션. 파일 순서 = 목록 순서. */
export function synthSession(msgs: readonly [number, Uint8Array][], ex: TickExchange = 'KRX'): TickSession {
  const buf = concatBytes(msgs.map(([ms, p]) => encodeRecord(synthNs(ms), p)));
  return buildTickSession(buf, { date: SYNTH_DATE, ex, isin: SYNTH_ISIN });
}
