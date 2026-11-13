/**
 * Phase 43-03 — 공시 알림 수집기의 시간 규칙. 순수 함수만 둔다(I/O 없음 · kis-news-sync cadence 꼴).
 *
 * 시각 인자는 모두 epoch ms `number`(nowMs)다 — 43-05 수집기가 `clock.now()` 숫자를 그대로 넘긴다.
 * 시각 계산은 +9h 뒤 getUTC* / Date.UTC 로만 한다 — 컨테이너 · 호스트 TZ 에 의존하지 않는다.
 *
 * - 사용자 결정 2026-11-13(quick 261113-rn7 · U-2)이 Phase 43 D-10(07:00 ~ 09:00 5초 · 09:00 ~ 20:00 10초 바퀴)을 대체한다 —
 *   평일 KST `07:00` ~ `20:00` 종일 5초 바퀴(`LAP_INTERVAL_MS`). 바퀴 시작 대 시작 간격이라 하루 바퀴 수가 산수대로
 *   나온다 — 46,800초 ÷ 5 = 9,360바퀴. 감시 대상마다 조회 간격(`PollCadence`)을 따로 둔다:
 *   · 키 1 — 공개매수 `D004` 매 바퀴(9,360) + 주요사항보고서 `B001` `09:00` 전 매 바퀴 · 뒤 10초 칸
 *     (7,200 ÷ 5 + 39,600 ÷ 10 = 1,440 + 3,960 = 5,400) = 14,760.
 *   · 키 2 — 거래소 수시공시 `I001` 10초 칸 4,680 + 30초 칸 감시 대상(거래소 시장조치 `I003` · 최대주주 소유주식 변동
 *     `I004` · 임원ㆍ주요주주 거래계획 `D005`) 각 1,560 = 9,360. I001 이 100건을 넘는 날은 추가 쪽 — 전 쪽 다시 읽기가
 *     30초에 많아야 1번(dart/client.ts `GREW_REREAD_MIN_MS` · 리뷰 WR-03)이라 상한 = 46,800 ÷ 30 × (쪽 수 − 1)
 *     = 1,560 × (쪽 수 − 1): 2쪽(200건 이하) +1,560 → 10,920 · 4쪽(400건 이하) +4,680 → 14,040 ≤ 15,000 ·
 *     5쪽(401건 이상)이면 +6,240 → 15,600 으로 예산을 넘는다(그날 키 2 만 멈춤 · 장애 글).
 *     키 1 의 B001 도 같은 규칙이라 100건을 넘는 날은 +1,560 → 16,320 으로 넘는다 — 감속 규칙은 두지 않는다(사용자 결정 ·
 *     B001 은 하루 30건 안팎).
 *   · 아침 전날 확인(U-3 · `prevWeekdayYmd`): 그날 감시 대상별 첫 성공 조회 때 직전 평일을 한 번 더(전 쪽 · 실패면 5분 뒤 ·
 *     하루 3번 상한 — 리뷰 WR-01) — 성공 1번이면 키 1 2(D004 · B001 각 1쪽) · 키 2 약 5(I001 2쪽 + 셋 각 1쪽).
 *     키 1 14,762 · 키 2 I001 4쪽 날 14,040 + 전날 확인(전날도 4쪽이면 7) = 14,047 ≤ 15,000.
 *   하루 호출(`plannedDailyCalls`)은 키마다 따로 세어 키마다 예산 상한(`DART_DAILY_BUDGET_LIMIT`)과 견준다 — 감시 대상 ·
 *   간격을 더하거나 바꾸면 그 키의 `plannedDailyCalls` 와 예산 상한을 같이 점검한다(tests/cadence.test.ts 가 묶는다).
 * - D-11 창: 평일 `07:00` 이상 `20:00` 미만만 수집 · 그 밖과 주말은 없음. **휴장일 달력은 넣지 않는다** —
 *   평일 공휴일도 평일처럼 돈다(비용은 빈 응답 몇 번뿐이고 공휴일에도 공시는 접수될 수 있다).
 * - D-12 「(늦은 알림)」: 처음 본 순간이 그 감시 대상의 커버 기준점에서 60초(`LATE_GAP_MS`) 넘게 뒤면 늦은 건.
 *   커버 기준점 = 오늘(KST) 창 시작 이후 마지막 성공 조회 시각, 없으면 `07:00` + 120초(`START_GRACE_MS` —
 *   Scheduler `07:00` 발화 → Job 기동 지연 흡수).
 *   「그 실행의 첫 조회에 이미 있던 건 = 늦음」 같은 단순 근사는 쓰지 않는다: 전날 저녁 접수 서류가 다음 날
 *   아침 목록에 늦게 나타나는 경우(리서치 확인 4)와 정상 `07:00` 기동 지연이 모두 오판된다. 기준점 방식은
 *   정상 바퀴(5초 · 10초)에선 절대 늦음이 안 되고, 수집기가 비어 있던 시간(아침 장애 · 교대)만 늦음이 된다.
 *   감시 대상별 늦음 간격(`lateGapMs(everyMsAt(…))`) = 60초 + 그 시각의 그 감시 대상 조회 간격 — D004 60초 ·
 *   B001 `09:00` 전 60초 · 뒤 70초 · I001 70초 · 30초 칸 감시 대상 90초. 정상 조회 간격만큼 비는 감시 대상을 60초로 재면
 *   바퀴가 조금만 밀려도 늦음이 되기 때문(261113-iez).
 * - 43-07 Scheduler 정합 테스트(tests/schedule.test.ts)가 `WINDOW_START_MIN` · `WINDOW_END_MIN` · `isInWindow`
 *   를 읽어 Scheduler 발화 시각과 맞춰 본다 — 값을 바꾸면 배포 스크립트도 같이 바꾼다.
 */

