'use client';

import { createContext, type ReactNode } from 'react';
import type { StockFeedEntry } from '@gh-radar/shared';

export const StockFeedEntriesContext = createContext<ReadonlyMap<string, StockFeedEntry> | null>(null);

export function StockFeedProvider({ children }: { codes: readonly string[]; children: ReactNode }) {
  return <>{children}</>;
}
export function useStockFeedEntries(): ReadonlyMap<string, StockFeedEntry> {
  throw new Error('not implemented');
}
export function useStockFeedEntry(_code: string | null | undefined): StockFeedEntry | undefined {
  throw new Error('not implemented');
}
export function useStockFeedIsNew(): (id: string) => boolean {
  throw new Error('not implemented');
}
export function useStockFeedAvailable(): boolean {
  throw new Error('not implemented');
}
