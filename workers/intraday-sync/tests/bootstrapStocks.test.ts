import { describe, it, expect, vi } from "vitest";
import { bootstrapMissingStocks } from "../src/pipeline/bootstrapStocks";

describe("bootstrapMissingStocks", () => {
  it("빈 입력 → 0 inserted", async () => {
    const supabase = { from: vi.fn() } as unknown as Parameters<typeof bootstrapMissingStocks>[0];
    const out = await bootstrapMissingStocks(supabase, []);
    expect(out.inserted).toBe(0);
    expect((supabase as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("dedupe by code + _AL strip + 잘못된 코드 skip", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null, count: 2 });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as Parameters<typeof bootstrapMissingStocks>[0];

    const rows = [
      { stk_cd: "005930_AL", stk_nm: "삼성전자", cur_prc: "+70000" },
      { stk_cd: "005930_AL", stk_nm: "삼성전자", cur_prc: "+70100" }, // dup
      { stk_cd: "035720_AL", stk_nm: "카카오", cur_prc: "+45000" },
      { stk_cd: "INVALID_AL", stk_nm: "잘못", cur_prc: "+1000" }, // skip
    ];
    const out = await bootstrapMissingStocks(
      supabase,
      rows as unknown as Parameters<typeof bootstrapMissingStocks>[1],
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: "005930", name: "삼성전자" }),
        expect.objectContaining({ code: "035720" }),
      ]),
      expect.objectContaining({ onConflict: "code", ignoreDuplicates: true }),
    );
    // payload size = 2 (dedupe + invalid skip)
    const payload = upsert.mock.calls[0][0] as Array<{ code: string }>;
    expect(payload).toHaveLength(2);
    expect(out.inserted).toBe(2);
  });

  it("error 시 throw", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error("supabase down") });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as Parameters<typeof bootstrapMissingStocks>[0];
    await expect(
      bootstrapMissingStocks(
        supabase,
        [{ stk_cd: "005930_AL", stk_nm: "x", cur_prc: "+1" }] as unknown as Parameters<
          typeof bootstrapMissingStocks
        >[1],
      ),
    ).rejects.toThrow(/supabase down/);
  });
});
