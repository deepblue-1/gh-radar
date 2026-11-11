import type { StockFeedEntry } from '@gh-radar/shared';

export const STOCK_FEED_POLL_MS = 0;
export const STOCK_FEED_NEW_MS = 0;
export const STOCK_FEED_CHUNK = 0;

export interface StockFeedPolling {
  entries: ReadonlyMap<string, StockFeedEntry>;
  firstSeen: ReadonlyMap<string, number>;
}

export function feedBadgesOf(_entry: StockFeedEntry | undefined): { disclosure: boolean; news: boolean } {
  throw new Error('not implemented');
}

export function isFeedItemNew(_id: string, _firstSeen: ReadonlyMap<string, number>, _now: number): boolean {
  throw new Error('not implemented');
}

export function useStockFeedPolling(
  _codes: readonly string[],
  _opts: { intervalMs?: number; days?: number; limit?: number } = {},
): StockFeedPolling {
  throw new Error('not implemented');
}
