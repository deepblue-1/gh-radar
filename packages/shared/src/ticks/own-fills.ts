/**
 * Phase 38 (D-15 · SC-2) — 우리 체결 → A3 짝짓기. 브라우저(전문 목록 · 차트 · 카드)와 오라클 테스트가 같은 함수를 쓴다.
 * server 는 틱 바이트를 만지지 않는다(저널 행만 내려준다 — 짝짓기는 틱 바이트가 있는 브라우저).
 *
 * 규칙(ROADMAP Phase 38 · RESEARCH Pattern 1 (a) — 이전 세션 probe 원문):
 *   - A3 시각 = 체결 시각 tNs(µs 절사 → ms 소수), 못 읽으면(-1n) 그 레코드 수신 시각 recvNs.
 *   - 후보 = 같은 가격 ∧ 그 A3 의 남은 수량 ≥ 우리 체결 수량 ∧ dt = (gw − A3 시각) ∈ [−200, +1500] ms.
 *   - 고르기 = |dt| 최소 · 동률이면 A3 열 색인(파일 순서) 작은 쪽(probe 의 안정 정렬과 같다).
 *   - 「추정」 = 후보 둘 이상 ∧ 첫째 · 둘째 후보의 |dt| 차 < 20 ms.
 *   - 배정한 만큼 그 A3 의 남은 수량을 깎는다 — 입력 순서 그대로 처리한다(정렬은 호출자 · RPC 순서 (gw_time, gateway, seq)).
 *   - 「우리 n / 전체 m」 의 m = 그 A3 수량(부분 체결이면 분모 표시).
 *
 * 정의를 바꾸지 마라 — 10/30 5종목 오라클(짝 401/406 · 추정 108)이 잠근다(RESEARCH Pitfall 1 · 2).
 * 「g ± 20 ms 안 후보 ≥ 2」 같은 다른 읽기는 108 을 재현하지 못한다.
 *
 * 성능: A3 ≤ 수십만 · 체결 ≤ 수백 — A3 시각 배열과 시각 오름차순 순열을 호출마다 한 번 만들고, 체결마다 이분 탐색으로
 * [g − 1500, g + 200] 창만 본다(전 A3 순회 금지). 행 객체를 만들지 않는다(typed array).
 */
import { bookAt } from "./book";
import { TAG_CODE, type A3Columns, type TickIndex } from "./record-index";
import { lowerBoundRecv } from "./tick-time";

/** dt = gw − A3 시각 의 하한(ms) — 게이트웨이 시각이 A3 보다 이만큼 앞설 수 있다. */
export const OWN_MATCH_DT_MIN_MS = -200;
/** dt 상한(ms) — A3 수신 뒤 게이트웨이 체결 통보까지의 최대 지연. */
export const OWN_MATCH_DT_MAX_MS = 1500;
/** 「추정」 판정 — 첫째 · 둘째 후보의 |dt| 차가 이보다 작으면 추정(ms). */
export const OWN_MATCH_EST_MS = 20;

/** 짝짓기 입력 한 건 — 우리 체결(gw 시각 epoch ms · 체결가 · 체결 수량). */
export interface OwnFillIn {
  gwMs: number;
  px: number;
  qty: number;
}

/**
 * 짝짓기 결과 한 건(입력과 같은 순서).
 * - `a3j` = A3 열 색인 · 못 찾으면 −1
 * - `est` = 「추정」(후보 ≥ 2 ∧ 첫째 · 둘째 |dt| 차 < 20 ms)
 * - `candidates` = 후보 수(남은 수량 조건 포함)
 * - `dtMs` = gw − 고른 A3 시각(ms) · 못 찾으면 NaN
 */
export interface OwnFillMatch {
  a3j: number;
  est: boolean;
  candidates: number;
  dtMs: number;
}

/** A3 j 의 시각(epoch ms · 소수) — 체결 시각 tNs, 못 읽으면(-1n) 그 레코드 수신 시각. µs 절사 뒤 ms 로(probe 식 그대로). */
export function a3TimeMs(index: TickIndex, a3: A3Columns, j: number): number {
  const t = a3.tNs[j]!;
  return t !== -1n ? Number(t / 1000n) / 1000 : Number(index.recvNs[a3.rec[j]!]! / 1000n) / 1000;
}

