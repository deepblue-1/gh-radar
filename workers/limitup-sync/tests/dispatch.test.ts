import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { makeFakeSupabase, type Call, type FakeOptions } from "./helpers/fake-supabase";
import { filesSig, type Manifest } from "../src/manifest";

/**
 * 28-16 적재 규칙 — 「바뀐 날짜만」(files_sig) · schema/sha/manifest skip + limitup_record_skip ·
 * 같은 날짜 3연속 skip → alert → main 종료 1 · 예외 → 사유 로그 + 종료 1 (D-14 · D-20).
 *
 * 변조 날짜는 os.tmpdir() 아래 픽스처 사본으로 만든다(커밋된 픽스처는 바꾸지 않는다).
 *
 * 28-06 — 파생 2표 stage · 격자 업로드(commit 앞) · run 끝 보존 정리(limitup_purge_old · Storage 폴더 · kind 15).
 */

const FIXTURE = join(__dirname, "fixtures", "export");
const SRC = "20261002"; // 커밋된 픽스처 날짜
const GOOD = "20261002";
const BAD = "20261001"; // 사본 — manifest date 만 바꾼다(정렬상 GOOD 보다 먼저 처리된다)
const NOW = new Date("2026-10-05T12:20:00Z"); // 2026-10-05 21:20 KST
const ORIG = { ...process.env };

const fixtureManifest = JSON.parse(readFileSync(join(FIXTURE, SRC, "manifest.json"), "utf8")) as Manifest;
const SIG = filesSig(fixtureManifest);

type LogCall = { obj: Record<string, unknown>; msg: string };
function fakeLogger() {
  const calls: Record<"info" | "warn" | "error", LogCall[]> = { info: [], warn: [], error: [] };
  const rec = (lv: keyof typeof calls) => (obj: Record<string, unknown>, msg: string) => calls[lv].push({ obj, msg });
  const l: Record<string, unknown> = { info: rec("info"), warn: rec("warn"), error: rec("error"), debug: () => {} };
  l.child = () => l;
  return { logger: l, calls };
}

let dir: string;
let log: ReturnType<typeof fakeLogger>;

/**
 * 픽스처를 dir/<date> 로 복사 — manifest.date = date, edit 가 있으면 manifest 를 바꾸거나 원문 문자열로 덮는다.
 * 다른 날짜 사본은 격자 JSON 의 date 도 그 날짜로 바꾸고 manifest sha256 을 다시 계산한다(격자 date ≠ 적재 날짜는 오류).
 */
