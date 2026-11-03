/**
 * quick 261103-j4d 결정 5 — backfill-team 모드. 실제 픽스처 압축 바이트(천일 KRX · 컷 NXT)를 가짜 Storage 가 돌려주고,
 * set 행 값 = 같은 바이트를 풀어 shared teamDaySummaryOf 로 계산한 값인지 본다(= 로컬 dry-run). 다운로드 실패 · dry-run ·
 * 시간 예산 · 계산 실패 · CLI 종료 코드.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { teamDaySummaryOf, type TickExchange } from "@gh-radar/shared";
import { main } from "../src/index";
import type { Config } from "../src/config";
import { createSupabaseGridStore, type GridStore } from "../src/store";
import { parseBackfillTeamArgs, runBackfillTeam } from "../src/modes/backfill-team";
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

const CHUNIL = { date: "20261014", exchange: "KRX", isin: "KR7000650002", object_path: "grid/20261014/KRX/KR7000650002.nightly.ticks.zst", bytes: 1 };
const CUT_NXT = { date: "20261016", exchange: "NXT", isin: "KR7101360006", object_path: "grid/20261016/NXT/KR7101360006.nightly.ticks.zst", bytes: 1 };
const MISSING = { date: "20261015", exchange: "KRX", isin: "KR7000000001", object_path: "grid/20261015/KRX/KR7000000001.nightly.ticks.zst", bytes: 1 };

const BLOBS: Record<string, Uint8Array> = {
  [CHUNIL.object_path]: zst("chunil-1014-a3.ticks.zst"),
  [CUT_NXT.object_path]: zst("cut1300-nxt.ticks.zst"),
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

/** 기대값 — 같은 압축 바이트를 풀어 shared 함수로(로컬 dry-run). */
function want(p: { date: string; exchange: string; isin: string; object_path: string }) {
  const raw = zlib.zstdDecompressSync(BLOBS[p.object_path]!);
  const s = teamDaySummaryOf(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), p.exchange as TickExchange);
  return {
    date: p.date,
    exchange: p.exchange,
    isin: p.isin,
    object_path: p.object_path,
    team_fills: s.fills,
    team_day_net_krw: s.fills > 0 ? s.dayNetVal : null,
    team_day_pnl_krw: s.fills > 0 ? s.pnl!.total_val : null,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("parseBackfillTeamArgs", () => {
  it("--from · --to · --dry-run (순서 무관)", () => {
    expect(parseBackfillTeamArgs([])).toEqual({ dryRun: false });
    expect(parseBackfillTeamArgs(["--from", "20261020", "--to", "20261103", "--dry-run"])).toEqual({
      from: "20261020",
      to: "20261103",
      dryRun: true,
    });
    expect(parseBackfillTeamArgs(["--dry-run", "--to", "20261103"])).toEqual({ to: "20261103", dryRun: true });
  });
  it("모르는 플래그 · 형식 오류 · from > to → UsageError", () => {
    expect(() => parseBackfillTeamArgs(["--date", "20261020"])).toThrow(UsageError);
    expect(() => parseBackfillTeamArgs(["--from", "2026-10-20"])).toThrow(UsageError);
    expect(() => parseBackfillTeamArgs(["--from"])).toThrow(UsageError);
    expect(() => parseBackfillTeamArgs(["--from", "20261103", "--to", "20261020"])).toThrow(UsageError);
  });
});

describe("runBackfillTeam", () => {
  it("pending 2행(천일 KRX · 컷 NXT) → tick_grid_team_set 행 값 = teamDaySummaryOf 결과", async () => {
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_grid_team_pending: { data: [CHUNIL, CUT_NXT] },
        tick_grid_team_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
      },
    });
    const dl: string[] = [];
    const out = await runBackfillTeam({ sb, store: store(dl), config: cfg(), now: NOW, clock: () => 0 }, { from: "20261014", dryRun: false });
    expect(rpcCalls(calls, "tick_grid_team_pending")).toEqual([{ p_from: "20261014", p_to: null }]);
    expect(dl).toEqual([CHUNIL.object_path, CUT_NXT.object_path]); // 순차 · pending 순서
    const sets = rpcCalls(calls, "tick_grid_team_set");
    expect(sets).toHaveLength(1);
    expect(sets[0]!.p_rows).toEqual([want(CHUNIL), want(CUT_NXT)]);
    expect((sets[0]!.p_rows as { team_day_pnl_krw: number }[])[0]!.team_day_pnl_krw).toBe(31_782_350);
    expect(out).toMatchObject({ pending: 2, computed: 2, written: 2, teamFailed: 0, failed: 0, deferred: 0 });
  });

  it("다운로드 실패 1행 → failed 1 · 나머지는 쓴다 · CLI 종료 1", async () => {
    const mk = () =>
      makeFakeSupabase({
        rpc: {
          tick_grid_team_pending: { data: [MISSING, CHUNIL] },
          tick_grid_team_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
        },
      });
    const f = mk();
    const out = await runBackfillTeam({ sb: f.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: false });
    expect(out).toMatchObject({ pending: 2, computed: 1, written: 1, failed: 1 });
    expect(rpcCalls(f.calls, "tick_grid_team_set")[0]!.p_rows).toEqual([want(CHUNIL)]);

    const g = mk();
    expect(await main(["backfill-team"], { sb: g.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 })).toBe(1);
  });

  it("--dry-run → set 호출 0 · 계산 값은 결과에 남는다 · 종료 0", async () => {
    const { sb, calls } = makeFakeSupabase({ rpc: { tick_grid_team_pending: { data: [CHUNIL, CUT_NXT] } } });
    expect(await main(["backfill-team", "--dry-run"], { sb, store: store(), config: cfg(), now: NOW, clock: () => 0 })).toBe(0);
    expect(rpcCalls(calls, "tick_grid_team_set")).toHaveLength(0);

    const f = makeFakeSupabase({ rpc: { tick_grid_team_pending: { data: [CHUNIL] } } });
    const out = await runBackfillTeam({ sb: f.sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: true });
    expect(out.rows).toEqual([want(CHUNIL)]);
    expect(out).toMatchObject({ computed: 1, written: 0, failed: 0 });
  });

  it("시간 예산 초과 → 남은 키 deferred(실패 아님)", async () => {
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_grid_team_pending: { data: [CHUNIL, CUT_NXT, MISSING] },
        tick_grid_team_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
      },
    });
    let t = 0;
    const clock = () => {
      const v = t;
      t += 1000; // 호출마다 1초
      return v;
    };
    const out = await runBackfillTeam({ sb, store: store(), config: cfg({ nightlyBudgetMs: 1500 }), now: NOW, clock }, { dryRun: false });
    // t0 = 0 · 키1 직전 1000(≤ 1500 → 시작) · 키2 직전 2000(> 1500 → 멈춤)
    expect(out).toMatchObject({ pending: 3, computed: 1, deferred: 2, failed: 0 });
    expect(rpcCalls(calls, "tick_grid_team_set")[0]!.p_rows).toEqual([want(CHUNIL)]);
  });

  it("set RPC 실패 → 그 배치 행 수만큼 failed", async () => {
    const { sb } = makeFakeSupabase({
      rpc: { tick_grid_team_pending: { data: [CHUNIL] }, tick_grid_team_set: { error: { message: "db down" } } },
    });
    const out = await runBackfillTeam({ sb, store: store(), config: cfg(), now: NOW, clock: () => 0 }, { dryRun: false });
    expect(out).toMatchObject({ computed: 1, written: 0, failed: 1 });
  });

  it("pending 모양이 어긋나면 throw(조용히 0건으로 진행하지 않음)", async () => {
    const { sb } = makeFakeSupabase({ rpc: { tick_grid_team_pending: { data: [{ date: "20261014" }] } } });
    await expect(runBackfillTeam({ sb, store: store(), config: cfg(), now: NOW }, { dryRun: false })).rejects.toThrow(
      /tick_grid_team_pending/,
    );
  });
});

describe("createSupabaseGridStore.download", () => {
  it("버킷 tick-grid 에서 받아 Uint8Array · 오류면 경로를 담아 throw", async () => {
    const ok = makeFakeSupabase({
      storage: (_b, op) => (op === "download" ? { data: new Blob([new Uint8Array([1, 2, 3])]) } : undefined),
    });
    const got = await createSupabaseGridStore(ok.sb).download("grid/20261014/KRX/X.nightly.ticks.zst");
    expect(Array.from(got)).toEqual([1, 2, 3]);
    expect(ok.calls).toEqual([
      { kind: "storage", bucket: "tick-grid", op: "download", args: ["grid/20261014/KRX/X.nightly.ticks.zst"] },
    ]);

    const bad = makeFakeSupabase({ storage: (_b, op) => (op === "download" ? { error: { message: "Object not found" } } : undefined) });
    await expect(createSupabaseGridStore(bad.sb).download("grid/x")).rejects.toThrow("storage download tick-grid/grid/x: Object not found");
  });
});
