import { test } from "@playwright/test";

// Phase 07 Plan 01 — E2E 스펙 스켈레톤. Plan 07-04/05/06 이 skip → 실제 구현 전환.

test.describe("News — detail list (V-17)", () => {
  test.skip("renders 5 news items + 더보기 link on /stocks/005930", async () => {});
  test.skip("items have target=_blank rel=noopener noreferrer", async () => {});
});

test.describe("News — full page (V-18)", () => {
  test.skip("renders up to 100 items on /stocks/005930/news", async () => {});
  test.skip("← back link navigates to /stocks/005930", async () => {});
});

test.describe("News — refresh cooldown (V-19)", () => {
  test.skip("second refresh within 30s → 429 + button disabled + countdown visible", async () => {});
});

test.describe("News — a11y (V-20)", () => {
  test.skip("axe scan has 0 serious/critical violations on news section", async () => {});
});
