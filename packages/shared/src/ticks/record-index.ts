/**
 * Phase 37 (D-00 ②) 뷰어 모델 — 레코드 인덱스 · 수신순/거래소순 순열 · A3 열 배열 · 뒤집힘(닫는 B6 가 먼저 온 런).
 *
 * 브라우저는 사용자마다 선택 틱이 달라 증분 계산을 직접 한다(RESEARCH 책임 지도). 그래서 전부 순수 함수 · typed array 다 —
 * 끊김이 보이면 Web Worker 로 그대로 옮긴다(A10). recv_ns 는 BigInt64Array 로만 든다(Number 금지 · Anti-Patterns).
 *
 * 지연 디코딩(RESEARCH Pattern 2): `buildTickIndex` 는 전문 머리(태그 · 길이 · msg_seq · board_id)만 읽는다. A3 는
 * `a3ColumnsOf` 가 열 배열로 즉시 풀고, B6(행의 ~70%)는 커서 호가 · 보이는 목록 행만 그때 `decodeFields` 로 푼다.
 *
 * 「거래소순」(RESEARCH Pattern 3): A3 · B6 · R8 은 (종목, 보드)마다 msg_seq 하나를 나눠 쓴다 — 실측 천일 10/14 G1 은
 * 37,454행 · seq 1..37458 · 빈칸 4 = R8 4건(seq 9090 · 9251 · 24866 · 25236). 다른 보드는 각자 1부터 센다(G4 는 47~ ·
 * Pitfall 3 보드 재시작). 보드 사이에는 공통 순번이 없으므로 보드 사이 순서는 지어내지 않고 수신 순서를 따른다:
 * 수신순 자리 배열에서 (보드)마다 그 보드 행이 차지한 자리에 그 보드 행들을 msg_seq 오름차순으로 다시 채운다.
 * B9 · C3(순번 없음) · 길이가 안 맞는 raw 행은 수신 자리를 그대로 둔다.
 *
 * 주문 묶기와의 관계: 묶기(classifyKrxOrders · tagNxtRuns)는 이 순열과 별개로 파이썬과 같은 입력 순서로 한다 —
 * `A3Columns.toTrades()` → `scopeTrades` → `classifyKrxOrders`. 이 순열은 표시 · 커서 · 호가 재구성에만 쓴다.
 *
 * 뒤집힘(스케치 020 Decision): 닫는 B6(같은 보드 seq = 런 마지막 A3 seq + 1)가 런 조각 하나라도보다 먼저 수신된 경우.
 * 런 = 보드별 seq 순에서 직전 A3(B6 · R8 건너뜀) seq + 1 ∧ 같은 final_bs_code — orders-nxt `tagNxtRuns` 와 같은 식이다
 * (KRX · NXT 공통). 컷 13시 다조각 런 기준 KRX 84/182 · NXT 90/179(`cut1300-runs.json` 의 inverted).
 */
import { parsePrice, parseStr, parseTime12Ns, parseUint, parseValue22 } from "./decode";
import { iterRecords } from "./framing";
import { A3_LAYOUT, A0_LAYOUT, B6_LAYOUT, B9_LAYOUT, C3_LAYOUT, R8_LAYOUT, type FieldKind, type Layout } from "./layouts";
import type { A3Trade } from "./orders-krx";

/** 태그 코드 — `TickIndex.tag` 값. */
export const TAG_CODE = { OTHER: 0, A3: 1, B6: 2, R8: 3, B9: 4, C3: 5, A0: 6 } as const;
export type TagCode = (typeof TAG_CODE)[keyof typeof TAG_CODE];

/** 보드 없음 — `TickIndex.board` 값. */
export const NO_BOARD = 255;

/**
 * 레코드 인덱스 — 레코드 색인(rec = 파일 안 순서) 하나에 열 하나씩.
 * - `ok` = (태그, 길이)가 레이아웃과 정확히 맞으면 1(디코딩 가능).
 * - `seq` = A3 · B6 · R8 이고 ok 일 때 msg_seq, 아니면 -1.
 * - `board` = `boards` 색인(A3 · B6 · R8 ∧ ok), 아니면 `NO_BOARD`(255).
 */
