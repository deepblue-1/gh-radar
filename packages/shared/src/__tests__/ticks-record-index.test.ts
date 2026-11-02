/**
 * Phase 37 (D-00 ②) 레코드 인덱스 · 거래소순 순열 · A3 열 배열 · 뒤집힘.
 *
 * 오라클을 새로 만들지 않는다 — 기존 픽스처(컷 13시 KRX · NXT `decode.json` 행 수 · `cut1300-runs.json` 의 inverted)와
 * decodeFields 무차별 대조, 합성 7행으로 잠근다.
 */
import { describe, expect, it } from "vitest";
import { decodeAny, decodeFields } from "../ticks/decode";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { A3_LAYOUT } from "../ticks/layouts";
import { a3TradeOf } from "../ticks/orders-krx";
import {
  NO_BOARD,
  TAG_CODE,
  a3ColumnsOf,
  buildTickIndex,
  exchangeOrderOf,
  inversePerm,
  inversionsOf,
  payloadOf,
  recvOrderOf,
  type TickIndex,
} from "../ticks/record-index";
import { readTickJson, readTicksZst, type DecodeGolden } from "./helpers/tick-digest";

interface RunsGolden {
  krx: { summary: { inverted: number; inverted_of: number } };
  nxt: { summary: { inverted: number; inverted_of: number } };
}

function isPermutation(perm: Int32Array, n: number): boolean {
  if (perm.length !== n) return false;
  const seen = new Uint8Array(n);
  for (const r of perm) {
    if (r < 0 || r >= n || seen[r] === 1) return false;
    seen[r] = 1;
  }
  return true;
}

/** 보드마다 그 보드 행이 거래소순에서 seq 비감소인가. */
function seqNonDecreasingPerBoard(index: TickIndex, perm: Int32Array): boolean {
  const last = new Float64Array(index.boards.length).fill(-1);
  for (const r of perm) {
    const b = index.board[r]!;
    if (b === NO_BOARD) continue;
    if (index.seq[r]! < last[b]!) return false;
    last[b] = index.seq[r]!;
  }
  return true;
}

// ── 합성 전문 — 레이아웃 오프셋대로 ASCII 고정폭 ─────────────────────────────

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

/** QuoteHeader 전문(A3 186 · B6 590) — 정보구분 '011'(KRX) · seq 8자리 · 보드 2자. */
function quoteMsg(tag: "A3" | "B6", seq: number, board: string): Uint8Array {
  const b = new Uint8Array(tag === "A3" ? 186 : 590).fill(48); // '0'
  put(b, 0, tag);
  put(b, 2, "01S");
  put(b, 5, String(seq).padStart(8, "0"));
  put(b, 13, board);
  put(b, 17, "KR7101360006");
  return b;
}

function infoMsg(tag: "B9" | "C3"): Uint8Array {
  const b = new Uint8Array(tag === "B9" ? 414 : 400).fill(32);
  put(b, 0, tag);
  put(b, 2, "01S");
  put(b, 5, "KR7101360006");
  return b;
}

