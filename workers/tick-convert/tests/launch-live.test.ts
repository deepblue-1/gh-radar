/**
 * quick 261104-n7i — launch-live 모드. 진짜 `createTickgwLiveClient` 에 가짜 fetch 를 넣어 tickgw live 응답으로 실제 골든 픽스처
 * 압축 바이트(10/30 184230 G4 · 10/30 NXT 09:00)를 흘리고, set 행 = 같은 바이트를 풀어 shared launchQueueOf 로 계산한 값 +
 * `live:<as-of ISO>` 표식인지 본다. 창 필터 · (isin, ex) 묶기 · inputs 0 이면 tickgw 호출 0 · 인자 오류.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { launchQueueOf } from "@gh-radar/shared";
import { main } from "../src/index";
import type { Config } from "../src/config";
import type { LaunchInputRow } from "../src/meta";
import {
  LIVE_KEY_SLOTS,
  LIVE_LEASE_GUARD_MS,
  LIVE_RUN_BUDGET_MS,
  parseLaunchLiveArgs,
  runLaunchLive,
} from "../src/modes/launch-live";
import { logger } from "../src/logger";
import { UsageError } from "../src/modes/request";
import { TickgwAuthError, createTickgwLiveClient } from "../src/tickgw-live";
import type { GridStore } from "../src/store";
import { makeFakeSupabase, rpcCalls } from "./helpers/fake-supabase";
import { liveFetch, serveDay, virtualClock, type LiveReply, type LiveReq } from "./helpers/fake-tickgw-live";

const FIXTURES = path.resolve(__dirname, "../../../packages/shared/src/__fixtures__/ticks");
const zst = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const G4_ZST = zst("launch1030-krx-g4.ticks.zst");
const NXT_ZST = zst("launch1030-nxt-0900.ticks.zst");

const SECRET = "s3cret-live";
const URL_ = "http://10.0.0.5:8787";

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
    tickgwUrl: URL_,
    tickgwSecret: SECRET,
    ...over,
  };
}

const G4_ISIN = "KR7184230001";
const NXT_ISIN = "KR7376900007";

const q = (gateway: string, wire: number, qty: number): LaunchInputRow => ({
  trade_date: "20261030",
  gateway,
  profile: "Q16",
  fire_exchange: "KRX",
  fire_base: "16:00:00",
  market: "Q",
  wire,
  side: "buy",
  isin: G4_ISIN,
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
  isin: NXT_ISIN,
  price: 17910,
  qty: 281,
  fills: [[18000, 281]],
};
const INPUTS: LaunchInputRow[] = [q("KB120", 0, 16666), q("KB120", 1, 7766), q("KYOBO119", 0, 16666), N_SELL];

/** 16:05 KST · 09:05 KST(2026-10-30). */
const NOW_16 = new Date("2026-10-30T07:05:00Z");
const NOW_09 = new Date("2026-10-30T00:05:00Z");
const ASOF_16 = Date.parse("2026-10-30T07:04:00Z");
const ASOF_09 = Date.parse("2026-10-30T00:04:00Z");

/** 기대 행 — 같은 압축 바이트를 풀어 shared 함수로 + live 표식. */
function want(bytes: Uint8Array, ex: "KRX" | "NXT", pieces: LaunchInputRow[], objectPath: string) {
  const b = zlib.zstdDecompressSync(bytes);
  const buf = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return launchQueueOf(buf, ex, "20261030", pieces).map((o) => {
    const p = o.piece as LaunchInputRow;
    return {
      trade_date: p.trade_date,
      gateway: p.gateway,
      profile: p.profile,
      fire_exchange: p.fire_exchange,
      fire_base: p.fire_base,
      market: p.market,
      wire: p.wire,
      object_path: objectPath,
      ...o.value,
    };
  });
}

function fake(over: Parameters<typeof makeFakeSupabase>[0]["rpc"] = {}, inputs: LaunchInputRow[] = INPUTS) {
  return makeFakeSupabase({
    rpc: {
      launch_queue_inputs: { data: inputs },
      launch_queue_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
      ...over,
    },
  });
}

