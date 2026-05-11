/**
 * 영업일 유틸리티.
 *
 * 정책 (RESEARCH §3.3):
 *   - 영업일 = 평일 (월~금). 실제 휴장(공휴일/임시휴장) 은 KRX 빈응답으로 자연 skip — 본 유틸은 calendar X.
 *   - todayBasDdKst: KST UTC+9 변환 후 YYYYMMDD (master-sync 패턴 mirror).
 *   - iterateBusinessDays: from ~ to (inclusive) 중 평일만 yield.
 */

export function todayBasDdKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function isoToBasDd(iso: string): string {
  // "2026-05-09" → "20260509"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  return iso.replace(/-/g, "");
}

export function basDdToIso(basDd: string): string {
  // "20260509" → "2026-05-09"
  if (!/^\d{8}$/.test(basDd)) {
    throw new Error(`Invalid BAS_DD: "${basDd}"`);
  }
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // 일=0, 토=6
}

/**
 * from ~ to (ISO YYYY-MM-DD, inclusive) 의 평일을 yield.
 * UTC 기준 — 영업일 판단에 시차 영향 없음 (Sat/Sun 은 어느 timezone 이든 동일).
 */
export function* iterateBusinessDays(
  fromIso: string,
  toIso: string,
): Generator<string> {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error(`Invalid date range: from=${fromIso} to=${toIso}`);
  }

  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    if (!isWeekend(cursor)) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cursor.getUTCDate()).padStart(2, "0");
      yield `${y}-${m}-${d}`;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