/** 창 시작: KST 07:00 (자정 이후 분 · 포함) */
export const WINDOW_START_MIN = 420;
/** 장전 끝: KST 09:00 — 주요사항보고서(B001)가 이 앞은 매 바퀴 · 이 뒤는 10초 칸(`everyMsAt`) */
export const PREOPEN_END_MIN = 540;
/** 창 끝: KST 20:00 (자정 이후 분 · 제외) */
export const WINDOW_END_MIN = 1200;

/** 바퀴 간격 — 창 안 종일 5초(사용자 결정 2026-11-13 · 공개매수 종일 5초) */
export const LAP_INTERVAL_MS = 5_000;
/** 오늘 성공 조회가 없을 때 커버 기준점 = 창 시작 + 이 값(Job 기동 지연 흡수) */
export const START_GRACE_MS = 120_000;
/** 처음 본 시각이 커버 기준점보다 이 값을 넘게 뒤면 「(늦은 알림)」 */
export const LATE_GAP_MS = 60_000;
/** 주요사항보고서(B001) `09:00` 뒤 조회 간격 — 07:00 기준 10초 칸 */
export const RIGHTS_REGULAR_POLL_MS = 10_000;
/** 거래소 수시공시(I001) 조회 간격 — 07:00 기준 10초 칸 */
export const EXCHANGE_POLL_MS = 10_000;
/** 30초 칸 감시 대상(거래소 시장조치 I003 · 최대주주 소유주식 변동 I004 · 임원ㆍ주요주주 거래계획 D005) 조회 간격 */
export const SLOW_POLL_MS = 30_000;

/**
 * 감시 대상 조회 간격 — `everyMs` null = 바퀴마다 · 숫자 = 07:00 기준 그 간격의 시각 칸마다 1번.
 * `preopenEveryMs` 가 정의돼 있으면(null 포함) `09:00` 앞은 그 값을 쓴다(B001 — 09:00 전 매 바퀴).
 */
export interface PollCadence {
  everyMs: number | null;
  preopenEveryMs?: number | null;
}

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

/** 지금 시작하는 바퀴의 다음 바퀴까지 간격 — 창 밖 · 주말이면 null(수집 끝) · 창 안이면 종일 5초 */
export function lapIntervalMs(nowMs: number): number | null {
  if (!isInWindow(nowMs)) return null;
  return LAP_INTERVAL_MS;
}

