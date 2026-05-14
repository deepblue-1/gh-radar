// workers/intraday-sync/src/pipeline/mapOhlc.ts
//
// STEP 2 mapper — ka10001 응답을 IntradayOhlcUpdate 로 변환.
// RESEARCH §1.5 + §2.3. D-15 (mac 단위 가설), D-23 트레이딩 시그널 정책.

import type { KiwoomKa10001Row, IntradayOhlcUpdate } from "@gh-radar/shared";
import { parseSignedPrice, parseOptionalSignedNumber } from "./map";

export function ka10001RowToOhlcUpdate(
  row: KiwoomKa10001Row,
  dateIso: string,
): IntradayOhlcUpdate {
  if (!/^\d{6}$/.test(row.stk_cd)) {
    throw new Error(`Invalid ka10001 stk_cd: "${row.stk_cd}"`);
  }

  const open = parseSignedPrice(row.open_pric).value;
  const high = parseSignedPrice(row.high_pric).value;
  const low = parseSignedPrice(row.low_pric).value;
  const upperLimit = parseOptionalSignedNumber(row.upl_pric);
  const lowerLimit = parseOptionalSignedNumber(row.lst_pric);
  const marketCap = parseMac(row.mac);

  return {
    code: row.stk_cd,
    date: dateIso,
    open,
    high,
    low,
    upperLimit: upperLimit !== null ? Math.abs(upperLimit) : null,
    lowerLimit: lowerLimit !== null ? Math.abs(lowerLimit) : null,
    marketCap,
  };
}

/**
 * mac 단위 가설: 억원 (KIS hts_avls 컨벤션) — Plan 06 production fixture 캡처로 확정 (R2).
 * 잘못된 단위 발견 시 본 함수의 곱셈 상수만 변경.
 */
export function parseMac(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100_000_000);
}