export interface TickIndex {
  n: number;
  label: "krx" | "nxt";
  off: Uint32Array;
  len: Uint32Array;
  recvNs: BigInt64Array;
  tag: Uint8Array;
  ok: Uint8Array;
  seq: Int32Array;
  board: Uint8Array;
  boards: string[];
}

const LAYOUT_OF_CODE: readonly (Layout | null)[] = [null, A3_LAYOUT, B6_LAYOUT, R8_LAYOUT, B9_LAYOUT, C3_LAYOUT, A0_LAYOUT];

function tagCodeOf(b0: number | undefined, b1: number | undefined): TagCode {
  if (b0 === 65 && b1 === 51) return TAG_CODE.A3; // "A3"
  if (b0 === 66 && b1 === 54) return TAG_CODE.B6; // "B6"
  if (b0 === 82 && b1 === 56) return TAG_CODE.R8; // "R8"
  if (b0 === 66 && b1 === 57) return TAG_CODE.B9; // "B9"
  if (b0 === 67 && b1 === 51) return TAG_CODE.C3; // "C3"
  if (b0 === 65 && b1 === 48) return TAG_CODE.A0; // "A0"
  return TAG_CODE.OTHER;
}

/** QuoteHeader(A3 · B6 · R8) 머리 — msg_seq 오프셋 5 · 8자리 · board_id 오프셋 13 · 2자(layouts.ts quoteHeader). */
const SEQ_OFF = 5;
const SEQ_LEN = 8;
const BOARD_OFF = 13;
const BOARD_LEN = 2;

/**
 * 레코드 프레이밍 바이트 → 레코드 인덱스. iterRecords 한 번(개수) + 한 번(채우기) — 전체 디코딩 없이 머리만 읽는다.
 * 보드 문자열은 decodeFields 와 같은 규칙(parseStr)이고 등장 순서대로 `boards` 에 쌓인다(255종 넘으면 RangeError).
 *
 * **단일 ISIN 전제(IN-02):** 보드 키는 board_id 2바이트뿐이다. msg_seq 는 (종목, 보드)마다 따로라서, 이 인덱스 위의
 * 거래소순(`exchangeOrderOf`) · 뒤집힘(`inversionsOf`) · 마지막 B6(book `lastB6Of`) · 호가 재구성은 버퍼가 **한 ISIN** 일
 * 때만 맞다 — 여러 ISIN 이 섞이면 다른 종목 seq 를 섞어 정렬하고, 런을 종목 경계 너머로 잇고, 닫는 B6 를 다른 종목에서 찾는다.
 * 운영 격자 · 당일 캐시는 종목 단위라 늘 맞다. 여러 ISIN 조각(발사 대기열 골든 `launch1030-*-0900` 등)은 먼저 ISIN 별로
 * 쪼갠 뒤 넣는다(ticks-launch-queue.golden.test.ts 의 `cutOf`). 인덱스 자체(머리 · 수신순)는 섞인 버퍼에도 쓸 수 있어 여기서 막지 않는다(무필터 raw20k 시험).
 */
