import type { BdydTrdRow, StockDailyOhlcv } from "@gh-radar/shared";

function parseBasDdToIso(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) {
    throw new Error(`Invalid BAS_DD: "${yyyymmdd}" (expected YYYYMMDD)`);
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseNumber(raw: string | undefined): number {
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`Missing required numeric field`);
  }
  // KRX 응답은 ","로 천단위 구분된 문자열이 들어올 수 있음 (실측 후 확인 필요).
  // 보수적으로 ","는 제거하고 파싱.
  const cleaned = String(raw).replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric value: "${raw}"`);
  }
  return n;
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const cleaned = String(raw).replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * KRX bydd_trd row → stock_daily_ohlcv DB row 매핑.
 *
 * RESEARCH §1.2 필드 매핑:
 *   BAS_DD → date (YYYYMMDD → ISO YYYY-MM-DD)
 *   ISU_SRT_CD → code
 *   TDD_OPNPRC → open
 *   TDD_HGPRC → high
 *   TDD_LWPRC → low
 *   TDD_CLSPRC → close (raw, D-04)
 *   ACC_TRDVOL → volume
 *   ACC_TRDVAL → tradeAmount
 *   CMPPREVDD_PRC → changeAmount (nullable)
 *   FLUC_RT → changeRate (nullable, 음수 가능)
 *
 * D-05: MKTCAP / LIST_SHRS 는 저장 X.
 */
export function krxBdydToOhlcvRow(r: BdydTrdRow): StockDailyOhlcv {
  if (!r.ISU_SRT_CD) {
    throw new Error(
      `KRX bydd_trd row missing ISU_SRT_CD: ${JSON.stringify(r)}`,
    );
  }
  return {
    code: r.ISU_SRT_CD,
    date: parseBasDdToIso(r.BAS_DD),
    open: parseNumber(r.TDD_OPNPRC),
    high: parseNumber(r.TDD_HGPRC),
    low: parseNumber(r.TDD_LWPRC),
    close: parseNumber(r.TDD_CLSPRC),
    volume: parseOptionalNumber(r.ACC_TRDVOL) ?? 0,
    tradeAmount: parseOptionalNumber(r.ACC_TRDVAL) ?? 0,
    changeAmount: parseOptionalNumber(r.CMPPREVDD_PRC),
    changeRate: parseOptionalNumber(r.FLUC_RT),
  };
}
