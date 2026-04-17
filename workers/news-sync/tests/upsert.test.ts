import { describe, it, expect, vi } from "vitest";
import { upsertNews } from "../src/pipeline/upsert";

const mkRow = (code: string, url: string) => ({
  stock_code: code,
  title: "t",
  source: null,
  url,
  published_at: "2026-04-17T00:00:00.000Z",
  content_hash: "h",
});

describe("upsertNews — V-10 ON CONFLICT DO NOTHING", () => {
  it("빈 rows → {inserted: 0}, supabase 호출 없음", async () => {
    const from = vi.fn();
    const supa = { from } as any;
    const res = await upsertNews(supa, []);
    expect(res.inserted).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("정상 rows → onConflict 'stock_code,url' + ignoreDuplicates: true", async () => {
    const selectSpy = vi.fn().mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const upsertSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const from = vi.fn().mockReturnValue({ upsert: upsertSpy });
    const supa = { from } as any;

    const res = await upsertNews(supa, [mkRow("005930", "https://x/1")]);
    expect(from).toHaveBeenCalledWith("news_articles");
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ stock_code: "005930", url: "https://x/1" })],
      { onConflict: "stock_code,url", ignoreDuplicates: true },
    );
    expect(selectSpy).toHaveBeenCalledWith("id");
    expect(res.inserted).toBe(1);
  });

  it("data=null (모두 중복) → inserted=0", async () => {
    const selectSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsertSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const from = vi.fn().mockReturnValue({ upsert: upsertSpy });
    const supa = { from } as any;
    const res = await upsertNews(supa, [mkRow("005930", "https://x/1")]);
    expect(res.inserted).toBe(0);
  });

  it("supabase error → throw", async () => {
    const selectSpy = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("RLS denied") });
    const upsertSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const from = vi.fn().mockReturnValue({ upsert: upsertSpy });
    const supa = { from } as any;
    await expect(
      upsertNews(supa, [mkRow("005930", "https://x/1")]),
    ).rejects.toThrow(/RLS denied/);
  });
});
