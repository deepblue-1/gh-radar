// RED 스텁 — 구현 전(37-05 Task 2). 시그니처만 있고 값은 틀린다.
export const KST_OFFSET_NS = 32_400_000_000_000n;
export function dayStartNs(_ymd: string, _hhmm = "0800"): bigint {
  return 0n;
}
export function parseTickTime(_hms: string, _ymd: string): bigint | null {
  return null;
}
export function fmtTickTime(_ns: bigint): string {
  return "";
}
export function lowerBoundRecv(_recvNs: BigInt64Array, _recvOrder: Int32Array, _t: bigint): number {
  return -1;
}
