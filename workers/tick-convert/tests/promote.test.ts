import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import zlib from "node:zlib";
import { TICK_FMT, dayStartNs, iterRecords, splitZstdFrames } from "@gh-radar/shared";
import { main } from "../src/index";
import { checkTickgwUrl, type Config } from "../src/config";
import { logger } from "../src/logger";
import { closeNs, decompressFrames, parsePromoteArgs, runPromote } from "../src/modes/promote";
import { createSupabaseGridStore } from "../src/store";
import { a3Payload, b6Payload, kstNs, type Label } from "./helpers/synth-archive";
import { makeFakeSupabase, rpcCalls, uploads, type FakeOptions } from "./helpers/fake-supabase";
import { rawOf, servedOf, startFakeTickgw, type FakeKey, type FakeTickgw } from "./helpers/fake-tickgw";

const D = "20261102";
const PREV = "20261030";
const A = "KR7005930003";
const B = "KR7000660001";
const SECRET = "s".repeat(40);

/** KST 11/02(월) 20:10 — Scheduler 첫 실행 시각. */
const NOW = new Date("2026-11-02T11:10:00Z");

function cfg(url: string, over: Partial<Config> = {}): Config {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "k",
    archiveDir: "",
    keepDays: 90,
    catchupDays: 10,
    upPct: 15,
    zstdLevel: 9,
    stageChunkBytes: 65536,
    nightlyBudgetMs: 2_400_000,
    logLevel: "silent",
    appVersion: "test",
    dryRun: false,
    tickgwUrl: url,
    tickgwSecret: SECRET,
    ...over,
  };
}

/** 키 하나 — 09:00 부터 A3(G1 · 기준가 10000 · +15% 고가) · B6 · A3 … 레코드 n 개. */
function keyOf(isin: string, ex: "KRX" | "NXT", over: Partial<FakeKey> = {}, n = 6): FakeKey {
  const label = ex.toLowerCase() as Label;
  const recs: FakeKey["recs"] = [];
  for (let i = 0; i < n; i++) {
    const recvNs = kstNs(D, "0900", i, 123_456);
    const payload =
      i % 2 === 1
        ? b6Payload({ isin, label, seq: i })
        : a3Payload({ isin, label, seq: i, chg: i === 2 ? 1500 : 200, px: i === 2 ? 11500 : 10200 });
    recs.push({ recvNs, payload });
  }
  return { isin, ex, recs, closed: true, closedThroughNs: kstNs(D, "2001", 0), ...over };
}

let gw: FakeTickgw;
/** afterEach 가 닫을 서버 — 서버를 띄우지 않는 시험이 앞 시험의 닫힌 서버를 다시 닫지 않게. */
let live: FakeTickgw | undefined;

async function startGw(keys: FakeKey[], over: { listDate?: string; extraUnclosed?: number; secret?: string } = {}) {
  const g = await startFakeTickgw({ secret: over.secret ?? SECRET, today: D, keys, listDate: over.listDate, extraUnclosed: over.extraUnclosed });
  gw = g;
  live = g;
  return g;
}

function fake(opts: FakeOptions = {}) {
  const f = makeFakeSupabase(opts);
  return { ...f, store: createSupabaseGridStore(f.sb) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await live?.close();
  live = undefined;
});

describe("경계 리터럴 — tickgw kstDayStartNs(37-09)와 같은 값", () => {
  it("08:00 · 20:00 KST", () => {
    expect(dayStartNs("20261030")).toBe(1793314800000000000n); // 2026-10-29T23:00:00Z
    expect(dayStartNs("20261030", "2000")).toBe(1793358000000000000n); // 2026-10-30T11:00:00Z
    expect(closeNs("20261030")).toBe(1793358000000000000n);
  });
});

describe("다중 프레임 해제", () => {
  it("이어붙인 두 프레임을 모두 푼다 — Node zstdDecompressSync 한 번은 첫 프레임만 준다(37-02 함정)", () => {
    const k = keyOf(A, "KRX");
    const served = servedOf(k);
    expect(splitZstdFrames(served).length).toBe(2);
    expect(new Uint8Array(zlib.zstdDecompressSync(served)).length).toBeLessThan(rawOf(k).length);
    expect(decompressFrames(served)).toEqual(rawOf(k));
    expect([...iterRecords(decompressFrames(served))].length).toBe(6);
  });
});

