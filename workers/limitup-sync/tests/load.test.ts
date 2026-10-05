import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFakeSupabase, type Call } from "./helpers/fake-supabase";
import { filesSig, type Manifest } from "../src/manifest";
import { EXPORT_TABLES, readNdjsonGz } from "../src/load";

const FIXTURE = join(__dirname, "fixtures", "export");
const DATE = "20261002";
const NOW = new Date("2026-10-05T12:20:00Z"); // 2026-10-05 21:20 KST — Scheduler 시각
const ORIG = { ...process.env };

const manifest = JSON.parse(readFileSync(join(FIXTURE, DATE, "manifest.json"), "utf8")) as Manifest;
const manifestRows = Object.fromEntries(
  EXPORT_TABLES.map((t) => [t, manifest.files.find((f) => f.name === `${t}.ndjson.gz`)!.rows]),
) as Record<(typeof EXPORT_TABLES)[number], number>;
// 28-06: stage · commit 기대 수 = 6표 + 파생 2(골든의 행 수 — 계산 대조는 derive.test.ts).
const goldenDerive = JSON.parse(readFileSync(join(FIXTURE, DATE, "expected-derive.json"), "utf8")) as {
  member_daily: unknown[];
  grid_summary: unknown[];
};
const stageRows = { ...manifestRows, grid_summary: goldenDerive.grid_summary.length, member_daily: goldenDerive.member_daily.length };
const STAGE_TABLES = [...EXPORT_TABLES, "grid_summary", "member_daily"] as const;

async function runDispatch(fake: ReturnType<typeof makeFakeSupabase>, opts: { dryRun?: boolean } = {}) {
  vi.resetModules();
  const createSupabaseClient = vi.fn().mockReturnValue(fake.sb);
  vi.doMock("../src/services/supabase", () => ({ createSupabaseClient }));
  const { dispatch } = await import("../src/index");
  const out = await dispatch({ now: NOW, ...opts });
  return { out, createSupabaseClient };
}

const kinds = (calls: Call[]) =>
  calls.map((c) => (c.kind === "rpc" ? `rpc:${c.name}` : c.kind === "insert" ? `insert:${c.table}` : `${c.kind}:${"table" in c ? c.table : ""}`));

beforeEach(() => {
  process.env.LIMITUP_EXPORT_DIR = FIXTURE;
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
  process.env.LOG_LEVEL = "silent";
  delete process.env.LIMITUP_STAGE_CHUNK;
  delete process.env.LIMITUP_KEEP_DAYS;
});
afterEach(() => {
  process.env = { ...ORIG };
  vi.doUnmock("../src/services/supabase");
});

describe("readNdjsonGz", () => {
  it("픽스처 6표 행 수 == manifest rows · 행 = 객체", () => {
    for (const t of EXPORT_TABLES) {
      const rows = readNdjsonGz(join(FIXTURE, DATE, `${t}.ndjson.gz`));
      expect(rows.length, t).toBe(manifestRows[t]);
      expect(rows[0]).toMatchObject({ date: DATE });
    }
    const facts = readNdjsonGz(join(FIXTURE, DATE, "facts.ndjson.gz"));
    expect(typeof facts[0].values).toBe("object"); // facts.values 는 문자열 아닌 객체(→ jsonb)
  });
});

