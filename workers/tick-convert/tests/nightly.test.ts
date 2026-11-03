import { describe, it, expect, afterEach, vi } from "vitest";
import zlib from "node:zlib";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DayRateTracker, iterRecords } from "@gh-radar/shared";
import { main } from "../src/index";
import type { Config } from "../src/config";
import { logger } from "../src/logger";
import { RecordSink } from "../src/grid-file";
import { KeyStager } from "../src/stage";
import { selectTargets } from "../src/select";
import { createSupabaseGridStore } from "../src/store";
import { gridTeamOf } from "../src/team-day";
import { gridLaunchOf } from "../src/launch-queue";
import {
  GAVE_UP_ALERT_WINDOW_MS,
  NIGHTLY_MAX_FAILED_RUNS,
  NO_OBJECTS,
  RUN_RECORD_RETRY_MS,
  STARTED,
  STARTED_LATER,
  TRANSIENT,
  failedNightlyRunsOf,
  freshlyGaveUp,
  nightlyDatesOf,
  runNightly,
} from "../src/modes/nightly";
import type { RunSince } from "../src/meta";
import {
  a3Payload,
  b6Payload,
  b9Payload,
  kstNs,
  makeSynthArchive,
  type Label,
  type SynthPacket,
} from "./helpers/synth-archive";
import { makeFakeSupabase, rpcCalls, uploads, type Call } from "./helpers/fake-supabase";

const D = "20261030";
const R = "KR7005930003"; // 매집감지 등록(accum) — KRX · NXT 모두 체결
const U = "KR7000660001"; // NXT 에서만 +15%(정확히 15%) — KRX 는 +10%
const N = "KR7035720002"; // 비대상 — G1 +5% · G4 보드에서만 +20%

/** 월요일 2026-11-02 23:30 KST — Scheduler 첫 실행 시각. D(10/30 금)는 오늘 − 3일. */
const NOW = new Date("2026-11-02T14:30:00Z");

function cfg(root: string, over: Partial<Config> = {}): Config {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "k",
    archiveDir: root,
    keepDays: 90,
    catchupDays: 10,
    upPct: 15,
    zstdLevel: 3,
    stageChunkBytes: 512, // 작게 — 시험 종목이 여러 압축 청크로 나뉘게(take 가 청크를 이어붙이는 경로)
    nightlyBudgetMs: 2_400_000,
    logLevel: "silent",
    appVersion: "test",
    dryRun: false,
    ...over,
  };
}

function packets(date: string): SynthPacket[] {
  const at = (hhmm: string, s: number, nsec = 0) => kstNs(date, hhmm, s, nsec);
  const out: SynthPacket[] = [];
  // R: KRX 에 A3 20건(+5% · 청크 여럿) · B6 · B9 / NXT 에 A3 +3%
  for (let i = 0; i < 20; i++) {
    out.push({ label: "krx", hhmm: "0900", recvNs: at("0900", 10 + i, 1), payload: a3Payload({ isin: R, label: "krx", seq: i + 1, chg: 500, px: 10500 }) });
  }
  out.push({ label: "krx", hhmm: "0900", recvNs: at("0900", 40, 1), payload: b6Payload({ isin: R, label: "krx" }) });
  out.push({ label: "krx", hhmm: "1000", recvNs: at("1000", 5, 1), payload: b9Payload({ isin: R, label: "krx" }) });
  out.push({ label: "nxt", hhmm: "0900", recvNs: at("0900", 15, 1), payload: a3Payload({ isin: R, label: "nxt", chg: 300, px: 10300 }) });
  // U: KRX +10% · NXT +15%(base 10000 · chg 1500 — 정수식 경계 포함)
  out.push({ label: "krx", hhmm: "0900", recvNs: at("0900", 20, 2), payload: a3Payload({ isin: U, label: "krx", chg: 1000, px: 11000 }) });
  out.push({ label: "krx", hhmm: "1000", recvNs: at("1000", 6, 2), payload: b6Payload({ isin: U, label: "krx" }) });
  out.push({ label: "nxt", hhmm: "1000", recvNs: at("1000", 7, 2), payload: a3Payload({ isin: U, label: "nxt", chg: 1500, px: 11500 }) });
  // N: G1 +5% · G4 +20%(G1 만 판정 — 대상 아님)
  out.push({ label: "krx", hhmm: "0900", recvNs: at("0900", 30, 3), payload: a3Payload({ isin: N, label: "krx", chg: 500, px: 10500 }) });
  out.push({ label: "nxt", hhmm: "1000", recvNs: at("1000", 8, 3), payload: a3Payload({ isin: N, label: "nxt", board: "G4", chg: 2000, px: 12000 }) });
  return out;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  vi.restoreAllMocks();
});

function newRoot(): string {
  const r = mkdtempSync(join(tmpdir(), "tick-nightly-"));
  cleanups.push(() => rmSync(r, { recursive: true, force: true }));
  return r;
}

function synth(root: string, date: string, opts: { hours?: Partial<Record<Label, string[]>>; packets?: SynthPacket[] } = {}) {
  const a = makeSynthArchive({ date, root, hours: opts.hours, packets: opts.packets ?? [] });
  cleanups.push(a.cleanup);
  return a;
}

