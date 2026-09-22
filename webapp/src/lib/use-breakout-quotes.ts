// RED 스텁 — Task 3 GREEN 에서 교체된다.
import type { RelayQuote } from "@gh-radar/shared";

export const MAX_BREAKOUT_SUBS = 0;
export interface BreakoutQuoteCandidate { isin: string; addedAt: number }
export interface BreakoutQuotesResult {
  quotes: ReadonlyMap<string, RelayQuote>;
  subscribed: ReadonlySet<string>;
  overflow: readonly string[];
}
export function useBreakoutQuotes(
  _c: readonly BreakoutQuoteCandidate[],
  _o: { excludeIsins?: ReadonlySet<string> } = {},
): BreakoutQuotesResult {
  return { quotes: new Map(), subscribed: new Set(), overflow: [] };
}