function addDay(date: string, edit?: (m: Manifest) => Manifest | string) {
  cpSync(join(FIXTURE, SRC), join(dir, date), { recursive: true });
  const mp = join(dir, date, "manifest.json");
  const m = { ...(JSON.parse(readFileSync(mp, "utf8")) as Manifest), date };
  if (date !== SRC) {
    for (const f of m.files.filter((x) => x.name.startsWith("grid/"))) {
      const gp = join(dir, date, f.name);
      const g = JSON.parse(gunzipSync(readFileSync(gp)).toString("utf8")) as { date: string };
      const bytes = gzipSync(JSON.stringify({ ...g, date }));
      writeFileSync(gp, bytes);
      f.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
  }
  const out = edit ? edit(m) : m;
  writeFileSync(mp, typeof out === "string" ? out : JSON.stringify(out, null, 1));
}

/** 파일 마지막 바이트 뒤집기 — 운반 중 반쯤 올라온 파일 흉내(sha 불일치). */
function corrupt(date: string, name: string) {
  const p = join(dir, date, name);
  const buf = readFileSync(p);
  buf[buf.length - 1] ^= 0xff;
  writeFileSync(p, buf);
}

async function loadIndex(fake: ReturnType<typeof makeFakeSupabase>) {
  vi.resetModules();
  const createSupabaseClient = vi.fn().mockReturnValue(fake.sb);
  vi.doMock("../src/services/supabase", () => ({ createSupabaseClient }));
  vi.doMock("../src/logger", () => ({ logger: log.logger }));
  const mod = await import("../src/index");
  return { ...mod, createSupabaseClient };
}

async function run(opts: FakeOptions = {}, d: { dryRun?: boolean } = {}) {
  const fake = makeFakeSupabase(opts);
  const mod = await loadIndex(fake);
  const out = await mod.dispatch({ now: NOW, ...d });
  return { out, fake, ...mod };
}

const rpcs = (calls: Call[], name: string) =>
  calls.filter((c): c is Extract<Call, { kind: "rpc" }> => c.kind === "rpc" && c.name === name);
const inserts = (calls: Call[]) => calls.filter((c): c is Extract<Call, { kind: "insert" }> => c.kind === "insert");
const skipWarns = () => log.calls.warn.filter((w) => w.msg.startsWith("limitup-sync skip"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "limitup-dispatch-"));
  log = fakeLogger();
  process.env.LIMITUP_EXPORT_DIR = dir;
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
  process.env.LOG_LEVEL = "silent";
  delete process.env.LIMITUP_STAGE_CHUNK;
  delete process.env.LIMITUP_KEEP_DAYS;
  delete process.env.LIMITUP_ALLOC_KEEP_DAYS;
  delete process.env.KIND15_KEEP_DAYS;
  delete process.env.LIMITUP_SKIP_DATES;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...ORIG };
  vi.doUnmock("../src/services/supabase");
  vi.doUnmock("../src/logger");
});

describe("dispatch — 「바뀐 날짜만」(D-14 · files_sig)", () => {
  it("이력 files_sig == manifest filesSig → unchanged · verifyFiles · stage · commit · record_skip 0회", async () => {
    addDay(GOOD);
    corrupt(GOOD, "touches.ndjson.gz"); // verifyFiles 가 돌았다면 sha skip 이 됐을 것 — unchanged 가 먼저다
    const { out, fake } = await run({ loads: [{ date: GOOD, files_sig: SIG, skip_streak: 0 }] });
    // select 뒤는 run 끝 보존 정리뿐(limitup_purge_old · storage list · kind 15) — 그 날짜 호출 0
    expect(fake.calls.map((c) => c.kind)).toEqual(["select", "rpc", "storage", "rpc"]);
    expect(out.skipped).toEqual({ schema: [], sha: [], manifest: [], unchanged: [GOOD] });
    expect(out.loaded).toEqual([]);
    expect(out.alert).toBe(false);
    expect(skipWarns()).toEqual([]);
  });

  it("unchanged 인데 이력 skip_streak > 0 → limitup_loads streak 0 · 사유 null 갱신 1회(연속이 끊겼다)", async () => {
    addDay(GOOD);
    const { out, fake } = await run({ loads: [{ date: GOOD, files_sig: SIG, skip_streak: 2 }] });
    expect(out.skipped.unchanged).toEqual([GOOD]);
    expect(fake.calls.filter((c) => c.kind === "update")).toEqual([
      { kind: "update", table: "limitup_loads", values: { skip_streak: 0, last_skip_reason: null }, eq: ["date", GOOD] },
    ]);
    expect(rpcs(fake.calls, "limitup_record_skip")).toEqual([]);
    expect(out.alert).toBe(false);
  });

  it("unchanged streak 갱신 오류 → 그 날짜 failed(사유 보존 · 조용히 넘기지 않는다)", async () => {
    addDay(GOOD);
    const { out } = await run({
      loads: [{ date: GOOD, files_sig: SIG, skip_streak: 1 }],
      update: { limitup_loads: { error: { message: "boom" } } },
    });
    expect(out.failed).toEqual([{ date: GOOD, error: expect.stringMatching(/streak reset 20261002: boom/) }]);
  });

  it("이력 files_sig 가 다르거나 null(= skip 만 있던 날짜)이면 적재", async () => {
    addDay(BAD);
    addDay(GOOD);
    const { out, fake } = await run({
      loads: [
        { date: BAD, files_sig: null, skip_streak: 1 },
        { date: GOOD, files_sig: "0".repeat(64), skip_streak: 0 },
      ],
    });
    expect(rpcs(fake.calls, "limitup_commit_day").map((c) => c.args.p_date)).toEqual([BAD, GOOD]);
    expect(out.loaded).toEqual([BAD, GOOD]);
    expect(out.skipped.unchanged).toEqual([]);
  });
});

