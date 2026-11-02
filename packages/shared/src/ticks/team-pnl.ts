/**
 * Phase 37 (D-10 · D-12) 팀 당일 손익 — gh-trade tickana `teamflow.team_pnl` 평균단가법을 한 줄씩 옮긴 순수 함수 + 선택 틱까지의
 * 손익을 O(log n) 으로 내는 접두 상태 배열.
 *
 * 정본(2026-11-02 원문 — 어긋나면 함수 이름으로 찾는다):
 *   gh-trade server/tools/analysis/tickana/teamflow.py:650-699 team_pnl
 *   gh-trade server/tools/analysis/tickana/teamflow.py:259-277 analyze_stock — last_px = 입력 마지막 행 px(teamflow 범위)
 *   gh-trade server/tools/analysis/tickana/teamflow_accum.py:470-485 — last_px = (t, seq) 순 마지막 행 px(accum 범위)
 *   gh-trade docs/analysis/team-flow.md §5-1 평균단가법 · §11 payload.pnl 13키
 *
 * 대상: 팀 주문(classifyKrxOrders 의 team) 중 연속매매 체결(bs '2' 매수 · '1' 매도). 상한가 가격 포함 · 단일가 제외.
 * 방법: 잔량 0 에서 시작 · 체결 시각순(같은 시각은 입력 = 범위 순서 그대로 — 안정 정렬) 평균단가법. 매도는 min(수량, 잔량)만
 * 평단 대비 실현, 초과분은 원가 미상 매도로 수량 · 금액만 센다. 미실현 = 끝 잔량 × last_px − 끝 원가.
 *
 * 정의 경계(D-12): 우리(KB · 교보 DMA) 체결을 **빼지 않는다** — A3 만으로 계산하므로 export payload.pnl 과 같은 정의다.
 * 호가로 걸어 둔 팀 주문(체결 안 된 몫)은 포함하지 않는다 — 최소치다. 중복 수신 전문도 제거하지 않는다(Pitfall 12).
 *
 * 반올림(Pitfall 8): 파이썬 `round` 는 은행가 반올림이다 — `Math.round` 를 쓰면 .5 경계에서 1원 어긋난다 → roundHalfEven.
 * 부동소수 연산은 파이썬 루프와 같은 순서 · 같은 식으로 한다(JS number = float64 = 파이썬 float) — 결과 비트가 같다.
 */
import { cmpTimeNullsLast, type A3Trade } from "./orders-krx";

/** export payload.pnl 13키 — 키 이름 · 순서 그대로(snake_case 유지 — 골든 비교 · 서버 export 와 같은 모양). */
export interface TeamPnl {
  buy_val: number;
  buy_qty: number;
  sell_val: number;
  sell_qty: number;
  realized_val: number;
  realized_qty: number;
  unrealized_val: number;
  total_val: number;
  ret: number | null;
  end_qty: number;
  end_cost_val: number;
  unknown_sell_qty: number;
  unknown_sell_val: number;
}

/** 팀 연속매매 체결 한 건. `rec` = 원본 레코드 색인. */
export interface TeamFill {
  rec: number;
  tNs: bigint | null;
  bs: "1" | "2";
  px: number;
  qty: number;
}

/** 파이썬 `round(x)`(은행가 반올림 — .5 는 짝수 쪽). -0 은 0 으로. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f; // |x| < 2^52 에서 정확
  const r = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
  return r === 0 ? 0 : r;
}

/**
 * 범위 입력(scopeTrades 결과) → 팀 연속매매 체결. `isTeam(i)` = 입력 i 번째 조각이 팀 주문인가(classifyKrxOrders 의
 * `orders[oidOf[i]].team`). 체결 시각 안정 정렬 · null 맨 뒤(pandas sort_values(kind="stable") · na_position="last").
 */
export function teamFillsOf(trades: readonly A3Trade[], isTeam: (i: number) => boolean): TeamFill[] {
  const out: TeamFill[] = [];
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]!;
    if (t.bs !== "1" && t.bs !== "2") continue;
    if (!isTeam(i)) continue;
    out.push({ rec: t.rec, tNs: t.tNs, bs: t.bs, px: t.px, qty: t.qty });
  }
  return out.sort((a, b) => cmpTimeNullsLast(a.tNs, b.tNs));
}

/** 평균단가법 상태 — 파이썬 루프 변수 그대로. */
interface PnlState {
  hold: number;
  cost: number;
  realized: number;
  buyQty: number;
  buyVal: number;
  sellQty: number;
  sellVal: number;
  unknownQty: number;
  unknownVal: number;
}

function zeroState(): PnlState {
  return { hold: 0, cost: 0, realized: 0, buyQty: 0, buyVal: 0, sellQty: 0, sellVal: 0, unknownQty: 0, unknownVal: 0 };
}

