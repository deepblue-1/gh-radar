import type { KisNewsMode } from "../config.js";
import { kstDateString } from "../apiUsage.js";

/**
 * Phase 41-08 — 수집기 모드 판정(D-02). 순수 함수만 둔다(I/O 없음 · news-sync cadence 꼴).
 *
 * - 빠른 창 = 평일 KST `07:00` 이상 `20:00` 미만. Scheduler `gh-radar-kis-news-sync-fast`
 *   (`*\/5 7-19 * * 1-5`)가 이 창에서만 5분마다 깨우고, 깨어난 실행 하나가 임대를 잡고 20:00 까지 돈다.
 * - 그 밖과 주말은 느린 실행 한 번(되감기 + 공시 안전망 + 대상 한 바퀴 뒤 종료) — 15분마다.
 * - KRX 평일 휴장일도 평일로 본다(휴장일 달력 미반영 · 비용은 빈 피드 몇 번).
 * - 모드는 Scheduler 가 넘기지 않는다 — 수집기가 KST 시각으로 스스로 판정한다(auto).
 *   수동 강제는 `KIS_NEWS_MODE=fast|slow|probe`.
 * - tests/schedule.test.ts 가 배포 스크립트의 Scheduler 배열과 이 판정을 1주일 × 1440분으로 맞춰 본다.
 *
 * 시각 계산은 +9h 뒤 getUTC* 로만 한다 — 컨테이너 · 호스트 TZ 에 의존하지 않는다.
 */

/** 빠른 창 시작: KST 07:00 (자정 이후 분 · 포함) */
export const FAST_WINDOW_START_MIN = 420;
/** 빠른 창 끝: KST 20:00 (자정 이후 분 · 제외) */
export const FAST_WINDOW_END_MIN = 1200;

export type CollectorMode = "fast" | "slow" | "probe";

const KST_OFFSET_MS = 9 * 3_600_000;

function kstShifted(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** KST 자정 이후 정수 분 (0..1439) */
export function kstMinuteOfDay(now: Date): number {
  const t = kstShifted(now);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** KST 요일: 0=일 … 6=토 */
export function kstDayOfWeek(now: Date): number {
  return kstShifted(now).getUTCDay();
}

/** auto 면 KST 시각으로 판정 · fast · slow · probe 는 그대로 */
export function resolveCollectorMode(now: Date, setting: KisNewsMode): CollectorMode {
  if (setting !== "auto") return setting;
  const dow = kstDayOfWeek(now);
  if (dow === 0 || dow === 6) return "slow";
  const m = kstMinuteOfDay(now);
  return m >= FAST_WINDOW_START_MIN && m < FAST_WINDOW_END_MIN ? "fast" : "slow";
}

/** now 가 속한 KST 날의 빠른 창 끝(KST 20:00) */
export function fastWindowEndOf(now: Date): Date {
  const t = kstShifted(now);
  const kstMidnightUtcMs =
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - KST_OFFSET_MS;
  return new Date(kstMidnightUtcMs + FAST_WINDOW_END_MIN * 60_000);
}

/** 보관 정리를 오늘(KST) 아직 안 했는가 — kis_news_state.cleanup_date(YYYY-MM-DD) 와 비교 */
export function isCleanupDue(now: Date, cleanupDate: string | null): boolean {
  return cleanupDate !== kstDateString(now);
}
