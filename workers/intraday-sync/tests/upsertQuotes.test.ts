import { describe, it, expect, vi } from "vitest";
import { upsertQuotesStep1, upsertQuotesStep2 } from "../src/pipeline/upsertQuotes";
import type { IntradayCloseUpdate, IntradayOhlcUpdate } from "@gh-radar/shared";

function mockUpsert(error: Error | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ upsert });
  return { from, _upsert: upsert } as unknown as {
    from: ReturnType<typeof vi.fn>;
    _upsert: ReturnType<typeof vi.fn>;
  };
}

describe("upsertQuotesStep1", () => {
  it("payload 에 STEP1 컬럼만 포함 (stock_quotes 스키마: name/market/open/high/market_cap 없음)", async () => {
    const supabase = mockUpsert();
    const updates: IntradayCloseUpdate[] = [
      {
        code: "005930",
        date: "2026-05-14",
        name: "삼성전자",
        price: 70500,
        changeAmount: 500,
        changeRate: 0.71,
        volume: 10000000,
        tradeAmount: 705000000000,
      },
    ];
    await upsertQuotesStep1(
      supabase as unknown as Parameters<typeof upsertQuotesStep1>[0],
      updates,
    );
    const payload = supabase._upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0]).toEqual(
      expect.objectContaining({
        code: "005930",
        price: 70500,
        change_amount: 500,
        change_rate: 0.71,
        volume: 10000000,
        trade_amount: 705000000000,
        // 전일종가 70000(=70500−500) ±30% 호가단위(50) 절사/절상
        upper_limit: 91000,
        lower_limit: 49000,
      }),
    );
    // stock_quotes 스키마에 없는 컬럼은 페이로드에 없어야 함 (2026-05-15 first cycle 에서 'market' 누락 에러 발견)
    expect(payload[0].name).toBeUndefined();
    expect(payload[0].market).toBeUndefined();
    expect(payload[0].open).toBeUndefined();
    expect(payload[0].high).toBeUndefined();
    expect(payload[0].market_cap).toBeUndefined();
  });

  it("rate_updated_at 을 updated_at 과 같은 now 로 함께 기록 (261001-bnc — STEP1 이 오늘 change_rate writer)", async () => {
    const supabase = mockUpsert();
    const mk = (code: string): IntradayCloseUpdate => ({
      code, date: "2026-10-01", price: 1000, changeAmount: 100, changeRate: 11.11, volume: 1, tradeAmount: 1000,
    });
    await upsertQuotesStep1(
      supabase as unknown as Parameters<typeof upsertQuotesStep1>[0],
      [mk("023790"), mk("005930")],
    );
    const payload = supabase._upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const row of payload) {
      expect(typeof row.updated_at).toBe("string");
      expect(row.rate_updated_at).toBe(row.updated_at);
    }
  });

  it("upper/lower_limit 는 전일종가 기준 호가단위 산출 (260914 실측값 대조)", async () => {
    const supabase = mockUpsert();
    const mk = (code: string, price: number, changeAmount: number): IntradayCloseUpdate => ({
      code, date: "2026-09-14", price, changeAmount, changeRate: 0, volume: 0, tradeAmount: 0,
    });
    await upsertQuotesStep1(
      supabase as unknown as Parameters<typeof upsertQuotesStep1>[0],
      [mk("017900", 10270, 2370), mk("296640", 7990, 1840), mk("000670", 49950, 11500), mk("012700", 3775, 850)],
    );
    const p = supabase._upsert.mock.calls[0][0] as Array<Record<string, number>>;
    // 017900 전일 7900 → 10270 / 296640 전일 6150 → 7990 / 000670 전일 38450 → 49950 / 012700 전일 2925 → 3800
    expect(p.map((r) => r.upper_limit)).toEqual([10270, 7990, 49950, 3800]);
    // 하한가: 5530 / 4305 / 26915→26950(tick 50 절상) / 2047.5→2050(tick 5 절상)
    expect(p.map((r) => r.lower_limit)).toEqual([5530, 4305, 26950, 2050]);
  });

  it("1500 row → 2 chunk", async () => {
    const supabase = mockUpsert();
    const updates: IntradayCloseUpdate[] = Array.from({ length: 1500 }, (_, i) => ({
      code: String(i + 1).padStart(6, "0"),
      date: "2026-05-14",
      price: 1000,
      changeAmount: 0,
      changeRate: 0,
      volume: 0,
      tradeAmount: 0,
    }));
    const out = await upsertQuotesStep1(
      supabase as unknown as Parameters<typeof upsertQuotesStep1>[0],
      updates,
    );
    expect(out.count).toBe(1500);
    expect(supabase._upsert).toHaveBeenCalledTimes(2);
  });

  it("빈 입력 → no-op", async () => {
    const supabase = mockUpsert();
    const out = await upsertQuotesStep1(
      supabase as unknown as Parameters<typeof upsertQuotesStep1>[0],
      [],
    );
    expect(out.count).toBe(0);
    expect(supabase._upsert).not.toHaveBeenCalled();
  });
});

