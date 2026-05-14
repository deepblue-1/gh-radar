/**
 * 키움 ka10001 token-bucket rate limiter.
 * RESEARCH §1.7 — 24 req/s (사용자 실측 2026-05-13).
 * worker (STEP2 hot set) + server (on-demand) 가 동일 Static IP 공유 시
 * IP-단위 통합 bucket 가설 — 양쪽 24 req/s 적용 (보수적 overprovision).
 */

const BUCKET_CAPACITY_DEFAULT = 24;
const REFILL_RATE_PER_SEC_DEFAULT = 24;

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