describe("dispatch — skip 기록(D-14 · D-20) · 한 날짜의 skip 은 다른 날짜를 막지 않는다", () => {
  it('schema_version 2 → 파일을 읽지 않고 record_skip { p_reason: "schema" } 1회 · warn 에 원문 값 · stage/commit 0', async () => {
    addDay(GOOD, (m) => ({ ...m, schema_version: 2 }));
    rmSync(join(dir, GOOD, "touches.ndjson.gz")); // 파일을 읽었다면 sha skip 이 됐을 것
    const { out, fake } = await run({ recordSkip: 1 });

    expect(rpcs(fake.calls, "limitup_record_skip").map((c) => c.args)).toEqual([{ p_date: GOOD, p_reason: "schema" }]);
    expect(inserts(fake.calls)).toEqual([]);
    expect(rpcs(fake.calls, "limitup_stage_clear")).toEqual([]);
    expect(rpcs(fake.calls, "limitup_commit_day")).toEqual([]);
    expect(out.skipped).toEqual({ schema: [GOOD], sha: [], manifest: [], unchanged: [] });
    expect(out.loaded).toEqual([]);

    const w = skipWarns();
    expect(w).toHaveLength(1);
    expect(w[0].obj).toMatchObject({ date: GOOD, reason: "schema", detail: { schema_version: 2 } });
    expect(out.alert).toBe(false);
  });

  it('파일 1개 sha 불일치 → record_skip { p_reason: "sha" } · warn 에 파일 이름 · 그 날짜 stage/commit 0 · 다른 날짜는 적재', async () => {
    addDay(BAD);
    corrupt(BAD, "touches.ndjson.gz");
    addDay(GOOD);
    const { out, fake } = await run({ recordSkip: 1 });

    expect(rpcs(fake.calls, "limitup_record_skip").map((c) => c.args)).toEqual([{ p_date: BAD, p_reason: "sha" }]);
    expect(skipWarns()[0].obj).toMatchObject({ date: BAD, reason: "sha", detail: { files: ["touches.ndjson.gz"] } });

    const staged = inserts(fake.calls).flatMap((i) => i.rows.map((r) => r.date));
    expect(staged.length).toBeGreaterThan(0);
    expect(new Set(staged)).toEqual(new Set([GOOD]));
    expect(rpcs(fake.calls, "limitup_stage_clear").map((c) => c.args.p_date)).toEqual([GOOD]);
    expect(rpcs(fake.calls, "limitup_commit_day").map((c) => c.args.p_date)).toEqual([GOOD]);
    expect(out.skipped.sha).toEqual([BAD]);
    expect(out.loaded).toEqual([GOOD]);
  });

  it('manifest JSON 파손 → record_skip { p_reason: "manifest" } · 다른 날짜는 적재', async () => {
    addDay(BAD, () => "{not json");
    addDay(GOOD);
    const { out, fake } = await run({ recordSkip: 1 });

    expect(rpcs(fake.calls, "limitup_record_skip").map((c) => c.args)).toEqual([{ p_date: BAD, p_reason: "manifest" }]);
    expect(skipWarns()[0].obj).toMatchObject({ date: BAD, reason: "manifest" });
    expect(String((skipWarns()[0].obj.detail as { error: string }).error)).toMatch(/manifest json/);
    expect(out.skipped).toEqual({ schema: [], sha: [], manifest: [BAD], unchanged: [] });
    expect(out.loaded).toEqual([GOOD]);
  });

  it("dry-run — skip 은 결과 · warn 에만 남고 record_skip 을 부르지 않는다(Supabase 무접촉)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    addDay(BAD);
    corrupt(BAD, "jumps.ndjson.gz");
    addDay(GOOD, (m) => ({ ...m, schema_version: 2 }));
    const { out, fake, createSupabaseClient } = await run({}, { dryRun: true });
    expect(createSupabaseClient).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
    expect(out.skipped).toEqual({ schema: [GOOD], sha: [BAD], manifest: [], unchanged: [] });
    expect(skipWarns().map((w) => w.obj.reason)).toEqual(["sha", "schema"]);
    expect(out.alert).toBe(false);
  });

  it("record_skip RPC 오류 → 그 날짜 failed(날짜 · 사유 · 메시지 보존 · 무로그 fail-safe 금지) · load 기록 실패도 error 로그", async () => {
    addDay(BAD, (m) => ({ ...m, schema_version: 2 }));
    const fake = makeFakeSupabase({ rpc: { limitup_record_skip: { error: { message: "permission denied" } } } });
    const { dispatch } = await loadIndex(fake);
    const out = await dispatch({ now: NOW });
    expect(out.failed).toEqual([{ date: BAD, error: expect.stringMatching(/limitup_record_skip 20261001 schema: permission denied/) }]);
    expect(log.calls.error.map((e) => e.msg)).toEqual(["limitup day failed — 다음 날짜로 진행", "limitup_record_skip(load) failed"]);
  });
});

