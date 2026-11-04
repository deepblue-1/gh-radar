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
import { parseLaunchLiveArgs, runLaunchLive } from "../src/modes/launch-live";
import { UsageError } from "../src/modes/request";
import { createTickgwLiveClient } from "../src/tickgw-live";
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

afterEach(() => vi.restoreAllMocks());

describe("parseLaunchLiveArgs", () => {
  it("인자 없음 → {} · 하나라도 있으면 UsageError · CLI 종료 2", async () => {
    expect(parseLaunchLiveArgs([])).toEqual({});
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
});