function decode(bytes: Uint8Array): Uint8Array {
  const raw = zlib.zstdDecompressSync(bytes);
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

function idx(calls: Call[], pred: (c: Call) => boolean): number {
  return calls.findIndex(pred);
}

const isRpc = (name: string) => (c: Call) => c.kind === "rpc" && c.name === name;

/** 끝 기록(ok true/false) — 날짜 시작 때 쓰는 「시작」 기록(ok null · STARTED · R2-WR-03)을 뺀다. */
const finals = (calls: Call[]) =>
  rpcCalls(calls, "tick_convert_run_record")
    .map((x) => x.p_run as Record<string, unknown>)
    .filter((r) => r.ok !== null);
const isFinalRec = (c: Call) =>
  c.kind === "rpc" && c.name === "tick_convert_run_record" && (c.args.p_run as { ok: unknown }).ok !== null;

const HOURS_08_20 = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, "0")}00`);

// ── 날짜 고르기 ─────────────────────────────────────────────

describe("nightlyDatesOf — 평일 · 휴장 · ok 기록 · 최신부터", () => {
  it("11/02(월) 23:30 · 10일 → 평일 6일(주말 10/24 · 25 · 31 · 11/01 제외) · 최신부터", () => {
    expect(nightlyDatesOf(NOW, 10, [])).toEqual(["20261102", "20261030", "20261029", "20261028", "20261027", "20261026"]);
  });

  it("휴장일(10/09 한글날 · 10/05 개천절 대체)을 고르지 않는다", () => {
    const now = new Date("2026-10-13T14:30:00Z"); // 10/13(화) 23:30 KST
    expect(nightlyDatesOf(now, 10, [])).toEqual(["20261013", "20261012", "20261008", "20261007", "20261006"]);
  });

  it("ok nightly 기록이 KRX · NXT 둘 다 있는 날만 뺀다(한쪽만 · 실패 · request 기록은 다시 고른다)", () => {
    const run = (date: string, exchange: string, mode: RunSince["mode"], ok: boolean): RunSince => ({
      date,
      exchange,
      mode,
      ok,
      finished_at: "2026-11-01T00:00:00Z",
    });
    const runs = [
      run("20261030", "KRX", "nightly", true),
      run("20261030", "NXT", "nightly", true),
      run("20261029", "KRX", "nightly", true),
      run("20261028", "KRX", "nightly", true),
      run("20261028", "NXT", "nightly", false),
      run("20261027", "KRX", "request", true),
      run("20261027", "NXT", "request", true),
    ];
    expect(nightlyDatesOf(NOW, 10, runs)).toEqual(["20261102", "20261029", "20261028", "20261027", "20261026"]);
  });

  it("실패 nightly 실행이 NIGHTLY_MAX_FAILED_RUNS(2)회를 넘은 날은 더 고르지 않는다 — 2회까지는 다시 고른다(WR-36)", () => {
    const fail = (date: string, exchange: string): RunSince => ({ date, exchange, mode: "nightly", ok: false, finished_at: "2026-11-01T00:00:00Z" });
    const runs = [
      // 10/30 — KRX 3회 실패(NXT 는 ok) → 포기
      fail("20261030", "KRX"),
      fail("20261030", "KRX"),
      fail("20261030", "KRX"),
      { date: "20261030", exchange: "NXT", mode: "nightly" as const, ok: true, finished_at: "2026-11-01T00:00:00Z" },
      // 10/29 — 두 거래소 2회씩 실패 → 아직 고른다
      fail("20261029", "KRX"),
      fail("20261029", "NXT"),
      fail("20261029", "KRX"),
      fail("20261029", "NXT"),
      // 10/28 — request 실패는 세지 않는다
      { date: "20261028", exchange: "KRX", mode: "request" as const, ok: false, finished_at: null },
      { date: "20261028", exchange: "KRX", mode: "request" as const, ok: false, finished_at: null },
      { date: "20261028", exchange: "KRX", mode: "request" as const, ok: false, finished_at: null },
    ];
    expect(NIGHTLY_MAX_FAILED_RUNS).toBe(2);
    expect(nightlyDatesOf(NOW, 10, runs)).toEqual(["20261102", "20261029", "20261028", "20261027", "20261026"]);
    expect(nightlyDatesOf(NOW, 10, runs, Infinity)).toContain("20261030");
  });

  it("일시 장애(TRANSIENT) 기록은 세지 않는다 · 끝 기록 없는 「시작」 기록(크래시)은 센다 · error 없는 옛 기록은 센다(R2-WR-03)", () => {
    const r = (date: string, exchange: string, ok: boolean | null, error?: string | null): RunSince => ({
      date,
      exchange,
      mode: "nightly",
      ok,
      finished_at: "2026-11-01T00:00:00Z",
      ...(error === undefined ? {} : { error }),
    });
    const runs = [
      // 10/30 — 일시 장애 5회 → 0 · 계속 고른다
      ...[1, 2, 3, 4, 5].map(() => r("20261030", "KRX", false, `${TRANSIENT}: tick_convert_candidates: fetch failed`)),
      // 10/29 — 크래시 3회(시작만) → 포기
      ...[1, 2, 3].map(() => r("20261029", "KRX", null, STARTED)),
      // 10/28 — 시작 3 · 끝 3(일시 장애) → 크래시 0 · 실패 0
      ...[1, 2, 3].flatMap(() => [r("20261028", "NXT", null, STARTED), r("20261028", "NXT", false, `${TRANSIENT}: failed 1`)]),
      // 10/27 — error 없는 옛 기록 3회 → 결정적으로 센다
      ...[1, 2, 3].map(() => r("20261027", "KRX", false)),
      // 10/26 — 결정적 1 + 크래시 2 = 3 → 포기
      r("20261026", "KRX", null, STARTED),
      r("20261026", "KRX", false, "failed 1"),
      r("20261026", "KRX", null, STARTED),
      r("20261026", "KRX", null, STARTED),
    ];
    const n = failedNightlyRunsOf(runs);
    expect([n.get("20261030"), n.get("20261029"), n.get("20261028"), n.get("20261027"), n.get("20261026")]).toEqual([
      undefined,
      3,
      undefined,
      3,
      3,
    ]);
    expect(nightlyDatesOf(NOW, 10, runs)).toEqual(["20261102", "20261030", "20261028"]);
  });

  it("뒤 날짜(STARTED_LATER)의 끝 기록 없는 「시작」 은 세지 않는다 · 기록은 finished_at 순으로 짝짓는다(R3-IN-01)", () => {
    const r = (date: string, ok: boolean | null, error: string | null, finished_at: string): RunSince => ({
      date,
      exchange: "KRX",
      mode: "nightly",
      ok,
      finished_at,
      error,
    });
    const runs = [
      // 10/30 — 앞 날짜가 시간을 먹어 task timeout 에 끊긴 뒤 날짜 3회 → 0(건강한 날짜를 포기하지 않는다)
      r("20261030", null, STARTED_LATER, "2026-10-31T15:20:00Z"),
      r("20261030", null, STARTED_LATER, "2026-11-01T15:20:00Z"),
      r("20261030", null, STARTED_LATER, "2026-11-02T15:20:00Z"),
      // 10/29 — 받은 순서가 뒤섞여도 시각 순으로: 첫 날짜 크래시(1) → 뒤 날짜로 시작해 TRANSIENT 끝 → 첫 날짜 크래시(2)
      r("20261029", null, STARTED, "2026-11-01T14:31:00Z"),
      r("20261029", false, `${TRANSIENT}: boom`, "2026-10-31T16:00:00Z"),
      r("20261029", null, STARTED_LATER, "2026-10-31T15:10:00Z"),
      r("20261029", null, STARTED, "2026-10-30T14:31:00Z"),
    ];
    const n = failedNightlyRunsOf(runs);
    expect(n.get("20261030")).toBeUndefined();
    expect(n.get("20261029")).toBe(2);
  });

  it("한 실행에서 첫 번째로 시작한 날짜만 STARTED · 뒤 날짜는 STARTED_LATER(R3-IN-01)", async () => {
    const root = newRoot();
    for (const d of ["20261030", "20261029"]) synth(root, d, { hours: { krx: HOURS_08_20, nxt: HOURS_08_20 } });
    const { sb, calls } = makeFakeSupabase();
    await runNightly({ sb, store: createSupabaseGridStore(sb), config: cfg(root), now: NOW, clock: () => 0 }, {});
    const starts = rpcCalls(calls, "tick_convert_run_record")
      .map((x) => x.p_run as Record<string, unknown>)
      .filter((x) => x.ok === null)
      .map((x) => [x.date, x.exchange, x.error]);
    expect(starts).toEqual([
      ["20261030", "KRX", STARTED],
      ["20261030", "NXT", STARTED],
      ["20261029", "KRX", STARTED_LATER],
      ["20261029", "NXT", STARTED_LATER],
    ]);
  });

  it("끝 기록 쓰기가 한 번 실패하면 1초 뒤 한 번 더 — 성공하면 날짜 실패가 아니다 · 두 번 다 실패면 날짜 실패(R3-IN-01)", async () => {
    const run = async (failTimes: number) => {
      const root = newRoot();
      synth(root, D, { hours: { krx: HOURS_08_20, nxt: HOURS_08_20 } });
      let left = failTimes;
      const { sb, calls } = makeFakeSupabase({
        rpc: {
          tick_convert_run_record: (a) =>
            (a.p_run as { ok: unknown; exchange: string }).ok !== null &&
            (a.p_run as { exchange: string }).exchange === "NXT" &&
            left-- > 0
              ? { error: { message: "fetch failed" } }
              : { data: 1 },
        },
      });
      const sleeps: number[] = [];
      const out = await runNightly(
        { sb, store: createSupabaseGridStore(sb), config: cfg(root), now: NOW, clock: () => 0, sleep: async (ms) => void sleeps.push(ms) },
        { date: D },
      );
      return { out, sleeps, nxtFinals: finals(calls).filter((x) => x.exchange === "NXT").length };
    };
    const once = await run(1);
    expect(once.sleeps).toEqual([RUN_RECORD_RETRY_MS]);
    expect(once.nxtFinals).toBe(2); // 실패 1 + 재시도 1
    expect(once.out.failed).toBe(0);
    const twice = await run(2);
    expect(twice.nxtFinals).toBe(2);
    expect(twice.out.failed).toBe(1);
  });
});

// ── 대상 판정 · 스테이징 단위 ────────────────────────────────

describe("selectTargets — 등록(accum ∪ live16) ∪ 15%(KRX G1 ∪ NXT G1)", () => {
  it("출처 칩 accum · up15 · 둘 다 — 15% 는 거래소 어느 쪽이든 한 번", () => {
    const hit = new DayRateTracker();
    hit.add("2", 1500, 11500); // 정확히 +15%
    const miss = new DayRateTracker();
    miss.add("2", 1499, 11499);
    const rates = new Map([
      [`${U}|NXT`, hit],
      [`${U}|KRX`, miss],
      [`${N}|KRX`, miss],
      [`${R}|KRX`, hit],
    ]);
    const t = selectTargets({ accum: [R], live16: ["KR7000270009"], launch: [] }, rates);
    expect([...t.keys()].sort()).toEqual(["KR7000270009", U, R].sort());
    expect([...t.get(R)!]).toEqual(["accum", "up15"]);
    expect([...t.get(U)!]).toEqual(["up15"]);
    expect([...t.get("KR7000270009")!]).toEqual(["accum"]);
    expect(t.has(N)).toBe(false);
  });

  it("launch(그날 접수 발사 ISIN) — 출처 칩 없이(빈 집합) 대상 · 이미 대상이면 칩 그대로(quick 261103-pei)", () => {
    const t = selectTargets({ accum: [R], live16: [], launch: [N, R] }, new Map());
    expect([...t.get(N)!]).toEqual([]);
    expect([...t.get(R)!]).toEqual(["accum"]);
  });
});

describe("KeyStager — 키별 원시 버퍼 → zstd 1 청크 · take = RecordSink 와 같은 바이트", () => {
  it("chunkBytes 를 넘으면 압축 청크로 옮기고 take 가 청크(각각 한 프레임)를 풀어 이어붙인다", () => {
    const st = new KeyStager(256);
    const sink = new RecordSink();
    for (let i = 0; i < 40; i++) {
      const p = a3Payload({ isin: R, label: "krx", seq: i + 1 });
      st.add(`${R}|KRX`, BigInt(i) * 1000n, p);
      sink.append(BigInt(i) * 1000n, p);
      st.add(`${N}|KRX`, BigInt(i), a3Payload({ isin: N, label: "krx" }));
    }
    expect(st.rawBytes()).toBe(sink.byteLength * 2);
    expect(st.stagedBytes()).toBeLessThan(st.rawBytes()); // 같은 페이로드라 잘 눌린다
    expect(st.keys().sort()).toEqual([`${N}|KRX`, `${R}|KRX`].sort());
    st.drop(`${N}|KRX`);
    const got = st.take(`${R}|KRX`);
    expect(Buffer.from(got).equals(Buffer.from(sink.bytes()))).toBe(true);
    expect([...iterRecords(got)]).toHaveLength(40);
    expect(st.stagedBytes()).toBe(0);
    expect(st.keys()).toEqual([]);
    expect(st.take("없음")).toHaveLength(0);
  });

  it("압축 청크는 제 길이만큼만 메모리를 잡는다 — zstdCompressSync 결과의 64KB 출력 버퍼를 붙잡지 않는다(10/30 실측 OOM)", () => {
    const st = new KeyStager(4096);
    for (let i = 0; i < 400; i++) st.add(`${R}|KRX`, BigInt(i), a3Payload({ isin: R, label: "krx", seq: i + 1 }));
    const entry = (st as unknown as { map: Map<string, { chunks: Uint8Array[] }> }).map.get(`${R}|KRX`)!;
    expect(entry.chunks.length).toBeGreaterThan(0);
    for (const c of entry.chunks) expect(c.buffer.byteLength).toBe(c.byteLength);
  });
});

// ── 트레이서 ────────────────────────────────────────────────

describe("nightly 트레이서 — 날짜 → 단일 통독 스테이징 → 대상 선별 → 두 거래소 격자 → upsert('nightly') → 기록 → purge", () => {
  it("등록 1 · NXT 단독 +15% 1 · 비대상 1 → 대상 두 종목의 KRX · NXT 격자만 · request 와 같은 바이트", async () => {
    const root = newRoot();
    const a = synth(root, D, { packets: packets(D) }); // 10/30 실측 시각 집합(라벨당 00~23시 24개) — isDayReady true
    const { sb, calls } = makeFakeSupabase({ rpc: { tick_convert_candidates: { data: { accum: [R], live16: [] } } } });
    expect(await main(["nightly", "--date", D], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);

    const ups = uploads(calls);
    expect(ups.map((u) => u.path).sort()).toEqual(
      [
        `grid/${D}/KRX/${R}.nightly.ticks.zst`,
        `grid/${D}/NXT/${R}.nightly.ticks.zst`,
        `grid/${D}/KRX/${U}.nightly.ticks.zst`, // NXT 에서만 15% 였어도 KRX 격자가 생긴다
        `grid/${D}/NXT/${U}.nightly.ticks.zst`,
      ].sort(),
    );
    expect(ups.some((u) => u.path.includes(N))).toBe(false); // 비대상 미업로드
    expect(ups.every((u) => u.bucket === "tick-grid")).toBe(true);

    const [up] = rpcCalls(calls, "tick_grid_upsert");
    expect(up!.p_mode).toBe("nightly");
    const rows = up!.p_rows as Record<string, unknown>[];
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.sources).toEqual(r.isin === R ? ["accum"] : ["up15"]);
      expect(r.object_path).toBe(`grid/${D}/${r.exchange}/${r.isin}.nightly.ticks.zst`);
    }
    const uNxt = rows.find((r) => r.isin === U && r.exchange === "NXT")!;
    expect(uNxt.base_px).toBe(10000);
    expect(uNxt.high_rate).toBeCloseTo(15, 9);
    const rKrx = rows.find((r) => r.isin === R && r.exchange === "KRX")!;
    expect(rKrx.records).toBe(22);
    expect(rKrx.a3_count).toBe(20);
    // 팀 3칸(quick 261103-j4d) — 올린 격자를 풀어 shared 로 계산한 값과 같다
    for (const r of rows) {
      const bytes = ups.find((u) => u.path === r.object_path)!.bytes;
      const { team } = gridTeamOf(decode(bytes), r.exchange as "KRX" | "NXT", { date: D, isin: r.isin as string, mode: "t" });
      expect(r).toHaveProperty("team_fills");
      expect({ team_fills: r.team_fills, team_day_net_krw: r.team_day_net_krw, team_day_pnl_krw: r.team_day_pnl_krw }).toEqual(team);
      expect(team.team_fills).not.toBeNull();
    }

    // 실행 기록 — 거래소별 ok · written 2 · bytes_read = 그 라벨 05~20시 파일 크기 합
    const recs = finals(calls);
    expect(recs.map((r) => r.exchange)).toEqual(["KRX", "NXT"]);
    for (const r of recs) {
      expect(r).toMatchObject({ date: D, mode: "nightly", ok: true, targets: 2, written: 2, error: null });
      const label = (r.exchange as string).toLowerCase();
      const want = a.files
        .filter((f) => f.includes(`/${label}/`))
        .filter((f) => {
          const h = Number(/-(\d{2})\d{2}\.pcap\.zst$/.exec(f)![1]);
          return h >= 5 && h <= 20;
        })
        .reduce((s, f) => s + statSync(f).size, 0);
      expect(r.bytes_read).toBe(want);
    }

    // 순서 — candidates → 업로드 → upsert → 기록 → purge(끝에 한 번)
    const iCand = idx(calls, isRpc("tick_convert_candidates"));
    const iUp = idx(calls, (c) => c.kind === "storage" && c.op === "upload");
    const iUpsert = idx(calls, isRpc("tick_grid_upsert"));
    const iStart = idx(calls, isRpc("tick_convert_run_record"));
    const iRec = idx(calls, isFinalRec);
    const iPurge = idx(calls, isRpc("tick_purge_old"));
    // 「시작」 기록(R2-WR-03) — 변환 전에 거래소별 ok null · STARTED
    expect(iStart).toBeLessThan(iCand);
    expect(
      rpcCalls(calls, "tick_convert_run_record")
        .map((x) => x.p_run as Record<string, unknown>)
        .filter((r) => r.ok === null)
        .map((r) => [r.exchange, r.error]),
    ).toEqual([
      ["KRX", STARTED],
      ["NXT", STARTED],
    ]);
    expect(iCand).toBeLessThan(iUp);
    expect(iUp).toBeLessThan(iUpsert);
    expect(iUpsert).toBeLessThan(iRec);
    expect(iRec).toBeLessThan(iPurge);
    expect(rpcCalls(calls, "tick_purge_old")).toEqual([{ p_keep_days: 90 }]);
    expect(rpcCalls(calls, "tick_convert_runs_since")).toHaveLength(0); // --date 는 기록을 보지 않는다

    // 스테이징이 레코드를 바꾸지 않는다 — 같은 키를 request 모드로 만든 바이트와 같다
    for (const ex of ["KRX", "NXT"] as const) {
      const req = makeFakeSupabase({ claim: [R, U] });
      expect(await main(["request", "--date", D, "--ex", ex], { sb: req.sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);
      for (const isin of [R, U]) {
        const nb = ups.find((u) => u.path === `grid/${D}/${ex}/${isin}.nightly.ticks.zst`)!.bytes;
        const rb = uploads(req.calls).find((u) => u.path === `grid/${D}/${ex}/${isin}.request.ticks.zst`)!.bytes;
        expect(Buffer.from(decode(nb)).equals(Buffer.from(decode(rb)))).toBe(true);
      }
    }
  });

  it("--date 는 주말이어도 그 날 하나만 돈다(요일 무시)", async () => {
    const root = newRoot();
    synth(root, "20261025", { packets: [] }); // 일요일
    const { sb, calls } = makeFakeSupabase();
    expect(await main(["nightly", "--date", "20261025"], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);
    expect(rpcCalls(calls, "tick_convert_candidates")).toEqual([{ p_date: "20261025" }]);
    expect(finals(calls).map((r) => r.date)).toEqual([
      "20261025",
      "20261025",
    ]);
  });

  it("잘못된 인자 → 종료 2", async () => {
    const { sb } = makeFakeSupabase();
    expect(await main(["nightly", "--date", "2026-10-30"], { sb, config: cfg(newRoot()), now: NOW })).toBe(2);
    expect(await main(["nightly", "--ex", "KRX"], { sb, config: cfg(newRoot()), now: NOW })).toBe(2);
  });
});

// ── 준비 판정 · 날짜 격리 ────────────────────────────────────

describe("준비 판정 · 날짜 격리 — wait · NO_OBJECTS · partial · 실패 날짜", () => {
  it("유예 안 미준비는 기록 없이 건너뛰고 · 2일 초과 객체 0 은 NO_OBJECTS ok · 일부는 partial 변환 · 실패 날짜가 다음을 막지 않는다", async () => {
    const root = newRoot();
    synth(root, "20261102", { hours: { krx: ["0800", "0900"], nxt: [] } }); // 업로드 중(오늘) → wait
    synth(root, "20261030", { packets: packets("20261030") }); // 준비됨
    // 10/29 · 10/26 — 객체 없음(2일 초과) → NO_OBJECTS
    synth(root, "20261028", { hours: { krx: ["0800", "0900", "1000"], nxt: [] }, packets: packets("20261028") }); // 일부 → partial
    synth(root, "20261027", { packets: packets("20261027") }); // candidates RPC 실패 → 그 날짜만 실패
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_candidates: (a) =>
          a.p_date === "20261027" ? { error: { message: "boom" } } : { data: { accum: [R], live16: [] } },
      },
    });
    expect(await main(["nightly"], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(1);

    expect(rpcCalls(calls, "tick_convert_runs_since")).toEqual([{ p_since: "20261024" }]);
    // 최신부터 · wait · NO_OBJECTS 날짜는 candidates 를 부르지 않는다
    expect(rpcCalls(calls, "tick_convert_candidates").map((x) => x.p_date)).toEqual(["20261030", "20261028", "20261027"]);

    const recs = finals(calls);
    const of = (date: string) => recs.filter((r) => r.date === date);
    expect(of("20261102")).toEqual([]); // wait — 기록 없음(다음 실행이 다시 고른다)
    expect(of("20261030").map((r) => [r.ok, r.error, r.written])).toEqual([
      [true, null, 2],
      [true, null, 2],
    ]);
    for (const d of ["20261029", "20261026"]) {
      expect(of(d).map((r) => [r.exchange, r.ok, r.error, r.written])).toEqual([
        ["KRX", true, NO_OBJECTS, 0],
        ["NXT", true, NO_OBJECTS, 0],
      ]);
    }
    expect(of("20261028").map((r) => [r.ok, r.error])).toEqual([
      [true, "partial"],
      [true, "partial"],
    ]);
    expect(of("20261028")[0]!.written).toBe(1); // 08~10시 KRX 만 — R(09시 · 10시) · U KRX 는 15% 가 NXT 에만 있어 대상 아님
    // candidates RPC 실패 = 일시 장애 — TRANSIENT 머리(포기 카운트에서 빠진다 · R2-WR-03)
    expect(of("20261027").map((r) => [r.ok, String(r.error)])).toEqual([
      [false, `${TRANSIENT}: tick_convert_candidates: boom`],
      [false, `${TRANSIENT}: tick_convert_candidates: boom`],
    ]);
    // 실패 날짜 뒤에도 purge 한 번
    expect(rpcCalls(calls, "tick_purge_old")).toHaveLength(1);
    expect(uploads(calls).some((u) => u.path.startsWith("grid/20261028/KRX/"))).toBe(true);
  });

  it("고를 날짜가 전부 NO_OBJECTS · wait 이면 종료 0(실패 아님)", async () => {
    const root = newRoot();
    const { sb, calls } = makeFakeSupabase();
    expect(await main(["nightly"], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);
    const recs = finals(calls);
    expect(recs).toHaveLength(10); // 10/30 · 29 · 28 · 27 · 26 × 2 — 11/02 는 wait
    expect(recs.every((r) => r.ok === true && r.error === NO_OBJECTS)).toBe(true);
  });

  it("ok 기록이 두 거래소 모두 있는 날은 고르지 않는다(runs_since)", async () => {
    const root = newRoot();
    const ok = (date: string, exchange: string) => ({ date, exchange, mode: "nightly", ok: true, finished_at: "x" });
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_runs_since: {
          data: ["20261030", "20261029", "20261028", "20261027", "20261026"].flatMap((d) => [ok(d, "KRX"), ok(d, "NXT")]),
        },
      },
    });
    expect(await main(["nightly"], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);
    expect(rpcCalls(calls, "tick_convert_run_record")).toEqual([]); // 11/02 만 남고 wait
  });

  it("업로드 실패 키만 실패 · purge 실패도 종료 1", async () => {
    const root = newRoot();
    synth(root, D, { packets: packets(D) });
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_candidates: { data: { accum: [R], live16: [] } },
        tick_purge_old: { error: { message: "purge down" } },
      },
      storage: (_b, op, args) =>
        op === "upload" && String(args[0]).includes(`NXT/${U}`) ? { error: { message: "upload down" } } : undefined,
    });
    expect(await main(["nightly", "--date", D], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(1);
    const recs = finals(calls);
    // 상태 없는 업로드 오류(네트워크 꼴) = 일시 장애 — TRANSIENT(R2-WR-03)
    expect(recs.map((r) => [r.exchange, r.ok, r.written, r.error])).toEqual([
      ["KRX", true, 2, null],
      ["NXT", false, 1, `${TRANSIENT}: failed 1`],
    ]);
  });

  it("업로드 4xx(영구 거부)는 결정적 실패 — TRANSIENT 머리 없음 · 5xx 는 일시 장애(R2-WR-03)", async () => {
    const root = newRoot();
    synth(root, D, { packets: packets(D) });
    const runWith = async (status: string) => {
      const { sb, calls } = makeFakeSupabase({
        rpc: { tick_convert_candidates: { data: { accum: [R], live16: [] } } },
        storage: (_b, op, args) =>
          op === "upload" && String(args[0]).includes(`NXT/${U}`)
            ? ({ error: { message: "rejected", statusCode: status } } as never)
            : undefined,
      });
      expect(await main(["nightly", "--date", D], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(1);
      return finals(calls).find((r) => r.exchange === "NXT")!;
    };
    expect(await runWith("400")).toMatchObject({ ok: false, error: "failed 1" });
    expect(await runWith("503")).toMatchObject({ ok: false, error: `${TRANSIENT}: failed 1` });
  });

  it("업로드 오류는 HTTP status(정수)를 먼저 본다 — statusCode 가 문자열 코드(InvalidKey)여도 4xx 는 결정적(R3-IN-02)", async () => {
    const root = newRoot();
    synth(root, D, { packets: packets(D) });
    const runWith = async (err: Record<string, unknown>) => {
      const { sb, calls } = makeFakeSupabase({
        rpc: { tick_convert_candidates: { data: { accum: [R], live16: [] } } },
        storage: (_b, op, args) =>
          op === "upload" && String(args[0]).includes(`NXT/${U}`) ? ({ error: { message: "rejected", ...err } } as never) : undefined,
      });
      expect(await main(["nightly", "--date", D], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(1);
      return finals(calls).find((r) => r.exchange === "NXT")!;
    };
    // storage-js StorageApiError — status = HTTP 정수 · statusCode = 본문 statusCode || code || String(status)
    expect(await runWith({ status: 400, statusCode: "InvalidKey" })).toMatchObject({ ok: false, error: "failed 1" });
    expect(await runWith({ status: 503, statusCode: "400" })).toMatchObject({ ok: false, error: `${TRANSIENT}: failed 1` });
    expect(await runWith({ statusCode: "InvalidKey" })).toMatchObject({ ok: false, error: `${TRANSIENT}: failed 1` }); // 상태 없음
  });

  /** 10/30 결정적 실패 3회 — 마지막 기록 시각 `lastAt`(그 앞 두 번은 하루씩 앞). 나머지 날짜는 ok 라 고를 날짜가 11/02(wait)뿐. */
  async function gaveUpRun(lastAt: string) {
    const root = newRoot();
    const last = Date.parse(lastAt);
    const at = (daysBefore: number) => new Date(last - daysBefore * 86_400_000).toISOString();
    const fail = (finished_at: string) =>
      (["KRX", "NXT"] as const).map((exchange) => ({ date: "20261030", exchange, mode: "nightly", ok: false, finished_at, error: "boom" }));
    const ok = (date: string) =>
      (["KRX", "NXT"] as const).map((exchange) => ({ date, exchange, mode: "nightly", ok: true, finished_at: at(3) }));
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_runs_since: {
          data: [...fail(at(2)), ...fail(at(1)), ...fail(lastAt), ...["20261029", "20261028", "20261027", "20261026"].flatMap(ok)],
        },
      },
    });
    const error = vi.spyOn(logger, "error");
    const code = await main(["nightly"], { sb, config: cfg(root), now: NOW, clock: () => 0 });
    const gaveUpLog = error.mock.calls.find((c) => String(c[1]).includes("다시 고르지 않는다"));
    return { code, calls, gaveUpLog };
  }

  it("막 포기한 날짜(마지막 실패가 22.5시간 안 — 포기를 만든 실행 바로 다음)는 고르지 않고 error 로그 + 종료 1(알림 · R3-WR-02)", async () => {
    // NOW = 11/02 23:30 KST — 마지막 실패는 11/02 01:30 실행이 01:50 KST 에 쓴 기록(21시간 40분 전)
    const { code, calls, gaveUpLog } = await gaveUpRun("2026-11-01T16:50:00Z");
    expect(code).toBe(1);
    expect(finals(calls).some((r) => r.date === "20261030")).toBe(false);
    expect(String(gaveUpLog?.[1])).toContain("20261030");
    expect(String(gaveUpLog?.[1])).toContain("종료 1");
    expect(gaveUpLog?.[0]).toMatchObject({ gaveUp: ["20261030"], gaveUpFresh: ["20261030"] });
  });

  it("이미 알린 포기(마지막 실패가 22.5시간 넘게 전)는 error 로그만 · 종료 0 — 포기 하나가 매일 알림을 내지 않는다(R3-WR-02)", async () => {
    // 마지막 실패는 11/01 23:30 실행이 23:55 KST 에 쓴 기록(23시간 35분 전) — 11/02 01:30 실행이 이미 알렸다
    const { code, calls, gaveUpLog } = await gaveUpRun("2026-11-01T14:55:00Z");
    expect(code).toBe(0);
    expect(finals(calls).some((r) => r.date === "20261030")).toBe(false);
    expect(String(gaveUpLog?.[1])).toContain("이미 알린 포기");
    expect(gaveUpLog?.[0]).toMatchObject({ gaveUp: ["20261030"], gaveUpFresh: [] });
  });

  it("freshlyGaveUp — 날짜별 가장 늦은 nightly 기록 기준 · request 기록은 안 본다 · 시각을 못 읽으면 막 포기로 본다", () => {
    const rec = (date: string, mode: RunSince["mode"], finished_at: string | null): RunSince => ({
      date,
      exchange: "KRX",
      mode,
      ok: false,
      finished_at,
    });
    const now = new Date("2026-11-02T14:30:00Z");
    const runs = [
      rec("20261030", "nightly", "2026-10-31T14:30:00Z"),
      rec("20261030", "nightly", "2026-11-01T17:00:00Z"), // 21.5시간 전 → 막 포기
      rec("20261029", "nightly", "2026-11-01T14:00:00Z"), // 24.5시간 전 → 이미 알림
      rec("20261029", "request", "2026-11-02T14:00:00Z"), // request 는 안 본다
      rec("20261028", "nightly", null), // 못 읽음 → 막 포기
    ];
    expect(GAVE_UP_ALERT_WINDOW_MS).toBe(22.5 * 3_600_000);
    expect(freshlyGaveUp(now, ["20261030", "20261029", "20261028"], runs)).toEqual(["20261030", "20261028"]);
  });
});

// ── 시간 예산 ───────────────────────────────────────────────

describe("시간 예산 — 날짜 시작 직전 경과 > TICK_NIGHTLY_BUDGET_MS(40분)면 남은 날짜를 미룬다", () => {
  const MIN = 60_000;

  async function budgetRun(stepMin: number) {
    const root = newRoot();
    for (const d of ["20261102", "20261030", "20261029", "20261028", "20261027", "20261026"]) {
      synth(root, d, { hours: { krx: HOURS_08_20, nxt: HOURS_08_20 } }); // 6일 모두 준비됨
    }
    let t = 0;
    // 날짜마다 stepMin 분이 흐르는 가짜 시계 — 변환하는 날짜마다 candidates 를 한 번 부른다
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_candidates: () => {
          t += stepMin * MIN;
          return { data: { accum: [], live16: [] } };
        },
      },
    });
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");
    const out = await runNightly(
      { sb, store: createSupabaseGridStore(sb), config: cfg(root), now: NOW, clock: () => t },
      {},
    );
    const lines = [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[1] ?? c[0]));
    return { out, calls, lines };
  }

  it("15분 — 경과 0 · 15 · 30분에 시작한 세 날짜를 하고 네 번째(45분)부터 미룬다 · deferred=3 · 실패 아님", async () => {
    const { out, calls, lines } = await budgetRun(15);
    expect(out.days.map((d) => d.date)).toEqual(["20261102", "20261030", "20261029"]);
    expect(out.deferred).toBe(3);
    expect(out.failed).toBe(0);
    expect(lines.some((l) => l.includes("deferred=3"))).toBe(true);
    expect(rpcCalls(calls, "tick_purge_old")).toHaveLength(1); // 미뤄도 purge 는 한다
  });

  it("20분 경계 — 세 번째 시작 시점 경과가 정확히 40분이라 시작한다(처리 3 · deferred=3)", async () => {
    const { out } = await budgetRun(20);
    expect(out.days).toHaveLength(3);
    expect(out.deferred).toBe(3);
  });

  it("25분 — 세 번째(경과 50분)부터 미룬다(처리 2 · deferred=4)", async () => {
    const { out, lines } = await budgetRun(25);
    expect(out.days).toHaveLength(2);
    expect(out.deferred).toBe(4);
    expect(lines.some((l) => l.includes("deferred=4"))).toBe(true);
  });
});

// ── 발사 대기열 값(quick 261103-pei) ─────────────────────────────

describe("nightly 발사 대기열 값 — candidates.launch → inputs 1회 → 키마다 gridLaunchOf → upsert 뒤 launch_queue_set", () => {
  /** N(비대상 · KRX G1 +5%)을 발사 종목으로 — KRX A 매수 조각 하나. */
  const PIECE = {
    trade_date: D,
    gateway: "KB120",
    profile: "A",
    fire_exchange: "KRX",
    fire_base: "08:59:00",
    market: "K",
    wire: 0,
    side: "buy",
    isin: N,
    price: 10500,
    qty: 1,
    fills: [],
  };
  const CANDS = { data: { accum: [R], live16: [], launch: [N] } };

  async function run(rpc: Parameters<typeof makeFakeSupabase>[0]["rpc"]) {
    const root = newRoot();
    synth(root, D, { packets: packets(D) });
    const { sb, calls } = makeFakeSupabase({
      rpc: {
        tick_convert_candidates: CANDS,
        launch_queue_inputs: { data: [PIECE] },
        launch_queue_set: (a) => ({ data: (a.p_rows as unknown[]).length }),
        ...rpc,
      },
    });
    const info = vi.spyOn(logger, "info");
    const error = vi.spyOn(logger, "error");
    const code = await main(["nightly", "--date", D], { sb, config: cfg(root), now: NOW, clock: () => 0 });
    const lines = info.mock.calls.map((c) => String(c[1] ?? c[0]));
    return { code, calls, lines, error };
  }

  it("발사 전용 ISIN 은 sources [] 격자 · inputs 1회 · set 은 upsert 뒤 · 행 = 올린 격자로 계산한 값(object_path = 그 격자)", async () => {
    const { code, calls, lines } = await run({});
    expect(code).toBe(0);
    expect(rpcCalls(calls, "launch_queue_inputs")).toEqual([{ p_date: D }]);
    const rows = rpcCalls(calls, "tick_grid_upsert")[0]!.p_rows as Record<string, unknown>[];
    expect(rows.filter((r) => r.isin === N).map((r) => [r.exchange, r.sources])).toEqual([
      ["KRX", []],
      ["NXT", []],
    ]);
    const sets = rpcCalls(calls, "launch_queue_set");
    expect(sets).toHaveLength(1);
    const path = `grid/${D}/KRX/${N}.nightly.ticks.zst`;
    const bytes = uploads(calls).find((u) => u.path === path)!.bytes;
    const { rows: want } = gridLaunchOf(decode(bytes), "KRX", D, [PIECE as never], { date: D, isin: N, mode: "t", objectPath: path });
    expect(sets[0]!.p_rows).toEqual(want);
    expect(want).toHaveLength(1);
    expect(want[0]).toMatchObject({ gateway: "KB120", profile: "A", wire: 0, kind: "run", object_path: path });
    expect(idx(calls, isRpc("tick_grid_upsert"))).toBeLessThan(idx(calls, isRpc("launch_queue_set")));
    expect(idx(calls, isRpc("launch_queue_set"))).toBeLessThan(idx(calls, isFinalRec));
    expect(lines.some((l) => l.includes("ex=KRX") && l.includes("launch=1 launch_failed=0"))).toBe(true);
  });

  it("inputs 실패 → 발사 값만 건너뜀 · 격자 · 실행 기록 ok · 종료 0 · 에러 로그 · launch_failed", async () => {
    const { code, calls, lines, error } = await run({ launch_queue_inputs: { error: { message: "inputs down" } } });
    expect(code).toBe(0);
    expect(rpcCalls(calls, "launch_queue_set")).toHaveLength(0);
    expect(uploads(calls).some((u) => u.path.includes(N))).toBe(true); // 발사 ISIN 격자는 그대로 만든다
    const recs = finals(calls);
    expect(recs.every((r) => r.ok === true && r.error === null)).toBe(true);
    expect(error.mock.calls.some((c) => String(c[1]).includes("launch inputs failed"))).toBe(true);
    expect(lines.some((l) => l.includes("launch=0 launch_failed=1"))).toBe(true);
  });

  it("set 실패 → 실행 기록 ok · 종료 0 · 에러 로그 · launch_failed", async () => {
    const { code, calls, lines, error } = await run({ launch_queue_set: { error: { message: "set down" } } });
    expect(code).toBe(0);
    const recs = finals(calls);
    expect(recs.every((r) => r.ok === true && r.error === null)).toBe(true);
    expect(error.mock.calls.some((c) => String(c[1]).includes("launch_queue_set failed"))).toBe(true);
    expect(lines.some((l) => l.includes("ex=KRX") && l.includes("launch=1 launch_failed=1"))).toBe(true);
  });

  it("launch 가 비어 있으면 inputs 를 부르지 않는다 · 키 없는 옛 응답은 기존 동작 그대로", async () => {
    const empty = await run({ tick_convert_candidates: { data: { accum: [R], live16: [], launch: [] } } });
    expect(rpcCalls(empty.calls, "launch_queue_inputs")).toHaveLength(0);
    expect(rpcCalls(empty.calls, "launch_queue_set")).toHaveLength(0);
    const old = await run({ tick_convert_candidates: { data: { accum: [R], live16: [] } } });
    expect(old.code).toBe(0);
    expect(rpcCalls(old.calls, "launch_queue_inputs")).toHaveLength(0);
    expect(uploads(old.calls).some((u) => u.path.includes(N))).toBe(false);
  });
});