/**
 * STEP2 는 단일 RPC intraday_update_quotes_step2 1회 (quick 261016-miy).
 * mock 시그니처: supabase.rpc(name, { p_rows }) 가 { data, error } promise 반환.
 */
function mockRpc(data: unknown = 1, error: Error | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const supabase = { rpc } as unknown as Parameters<typeof upsertQuotesStep2>[0];
  return { rpc, supabase };
}

describe("upsertQuotesStep2", () => {
  it("rpc 1회 · p_rows 행은 recordset 7키뿐 (date/price/volume 없음)", async () => {
    const { rpc, supabase } = mockRpc(1);
    const u: IntradayOhlcUpdate = {
      code: "005930",
      date: "2026-05-14",
      open: 70000,
      high: 71000,
      low: 69500,
      upperLimit: 91000,
      lowerLimit: 49000,
      marketCap: 4209000 * 1e8,
    };
    await upsertQuotesStep2(supabase, [u]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("intraday_update_quotes_step2");
    const args = rpc.mock.calls[0][1] as { p_rows: Array<Record<string, unknown>> };
    expect(args.p_rows).toHaveLength(1);
    expect(args.p_rows[0]).toEqual({
      code: "005930",
      open: 70000,
      high: 71000,
      low: 69500,
      upper_limit: 91000,
      lower_limit: 49000,
      market_cap: 4209000 * 1e8,
    });
  });

  it("rate_updated_at 은 쓰지 않는다 — change_rate 를 안 쓰는 hot set UPDATE (261001-bnc)", async () => {
    const { rpc, supabase } = mockRpc(1);
    await upsertQuotesStep2(supabase, [
      {
        code: "023790",
        date: "2026-10-01",
        open: 100,
        high: 110,
        low: 95,
        upperLimit: 130,
        lowerLimit: 70,
        marketCap: null,
      },
    ]);
    const row = (rpc.mock.calls[0][1] as { p_rows: Array<Record<string, unknown>> }).p_rows[0];
    expect(row).not.toHaveProperty("rate_updated_at");
    expect(row).not.toHaveProperty("change_rate");
  });

  it("250 row → rpc 1회, count = RPC 반환값(실제 갱신 행 수)", async () => {
    const { rpc, supabase } = mockRpc(248);
    const updates: IntradayOhlcUpdate[] = Array.from({ length: 250 }, (_, i) => ({
      code: String(i + 1).padStart(6, "0"),
      date: "2026-05-14",
      open: 100,
      high: 110,
      low: 95,
      upperLimit: null,
      lowerLimit: null,
      marketCap: null,
    }));
    const out = await upsertQuotesStep2(supabase, updates);
    expect(rpc).toHaveBeenCalledOnce();
    expect((rpc.mock.calls[0][1] as { p_rows: unknown[] }).p_rows).toHaveLength(250);
    expect(out.count).toBe(248);
  });

  it("빈 입력 → rpc 호출 없음, count 0", async () => {
    const { rpc, supabase } = mockRpc(0);
    const out = await upsertQuotesStep2(supabase, []);
    expect(out.count).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rpc 에러 → 그 에러로 reject", async () => {
    const err = new Error("PGRST202");
    const { supabase } = mockRpc(null, err);
    await expect(
      upsertQuotesStep2(supabase, [
        { code: "005930", date: "2026-05-14", open: 1, high: 1, low: 1, upperLimit: 1, lowerLimit: 1, marketCap: 1 },
      ]),
    ).rejects.toBe(err);
  });
});
