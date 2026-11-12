'use client';

import type { MaConfig } from '@/lib/ticks/candle-prefs';

/** RED 뼈대 — 계약 이름만. GREEN 에서 채운다. */
export function CandleMaChips(_props: { config: MaConfig; onChange: (cfg: MaConfig) => void; phone: boolean }) {
  return <div role="group" aria-label="이동평균" />;
}
