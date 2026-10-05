/**
 * export 신선도(WR-B01) — 119 export · radar-gw 운반이 멈추면 워커는 「새 날짜 없음」 으로 정상 종료해 알림이 울리지
 * 않는다(무로그 fail-safe). 그래서 run 마다 GCS 에 있는 가장 새 export 날짜 뒤로 **export 가 없는 KRX 거래일**을 센다.
 *
 * - 탐지 종목 0 인 거래일은 export 디렉터리 자체가 없다(gh-trade 1105548d) — 하루 이틀 공백은 정상일 수 있어
 *   `STALE_TRADING_DAYS`(3) 이상일 때만 stale 로 본다. 상한가 탐지 0 인 거래일이 사흘 잇따를 일은 사실상 없다.
 * - 오늘(KST)도 센다 — Scheduler 는 평일 21:20 KST 로 radar-gw 운반(21:00) 뒤다. 수동 실행이 21:00 전이어도 1일 차이라
 *   임계 아래다.
 * - 휴장일은 공유 캘린더(`@gh-radar/shared` isKrxHoliday — 두 번째 캘린더 금지), 주말은 여기서 건너뛴다. 캘린더 seed 가
 *   끝난 뒤(미등록 휴장일)는 주말만 빠져 공휴일 연휴에 오탐할 수 있다 — 캘린더 갱신이 정본 해법이다.
 */
import { isKrxHoliday } from "@gh-radar/shared";

/** 최신 export 뒤로 export 가 없는 거래일이 이 수 이상이면 stale → main 종료 1(알림). */
export const STALE_TRADING_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type Freshness = {
  /** 적재 창 안에서 GCS 에 있는 가장 새 export 날짜(`YYYYMMDD`) — 없으면 null. */
  latestExport: string | null;
  /** `latestExport` 다음 날부터 KST 오늘까지(포함) export 가 없는 KRX 거래일 수. latestExport 가 null 이면 `since` 부터. */
  missingTradingDays: number;
  stale: boolean;
};

const ymdToUtcMs = (ymd: string): number =>
  Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));

/** `latestExport`(없으면 `since` 전날) 다음 날 ~ KST 오늘 사이 거래일(주말 · KRX 휴장일 제외) 수. */
export function freshnessOf(dates: readonly string[], since: string, now: Date): Freshness {
  const latestExport = dates.length > 0 ? [...dates].sort().at(-1)! : null;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const todayMs = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const fromMs = latestExport !== null ? ymdToUtcMs(latestExport) + DAY_MS : ymdToUtcMs(since);
  let missing = 0;
  for (let t = fromMs; t <= todayMs; t += DAY_MS) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isKrxHoliday(d.toISOString().slice(0, 10))) continue;
    missing += 1;
  }
  return { latestExport, missingTradingDays: missing, stale: missing >= STALE_TRADING_DAYS };
}
