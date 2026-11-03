import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import zlib from "node:zlib";
import { readFileSync, statSync, writeFileSync } from "node:fs";

// 통독 여부 — scan.ts 의 createReadStream 호출 수(업로드 전 날짜는 0 이어야 한다)
const fsSpy = vi.hoisted(() => ({ reads: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    createReadStream: ((...a: Parameters<typeof orig.createReadStream>) => {
      fsSpy.reads += 1;
      return orig.createReadStream(...a);
    }) as typeof orig.createReadStream,
  };
});
// 팀 값 계산 실패 주입(quick 261103-j4d 결정 4) — 켜면 shared teamDaySummaryOf 가 throw 한다(꺼져 있으면 원래 함수)
const teamSpy = vi.hoisted(() => ({ boom: false }));
vi.mock("@gh-radar/shared", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@gh-radar/shared")>();
  return {
    ...orig,
    teamDaySummaryOf: ((...a: Parameters<typeof orig.teamDaySummaryOf>) => {
      if (teamSpy.boom) throw new Error("team boom");
      return orig.teamDaySummaryOf(...a);
    }) as typeof orig.teamDaySummaryOf,
  };
});
import { iterRecords, TICK_FMT, teamDaySummaryOf } from "@gh-radar/shared";
import { logger } from "../src/logger";
import { main } from "../src/index";
import type { Config } from "../src/config";
import {
  a3Payload,
  b6Payload,
  b9Payload,
  kstNs,
  makeSynthArchive,
  type Label,
  type SynthArchive,
  type SynthPacket,
} from "./helpers/synth-archive";
import { makeFakeSupabase, rpcCalls, uploads, type Call } from "./helpers/fake-supabase";

const D = "20261030";
const A = "KR7005930003";
const B = "KR7000660001";
const C = "KR7035720002"; // 그날 전문 없음

/** KST 11/02 12:00 — D(10/30)는 오늘 − 3일. */
const NOW = new Date("2026-11-02T03:00:00Z");

function cfg(root: string): Config {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "k",
    archiveDir: root,
    keepDays: 90,
    catchupDays: 10,
    upPct: 15,
    zstdLevel: 3,
    stageChunkBytes: 65536,
    nightlyBudgetMs: 2_400_000,
    logLevel: "silent",
    appVersion: "test",
    dryRun: false,
  };
}

/** 종목 · 라벨 하나의 패킷 — 09시 파일 A3 · B6 · B9 · A3 · 길이 안 맞는 A3(raw 보존) · 10시 파일 A3. */
function packetsFor(isin: string, label: Label, nsec: number): SynthPacket[] {
  const at = (hhmm: string, s: number) => kstNs(D, hhmm, s, nsec);
  const short = a3Payload({ isin, label, chg: 1200, px: 11200 }).slice(0, 180);
  return [
    { label, hhmm: "0900", recvNs: at("0900", 10), payload: a3Payload({ isin, label, pct: "2", chg: 1500, px: 11500 }) },
    { label, hhmm: "0900", recvNs: at("0900", 11), payload: b6Payload({ isin, label }) },
    { label, hhmm: "0900", recvNs: at("0900", 12), payload: b9Payload({ isin, label }) },
    { label, hhmm: "0900", recvNs: at("0900", 13), payload: a3Payload({ isin, label, pct: "2", chg: 1000, px: 11000 }) },
    { label, hhmm: "0900", recvNs: at("0900", 14), payload: short },
    { label, hhmm: "1000", recvNs: at("1000", 5), payload: a3Payload({ isin, label, pct: "2", chg: 500, px: 10500 }) },
  ];
}

const PACKETS: SynthPacket[] = [
  ...packetsFor(A, "krx", 1),
  ...packetsFor(B, "krx", 2),
  ...packetsFor(A, "nxt", 3),
  ...packetsFor(B, "nxt", 4),
];

let arch: SynthArchive | null = null;
beforeEach(() => {
  fsSpy.reads = 0;
  teamSpy.boom = false;
});
afterEach(() => {
  arch?.cleanup();
  arch = null;
});