const noStore = {} as GridStore;

/** 키(isin|ex)별 응답기 · 모르는 키는 실패시킨다. */
function byKey(map: Record<string, (req: LiveReq, i: number) => LiveReply>) {
  return (req: LiveReq, i: number): LiveReply => {
    const h = map[`${req.isin}|${req.ex}`];
    if (!h) throw new Error(`예상 밖 키 ${req.isin}|${req.ex}`);
    return h(req, i);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("parseLaunchLiveArgs", () => {
  it("인자 없음 → {} · --all-today → allToday · 그 밖은 UsageError · CLI 종료 2", async () => {
    expect(parseLaunchLiveArgs([])).toEqual({});
    expect(parseLaunchLiveArgs(["--all-today"])).toEqual({ allToday: true });
    expect(() => parseLaunchLiveArgs(["--all-today", "--x"])).toThrow(UsageError);
    expect(() => parseLaunchLiveArgs(["--date", "20261104"])).toThrow(UsageError);
    const { sb } = fake();
    expect(await main(["launch-live", "--date", "20261104"], { sb, store: noStore, config: cfg(), now: NOW_16 })).toBe(2);
  });
});

describe("runLaunchLive — 골든", () => {
  it("16:00 — (184230, KRX) 만 받는다 · More 로 이어 받기 · 행 = launchQueueOf 값 + live 표식(KB wire 0 #9 · 68,808주)", async () => {
    const cut = Math.floor(G4_ZST.length / 2) + 17;
    const { fetchImpl, reqs } = liveFetch(byKey({ [`${G4_ISIN}|KRX`]: serveDay(G4_ZST, { asOfMs: ASOF_16, cap: cut }) }));
    const vc = virtualClock(NOW_16.getTime());
    const { sb, calls } = fake();
    const out = await runLaunchLive(
      {
        sb,
        store: noStore,
        config: cfg(),
        now: NOW_16,
        clock: vc.clock,
        sleep: vc.sleep,
        tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }),
      },
      {},
    );
    // 요청: 그 키만 · 둘째 요청 offset = 첫 응답 Offset-End · 비밀은 헤더에만
    expect(reqs.map((r) => `${r.isin}|${r.ex}|${r.offset}|${r.epoch}`)).toEqual([`${G4_ISIN}|KRX|0|`, `${G4_ISIN}|KRX|${cut}|ep-1`]);
    for (const r of reqs) {
      expect(r.url.pathname).toBe("/internal/ticks/live");
      expect(r.headers["X-Tickgw-Secret"]).toBe(SECRET);
      expect(r.url.toString()).not.toContain(SECRET);
    }
    expect(vc.sleeps).toEqual([]); // More=true 는 대기 없이 · ready 에서 끝
    const sets = rpcCalls(calls, "launch_queue_set");
    expect(sets).toHaveLength(1);
    const rows = sets[0]!.p_rows as Record<string, unknown>[];
    const mark = "live:2026-10-30T07:04:00.000Z";
    expect(rows).toEqual(want(G4_ZST, "KRX", INPUTS.slice(0, 3), mark));
    expect(rows[0]).toMatchObject({ gateway: "KB120", wire: 0, rank: 9, ahead_qty: 68808, object_path: mark });
    expect(rpcCalls(calls, "launch_queue_inputs")).toEqual([{ p_date: "20261030" }]);
    expect(out).toMatchObject({ mode: "launch-live", date: "20261030", keys: 1, computed: 1, written: 3, failed: 0, deferred: 0 });
  });

  it("09:00 — (376900, NXT) 만 받는다 · 행 kind run · rank 1 · 281주 · 18,000원 · live 표식", async () => {
    const { fetchImpl, reqs } = liveFetch(byKey({ [`${NXT_ISIN}|NXT`]: serveDay(NXT_ZST, { asOfMs: ASOF_09 }) }));
    const vc = virtualClock(NOW_09.getTime());
    const { sb, calls } = fake();
    const out = await runLaunchLive(
      {
        sb,
        store: noStore,
        config: cfg(),
        now: NOW_09,
        clock: vc.clock,
        sleep: vc.sleep,
        tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }),
      },
      {},
    );
    expect(reqs.map((r) => `${r.isin}|${r.ex}`)).toEqual([`${NXT_ISIN}|NXT`]);
    const rows = rpcCalls(calls, "launch_queue_set")[0]!.p_rows as Record<string, unknown>[];
    const mark = "live:2026-10-30T00:04:00.000Z";
    expect(rows).toEqual(want(NXT_ZST, "NXT", [N_SELL], mark));
    expect(rows[0]).toMatchObject({ kind: "run", rank: 1, fill_qty: 281, fill_px_min: 18000, object_path: mark });
    expect(out).toMatchObject({ keys: 1, computed: 1, written: 1, failed: 0 });
  });
});