/** 그 시각의 조회 간격 — `09:00` 앞이고 `preopenEveryMs` 가 정의돼 있으면 그 값, 아니면 `everyMs` */
export function everyMsAt(c: PollCadence, nowMs: number): number | null {
  if (c.preopenEveryMs !== undefined && kstMinuteOfDay(nowMs) < PREOPEN_END_MIN) return c.preopenEveryMs;
  return c.everyMs;
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
 * 부른다. 10초 · 30초는 5초 바퀴의 배수이고 09:00(7,200초)도 나누어떨어져 정확히 그 간격이다.
 * 「바퀴 N번에 1번」 은 바퀴가 밀리면 간격이 늘고 구간마다 N 이 달라 쓰지 않는다.
 */
export function pollSlot(nowMs: number, everyMs: number | null): number | null {
  if (everyMs === null) return null;
  return Math.floor((nowMs - windowStartMs(nowMs)) / everyMs);
}

/**
 * 직전 평일 KST `YYYYMMDD`(아침 전날 확인 · 261113-rn7 U-3) — nowMs 가 속한 KST 날에서 하루씩 물러나 토 · 일이면 더 물러난
 * 첫 평일(월 → 금 · 토/일 → 금). **휴장일 달력 없음**. 그날 KST 정오에서 하루씩 빼 계산해 자정 경계 오차가 없다.
 */
export function prevWeekdayYmd(nowMs: number): string {
  let t = kstMidnightMs(nowMs) + 12 * 3_600_000;
  do {
    t -= 86_400_000;
  } while (!isWeekday(t));
  return kstYmd(t);
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

/** 감시 대상별 늦음 간격 = LATE_GAP_MS + 조회 간격(바퀴마다면 0) — 60초 · 70초(10초 칸) · 90초(30초 칸) */
export function lateGapMs(everyMs: number | null): number {
  return LATE_GAP_MS + (everyMs ?? 0);
}

/** 처음 본 시각 nowMs 가 커버 기준점보다 gapMs(기본 60초)를 넘게 뒤인가 — 정확히 그 간격은 늦지 않음 */
export function isLateAt(nowMs: number, coverMs: number, gapMs: number = LATE_GAP_MS): boolean {
  return nowMs - coverMs > gapMs;
}

/** 기준 평일(2026-11-16 월 KST 07:00) — 바퀴 수 계산용 고정점 */
const REFERENCE_WEEKDAY_START_MS = Date.UTC(2026, 10, 15, 22, 0);

/** 평일 하루 바퀴 수 — 창 시작부터 lapIntervalMs 로 시작 대 시작을 걸어 센다(9,360) */
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

/**
 * 평일 하루 그 감시 대상 조회 수 — 기준 평일을 lapIntervalMs 로 걸으며 바퀴마다 그 시각의 조회 칸
 * (`pollSlot(t, everyMsAt(c, t))`)이 null 이거나 지난 칸과 다르면 센다(수집기 `takeSlot` 과 같은 규칙).
 * 바퀴마다 9,360 · 10초 칸 4,680 · 30초 칸 1,560 · B001(09:00 전 매 바퀴 · 뒤 10초) 5,400.
 */
export function plannedDailyPolls(c: PollCadence): number {
  const end = windowEndMs(REFERENCE_WEEKDAY_START_MS);
  let polls = 0;
  let last: number | null = null;
  for (let t = REFERENCE_WEEKDAY_START_MS; t < end; ) {
    const iv = lapIntervalMs(t);
    if (iv === null) break;
    const slot = pollSlot(t, everyMsAt(c, t));
    if (slot === null || slot !== last) polls++;
    last = slot;
    t += iv;
  }
  return polls;
}

/** 평일 하루 예상 호출 수 = 감시 대상별 조회 수 합(추가 쪽 · 탐침 · 아침 전날 확인 제외) — 키마다 따로 부른다 */
export function plannedDailyCalls(cadences: readonly PollCadence[]): number {
  return cadences.reduce((sum, c) => sum + plannedDailyPolls(c), 0);
}
