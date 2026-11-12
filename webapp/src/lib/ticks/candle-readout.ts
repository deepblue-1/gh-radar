import type { TickOpenResponse } from '@gh-radar/shared';

import type { PricePoint } from '@/lib/accum-chart';

import type { CandleUnit, Candles } from './candle-chart';
import type { CandleMaValue, MaStatus } from './candle-ma';
import type { TickBand, TickBandSource } from './tick-chart-tip';
import type { TickSession } from './tick-session';

/**
 * Phase 42 — 봉 차트 값 띠(A 4칸 · D-20) 값과 카드 아래 캡션 글자(D-17 · UI-SPEC S8 · S9).
 * (RED 뼈대 — GREEN 에서 채운다)
 */

export interface CandleBandSrc {
  session: TickSession;
  candles: Candles;
  ma: readonly CandleMaValue[];
  cumAvg: readonly PricePoint[];
  tick: TickBandSource;
}

export interface CandleBand {
  tick: TickBand;
  unit: CandleUnit;
  candle: { start: number; o: number; h: number; l: number; c: number; amt: number; chgPct: number | null } | null;
  ma: { key: string; name: string; color: number; v: number | null }[];
  avgPx: number | null;
  ret: number | null;
  hasCumAvg: boolean;
  cumAvg: number | null;
  cumRet: number | null;
}

export function candleBandAt(src: CandleBandSrc, t: number, rec: number): CandleBand {
  void t;
  void rec;
  return {
    tick: { t: 0 } as TickBand,
    unit: src.candles.unit,
    candle: null,
    ma: [],
    avgPx: null,
    ret: null,
    hasCumAvg: false,
    cumAvg: null,
    cumRet: null,
  };
}

export interface CandleCaptionInput {
  accum: TickOpenResponse['accum'] | null | undefined;
  isToday: boolean;
  hasCum: boolean;
  nxt: boolean;
  ma: readonly { name: string; status: MaStatus }[];
}

export function candleCaptionOf(input: CandleCaptionInput): string[] {
  void input;
  return [];
}
