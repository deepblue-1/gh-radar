/**
 * Phase 37 (D-00 ①) 호가 10단 — lastB6Of(거래소순 같은 보드 마지막 B6) · bookAt(decodeFields(B6)) · 금액 합.
 * 컷 13시 픽스처 A3 자리 200개 표본을 무차별 탐색과 대조하고, 합성 전문으로 장 시작 전 · 보드 없는 행 · 금액을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { decodeFields } from "../ticks/decode";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { B6_LAYOUT } from "../ticks/layouts";
import { bookAmountOf, bookAt, bookLagMs, lastB6Of } from "../ticks/book";
import {
  NO_BOARD,
  TAG_CODE,
  buildTickIndex,
  exchangeOrderOf,
  payloadOf,
  recvOrderOf,
  type TickIndex,
} from "../ticks/record-index";
import { readTicksZst } from "./helpers/tick-digest";

/** 무차별 — 거래소순 자리 p 의 보드(없으면 앞쪽 보드 있는 행 · 처음엔 G1)에서 p 이하 마지막 B6. */
function bruteLastB6(index: TickIndex, ex: Int32Array, p: number): number {
  let b = -1;
  for (let q = p; q >= 0; q--) {
    const bb = index.board[ex[q]!]!;
    if (bb !== NO_BOARD) {
      b = bb;
      break;
    }
  }
  if (b < 0) b = index.boards.indexOf("G1");
  if (b < 0) return -1;
  for (let q = p; q >= 0; q--) {
    const r = ex[q]!;
    if (index.board[r] === b && index.tag[r] === TAG_CODE.B6) return r;
  }
  return -1;
}

describe.each([
  ["krx", "cut1300-krx"],
  ["nxt", "cut1300-nxt"],
] as const)("컷 13시 %s — 마지막 B6 · 10단", (label, name) => {
  const buf = readTicksZst(`${name}.ticks.zst`);
  const index = buildTickIndex(buf, label);
  const ex = exchangeOrderOf(index, recvOrderOf(index));
  const last = lastB6Of(index, ex);

  // A3 자리 200개 — 등간격 표본(결정적)
  const a3Pos: number[] = [];
  for (let p = 0; p < ex.length; p++) if (index.tag[ex[p]!] === TAG_CODE.A3) a3Pos.push(p);
  const sample: number[] = [];
  for (let k = 0; k < 200; k++) sample.push(a3Pos[Math.floor((k * a3Pos.length) / 200)]!);

  it("lastB6Of = 무차별 탐색(A3 자리 200개)", () => {
    expect(sample.length).toBe(200);
    for (const p of sample) expect(last[p]).toBe(bruteLastB6(index, ex, p));
  });

  it("bookAt 값 = decodeFields(B6)", () => {
    for (const p of sample.slice(0, 50)) {
      const b6 = last[p]!;
      const book = bookAt(buf, index, b6);
      if (b6 < 0) {
        expect(book).toBeNull();
        continue;
      }
      expect(book).not.toBeNull();
      const row = decodeFields(B6_LAYOUT, payloadOf(buf, index, b6), index.recvNs[b6]!, label);
      expect(book!.seq).toBe(row["msg_seq"]);
      expect(book!.board).toBe(row["board_id"]);
      expect(book!.recvNs).toBe(index.recvNs[b6]);
      for (let i = 1; i <= 10; i++) {
        const a = book!.asks[i - 1]!;
        const b = book!.bids[i - 1]!;
        expect(a.px).toBe(row[`ask${i}_px`]);
        expect(a.qty).toBe(row[`ask${i}_qty`]);
        expect(a.amount).toBe(a.px * a.qty);
        expect(b.px).toBe(row[`bid${i}_px`]);
        expect(b.qty).toBe(row[`bid${i}_qty`]);
        expect(b.amount).toBe(b.px * b.qty);
      }
      expect(book!.totalAsk).toBe(row["total_ask_qty"]);
      expect(book!.totalBid).toBe(row["total_bid_qty"]);
      expect(book!.estPx).toBe(row["est_price"]);
      expect(book!.estQty).toBe(row["est_qty"]);
      // 호가 기준 seq 는 선택 A3 seq 보다 작다(같은 보드 거래소순 앞쪽)
      expect(book!.seq).toBeLessThan(index.seq[ex[p]!]!);
    }
  });
});

