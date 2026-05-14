/**
 * server 측 키움 ka10001 token-bucket rate limiter. 24 req/s default.
 *
 * Phase 09.1 D-29: worker (intraday-sync) 와 server (on-demand) 가 동일 Static IP 공유 시
 * 키움 측 IP-단위 통합 bucket 가설 (RESEARCH §1.7, A15). 양쪽 24 req/s overprovision 으로
 * burst 시 자연 직렬화. 실측 후 보수 조정 가능.
 *
 * worker rateLimiter 와 별도 모듈 인스턴스 (cross-workspace 회피, 본 server 프로세스 내부 직렬화).
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
