import { describe, it, expect } from "vitest";
import { purgeOld } from "../src/purge";
import { createSupabaseGridStore } from "../src/store";
import { makeFakeSupabase, rpcCalls, type Call } from "./helpers/fake-supabase";

/** KST 11/02 23:30 — keepDays 90 → cutoff 20260804(RPC 와 같은 식). */
const NOW = new Date("2026-11-02T14:30:00Z");

type Resp = { data?: unknown; error?: { message: string } | null } | undefined;

/** storage 응답 — list("grid") = 날짜 폴더 · list("grid/<D>/<EX>") = 파일 하나 · remove = 성공. */
function storage(
  dirs: string[],
  fail: { list?: boolean; remove?: boolean } = {},
): (bucket: string, op: "upload" | "list" | "remove", args: unknown[]) => Resp {
  return (_b, op, args) => {
    if (op === "list") {
      const path = String(args[0]);
      if (path === "grid") return fail.list ? { error: { message: "list down" } } : { data: dirs.map((name) => ({ name })) };
      return { data: [{ name: "KR7005930003.nightly.ticks.zst" }] };
    }
    if (op === "remove" && fail.remove) return { error: { message: "remove down" } };
    return undefined;
  };
}

function removed(calls: Call[]): string[] {
  return calls.flatMap((c) => (c.kind === "storage" && c.op === "remove" ? (c.args[0] as string[]) : []));
}

describe("purgeOld — 표 RPC · Storage 날짜 폴더(RPC dates ∪ cutoff 이전 폴더) · 단계 독립", () => {
  it("RPC dates 와 cutoff 이전 폴더를 합쳐 grid/<D>/KRX · NXT 를 지운다(메타 없는 고아 객체 포함)", async () => {
    const { sb, calls } = makeFakeSupabase({
      rpc: { tick_purge_old: { data: { cutoff: "20260804", grids: 3, requests: 1, runs: 2, dates: ["20260801"] } } },
      storage: storage(["20260730", "20260801", "20260804", "20261030", "README"]),
    });
    const out = await purgeOld(sb, createSupabaseGridStore(sb), 90, NOW);
    expect(rpcCalls(calls, "tick_purge_old")).toEqual([{ p_keep_days: 90 }]);
    expect(out.tables).toMatchObject({ grids: 3, dates: ["20260801"] });
    expect(out.storageDates).toEqual(["20260730", "20260801"]); // 20260804 = cutoff(같은 날은 남긴다)
    expect(out.removed).toBe(4);
    expect(removed(calls)).toEqual([
      "grid/20260730/KRX/KR7005930003.nightly.ticks.zst",
      "grid/20260730/NXT/KR7005930003.nightly.ticks.zst",
      "grid/20260801/KRX/KR7005930003.nightly.ticks.zst",
      "grid/20260801/NXT/KR7005930003.nightly.ticks.zst",
    ]);
  });

  it("지울 날짜가 없으면 remove 를 부르지 않는다", async () => {
    const { sb, calls } = makeFakeSupabase({ storage: storage(["20261030"]) });
    const out = await purgeOld(sb, createSupabaseGridStore(sb), 90, NOW);
    expect(out.storageDates).toEqual([]);
    expect(removed(calls)).toEqual([]);
  });

  it("RPC 가 실패해도 Storage 정리는 돈다 — 오류는 모아 한 번 throw(partial 에 끝난 단계)", async () => {
    const { sb, calls } = makeFakeSupabase({
      rpc: { tick_purge_old: { error: { message: "rpc down" } } },
      storage: storage(["20260701"]),
    });
    const err = (await purgeOld(sb, createSupabaseGridStore(sb), 90, NOW).catch((e) => e)) as Error & {
      partial: { storageDates: string[] };
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("tick_purge_old: rpc down");
    expect(err.partial.storageDates).toEqual(["20260701"]);
    expect(removed(calls)).toHaveLength(2);
  });

  it("폴더 목록 · 삭제가 실패해도 RPC 단계는 끝나고 사유를 ` | ` 로 잇는다", async () => {
    const { sb } = makeFakeSupabase({
      rpc: { tick_purge_old: { data: { cutoff: "20260804", grids: 1, requests: 0, runs: 0, dates: ["20260801"] } } },
      storage: storage([], { list: true, remove: true }),
    });
    const err = (await purgeOld(sb, createSupabaseGridStore(sb), 90, NOW).catch((e) => e)) as Error & {
      partial: { tables: unknown };
    };
    expect(err.message).toBe("storage list tick-grid/grid: list down | storage remove tick-grid/grid/20260801/KRX: remove down");
    expect(err.partial.tables).toMatchObject({ dates: ["20260801"] });
  });
});
