import { isKrxHoliday, kstDateIso } from '@gh-radar/shared';

/**
 * quick-260913-g4c — 자동 새로고침 시각 게이트 (단일 지점 — 중복 구현 금지).
 *
 * `/scanner`·`/`(최신 보기) 자동 갱신 간격과 허용 창을 한 곳에서 정한다.
 * 창 = KST 평일(월~금) · KRX 비휴장일 · 08:00~20:05.
 *   - intraday-sync 마지막 사이클 20:02, home-sync 마지막 슬롯 20:04 → +1분 여유로 20:05 까지.
 *
 * 브라우저 로컬 타임존에 의존하지 않도록 `+9h` 후 UTC getter 만 쓴다(워커 computeSlot 관례).
 * `marketHours.ts` 의 `isKoreanMarketOpen` 은 08:00~15:30 기준이라 낡았고 로컬 getter 기반이라 쓰지 않는다.
 */

/** 자동 갱신 간격 — 30초. */
export const AUTO_REFRESH_INTERVAL_MS = 30_000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 창 시작 08:00 KST (분). */
const WINDOW_START_MIN = 8 * 60;
/** 창 끝 20:05 KST (분, 포함). */
const WINDOW_END_MIN = 20 * 60 + 5;

/** now 가 자동 갱신 창(KST 평일·비휴장일 08:00~20:05) 안이면 true. */
export function isAutoRefreshWindow(now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const day = kst.getUTCDay();
  if (day < 1 || day > 5) return false;
  const m = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (m < WINDOW_START_MIN || m > WINDOW_END_MIN) return false;
  return !isKrxHoliday(kstDateIso(now));
}