function archive(hours?: { krx?: string[]; nxt?: string[] }): SynthArchive {
  arch = makeSynthArchive({ date: D, packets: PACKETS, hours });
  return arch;
}

function decodeGrid(bytes: Uint8Array): { recvNs: bigint; payload: Uint8Array }[] {
  const raw = zlib.zstdDecompressSync(bytes);
  const u8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return [...iterRecords(u8)].map((r) => ({ recvNs: r.recvNs, payload: u8.slice(r.off, r.off + r.len) }));
}

function idx(calls: Call[], pred: (c: Call) => boolean): number {
  return calls.findIndex(pred);
}

/** 05~20시 그 라벨 파일 크기 합. */
function scannedBytes(a: SynthArchive, label: Label): number {
  return a.files
    .filter((f) => f.includes(`/${label}/`))
    .filter((f) => {
      const h = Number(/-(\d{2})\d{2}(?:-\d+)?\.pcap\.zst$/.exec(f)![1]);
      return h >= 5 && h <= 20;
    })
    .reduce((s, f) => s + statSync(f).size, 0);
}

const run = (argv: string[], sb: ReturnType<typeof makeFakeSupabase>["sb"], root: string, now: Date = NOW) =>
  main(argv, { sb, config: cfg(root), now, clock: () => 0 });