describe("main — 종료 코드(D-20): skip 만 0 · 같은 날짜 3연속 1 · 예외 1", () => {
  it("record_skip 이 3 을 돌려주면 나머지 날짜를 끝까지 처리한 뒤 alert: true · main 종료 1", async () => {
    addDay(BAD);
    corrupt(BAD, "touches.ndjson.gz");
    addDay(GOOD);
    const { out, fake, main } = await run({ recordSkip: 3 });
    expect(out.alert).toBe(true);
    expect(out.alertDates).toEqual([BAD]);
    expect(out.loaded).toEqual([GOOD]); // BAD 뒤 GOOD 도 적재됐다
    expect(rpcs(fake.calls, "limitup_commit_day").map((c) => c.args.p_date)).toEqual([GOOD]);

    log.calls.error.length = 0;
    expect(await main(["node", "index.ts"])).toBe(1);
    expect(log.calls.error.map((e) => e.msg)).toEqual(["limitup-sync alert — 같은 날짜 3회 연속 skip"]);
    expect(log.calls.error[0].obj).toMatchObject({ result: { alert: true, alertDates: [BAD] } });
  });

  it("record_skip 이 2 이하면 alert: false · main 종료 0", async () => {
    addDay(BAD, (m) => ({ ...m, schema_version: 2 }));
    addDay(GOOD);
    const { out, main } = await run({ recordSkip: 2 });
    expect(out.alert).toBe(false);
    expect(out.alertDates).toEqual([]);
    expect(await main(["node", "index.ts"])).toBe(0);
    expect(log.calls.error).toEqual([]);
  });

  it("stage insert 오류 → 그 날짜 failed → main 이 사유(표 · 날짜 · supabase 메시지)를 error 로그 · 종료 1", async () => {
    addDay(GOOD);
    const fake = makeFakeSupabase({
      insert: (_t, _r, n) => (n === 2 ? { error: { message: "boom" } } : { error: null }),
      recordSkip: 1,
    });
    const { main } = await loadIndex(fake);
    expect(await main(["node", "index.ts"])).toBe(1);
    expect(log.calls.error.map((e) => e.msg)).toEqual([
      "limitup day failed — 다음 날짜로 진행",
      "limitup-sync day failed — 실패 날짜가 있다(다른 날짜 · 정리는 진행)",
    ]);
    const err = log.calls.error[0].obj.err as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/limitup_stage insert 20261002 \w+ seq \d+\.\.\d+: boom/);
    expect(rpcs(fake.calls, "limitup_commit_day")).toEqual([]);
    expect(rpcs(fake.calls, "limitup_record_skip").map((c) => c.args)).toEqual([{ p_date: GOOD, p_reason: "load" }]);
  });
});

