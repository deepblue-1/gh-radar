import { describe, expect, it, vi } from "vitest";
import { loadStockMeta, loadTargets } from "../src/pipeline/targets";
import { runCleanup } from "../src/retention";

/**
 * Phase 41-08 — 대상 목록 · 종목 정보 · 정리 RPC 결선(41-02 계약).
 */

function rpcMock(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as never, rpc };
}

const META = new Map([
  ["005930", { name: "삼성전자", group: "주권" }],
  ["069500", { name: "KODEX 200", group: "ETF" }],
  ["570127", { name: "한투 인버스2X코스피200선물 ETN", group: "주권" }],
  ["000660", { name: "SK하이닉스", group: "주권" }],
]);

describe("loadTargets", () => {
  it("kis_news_targets_list(100, 10, 200) 를 부르고 시각을 epoch ms 로 바꾼다", async () => {
    const m = rpcMock([
      {
        code: "005930",
        reasons: ["mover", "watch"],
        rank: 3,
        last_requested_at: "2026-11-16T10:00:05+09:00",
        last_collected_at: null,
      },
      {
        code: "000660",
        reasons: ["registered"],
        rank: null,
        last_requested_at: null,
        last_collected_at: "2026-11-16T09:59:00+09:00",
      },
    ]);
    const got = await loadTargets(m.client, META);
    expect(m.rpc).toHaveBeenCalledWith("kis_news_targets_list", {
      p_top: 100,
      p_idle_minutes: 10,
      p_registered_cap: 200,
    });
    expect(got).toEqual([
      {
        code: "005930",
        reasons: ["mover", "watch"],
        rank: 3,
        lastRequestedAt: Date.parse("2026-11-16T10:00:05+09:00"),
        lastCollectedAt: null,
      },
      {
        code: "000660",
        reasons: ["registered"],
        rank: null,
        lastRequestedAt: null,
        lastCollectedAt: Date.parse("2026-11-16T09:59:00+09:00"),
      },
    ]);
  });

  it("ETP 종목(그룹 ETF · 이름 ETN)을 종목 정보로 판정해 뺀다", async () => {
    const m = rpcMock([
      { code: "069500", reasons: ["mover"], rank: 1, last_requested_at: null, last_collected_at: null },
      { code: "570127", reasons: ["registered"], rank: null, last_requested_at: null, last_collected_at: null },
      { code: "005930", reasons: ["mover"], rank: 2, last_requested_at: null, last_collected_at: null },
    ]);
    const got = await loadTargets(m.client, META);
    expect(got.map((t) => t.code)).toEqual(["005930"]);
  });

  it("RPC 오류 · 배열이 아닌 결과 · 모양이 틀린 코드는 throw / 건너뜀", async () => {
    await expect(loadTargets(rpcMock(null, { message: "boom", code: "XX000" }).client, META)).rejects.toThrow(
      /kis_news_targets_list/,
    );
    await expect(loadTargets(rpcMock({ nope: 1 }).client, META)).rejects.toThrow(/모양/);
    const got = await loadTargets(
      rpcMock([{ code: "12", reasons: [], rank: null, last_requested_at: null, last_collected_at: null }]).client,
      META,
    );
    expect(got).toEqual([]);
  });
});

describe("loadStockMeta", () => {
  it("{코드: {n, g}} 를 Map<코드, {name, group}> 으로", async () => {
    const m = rpcMock({ "005930": { n: "삼성전자", g: "주권" }, "069500": { n: "KODEX 200", g: null } });
    const got = await loadStockMeta(m.client);
    expect(m.rpc).toHaveBeenCalledWith("kis_news_stock_meta");
    expect(got.get("005930")).toEqual({ name: "삼성전자", group: "주권" });
    expect(got.get("069500")).toEqual({ name: "KODEX 200", group: null });
    expect(got.size).toBe(2);
  });

  it("RPC 오류 · 객체가 아닌 결과는 throw", async () => {
    await expect(loadStockMeta(rpcMock(null, { message: "boom" }).client)).rejects.toThrow(/kis_news_stock_meta/);
    await expect(loadStockMeta(rpcMock([1, 2]).client)).rejects.toThrow(/모양/);
  });
});

describe("runCleanup", () => {
  it("kis_news_cleanup(90, 1) 결과를 그대로 돌려준다", async () => {
    const m = rpcMock({ news_deleted: 3, targets_deleted: 1 });
    await expect(runCleanup(m.client)).resolves.toEqual({ news_deleted: 3, targets_deleted: 1 });
    expect(m.rpc).toHaveBeenCalledWith("kis_news_cleanup", { p_days: 90, p_target_idle_days: 1 });
  });

  it("RPC 오류는 throw", async () => {
    await expect(runCleanup(rpcMock(null, { message: "boom" }).client)).rejects.toThrow(/kis_news_cleanup/);
  });
});
