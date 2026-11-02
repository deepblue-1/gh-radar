/**
 * 틱 뷰어 팀 모델 (Phase 37 D-10 · D-12 · D-13 · 37-14) — 세션의 주문 판정(team 표식)을 팀 체결 · 손익 접두 · 당일 계단 ·
 * 10분 막대 · 주문 원으로 한 번에 묶는다. (RED 뼈대 — GREEN 에서 구현)
 */

import { buildPnlPrefix, type PnlPrefix, type TeamFill, type TeamPnl } from '@gh-radar/shared';

import type { TickSession, ViewOrder, ViewScope } from './tick-session';

export interface TeamOrderPoint {
  order: ViewOrder;
  lastRec: number;
  tMs: number;
  px: number;
  val: number;
  qty: number;
  side: 'B' | 'S';
}

export interface TeamModel {
  scope: ViewScope;
  fills: TeamFill[];
  fillMs: Float64Array;
  prefix: PnlPrefix;
  runMaxNs: BigInt64Array;
  teamOrders: TeamOrderPoint[];
  dayStairs: { tMs: number; net: number; qty: number }[];
  buckets: { buy: Float64Array; sell: Float64Array };
}

export interface TeamKpi {
  pnl: TeamPnl | null;
  avgPx: number | null;
  dayNetVal: number;
  dayNetQty: number;
  lastPx: number | null;
  k: number;
}

export function buildTeamModel(session: TickSession): TeamModel {
  return {
    scope: session.scope,
    fills: [],
    fillMs: new Float64Array(0),
    prefix: buildPnlPrefix([]),
    runMaxNs: new BigInt64Array(0),
    teamOrders: [],
    dayStairs: [],
    buckets: { buy: new Float64Array(72), sell: new Float64Array(72) },
  };
}

export function teamKpiAt(_model: TeamModel, _session: TickSession, _rec: number): TeamKpi {
  return { pnl: null, avgPx: null, dayNetVal: 0, dayNetQty: 0, lastPx: null, k: 0 };
}

export function teamCirclesOf(_model: TeamModel, _minVal = 5_000_000): TeamOrderPoint[] {
  return [];
}
