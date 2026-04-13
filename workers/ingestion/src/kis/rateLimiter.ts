const MAX_REQUESTS_PER_SEC = 15;

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
