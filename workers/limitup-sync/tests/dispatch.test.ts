import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFakeSupabase, type Call, type FakeOptions } from "./helpers/fake-supabase";
import { filesSig, type Manifest } from "../src/manifest";

/**
 * 28-16 적재 규칙 — 「바뀐 날짜만」(files_sig) · schema/sha/manifest skip + limitup_record_skip ·
 * 같은 날짜 3연속 skip → alert → main 종료 1 · 예외 → 사유 로그 + 종료 1 (D-14 · D-20).
 *
 * 변조 날짜는 os.tmpdir() 아래 픽스처 사본으로 만든다(커밋된 픽스처는 바꾸지 않는다).
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

/** 픽스처를 dir/<date> 로 복사 — manifest.date = date, edit 가 있으면 manifest 를 바꾸거나 원문 문자열로 덮는다. */
function addDay(date: string, edit?: (m: Manifest) => Manifest | string) {
  cpSync(join(FIXTURE, SRC), join(dir, date), { recursive: true });
  const mp = join(dir, date, "manifest.json");
  const m = { ...(JSON.parse(readFileSync(mp, "utf8")) as Manifest), date };
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
    expect(fake.calls.map((c) => c.kind)).toEqual(["select"]);
    expect(out.skipped).toEqual({ schema: [], sha: [], manifest: [], unchanged: [GOOD] });
    expect(out.loaded).toEqual([]);
    expect(out.alert).toBe(false);
    expect(skipWarns()).toEqual([]);
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

  it("record_skip RPC 오류 → 날짜 · 사유 · 메시지를 담아 throw(무로그 fail-safe 금지)", async () => {
    addDay(BAD, (m) => ({ ...m, schema_version: 2 }));
    const fake = makeFakeSupabase({ rpc: { limitup_record_skip: { error: { message: "permission denied" } } } });
    const { dispatch } = await loadIndex(fake);
    await expect(dispatch({ now: NOW })).rejects.toThrow(/limitup_record_skip 20261001 schema: permission denied/);
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

  it("stage insert 오류 → dispatch throw → main 이 사유(표 · 날짜 · supabase 메시지)를 error 로그 · 종료 1", async () => {
    addDay(GOOD);
    const fake = makeFakeSupabase({ insert: (_t, _r, n) => (n === 2 ? { error: { message: "boom" } } : { error: null }) });
    const { main } = await loadIndex(fake);
    expect(await main(["node", "index.ts"])).toBe(1);
    expect(log.calls.error).toHaveLength(1);
    expect(log.calls.error[0].msg).toBe("limitup-sync failed");
    const err = log.calls.error[0].obj.err as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/limitup_stage insert 20261002 \w+ seq \d+\.\.\d+: boom/);
    expect(rpcs(fake.calls, "limitup_commit_day")).toEqual([]);
  });
});
