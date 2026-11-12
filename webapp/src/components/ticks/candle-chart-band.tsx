import type { CandleBand } from '@/lib/ticks/candle-readout';

/** (RED 뼈대 — GREEN 에서 채운다) */
export const CANDLE_BAND_H = { desktop: 88, phone: 137 } as const;

export interface CandleChartBandProps {
  band: CandleBand | null;
  live: boolean;
  phone: boolean;
}

export function CandleChartBand({ band, live, phone }: CandleChartBandProps) {
  void band;
  void live;
  void phone;
  return <div data-slot="candle-chart-band" />;
}
