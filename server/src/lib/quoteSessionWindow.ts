import { isKrxHoliday, kstDateIso } from "@gh-radar/shared";

/**
 * server 상세 on-demand stock_quotes upsert 게이트 (quick 261001-bnc).
 *
 * 목적: 키움 ka10001 응답에는 기준일자 필드가 없다. 세션 창 밖(야간 · 주말 · 휴장일 · 08:00 전 ·
 *   20:00 이후) 에 호출하면 직전 거래일 스냅샷을 돌려주는데, 이를 stock_quotes 에 updated_at = now 로
 *   쓰면 "어제 등락률이 오늘 값" 처럼 보인다. 2026-10-01 00:28 KST 상세 조회가 동일스틸럭스(023790)
 *   전일 상한가 +29.99% 를 오늘 시각으로 기록해 home-sync 08:00~08:04 급등 테마를 오염시켰다.
 *   창 안에서 받은 ka10001 flu_rt 만 오늘 등락률로 보증된다.
 *
 * 창: KRX 거래일(KST 월~금 · isKrxHoliday 아님) AND 08:00 ≤ KST < 20:00.
 *   장 시간 08:00~20:00 (NXT 프리·애프터마켓 포함) — intraday-sync cron(08:00~20:02) 과 정합.
 *
 * 비슷한 함수와의 차이 (재사용 금지):
 *   - webapp isAutoRefreshWindow — UI 새로고침용, 20:05 까지 포함하는 창.
 *   - shared isKoreanMarketOpen — 15:30 종료 기준 · getTimezoneOffset 기반이라 낡았다(사용처 0).
 *
 * 휴장일은 shared KRX_HOLIDAYS seed(2026-12-31 까지)를 따른다 — 두 번째 캘린더를 두지 않는다.
 * KST 변환은 +9h 후 getUTC* 관례(로컬 getter 금지 — 실행 머신 TZ 무관).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 세션 시작 08:00 = 480 분 (포함). */
const SESSION_START_MIN = 8 * 60;
/** 세션 종료 20:00 = 1200 분 (미포함). */
const SESSION_END_MIN = 20 * 60;

export function isQuoteSessionWindow(now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const dow = kst.getUTCDay();
  if (dow < 1 || dow > 5) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (minutes < SESSION_START_MIN || minutes >= SESSION_END_MIN) return false;
  return !isKrxHoliday(kstDateIso(now));
}
