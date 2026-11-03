/**
 * quick 261103-pei — backfill-launch 모드. 가짜 Storage 가 실제 픽스처 압축 바이트(10/30 184230 G4 · 10/30 NXT 09:00)를 돌려주고,
 * set 행 값 = 같은 바이트를 풀어 shared launchQueueOf 로 계산한 값인지(KB wire 0 #9) 본다. dry-run · 날짜별 inputs 1회 ·
 * no_grid 로그 · 다운로드/inputs/set 실패 · 시간 예산 · 인자 오류 · CLI 종료 코드 · 설정(원본 아카이브 불필요).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { launchQueueOf } from "@gh-radar/shared";
import { main } from "../src/index";
import { loadConfig, type Config } from "../src/config";
import { logger } from "../src/logger";
import type { GridStore } from "../src/store";
import type { LaunchInputRow } from "../src/meta";
import { parseBackfillLaunchArgs, runBackfillLaunch } from "../src/modes/backfill-launch";
import { UsageError } from "../src/modes/request";
import { makeFakeSupabase, rpcCalls } from "./helpers/fake-supabase";

const FIXTURES = path.resolve(__dirname, "../../../packages/shared/src/__fixtures__/ticks");
const zst = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const NOW = new Date("2026-11-03T14:00:00Z");

function cfg(over: Partial<Config> = {}): Config {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "k",
    archiveDir: "",
    keepDays: 90,
    catchupDays: 10,
    upPct: 15,
    zstdLevel: 3,
    stageChunkBytes: 65536,
    nightlyBudgetMs: 2_400_000,
    logLevel: "silent",
    appVersion: "test",
    dryRun: false,
    ...over,
  };
}

const G4 = { date: "20261030", exchange: "KRX", isin: "KR7184230001", object_path: "grid/20261030/KRX/KR7184230001.nightly.ticks.zst", bytes: 1 };
const NXT = { date: "20261030", exchange: "NXT", isin: "KR7376900007", object_path: "grid/20261030/NXT/KR7376900007.nightly.ticks.zst", bytes: 1 };
const MISSING = { date: "20261029", exchange: "KRX", isin: "KR7060900008", object_path: "grid/20261029/KRX/KR7060900008.nightly.ticks.zst", bytes: 1 };

const BLOBS: Record<string, Uint8Array> = {
  [G4.object_path]: zst("launch1030-krx-g4.ticks.zst"),
  [NXT.object_path]: zst("launch1030-nxt-0900.ticks.zst"),
};

function store(downloads: string[] = []): GridStore {
  return {
    upload: async () => undefined,
    removeDates: async () => 0,
    listDates: async () => [],
    download: async (p) => {
      downloads.push(p);
      const b = BLOBS[p];
      if (!b) throw new Error(`storage download tick-grid/${p}: Object not found`);
      return b;
    },
  };
}

const q = (gateway: string, wire: number, qty: number): LaunchInputRow => ({
  trade_date: "20261030",
  gateway,
  profile: "Q16",
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "Q",
  wire,
  side: "buy",
  isin: G4.isin,
  price: 2575,
  qty,
  fills: [],
});
const N_SELL: LaunchInputRow = {
  trade_date: "20261030",
  gateway: "KB120",
  profile: "N",
  fire_exchange: "NXT",
  fire_base: "09:00:30",
  market: "Q",
  wire: 0,
  side: "sell",
  isin: NXT.isin,
  price: 17910,
  qty: 281,
  fills: [[18000, 281]],
};
const INPUTS_1030: LaunchInputRow[] = [q("KB120", 0, 16666), q("KB120", 1, 7766), q("KYOBO119", 0, 16666), N_SELL];
const INPUTS_1029: LaunchInputRow[] = [{ ...q("KB120", 0, 10), trade_date: "20261029", isin: MISSING.isin, price: 2140 }];

/** 기대 행 — 같은 압축 바이트를 풀어 shared 함수로(로컬 dry-run). */
function want(g: typeof G4, pieces: LaunchInputRow[]) {
  const b = zlib.zstdDecompressSync(BLOBS[g.object_path]!);
  const buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return launchQueueOf(buf, g.exchange as "KRX" | "NXT", g.date, pieces).map((o) => {
    const p = o.piece as LaunchInputRow;
    return {
      trade_date: p.trade_date,
      gateway: p.gateway,
      profile: p.profile,
      fire_exchange: p.fire_exchange,
      fire_base: p.fire_base,
      market: p.market,
      wire: p.wire,
      object_path: g.object_path,
      ...o.value,
    };
  });
}

