/** 봉 차트 브라우저 기억 — RED 뼈대(계약 이름만 · 구현 전). */

import type { MaSpec } from './candle-ma';

export const TICK_CHART_KIND_KEY = 'gh-radar:tick-chart-kind';
export const TICK_CANDLE_UNIT_KEY = 'gh-radar:tick-candle-unit';
export const TICK_CANDLE_MA_KEY = 'gh-radar:tick-candle-ma';

export type ChartKindPref = 'line' | 'candle';
export type CandleUnitPref = 'auto' | 1 | 5 | 10 | 15 | 30 | 60;
export interface MaLine extends MaSpec {
  on: boolean;
  color: number;
}
export interface MaConfig {
  v: 1;
  lines: readonly MaLine[];
}

export const DEFAULT_MA_CONFIG: MaConfig = { v: 1, lines: [] };

export function parseChartKind(_raw: string | null): ChartKindPref {
  return 'line';
}
export function parseCandleUnit(_raw: string | null): CandleUnitPref {
  return 'auto';
}
export function parseMaConfig(_raw: string): MaConfig {
  return DEFAULT_MA_CONFIG;
}
export function nextMaColor(_lines: readonly MaLine[]): number | null {
  return null;
}
export function addMaLine(cfg: MaConfig, _spec: MaSpec): MaConfig {
  return cfg;
}
export function toggleMaLine(cfg: MaConfig, _key: string): MaConfig {
  return cfg;
}
export function removeMaLine(cfg: MaConfig, _key: string): MaConfig {
  return cfg;
}
export function readChartKind(): ChartKindPref {
  return 'line';
}
export function writeChartKind(_k: ChartKindPref): void {}
export function readCandleUnit(): CandleUnitPref {
  return 'auto';
}
export function writeCandleUnit(_u: CandleUnitPref): void {}
export function readMaConfig(): MaConfig {
  return DEFAULT_MA_CONFIG;
}
export function writeMaConfig(_cfg: MaConfig): void {}
export function subscribeCandlePrefs(_cb: () => void): () => void {
  return () => {};
}