describe("runLaunchLive — 대상 없음", () => {
  it("inputs [] → tickgw 호출 0 · keys 0 · failed 0", async () => {
    const { fetchImpl, reqs } = liveFetch(() => new Error("호출되면 안 된다"));
    const { sb, calls } = fake({}, []);
    const out = await runLaunchLive(
      { sb, store: noStore, config: cfg(), now: NOW_16, tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }) },
      {},
    );
    expect(reqs).toHaveLength(0);
    expect(rpcCalls(calls, "launch_queue_set")).toHaveLength(0);
    expect(out).toMatchObject({ keys: 0, computed: 0, failed: 0 });
  });

  it("창 밖 시각(12:00 KST) → tickgw 호출 0 · keys 0 · CLI 종료 0(TICKGW 설정 없이도 — 클라이언트를 만들지 않는다)", async () => {
    const noon = new Date("2026-10-30T03:00:00Z");
    const { fetchImpl, reqs } = liveFetch(() => new Error("호출되면 안 된다"));
    const { sb } = fake();
    const out = await runLaunchLive(
      { sb, store: noStore, config: cfg(), now: noon, tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }) },
      {},
    );
    expect(reqs).toHaveLength(0);
    expect(out).toMatchObject({ keys: 0, failed: 0 });
    const f = fake();
    expect(await main(["launch-live"], { sb: f.sb, store: noStore, config: cfg({ tickgwUrl: "", tickgwSecret: "" }), now: noon })).toBe(0);
  });

  it("--all-today — 45분 창이 지난 17:55 에도 오늘 16:00 · 09:00 조각을 전부 받는다(수동 따라잡기)", async () => {
    const late = new Date("2026-10-30T08:55:00Z");
    const { fetchImpl, reqs } = liveFetch(
      byKey({
        [`${G4_ISIN}|KRX`]: serveDay(G4_ZST, { asOfMs: late.getTime() - 60_000 }),
        [`${NXT_ISIN}|NXT`]: serveDay(NXT_ZST, { asOfMs: late.getTime() - 60_000 }),
      }),
    );
    const vc = virtualClock(late.getTime());
    const deps = {
      sb: fake().sb,
      store: noStore,
      config: cfg(),
      now: late,
      clock: vc.clock,
      sleep: vc.sleep,
      tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }),
    };
    // 창 run 은 0키
    expect(await runLaunchLive(deps, {})).toMatchObject({ keys: 0 });
    expect(reqs).toHaveLength(0);
    const out = await runLaunchLive({ ...deps, sb: fake().sb }, { allToday: true });
    expect(out).toMatchObject({ keys: 2, computed: 2, written: 4, failed: 0, deferred: 0 });
    expect(out.rows[0]).toMatchObject({ gateway: "KB120", wire: 0, rank: 9, ahead_qty: 68808 });
  });
});

/** 16:00 Q16 조각 — isin 만 바꾼 키 n 개(회계 시험 · 값 검증은 골든이 한다). */
function manyKeys(n: number): LaunchInputRow[] {
  return Array.from({ length: n }, (_, i) => ({ ...q("KB120", 0, 100), isin: `KR7${String(100000 + i).padStart(6, "0")}001` }));
}