describe("dispatch — 날짜 격리(CR-B01): 한 날짜의 영구 오류가 뒤 날짜 · 정리를 막지 않는다", () => {
  /** 행 수 불일치 — sha 대조는 통과(파일 그대로 · manifest rows 만 틀림)하고 매 run 같은 자리에서 다시 나는 오류. */
  const rowsOff = (m: Manifest): Manifest => ({
    ...m,
    files: m.files.map((f) => (f.name === "touches.ndjson.gz" ? { ...f, rows: f.rows + 1 } : f)),
  });

  it("앞 날짜 행 수 불일치 → 그 날짜만 failed · record_skip load · 뒤 날짜 적재 · run 끝 정리(kind 15 포함) 실행 · main 종료 1", async () => {
    addDay(BAD, rowsOff);
    addDay(GOOD);
    const { out, fake, main } = await run({ recordSkip: 1 });

    expect(out.failed).toEqual([{ date: BAD, error: `${BAD}: touches.ndjson.gz rows ${tableRows.touches} != manifest ${tableRows.touches + 1}` }]);
    expect(out.loaded).toEqual([GOOD]);
    expect(rpcs(fake.calls, "limitup_commit_day").map((c) => c.args.p_date)).toEqual([GOOD]);
    expect(rpcs(fake.calls, "limitup_record_skip").map((c) => c.args)).toEqual([{ p_date: BAD, p_reason: "load" }]);
    expect(rpcs(fake.calls, "limitup_purge_old")).toHaveLength(1);
    expect(rpcs(fake.calls, "dma_strategy_events_purge_limit_feature")).toHaveLength(1);
    expect(log.calls.error[0]).toMatchObject({ msg: "limitup day failed — 다음 날짜로 진행", obj: { date: BAD } });

    log.calls.error.length = 0;
    expect(await main(["node", "index.ts"])).toBe(1);
    expect(log.calls.error.at(-1)?.obj).toMatchObject({ result: { loaded: [GOOD], failed: [{ date: BAD }] } });
  });

  it("LIMITUP_SKIP_DATES — 그 날짜는 읽지도 기록하지도 않고 excluded · 나머지 적재 · main 종료 0", async () => {
    process.env.LIMITUP_SKIP_DATES = ` ${BAD} ,`;
    addDay(BAD, rowsOff);
    addDay(GOOD);
    const { out, fake, main } = await run({ recordSkip: 1 });
    expect(out.excluded).toEqual([BAD]);
    expect(out.failed).toEqual([]);
    expect(out.loaded).toEqual([GOOD]);
    expect(rpcs(fake.calls, "limitup_record_skip")).toEqual([]);
    expect(log.calls.warn.map((w) => w.msg)).toContain("limitup day excluded — LIMITUP_SKIP_DATES(운영자 제외)");
    expect(await main(["node", "index.ts"])).toBe(0);
  });
});

// ── 28-06 — 파생 2표 · 격자 업로드 · 보존 정리 ─────────────────────────
const golden = JSON.parse(readFileSync(join(FIXTURE, SRC, "expected-derive.json"), "utf8")) as {
  member_daily: { member: string }[];
  grid_summary: { isin: string }[];
};
const GRID_ISINS = golden.grid_summary.map((g) => g.isin);
const tableRows = Object.fromEntries(
  fixtureManifest.files.filter((f) => !f.name.startsWith("grid/")).map((f) => [f.name.replace(".ndjson.gz", ""), f.rows]),
);
const EXPECTED8 = { ...tableRows, grid_summary: GRID_ISINS.length, member_daily: golden.member_daily.length };

