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
    const eligibleCodes = new Set(updates.map((u) => u.code));
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
      eligibleCodes,
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
    const eligibleCodes = new Set(updates.map((u) => u.code));
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
      eligibleCodes,
    );
    expect(out.count).toBe(3);
  });

  it("0 positive movers → DELETE 만, INSERT skip", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates([-1, -2, -3]);
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">();
    const eligibleCodes = new Set(updates.map((u) => u.code));
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
      eligibleCodes,
    );
    expect(out.count).toBe(0);
    expect(supabase._delete).toHaveBeenCalledOnce();
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it("eligibleCodes 화이트리스트 — 일반 주식만 통과 (ETF/ETN/ELW 자동 제외)", async () => {
    const supabase = mockTopMovers();
    const updates: IntradayCloseUpdate[] = [
      { code: "570119", date: "2026-05-15", name: "한투 인버스2X은선물 ETN", price: 1000, changeAmount: 0, changeRate: 30, volume: 0, tradeAmount: 0 },
      { code: "031330", date: "2026-05-15", name: "에스에이엠티", price: 1000, changeAmount: 0, changeRate: 28, volume: 0, tradeAmount: 0 },
      { code: "451060", date: "2026-05-15", name: "1Q 200액티브", price: 1000, changeAmount: 0, changeRate: 27, volume: 0, tradeAmount: 0 },
      { code: "066570", date: "2026-05-15", name: "LG전자", price: 1000, changeAmount: 0, changeRate: 25, volume: 0, tradeAmount: 0 },
      { code: "005930", date: "2026-05-15", name: "삼성전자", price: 1000, changeAmount: 0, changeRate: 24, volume: 0, tradeAmount: 0 },
    ];
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">([
      ["031330", "KOSDAQ"],
      ["066570", "KOSPI"],
      ["005930", "KOSPI"],
    ]);
    // stocks 마스터에서 security_group IN ('주권', ...) 인 코드만 set 에 포함 — 호출자(index.ts)가 책임짐
    const eligibleCodes = new Set(["031330", "066570", "005930"]);
    const out = await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
      eligibleCodes,
    );
    expect(out.count).toBe(3);
    const payload = supabase._insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    const codes = payload.map((r) => r.code);
    expect(codes).toEqual(["031330", "066570", "005930"]);
    expect(codes).not.toContain("570119"); // ETN
    expect(codes).not.toContain("451060"); // ETF
  });

  it("marketMap 미존재 종목 → KOSPI fallback", async () => {
    const supabase = mockTopMovers();
    const updates = makeUpdates([5, 4]);
    const marketMap = new Map<string, "KOSPI" | "KOSDAQ">();
    const eligibleCodes = new Set(updates.map((u) => u.code));
    await rebuildTopMovers(
      supabase as unknown as Parameters<typeof rebuildTopMovers>[0],
      updates,
      marketMap,
      eligibleCodes,
    );
    const payload = supabase._insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0]).toEqual(expect.objectContaining({ market: "KOSPI" }));
  });
});
