import { describe, it, expect, vi } from "vitest";
import { upsertMasters } from "../src/pipeline/upsert";
import type { StockMaster } from "@gh-radar/shared";

const mk = (code: string, over: Partial<StockMaster> = {}): StockMaster => ({
  code, name: `name-${code}`, market: "KOSPI",
  isin: null,
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

  // ── Phase 15 Plan 10 (D-28 / T-15-33): isin 오염 방어 ──────────────────────

  it("⑤ 같은 code 로 주식(isin 있음) 다음 ETP(isin 없음) → 병합 결과 isin 보존", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    // index.ts 의 [...krxRows, ...etpRows] 순서 재현 — ETP 가 뒤에 온다 (Pitfall 13)
    await upsertMasters(supa, [
      mk("005930", { isin: "KR7005930003", securityGroup: "주권" }),
      mk("005930", { isin: null, securityGroup: "ETF" }),
    ]);
    const passed = upsert.mock.calls[0][0];
    expect(passed).toHaveLength(1);
    expect(passed[0].isin).toBe("KR7005930003"); // ETP 가 지우지 못함
  });

  it("⑥ isin null 행의 upsert 페이로드에 isin 키 부재 (기존 DB 값 보존)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    await upsertMasters(supa, [mk("069500", { isin: null })]);
    const passed = upsert.mock.calls[0][0];
    expect(passed).toHaveLength(1);
    expect(passed[0]).not.toHaveProperty("isin");
  });

  it("⑥-b isin 유무가 섞이면 두 배치로 분리 upsert (PostgREST 키 집합 동일 요건)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    const res = await upsertMasters(supa, [
      mk("005930", { isin: "KR7005930003" }),
      mk("069500", { isin: null }),
    ]);
    expect(upsert).toHaveBeenCalledTimes(2);
    const first = upsert.mock.calls[0][0];
    const second = upsert.mock.calls[1][0];
    expect(first[0].isin).toBe("KR7005930003");
    expect(second[0]).not.toHaveProperty("isin");
    // 배치별 키 집합이 각각 균일해야 PostgREST 가 거부하지 않는다
    expect(first.every((r: any) => "isin" in r)).toBe(true);
    expect(second.every((r: any) => !("isin" in r))).toBe(true);
    expect(res.count).toBe(2);
  });

  it("⑦ isin 외 다른 필드의 last-wins 는 유지 (기존 동작 무회귀)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    await upsertMasters(supa, [
      mk("005930", { isin: "KR7005930003", name: "old", securityGroup: "주권" }),
      mk("005930", { isin: null, name: "new", securityGroup: "ETF" }),
    ]);
    const passed = upsert.mock.calls[0][0];
    expect(passed[0].name).toBe("new");           // last-wins 유지
    expect(passed[0].security_group).toBe("ETF"); // last-wins 유지
    expect(passed[0].isin).toBe("KR7005930003");  // isin 만 예외
  });

  it("나중 행의 isin 이 non-null 이면 그 값이 이긴다", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supa = { from: vi.fn().mockReturnValue({ upsert }) } as any;
    await upsertMasters(supa, [
      mk("005930", { isin: "KR7005930003" }),
      mk("005930", { isin: "KR7005930999" }),
    ]);
    expect(upsert.mock.calls[0][0][0].isin).toBe("KR7005930999");
  });
});
