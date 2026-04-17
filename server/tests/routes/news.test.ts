import { describe, it } from "vitest";

// Phase 07 Plan 01 — server 뉴스 라우트 테스트 스텁.
// Plan 07-03 이 실제 구현 + green 전환.

describe("GET /api/stocks/:code/news (V-13/V-15)", () => {
  it.todo("clamps days > 7 to 7");
  it.todo("clamps limit > 100 to 100");
  it.todo("returns 400 for invalid code XYZ");
  it.todo("returns 404 when master code not found");
  it.todo("returns 200 with news items for valid code");
});

describe("POST /api/stocks/:code/news/refresh (V-14)", () => {
  it.todo("returns 429 + retry_after_seconds on cooldown");
  it.todo("sets Retry-After header on 429");
  it.todo("returns 503 on budget exhausted");
  it.todo("returns 200 with updated news on success");
});

describe("CORS exposedHeaders (V-16)", () => {
  it.todo("exposes Retry-After header via Access-Control-Expose-Headers");
});
