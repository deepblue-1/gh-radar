// RED 스텁 — Task 2 GREEN 에서 교체된다.
import type { RelayRateCrossItem } from "@gh-radar/shared";

export const BREAKOUT_SOUNDED_KEY = "gh-radar:breakout-sounded";
export const BREAKOUT_DISMISSED_KEY = "gh-radar:breakout-dismissed";
export const BREAKOUT_TONE_KEY = "gh-radar:breakout-tone";
export const TRADING_COLS_KEY = "gh-radar:trading-cols";
export const REMOVE_MARGIN_PCT = 2.0;
export const ARM_GRACE_MS = 3_000;
export const HIGHLIGHT_MS = 30_000;
export type BreakoutTonePref = "on" | "off";
export type TradingCols = 1 | 2 | 3;
export interface BreakoutMeta { addedAt: number; armed: boolean; silent: boolean }
export interface BreakoutRow extends RelayRateCrossItem {
  key: string; addedAt: number; armed: boolean; silent: boolean; trading: boolean; highlightUntil: number | null;
}
export function kstDateKey(_now: Date = new Date()): string { return ""; }
export function readDatedSet(_k: string, _t: string): ReadonlySet<string> { return new Set(); }
export function writeDatedSet(_k: string, _t: string, _ids: Iterable<string>): void {}
export function readSoundedSet(_t?: string): ReadonlySet<string> { return new Set(); }
export function addSounded(_i: readonly string[], _t?: string): ReadonlySet<string> { return new Set(); }
export function readDismissedSet(_t?: string): ReadonlySet<string> { return new Set(); }
export function addDismissed(_i: readonly string[], _t?: string): ReadonlySet<string> { return new Set(); }
export function readTonePref(): BreakoutTonePref { return "off"; }
export function writeTonePref(_p: BreakoutTonePref): void {}
export function readColsPref(): TradingCols { return 1; }
export function writeColsPref(_c: TradingCols): void {}
export function shouldRemoveBreakout(_r: BreakoutRow, _p: number | undefined, _now?: number): boolean { return false; }
export function trackBreakoutMeta(
  _prev: ReadonlyMap<string, BreakoutMeta>, _items: readonly RelayRateCrossItem[],
  _o: { now: number; silent: boolean; priceOf?: (isin: string) => number | undefined },
): Map<string, BreakoutMeta> { return new Map(); }
export function breakoutRowsFrom(
  _items: readonly RelayRateCrossItem[],
  _o: { dismissed: ReadonlySet<string>; cards: ReadonlySet<string>; meta: ReadonlyMap<string, BreakoutMeta>; removed?: ReadonlySet<string> },
): BreakoutRow[] { return []; }
export function isHighlighted(_r: Pick<BreakoutRow, "highlightUntil">, _now: number): boolean { return false; }
export function newBreakoutsToAnnounce(_rows: readonly BreakoutRow[], _s: ReadonlySet<string>): { record: string[]; sound: string[] } {
  return { record: [], sound: [] };
}
