'use client';

/** 봉 차트 기억 훅 — RED 뼈대(계약 이름만 · 구현 전). */

import {
  DEFAULT_MA_CONFIG,
  type CandleUnitPref,
  type ChartKindPref,
  type MaConfig,
} from './candle-prefs';

export function useChartKind(): [ChartKindPref, (k: ChartKindPref) => void] {
  return ['line', () => {}];
}
export function useCandleUnitPref(): [CandleUnitPref, (u: CandleUnitPref) => void] {
  return ['auto', () => {}];
}
export function useMaConfig(): [MaConfig, (cfg: MaConfig) => void] {
  return [DEFAULT_MA_CONFIG, () => {}];
}
