/**
 * Scanner 포맷 유틸 — 단일 진리원 (Phase 05.2 D-15/D-16).
 */

/**
 * 거래대금(KRW) 포맷터.
 * - 0 또는 null/undefined → "-"
 * - < 1조 (1e12) → "N,NNN억" (억 미만 버림, 천단위 콤마)
 * - ≥ 1조 → "N.N조" (소수점 1자리)
 */
export function formatTradeAmount(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value) || value === 0) return '-';
  const trillion = 1e12;
  const uk = 1e8;
  if (value >= trillion) {
    return `${(value / trillion).toFixed(1)}조`;
  }
  return `${new Intl.NumberFormat('ko-KR').format(Math.floor(value / uk))}억`;
}
