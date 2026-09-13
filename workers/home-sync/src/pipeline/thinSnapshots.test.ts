import { describe, it, expect } from "vitest";
import {
  isFiveMinuteSlot,
  shouldThinPastSnapshots,
  thinPastSnapshots,
} from "./thinSnapshots";
import { createMockSupabase } from "../../tests/helpers/supabase-mock";

/**
 * quick-260913-g4c — 과거 거래일 스냅샷 5분 thinning.
 * 안전 불변식: 5분 행·오늘 행은 절대 삭제 대상이 아니다 (T-g4c-01).
 */

describe("isFiveMinuteSlot", () => {
  it("분 % 5 === 0 판정 (Z / +00:00 표기 모두)", () => {
    expect(isFiveMinuteSlot("2026-09-14T01:00:00Z")).toBe(true);
    expect(isFiveMinuteSlot("2026-09-14T01:01:00Z")).toBe(false);
    expect(isFiveMinuteSlot("2026-09-14T01:04:00+00:00")).toBe(false);
    expect(isFiveMinuteSlot("2026-09-14T01:05:00+00:00")).toBe(true);
  });
});

describe("shouldThinPastSnapshots (KST 08:00~08:09)", () => {
  it("07:59 false / 08:00 true / 08:09 true / 08:10 false", () => {
    // KST = UTC + 9h → 08:00 KST = 전날 23:00 UTC.
    expect(shouldThinPastSnapshots(new Date("2026-09-14T22:59:00Z"))).toBe(false);
    expect(shouldThinPastSnapshots(new Date("2026-09-14T23:00:00Z"))).toBe(true);
    expect(shouldThinPastSnapshots(new Date("2026-09-14T23:09:59Z"))).toBe(true);
    expect(shouldThinPastSnapshots(new Date("2026-09-14T23:10:00Z"))).toBe(false);
  });
});

describe("thinPastSnapshots", () => {
  const TODAY = "2026-09-15";

  function seed(rows: Array<{ trade_date: string; captured_at: string }>) {
    return createMockSupabase({ home_theme_snapshots: rows });
  }

  it("과거 행 [5분, 1분×3] → 1분 3개만 delete(ISO Z 정규화), lt(trade_date, 오늘) 적용, 반환 3", async () => {
    const sb = seed([
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:55:00+00:00" },
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:54:00+00:00" },
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:53:00+00:00" },
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:52:00+00:00" },
    ]);

    const n = await thinPastSnapshots(sb as never, TODAY);

    expect(n).toBe(3);
    const chain = sb._chains.home_theme_snapshots;
    expect(chain.range).toHaveBeenCalledWith(0, 999);
    expect(chain.delete).toHaveBeenCalledTimes(1);
    expect(chain.in).toHaveBeenCalledTimes(1);
    expect(chain.in.mock.calls[0][0]).toBe("captured_at");
    expect(chain.in.mock.calls[0][1]).toEqual([
      "2026-09-14T10:54:00.000Z",
      "2026-09-14T10:53:00.000Z",
      "2026-09-14T10:52:00.000Z",
    ]);
    // select 1회 + delete 1회 모두 trade_date < 오늘.
    expect(chain.lt).toHaveBeenCalledTimes(2);
    for (const call of chain.lt.mock.calls) expect(call).toEqual(["trade_date", TODAY]);
  });

  it("후보 0 (전부 5분 슬롯) → delete 호출 0, 반환 0", async () => {
    const sb = seed([
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:55:00+00:00" },
      { trade_date: "2026-09-14", captured_at: "2026-09-14T10:50:00+00:00" },
    ]);
    const n = await thinPastSnapshots(sb as never, TODAY);
    expect(n).toBe(0);
    expect(sb._chains.home_theme_snapshots.delete).not.toHaveBeenCalled();
  });

  it("후보 250 → delete 3회 (100·100·50 청크)", async () => {
    const base = Date.parse("2026-09-14T11:00:00Z");
    const rows: Array<{ trade_date: string; captured_at: string }> = [];
    for (let i = 0; rows.filter((r) => !isFiveMinuteSlot(r.captured_at)).length < 250; i++) {
      rows.push({ trade_date: "2026-09-14", captured_at: new Date(base - i * 60_000).toISOString() });
    }
    const sb = seed(rows);
    const n = await thinPastSnapshots(sb as never, TODAY);
    expect(n).toBe(250);
    const chain = sb._chains.home_theme_snapshots;
    expect(chain.delete).toHaveBeenCalledTimes(3);
    expect(chain.in.mock.calls.map((c) => (c[1] as string[]).length)).toEqual([100, 100, 50]);
    // 5분 슬롯은 어떤 청크에도 없다.
    for (const c of chain.in.mock.calls)
      for (const v of c[1] as string[]) expect(isFiveMinuteSlot(v)).toBe(false);
  });

  it("select error → throw (delete 없음)", async () => {
    const sb = seed([]);
    sb.from("home_theme_snapshots").range.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    await expect(thinPastSnapshots(sb as never, TODAY)).rejects.toThrow("boom");
    expect(sb._chains.home_theme_snapshots.delete).not.toHaveBeenCalled();
  });

  it("delete error → throw", async () => {
    const sb = seed([{ trade_date: "2026-09-14", captured_at: "2026-09-14T10:54:00Z" }]);
    const chain = sb.from("home_theme_snapshots");
    (chain as unknown as { __awaitResult: unknown }).__awaitResult = {
      data: null,
      error: new Error("del-fail"),
    };
    await expect(thinPastSnapshots(sb as never, TODAY)).rejects.toThrow("del-fail");
  });
});
