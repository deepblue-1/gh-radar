'use client';

import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickPlaySpeed } from '@/lib/ticks/use-tick-cursor';

/** RED 뼈대 — Task 2 GREEN 에서 슬라이더 카드로 채운다. */
export interface TickSliderProps {
  session: TickSession;
  rec: number;
  onSeekNs: (ns: bigint) => void;
  onStep: (delta: number) => void;
  playing: boolean;
  onPlay: () => void;
  speed: TickPlaySpeed;
  onSpeed: (s: TickPlaySpeed) => void;
  onJump: (hms: string) => boolean;
  showEnd?: boolean;
  onEnd?: () => void;
}

export function TickSlider(_props: TickSliderProps) {
  return null;
}
