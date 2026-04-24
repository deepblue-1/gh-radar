/**
 * Scanner URL ↔ state 파서/직렬화.
 *
 * Threat T-5-01 (Tampering/URL injection): `market` 은 whitelist
 * ('ALL'|'KOSPI'|'KOSDAQ') 외 입력을 전부 'ALL' 로 복원. 서버(`ScannerQuery` zod)
 * 에서 2차 방어.
 */

export type Market = 'ALL' | 'KOSPI' | 'KOSDAQ';

export interface ScannerState {
  market: Market;
}

export const DEFAULT_SCANNER_STATE: ScannerState = {
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
    market: parseMarket(params.get('market')),
  };
}

function parseMarket(raw: string | null): Market {
  if (raw === null) return DEFAULT_SCANNER_STATE.market;
  return (MARKETS as readonly string[]).includes(raw)
    ? (raw as Market)
    : DEFAULT_SCANNER_STATE.market;
}

/**
 * ScannerState → `?market=..` 쿼리 문자열. 기본값과 같은 필드는 생략.
 */
export function toScannerSearchParams(state: ScannerState): string {
  const parts: string[] = [];
  if (state.market !== DEFAULT_SCANNER_STATE.market) {
    parts.push(`market=${state.market}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}
