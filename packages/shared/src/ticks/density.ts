// RED 스텁 — 구현 전(37-05 Task 2). 시그니처만 있고 값은 틀린다.
import type { A3Columns, TickIndex } from "./record-index";
export const DENSITY_BUCKETS = 144;
export interface ViSpan {
  startNs: bigint;
  endNs: bigint | null;
  startRec: number;
  endRec: number | null;
  viType: string;
  triggerPx: number;
}
export function densityOf(_a3: A3Columns, _index: TickIndex, _ymd: string): Float64Array {
  return new Float64Array(DENSITY_BUCKETS);
}
export function viSpansOf(_buf: Uint8Array, _index: TickIndex): ViSpan[] {
  return [{ startNs: 0n, endNs: null, startRec: -1, endRec: null, viType: "", triggerPx: 0 }];
}
