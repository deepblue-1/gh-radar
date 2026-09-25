/**
 * RED 스텁 (20-04 Task 1) — 타입 계약만 있고 데이터는 비어 있다. GREEN 이 채운다.
 */

import type { LimitChaserFormValues } from '@/lib/limit-chaser';
import type { PadUnit } from '@/lib/numpad';

export type LcNumField = Extract<
  keyof LimitChaserFormValues,
  | 'buyOrderPrice'
  | 'buyOrderAmount'
  | 'buyWatchPrice'
  | 'buyWatchQty'
  | 'buyMinTradeQty'
  | 'sweepMinTickCount'
  | 'sweepWatchPrice'
  | 'sellOrderPrice'
  | 'sellOrderRatio'
  | 'sellWatchPrice'
  | 'sellWatchQty'
  | 'sellQtyTrackRatio'
  | 'sellMinTradeQty'
  | 'cancelWatchQty'
>;
export type LcBoolField = Extract<
  keyof LimitChaserFormValues,
  'buyTradeQtyEnabled' | 'sellQtyTrackEnabled' | 'sellTradeQtyEnabled' | 'cancelTradeEnabled' | 'cancelQtyTrackEnabled'
>;
export type LcUnit = Exclude<PadUnit, '회'>;

export type LcRowSpec =
  | { kind: 'value'; field: LcNumField; id: string; label: string; unit: LcUnit; desc: string }
  | { kind: 'checkValue'; check: LcBoolField; checkId: string; field: LcNumField; id: string; label: string; unit: LcUnit; desc: string }
  | { kind: 'check'; check: LcBoolField; checkId: string; label: string }
  | { kind: 'watch' }
  | { kind: 'derived'; label: '잔량추적 기준선' };

export type LcGate = 'buyEnabled' | 'sweepEnabled' | 'sellEnabled' | 'cancelQtyEnabled';
export type LcStatusKey = 'buy' | 'sweep' | 'sell' | 'cancel';

export interface LcGroupSpec {
  slot: 'buy-price' | 'buy' | 'sweep' | 'sell-price' | 'sell' | 'cancel';
  title?: '매수주문' | '한방체결' | '매도주문' | '매수취소';
  ariaLabel?: string;
  hint?: string;
  gate?: LcGate;
  statusKey?: LcStatusKey;
  dimWhenOff: boolean;
  rows: readonly LcRowSpec[];
}

export const LC_BUY_GROUPS: readonly LcGroupSpec[] = [];
export const LC_SELL_GROUPS: readonly LcGroupSpec[] = [];
export const LC_SWITCH_LABEL: Record<LcGate, string> = {
  buyEnabled: '',
  sweepEnabled: '',
  sellEnabled: '',
  cancelQtyEnabled: '',
};

export function lcRowById(_id: string): { group: LcGroupSpec; row: LcRowSpec } | null {
  return null;
}

export function lcNavigableRows(_slot: LcGroupSpec['slot']): readonly { field: LcNumField; id: string }[] {
  return [];
}
