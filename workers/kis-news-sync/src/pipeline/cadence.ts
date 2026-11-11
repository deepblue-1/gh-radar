import type { KisNewsMode } from "../config.js";

// RED 스텁 — 41-08 Task 1 GREEN 에서 구현한다.
export const FAST_WINDOW_START_MIN = 0;
export const FAST_WINDOW_END_MIN = 0;
export type CollectorMode = "fast" | "slow" | "probe";
export function kstMinuteOfDay(_now: Date): number {
  return -1;
}
export function kstDayOfWeek(_now: Date): number {
  return -1;
}
export function resolveCollectorMode(_now: Date, _setting: KisNewsMode): CollectorMode {
  return "probe";
}
export function fastWindowEndOf(now: Date): Date {
  return now;
}
export function isCleanupDue(_now: Date, _cleanupDate: string | null): boolean {
  return false;
}
