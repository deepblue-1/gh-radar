// RED 단계 뼈대 — 구현 전. 시그니처만 두고 모두 던진다.
export const ISIN_OFFSET: Readonly<Record<string, number>> = {};

export function tagOf(_payload: Uint8Array): string {
  throw new Error("not implemented");
}

export function isinKeyOf(_payload: Uint8Array): string | null {
  throw new Error("not implemented");
}

export function exchangeLabelOf(_payload: Uint8Array): "KRX" | "NXT" | null {
  throw new Error("not implemented");
}

export function hits15(_pct: string, _px: number, _chg: number, _pctThreshold = 15): boolean {
  throw new Error("not implemented");
}

export class DayRateTracker {
  hit15 = false;
  add(_pct: string, _chg: number, _px: number): void {
    throw new Error("not implemented");
  }
  base(): number | null {
    throw new Error("not implemented");
  }
  highRate(): number | null {
    throw new Error("not implemented");
  }
  lastRate(): number | null {
    throw new Error("not implemented");
  }
}
