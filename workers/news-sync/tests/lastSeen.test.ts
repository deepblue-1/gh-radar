import { describe, it, expect } from "vitest";
import { loadLastSeenMap } from "../src/pipeline/lastSeen";

/** from().select().eq().order().limit() 체인만 흉내 낸다. */
function fakeSupabase(latest: Record<string, string | undefined>, fail?: string) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("news_articles");
      let code = "";
      const chain = {
        select: () => chain,
        eq: (_col: string, v: string) => {
          code = v;
          return chain;
        },
        order: () => chain,
        limit: async (n: number) => {
          expect(n).toBe(1);
          calls.push(code);
          if (code === fail) return { data: null, error: new Error("boom") };
          const p = latest[code];
          return { data: p ? [{ published_at: p }] : [], error: null };
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

describe("loadLastSeenMap — 종목별 최신 1건", () => {
  it("종목마다 따로 읽어 기사 많은 종목이 다른 종목을 밀어내지 않는다", async () => {
    const { client, calls } = fakeSupabase({
      "005930": "2026-11-12T09:00:00Z",
      "035420": "2026-11-06T05:54:00Z",
    });
    const m = await loadLastSeenMap(client, ["005930", "035420", "999999", "005930"]);
    expect([...m.entries()].sort()).toEqual([
      ["005930", "2026-11-12T09:00:00Z"],
      ["035420", "2026-11-06T05:54:00Z"],
    ]);
    expect(calls.sort()).toEqual(["005930", "035420", "999999"]);
  });

  it("빈 목록은 조회하지 않는다", async () => {
    const { client, calls } = fakeSupabase({});
    expect((await loadLastSeenMap(client, [])).size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("조회 오류는 그대로 던진다 (run 실패로 드러나게)", async () => {
    const { client } = fakeSupabase({}, "000660");
    await expect(loadLastSeenMap(client, ["005930", "000660"])).rejects.toThrow("boom");
  });
});
