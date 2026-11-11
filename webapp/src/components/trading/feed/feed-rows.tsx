'use client';

import type { StockFeedItem } from '@gh-radar/shared';

export const FEED_ROWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음';

export function FeedRows(_props: { items: readonly StockFeedItem[]; band: 'wb' | 'lc'; emptyText?: string }) {
  return null;
}
