'use client';

import type { TickExchange } from '@gh-radar/shared';

/** RED 뼈대 — Task 2 GREEN 에서 채운다. */
export interface TickStockPickerProps {
  date: string | null;
  ex: TickExchange;
  gridIsins: ReadonlySet<string>;
  isToday: boolean;
  etaS: { KRX: number; NXT: number };
  onSelect: (stock: { isin: string; code: string; name: string }) => void;
}

export function TickStockPicker(_props: TickStockPickerProps) {
  return null;
}
