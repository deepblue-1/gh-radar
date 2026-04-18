import { test } from "@playwright/test";

/**
 * Phase 08 Plan 04 — 토론방 E2E spec 스텁.
 * Plan 08-01 Task 3 에서 SoT 로 test.skip 배치. Plan 08-04 구현 시 skip 제거.
 */

test.describe("Discussion — detail Card (Phase 8)", () => {
  test.skip(
    "renders 5 discussion items + 더보기 link on /stocks/005930",
    async () => {},
  );
  test.skip('items have target="_blank" rel="noopener noreferrer"', async () => {});
  test.skip(
    "each item shows title + body preview + author + time (MM/DD HH:mm KST)",
    async () => {},
  );
});

test.describe("Discussion — full page (Phase 8)", () => {
  test.skip(
    "renders up to 50 items on /stocks/005930/discussions (Compact 3-col grid)",
    async () => {},
  );
  test.skip(
    "column headers 제목/작성자/시간 render at md+ (≥720px)",
    async () => {},
  );
  test.skip(
    "column headers hidden on mobile (<720px) — grid-template-areas switched",
    async () => {},
  );
  test.skip("← back link navigates to /stocks/005930", async () => {});
  test.skip(
    "refresh button NOT present on full page (detail-only)",
    async () => {},
  );
});

test.describe("Discussion — refresh cooldown (Phase 8)", () => {
  test.skip(
    "second refresh within 30s → 429 + button disabled + data-remaining-seconds attribute",
    async () => {},
  );
});

test.describe("Discussion — stale state (Phase 8 D7)", () => {
  test.skip(
    'stale data present + refresh fails → "X분 전 데이터" Badge + list still visible',
    async () => {},
  );
});

test.describe("Discussion — empty state (Phase 8)", () => {
  test.skip(
    'empty → heading "아직 토론 글이 없어요" + CTA "토론방 새로고침"',
    async () => {},
  );
});

test.describe("Discussion — a11y (Phase 8 axe)", () => {
  test.skip(
    "axe scan has 0 serious/critical violations on discussion section + full page",
    async () => {},
  );
});
