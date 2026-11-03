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
import type { A3Columns, TickIndex } from "./record-index";

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