describe("거래소순 순열 — 합성 7행", () => {
  // 수신: A3 G1 s2 → B6 G1 s1 → B9 → A3 G4 s1 → B6 G1 s3 → C3 → A3 G1 s4
  const msgs = [
    quoteMsg("A3", 2, "G1"),
    quoteMsg("B6", 1, "G1"),
    infoMsg("B9"),
    quoteMsg("A3", 1, "G4"),
    quoteMsg("B6", 3, "G1"),
    infoMsg("C3"),
    quoteMsg("A3", 4, "G1"),
  ];
  const t0 = 1_791_000_000_000_000_000n;
  const buf = concatBytes(msgs.map((m, i) => encodeRecord(t0 + BigInt(i) * 1_000_000n, m)));
  const index = buildTickIndex(buf, "krx");

  it("머리 — 태그 · ok · seq · 보드", () => {
    expect(index.n).toBe(7);
    expect(Array.from(index.tag)).toEqual([
      TAG_CODE.A3,
      TAG_CODE.B6,
      TAG_CODE.B9,
      TAG_CODE.A3,
      TAG_CODE.B6,
      TAG_CODE.C3,
      TAG_CODE.A3,
    ]);
    expect(Array.from(index.ok)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(Array.from(index.seq)).toEqual([2, 1, -1, 1, 3, -1, 4]);
    expect(index.boards).toEqual(["G1", "G4"]);
    expect(Array.from(index.board)).toEqual([0, 0, NO_BOARD, 1, 0, NO_BOARD, 0]);
  });

  it("기대 순열 — G1 자리 {0,1,4,6} 에 seq 1·2·3·4 · B9 · C3 · G4 제자리", () => {
    const recv = recvOrderOf(index);
    expect(Array.from(recv)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const ex = exchangeOrderOf(index, recv);
    expect(Array.from(ex)).toEqual([1, 0, 2, 3, 4, 5, 6]);
    expect(Array.from(inversePerm(ex))).toEqual([1, 0, 2, 3, 4, 5, 6]);
  });

  it("recvOrderOf — 단조가 아니면 recv_ns 안정 정렬", () => {
    const shuffled = concatBytes([
      encodeRecord(t0 + 3n, msgs[0]!),
      encodeRecord(t0 + 1n, msgs[1]!),
      encodeRecord(t0 + 3n, msgs[2]!),
      encodeRecord(t0 + 2n, msgs[3]!),
    ]);
    const idx = buildTickIndex(shuffled, "krx");
    expect(Array.from(recvOrderOf(idx))).toEqual([1, 3, 0, 2]);
  });

  it("길이가 안 맞는 A3 는 ok 0 · seq -1 · 보드 없음 → 자리 유지", () => {
    const bad = quoteMsg("A3", 5, "G1").subarray(0, 180);
    const b2 = concatBytes([encodeRecord(t0, msgs[0]!), encodeRecord(t0 + 1n, bad), encodeRecord(t0 + 2n, msgs[1]!)]);
    const idx = buildTickIndex(b2, "krx");
    expect(Array.from(idx.ok)).toEqual([1, 0, 1]);
    expect(idx.seq[1]).toBe(-1);
    expect(idx.board[1]).toBe(NO_BOARD);
    expect(Array.from(exchangeOrderOf(idx, recvOrderOf(idx)))).toEqual([2, 1, 0]);
  });
});

const runsGolden = readTickJson<RunsGolden>("cut1300-runs.json");

describe.each([
  ["krx", "cut1300-krx"],
  ["nxt", "cut1300-nxt"],
] as const)("컷 13시 %s — 인덱스 · 순열 · A3 열 · 뒤집힘", (label, name) => {
  const buf = readTicksZst(`${name}.ticks.zst`);
  const golden = readTickJson<DecodeGolden>(`${name}.decode.json`);
  const t0 = performance.now();
  const index = buildTickIndex(buf, label);
  const buildMs = performance.now() - t0;
  const recv = recvOrderOf(index);
  const ex = exchangeOrderOf(index, recv);
  const a3 = a3ColumnsOf(buf, index);

  it("n = decode.json 표 rows 합 · 태그별 수", () => {
    const total = Object.values(golden.tables).reduce((s, t) => s + t.rows, 0);
    expect(index.n).toBe(total);
    expect(index.n).toBe(golden.source.records);
    let a3n = 0;
    let b6n = 0;
    for (let i = 0; i < index.n; i++) {
      if (index.tag[i] === TAG_CODE.A3 && index.ok[i] === 1) a3n += 1;
      if (index.tag[i] === TAG_CODE.B6 && index.ok[i] === 1) b6n += 1;
    }
    expect(a3n).toBe(golden.tables["a3"]!.rows);
    expect(b6n).toBe(golden.tables["b6"]!.rows);
    expect(a3.n).toBe(a3n);
    // 성능 기록(SUMMARY) — 실패 조건 아님
    console.info(`[perf] ${name} buildTickIndex ${buildMs.toFixed(1)}ms · ${index.n}건 · 보드 ${index.boards.join(",")}`);
  });

  it("seq · 보드 = decodeFields 값(전 A3 · B6)", () => {
    for (let i = 0; i < index.n; i++) {
      if (index.ok[i] !== 1) continue;
      const { row } = decodeAny(payloadOf(buf, index, i), index.recvNs[i]!, label);
      expect(index.seq[i]).toBe(row["msg_seq"]);
      expect(index.boards[index.board[i]!]).toBe(row["board_id"]);
    }
  });

  it("거래소순 = 순열 · 보드마다 seq 비감소 · seq -1 행 자리 불변", () => {
    expect(isPermutation(recv, index.n)).toBe(true);
    expect(isPermutation(ex, index.n)).toBe(true);
    expect(seqNonDecreasingPerBoard(index, ex)).toBe(true);
    for (let p = 0; p < ex.length; p++) {
      if (index.seq[recv[p]!] === -1) expect(ex[p]).toBe(recv[p]);
    }
    // 보드마다 차지한 자리 집합이 수신순과 같다
    for (let p = 0; p < ex.length; p++) expect(index.board[ex[p]!]).toBe(index.board[recv[p]!]);
  });

  it("a3ColumnsOf 값 = decodeFields(A3) 값(전 A3)", () => {
    const trades = a3.toTrades();
    for (let j = 0; j < a3.n; j++) {
      const r = a3.rec[j]!;
      const row = decodeFields(A3_LAYOUT, payloadOf(buf, index, r), index.recvNs[r]!, label);
      expect(trades[j]).toEqual(a3TradeOf(r, row));
      const pct = row["price_change_type"] as string;
      expect(a3.pct[j]).toBe(pct === "" ? 32 : pct.charCodeAt(0));
      expect(a3.chg[j]).toBe(Number(row["price_change"]));
      expect(a3.cumValue[j]).toBe(Number(row["cum_value"]));
    }
  });

  it(`inversionsOf 다조각 런 = cut1300-runs.json inverted(${label})`, () => {
    const inv = inversionsOf(index, a3, ex);
    const g1 = index.boards.indexOf("G1");
    const multi = inv.filter((x) => x.pieces >= 2 && index.board[x.b6Rec] === g1);
    expect(multi.length).toBe(runsGolden[label].summary.inverted);
    expect(multi.length).toBe(label === "krx" ? 84 : 90);
    const pos = inversePerm(ex);
    for (const x of inv) {
      expect(x.leadNs > 0n).toBe(true);
      expect(index.tag[x.b6Rec]).toBe(TAG_CODE.B6);
      expect(index.seq[x.b6Rec]).toBe(index.seq[x.lastRec]! + 1);
      expect(index.recvNs[x.b6Rec]! + x.leadNs).toBeGreaterThan(index.recvNs[x.b6Rec]!);
    }
    for (let k = 1; k < inv.length; k++) expect(pos[inv[k]!.b6Rec]!).toBeGreaterThan(pos[inv[k - 1]!.b6Rec]!);
  });
});