describe("runPromote 트레이서 — 가짜 tickgw export → 승격 격자", () => {
  it("closed 키 두 개 → 업로드(promoted 경로 · 한 프레임 · 원래 레코드) → upsert('promoted') → 거래소별 실행 기록 → 종료 0", async () => {
    const kA = keyOf(A, "KRX");
    const kB = keyOf(B, "NXT", {}, 5);
    await startGw([kA, kB]);
    const f = fake();
    const code = await main(["promote"], { sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW });
    expect(code).toBe(0);

    // tickgw 요청 — 목록 1 + 바이트 2(date = KST 오늘 기본값)
    expect(gw.hits[0]).toBe(`/internal/ticks/export?date=${D}`);
    expect(gw.hits.filter((h) => h.startsWith("/internal/ticks/export/bytes")).length).toBe(2);

    const ups = uploads(f.calls);
    expect(ups.map((u) => [u.bucket, u.path])).toEqual([
      ["tick-grid", `grid/${D}/KRX/${A}.promoted.ticks.zst`],
      ["tick-grid", `grid/${D}/NXT/${B}.promoted.ticks.zst`],
    ]);
    // 올린 바이트 = 한 프레임 · 풀면 원래 레코드와 같다
    for (const [u, k] of [
      [ups[0]!, kA],
      [ups[1]!, kB],
    ] as const) {
      expect(splitZstdFrames(u.bytes).length).toBe(1);
      expect(new Uint8Array(zlib.zstdDecompressSync(u.bytes))).toEqual(gw.rawOf(k));
    }

    const ups2 = rpcCalls(f.calls, "tick_grid_upsert");
    expect(ups2.length).toBe(2);
    expect(ups2.every((a) => a.p_mode === "promoted")).toBe(true);
    const rowA = (ups2[0]!.p_rows as Record<string, unknown>[])[0]!;
    expect(rowA).toMatchObject({
      date: D,
      exchange: "KRX",
      isin: A,
      sources: ["promoted"],
      object_path: `grid/${D}/KRX/${A}.promoted.ticks.zst`,
      bytes: ups[0]!.bytes.length,
      records: 6,
      a3_count: 3,
      first_recv_ms: Number(kA.recs[0]!.recvNs / 1_000_000n),
      last_recv_ms: Number(kA.recs[5]!.recvNs / 1_000_000n),
      base_px: 10000,
      fmt: TICK_FMT,
    });
    expect(rowA.high_rate as number).toBeCloseTo(15, 9);
    expect(rowA.last_rate as number).toBeCloseTo(2, 9);

    const runs = rpcCalls(f.calls, "tick_convert_run_record").map((a) => a.p_run as Record<string, unknown>);
    expect(runs.map((r) => [r.exchange, r.mode, r.ok, r.targets, r.written, r.error])).toEqual([
      ["KRX", "promoted", true, 1, 1, null],
      ["NXT", "promoted", true, 1, 1, null],
    ]);
    expect(runs[0]!.bytes_read).toBe(gw.servedOf(kA).length);
  });

  it("upsert 반환 0(nightly · request 격자가 있다) → skipped · 실패 아님", async () => {
    await startGw([keyOf(A, "KRX")]);
    const f = fake({ rpc: { tick_grid_upsert: { data: 0 } } });
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ keys: 1, written: 0, skipped: 1, incomplete: 0, failed: 0 });
    const runs = rpcCalls(f.calls, "tick_convert_run_record").map((a) => a.p_run as Record<string, unknown>);
    expect(runs[0]).toMatchObject({ exchange: "KRX", ok: true, written: 0, error: "skipped 1" });
  });
});

describe("완결 재확인 — 하루치 전체가 아니면 승격하지 않는다", () => {
  it("closed_through_ns 가 19:59:59 KST → 바이트도 받지 않고 업로드 0 · upsert 0 · incomplete 1", async () => {
    await startGw([keyOf(A, "KRX", { closedThroughNs: kstNs(D, "1959", 59) }), keyOf(B, "KRX")]);
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ keys: 2, written: 1, incomplete: 1, failed: 0 });
    expect(gw.hits.some((h) => h.includes(`isin=${A}`))).toBe(false);
    expect(uploads(f.calls).map((u) => u.path)).toEqual([`grid/${D}/KRX/${B}.promoted.ticks.zst`]);
    expect(rpcCalls(f.calls, "tick_grid_upsert").length).toBe(1);
  });

  it("closed_through_ns 가 정확히 20:00:00 KST → 통과(≥)", async () => {
    await startGw([keyOf(A, "KRX", { closedThroughNs: closeNs(D) })]);
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ written: 1, incomplete: 0 });
  });

  it("레코드 수가 export records 와 다르다 → incomplete · 업로드 0", async () => {
    await startGw([keyOf(A, "KRX", { recordsOverride: 7 })]);
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ written: 0, incomplete: 1, failed: 0 });
    expect(out.results[0]!.reason).toMatch(/레코드 6 ≠ export records 7/);
    expect(uploads(f.calls).length).toBe(0);
    expect(rpcCalls(f.calls, "tick_grid_upsert").length).toBe(0);
  });

  it("첫 레코드 recv 가 그날 08:00 KST 이전(전날 캐시 등) → incomplete", async () => {
    const k = keyOf(A, "KRX");
    k.recs[0]!.recvNs = kstNs(D, "0759", 59);
    await startGw([k]);
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ written: 0, incomplete: 1 });
    expect(uploads(f.calls).length).toBe(0);
  });

  it("export 응답 date 가 요청과 다르다(전날 캐시) → run 실패 · main 1 · 업로드 0 · 바이트 요청 0", async () => {
    await startGw([keyOf(A, "KRX")], { listDate: PREV });
    const f = fake();
    await expect(runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {})).rejects.toThrow(
      /export date 20261030 ≠ 요청 date 20261102/,
    );
    const code = await main(["promote"], { sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW });
    expect(code).toBe(1);
    expect(uploads(f.calls).length).toBe(0);
    expect(gw.hits.some((h) => h.startsWith("/internal/ticks/export/bytes"))).toBe(false);
  });

  it("tickgw 가 DATE_MISMATCH 로 거절(--date 가 tickgw 오늘이 아님) → main 1", async () => {
    await startGw([keyOf(A, "KRX")]);
    const f = fake();
    const code = await main(["promote", "--date", PREV], { sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW });
    expect(code).toBe(1);
    expect(gw.hits).toEqual([`/internal/ticks/export?date=${PREV}`]);
    expect(uploads(f.calls).length).toBe(0);
  });
});

