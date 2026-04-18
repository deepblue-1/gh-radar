import { describe, it, expect, vi } from "vitest";
import { upsertDiscussions } from "../../src/pipeline/upsert";
import type { DiscussionRow } from "../../src/pipeline/map";

const mkRow = (postId: string): DiscussionRow => ({
  stock_code: "005930",
  post_id: postId,
  title: "t",
  body: null,
  author: null,
  posted_at: "2026-04-17T00:00:00+09:00",
  url: "https://stock.naver.com/domestic/stock/005930/discussion/1?chip=all",
  scraped_at: "2026-04-17T00:00:00Z",
});

describe("upsertDiscussions — DO UPDATE SET scraped_at", () => {
  it("returns 0 for empty rows without supabase call", async () => {
    const from = vi.fn();
    const supa = { from } as never;
    const res = await upsertDiscussions(supa, []);
    expect(res.upserted).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("calls upsert with onConflict 'stock_code,post_id' + ignoreDuplicates: false", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "x" }], error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    await upsertDiscussions(supa, [mkRow("1")]);
    expect(from).toHaveBeenCalledWith("discussions");
    expect(upsert).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        onConflict: "stock_code,post_id",
        ignoreDuplicates: false,
      }),
    );
    expect(select).toHaveBeenCalledWith("id");
  });

  it("data null → upserted=0", async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    expect((await upsertDiscussions(supa, [mkRow("1")])).upserted).toBe(0);
  });

  it("supabase error → throw", async () => {
    const select = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("RLS denied") });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    await expect(upsertDiscussions(supa, [mkRow("1")])).rejects.toThrow(/RLS denied/);
  });
});