const label = (c: Call) =>
  c.kind === "rpc" ? `rpc:${c.name}` : c.kind === "storage" ? `storage:${c.op}` : `${c.kind}:${c.table}`;

describe("dispatch — 파생 stage · 격자 업로드(commit 앞) · 기대 수 8키 (28-06)", () => {
  it("업로드 → stage → commit 순서: stage_clear → upload × 3 → stage insert(6표 + 파생 2) → commit_day(8키) → 정리", async () => {
    addDay(GOOD);
    const { out, fake } = await run();
    const seq = fake.calls.map(label);
    const firstInsert = seq.indexOf("insert:limitup_stage");
    const commitAt = seq.indexOf("rpc:limitup_commit_day");
    expect(seq.slice(0, firstInsert)).toEqual([
      "select:limitup_loads",
      "rpc:limitup_stage_clear",
      "storage:upload",
      "storage:upload",
      "storage:upload",
    ]);
    expect(seq.slice(firstInsert, commitAt).every((k) => k === "insert:limitup_stage")).toBe(true);
    expect(seq.slice(commitAt)).toEqual([
      "rpc:limitup_commit_day",
      "rpc:limitup_purge_old",
      "storage:list",
      "rpc:dma_strategy_events_purge_limit_feature",
    ]);

    const uploads = fake.calls.filter((c): c is Extract<Call, { kind: "storage" }> => c.kind === "storage" && c.op === "upload");
    expect(uploads.map((u) => u.args[0])).toEqual(GRID_ISINS.map((i) => `grid/${GOOD}/${i}.json.gz`));
    for (const [k, u] of uploads.entries()) {
      expect(u.bucket).toBe("limitup-grid");
      expect(u.args[2]).toEqual({ contentType: "application/gzip", upsert: true });
      expect(Buffer.compare(u.args[1] as Buffer, readFileSync(join(FIXTURE, SRC, "grid", `${GRID_ISINS[k]}.json.gz`)))).toBe(0);
    }

    const staged: Record<string, number> = {};
    for (const i of inserts(fake.calls)) for (const r of i.rows) staged[r.tbl as string] = (staged[r.tbl as string] ?? 0) + 1;
    expect(staged).toEqual(EXPECTED8);
    const derived = inserts(fake.calls).flatMap((i) => i.rows).filter((r) => r.tbl === "grid_summary" || r.tbl === "member_daily");
    for (const r of derived) expect((r.payload as { date: string }).date).toBe(GOOD);

    const commit = rpcs(fake.calls, "limitup_commit_day")[0];
    expect(commit.args.p_expected).toEqual(EXPECTED8);
    expect(Object.keys(commit.args.p_expected as object)).toHaveLength(8);
    expect(out).toMatchObject({ loaded: [GOOD], grids: 3, totals: EXPECTED8 });
  });

  it("업로드 error 면 commit 0회 · 그 날짜 failed(사유에 경로 · 다음 run 이 날짜를 다시 한다) · 정리는 그대로 돈다(CR-B01)", async () => {
    addDay(GOOD);
    const fake = makeFakeSupabase({
      storage: (_b, op, args) => (op === "upload" && String(args[0]).endsWith(`${GRID_ISINS[1]}.json.gz`) ? { error: { message: "507 quota" } } : undefined),
      recordSkip: 1,
    });
    const { dispatch } = await loadIndex(fake);
    const out = await dispatch({ now: NOW });
    expect(out.failed).toEqual([{ date: GOOD, error: expect.stringContaining(`limitup-grid/grid/${GOOD}/${GRID_ISINS[1]}.json.gz: 507 quota`) }]);
    expect(rpcs(fake.calls, "limitup_commit_day")).toEqual([]);
    expect(inserts(fake.calls)).toEqual([]);
    expect(rpcs(fake.calls, "limitup_purge_old")).toHaveLength(1);
  });

  it("dry-run — 파생 행 수 · 격자 수만 합계에 · 업로드 · stage · commit · 정리 없음", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    addDay(GOOD);
    const { out, fake } = await run({}, { dryRun: true });
    expect(fake.calls).toEqual([]);
    expect(out).toMatchObject({ rows: { [GOOD]: EXPECTED8 }, totals: EXPECTED8, grids: 3, purged: null, loaded: [] });
  });
});

