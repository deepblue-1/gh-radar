import { isKrxHoliday } from "@gh-radar/shared";

/**
 * quick-260915-boq — 직전 KRX 거래일 계산.
 *
 * - 휴장일은 공유 캘린더(`@gh-radar/shared` isKrxHoliday)를 재사용한다 — 두 번째 캘린더 금지.
 * - 공유 캘린더는 주말을 일부러 빼 두었으므로(각 워커 스케줄러 cron 이 커버) 이 함수가
 *   토·일을 직접 건너뛴다.
 * - seed 만료 구간(KRX_HOLIDAYS_SEEDED_THROUGH 이후)은 주말만 건너뛴다 — index.ts 가 이미
 *   캘린더 stale 경고를 낸다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 방어 상한 — 30일 안에 거래일이 없으면 캘린더/입력 오류로 본다. */
const MAX_LOOKBACK_DAYS = 30;

/** `YYYY-MM-DD` 의 직전 거래일(주말·KRX 휴장일 제외)을 `YYYY-MM-DD` 로 반환. */
export function previousTradingDate(dateIso: string): string {
  const baseMs = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(baseMs)) {
    throw new Error(`previousTradingDate: invalid date '${dateIso}'`);
  }
  for (let back = 1; back <= MAX_LOOKBACK_DAYS; back++) {
    const d = new Date(baseMs - back * DAY_MS);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    if (isKrxHoliday(iso)) continue;
    return iso;
  }
  throw new Error(
    `previousTradingDate: no trading day within ${MAX_LOOKBACK_DAYS} days before '${dateIso}'`,
  );
}
