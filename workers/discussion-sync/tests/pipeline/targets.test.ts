import { describe, it, expect, vi } from "vitest";
import { loadTargets } from "../../src/pipeline/targets";

/**
 * Phase 8 — top_movers ∪ watchlists 합집합 + stocks 마스터 FK 검증.
 * Phase 7 news-sync targets 테스트 패턴 (1:1 복제 — 같은 합집합 의미론).
 */

function buildSupabase({
  latestScanId = "scan_2",
  movers = [{ code: "005930" }, { code: "035720" }],
  watch = [{ stock_code: "005930" }, { stock_code: "247540" }],
  masters = [
    { code: "005930", name: "삼성전자" },
    { code: "035720", name: "카카오" },
    { code: "247540", name: "에코프로비엠" },
  ],
} = {}) {
  let topMoversCallNo = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "top_movers") {
        topMoversCallNo++;
        if (topMoversCallNo === 1) {
          // SELECT scan_id ORDER BY scan_id DESC LIMIT 1
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: { scan_id: latestScanId }, error: null }),
          };
        }
        // SELECT code WHERE scan_id=...
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: movers, error: null }),
        };
      }
      if (table === "watchlists") {
        return {
          select: vi.fn().mockResolvedValue({ data: watch, error: null }),
        };
      }
      if (table === "stocks") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: masters, error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  } as never;
}

describe("loadTargets — top_movers ∪ watchlists, stocks FK 검증", () => {
  it("dedupes overlap (005930 in both → 1 row)", async () => {
    const sb = buildSupabase();
    const targets = await loadTargets(sb);
    const codes = targets.map((t) => t.code).sort();
    expect(codes).toEqual(["005930", "035720", "247540"]);
  });

  it("returns empty when no movers AND no watchlists", async () => {
    const sb = buildSupabase({
      latestScanId: "",
      movers: [],
      watch: [],
      masters: [],
    });
    const targets = await loadTargets(sb);
    expect(targets).toEqual([]);
  });

  it("filters codes not in stocks master", async () => {
    const sb = buildSupabase({
      movers: [{ code: "005930" }, { code: "999999" }], // 999999 not in masters
      watch: [],
      masters: [{ code: "005930", name: "삼성전자" }],
    });
    const targets = await loadTargets(sb);
    expect(targets).toEqual([{ code: "005930", name: "삼성전자" }]);
  });
});
