'use client';

import type { ReactNode } from 'react';
import type { RelayExchange, RelayLimitChaser } from '@gh-radar/shared';

import type { StrategyLogEntry } from '@/components/trading/strategy-log';

export function diffLimitChasers(
  _prev: ReadonlyMap<string, RelayLimitChaser>,
  _next: readonly RelayLimitChaser[],
): { key: string; isin: string; exchange: RelayExchange; text: string }[] {
  return [];
}

export function StrategyLogFeedProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useStrategyLogFeed(): readonly StrategyLogEntry[] {
  return [];
}
