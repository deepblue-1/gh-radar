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
  scraped_at: "2026-04-17T00:00:00Z",
});

describe("upsertDiscussions — DO UPDATE SET scraped_at + Phase 08.1 unclassified split", () => {
  it("returns 0 for empty rows without supabase call", async () => {
    const from = vi.fn();
    const supa = { from } as never;
    const res = await upsertDiscussions(supa, []);
    expect(res.upserted).toBe(0);
    expect(res.unclassifiedRows).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("calls upsert with onConflict 'stock_code,post_id' + ignoreDuplicates: false + extended select", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        { id: "x1", title: "t1", body: null, relevance: null, classified_at: null },
      ],
      error: null,
    });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    const res = await upsertDiscussions(supa, [mkRow("1")]);
    expect(from).toHaveBeenCalledWith("discussions");
    expect(upsert).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        onConflict: "stock_code,post_id",
        ignoreDuplicates: false,
      }),
    );
    // Phase 08.1 — select 에 title/body/relevance/classified_at 포함
    expect(select).toHaveBeenCalledWith("id,title,body,relevance,classified_at");
    expect(res.upserted).toBe(1);
    expect(res.unclassifiedRows).toEqual([{ id: "x1", title: "t1", body: null }]);
  });

  it("이미 classified 된 row 는 unclassifiedRows 에서 제외", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        { id: "new1", title: "t-new", body: "b", relevance: null, classified_at: null },
        {
          id: "old1",
          title: "t-old",
          body: null,
          relevance: "noise",
          classified_at: "2026-04-22T00:00:00Z",
        },
      ],
      error: null,
    });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    const res = await upsertDiscussions(supa, [mkRow("1"), mkRow("2")]);
    expect(res.upserted).toBe(2);
    expect(res.unclassifiedRows).toHaveLength(1);
    expect(res.unclassifiedRows[0]).toEqual({ id: "new1", title: "t-new", body: "b" });
  });

  it("data null → upserted=0 + unclassifiedRows=[]", async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const supa = { from } as never;
    const res = await upsertDiscussions(supa, [mkRow("1")]);
    expect(res.upserted).toBe(0);
    expect(res.unclassifiedRows).toEqual([]);
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
