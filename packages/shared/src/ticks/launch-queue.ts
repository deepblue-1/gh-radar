/**
 * quick 261103-pei — 발사 조각 대기열 순번 · 앞 물량(16:00 Q16) · 공격 주문 체결 런 순번(09:00 N · A).
 *
 * **계산 정본 한 벌** — 밤 틱 변환 Job(workers/tick-convert)만 부른다. 웹 · 서버는 DB(`launch_piece_queue`) 저장값만
 * 읽는다(브라우저 계산 금지 · D-3). 실측 근거 · 결정은 `.planning/quick/261103-pei-launch-order-queue-position/261103-pei-CONTEXT.md` · PLAN
 * design_decisions 3~6. 골든 = `__tests__/ticks-launch-queue.golden.test.ts`(10/22 · 10/30 원본 조각).
 *
 * ── 16:00 Q16 (보드 G4 · 매수 대기열) ─────────────────────────────────────────────────────────────────────
 *   G4 B6 는 주문 1건당 1전문이라 우리 가격 단 잔량의 증가분 = 주문 1건 수량이다. (방향, 가격) 레벨마다 기준시각
 *   (수신 ≥ fire_base) 뒤 그 보드 · 그 ISIN 의 B6 · A3 를 거래소순으로 재생한다(`fifoReplay`):
 *   - B6 증가 = 주문 추가(번호 1부터 = 순번). 그 주문의 「접수 때 앞」 = 직전 B6 의 같은 가격 잔량 + 그 B6 10단에
 *     보이는 더 좋은 가격 단(매수 px > P · 매도 0 < px < P) 잔량 · 금액 = 단마다 잔량 × 그 단 가격의 합
 *     (첫 B6 이면 0). 뒤탐침(1387)은 상한가 대기열이 「더 좋은 가격」 이라 크게 나온다 — 맞다(design_decisions 6).
 *   - 같은 가격 A3 는 쌓아 두었다가 다음 감소에서 먼저 앞에서부터 소진(FIFO 체결). 남은 감소 = 취소 — 남은 수량이
 *     정확히 같은 주문 1개면 그것 · 여럿이면 가장 뒤(모호 → 「마감 때」 가 추정인 이유) · 없으면 설명불가(무시).
 *   - 마감 때 = 재생 끝(그 보드 세션 마지막 전문). 우리 주문이 0 이면 0 으로 만든 사건(체결 · 취소) · 아니면
 *     우리 앞 rem > 0 주문 수 · 수량 · 금액(수량 × P).
 *   우리 조각 = 증가분이 조각 수량과 같은 증가 이벤트 — 게이트웨이마다 wire 순, 게이트웨이를 이어 붙인 열을 증가 열의
 *   부분열로 앞에서부터 짝짓는다(`matchQueuePieces`). 게이트웨이 순서는 **성립성**으로 고른다(design_decisions 3 —
 *   순열마다 돌려 모두 짝지어지는 순서 · 동률이면 짝 수 · 그래도 동률이면 LAUNCH_ORDER + `order_est`). sent_rel_us 는
 *   쓰지 않는다(실측 반례: 10/30 184230 교보 송신이 먼저인데 도착은 KB 가 먼저).
 *
 * ── 09:00 N(NXT) · A(KRX) (보드 G1 · 공격 주문) ────────────────────────────────────────────────────────────
 *   공격 주문 1건 = 체결 런 — 같은 보드 거래소순에서 직전 레코드도 A3 ∧ seq = 직전 + 1 ∧ 같은 final_bs_code 인 A3 들
 *   (`aggressorRunsOf` · B6 · seq 틈 · bs 바뀜이 끊는다 · µs 간격 기준 없음). 런 시작 = 첫 A3 체결 시각(못 읽으면 수신).
 *   우리 런 = 같은 방향(매수 bs '2' · 매도 '1') ∧ 시작 ≥ 기준시각 후보 중 (px, qty) 열이 우리 체결 열과 정확히 같은
 *   첫 미점유 런(`runValueOf`). 순번 = 후보 중 몇 번째 · 앞 = 우리 런 앞 후보들의 한도 안(매수 px ≤ 가격 · 매도
 *   px ≥ 가격) 체결 합. 미체결이면 순번 없음 · [기준, 기준 + 1초) 후보 런의 한도 안 합 = 「앞선 n건이 가져감」.
 *
 * 레코드 순서 = 거래소순(`exchangeOrderOf(index, recvOrderOf(index))` — 틱뷰어 표준 · 골든이 재현을 잠근다).
 * 성능: 격자 하나에 인덱스 · 거래소순 · A3 열을 한 번 만든다. B6 는 그 레벨 · 그 ISIN 것만 `bookAt` 으로 푼다.
 */
