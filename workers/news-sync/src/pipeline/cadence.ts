/**
 * quick-260915-h3p — news-sync 수집 주기(cadence) 판정. 순수 함수만 둔다 (I/O 금지).
 *
 * 설계:
 *  - 평일 장시간(KST 08:00~20:00)은 3분 단일 스케줄러가 호출한다. 매 실행이
 *      hot 등급 = 급등 상위 30(top_movers rank ≤ 30) ∪ 관심종목(watchlists) 전부
 *    + rest 등급 = 나머지 top_movers 중 3조 순환 버킷 하나
 *    를 수집한다 → hot 은 3분, rest 는 9분 신선도.
 *  - 그 외 시각과 토·일은 전체 대상(full)을 수집한다.
 *  - 모드는 스케줄러가 넘기지 않고 워커가 KST 시각으로 스스로 판정한다(auto).
 *    수동 실행은 NEWS_SYNC_MODE=tiered|full 로 강제한다.
 *
 * 시각 계산은 +9h 후 getUTC* 로만 한다(@gh-radar/shared kstDateIso 와 같은 방식) —
 * 컨테이너/호스트 TZ 에 의존하지 않는다.
 */

/** 장시간 창 시작: KST 08:00 (자정 이후 분). */
export const MARKET_WINDOW_START_MIN = 480;

/**
 * 장시간 창 끝: KST 20:02 (포함).
 * 20:00 스케줄 실행(market-close)이 늦게 시작해도 tiered 로 판정되게 하는 여유이며,
 * intraday-sync 가 20:02 까지 top_movers 를 갱신하므로 rank 기반 등급이 그때까지 유효하다.
 */
export const MARKET_WINDOW_END_MIN = 1202;

/** hot 등급 급등 순위 상한 (rank ≤ 30). */
export const HOT_RANK_MAX = 30;

/** rest 등급 순환 버킷 수. */
export const REST_BUCKET_COUNT = 3;

/** 장시간 스케줄러 주기(분). */
export const SLOT_MINUTES = 3;

export type RunMode = "tiered" | "full";
export type RunModeSetting = "auto" | RunMode;

const KST_OFFSET_MS = 9 * 3600_000;

