import { describe, it, expect, vi } from "vitest";
import { rebuildTopMovers } from "../src/pipeline/topMovers";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

function mockTopMovers() {
  const neq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ neq });
  const ins = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ delete: del, insert: ins });
  return { from, _delete: del, _insert: ins, _neq: neq } as unknown as {
    from: ReturnType<typeof vi.fn>;
    _delete: ReturnType<typeof vi.fn>;
    _insert: ReturnType<typeof vi.fn>;
    _neq: ReturnType<typeof vi.fn>;
  };
}

function makeUpdates(rates: number[]): IntradayCloseUpdate[] {
  return rates.map((cr, i) => ({
    code: String(i + 1).padStart(6, "0"),
    date: "2026-05-14",
    name: `종목${i + 1}`,
    price: 1000,
    changeAmount: 0,
    changeRate: cr,
    volume: 0,
    tradeAmount: 0,
  }));
}

describe("rebuildTopMovers", () => {
  it("상위 100 추출 + DELETE 후 INSERT", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates(Array.from({ length: 150 }, (_, i) => 30 - i * 0.1)); // 30, 29.9, ...
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">(
      updates.map((u) => [u.code, "KOSPI" as const]),
    );
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
    );
    expect(out.count).toBe(100);
    expect(supabase._delete).toHaveBeenCalled();
    expect(supabase._insert).toHaveBeenCalledOnce();
    const payload = supabase._insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(100);
    expect(payload[0]).toEqual(expect.objectContaining({ rank: 1, code: "000001" }));
    expect(payload[99]).toEqual(expect.objectContaining({ rank: 100 }));
    // name + market NOT NULL 제약 충족
    expect(payload[0]).toEqual(
      expect.objectContaining({
        name: "종목1",
        market: "KOSPI",
      }),
    );
  });

  it("음의 등락률 종목 제외", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates([5, -3, 4, -2, 3]); // 양수 3개만
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">(
      updates.map((u) => [u.code, "KOSPI" as const]),
    );
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
    );
    expect(out.count).toBe(3);
  });

  it("0 positive movers → DELETE 만, INSERT skip", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates([-1, -2, -3]);
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">();
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
    );
    expect(out.count).toBe(0);
    expect(supabase._delete).toHaveBeenCalledOnce();
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it("ETN (5/6/7xxxxx prefix) 제외 — 일반 주식만 통과", async () => {
    const supabase = mockTopMovers();
    const updates: IntradayCloseUpdate[] = [
      { code: "570119", date: "2026-05-15", name: "한투 인버스2X은선물 ETN", price: 1000, changeAmount: 0, changeRate: 30, volume: 0, tradeAmount: 0 },
      { code: "031330", date: "2026-05-15", name: "에스에이엠티", price: 1000, changeAmount: 0, changeRate: 28, volume: 0, tradeAmount: 0 },
      { code: "610101", date: "2026-05-15", name: "메리츠 인버스 2X 은 선물 ETN(H)", price: 1000, changeAmount: 0, changeRate: 27, volume: 0, tradeAmount: 0 },
      { code: "760027", date: "2026-05-15", name: "키움 인버스 2X 전력 TOP5 ETN", price: 1000, changeAmount: 0, changeRate: 26, volume: 0, tradeAmount: 0 },
      { code: "066570", date: "2026-05-15", name: "LG전자", price: 1000, changeAmount: 0, changeRate: 25, volume: 0, tradeAmount: 0 },
      { code: "005930", date: "2026-05-15", name: "삼성전자", price: 1000, changeAmount: 0, changeRate: 24, volume: 0, tradeAmount: 0 },
    ];
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">([
      ["031330", "KOSDAQ"],
      ["066570", "KOSPI"],
      ["005930", "KOSPI"],
    ]);
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
    );
    expect(out.count).toBe(3);
    const payload = supabase._insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    const codes = payload.map((r) => r.code);
    expect(codes).toEqual(["031330", "066570", "005930"]);
    expect(codes).not.toContain("570119");
    expect(codes).not.toContain("610101");
    expect(codes).not.toContain("760027");
  });

  it("marketMap 미존재 종목 → KOSPI fallback", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates([5, 4]);
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">();
    await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
    );
    const payload = supabase._insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0]).toEqual(expect.objectContaining({ market: "KOSPI" }));
  });
});