function fake(over: Parameters<typeof makeFakeSupabase>[0]["rpc"] = {}) {
  return makeFakeSupabase({
    rpc: {
      launch_queue_pending: { data: { grids: [G4, NXT], no_grid: 2 } },
      launch_queue_inputs: (a) => ({ data: a.p_date === "20261030" ? INPUTS_1030 : INPUTS_1029 }),
      launch_queue_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
      ...over,
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("parseBackfillLaunchArgs", () => {
  it("--from · --to · --dry-run (순서 무관)", () => {
    expect(parseBackfillLaunchArgs([])).toEqual({ dryRun: false });
    expect(parseBackfillLaunchArgs(["--dry-run", "--from", "20261020", "--to", "20261103"])).toEqual({
      from: "20261020",
      to: "20261103",
      dryRun: true,
    });
  });
  it("모르는 플래그 · 형식 오류 · from > to → UsageError · CLI 종료 2", async () => {
    expect(() => parseBackfillLaunchArgs(["--date", "20261020"])).toThrow(UsageError);
    expect(() => parseBackfillLaunchArgs(["--from", "2026-10-20"])).toThrow(UsageError);
    expect(() => parseBackfillLaunchArgs(["--from", "20261103", "--to", "20261020"])).toThrow(UsageError);
    const { sb } = fake();
    expect(await main(["backfill-launch", "--from", "2026-10-20"], { sb, store: store(), config: cfg(), now: NOW })).toBe(2);
  });
  it("설정 — TICK_ARCHIVE_DIR 없이 통과(Storage 격자만 읽는다)", () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("TICK_ARCHIVE_DIR", "");
    expect(loadConfig({ mode: "backfill-launch" }).archiveDir).toBe("");
    expect(() => loadConfig({ mode: "nightly" })).toThrow(/TICK_ARCHIVE_DIR/);
    vi.unstubAllEnvs();
  });
});

describe("runBackfillLaunch", () => {
  it("pending 2격자(10/30 G4 · NXT) → 날짜 inputs 1회 · set 행 = launchQueueOf 값(KB wire 0 #9 · N 매도 #1) · no_grid warn", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { sb, calls } = fake();
    const dl: string[] = [];
    const out = await runBackfillLaunch({ sb, store: store(dl), config: cfg(), now: NOW, clock: () => 0 }, { from: "20261030", dryRun: false });
    expect(rpcCalls(calls, "launch_queue_pending")).toEqual([{ p_from: "20261030", p_to: null }]);
    expect(rpcCalls(calls, "launch_queue_inputs")).toEqual([{ p_date: "20261030" }]); // 날짜별 1회
    expect(dl).toEqual([G4.object_path, NXT.object_path]);
    const sets = rpcCalls(calls, "launch_queue_set");
    expect(sets).toHaveLength(1);
    const rows = sets[0]!.p_rows as Record<string, unknown>[];
    expect(rows).toEqual([...want(G4, INPUTS_1030.slice(0, 3)), ...want(NXT, [N_SELL])]);
    expect(rows[0]).toMatchObject({ gateway: "KB120", wire: 0, rank: 9, ahead_qty: 68808, object_path: G4.object_path });
    expect(rows[3]).toMatchObject({ kind: "run", rank: 1, fill_qty: 281, fill_px_min: 18000 });
    expect(out).toMatchObject({ pending: 2, noGrid: 2, computed: 2, written: 4, launchFailed: 0, failed: 0, deferred: 0 });
    expect(warn.mock.calls.some((c) => String(c[1]).includes("격자 없는 발사 키 2"))).toBe(true);
  });

  it("--dry-run → set 호출 0 · 행은 결과에 · CLI 종료 0", async () => {
    const f = fake();
    expect(await main(["backfill-launch", "--dry-run"], { sb: f.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 })).toBe(0);
    expect(rpcCalls(f.calls, "launch_queue_set")).toHaveLength(0);
    const g = fake();
    const out = await runBackfillLaunch({ sb: g.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: true });
    expect(out.rows).toHaveLength(4);
    expect(out).toMatchObject({ computed: 2, written: 0, failed: 0 });
  });

  it("다운로드 실패 1격자 → failed 1 · 나머지는 쓴다 · CLI 종료 1", async () => {
    const over = { launch_queue_pending: { data: { grids: [MISSING, G4], no_grid: 0 } } };
    const f = fake(over);
    const out = await runBackfillLaunch({ sb: f.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: false });
    expect(out).toMatchObject({ pending: 2, computed: 1, written: 3, failed: 1 });
    expect(rpcCalls(f.calls, "launch_queue_inputs").map((a) => a.p_date)).toEqual(["20261029", "20261030"]);
    const g = fake(over);
    expect(await main(["backfill-launch"], { sb: g.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 })).toBe(1);
  });

  it("inputs 실패 → 그 날짜 격자 전부 failed(다운로드도 안 한다)", async () => {
    const { sb } = fake({ launch_queue_inputs: { error: { message: "db down" } } });
    const dl: string[] = [];
    const out = await runBackfillLaunch({ sb, store: store(dl), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: false });
    expect(out).toMatchObject({ computed: 0, failed: 2 });
    expect(dl).toEqual([]);
  });

  it("set RPC 실패 → 그 배치 행 수만큼 failed", async () => {
    const { sb } = fake({ launch_queue_set: { error: { message: "db down" } } });
    const out = await runBackfillLaunch({ sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: false });
    expect(out).toMatchObject({ computed: 2, written: 0, failed: 4 });
  });

  it("시간 예산 초과 → 남은 격자 deferred(실패 아님)", async () => {
    const { sb, calls } = fake();
    let t = 0;
    const clock = () => {
      const v = t;
      t += 1000;
      return v;
    };
    const out = await runBackfillLaunch({ sb, store: store(), config: cfg({ nightlyBudgetMs: 1500 }), now: NOW, clock }, { dryRun: false });
    expect(out).toMatchObject({ pending: 2, computed: 1, deferred: 1, failed: 0 });
    expect((rpcCalls(calls, "launch_queue_set")[0]!.p_rows as unknown[]).length).toBe(3);
  });

  it("pending 모양이 어긋나면 throw(조용히 0건으로 진행하지 않음)", async () => {
    const { sb } = fake({ launch_queue_pending: { data: [] } });
    await expect(runBackfillLaunch({ sb, store: store(), config: cfg(), now: NOW }, { dryRun: false })).rejects.toThrow(
      /launch_queue_pending/,
    );
  });
});
