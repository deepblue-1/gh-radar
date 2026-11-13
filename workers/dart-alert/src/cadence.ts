/**
 * Phase 43-03 — 공시 알림 수집기의 시간 규칙. 순수 함수만 둔다(I/O 없음 · kis-news-sync cadence 꼴).
 *
 * 시각 인자는 모두 epoch ms `number`(nowMs)다 — 43-05 수집기가 `clock.now()` 숫자를 그대로 넘긴다.
 * 시각 계산은 +9h 뒤 getUTC* / Date.UTC 로만 한다 — 컨테이너 · 호스트 TZ 에 의존하지 않는다.
 *
 * - D-10 바퀴 간격: 평일 KST `07:00` ~ `09:00` 5초 · `09:00` ~ `20:00` 10초. 바퀴 시작 대 시작 간격이라
 *   하루 바퀴 수가 산수대로 나온다 — 7,200초 ÷ 5 + 39,600초 ÷ 10 = 5,400바퀴 × 감시 대상 2 = 10,800회
 *   (공식 20,000/일의 54% · 예산 상한 15,000 이하 · SC-4). 감시 대상을 늘리면 `plannedDailyCalls` 와
 *   `DART_DAILY_BUDGET_LIMIT` 를 같이 점검한다(3개면 16,200 으로 넘는다).
 * - D-11 창: 평일 `07:00` 이상 `20:00` 미만만 수집 · 그 밖과 주말은 없음. **휴장일 달력은 넣지 않는다** —
 *   평일 공휴일도 평일처럼 돈다(비용은 빈 응답 몇 번뿐이고 공휴일에도 공시는 접수될 수 있다).
 * - D-12 「(늦은 알림)」: 처음 본 순간이 그 감시 대상의 커버 기준점에서 60초(`LATE_GAP_MS`) 넘게 뒤면 늦은 건.
 *   커버 기준점 = 오늘(KST) 창 시작 이후 마지막 성공 조회 시각, 없으면 `07:00` + 120초(`START_GRACE_MS` —
 *   Scheduler `07:00` 발화 → Job 기동 지연 흡수).
 *   「그 실행의 첫 조회에 이미 있던 건 = 늦음」 같은 단순 근사는 쓰지 않는다: 전날 저녁 접수 서류가 다음 날
 *   아침 목록에 늦게 나타나는 경우(리서치 확인 4)와 정상 `07:00` 기동 지연이 모두 오판된다. 기준점 방식은
 *   정상 바퀴(5초 · 10초)에선 절대 늦음이 안 되고, 수집기가 비어 있던 시간(아침 장애 · 교대)만 늦음이 된다.
 * - 43-07 Scheduler 정합 테스트(tests/schedule.test.ts)가 `WINDOW_START_MIN` · `WINDOW_END_MIN` · `isInWindow`
 *   를 읽어 Scheduler 발화 시각과 맞춰 본다 — 값을 바꾸면 배포 스크립트도 같이 바꾼다.
 */

/** 창 시작: KST 07:00 (자정 이후 분 · 포함) */
export const WINDOW_START_MIN = 420;
/** 장전 끝: KST 09:00 (이 앞은 5초 · 이 뒤는 10초) */
export const PREOPEN_END_MIN = 540;
/** 창 끝: KST 20:00 (자정 이후 분 · 제외) */
export const WINDOW_END_MIN = 1200;

/** 장전(07:00 ~ 09:00) 바퀴 간격 */
export const PREOPEN_INTERVAL_MS = 5_000;
/** 정규(09:00 ~ 20:00) 바퀴 간격 */
export const REGULAR_INTERVAL_MS = 10_000;
/** 오늘 성공 조회가 없을 때 커버 기준점 = 창 시작 + 이 값(Job 기동 지연 흡수) */
export const START_GRACE_MS = 120_000;
/** 처음 본 시각이 커버 기준점보다 이 값을 넘게 뒤면 「(늦은 알림)」 */
export const LATE_GAP_MS = 60_000;
/** 거래소 수시공시(I001) 조회 간격 — 07:00 기준 30초 칸마다 1번(261113-iez) */
export const EXCHANGE_POLL_MS = 30_000;
/** 임원ㆍ주요주주 거래계획(D005) 조회 간격 — 07:00 기준 60초 칸마다 1번(261113-iez) */
export const TRADE_PLAN_POLL_MS = 60_000;

const KST_OFFSET_MS = 9 * 3_600_000;
const MINUTE_MS = 60_000;

function kstShifted(nowMs: number): Date {
  return new Date(nowMs + KST_OFFSET_MS);
}

/** nowMs 가 속한 KST 날의 자정(epoch ms) */
function kstMidnightMs(nowMs: number): number {
  const t = kstShifted(nowMs);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - KST_OFFSET_MS;
}