describe("요약 로그 · 실패 격리", () => {
  it("요약 한 줄에 unclosed 수를 남긴다", async () => {
    await startGw([keyOf(A, "KRX"), keyOf(B, "KRX", { closed: false })], { extraUnclosed: 2 });
    const info = vi.spyOn(logger, "info");
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ keys: 1, written: 1, unclosed: 3 });
    const line = info.mock.calls.map((c) => String(c[1])).find((m) => m.startsWith("[tick-convert] mode=promote"));
    expect(line).toMatch(new RegExp(`^\\[tick-convert\\] mode=promote date=${D} keys=1 written=1 skipped=0 incomplete=0 unclosed=3 failed=0 `));
  });

  it("비밀이 틀림(401) → run 실패 · main 1 · 업로드 0", async () => {
    await startGw([keyOf(A, "KRX")], { secret: "x".repeat(40) });
    const f = fake();
    await expect(runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {})).rejects.toThrow(/HTTP 401/);
    const code = await main(["promote"], { sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW });
    expect(code).toBe(1);
    expect(uploads(f.calls).length).toBe(0);
  });

  it("오류 메시지 · 로그에 비밀이 없다", async () => {
    await startGw([keyOf(A, "KRX", { bytesStatus: 500 })], { secret: SECRET });
    const err = vi.spyOn(logger, "error");
    const f = fake();
    await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(JSON.stringify(err.mock.calls, (_k, v) => (v instanceof Error ? v.message : v))).not.toContain(SECRET);
  });

  it("키 하나 bytes 500 → 그 키만 실패 · 다른 키는 승격 · main 1", async () => {
    await startGw([keyOf(A, "KRX", { bytesStatus: 500 }), keyOf(B, "KRX")]);
    const f = fake();
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ keys: 2, written: 1, failed: 1 });
    expect(out.results[0]).toMatchObject({ isin: A, status: "failed" });
    expect(out.results[0]!.reason).toMatch(/HTTP 500/);
    expect(uploads(f.calls).map((u) => u.path)).toEqual([`grid/${D}/KRX/${B}.promoted.ticks.zst`]);
    const runs = rpcCalls(f.calls, "tick_convert_run_record").map((a) => a.p_run as Record<string, unknown>);
    expect(runs[0]).toMatchObject({ exchange: "KRX", ok: false, targets: 2, written: 1, error: "failed 1" });

    const g2 = fake();
    expect(await main(["promote"], { sb: g2.sb, store: g2.store, config: cfg(gw.url), now: NOW })).toBe(1);
  });

  it("업로드 실패 → 그 키만 실패 · 메타 쓰지 않음", async () => {
    await startGw([keyOf(A, "KRX"), keyOf(B, "KRX")]);
    const f = fake({
      storage: (_b, op, args) => (op === "upload" && String(args[0]).includes(A) ? { error: { message: "boom" } } : undefined),
    });
    const out = await runPromote({ sb: f.sb, store: f.store, config: cfg(gw.url), now: NOW }, {});
    expect(out).toMatchObject({ written: 1, failed: 1 });
    const rows = rpcCalls(f.calls, "tick_grid_upsert").flatMap((a) => a.p_rows as Record<string, unknown>[]);
    expect(rows.map((r) => r.isin)).toEqual([B]);
  });
});

