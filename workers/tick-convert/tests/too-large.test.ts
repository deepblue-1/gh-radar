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
afterEach(() => {
  arch?.cleanup();
  arch = null;
  vi.restoreAllMocks();
});

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
});
