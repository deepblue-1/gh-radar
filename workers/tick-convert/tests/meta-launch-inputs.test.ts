/**
 * quick 261106-p8h — createMeta().launchInputs 의 alive 가드(주문로그 상태). 없음 · null · boolean 은 통과하고 원본 값이
 * 그대로 남는다(gridLaunchOf → launchQueueOf 로 흘러간다) · 그 밖 타입은 launch_queue_inputs 오류로 throw.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeta } from "../src/meta";

const sbOf = (data: unknown): SupabaseClient =>
  ({ rpc: async () => ({ data, error: null }) }) as unknown as SupabaseClient;

const row = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  trade_date: "20261106",
  gateway: "KYOBO119",
  profile: "Q16",
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "Q",
  wire: 1,
  side: "buy",
  isin: "KR7004831004",
  price: 5380,
  qty: 4000,
  fills: [],
  ...extra,
});

describe("launchInputs — alive 가드", () => {
  it("alive true · false · null · 키 없음 → 통과 · 값 보존", async () => {
    const rows = [row({ alive: true }), row({ wire: 2, alive: false }), row({ wire: 3, alive: null }), row({ wire: 4 })];
    const out = await createMeta(sbOf(rows)).launchInputs("20261106");
    expect(out.map((r) => r.alive)).toEqual([true, false, null, undefined]);
    expect(out[0]).toEqual(rows[0]);
    expect("alive" in out[3]!).toBe(false);
  });

  it.each([["yes"], [1]])("alive %j → launch_queue_inputs 오류", async (alive) => {
    await expect(createMeta(sbOf([row({ alive })])).launchInputs("20261106")).rejects.toThrow(/launch_queue_inputs/);
  });
});
