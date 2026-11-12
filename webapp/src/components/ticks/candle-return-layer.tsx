'use client';

import type { CandleFrame } from '@/lib/ticks/candle-chart';
import type { ReturnPoint, ReturnScales } from '@/lib/ticks/candle-returns';

/** 자리표(RED) — Task 1 GREEN 에서 수익률 판을 그린다. */
export interface CandleReturnLayerProps {
  frame: CandleFrame;
  day: readonly ReturnPoint[];
  cum: readonly ReturnPoint[];
  scales: ReturnScales;
  clipId: string;
}

export function CandleReturnLayer(_props: CandleReturnLayerProps) {
  return <g data-slot="candle-return-layer" />;
}