import { LAUNCH_ORDER, type LaunchPieceQueue } from "../launch";
import type { TickExchange } from "../tick-api";
import { bookAt } from "./book";
import {
  TAG_CODE,
  a3ColumnsOf,
  buildTickIndex,
  exchangeOrderOf,
  recvOrderOf,
  type A3Columns,
  type TickIndex,
} from "./record-index";
import { parseTickTime } from "./tick-time";

// ─────────────────────────────────────────────────────────────────────────────
// 입력 · 출력
// ─────────────────────────────────────────────────────────────────────────────

/** 발사 조각 한 개(밤 변환 입력 — RPC `launch_queue_inputs` 행에서 trade_date 를 뺀 모양). */
export interface LaunchQueuePieceIn {
  gateway: string;
  profile: string;
  fire_exchange: string;
  /** 발사 기준시각 `HH:MM:SS`(그 거래소 시각) */
  fire_base: string;
  market: string;
  wire: number;
  side: "buy" | "sell";
  isin: string;
  price: number;
  qty: number;
  /** 우리 체결 [가격, 수량] — 저널 순서(gw_time, seq). 16:00 은 쓰지 않는다. */
  fills: ReadonlyArray<readonly [number, number]>;
}

/** 입력과 같은 순서 — value null = 대상 밖(profile 이 Q16 · N · A 가 아님 · 다른 거래소 조각). */
export interface LaunchQueueOut {
  piece: LaunchQueuePieceIn;
  value: LaunchPieceQueue | null;
}

/** 대기열 방식 profile(보드 G4). */
export const LAUNCH_QUEUE_PROFILES = ["Q16"] as const;
/** 체결 런 방식 profile(보드 G1). */
export const LAUNCH_RUN_PROFILES = ["N", "A"] as const;

const QUEUE_BOARD = "G4";
const RUN_BOARD = "G1";
/** QuoteHeader(A3 · B6) 의 isin 오프셋(team-day.ts `ISIN_OFF_QUOTE` 와 같다). */
const ISIN_OFF_QUOTE = 17;
const BS_BUY = 50; // '2'
const BS_SELL = 49; // '1'
const ONE_SEC_NS = 1_000_000_000n;