describe("두 번 실행 멱등(20:10 · 20:40)", () => {
  it("두 번째 실행은 같은 경로에 같은 바이트 · upsert 1(promoted → promoted) · 첫 실행 뒤 closed 가 된 키는 두 번째에만 written", async () => {
    const kA = keyOf(A, "KRX");
    const kB = keyOf(B, "NXT", { closed: false });
    await startGw([kA, kB]);
    const f1 = fake();
    const first = await runPromote({ sb: f1.sb, store: f1.store, config: cfg(gw.url), now: NOW }, {});
    expect(first).toMatchObject({ keys: 1, written: 1, unclosed: 1 });

    // 20:40 — B 의 마감 마무리가 끝났다
    kB.closed = true;
    const f2 = fake();
    const second = await runPromote(
      { sb: f2.sb, store: f2.store, config: cfg(gw.url), now: new Date("2026-11-02T11:40:00Z") },
      {},
    );
    expect(second).toMatchObject({ keys: 2, written: 2, skipped: 0, unclosed: 0, failed: 0 });

    const u1 = uploads(f1.calls);
    const u2 = uploads(f2.calls);
    expect(u1.map((u) => u.path)).toEqual([`grid/${D}/KRX/${A}.promoted.ticks.zst`]);
    expect(u2.map((u) => u.path)).toEqual([`grid/${D}/KRX/${A}.promoted.ticks.zst`, `grid/${D}/NXT/${B}.promoted.ticks.zst`]);
    expect(u2[0]!.bytes).toEqual(u1[0]!.bytes);
    expect(rpcCalls(f2.calls, "tick_grid_upsert").every((a) => a.p_mode === "promoted")).toBe(true);
    expect(second.results.map((r) => [r.isin, r.status])).toEqual([
      [A, "written"],
      [B, "written"],
    ]);
  });
});

describe("설정 · 인자", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("TICK_ARCHIVE_DIR", "");
    vi.stubEnv("TICKGW_SECRET", SECRET);
  });

  it("TICKGW_URL 공인 IP → 종료 2(비밀을 내보내지 않는다 · 요청 0)", async () => {
    await startGw([keyOf(A, "KRX")]);
    const f = fake();
    for (const bad of ["http://8.8.8.8:8092", "https://10.0.0.5:8092", "http://10.0.0.5@evil.example", "http://10.evil.example"]) {
      vi.stubEnv("TICKGW_URL", bad);
      expect(await main(["promote"], { sb: f.sb, store: f.store, now: NOW })).toBe(2);
    }
    expect(gw.hits.length).toBe(0);
  });

  it("promote 에 TICKGW_URL · TICKGW_SECRET 이 없으면 종료 2 · 주입한 Config 도 같다", async () => {
    const f = fake();
    vi.stubEnv("TICKGW_URL", "");
    expect(await main(["promote"], { sb: f.sb, store: f.store, now: NOW })).toBe(2);
    vi.stubEnv("TICKGW_URL", "http://10.146.0.2:8092");
    vi.stubEnv("TICKGW_SECRET", "");
    expect(await main(["promote"], { sb: f.sb, store: f.store, now: NOW })).toBe(2);
    expect(await main(["promote"], { sb: f.sb, store: f.store, config: cfg("", { tickgwSecret: "" }), now: NOW })).toBe(2);
  });

  it("promote 는 TICK_ARCHIVE_DIR 없이 돈다(env 경로 끝까지)", async () => {
    await startGw([keyOf(A, "KRX")]);
    vi.stubEnv("TICKGW_URL", `${gw.url}/`);
    const f = fake();
    expect(await main(["promote"], { sb: f.sb, store: f.store, now: NOW })).toBe(0);
    expect(uploads(f.calls).length).toBe(1);
  });

  it("checkTickgwUrl — 사설 대역 · 끝 / 제거", () => {
    expect(checkTickgwUrl("http://10.146.0.2:8092/")).toBe("http://10.146.0.2:8092");
    expect(checkTickgwUrl("http://127.0.0.1:8092")).toBe("http://127.0.0.1:8092");
    expect(checkTickgwUrl(undefined)).toBe("");
    expect(() => checkTickgwUrl("http://192.168.0.1")).toThrow(/사설 대역/);
  });

  it("인자 — --date 만 · 형식 오류 · 모르는 플래그는 종료 2", async () => {
    expect(parsePromoteArgs([])).toEqual({});
    expect(parsePromoteArgs(["--date", D])).toEqual({ date: D });
    expect(() => parsePromoteArgs(["--date", "20261332"])).toThrow(/YYYYMMDD/);
    const f = fake();
    expect(await main(["promote", "--ex", "KRX"], { sb: f.sb, store: f.store, config: cfg("http://127.0.0.1:1"), now: NOW })).toBe(2);
  });
});
