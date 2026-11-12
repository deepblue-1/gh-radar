/**
 * 봉 차트 수익률 판 계산(Phase 42) — RED 자리표(구현 전).
 */

import type { View } from '@/lib/accum-chart';

import type { TickSession } from './tick-session';

export interface ReturnPoint {
  t: number;
  v: number | null;
  rec: number;
}

export function dayReturnAt(_session: TickSession, _rec: number): number | null {
  return null;
}

export function dayReturnPointsOf(_session: TickSession, _view: View, _plotW: number, _cursorRec: number): ReturnPoint[] {
  return [];
}
