import type { NewsByStockResponse } from '@gh-radar/shared';

export function fetchNewsByStock(
  _codes: readonly string[],
  _opts: { days?: number; limit?: number } = {},
  _signal?: AbortSignal,
): Promise<NewsByStockResponse> {
  throw new Error('not implemented');
}