describe("dispatch — 정상 경로(stage_clear → 격자 업로드 → stage insert × k → commit 1회 → 정리)", () => {
  it("호출 순서 · 표별 stage 행 합 == manifest rows(+ 파생 2) · commit 인자", async () => {
    const fake = makeFakeSupabase();
    const { out } = await runDispatch(fake);

    const seq = kinds(fake.calls);
    const commitAt = seq.indexOf("rpc:limitup_commit_day");
    expect(seq[0]).toBe("select:limitup_loads");
    expect(seq[1]).toBe("rpc:limitup_stage_clear");
    expect(seq.slice(2, 5)).toEqual(["storage:", "storage:", "storage:"]); // 격자 3개 업로드(commit 앞 — 28-06)
    expect(seq.slice(5, commitAt).every((k) => k === "insert:limitup_stage")).toBe(true);
    expect(seq.filter((k) => k === "rpc:limitup_commit_day")).toHaveLength(1);
    expect(seq.slice(commitAt + 1)).toEqual(["rpc:limitup_purge_old", "storage:", "rpc:dma_strategy_events_purge_limit_feature"]);

    const select = fake.calls[0] as Extract<Call, { kind: "select" }>;
    expect(select.cols).toBe("date, files_sig, skip_streak");
    expect(select.gte).toEqual(["date", "20260707"]); // KST 2026-10-05 − 90일

    const clear = fake.calls[1] as Extract<Call, { kind: "rpc" }>;
    expect(clear.args).toEqual({ p_date: DATE });

    const inserts = fake.calls.filter((c): c is Extract<Call, { kind: "insert" }> => c.kind === "insert");
    const staged: Record<string, number> = {};
    for (const ins of inserts) {
      for (const r of ins.rows) {
        expect(r.date).toBe(DATE);
        staged[r.tbl as string] = (staged[r.tbl as string] ?? 0) + 1;
      }
    }
    expect(staged).toEqual(stageRows);

    // seq 는 표마다 1..n 연속, payload = export 행 원문
    const memberSeqs = inserts.flatMap((i) => i.rows).filter((r) => r.tbl === "member_alloc").map((r) => r.seq);
    expect(memberSeqs).toEqual(Array.from({ length: manifestRows.member_alloc }, (_, i) => i + 1));
    const firstEntry = inserts.flatMap((i) => i.rows).find((r) => r.tbl === "entries" && r.seq === 1)!;
    expect(firstEntry.payload).toEqual(readNdjsonGz(join(FIXTURE, DATE, "entries.ndjson.gz"))[0]);

    const commit = fake.calls[commitAt] as Extract<Call, { kind: "rpc" }>;
    expect(commit.args.p_date).toBe(DATE);
    expect(commit.args.p_expected).toEqual(stageRows);
    expect(Object.keys(commit.args.p_expected as object).sort()).toEqual([...STAGE_TABLES].sort());
    expect(commit.args.p_files_sig).toBe(filesSig(manifest));
    expect(commit.args.p_schema_version).toBe(1);
    expect(commit.args.p_manifest_sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(out).toMatchObject({ dryRun: false, dates: [DATE], loaded: [DATE], totals: stageRows });
  });

  it("청크 크기 env 반영 — LIMITUP_STAGE_CHUNK=1000 기본 · 500 이면 표마다 ceil(n/500) 요청", async () => {
    const countInserts = (calls: Call[]) => calls.filter((c) => c.kind === "insert").length;
    const ceilSum = (chunk: number) => STAGE_TABLES.reduce((s, t) => s + Math.ceil(stageRows[t] / chunk), 0);

    const a = makeFakeSupabase();
    await runDispatch(a);
    expect(countInserts(a.calls)).toBe(ceilSum(1000));
    for (const c of a.calls) if (c.kind === "insert") expect(c.rows.length).toBeLessThanOrEqual(1000);

    process.env.LIMITUP_STAGE_CHUNK = "500";
    const b = makeFakeSupabase();
    await runDispatch(b);
    expect(countInserts(b.calls)).toBe(ceilSum(500));
    for (const c of b.calls) if (c.kind === "insert") expect(c.rows.length).toBeLessThanOrEqual(500);
  });

  it("dry-run — Supabase 클라이언트를 만들지 않고 행 수 · 합계만", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fake = makeFakeSupabase();
    const { out, createSupabaseClient } = await runDispatch(fake, { dryRun: true });
    expect(createSupabaseClient).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
    expect(out).toMatchObject({ dryRun: true, dates: [DATE], loaded: [], rows: { [DATE]: stageRows }, totals: stageRows });
  });

  it("보존 창(LIMITUP_KEEP_DAYS) 밖 날짜는 적재하지 않는다", async () => {
    process.env.LIMITUP_KEEP_DAYS = "1"; // since = 20261004 > 20261002
    const fake = makeFakeSupabase();
    const { out } = await runDispatch(fake);
    expect(out.dates).toEqual([]);
    // 날짜 호출 0 — 남는 것은 run 끝 보존 정리뿐(28-06)
    expect(kinds(fake.calls)).toEqual([
      "select:limitup_loads",
      "rpc:limitup_purge_old",
      "storage:",
      "rpc:dma_strategy_events_purge_limit_feature",
    ]);
  });
});

describe("dispatch — 날짜 안 오류는 사유를 담아 그 날짜 failed(CR-B01 — main 이 로그 + 종료 1)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "limitup-load-"));
    cpSync(join(FIXTURE, DATE), join(dir, DATE), { recursive: true });
    process.env.LIMITUP_EXPORT_DIR = dir;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // sha256 불일치 · 모르는 schema_version · 깨진 manifest 는 28-16 부터 throw 가 아니라 날짜 skip(+ limitup_record_skip)
  // 이다 — tests/dispatch.test.ts 가 증명한다.

  it("stage insert 오류 → 표 · seq 범위 · 메시지를 담아 failed · commit 없음", async () => {
    const fake = makeFakeSupabase({ insert: (_t, _rows, n) => (n === 2 ? { error: { message: "boom" } } : { error: null }) });
    const { out } = await runDispatch(fake);
    expect(out.failed).toEqual([{ date: DATE, error: expect.stringMatching(/limitup_stage insert 20261002 \w+ seq \d+\.\.\d+: boom/) }]);
    expect(out.loaded).toEqual([]);
    expect(fake.calls.some((c) => c.kind === "rpc" && c.name === "limitup_commit_day")).toBe(false);
  });

  it("commit RPC 오류 → 사유를 담아 failed", async () => {
    const fake = makeFakeSupabase({ rpc: { limitup_commit_day: { error: { message: "stage 1 expected 2" } } } });
    const { out } = await runDispatch(fake);
    expect(out.failed).toEqual([{ date: DATE, error: "limitup_commit_day 20261002: stage 1 expected 2" }]);
    expect(out.loaded).toEqual([]);
  });
});
