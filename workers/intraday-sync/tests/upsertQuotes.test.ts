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
        // 한국 시장 일일 변동폭 ±30% 임시값 — NOT NULL 제약 만족, STEP2 가 정확값으로 덮어씀
        upper_limit: 70500 * 1.3,
        lower_limit: 70500 * 0.7,
      }),
    );
    // stock_quotes 스키마에 없는 컬럼은 페이로드에 없어야 함 (2026-05-15 first cycle 에서 'market' 누락 에러 발견)
    expect(payload[0].name).toBeUndefined();
    expect(payload[0].market).toBeUndefined();
    expect(payload[0].open).toBeUndefined();
    expect(payload[0].high).toBeUndefined();
    expect(payload[0].market_cap).toBeUndefined();
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
 * STEP2 는 종목별 UPDATE (.update + .eq) 호출 — UPSERT 가 NOT NULL constraint 위반 회피.
 * mock 시그니처: from().update(payload).eq(col, val) 가 promise 반환.
 */
function mockUpdateEq(error: Error | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, _update: update, _eq: eq } as unknown as {
    from: ReturnType<typeof vi.fn>;
    _update: ReturnType<typeof vi.fn>;
    _eq: ReturnType<typeof vi.fn>;
  };
}

describe("upsertQuotesStep2", () => {
  it("payload 에 STEP2 컬럼만 (price/change/volume 없음)", async () => {
    const supabase = mockUpdateEq();
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
    await upsertQuotesStep2(
      supabase as unknown as Parameters<typeof upsertQuotesStep2>[0],
      [u],
    );
    const payload = supabase._update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        open: 70000,
        high: 71000,
        low: 69500,
        upper_limit: 91000,
        lower_limit: 49000,
        market_cap: 4209000 * 1e8,
      }),
    );
    // STEP1 매분 갱신 컬럼 보호 — STEP2 가 덮어쓰지 않음
    expect(payload.price).toBeUndefined();
    expect(payload.volume).toBeUndefined();
    expect(payload.trade_amount).toBeUndefined();
    // code 는 payload 가 아니라 .eq() 절에 사용
    expect(supabase._eq).toHaveBeenCalledWith("code", "005930");
  });

  it("250 row → 250회 update 직렬 호출", async () => {
    const supabase = mockUpdateEq();
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
    const out = await upsertQuotesStep2(
      supabase as unknown as Parameters<typeof upsertQuotesStep2>[0],
      updates,
    );
    expect(out.count).toBe(250);
    expect(supabase._update).toHaveBeenCalledTimes(250);
  });

  it("빈 입력 → no-op", async () => {
    const supabase = mockUpdateEq();
    const out = await upsertQuotesStep2(
      supabase as unknown as Parameters<typeof upsertQuotesStep2>[0],
      [],
    );
    expect(out.count).toBe(0);
    expect(supabase._update).not.toHaveBeenCalled();
  });
});