function liveDeps(
  reply: (req: LiveReq, i: number) => LiveReply,
  opts: { now?: Date; inputs?: LaunchInputRow[]; rpc?: Parameters<typeof makeFakeSupabase>[0]["rpc"] } = {},
) {
  const now = opts.now ?? NOW_16;
  const vc = virtualClock(now.getTime());
  const at: number[] = [];
  const { fetchImpl, reqs } = liveFetch((req, i) => {
    at.push(vc.clock());
    return reply(req, i);
  });
  const f = fake(opts.rpc ?? {}, opts.inputs ?? INPUTS);
  const deps = {
    sb: f.sb,
    store: noStore,
    config: cfg(),
    now,
    clock: vc.clock,
    sleep: vc.sleep,
    tickgwLive: createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl }),
  };
  return { deps, reqs, at, vc, calls: f.calls };
}

/** CLI 경로(main) — main 은 tickgw 클라이언트를 주입받지 않으므로 전역 fetch 를 가짜로 바꾼다(sleep 은 주입 불가 → 게이트가 안 걸리는 시나리오만). */
async function mainLive(
  reply: (req: LiveReq, vc: ReturnType<typeof virtualClock>) => LiveReply,
  opts: { inputs?: LaunchInputRow[] } = {},
): Promise<{ code: number; reqs: LiveReq[] }> {
  const vc = virtualClock(NOW_16.getTime());
  const { fetchImpl, reqs } = liveFetch((req) => reply(req, vc));
  vi.stubGlobal("fetch", fetchImpl);
  const f = fake({}, opts.inputs ?? INPUTS);
  const code = await main(["launch-live"], { sb: f.sb, store: noStore, config: cfg(), now: NOW_16, clock: vc.clock });
  return { code, reqs };
}

