/** Phase 20 D-15 — KRX 호가 단위 헬퍼 (RED 스텁 · 구현은 GREEN 커밋). */
export type PriceIssue =
  | { kind: "overUpper"; upper: number }
  | { kind: "offTick"; tick: number; lower: number; upper: number };

export function krxTickSize(_price: number): number {
  return 0;
}

export function tickUp(v: number): number {
  return v;
}

export function tickDown(v: number): number {
  return v;
}

export function priceInputIssue(_v: number, _upperLimit: number): PriceIssue | null {
  return null;
}