describe("request 모드 트레이서 — claim → 통독 → 격자 → 업로드 → tick_grid_upsert → finish", () => {
  it("KRX 1종목: 그 ISIN KRX 패킷 전부(B9 · 길이 안 맞는 A3 포함 · 다른 ISIN · NXT · IA 없음)가 격자 파일이 된다", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(0);

    const ups = uploads(calls);
    expect(ups).toHaveLength(1);
    expect(ups[0]!.bucket).toBe("tick-grid");
    expect(ups[0]!.path).toBe(`grid/${D}/KRX/${A}.request.ticks.zst`);
    expect(ups[0]!.opts).toEqual({ contentType: "application/zstd", upsert: true });

    const want = PACKETS.filter((p) => p.label === "krx" && p.payload.length >= 29 && isinOf(p.payload) === A);
    const got = decodeGrid(ups[0]!.bytes);
    expect(got.map((r) => r.recvNs)).toEqual(want.map((p) => p.recvNs));
    got.forEach((r, i) => expect(Buffer.from(r.payload).equals(Buffer.from(want[i]!.payload))).toBe(true));
    expect(got).toHaveLength(6);

    const [up] = rpcCalls(calls, "tick_grid_upsert");
    expect(up!.p_mode).toBe("request");
    const rows = up!.p_rows as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: D,
      exchange: "KRX",
      isin: A,
      sources: ["request"],
      object_path: `grid/${D}/KRX/${A}.request.ticks.zst`,
      bytes: ups[0]!.bytes.length,
      records: 6,
      a3_count: 4,
      first_recv_ms: Number(want[0]!.recvNs / 1_000_000n),
      last_recv_ms: Number(want[5]!.recvNs / 1_000_000n),
      base_px: 10000,
      fmt: TICK_FMT,
    });
    expect(rows[0]!.high_rate as number).toBeCloseTo(15, 9);
    expect(rows[0]!.last_rate as number).toBeCloseTo(5, 9);
    // 팀 3칸(quick 261103-j4d) — 올린 격자를 풀어 shared 로 계산한 값(합성 A3 는 팀 판정이 없을 수 있다 — 규칙대로 매핑)
    const raw = zlib.zstdDecompressSync(ups[0]!.bytes);
    const sum = teamDaySummaryOf(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), "KRX");
    expect({ team_fills: rows[0]!.team_fills, team_day_net_krw: rows[0]!.team_day_net_krw, team_day_pnl_krw: rows[0]!.team_day_pnl_krw }).toEqual({
      team_fills: sum.fills,
      team_day_net_krw: sum.fills > 0 ? sum.dayNetVal : null,
      team_day_pnl_krw: sum.fills > 0 ? sum.pnl!.total_val : null,
    });

    expect(rpcCalls(calls, "tick_request_claim")).toEqual([{ p_date: D, p_ex: "KRX" }]);
    expect(rpcCalls(calls, "tick_request_finish")).toEqual([
      { p_date: D, p_ex: "KRX", p_results: [{ isin: A, ok: true, error: null }] },
    ]);
    const [rr] = rpcCalls(calls, "tick_convert_run_record");
    expect(rr!.p_run).toMatchObject({
      date: D,
      exchange: "KRX",
      mode: "request",
      ok: true,
      targets: 1,
      written: 1,
      bytes_read: scannedBytes(a, "krx"),
      error: null,
    });

    // 순서: 업로드 → 메타 → finish → 실행 기록
    const iUp = idx(calls, (c) => c.kind === "storage" && c.op === "upload");
    const iMeta = idx(calls, (c) => c.kind === "rpc" && c.name === "tick_grid_upsert");
    const iFin = idx(calls, (c) => c.kind === "rpc" && c.name === "tick_request_finish");
    const iRun = idx(calls, (c) => c.kind === "rpc" && c.name === "tick_convert_run_record");
    expect(iUp).toBeGreaterThan(-1);
    expect(iUp).toBeLessThan(iMeta);
    expect(iMeta).toBeLessThan(iFin);
    expect(iFin).toBeLessThan(iRun);
  });

  it("NXT 요청은 nxt 라벨만 읽어 NXT 경로에 쓴다", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(["request", "--date", D, "--ex", "NXT"], sb, a.root)).toBe(0);
    const ups = uploads(calls);
    expect(ups.map((u) => u.path)).toEqual([`grid/${D}/NXT/${A}.request.ticks.zst`]);
    const want = PACKETS.filter((p) => p.label === "nxt" && isinOf(p.payload) === A);
    expect(decodeGrid(ups[0]!.bytes).map((r) => r.recvNs)).toEqual(want.map((p) => p.recvNs));
  });

  it("레코드 0 종목은 failed NO_RECORDS — 실패로 세지 않는다(main 0)", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [A, C] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(0);
    expect(uploads(calls).map((u) => u.path)).toEqual([`grid/${D}/KRX/${A}.request.ticks.zst`]);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([
      { isin: A, ok: true, error: null },
      { isin: C, ok: false, error: "NO_RECORDS" },
    ]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, targets: 2, written: 1 });
  });

  it("claim 한 종목이 하나뿐이고 그 종목이 NO_RECORDS 면 main 0 · 업로드 · 메타 없음", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [C] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_grid_upsert")).toHaveLength(0);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([{ isin: C, ok: false, error: "NO_RECORDS" }]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, targets: 1, written: 0 });
  });

  it("업로드 실패는 그 종목만 실패 — 메타 upsert 에서 빠지고 finish 실패 · main 1", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({
      claim: [A, B],
      storage: (_b, op, args) =>
        op === "upload" && String(args[0]).includes(A) ? { error: { message: "boom" } } : undefined,
    });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(1);
    const rows = rpcCalls(calls, "tick_grid_upsert")[0]!.p_rows as { isin: string }[];
    expect(rows.map((r) => r.isin)).toEqual([B]);
    const res = rpcCalls(calls, "tick_request_finish")[0]!.p_results as { isin: string; ok: boolean; error: string }[];
    expect(res[0]).toMatchObject({ isin: A, ok: false });
    expect(res[0]!.error).toContain(`grid/${D}/KRX/${A}.request.ticks.zst`);
    expect(res[1]).toEqual({ isin: B, ok: true, error: null });
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: false, targets: 2, written: 1 });
  });

  it("메타 upsert 실패는 올린 종목 전부 실패로 닫는다 · main 1", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [A], rpc: { tick_grid_upsert: { error: { message: "db down" } } } });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(1);
    const res = rpcCalls(calls, "tick_request_finish")[0]!.p_results as { isin: string; ok: boolean; error: string }[];
    expect(res).toEqual([{ isin: A, ok: false, error: "tick_grid_upsert: db down" }]);
  });

  it("깨진 원본(통독 실패)은 claim 된 종목 전부를 SCAN_FAILED 로 닫는다 · 업로드 없음 · main 1", async () => {
    const a = archive();
    writeFileSync(a.files.find((f) => f.endsWith(`/krx/${D}/${D}-1000.pcap.zst`))!, "not zstd");
    const { sb, calls } = makeFakeSupabase({ claim: [A, C] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(1);
    expect(uploads(calls)).toHaveLength(0);
    const res = rpcCalls(calls, "tick_request_finish")[0]!.p_results as { isin: string; ok: boolean; error: string }[];
    expect(res.map((r) => [r.isin, r.ok])).toEqual([
      [A, false],
      [C, false],
    ]);
    expect(res.every((r) => r.error.startsWith("SCAN_FAILED: "))).toBe(true);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: false, written: 0 });
  });

  it("끝이 잘린 원본 파일 수를 실행 기록 error 에 truncated n 으로 남긴다 · 실패 아님 · main 0(IN-32)", async () => {
    const a = archive();
    // 10시 파일 끝 5바이트를 잘라 다시 압축 — 마지막 레코드가 반쪽이 된다
    const f = a.files.find((x) => x.endsWith(`/krx/${D}/${D}-1000.pcap.zst`))!;
    const raw = zlib.zstdDecompressSync(readFileSync(f));
    writeFileSync(f, zlib.zstdCompressSync(raw.subarray(0, raw.length - 5)));
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(0);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, error: "truncated 1" });
  });

  it("claim 이 빈 배열이면 통독 · finish 없이 실행 기록만 · main 0", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [] });
    expect(await run(["request", "--date", D, "--ex", "KRX"], sb, a.root)).toBe(0);
    expect(calls.filter((c) => c.kind === "storage")).toHaveLength(0);
    expect(rpcCalls(calls, "tick_request_finish")).toHaveLength(0);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({
      ok: true,
      targets: 0,
      written: 0,
      bytes_read: 0,
    });
  });
});

