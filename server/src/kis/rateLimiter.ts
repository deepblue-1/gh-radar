// KIS 공식 제한은 20 req/sec 이지만 공유 bucket/server-side burst detection 로
// 실측 EGW00201 이 10 req/sec 에서도 발생. 5 req/sec 로 보수화 (Phase 05.2 hotfix).
// 119 종목 × 200ms = ~24s, task-timeout 120s 안에 충분히 여유.
const MAX_REQUESTS_PER_SEC = 5;

let tokens = MAX_REQUESTS_PER_SEC;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const newTokens = (elapsed / 1000) * MAX_REQUESTS_PER_SEC;
  tokens = Math.min(MAX_REQUESTS_PER_SEC, tokens + newTokens);
  lastRefill = now;
}

export async function waitForSlot(): Promise<void> {
  refill();
  if (tokens >= 1) {
    tokens -= 1;
    return;
  }
  const waitMs = ((1 - tokens) / MAX_REQUESTS_PER_SEC) * 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  refill();
  tokens -= 1;
}

export function resetRateLimiter(): void {
  tokens = MAX_REQUESTS_PER_SEC;
  lastRefill = Date.now();
}
