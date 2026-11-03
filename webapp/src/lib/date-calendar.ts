/**
 * 날짜 알약 달력(2026-11-03 사용자 요청 · 스케치 021 A 「월 달력」) 순수 계산 — 날짜는 `YYYYMMDD`, 달은 `YYYYMM`.
 * 요일 · 달 경계는 날짜 문자열만으로 정한다(UTC 자정 기준 — 시각대와 무관).
 */

/** 그 달 칸 — 앞쪽 빈칸(일요일 시작) null + 1일 ~ 말일 `YYYYMMDD`. */
export function monthCellsOf(ym: string): (string | null)[] {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= n; d++) cells.push(`${ym}${String(d).padStart(2, '0')}`);
  return cells;
}

/** 달 이동(k 달 · 음수 = 앞). */
export function shiftYm(ym: string, k: number): string {
  const i = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)) - 1 + k;
  return `${Math.floor(i / 12)}${String((i % 12) + 1).padStart(2, '0')}`;
}

/** 날짜 목록이 걸친 달 범위(최소 · 최대 `YYYYMM`) — 빈 목록이면 null. */
export function ymRangeOf(dates: readonly string[]): { min: string; max: string } | null {
  if (dates.length === 0) return null;
  let min = dates[0]!;
  let max = dates[0]!;
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min: min.slice(0, 6), max: max.slice(0, 6) };
}
