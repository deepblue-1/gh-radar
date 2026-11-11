/**
 * Phase 41-08 — 초당 상한 토큰 버킷 · 종목별 조회 대상 순서. 순수(시계 주입 · I/O 없음).
 *
 * - 공식 API 운영 기준 ①: 모든 한투 호출은 초당 `KIS_NEWS_MAX_RPS`(기본 5 · 공식 20/s 의 25%) 버킷 하나를
 *   지난다. 종목별 조회는 그 절반 속도 버킷을 하나 더 지난다(41-RESEARCH Pattern 2 · 2.5/s).
 *   intraday-sync `kiwoom/rateLimiter.ts` 꼴이지만 모듈 전역 대신 시계를 주입받는 클래스다(13시간 실행을
 *   가짜 시계로 몇 초 만에 테스트).
 * - 수집기는 두 버킷 모두 용량 1 로 만든다 — 버스트가 없어 어느 1초 창(반열림)에서도 초당 상한을 넘지 않는다.
 * - D-05 · D-06: 대상은 10초마다 다시 읽는다. 한 번도 모으지 않은 종목(새 등록)이 맨 앞(등록 최신순) ·
 *   그다음 가장 오래전에 모은 순 · 30초(STOCK_MIN_INTERVAL_MS) 안에 모은 종목은 건너뛴다.
 *   상한(`KIS_NEWS_TARGET_CAP` 기본 450 → 한 바퀴 ≈ 450 / 2.5 = 180초)을 넘으면 급등 · 관심을 먼저 남기고
 *   나머지 수를 `dropped` 로 돌려준다(루프가 warn).
 */

/** 같은 종목을 다시 조회하기까지 최소 간격 */
export const STOCK_MIN_INTERVAL_MS = 30_000;

/** 대상 한 종목 — 시각은 epoch ms */
export interface TargetInfo {
  code: string;
  /** "mover" · "watch" · "registered" (41-02 kis_news_targets_list) */
  reasons: string[];
  /** 최신 급등 순위 (없으면 null) */
  rank: number | null;
  /** 마지막 조회 등록(웹 · gh-trade 묶음 조회) */
  lastRequestedAt: number | null;
  /** 마지막 종목별 조회 성공(DB) */
  lastCollectedAt: number | null;
}

const EPS = 1e-9;

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSec: number,
    private readonly capacity: number,
    private readonly clock: () => number,
  ) {
    if (!(ratePerSec > 0) || !(capacity >= 1)) {
      throw new Error(`TokenBucket: rate > 0 · capacity >= 1 (rate=${ratePerSec} capacity=${capacity})`);
    }
    this.tokens = capacity;
    this.last = clock();
  }

  private refill(): void {
    const now = this.clock();
    if (now > this.last) {
      this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    }
    this.last = Math.max(this.last, now);
  }

  /** 토큰이 있으면 하나 쓰고 true */
  tryTake(): boolean {
    this.refill();
    if (this.tokens + EPS >= 1) {
      this.tokens = Math.max(0, this.tokens - 1);
      return true;
    }
    return false;
  }

  /** 다음 토큰까지 남은 ms (지금 있으면 0) */
  msUntilNext(): number {
    this.refill();
    if (this.tokens + EPS >= 1) return 0;
    return Math.max(0, Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000 - 1e-6));
  }
}

function isCore(t: TargetInfo): boolean {
  return t.reasons.includes("mover") || t.reasons.includes("watch");
}

/** 상한을 넘을 때 남길 순서: 급등 · 관심(순위 오름) → 등록(최근 요청순) */
function importance(a: TargetInfo, b: TargetInfo): number {
  const ca = isCore(a) ? 0 : 1;
  const cb = isCore(b) ? 0 : 1;
  if (ca !== cb) return ca - cb;
  const ra = a.rank ?? Number.POSITIVE_INFINITY;
  const rb = b.rank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  const qa = a.lastRequestedAt ?? Number.NEGATIVE_INFINITY;
  const qb = b.lastRequestedAt ?? Number.NEGATIVE_INFINITY;
  if (qa !== qb) return qb - qa;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

export class TargetQueue {
  private targets: TargetInfo[] = [];
  /** 이 실행에서 조회한 시각(성공 · 실패 모두) — DB 값보다 새 정보다 */
  private local = new Map<string, number>();

  constructor(
    private readonly minIntervalMs: number = STOCK_MIN_INTERVAL_MS,
    private readonly cap = 450,
  ) {}

  /** 대상 목록 교체. 같은 코드가 둘이면 처음 것만 */
  update(targets: readonly TargetInfo[], _now: number): { size: number; dropped: number } {
    const seen = new Set<string>();
    const unique = targets.filter((t) => (seen.has(t.code) ? false : (seen.add(t.code), true)));
    const kept = unique.length > this.cap ? [...unique].sort(importance).slice(0, this.cap) : unique;
    this.targets = kept;
    const keep = new Set(kept.map((t) => t.code));
    for (const code of this.local.keys()) if (!keep.has(code)) this.local.delete(code);
    return { size: kept.length, dropped: unique.length - kept.length };
  }

  private lastOf(t: TargetInfo): number | null {
    const l = this.local.get(t.code);
    if (l === undefined) return t.lastCollectedAt;
    return t.lastCollectedAt === null ? l : Math.max(l, t.lastCollectedAt);
  }

  /** 다음 조회할 종목 — 모두 30초 안에 모았으면 null */
  next(now: number): TargetInfo | null {
    let best: TargetInfo | null = null;
    let bestLast: number | null = null;
    for (const t of this.targets) {
      const last = this.lastOf(t);
      if (last !== null && now - last < this.minIntervalMs) continue;
      if (best === null || this.before(t, last, best, bestLast)) {
        best = t;
        bestLast = last;
      }
    }
    return best;
  }

  /** a(마지막 aLast)가 b 보다 먼저인가: 수집 전(등록 최신순) → 오래전에 모은 순 */
  private before(a: TargetInfo, aLast: number | null, b: TargetInfo, bLast: number | null): boolean {
    if (aLast === null && bLast !== null) return true;
    if (aLast !== null && bLast === null) return false;
    if (aLast === null && bLast === null) {
      const qa = a.lastRequestedAt ?? Number.NEGATIVE_INFINITY;
      const qb = b.lastRequestedAt ?? Number.NEGATIVE_INFINITY;
      if (qa !== qb) return qa > qb;
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra < rb;
      return a.code < b.code;
    }
    if (aLast !== bLast) return (aLast as number) < (bLast as number);
    return a.code < b.code;
  }

  /** 이 실행에서 조회한 시각을 남긴다(성공 · 실패 모두 — 실패한 종목을 매 걸음 다시 두드리지 않게) */
  markCollected(code: string, now: number): void {
    this.local.set(code, now);
  }
}
