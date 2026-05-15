/**
 * 키움 ka10001 token-bucket rate limiter.
 *
 * 초기 RESEARCH §1.7 가정: 24 req/s. 실측 (2026-05-15 production cycle) 결과 200 종목 hot
 * set 호출 시 ~30% (50~68건) 가 429 반환 — 키움 실제 limit 가 더 낮음. KA10001_RATE_LIMIT=5
 * 로 하향 후 failed=0 / successful=203 안정 확인. default 도 5 로 통일 (env 미지정 시
 * 즉시 안정 동작).
 *
 * worker (STEP2 hot set) + server (on-demand) 가 동일 Static IP 공유 시 IP-단위 통합 bucket
 * 가설은 유효 — 양쪽 동일 default 적용.
 */

const BUCKET_CAPACITY_DEFAULT = 5;
const REFILL_RATE_PER_SEC_DEFAULT = 5;

type Bucket = {
  available: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
};

const bucket: Bucket = {
  available: BUCKET_CAPACITY_DEFAULT,
  lastRefill: Date.now(),
  capacity: BUCKET_CAPACITY_DEFAULT,
  refillRate: REFILL_RATE_PER_SEC_DEFAULT,
};

export function configureKiwoomRateLimiter(opts: {
  capacity: number;
  refillRatePerSec: number;
}): void {
  bucket.capacity = opts.capacity;
  bucket.refillRate = opts.refillRatePerSec;
  bucket.available = Math.min(bucket.available, opts.capacity);
}

export async function acquireKiwoomRateToken(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      const now = Date.now();
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.available = Math.min(
        bucket.capacity,
        bucket.available + elapsedSec * bucket.refillRate,
      );
      bucket.lastRefill = now;

      if (bucket.available >= 1) {
        bucket.available -= 1;
        resolve();
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });
}

export function resetKiwoomRateLimiter(): void {
  bucket.available = bucket.capacity;
  bucket.lastRefill = Date.now();
}
