'use client';

/**
 * 봉 차트 브라우저 기억 훅 (Phase 42 D-02 · D-09 · D-10 · UI-SPEC S10 · E1 · E2 · E3 loading).
 *
 * 서버 렌더 · 첫 그림은 기본값(선 차트 · 자동 · 단순 5 · 단순 20)이라 하이드레이션 불일치가 없고, 마운트 뒤 기억값으로
 * 다시 그린다(표시 없음). setter 는 저장 + 같은 탭 구독자 갱신(`candle-prefs.ts` ④).
 */

import { useSyncExternalStore } from 'react';

import {
  DEFAULT_MA_CONFIG,
  readCandleUnit,
  readChartKind,
  readMaConfig,
  subscribeCandlePrefs,
  writeCandleUnit,
  writeChartKind,
  writeMaConfig,
  type CandleUnitPref,
  type ChartKindPref,
  type MaConfig,
} from './candle-prefs';

const serverKind = (): ChartKindPref => 'line';
const serverUnit = (): CandleUnitPref => 'auto';
const serverMa = (): MaConfig => DEFAULT_MA_CONFIG;

/** 차트 종류(선 | 봉) — `[값, 바꾸기]`. */
export function useChartKind(): [ChartKindPref, (kind: ChartKindPref) => void] {
  const kind = useSyncExternalStore(subscribeCandlePrefs, readChartKind, serverKind);
  return [kind, writeChartKind];
}

/** 봉 단위(자동 | 분) — `[값, 바꾸기]`. */
export function useCandleUnitPref(): [CandleUnitPref, (unit: CandleUnitPref) => void] {
  const unit = useSyncExternalStore(subscribeCandlePrefs, readCandleUnit, serverUnit);
  return [unit, writeCandleUnit];
}

/** 이동평균 구성 — `[값, 바꾸기]`(같은 원문이면 같은 참조). */
export function useMaConfig(): [MaConfig, (cfg: MaConfig) => void] {
  const cfg = useSyncExternalStore(subscribeCandlePrefs, readMaConfig, serverMa);
  return [cfg, writeMaConfig];
}