export function buildTickIndex(buf: Uint8Array, label: "krx" | "nxt"): TickIndex {
  let n = 0;
  for (const _ of iterRecords(buf)) n += 1;
  const off = new Uint32Array(n);
  const len = new Uint32Array(n);
  const recvNs = new BigInt64Array(n);
  const tag = new Uint8Array(n);
  const ok = new Uint8Array(n);
  const seq = new Int32Array(n).fill(-1);
  const board = new Uint8Array(n).fill(NO_BOARD);
  const boards: string[] = [];
  const boardByKey = new Map<number, number>();
  let i = 0;
  for (const r of iterRecords(buf)) {
    off[i] = r.off;
    len[i] = r.len;
    recvNs[i] = r.recvNs;
    const code = r.len >= 2 ? tagCodeOf(buf[r.off], buf[r.off + 1]) : TAG_CODE.OTHER;
    tag[i] = code;
    const layout = LAYOUT_OF_CODE[code];
    const good = layout !== null && layout !== undefined && layout.size === r.len;
    ok[i] = good ? 1 : 0;
    if (good && (code === TAG_CODE.A3 || code === TAG_CODE.B6 || code === TAG_CODE.R8)) {
      seq[i] = Number(parseUint(buf, r.off + SEQ_OFF, SEQ_LEN));
      const key = (buf[r.off + BOARD_OFF]! << 8) | buf[r.off + BOARD_OFF + 1]!;
      let b = boardByKey.get(key);
      if (b === undefined) {
        if (boards.length >= NO_BOARD) throw new RangeError(`buildTickIndex: 보드가 ${NO_BOARD}종을 넘는다`);
        b = boards.length;
        boards.push(parseStr(buf, r.off + BOARD_OFF, BOARD_LEN));
        boardByKey.set(key, b);
      }
      board[i] = b;
    }
    i += 1;
  }
  return { n, label, off, len, recvNs, tag, ok, seq, board, boards };
}

/** 레코드 rec 의 페이로드(복사 없음). */
export function payloadOf(buf: Uint8Array, index: TickIndex, rec: number): Uint8Array {
  const o = index.off[rec]!;
  return buf.subarray(o, o + index.len[rec]!);
}

/** 보드 이름 → 색인(없으면 -1). */
export function boardIndexOf(index: TickIndex, name: string): number {
  return index.boards.indexOf(name);
}

/**
 * 수신순 순열 — 자리 p → rec. 파일이 이미 recv_ns 비감소면 항등(대부분), 아니면 recv_ns 안정 정렬(동률은 파일 순서).
 */
export function recvOrderOf(index: TickIndex): Int32Array {
  const { n, recvNs } = index;
  const out = new Int32Array(n);
  let mono = true;
  for (let i = 0; i < n; i++) {
    out[i] = i;
    if (i > 0 && recvNs[i]! < recvNs[i - 1]!) mono = false;
  }
  if (mono) return out;
  return out.sort((x, y) => {
    const a = recvNs[x]!;
    const b = recvNs[y]!;
    return a < b ? -1 : a > b ? 1 : x - y;
  });
}

/**
 * 거래소순 순열 — 수신순 자리 배열에서 (보드)마다 그 보드 행(seq ≥ 0)이 차지한 자리 목록을 구하고, 그 행들을 msg_seq
 * 오름차순(동률은 수신 순서)으로 자리 오름차순에 다시 채운다. seq -1 행(B9 · C3 · A0 · raw · 길이 안 맞는 행)은 자리 유지.
 * 결과는 순열(모든 rec 한 번씩) · O(n log n). 단일 ISIN 인덱스 전제(`buildTickIndex` 주석).
 */
export function exchangeOrderOf(index: TickIndex, recvOrder: Int32Array): Int32Array {
  const out = Int32Array.from(recvOrder);
  const nb = index.boards.length;
  if (nb === 0) return out;
  const count = new Int32Array(nb);
  for (let p = 0; p < recvOrder.length; p++) {
    const b = index.board[recvOrder[p]!]!;
    if (b !== NO_BOARD) count[b]! += 1;
  }
  const pos: Int32Array[] = [];
  for (let b = 0; b < nb; b++) pos.push(new Int32Array(count[b]!));
  const fill = new Int32Array(nb);
  for (let p = 0; p < recvOrder.length; p++) {
    const b = index.board[recvOrder[p]!]!;
    if (b === NO_BOARD) continue;
    pos[b]![fill[b]!] = p;
    fill[b]! += 1;
  }
  const { seq } = index;
  for (let b = 0; b < nb; b++) {
    const ps = pos[b]!;
    // 그 보드 행들(수신 순서) → seq 오름차순 안정 정렬(동률은 수신 자리 순)
    const order = new Int32Array(ps.length);
    for (let k = 0; k < ps.length; k++) order[k] = k;
    order.sort((x, y) => seq[recvOrder[ps[x]!]!]! - seq[recvOrder[ps[y]!]!]! || x - y);
    for (let k = 0; k < ps.length; k++) out[ps[k]!] = recvOrder[ps[order[k]!]!]!;
  }
  return out;
}

