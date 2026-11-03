/**
 * 격자 크기 상한(`GRID_MAX_BYTES`) — 넘는 키는 올리지 않고 「너무 큼」 으로 건너뛴다(실패 아님 · 종료 0).
 * 10/30 실측에서 KR7420610008 KRX 격자가 버킷 상한 50MB 를 넘어 업로드가 실패하고 실행이 종료 1 이 됐다
 * (사용자 결정 2026-11-02: 건너뛰고 표시). 상한을 1바이트로 바꿔 모든 격자를 「너무 큼」 으로 만든다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../src/store", async (orig) => ({ ...(await orig<typeof import("../src/store")>()), GRID_MAX_BYTES: 1 }));

import { main } from "../src/index";
import type { Config } from "../src/config";
import { TOO_LARGE } from "../src/meta";
import { a3Payload, b6Payload, kstNs, makeSynthArchive, type SynthArchive, type SynthPacket } from "./helpers/synth-archive";
import { makeFakeSupabase, rpcCalls, uploads } from "./helpers/fake-supabase";
import { startFakeTickgw, type FakeKey, type FakeTickgw } from "./helpers/fake-tickgw";

const D = "20261030";
const A = "KR7005930003";

function cfg(root: string): Config {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "k",
    archiveDir: root,
    keepDays: 90,
    catchupDays: 10,
    upPct: 15,
    zstdLevel: 3,
    stageChunkBytes: 512,
    nightlyBudgetMs: 2_400_000,
    logLevel: "silent",
    appVersion: "test",
    dryRun: false,
  };
}

const PACKETS: SynthPacket[] = [
  { label: "krx", hhmm: "0900", recvNs: kstNs(D, "0900", 10, 1), payload: a3Payload({ isin: A, label: "krx", chg: 2000, px: 12000 }) },
  { label: "krx", hhmm: "0900", recvNs: kstNs(D, "0900", 11, 1), payload: b6Payload({ isin: A, label: "krx" }) },
  { label: "nxt", hhmm: "0900", recvNs: kstNs(D, "0900", 12, 1), payload: a3Payload({ isin: A, label: "nxt", chg: 2000, px: 12000 }) },
];

let arch: SynthArchive | null = null;
let gw: FakeTickgw | null = null;
afterEach(async () => {
  arch?.cleanup();
  arch = null;
  await gw?.close();
  gw = null;
  vi.restoreAllMocks();
});

/** 승격 키 — 09:00 A3 · B6 두 레코드 · 20:01 closed. */
function promoteKey(over: Partial<FakeKey> = {}): FakeKey {
  return {
    isin: A,
    ex: "KRX",
    recs: [
      { recvNs: kstNs(D, "0900", 10, 1), payload: a3Payload({ isin: A, label: "krx", chg: 2000, px: 12000 }) },
      { recvNs: kstNs(D, "0900", 11, 1), payload: b6Payload({ isin: A, label: "krx" }) },
    ],
    closed: true,
    closedThroughNs: kstNs(D, "2001", 0),
    ...over,
  };
}

function promoteCfg(url: string): Config {
  return { ...cfg(""), tickgwUrl: url, tickgwSecret: "s".repeat(40) };
}

describe("격자 크기 상한 — 넘으면 건너뛴다(실패 아님)", () => {
  it("nightly: 대상 키 격자가 상한을 넘으면 업로드 · 메타 없이 종료 0", async () => {
    arch = makeSynthArchive({ date: D, packets: PACKETS });
    const { sb, calls } = makeFakeSupabase({ rpc: { tick_convert_candidates: { data: { accum: [A], live16: [] } } } });
    const now = new Date("2026-11-02T14:30:00Z");
    expect(await main(["nightly", "--date", D], { sb, config: cfg(arch.root), now, clock: () => 0 })).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_grid_upsert")).toHaveLength(0);
    const runs = rpcCalls(calls, "tick_convert_run_record").map((c) => (c as { p_run: { ok: boolean } }).p_run);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.ok).toBe(true);
  });

  it("nightly: 너무 큰 격자도 발사 값은 원시 바이트로 계산해 object_path null 로 싣는다(quick 261103-pei)", async () => {
    arch = makeSynthArchive({ date: D, packets: PACKETS });
    const piece = {
      trade_date: D, gateway: "KB120", profile: "N", fire_exchange: "NXT", fire_base: "08:59:00", market: "K", wire: 0,
      side: "buy", isin: A, price: 12000, qty: 1, fills: [],
    };
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_candidates: { data: { accum: [], live16: [], launch: [A] } },
        launch_queue_inputs: { data: [piece] },
        launch_queue_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
      },
    });
    const now = new Date("2026-11-02T14:30:00Z");
    expect(await main(["nightly", "--date", D], { sb, config: cfg(arch.root), now, clock: () => 0 })).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    const sets = rpcCalls(calls, "launch_queue_set");
    expect(sets).toHaveLength(1);
    expect(sets[0]!.p_rows).toEqual([expect.objectContaining({ gateway: "KB120", profile: "N", kind: "run", object_path: null })]);
  });

  it("request: 상한을 넘으면 TOO_LARGE 로 닫고 종료 0", async () => {
    arch = makeSynthArchive({ date: D, packets: PACKETS });
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    const now = new Date("2026-11-02T03:00:00Z");
    expect(await main(["request", "--date", D, "--ex", "KRX"], { sb, config: cfg(arch.root), now, clock: () => 0 })).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_request_finish")).toEqual([
      { p_date: D, p_ex: "KRX", p_results: [{ isin: A, ok: false, error: TOO_LARGE }] },
    ]);
  });

  it("promote: 다시 압축한 격자가 상한을 넘으면 업로드 · 메타 없이 tooLarge · 종료 0(WR-30)", async () => {
    // export bytes 는 사전 판정을 통과하게 작게(1B) 속인다 — 받아서 다시 압축한 실제 크기로 거른다
    gw = await startFakeTickgw({ secret: "s".repeat(40), today: D, keys: [promoteKey({ listPatch: { bytes: 1 } })] });
    const { sb, calls } = makeFakeSupabase();
    const now = new Date("2026-10-30T11:10:00Z"); // KST 20:10
    expect(await main(["promote"], { sb, config: promoteCfg(gw.url), now, clock: () => 0 })).toBe(0);
    expect(gw.hits.some((h) => h.startsWith("/internal/ticks/export/bytes"))).toBe(true);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_grid_upsert")).toHaveLength(0);
    const runs = rpcCalls(calls, "tick_convert_run_record").map((c) => (c as { p_run: Record<string, unknown> }).p_run);
    expect(runs.find((r) => r.exchange === "KRX")).toMatchObject({ ok: true, written: 0, error: "too_large 1" });
  });

  it("promote: export bytes 가 상한 × PREFETCH_FACTOR 를 넘으면 바이트도 당기지 않는다(WR-30)", async () => {
    gw = await startFakeTickgw({ secret: "s".repeat(40), today: D, keys: [promoteKey()] });
    const { sb, calls } = makeFakeSupabase();
    const now = new Date("2026-10-30T11:10:00Z");
    expect(await main(["promote"], { sb, config: promoteCfg(gw.url), now, clock: () => 0 })).toBe(0);
    expect(gw.hits.some((h) => h.startsWith("/internal/ticks/export/bytes"))).toBe(false);
    expect(uploads(calls)).toHaveLength(0);
  });
});