describe("runLaunchLive — 운영 규율", () => {
  it(`리스 인식 게이트 — 키 6개가 바로 끝나도 ${LIVE_KEY_SLOTS + 1}번째 키 첫 요청 ≥ 1번째 키 lastReqAt + ${LIVE_LEASE_GUARD_MS}`, async () => {
    const inputs = manyKeys(6);
    const { deps, reqs, at } = liveDeps(() => ({ body: G4_ZST, state: "ready", asOfMs: ASOF_16 }), { inputs });
    const out = await runLaunchLive(deps, {});
    expect(reqs.map((r) => r.isin)).toEqual(inputs.map((p) => p.isin)); // 키당 요청 1번 · 입력 순서
    expect(at[LIVE_KEY_SLOTS]! - at[0]!).toBeGreaterThanOrEqual(LIVE_LEASE_GUARD_MS);
    // 어느 시점이든 살아 있는 우리 리스 ≤ 4
    for (const t of at) expect(at.filter((x) => x <= t && x + LIVE_LEASE_GUARD_MS > t).length).toBeLessThanOrEqual(LIVE_KEY_SLOTS);
    expect(out).toMatchObject({ keys: 6, computed: 6, deferred: 0, failed: 0 });
  });

  it(`run 예산 — 시작 ${LIVE_RUN_BUDGET_MS / 1000}초 뒤에는 새 키를 열지 않는다 · 남은 키 deferred(budget) · 종료 0`, async () => {
    const inputs = manyKeys(5);
    const warn = vi.spyOn(logger, "warn");
    const box: { vc?: ReturnType<typeof virtualClock> } = {};
    const { deps, reqs, vc } = liveDeps(() => {
      box.vc!.advance(30_000); // 키마다 30초 걸리는 하루치 받기
      return { body: G4_ZST, state: "ready", asOfMs: ASOF_16 };
    }, { inputs });
    box.vc = vc;
    const out = await runLaunchLive(deps, {});
    expect(reqs).toHaveLength(4); // 0 · 30 · 60 · 90초에 열고 120초에는 열지 않는다
    expect(out).toMatchObject({ keys: 5, computed: 4, deferred: 1, failed: 0 });
    expect(warn.mock.calls.some((c) => String(c[1]).includes("run 예산"))).toBe(true);
    const m = await mainLive((_req, v) => {
      v.advance(30_000);
      return { body: G4_ZST, state: "ready", asOfMs: ASOF_16 };
    }, { inputs });
    expect(m).toMatchObject({ code: 0 });
    expect(m.reqs).toHaveLength(4);
  });

  it("키 하나 failed(500) → failed 1 · 다른 키는 계속 계산 · 저장 · CLI 종료 1", async () => {
    const inputs = manyKeys(3);
    const reply = (req: LiveReq): LiveReply =>
      req.isin === inputs[1]!.isin ? { status: 500, json: { error: "BOOM" } } : { body: G4_ZST, state: "ready", asOfMs: ASOF_16 };
    const err = vi.spyOn(logger, "error");
    const { deps, calls } = liveDeps(reply, { inputs });
    const out = await runLaunchLive(deps, {});
    expect(out).toMatchObject({ keys: 3, computed: 2, failed: 1 });
    expect(rpcCalls(calls, "launch_queue_set")).toHaveLength(1);
    expect(err.mock.calls.some((c) => String(c[1]).includes("키 받기 실패"))).toBe(true);
    expect((await mainLive(reply, { inputs })).code).toBe(1);
  });

  it("set RPC 오류 → failed += 보낸 행 수 · error 로그", async () => {
    const err = vi.spyOn(logger, "error");
    const { deps } = liveDeps(serveDay(G4_ZST, { asOfMs: ASOF_16 }), { rpc: { launch_queue_set: { error: { message: "db down" } } } });
    const out = await runLaunchLive(deps, {});
    expect(out).toMatchObject({ computed: 1, written: 0, failed: 3 });
    expect(err.mock.calls.some((c) => String(c[1]).includes("set failed"))).toBe(true);
  });

  it("set 이 일부만 썼다고 답하면 set_skipped = 보낸 − 쓴 · warn 한 줄", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { deps } = liveDeps(serveDay(G4_ZST, { asOfMs: ASOF_16 }), {
      rpc: { launch_queue_set: (a) => ({ data: (a.p_rows as unknown[]).length - 1 }) },
    });
    const out = await runLaunchLive(deps, {});
    expect(out).toMatchObject({ written: 2, setSkipped: 1, failed: 0 });
    expect(warn.mock.calls.some((c) => String(c[1]).includes("격자 값"))).toBe(true);
  });

  it("fills_empty = 창 안 조각 중 profile N · A 이고 fills 빈 조각 수 · 요약 문자열에 모든 칸", async () => {
    const info = vi.spyOn(logger, "info");
    const inputs: LaunchInputRow[] = [
      N_SELL, // fills 있음
      { ...N_SELL, wire: 1, fills: [] },
      { ...N_SELL, profile: "A", fire_exchange: "KRX", fire_base: "09:00:27", fills: [] },
      { ...q("KB120", 0, 100), fills: [] }, // Q16 은 창 밖(16:00) · 세지 않음
    ];
    const { deps } = liveDeps(() => ({ body: NXT_ZST, state: "ready", asOfMs: ASOF_09 }), { now: NOW_09, inputs });
    const out = await runLaunchLive(deps, {});
    expect(out).toMatchObject({ keys: 2, fillsEmpty: 2 });
    const line = info.mock.calls.map((c) => String(c[1])).find((m) => m.includes("mode=launch-live"))!;
    for (const k of ["date=", "keys=", "computed=", "written=", "set_skipped=", "deferred=", "failed=", "launch_failed=", "fills_empty=2", "ms="]) {
      expect(line).toContain(k);
    }
  });

  it("tickgw 401 → runLaunchLive 가 TickgwAuthError 로 reject · CLI 종료 1", async () => {
    const { deps } = liveDeps(() => ({ status: 401, json: { error: "UNAUTHORIZED" } }));
    await expect(runLaunchLive(deps, {})).rejects.toBeInstanceOf(TickgwAuthError);
    expect((await mainLive(() => ({ status: 401, json: { error: "UNAUTHORIZED" } }))).code).toBe(1);
  });

  it("inputs RPC 오류 → throw(CLI 종료 1)", async () => {
    const { deps } = liveDeps(() => new Error("x"), { rpc: { launch_queue_inputs: { error: { message: "db down" } } } });
    await expect(runLaunchLive(deps, {})).rejects.toThrow();
  });
});