describe("dispatch — run 끝 보존 정리 (D-16 · D-19 · D-08 · 28-06)", () => {
  const GRID_DIRS = ["20260601", "20260706", "20260707", "20261002", "x"];
  const storage = (_b: string, op: string, args: unknown[]) =>
    op === "list"
      ? args[0] === "grid"
        ? { data: GRID_DIRS.map((name) => ({ name, id: null })) }
        : { data: [{ name: "KR7000000001.json.gz" }] }
      : undefined;

  it("날짜 0개여도 limitup_purge_old { 90, 30 } 1회 · cutoff 이전 Storage 폴더만 remove · kind 15 { 30 } 1회 · 결과 purged", async () => {
    const { out, fake } = await run({ storage, rpc: { dma_strategy_events_purge_limit_feature: { data: 4 } } });
    expect(out.dates).toEqual([]);
    expect(rpcs(fake.calls, "limitup_purge_old").map((c) => c.args)).toEqual([{ p_keep_days: 90, p_alloc_keep_days: 30 }]);
    expect(rpcs(fake.calls, "dma_strategy_events_purge_limit_feature").map((c) => c.args)).toEqual([{ p_keep_days: 30 }]);
    const removes = fake.calls.filter((c): c is Extract<Call, { kind: "storage" }> => c.kind === "storage" && c.op === "remove");
    expect(removes.map((r) => r.args[0])).toEqual([["grid/20260601/KR7000000001.json.gz"], ["grid/20260706/KR7000000001.json.gz"]]);
    expect(out.purged).toEqual({ tables: { cutoff: "", alloc_cutoff: "", deleted: {} }, storageDates: ["20260601", "20260706"], kind15: 4 });
  });

  it("LIMITUP_ALLOC_KEEP_DAYS · KIND15_KEEP_DAYS env 를 RPC 인자로", async () => {
    process.env.LIMITUP_ALLOC_KEEP_DAYS = "20";
    process.env.KIND15_KEEP_DAYS = "14";
    const { fake } = await run();
    expect(rpcs(fake.calls, "limitup_purge_old")[0].args).toEqual({ p_keep_days: 90, p_alloc_keep_days: 20 });
    expect(rpcs(fake.calls, "dma_strategy_events_purge_limit_feature")[0].args).toEqual({ p_keep_days: 14 });
  });

  it("정리 RPC error → 적재된 날짜를 담은 error 로그 + throw → main 종료 1", async () => {
    addDay(GOOD);
    const fake = makeFakeSupabase({ rpc: { limitup_purge_old: { error: { message: "canceling statement due to statement timeout" } } } });
    const { main } = await loadIndex(fake);
    expect(await main(["node", "index.ts"])).toBe(1);
    expect(rpcs(fake.calls, "limitup_commit_day").map((c) => c.args.p_date)).toEqual([GOOD]); // 적재는 끝났다
    expect(log.calls.error.map((e) => e.msg)).toEqual(["limitup purge failed — 적재는 끝남", "limitup-sync failed"]);
    expect(log.calls.error[0].obj).toMatchObject({ loaded: [GOOD], grids: 3 });
    expect((log.calls.error[1].obj.err as Error).message).toMatch(/limitup_purge_old: canceling statement/);
  });
});
