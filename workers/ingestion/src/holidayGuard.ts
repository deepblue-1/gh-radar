import type { KisRankingRow } from "@gh-radar/shared";
import { getKstDate } from "@gh-radar/shared";

function formatKstYYYYMMDD(date: Date): string {
  const kst = getKstDate(date);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function isHoliday(
  rows: { rows: KisRankingRow[] }[],
  now: Date = new Date()
): boolean {
  const todayStr = formatKstYYYYMMDD(now);

  const firstRow = rows[0]?.rows[0];
  if (!firstRow) return true;

  const responseDate = firstRow.acml_hgpr_date;
  if (!responseDate) return true;

  return responseDate !== todayStr;
}
