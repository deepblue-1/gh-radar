/**
 * 봉 차트 이동평균 (Phase 42 D-10 · D-11 · SC-3) — RED 뼈대(계약 이름만 · 구현 전).
 */

export type MaBase = 'bar' | 'day';
export type MaKind = 'sma' | 'ema';
export interface MaSpec {
  base: MaBase;
  n: number;
  kind: MaKind;
}

export const MA_N_MIN = 2;
export const MA_N_MAX = 240;
export const MA_MAX_LINES = 6;
export const PREV_CLOSES_N = 239;
export const MA_GAP_BREAK_MS = 30 * 60_000;

export type PrevClosesState = readonly number[] | 'idle' | 'loading' | 'error' | 'nocode';
export type MaStatus = 'ok' | 'short-bars' | 'short-days' | 'loading' | 'error';

export interface CandleMaValue {
  key: string;
  name: string;
  color: number;
  values: Float64Array;
}

export function maKeyOf(_spec: MaSpec): string {
  return '';
}
export function maNameOf(_spec: MaSpec): string {
  return '';
}
export function isValidMaSpec(_spec: unknown): _spec is MaSpec {
  return false;
}
export function smaOf(c: Float64Array, _n: number): Float64Array {
  return new Float64Array(c.length);
}
export function emaOf(c: Float64Array, _n: number): Float64Array {
  return new Float64Array(c.length);
}
export function daySmaOf(c: Float64Array, _prev: readonly number[], _n: number): Float64Array {
  return new Float64Array(c.length);
}
export function maValuesOf(_spec: MaSpec, c: Float64Array, _prev: PrevClosesState): Float64Array {
  return new Float64Array(c.length);
}
export function maStatusOf(_spec: MaSpec, _nBars: number, _prev: PrevClosesState): MaStatus {
  return 'ok';
}
export function maPathOf(
  _t0: Float64Array,
  _unitMs: number,
  _v: Float64Array,
  _x: (t: number) => number,
  _y: (v: number) => number,
): string {
  return '';
}
