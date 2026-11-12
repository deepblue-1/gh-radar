'use client';

import type { TickOpenResponse } from '@gh-radar/shared';

import type { CandleFrame } from '@/lib/ticks/candle-chart';
import type { TickSession } from '@/lib/ticks/tick-session';

/** 자리표(RED) — Task 2 GREEN 에서 아래 세 판을 그린다. */
export interface CandleLowerLayersProps {
  frame: CandleFrame;
  session: TickSession;
  accum?: TickOpenResponse['accum'];
  isToday: boolean;
  listingShares: number | null;
  clipId: string;
}

export function CandleLowerLayers(_props: CandleLowerLayersProps) {
  return <g data-slot="candle-lower-layers" />;
}
