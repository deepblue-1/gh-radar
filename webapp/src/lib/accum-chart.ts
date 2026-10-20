/**
 * 골격(RED) — 시그니처만. 구현은 GREEN 커밋.
 */

import type { AccumReportOrders, AccumReportPrice } from '@gh-radar/shared';

export const ACCUM_CHART = { R: 0, TOP: 0, H1: 0, GAP: 0, H2: 0, H3: 0, BOT: 0, H: 0, TICK_Y: 0 } as const;
export const MIN_VIEW_MS = 0;

export interface View {
  t0: number;
  t1: number;
}

export type PricePoint = [t: number, px: number];

export interface PriceRange {
  min: number;
  max: number;
  lo: number;
  hi: number;
}

export function dayBoundsOf(_t0ms: number) {
  return { T0: 0, T1530: 0, T1600: 0, T2000: 0 };
}

export function clampView(v: View, _T0: number, _T2000: number): View {
  return v;
}

export function xOfView(_view: View, _L: number, _W: number): (t: number) => number {
  return () => 0;
}

export function priceAxisWidthOf(_dayMaxPx: number): number {
  return 0;
}

export function pricePointsOf(_price: AccumReportPrice): PricePoint[] {
  return [];
}

export function priceRangeOf(_points: readonly PricePoint[], _orders: AccumReportOrders, _view: View): PriceRange {
  return { min: 0, max: 0, lo: 0, hi: 0 };
}

export function pricePathOf(
  _points: readonly PricePoint[],
  _view: View,
  _x: (t: number) => number,
  _y: (px: number) => number,
): string {
  return '';
}
