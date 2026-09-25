/** Phase 20 D-16 · D-17 — 키패드 순수 규칙 (RED 스텁 · 구현은 GREEN 커밋). */
import type { PriceIssue } from '@gh-radar/shared';

export type PadUnit = '원' | '주' | '만원' | '%' | '건' | '회';
export interface PadState {
  buf: string;
  fresh: boolean;
}
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back';
export type PadChipOp =
  | { kind: 'tickDown' }
  | { kind: 'tickUp' }
  | { kind: 'current' }
  | { kind: 'upper' }
  | { kind: 'add'; n: number }
  | { kind: 'set'; n: number }
  | { kind: 'clear' };
export interface PadChip {
  label: string;
  ariaLabel?: string;
  op: PadChipOp;
}
export interface PadCtx {
  current: number;
  upper: number;
  maxPieces?: number;
}

export const PAD_MAX_DIGITS = 0;
export const PAD_CHIPS: Record<PadUnit, readonly PadChip[]> = {
  원: [],
  주: [],
  만원: [],
  '%': [],
  건: [],
  회: [],
};
export function padInit(_value: number | null): PadState {
  return { buf: '', fresh: false };
}
export function padKey(s: PadState, _key: PadKey): PadState {
  return s;
}
export function padChipDisabled(_chip: PadChip, _ctx: PadCtx): boolean {
  return false;
}
export function applyPadChip(s: PadState, _chip: PadChip, _ctx: PadCtx): PadState {
  return s;
}
export function padValue(_s: PadState): number | null {
  return null;
}
export function formatPadDisplay(_s: PadState): string {
  return '';
}
export function priceIssueText(_issue: PriceIssue): string {
  return '';
}
export function padIssue(_s: PadState, _unit: PadUnit, _ctx: PadCtx): string | null {
  return null;
}
export function canConfirmPad(_s: PadState, _unit: PadUnit, _ctx: PadCtx): boolean {
  return false;
}
export function stepValue(v: number, _unit: PadUnit, _dir: 1 | -1): number {
  return v;
}