function kstShifted(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** KST 자정 이후 정수 분 (0..1439). */
export function kstMinuteOfDay(now: Date): number {
  const t = kstShifted(now);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** KST 요일: 0=일 … 6=토. */
export function kstDayOfWeek(now: Date): number {
  return kstShifted(now).getUTCDay();
}

/**
 * 실행 모드 판정. tiered/full 이 주어지면 그대로(override), auto 는
 * 월~금 ∧ START ≤ KST 분 ≤ END 이면 tiered, 아니면 full.
 * KRX 평일 휴장일은 평일로 취급한다(휴장일 달력 미반영 — 범위 밖).
 */
export function resolveRunMode(now: Date, setting: RunModeSetting): RunMode {
  if (setting === "tiered" || setting === "full") return setting;
  const dow = kstDayOfWeek(now);
  if (dow === 0 || dow === 6) return "full";
  const m = kstMinuteOfDay(now);
  return m >= MARKET_WINDOW_START_MIN && m <= MARKET_WINDOW_END_MIN
    ? "tiered"
    : "full";
}

/**
 * 이번 실행이 수집할 rest 버킷 = floor(KST 분 / 3) % 3.
 *
 * - Cloud Scheduler 는 예정 시각보다 일찍 발화하지 않는다. now 는 run 시작 시 1회 캡처한다.
 *   분 단위 floor 이므로 최대 2분 59초 늦게 시작해도 예정 슬롯(= 같은 버킷)에 매핑된다.
 * - 연속 3분 슬롯은 버킷을 +1 mod 3 으로 회전시킨다(08:00→1, 08:03→2, 08:06→0) —
 *   rest 종목 하나는 연속 3슬롯에서 정확히 1번, 즉 9분마다 수집된다.
 * - 상태를 저장하지 않는다(stateless) — 이전 실행 결과에 의존하지 않는다.
 */
export function restBucketFor(now: Date): number {
  return Math.floor(kstMinuteOfDay(now) / SLOT_MINUTES) % REST_BUCKET_COUNT;
}

/**
 * 종목 코드 → 버킷(0..2).
 * 상위 종목 구성이 매 실행 바뀌어도 종목별 버킷이 안정적이도록 목록 인덱스가 아니라
 * 코드 해시를 쓴다. FNV-1a 32bit 로 누적한 뒤 murmur3 fmix32 finalizer 로 비트를 섞는다
 * (연속 6자리 코드에서 FNV-1a 하위 비트만 쓰면 분포가 치우칠 수 있다).
 * tests/cadence.test.ts 가 대표 코드의 버킷 값을 잠근다 — 해시를 바꾸면 테스트가 깨져야 한다.
 */
export function stockBucket(code: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % REST_BUCKET_COUNT;
}

export interface TargetRecord {
  code: string;
  name: string;
  /** 최신 scan 의 top_movers.rank. top_movers 에 없거나 rank 가 null 이면 null. */
  rank: number | null;
  /** watchlists 에 1명 이상 담겨 있으면 true. */
  watched: boolean;
}

export interface TargetCounts {
  /** 입력 records 수 */
  total: number;
  /** hot 등급 수 */
  hot: number;
  /** rest 등급 전체 수 */
  restTotal: number;
  /** 이번 실행에 선택된 rest 수 (full 이면 restTotal) */
  restSelected: number;
}

export interface TargetSelection {
  selected: TargetRecord[];
  counts: TargetCounts;
}

function isHot(t: TargetRecord): boolean {
  return t.watched || (t.rank !== null && t.rank <= HOT_RANK_MAX);
}

/**
 * 대상 선택.
 *  - full: records 전체 (code 기준 1회).
 *  - tiered: hot 전부 + (hot 이 아니면서 stockBucket === restBucket 인 rest).
 *    관심종목은 rank 와 무관하게 hot 이므로 rest 로 중복 선택되지 않는다.
 * 결과는 hot 을 앞에 둔 순서이고, code 기준으로 한 번만 담는다(방어적 Set).
 */
export function selectRunTargets(
  records: TargetRecord[],
  mode: RunMode,
  restBucket: number | null,
): TargetSelection {
  const seen = new Set<string>();
  const unique: TargetRecord[] = [];
  const hot: TargetRecord[] = [];
  const rest: TargetRecord[] = [];
  for (const t of records) {
    if (seen.has(t.code)) continue;
    seen.add(t.code);
    unique.push(t);
    (isHot(t) ? hot : rest).push(t);
  }

  if (mode === "full") {
    return {
      selected: unique,
      counts: {
        total: seen.size,
        hot: hot.length,
        restTotal: rest.length,
        restSelected: rest.length,
      },
    };
  }

  const restPicked = rest.filter((t) => stockBucket(t.code) === restBucket);
  return {
    selected: [...hot, ...restPicked],
    counts: {
      total: seen.size,
      hot: hot.length,
      restTotal: rest.length,
      restSelected: restPicked.length,
    },
  };
}

export interface RunPlan extends TargetSelection {
  mode: RunMode;
  /** tiered 에서만 값이 있고 full 은 null. */
  restBucket: number | null;
}

/** index.ts 가 호출하는 단일 진입점 — 모드 · 버킷 · 대상 · 집계를 한 번에 정한다. */
export function planRun(
  now: Date,
  setting: RunModeSetting,
  records: TargetRecord[],
): RunPlan {
  const mode = resolveRunMode(now, setting);
  const restBucket = mode === "tiered" ? restBucketFor(now) : null;
  const { selected, counts } = selectRunTargets(records, mode, restBucket);
  return { mode, restBucket, selected, counts };
}
