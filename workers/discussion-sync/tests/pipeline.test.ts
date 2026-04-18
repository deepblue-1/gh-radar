import { describe, it, expect } from "vitest";
import { mapToDiscussionRow } from "../src/pipeline/map";
import { parseDiscussionsJson } from "../src/scraper/parseDiscussionsJson";
import {
  NAVER_BOARD_JSON_SAMPLE_ACTIVE,
} from "./helpers/naver-board-fixtures";
import type { NaverDiscussionApiResponse } from "../src/scraper/types";

/**
 * Phase 8 — pipeline integration smoke (parser + mapper end-to-end with real fixture).
 * 실제 Bright Data + Supabase 통합은 Plan 08-06 deploy smoke 에서 검증.
 */
describe("Phase 8 pipeline integration smoke", () => {
  it("parses active fixture → maps to discussions rows (5 → ≤5)", () => {
    const fetchedAt = "2026-04-18T11:00:00+09:00";
    const parsed = parseDiscussionsJson(
      NAVER_BOARD_JSON_SAMPLE_ACTIVE as unknown as NaverDiscussionApiResponse,
      { stockCode: "005930", fetchedAt },
    );
    expect(parsed.length).toBe(5);
    const rows = parsed
      .map((p) => mapToDiscussionRow("005930", p))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.stock_code).toBe("005930");
      expect(r.post_id).toMatch(/^\d{6,}$/);
      // url 은 DB 에 저장하지 않음 — stock_code + post_id 로 결정적 재구성 (server mapper 대칭)
      expect(r.posted_at).toMatch(/\+09:00$/);
    }
  });

  it.todo("budget exhausted mid-cycle → stopAll flag set, subsequent tasks skip");
  it.todo("per-stock ProxyBlockedError → other stocks still processed");
  it.todo("ProxyAuthError → stopAll, entire cycle aborts");
});
