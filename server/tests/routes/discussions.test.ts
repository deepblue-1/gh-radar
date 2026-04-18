import { describe, it } from "vitest";

/**
 * Phase 08 Plan 03 — 토론방 server route unit test 스텁.
 * Plan 08-01 Task 3 에서 SoT (test discovery 용) 로 it.todo 배치.
 * 실제 구현은 Plan 08-03 (`server-discussion-routes`) 이 각 todo 를 it.* 로 채움.
 */

describe("GET /api/stocks/:code/discussions (Phase 8)", () => {
  it.todo(
    "returns 200 with camelCase Discussion[] for valid code (hours=24, limit=5)",
  );
  it.todo("clamps limit > 50 to 50 (server hard cap)");
  it.todo("returns 400 INVALID_QUERY_PARAM for invalid code XYZ-abc");
  it.todo("returns 404 STOCK_NOT_FOUND when master code missing");
  it.todo(
    "cache hit: scrapedAt < 10min → returns DB rows without proxy call",
  );
  it.todo(
    "cache miss: scrapedAt >= 10min → triggers proxy scrape + upsert then returns",
  );
  it.todo(
    "applies spam filter (D11): title length < 5 OR URL in title → excluded from response",
  );
  it.todo("returns [] when empty (not an error)");
});

describe("POST /api/stocks/:code/discussions/refresh (Phase 8)", () => {
  it.todo(
    "returns 429 DISCUSSION_REFRESH_COOLDOWN when MAX(scraped_at) < 30s",
  );
  it.todo("429 response body includes details.retry_after_seconds");
  it.todo("429 response has Retry-After header");
  it.todo(
    "returns 503 PROXY_UNAVAILABLE when proxyClient not configured (Bright Data)",
  );
  it.todo(
    "returns 503 PROXY_BUDGET_EXHAUSTED when api_usage count >= daily cap",
  );
  it.todo(
    "on success: proxy scrape → upsert (DO UPDATE SET scraped_at) → returns latest N",
  );
});

describe("CORS exposedHeaders (Phase 8 reuses Phase 7 setup)", () => {
  it.todo(
    "Retry-After is already exposed via Access-Control-Expose-Headers (Phase 7 added)",
  );
});
