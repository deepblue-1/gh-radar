'use client';

import type { PrevClosesState } from './candle-ma';

/** 앞 거래일 종가 훅 — RED 뼈대(계약 이름만 · 구현 전). */
export function usePrevCloses(
  _code: string | null | undefined,
  _ymd: string,
  _enabled: boolean,
): PrevClosesState {
  return 'idle';
}
