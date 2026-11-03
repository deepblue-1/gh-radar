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
import { NO_OBJECTS, nightlyDatesOf, runNightly } from "../src/modes/nightly";
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
    const t = selectTargets({ accum: [R], live16: ["KR7000270009"] }, rates);
    expect([...t.keys()].sort()).toEqual(["KR7000270009", U, R].sort());
    expect([...t.get(R)!]).toEqual(["accum", "up15"]);
    expect([...t.get(U)!]).toEqual(["up15"]);
    expect([...t.get("KR7000270009")!]).toEqual(["accum"]);
    expect(t.has(N)).toBe(false);
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
    const recs = rpcCalls(calls, "tick_convert_run_record").map((x) => x.p_run as Record<string, unknown>);
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
    const iRec = idx(calls, isRpc("tick_convert_run_record"));
    const iPurge = idx(calls, isRpc("tick_purge_old"));
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
    expect(rpcCalls(calls, "tick_convert_run_record").map((x) => (x.p_run as { date: string }).date)).toEqual([
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

    const recs = rpcCalls(calls, "tick_convert_run_record").map((x) => x.p_run as Record<string, unknown>);
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
    expect(of("20261027").map((r) => [r.ok, String(r.error)])).toEqual([
      [false, "tick_convert_candidates: boom"],
      [false, "tick_convert_candidates: boom"],
    ]);
    // 실패 날짜 뒤에도 purge 한 번
    expect(rpcCalls(calls, "tick_purge_old")).toHaveLength(1);
    expect(uploads(calls).some((u) => u.path.startsWith("grid/20261028/KRX/"))).toBe(true);
  });

  it("고를 날짜가 전부 NO_OBJECTS · wait 이면 종료 0(실패 아님)", async () => {
    const root = newRoot();
    const { sb, calls } = makeFakeSupabase();
    expect(await main(["nightly"], { sb, config: cfg(root), now: NOW, clock: () => 0 })).toBe(0);
    const recs = rpcCalls(calls, "tick_convert_run_record").map((x) => x.p_run as Record<string, unknown>);
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
    const recs = rpcCalls(calls, "tick_convert_run_record").map((x) => x.p_run as Record<string, unknown>);
    expect(recs.map((r) => [r.exchange, r.ok, r.written, r.error])).toEqual([
      ["KRX", true, 2, null],
      ["NXT", false, 1, "failed 1"],
    ]);
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
