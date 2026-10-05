import { describe, it, expect } from "vitest";
import { makeFakeSupabase, type Call } from "./helpers/fake-supabase";
import { kstYmdDaysAgo, purgeOld } from "../src/purge";

const NOW = new Date("2026-10-05T12:20:00Z"); // 2026-10-05 21:20 KST → KST 오늘 20261005
const CFG = { keepDays: 90, allocKeepDays: 30, kind15KeepDays: 30, now: NOW };
// cutoff = 20261005 − 90일 = 20260707 — 이보다 이른 폴더만 지운다(DB `date < cutoff` 와 같은 경계).

const folders = ["20260705", "20260706", "20260707", "20260708", "20261002", "tmp", "2026070", ".emptyFolderPlaceholder"];

function fake(opts: Parameters<typeof makeFakeSupabase>[0] = {}) {
  return makeFakeSupabase({
    storage: (_b, op, args) => {
      if (op !== "list") return undefined;
      if (args[0] === "grid") return { data: folders.map((name) => ({ name, id: null })) };
      return { data: [{ name: "KR7000000001.json.gz" }, { name: "KR7000000002.json.gz" }] };
    },
    ...opts,
  });
}
const storageCalls = (calls: Call[]) => calls.filter((c): c is Extract<Call, { kind: "storage" }> => c.kind === "storage");

describe("kstYmdDaysAgo", () => {
  it("KST 날짜 기준 − n 일(UTC 저녁 = KST 다음날 아침도 KST 날짜로)", () => {
    expect(kstYmdDaysAgo(NOW, 90)).toBe("20260707");
    expect(kstYmdDaysAgo(new Date("2026-10-04T15:30:00Z"), 0)).toBe("20261005"); // 10-05 00:30 KST
  });
});

describe("purgeOld", () => {
  it("RPC 2개 인자 · 순서 limitup_purge_old → storage → kind 15", async () => {
    const f = fake({ rpc: { dma_strategy_events_purge_limit_feature: { data: 7 } } });
    const out = await purgeOld(f.sb, CFG);
    const rpcs = f.calls.filter((c): c is Extract<Call, { kind: "rpc" }> => c.kind === "rpc");
    expect(rpcs.map((c) => [c.name, c.args])).toEqual([
      ["limitup_purge_old", { p_keep_days: 90, p_alloc_keep_days: 30 }],
      ["dma_strategy_events_purge_limit_feature", { p_keep_days: 30 }],
    ]);
    expect(f.calls[0].kind).toBe("rpc");
    expect(f.calls[f.calls.length - 1].kind).toBe("rpc");
    expect(out.kind15).toBe(7);
    expect(out.tables).toEqual({ cutoff: "", alloc_cutoff: "", deleted: {} });
  });

  it("cutoff 경계 · 폴더 이름 필터 — 20260705 · 20260706 만 지운다(20260707 은 남김 · 8자리 날짜 아닌 이름 무시)", async () => {
    const f = fake();
    const out = await purgeOld(f.sb, CFG);
    expect(out.storageDates).toEqual(["20260705", "20260706"]);
    const s = storageCalls(f.calls);
    expect(s.every((c) => c.bucket === "limitup-grid")).toBe(true);
    expect(s.map((c) => [c.op, c.args[0]])).toEqual([
      ["list", "grid"],
      ["list", "grid/20260705"],
      ["remove", ["grid/20260705/KR7000000001.json.gz", "grid/20260705/KR7000000002.json.gz"]],
      ["list", "grid/20260706"],
      ["remove", ["grid/20260706/KR7000000001.json.gz", "grid/20260706/KR7000000002.json.gz"]],
    ]);
    expect(s[0].args[1]).toEqual({ limit: 1000 });
  });

  it("빈 폴더는 remove 를 부르지 않는다", async () => {
    const f = makeFakeSupabase({
      storage: (_b, op, args) => (op === "list" && args[0] === "grid" ? { data: [{ name: "20260101", id: null }] } : undefined),
    });
    const out = await purgeOld(f.sb, CFG);
    expect(out.storageDates).toEqual(["20260101"]);
    expect(storageCalls(f.calls).map((c) => c.op)).toEqual(["list", "list"]);
  });

  it("오류는 단계 이름을 담아 throw — 정리 RPC · storage remove · kind 15 · kind 15 반환 null", async () => {
    await expect(purgeOld(fake({ rpc: { limitup_purge_old: { error: { message: "timeout" } } } }).sb, CFG)).rejects.toThrow(
      "limitup_purge_old: timeout",
    );
    const rm = fake({
      storage: (_b, op, args) =>
        op === "remove"
          ? { error: { message: "denied" } }
          : op === "list" && args[0] === "grid"
            ? { data: [{ name: "20260101", id: null }] }
            : op === "list"
              ? { data: [{ name: "a.json.gz" }] }
              : undefined,
    });
    await expect(purgeOld(rm.sb, CFG)).rejects.toThrow("storage remove limitup-grid/grid/20260101: denied");
    await expect(
      purgeOld(fake({ rpc: { dma_strategy_events_purge_limit_feature: { error: { message: "nope" } } } }).sb, CFG),
    ).rejects.toThrow("dma_strategy_events_purge_limit_feature: nope");
    await expect(
      purgeOld(fake({ rpc: { dma_strategy_events_purge_limit_feature: { data: null } } }).sb, CFG),
    ).rejects.toThrow(/bad count/);
  });

  it("단계는 서로 막지 않는다 — 표 정리 · Storage 가 실패해도 kind 15 정리는 돈다 · 사유를 모아 한 번 throw (WR-B05)", async () => {
    const f = fake({
      rpc: { limitup_purge_old: { error: { message: "timeout" } }, dma_strategy_events_purge_limit_feature: { data: 9 } },
      storage: (_b, op) => (op === "list" ? { error: { message: "503" } } : undefined),
    });
    const err = (await purgeOld(f.sb, CFG).catch((e: unknown) => e)) as Error & { partial: unknown };
    expect(err.message).toBe("limitup_purge_old: timeout | storage list limitup-grid/grid: 503");
    expect(f.calls.filter((c) => c.kind === "rpc").map((c) => (c as { name: string }).name)).toEqual([
      "limitup_purge_old",
      "dma_strategy_events_purge_limit_feature",
    ]);
    expect(err.partial).toEqual({ tables: null, storageDates: [], kind15: 9 });
  });
});