/** 순열의 역 — inv[perm[p]] = p (rec → 자리). */
export function inversePerm(perm: Int32Array): Int32Array {
  const inv = new Int32Array(perm.length);
  for (let p = 0; p < perm.length; p++) inv[perm[p]!] = p;
  return inv;
}

/**
 * A3 열 배열 — A3 ∧ ok 행만, 파일 순서(rec 오름차순). 값은 decodeFields(A3_LAYOUT) 와 같다(테스트가 전 A3 로 잠근다).
 * - `bs` · `pct` = final_bs_code · price_change_type 한 글자의 문자 코드(parseStr 규칙 — 공백/NUL 은 32, 128 이상은 63).
 * - `board` = TickIndex.boards 색인 · `nxt` = 정보구분 첫 글자 '5'(exchangeOf 규칙 — 그 밖은 label 대문자).
 * - `tNs` = 체결 시각 epoch ns, 못 읽으면 -1n(null).
 */
export interface A3Columns {
  n: number;
  rec: Int32Array;
  seq: Int32Array;
  board: Uint8Array;
  bs: Uint8Array;
  pct: Uint8Array;
  chg: Float64Array;
  px: Float64Array;
  qty: Float64Array;
  a1: Float64Array;
  b1: Float64Array;
  tNs: BigInt64Array;
  cumValue: Float64Array;
  /** 누적 거래량 — 근거 · 앵커 조인 키(Phase 38 D-15). 12자리 십진 < 2^53 이라 Number 로 안전. */
  cumVolume: Float64Array;
  nxt: Uint8Array;
  isin: string[];
  /** 주문 묶기 입력 — `scopeTrades` → `classifyKrxOrders`(파이썬과 같은 입력 순서는 scopeTrades 가 만든다). */
  toTrades(): A3Trade[];
}

/** 레이아웃 필드 하나의 자리(오프셋 · 길이) — 길이도 레이아웃에서 읽는다(IN-04). */
interface FieldAt {
  offset: number;
  length: number;
}

/**
 * 레이아웃에서 필드 `name` 의 자리를 찾고 `kind` 를 확인한다. 고정 폭 파서(price 11 · time12 12 · 한 글자 str 1)를 쓰는
 * 필드는 `width` 로 길이를 함께 잠근다 — 레이아웃 길이가 바뀌면 모듈을 읽을 때 바로 던진다(조용히 엇갈리지 않게).
 */