/** 오름차순 times(순열 by 경유)에서 첫 times[by[p]] >= t 인 p. */
function lowerBoundMs(times: Float64Array, by: Int32Array, t: number): number {
  let lo = 0;
  let hi = by.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[by[mid]!]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** (|dt|, j) 사전순 비교 — a 가 b 보다 앞이면 true. */
function before(absA: number, ja: number, absB: number, jb: number): boolean {
  return absA < absB || (absA === absB && ja < jb);
}

/**
 * 우리 체결 → A3 짝짓기(규칙은 파일 머리 주석). 입력 순서 그대로 처리 · 결과도 같은 순서.
 * A3 남은 수량은 이 호출 안에서만 깎인다(a3 열은 바꾸지 않는다).
 */
export function matchOwnFills(index: TickIndex, a3: A3Columns, fills: readonly OwnFillIn[]): OwnFillMatch[] {
  const n = a3.n;
  const times = new Float64Array(n);
  for (let j = 0; j < n; j++) times[j] = a3TimeMs(index, a3, j);
  const by = new Int32Array(n);
  for (let j = 0; j < n; j++) by[j] = j;
  by.sort((a, b) => times[a]! - times[b]! || a - b);
  const left = Float64Array.from(a3.qty);

  const out: OwnFillMatch[] = new Array(fills.length);
  for (let i = 0; i < fills.length; i++) {
    const f = fills[i]!;
    const g = f.gwMs;
    // 창 = A3 시각 ∈ [g − 1500, g + 200]. 부동소수 경계는 1ms 넓게 훑고 dt 를 정확히 다시 잰다.
    let p = lowerBoundMs(times, by, g - OWN_MATCH_DT_MAX_MS - 1);
    const tEnd = g - OWN_MATCH_DT_MIN_MS + 1;
    let candidates = 0;
    let bestJ = -1;
    let bestAbs = Infinity;
    let secondJ = -1;
    let secondAbs = Infinity;
    for (; p < n; p++) {
      const j = by[p]!;
      const t = times[j]!;
      if (t > tEnd) break;
      const dt = g - t;
      if (dt < OWN_MATCH_DT_MIN_MS || dt > OWN_MATCH_DT_MAX_MS) continue;
      if (a3.px[j] !== f.px || left[j]! < f.qty) continue;
      candidates += 1;
      const abs = Math.abs(dt);
      if (bestJ < 0 || before(abs, j, bestAbs, bestJ)) {
        secondJ = bestJ;
        secondAbs = bestAbs;
        bestJ = j;
        bestAbs = abs;
      } else if (secondJ < 0 || before(abs, j, secondAbs, secondJ)) {
        secondJ = j;
        secondAbs = abs;
      }
    }
    if (bestJ < 0) {
      out[i] = { a3j: -1, est: false, candidates: 0, dtMs: Number.NaN };
      continue;
    }
    const est = candidates > 1 && Math.abs(bestAbs - secondAbs) < OWN_MATCH_EST_MS;
    left[bestJ] = left[bestJ]! - f.qty;
    out[i] = { a3j: bestJ, est, candidates, dtMs: g - times[bestJ]! };
  }
  return out;
}

/*
 * ─── 조건 근거 · 앵커 (Phase 38 D-11 · D-13 · D-15 · SC-3) ───────────────────────────────────────────────────────
 *
 * 「이 주문은 이 전문을 보고 나갔다」 의 「이 전문」 을 정한다. 규칙(ROADMAP Phase 38 · RESEARCH Pattern 1 (b) —
 * 이전 세션 own-trigger probe 원문):
 *   - 호가 근거(ev_kind 1): 수신 ms(µs 절사 → ms 소수) ∈ [g − 3000, g + 50] 인 B6(ok)를 수신순으로 훑어, 그 호가의
 *     매수 단 다음 매도 단 순으로 가격 == ev_price 인 첫 단의 잔량 == ev_qty_after 이면 그 B6 — 창 안 **마지막** 일치.
 *   - 체결 근거(ev_kind 2) 단건: cumVolume == ev_qty_after ∧ 수량 == ev_trade_qty ∧ 가격 == ev_price 인 A3 가 정확히 하나.
 *     그 밖 ev_qty_after > ev_qty_before 이면 cumVolume ∈ (before, after] 인 A3 첫 … 끝 구간(주기매도 — D-11).
 *     before = after = 0(또는 구간에 A3 없음)이면 근거 없음(D-13 — 앵커만).
 *   - ev_kind 0 · 3 · 그 밖 = 근거 없음(ev_kind 3 체결통보는 웹 모델이 우리 체결로 잇는다 — 38-06 · RESEARCH Open Q3).
 *   - 앵커(cum_volume > 0): cumVolume == cum_volume 인 A3 중 **마지막** j = 「주문 직전 마지막 체결」.
 *
 * 정의를 바꾸지 마라 — 10/30 5종목 오라클(호가 근거 29/29 · 체결 단건 2 · 구간 9 · 없음 2 · 앵커 100/100)이 잠근다.
 * 창 · 「마지막 일치」 · 구간 (before, after] 를 수치에 맞추려고 고치지 말고, 다르면 멈추고 보고한다.
 */

/** 호가 근거 창 하한 — 이벤트 시각 g 보다 이만큼 앞선 B6 까지(ms). */
export const OWN_B6_BEFORE_MS = 3000;
/** 호가 근거 창 상한 — 이벤트 시각 g 보다 이만큼 늦은 B6 까지(ms · 게이트웨이 시각이 수신보다 앞설 수 있다). */
export const OWN_B6_AFTER_MS = 50;

/** 근거 특정 입력 한 건 — 전략 이벤트(gw 시각 epoch ms · ev_kind · ev_price · ev_qty_before/after · ev_trade_qty). */
export interface OwnEventIn {
  gwMs: number;
  evKind: number;
  evPrice: number;
  evQtyBefore: number;
  evQtyAfter: number;
  evTradeQty: number;
}

/**
 * 근거 특정 결과.
 * - `b6` = 호가 근거 B6 rec
 * - `a3` = 체결 근거 단건 A3 열 색인 j
 * - `range` = 주기매도 구간 — cumVolume ∈ (before, after] A3 의 최소 j · 최대 j · 개수 · 수량 합
 * - `none` = 근거 없음(앵커만 · 있으면)
 */
export type OwnEvidence =
  | { kind: "b6"; rec: number }
  | { kind: "a3"; j: number }
  | { kind: "range"; firstJ: number; lastJ: number; n: number; qty: number }
  | { kind: "none" };

const NONE: OwnEvidence = { kind: "none" };

/**
 * 누적거래량 → A3 열 색인 목록(j 오름차순). cumVolume > 0 인 A3 만. 근거 · 앵커 조회용 — 호출자가 세션당 한 번 만든다.
 */
export function cumIndexOf(a3: A3Columns): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let j = 0; j < a3.n; j++) {
    const c = a3.cumVolume[j]!;
    if (!(c > 0)) continue;
    const list = m.get(c);
    if (list) list.push(j);
    else m.set(c, [j]);
  }
  return m;
}