function emptyValue(kind: LaunchPieceQueue["kind"], orderEst = false): LaunchPieceQueue {
  return {
    kind,
    matched: false,
    rank: null,
    ahead_n: null,
    ahead_qty: null,
    ahead_amt: null,
    end_state: null,
    end_n: null,
    end_qty: null,
    end_amt: null,
    fill_qty: null,
    fill_px_min: null,
    fill_px_max: null,
    order_est: orderEst,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 순수 코어 ① — FIFO 대기열 재생
// ─────────────────────────────────────────────────────────────────────────────

/** 레벨 재생 사건 — B = 그 가격 단 B6(잔량 · 더 좋은 단 잔량 · 금액) · A = 그 가격 A3 체결 수량. */
export type QueueEvent =
  | { k: "B"; cur: number; betterQty: number; betterAmt: number }
  | { k: "A"; qty: number };

/** 재생된 주문 하나(증가 이벤트 하나). */
export interface FifoOrder {
  /** 추가 번호(1부터) = 순번 */
  n: number;
  /** 증가분 = 주문 수량 */
  qty: number;
  /** 마감 때 남은 수량 */
  rem: number;
  /** FIFO 체결 소진 합 */
  filled: number;
  /** 0 으로 만든 사건 — 마감 전에 0 이 아니면 null */
  zeroBy: "fill" | "cancel" | null;
  /** 직전 B6 의 그 가격 잔량(첫 B6 이면 0) */
  prevCur: number;
  /** 직전 B6 의 더 좋은 가격 단 잔량 합 · 금액 합 */
  prevBetterQty: number;
  prevBetterAmt: number;
}

export interface FifoStats {
  adds: number;
  /** 체결 이벤트 수(쌓인 체결을 소진한 감소 수) */
  fills: number;
  cancelExact: number;
  cancelAmbig: number;
  cancelNone: number;
}

export interface FifoReplay {
  orders: FifoOrder[];
  stats: FifoStats;
  /** 재생한 B6 수(0 = 레벨에 B6 없음) */
  b6: number;
}

/** 사건 열 → FIFO 대기열 재구성(규칙은 파일 머리 주석 16:00). */
export function fifoReplay(events: Iterable<QueueEvent>): FifoReplay {
  const orders: FifoOrder[] = [];
  const stats: FifoStats = { adds: 0, fills: 0, cancelExact: 0, cancelAmbig: 0, cancelNone: 0 };
  let prevCur = 0;
  let prevBetterQty = 0;
  let prevBetterAmt = 0;
  let pend = 0;
  let b6 = 0;
  let head = 0; // rem > 0 인 첫 주문 후보(앞쪽 0 주문 건너뛰기)
  for (const ev of events) {
    if (ev.k === "A") {
      pend += ev.qty;
      continue;
    }
    b6 += 1;
    const d = ev.cur - prevCur;
    if (d > 0) {
      orders.push({
        n: orders.length + 1,
        qty: d,
        rem: d,
        filled: 0,
        zeroBy: null,
        prevCur,
        prevBetterQty,
        prevBetterAmt,
      });
      stats.adds += 1;
    } else if (d < 0) {
      let dd = -d;
      const take = Math.min(dd, pend);
      pend -= take;
      dd -= take;
      if (take > 0) {
        stats.fills += 1;
        let t = take;
        for (let i = head; i < orders.length && t > 0; i++) {
          const o = orders[i]!;
          if (o.rem <= 0) continue;
          const x = Math.min(o.rem, t);
          o.rem -= x;
          o.filled += x;
          t -= x;
          if (o.rem === 0) o.zeroBy = "fill";
        }
        while (head < orders.length && orders[head]!.rem <= 0) head += 1;
      }
      if (dd > 0) {
        let hit = -1;
        let hits = 0;
        for (let i = head; i < orders.length; i++) {
          if (orders[i]!.rem === dd) {
            hit = i;
            hits += 1;
          }
        }
        if (hits === 0) stats.cancelNone += 1;
        else {
          if (hits === 1) stats.cancelExact += 1;
          else stats.cancelAmbig += 1;
          const o = orders[hit]!; // 여럿이면 가장 뒤
          o.rem = 0;
          o.zeroBy = "cancel";
          while (head < orders.length && orders[head]!.rem <= 0) head += 1;
        }
      }
    }
    prevCur = ev.cur;
    prevBetterQty = ev.betterQty;
    prevBetterAmt = ev.betterAmt;
  }
  return { orders, stats, b6 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 순수 코어 ② — 조각 ↔ 증가 이벤트 짝짓기(게이트웨이 순서 = 성립성)
// ─────────────────────────────────────────────────────────────────────────────

/** 한 게이트웨이의 조각 수량(wire 순). */
export interface QueueGroup {
  gateway: string;
  qtys: readonly number[];
}

/** 짝 결과 — `at[g][i]` = groups[g] 의 i 번째 조각이 짝진 주문 색인(0부터 · 못 찾으면 -1). */
export interface QueueMatch {
  at: number[][];
  /** 같은 최선 짝 수를 내는 게이트웨이 순서가 둘 이상 — LAUNCH_ORDER 로 가정했다 */
  est: boolean;
}

/** LAUNCH_ORDER 의 게이트웨이 순서(중복 제거) — 모르는 게이트웨이는 뒤(이름순). */
function gatewayRank(g: string): number {
  const order: string[] = [];
  for (const [gw] of LAUNCH_ORDER) if (!order.includes(gw)) order.push(gw);
  const i = order.indexOf(g);
  return i >= 0 ? i : order.length;
}

function permutationsOf(n: number): number[][] {
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)];
  const out: number[][] = [];
  const rec = (pre: number[], rest: number[]): void => {
    if (rest.length === 0) {
      out.push(pre);
      return;
    }
    for (let i = 0; i < rest.length; i++) rec([...pre, rest[i]!], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

/**
 * 증가 이벤트 수량 열 · 게이트웨이별 조각 → 짝. 순열(LAUNCH_ORDER 를 기준 순서로 사전순)마다 이어 붙인 조각 열을
 * 증가 열의 부분열로 앞에서부터 짝짓고(못 찾으면 -1 · 다음 조각은 직전 짝 위치에서 계속), 짝 수가 가장 많은 순열 중
 * 첫 것을 고른다. 최선 순열이 둘 이상이면 est.
 */
export function matchQueuePieces(addQtys: readonly number[], groups: readonly QueueGroup[]): QueueMatch {
  const base = groups
    .map((_, i) => i)
    .sort((x, y) => gatewayRank(groups[x]!.gateway) - gatewayRank(groups[y]!.gateway) ||
      (groups[x]!.gateway < groups[y]!.gateway ? -1 : groups[x]!.gateway > groups[y]!.gateway ? 1 : x - y));
  let best: number[][] | null = null;
  let bestCount = -1;
  let ties = 0;
  for (const perm of permutationsOf(base.length)) {
    const at: number[][] = groups.map((g) => new Array<number>(g.qtys.length).fill(-1));
    let pos = 0;
    let count = 0;
    for (const pi of perm) {
      const g = base[pi]!;
      const qs = groups[g]!.qtys;
      for (let i = 0; i < qs.length; i++) {
        let k = pos;
        while (k < addQtys.length && addQtys[k] !== qs[i]) k += 1;
        if (k < addQtys.length) {
          at[g]![i] = k;
          pos = k + 1;
          count += 1;
        }
      }
    }
    if (count > bestCount) {
      best = at;
      bestCount = count;
      ties = 1;
    } else if (count === bestCount) ties += 1;
  }
  return { at: best ?? [], est: ties > 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 순수 코어 ③ — 공격 주문 체결 런
// ─────────────────────────────────────────────────────────────────────────────

/** 한 보드 · 한 ISIN 거래소순 행 — a3 false = B6(런을 끊는다). tNs = 체결 시각(못 읽으면 수신). */
export interface RunRowIn {
  a3: boolean;
  seq: number;
  /** final_bs_code 문자 코드 — '2' 50 매수 · '1' 49 매도 */
  bs: number;
  px: number;
  qty: number;
  tNs: bigint;
}

/** 체결 런 하나 — 시작 = 첫 A3 시각. */
export interface AggressorRun {
  bs: number;
  startNs: bigint;
  px: number[];
  qty: number[];
}

/** 행 열 → 체결 런(직전도 A3 ∧ seq 연속 ∧ 같은 bs 면 같은 런). */
export function aggressorRunsOf(rows: Iterable<RunRowIn>): AggressorRun[] {
  const out: AggressorRun[] = [];
  let cur: AggressorRun | null = null;
  let prevSeq = Number.NaN;
  let prevBs = -1;
  for (const r of rows) {
    if (!r.a3) {
      cur = null;
      continue;
    }
    if (cur !== null && r.seq === prevSeq + 1 && r.bs === prevBs) {
      cur.px.push(r.px);
      cur.qty.push(r.qty);
    } else {
      cur = { bs: r.bs, startNs: r.tNs, px: [r.px], qty: [r.qty] };
      out.push(cur);
    }
    prevSeq = r.seq;
    prevBs = r.bs;
  }
  return out;
}

/** 런 위치 입력 — 조각 방향 · 기준시각 ns · 지정가 · 우리 체결 열. */
export interface RunPieceIn {
  side: "buy" | "sell";
  baseNs: bigint;
  price: number;
  fills: ReadonlyArray<readonly [number, number]>;
}

function inLimitOf(run: AggressorRun, side: "buy" | "sell", price: number): { qty: number; amt: number } {
  let qty = 0;
  let amt = 0;
  for (let i = 0; i < run.px.length; i++) {
    const px = run.px[i]!;
    if (side === "buy" ? px <= price : px >= price) {
      qty += run.qty[i]!;
      amt += px * run.qty[i]!;
    }
  }
  return { qty, amt };
}

function sameFills(run: AggressorRun, fills: ReadonlyArray<readonly [number, number]>): boolean {
  if (run.px.length !== fills.length) return false;
  for (let i = 0; i < fills.length; i++) if (run.px[i] !== fills[i]![0] || run.qty[i] !== fills[i]![1]) return false;
  return true;
}

/**
 * 체결 런 방식 값(규칙은 파일 머리 주석 09:00). `taken` = 런 점유 표식(조각끼리 공유 · 짝지으면 1 로 바꾼다).
 */
export function runValueOf(runs: readonly AggressorRun[], taken: Uint8Array, p: RunPieceIn): LaunchPieceQueue {
  const bs = p.side === "buy" ? BS_BUY : BS_SELL;
  const cands: number[] = [];
  for (let i = 0; i < runs.length; i++) if (runs[i]!.bs === bs && runs[i]!.startNs >= p.baseNs) cands.push(i);
  const v = emptyValue("run");
  if (p.fills.length > 0) {
    let at = -1;
    for (let c = 0; c < cands.length; c++) {
      const i = cands[c]!;
      if (taken[i] === 1 || !sameFills(runs[i]!, p.fills)) continue;
      at = c;
      break;
    }
    if (at < 0) return v;
    taken[cands[at]!] = 1;
    let n = 0;
    let qty = 0;
    let amt = 0;
    for (let c = 0; c < at; c++) {
      const s = inLimitOf(runs[cands[c]!]!, p.side, p.price);
      if (s.qty > 0) n += 1;
      qty += s.qty;
      amt += s.amt;
    }
    let fq = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [px, q] of p.fills) {
      fq += q;
      if (px < lo) lo = px;
      if (px > hi) hi = px;
    }
    return {
      ...v,
      matched: true,
      rank: at + 1,
      ahead_n: n,
      ahead_qty: qty,
      ahead_amt: amt,
      fill_qty: fq,
      fill_px_min: lo,
      fill_px_max: hi,
    };
  }
  const end = p.baseNs + ONE_SEC_NS;
  let n = 0;
  let qty = 0;
  let amt = 0;
  for (const i of cands) {
    if (runs[i]!.startNs >= end) continue;
    const s = inLimitOf(runs[i]!, p.side, p.price);
    if (s.qty > 0) n += 1;
    qty += s.qty;
    amt += s.amt;
  }
  return { ...v, matched: true, ahead_n: n, ahead_qty: qty, ahead_amt: amt, fill_qty: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 격자 바이트 → 값
// ─────────────────────────────────────────────────────────────────────────────

interface GridCtx {
  buf: Uint8Array;
  index: TickIndex;
  exOrder: Int32Array;
  a3: A3Columns;
  a3Of: Int32Array;
  isinBytes: Uint8Array;
  date: string;
}

function ctxOf(buf: Uint8Array, ex: TickExchange, date: string, isin: string): GridCtx {
  const index = buildTickIndex(buf, ex === "NXT" ? "nxt" : "krx");
  const exOrder = exchangeOrderOf(index, recvOrderOf(index));
  const a3 = a3ColumnsOf(buf, index);
  const a3Of = new Int32Array(index.n).fill(-1);
  for (let j = 0; j < a3.n; j++) a3Of[a3.rec[j]!] = j;
  const isinBytes = new Uint8Array(12);
  for (let i = 0; i < 12; i++) isinBytes[i] = isin.charCodeAt(i) || 32;
  return { buf, index, exOrder, a3, a3Of, isinBytes, date };
}

function isinIs(ctx: GridCtx, rec: number): boolean {
  const o = ctx.index.off[rec]! + ISIN_OFF_QUOTE;
  for (let i = 0; i < 12; i++) if (ctx.buf[o + i] !== ctx.isinBytes[i]) return false;
  return true;
}

function baseNsOf(fireBase: string, date: string): bigint {
  const t = parseTickTime(fireBase, date);
  if (t === null) throw new RangeError(`launch-queue: 기준시각 '${fireBase}' · 날짜 '${date}' 를 읽을 수 없다`);
  return t;
}

/** 레벨 하나(방향 · 가격 · 기준시각)의 G4 사건 열(거래소순) — 지연 생성. */
function* levelEvents(ctx: GridCtx, side: "buy" | "sell", price: number, baseNs: bigint): Generator<QueueEvent> {
  const { index, exOrder, a3, a3Of } = ctx;
  const board = index.boards.indexOf(QUEUE_BOARD);
  if (board < 0) return;
  for (let p = 0; p < exOrder.length; p++) {
    const r = exOrder[p]!;
    if (index.board[r] !== board || index.ok[r] !== 1 || index.recvNs[r]! < baseNs) continue;
    const t = index.tag[r];
    if (t === TAG_CODE.A3) {
      const j = a3Of[r]!;
      if (j < 0 || !isinIs(ctx, r)) continue;
      if (a3.px[j] === price) yield { k: "A", qty: a3.qty[j]! };
    } else if (t === TAG_CODE.B6) {
      if (!isinIs(ctx, r)) continue;
      const book = bookAt(ctx.buf, index, r);
      if (!book) continue;
      const levels = side === "buy" ? book.bids : book.asks;
      let cur = 0;
      let betterQty = 0;
      let betterAmt = 0;
      for (const l of levels) {
        if (!(l.qty > 0) || !(l.px > 0)) continue;
        if (l.px === price) cur += l.qty;
        else if (side === "buy" ? l.px > price : l.px < price) {
          betterQty += l.qty;
          betterAmt += l.qty * l.px;
        }
      }
      yield { k: "B", cur, betterQty, betterAmt };
    }
  }
}

/** 레벨 재생(테스트 · 진단용 공개) — 그 격자에서 (isin, 방향, 가격, 기준시각) 레벨의 FIFO 재생 결과. */
export function q16LevelOf(
  buf: Uint8Array,
  ex: TickExchange,
  date: string,
  level: { isin: string; side: "buy" | "sell"; price: number; fire_base: string },
): FifoReplay {
  const ctx = ctxOf(buf, ex, date, level.isin);
  return fifoReplay(levelEvents(ctx, level.side, level.price, baseNsOf(level.fire_base, date)));
}

function queueValuesOf(ctx: GridCtx, pieces: readonly LaunchQueuePieceIn[], idx: number[], out: LaunchQueueOut[]): void {
  // 레벨 = (방향, 가격, 기준시각)
  const levels = new Map<string, number[]>();
  for (const i of idx) {
    const p = pieces[i]!;
    const key = `${p.side}|${p.price}|${p.fire_base}`;
    const list = levels.get(key);
    if (list) list.push(i);
    else levels.set(key, [i]);
  }
  for (const list of levels.values()) {
    const p0 = pieces[list[0]!]!;
    const P = p0.price;
    const rp = fifoReplay(levelEvents(ctx, p0.side, P, baseNsOf(p0.fire_base, ctx.date)));
    if (rp.b6 === 0) {
      for (const i of list) out[i] = { piece: pieces[i]!, value: emptyValue("queue") };
      continue;
    }
    // 게이트웨이별 wire 순
    const byGw = new Map<string, number[]>();
    for (const i of list) {
      const g = pieces[i]!.gateway;
      const l = byGw.get(g);
      if (l) l.push(i);
      else byGw.set(g, [i]);
    }
    const gws = [...byGw.keys()];
    const members = gws.map((g) => byGw.get(g)!.sort((x, y) => pieces[x]!.wire - pieces[y]!.wire));
    const m = matchQueuePieces(
      rp.orders.map((o) => o.qty),
      gws.map((g, gi) => ({ gateway: g, qtys: members[gi]!.map((i) => pieces[i]!.qty) })),
    );
    for (let gi = 0; gi < gws.length; gi++) {
      const mem = members[gi]!;
      for (let k = 0; k < mem.length; k++) {
        const i = mem[k]!;
        const at = m.at[gi]![k]!;
        if (at < 0) {
          out[i] = { piece: pieces[i]!, value: emptyValue("queue", m.est) };
          continue;
        }
        const o = rp.orders[at]!;
        const v: LaunchPieceQueue = {
          ...emptyValue("queue", m.est),
          matched: true,
          rank: o.n,
          ahead_qty: o.prevCur + o.prevBetterQty,
          ahead_amt: o.prevCur * P + o.prevBetterAmt,
        };
        if (o.rem <= 0) {
          v.end_state = o.zeroBy === "fill" ? "filled" : "cancelled";
        } else {
          let n = 0;
          let q = 0;
          for (let a = 0; a < at; a++) {
            const r = rp.orders[a]!.rem;
            if (r > 0) {
              n += 1;
              q += r;
            }
          }
          v.end_state = "open";
          v.end_n = n;
          v.end_qty = q;
          v.end_amt = q * P;
        }
        out[i] = { piece: pieces[i]!, value: v };
      }
    }
  }
}

function runRowsOf(ctx: GridCtx): RunRowIn[] {
  const { index, exOrder, a3, a3Of } = ctx;
  const board = index.boards.indexOf(RUN_BOARD);
  const rows: RunRowIn[] = [];
  if (board < 0) return rows;
  for (let p = 0; p < exOrder.length; p++) {
    const r = exOrder[p]!;
    if (index.board[r] !== board || index.ok[r] !== 1) continue;
    const t = index.tag[r];
    if (t === TAG_CODE.A3) {
      const j = a3Of[r]!;
      if (j < 0 || !isinIs(ctx, r)) continue;
      const tNs = a3.tNs[j]!;
      rows.push({ a3: true, seq: a3.seq[j]!, bs: a3.bs[j]!, px: a3.px[j]!, qty: a3.qty[j]!, tNs: tNs === -1n ? index.recvNs[r]! : tNs });
    } else if (t === TAG_CODE.B6) {
      if (!isinIs(ctx, r)) continue;
      rows.push({ a3: false, seq: index.seq[r]!, bs: 32, px: 0, qty: 0, tNs: index.recvNs[r]! });
    }
  }
  return rows;
}

function runValuesOf(ctx: GridCtx, pieces: readonly LaunchQueuePieceIn[], idx: number[], out: LaunchQueueOut[]): void {
  const runs = aggressorRunsOf(runRowsOf(ctx));
  const taken = new Uint8Array(runs.length);
  const order = [...idx].sort((x, y) => {
    const a = pieces[x]!;
    const b = pieces[y]!;
    return (
      (a.fire_base < b.fire_base ? -1 : a.fire_base > b.fire_base ? 1 : 0) ||
      gatewayRank(a.gateway) - gatewayRank(b.gateway) ||
      (a.gateway < b.gateway ? -1 : a.gateway > b.gateway ? 1 : 0) ||
      a.wire - b.wire
    );
  });
  for (const i of order) {
    const p = pieces[i]!;
    const v = runValueOf(runs, taken, {
      side: p.side,
      baseNs: baseNsOf(p.fire_base, ctx.date),
      price: p.price,
      fills: p.fills,
    });
    out[i] = { piece: p, value: v };
  }
}

/**
 * 해제된 격자 바이트(한 ISIN · 한 거래소) + 그날 그 (ISIN, 거래소) 접수 조각 → 조각별 대기열 · 체결 런 값(입력 순서).
 * `date` = `YYYYMMDD`. 조각 isin 이 하나가 아니면 RangeError. profile Q16 → 대기열(G4) · N/A → 체결 런(G1) · 그 밖 ·
 * 다른 거래소 조각은 value null.
 */
export function launchQueueOf(
  buf: Uint8Array,
  ex: TickExchange,
  date: string,
  pieces: readonly LaunchQueuePieceIn[],
): LaunchQueueOut[] {
  const out: LaunchQueueOut[] = pieces.map((piece) => ({ piece, value: null }));
  if (pieces.length === 0) return out;
  const isin = pieces[0]!.isin;
  for (const p of pieces) {
    if (p.isin !== isin) throw new RangeError(`launchQueueOf: 조각 ISIN 이 하나가 아니다(${isin} · ${p.isin})`);
  }
  const queueIdx: number[] = [];
  const runIdx: number[] = [];
  pieces.forEach((p, i) => {
    if (p.fire_exchange !== ex) return;
    if ((LAUNCH_QUEUE_PROFILES as readonly string[]).includes(p.profile)) queueIdx.push(i);
    else if ((LAUNCH_RUN_PROFILES as readonly string[]).includes(p.profile)) runIdx.push(i);
  });
  if (queueIdx.length === 0 && runIdx.length === 0) return out;
  const ctx = ctxOf(buf, ex, date, isin);
  if (queueIdx.length > 0) queueValuesOf(ctx, pieces, queueIdx, out);
  if (runIdx.length > 0) runValuesOf(ctx, pieces, runIdx, out);
  return out;
}
