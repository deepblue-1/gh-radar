'use client';

import type { CandleUnit } from '@/lib/ticks/candle-chart';
import type { CandleUnitPref } from '@/lib/ticks/candle-prefs';

/** RED 뼈대 — 계약 이름만. GREEN 에서 채운다. */
export function CandleUnitMenu(_props: {
  value: CandleUnitPref;
  current: CandleUnit;
  onChange: (unit: CandleUnitPref) => void;
  phone: boolean;
  className?: string;
}) {
  return <button type="button" data-slot="candle-unit-button" />;
}
