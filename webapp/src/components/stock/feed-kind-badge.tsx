import type { StockFeedKind } from '@gh-radar/shared';

// RED 단계 자리표시 — GREEN 에서 구현한다.
export interface FeedKindBadgeProps {
  kind: StockFeedKind;
  size?: 'full' | 'mini';
}

export function FeedKindBadge(_props: FeedKindBadgeProps) {
  return null;
}