/** KST 자정 이후 정수 분 (0..1439) */
export function kstMinuteOfDay(nowMs: number): number {
  const t = kstShifted(nowMs);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** KST 요일: 0=일 … 6=토 */
export function kstDayOfWeek(nowMs: number): number {
  return kstShifted(nowMs).getUTCDay();
}

/** KST 날짜 YYYYMMDD — OpenDART list.json 의 bgn_de · end_de */
export function kstYmd(nowMs: number): string {
  return kstShifted(nowMs).toISOString().slice(0, 10).replace(/-/g, "");
}

function isWeekday(nowMs: number): boolean {
  const dow = kstDayOfWeek(nowMs);
  return dow !== 0 && dow !== 6;
}

/** 평일 KST 07:00 이상 20:00 미만인가(D-11 · 휴장일 달력 없음) */
export function isInWindow(nowMs: number): boolean {
  if (!isWeekday(nowMs)) return false;
  const m = kstMinuteOfDay(nowMs);
  return m >= WINDOW_START_MIN && m < WINDOW_END_MIN;
}

/** 지금 시작하는 바퀴의 다음 바퀴까지 간격 — 창 밖 · 주말이면 null(수집 끝) · D-10 */
export function lapIntervalMs(nowMs: number): number | null {
  if (!isInWindow(nowMs)) return null;
  return kstMinuteOfDay(nowMs) < PREOPEN_END_MIN ? PREOPEN_INTERVAL_MS : REGULAR_INTERVAL_MS;
}

/** nowMs 가 속한 KST 날의 창 시작(07:00) epoch ms */
export function windowStartMs(nowMs: number): number {
  return kstMidnightMs(nowMs) + WINDOW_START_MIN * MINUTE_MS;
}

/** nowMs 가 속한 KST 날의 창 끝(20:00) epoch ms */
export function windowEndMs(nowMs: number): number {
  return kstMidnightMs(nowMs) + WINDOW_END_MIN * MINUTE_MS;
}

/**
 * 감시 대상 조회 칸 번호(261113-iez) — `everyMs` 가 null 이면 null(바퀴마다), 아니면 그날 07:00 부터의 칸 번호
 * `floor((nowMs − 창 시작) / everyMs)`. 수집기는 바퀴 시작 시각의 칸 번호가 지난 조회 칸과 다를 때만 그 감시 대상을
 * 부른다. 30초 · 60초는 5초 · 10초 바퀴의 배수이고 09:00(7,200초)도 나누어떨어져 두 구간 모두 정확히 그 간격이다.
 * 「바퀴 N번에 1번」 은 바퀴가 밀리면 간격이 늘고 구간마다 N 이 달라 쓰지 않는다.
 */
export function pollSlot(nowMs: number, everyMs: number | null): number | null {
  if (everyMs === null) return null;
  return Math.floor((nowMs - windowStartMs(nowMs)) / everyMs);
}

/**
 * 커버 기준점(D-12) — 오늘(KST) 창 시작 이후의 마지막 성공 조회면 그 시각,
 * 없거나(null) 어제 이전이면 오늘 창 시작 + START_GRACE_MS(07:02).
 */
export function coverPointMs(nowMs: number, lastOkMs: number | null): number {
  const start = windowStartMs(nowMs);
  if (lastOkMs !== null && lastOkMs >= start) return lastOkMs;
  return start + START_GRACE_MS;
}

/** 처음 본 시각 nowMs 가 커버 기준점보다 LATE_GAP_MS 를 넘게 뒤인가 — 정확히 60초는 늦지 않음 */
export function isLateAt(nowMs: number, coverMs: number): boolean {
  return nowMs - coverMs > LATE_GAP_MS;
}

/** 기준 평일(2026-11-16 월 KST 07:00) — 바퀴 수 계산용 고정점 */
const REFERENCE_WEEKDAY_START_MS = Date.UTC(2026, 10, 15, 22, 0);

/** 평일 하루 바퀴 수 — 창 시작부터 lapIntervalMs 로 시작 대 시작을 걸어 센다(5,400) */
export function plannedDailyLaps(): number {
  const end = windowEndMs(REFERENCE_WEEKDAY_START_MS);
  let laps = 0;
  for (let t = REFERENCE_WEEKDAY_START_MS; t < end; ) {
    const iv = lapIntervalMs(t);
    if (iv === null) break;
    laps++;
    t += iv;
  }
  return laps;
}

/** 평일 하루 예상 호출 수 = 바퀴 수 × 감시 대상 수(추가 쪽 · 탐침 제외) — 2개면 10,800 */
export function plannedDailyCalls(watchCount: number): number {
  return plannedDailyLaps() * watchCount;
}
