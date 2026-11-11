// RED 스텁 — 41-08 Task 1 GREEN 에서 구현한다.
export const STOCK_MIN_INTERVAL_MS = 0;
export interface TargetInfo {
  code: string;
  reasons: string[];
  rank: number | null;
  lastRequestedAt: number | null;
  lastCollectedAt: number | null;
}
export class TokenBucket {
  constructor(_ratePerSec: number, _capacity: number, _clock: () => number) {}
  tryTake(): boolean {
    return false;
  }
  msUntilNext(): number {
    return -1;
  }
}
export class TargetQueue {
  constructor(_minIntervalMs: number = STOCK_MIN_INTERVAL_MS, _cap = 450) {}
  update(_targets: readonly TargetInfo[], _now: number): { size: number; dropped: number } {
    return { size: -1, dropped: -1 };
  }
  next(_now: number): TargetInfo | null {
    return null;
  }
  markCollected(_code: string, _now: number): void {}
}
