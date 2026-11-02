'use client';

import type { NodataReason } from '@/lib/ticks/tick-url';

/** RED 뼈대 — Task 2 GREEN 에서 채운다. */
export type TickStateCardProps =
  | { variant: 'converting'; subject?: string; etaMin: number; onCancel: () => void }
  | { variant: 'live-loading'; subject?: string; queued: number; progress: number | null; onCancel: () => void }
  | {
      variant: 'nodata';
      reason: NodataReason;
      dateLabel?: string;
      onLatest: (() => void) | null;
      onConvert?: () => void;
      etaMin?: number;
    }
  | { variant: 'live-unavailable'; onLatest: (() => void) | null }
  | { variant: 'error'; message: string; onRetry?: () => void; onBack?: () => void };

export function TickStateCard(_props: TickStateCardProps) {
  return null;
}
