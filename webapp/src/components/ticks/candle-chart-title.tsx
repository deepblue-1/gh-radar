'use client';

import type { ReactNode } from 'react';

import type { CandleUnit } from '@/lib/ticks/candle-chart';
import type { CandleUnitPref, MaConfig } from '@/lib/ticks/candle-prefs';

/** RED 뼈대 — 계약 이름만. GREEN 에서 채운다. */
export interface CandleChartTitleProps {
  phone: boolean;
  kindSwitch: ReactNode;
  unitPref: CandleUnitPref;
  currentUnit: CandleUnit;
  onUnit: (unit: CandleUnitPref) => void;
  ma: MaConfig;
  onMa: (cfg: MaConfig) => void;
  ownLegend: boolean;
  spanLabel: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFull: () => void;
  onMinute: () => void;
  onTenSec: () => void;
}

export function CandleChartTitle(_props: CandleChartTitleProps) {
  return <div data-slot="candle-chart-title" />;
}
