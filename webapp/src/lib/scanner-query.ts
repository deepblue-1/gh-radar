/**
 * Scanner URL ↔ state 파서/직렬화 (Phase 5 SCAN-02, SCAN-05).
 *
 * Threat T-5-01 (Tampering/URL injection): `min` 을 `[10, 29]` 로 clamp 하고
 * 실패 시 25 로 fallback. `market` 은 whitelist ('ALL'|'KOSPI'|'KOSDAQ') 외 입력을
 * 전부 'ALL' 로 복원. 서버(`ScannerQuery` zod) 에서 2차 방어.
 */

export type Market = 'ALL' | 'KOSPI' | 'KOSDAQ';

export interface ScannerState {
  min: number;
  market: Market;
}

export const SCANNER_MIN_RATE = 10;
export const SCANNER_MAX_RATE = 29;
export const DEFAULT_SCANNER_STATE: ScannerState = {
  min: 25,
  market: 'ALL',
};

const MARKETS: readonly Market[] = ['ALL', 'KOSPI', 'KOSDAQ'];

/**
 * URL 쿼리 → ScannerState. 잘못된 값은 조용히 기본값으로 복원한다.
 */
export function parseScannerSearchParams(
  params: URLSearchParams,
): ScannerState {
  return {
    min: parseMin(params.get('min')),
    market: parseMarket(params.get('market')),
  };
}

function parseMin(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_SCANNER_STATE.min;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCANNER_STATE.min;
  const rounded = Math.round(n);
  if (rounded < SCANNER_MIN_RATE || rounded > SCANNER_MAX_RATE) {
    return DEFAULT_SCANNER_STATE.min;
  }
  return rounded;
}

function parseMarket(raw: string | null): Market {
  if (raw === null) return DEFAULT_SCANNER_STATE.market;
  return (MARKETS as readonly string[]).includes(raw)
    ? (raw as Market)
    : DEFAULT_SCANNER_STATE.market;
}

/**
 * ScannerState → `?min=..&market=..` 쿼리 문자열. 기본값과 같은 필드는 생략.
 */
export function toScannerSearchParams(state: ScannerState): string {
  const parts: string[] = [];
  if (state.min !== DEFAULT_SCANNER_STATE.min) {
    parts.push(`min=${state.min}`);
  }
  if (state.market !== DEFAULT_SCANNER_STATE.market) {
    parts.push(`market=${state.market}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
