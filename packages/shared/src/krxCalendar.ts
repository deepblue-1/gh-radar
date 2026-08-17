/**
 * KRX 휴장일 캘린더 — 0차 가드 (quick-260817-f1a RESEARCH §Q2/§Q3).
 *
 * 배경(2026-08-17 사고): 키움 ka10027/ka10001 응답에는 데이터 기준일자 필드가 없고,
 * 휴장일에는 직전 거래일 + 시간외 보정 스냅샷을 그대로 재방출한다. 값 비교 휴리스틱
 * (staleGuard) 은 키움이 값을 1원이라도 바꾸면 뚫린다 → 캘린더가 유일한 비용 0 결정적 신호.
 *
 * ⚠️ 유지보수 필수: 아래 리스트는 **2026-12-31 까지만** seed 되어 있다.
 *    매년 12월 KRX "연말 시장운영 일정" 공지가 나오면 이듬해 휴장일을 반드시 추가할 것.
 *    미갱신 시 2027-01-01 부터 이 가드는 조용히 무력화된다(→ isKrxCalendarStale 로 fail-loud).
 * ⚠️ seed 는 반드시 국내 기사 원문/KRX·증권사 공지로 교차검증한 값만 사용.
 *    LLM/검색 요약은 2026 설·추석 날짜를 다수 오답했다(RESEARCH P5).
 *    오답 seed = 정상 거래일 skip = 더 큰 사고.
 * ⚠️ 주말(토/일)은 각 워커의 Cloud Scheduler cron(1-5 / 2-6)이 커버하므로 여기 넣지 않는다.
 */
export const KRX_HOLIDAYS: readonly string[] = [
  "2026-08-17", // 광복절(8/15 토) 대체공휴일
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-10-05", // 개천절(10/3 토) 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
  "2026-12-31", // 연말 휴장 (마지막 거래일 12/30 수)
];

/** KRX_HOLIDAYS 가 커버하는 마지막 날짜. 이후는 미seed 구간. */
export const KRX_HOLIDAYS_SEEDED_THROUGH = "2026-12-31";

/** 모듈 스코프 1회 생성 — isKrxHoliday 가 O(1) 조회. */
const HOLIDAY_SET: ReadonlySet<string> = new Set(KRX_HOLIDAYS);

/** `YYYY-MM-DD` 가 KRX 휴장일이면 true. 미seed 구간은 false(→ isKrxCalendarStale 로 감지). */
export function isKrxHoliday(dateIso: string): boolean {
  return HOLIDAY_SET.has(dateIso);
}

/**
 * seed 만료 감지 — dateIso 가 seed 커버 범위를 넘었으면 true.
 * ISO 날짜는 사전순 = 시간순이라 문자열 비교로 충분.
 */
export function isKrxCalendarStale(dateIso: string): boolean {
  return dateIso > KRX_HOLIDAYS_SEEDED_THROUGH;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Date → KST 기준 `YYYY-MM-DD`.
 *
 * 기존 marketHours.ts 의 getKstDate 는 getTimezoneOffset 을 쓰는 다른 방식이라 재사용하지 않는다.
 * 워커의 todayIsoKst / computeSlot 과 동일한 `+9h → getUTC*` 방식으로 통일.
 */
export function kstDateIso(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
