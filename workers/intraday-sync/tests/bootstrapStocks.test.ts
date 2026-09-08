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
      // 영문 포함 단축코드(KRX 2025~ 숫자 소진분) — bootstrap 대상이어야 한다
      { stk_cd: "0011T0_AL", stk_nm: "채비", cur_prc: "+4695" },
      { stk_cd: "INVALID_AL", stk_nm: "잘못", cur_prc: "+1000" }, // skip (7자)
      { stk_cd: "0011t0_AL", stk_nm: "소문자", cur_prc: "+1000" }, // skip (소문자)
      { stk_cd: "12345_AL", stk_nm: "다섯자", cur_prc: "+1000" }, // skip (5자)
    ];
    const out = await bootstrapMissingStocks(
      supabase,
      rows as unknown as Parameters<typeof bootstrapMissingStocks>[1],
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: "005930", name: "삼성전자" }),
        expect.objectContaining({ code: "035720" }),
        expect.objectContaining({ code: "0011T0", name: "채비" }),
      ]),
      expect.objectContaining({ onConflict: "code", ignoreDuplicates: true }),
    );
    // payload size = 3 (dedupe + invalid 3건 skip)
    const payload = upsert.mock.calls[0][0] as Array<{ code: string }>;
    expect(payload).toHaveLength(3);
    expect(payload.map((p) => p.code).sort()).toEqual(["0011T0", "005930", "035720"].sort());
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