// ── 합성 — 장 시작 전 · 보드 없는 행 · 금액 합 ───────────────────────────────

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

function quoteMsg(tag: "A3" | "B6", seq: number, board: string): Uint8Array {
  const b = new Uint8Array(tag === "A3" ? 186 : 590).fill(48);
  put(b, 0, tag);
  put(b, 2, "01S");
  put(b, 5, String(seq).padStart(8, "0"));
  put(b, 13, board);
  put(b, 17, "KR7101360006");
  return b;
}

/** price 11B — 바이트0 부호 · 바이트1 미사용 · 2..10 숫자. */
function price(v: number): string {
  return `00${String(v).padStart(9, "0")}`;
}

function b6With(seq: number, board: string): Uint8Array {
  const b = quoteMsg("B6", seq, board);
  for (let i = 1; i <= 10; i++) {
    const s = 47 + 46 * (i - 1);
    put(b, s, price(10_000 + i * 10)); // 매도 i
    put(b, s + 11, price(10_000 - i * 10)); // 매수 i
    put(b, s + 22, String(i * 100).padStart(12, "0"));
    put(b, s + 34, String(i * 200).padStart(12, "0"));
  }
  put(b, 507, String(5_500).padStart(12, "0"));
  put(b, 519, String(11_000).padStart(12, "0"));
  return b;
}

function infoMsg(): Uint8Array {
  const b = new Uint8Array(414).fill(32);
  put(b, 0, "B9");
  put(b, 2, "01S");
  return b;
}

describe("합성 — 장 시작 전 · 보드 없는 행 · 금액", () => {
  const t0 = 1_791_000_000_000_000_000n;
  const msgs = [quoteMsg("A3", 1, "G1"), b6With(2, "G1"), infoMsg(), quoteMsg("A3", 3, "G4"), quoteMsg("A3", 3, "G1")];
  const buf = concatBytes(msgs.map((m, i) => encodeRecord(t0 + BigInt(i) * 2_500_000n, m)));
  const index = buildTickIndex(buf, "krx");
  const ex = exchangeOrderOf(index, recvOrderOf(index));
  const last = lastB6Of(index, ex);

  it("B6 전 자리 -1 → null(「호가 없음」) · B9 는 앞 행 보드 · 다른 보드는 그 보드 B6 없음", () => {
    expect(Array.from(last)).toEqual([-1, 1, 1, -1, 1]);
    expect(bookAt(buf, index, last[0]!)).toBeNull();
    expect(bookAt(buf, index, last[3]!)).toBeNull();
    expect(bookAt(buf, index, 0)).toBeNull(); // A3 rec 은 호가가 아니다
  });

  it("10단 · 금액 = 잔량 × 가격 · 합산 금액 · Δms", () => {
    const book = bookAt(buf, index, last[4]!)!;
    expect(book.seq).toBe(2);
    expect(book.asks[0]).toEqual({ px: 10_010, qty: 100, amount: 1_001_000 });
    expect(book.bids[9]).toEqual({ px: 9_900, qty: 2_000, amount: 19_800_000 });
    expect(book.totalAsk).toBe(5_500);
    expect(book.totalBid).toBe(11_000);
    let askSum = 0;
    let bidSum = 0;
    for (let i = 1; i <= 10; i++) {
      askSum += (10_000 + i * 10) * i * 100;
      bidSum += (10_000 - i * 10) * i * 200;
    }
    expect(bookAmountOf(book)).toEqual({ askSum, bidSum });
    expect(bookLagMs(index, 4, book)).toBe(7.5);
  });
});