/** 체결 한 건을 상태에 반영 — teamflow.py team_pnl 루프 본문 한 줄씩. */
function step(s: PnlState, f: TeamFill): void {
  const px = f.px;
  const q = f.qty;
  if (f.bs === "2") {
    s.buyQty += q;
    s.buyVal += q * px;
    s.hold += q;
    s.cost += q * px;
    return;
  }
  s.sellQty += q;
  s.sellVal += q * px;
  const m = Math.min(q, s.hold);
  if (m > 0) {
    const avg = s.cost / s.hold;
    s.realized += m * (px - avg);
    s.cost -= m * avg;
    s.hold -= m;
    if (s.hold === 0) s.cost = 0; // 부동소수 찌꺼기 제거
  }
  s.unknownQty += q - m;
  s.unknownVal += (q - m) * px;
}

function pnlOfState(s: PnlState, lastPx: number): TeamPnl {
  const realizedVal = roundHalfEven(s.realized);
  const endCostVal = roundHalfEven(s.cost);
  const unrealizedVal = s.hold * lastPx - endCostVal;
  const totalVal = realizedVal + unrealizedVal;
  return {
    buy_val: s.buyVal,
    buy_qty: s.buyQty,
    sell_val: s.sellVal,
    sell_qty: s.sellQty,
    realized_val: realizedVal,
    realized_qty: s.sellQty - s.unknownQty,
    unrealized_val: unrealizedVal,
    total_val: totalVal,
    ret: s.buyVal ? totalVal / s.buyVal : null,
    end_qty: s.hold,
    end_cost_val: endCostVal,
    unknown_sell_qty: s.unknownQty,
    unknown_sell_val: s.unknownVal,
  };
}

/** 팀 당일 손익(13키). 팀 체결이 없으면 null. fills 는 teamFillsOf 순서(체결 시각순)여야 한다. */
export function teamPnlOf(fills: readonly TeamFill[], lastPx: number): TeamPnl | null {
  if (fills.length === 0) return null;
  const s = zeroState();
  for (const f of fills) step(s, f);
  return pnlOfState(s, lastPx);
}

/**
 * 접두 상태 배열 — 길이 n+1, k 번 = 앞 k 체결을 반영한 상태(0 번 = 시작 0). `tNs[k]` = k 번째 체결 시각(k ≥ 1 · null 시각은
 * int64 최대값 — 정렬상 맨 뒤) · `tNs[0]` = int64 최소값.
 */
export interface PnlPrefix {
  n: number;
  hold: Float64Array;
  cost: Float64Array;
  realized: Float64Array;
  buyQty: Float64Array;
  buyVal: Float64Array;
  sellQty: Float64Array;
  sellVal: Float64Array;
  unknownQty: Float64Array;
  unknownVal: Float64Array;
  tNs: BigInt64Array;
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

export function buildPnlPrefix(fills: readonly TeamFill[]): PnlPrefix {
  const n = fills.length;
  const mk = () => new Float64Array(n + 1);
  const p: PnlPrefix = {
    n,
    hold: mk(),
    cost: mk(),
    realized: mk(),
    buyQty: mk(),
    buyVal: mk(),
    sellQty: mk(),
    sellVal: mk(),
    unknownQty: mk(),
    unknownVal: mk(),
    tNs: new BigInt64Array(n + 1),
  };
  p.tNs[0] = I64_MIN;
  const s = zeroState();
  for (let k = 1; k <= n; k++) {
    const f = fills[k - 1]!;
    step(s, f);
    p.hold[k] = s.hold;
    p.cost[k] = s.cost;
    p.realized[k] = s.realized;
    p.buyQty[k] = s.buyQty;
    p.buyVal[k] = s.buyVal;
    p.sellQty[k] = s.sellQty;
    p.sellVal[k] = s.sellVal;
    p.unknownQty[k] = s.unknownQty;
    p.unknownVal[k] = s.unknownVal;
    p.tNs[k] = f.tNs ?? I64_MAX;
  }
  return p;
}

/** 체결 시각 ≤ tNs 인 팀 체결 수(이진 탐색 · O(log n)). pnlAt 의 k 로 쓴다. */
export function fillsUpTo(prefix: PnlPrefix, tNs: bigint): number {
  let lo = 0; // tNs[lo] ≤ T 가 언제나 참(tNs[0] = 최소값)
  let hi = prefix.n + 1; // 첫 > T 후보
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (prefix.tNs[mid]! <= tNs) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 앞 k 체결까지의 손익(13키 · teamPnlOf(앞 k 체결, lastPx) 와 같다) + 그 시점 평단(잔량 0 이면 null). k = 0 이면 pnl null. */
export function pnlAt(prefix: PnlPrefix, k: number, lastPx: number): { pnl: TeamPnl | null; avgPx: number | null } {
  if (k < 0 || k > prefix.n) throw new RangeError(`pnlAt: k=${k} 가 0..${prefix.n} 밖`);
  if (k === 0) return { pnl: null, avgPx: null };
  const s: PnlState = {
    hold: prefix.hold[k]!,
    cost: prefix.cost[k]!,
    realized: prefix.realized[k]!,
    buyQty: prefix.buyQty[k]!,
    buyVal: prefix.buyVal[k]!,
    sellQty: prefix.sellQty[k]!,
    sellVal: prefix.sellVal[k]!,
    unknownQty: prefix.unknownQty[k]!,
    unknownVal: prefix.unknownVal[k]!,
  };
  return { pnl: pnlOfState(s, lastPx), avgPx: s.hold > 0 ? s.cost / s.hold : null };
}
