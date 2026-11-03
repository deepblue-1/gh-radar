/**
 * Phase 37 (D-00 ①) 호가 10단 재구성 — 선택 틱 → 같은 보드 거래소순 마지막 B6 → 10단(가격 · 잔량 · 금액).
 *
 * RESEARCH Pattern 7 「마지막 B6 표」: 거래소순 순열을 한 번 돌며 `lastB6[p]` = 자리 p 이하에서 같은 보드의 마지막 B6
 * rec(Int32Array)를 만든다. 선택 행이 B9 · C3(보드 없음)면 그 앞 마지막 보드 있는 행의 보드를 쓴다(처음에는 G1).
 * B6 가 아직 없으면(장 시작 전) -1 → `bookAt` null → 화면 「호가 없음」. 화면은 늘 「호가 기준 seq N · Δms 전」 을 같이
 * 보인다(`Book10.seq` · `bookLagMs`).
 *
 * 「주 | 금액」(스케치 019 D): 금액 = 잔량 × 그 단 가격. 바닥 줄은 총잔량(total_ask_qty · total_bid_qty) ↔ 10단 금액 합
 * (`bookAmountOf`). NXT 도 B6 로만 재구성하므로 A3 의 0/0 여부와 무관하다.
 */
import { decodeFields, type FieldValue } from "./decode";
import { B6_LAYOUT } from "./layouts";
import { NO_BOARD, TAG_CODE, payloadOf, type TickIndex } from "./record-index";

/**
 * 거래소순 자리 p → 같은 보드의 p 이하 마지막 B6 rec(없으면 -1). 보드 없는 행(B9 · C3 · raw)은 직전 보드 있는 행의 보드,
 * 그런 행이 아직 없으면 G1(G1 보드가 없으면 -1). 단일 ISIN 인덱스 전제 — 보드만 보고 종목을 가르지 않는다
 * (record-index `buildTickIndex` 주석 · 여러 ISIN 조각은 먼저 쪼갠다).
 */
export function lastB6Of(index: TickIndex, exchangeOrder: Int32Array): Int32Array {
  const out = new Int32Array(exchangeOrder.length);
  const last = new Int32Array(index.boards.length).fill(-1);
  let cur = index.boards.indexOf("G1");
  for (let p = 0; p < exchangeOrder.length; p++) {
    const r = exchangeOrder[p]!;
    const b = index.board[r]!;
    if (b !== NO_BOARD) {
      cur = b;
      if (index.tag[r] === TAG_CODE.B6) last[b] = r;
    }
    out[p] = cur >= 0 ? last[cur]! : -1;
  }
  return out;
}

/** 호가 한 단 — 금액 = 잔량 × 가격(원). */
export interface BookLevel {
  px: number;
  qty: number;
  amount: number;
}

/** 호가 10단 — asks[0] = 매도1 · bids[0] = 매수1. */
export interface Book10 {
  b6Rec: number;
  seq: number;
  board: string;
  recvNs: bigint;
  asks: BookLevel[];
  bids: BookLevel[];
  totalAsk: number;
  totalBid: number;
  estPx: number;
  estQty: number;
}

function num(v: FieldValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return Number.NaN;
}

/** B6 rec → 호가 10단(decodeFields(B6_LAYOUT)). rec < 0 · B6 가 아님 · 길이 안 맞음이면 null(「호가 없음」). */
export function bookAt(buf: Uint8Array, index: TickIndex, b6Rec: number): Book10 | null {
  if (b6Rec < 0 || b6Rec >= index.n || index.tag[b6Rec] !== TAG_CODE.B6 || index.ok[b6Rec] !== 1) return null;
  const row = decodeFields(B6_LAYOUT, payloadOf(buf, index, b6Rec), index.recvNs[b6Rec]!, index.label);
  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];
  for (let i = 1; i <= 10; i++) {
    const ap = num(row[`ask${i}_px`]);
    const aq = num(row[`ask${i}_qty`]);
    const bp = num(row[`bid${i}_px`]);
    const bq = num(row[`bid${i}_qty`]);
    asks.push({ px: ap, qty: aq, amount: aq * ap });
    bids.push({ px: bp, qty: bq, amount: bq * bp });
  }
  return {
    b6Rec,
    seq: num(row["msg_seq"]),
    board: typeof row["board_id"] === "string" ? row["board_id"] : "",
    recvNs: index.recvNs[b6Rec]!,
    asks,
    bids,
    totalAsk: num(row["total_ask_qty"]),
    totalBid: num(row["total_bid_qty"]),
    estPx: num(row["est_price"]),
    estQty: num(row["est_qty"]),
  };
}

/** 10단 금액 합 — 바닥 줄 「합산 금액」. */
export function bookAmountOf(book: Book10): { askSum: number; bidSum: number } {
  let askSum = 0;
  let bidSum = 0;
  for (const l of book.asks) askSum += l.amount;
  for (const l of book.bids) bidSum += l.amount;
  return { askSum, bidSum };
}

/** 「호가 기준 Δms 전」 — 선택 rec 수신 − 호가 B6 수신(ms · 소수). 거래소순에서는 음수일 수 있다(B6 가 늦게 온 경우). */
export function bookLagMs(index: TickIndex, selRec: number, book: Book10): number {
  return Number(index.recvNs[selRec]! - book.recvNs) / 1e6;
}
