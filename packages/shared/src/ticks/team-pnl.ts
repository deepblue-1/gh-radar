/**
 * Phase 37 (D-10) 팀 평균단가법 손익 — 뼈대(RED). 구현은 GREEN 커밋.
 */
import type { A3Trade } from "./orders-krx";

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

export interface TeamFill {
  rec: number;
  tNs: bigint | null;
  bs: "1" | "2";
  px: number;
  qty: number;
}

export function roundHalfEven(x: number): number {
  return x;
}

export function teamFillsOf(_trades: readonly A3Trade[], _isTeam: (i: number) => boolean): TeamFill[] {
  return [];
}

export function teamPnlOf(_fills: readonly TeamFill[], _lastPx: number): TeamPnl | null {
  return null;
}

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

export function buildPnlPrefix(_fills: readonly TeamFill[]): PnlPrefix {
  const z = () => new Float64Array(1);
  return {
    n: 0, hold: z(), cost: z(), realized: z(), buyQty: z(), buyVal: z(), sellQty: z(), sellVal: z(), unknownQty: z(),
    unknownVal: z(), tNs: new BigInt64Array(1),
  };
}

export function fillsUpTo(_prefix: PnlPrefix, _tNs: bigint): number {
  return 0;
}

export function pnlAt(_prefix: PnlPrefix, _k: number, _lastPx: number): { pnl: TeamPnl | null; avgPx: number | null } {
  return { pnl: null, avgPx: null };
}