function fieldOf(layout: Layout, name: string, kind: FieldKind, width?: number): FieldAt {
  const f = layout.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${layout.table}.${name} 필드가 없다`);
  if (f.kind !== kind) throw new Error(`${layout.table}.${name} 는 ${kind} 가 아니다(${f.kind})`);
  if (width !== undefined && f.length !== width) {
    throw new Error(`${layout.table}.${name} 길이 ${f.length} ≠ 고정 폭 파서 ${width}`);
  }
  return { offset: f.offset, length: f.length };
}

const A3_F = {
  isin: fieldOf(A3_LAYOUT, "isin", "str"),
  tradeTime: fieldOf(A3_LAYOUT, "trade_time", "time12", 12),
  pct: fieldOf(A3_LAYOUT, "price_change_type", "str", 1),
  chg: fieldOf(A3_LAYOUT, "price_change", "price", 11),
  px: fieldOf(A3_LAYOUT, "trade_price", "price", 11),
  qty: fieldOf(A3_LAYOUT, "trade_qty", "uint"),
  cumValue: fieldOf(A3_LAYOUT, "cum_value", "value22"),
  cumVolume: fieldOf(A3_LAYOUT, "cum_volume", "uint"),
  bs: fieldOf(A3_LAYOUT, "final_bs_code", "str", 1),
  a1: fieldOf(A3_LAYOUT, "ask1_px", "price", 11),
  b1: fieldOf(A3_LAYOUT, "bid1_px", "price", 11),
};

/** parseStr 한 글자 규칙의 문자 코드 — 128 이상 '?' · NUL 공백. */
function charCodeOf(c: number): number {
  return c >= 128 ? 63 : c === 0 ? 32 : c;
}

/** 문자 코드 → 한 글자 문자열(parseStr 처럼 공백이면 ""). */
function charOf(code: number): string {
  return code === 32 ? "" : String.fromCharCode(code);
}

function toNum(v: number | bigint): number {
  return typeof v === "bigint" ? Number(v) : v;
}

/** A3 ∧ ok 행을 오프셋에서 직접 풀어 열 배열로 만든다(행 객체를 만들지 않는다). */
export function a3ColumnsOf(buf: Uint8Array, index: TickIndex): A3Columns {
  let n = 0;
  for (let i = 0; i < index.n; i++) if (index.tag[i] === TAG_CODE.A3 && index.ok[i] === 1) n += 1;
  const rec = new Int32Array(n);
  const seq = new Int32Array(n);
  const board = new Uint8Array(n);
  const bs = new Uint8Array(n);
  const pct = new Uint8Array(n);
  const chg = new Float64Array(n);
  const px = new Float64Array(n);
  const qty = new Float64Array(n);
  const a1 = new Float64Array(n);
  const b1 = new Float64Array(n);
  const tNs = new BigInt64Array(n);
  const cumValue = new Float64Array(n);
  const cumVolume = new Float64Array(n);
  const nxt = new Uint8Array(n);
  const isin: string[] = new Array<string>(n);
  const isinIntern = new Map<string, string>();
  const fallbackNxt = index.label === "nxt" ? 1 : 0;
  let k = 0;
  for (let i = 0; i < index.n; i++) {
    if (index.tag[i] !== TAG_CODE.A3 || index.ok[i] !== 1) continue;
    const o = index.off[i]!;
    const recv = index.recvNs[i]!;
    rec[k] = i;
    seq[k] = index.seq[i]!;
    board[k] = index.board[i]!;
    bs[k] = charCodeOf(buf[o + A3_F.bs.offset]!);
    pct[k] = charCodeOf(buf[o + A3_F.pct.offset]!);
    chg[k] = toNum(parsePrice(buf, o + A3_F.chg.offset));
    px[k] = toNum(parsePrice(buf, o + A3_F.px.offset));
    qty[k] = toNum(parseUint(buf, o + A3_F.qty.offset, A3_F.qty.length));
    a1[k] = toNum(parsePrice(buf, o + A3_F.a1.offset));
    b1[k] = toNum(parsePrice(buf, o + A3_F.b1.offset));
    tNs[k] = parseTime12Ns(buf, o + A3_F.tradeTime.offset, recv) ?? -1n;
    cumValue[k] = toNum(parseValue22(buf, o + A3_F.cumValue.offset, A3_F.cumValue.length));
    cumVolume[k] = toNum(parseUint(buf, o + A3_F.cumVolume.offset, A3_F.cumVolume.length));
    const c0 = buf[o + 2];
    nxt[k] = c0 === 53 ? 1 : c0 === 48 ? 0 : fallbackNxt;
    const s = parseStr(buf, o + A3_F.isin.offset, A3_F.isin.length);
    let interned = isinIntern.get(s);
    if (interned === undefined) {
      interned = s;
      isinIntern.set(s, s);
    }
    isin[k] = interned;
    k += 1;
  }
  const boards = index.boards;
  return {
    n,
    rec,
    seq,
    board,
    bs,
    pct,
    chg,
    px,
    qty,
    a1,
    b1,
    tNs,
    cumValue,
    cumVolume,
    nxt,
    isin,
    toTrades(): A3Trade[] {
      const out: A3Trade[] = new Array<A3Trade>(n);
      for (let j = 0; j < n; j++) {
        const t = tNs[j]!;
        out[j] = {
          rec: rec[j]!,
          seq: seq[j]!,
          board: boards[board[j]!] ?? "",
          bs: charOf(bs[j]!),
          px: px[j]!,
          qty: qty[j]!,
          a1: a1[j]!,
          b1: b1[j]!,
          tNs: t === -1n ? null : t,
          isin: isin[j]!,
          exchange: nxt[j] === 1 ? "NXT" : "KRX",
        };
      }
      return out;
    },
  };
}

/**
 * 뒤집힘 하나 — 닫는 B6 가 런 조각 하나라도보다 먼저 수신됐다.
 * `firstRec` · `lastRec` = 런 첫 · 마지막 조각(seq 순) · `leadNs` = 가장 늦게 온 조각 recv − 닫는 B6 recv(> 0) —
 * 스케치 020 꼬리말 「↕ 9.0ms 먼저 수신」 의 값.
 */
export interface Inversion {
  b6Rec: number;
  firstRec: number;
  lastRec: number;
  pieces: number;
  leadNs: bigint;
}

/**
 * 거래소순(보드별 seq 순)으로 A3 런을 묶고 닫는 B6(같은 보드 seq = 마지막 + 1 · 거래소순 첫 것)를 찾아, 그 B6 recv 가
 * 런 조각 하나라도보다 이르면 Inversion 으로 낸다. 결과는 닫는 B6 의 거래소순 자리 오름차순. 1조각 런도 포함한다
 * (다조각만 보려면 `pieces >= 2` 로 거른다). 단일 ISIN 인덱스 전제 — 키가 (보드, seq) 라 종목을 가르지 않는다(`buildTickIndex` 주석).
 */
export function inversionsOf(index: TickIndex, a3: A3Columns, exchange: Int32Array): Inversion[] {
  const a3Of = new Int32Array(index.n).fill(-1);
  for (let j = 0; j < a3.n; j++) a3Of[a3.rec[j]!] = j;
  const nb = index.boards.length;
  const prevSeq = new Float64Array(nb).fill(Number.NaN);
  const prevBs = new Int16Array(nb).fill(-1);
  const curRun = new Int32Array(nb).fill(-1);
  const runRecs: number[][] = [];
  const runBoard: number[] = [];
  // (보드, seq) → 그 B6 rec 과 거래소순 자리(첫 것)
  const b6At = new Map<number, number>();
  const key = (b: number, s: number): number => b * 1e8 + s;
  for (let p = 0; p < exchange.length; p++) {
    const r = exchange[p]!;
    const b = index.board[r]!;
    if (b === NO_BOARD) continue;
    const t = index.tag[r];
    if (t === TAG_CODE.B6) {
      const k = key(b, index.seq[r]!);
      if (!b6At.has(k)) b6At.set(k, p);
      continue;
    }
    if (t !== TAG_CODE.A3) continue;
    const j = a3Of[r]!;
    if (j < 0) continue;
    const s = index.seq[r]!;
    const bsCode = a3.bs[j]!;
    if (curRun[b]! >= 0 && s === prevSeq[b]! + 1 && bsCode === prevBs[b]) {
      runRecs[curRun[b]!]!.push(r);
    } else {
      curRun[b] = runRecs.length;
      runRecs.push([r]);
      runBoard.push(b);
    }
    prevSeq[b] = s;
    prevBs[b] = bsCode;
  }
  const out: { p: number; inv: Inversion }[] = [];
  for (let run = 0; run < runRecs.length; run++) {
    const recs = runRecs[run]!;
    const last = recs[recs.length - 1]!;
    const p = b6At.get(key(runBoard[run]!, index.seq[last]! + 1));
    if (p === undefined) continue;
    const b6Rec = exchange[p]!;
    const b6Recv = index.recvNs[b6Rec]!;
    let latest = b6Recv;
    for (const r of recs) if (index.recvNs[r]! > latest) latest = index.recvNs[r]!;
    if (latest > b6Recv) {
      out.push({
        p,
        inv: { b6Rec, firstRec: recs[0]!, lastRec: last, pieces: recs.length, leadNs: latest - b6Recv },
      });
    }
  }
  out.sort((x, y) => x.p - y.p);
  return out.map((x) => x.inv);
}
