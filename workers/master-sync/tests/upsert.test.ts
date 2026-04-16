import { describe, it, expect, vi } from "vitest";
import { upsertMasters } from "../src/pipeline/upsert";
import type { StockMaster } from "@gh-radar/shared";

const mk = (code: string, over: Partial<StockMaster> = {}): StockMaster => ({
  code, name: `name-${code}`, market: "KOSPI",
  sector: null,
  kosdaqSegment: null,
  securityType: "보통주",
  securityGroup: "주권",
  englishName: null,
  listingDate: null,
  parValue: null,
  listingShares: null,
  isDelisted: false,
  updatedAt: "2026-04-15T00:00:00Z",
  ...over,
});

describe("upsertMasters", () => {
  it("빈 배열 → 호출 안 함, count=0", async () => {
    const supa = { from: vi.fn() } as any;
    const res = await upsertMasters(supa, []);
    expect(res.count).toBe(0);
    expect(supa.from).not.toHaveBeenCalled();
  });

  it("정상 row → from('stocks').upsert(rows, {onConflict:'code'})", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    const res = await upsertMasters(supa, [mk("005930"), mk("000660")]);
    expect(supa.from).toHaveBeenCalledWith("stocks");
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: "005930", name: "name-005930", security_type: "보통주", security_group: "주권", kosdaq_segment: null }),
      ]),
      { onConflict: "code" },
    );
    expect(res.count).toBe(2);
  });

  it("dedup — 같은 code 두 번 → 마지막만 upsert", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    await upsertMasters(supa, [
      mk("005930", { name: "old" }),
      mk("005930", { name: "new" }),
    ]);
    const passed = upsert.mock.calls[0][0];
    expect(passed).toHaveLength(1);
    expect(passed[0].name).toBe("new");
  });

  it("supabase error → throw", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error("RLS denied") });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    await expect(upsertMasters(supa, [mk("005930")])).rejects.toThrow(/RLS denied/);
  });
});