/** 레코드 수신 ms(소수) — probe 식 그대로 µs 절사 뒤 ms. */
function recvMsOf(index: TickIndex, rec: number): number {
  return Number(index.recvNs[rec]! / 1000n) / 1000;
}

/** 호가 근거(ev_kind 1) — 창 [g − 3000, g + 50] 안 B6(ok) 중 ev_price 단 잔량 == ev_qty_after 인 마지막 B6 rec · 없으면 −1. */
function locateBookEvidence(buf: Uint8Array, index: TickIndex, recvOrder: Int32Array, ev: OwnEventIn): number {
  const lo = ev.gwMs - OWN_B6_BEFORE_MS;
  const hi = ev.gwMs + OWN_B6_AFTER_MS;
  // 시작 자리 = 수신 ≥ lo 인 첫 자리(µs 내림이라 경계 한 칸 앞에서 시작할 수 있다 — 아래에서 ms 로 다시 잰다).
  let p = lowerBoundRecv(index.recvNs, recvOrder, BigInt(Math.floor(lo * 1000)) * 1000n);
  let found = -1;
  for (; p < recvOrder.length; p++) {
    const rec = recvOrder[p]!;
    const r = recvMsOf(index, rec);
    if (r > hi) break;
    if (r < lo) continue;
    if (index.tag[rec] !== TAG_CODE.B6 || index.ok[rec] !== 1) continue;
    const book = bookAt(buf, index, rec);
    if (!book) continue;
    let lvl = book.bids.find((l) => l.px === ev.evPrice);
    if (!lvl) lvl = book.asks.find((l) => l.px === ev.evPrice);
    if (lvl && lvl.qty === ev.evQtyAfter) found = rec; // 덮어씀 → 창 안 마지막 일치
  }
  return found;
}

/**
 * 조건 근거 특정(규칙은 위 머리 주석). `recvOrder` = `recvOrderOf(index)` · `cumIdx` = `cumIndexOf(a3)` — 둘 다 세션당 한 번.
 */
export function locateEvidence(
  buf: Uint8Array,
  index: TickIndex,
  recvOrder: Int32Array,
  a3: A3Columns,
  cumIdx: Map<number, number[]>,
  ev: OwnEventIn,
): OwnEvidence {
  if (ev.evKind === 1) {
    const rec = locateBookEvidence(buf, index, recvOrder, ev);
    return rec >= 0 ? { kind: "b6", rec } : NONE;
  }
  void a3;
  void cumIdx;
  return NONE;
}