/** KST 11/01 12:00 — D(10/30)는 오늘 − 2일(유예 안). */
const NOW_GRACE = new Date("2026-11-01T03:00:00Z");
const ALL = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}00`);
const KRX_REQ = ["request", "--date", D, "--ex", "KRX"];

describe("업로드 판정 — NOT_UPLOADED(업로드 전 · 상한 비소모) · partial(2일 초과)", () => {
  it("그 라벨 08~20시 객체 0개 → 통독 0 · claim 전부 NOT_UPLOADED · 실행 기록 ok · main 0", async () => {
    const a = archive({ krx: [] });
    const { sb, calls } = makeFakeSupabase({ claim: [A, C] });
    expect(await run(KRX_REQ, sb, a.root)).toBe(0);
    expect(fsSpy.reads).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_grid_upsert")).toHaveLength(0);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([
      { isin: A, ok: false, error: "NOT_UPLOADED" },
      { isin: C, ok: false, error: "NOT_UPLOADED" },
    ]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({
      ok: true,
      error: "NOT_UPLOADED",
      targets: 2,
      written: 0,
      bytes_read: 0,
    });
  });

  it("08~20시 밖(00~07 · 21~23시) 객체만 있으면 객체 0 과 같다 → NOT_UPLOADED", async () => {
    const a = archive({ krx: ["0000", "0500", "0700", "2100", "2300"] });
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(KRX_REQ, sb, a.root)).toBe(0);
    expect(fsSpy.reads).toBe(0);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([{ isin: A, ok: false, error: "NOT_UPLOADED" }]);
  });

  it("날짜 ≥ KST 오늘 − 2일 ∧ 일부만 올라옴(업로드 진행 중) → 통독 0 · NOT_UPLOADED · main 0", async () => {
    const a = archive({ krx: ALL.slice(0, 13) }); // 00~12시만
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(KRX_REQ, sb, a.root, NOW_GRACE)).toBe(0);
    expect(fsSpy.reads).toBe(0);
    expect(uploads(calls)).toHaveLength(0);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([{ isin: A, ok: false, error: "NOT_UPLOADED" }]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, error: "NOT_UPLOADED" });
  });

  it("날짜 < KST 오늘 − 2일 ∧ 일부만(13시 없음) → 있는 객체로 변환 · finish ok · 실행 기록 error partial · main 0", async () => {
    const a = archive({ krx: ALL.filter((h) => h !== "1300") });
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(KRX_REQ, sb, a.root, NOW)).toBe(0);
    expect(fsSpy.reads).toBeGreaterThan(0);
    expect(uploads(calls).map((u) => u.path)).toEqual([`grid/${D}/KRX/${A}.request.ticks.zst`]);
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([{ isin: A, ok: true, error: null }]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({
      ok: true,
      error: "partial",
      written: 1,
      bytes_read: scannedBytes(a, "krx"),
    });
  });

  it("준비된 날(08~20시 전부)은 유예 안이어도 그대로 변환 — 회귀 0", async () => {
    const a = archive();
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(KRX_REQ, sb, a.root, NOW_GRACE)).toBe(0);
    expect(uploads(calls)).toHaveLength(1);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, error: null, written: 1 });
  });

  it("다른 라벨의 준비 상태는 보지 않는다 — NXT 미업로드여도 KRX 요청은 변환", async () => {
    const a = archive({ nxt: [] });
    const { sb, calls } = makeFakeSupabase({ claim: [A] });
    expect(await run(KRX_REQ, sb, a.root, NOW_GRACE)).toBe(0);
    expect(uploads(calls)).toHaveLength(1);
  });
});

describe("main — 인자 · 기동 검사", () => {
  const sb = () => makeFakeSupabase().sb;
  it.each([
    [[]],
    [["bogus"]],
    [["request"]],
    [["request", "--date", "2026-10-30", "--ex", "KRX"]],
    [["request", "--date", "20261332", "--ex", "KRX"]],
    [["request", "--date", D, "--ex", "XYZ"]],
    [["request", "--date", D]],
    [["request", "--date", D, "--ex"]],
    [["request", "--date", D, "--ex", "KRX", "--foo", "1"]],
  ])("잘못된 인자 %j → 2", async (argv) => {
    expect(await main(argv as string[], { sb: sb(), config: cfg("/nonexistent"), now: NOW })).toBe(2);
  });

  it("Node zstd 가 없으면 종료 2(Pitfall 4)", async () => {
    expect(await main(["request", "--date", D, "--ex", "KRX"], { sb: sb(), config: cfg("/x"), zlib: {} })).toBe(2);
  });
});

function isinOf(payload: Uint8Array): string {
  const tag = String.fromCharCode(payload[0]!, payload[1]!);
  const off = tag === "B9" || tag === "C3" ? 5 : 17;
  return Buffer.from(payload.subarray(off, off + 12)).toString("ascii");
}

describe("팀 값 계산 실패 격리(quick 261103-j4d 결정 4)", () => {
  it("teamDaySummaryOf 가 throw 해도 업로드 · upsert · finish ok · 실행 기록 ok 그대로 — 그 행 팀 3칸만 null + 에러 로그", async () => {
    const a = archive();
    teamSpy.boom = true;
    const err = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    const { sb, calls } = makeFakeSupabase({ claim: [A, B] });
    expect(await run(["request", "--date", D, "--ex", "NXT"], sb, a.root)).toBe(0);

    expect(uploads(calls)).toHaveLength(2);
    const rows = rpcCalls(calls, "tick_grid_upsert")[0]!.p_rows as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ team_fills: null, team_day_net_krw: null, team_day_pnl_krw: null });
      expect(r.records).toBe(6);
    }
    expect(rpcCalls(calls, "tick_request_finish")[0]!.p_results).toEqual([
      { isin: A, ok: true, error: null },
      { isin: B, ok: true, error: null },
    ]);
    expect(rpcCalls(calls, "tick_convert_run_record")[0]!.p_run).toMatchObject({ ok: true, written: 2, error: null });
    const teamErrs = err.mock.calls.filter((c) => String(c[1]).includes("team summary failed"));
    expect(teamErrs).toHaveLength(2);
    expect(teamErrs[0]![0]).toMatchObject({ date: D, ex: "NXT", isin: A, mode: "request" });
  });
});
