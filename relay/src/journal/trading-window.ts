/**
 * Phase 19 Plan 07 — 장중 창 판정 (`inTradingWindow`). **`/healthz` 기록 연결 알림 판정 전용이다.**
 *
 * 창 = KST 평일(월~금) ∧ KRX 휴장일 아님 ∧ 08:00 ≤ KST 시각 < 20:00.
 *
 * 결정 근거:
 *   D-13  **연결 유지에 쓰지 않는다.** 관찰자 연결은 24시간 상시이고, 이 함수는 「끊김을 운영 알림으로
 *         올릴 것인가」 만 가른다(D-04 (b) — 운영 알림은 장중 끊김에만). 장 밖 끊김은 `/healthz` 본문에만 드러난다.
 *   창    08:00~20:00 은 NXT(프리·애프터마켓) 포함 실사용 창이다(프로젝트 메모 「장 시간 08:00~20:00」 ·
 *         CONTEXT D-04). shared `marketHours.ts` 의 장 시간 함수는 **08:00~15:30** 이라 쓰지 않는다(RESEARCH Pattern G) —
 *         그 함수로 판정하면 15:30~20:00 NXT 애프터마켓 중의 기록 끊김이 알림 없이 지나간다.
 *   날짜  KST 날짜는 shared `kstDateIso` 로만 얻는다(새 KST 계산 함수 금지 — 19-PATTERNS 「날짜/휴장일」).
 *         요일·시각은 그 날짜의 KST 자정(`…T00:00:00+09:00`)을 기준으로 잰다.
 *
 * 한계: `KRX_HOLIDAYS` 는 seed 범위(2026-12-31)까지만 안다 — 넘어가면 휴장일을 평일로 보아 알림이
 * 과민해진다(놓치지는 않는다). 갱신 책임은 `krxCalendar.ts` 머리 주석 그대로다.
 */
import { isKrxHoliday, kstDateIso } from "@gh-radar/shared";

/** 창 시작 — KST 08:00 (분). */
const WINDOW_START_MIN = 8 * 60;
/** 창 끝(미포함) — KST 20:00 (분). */
const WINDOW_END_MIN = 20 * 60;

export function inTradingWindow(now: Date): boolean {
  const dateIso = kstDateIso(now);
  // 날짜 문자열 자체의 요일 — 시간대와 무관하다(UTC 자정으로 읽어 요일만 본다).
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (isKrxHoliday(dateIso)) return false;
  const minutes = Math.floor((now.getTime() - Date.parse(`${dateIso}T00:00:00+09:00`)) / 60_000);
  return minutes >= WINDOW_START_MIN && minutes < WINDOW_END_MIN;
}
